/**
 * Aceite do risco residual (ISO/IEC 27001, 6.1.3 e; migration 0120).
 *
 * O aceite é um ato de quem tem a alçada do nível residual (Direção por padrão; `risco_alcadas` muda por nível), com a senha da
 * pessoa, um risco por vez. Ele congela o estado do risco (as colunas de `COLUNAS_RISCO`, o mesmo conteúdo do pedido de aceite) e
 * grava em `risco_aceites`: aceitante, data e hora UTC, nível residual, estratégia, controles, justificativa, hash. O risco ganha o
 * carimbo de quem aceitou (`accepted_by/accepted_at`).
 *
 * O aceite é independente do status do tratamento (migration 0121): aceitar, revogar e invalidar não mexem em `status`, e o status
 * muda livremente (Open, Mitigated, Closed) sem derrubar o aceite. A situação do aceite vem da linha vigente aqui.
 *
 * Mudar o que foi aceito (notas, residual, estratégia, plano ou controle) invalida o aceite sozinho (`conferirAceite`): a linha vira
 * `invalidado` com cada campo que mudou (valor aceito -> novo) e o risco volta a "aceite pendente". Só o próprio aceitante revoga,
 * com motivo. Status `Accepted` não se grava pelo PUT do risco (`recusaDoStatus`).
 *
 * Risco aceito antes da 0120 (status `Accepted` sem linha aqui) segue como está: aparece aceito, sem senha registrada.
 */
import { genId, logAudit, verifyPassword, autoridadeDeAssinatura, recusaDeAssinatura, recusaSenhaDeOutro, type PapelAssinatura } from '../helpers';
import { conteudoDoRisco, conteudosDosRiscos, hashConteudo, intacto, SQL_RISCO_ACEITAVEL } from './pedidos';

export const NIVEIS_RISCO = ['Low', 'Medium', 'High', 'Critical'] as const;
export type NivelRisco = (typeof NIVEIS_RISCO)[number];
export type Alcadas = Record<NivelRisco, PapelAssinatura>;
export type SituacaoAceite = 'aceito' | 'pendente' | 'revogado' | 'nao_se_aplica';

export const RECUSA_STATUS_ACEITO = 'O aceite do risco residual é feito pela ação "Aceitar risco residual", com a senha de quem tem a alçada.';
export const RECUSA_EXCLUIR_COM_ACEITE = 'Este risco tem aceite registrado (vigente, invalidado ou revogado): a prova do aceite não se apaga, então o risco não se exclui. Encerre o risco pelo status.';
/** O risco já teve aceite com senha? A prova fica: o risco não se exclui (a cascata apagaria risco_aceites). */
export const temAceiteRegistrado = async (db: D1Database, riskId: string) =>
  !!(await db.prepare('SELECT 1 FROM risco_aceites WHERE risk_id = ? LIMIT 1').bind(riskId).first());

/**
 * Risco tratado, para painel e prontidão (SQL sobre `risks` sem alias): mitigado ou encerrado; o aceite legado (Accepted sem nenhuma
 * linha em risco_aceites); ou estratégia "aceitar" com aceite vigente. O aceite do residual de um risco a mitigar não o trata.
 */
export const SQL_RISCO_TRATADO = `(COALESCE(risks.status, 'Open') IN ('Mitigated', 'Closed')
  OR (risks.status = 'Accepted' AND NOT EXISTS (SELECT 1 FROM risco_aceites ra WHERE ra.risk_id = risks.id))
  OR (risks.treatment = 'Accept' AND EXISTS (SELECT 1 FROM risco_aceites ra WHERE ra.risk_id = risks.id AND ra.situacao = 'vigente')))`;

/** O risco tem aceite vigente (com senha)? */
export const temAceiteVigente = async (db: D1Database, riskId: string) =>
  !!(await db.prepare(`SELECT 1 FROM risco_aceites WHERE risk_id = ? AND situacao = 'vigente'`).bind(riskId).first());

