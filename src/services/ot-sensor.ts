import { genId, logAudit, sendEmail, sha256Hex } from '../helpers';
import { montarEmail } from './email-layout';
import { TETO_LEITURA_OT } from './ot-inventario';
import { CARGO_GESTOR_ARCIBER } from './ot-conformidade';
import { modulosDoProjeto } from '../modulos';
import { ERRO_ORIGEM, ipPermitido, politicaDoProjeto } from '../politica-tenant';
import { chavesOt } from './ot-cifra';
import { ipNaFaixa } from './ot-rede';
import type { Bindings } from '../index';

/** Sonda de rede do n.ot (plano 2026-11-05): cadastro e credenciais próprias (`ots_`), válidas só em `/ot-sensor/resumo`. */
export const VALIDADE_SENSOR_DIAS = 365;
export const TETO_CREDENCIAIS_ATIVAS = 2;

/** Recusa de uma operação da sonda: a mensagem vai ao usuário como está (texto fixo, sem dado). */
export class RecusaSensor extends Error {}

/** Emite a credencial; o texto só sai aqui (no banco fica o SHA-256). A trilha é gravada pela rota. */
export async function emitirCredencialSensor(db: D1Database, projectId: string, sensorId: string): Promise<{ id: string; credencial: string; expira_em: string }> {
  const id = genId();
  const credencial = 'ots_' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const expira_em = new Date(Date.now() + VALIDADE_SENSOR_DIAS * 86_400_000).toISOString();
  // O teto vai no próprio INSERT, para duas emissões simultâneas não passarem de 2.
  const r = await db.prepare(`INSERT INTO ot_sensor_credenciais (id, sensor_id, project_id, chave_hash, expira_em)
    SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM ot_sensor_credenciais WHERE sensor_id = ? AND project_id = ? AND situacao = 'ativa' AND expira_em > ?) < ${TETO_CREDENCIAIS_ATIVAS}`)
    .bind(id, sensorId, projectId, await sha256Hex(credencial), expira_em, sensorId, projectId, new Date().toISOString()).run();
  if (!r.meta.changes) throw new RecusaSensor('Esta sonda já tem duas credenciais ativas');
  return { id, credencial, expira_em };
}

type Cred = { expira_em: string; situacao: string };
const HORA = 3_600_000;
// D1 grava `created_at` como 'AAAA-MM-DD HH:MM:SS' (UTC, sem fuso); a credencial, como ISO.
const ms = (s: string) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z').getTime();
const validas = (cs: Cred[], agora: Date) => cs.filter((c) => c.situacao === 'ativa' && ms(c.expira_em) > agora.getTime());

/** `referencia` = último envio concluído, ou a criação da sonda se ainda não enviou.
 *  Em dia ≤ 26 h; atrasada até 72 h; parada acima disso ou sem credencial ativa e válida. */
export function situacaoSensor(referencia: string, credenciais: Cred[], agora: Date): 'em_dia' | 'atrasada' | 'parada' {
  if (!validas(credenciais, agora).length) return 'parada';
  const h = (agora.getTime() - ms(referencia)) / HORA;
  return h <= 26 ? 'em_dia' : h <= 72 ? 'atrasada' : 'parada';
}

/** A credencial ativa que vence por último vence em até 30 dias (renovar limpa o aviso). */
export const vencendo = (credenciais: Cred[], agora: Date): boolean => {
  const v = validas(credenciais, agora);
  return v.length > 0 && Math.max(...v.map((c) => ms(c.expira_em))) - agora.getTime() <= 30 * 24 * HORA;
};

export interface SensorAutenticado { id: string; nome: string; projectId: string; siteId: string }

/** Falha fechada, a cada envio: credencial `ots_` ativa e não vencida de sonda ativa (401); projeto com o n.ot (403); IP de
 *  `CF-Connecting-IP`, e só dele, dentro da `faixa_origem` (403, também sem faixa) e na allowlist do projeto (403); chaves do n.ot (503). */
