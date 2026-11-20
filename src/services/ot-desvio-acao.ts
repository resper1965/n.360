// Desvio → ação corretiva do núcleo (onda 3). O título é lido por quem não tem o módulo ot: só vai o que a pessoa escreveu.
import { normaliza } from './copiloto-ropa';
import { TETO_LEITURA_OT, sitesPermitidos, type AtorOt } from './ot-inventario';
import type { LinhaDesvio } from './ot-desvio';
import { podeVerOt } from './ot-visibilidade';

/** Só o campo recusado, nunca o nome (quem não tem o n.ot não aprende nomes). */
export const msgNomeOt = (campo: string) => `${campo} não pode citar o nome de ativos, zonas ou sites do projeto.`;

// Sem acento, sem caixa e SEM separador: "RTU-Principal", "RTU Principal" e "rtu.principal" são o mesmo nome. Substring de propósito: o erro seguro é bloquear.
const compacta = (t: string) => normaliza(t).replace(/[^\p{L}\p{N}]+/gu, '');

/** Primeiro campo (rótulo + texto) que cita o nome de ativo/zona/site ativo do projeto, ou null. Cada campo é conferido sozinho: colar o fim de um no começo do outro geraria falso positivo. Nomes com menos de 3 letras ou dígitos não contam. */
export async function campoQueCitaNomeOt(db: D1Database, projectId: string, campos: [string, string | undefined][], sitesJson?: string): Promise<string | null> {
  const nomes: string[] = [];
  // Com `sitesJson` (P0-4), só os nomes dos sites que a pessoa vê: o 400 não pode servir de oráculo para nome de outro site.
  for (const [t, col] of [['ot_ativos', 'site_id'], ['ot_zonas', 'site_id'], ['ot_sites', 'id']] as const) {
    const escopo = sitesJson === undefined ? '' : ` AND ${col} IN (SELECT value FROM json_each(?))`;
    const st = db.prepare(`SELECT nome FROM ${t} WHERE project_id = ? AND status = 'ativo'${escopo} LIMIT ${TETO_LEITURA_OT}`);
    const { results } = await (sitesJson === undefined ? st.bind(projectId) : st.bind(projectId, sitesJson)).all<{ nome: string }>();
    for (const r of results) { const n = compacta(r.nome); if (n.length >= 3) nomes.push(n); }
  }
  for (const [rotulo, texto] of campos) {
    const c = texto ? compacta(texto) : '';
    if (c && nomes.some((n) => c.includes(n))) return rotulo;
  }
  return null;
}

export interface DadosAcao { titulo: string; descricao?: string; assigned_to?: string; assigned_to_parte_id?: string; prazo?: string }

/**
 * Um batch, tudo condicionado ao desvio ainda aberto e sem ligação: se outra chamada ganhou a corrida nenhuma linha entra
 * (a ação, a referência e o UPDATE se guardam um no outro) e o chamador relê. Devolve a linha do desvio se criou, senão null.
 */
export async function criarAcaoDoDesvio(db: D1Database, projectId: string, desvioId: string, sitesJson: string, userId: string, d: DadosAcao): Promise<{ acaoId: string; desvio: LinhaDesvio } | null> {
  const acaoId = crypto.randomUUID();
  const [a, , u] = await db.batch([
    db.prepare(`INSERT INTO corrective_actions (id, project_id, title, description, severity, assigned_to, assigned_to_parte_id, due_date, status, created_at)
      SELECT ?, ?, ?, ?, 'Medium', ?, ?, ?, 'Open', ? WHERE EXISTS (SELECT 1 FROM ot_desvios WHERE id = ? AND project_id = ? AND situacao = 'aberto' AND site_id IN (SELECT value FROM json_each(?)))
        AND NOT EXISTS (SELECT 1 FROM ot_referencias WHERE ot_desvio_id = ?)`)
      .bind(acaoId, projectId, d.titulo, d.descricao ?? null, d.assigned_to ?? null, d.assigned_to_parte_id || null, d.prazo ?? null, new Date().toISOString(), desvioId, projectId, sitesJson, desvioId),
    db.prepare(`INSERT INTO ot_referencias (id, project_id, acao_id, ot_site_id, ot_desvio_id, criado_por)
      SELECT ?, ?, ?, site_id, id, ? FROM ot_desvios WHERE id = ? AND project_id = ? AND EXISTS (SELECT 1 FROM corrective_actions WHERE id = ? AND project_id = ?)`)
      .bind(crypto.randomUUID(), projectId, acaoId, userId, desvioId, projectId, acaoId, projectId),
    db.prepare(`UPDATE ot_desvios SET situacao = 'tratado', nota = 'Ação corretiva aberta', atualizado_por = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ? AND situacao = 'aberto' AND EXISTS (SELECT 1 FROM ot_referencias WHERE acao_id = ? AND project_id = ?) RETURNING *`)
      .bind(userId, desvioId, projectId, acaoId, projectId),
  ]);
  return a.meta.changes && u.results[0] ? { acaoId, desvio: u.results[0] as unknown as LinhaDesvio } : null;
}