type Usuario = { id?: string; email?: string; role?: string; agente?: boolean };
type Resultado = { status: number; corpo: Record<string, unknown> };
export type RiscoBase = { id: string; project_id: string; status: string | null; residual_level: string | null };
export type AceiteRow = {
  id: string; risk_id: string; aceito_por: string; aceito_user_id: string | null; aceito_nome: string | null; papel: PapelAssinatura; aceito_em: string; nivel_residual: string;
  estrategia: string | null; controles_json: string; conteudo_json: string; hash: string; justificativa: string | null; pedido_id: string | null;
  status_anterior: string | null; situacao: 'vigente' | 'invalidado' | 'revogado'; encerrado_em: string | null; encerrado_por: string | null; motivo: string | null;
};

/** Alçada de cada nível do residual no projeto; nível sem linha é da Direção. */
export async function alcadasDoProjeto(db: D1Database, projectId: string): Promise<Alcadas> {
  const { results } = await db.prepare('SELECT nivel, papel FROM risco_alcadas WHERE project_id = ?').bind(projectId).all<{ nivel: NivelRisco; papel: PapelAssinatura }>();
  const a = Object.fromEntries(NIVEIS_RISCO.map((n) => [n, 'ceo'])) as Alcadas;
  for (const r of results) a[r.nivel] = r.papel;
  return a;
}

export const RECUSA_SEM_RESIDUAL = 'Avalie o risco residual (impacto e probabilidade residuais) antes do aceite.';
/** O motivo que a tela mostra no lugar do botão, a qualquer pessoa: só a falta de residual (motivo de alçada não vaza). */
const motivoSemResidual = (r: Pick<RiscoBase, 'status' | 'residual_level'>) =>
  !r.residual_level && r.status !== 'Accepted' && r.status !== 'Closed' ? RECUSA_SEM_RESIDUAL : null;

/** Por que esta pessoa não aceita este risco agora, ou `null` se aceita. `vigente`: o risco tem aceite vigente. `autoridade` lida uma vez por requisição. */
export function recusaDoAceite(
  user: Usuario, risco: Pick<RiscoBase, 'status' | 'residual_level'>, vigente: boolean, alcadas: Alcadas, autoridade: Awaited<ReturnType<typeof autoridadeDeAssinatura>>,
): string | null {
  if (user.agente === true) return 'Aceitar risco é ato da pessoa com a alçada, com a senha dela: o agente não aceita.';
  if (vigente) return 'Este risco já está aceito.';
  if (risco.status === 'Closed') return 'Risco encerrado não é aceito.';
  if (!risco.residual_level) return RECUSA_SEM_RESIDUAL;
  return recusaDeAssinatura(autoridade, alcadas[risco.residual_level as NivelRisco] ?? 'ceo');
}

/**
 * Statements do aceite (para um `batch`): a linha da prova e o carimbo no risco (o status não muda). O INSERT só pega se o risco ainda é aceitável e tem,
 * coluna a coluna, o conteúdo congelado (`conteudoJson`); o UPDATE só pega se a linha acabou de nascer. Com `guarda` (pedido), só pega
 * se a decisão do destinatário foi gravada no mesmo batch. Pedido de aceite aberto do mesmo risco é cancelado.
 */
