import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500, ehEquipeNess, logAudit } from '../helpers';
import { validateBody } from '../schemas';
import { passoCamposSchema, passoConcluirSchema, passoReabrirSchema, passoBloquearSchema, passoDesbloquearSchema, passoMetaSchema } from '../schemas/passos';
import { obterCatalogo, passoPorId, versaoDoCatalogo, chaveDoCampo } from '../data/passos/catalogo';
import { carregarContexto, type ContextoProjeto } from '../services/passos/contexto';
import { estadoDoPasso, montarBancada, situacaoDaFaseNoContexto } from '../services/passos/estado';
import { avaliarPasso } from '../services/passos/avaliar';
import { gravarSituacoes, registrarGravacao } from '../services/passos/fase';
import { materializarLegado } from '../services/passos/legado';
import { detalheDoPasso } from '../services/passos/detalhe';
import { anotacaoAnterior, validarValor, valoresDoPasso } from '../services/passos/valores';

type App = Hono<{ Bindings: Bindings; Variables: Variables }>;
const novo = (): App => new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** /api/v1/passos: catálogo, global (não é de projeto). */
export const passosCatalogoApp: App = novo();
/** /api/v1/projects/:projectId/passos: um passo do projeto. Parâmetro `:itemId`. */
export const projectPassosApp: App = novo();
/** /api/v1/projects/:projectId/bancada: o estado do projeto e a situação antiga das fases. */
export const projectBancadaApp: App = novo();

passosCatalogoApp.get('/catalogo', async (c) => {
  c.header('Cache-Control', 'private, max-age=300');
  return c.json({ ok: true, ...obterCatalogo(), versao: await versaoDoCatalogo() });
});

projectBancadaApp.get('/', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const projeto = await c.env.DB.prepare(`SELECT id, COALESCE(project_name, client_name) AS nome FROM projects WHERE id = ?`).bind(projectId).first<{ id: string; nome: string }>();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);
    await materializarLegado(c.env.DB, projectId);
    const ctx = await carregarContexto(c.env.DB, projectId);
    await gravarSituacoes(c.env.DB, projectId, ctx);
    return c.json({ ok: true, projeto, catalogo_versao: await versaoDoCatalogo(), ...montarBancada(obterCatalogo(), ctx) });
  } catch (e) { return erro500(c, 'Falha ao carregar a bancada', e); }
});

projectPassosApp.get('/:itemId', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const passo = passoPorId(c.req.param('itemId')!);
    if (!passo) return c.json({ error: 'Passo não encontrado' }, 404);
    await materializarLegado(c.env.DB, projectId);
    const ctx = await carregarContexto(c.env.DB, projectId);
    return c.json(await detalheDoPasso(c.env.DB, projectId, passo, ctx, ehEquipeNess(c.get('user'))));
  } catch (e) { return erro500(c, 'Falha ao carregar o passo', e); }
});

