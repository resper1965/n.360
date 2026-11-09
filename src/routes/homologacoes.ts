import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ehEquipeNess, erro500, sendEmail } from '../helpers';
import { remetente } from '../services/email-layout';
import { emailHomologacao } from '../services/emails';
import { appUrl } from '../config/url';
import {
  atualizarPergunta, cancelarHomologacao, concluirHomologacao, criarHomologacao, criarPergunta, lerHomologacao, listarHomologacoes, listarPerguntas,
} from '../services/homologacao';
import { TIPOS_QUESTIONARIO, ajustarPerguntaDoModelo, type TipoQuestionario } from '../services/fornecedor-modelos';
import { validateBody, homologacaoAjusteSchema, homologacaoConcluirSchema, homologacaoCriarSchema, homologacaoPerguntaAtualizarSchema, homologacaoPerguntaCriarSchema } from '../schemas';

/**
 * F5: homologação de fornecedor por questionário. Montado em `/api/v1/projects/:projectId/homologacoes` (faixa privacy), então o
 * `projectAccessMiddleware` já cortou projeto e módulo. Ler: quem tem o projeto. Escrever (perguntas, criar o link, concluir,
 * cancelar): só a equipe da consultoria, como o link do auditor; o agente MCP escreve aqui só pela decisão confirmada (`niso_avaliar_fornecedor`).
 */
export const homologacoesApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const SO_CONSULTORIA = { error: 'Somente a consultoria conduz a homologação de fornecedor' };
const pid = (c: { req: { param: (k: string) => string | undefined } }) => c.req.param('projectId')!;

// O questionário de um tipo (crítico, médio ou pequeno): o modelo vivo da consultoria, os ajustes e as perguntas próprias do projeto.
homologacoesApp.get('/perguntas', async (c) => {
  try {
    const tipo = c.req.query('tipo') || 'medio';
    if (!(TIPOS_QUESTIONARIO as readonly string[]).includes(tipo)) return c.json({ error: 'tipo deve ser critico, medio ou pequeno' }, 400);
    return c.json(await listarPerguntas(c.env.DB, pid(c), tipo as TipoQuestionario));
  } catch (e) { return erro500(c, 'Falha ao listar as perguntas', e); }
});

homologacoesApp.post('/perguntas', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_CONSULTORIA, 403);
    const v = await validateBody(c, homologacaoPerguntaCriarSchema);
    if (!v.success) return v.response;
    return c.json(await criarPergunta(c.env.DB, pid(c), c.get('user').email, v.data), 201);
  } catch (e) { return erro500(c, 'Falha ao criar a pergunta', e); }
});

// Liga ou desliga, só neste projeto, uma pergunta do modelo da consultoria (o texto do modelo não se edita aqui).
homologacoesApp.put('/perguntas/modelo/:perguntaId', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_CONSULTORIA, 403);
    const v = await validateBody(c, homologacaoAjusteSchema);
    if (!v.success) return v.response;
    const ok = await ajustarPerguntaDoModelo(c.env.DB, pid(c), c.req.param('perguntaId'), v.data.ativa, c.get('user').email);
    return ok ? c.json({ ok: true }) : c.json({ error: 'Pergunta não encontrada no modelo desta consultoria' }, 404);
  } catch (e) { return erro500(c, 'Falha ao ajustar a pergunta', e); }
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
      const db = c.env.DB;
      const cliente = (await db.prepare('SELECT client_name FROM projects WHERE id = ?').bind(pid(c)).first<string>('client_name')) ?? '';
      const user = c.get('user');
      const consultoria = await db.prepare('SELECT o.name FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.id = ?').bind(user.id).first<string>('name');
      const quem = { nome: user.name ?? null, email: user.email, organizacao: consultoria ?? null };
      const m = emailHomologacao({ cliente, fornecedor: r.parte_nome, expiraEm: r.expira_em, link: url, quem });
      email_enviado = await sendEmail(c, v.data.email, m.assunto, m, { from: remetente('n.privacy', cliente), replyTo: user.email });
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
