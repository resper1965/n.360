import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ehEquipeNess, erro500, logAudit, registraErro } from '../helpers';
import { politicaCriarSchema, politicaSecaoGerarSchema, politicaIncorporarSchema, politicaPromoverSchema, validateBody } from '../schemas';
import { criarDocumento, lerDocumento, salvarRascunho } from '../services/documentos';
import { definirRequisitosDoDocumento, requisitosDoDocumento, requisitosOcultos } from '../services/requisitos';
import { veFontesDoOt } from '../modulos';
import { coberturaDePoliticas } from '../services/cobertura-politicas';
import { conferirPedidosDoDocumento } from './pedidos';
import { contextoDaPolitica } from '../services/contexto-politica';
import { AVISO_INCOMPLETA, conferirSecao, lerSecoes, montarEsqueleto, trocarSecao } from '../services/politica-secoes';
import { ESQUELETO_PADRAO, TEMAS_POLITICA, esqueletoDo, requisitoDoControle } from '../data/temas-politica';
import { PoliticaSecaoAgent } from '../agents/politica-secao';

/** Políticas temáticas (spec 2026-10-23): criar pelo catálogo ou tema livre e gerar seção por seção. Faixa `nucleo`. */
export const politicasApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const doTema = (codigo: string) => (t: { id: string; titulo: string }) => t.titulo.startsWith(`${codigo} `) || t.titulo.startsWith(`${codigo}-`);

