// Página do fornecedor (homologação por questionário, F5). Sem sessão, na internet: a credencial é o token do link, que chega
// no CORPO (nunca no caminho nem na query, que vão para o log de requisição) e é procurado pelo SHA-256 (homologacaoDoToken).
// Token desconhecido, vencido, já enviado ou cancelado: o MESMO 404. Tudo preso à homologação do token. Montado antes do
// authMiddleware (index.ts); molde de public-auditor.ts.
import { Hono } from 'hono';
import type { Bindings } from '../index';
import { rateLimitD1, erro500 } from '../helpers';
import { validateBody, homologacaoEnviarSchema, homologacaoRespostasSchema, homologacaoTokenSchema } from '../schemas';
import { avisarEnvio, gravarRespostas, homologacaoDoToken, visaoDoFornecedor } from '../services/homologacao';
import { log } from '../observability';

export const publicHomologacaoApp = new Hono<{ Bindings: Bindings }>();

const INVALIDO = { error: 'Link inválido ou expirado' };
const JANELA_SEG = 600; // src/manutencao.ts (MAIOR_JANELA_SEG) acompanha esta janela
// Um questionário é respondido por uma pessoa, salvando de vez em quando. Contra adivinhar token segura o espaço de 256 bits.
const MAX_POR_IP = 120;

publicHomologacaoApp.use('*', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || 'sem-ip';
  if (!(await rateLimitD1(c.env.DB, `homologacao-publica:ip:${ip}`, MAX_POR_IP, JANELA_SEG))) {
    return c.json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }, 429);
  }
  await next();
});

publicHomologacaoApp.post('/ver', async (c) => {
  try {
    const v = await validateBody(c, homologacaoTokenSchema);
    if (!v.success) return v.response;
    const h = await homologacaoDoToken(c.env.DB, v.data.token);
    if (!h) return c.json(INVALIDO, 404);
    return c.json(await visaoDoFornecedor(c.env.DB, h));
  } catch (e) { return erro500(c, 'Falha ao abrir o questionário', e); }
});

publicHomologacaoApp.post('/salvar', async (c) => {
  try {
    const v = await validateBody(c, homologacaoRespostasSchema);
    if (!v.success) return v.response;
    const h = await homologacaoDoToken(c.env.DB, v.data.token);
    if (!h) return c.json(INVALIDO, 404);
    const r = await gravarRespostas(c.env.DB, h, v.data.respostas, false);
    if (!r) return c.json(INVALIDO, 404);
    return r.ok ? c.json(r) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao salvar as respostas', e); }
});

/** Envia (com as respostas do corpo, se vierem): a homologação fica `respondida` e imutável, e o link deixa de valer. */
publicHomologacaoApp.post('/enviar', async (c) => {
  try {
    const v = await validateBody(c, homologacaoEnviarSchema);
    if (!v.success) return v.response;
    const h = await homologacaoDoToken(c.env.DB, v.data.token);
    if (!h) return c.json(INVALIDO, 404);
    const r = await gravarRespostas(c.env.DB, h, v.data.respostas ?? {}, true);
    if (!r) return c.json(INVALIDO, 404);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    // O aviso à equipe nunca derruba o envio, que já está gravado.
    try { await avisarEnvio(c.env.DB, h); } catch (e) {
      log('error', { msg: 'homologacao_aviso_falhou', homologacao_id: h.id, projeto: h.project_id, erro: e instanceof Error ? e.message : String(e) });
    }
    return c.json(r);
  } catch (e) { return erro500(c, 'Falha ao enviar as respostas', e); }
});
