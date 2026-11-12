import { Hono, type Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500, genId, logAudit } from '../helpers';
import { validateBody } from '../schemas';
import {
  otSiteCriarSchema, otSiteAtualizarSchema, otZonaCriarSchema, otZonaAtualizarSchema, otAtivoCriarSchema, otAtivoAtualizarSchema,
  otFluxoCriarSchema, otFluxoAtualizarSchema, otAcessoCriarSchema, otRevelarSchema, otLoteManualSchema, otLoteRejeitarSchema, otItemRecusarSchema, otBaseAprovarSchema, otBaseDevolverSchema, otObraSchema,
  otLevantamentoCriarSchema, otLevantamentoAtualizarSchema, otAchadoCriarSchema, otAchadoAtualizarSchema, otEnviarAchadosSchema, TETO_ACHADOS_SESSAO,
  otAgenteInterruptorSchema, otAgenteChaveSchema, sensorCriarSchema, otDesvioTratarSchema, otDesvioAceitarSchema, otAvaliacaoSchema, otAvaliacaoEvidenciaSchema,
} from '../schemas/ot';
import { aadOt, chavesOt, cifrarEnderecos, decifrarOt, type ChavesOt } from '../services/ot-cifra';
import { avisar, entregarAbertos, projetarDesvios, type LinhaDesvio } from '../services/ot-desvio';
import { abrirObra, renovarObra, aprovarBase, contarAchados, devolverBase, pedirBase, situacaoDoSite } from '../services/ot-fase';
import { ESCRITAS_DO_TECNICO, FLUXO_VISIVEL, TETO_LEITURA_OT, podeAprovar, podeCriarLote, podeEditarOt, podeVerCompleto, serializarAtivo, sitesPermitidos, type LinhaAtivo } from '../services/ot-inventario';
import { aprovarLote, criarLote, recusarItem, rejeitarLote, serializarItem, toca431, AGORA_MS, TETO_ITENS, type LinhaItem } from '../services/ot-coleta';
import { conformidadeOt } from '../services/ot-conformidade';
import { confirmarAvaliacao, desligarEvidencia, ligarEvidencia, montarAssessment, relatorioConformidade, salvarAvaliacao } from '../services/ot-avaliacao';
import { emitirChaveColeta, VALIDADE_PADRAO_DIAS } from '../services/ot-agente';
import { emitirCredencialSensor, RecusaSensor, situacaoSensor, vencendo } from '../services/ot-sensor';
import { appUrl } from '../config/url';
import { avisarGestorArciber, semStepUp, tetoEstourado } from '../services/ot-stepup';
import { confrontarFluxo, fluxosDoSite, indiceFluxos, nomesDasPontas, pontasDoSite } from '../services/ot-fluxo-achado';
import { confrontar, enviarAoLote, indiceDoSite, prepararAchado, serializarAchado, zonasDoSite, DESFECHO_SQL, type LinhaAchado } from '../services/ot-levantamento';

/** n.ot (spec 2026-10-30-n-ot-modulo-n360-design). Faixa `ot` pelo segmento (`FAIXA_DO_SEGMENTO`): projeto E pessoa com o módulo. */
export const otApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type C = Context<{ Bindings: Bindings; Variables: Variables }>;

// Modelo de ameaças do n.ot, P0-2: o inventário de OT é dado sensível do ARCiber; chave de API e agente MCP ficam de fora
// (o agente também está em FORA_DO_AGENTE). Os sinais são os de middleware/auth.ts (`apikey:`) e middleware/agente.ts (`agente`).
otApp.use('*', async (c, next) => {
  const user = c.get('user');
  if (user.agente === true || user.id?.startsWith('apikey:')) {
    return c.json({ error: 'Forbidden: o n.ot não aceita chave de API nem agente — use a interface' }, 403);
  }
  await next();
});

// Escrita: só quem cadastra o inventário (org_user e client já param no allow-list de auth.ts; isto é a segunda trava). Criar lote
// de coleta e as escritas de levantamento são a exceção do técnico (org_user): ESCRITAS_DO_TECNICO, com o site conferido na rota.
otApp.on(['POST', 'PUT', 'PATCH', 'DELETE'], '*', async (c, next) => {
  const u = c.get('user');
  const doTecnico = (c.req.method === 'POST' || c.req.method === 'PUT') && ESCRITAS_DO_TECNICO.test(c.req.path.replace(/^.*?\/ot(?=\/)/, ''));
  if (!(doTecnico ? podeCriarLote(u) : podeEditarOt(u))) {
    return c.json({ error: 'Forbidden: seu papel não altera o inventário do n.ot' }, 403);
  }
  await next();
});

// P0-8, falha fechada: sem as duas chaves, nada de ativo nem de lote entra ou sai.
for (const rota of ['/ativos/*', '/lotes/*', '/levantamentos/*', '/achados']) {
  otApp.use(rota, async (c, next) => {
    if (!chavesOt(c.env)) return c.json({ error: 'Inventário de ativos indisponível: as chaves do n.ot não estão configuradas' }, 503);
    await next();
  });
}

interface Requisito { id: string; framework: string; codigo: string; titulo: string; descricao: string | null; categoria: string | null; versao: string; prazo_meses: number | null }

otApp.get('/requisitos', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, framework, codigo, titulo, descricao, categoria, versao, prazo_meses FROM ot_requisitos'
    ).all<Requisito>();
    // ordem natural (4.5.1 < 4.5.1.1 < 4.6.1): ORDER BY de texto poria 4.10 antes de 4.2
    results.sort((a, b) => a.framework.localeCompare(b.framework) || a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
    return c.json({ requisitos: results });
  } catch (e) {
    return erro500(c, 'Falha ao listar os requisitos do n.ot', e);
  }
});

// ─── apoio ──────────────────────────────────────────────────────────────────
const contexto = async (c: C) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId')!;
  return { db: c.env.DB, user, projectId, sites: await sitesPermitidos(c.env.DB, user, projectId) };
};
const NO_SITE = 'site_id IN (SELECT value FROM json_each(?))';
const NAO_ENCONTRADO = (c: C, o: string) => c.json({ error: `${o} não encontrado` }, 404);
const daLista = (sites: string, id: unknown) => typeof id === 'string' && (JSON.parse(sites) as string[]).includes(id);

/** Booleano vira 0/1 e lista vira JSON; ausente fica de fora (no UPDATE, mantém). */
const paraBanco = (d: Record<string, unknown>) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)
  .map(([k, v]) => [k, typeof v === 'boolean' ? Number(v) : Array.isArray(v) ? JSON.stringify(v) : v]));

/**
 * UPDATE dos campos validados (as chaves saem de esquema `.strict()`, nunca do corpo cru), preso ao projeto, ao site permitido e ao
 * registro ativo. 0 = não achou (inexistente, de outro projeto ou de site sem acesso: o mesmo 404, T27).
 */
async function atualizar(db: D1Database, tabela: 'ot_sites' | 'ot_zonas' | 'ot_ativos' | 'ot_fluxos', id: string, projectId: string, sites: string, campos: Record<string, unknown>) {
  const cols = Object.keys(campos);
  const doSite = tabela === 'ot_sites' ? 'id IN (SELECT value FROM json_each(?))' : NO_SITE;
  const r = await db.prepare(`UPDATE ${tabela} SET ${cols.map((k) => `${k} = ?`).concat(`updated_at = ${AGORA_MS}`).join(', ')}
    WHERE id = ? AND project_id = ? AND status = 'ativo' AND ${doSite}`).bind(...cols.map((k) => campos[k]), id, projectId, sites).run();
  return r.meta.changes;
}

/** Zona/ativo citado no corpo: ativo, do projeto e de site permitido (P1-3); `site` restringe ao mesmo site. Devolve o campo ruim. */
async function refInvalida(db: D1Database, projectId: string, sites: string, corpo: Record<string, unknown>, campos: [string, 'ot_zonas' | 'ot_ativos'][], site?: string) {
  for (const [campo, tabela] of campos) {
    const id = corpo[campo];
    if (id === undefined || id === null) continue;
    const achou = await db.prepare(`SELECT 1 FROM ${tabela} WHERE id = ? AND project_id = ? AND status = 'ativo' AND ${NO_SITE} AND (? IS NULL OR site_id = ?)`)
      .bind(id, projectId, sites, site ?? null, site ?? null).first();
    if (!achou) return campo;
  }
  return null;
}
const refRuim = (c: C, campo: string) => c.json({ error: `Referência inválida: ${campo}` }, 400);

const FALTA_4_3_1 = 'Ativo do ARCiber exige os campos mínimos do 4.3.1 da RO-CB.BR.01: categoria, tipo de dispositivo, fabricante, função, IP ou MAC, ao menos um protocolo/porta e firmware/SO (ou "não aplicável")';
/** CHECK do banco que o esquema não cobre (depende do registro inteiro): a mensagem certa em vez de 500. */
function recusaDoBanco(c: C, e: unknown) {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('ot_ativos_4_3_1')) return c.json({ error: FALTA_4_3_1 }, 400);
  if (m.includes('CHECK constraint failed') && m.includes('origem')) return c.json({ error: 'Fluxo precisa de uma ponta de cada lado (ativo ou zona, não os dois); fluxo externo, de ao menos uma' }, 400);
  return null;
}

/** P1-7: a trilha do n.ot leva só ids e contagens, nunca nome, IP ou MAC. */
const trilha = (c: C, acao: string, projectId: string, detalhe: string, entidade?: { tipo: string; id: string }, justificativa = '') =>
  logAudit(c.env.DB, acao, c.get('user').email, detalhe, justificativa, c.req.header('CF-Connecting-IP') ?? '', projectId, entidade);