export function stmtsDoAceite(db: D1Database, a: {
  projectId: string; riskId: string; email: string; userId: string | null; nome: string; papel: PapelAssinatura; em: string; conteudoJson: string; hash: string;
  justificativa: string | null; pedidoId: string | null; ip: string | null; ua: string | null;
  guarda?: { destId: string; status: string; decididoEm: string };
}): D1PreparedStatement[] {
  const id = genId();
  const ok = intacto('risco', 'd.', a.conteudoJson);
  const guarda = a.guarda ? ' AND EXISTS (SELECT 1 FROM pedido_destinatarios WHERE id = ? AND status = ? AND decidido_em = ?)' : '';
  return [
    // A alçada é conferida de novo AQUI, no mesmo statement: mudada entre a leitura e o batch (durante a senha), o aceite não grava.
    db.prepare(`INSERT INTO risco_aceites (id, project_id, risk_id, aceito_por, aceito_user_id, aceito_nome, papel, aceito_em, nivel_residual, estrategia, controles_json,
        conteudo_json, hash, justificativa, pedido_id, ip, user_agent, status_anterior)
      SELECT ?, r.project_id, r.id, ?, ?, ?, ?, ?, r.residual_level, r.treatment, CASE WHEN r.control_id IS NULL THEN '[]' ELSE json_array(r.control_id) END,
        ?, ?, ?, ?, ?, ?, COALESCE(r.status, 'Open')
        FROM risks r
       WHERE r.id = ? AND r.project_id = ?
         AND COALESCE((SELECT al.papel FROM risco_alcadas al WHERE al.project_id = r.project_id AND al.nivel = r.residual_level), 'ceo') = ?
         AND EXISTS (SELECT 1 FROM ${SQL_RISCO_ACEITAVEL} d WHERE d.id = r.id AND ${ok.sql})${guarda}`)
      .bind(id, a.email.toLowerCase(), a.userId, a.nome, a.papel, a.em, a.conteudoJson, a.hash, a.justificativa, a.pedidoId, a.ip, a.ua,
        a.riskId, a.projectId, a.papel, ...ok.binds, ...(a.guarda ? [a.guarda.destId, a.guarda.status, a.guarda.decididoEm] : [])),
    db.prepare(`UPDATE risks SET accepted_by = ?, accepted_at = ?, aceite_manual = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND EXISTS (SELECT 1 FROM risco_aceites WHERE id = ? AND situacao = 'vigente')`).bind(a.nome, a.em, a.riskId, id),
    db.prepare(`UPDATE pedidos SET status = 'cancelado' WHERE tipo = 'risco' AND ref_id = ? AND status = 'aberto' AND id IS NOT ?
        AND EXISTS (SELECT 1 FROM risco_aceites WHERE id = ?)`).bind(a.riskId, a.pedidoId, id),
  ];
}

/**
 * O aceite direto, no detalhe do risco: alçada, senha e o conteúdo que a tela mostrou (`hashVisto`). Um risco por chamada.
 */
export async function aceitarRisco(db: D1Database, user: Usuario, riskId: string,
  a: { senha: string; justificativa: string | null; hashVisto: string; ip: string | null; ua: string | null }): Promise<Resultado> {
  const risco = await db.prepare('SELECT id, project_id, status, residual_level FROM risks WHERE id = ?').bind(riskId).first<RiscoBase>();
  if (!risco) return { status: 404, corpo: { error: 'Risco não encontrado' } };
  const [alcadas, autoridade, vigente] = await Promise.all([alcadasDoProjeto(db, risco.project_id), autoridadeDeAssinatura(db, risco.project_id, user),
    temAceiteVigente(db, riskId)]);
  const recusa = recusaDoAceite(user, risco, vigente, alcadas, autoridade);
  if (recusa) return { status: 403, corpo: { error: recusa } };
  const conta = await db.prepare('SELECT password_hash, name FROM users WHERE id = ?').bind(user.id ?? '').first<{ password_hash: string; name: string | null }>();
  if (!conta || !(await verifyPassword(a.senha, conta.password_hash))) return { status: 401, corpo: { error: 'Senha incorreta' } };
  const senhaDeOutro = await recusaSenhaDeOutro(db, user.id);
  if (senhaDeOutro) return { status: 403, corpo: { error: senhaDeOutro } };

  const doc = await conteudoDoRisco(db, riskId, risco.project_id);
  const hash = doc ? await hashConteudo(doc.conteudo) : '';
  if (!doc || hash !== a.hashVisto) return { status: 409, corpo: { error: 'O risco mudou desde que você abriu; recarregue e confira de novo' } };

  const papel = alcadas[risco.residual_level as NivelRisco] ?? 'ceo';
  const nome = autoridade.nome || conta.name || user.email || '';
  const em = new Date().toISOString();
  const [ins] = await db.batch(stmtsDoAceite(db, {
    projectId: risco.project_id, riskId, email: user.email ?? '', userId: user.id ?? null, nome, papel, em, conteudoJson: JSON.stringify(doc.conteudo), hash,
    justificativa: a.justificativa, pedidoId: null, ip: a.ip, ua: a.ua,
  }));
  if (!ins.meta?.changes) return { status: 409, corpo: { error: 'O risco, a alçada ou o aceite mudaram enquanto você confirmava; recarregue' } };
  await logAudit(db, 'risk.aceite_residual', user.email ?? '',
    `Risco ${riskId}: risco residual ${risco.residual_level} aceito por ${nome} (${papel === 'ceo' ? 'Direção' : 'Líder SGSI'}); estado ${hash}`,
    a.justificativa ?? '', a.ip ?? '', risco.project_id);
  return { status: 200, corpo: { ok: true, aceito_por: nome, aceito_em: em, papel, hash } };
}

