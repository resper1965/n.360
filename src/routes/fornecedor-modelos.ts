import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ehEquipeNess, erro500, podeAdministrarOrg } from '../helpers';
import { exigirOrg } from '../services/organizacao';
import { TIPOS_MODELO, atualizarPerguntaModelo, criarPerguntaModelo, lerModelos, salvarPrazo, type TipoModelo } from '../services/fornecedor-modelos';
import { validateBody, fornecedorModeloPerguntaAtualizarSchema, fornecedorModeloPerguntaSchema, fornecedorModeloPrazoSchema } from '../schemas';

/**
 * Modelos de avaliação de fornecedor da consultoria (migration 0106, spec 2026-11-09-ciclo-avaliacao-fornecedor-design). Montado em
 * `/api/v1/fornecedor-modelos`, fora de projeto: a organização vem de `exigirOrg` (a do usuário; o `platform_admin` escolhe por
 * `X-Org-Id`). Lê a equipe; grava o administrador da organização (`consultoria_admin` da própria e `platform_admin`). O agente fica fora
 * (`FORA_DO_AGENTE`): ele lê o questionário montado pelo projeto (`GET .../homologacoes/perguntas`).
 */
export const fornecedorModelosApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
fornecedorModelosApp.use('*', exigirOrg);

const SO_EQUIPE = { error: 'Os modelos de avaliação de fornecedor são da equipe da consultoria' };
const SO_ADMIN = { error: 'Só o administrador da consultoria altera os modelos de avaliação de fornecedor' };
const tipoValido = (t: string | undefined): t is TipoModelo => !!t && (TIPOS_MODELO as readonly string[]).includes(t);

fornecedorModelosApp.get('/', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_EQUIPE, 403);
    return c.json({ modelos: await lerModelos(c.env.DB, c.get('orgId')), pode_editar: podeAdministrarOrg(c.get('user'), c.get('orgId')) });
  } catch (e) { return erro500(c, 'Falha ao ler os modelos de fornecedor', e); }
});

fornecedorModelosApp.put('/:tipo', async (c) => {
  try {
    const tipo = c.req.param('tipo');
    if (!tipoValido(tipo)) return c.json({ error: 'tipo deve ser critico, medio, pequeno ou grande_provedor' }, 400);
    if (!podeAdministrarOrg(c.get('user'), c.get('orgId'))) return c.json(SO_ADMIN, 403);
    const v = await validateBody(c, fornecedorModeloPrazoSchema);
    if (!v.success) return v.response;
    await salvarPrazo(c.env.DB, c.get('orgId'), tipo, v.data.prazo_meses, c.get('user').email);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao salvar o prazo do modelo', e); }
});

fornecedorModelosApp.post('/:tipo/perguntas', async (c) => {
  try {
    const tipo = c.req.param('tipo');
    if (!tipoValido(tipo)) return c.json({ error: 'tipo deve ser critico, medio, pequeno ou grande_provedor' }, 400);
    if (!podeAdministrarOrg(c.get('user'), c.get('orgId'))) return c.json(SO_ADMIN, 403);
    const v = await validateBody(c, fornecedorModeloPerguntaSchema);
    if (!v.success) return v.response;
    return c.json(await criarPerguntaModelo(c.env.DB, c.get('orgId'), tipo, c.get('user').email, v.data), 201);
  } catch (e) { return erro500(c, 'Falha ao criar a pergunta do modelo', e); }
});

fornecedorModelosApp.put('/:tipo/perguntas/:perguntaId', async (c) => {
  try {
    if (!tipoValido(c.req.param('tipo'))) return c.json({ error: 'tipo deve ser critico, medio, pequeno ou grande_provedor' }, 400);
    if (!podeAdministrarOrg(c.get('user'), c.get('orgId'))) return c.json(SO_ADMIN, 403);
    const v = await validateBody(c, fornecedorModeloPerguntaAtualizarSchema);
    if (!v.success) return v.response;
    const ok = await atualizarPerguntaModelo(c.env.DB, c.get('orgId'), c.req.param('perguntaId'), c.get('user').email, v.data);
    return ok ? c.json({ ok: true }) : c.json({ error: 'Pergunta não encontrada' }, 404);
  } catch (e) { return erro500(c, 'Falha ao alterar a pergunta do modelo', e); }
});