// ─── sites ──────────────────────────────────────────────────────────────────
otApp.get('/sites', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const { results } = await db.prepare(`SELECT id, nome, tipo, criticidade, localizacao, faixas_internas, status, created_at, updated_at FROM ot_sites
      WHERE project_id = ? AND id IN (SELECT value FROM json_each(?)) ORDER BY nome LIMIT ${TETO_LEITURA_OT}`).bind(projectId, sites).all<{ faixas_internas: string }>();
    return c.json({ sites: results.map((r) => ({ ...r, faixas_internas: JSON.parse(r.faixas_internas) as string[] })) });
  } catch (e) { return erro500(c, 'Falha ao listar os sites', e); }
});

otApp.post('/sites', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, otSiteCriarSchema);
    if (!v.success) return v.response;
    const id = genId();
    await c.env.DB.prepare('INSERT INTO ot_sites (id, project_id, nome, tipo, criticidade, localizacao, faixas_internas) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, projectId, v.data.nome, v.data.tipo ?? 'outro', v.data.criticidade ?? null, v.data.localizacao ?? null, JSON.stringify(v.data.faixas_internas ?? [])).run();
    await trilha(c, 'ot.site.criado', projectId, `Site ${id} criado`, { tipo: 'ot_site', id });
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o site', e); }
});

otApp.put('/sites/:id', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const v = await validateBody(c, otSiteAtualizarSchema);
    if (!v.success) return v.response;
    const campos = paraBanco(v.data);
    if (!Object.keys(campos).length) return c.json({ error: 'Nada a alterar' }, 400);
    if (!await atualizar(db, 'ot_sites', c.req.param('id'), projectId, sites, campos)) return NAO_ENCONTRADO(c, 'Site');
    await trilha(c, 'ot.site.atualizado', projectId, `Site ${c.req.param('id')} atualizado`, { tipo: 'ot_site', id: c.req.param('id') });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o site', e); }
});

// ─── zonas ──────────────────────────────────────────────────────────────────
otApp.get('/zonas', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const { results } = await db.prepare(`SELECT id, site_id, nome, nivel_purdue, tipo, descricao, status, created_at, updated_at FROM ot_zonas
      WHERE project_id = ? AND status = 'ativo' AND ${NO_SITE} AND (? IS NULL OR site_id = ?) ORDER BY nivel_purdue, nome`)
      .bind(projectId, sites, c.req.query('site_id') ?? null, c.req.query('site_id') ?? null).all();
    return c.json({ zonas: results });
  } catch (e) { return erro500(c, 'Falha ao listar as zonas', e); }
});

otApp.post('/zonas', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const v = await validateBody(c, otZonaCriarSchema);
    if (!v.success) return v.response;
    if (!daLista(sites, v.data.site_id)) return refRuim(c, 'site_id');
    const id = genId();
    await db.prepare('INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue, tipo, descricao) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, projectId, v.data.site_id, v.data.nome, v.data.nivel_purdue, v.data.tipo ?? 'outra', v.data.descricao ?? null).run();
    await trilha(c, 'ot.zona.criada', projectId, `Zona ${id} criada no site ${v.data.site_id}`, { tipo: 'ot_zona', id });
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar a zona', e); }
});

otApp.put('/zonas/:id', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const v = await validateBody(c, otZonaAtualizarSchema);
    if (!v.success) return v.response;
    const campos = paraBanco(v.data);
    if (!Object.keys(campos).length) return c.json({ error: 'Nada a alterar' }, 400);
    if (!await atualizar(db, 'ot_zonas', c.req.param('id'), projectId, sites, campos)) return NAO_ENCONTRADO(c, 'Zona');
    await trilha(c, 'ot.zona.atualizada', projectId, `Zona ${c.req.param('id')} atualizada`, { tipo: 'ot_zona', id: c.req.param('id') });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar a zona', e); }
});

// ─── ativos ─────────────────────────────────────────────────────────────────
const COLUNAS_ATIVO = `id, project_id, site_id, zona_id, nome, no_arciber, categoria_arciber, tipo_dispositivo, fabricante, modelo, funcao,
  ip_cifrado, mac_cifrado, ip_hash, mac_hash, protocolos_portas, firmware_so_versao, firmware_nao_aplicavel, ultima_verificacao_em,
  verificado_por, status, created_at, updated_at`;

const enderecos = (chaves: ChavesOt, projectId: string, id: string, d: { ip?: string | null; mac?: string | null }) =>
  cifrarEnderecos(chaves, projectId, 'ot_ativos', id, d);

/** Ativos pelo serializador único; uma linha de trilha por requisição que saiu sem máscara (P1-7), com a contagem. */
async function responderAtivos(c: C, projectId: string, linhas: LinhaAtivo[], completo: boolean, justificativa = '') {
  const chaves = chavesOt(c.env)!;
  const ativos = await Promise.all(linhas.map((l) => serializarAtivo(l, completo, chaves)));
  const sensiveis = completo ? linhas.filter((l) => l.ip_cifrado || l.mac_cifrado).length : 0;
  if (sensiveis) {
    await trilha(c, 'ot.inventario.ver_sensivel', projectId, `${sensiveis} ativo(s) com IP/MAC sem máscara`,
      linhas.length === 1 ? { tipo: 'ot_ativo', id: linhas[0].id } : undefined, justificativa);
  }
  return ativos;
}

otApp.get('/ativos', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const site = c.req.query('site_id') ?? null;
    const { results } = await db.prepare(`SELECT ${COLUNAS_ATIVO} FROM ot_ativos WHERE project_id = ? AND status = 'ativo' AND ${NO_SITE}
      AND (? IS NULL OR site_id = ?) ORDER BY nome`).bind(projectId, sites, site, site).all<LinhaAtivo>();
    return c.json({ ativos: await responderAtivos(c, projectId, results, await podeVerCompleto(db, user, projectId)) });
  } catch (e) { return erro500(c, 'Falha ao listar os ativos', e); }
});

const lerAtivo = (db: D1Database, id: string, projectId: string, sites: string) =>
  db.prepare(`SELECT ${COLUNAS_ATIVO} FROM ot_ativos WHERE id = ? AND project_id = ? AND status = 'ativo' AND ${NO_SITE}`).bind(id, projectId, sites).first<LinhaAtivo>();

otApp.get('/ativos/:id', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const linha = await lerAtivo(db, c.req.param('id'), projectId, sites);
    if (!linha) return NAO_ENCONTRADO(c, 'Ativo');
    return c.json((await responderAtivos(c, projectId, [linha], await podeVerCompleto(db, user, projectId)))[0]);
  } catch (e) { return erro500(c, 'Falha ao ler o ativo', e); }
});

// platform_admin vê mascarado por padrão (spec §5): revelar é ação explícita, com motivo, registrada em audit_logs. P1-1: TOTP nos
// últimos 10 min, teto por hora e aviso ao Gestor ARCiber (services/ot-stepup.ts).
otApp.post('/ativos/:id/revelar', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    if (user.role !== 'platform_admin' && !await podeVerCompleto(db, user, projectId)) return c.json({ error: 'Forbidden: seu papel não revela IP/MAC' }, 403);
    const sem = await semStepUp(c);
    if (sem) return sem;
    const v = await validateBody(c, otRevelarSchema);
    if (!v.success) return v.response;
    const linha = await lerAtivo(db, c.req.param('id'), projectId, sites);
    if (!linha) return NAO_ENCONTRADO(c, 'Ativo');
    const teto = await tetoEstourado(c, 'revelar', projectId);
    if (teto) return teto;
    const [ativo] = await responderAtivos(c, projectId, [linha], true, v.data.justificativa);
    await avisarGestorArciber(c, projectId, `revelou o IP/MAC do ativo ${linha.id}`, v.data.justificativa);
    return c.json(ativo);
  } catch (e) { return erro500(c, 'Falha ao revelar o ativo', e); }
});

otApp.post('/ativos', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const v = await validateBody(c, otAtivoCriarSchema);
    if (!v.success) return v.response;
    const d = v.data;
    if (!daLista(sites, d.site_id)) return refRuim(c, 'site_id');
    const ruim = await refInvalida(db, projectId, sites, d, [['zona_id', 'ot_zonas']], d.site_id);
    if (ruim) return refRuim(c, ruim);
    const id = genId();
    const e = await enderecos(chavesOt(c.env)!, projectId, id, { ip: d.ip ?? null, mac: d.mac ?? null });
    try {
      await db.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, zona_id, nome, no_arciber, categoria_arciber, tipo_dispositivo, fabricante,
          modelo, funcao, ip_cifrado, mac_cifrado, ip_hash, mac_hash, protocolos_portas, firmware_so_versao, firmware_nao_aplicavel)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        id, projectId, d.site_id, d.zona_id ?? null, d.nome, Number(d.no_arciber ?? false), d.categoria_arciber ?? null, d.tipo_dispositivo ?? null,
        d.fabricante ?? null, d.modelo ?? null, d.funcao ?? null, e.ip_cifrado, e.mac_cifrado, e.ip_hash, e.mac_hash,
        JSON.stringify(d.protocolos_portas ?? []), d.firmware_so_versao ?? null, Number(d.firmware_nao_aplicavel ?? false),
      ).run();
    } catch (err) { const r = recusaDoBanco(c, err); if (r) return r; throw err; }
    await trilha(c, 'ot.ativo.criado', projectId, `Ativo ${id} criado no site ${d.site_id}`, { tipo: 'ot_ativo', id });
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o ativo', e); }
});

otApp.put('/ativos/:id', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const v = await validateBody(c, otAtivoAtualizarSchema);
    if (!v.success) return v.response;
    const atual = await lerAtivo(db, c.req.param('id'), projectId, sites);
    if (!atual) return NAO_ENCONTRADO(c, 'Ativo');
    const { ip, mac, ...resto } = v.data;
    const ruim = await refInvalida(db, projectId, sites, resto, [['zona_id', 'ot_zonas']], atual.site_id as string);
    if (ruim) return refRuim(c, ruim);
    const campos = { ...paraBanco(resto), ...await enderecos(chavesOt(c.env)!, projectId, atual.id, { ip, mac }) };
    if (!Object.keys(campos).length) return c.json({ error: 'Nada a alterar' }, 400);
    // Edição direta de campo do 4.3.1 não é verificação: zera a que havia (só a aprovação de lote com recoleta carimba).
    if (toca431(v.data)) Object.assign(campos, { verificado_por: null, ultima_verificacao_em: null });
    try {
      if (!await atualizar(db, 'ot_ativos', atual.id, projectId, sites, campos)) return NAO_ENCONTRADO(c, 'Ativo');
    } catch (err) { const r = recusaDoBanco(c, err); if (r) return r; throw err; }
    await trilha(c, 'ot.ativo.atualizado', projectId, `Ativo ${atual.id} atualizado`, { tipo: 'ot_ativo', id: atual.id });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o ativo', e); }
});