/** Quem aceitou: a conta (id), e o e-mail só para aceite gravado sem o id. O e-mail da conta pode mudar; o id não. */
const foiQuemAceitou = (a: Pick<AceiteRow, 'aceito_user_id' | 'aceito_por'>, user: Usuario) =>
  a.aceito_user_id ? a.aceito_user_id === user.id : a.aceito_por === (user.email ?? '').toLowerCase();

/** Só quem aceitou revoga o próprio aceite, com a senha e um motivo. O status do risco não muda; o carimbo sai. */
export async function revogarAceite(db: D1Database, user: Usuario, riskId: string, motivo: string, senha: string, ip: string | null): Promise<Resultado> {
  if (user.agente === true) return { status: 403, corpo: { error: 'Revogar aceite é ato de quem aceitou: o agente não revoga.' } };
  const row = await db.prepare(`SELECT a.*, r.project_id AS projeto FROM risco_aceites a JOIN risks r ON r.id = a.risk_id
      WHERE a.risk_id = ? AND a.situacao = 'vigente'`).bind(riskId).first<AceiteRow & { projeto: string }>();
  if (!row) return { status: 404, corpo: { error: 'Este risco não tem aceite vigente registrado com senha' } };
  if (!foiQuemAceitou(row, user)) return { status: 403, corpo: { error: 'Só quem aceitou o risco revoga o próprio aceite.' } };
  const conta = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id ?? '').first<{ password_hash: string }>();
  if (!conta || !(await verifyPassword(senha, conta.password_hash))) return { status: 401, corpo: { error: 'Senha incorreta' } };
  const em = new Date().toISOString();
  const [up] = await db.batch([
    db.prepare(`UPDATE risco_aceites SET situacao = 'revogado', encerrado_em = ?, encerrado_por = ?, motivo = ? WHERE id = ? AND situacao = 'vigente'`)
      .bind(em, (user.email ?? '').toLowerCase(), motivo, row.id),
    db.prepare(`UPDATE risks SET accepted_by = NULL, accepted_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND EXISTS (SELECT 1 FROM risco_aceites WHERE id = ? AND situacao = 'revogado')`).bind(riskId, row.id),
  ]);
  if (!up.meta?.changes) return { status: 409, corpo: { error: 'O aceite já não está vigente; recarregue' } };
  await logAudit(db, 'risk.aceite_revogado', user.email ?? '', `Risco ${riskId}: aceite de ${row.aceito_em} revogado por quem aceitou`, motivo, ip ?? '', row.projeto);
  return { status: 200, corpo: { ok: true, revogado_em: em } };
}

/**
 * Depois de qualquer escrita no risco: se o estado aceito mudou, o aceite vigente vira `invalidado` (com cada campo que mudou, valor
 * aceito -> novo) e o risco volta a "aceite pendente"; o status não muda. Sem aceite vigente, nada a fazer. Devolve se invalidou.
 */
