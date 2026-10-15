import { genToken, hashPassword, sha256Hex } from '../helpers';
import { appUrl } from '../config/url';

/**
 * Convite com link para criar a senha (decisão do dono, 15/10/2026; migration 0077). A conta nasce SEM senha utilizável
 * (`SEM_SENHA`: `verifyPassword` nunca casa com ele) e com `requires_password_change = 1`; o e-mail leva um link com o token no
 * FRAGMENTO (`/#convite=`), que a tela manda no CORPO do POST. Só o SHA-256 do token fica no banco, por 72 h. Reenviar substitui a
 * linha (o link anterior deixa de valer); usar apaga a linha no mesmo statement que a confere (uso único, sem corrida).
 */
export const SEM_SENHA = 'convite:sem-senha-local';
export const HORAS_CONVITE = 72;

/** Emite (ou reemite) o convite da conta e devolve o token em claro, só para o e-mail. */
export async function emitirConvite(db: D1Database, userId: string, por: string): Promise<string> {
  const token = genToken();
  await db.prepare(`INSERT OR REPLACE INTO convites_senha (user_id, token_hash, expira_em, criado_por, created_at)
      VALUES (?, ?, datetime('now', '+${HORAS_CONVITE} hours'), ?, datetime('now'))`).bind(userId, await sha256Hex(token), por).run();
  return token;
}

export const linkDoConvite = (env: { APP_URL?: string }, token: string) => `${appUrl(env)}/#convite=${token}`;

/**
 * Usa o convite: a senha nova vale e o primeiro acesso termina. Token desconhecido, vencido, já usado, substituído, de conta
 * desativada ou de conta de SSO/SCIM dão o MESMO null (sem dizer se a conta existe). O DELETE ... RETURNING consome o token
 * antes de qualquer outra coisa: duas chamadas com o mesmo token não passam as duas.
 */
export async function usarConvite(db: D1Database, token: string, senha: string): Promise<{ id: string; email: string } | null> {
  const hash = await sha256Hex(token);
  const linha = await db.prepare(`DELETE FROM convites_senha WHERE token_hash = ? AND datetime(expira_em) > datetime('now') RETURNING user_id`)
    .bind(hash).first<{ user_id: string }>();
  if (!linha) return null;
  const conta = await db.prepare(`SELECT id, email, password_hash FROM users WHERE id = ? AND COALESCE(ativo, 1) <> 0`)
    .bind(linha.user_id).first<{ id: string; email: string; password_hash: string }>();
  if (!conta || /^(sso|scim):/.test(conta.password_hash ?? '')) return null;
  const r = await db.prepare(`UPDATE users SET password_hash = ?, requires_password_change = 0 WHERE id = ? AND COALESCE(ativo, 1) <> 0`)
    .bind(await hashPassword(senha), conta.id).run();
  return r.meta.changes ? { id: conta.id, email: conta.email } : null;
}