// ─── fluxos ─────────────────────────────────────────────────────────────────
interface LinhaFluxo { externo: number; via_vpn: number; [campo: string]: unknown }
/** 4.1.2/4.1.3: fluxo externo só por VPN. O cadastro aceita o fluxo como ele é (é o retrato) e o marca como violação. */
const comViolacao = (f: LinhaFluxo) => ({ ...f, externo: f.externo === 1, via_vpn: f.via_vpn === 1, violacoes: f.externo === 1 && f.via_vpn !== 1 ? ['4.1.2', '4.1.3'] : [] });

const PONTAS: [string, 'ot_zonas' | 'ot_ativos'][] = [['origem_ativo_id', 'ot_ativos'], ['origem_zona_id', 'ot_zonas'], ['destino_ativo_id', 'ot_ativos'], ['destino_zona_id', 'ot_zonas']];

otApp.get('/fluxos', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const site = c.req.query('site_id') ?? null;
    const { results } = await db.prepare(`SELECT f.id, f.site_id, f.origem_ativo_id, f.origem_zona_id, f.destino_ativo_id, f.destino_zona_id, f.protocolo,
        f.porta, f.direcao, f.finalidade, f.externo, f.via_vpn, f.status, f.created_at, f.updated_at
      FROM ot_fluxos f WHERE ${FLUXO_VISIVEL} AND (? IS NULL OR f.site_id = ?) ORDER BY f.created_at`)
      .bind(projectId, sites, sites, sites, site, site).all<LinhaFluxo>();
    return c.json({ fluxos: results.map(comViolacao) });
  } catch (e) { return erro500(c, 'Falha ao listar os fluxos', e); }
});

otApp.post('/fluxos', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const v = await validateBody(c, otFluxoCriarSchema);
    if (!v.success) return v.response;
    const d = v.data;
    if (!daLista(sites, d.site_id)) return refRuim(c, 'site_id');
    const ruim = await refInvalida(db, projectId, sites, d, PONTAS);
    if (ruim) return refRuim(c, ruim);
    const id = genId();
    try {
      await db.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_ativo_id, origem_zona_id, destino_ativo_id, destino_zona_id, protocolo, porta,
          direcao, finalidade, externo, via_vpn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        id, projectId, d.site_id, d.origem_ativo_id ?? null, d.origem_zona_id ?? null, d.destino_ativo_id ?? null, d.destino_zona_id ?? null,
        d.protocolo ?? null, d.porta ?? null, d.direcao ?? 'unidirecional', d.finalidade ?? null, Number(d.externo ?? false), Number(d.via_vpn ?? false),
      ).run();
    } catch (err) { const r = recusaDoBanco(c, err); if (r) return r; throw err; }
    await trilha(c, 'ot.fluxo.criado', projectId, `Fluxo ${id} criado no site ${d.site_id}`, { tipo: 'ot_fluxo', id });
    return c.json({ ok: true, id, violacoes: d.externo && !d.via_vpn ? ['4.1.2', '4.1.3'] : [] }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o fluxo', e); }
});

otApp.put('/fluxos/:id', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const v = await validateBody(c, otFluxoAtualizarSchema);
    if (!v.success) return v.response;
    const ruim = await refInvalida(db, projectId, sites, v.data, PONTAS);
    if (ruim) return refRuim(c, ruim);
    const campos = paraBanco(v.data);
    if (!Object.keys(campos).length) return c.json({ error: 'Nada a alterar' }, 400);
    try {
      if (!await atualizar(db, 'ot_fluxos', c.req.param('id'), projectId, sites, campos)) return NAO_ENCONTRADO(c, 'Fluxo');
    } catch (err) { const r = recusaDoBanco(c, err); if (r) return r; throw err; }
    await trilha(c, 'ot.fluxo.atualizado', projectId, `Fluxo ${c.req.param('id')} atualizado`, { tipo: 'ot_fluxo', id: c.req.param('id') });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o fluxo', e); }
});

// ─── exclusão lógica (sites, zonas, ativos, fluxos) ─────────────────────────
for (const [rota, tabela, nome, tipo] of [
  ['sites', 'ot_sites', 'Site', 'ot_site'], ['zonas', 'ot_zonas', 'Zona', 'ot_zona'],
  ['ativos', 'ot_ativos', 'Ativo', 'ot_ativo'], ['fluxos', 'ot_fluxos', 'Fluxo', 'ot_fluxo'],
] as const) {
  otApp.delete(`/${rota}/:id`, async (c) => {
    try {
      const { db, projectId, sites } = await contexto(c);
      if (!await atualizar(db, tabela, c.req.param('id'), projectId, sites, { status: 'removido' })) return NAO_ENCONTRADO(c, nome);
      await trilha(c, `${tipo.replace('_', '.')}.removido`, projectId, `${nome} ${c.req.param('id')} removido (exclusão lógica)`, { tipo, id: c.req.param('id') });
      return c.json({ ok: true });
    } catch (e) { return erro500(c, `Falha ao remover: ${nome.toLowerCase()}`, e); }
  });
}

// ─── acesso por site (técnicos) ─────────────────────────────────────────────
otApp.get('/acessos', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    // O técnico vê os próprios vínculos; quem administra vê todos.
    const { results } = await db.prepare(`SELECT a.user_id, a.site_id, a.concedido_por, a.created_at FROM ot_site_acessos a
      WHERE a.project_id = ? AND ${NO_SITE.replace('site_id', 'a.site_id')} AND (? IS NULL OR a.user_id = ?) ORDER BY a.site_id, a.user_id`)
      .bind(projectId, sites, user.role === 'org_user' ? user.id : null, user.role === 'org_user' ? user.id : null).all();
    return c.json({ acessos: results });
  } catch (e) { return erro500(c, 'Falha ao listar os acessos', e); }
});

otApp.post('/acessos', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const v = await validateBody(c, otAcessoCriarSchema);
    if (!v.success) return v.response;
    if (!daLista(sites, v.data.site_id)) return refRuim(c, 'site_id');
    // Só técnico (org_user) do próprio projeto: os demais papéis já veem todos os sites, e conta de outro projeto não entra.
    const tecnico = await db.prepare(`SELECT 1 FROM users WHERE id = ? AND role = 'org_user' AND client_project_id = ?`).bind(v.data.user_id, projectId).first();
    if (!tecnico) return refRuim(c, 'user_id');
    await db.prepare('INSERT OR IGNORE INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES (?, ?, ?, ?)')
      .bind(v.data.user_id, v.data.site_id, projectId, c.get('user').email).run();
    await trilha(c, 'ot.acesso.concedido', projectId, `Acesso ao site ${v.data.site_id} concedido à conta ${v.data.user_id}`, { tipo: 'ot_site', id: v.data.site_id });
    return c.json({ ok: true }, 201);
  } catch (e) { return erro500(c, 'Falha ao conceder o acesso', e); }
});

otApp.delete('/acessos/:siteId/:userId', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const { siteId, userId } = c.req.param();
    const r = await c.env.DB.prepare('DELETE FROM ot_site_acessos WHERE site_id = ? AND user_id = ? AND project_id = ?').bind(siteId, userId, projectId).run();
    if (!r.meta.changes) return NAO_ENCONTRADO(c, 'Acesso');
    await trilha(c, 'ot.acesso.revogado', projectId, `Acesso ao site ${siteId} revogado da conta ${userId}`, { tipo: 'ot_site', id: siteId });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao revogar o acesso', e); }
});

// ─── coleta: lotes em staging (spec §7; P0-3, P0-5) ──────────────────────────
otApp.get('/lotes', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const { results } = await db.prepare(`SELECT l.id, l.site_id, l.fonte, l.status, l.criado_por, l.decidido_por, l.decidido_em, l.motivo, l.created_at, l.updated_at,
        count(i.id) AS itens, coalesce(sum(i.erros <> '[]'), 0) AS com_erro, coalesce(sum(i.decisao = 'gravado'), 0) AS gravados
      FROM ot_lotes l LEFT JOIN ot_lote_itens i ON i.lote_id = l.id WHERE l.project_id = ? AND l.site_id IN (SELECT value FROM json_each(?))
      GROUP BY l.id ORDER BY l.created_at DESC`).bind(projectId, sites).all();
    return c.json({ lotes: results });
  } catch (e) { return erro500(c, 'Falha ao listar os lotes', e); }
});

otApp.get('/lotes/:id', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const lote = await db.prepare(`SELECT id, site_id, fonte, status, criado_por, decidido_por, decidido_em, motivo, created_at, updated_at FROM ot_lotes
      WHERE id = ? AND project_id = ? AND site_id IN (SELECT value FROM json_each(?))`).bind(c.req.param('id'), projectId, sites).first();
    if (!lote) return NAO_ENCONTRADO(c, 'Lote');
    const { results } = await db.prepare(`SELECT id, project_id, linha, entidade, dados, erros, duplicata_de, decisao, motivo, registro_id FROM ot_lote_itens
      WHERE lote_id = ? AND project_id = ? ORDER BY linha LIMIT ${TETO_ITENS}`).bind(lote.id, projectId).all<LinhaItem>();
    const completo = await podeVerCompleto(db, user, projectId);
    const itens = await Promise.all(results.map((i) => serializarItem(i, completo, chavesOt(c.env)!)));
    const sensiveis = completo ? results.filter((i) => /"(ip|mac)_cifrado":"ot1:/.test(i.dados)).length : 0;
    if (sensiveis) await trilha(c, 'ot.inventario.ver_sensivel', projectId, `${sensiveis} item(ns) do lote ${lote.id} com IP/MAC sem máscara`, { tipo: 'ot_lote', id: lote.id as string });
    const nomes_pontas = await nomesDasPontas(db, projectId, lote.site_id as string, itens.filter((i) => i.entidade === 'fluxo').map((i) => i.dados));
    return c.json({ lote, itens, nomes_pontas });
  } catch (e) { return erro500(c, 'Falha ao ler o lote', e); }
});

