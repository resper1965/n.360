import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ehEquipeNess, erro500, escapeHtml, sendEmail } from '../helpers';
import { appUrl } from '../config/url';
import {
  atualizarPergunta, cancelarHomologacao, concluirHomologacao, criarHomologacao, criarPergunta, lerHomologacao, listarHomologacoes, listarPerguntas,
} from '../services/homologacao';
import { validateBody, homologacaoConcluirSchema, homologacaoCriarSchema, homologacaoPerguntaAtualizarSchema, homologacaoPerguntaCriarSchema } from '../schemas';

/**
 * F5: homologação de fornecedor por questionário. Montado em `/api/v1/projects/:projectId/homologacoes` (faixa privacy), então o
 * `projectAccessMiddleware` já cortou projeto e módulo. Ler: quem tem o projeto. Escrever (perguntas, criar o link, concluir,
 * cancelar): só a equipe da consultoria, como o link do auditor; o agente MCP não escreve aqui (FORA_DO_AGENTE).
 */
export const homologacoesApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const SO_CONSULTORIA = { error: 'Somente a consultoria conduz a homologação de fornecedor' };
const pid = (c: { req: { param: (k: string) => string | undefined } }) => c.req.param('projectId')!;

homologacoesApp.get('/perguntas', async (c) => {
  try { return c.json(await listarPerguntas(c.env.DB, pid(c))); } catch (e) { return erro500(c, 'Falha ao listar as perguntas', e); }
});

homologacoesApp.post('/perguntas', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_CONSULTORIA, 403);
    const v = await validateBody(c, homologacaoPerguntaCriarSchema);
    if (!v.success) return v.response;
    return c.json(await criarPergunta(c.env.DB, pid(c), c.get('user').email, v.data), 201);
  } catch (e) { return erro500(c, 'Falha ao criar a pergunta', e); }
});

homologacoesApp.put('/perguntas/:perguntaId', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_CONSULTORIA, 403);
    const v = await validateBody(c, homologacaoPerguntaAtualizarSchema);
    if (!v.success) return v.response;
    const ok = await atualizarPergunta(c.env.DB, pid(c), c.req.param('perguntaId'), c.get('user').email, v.data);
    return ok ? c.json({ ok: true }) : c.json({ error: 'Pergunta não encontrada' }, 404);
  } catch (e) { return erro500(c, 'Falha ao alterar a pergunta', e); }
});

homologacoesApp.get('/', async (c) => {
  try { return c.json(await listarHomologacoes(c.env.DB, pid(c), c.req.query('parte_id') || undefined)); } catch (e) { return erro500(c, 'Falha ao listar as homologações', e); }
});

/** Cria o envio. O link (com o token) sai UMA vez nesta resposta; no banco fica só o hash. */
homologacoesApp.post('/', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_CONSULTORIA, 403);
    const v = await validateBody(c, homologacaoCriarSchema);
    if (!v.success) return v.response;
    const r = await criarHomologacao(c.env.DB, pid(c), c.get('user').email, { parte_id: v.data.parte_id, dias: v.data.dias ?? 15 });
    if (!r.ok) return c.json({ error: r.error }, r.status);
    const url = `${appUrl(c.env)}/homologacao#${r.token}`;
    // Só com o envio configurado de verdade: sem a chave, a tela mostra o link para copiar.
    let email_enviado = false;
    if (v.data.email && c.env.RESEND_API_KEY) {
      const cliente = await c.env.DB.prepare('SELECT client_name FROM projects WHERE id = ?').bind(pid(c)).first<string>('client_name');
      email_enviado = await sendEmail(c, v.data.email, `Questionário de homologação de fornecedor${cliente ? ` - ${cliente}` : ''}`,
        `<p>Olá,</p><p>${escapeHtml(cliente ?? 'Nosso cliente')} pede que ${escapeHtml(r.parte_nome)} responda ao questionário de homologação de fornecedor.</p>
         <p><a href="${escapeHtml(url)}">Abrir o questionário</a></p><p>O link vale até ${escapeHtml(r.expira_em.slice(0, 10))} e é pessoal: não o encaminhe.</p>`);
    }
    return c.json({ id: r.id, url, expira_em: r.expira_em, email_enviado }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar a homologação', e); }
});

homologacoesApp.get('/:id', async (c) => {
  try {
    const h = await lerHomologacao(c.env.DB, pid(c), c.req.param('id'));
    return h ? c.json(h) : c.json({ error: 'Homologação não encontrada' }, 404);
  } catch (e) { return erro500(c, 'Falha ao abrir a homologação', e); }
});

homologacoesApp.post('/:id/concluir', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_CONSULTORIA, 403);
    const v = await validateBody(c, homologacaoConcluirSchema);
    if (!v.success) return v.response;
    const r = await concluirHomologacao(c.env.DB, pid(c), c.req.param('id'), c.get('user').email, v.data);
    return r.ok ? c.json({ ok: true, avaliacao_id: r.avaliacao_id }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao concluir a homologação', e); }
});

homologacoesApp.post('/:id/cancelar', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_CONSULTORIA, 403);
    const r = await cancelarHomologacao(c.env.DB, pid(c), c.req.param('id'), c.get('user').email);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao cancelar a homologação', e); }
});
