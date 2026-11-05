import { genId, sha256Hex } from '../helpers';

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

/** em dia ≤ 26 h; atrasada até 72 h; parada acima disso ou sem credencial ativa e válida. Sonda que nunca enviou fica atrasada (o cron usa a data de criação). */
export function situacaoSensor(ultimoEnvio: string | null, credenciais: Cred[], agora: Date): 'em_dia' | 'atrasada' | 'parada' {
  if (!validas(credenciais, agora).length) return 'parada';
  if (!ultimoEnvio) return 'atrasada';
  const h = (agora.getTime() - ms(ultimoEnvio)) / HORA;
  return h <= 26 ? 'em_dia' : h <= 72 ? 'atrasada' : 'parada';
}

/** Alguma credencial ativa vence em até 30 dias. */
export const vencendo = (credenciais: Cred[], agora: Date): boolean =>
  validas(credenciais, agora).some((c) => ms(c.expira_em) - agora.getTime() <= 30 * 24 * HORA);