async function responderLote(c: C, r: Awaited<ReturnType<typeof criarLote>>, projectId: string, site: string, extra: Record<string, unknown> = {}) {
  if (!r.ok) return c.json({ error: r.error }, r.status);
  // A1: a contagem de duplicatas só vai a quem vê completo (para os demais, a chave nem aparece).
  const { ok: _ok, possiveis_duplicatas, itemIds: _ids, ...resumo } = r;
  if (await podeVerCompleto(c.env.DB, c.get('user'), projectId)) Object.assign(resumo, { possiveis_duplicatas });
  await trilha(c, 'ot.lote.criado', projectId, `Lote ${r.id} criado no site ${site}: ${r.itens} item(ns), ${r.com_erro} com erro`, { tipo: 'ot_lote', id: r.id });
  return c.json({ ...resumo, status: 'em_revisao', ...extra }, 201);
}

otApp.post('/lotes/manual', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const v = await validateBody(c, otLoteManualSchema);
    if (!v.success) return v.response;
    if (!daLista(sites, v.data.site_id)) return refRuim(c, 'site_id');
    return responderLote(c, await criarLote(db, chavesOt(c.env)!, user, projectId, v.data.site_id, 'manual', v.data.itens), projectId, v.data.site_id);
  } catch (e) { return erro500(c, 'Falha ao criar o lote', e); }
});

otApp.post('/lotes/:id/aprovar', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    if (!await podeAprovar(db, user, projectId)) return c.json({ error: 'Forbidden: seu papel não aprova lote' }, 403);
    const r = await aprovarLote(db, chavesOt(c.env)!, user, projectId, sites, c.req.param('id'), { env: c.env,
      // o getter `c.executionCtx` lança sem contexto (app.request, testes): aí a entrega segue solta, sem waitUntil
      ctx: { waitUntil: (p: Promise<unknown>) => { try { c.executionCtx.waitUntil(p); } catch { /* sem contexto */ } } } });
    if (!r.ok) return c.json({ error: r.error }, r.status);
    const { ok: _ok, ...n } = r;
    await trilha(c, 'ot.lote.aprovado', projectId, `Lote ${c.req.param('id')} aprovado: ${n.criados} criado(s), ${n.atualizados} atualizado(s), ${n.recusados} recusado(s)`
      + (n.fluxos_pendentes_resolvidos > 0 ? `, ${n.fluxos_pendentes_resolvidos} fluxo(s) pendente(s) resolvido(s)` : ''), { tipo: 'ot_lote', id: c.req.param('id') });
    return c.json({ ok: true, ...n });
  } catch (e) { return erro500(c, 'Falha ao aprovar o lote', e); }
});

otApp.post('/lotes/:id/rejeitar', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    if (!await podeAprovar(db, user, projectId)) return c.json({ error: 'Forbidden: seu papel não rejeita lote' }, 403);
    const v = await validateBody(c, otLoteRejeitarSchema);
    if (!v.success) return v.response;
    const r = await rejeitarLote(db, user, projectId, sites, c.req.param('id'), v.data.motivo);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await trilha(c, 'ot.lote.rejeitado', projectId, `Lote ${c.req.param('id')} rejeitado`, { tipo: 'ot_lote', id: c.req.param('id') }, v.data.motivo);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao rejeitar o lote', e); }
});

otApp.post('/lotes/:id/itens/:itemId/recusar', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    if (!await podeAprovar(db, user, projectId)) return c.json({ error: 'Forbidden: seu papel não decide sobre lote' }, 403);
    const v = await validateBody(c, otItemRecusarSchema);
    if (!v.success) return v.response;
    const r = await recusarItem(db, user, projectId, sites, c.req.param('id'), c.req.param('itemId'), v.data.motivo);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await trilha(c, 'ot.lote.item_recusado', projectId, `Item ${c.req.param('itemId')} do lote ${c.req.param('id')} recusado`, { tipo: 'ot_lote', id: c.req.param('id') }, v.data.motivo);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao recusar o item', e); }
});

// ─── levantamento (spec descoberta operacional, L1) ──────────────────────────────────────────
otApp.get('/roteiro', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT id, ordem, texto, item_norma, entidade_esperada, tipos_sessao FROM ot_roteiro_perguntas ORDER BY ordem').all();
    return c.json({ perguntas: results.map((p) => ({ ...p, tipos_sessao: JSON.parse(String(p.tipos_sessao)) })) });
  } catch (e) { return erro500(c, 'Falha ao listar o roteiro', e); }
});

const LEV_COLS = 'id, site_id, tipo, realizado_em, funcao, turno, documento_titulo, documento_data, notas, roteiro, situacao, criado_por, created_at, updated_at';
/** Sessão ativa, do projeto e de site permitido: inexistente, de outro projeto ou de site sem acesso dão o mesmo 404 (T27). */
export const lerLevantamento = (db: D1Database, projectId: string, sites: string, id: string) =>
  db.prepare(`SELECT ${LEV_COLS} FROM ot_levantamentos WHERE id = ? AND project_id = ? AND status = 'ativo' AND ${NO_SITE}`)
    .bind(id, projectId, sites).first<Record<string, unknown> & { id: string; site_id: string; tipo: string; situacao: string }>();

/** Chaves do roteiro só as perguntas cadastradas: o objeto é guardado como veio e chave livre viraria campo sem dono. */
const perguntaRuim = async (db: D1Database, p: string | null | undefined) =>
  !!p && !await db.prepare('SELECT 1 FROM ot_roteiro_perguntas WHERE id = ?').bind(p).first();
const roteiroRuim = async (db: D1Database, roteiro?: Record<string, unknown>) => {
  const chaves = Object.keys(roteiro ?? {});
  if (!chaves.length) return false;
  const r = await db.prepare('SELECT count(*) AS n FROM ot_roteiro_perguntas WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(chaves)).first<{ n: number }>();
  return r!.n !== chaves.length;
};

otApp.get('/levantamentos', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const site = c.req.query('site_id');
    const { results } = await db.prepare(`SELECT ${LEV_COLS}, (SELECT count(*) FROM ot_achados a WHERE a.levantamento_id = l.id AND a.situacao <> 'descartado') AS achados
      FROM ot_levantamentos l WHERE project_id = ? AND status = 'ativo' AND ${NO_SITE} ${site ? 'AND site_id = ?' : ''} ORDER BY realizado_em DESC, created_at DESC LIMIT ${TETO_LEITURA_OT}`)
      .bind(...[projectId, sites, ...(site ? [site] : [])]).all();
    return c.json({ levantamentos: results.map((l) => ({ ...l, roteiro: JSON.parse(String(l.roteiro)) })) });
  } catch (e) { return erro500(c, 'Falha ao listar os levantamentos', e); }
});

otApp.post('/levantamentos', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const v = await validateBody(c, otLevantamentoCriarSchema);
    if (!v.success) return v.response;
    if (!daLista(sites, v.data.site_id)) return refRuim(c, 'site_id');
    if (await roteiroRuim(db, v.data.roteiro)) return refRuim(c, 'roteiro');
    const id = genId();
    const d = v.data;
    await db.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, funcao, turno, documento_titulo, documento_data, notas, roteiro, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, projectId, d.site_id, d.tipo, d.realizado_em, d.funcao ?? null, d.turno ?? null,
      d.documento_titulo ?? null, d.documento_data ?? null, d.notas ?? '', JSON.stringify(d.roteiro ?? {}), user.id).run();
    await trilha(c, 'ot.levantamento.criado', projectId, `Levantamento ${id} (${d.tipo}) criado`, { tipo: 'ot_levantamento', id });
    return c.json({ id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o levantamento', e); }
});

otApp.get('/levantamentos/:id', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const lev = await lerLevantamento(db, projectId, sites, c.req.param('id'));
    if (!lev) return NAO_ENCONTRADO(c, 'Levantamento');
    const completo = await podeVerCompleto(db, user, projectId);
    const chaves = chavesOt(c.env)!;
    // LIMIT explícito: sem ele o teto global de SELECT (query-cap, 500) cortaria a sessão em silêncio.
    const { results } = await db.prepare(`SELECT a.*, ${DESFECHO_SQL} FROM ot_achados a LEFT JOIN ot_lote_itens i ON i.id = a.lote_item_id
      WHERE a.levantamento_id = ? AND a.project_id = ? ORDER BY a.created_at LIMIT ${TETO_ACHADOS_SESSAO}`)
      .bind(lev.id, projectId).all<LinhaAchado>();
    const achados = await serializarAchados(db, projectId, lev.site_id, results, completo, chaves);
    const sensiveis = completo ? results.filter((a) => /"(ip|mac)_cifrado":"ot1:/.test(a.dados)).length : 0;
    if (sensiveis) await trilha(c, 'ot.inventario.ver_sensivel', projectId, `${sensiveis} achado(s) do levantamento ${lev.id} com IP/MAC sem máscara`, { tipo: 'ot_levantamento', id: lev.id });
    // Só nomes (nunca /ativos, que decifra IP/MAC): os das pontas citadas e os ativos do site que o achado de fluxo oferece como ponta.
    const nomes_pontas = await nomesDasPontas(db, projectId, lev.site_id, results.filter((a) => a.entidade === 'fluxo').map((a) => JSON.parse(a.dados)));
    const { results: ativos_do_site } = await db.prepare(`SELECT id, nome FROM ot_ativos WHERE project_id = ? AND site_id = ? AND status = 'ativo' ORDER BY nome
      LIMIT ${TETO_LEITURA_OT}`).bind(projectId, lev.site_id).all<{ id: string; nome: string }>();
    return c.json({ levantamento: { ...lev, roteiro: JSON.parse(String(lev.roteiro)) }, achados, nomes_pontas, ativos_do_site });
  } catch (e) { return erro500(c, 'Falha ao ler o levantamento', e); }
});