politicasApp.get('/politicas/temas', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT id, titulo FROM documentos WHERE project_id = ? AND tipo = 'politica'`).bind(c.req.param('projectId')!).all<{ id: string; titulo: string }>();
  return c.json({ temas: TEMAS_POLITICA.map((t) => ({ ...t, documento_id: results.find(doTema(t.codigo))?.id ?? null })) });
});

politicasApp.post('/politicas', async (c) => {
  try {
    const v = await validateBody(c, politicaCriarSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!;
    const ator = c.get('user').email;
    let titulo: string, esqueleto: string[], requisitos: string[];
    const dados = v.data;
    if ('tema' in dados) {
      const tema = TEMAS_POLITICA.find((t) => t.codigo === dados.tema);
      if (!tema) return c.json({ error: 'Tema desconhecido' }, 400);
      const { results } = await c.env.DB.prepare(`SELECT id, titulo FROM documentos WHERE project_id = ? AND tipo = 'politica'`).bind(projectId).all<{ id: string; titulo: string }>();
      const ja = results.find(doTema(tema.codigo));
      if (ja) return c.json({ error: 'Este tema já tem documento', id: ja.id }, 409);
      titulo = `${tema.codigo}-001 ${tema.titulo}`; esqueleto = esqueletoDo(tema); requisitos = tema.controles.map(requisitoDoControle);
    } else {
      titulo = dados.titulo; esqueleto = ESQUELETO_PADRAO; requisitos = dados.requisitos;
    }
    if (requisitos.length) {
      const { results: ok } = await c.env.DB.prepare('SELECT id FROM requisitos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(requisitos)).all<{ id: string }>();
      const ocultos = await requisitosOcultos(c.env.DB, requisitos, await veFontesDoOt(c.env.DB, c.get('user')));
      const desconhecidos = requisitos.filter((q) => !ok.some((o) => o.id === q) || ocultos.includes(q));
      if (desconhecidos.length) return c.json({ error: 'Requisito inexistente', desconhecidos }, 400);
    }
    const r = await criarDocumento(c.env.DB, projectId, ator, { tipo: 'politica', titulo, texto: montarEsqueleto(titulo, esqueleto) });
    if (!r.ok) return c.json({ error: r.error }, r.status);
    const lig = await definirRequisitosDoDocumento(c.env.DB, projectId, r.id, requisitos);
    if (lig && !lig.ok) return c.json({ error: 'Requisito inexistente', desconhecidos: lig.desconhecidos, id: r.id }, 400);
    await logAudit(c.env.DB, 'politica.criada', ator, `Documento ${r.id} criado: ${titulo}`, '', '', projectId);
    return c.json({ id: r.id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar a política', e); }
});

const SO_EQUIPE = { error: 'Só a equipe da consultoria organiza políticas' };
type DocOrg = { id: string; titulo: string; status: string; origem_control_id: string | null };
const docDe = (db: D1Database, projectId: string, id: string) =>
  db.prepare(`SELECT id, titulo, status, origem_control_id FROM documentos WHERE id = ? AND project_id = ? AND tipo = 'politica'`).bind(id, projectId).first<DocOrg>();

politicasApp.get('/politicas/organizar', async (c) => {
  if (!ehEquipeNess(c.get('user'))) return c.json(SO_EQUIPE, 403);
  try {
    const projectId = c.req.param('projectId')!;
    const { results } = await c.env.DB.prepare(
      `SELECT d.id, d.titulo, d.status, d.origem_control_id AS controle_id, cc.title AS controle, cc.requisito_id
         FROM documentos d LEFT JOIN compliance_controls cc ON cc.id = d.origem_control_id AND cc.project_id = d.project_id
        WHERE d.project_id = ? AND d.tipo = 'politica' AND d.status <> 'obsoleto' ORDER BY d.titulo`
    ).bind(projectId).all<{ id: string; titulo: string; status: string; controle_id: string | null; controle: string | null; requisito_id: string | null }>();
    const por_controle = results.filter((d) => d.controle_id);
    const tematicas = results.filter((d) => !d.controle_id).map(({ id, titulo, status }) => ({ id, titulo, status }));
    return c.json({ por_controle, tematicas, sem_cobertura: (await coberturaDePoliticas(c.env.DB, projectId)).sem_cobertura });
  } catch (e) { return erro500(c, 'Falha ao listar as políticas', e); }
});

politicasApp.post('/politicas/organizar/incorporar', async (c) => {
  if (!ehEquipeNess(c.get('user'))) return c.json(SO_EQUIPE, 403);
  try {
    const v = await validateBody(c, politicaIncorporarSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!, db = c.env.DB, { origem, destino } = v.data;
    const [o, d] = await Promise.all([docDe(db, projectId, origem), docDe(db, projectId, destino)]);
    if (!o || !d) return c.json({ error: 'Documento não encontrado' }, 404);
    if (origem === destino) return c.json({ error: 'Origem e destino são o mesmo documento' }, 400);
    if (!o.origem_control_id || o.status === 'obsoleto') return c.json({ error: 'A origem tem de ser uma política por controle em uso' }, 400);
    if (d.origem_control_id || d.status === 'obsoleto') return c.json({ error: 'O destino tem de ser uma política temática em uso' }, 400);
    const ctl = await db.prepare('SELECT requisito_id FROM compliance_controls WHERE id = ? AND project_id = ?').bind(o.origem_control_id, projectId).first<{ requisito_id: string | null }>();
    if (!ctl?.requisito_id) return c.json({ error: 'O controle não está no catálogo de requisitos; ligue a mão' }, 409);
    const ids = [...new Set([...(await requisitosDoDocumento(db, projectId, destino, 'documento', true)).map((r) => r.id), ctl.requisito_id])];
    const { results: ok } = await db.prepare('SELECT id FROM requisitos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all<{ id: string }>();
    const ocultos = await requisitosOcultos(db, ids, await veFontesDoOt(db, c.get('user')));
    const desconhecidos = ids.filter((q) => !ok.some((o) => o.id === q) || ocultos.includes(q));
    if (desconhecidos.length) return c.json({ error: 'Requisito inexistente', desconhecidos }, 400);
    // Um batch só: ligar e aposentar juntos; a origem já obsoleta (corrida) não liga nada e dá 409.
    const emUso = `EXISTS (SELECT 1 FROM documentos WHERE id = ?3 AND project_id = ?2 AND status <> 'obsoleto')`;
    const rs = await db.batch([
      db.prepare(`DELETE FROM documento_requisitos WHERE documento_id = ?1 AND project_id = ?2 AND ${emUso}`).bind(destino, projectId, origem),
      db.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) SELECT ?1, value, ?2 FROM json_each(?4) WHERE ${emUso}`).bind(destino, projectId, origem, JSON.stringify(ids)),
      db.prepare(`UPDATE documentos SET status = 'obsoleto', updated_at = datetime('now') WHERE id = ? AND project_id = ? AND status <> 'obsoleto'`).bind(origem, projectId),
    ]);
    if (!rs[2].meta.changes) return c.json({ error: 'A origem já foi incorporada ou aposentada' }, 409);
    await logAudit(db, 'politica.incorporada', c.get('user').email, `Documento ${origem} incorporado a ${destino}`, '', '', projectId);
    return c.json({ ok: true, requisitos: ids.length });
  } catch (e) { return erro500(c, 'Falha ao incorporar a política', e); }
});

