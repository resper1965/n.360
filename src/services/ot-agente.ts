import { genId, rateLimitD1, sha256Hex } from '../helpers';
import { livreSemPii, otAtivoCriarSchema, TETO_ACHADOS_SESSAO, VALIDADE_MAX_DIAS } from '../schemas/ot';
import { modulosDoProjeto } from '../modulos';
import { chavesOt } from './ot-cifra';
import { CAMPOS_DEPARA, gravarAchados, INSERIR_ACHADO, type CampoDepara } from './ot-depara';
import { TETO_LEITURA_OT } from './ot-inventario';
import { prepararAchado } from './ot-levantamento';
import { hojeEmSaoPaulo } from './hoje';

/** Agente externo de coleta do n.ot (L5, plano 2026-11-04): chave `ot_coleta`, válida só em `/ot-coleta/mcp`. */
export const VALIDADE_PADRAO_DIAS = 7;
export { VALIDADE_MAX_DIAS };
export const TETO_AGENTE_HORA = 120;
export const TETO_ACHADOS_CHAMADA = 200;
export const TETO_SESSOES_DIA = 20;

/** Emite a chave; o texto só sai aqui (no banco fica o SHA-256). */
export async function emitirChaveColeta(db: D1Database, projectId: string, nome: string, dias: number, ator: string): Promise<{ id: string; chave: string; expira_em: string }> {
  void ator; // a trilha é gravada pela rota, com o ator da sessão
  const id = genId();
  const chave = 'otc_' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const expira_em = new Date(Date.now() + dias * 86_400_000).toISOString();
  await db.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, expires_at, status) VALUES (?, ?, ?, ?, 'ot_coleta', ?, 'Active')`)
    .bind(id, projectId, await sha256Hex(chave), nome, expira_em).run();
  return { id, chave, expira_em };
}

export interface ChaveColeta { id: string; nome: string; projectId: string; ator: string }
export type EnvColeta = { DB: D1Database; OT_INVENTARIO_KEY?: string; OT_INVENTARIO_HMAC_KEY?: string };

/** Recusa de uma operação do agente: a mensagem vai ao agente como está (texto fixo, sem dado). */
export class RecusaColeta extends Error {}

/** Falha fechada, a cada requisição: chave ativa, com validade e não vencida, `ot_coleta`; projeto com o n.ot e o interruptor ligado; chaves do n.ot.
 *  O teto por hora é cobrado por `tools/call` (`cobrarChamada`), não aqui. */
export async function autenticarChaveColeta(env: EnvColeta, req: Request): Promise<{ ok: true; chave: ChaveColeta } | { ok: false; status: 401 | 403 | 503; error: string }> {
  const auth = req.headers.get('Authorization') ?? '';
  const texto = auth.startsWith('Bearer ') ? auth.slice(7).trim() : req.headers.get('X-API-Key')?.trim() ?? '';
  const row = texto ? await env.DB.prepare(`SELECT id, project_id, name, permissions, status, expires_at FROM api_keys WHERE key_hash = ?`)
    .bind(await sha256Hex(texto)).first<{ id: string; project_id: string | null; name: string; permissions: string; status: string; expires_at: string | null }>() : null;
  if (!row || row.status !== 'Active' || row.permissions !== 'ot_coleta' || !row.project_id || !row.expires_at || new Date(row.expires_at) < new Date()) {
    return { ok: false, status: 401, error: 'Chave do agente de coleta inválida, revogada ou vencida' };
  }
  const p = await env.DB.prepare('SELECT agente_coleta_ot FROM projects WHERE id = ?').bind(row.project_id).first<{ agente_coleta_ot: number }>();
  if (p?.agente_coleta_ot !== 1 || !(await modulosDoProjeto(env.DB, row.project_id)).includes('ot')) {
    return { ok: false, status: 403, error: 'Agente de coleta desligado neste projeto' };
  }
  if (!chavesOt(env)) return { ok: false, status: 503, error: 'Inventário de ativos indisponível: as chaves do n.ot não estão configuradas' };
  await env.DB.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").bind(row.id).run().catch(() => {});
  return { ok: true, chave: { id: row.id, nome: row.name, projectId: row.project_id, ator: `apikey:${row.id} (${row.name})` } };
}

const DESCRICAO: Record<Exclude<CampoDepara, 'zona'>, string> = {
  nome: 'Nome ou identificação do equipamento (obrigatório)',
  ip: 'Endereço IP (só neste campo)',
  mac: 'Endereço MAC (só neste campo)',
  fabricante: 'Fabricante',
  modelo: 'Modelo',
  tipo_dispositivo: 'Tipo: RTU, IED, CLP, IHM, switch, servidor, gateway...',
  funcao: 'Função do equipamento na operação',
  protocolos_portas: 'Protocolos e portas em uso',
  firmware_so_versao: 'Versão de firmware ou sistema operacional',
  no_arciber: 'Está no escopo do ARCiber',
  categoria_arciber: 'Categoria do ARCiber',
  firmware_nao_aplicavel: 'Equipamento sem firmware ou SO',
};
const categorias = otAtivoCriarSchema.shape.categoria_arciber.unwrap().unwrap().options;
const REGRAS = [
  'Registre só ativos (equipamentos); um achado por equipamento.',
  'A evidência é o trecho do documento que sustenta o achado.',
  'Não escreva IP, MAC, CPF, e-mail nem telefone na evidência; IP e MAC vão só nos campos ip e mac.',
  'Os achados ficam em rascunho: quem revisa e envia ao inventário é o consultor, pela interface.',
  'Encerre a sessão ao terminar o documento.',
];

/** Teto por hora, cobrado a cada `tools/call` (initialize, tools/list e notificações não contam). Devolve a recusa ou null. */
export async function cobrarChamada(db: D1Database, chave: ChaveColeta): Promise<string | null> {
  return await rateLimitD1(db, `ot:agente:${chave.id}`, TETO_AGENTE_HORA, 3600) ? null
    : `Limite de ${TETO_AGENTE_HORA} chamadas por hora desta chave atingido. Tente de novo mais tarde.`;
}

/** Zona não vem do agente: aceitar o nome exigiria consultar as zonas do site, e o aviso de "zona não encontrada" seria um oráculo. */
const CAMPOS_DO_AGENTE = CAMPOS_DEPARA.filter((c) => c !== 'zona');
const SEM_ZONA = new Map<string, string>();

export async function lerDepara(db: D1Database, projectId: string) {
  const roteiro = await db.prepare('SELECT id, texto, item_norma FROM ot_roteiro_perguntas ORDER BY ordem').all<{ id: string; texto: string; item_norma: string }>();
  const sites = await db.prepare(`SELECT id, nome FROM ot_sites WHERE project_id = ? AND status = 'ativo' ORDER BY nome LIMIT ${TETO_LEITURA_OT}`)
    .bind(projectId).all<{ id: string; nome: string }>();
  return {
    campos: CAMPOS_DO_AGENTE.map((campo) => ({ campo, descricao: DESCRICAO[campo] })),
    vocabularios: { categoria_arciber: categorias, no_arciber: 'booleano', firmware_nao_aplicavel: 'booleano', protocolos_portas: '[{protocolo, porta?}]' },
    roteiro: roteiro.results,
    sites: sites.results,
    limites: { achados_por_chamada: TETO_ACHADOS_CHAMADA, achados_por_sessao: TETO_ACHADOS_SESSAO },
    regras: REGRAS,
  };
}

const titulo = livreSemPii(200, 1);
export async function criarSessaoDocumental(db: D1Database, chave: ChaveColeta, a: { site_id: string; documento_titulo: string; documento_data?: string }) {
  const site = await db.prepare(`SELECT id FROM ot_sites WHERE id = ? AND project_id = ? AND status = 'ativo'`).bind(a.site_id, chave.projectId).first();
  if (!site) throw new RecusaColeta('Site não encontrado');
  const t = titulo.safeParse(a.documento_titulo);
  if (!t.success) throw new RecusaColeta(`documento_titulo inválido: ${t.error.issues[0].message}`);
  const id = genId();
  const ator = `apikey:${chave.id}`;
  // Teto diário na própria escrita: pedidos simultâneos não passam de TETO_SESSOES_DIA.
  const r = await db.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, documento_titulo, documento_data, criado_por)
    SELECT ?, ?, ?, 'documento', ?, ?, ?, ? WHERE (SELECT count(*) FROM ot_levantamentos WHERE criado_por = ? AND created_at >= datetime('now', '-1 day')) < ${TETO_SESSOES_DIA}`)
    .bind(id, chave.projectId, a.site_id, hojeEmSaoPaulo(), t.data, a.documento_data ?? null, ator, ator).run();
  if (!r.meta.changes) throw new RecusaColeta(`Limite de ${TETO_SESSOES_DIA} sessões por dia desta chave atingido. Tente de novo amanhã.`);
  return { levantamento_id: id };
}

