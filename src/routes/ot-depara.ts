import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Bindings, Variables } from '../index';
import { erro500, genId, logAudit } from '../helpers';
import { livreSemPii, TETO_ACHADOS_SESSAO } from '../schemas/ot';
import { chavesOt } from '../services/ot-cifra';
import { sitesPermitidos, TETO_LEITURA_OT } from '../services/ot-inventario';
import { LIMITES_PLANILHA, lerAteTeto, lerPlanilha } from '../services/ot-planilha';
import { prepararAchado, zonasDoSite } from '../services/ot-levantamento';
import { achadosDoTexto, aplicarMapeamento, assinaturaDoCabecalho, CAMPOS_DEPARA, proporMapeamento, tetoDepara, TETO_DEPARA, type Mapeamento } from '../services/ot-depara';
import { lerLevantamento } from './ot';
import { dividirEmTrechos, lerDocumento, LIMITES_TEXTO } from '../services/ot-documento';
import { RecusaIa } from '../services/ot-ia';

/**
 * De-para de planilha do n.ot (L4). Montado no mesmo prefixo, LOGO DEPOIS do `otApp` (src/index.ts): herda a recusa de chave de API e
 * agente (P0-2), a trava de escrita e a falha fechada sem as chaves em `/levantamentos/*`. O arquivo é lido em memória e descartado
 * (P0-3): nunca vai ao R2 nem ao `toMarkdown`; à IA só vão cabeçalho e amostra, ou trechos do texto, mascarados (ot-depara.ts).
 */
export const otDeparaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type C = Context<{ Bindings: Bindings; Variables: Variables }>;

const contexto = async (c: C) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId')!;
  return { db: c.env.DB, user, projectId, sites: await sitesPermitidos(c.env.DB, user, projectId) };
};
/** P1-7: só ids e contagens, nunca nome de arquivo, cabeçalho ou conteúdo. */
const trilha = (c: C, acao: string, projectId: string, detalhe: string, entidade?: { tipo: string; id: string }) =>
  logAudit(c.env.DB, acao, c.get('user').email, detalhe, '', c.req.header('CF-Connecting-IP') ?? '', projectId, entidade);

/** Travas comuns: sessão documental aberta + arquivo do campo `file` lido em memória (5 MB). Devolve a resposta de erro ou os dados. */
async function sessaoEArquivo(c: C, rotulo: 'planilha' | 'documento') {
  const ctx = await contexto(c);
  const lev = await lerLevantamento(ctx.db, ctx.projectId, ctx.sites, c.req.param('id')!);
  if (!lev) return c.json({ error: 'Levantamento não encontrado' }, 404);
  if (lev.tipo !== 'documento' || lev.situacao !== 'aberto') return c.json({ error: `De-para de ${rotulo} só em levantamento documental aberto` }, 409);
  const teto = LIMITES_PLANILHA.bytes + 64 * 1024;
  if (Number(c.req.header('Content-Length') || 0) > teto) return c.json({ error: 'Arquivo acima de 5 MB' }, 413);
  const bruto = await lerAteTeto(c.req.raw, teto);
  if (!bruto) return c.json({ error: 'Arquivo acima de 5 MB' }, 413);
  const fd = await new Response(bruto, { headers: { 'Content-Type': c.req.header('Content-Type') ?? '' } }).formData().catch(() => null);
  const file = fd?.get('file');
  if (!fd || !(file instanceof File)) return c.json({ error: `Envie ${rotulo === 'planilha' ? 'a planilha' : 'o documento'} no campo "file"` }, 400);
  return { ...ctx, lev, fd, file };
}

async function sessaoEPlanilha(c: C) {
  const s = await sessaoEArquivo(c, 'planilha');
  if (s instanceof Response) return s;
  const lida = await lerPlanilha(s.file.name, await s.file.arrayBuffer());
  if ('erro' in lida) return c.json({ error: lida.erro }, 400);
  const [cabecalho = [], ...linhas] = lida.linhas;
  if (!cabecalho.some((x) => x.trim())) return c.json({ error: 'A planilha não tem cabeçalho' }, 400);
  return { ...s, cabecalho, linhas };
}

const TETO_HORA = () => ({ error: `Limite por hora do de-para atingido (${TETO_DEPARA.pessoa} por pessoa e ${TETO_DEPARA.projeto} por projeto). Tente de novo mais tarde.`,
  codigo: 'teto_por_hora' });

