import { genId, refForaDoProjeto, setParcial } from '../helpers';

/**
 * Riscos e ações da atividade de tratamento (n.privacy, F2; migration 0073). O registro é o MESMO do n.iso (`risks` e
 * `corrective_actions`, com `ropa_id`): a matriz e a CAPA do n.iso enxergam o que se cria aqui. As rotas por id do n.iso
 * continuam na faixa iso; estas funções servem às sub-rotas da atividade, e toda consulta filtra `ropa_id` E `project_id`.
 * Nível e residual são calculados aqui, nunca vêm do corpo.
 */

/** Faixa de nível da matriz 5x5 (impacto x probabilidade), a mesma do n.iso. */
export function riskLevel(score: number): string {
  if (score <= 5) return 'Low';
  if (score <= 12) return 'Medium';
  if (score <= 20) return 'High';
  return 'Critical';
}

/** Nível residual: só com as duas notas residuais; faltando uma, não há nível. */
export const residualLevel = (impacto: number | null | undefined, probabilidade: number | null | undefined) =>
  impacto && probabilidade ? riskLevel(impacto * probabilidade) : null;

type Falha = { ok: false; status: 400 | 403 | 404; error: string };
const naoAchou = (o: string): Falha => ({ ok: false, status: 404, error: `${o} não encontrado` });
const refRecusada = (campo: string): Falha => ({ ok: false, status: 400, error: `${campo} inexistente ou de outro projeto` });

export type RiscoCorpo = {
  threat?: string; vulnerability?: string | null; asset_id?: string | null; impact?: number; probability?: number;
  treatment?: string; treatment_plan?: string | null; residual_impact?: number | null; residual_probability?: number | null;
  owner_parte_id?: string | null; control_id?: string | null; status?: string; treatment_due_date?: string | null;
};
export type AcaoCorpo = {
  title?: string; description?: string | null; due_date?: string | null; assigned_to_parte_id?: string | null; status?: string; risk_id?: string | null;
  recomendacao?: string | null; action_plan?: string | null;
};

