import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { createNotification, enviarEmail, logAudit, rateLimitD1 } from '../helpers';
import { CARGO_GESTOR_ARCIBER } from './ot-conformidade';
import { appUrl } from '../config/url';
import { emailAvisoOtSensivel } from './emails';
import { pessoasDoProjeto } from './avisos-prazo';

// Modelo de ameaças do n.ot, P1-1: revelar IP/MAC e exportar o inventário exigem TOTP do n.360 confirmado há no máximo 10 min
// (mesmo com SSO: o IdP do cliente não é o segundo fator do n.360), justificativa, teto por hora e aviso ao Gestor ARCiber.

type C = Context<{ Bindings: Bindings; Variables: Variables }>;
export type AcaoSensivel = 'revelar' | 'exportar';

/** Janela do step-up: o carimbo `totp_em` da sessão vem de /auth/mfa/verify (routes/mfa.ts). */
export const STEPUP_MS = 10 * 60_000;

/**
 * Tetos por hora. Revelar é por ativo (um técnico em campo confere alguns por turno): 20 por pessoa. Exportar é por site e já traz o
 * site inteiro: 5 por pessoa. O teto do projeto (3x o da pessoa) limita o vazamento quando várias contas do mesmo cliente caem juntas.
 */
export const TETOS_OT = {
  revelar: { pessoa: 20, projeto: 60 },
  exportar: { pessoa: 5, projeto: 15 },
} as const;

/** 403 `totp_necessario` sem TOTP confirmado nos últimos 10 min; `totp_ativo` diz se a conta precisa ativar o MFA antes. */
export async function semStepUp(c: C): Promise<Response | null> {
  const user = c.get('user');
  if (typeof user.totp_em === 'number' && Date.now() - user.totp_em <= STEPUP_MS) return null;
  const l = await c.env.DB.prepare('SELECT totp_enabled FROM users WHERE id = ?').bind(user.id).first<{ totp_enabled: number | null }>();
  const ativo = l?.totp_enabled === 1;
  return c.json({
    error: ativo ? 'Confirme o código do seu autenticador (TOTP) para continuar: esta ação pede confirmação a cada 10 minutos'
      : 'Esta ação exige o segundo fator (TOTP) do n.360: ative-o no seu perfil e tente de novo',
    codigo: 'totp_necessario', totp_ativo: ativo,
  }, 403);
}

/** 429 `teto_por_hora` quando a pessoa ou o projeto passou do teto. Conta a tentativa (janela fixa de 1 h, `rateLimitD1`). */
export async function tetoEstourado(c: C, acao: AcaoSensivel, projectId: string): Promise<Response | null> {
  const t = TETOS_OT[acao];
  const db = c.env.DB;
  if (await rateLimitD1(db, `ot:${acao}:pessoa:${c.get('user').id}`, t.pessoa, 3600)
    && await rateLimitD1(db, `ot:${acao}:projeto:${projectId}`, t.projeto, 3600)) return null;
  const nome = acao === 'revelar' ? `revelações de IP/MAC (${t.pessoa} por pessoa e ${t.projeto} por projeto)` : `exportações (${t.pessoa} por pessoa e ${t.projeto} por projeto)`;
  return c.json({ error: `Limite por hora atingido: ${nome}. Tente de novo mais tarde.`, codigo: 'teto_por_hora' }, 429);
}

/**
 * Aviso ao Gestor ARCiber do projeto (titular e suplente em `project_governance`, cargo "Gestor ARCiber"): no sino (`notifications`) de
 * quem tem conta que alcança o projeto (a regra de `pessoasDoProjeto`) e por e-mail ao endereço cadastrado na governança. O texto leva
 * quem, o quê e a justificativa (que recusa IP/MAC), nunca IP, MAC nem nome de ativo (P1-7). Devolve quantos gestores foram avisados.
 * Falha aberta por decisão (a ação não espera o aviso), mas nunca em silêncio: sem gestor cadastrado ou com e-mail que não saiu, a trilha
 * registra `ot.aviso_gestor` com `aviso_gestor: nenhum | falhou`.
 */
export async function avisarGestorArciber(c: C, projectId: string, oQue: string, justificativa: string): Promise<number> {
  const db = c.env.DB;
  const { results: gestores } = await db.prepare(`SELECT name, email FROM project_governance
    WHERE project_id = ? AND ${CARGO_GESTOR_ARCIBER} AND coalesce(trim(email), '') <> '' ORDER BY is_primary DESC`)
    .bind(projectId).all<{ name: string; email: string }>();
  const quem = c.get('user').email;
  const registrar = (como: 'nenhum' | 'falhou') => logAudit(db, 'ot.aviso_gestor', quem, `aviso_gestor: ${como} (${quem} ${oQue})`, justificativa,
    c.req.header('CF-Connecting-IP') ?? '', projectId);
  if (!gestores.length) { await registrar('nenhum'); return 0; }
  const titulo = 'n.ot: revelação ou exportação do inventário de OT';
  const mensagem = `${quem} ${oQue}. Justificativa: ${justificativa}`;
  const contas = await pessoasDoProjeto(db, projectId);
  const email = emailAvisoOtSensivel({ quem, oQue, justificativa, url: appUrl(c.env) });
  let falhas = 0;
  for (const g of gestores) {
    for (const p of contas.filter((x) => x.email.toLowerCase() === g.email.trim().toLowerCase())) {
      await createNotification(db, 'ot_acesso_sensivel', titulo, mensagem, p.id, `/projects/${projectId}/ot`);
    }
    if (!(await enviarEmail(c.env, g.email.trim(), email.assunto, email))) falhas++;
  }
  if (falhas) await registrar('falhou');
  return gestores.length;
}