/** A1: o confronto só é calculado (e devolvido) para quem vê completo; os índices do site são lidos uma vez. */
async function serializarAchados(db: D1Database, projectId: string, siteId: string, results: LinhaAchado[], completo: boolean, chaves: NonNullable<ReturnType<typeof chavesOt>>) {
  const idx = completo ? await indiceDoSite(db, projectId, siteId) : undefined;
  const idxF = completo && results.some((a) => a.entidade === 'fluxo') ? indiceFluxos(await fluxosDoSite(db, projectId, siteId)) : undefined;
  const achados = [];
  for (const a of results) {
    const conf = !idx || a.situacao !== 'rascunho' ? undefined
      : a.entidade === 'fluxo' ? confrontarFluxo(JSON.parse(a.dados), idxF!) : await confrontar(db, projectId, siteId, JSON.parse(a.dados), idx);
    achados.push(await serializarAchado(a, completo, chaves, conf));
  }
  return achados;
}

// Fila de revisão do site: os achados de todos os levantamentos dele, para decidir o que vai ao lote.
otApp.get('/achados', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const site = c.req.query('site_id');
    const situacao = c.req.query('situacao') ?? 'rascunho';
    if (!site) return c.json({ error: 'site_id é obrigatório' }, 400);
    if (situacao !== 'rascunho' && situacao !== 'enviado') return c.json({ error: 'situacao deve ser rascunho ou enviado' }, 400);
    if (!daLista(sites, site)) return NAO_ENCONTRADO(c, 'Site');
    if (c.req.query('contagem') === '1') {
      // só a contagem: não decifra nada, logo sem trilha de IP/MAC
      const total = await contarAchados(db, projectId, site, situacao);
      return c.json({ total });
    }
    const completo = await podeVerCompleto(db, user, projectId);
    const { results } = await db.prepare(`SELECT a.*, ${DESFECHO_SQL}, l.tipo AS levantamento_tipo, l.realizado_em AS levantamento_realizado_em
      FROM ot_achados a JOIN ot_levantamentos l ON l.id = a.levantamento_id AND l.project_id = a.project_id
      LEFT JOIN ot_lote_itens i ON i.id = a.lote_item_id
      WHERE a.project_id = ? AND l.site_id = ? AND l.status = 'ativo' AND a.situacao = ? ORDER BY l.realizado_em, a.created_at LIMIT ${TETO_LEITURA_OT}`)
      .bind(projectId, site, situacao).all<LinhaAchado & { levantamento_tipo: string; levantamento_realizado_em: string }>();
    const ser = await serializarAchados(db, projectId, site, results, completo, chavesOt(c.env)!);
    const achados = ser.map((a, i) => ({ ...a, levantamento_tipo: results[i].levantamento_tipo, levantamento_realizado_em: results[i].levantamento_realizado_em }));
    const sensiveis = completo ? results.filter((a) => /"(ip|mac)_cifrado":"ot1:/.test(a.dados)).length : 0;
    if (sensiveis) await trilha(c, 'ot.inventario.ver_sensivel', projectId, `${sensiveis} achado(s) da fila do site ${site} com IP/MAC sem máscara`, { tipo: 'ot_site', id: site });
    const nomes_pontas = await nomesDasPontas(db, projectId, site, results.filter((a) => a.entidade === 'fluxo').map((a) => JSON.parse(a.dados)));
    return c.json({ achados, nomes_pontas });
  } catch (e) { return erro500(c, 'Falha ao ler a fila de revisão', e); }
});

otApp.post('/sites/:siteId/enviar', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const site = c.req.param('siteId');
    if (!chavesOt(c.env)) return c.json({ error: 'Inventário de ativos indisponível: as chaves do n.ot não estão configuradas' }, 503);
    if (!daLista(sites, site)) return NAO_ENCONTRADO(c, 'Site');
    const v = await validateBody(c, otEnviarAchadosSchema);
    if (!v.success) return v.response;
    return responderLote(c, await enviarAoLote(db, chavesOt(c.env)!, user, projectId, { site_id: site }, v.data.achados), projectId, site);
  } catch (e) { return erro500(c, 'Falha ao enviar os achados para aprovação', e); }
});

otApp.put('/levantamentos/:id', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const lev = await lerLevantamento(db, projectId, sites, c.req.param('id'));
    if (!lev) return NAO_ENCONTRADO(c, 'Levantamento');
    const v = await validateBody(c, otLevantamentoAtualizarSchema);
    if (!v.success) return v.response;
    // Técnico (org_user): só notas, respostas do roteiro e encerrar; reabrir e mexer em função/turno/documento é de quem edita.
    if (!podeEditarOt(c.get('user')) && Object.entries(v.data).some(([k, x]) => !(k === 'notas' || k === 'roteiro' || (k === 'situacao' && x === 'encerrado')))) {
      return c.json({ error: 'Forbidden: o técnico só registra notas, respostas e encerra o levantamento' }, 403);
    }
    if (lev.tipo === 'documento' && 'documento_titulo' in v.data && !v.data.documento_titulo) return c.json({ error: 'Documento exige o título' }, 400);
    if (await roteiroRuim(db, v.data.roteiro)) return refRuim(c, 'roteiro');
    // Colunas só das chaves do esquema `.strict()` (como em atualizar()); valores sempre por bind.
    const d = { ...v.data, ...(v.data.roteiro && { roteiro: JSON.stringify(v.data.roteiro) }) };
    const campos = Object.keys(d);
    if (!campos.length) return c.json({ ok: true });
    const encerrando = v.data.situacao === 'encerrado' && lev.situacao !== 'encerrado';
    await db.prepare(`UPDATE ot_levantamentos SET ${campos.map((k) => `${k} = ?`).join(', ')}${encerrando ? ', encerrado_em = CURRENT_TIMESTAMP' : ''},
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`).bind(...campos.map((k) => (d as Record<string, unknown>)[k] ?? null), lev.id, projectId).run();
    await trilha(c, 'ot.levantamento.editado', projectId, `Levantamento ${lev.id} editado (${campos.join(', ')})`, { tipo: 'ot_levantamento', id: lev.id });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao editar o levantamento', e); }
});

otApp.delete('/levantamentos/:id', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const lev = await lerLevantamento(db, projectId, sites, c.req.param('id'));
    if (!lev) return NAO_ENCONTRADO(c, 'Levantamento');
    await db.prepare(`UPDATE ot_levantamentos SET status = 'removido', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`).bind(lev.id, projectId).run();
    await trilha(c, 'ot.levantamento.removido', projectId, `Levantamento ${lev.id} removido`, { tipo: 'ot_levantamento', id: lev.id });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao remover o levantamento', e); }
});