export async function autenticarSensor(env: Bindings, req: Request): Promise<{ ok: true; sensor: SensorAutenticado } | { ok: false; status: 401 | 403 | 503; error: string }> {
  const auth = req.headers.get('Authorization') ?? '';
  const texto = auth.startsWith('Bearer ots_') ? auth.slice(7).trim() : '';
  const s = texto ? await env.DB.prepare(`SELECT s.id, s.nome, s.project_id, s.site_id, s.faixa_origem FROM ot_sensor_credenciais k
      JOIN ot_sensores s ON s.id = k.sensor_id AND s.project_id = k.project_id
    WHERE k.chave_hash = ? AND k.situacao = 'ativa' AND k.expira_em > ? AND s.situacao = 'ativa'`)
    .bind(await sha256Hex(texto), new Date().toISOString()).first<{ id: string; nome: string; project_id: string; site_id: string; faixa_origem: string }>() : null;
  if (!s) return { ok: false, status: 401, error: 'Credencial da sonda inválida, revogada ou vencida' };
  if (!(await modulosDoProjeto(env.DB, s.project_id)).includes('ot')) return { ok: false, status: 403, error: 'n.ot desligado neste projeto' };
  const ip = req.headers.get('CF-Connecting-IP'); // #549: nunca X-Forwarded-For
  if (!ip || !s.faixa_origem || !ipNaFaixa(ip, s.faixa_origem)) return { ok: false, status: 403, error: 'Origem fora da faixa cadastrada para esta sonda' };
  const politica = await politicaDoProjeto(env, s.project_id);
  if (politica && !ipPermitido(ip, politica.ip_allowlist)) return { ok: false, status: 403, error: ERRO_ORIGEM };
  if (!chavesOt(env)) return { ok: false, status: 503, error: 'Inventário de ativos indisponível: as chaves do n.ot não estão configuradas' };
  return { ok: true, sensor: { id: s.id, nome: s.nome, projectId: s.project_id, siteId: s.site_id } };
}

/** Cron diário: conta sondas ativas atrasadas/paradas, grava a trilha (só contagem) e avisa o Gestor ARCiber de cada parada.
 *  O e-mail leva só o nome da sonda e do site; nunca IP, faixa ou credencial. */
export async function avisarSensores(env: Bindings, agora: Date): Promise<{ atrasadas: number; paradas: number; emails: number }> {
  const { results: sondas } = await env.DB.prepare(`SELECT s.id, s.nome, s.project_id, st.nome AS site, s.created_at,
      (SELECT created_at FROM ot_sensor_envios e WHERE e.sensor_id = s.id AND e.situacao = 'concluido' ORDER BY e.created_at DESC LIMIT 1) AS ultimo_envio
    FROM ot_sensores s JOIN ot_sites st ON st.id = s.site_id AND st.project_id = s.project_id WHERE s.situacao = 'ativa'
      AND EXISTS (SELECT 1 FROM projeto_modulos m WHERE m.project_id = s.project_id AND m.modulo = 'ot') LIMIT ${TETO_LEITURA_OT}`)
    .all<{ id: string; nome: string; project_id: string; site: string; created_at: string; ultimo_envio: string | null }>();
  const { results: creds } = await env.DB.prepare(`SELECT sensor_id, expira_em, situacao FROM ot_sensor_credenciais WHERE situacao = 'ativa'
    AND expira_em > ? LIMIT ${TETO_LEITURA_OT}`).bind(agora.toISOString()).all<Cred & { sensor_id: string }>(); // vencida não ocupa o LIMIT; sem válida segue parada
  const out = { atrasadas: 0, paradas: 0, emails: 0 };
  const paradas: typeof sondas = [];
  for (const s of sondas) {
    const sit = situacaoSensor(s.ultimo_envio ?? s.created_at, creds.filter((k) => k.sensor_id === s.id), agora);
    if (sit === 'atrasada') out.atrasadas++;
    else if (sit === 'parada') { out.paradas++; paradas.push(s); }
  }
  if (out.atrasadas || out.paradas) await logAudit(env.DB, 'ot.sensor.atrasado', 'sistema', `Sondas atrasadas: ${out.atrasadas}; paradas: ${out.paradas}`);
  for (const s of paradas) {
    const { results: gestores } = await env.DB.prepare(`SELECT email FROM project_governance WHERE project_id = ? AND ${CARGO_GESTOR_ARCIBER} AND coalesce(trim(email), '') <> '' ORDER BY is_primary DESC LIMIT ${TETO_LEITURA_OT}`).bind(s.project_id).all<{ email: string }>();
    const assunto = `n.ot: a sonda ${s.nome} está parada`;
    const corpo = montarEmail({
      assunto, titulo: 'Sonda parada', saudacao: 'Olá,',
      paragrafos: [`A sonda ${s.nome}, do site ${s.site}, não envia resumos há mais de 72 horas ou está sem credencial válida.`],
      acao: 'Abrir o n.ot, conferir a sonda e renovar a credencial se for preciso',
      motivo: 'você é Gestor ARCiber de um projeto com o n.ot.',
    });
    for (const g of gestores) if (await sendEmail({ env }, g.email, assunto, corpo)) out.emails++;
  }
  return out;
}