politicasApp.post('/documentos/:id/promover', async (c) => {
  if (!ehEquipeNess(c.get('user'))) return c.json(SO_EQUIPE, 403);
  try {
    const v = await validateBody(c, politicaPromoverSchema);
    if (!v.success) return v.response;
    const projectId = c.req.param('projectId')!, id = c.req.param('id'), db = c.env.DB, ator = c.get('user').email;
    const doc = await docDe(db, projectId, id);
    if (!doc) return c.json({ error: 'Documento não encontrado' }, 404);
    if (!doc.origem_control_id || doc.status === 'obsoleto') return c.json({ error: 'Só política por controle em uso pode ser promovida' }, 400);
    const { results: ok } = await db.prepare('SELECT id FROM requisitos WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(v.data.requisitos)).all<{ id: string }>();
    const ocultos = await requisitosOcultos(db, v.data.requisitos, await veFontesDoOt(db, c.get('user')));
    const desconhecidos = v.data.requisitos.filter((q) => !ok.some((o) => o.id === q) || ocultos.includes(q));
    if (desconhecidos.length) return c.json({ error: 'Requisito inexistente', desconhecidos }, 400);
    // Título, requisitos e origem num batch só: ou muda tudo ou nada.
    const reqs = JSON.stringify([...new Set(v.data.requisitos)]);
    await db.batch([
      db.prepare('UPDATE documentos SET titulo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?').bind(v.data.titulo, id, projectId),
      db.prepare('DELETE FROM documento_requisitos WHERE documento_id = ? AND project_id = ?').bind(id, projectId),
      db.prepare('INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) SELECT ?1, value, ?2 FROM json_each(?3)').bind(id, projectId, reqs),
      db.prepare('UPDATE documentos SET origem_control_id = NULL WHERE id = ? AND project_id = ?').bind(id, projectId),
    ]);
    if (v.data.titulo !== doc.titulo) await conferirPedidosDoDocumento(c, 'documento', id, projectId);
    await logAudit(db, 'politica.promovida', ator, `Documento ${id} promovido a política temática: ${v.data.titulo}`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao promover a política', e); }
});

politicasApp.post('/documentos/:id/secoes/:n/gerar', async (c) => {
  const projectId = c.req.param('projectId')!;
  const id = c.req.param('id');
  const n = Number(c.req.param('n'));
  const ator = c.get('user').email;
  const db = c.env.DB;
  try {
    // A tela chama sem corpo; o agente manda {}. Corpo presente passa pelo esquema.
    if ((await c.req.text()).trim()) { const v = await validateBody(c, politicaSecaoGerarSchema); if (!v.success) return v.response; }
    const doc = await lerDocumento(db, projectId, id);
    if (!doc) return c.json({ error: 'Documento não encontrado' }, 404);
    const d = doc as Record<string, unknown>;
    if (d.tipo !== 'politica' || d.status === 'obsoleto') return c.json({ error: 'Só política em uso gera seções' }, 409);
    const versoes = doc.versoes as { estado: string; texto: string }[];
    const base = versoes.find((x) => x.estado === 'rascunho') ?? versoes.find((x) => x.estado === 'vigente');
    const secoes = base ? lerSecoes(base.texto) : [];
    if (!secoes.length) return c.json({ error: 'O documento não tem seções para gerar' }, 409);
    const alvo = secoes.find((s) => s.n === n);
    if (!alvo) return c.json({ error: 'Seção não encontrada' }, 404);

    const { results } = await db.prepare('SELECT requisito_id FROM documento_requisitos WHERE documento_id = ? AND project_id = ?').bind(id, projectId).all<{ requisito_id: string }>();
    const contexto = await contextoDaPolitica(db, projectId, results.map((x) => x.requisito_id), id);
    const agente = new PoliticaSecaoAgent(c.env.AI, db, c.env);
    const p = { titulo: String(d.titulo), secao: alvo.titulo, outras: secoes.filter((s) => s.n !== n).map((s) => s.titulo), contexto };

    let corpo: string, cortada: boolean;
    try {
      const a = await agente.gerarSecao(p);
      corpo = a.content.trim(); cortada = a.cortada;
      if (cortada) {
        const b = await agente.gerarSecao({ ...p, continuar: corpo });
        corpo = (a.content + b.content).trim(); cortada = b.cortada;
        if (cortada) corpo += `\n\n${AVISO_INCOMPLETA}`;
      }
    } catch (e) {
      registraErro(c, e);
      return c.json({ error: 'A IA não respondeu. Tente de novo.' }, 502);
    }

    const motivo = conferirSecao(cortada ? corpo.replace(AVISO_INCOMPLETA, '') : corpo);
    if (motivo) return c.json({ error: 'A resposta da IA foi recusada', motivo }, 422);
    // Relê: a pessoa pode ter editado outra seção durante a geração (só a seção n é trocada no texto atual).
    const atual = await lerDocumento(db, projectId, id);
    const vs = (atual?.versoes ?? []) as { estado: string; texto: string }[];
    const fresca = (vs.find((x) => x.estado === 'rascunho') ?? vs.find((x) => x.estado === 'vigente'))?.texto;
    const novo = fresca ? trocarSecao(fresca, n, corpo) : null;
    if (!novo) return c.json({ error: 'a seção mudou durante a geração' }, 409);
    const s = await salvarRascunho(db, projectId, id, ator, novo, 'gerador');
    if (!s.ok) return c.json({ error: s.error }, s.status);
    await logAudit(db, 'politica.secao_gerada', ator, `Documento ${id}: seção ${n}${cortada ? ' (incompleta)' : ''}`, '', '', projectId);
    return c.json({ secao: lerSecoes(novo).find((x) => x.n === n), cortada });
  } catch (e) { return erro500(c, 'Falha ao gerar a seção', e); }
});