export async function conferirAceite(db: D1Database, riskId: string, ator: string): Promise<boolean> {
  const row = await db.prepare(`SELECT id, conteudo_json, hash, project_id FROM risco_aceites WHERE risk_id = ? AND situacao = 'vigente'`).bind(riskId)
    .first<{ id: string; conteudo_json: string; hash: string; project_id: string }>();
  if (!row) return false;
  const doc = await conteudoDoRisco(db, riskId, row.project_id);
  if (doc && (await hashConteudo(doc.conteudo)) === row.hash) return false;
  const antes = JSON.parse(row.conteudo_json) as Record<string, unknown>;
  const valor = (v: unknown) => (v == null || v === '' ? 'vazio' : String(v));
  const mudou = doc ? Object.keys(doc.conteudo).filter((k) => (antes[k] ?? null) !== (doc.conteudo[k] ?? null))
    .map((k) => `${k}: ${valor(antes[k])} -> ${valor(doc.conteudo[k])}`) : [];
  const motivo = `O risco mudou depois do aceite${mudou.length ? ` (${mudou.join(', ')})` : ''}.`;
  const [up] = await db.batch([
    db.prepare(`UPDATE risco_aceites SET situacao = 'invalidado', encerrado_em = ?, encerrado_por = ?, motivo = ? WHERE id = ? AND situacao = 'vigente'`)
      .bind(new Date().toISOString(), ator, motivo, row.id),
    db.prepare(`UPDATE risks SET accepted_by = NULL, accepted_at = NULL WHERE id = ?
       AND EXISTS (SELECT 1 FROM risco_aceites WHERE id = ? AND situacao = 'invalidado')`).bind(riskId, row.id),
  ]);
  if (!up.meta?.changes) return false;
  await logAudit(db, 'risk.aceite_invalidado', ator, `Risco ${riskId}: aceite invalidado. ${motivo} Volta a aceite pendente.`, '', '', row.project_id);
  return true;
}

/**
 * `Accepted` não se grava pelo PUT/POST do risco: o aceite do residual é o ato com senha, e não muda o status. O resto do ciclo do
 * tratamento (Open, Mitigated, Closed) é livre e não derruba o aceite. Devolve a recusa, ou `null`. `novo` ausente: fora do corpo.
 */
export function recusaDoStatus(atual: string | null, novo: string | undefined): string | null {
  return novo === 'Accepted' && novo !== atual ? RECUSA_STATUS_ACEITO : null;
}

/**
 * Situação do aceite: aceito (linha vigente, ou o legado: status `Accepted` sem nenhuma linha), revogado (o último aceite foi revogado),
 * não se aplica (encerrado sem residual) ou pendente.
 */
export function situacaoDoAceite(r: Pick<RiscoBase, 'status' | 'residual_level'>, ultimo: Pick<AceiteRow, 'situacao'> | undefined): SituacaoAceite {
  // Legado só sem NENHUMA linha: legado aceito com senha e depois revogado/invalidado não volta a "aceito" pelo status.
  if (ultimo?.situacao === 'vigente' || (!ultimo && r.status === 'Accepted')) return 'aceito';
  if (r.status === 'Closed' && !r.residual_level) return 'nao_se_aplica';
  return ultimo?.situacao === 'revogado' ? 'revogado' : 'pendente';
}

/** O último aceite registrado de cada risco do projeto (vigente, invalidado ou revogado). */
export async function ultimosAceites(db: D1Database, projectId: string): Promise<Map<string, AceiteRow>> {
  const { results } = await db.prepare(`SELECT * FROM risco_aceites a WHERE a.project_id = ?
      AND a.aceito_em = (SELECT MAX(b.aceito_em) FROM risco_aceites b WHERE b.risk_id = a.risk_id)`).bind(projectId).all<AceiteRow>();
  return new Map(results.map((r) => [r.risk_id, r]));
}

/** O estado congelado do aceite; linha com conteúdo que não é JSON (dado corrompido) não derruba a lista. */
const estadoAceito = (json: string): Record<string, unknown> | null => {
  try { return JSON.parse(json) as Record<string, unknown>; } catch { return null; }
};

