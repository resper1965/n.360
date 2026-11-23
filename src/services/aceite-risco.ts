/**
 * Aceite do risco residual (ISO/IEC 27001, 6.1.3 e; migration 0120).
 *
 * O aceite é um ato de quem tem a alçada do nível residual (Direção por padrão; `risco_alcadas` muda por nível), com a senha da
 * pessoa, um risco por vez. Ele congela o estado do risco (as colunas de `COLUNAS_RISCO`, o mesmo conteúdo do pedido de aceite) e
 * grava em `risco_aceites`: aceitante, data e hora UTC, nível residual, estratégia, controles, justificativa, hash. O risco fica
 * `Accepted`, carimbado pelo servidor.
 *
 * Mudar o que foi aceito (notas, residual, estratégia, plano ou controle) invalida o aceite sozinho (`conferirAceite`): a linha vira
 * `invalidado` com os campos que mudaram e o risco volta ao status que tinha antes do aceite ("aceite pendente"). Só o próprio
 * aceitante revoga, com motivo. Status `Accepted` não se grava pelo PUT do risco: só por aqui (`recusaDoStatus`).
 *
 * Risco aceito antes da 0120 (status `Accepted` sem linha aqui) segue como está: aparece aceito, sem senha registrada.
 */
import { genId, logAudit, verifyPassword, autoridadeDeAssinatura, recusaDeAssinatura, recusaSenhaDeOutro, type PapelAssinatura } from '../helpers';
import { conteudoDoRisco, hashConteudo, intacto, SQL_RISCO_ACEITAVEL } from './pedidos';

export const NIVEIS_RISCO = ['Low', 'Medium', 'High', 'Critical'] as const;
export type NivelRisco = (typeof NIVEIS_RISCO)[number];
export type Alcadas = Record<NivelRisco, PapelAssinatura>;
export type SituacaoAceite = 'aceito' | 'pendente' | 'revogado';

export const RECUSA_STATUS_ACEITO = 'O aceite do risco residual é feito pela ação "Aceitar risco residual", com a senha de quem tem a alçada.';
export const RECUSA_SAIR_DO_ACEITE = 'Este risco tem aceite registrado com senha: quem aceitou o revoga, com motivo. O status não muda por aqui.';

