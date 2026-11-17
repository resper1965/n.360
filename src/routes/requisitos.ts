import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ehEquipeNess, erro500, logAudit } from '../helpers';
import {
  definirRequisitosDaEvidencia, definirRequisitosDoDocumento, excluirRequisito, reincluirRequisito, lacunasDaFonte, resumoDeLacunas, lerRequisito, ligarControles, listarFontes, listarRequisitos,
  requisitosDaEvidencia, requisitosDoDocumento, resumoDeMapeamentos, semearCatalogo, validarMapeamentosPropostos, veMapeamentoProposto,
} from '../services/requisitos';
import { documentoRequisitosSchema, evidenciaValidadeSchema, mapeamentoSchema, requisitoAtualizarSchema, requisitoExclusaoSchema, validarMapeamentosSchema, validateBody } from '../schemas';
import { BASES_GDPR } from '../data/ropa-abas/gdpr';
import { definirValidade } from '../services/evidencia-validade';
import { hojeEmSaoPaulo } from '../services/hoje';

type Ctx = { Bindings: Bindings; Variables: Variables };

/**
 * Núcleo do n.privacy, fatia 2: catálogo de requisitos. Global (sem project_id): todos leem; só o `platform_admin`
 * escreve, com trilha. O cliente nunca recebe mapeamento `proposto` (spec 4.5). O agente só lê (`FORA_DO_AGENTE`).
 */
export const requisitosApp = new Hono<Ctx>();

const soAdmin = (c: { get: (k: 'user') => Variables['user'] }) => c.get('user')?.role === 'platform_admin';
const NEGADO = { error: 'Forbidden: só o administrador da plataforma edita o catálogo de requisitos' };

requisitosApp.get('/fontes', async (c) => c.json(await listarFontes(c.env.DB)));

// As seis bases legais do GDPR (art. 6), só leitura, para a Referência jurídica.
requisitosApp.get('/gdpr-bases', (c) => c.json(Object.entries(BASES_GDPR).map(([id, b]) => ({ id, ...b }))));

requisitosApp.get('/', async (c) => c.json(await listarRequisitos(c.env.DB, c.req.query('fonte') || undefined)));

requisitosApp.post('/semear', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const r = await semearCatalogo(c.env.DB);
    const ligados = await ligarControles(c.env.DB);
    await logAudit(c.env.DB, 'requisitos.semear', c.get('user').email, `Seed do catálogo: ${r.fontes} fontes criadas ou atualizadas, ${r.requisitos} requisitos criados, ${r.mapeamentos} mapeamentos propostos, ${ligados} controles ligados`);
    return c.json({ ok: true, ...r, controles_ligados: ligados });
  } catch (e) { return erro500(c, 'Falha ao semear o catálogo de requisitos', e); }
});

// ─── Mapeamentos (declaradas antes de `/:id`, que casaria qualquer segmento) ───────────────────────────

const existe = async (db: D1Database, id: string) => !!(await db.prepare('SELECT 1 FROM requisitos WHERE id = ?').bind(id).first());

// Contagem para o botão "Validar mapeamentos propostos"; quem não vê `proposto` não vê nem a contagem.
requisitosApp.get('/mapeamentos/resumo', async (c) => {
  if (!veMapeamentoProposto(c.get('user')?.role)) return c.json(NEGADO, 403);
  return c.json(await resumoDeMapeamentos(c.env.DB, c.req.query('fonte') || undefined));
});

/**
 * Validação jurídica em lote. É um ato de QUEM ESTÁ LOGADO: `validado_por` é o e-mail da sessão, nunca algo do corpo
 * (o esquema é estrito e recusa o campo). Só o platform_admin; o agente não chama (`FORA_DO_AGENTE`).
 */