otDeparaApp.post('/levantamentos/:id/depara/planilha/proposta', async (c) => {
  try {
    const s = await sessaoEPlanilha(c);
    if (s instanceof Response) return s;
    const { db, user, projectId, lev, cabecalho, linhas } = s;
    const perfil = await db.prepare(`SELECT id, nome, fonte, mapeamento FROM ot_perfis_depara WHERE project_id = ? AND assinatura = ? AND status = 'ativo' LIMIT 1`)
      .bind(projectId, await assinaturaDoCabecalho(cabecalho)).first<{ id: string; nome: string; fonte: string; mapeamento: string }>();
    let r: { mapeamento: Mapeamento; origem: 'perfil' | 'ia' | 'cabecalho'; perfil?: { id: string; nome: string; fonte: string }; aviso?: string };
    if (perfil) {
      const { mapeamento, ...p } = perfil;
      r = { mapeamento: JSON.parse(mapeamento) as Mapeamento, origem: 'perfil', perfil: p };
    } else {
      if (!await tetoDepara(db, user.id, projectId)) {
        return c.json(TETO_HORA(), 429);
      }
      r = await proporMapeamento(c.env, cabecalho, linhas.slice(0, 5));
    }
    await trilha(c, 'ot.depara.proposta', projectId, `Proposta de de-para para o levantamento ${lev.id}: ${cabecalho.length} colunas, origem ${r.origem}`,
      { tipo: 'ot_levantamento', id: lev.id });
    return c.json({ cabecalho, ...r, linhas: linhas.length });
  } catch (e) { return erro500(c, 'Falha ao propor o de-para', e); }
});

const mapeamentoSchema = z.record(z.string().regex(/^\d{1,2}$/), z.enum(CAMPOS_DEPARA));
const perfilSchema = z.object({ perfil_nome: livreSemPii(100, 1).optional(), perfil_fonte: livreSemPii(200).optional() });
const BLOCO = 50;
/** Cada INSERT confere o teto da sessão na hora (D1 roda o lote em série): pedidos simultâneos não passam de 2.000. */
const INSERIR_ACHADO = (origem: 'consultor' | 'ia') => `INSERT INTO ot_achados (id, project_id, levantamento_id, entidade, dados, erros, evidencia, origem, criado_por)
  SELECT ?, ?, ?, 'ativo', ?, ?, ?, '${origem}', ? WHERE (SELECT count(*) FROM ot_achados WHERE levantamento_id = ?) < ${TETO_ACHADOS_SESSAO}`;
/** Grava em blocos de 50 e devolve quantos entraram (o resto bateu no teto). */
async function gravarAchados(db: D1Database, stmts: D1PreparedStatement[]): Promise<number> {
  let criados = 0;
  for (let i = 0; i < stmts.length; i += BLOCO) for (const r of await db.batch(stmts.slice(i, i + BLOCO))) criados += r.meta.changes;
  return criados;
}

otDeparaApp.post('/levantamentos/:id/depara/planilha/aplicar', async (c) => {
  try {
    const s = await sessaoEPlanilha(c);
    if (s instanceof Response) return s;
    const { db, user, projectId, lev, fd, cabecalho, linhas } = s;
    let bruto: unknown;
    try { bruto = JSON.parse(String(fd.get('mapeamento') ?? '')); } catch { return c.json({ error: 'mapeamento inválido: envie um objeto JSON' }, 400); }
    const m = mapeamentoSchema.safeParse(bruto);
    if (!m.success) return c.json({ error: 'mapeamento inválido: índice de coluna → campo do ativo' }, 400);
    if (!Object.keys(m.data).length) return c.json({ error: 'Escolha ao menos uma coluna' }, 400);
    if (Object.keys(m.data).some((i) => Number(i) >= cabecalho.length)) return c.json({ error: 'mapeamento inválido: coluna fora do cabeçalho' }, 400);
    if (new Set(Object.values(m.data)).size !== Object.values(m.data).length) return c.json({ error: 'mapeamento inválido: campo repetido' }, 400);
    const opcional = (k: string) => { const v = fd.get(k); return typeof v === 'string' && v.trim() ? v : undefined; };
    const p = perfilSchema.safeParse({ perfil_nome: opcional('perfil_nome'), perfil_fonte: opcional('perfil_fonte') });
    if (!p.success) return c.json({ error: p.error.issues[0].message }, 400);

    // Número da linha na planilha (cabeçalho = 1) para a evidência; linha sem campo mapeado é pulada.
    const itens = linhas.flatMap((l, i) => aplicarMapeamento([l], m.data).map((dados) => ({ dados, linha: i + 2 })));
    const n = await db.prepare('SELECT count(*) AS n FROM ot_achados WHERE levantamento_id = ?').bind(lev.id).first<{ n: number }>();
    if ((n?.n ?? 0) >= TETO_ACHADOS_SESSAO) return c.json({ error: `Limite de ${TETO_ACHADOS_SESSAO} achados por levantamento` }, 400);

    const chaves = chavesOt(c.env)!;
    const zonas = await zonasDoSite(db, projectId, lev.site_id);
    const stmts: D1PreparedStatement[] = [];
    let comAviso = 0;
    for (const it of itens) {
      const id = genId(); // o mesmo id na AAD da cifra e na linha
      const r = await prepararAchado(chaves, projectId, lev.site_id, id, it.dados, zonas);
      if (r.erros.length) comAviso++;
      stmts.push(db.prepare(INSERIR_ACHADO('consultor')).bind(id, projectId, lev.id, JSON.stringify(r.dados), JSON.stringify(r.erros),
        `Planilha importada, linha ${it.linha}`, user.id, lev.id));
    }
    const criados = await gravarAchados(db, stmts);

    let perfilId: string | undefined;
    if (p.data.perfil_nome) {
      // Perfil removido mantém o lugar da assinatura: salvar de novo o reativa.
      const r = await db.prepare(`INSERT INTO ot_perfis_depara (id, project_id, nome, fonte, assinatura, mapeamento, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, assinatura) DO UPDATE SET nome = excluded.nome, fonte = excluded.fonte, mapeamento = excluded.mapeamento,
        status = 'ativo', updated_at = CURRENT_TIMESTAMP RETURNING id`)
        .bind(genId(), projectId, p.data.perfil_nome, p.data.perfil_fonte ?? '', await assinaturaDoCabecalho(cabecalho), JSON.stringify(m.data), user.id)
        .first<{ id: string }>();
      perfilId = r!.id;
    }
    await trilha(c, 'ot.depara.aplicado', projectId, `${criados} achados do levantamento ${lev.id} por de-para; perfil salvo: ${perfilId ? 'sim' : 'não'}`,
      { tipo: 'ot_levantamento', id: lev.id });
    return c.json({ criados, com_aviso: comAviso, ...(perfilId && { perfil_id: perfilId }) }, 201);
  } catch (e) { return erro500(c, 'Falha ao aplicar o de-para', e); }
});