projectPassosApp.put('/:itemId/campos', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const passo = passoPorId(c.req.param('itemId')!);
    if (!passo) return c.json({ error: 'Passo não encontrado' }, 404);
    const v = await validateBody(c, passoCamposSchema);
    if (!v.success) return v.response;
    const { campos, vistos } = v.data;
    const porId = new Map(passo.campos.map((k) => [k.id, k]));
    const gravar: Array<{ chave: string; id: string; valor: string }> = [];
    const apagar: string[] = [];
    for (const [id, bruto] of Object.entries(campos)) {
      const campo = porId.get(id);
      if (!campo) return c.json({ error: `Campo desconhecido neste passo: ${id}` }, 400);
      const r = validarValor(campo, bruto);
      if (!r.ok) return c.json({ error: `Valor inválido em "${campo.rotulo}": ${r.erro}`, campo: id }, 400);
      if (r.valor === '') apagar.push(chaveDoCampo(passo, campo)); else gravar.push({ chave: chaveDoCampo(passo, campo), id, valor: r.valor });
    }
    const ctx = await carregarContexto(c.env.DB, projectId);
    const conflitos: Array<{ campo: string; valor_atual: string; atualizado_em: string | null; por: string | null }> = [];
    for (const [id, visto] of Object.entries(vistos ?? {})) {
      const campo = porId.get(id);
      if (!campo) continue;
      const atual = ctx.respostas.get(chaveDoCampo(passo, campo));
      if ((atual?.atualizado_em ?? null) !== (visto ?? null)) conflitos.push({ campo: id, valor_atual: atual?.valor ?? '', atualizado_em: atual?.atualizado_em ?? null, por: atual?.por ?? null });
    }
    if (conflitos.length) return c.json({ error: 'Outra pessoa alterou este campo', conflitos }, 409);
    // O primeiro autosave do passo promove os valores herdados do JSON antigo de `notes` a linhas (spec, seção 6).
    for (const [id, val] of Object.entries(valoresDoPasso(passo, ctx))) {
      if (val.herdado && !(id in campos)) gravar.push({ chave: chaveDoCampo(passo, porId.get(id)!), id, valor: val.valor });
    }
    const agora = (await c.env.DB.prepare(`SELECT datetime('now') AS t`).first<{ t: string }>())!.t;
    const user = c.get('user');
    const quem = user?.email ?? 'sistema';
    const stmts = gravar.map((g) => c.env.DB.prepare(
      `INSERT INTO project_phase_answers (id, project_id, phase_number, question_key, answer, updated_at, updated_by)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, phase_number, question_key) DO UPDATE SET answer = excluded.answer, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(projectId, passo.fase, g.chave, g.valor, agora, quem));
    for (const chave of apagar) stmts.push(c.env.DB.prepare(`DELETE FROM project_phase_answers WHERE project_id = ? AND phase_number = ? AND question_key = ?`).bind(projectId, passo.fase, chave));
    if (stmts.length) await c.env.DB.batch(stmts);
    for (const g of gravar) ctx.respostas.set(g.chave, { valor: g.valor, atualizado_em: agora, por: quem });
    for (const chave of apagar) ctx.respostas.delete(chave);
    await gravarSituacoes(c.env.DB, projectId, ctx);
    await registrarGravacao(c.env.DB, projectId, passo, quem, c.req.header('CF-Connecting-IP') ?? '');
    return c.json({
      ok: true, salvo_em: agora, gravados: Object.fromEntries(gravar.map((g) => [g.id, agora])), avaliacao: avaliarPasso(passo, ctx),
      fase: { numero: passo.fase, situacao: situacaoDaFaseNoContexto(obterCatalogo(), ctx, passo.fase) },
    });
  } catch (e) { return erro500(c, 'Falha ao salvar os campos do passo', e); }
});

const quemId = (u?: { id?: string }) => (u?.id && !u.id.startsWith('apikey:') ? u.id : null);
const equipeOuAdmin = (u?: { role?: string }) => ehEquipeNess(u) || u?.role === 'org_admin';
/** Grava o cache da situação da fase (só onde mudou) e devolve a fase para a resposta. `ctx` já reflete a mudança do passo. */
async function depoisDeMudar(c: { env: { DB: D1Database } }, projectId: string, passo: { fase: number }, ctx: ContextoProjeto) {
  await gravarSituacoes(c.env.DB, projectId, ctx);
  return { numero: passo.fase, situacao: situacaoDaFaseNoContexto(obterCatalogo(), ctx, passo.fase) };
}

projectPassosApp.patch('/:itemId', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const passo = passoPorId(c.req.param('itemId')!);
    if (!passo) return c.json({ error: 'Passo não encontrado' }, 404);
    const v = await validateBody(c, passoMetaSchema);
    if (!v.success) return v.response;
    const { assigned_to, due_date } = v.data;
    await c.env.DB.prepare(
      `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, assigned_to, due_date)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, 0, ?, ?)
       ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET
         assigned_to = CASE WHEN ? THEN excluded.assigned_to ELSE checklist_progress.assigned_to END,
         due_date = CASE WHEN ? THEN excluded.due_date ELSE checklist_progress.due_date END`
    ).bind(projectId, passo.fase, passo.id, assigned_to || null, due_date ?? null, assigned_to !== undefined ? 1 : 0, due_date !== undefined ? 1 : 0).run();
    const ctx = await carregarContexto(c.env.DB, projectId);
    return c.json({ ok: true, fase: await depoisDeMudar(c, projectId, passo, ctx), avaliacao: avaliarPasso(passo, ctx) });
  } catch (e) { return erro500(c, 'Falha ao salvar responsável e prazo', e); }
});

projectPassosApp.post('/:itemId/concluir', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const passo = passoPorId(c.req.param('itemId')!);
    if (!passo) return c.json({ error: 'Passo não encontrado' }, 404);
    const v = await validateBody(c, passoConcluirSchema);
    if (!v.success) return v.response;
    const ctx = await carregarContexto(c.env.DB, projectId);
    if (estadoDoPasso(passo, ctx).estado === 'bloqueado') return c.json({ error: 'Passo bloqueado: desbloqueie antes de concluir' }, 409);
    const av = avaliarPasso(passo, ctx);
    const user = c.get('user');
    const excecao = !av.ok ? v.data.excecao : undefined;
    if (!av.ok) {
      if (!excecao) return c.json({ error: 'O passo ainda não cumpre o "concluído quando"', faltam: av.criterios.filter((x) => !x.ok) }, 409);
      if (!ehEquipeNess(user)) return c.json({ error: 'Concluir com exceção é da equipe da consultoria' }, 403);
    }
    await c.env.DB.prepare(
      `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, checked_by, checked_at, excecao_motivo, excecao_por, excecao_em)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, ?, ?, ?)
       ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET is_checked = 1, checked_by = excluded.checked_by, checked_at = CURRENT_TIMESTAMP,
         excecao_motivo = excluded.excecao_motivo, excecao_por = excluded.excecao_por, excecao_em = excluded.excecao_em,
         bloqueio_motivo = NULL, bloqueio_responsavel = NULL, bloqueado_em = NULL`
    ).bind(projectId, passo.fase, passo.id, quemId(user), excecao?.motivo ?? null, excecao ? (user?.email ?? 'sistema') : null, excecao ? new Date().toISOString() : null).run();
    await logAudit(c.env.DB, excecao ? 'passo.concluido_com_excecao' : 'passo.concluido', user?.email ?? 'system',
      `Passo ${passo.id} concluído no projeto ${projectId}`, excecao?.motivo ?? '', c.req.header('CF-Connecting-IP') ?? '', projectId);
    const novo = await carregarContexto(c.env.DB, projectId);
    return c.json({ ok: true, estado: 'concluido', concluido_por_excecao: !!excecao, fase: await depoisDeMudar(c, projectId, passo, novo) });
  } catch (e) { return erro500(c, 'Falha ao concluir o passo', e); }
});

projectPassosApp.post('/:itemId/reabrir', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const passo = passoPorId(c.req.param('itemId')!);
    if (!passo) return c.json({ error: 'Passo não encontrado' }, 404);
    const v = await validateBody(c, passoReabrirSchema);
    if (!v.success) return v.response;
    await c.env.DB.prepare(
      `UPDATE checklist_progress SET is_checked = 0, checked_by = NULL, checked_at = NULL, excecao_motivo = NULL, excecao_por = NULL, excecao_em = NULL
       WHERE project_id = ? AND phase_number = ? AND item_id = ?`
    ).bind(projectId, passo.fase, passo.id).run();
    await logAudit(c.env.DB, 'passo.reaberto', c.get('user')?.email ?? 'system', `Passo ${passo.id} reaberto no projeto ${projectId}`, v.data.motivo ?? '', c.req.header('CF-Connecting-IP') ?? '', projectId);
    const ctx = await carregarContexto(c.env.DB, projectId);
    return c.json({ ok: true, estado: estadoDoPasso(passo, ctx).estado, fase: await depoisDeMudar(c, projectId, passo, ctx) });
  } catch (e) { return erro500(c, 'Falha ao reabrir o passo', e); }
});

projectPassosApp.post('/:itemId/bloquear', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const passo = passoPorId(c.req.param('itemId')!);
    if (!passo) return c.json({ error: 'Passo não encontrado' }, 404);
    if (!equipeOuAdmin(c.get('user'))) return c.json({ error: 'Bloquear passo é da equipe da consultoria ou do administrador do cliente' }, 403);
    const v = await validateBody(c, passoBloquearSchema);
    if (!v.success) return v.response;
    const ctx = await carregarContexto(c.env.DB, projectId);
    if (estadoDoPasso(passo, ctx).estado === 'concluido') return c.json({ error: 'Passo concluído: reabra antes de bloquear' }, 409);
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, bloqueio_motivo, bloqueio_responsavel, bloqueado_em)
         VALUES (lower(hex(randomblob(16))), ?, ?, ?, 0, ?, ?, datetime('now'))
         ON CONFLICT(project_id, phase_number, item_id) DO UPDATE SET bloqueio_motivo = excluded.bloqueio_motivo, bloqueio_responsavel = excluded.bloqueio_responsavel, bloqueado_em = excluded.bloqueado_em`
      ).bind(projectId, passo.fase, passo.id, v.data.motivo, v.data.responsavel),
      // Registrar o bloqueio no passo certo encerra o "bloqueada" que o select manual deixou na fase (spec, seção 6).
      c.env.DB.prepare(`UPDATE project_phases SET legado_status = NULL WHERE project_id = ? AND phase_number = ? AND legado_status = 'blocked'`).bind(projectId, passo.fase),
    ]);
    await logAudit(c.env.DB, 'passo.bloqueado', c.get('user')?.email ?? 'system', `Passo ${passo.id} bloqueado no projeto ${projectId} (responsável: ${v.data.responsavel})`, v.data.motivo, c.req.header('CF-Connecting-IP') ?? '', projectId);
    const novo = await carregarContexto(c.env.DB, projectId);
    return c.json({ ok: true, estado: 'bloqueado', fase: await depoisDeMudar(c, projectId, passo, novo) });
  } catch (e) { return erro500(c, 'Falha ao bloquear o passo', e); }
});