otApp.post('/levantamentos/:id/achados', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const lev = await lerLevantamento(db, projectId, sites, c.req.param('id'));
    if (!lev) return NAO_ENCONTRADO(c, 'Levantamento');
    if (lev.situacao === 'encerrado') return c.json({ error: 'Levantamento encerrado: reabra para registrar achados' }, 409);
    const v = await validateBody(c, otAchadoCriarSchema);
    if (!v.success) return v.response;
    const n = await db.prepare(`SELECT count(*) AS n FROM ot_achados WHERE levantamento_id = ?`).bind(lev.id).first<{ n: number }>();
    if ((n?.n ?? 0) >= TETO_ACHADOS_SESSAO) return c.json({ error: `Limite de ${TETO_ACHADOS_SESSAO} achados por levantamento` }, 400);
    if (await perguntaRuim(db, v.data.pergunta_id)) return refRuim(c, 'pergunta_id');
    // O mesmo id vai à AAD da cifra e à linha: trocar um sem o outro torna o IP indecifrável.
    const id = genId();
    const entidade = v.data.entidade ?? 'ativo';
    const p = await prepararAchado(chavesOt(c.env)!, projectId, lev.site_id, id, v.data.dados, await zonasDoSite(db, projectId, lev.site_id), entidade,
      entidade === 'fluxo' ? await pontasDoSite(db, projectId, lev.site_id) : undefined);
    await db.prepare(`INSERT INTO ot_achados (id, project_id, levantamento_id, entidade, pergunta_id, dados, erros, evidencia, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, projectId, lev.id, entidade, v.data.pergunta_id ?? null, JSON.stringify(p.dados), JSON.stringify(p.erros), v.data.evidencia, user.id).run();
    await trilha(c, 'ot.achado.criado', projectId, `Achado ${id} no levantamento ${lev.id}`, { tipo: 'ot_achado', id });
    return c.json({ id, erros: p.erros }, 201);
  } catch (e) { return erro500(c, 'Falha ao registrar o achado', e); }
});

otApp.put('/levantamentos/:id/achados/:aid', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const lev = await lerLevantamento(db, projectId, sites, c.req.param('id'));
    if (!lev) return NAO_ENCONTRADO(c, 'Levantamento');
    const a = await db.prepare(`SELECT id, situacao, entidade FROM ot_achados WHERE id = ? AND levantamento_id = ? AND project_id = ?`)
      .bind(c.req.param('aid'), lev.id, projectId).first<{ id: string; situacao: string; entidade: string }>();
    if (!a) return NAO_ENCONTRADO(c, 'Achado');
    if (a.situacao === 'enviado') return c.json({ error: 'Achado já enviado para aprovação' }, 409);
    const v = await validateBody(c, otAchadoAtualizarSchema);
    if (!v.success) return v.response;
    if (await perguntaRuim(db, v.data.pergunta_id)) return refRuim(c, 'pergunta_id');
    const sets: string[] = []; const vals: unknown[] = [];
    if (v.data.dados) {
      const p = await prepararAchado(chavesOt(c.env)!, projectId, lev.site_id, a.id, v.data.dados, await zonasDoSite(db, projectId, lev.site_id), a.entidade,
        a.entidade === 'fluxo' ? await pontasDoSite(db, projectId, lev.site_id) : undefined);
      sets.push('dados = ?', 'erros = ?'); vals.push(JSON.stringify(p.dados), JSON.stringify(p.erros));
    }
    if (v.data.evidencia !== undefined) { sets.push('evidencia = ?'); vals.push(v.data.evidencia); }
    if (v.data.situacao) { sets.push('situacao = ?'); vals.push(v.data.situacao); }
    if (v.data.pergunta_id !== undefined) { sets.push('pergunta_id = ?'); vals.push(v.data.pergunta_id); }
    if (!sets.length) return c.json({ ok: true });
    // `situacao <> 'enviado'` de novo no UPDATE: um envio entre a leitura e a escrita não perde a trava.
    const r = await db.prepare(`UPDATE ot_achados SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND situacao <> 'enviado'`).bind(...vals, a.id).run();
    if (!r.meta.changes) return c.json({ error: 'Achado já enviado para aprovação' }, 409);
    await trilha(c, 'ot.achado.editado', projectId, `Achado ${a.id} editado`, { tipo: 'ot_achado', id: a.id });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao editar o achado', e); }
});

otApp.post('/levantamentos/:id/enviar', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const lev = await lerLevantamento(db, projectId, sites, c.req.param('id'));
    if (!lev) return NAO_ENCONTRADO(c, 'Levantamento');
    const v = await validateBody(c, otEnviarAchadosSchema);
    if (!v.success) return v.response;
    const r = await enviarAoLote(db, chavesOt(c.env)!, user, projectId, { site_id: lev.site_id, levantamento_id: lev.id }, v.data.achados);
    return responderLote(c, r, projectId, lev.site_id, { levantamento_id: lev.id });
  } catch (e) { return erro500(c, 'Falha ao enviar os achados para aprovação', e); }
});

// ─── conformidade RO-CB.BR.01 calculada do inventário ───────────────────────
otApp.get('/conformidade', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    return c.json(await conformidadeOt(db, projectId, sites));
  } catch (e) { return erro500(c, 'Falha ao calcular a conformidade', e); }
});

// ─── assessment da RO-CB.BR.01 (spec fluidez §5) ────────────────────────────
const respostaAvaliacao = (c: C, r: { ok: true } | { ok: false; status: 400 | 404 | 409; error: string }) => r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);

otApp.get('/assessment', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    return c.json(await montarAssessment(db, projectId, JSON.parse(sites), await podeVerCompleto(db, user, projectId)));
  } catch (e) { return erro500(c, 'Falha ao montar o assessment', e); }
});

otApp.put('/assessment/:codigo', async (c) => {
  try {
    const { db, user, projectId } = await contexto(c);
    const v = await validateBody(c, otAvaliacaoSchema);
    if (!v.success) return v.response;
    const codigo = c.req.param('codigo');
    const r = await salvarAvaliacao(db, user, projectId, codigo, v.data);
    if (r.ok) await trilha(c, 'ot.assessment.salvo', projectId, `Item ${codigo} avaliado como ${v.data.situacao}`);
    return respostaAvaliacao(c, r);
  } catch (e) { return erro500(c, 'Falha ao salvar a avaliação', e); }
});

otApp.post('/assessment/:codigo/confirmar', async (c) => {
  try {
    const { db, user, projectId } = await contexto(c);
    if (!ehGestorArciber(c, projectId)) return c.json({ error: 'Só o Gestor ARCiber confirma a avaliação' }, 403);
    const codigo = c.req.param('codigo');
    const r = await confirmarAvaliacao(db, user, projectId, codigo);
    if (r.ok) await trilha(c, 'ot.assessment.confirmado', projectId, `Item ${codigo} confirmado pelo Gestor`);
    return respostaAvaliacao(c, r);
  } catch (e) { return erro500(c, 'Falha ao confirmar a avaliação', e); }
});

otApp.post('/assessment/:codigo/evidencias', async (c) => {
  try {
    const { db, projectId } = await contexto(c);
    const v = await validateBody(c, otAvaliacaoEvidenciaSchema);
    if (!v.success) return v.response;
    const codigo = c.req.param('codigo');
    const r = await ligarEvidencia(db, projectId, codigo, v.data.evidencia_id);
    if (r.ok) await trilha(c, 'ot.assessment.evidencia', projectId, `Evidência ${v.data.evidencia_id} ligada ao item ${codigo}`);
    return respostaAvaliacao(c, r);
  } catch (e) { return erro500(c, 'Falha ao ligar a evidência', e); }
});

otApp.delete('/assessment/:codigo/evidencias/:evidenciaId', async (c) => {
  try {
    const { db, projectId } = await contexto(c);
    const { codigo, evidenciaId } = c.req.param();
    const r = await desligarEvidencia(db, projectId, codigo, evidenciaId);
    if (r.ok) await trilha(c, 'ot.assessment.evidencia', projectId, `Evidência ${evidenciaId} desligada do item ${codigo}`);
    return respostaAvaliacao(c, r);
  } catch (e) { return erro500(c, 'Falha ao desligar a evidência', e); }
});

otApp.get('/relatorio/conformidade', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const r = await relatorioConformidade(db, user, projectId, JSON.parse(sites));
    await trilha(c, 'ot.relatorio.conformidade', projectId, `Relatório de conformidade gerado com ${r.itens.length} item(ns) e ${r.sites.length} site(s)`);
    return c.json(r);
  } catch (e) { return erro500(c, 'Falha ao gerar o relatório de conformidade', e); }
});

// ─── agente de coleta (L5, plano 2026-11-04) ───────────────────────────────────────────
// Ligar é a autorização do cliente: só o Gestor ARCiber do projeto. Emitir/revogar: quem vê o inventário completo.
const ehGestorArciber = (c: C, projectId: string) => c.get('user').role === 'org_admin' && c.get('user').client_project_id === projectId;
const SO_COMPLETO = (c: C) => c.json({ error: 'Forbidden: só o Gestor ARCiber e a consultoria designada gerenciam as chaves do agente' }, 403);

otApp.get('/agente', async (c) => {
  try {
    const { db, user, projectId } = await contexto(c);
    const p = await db.prepare('SELECT agente_coleta_ot FROM projects WHERE id = ?').bind(projectId).first<{ agente_coleta_ot: number }>();
    return c.json({ ligado: p?.agente_coleta_ot === 1, pode_ligar: ehGestorArciber(c, projectId), pode_emitir: await podeVerCompleto(db, user, projectId), endpoint: `${appUrl(c.env)}/ot-coleta/mcp` });
  } catch (e) { return erro500(c, 'Falha ao ler o agente de coleta', e); }
});

otApp.put('/agente', async (c) => {
  try {
    const { db, projectId } = await contexto(c);
    if (!ehGestorArciber(c, projectId)) return c.json({ error: 'Só o Gestor ARCiber liga o agente de coleta' }, 403);
    const v = await validateBody(c, otAgenteInterruptorSchema);
    if (!v.success) return v.response;
    await db.prepare('UPDATE projects SET agente_coleta_ot = ? WHERE id = ?').bind(Number(v.data.ligado), projectId).run();
    await trilha(c, v.data.ligado ? 'ot.agente.ligado' : 'ot.agente.desligado', projectId, `Agente de coleta ${v.data.ligado ? 'ligado' : 'desligado'}`);
    return c.json({ ligado: v.data.ligado });
  } catch (e) { return erro500(c, 'Falha ao alterar o agente de coleta', e); }
});

otApp.get('/agente/chaves', async (c) => {
  try {
    const { db, user, projectId } = await contexto(c);
    if (!await podeVerCompleto(db, user, projectId)) return SO_COMPLETO(c);
    const { results } = await db.prepare(`SELECT id, name AS nome,
      CASE WHEN status = 'Active' AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN 'Vencida' ELSE status END AS status, expires_at AS expira_em, last_used_at AS ultimo_uso FROM api_keys
      WHERE project_id = ? AND permissions = 'ot_coleta' ORDER BY created_at DESC LIMIT ${TETO_LEITURA_OT}`).bind(projectId).all();
    return c.json({ chaves: results });
  } catch (e) { return erro500(c, 'Falha ao listar as chaves do agente', e); }
});

otApp.post('/agente/chaves', async (c) => {
  try {
    const { db, user, projectId } = await contexto(c);
    if (!await podeVerCompleto(db, user, projectId)) return SO_COMPLETO(c);
    const v = await validateBody(c, otAgenteChaveSchema);
    if (!v.success) return v.response;
    const p = await db.prepare('SELECT agente_coleta_ot FROM projects WHERE id = ?').bind(projectId).first<{ agente_coleta_ot: number }>();
    if (p?.agente_coleta_ot !== 1) return c.json({ error: 'Ligue o agente de coleta antes de emitir a chave' }, 409);
    const dias = v.data.dias ?? VALIDADE_PADRAO_DIAS;
    const k = await emitirChaveColeta(db, projectId, v.data.nome, dias, user.email);
    await trilha(c, 'ot.agente.chave_emitida', projectId, `Chave ${k.id} emitida por ${dias} dias`, { tipo: 'api_key', id: k.id });
    return c.json(k, 201);
  } catch (e) { return erro500(c, 'Falha ao emitir a chave do agente', e); }
});

otApp.delete('/agente/chaves/:kid', async (c) => {
  try {
    const { db, user, projectId } = await contexto(c);
    if (!await podeVerCompleto(db, user, projectId)) return SO_COMPLETO(c);
    const kid = c.req.param('kid');
    const r = await db.prepare(`UPDATE api_keys SET status = 'Revoked' WHERE id = ? AND project_id = ? AND permissions = 'ot_coleta' AND status = 'Active'`).bind(kid, projectId).run();
    if (!r.meta.changes) return NAO_ENCONTRADO(c, 'Chave');
    await trilha(c, 'ot.agente.chave_revogada', projectId, `Chave ${kid} revogada`, { tipo: 'api_key', id: kid });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao revogar a chave do agente', e); }
});

// ─── sondas de rede (plano 2026-11-05): cadastro e credenciais; o envio é em /ot-sensor/resumo ───────────────
const SO_COMPLETO_SONDA = (c: C) => c.json({ error: 'Forbidden: só o Gestor ARCiber e a consultoria designada gerenciam as sondas' }, 403);
const recusaSensor = (c: C, e: unknown) => e instanceof RecusaSensor ? c.json({ error: e.message }, 409) : null;

otApp.get('/sites/:sid/sensores', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    if (!await podeVerCompleto(db, user, projectId)) return SO_COMPLETO_SONDA(c);
    const sid = c.req.param('sid');
    if (!daLista(sites, sid)) return NAO_ENCONTRADO(c, 'Site');
    const ultimo = (col: string) => `(SELECT ${col} FROM ot_sensor_envios e WHERE e.sensor_id = s.id AND e.situacao = 'concluido' ORDER BY e.created_at DESC LIMIT 1)`;
    const { results } = await db.prepare(`SELECT s.id, s.nome, s.faixa_origem, s.situacao, s.created_at, ${ultimo('created_at')} AS ultimo_envio, ${ultimo('capture_loss')} AS capture_loss
      FROM ot_sensores s WHERE s.project_id = ? AND s.site_id = ? AND s.situacao = 'ativa' ORDER BY s.nome LIMIT ${TETO_LEITURA_OT}`)
      .bind(projectId, sid).all<{ id: string; created_at: string; ultimo_envio: string | null }>();
    const { results: creds } = await db.prepare(`SELECT id, sensor_id, expira_em, situacao FROM ot_sensor_credenciais
      WHERE project_id = ? AND situacao = 'ativa' AND sensor_id IN (SELECT id FROM ot_sensores WHERE project_id = ? AND site_id = ?) ORDER BY created_at LIMIT ${TETO_LEITURA_OT}`)
      .bind(projectId, projectId, sid).all<{ id: string; sensor_id: string; expira_em: string; situacao: string }>();
    const agora = new Date();
    return c.json({ sensores: results.map((s) => {
      const cs = creds.filter((k) => k.sensor_id === s.id);
      const { created_at, ...resto } = s;
      return { ...resto, saude: situacaoSensor(s.ultimo_envio ?? created_at, cs, agora), vencendo: vencendo(cs, agora), credenciais: cs.map(({ id, expira_em, situacao }) => ({ id, expira_em, situacao })) };
    }) });
  } catch (e) { return erro500(c, 'Falha ao listar as sondas', e); }
});

// Pontos a esclarecer: rascunhos que a sonda trouxe, por entidade, só em sessões de sites permitidos. Só contagem: sem decifrar, sem confronto, sem trilha.
otApp.get('/sensores/pontos', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    if (!await podeVerCompleto(db, user, projectId)) return SO_COMPLETO_SONDA(c);
    const { results } = await db.prepare(`SELECT a.entidade, count(*) AS n FROM ot_achados a JOIN ot_levantamentos l ON l.id = a.levantamento_id AND l.project_id = a.project_id
      WHERE a.project_id = ? AND a.situacao = 'rascunho' AND a.evidencia LIKE 'Sensor de rede (Zeek): %' AND l.status = 'ativo' AND l.site_id IN (SELECT value FROM json_each(?))
      GROUP BY a.entidade LIMIT 10`).bind(projectId, sites).all<{ entidade: string; n: number }>();
    const n = (e: string) => results.find((r) => r.entidade === e)?.n ?? 0;
    return c.json({ ativos: n('ativo'), fluxos: n('fluxo') });
  } catch (e) { return erro500(c, 'Falha ao contar os pontos a esclarecer', e); }
});

otApp.post('/sites/:sid/sensores', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    if (!await podeVerCompleto(db, user, projectId)) return SO_COMPLETO_SONDA(c);
    const sid = c.req.param('sid');
    if (!daLista(sites, sid)) return NAO_ENCONTRADO(c, 'Site');
    const v = await validateBody(c, sensorCriarSchema);
    if (!v.success) return v.response;
    const id = genId();
    await db.prepare('INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, projectId, sid, v.data.nome, v.data.faixa_origem, user.email).run();
    const k = await emitirCredencialSensor(db, projectId, id);
    await trilha(c, 'ot.sensor.criado', projectId, `Sonda ${id} criada no site ${sid}; credencial ${k.id}`, { tipo: 'ot_sensor', id });
    const conf = `# /etc/n-ot-sonda.conf\nurl = ${appUrl(c.env)}/ot-sensor/resumo\ncredencial = ${k.credencial}\n`;
    return c.json({ sensor: { id, nome: v.data.nome, faixa_origem: v.data.faixa_origem, situacao: 'ativa' }, credencial: k.credencial, expira_em: k.expira_em, conf }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar a sonda', e); }
});

/** Sonda ativa do projeto e de site permitido (P0-4); senão 404. */
const sondaDoProjeto = async (c: C, db: D1Database, projectId: string, sites: string) => {
  const s = await db.prepare(`SELECT id, site_id FROM ot_sensores WHERE id = ? AND project_id = ? AND situacao = 'ativa'`).bind(c.req.param('id'), projectId).first<{ id: string; site_id: string }>();
  return s && daLista(sites, s.site_id) ? s : null;
};

otApp.post('/sensores/:id/credenciais', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    if (!await podeVerCompleto(db, user, projectId)) return SO_COMPLETO_SONDA(c);
    const s = await sondaDoProjeto(c, db, projectId, sites);
    if (!s) return NAO_ENCONTRADO(c, 'Sonda');
    let k;
    try { k = await emitirCredencialSensor(db, projectId, s.id); } catch (e) { const r = recusaSensor(c, e); if (r) return r; throw e; }
    await trilha(c, 'ot.sensor.credencial', projectId, `Credencial ${k.id} emitida para a sonda ${s.id}`, { tipo: 'ot_sensor', id: s.id });
    return c.json({ credencial: k.credencial, expira_em: k.expira_em }, 201);
  } catch (e) { return erro500(c, 'Falha ao emitir a credencial da sonda', e); }
});

