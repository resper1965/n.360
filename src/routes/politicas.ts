import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500, logAudit, registraErro } from '../helpers';
import { politicaCriarSchema, validateBody } from '../schemas';
import { criarDocumento, lerDocumento, salvarRascunho } from '../services/documentos';
import { definirRequisitosDoDocumento } from '../services/requisitos';
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
    const r = await criarDocumento(c.env.DB, projectId, ator, { tipo: 'politica', titulo, texto: montarEsqueleto(titulo, esqueleto) });
    if (!r.ok) return c.json({ error: r.error }, r.status);
    const lig = await definirRequisitosDoDocumento(c.env.DB, projectId, r.id, requisitos);
    if (lig && !lig.ok) return c.json({ error: 'Requisito inexistente', desconhecidos: lig.desconhecidos, id: r.id }, 400);
    await logAudit(c.env.DB, 'politica.criada', ator, `Documento ${r.id} criado: ${titulo}`, '', '', projectId);
    return c.json({ id: r.id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar a política', e); }
});

politicasApp.post('/documentos/:id/secoes/:n/gerar', async (c) => {
  const projectId = c.req.param('projectId')!;
  const id = c.req.param('id');
  const n = Number(c.req.param('n'));
  const ator = c.get('user').email;
  const db = c.env.DB;
  try {
    const doc = await lerDocumento(db, projectId, id);
    if (!doc) return c.json({ error: 'Documento não encontrado' }, 404);
    const versoes = doc.versoes as { estado: string; texto: string }[];
    const base = versoes.find((x) => x.estado === 'rascunho') ?? versoes.find((x) => x.estado === 'vigente');
    const secoes = base ? lerSecoes(base.texto) : [];
    if (!secoes.length) return c.json({ error: 'O documento não tem seções para gerar' }, 409);
    const alvo = secoes.find((s) => s.n === n);
    if (!alvo) return c.json({ error: 'Seção não encontrada' }, 404);

    const { results } = await db.prepare('SELECT requisito_id FROM documento_requisitos WHERE documento_id = ? AND project_id = ?').bind(id, projectId).all<{ requisito_id: string }>();
    const contexto = await contextoDaPolitica(db, projectId, results.map((x) => x.requisito_id), id);
    const agente = new PoliticaSecaoAgent(c.env.AI, db, c.env);
    const p = { titulo: String((doc as Record<string, unknown>).titulo), secao: alvo.titulo, outras: secoes.filter((s) => s.n !== n).map((s) => s.titulo), contexto };

    let corpo: string, cortada: boolean;
    try {
      const a = await agente.gerarSecao(p);
      corpo = a.content.trim(); cortada = a.cortada;
      if (cortada) {
        const b = await agente.gerarSecao({ ...p, continuar: corpo });
        corpo = `${corpo}${b.content}`.trim(); cortada = b.cortada;
        if (cortada) corpo += `\n\n${AVISO_INCOMPLETA}`;
      }
    } catch (e) {
      registraErro(c, e);
      return c.json({ error: 'A IA não respondeu. Tente de novo.' }, 502);
    }

    const motivo = conferirSecao(cortada ? corpo.replace(AVISO_INCOMPLETA, '') : corpo);
    if (motivo) return c.json({ error: 'A resposta da IA foi recusada', motivo }, 422);
    const novo = trocarSecao(base!.texto, n, corpo)!;
    const s = await salvarRascunho(db, projectId, id, ator, novo, 'gerador');
    if (!s.ok) return c.json({ error: s.error }, s.status);
    await logAudit(db, 'politica.secao_gerada', ator, `Documento ${id}: seção ${n}${cortada ? ' (incompleta)' : ''}`, '', '', projectId);
    return c.json({ secao: lerSecoes(novo).find((x) => x.n === n), cortada });
  } catch (e) { return erro500(c, 'Falha ao gerar a seção', e); }
});