projectPassosApp.post('/:itemId/desbloquear', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const passo = passoPorId(c.req.param('itemId')!);
    if (!passo) return c.json({ error: 'Passo não encontrado' }, 404);
    if (!equipeOuAdmin(c.get('user'))) return c.json({ error: 'Desbloquear passo é da equipe da consultoria ou do administrador do cliente' }, 403);
    const v = await validateBody(c, passoDesbloquearSchema);
    if (!v.success) return v.response;
    await c.env.DB.prepare(
      `UPDATE checklist_progress SET bloqueio_motivo = NULL, bloqueio_responsavel = NULL, bloqueado_em = NULL WHERE project_id = ? AND phase_number = ? AND item_id = ?`
    ).bind(projectId, passo.fase, passo.id).run();
    await logAudit(c.env.DB, 'passo.desbloqueado', c.get('user')?.email ?? 'system', `Passo ${passo.id} desbloqueado no projeto ${projectId}`, '', c.req.header('CF-Connecting-IP') ?? '', projectId);
    const ctx = await carregarContexto(c.env.DB, projectId);
    return c.json({ ok: true, estado: estadoDoPasso(passo, ctx).estado, fase: await depoisDeMudar(c, projectId, passo, ctx) });
  } catch (e) { return erro500(c, 'Falha ao desbloquear o passo', e); }
});

