import { genId } from '../../helpers';

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
export async function registrarSecao(db: D1Database, ator: string, projectId: string, ropaId: string, secao: Secao | string, evento: string, detalhe = '') {
  await db.prepare(
    `INSERT INTO audit_logs (id, action, actor, details, project_id, entity_type, entity_id, field, created_at)
     VALUES (?, 'ropa.secao', ?, ?, ?, 'ropa', ?, ?, datetime('now'))`
  ).bind(genId(), ator, `ROPA ${ropaId}: ${evento}${detalhe ? ` (${detalhe})` : ''}`, projectId, ropaId, `${secao} / ${evento}`).run();
}

export type LinhaDeLog = { secao: string; evento: string; nome: string; data: string };

const mascara = (e: string) => e.replace(/^(.).*(@.*)$/, '$1***$2');

/** null = a atividade não é do projeto. Nunca devolve `justification`: o motivo de situação não sai na aba. */
export async function lerLogs(db: D1Database, projectId: string, ropaId: string, { limite = 50, antes }: { limite?: number; antes?: string } = {}): Promise<LinhaDeLog[] | null> {
  if (!(await db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first())) return null;
  const { results } = await db.prepare(
    `SELECT l.action, l.actor, l.field, l.created_at, NULLIF(u.name, '') AS nome
       FROM audit_logs l LEFT JOIN users u ON lower(u.email) = lower(l.actor)
      WHERE l.project_id = ?1 AND ((l.entity_type = 'ropa' AND l.entity_id = ?2) OR l.details LIKE ?3)
        AND (?4 IS NULL OR l.created_at < ?4)
      ORDER BY l.created_at DESC, l.rowid DESC LIMIT ?5`
  ).bind(projectId, ropaId, `ROPA ${ropaId}:%`, antes ?? null, Math.min(Math.max(limite, 1), 200))
    .all<{ action: string; actor: string; field: string | null; created_at: string; nome: string | null }>();
  return results.map((r) => {
    const [secao, evento] = r.field ? r.field.split(' / ') : [SECAO_DA_ACAO[r.action] ?? 'Escopo', r.action.replace(/^ropa[._]/, '').replace(/_/g, ' ')];
    return { secao, evento: evento ?? 'Alteração', nome: r.nome ?? (r.actor.includes('@') ? mascara(r.actor) : r.actor), data: r.created_at };
  });
}
