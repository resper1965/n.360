import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ehPapelCliente, erro500, projetosVisiveis } from '../helpers';
import { MODULOS_PRODUTO, modulosDaPessoa, modulosDoProjeto, recusaDaPessoa, recusaDeModulo, type Modulo } from '../modulos';
import { carteira, painelDoProjeto } from '../services/painel';

/**
 * Painel de entrada (estudo de 14/10/2026, direção A). Só leitura.
 *
 * `GET /api/v1/projects/:projectId/painel?modulo=iso|privacy|ot`: a entrada de um módulo pede o dele; o n.360 não manda `modulo` e
 * recebe os módulos que o projeto tem E a pessoa tem. O segmento é da faixa `nucleo` em `src/modulos.ts` porque a faixa depende
 * do `?modulo=`, que o middleware não lê: a mesma recusa (`recusaDeModulo`, depois `recusaDaPessoa`) é feita aqui, com o 403 de
 * sempre. O `projectAccessMiddleware` já cortou o projeto e a organização.
 */
export const painelApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const ehModulo = (v: string): v is Modulo => (MODULOS_PRODUTO as readonly string[]).includes(v);

painelApp.get('/', async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('projectId')!;
    const pedido = c.req.query('modulo');
    if (pedido !== undefined && !ehModulo(pedido)) return c.json({ error: 'Módulo desconhecido: use iso, privacy ou ot' }, 400);
    const doProjeto = await modulosDoProjeto(c.env.DB, projectId);
    if (!doProjeto.length) return c.json({ error: 'Projeto não encontrado' }, 404);
    // P0-2 do n.ot: chave de API e agente MCP nunca leem nada do n.ot, nem resumo.
    const semOt = user?.agente === true || !!user?.id?.startsWith('apikey:');
    const daPessoa = (await modulosDaPessoa(c.env.DB, user)).filter((m) => !(semOt && m === 'ot'));
    if (pedido) {
      const recusa = recusaDeModulo(pedido, doProjeto) ?? recusaDaPessoa(pedido, daPessoa);
      if (recusa) return c.json({ error: recusa }, 403);
    }
    const modulos = pedido ? [pedido] : doProjeto.filter((m) => daPessoa.includes(m)).sort();
    if (!modulos.length) return c.json({ error: 'Você não tem acesso a nenhum módulo deste projeto' }, 403);
    // O agente MCP entra como `client`, mas age pela consultoria que o concedeu: lê a visão da equipe.
    const cliente = ehPapelCliente(user) && user?.agente !== true;
    return c.json(await painelDoProjeto(c.env.DB, projectId, modulos, { id: user?.id, email: user?.email, cliente, role: user?.role, client_project_id: user?.client_project_id, org_id: user?.org_id }));
  } catch (e) {
    return erro500(c, 'Falha ao montar o painel', e);
  }
});

/**
 * `GET /api/v1/carteira`: a carteira de quem cuida de vários projetos, um resumo por projeto, agrupado no servidor. O escopo é
 * o de toda listagem entre projetos (`projetosVisiveis`): consultor, os projetos em que está designado; administrador da
 * consultoria, os da organização; cliente, o dele. Fora do agente MCP (preso a um projeto), pela allow-list e por `FORA_DO_AGENTE`.
 */
export const carteiraApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

carteiraApp.get('/', async (c) => {
  try {
    const user = c.get('user');
    // a tela só mostra a carteira à equipe; o cliente e o técnico por site não recebem o n.ot (a contagem é do projeto inteiro)
    const semOt = user?.agente === true || !!user?.id?.startsWith('apikey:') || ehPapelCliente(user);
    const projetos = await carteira(c.env.DB, projetosVisiveis(user), (await modulosDaPessoa(c.env.DB, user)).filter((m) => !(semOt && m === 'ot')));
    return c.json({ gerado_em: new Date().toISOString(), projetos });
  } catch (e) {
    return erro500(c, 'Falha ao montar a carteira', e);
  }
});