projectPassosApp.delete('/:itemId/anotacao-anterior', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const passo = passoPorId(c.req.param('itemId')!);
    if (!passo) return c.json({ error: 'Passo não encontrado' }, 404);
    if (!ehEquipeNess(c.get('user'))) return c.json({ error: 'Descartar a anotação antiga é da equipe da consultoria' }, 403);
    const ctx = await carregarContexto(c.env.DB, projectId);
    if (!anotacaoAnterior(ctx.progresso.get(passo.id)?.notes)) return c.json({ error: 'Não há anotação livre antiga neste passo' }, 409);
    await c.env.DB.prepare(`UPDATE checklist_progress SET notes = NULL WHERE project_id = ? AND phase_number = ? AND item_id = ?`).bind(projectId, passo.fase, passo.id).run();
    await logAudit(c.env.DB, 'passo.anotacao_descartada', c.get('user')?.email ?? 'system', `Anotação livre antiga do passo ${passo.id} descartada no projeto ${projectId}`, '', c.req.header('CF-Connecting-IP') ?? '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao descartar a anotação antiga', e); }
});

projectBancadaApp.delete('/fases/:n/situacao-antiga', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    if (!ehEquipeNess(c.get('user'))) return c.json({ error: 'Encerrar a situação anterior da fase é da equipe da consultoria' }, 403);
    const n = Number(c.req.param('n'));
    if (!Number.isInteger(n) || n < 0 || n > 40) return c.json({ error: 'Fase inválida' }, 400);
    await c.env.DB.prepare(`UPDATE project_phases SET legado_status = NULL WHERE project_id = ? AND phase_number = ? AND legado_status = 'blocked'`).bind(projectId, n).run();
    await logAudit(c.env.DB, 'fase.situacao_antiga_encerrada', c.get('user')?.email ?? 'system', `Situação anterior da fase ${n} encerrada no projeto ${projectId}`, '', c.req.header('CF-Connecting-IP') ?? '', projectId);
    const ctx = await carregarContexto(c.env.DB, projectId);
    await gravarSituacoes(c.env.DB, projectId, ctx);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao encerrar a situação anterior da fase', e); }
});