type Usuario = { id?: string; email?: string; role?: string; agente?: boolean };
type Resultado = { status: number; corpo: Record<string, unknown> };
export type RiscoBase = { id: string; project_id: string; status: string | null; residual_level: string | null };
export type AceiteRow = {
  id: string; risk_id: string; aceito_por: string; aceito_nome: string | null; papel: PapelAssinatura; aceito_em: string; nivel_residual: string;
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

/** Por que esta pessoa não aceita este risco agora, ou `null` se aceita. `autoridade` lida uma vez por requisição. */
export function recusaDoAceite(
  user: Usuario, risco: Pick<RiscoBase, 'status' | 'residual_level'>, alcadas: Alcadas, autoridade: Awaited<ReturnType<typeof autoridadeDeAssinatura>>,
): string | null {
  if (user.agente === true) return 'Aceitar risco é ato da pessoa com a alçada, com a senha dela: o agente não aceita.';
  if (risco.status === 'Accepted') return 'Este risco já está aceito.';
  if (risco.status === 'Closed') return 'Risco encerrado não é aceito.';
  if (!risco.residual_level) return 'Avalie o risco residual (impacto e probabilidade residuais) antes do aceite.';
  return recusaDeAssinatura(autoridade, alcadas[risco.residual_level as NivelRisco] ?? 'ceo');
}

/**
 * Statements do aceite (para um `batch`): a linha da prova e o risco `Accepted`. O INSERT só pega se o risco ainda é aceitável e tem,
 * coluna a coluna, o conteúdo congelado (`conteudoJson`); o UPDATE só pega se a linha acabou de nascer. Com `guarda` (pedido), só pega
 * se a decisão do destinatário foi gravada no mesmo batch. Pedido de aceite aberto do mesmo risco é cancelado.
 */
export function stmtsDoAceite(db: D1Database, a: {
  projectId: string; riskId: string; email: string; nome: string; papel: PapelAssinatura; em: string; conteudoJson: string; hash: string;
  justificativa: string | null; pedidoId: string | null; ip: string | null; ua: string | null;
  guarda?: { destId: string; status: string; decididoEm: string };
}): D1PreparedStatement[] {
  const id = genId();
  const ok = intacto('risco', 'd.', a.conteudoJson);
  const guarda = a.guarda ? ' AND EXISTS (SELECT 1 FROM pedido_destinatarios WHERE id = ? AND status = ? AND decidido_em = ?)' : '';
  return [
    db.prepare(`INSERT INTO risco_aceites (id, project_id, risk_id, aceito_por, aceito_nome, papel, aceito_em, nivel_residual, estrategia, controles_json,
        conteudo_json, hash, justificativa, pedido_id, ip, user_agent, status_anterior)
      SELECT ?, r.project_id, r.id, ?, ?, ?, ?, r.residual_level, r.treatment, CASE WHEN r.control_id IS NULL THEN '[]' ELSE json_array(r.control_id) END,
        ?, ?, ?, ?, ?, ?, COALESCE(r.status, 'Open')
        FROM risks r
       WHERE r.id = ? AND r.project_id = ?
         AND EXISTS (SELECT 1 FROM ${SQL_RISCO_ACEITAVEL} d WHERE d.id = r.id AND ${ok.sql})${guarda}`)
      .bind(id, a.email.toLowerCase(), a.nome, a.papel, a.em, a.conteudoJson, a.hash, a.justificativa, a.pedidoId, a.ip, a.ua,
        a.riskId, a.projectId, ...ok.binds, ...(a.guarda ? [a.guarda.destId, a.guarda.status, a.guarda.decididoEm] : [])),
    db.prepare(`UPDATE risks SET status = 'Accepted', accepted_by = ?, accepted_at = ?, aceite_manual = 0, updated_at = CURRENT_TIMESTAMP
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
  const [alcadas, autoridade] = await Promise.all([alcadasDoProjeto(db, risco.project_id), autoridadeDeAssinatura(db, risco.project_id, user)]);
  const recusa = recusaDoAceite(user, risco, alcadas, autoridade);
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
    projectId: risco.project_id, riskId, email: user.email ?? '', nome, papel, em, conteudoJson: JSON.stringify(doc.conteudo), hash,
    justificativa: a.justificativa, pedidoId: null, ip: a.ip, ua: a.ua,
  }));
  if (!ins.meta?.changes) return { status: 409, corpo: { error: 'O risco mudou ou já foi aceito; recarregue' } };
  await logAudit(db, 'risk.aceite_residual', user.email ?? '',
    `Risco ${riskId}: risco residual ${risco.residual_level} aceito por ${nome} (${papel === 'ceo' ? 'Direção' : 'Líder SGSI'}); estado ${hash}`,
    a.justificativa ?? '', a.ip ?? '', risco.project_id);
  return { status: 200, corpo: { ok: true, aceito_por: nome, aceito_em: em, papel, hash } };
}

/** Só quem aceitou revoga o próprio aceite, com motivo. O risco volta ao status de antes do aceite. */
export async function revogarAceite(db: D1Database, user: Usuario, riskId: string, motivo: string, ip: string | null): Promise<Resultado> {
  if (user.agente === true) return { status: 403, corpo: { error: 'Revogar aceite é ato de quem aceitou: o agente não revoga.' } };
  const row = await db.prepare(`SELECT a.*, r.project_id AS projeto FROM risco_aceites a JOIN risks r ON r.id = a.risk_id
      WHERE a.risk_id = ? AND a.situacao = 'vigente'`).bind(riskId).first<AceiteRow & { projeto: string }>();
  if (!row) return { status: 404, corpo: { error: 'Este risco não tem aceite vigente registrado com senha' } };
  if (row.aceito_por !== (user.email ?? '').toLowerCase()) return { status: 403, corpo: { error: 'Só quem aceitou o risco revoga o próprio aceite.' } };
  const em = new Date().toISOString();
  const [up] = await db.batch([
    db.prepare(`UPDATE risco_aceites SET situacao = 'revogado', encerrado_em = ?, encerrado_por = ?, motivo = ? WHERE id = ? AND situacao = 'vigente'`)
      .bind(em, (user.email ?? '').toLowerCase(), motivo, row.id),
    db.prepare(`UPDATE risks SET status = ?, accepted_by = NULL, accepted_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND EXISTS (SELECT 1 FROM risco_aceites WHERE id = ? AND situacao = 'revogado')`).bind(row.status_anterior ?? 'Open', riskId, row.id),
  ]);
  if (!up.meta?.changes) return { status: 409, corpo: { error: 'O aceite já não está vigente; recarregue' } };
  await logAudit(db, 'risk.aceite_revogado', user.email ?? '', `Risco ${riskId}: aceite de ${row.aceito_em} revogado por quem aceitou`, motivo, ip ?? '', row.projeto);
  return { status: 200, corpo: { ok: true, revogado_em: em } };
}

/**
 * Depois de qualquer escrita no risco: se o estado aceito mudou, o aceite vigente vira `invalidado` (com os campos que mudaram) e o
 * risco volta ao status de antes do aceite. Sem aceite vigente, nada a fazer. Devolve se invalidou.
 */
export async function conferirAceite(db: D1Database, riskId: string, ator: string): Promise<boolean> {
  const row = await db.prepare(`SELECT a.id, a.conteudo_json, a.hash, a.status_anterior, a.project_id, r.status FROM risco_aceites a JOIN risks r ON r.id = a.risk_id
      WHERE a.risk_id = ? AND a.situacao = 'vigente'`).bind(riskId)
    .first<{ id: string; conteudo_json: string; hash: string; status_anterior: string | null; project_id: string; status: string | null }>();
  if (!row) return false;
  const doc = await conteudoDoRisco(db, riskId, row.project_id);
  if (doc && row.status === 'Accepted' && (await hashConteudo(doc.conteudo)) === row.hash) return false;
  const antes = JSON.parse(row.conteudo_json) as Record<string, unknown>;
  const mudou = doc ? Object.keys(doc.conteudo).filter((k) => (antes[k] ?? null) !== (doc.conteudo[k] ?? null)) : [];
  const motivo = `O risco mudou depois do aceite${mudou.length ? ` (${mudou.join(', ')})` : ''}.`;
  const [up] = await db.batch([
    db.prepare(`UPDATE risco_aceites SET situacao = 'invalidado', encerrado_em = ?, encerrado_por = ?, motivo = ? WHERE id = ? AND situacao = 'vigente'`)
      .bind(new Date().toISOString(), ator, motivo, row.id),
    db.prepare(`UPDATE risks SET status = ?, accepted_by = NULL, accepted_at = NULL WHERE id = ?
       AND EXISTS (SELECT 1 FROM risco_aceites WHERE id = ? AND situacao = 'invalidado')`).bind(row.status_anterior ?? 'Open', riskId, row.id),
  ]);
  if (!up.meta?.changes) return false;
  await logAudit(db, 'risk.aceite_invalidado', ator, `Risco ${riskId}: aceite invalidado. ${motivo} Volta a aceite pendente.`, '', '', row.project_id);
  return true;
}

/**
 * `Accepted` não se grava pelo PUT/POST do risco (só o aceite com senha), e o risco com aceite vigente não sai de `Accepted` por status
 * (revogar é de quem aceitou). Devolve a recusa, ou `null`. `novo` ausente: o status não está no corpo.
 */
export async function recusaDoStatus(db: D1Database, riskId: string | null, atual: string | null, novo: string | undefined): Promise<string | null> {
  if (novo === undefined || novo === atual) return null;
  if (novo === 'Accepted') return RECUSA_STATUS_ACEITO;
  if (atual === 'Accepted' && riskId) {
    const vigente = await db.prepare(`SELECT 1 FROM risco_aceites WHERE risk_id = ? AND situacao = 'vigente'`).bind(riskId).first();
    if (vigente) return RECUSA_SAIR_DO_ACEITE;
  }
  return null;
}

/** Situação do aceite para a lista: aceito (vigente ou legado), revogado (o último aceite foi revogado) ou pendente. */
export function situacaoDoAceite(status: string | null, ultimo: Pick<AceiteRow, 'situacao'> | undefined): SituacaoAceite {
  if (status === 'Accepted') return 'aceito';
  return ultimo?.situacao === 'revogado' ? 'revogado' : 'pendente';
}

/** O último aceite registrado de cada risco do projeto (vigente, invalidado ou revogado). */
export async function ultimosAceites(db: D1Database, projectId: string): Promise<Map<string, AceiteRow>> {
  const { results } = await db.prepare(`SELECT * FROM risco_aceites a WHERE a.project_id = ?
      AND a.aceito_em = (SELECT MAX(b.aceito_em) FROM risco_aceites b WHERE b.risk_id = a.risk_id)`).bind(projectId).all<AceiteRow>();
  return new Map(results.map((r) => [r.risk_id, r]));
}

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
  const email = (user.email ?? '').toLowerCase();
  return Promise.all(riscos.map(async (r) => {
    const u = ultimos.get(r.id);
    const situacao = situacaoDoAceite(r.status, u);
    const vigente = u?.situacao === 'vigente' ? u : undefined;
    const recusa = recusaDoAceite(user, r, alcadas, autoridade);
    const doc = !recusa ? await conteudoDoRisco(db, r.id, projectId) : null;
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
        hash: doc ? await hashConteudo(doc.conteudo) : null,
        pode_revogar: !!vigente && vigente.aceito_por === email && user.agente !== true,
      },
    };
  }));
}

/** As três colunas do aceite na exportação (CSV): situação, quem aceitou e quando (UTC). */
export const CABECALHO_ACEITE = ['Aceite do risco residual', 'Aceito por', 'Aceito em (UTC)'];
const ROTULO_ACEITE: Record<SituacaoAceite, string> = { aceito: 'Aceito', pendente: 'Aceite pendente', revogado: 'Aceite revogado' };
export function colunasDoAceite(r: Record<string, unknown>, ultimos: Map<string, AceiteRow>): unknown[] {
  const u = ultimos.get(String(r.id));
  const situacao = situacaoDoAceite((r.status as string | null) ?? null, u);
  const vigente = u?.situacao === 'vigente' ? u : undefined;
  return situacao === 'aceito'
    ? [vigente ? ROTULO_ACEITE.aceito : 'Aceito (registro anterior, sem senha)', vigente?.aceito_nome ?? r.accepted_by ?? '', vigente?.aceito_em ?? r.accepted_at ?? '']
    : [ROTULO_ACEITE[situacao], '', ''];
}