otDeparaApp.post('/levantamentos/:id/depara/texto', async (c) => {
  try {
    const s = await sessaoEArquivo(c, 'documento');
    if (s instanceof Response) return s;
    const { db, user, projectId, lev, file } = s;
    const lido = await lerDocumento(file.name, await file.arrayBuffer());
    if ('erro' in lido) return c.json({ error: lido.erro }, lido.status);
    if (!lido.paragrafos.length) return c.json({ error: 'Documento sem texto' }, 400);
    const trechos = dividirEmTrechos(lido.paragrafos);
    if (trechos.length > LIMITES_TEXTO.trechos) return c.json({ error: 'Documento grande demais: divida em partes de até 60 mil caracteres' }, 400);
    if (!await tetoDepara(db, user.id, projectId)) return c.json(TETO_HORA(), 429); // uma tentativa por documento
    let r: Awaited<ReturnType<typeof achadosDoTexto>>;
    try { r = await achadosDoTexto(c.env, trechos); } catch (e) {
      if (e instanceof RecusaIa) return c.json({ error: e.message }, 422);
      throw e;
    }
    const n = await db.prepare('SELECT count(*) AS n FROM ot_achados WHERE levantamento_id = ?').bind(lev.id).first<{ n: number }>();
    const itens = r.itens.slice(0, Math.max(0, TETO_ACHADOS_SESSAO - (n?.n ?? 0)));

    const chaves = chavesOt(c.env)!;
    const zonas = await zonasDoSite(db, projectId, lev.site_id);
    const stmts: D1PreparedStatement[] = [];
    let comAviso = 0;
    for (const it of itens) {
      const id = genId(); // o mesmo id na AAD da cifra e na linha
      const p = await prepararAchado(chaves, projectId, lev.site_id, id, it.dados, zonas);
      if (p.erros.length) comAviso++;
      stmts.push(db.prepare(INSERIR_ACHADO('ia')).bind(id, projectId, lev.id, JSON.stringify(p.dados), JSON.stringify(p.erros), it.evidencia, user.id, lev.id));
    }
    const criados = await gravarAchados(db, stmts);
    const descartados = r.descartados + r.itens.length - criados; // o que passou do teto da sessão conta como descartado
    await trilha(c, 'ot.depara.texto', projectId,
      `${criados} achados do levantamento ${lev.id} sugeridos pela IA; ${descartados} descartados; ${r.trechos_pulados} trechos pulados`,
      { tipo: 'ot_levantamento', id: lev.id });
    return c.json({ criados, com_aviso: comAviso, descartados, trechos_pulados: r.trechos_pulados }, 201);
  } catch (e) { return erro500(c, 'Falha ao ler o documento', e); }
});

otDeparaApp.get('/depara/perfis', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`SELECT id, nome, fonte, updated_at FROM ot_perfis_depara WHERE project_id = ? AND status = 'ativo'
      ORDER BY nome LIMIT ${TETO_LEITURA_OT}`).bind(c.req.param('projectId')!).all();
    return c.json({ perfis: results });
  } catch (e) { return erro500(c, 'Falha ao listar os perfis de de-para', e); }
});

otDeparaApp.delete('/depara/perfis/:pid', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const pid = c.req.param('pid');
    const r = await c.env.DB.prepare(`UPDATE ot_perfis_depara SET status = 'removido', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ? AND status = 'ativo'`)
      .bind(pid, projectId).run();
    if (!r.meta.changes) return c.json({ error: 'Perfil não encontrado' }, 404);
    await trilha(c, 'ot.depara.perfil_removido', projectId, `Perfil de de-para ${pid} removido`, { tipo: 'ot_perfil_depara', id: pid });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao remover o perfil de de-para', e); }
});
