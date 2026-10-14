import { embeddingsModel } from '../config/models';
import { log } from '../observability';

/**
 * Parecidos por SIGNIFICADO para o "Cadastrar agora" da entrevista do RoPA (etapa 2): "folha de pagamento" ~ "payroll system".
 * A regra de `frontend/src/similares.js` continua sendo a primeira (e a única para pessoas); isto só complementa sistema/arquivo e
 * área, quando a regra não achou nada forte.
 *
 * Regras que não se quebram:
 *  - Os candidatos saem do BANCO, do projeto da rota; nunca de lista vinda do cliente.
 *  - Ao modelo vão só NOMES de sistema/arquivo e de área. Nome de pessoa nunca (o enum do corpo não tem `pessoa`, e item da
 *    categoria Pessoas fica de fora da leitura).
 *  - Uma chamada em lote por pedido; sem Vectorize, sem tabela, sem cache.
 *  - Falha do modelo, ou binding ausente, devolve `indisponivel` e a tela segue só com a regra.
 *  - Log só com contagens: o nome digitado não é gravado em lugar nenhum.
 */

export type TipoSimilar = 'item' | 'area';
export type Similar = { id: string; nome: string; score: number };
export type ResultadoSimilares = { resultados: Similar[]; indisponivel?: true };

/**
 * Cosseno mínimo para "parecido por significado". ponytail: 0,75 é chute inicial para o bge-m3 em nomes curtos; precisa de
 * calibração com dados reais (nomes curtos tendem a ter cosseno alto entre si). Suba se a tela avisar demais.
 */
export const LIMIAR_SIMILAR = 0.75;
export const MAX_CANDIDATOS = 300;
export const MAX_RESULTADOS = 3;

/** Quem pode pedir: os mesmos papéis que veem o "Cadastrar agora" (frontend/src/views/partes.js, podeEditar). */
const PAPEIS = new Set(['platform_admin', 'consultor', 'consultant']);
export const podePedirSimilares = (user: { role?: string } | undefined) => PAPEIS.has(user?.role ?? '');

type Modelo = { run: (modelo: string, entrada: { text: string[] }) => Promise<unknown> };

export function cosseno(a: number[], b: number[]): number {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}

async function candidatos(db: D1Database, projectId: string, tipo: TipoSimilar): Promise<{ id: string; nome: string }[]> {
  const sql = tipo === 'area'
    ? `SELECT id, nome FROM departamentos WHERE project_id = ? AND status = 'ativo' ORDER BY nome LIMIT ${MAX_CANDIDATOS}`
    // Os mesmos itens que a tela lista como opção (listarAtivos, services/itens.ts), para "Usar este" achar o id. Item da categoria
    // Pessoas pode ter nome de gente: não vai ao modelo.
    : `SELECT i.id, i.nome FROM itens i LEFT JOIN item_seguranca s ON s.item_id = i.id
        WHERE i.project_id = ? AND i.tipo = 'ativo' AND i.status = 'ativo' AND COALESCE(s.categoria, '') <> 'Pessoas' ORDER BY i.nome LIMIT ${MAX_CANDIDATOS}`;
  return (await db.prepare(sql).bind(projectId).all<{ id: string; nome: string }>()).results.filter((c) => c.nome && c.nome.trim());
}

/** Vetores da resposta, ou null se a forma não for a esperada (`{ data: number[][] }`, um por texto). */
function vetores(r: unknown, n: number): number[][] | null {
  const data = (r as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length !== n) return null;
  return data.every((v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number')) ? (data as number[][]) : null;
}

export async function buscarSimilares(env: { DB: D1Database; AI?: unknown } & Record<string, unknown>, projectId: string, tipo: TipoSimilar, nome: string): Promise<ResultadoSimilares> {
  const lista = await candidatos(env.DB, projectId, tipo);
  if (!lista.length) return { resultados: [] };
  const ai = env.AI as Modelo | undefined;
  if (!ai || typeof ai.run !== 'function') return { resultados: [], indisponivel: true };
  let vs: number[][] | null;
  // ponytail: uma chamada com até 301 textos curtos; se o modelo passar a limitar o tamanho do lote, dividir em blocos aqui.
  try { vs = vetores(await ai.run(embeddingsModel(env), { text: [nome, ...lista.map((c) => c.nome)] }), lista.length + 1); }
  catch (e) {
    log('warn', { msg: 'similares_indisponivel', projeto: projectId, tipo, erro: e instanceof Error ? e.name : 'desconhecido' });
    return { resultados: [], indisponivel: true };
  }
  if (!vs) {
    log('warn', { msg: 'similares_indisponivel', projeto: projectId, tipo, erro: 'resposta_fora_do_formato' });
    return { resultados: [], indisponivel: true };
  }
  const alvo = vs[0];
  const resultados = lista.map((c, i) => ({ id: c.id, nome: c.nome, score: cosseno(alvo, vs[i + 1]) }))
    .filter((r) => r.score >= LIMIAR_SIMILAR)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTADOS)
    .map((r) => ({ ...r, score: Math.round(r.score * 1000) / 1000 }));
  log('info', { msg: 'similares', projeto: projectId, tipo, candidatos: lista.length, resultados: resultados.length });
  return { resultados };
}