async function atividade(db: D1Database, projectId: string, ropaId: string) {
  return db.prepare('SELECT processing_purpose FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId)
    .first<{ processing_purpose: string }>();
}

/** O texto do ativo (coluna NOT NULL): o nome do item ligado, senão a finalidade da atividade. */
async function textoDoAtivo(db: D1Database, assetId: string | null | undefined, finalidade: string) {
  if (!assetId) return finalidade;
  return (await db.prepare('SELECT nome FROM itens WHERE id = ?').bind(assetId).first<string>('nome')) ?? finalidade;
}

export async function listarRiscos(db: D1Database, projectId: string, ropaId: string) {
  if (!(await atividade(db, projectId, ropaId))) return null;
  const { results } = await db.prepare(
    `SELECT r.*, pa.nome AS owner_parte_nome FROM risks r
       LEFT JOIN partes pa ON pa.id = r.owner_parte_id AND pa.project_id = r.project_id
      WHERE r.ropa_id = ? AND r.project_id = ? ORDER BY r.idr IS NULL, r.idr, r.created_at`
  ).bind(ropaId, projectId).all();
  return results;
}

/** Aceite (status `Accepted`) feito agora grava quem aceitou e quando; o agente nunca chega aqui com aceite (a rota recusa). */
export async function criarRisco(db: D1Database, projectId: string, ropaId: string, ator: string, corpo: RiscoCorpo):
  Promise<{ ok: true; id: string; risk_level: string } | Falha> {
  const at = await atividade(db, projectId, ropaId);
  if (!at) return naoAchou('Registro do RoPA');
  const fora = await refForaDoProjeto(db, projectId, corpo, ['asset_id', 'owner_parte_id', 'control_id']);
  if (fora) return refRecusada(fora);
  const id = genId();
  const impacto = corpo.impact ?? 3;
  const prob = corpo.probability ?? 3;
  const nivel = riskLevel(impacto * prob);
  const status = corpo.status ?? 'Open';
  const aceite = status === 'Accepted';
  await db.batch([
    db.prepare(
      `INSERT INTO risks (id, project_id, ropa_id, asset_id, asset, threat, vulnerability, impact, probability, risk_level, treatment, treatment_plan,
         residual_impact, residual_probability, residual_level, owner_parte_id, control_id, status, accepted_by, accepted_at, idr, treatment_due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(idr), 0) + 1 FROM risks WHERE ropa_id = ?), ?)`
    ).bind(id, projectId, ropaId, corpo.asset_id || null, await textoDoAtivo(db, corpo.asset_id, at.processing_purpose), corpo.threat,
      corpo.vulnerability ?? null, impacto, prob, nivel, corpo.treatment ?? 'Mitigate', corpo.treatment_plan ?? null,
      corpo.residual_impact ?? null, corpo.residual_probability ?? null, residualLevel(corpo.residual_impact, corpo.residual_probability),
      corpo.owner_parte_id || null, corpo.control_id || null, status, aceite ? ator : null, aceite ? new Date().toISOString() : null,
      ropaId, corpo.treatment_due_date ?? null),
    db.prepare('INSERT INTO risk_history (id, risk_id, project_id, impact, probability, risk_level) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(genId(), id, projectId, impacto, prob, nivel),
  ]);
  return { ok: true, id, risk_level: nivel };
}

type RiscoGravado = { impact: number; probability: number; residual_impact: number | null; residual_probability: number | null; status: string | null; asset_id: string | null };

export async function atualizarRisco(db: D1Database, projectId: string, ropaId: string, id: string, ator: string, corpo: RiscoCorpo):
  Promise<{ ok: true; risk_level: string } | Falha> {
  const at = await atividade(db, projectId, ropaId);
  const atual = at && await db.prepare('SELECT impact, probability, residual_impact, residual_probability, status, asset_id FROM risks WHERE id = ? AND ropa_id = ? AND project_id = ?')
    .bind(id, ropaId, projectId).first<RiscoGravado>();
  if (!at || !atual) return naoAchou('Risco da atividade');
  const fora = await refForaDoProjeto(db, projectId, corpo, ['asset_id', 'owner_parte_id', 'control_id']);
  if (fora) return refRecusada(fora);
  // Ausente mantém; null limpa (só onde a coluna aceita NULL). Notas principais são NOT NULL: null não chega (o esquema recusa).
  const impacto = corpo.impact ?? atual.impact;
  const prob = corpo.probability ?? atual.probability;
  const nivel = riskLevel(impacto * prob);
  const resI = corpo.residual_impact === undefined ? atual.residual_impact : corpo.residual_impact;
  const resP = corpo.residual_probability === undefined ? atual.residual_probability : corpo.residual_probability;
  const aceiteNovo = corpo.status === 'Accepted' && atual.status !== 'Accepted';
  const p = setParcial(corpo, {
    threat: null, vulnerability: null, asset_id: null, treatment: 'Mitigate', treatment_plan: null, residual_impact: null,
    residual_probability: null, owner_parte_id: null, control_id: null, status: 'Open', treatment_due_date: null,
  });
  const extra: string[] = [];
  const binds: unknown[] = [];
  if (corpo.asset_id !== undefined) {
    extra.push('asset = ?');
    binds.push(await textoDoAtivo(db, corpo.asset_id, at.processing_purpose));
  }
  if (aceiteNovo) { extra.push('accepted_by = ?', 'accepted_at = ?'); binds.push(ator, new Date().toISOString()); }
  await db.batch([
    db.prepare(
      `UPDATE risks SET impact = ?, probability = ?, risk_level = ?, residual_level = ?${p.sql ? ', ' + p.sql : ''}${extra.length ? ', ' + extra.join(', ') : ''},
         updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ropa_id = ? AND project_id = ?`
    ).bind(impacto, prob, nivel, residualLevel(resI, resP), ...p.binds, ...binds, id, ropaId, projectId),
    db.prepare('INSERT INTO risk_history (id, risk_id, project_id, impact, probability, risk_level) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(genId(), id, projectId, impacto, prob, nivel),
  ]);
  return { ok: true, risk_level: nivel };
}

/**
 * Apaga o risco da atividade. A ação ligada SOBREVIVE (decisão da F2): `corrective_actions.risk_id` é ON DELETE CASCADE, então o
 * vínculo é anulado antes, no mesmo batch. A ação continua ligada à atividade pelo `ropa_id`.
 */
export async function apagarRisco(db: D1Database, projectId: string, ropaId: string, id: string): Promise<boolean> {
  if (!(await db.prepare('SELECT 1 FROM risks WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(id, ropaId, projectId).first())) return false;
  await db.batch([
    db.prepare('UPDATE corrective_actions SET risk_id = NULL WHERE risk_id = ? AND project_id = ?').bind(id, projectId),
    db.prepare('DELETE FROM risks WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(id, ropaId, projectId),
  ]);
  return true;
}

export async function listarAcoes(db: D1Database, projectId: string, ropaId: string) {
  if (!(await atividade(db, projectId, ropaId))) return null;
  const { results } = await db.prepare(
    `SELECT ca.*, pa.nome AS assigned_to_parte_nome, r.threat AS risco_ameaca FROM corrective_actions ca
       LEFT JOIN partes pa ON pa.id = ca.assigned_to_parte_id AND pa.project_id = ca.project_id
       LEFT JOIN risks r ON r.id = ca.risk_id AND r.project_id = ca.project_id
      WHERE ca.ropa_id = ? AND ca.project_id = ? ORDER BY ca.due_date IS NULL, ca.due_date, ca.created_at`
  ).bind(ropaId, projectId).all();
  return results;
}

/** O risco ligado a uma ação tem de ser da MESMA atividade (e projeto). */
async function riscoForaDaAtividade(db: D1Database, projectId: string, ropaId: string, riskId: string | null | undefined) {
  return !!riskId && !(await db.prepare('SELECT 1 FROM risks WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(riskId, ropaId, projectId).first());
}

export async function criarAcao(db: D1Database, projectId: string, ropaId: string, corpo: AcaoCorpo): Promise<{ ok: true; id: string } | Falha> {
  if (!(await atividade(db, projectId, ropaId))) return naoAchou('Registro do RoPA');
  if (await riscoForaDaAtividade(db, projectId, ropaId, corpo.risk_id)) return { ok: false, status: 400, error: 'risk_id não é risco desta atividade' };
  const fora = await refForaDoProjeto(db, projectId, corpo, ['assigned_to_parte_id']);
  if (fora) return refRecusada(fora);
  const id = crypto.randomUUID();
  const status = corpo.status ?? 'Open';
  const agora = new Date().toISOString();
  await db.prepare(
    `INSERT INTO corrective_actions (id, project_id, ropa_id, risk_id, title, description, due_date, assigned_to_parte_id, status, completed_at, created_at, recomendacao, action_plan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, projectId, ropaId, corpo.risk_id || null, corpo.title, corpo.description ?? null, corpo.due_date ?? null,
    corpo.assigned_to_parte_id || null, status, status === 'Closed' ? agora : null, agora, corpo.recomendacao ?? null, corpo.action_plan ?? null).run();
  return { ok: true, id };
}

export async function atualizarAcao(db: D1Database, projectId: string, ropaId: string, id: string, corpo: AcaoCorpo): Promise<{ ok: true } | Falha> {
  if (!(await db.prepare('SELECT 1 FROM corrective_actions WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(id, ropaId, projectId).first())) {
    return naoAchou('Ação da atividade');
  }
  if (await riscoForaDaAtividade(db, projectId, ropaId, corpo.risk_id)) return { ok: false, status: 400, error: 'risk_id não é risco desta atividade' };
  const fora = await refForaDoProjeto(db, projectId, corpo, ['assigned_to_parte_id']);
  if (fora) return refRecusada(fora);
  const p = setParcial(corpo, { title: null, description: null, due_date: null, assigned_to_parte_id: null, status: 'Open', risk_id: null, recomendacao: null, action_plan: null });
  // Concluir carimba a data; reabrir a limpa. Status ausente não mexe.
  const sets = p.sql ? [p.sql] : [];
  const binds = [...p.binds];
  if (corpo.status !== undefined) { sets.push('completed_at = ?'); binds.push(corpo.status === 'Closed' ? new Date().toISOString() : null); }
  if (sets.length) {
    await db.prepare(`UPDATE corrective_actions SET ${sets.join(', ')} WHERE id = ? AND ropa_id = ? AND project_id = ?`).bind(...binds, id, ropaId, projectId).run();
  }
  return { ok: true };
}

export async function apagarAcao(db: D1Database, projectId: string, ropaId: string, id: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM corrective_actions WHERE id = ? AND ropa_id = ? AND project_id = ?').bind(id, ropaId, projectId).run();
  return (r.meta.changes ?? 0) > 0;
}

/** O mapa de risco do n.privacy: todos os riscos do projeto que têm atividade (risco só do n.iso fica de fora). */
export async function riscosDoMapa(db: D1Database, projectId: string) {
  const { results } = await db.prepare(
    `SELECT r.id, r.ropa_id, r.asset, r.threat, r.probability, r.impact, r.risk_level, r.residual_impact, r.residual_probability,
            r.residual_level, r.treatment, r.status, rr.processing_purpose AS atividade
       FROM risks r JOIN ropa_records rr ON rr.id = r.ropa_id AND rr.project_id = r.project_id
      WHERE r.project_id = ? ORDER BY r.impact * r.probability DESC, rr.processing_purpose`
  ).bind(projectId).all();
  return results;
}

/** Faixas de prazo das ações abertas das atividades (F4): painel do encarregado e exportação. A ordem é a da tela. */
export const FAIXAS_PRAZO = [
  { id: 'vencidas', rotulo: 'Vencidas' },
  { id: 'ate_30', rotulo: 'Até 30 dias' },
  { id: 'de_31_a_90', rotulo: '31 a 90 dias' },
  { id: 'de_91_a_150', rotulo: '91 a 150 dias' },
  { id: 'mais_de_150', rotulo: 'Mais de 150 dias' },
  { id: 'sem_prazo', rotulo: 'Sem prazo' },
] as const;
export type FaixaPrazo = (typeof FAIXAS_PRAZO)[number]['id'];
export const ehFaixaPrazo = (v: unknown): v is FaixaPrazo => FAIXAS_PRAZO.some((f) => f.id === v);

/** Dias corridos de `hoje` (AAAA-MM-DD) até o prazo. Vencida é prazo antes de hoje, a mesma conta de `acoes_vencidas`. */
export function faixaDePrazo(prazo: string | null | undefined, hoje: string): FaixaPrazo {
  const d = prazo ? Date.parse(String(prazo).slice(0, 10)) : NaN;
  if (Number.isNaN(d)) return 'sem_prazo';
  const dias = Math.round((d - Date.parse(hoje)) / 86_400_000);
  if (dias < 0) return 'vencidas';
  if (dias <= 30) return 'ate_30';
  if (dias <= 90) return 'de_31_a_90';
  if (dias <= 150) return 'de_91_a_150';
  return 'mais_de_150';
}

export type AcaoDaAtividade = {
  id: string; ropa_id: string; atividade: string; title: string; description: string | null; due_date: string | null; status: string | null;
  responsavel: string | null; risco: string | null; created_at: string | null; completed_at: string | null;
};

/** Ações de todas as atividades do projeto (só as que têm `ropa_id`); a CAPA só do n.iso fica de fora. Abertas primeiro, por prazo. */
export async function acoesDasAtividades(db: D1Database, projectId: string, { soAbertas = false, limite = 10_000 } = {}): Promise<AcaoDaAtividade[]> {
  const { results } = await db.prepare(
    `SELECT ca.id, ca.ropa_id, rr.processing_purpose AS atividade, ca.title, ca.description, ca.due_date, ca.status,
            pa.nome AS responsavel, r.threat AS risco, ca.created_at, ca.completed_at
       FROM corrective_actions ca JOIN ropa_records rr ON rr.id = ca.ropa_id AND rr.project_id = ca.project_id
       LEFT JOIN partes pa ON pa.id = ca.assigned_to_parte_id AND pa.project_id = ca.project_id
       LEFT JOIN risks r ON r.id = ca.risk_id AND r.project_id = ca.project_id
      WHERE ca.project_id = ?1 ${soAbertas ? `AND COALESCE(ca.status, 'Open') <> 'Closed'` : ''}
      ORDER BY COALESCE(ca.status, 'Open') = 'Closed', ca.due_date IS NULL, ca.due_date, ca.created_at LIMIT ?2`
  ).bind(projectId, limite).all<AcaoDaAtividade>();
  return results;
}

/** Pares motivo/descrição já usados nos riscos de atividade DESTE projeto (PR1: o catálogo de motivos é da PR2). Vazio no projeto novo. */
export async function motivosDeRisco(db: D1Database, projectId: string): Promise<{ nome: string; descricao_padrao: string | null }[]> {
  const { results } = await db.prepare(
    `SELECT DISTINCT threat AS nome, vulnerability AS descricao_padrao FROM risks WHERE project_id = ? AND ropa_id IS NOT NULL AND threat <> '' ORDER BY threat, vulnerability`
  ).bind(projectId).all<{ nome: string; descricao_padrao: string | null }>();
  return results;
}