/** Só a sessão desta chave: inexistente e alheia dão a mesma mensagem. */
async function sessaoDaChave(db: D1Database, chave: ChaveColeta, id: string) {
  const lev = await db.prepare(`SELECT id, site_id, situacao FROM ot_levantamentos WHERE id = ? AND project_id = ? AND criado_por = ? AND status = 'ativo'`)
    .bind(id, chave.projectId, `apikey:${chave.id}`).first<{ id: string; site_id: string; situacao: string }>();
  if (!lev) throw new RecusaColeta('Sessão não encontrada');
  if (lev.situacao !== 'aberto') throw new RecusaColeta('Sessão encerrada');
  return lev;
}

const evidenciaSchema = livreSemPii(2000, 1);
/** Sem confronto, duplicata nem id de ativo na resposta (sem oráculo): o agente não lê o inventário. */
export async function registrarAchados(env: EnvColeta, chave: ChaveColeta, a: { levantamento_id: string; achados: { dados: Record<string, unknown>; evidencia: string }[] }) {
  const db = env.DB;
  const lev = await sessaoDaChave(db, chave, a.levantamento_id);
  const chaves = chavesOt(env)!;
  const recusados: { indice: number; motivo: string }[] = [];
  const itens: { indice: number; stmt: D1PreparedStatement; aviso: boolean }[] = [];
  for (const [indice, it] of a.achados.entries()) {
    const ev = evidenciaSchema.safeParse(it.evidencia);
    if (!ev.success) { recusados.push({ indice, motivo: `evidencia: ${ev.error.issues[0].message}` }); continue; }
    // Recusa uniforme, sem consultar zona alguma: a mesma resposta para zona real e inventada.
    if ('zona' in it.dados || 'zona_id' in it.dados) { recusados.push({ indice, motivo: 'campo não aceito pelo agente' }); continue; }
    const id = genId(); // o mesmo id na AAD da cifra e na linha
    const p = await prepararAchado(chaves, chave.projectId, lev.site_id, id, it.dados, SEM_ZONA);
    itens.push({ indice, aviso: p.erros.length > 0, stmt: db.prepare(INSERIR_ACHADO('agente'))
      .bind(id, chave.projectId, lev.id, JSON.stringify(p.dados), JSON.stringify(p.erros), ev.data, `apikey:${chave.id}`, lev.id) });
  }
  const criados = await gravarAchados(db, itens.map((i) => i.stmt));
  // O teto da sessão só sobe: os que não entraram são o fim da lista.
  for (const i of itens.slice(criados)) recusados.push({ indice: i.indice, motivo: `Limite de ${TETO_ACHADOS_SESSAO} achados por sessão` });
  recusados.sort((x, y) => x.indice - y.indice);
  return { criados, recusados, com_aviso: itens.slice(0, criados).filter((i) => i.aviso).length };
}

export async function encerrarSessao(db: D1Database, chave: ChaveColeta, a: { levantamento_id: string }) {
  const lev = await sessaoDaChave(db, chave, a.levantamento_id);
  await db.prepare(`UPDATE ot_levantamentos SET situacao = 'encerrado', encerrado_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(lev.id).run();
  return { ok: true as const };
}