/**
 * O bloco `aceite` de cada risco na lista: situação, quem e quando (do aceite com senha ou do carimbo legado), o hash do estado que se
 * aceitaria agora e se ESTA pessoa pode aceitar ou revogar. `riscos` precisa de id, status, residual_level, accepted_by e accepted_at.
 */
export async function comAceite<T extends RiscoBase & { accepted_by?: string | null; accepted_at?: string | null; aceite_manual?: number | null }>(
  db: D1Database, user: Usuario, projectId: string, riscos: T[],
): Promise<(T & { aceite: Record<string, unknown> })[]> {
  if (!riscos.length) return [];
  const [ultimos, alcadas, autoridade] = await Promise.all([
    ultimosAceites(db, projectId), alcadasDoProjeto(db, projectId), autoridadeDeAssinatura(db, projectId, user),
  ]);
  const recusas = new Map(riscos.map((r) => [r.id, recusaDoAceite(user, r, ultimos.get(r.id)?.situacao === 'vigente', alcadas, autoridade)]));
  // O hash só vai para quem pode aceitar; uma consulta para o projeto inteiro, não uma por risco.
  const conteudos = [...recusas.values()].some((x) => x === null) ? await conteudosDosRiscos(db, projectId) : new Map<string, Record<string, unknown>>();
  return Promise.all(riscos.map(async (r) => {
    const u = ultimos.get(r.id);
    const situacao = situacaoDoAceite(r, u);
    const vigente = u?.situacao === 'vigente' ? u : undefined;
    const recusa = recusas.get(r.id) ?? null;
    const conteudo = !recusa ? conteudos.get(r.id) : undefined;
    return {
      ...r,
      aceite: {
        situacao,
        por: situacao === 'aceito' ? (vigente?.aceito_nome ?? r.accepted_by ?? null) : null,
        em: situacao === 'aceito' ? (vigente?.aceito_em ?? r.accepted_at ?? null) : null,
        com_senha: !!vigente,
        legado: situacao === 'aceito' && !vigente,
        papel: vigente?.papel ?? null,
        justificativa: vigente?.justificativa ?? null,
        revogado: situacao === 'revogado' ? { por: u!.encerrado_por, em: u!.encerrado_em, motivo: u!.motivo } : null,
        alcada: r.residual_level ? alcadas[r.residual_level as NivelRisco] ?? 'ceo' : null,
        pode_aceitar: !recusa,
        motivo_nao_aceita: motivoSemResidual(r),
        // Com aceite vigente: o hash e o estado que foram aceitos (a prova). Sem: o hash do estado atual, a quem pode aceitar (hash_visto).
        hash: vigente ? vigente.hash : conteudo ? await hashConteudo(conteudo) : null,
        estado_aceito: vigente ? estadoAceito(vigente.conteudo_json) : null,
        pode_revogar: !!vigente && foiQuemAceitou(vigente, user) && user.agente !== true,
      },
    };
  }));
}

/** As três colunas do aceite na exportação (CSV): situação, quem aceitou e quando (UTC). */
export const CABECALHO_ACEITE = ['Aceite do risco residual', 'Aceito por', 'Aceito em (UTC)'];
const ROTULO_ACEITE: Record<SituacaoAceite, string> = { aceito: 'Aceito', pendente: 'Aceite pendente', revogado: 'Aceite revogado', nao_se_aplica: 'Não se aplica' };
export function colunasDoAceite(r: Record<string, unknown>, ultimos: Map<string, AceiteRow>): unknown[] {
  const u = ultimos.get(String(r.id));
  const situacao = situacaoDoAceite({ status: (r.status as string | null) ?? null, residual_level: (r.residual_level as string | null) ?? null }, u);
  const vigente = u?.situacao === 'vigente' ? u : undefined;
  return situacao === 'aceito'
    ? [vigente ? ROTULO_ACEITE.aceito : 'Aceito (registro anterior, sem senha)', vigente?.aceito_nome ?? r.accepted_by ?? '', vigente?.aceito_em ?? r.accepted_at ?? '']
    : [ROTULO_ACEITE[situacao], '', ''];
}