otApp.delete('/sensores/:id/credenciais/:cid', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    if (!await podeVerCompleto(db, user, projectId)) return SO_COMPLETO_SONDA(c);
    const s = await sondaDoProjeto(c, db, projectId, sites);
    const cid = c.req.param('cid');
    if (!s) return NAO_ENCONTRADO(c, 'Sonda');
    const r = await db.prepare(`UPDATE ot_sensor_credenciais SET situacao = 'revogada' WHERE id = ? AND sensor_id = ? AND project_id = ? AND situacao = 'ativa'`).bind(cid, s.id, projectId).run();
    if (!r.meta.changes) return NAO_ENCONTRADO(c, 'Credencial');
    await trilha(c, 'ot.sensor.credencial', projectId, `Credencial ${cid} da sonda ${s.id} revogada`, { tipo: 'ot_sensor', id: s.id });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao revogar a credencial da sonda', e); }
});

otApp.delete('/sensores/:id', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    if (!await podeVerCompleto(db, user, projectId)) return SO_COMPLETO_SONDA(c);
    const s = await sondaDoProjeto(c, db, projectId, sites);
    if (!s) return NAO_ENCONTRADO(c, 'Sonda');
    const [, cs] = await db.batch([
      db.prepare(`UPDATE ot_sensores SET situacao = 'revogada' WHERE id = ? AND project_id = ?`).bind(s.id, projectId),
      db.prepare(`UPDATE ot_sensor_credenciais SET situacao = 'revogada' WHERE sensor_id = ? AND project_id = ? AND situacao = 'ativa'`).bind(s.id, projectId),
    ]);
    await trilha(c, 'ot.sensor.revogado', projectId, `Sonda ${s.id} revogada com ${cs.meta.changes} credenciais`, { tipo: 'ot_sensor', id: s.id });
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao revogar a sonda', e); }
});

// ─── base do site (spec fluidez §3 e §6) ────────────────────────────────────
otApp.get('/sites/:id/situacao', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const s = daLista(sites, c.req.param('id')) ? await situacaoDoSite(db, projectId, c.req.param('id')) : null;
    return s ? c.json(s) : NAO_ENCONTRADO(c, 'Site');
  } catch (e) { return erro500(c, 'Falha ao ler a situação do site', e); }
});

/** Pedir, aprovar e devolver a base: mesmo desfecho (404/409 do serviço) e trilha só com ids. */
async function decidirBase(c: C, acao: 'pedida' | 'aprovada' | 'devolvida', justificativa = '') {
  const { db, user, projectId, sites } = await contexto(c);
  const id = c.req.param('id')!;
  if (!daLista(sites, id)) return NAO_ENCONTRADO(c, 'Site');
  const fn = { pedida: pedirBase, aprovada: aprovarBase, devolvida: devolverBase }[acao];
  const r = await fn(db, user, projectId, id);
  if (!r.ok) return c.json({ error: r.error }, r.status);
  // a entrega sai antes da trilha: um erro ao gravar a auditoria (já com a obra fechada) não pode deixar o SOC sem os desvios
  if ('fechouObra' in r && r.fechouObra) {
    const ctx = { waitUntil: (p: Promise<unknown>) => { try { c.executionCtx.waitUntil(p); } catch { /* sem contexto (testes): segue solta */ } } };
    ctx.waitUntil(entregarAbertos(c.env, ctx, projectId, id).catch((e) => console.error('ot.desvio: falha ao entregar ao fechar a obra', e)));
  }
  await trilha(c, `ot.site.base_${acao}`, projectId, `Base do site ${id} ${acao}`, { tipo: 'ot_site', id }, justificativa);
  if ('fechouObra' in r && r.fechouObra) await trilha(c, 'ot.site.obra_fechada', projectId, `Obra do site ${id} fechada pela aprovação da base`, { tipo: 'ot_site', id });
  return c.json({ ok: true });
}
otApp.post('/sites/:id/base/pedir', async (c) => {
  try { return await decidirBase(c, 'pedida'); } catch (e) { return erro500(c, 'Falha ao pedir a base', e); }
});
otApp.post('/sites/:id/base/aprovar', async (c) => {
  try {
    if (!ehGestorArciber(c, c.req.param('projectId')!)) return c.json({ error: 'Forbidden: só o Gestor ARCiber decide a base' }, 403);
    const v = await validateBody(c, otBaseAprovarSchema);
    if (!v.success) return v.response;
    return await decidirBase(c, 'aprovada');
  } catch (e) { return erro500(c, 'Falha ao aprovar a base', e); }
});
otApp.post('/sites/:id/base/devolver', async (c) => {
  try {
    if (!ehGestorArciber(c, c.req.param('projectId')!)) return c.json({ error: 'Forbidden: só o Gestor ARCiber decide a base' }, 403);
    const v = await validateBody(c, otBaseDevolverSchema);
    if (!v.success) return v.response;
    return await decidirBase(c, 'devolvida', v.data.motivo);
  } catch (e) { return erro500(c, 'Falha ao devolver a base', e); }
});

