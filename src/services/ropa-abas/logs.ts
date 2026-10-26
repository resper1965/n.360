import { genId } from '../../helpers';
import type { Mudanca } from './comum';

/** Seções legíveis da trilha, como o legado as escreve ("itens: Controle de GAPS / Alteração"). */
export const SECOES = ['Descrição da atividade', 'Escopo', 'Tratamento de Dados', 'Agentes de Tratamento', 'Medidas de Segurança', 'Base Jurídica',
  'Controle de GAPS', 'Teste de Impacto', 'Riscos', 'Situação'] as const;
export type Secao = (typeof SECOES)[number];

/** Ação antiga (F1 a F3) → seção, para o histórico que as rotas de antes já gravaram. */
const SECAO_DA_ACAO: Record<string, Secao> = {
  'ropa.impacto': 'Teste de Impacto', 'ropa.ciclo': 'Tratamento de Dados', 'ropa.itens': 'Tratamento de Dados', 'ropa.departamentos': 'Escopo',
  'ropa.bases': 'Base Jurídica', 'ropa_updated': 'Escopo', 'ropa_created': 'Escopo', 'ropa.approval_revoked': 'Situação',
};

/**
 * Uma linha de trilha por seção alterada. SÓ seção, ação e ids: texto livre digitado pela pessoa (descrição, gap, medida) nunca entra aqui.
 * `detalhe` é opcional e curto (contagem ou código, não texto).
 */
export async function registrarSecao(db: D1Database, ator: string, projectId: string, ropaId: string, secao: Secao | string, evento: string, detalhe = '', mudancas: Mudanca[] = []) {
  // D3: antes e depois só de campo da lista fixa (nenhum é texto livre); qualquer outro campo é descartado aqui, não na rota.
  const valores = mudancas.filter((m) => CAMPOS_COM_VALOR.has(m.campo)).map((m) => `${m.campo}: ${m.antes} -> ${m.depois}`).join('; ');
  await db.prepare(
    `INSERT INTO audit_logs (id, action, actor, details, project_id, entity_type, entity_id, field, created_at)
     VALUES (?, 'ropa.secao', ?, ?, ?, 'ropa', ?, ?, datetime('now'))`
  ).bind(genId(), ator, `ROPA ${ropaId}: ${evento}${detalhe ? ` (${detalhe})` : ''}${valores ? `${SEPARADOR} ${valores}` : ''}`, projectId, ropaId, `${secao} / ${evento}`).run();
}

export type LinhaDeLog = { secao: string; evento: string; nome: string; data: string; mudancas: Mudanca[] };

/** Campos cujo valor anterior e novo vão para a trilha: escolhas, marcas, situação e ids. Texto livre (nome, descrição, finalidade, gap, medida) nunca. */
export const CAMPOS_COM_VALOR: ReadonlySet<string> = new Set(['processamento_automatizado', 'owner_parte_id', 'areas_ids',
  'papel_controlador', 'papel_operador', 'international_transfers', 'situacao']);
const SEPARADOR = ' |';

function mudancasDe(details: string | null): Mudanca[] {
  const i = (details ?? '').indexOf(`${SEPARADOR} `);
  if (i < 0) return [];
  return details!.slice(i + SEPARADOR.length + 1).split('; ').flatMap((p) => {
    const m = /^([a-z_]+): (.*) -> (.*)$/.exec(p);
    return m && CAMPOS_COM_VALOR.has(m[1]) ? [{ campo: m[1], antes: m[2], depois: m[3] }] : [];
  });
}

const mascara = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');

/** null = a atividade não é do projeto. Nunca devolve `justification`: o motivo de situação não sai na aba. */
export async function lerLogs(db: D1Database, projectId: string, ropaId: string, { limite = 50, antes }: { limite?: number; antes?: string } = {}): Promise<LinhaDeLog[] | null> {
  if (!(await db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first())) return null;
  const { results } = await db.prepare(
    `SELECT l.action, l.actor, l.field, l.details, l.created_at, NULLIF(u.name, '') AS nome
       FROM audit_logs l LEFT JOIN users u ON lower(u.email) = lower(l.actor)
      WHERE l.project_id = ?1 AND ((l.entity_type = 'ropa' AND l.entity_id = ?2) OR l.details LIKE ?3)
        AND (?4 IS NULL OR l.created_at < ?4)
      ORDER BY l.created_at DESC, l.rowid DESC LIMIT ?5`
  ).bind(projectId, ropaId, `ROPA ${ropaId}:%`, antes ?? null, Math.min(Math.max(limite, 1), 200))
    .all<{ action: string; actor: string; field: string | null; details: string | null; created_at: string; nome: string | null }>();
  return results.map((r) => {
    const [secao, evento] = r.field ? r.field.split(' / ') : [SECAO_DA_ACAO[r.action] ?? 'Escopo', r.action.replace(/^ropa[._]/, '').replace(/_/g, ' ')];
    return { secao, evento: evento ?? 'Alteração', nome: r.nome ?? (r.actor.includes('@') ? mascara(r.actor) : r.actor), data: r.created_at, mudancas: mudancasDe(r.details) };
  });
}