requisitosApp.post('/mapeamentos/validar', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const v = await validateBody(c, validarMapeamentosSchema);
    if (!v.success) return v.response;
    const email = c.get('user').email;
    const validados = await validarMapeamentosPropostos(c.env.DB, email, v.data.fonte);
    await logAudit(c.env.DB, 'requisitos.mapeamento', email, `Validação jurídica de ${validados} mapeamentos propostos${v.data.fonte ? ` (fonte ${v.data.fonte})` : ''}`);
    const depois = await resumoDeMapeamentos(c.env.DB, v.data.fonte);
    return c.json({ ok: true, validados, propostos_restantes: depois.propostos, validados_total: depois.validados });
  } catch (e) { return erro500(c, 'Falha ao validar os mapeamentos', e); }
});

/** Quem valida é a sessão, nunca o corpo: validado_por/validado_em do corpo são ignorados. */
const carimbo = (c: { get: (k: 'user') => { email: string } }, estado: string): [string | null, string | null] =>
  estado === 'validado_juridico' ? [c.get('user').email, hojeEmSaoPaulo()] : [null, null];

requisitosApp.post('/mapeamentos', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const v = await validateBody(c, mapeamentoSchema);
    if (!v.success) return v.response;
    const m = v.data;
    if (!(await existe(c.env.DB, m.de_id)) || !(await existe(c.env.DB, m.para_id))) return c.json({ error: 'Requisito não encontrado' }, 404);
    try {
      await c.env.DB.prepare(
        `INSERT INTO requisito_mapeamentos (de_id, para_id, tipo, estado, validado_por, validado_em, nota) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(m.de_id, m.para_id, m.tipo, m.estado, ...carimbo(c, m.estado), m.nota ?? null).run();
    } catch (e) {
      if (/UNIQUE|PRIMARY KEY/i.test(String((e as Error)?.message))) return c.json({ error: 'Esse mapeamento já existe' }, 409);
      throw e;
    }
    await logAudit(c.env.DB, 'requisitos.mapeamento', c.get('user').email, `Mapeamento ${m.de_id} → ${m.para_id} (${m.tipo}, ${m.estado}${m.estado === 'validado_juridico' ? ` por ${c.get('user').email}` : ''}) criado`);
    return c.json({ ok: true }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o mapeamento', e); }
});

requisitosApp.put('/mapeamentos', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const v = await validateBody(c, mapeamentoSchema);
    if (!v.success) return v.response;
    const m = v.data;
    const r = await c.env.DB.prepare(
      `UPDATE requisito_mapeamentos SET tipo = ?, estado = ?, validado_por = ?, validado_em = ?, nota = ? WHERE de_id = ? AND para_id = ?`
    ).bind(m.tipo, m.estado, ...carimbo(c, m.estado), m.nota ?? null, m.de_id, m.para_id).run();
    if (!r.meta.changes) return c.json({ error: 'Mapeamento não encontrado' }, 404);
    await logAudit(c.env.DB, 'requisitos.mapeamento', c.get('user').email, `Mapeamento ${m.de_id} → ${m.para_id} alterado para ${m.tipo}, ${m.estado}${m.estado === 'validado_juridico' ? ` por ${c.get('user').email}` : ''}`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o mapeamento', e); }
});

requisitosApp.delete('/mapeamentos', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const de = c.req.query('de'), para = c.req.query('para');
    if (!de || !para) return c.json({ error: 'Informe de e para' }, 400);
    const r = await c.env.DB.prepare('DELETE FROM requisito_mapeamentos WHERE de_id = ? AND para_id = ?').bind(de, para).run();
    if (!r.meta.changes) return c.json({ error: 'Mapeamento não encontrado' }, 404);
    await logAudit(c.env.DB, 'requisitos.mapeamento', c.get('user').email, `Mapeamento ${de} → ${para} removido`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao remover o mapeamento', e); }
});

// ─── Requisito ───────────────────────────────────────────────────────────────────────────────────────

requisitosApp.get('/:id', async (c) => {
  const r = await lerRequisito(c.env.DB, c.req.param('id'), veMapeamentoProposto(c.get('user')?.role));
  return r ? c.json(r) : c.json({ error: 'Requisito não encontrado' }, 404);
});

requisitosApp.put('/:id', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const v = await validateBody(c, requisitoAtualizarSchema);
    if (!v.success) return v.response;
    const id = c.req.param('id');
    const antes = await c.env.DB.prepare('SELECT titulo FROM requisitos WHERE id = ?').bind(id).first<{ titulo: string }>();
    if (!antes) return c.json({ error: 'Requisito não encontrado' }, 404);
    await c.env.DB.prepare(`UPDATE requisitos SET titulo = ?, updated_at = datetime('now') WHERE id = ?`).bind(v.data.titulo, id).run();
    await logAudit(c.env.DB, 'requisitos.titulo', c.get('user').email, `Requisito ${id}: título "${antes.titulo}" → "${v.data.titulo}"`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o requisito', e); }
});

requisitosApp.delete('/:id', async (c) => {
  try {
    if (!soAdmin(c)) return c.json(NEGADO, 403);
    const id = c.req.param('id');
    if (!(await existe(c.env.DB, id))) return c.json({ error: 'Requisito não encontrado' }, 404);
    const uso = await c.env.DB.prepare(
      `SELECT (SELECT count(*) FROM documento_requisitos WHERE requisito_id = ?1) AS documentos,
              (SELECT count(*) FROM compliance_controls WHERE requisito_id = ?1) AS controles,
              (SELECT count(*) FROM requisitos WHERE pai_id = ?1) AS filhos`
    ).bind(id).first<{ documentos: number; controles: number; filhos: number }>();
    if (uso && (uso.documentos || uso.controles || uso.filhos)) {
      return c.json({ error: 'Requisito em uso: há documento, controle ou requisito filho apontando para ele', ...uso }, 409);
    }
    await c.env.DB.prepare('DELETE FROM requisitos WHERE id = ?').bind(id).run();
    await logAudit(c.env.DB, 'requisitos.remover', c.get('user').email, `Requisito ${id} removido`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao remover o requisito', e); }
});

// ─── Por projeto (montado em /api/v1/projects/:projectId) ──────────────────────────────────────────────

export const projetoRequisitosApp = new Hono<Ctx>();

projetoRequisitosApp.get('/documentos/:id/requisitos', async (c) => {
  const projectId = c.req.param('projectId')!;
  const doc = await c.env.DB.prepare('SELECT id FROM documentos WHERE id = ? AND project_id = ?').bind(c.req.param('id'), projectId).first();
  return doc ? c.json(await requisitosDoDocumento(c.env.DB, projectId, c.req.param('id'))) : c.json({ error: 'Documento não encontrado' }, 404);
});

projetoRequisitosApp.put('/documentos/:id/requisitos', async (c) => {
  try {
    const v = await validateBody(c, documentoRequisitosSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await definirRequisitosDoDocumento(c.env.DB, projectId, c.req.param('id'), v.data.requisitos);
    if (!r) return c.json({ error: 'Documento não encontrado' }, 404);
    if (!r.ok) return c.json({ error: 'Requisito não encontrado', desconhecidos: r.desconhecidos }, 400);
    await logAudit(c.env.DB, 'documento.requisitos', c.get('user').email, `Documento ${c.req.param('id')}: ${r.total} requisitos ligados`, '', '', projectId);
    return c.json({ ok: true, total: r.total });
  } catch (e) { return erro500(c, 'Falha ao ligar os requisitos ao documento', e); }
});

// Documento em arquivo (0086): publicado e com arquivo anexado, cobre o requisito como a política vigente. Escrita é da interface (agente só lê).
projetoRequisitosApp.get('/documentos-arquivo/:id/requisitos', async (c) => {
  const projectId = c.req.param('projectId')!;
  const doc = await c.env.DB.prepare('SELECT id FROM documentos_arquivo WHERE id = ? AND project_id = ?').bind(c.req.param('id'), projectId).first();
  return doc ? c.json(await requisitosDoDocumento(c.env.DB, projectId, c.req.param('id'), 'arquivo')) : c.json({ error: 'Documento não encontrado' }, 404);
});

projetoRequisitosApp.put('/documentos-arquivo/:id/requisitos', async (c) => {
  try {
    const v = await validateBody(c, documentoRequisitosSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await definirRequisitosDoDocumento(c.env.DB, projectId, c.req.param('id'), v.data.requisitos, 'arquivo');
    if (!r) return c.json({ error: 'Documento não encontrado' }, 404);
    if (!r.ok) return c.json({ error: 'Requisito não encontrado', desconhecidos: r.desconhecidos }, 400);
    await logAudit(c.env.DB, 'documento_arquivo.requisitos', c.get('user').email, `Documento em arquivo ${c.req.param('id')}: ${r.total} requisitos ligados`, '', '', projectId);
    return c.json({ ok: true, total: r.total });
  } catch (e) { return erro500(c, 'Falha ao ligar os requisitos ao documento', e); }
});

projetoRequisitosApp.get('/evidence/:evidenceId/requisitos', async (c) => {
  const projectId = c.req.param('projectId')!;
  const ev = await c.env.DB.prepare('SELECT valido_ate FROM evidence WHERE id = ? AND project_id = ?').bind(c.req.param('evidenceId'), projectId).first<{ valido_ate: string | null }>();
  if (!ev) return c.json({ error: 'Evidência não encontrada' }, 404);
  return c.json({ valido_ate: ev.valido_ate, requisitos: await requisitosDaEvidencia(c.env.DB, projectId, c.req.param('evidenceId')) });
});

projetoRequisitosApp.put('/evidence/:evidenceId/requisitos', async (c) => {
  try {
    const v = await validateBody(c, documentoRequisitosSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const r = await definirRequisitosDaEvidencia(c.env.DB, projectId, c.req.param('evidenceId'), v.data.requisitos);
    if (!r) return c.json({ error: 'Evidência não encontrada' }, 404);
    if (!r.ok) return c.json({ error: 'Requisito não encontrado', desconhecidos: r.desconhecidos }, 400);
    await logAudit(c.env.DB, 'evidencia.requisitos', c.get('user').email, `Evidência ${c.req.param('evidenceId')}: ${r.total} requisitos ligados`, '', '', projectId);
    return c.json({ ok: true, total: r.total });
  } catch (e) { return erro500(c, 'Falha ao ligar os requisitos à evidência', e); }
});

projetoRequisitosApp.put('/evidence/:evidenceId/validade', async (c) => {
  try {
    const v = await validateBody(c, evidenciaValidadeSchema);
    if (!v.success) return v.response;
    const r = await definirValidade(c.env.DB, c.req.param('projectId')!, c.req.param('evidenceId'), c.get('user').email, v.data.valido_ate);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao definir a validade da evidência', e); }
});

projetoRequisitosApp.get('/requisitos/lacunas', async (c) => {
  try {
    const fonte = c.req.query('fonte') || 'lgpd';
    const itens = await lacunasDaFonte(c.env.DB, c.req.param('projectId')!, fonte);
    return c.json({ fonte, resumo: resumoDeLacunas(itens), itens });
  } catch (e) { return erro500(c, 'Falha ao calcular as lacunas', e); }
});

/**
 * Requisito "não aplicável" no projeto (migration 0107): decisão de escopo, só da equipe da consultoria (o agente pela decisão
 * `niso_excluir_requisito`). O cliente vê a exclusão em GET .../requisitos/lacunas, mas não grava.
 */
const SO_EQUIPE = { error: 'Somente a consultoria decide se um requisito não se aplica' };
projetoRequisitosApp.put('/requisitos/:requisitoId/exclusao', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_EQUIPE, 403);
    const v = await validateBody(c, requisitoExclusaoSchema);
    if (!v.success) return v.response;
    const r = await excluirRequisito(c.env.DB, c.req.param('projectId')!, c.req.param('requisitoId'), v.data.justificativa, c.get('user').email);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao marcar o requisito como não aplicável', e); }
});

projetoRequisitosApp.delete('/requisitos/:requisitoId/exclusao', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json(SO_EQUIPE, 403);
    const r = await reincluirRequisito(c.env.DB, c.req.param('projectId')!, c.req.param('requisitoId'), c.get('user').email);
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
  } catch (e) { return erro500(c, 'Falha ao voltar a aplicar o requisito', e); }
});