// ─── obra do site (spec fluidez E4): só o Gestor ARCiber abre ou renova ────────
async function decidirObra(c: C, fn: typeof abrirObra, acao: 'aberta' | 'renovada', dados: { justificativa: string; ate: string }) {
  const { db, user, projectId, sites } = await contexto(c);
  const id = c.req.param('id')!;
  if (!daLista(sites, id)) return NAO_ENCONTRADO(c, 'Site');
  const r = await fn(db, user, projectId, id, dados);
  if (!r.ok) return c.json({ error: r.error }, r.status);
  await trilha(c, `ot.site.obra_${acao}`, projectId, `Obra do site ${id} ${acao} até ${dados.ate}`, { tipo: 'ot_site', id }, dados.justificativa);
  return c.json({ ok: true });
}
// uma rota por declaração, com o validateBody dentro dela: é o que o contrato (test/openapi.test.ts) consegue ler
otApp.post('/sites/:id/obra/abrir', async (c) => {
  try {
    if (!ehGestorArciber(c, c.req.param('projectId')!)) return c.json({ error: 'Forbidden: só o Gestor ARCiber decide a obra' }, 403);
    const v = await validateBody(c, otObraSchema);
    if (!v.success) return v.response;
    return await decidirObra(c, abrirObra, 'aberta', v.data);
  } catch (e) { return erro500(c, 'Falha ao abrir a obra', e); }
});
otApp.post('/sites/:id/obra/renovar', async (c) => {
  try {
    if (!ehGestorArciber(c, c.req.param('projectId')!)) return c.json({ error: 'Forbidden: só o Gestor ARCiber decide a obra' }, 403);
    const v = await validateBody(c, otObraSchema);
    if (!v.success) return v.response;
    return await decidirObra(c, renovarObra, 'renovada', v.data);
  } catch (e) { return erro500(c, 'Falha ao renovar a obra', e); }
});

// ─── desvios (spec n-ot-desvio) ─────────────────────────────────────────────
// `dados` nunca sai cru: só os campos da tela. Pontas por nome/zona (corpoWebhook resolve por id ou ip_hash, que não sai); IP só de ativo
// desvio e só a quem vê completo (sem a chave `ip` para os demais).
otApp.get('/desvios', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const filtros = [c.req.query('situacao'), c.req.query('site_id'), c.req.query('tipo')].flatMap((v) => [v ?? null, v ?? null]);
    const onde = `d.project_id = ? AND d.${NO_SITE} AND (? IS NULL OR d.situacao = ?) AND (? IS NULL OR d.site_id = ?) AND (? IS NULL OR d.tipo = ?)`;
    // contagem das abas e do cartão: só o número, sem projeção, sem decifrar e sem trilha de ver_sensivel
    if (c.req.query('contagem') === '1') {
      const r = await db.prepare(`SELECT count(*) AS total FROM ot_desvios d WHERE ${onde}`).bind(projectId, sites, ...filtros).first<{ total: number }>();
      return c.json({ total: r?.total ?? 0 });
    }
    const completo = await podeVerCompleto(db, user, projectId);
    const { results } = await db.prepare(`SELECT d.*, s.nome AS site_nome,
        (SELECT a.id FROM ot_achados a WHERE a.project_id = d.project_id AND a.chave_sensor = d.chave_sensor AND a.situacao = 'rascunho' LIMIT 1) AS achado_id,
        (SELECT a.levantamento_id FROM ot_achados a WHERE a.project_id = d.project_id AND a.chave_sensor = d.chave_sensor AND a.situacao = 'rascunho' LIMIT 1) AS achado_levantamento_id
      FROM ot_desvios d JOIN ot_sites s ON s.id = d.site_id AND s.project_id = d.project_id
      WHERE ${onde}
      ORDER BY d.ultima_vez DESC LIMIT ${TETO_LEITURA_OT}`)
      .bind(projectId, sites, ...filtros)
      .all<LinhaDesvio & { site_nome: string; achado_id: string | null; achado_levantamento_id: string | null; aceito_ate: string | null; nota: string | null }>();
    const porSite = new Map<string, typeof results>();
    for (const d of results) porSite.set(d.site_id, [...porSite.get(d.site_id) ?? [], d]);
    const vistos = new Map<string, Awaited<ReturnType<typeof projetarDesvios>>[number]>();
    for (const [siteId, lista] of porSite) {
      for (const x of await projetarDesvios(c.env, projectId, siteId, lista)) vistos.set(x.id, x);
    }
    const chaves = chavesOt(c.env);
    let sensiveis = 0;
    const desvios = await Promise.all(results.map(async (d) => {
      const x = vistos.get(d.id);
      const dados = JSON.parse(d.dados) as { ip_cifrado?: string; fabricante?: string; protocolos_portas?: unknown };
      const cifra = dados.ip_cifrado;
      // descritores sem endereço, só do desvio de ativo: o que o consultor precisa para agir mesmo sem ver o IP
      const desc = d.tipo === 'ativo' ? { ...dados.fabricante !== undefined && { fabricante: dados.fabricante },
        ...dados.protocolos_portas !== undefined && { protocolos_portas: dados.protocolos_portas } } : {};
      const ip = completo && cifra && chaves ? { ip: await decifrarOt(cifra, chaves, aadOt(projectId, 'ot_desvios', d.id, 'ip')) } : {};
      if ('ip' in ip) sensiveis++;
      return { id: d.id, site_id: d.site_id, site_nome: d.site_nome, tipo: d.tipo, situacao: d.situacao, protocolo: x?.protocolo ?? null, porta: x?.porta ?? null,
        externo: x?.externo ?? false, origem: x?.origem, destino: x?.destino, ...desc, ...ip, primeira_vez: d.primeira_vez, ultima_vez: d.ultima_vez,
        ocorrencias: d.ocorrencias, aceito_ate: d.aceito_ate, nota: d.nota, achado_id: d.achado_id, achado_levantamento_id: d.achado_levantamento_id };
    }));
    if (sensiveis) await trilha(c, 'ot.inventario.ver_sensivel', projectId, `${sensiveis} desvio(s) com IP sem máscara`);
    return c.json({ desvios });
  } catch (e) { return erro500(c, 'Falha ao listar os desvios', e); }
});

/** aberto → tratado/aceito, com trilha e webhook `fechado` (como o lote aprovado). Guarda na situação: outro clique não sobrescreve. */
async function fecharDesvio(c: C, situacao: 'tratado' | 'aceito', nota: string, aceitoAte: string | null) {
  const { db, user, projectId, sites } = await contexto(c);
  const id = c.req.param('id')!;
  const linha = await db.prepare(`UPDATE ot_desvios SET situacao = ?, nota = ?, aceito_ate = ?, atualizado_por = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND project_id = ? AND ${NO_SITE} AND situacao = 'aberto' RETURNING *`).bind(situacao, nota, aceitoAte, user.id, id, projectId, sites).first<LinhaDesvio>();
  if (!linha) {
    const existe = await db.prepare(`SELECT 1 FROM ot_desvios WHERE id = ? AND project_id = ? AND ${NO_SITE}`).bind(id, projectId, sites).first();
    return existe ? c.json({ error: 'Só desvio aberto pode ser tratado ou aceito' }, 409) : NAO_ENCONTRADO(c, 'Desvio');
  }
  // aviso antes da trilha: o UPDATE já gravou, e uma falha da trilha não pode levar o webhook junto
  // o getter `c.executionCtx` lança sem contexto (app.request, testes): aí o aviso é solto, sem waitUntil
  avisar(c.env, { waitUntil: (p: Promise<unknown>) => { try { c.executionCtx.waitUntil(p); } catch { /* sem contexto */ } } }, projectId, [linha], 'fechado');
  await trilha(c, `ot.desvio.${situacao}`, projectId, `Desvio ${id} ${situacao}`, { tipo: 'ot_desvio', id });
  return c.json({ ok: true });
}

otApp.post('/desvios/:id/tratar', async (c) => {
  try {
    const v = await validateBody(c, otDesvioTratarSchema);
    if (!v.success) return v.response;
    return await fecharDesvio(c, 'tratado', v.data.nota, null);
  } catch (e) { return erro500(c, 'Falha ao tratar o desvio', e); }
});

otApp.post('/desvios/:id/aceitar', async (c) => {
  try {
    if (!ehGestorArciber(c, c.req.param('projectId')!)) return c.json({ error: 'Forbidden: só o Gestor ARCiber aceita um desvio' }, 403);
    const v = await validateBody(c, otDesvioAceitarSchema);
    if (!v.success) return v.response;
    return await fecharDesvio(c, 'aceito', v.data.justificativa, `${v.data.ate}T23:59:59.999Z`);
  } catch (e) { return erro500(c, 'Falha ao aceitar o desvio', e); }
});
