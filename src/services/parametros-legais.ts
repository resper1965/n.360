import { logAudit } from '../helpers';
import { diaEmSaoPaulo } from './hoje';

/**
 * Núcleo do n.privacy, fatia 7: prazos legais como PARÂMETRO editável (spec 5: "todo prazo entra como parâmetro com fonte
 * citada, conferido pelo jurídico no texto oficial antes de virar regra"). Nenhum valor mora no código nem na migration:
 * sem parâmetro cadastrado o prazo é nulo ("não calculado"). Quem cadastra é o platform_admin, com fonte e revisão.
 */

export const CHAVES = {
  'titular.resposta': 'Prazo de resposta ao pedido do titular',
  'incidente.comunicacao_anpd': 'Prazo de comunicação do incidente à ANPD',
  'incidente.comunicacao_titular': 'Prazo de comunicação do incidente ao titular',
} as const;
export type ChaveParametro = keyof typeof CHAVES;
export const UNIDADES = ['horas', 'dias_corridos', 'dias_uteis'] as const;
export type Unidade = (typeof UNIDADES)[number];

export type Parametro = { chave: string; valor: number; unidade: Unidade; fonte: string; revisado_em: string; revisado_por: string; updated_at: string };
export type ParametroListado = { chave: ChaveParametro; descricao: string; definido: boolean } & Partial<Omit<Parametro, 'chave'>>;

export async function lerParametros(db: D1Database): Promise<ParametroListado[]> {
  const { results } = await db.prepare('SELECT chave, valor, unidade, fonte, revisado_em, revisado_por, updated_at FROM parametros_legais').all<Parametro>();
  const porChave = new Map(results.map((r) => [r.chave, r]));
  return (Object.keys(CHAVES) as ChaveParametro[]).map((chave) => {
    const p = porChave.get(chave);
    return p ? { ...p, chave, descricao: CHAVES[chave], definido: true } : { chave, descricao: CHAVES[chave], definido: false };
  });
}

export type DadosParametro = { valor: number; unidade: Unidade; fonte: string; revisado_em: string; revisado_por: string };

export async function salvarParametro(db: D1Database, ator: string, chave: string, d: DadosParametro): Promise<{ ok: true } | { ok: false; status: 400 | 404; error: string }> {
  if (!Object.hasOwn(CHAVES, chave)) return { ok: false, status: 404, error: `Parâmetro desconhecido: ${chave}` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.revisado_em) || Number.isNaN(Date.parse(`${d.revisado_em}T00:00:00Z`))) return { ok: false, status: 400, error: 'revisado_em precisa ser uma data AAAA-MM-DD' };
  const antes = await db.prepare('SELECT valor, unidade FROM parametros_legais WHERE chave = ?').bind(chave).first<{ valor: number; unidade: string }>();
  await db.prepare(
    `INSERT INTO parametros_legais (chave, valor, unidade, fonte, revisado_em, revisado_por) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, unidade = excluded.unidade, fonte = excluded.fonte, revisado_em = excluded.revisado_em, revisado_por = excluded.revisado_por, updated_at = CURRENT_TIMESTAMP`
  ).bind(chave, d.valor, d.unidade, d.fonte, d.revisado_em, d.revisado_por).run();
  await logAudit(db, 'parametro_legal.salvo', ator, `${chave}: ${antes ? `${antes.valor} ${antes.unidade}` : 'não definido'} → ${d.valor} ${d.unidade}; fonte: ${d.fonte}; revisado por ${d.revisado_por} em ${d.revisado_em}`);
  return { ok: true };
}

export async function removerParametro(db: D1Database, ator: string, chave: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM parametros_legais WHERE chave = ?').bind(chave).run();
  if (r.meta.changes) await logAudit(db, 'parametro_legal.removido', ator, `${chave}: removido (o prazo volta a "não calculado")`);
  return (r.meta.changes ?? 0) > 0;
}

// shortcut: só feriados nacionais; ponto facultativo e local ficam de fora até o jurídico confirmar
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
/** Domingo de Páscoa do ano (algoritmo de Meeus/Jones/Butcher), como data UTC. */
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}
/** Feriado nacional (AAAA-MM-DD): os fixos e a Sexta-feira Santa (Páscoa − 2 dias). */
export function ehFeriadoNacional(dia: string): boolean {
  if (FERIADOS_FIXOS.includes(dia.slice(5, 10))) return true;
  const sexta = pascoa(Number(dia.slice(0, 4)));
  sexta.setUTCDate(sexta.getUTCDate() - 2);
  return sexta.toISOString().slice(0, 10) === dia.slice(0, 10);
}

/**
 * Soma o prazo a uma data/hora ISO. `horas` e `dias_corridos` somam direto; `dias_uteis` conta pelo calendário de São Paulo
 * (`diaEmSaoPaulo`: ciência às 22h de Brasília é o dia de Brasília, não o dia seguinte em UTC), pula sábado, domingo e feriado
 * nacional, e mantém a hora (São Paulo sem horário de verão desde 2019: cada dia são 24 h).
 */
export function somarPrazo(baseIso: string, valor: number, unidade: Unidade): string {
  const base = new Date(/^\d{4}-\d{2}-\d{2}$/.test(baseIso) ? `${baseIso}T00:00:00Z` : baseIso);
  if (Number.isNaN(base.getTime())) throw new Error(`Data inválida: ${baseIso}`);
  if (unidade === 'horas') return new Date(base.getTime() + valor * 3_600_000).toISOString();
  if (unidade === 'dias_corridos') return new Date(base.getTime() + valor * 86_400_000).toISOString();
  const d = new Date(`${diaEmSaoPaulo(baseIso.length === 10 ? baseIso : base.toISOString(), baseIso)}T00:00:00Z`); // base com hora: a meia-noite UTC é instante
  let corridos = 0;
  for (let i = 0; i < valor;) {
    d.setUTCDate(d.getUTCDate() + 1);
    corridos++;
    const dia = d.getUTCDay();
    if (dia !== 0 && dia !== 6 && !ehFeriadoNacional(d.toISOString().slice(0, 10))) i++;
  }
  return new Date(base.getTime() + corridos * 86_400_000).toISOString();
}

/** O prazo do parâmetro a partir da base, ou null se o parâmetro não foi cadastrado ("não calculado"). */
export async function prazoDe(db: D1Database, chave: ChaveParametro, baseIso: string): Promise<string | null> {
  const p = await db.prepare('SELECT valor, unidade FROM parametros_legais WHERE chave = ?').bind(chave).first<{ valor: number; unidade: Unidade }>();
  return p ? somarPrazo(baseIso, p.valor, p.unidade) : null;
}

/** Próximo protocolo `PREFIXO-AAAA-NNNN` do projeto. A UNIQUE (project_id, protocolo) é a rede contra duas criações juntas. */
export async function proximoProtocolo(db: D1Database, tabela: 'titular_pedidos' | 'incidentes', prefixo: 'PT' | 'IN', projectId: string, ano = new Date().getUTCFullYear()): Promise<string> {
  const like = `${prefixo}-${ano}-%`;
  // `tabela` e `prefixo` vêm de constantes tipadas, nunca da requisição.
  const r = await db.prepare(`SELECT max(CAST(substr(protocolo, length(?1) + 1) AS INTEGER)) AS n FROM ${tabela} WHERE project_id = ?2 AND protocolo LIKE ?3`)
    .bind(`${prefixo}-${ano}-`, projectId, like).first<{ n: number | null }>();
  return `${prefixo}-${ano}-${String((r?.n ?? 0) + 1).padStart(4, '0')}`;
}
