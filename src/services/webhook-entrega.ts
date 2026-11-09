// Entrega de eventos aos webhooks do projeto. A guarda de SSRF fica em routes/integrations (isValidWebhookUrl e resolveHostIsPublic);
// aqui só se monta, assina e envia.
import type { Bindings } from '../index';
import { signWebhook } from '../helpers';
import { isValidWebhookUrl, resolveHostIsPublic } from '../routes/integrations';

export interface WebhookAlvo { id: string; project_id: string; url: string; secret: string | null }

export type ResultadoEnvio =
  | { tipo: 'url_invalida' }
  | { tipo: 'host_interno' }
  | { tipo: 'resposta'; resp: Response }
  | { tipo: 'erro'; erro: unknown };

/** Receptor pendurado não segura a tentativa (nem o waitUntil): estoura, vira erro e conta como falha. */
export const TEMPO_LIMITE_MS = 5000;

/** Uma tentativa: guarda de SSRF, corpo assinado e POST. Não toca no banco nem lança. */
export async function enviarUmaVez(webhook: WebhookAlvo, corpo: string, fetchFn: typeof fetch = fetch, tempoLimiteMs = TEMPO_LIMITE_MS): Promise<ResultadoEnvio> {
  if (!isValidWebhookUrl(webhook.url)) return { tipo: 'url_invalida' };
  // S8: resolve o host IMEDIATAMENTE antes de disparar — se o DNS foi apontado
  // para um IP interno depois da criação (rebinding), barra aqui.
  if (!(await resolveHostIsPublic(new URL(webhook.url).hostname, fetchFn))) return { tipo: 'host_interno' };
  try {
    const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' };
    // Webhook antigo pode não ter segredo (a coluna aceitava ''); nesse caso
    // segue sem assinatura em vez de quebrar a integração existente.
    if (webhook.secret) cabecalhos['X-nISO-Signature'] = await signWebhook(webhook.secret, corpo);
    // redirect manual: seguir levaria a um host que o DoH não viu. O 3xx volta como resposta não-2xx (falha na entrega).
    return { tipo: 'resposta', resp: await fetchFn(webhook.url, { method: 'POST', headers: cabecalhos, body: corpo, redirect: 'manual', signal: AbortSignal.timeout(tempoLimiteMs) }) };
  } catch (erro) {
    return { tipo: 'erro', erro };
  }
}

/** Corpo comum dos eventos: o do chamador mais os campos de envelope, que prevalecem. */
export const montarCorpo = (projectId: string, evento: string, corpo: Record<string, unknown> = {}) =>
  JSON.stringify({ ...corpo, event: evento, event_id: crypto.randomUUID(), project_id: projectId, timestamp: new Date().toISOString() });

/**
 * Entrega `evento` a cada webhook `Active` do projeto que o assina LITERALMENTE (`events` separado por vírgula; sem curinga).
 * Até `tentativas` por webhook, esperando `esperas[i]` ms antes da tentativa i. Sucesso grava `last_triggered_at`; esgotar soma
 * `failure_count`. Nunca lança: quem chama (a sonda, uma ação na tela) não pode falhar por causa do destino.
 */
export async function entregarEvento(
  env: Bindings,
  projectId: string,
  evento: string,
  corpo: Record<string, unknown>,
  opcoes: { tentativas?: number; esperas?: number[]; fetchFn?: typeof fetch; tempoLimiteMs?: number } = {},
): Promise<{ entregues: number; falhas: number }> {
  const { tentativas = 3, esperas = [0, 2000, 10000], fetchFn = fetch, tempoLimiteMs = TEMPO_LIMITE_MS } = opcoes;
  let entregues = 0, falhas = 0;
  try {
    // LIKE só pré-filtra (o `_` é curinga lá); a comparação exata é a de baixo. shortcut: LIMIT 500, nenhum projeto chega perto.
    const { results } = await env.DB.prepare(
      `SELECT id, project_id, url, secret, events FROM webhooks WHERE project_id = ? AND status = 'Active' AND events LIKE ? LIMIT 500`,
    ).bind(projectId, `%${evento}%`).all<WebhookAlvo & { events: string }>();
    const alvos = results.filter(w => w.events.split(',').map(e => e.trim()).includes(evento));
    await Promise.all(alvos.map(async (w) => {
      const texto = montarCorpo(projectId, evento, corpo); // mesmo event_id nas novas tentativas: o receptor deduplica
      let ok = false;
      for (let i = 0; i < tentativas && !ok; i++) {
        if (esperas[i]) await new Promise(r => setTimeout(r, esperas[i]));
        const r = await enviarUmaVez(w, texto, fetchFn, tempoLimiteMs);
        if (r.tipo === 'url_invalida') break;
        ok = r.tipo === 'resposta' && r.resp.ok; // 3xx não é ok: com redirect manual, nunca chega ao Location
      }
      try {
        if (ok) await env.DB.prepare('UPDATE webhooks SET last_triggered_at = ? WHERE id = ?').bind(new Date().toISOString(), w.id).run();
        else await env.DB.prepare('UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?').bind(w.id).run();
      } catch (e) {
        console.error('webhook: falha ao registrar a entrega', w.id, e);
      }
      if (ok) entregues++; else falhas++;
    }));
  } catch (e) {
    console.error('webhook: falha ao entregar', evento, e);
  }
  return { entregues, falhas };
}