export const MSG_CRIADOR_NAO_CONCLUI = 'Quem criou a ação a partir do desvio não a conclui. Peça a outra pessoa.';

/**
 * Leitura pontual de `ot_referencias` só para RECUSAR (segregação de funções); o núcleo não lê mais nada dela.
 * `criado_por` é o users.id de quem criou (o agente não cria); a sessão do agente carrega o id do consultor, então o agente
 * dele cai aqui também. Erro de banco propaga: quem chama não conclui (fail-closed).
 */
export async function criadorDaAcaoDoDesvio(db: D1Database, acaoId: string, userId: string): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 FROM ot_referencias WHERE acao_id = ? AND ot_desvio_id IS NOT NULL AND criado_por = ?').bind(acaoId, userId).first());
}

/** Os textos da ação que o núcleo mostra a quem não tem o n.ot, com o rótulo da recusa. */
const TEXTOS_DA_ACAO = [['title', 'O título'], ['description', 'A descrição'], ['assigned_to', 'O responsável'], ['root_cause', 'A causa raiz'],
  ['action_plan', 'O plano de ação'], ['resolution', 'A resolução'], ['recomendacao', 'A recomendação']] as const;
type CampoTexto = (typeof TEXTOS_DA_ACAO)[number][0];

/**
 * Editar uma ação ligada ao n.ot (qualquer `ot_referencias.acao_id`) segue a regra da criação: nenhum texto NOVO cita nome de
 * ativo/zona/site, porque o núcleo o mostra a quem não tem o n.ot. Decisões: (1) a ação é lida só no `projectId` já autorizado pela
 * rota (ação de outro projeto = sem checagem, e a rota responde o seu 404 de sempre); (2) só confere quem tem o n.ot no projeto: quem
 * não tem não conhece os nomes e não recebe pista; agente e chave de API também ficam fora (`podeVerOt` é false para eles), então
 * o consultor que dita o nome ao agente não é barrado: troca aceita para não abrir oráculo; (3) só os nomes dos sites que a pessoa
 * vê (P0-4); (4) só o campo cujo valor mudou (título antigo não trava a troca de status). Devolve a mensagem de recusa ou null.
 */
export async function edicaoCitaNomeOt(
  db: D1Database, projectId: string | null | undefined, acaoId: string, user: AtorOt | undefined,
  novo: Partial<Record<CampoTexto, unknown>>,
): Promise<string | null> {
  if (!projectId || !user) return null;
  const a = await db.prepare(`SELECT ${TEXTOS_DA_ACAO.map(([k]) => k).join(', ')} FROM corrective_actions ca
    WHERE id = ? AND project_id = ? AND EXISTS (SELECT 1 FROM ot_referencias r WHERE r.acao_id = ca.id)`).bind(acaoId, projectId)
    .first<Record<CampoTexto, string | null>>();
  if (!a || !(await podeVerOt(db, user, projectId))) return null;
  const campos = TEXTOS_DA_ACAO.filter(([k]) => typeof novo[k] === 'string' && novo[k] !== a[k]).map(([k, r]) => [r, novo[k] as string] as [string, string]);
  if (!campos.length) return null;
  const campo = await campoQueCitaNomeOt(db, projectId, campos, await sitesPermitidos(db, user, projectId));
  return campo ? msgNomeOt(campo) : null;
}
