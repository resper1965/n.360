import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Bindings, Variables } from '../index';
import { erro500, logAudit } from '../helpers';
import { validateBody } from '../schemas';
import { otIaCompletudeSchema, otIaZonaSchema } from '../schemas/ot-saidas';
import { otExportarSchema } from '../schemas/ot';
import { avisarGestorArciber, semStepUp, tetoEstourado } from '../services/ot-stepup';
import { chavesOt } from '../services/ot-cifra';
import { podeEditarOt, podeVerCompleto, sitesPermitidos } from '../services/ot-inventario';
import { ehLeitorOt } from '../services/ot-permissoes';
import { indicadoresOt } from '../services/ot-indicadores';
import { TIPO_XLSX, csvDoInventario, linhasDoSite, xlsxDoInventario } from '../services/ot-exportacao';
import { RecusaIa, perguntarIa } from '../services/ot-ia';

/**
 * Saídas do n.ot (N4): indicadores, exportação do inventário e IA. Montado no mesmo prefixo, LOGO DEPOIS do `otApp` (src/index.ts), então passa pelas
 * travas dele: chave de API e agente recusados (P0-2) e escrita (as rotas de IA são POST) só para quem cadastra o inventário.
 */
export const otSaidasApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type C = Context<{ Bindings: Bindings; Variables: Variables }>;

const contexto = async (c: C) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId')!;
  return { db: c.env.DB, user, projectId, sites: await sitesPermitidos(c.env.DB, user, projectId) };
};
const doSite = (sites: string, id: string | undefined) => !!id && (JSON.parse(sites) as string[]).includes(id);
const trilha = (c: C, acao: string, projectId: string, detalhe: string, entidade?: { tipo: string; id: string }, justificativa = '') =>
  logAudit(c.env.DB, acao, c.get('user').email, detalhe, justificativa, c.req.header('CF-Connecting-IP') ?? '', projectId, entidade);

otSaidasApp.get('/indicadores', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    const r = await indicadoresOt(db, projectId, sites);
    if (!ehLeitorOt(user, projectId)) return c.json(r);
    const { por_zona: _z, ...resumo } = r; // leitor: por_zona tem nome e id de zona e site (spec 2026-11-26 §6); fica por_nivel
    return c.json(resumo);
  } catch (e) { return erro500(c, 'Falha ao calcular os indicadores', e); }
});

// Quem exporta: quem cadastra o inventário (Gestor ARCiber e a equipe). Técnico (org_user) e client, não (spec §5). P1-1: TOTP nos
// últimos 10 min, justificativa, teto por hora e aviso ao Gestor ARCiber (services/ot-stepup.ts). POST: a justificativa não vai no endereço.
otSaidasApp.post('/exportacao', async (c) => {
  try {
    const { db, user, projectId, sites } = await contexto(c);
    if (!podeEditarOt(user)) return c.json({ error: 'Forbidden: seu papel não exporta o inventário do n.ot' }, 403);
    const sem = await semStepUp(c);
    if (sem) return sem;
    const v = await validateBody(c, otExportarSchema);
    if (!v.success) return v.response;
    const { formato, site_id: siteId, justificativa } = v.data;
    if (!doSite(sites, siteId)) return c.json({ error: 'Site não encontrado' }, 404);
    const chaves = chavesOt(c.env);
    if (!chaves) return c.json({ error: 'Inventário de ativos indisponível: as chaves do n.ot não estão configuradas' }, 503);
    const teto = await tetoEstourado(c, 'exportar', projectId);
    if (teto) return teto;
    const completo = await podeVerCompleto(db, user, projectId);
    const r = await linhasDoSite(db, chaves, projectId, siteId, completo);
    // P1-7: uma linha por requisição, só id do site e contagem.
    await trilha(c, 'ot.inventario.exportar', projectId,
      `Exportação ${formato} do site: ${r.linhas.length} ativo(s), IP/MAC ${completo ? 'sem máscara' : 'mascarados'}${r.truncado ? ' (cortada no teto)' : ''}`,
      { tipo: 'ot_site', id: siteId }, justificativa);
    await avisarGestorArciber(c, projectId, `exportou o inventário (${formato}, site ${siteId}, ${r.linhas.length} ativo(s))`, justificativa);
    const nome = `inventario-ot-${new Date().toISOString().slice(0, 10)}.${formato}`;
    return new Response(formato === 'csv' ? csvDoInventario(r.linhas) : xlsxDoInventario(r.linhas), {
      headers: {
        'Content-Type': formato === 'csv' ? 'text/csv; charset=utf-8' : TIPO_XLSX,
        'Content-Disposition': `attachment; filename="${nome}"`,
        'Cache-Control': 'no-store',
        ...(r.truncado ? { 'X-Exportacao-Truncada': '1' } : {}),
      },
    });
  } catch (e) { return erro500(c, 'Falha ao exportar o inventário', e); }
});

// ─── IA (P0-7): rascunho; quem grava é a pessoa, pelas rotas do inventário ──
const recusa = (c: C, e: unknown) => (e instanceof RecusaIa ? c.json({ error: e.message }, 422) : null);

const PROMPT_ZONA = `Você classifica ativos de tecnologia operacional (OT) do setor elétrico no modelo Purdue (níveis 0 a 5) para o inventário do ARCiber
(RO-CB.BR.01 do ONS: zonas mínimas de supervisão, DMZ operativa e corporativa, níveis 2, 3 e 4). Recebe o ativo (tipo, fabricante, modelo,
função, protocolos) e as zonas do site, numeradas. Responda só JSON com: nivel_purdue (inteiro 0-5), zona (o número da zona da lista que melhor
serve, ou null se nenhuma serve) e justificativa (até 3 frases, em português do Brasil). Não invente dado do ativo. Identificadores entre [[ ]]
são marcadores: nunca os repita.`;
const ZONA_SAIDA = z.object({ nivel_purdue: z.number().int().min(0).max(5), zona: z.number().int().nullable(), justificativa: z.string().max(1000) }).strict();
const ZONA_JSON = {
  type: 'object', additionalProperties: false, required: ['nivel_purdue', 'zona', 'justificativa'],
  properties: { nivel_purdue: { type: 'integer', minimum: 0, maximum: 5 }, zona: { type: ['integer', 'null'] }, justificativa: { type: 'string', maxLength: 1000 } },
};

otSaidasApp.post('/ia/zona-sugerida', async (c) => {
  try {
    const { db, projectId, sites } = await contexto(c);
    const v = await validateBody(c, otIaZonaSchema);
    if (!v.success) return v.response;
    // Minimização: nem nome, nem IP/MAC, nem firmware vão ao modelo; só o que classifica o ativo.
    const ativo = await db.prepare(`SELECT site_id, tipo_dispositivo, fabricante, modelo, funcao, protocolos_portas, categoria_arciber FROM ot_ativos
      WHERE id = ? AND project_id = ? AND status = 'ativo' AND site_id IN (SELECT value FROM json_each(?))`).bind(v.data.ativo_id, projectId, sites)
      .first<{ site_id: string; protocolos_portas: string; [k: string]: unknown }>();
    if (!ativo) return c.json({ error: 'Ativo não encontrado' }, 404);
    const { results: zonas } = await db.prepare(`SELECT id, nome, nivel_purdue, tipo FROM ot_zonas WHERE project_id = ? AND site_id = ? AND status = 'ativo'
      ORDER BY nivel_purdue, nome`).bind(projectId, ativo.site_id).all<{ id: string; nome: string; nivel_purdue: number; tipo: string }>();
    const { site_id: _s, protocolos_portas, ...campos } = ativo;
    const entrada = JSON.stringify({
      ativo: { ...campos, protocolos_portas: JSON.parse(protocolos_portas) as unknown },
      zonas: zonas.map((z, i) => ({ zona: i + 1, nome: z.nome, nivel_purdue: z.nivel_purdue, tipo: z.tipo })),
    });
    let s: z.infer<typeof ZONA_SAIDA>;
    try { s = await perguntarIa(c.env, PROMPT_ZONA, entrada, ZONA_SAIDA, ZONA_JSON); } catch (e) { const r = recusa(c, e); if (r) return r; throw e; }
    const zona = s.zona !== null ? zonas[s.zona - 1] : undefined;
    await trilha(c, 'ot.ia.zona_sugerida', projectId, `Sugestão de zona Purdue pedida à IA para o ativo ${v.data.ativo_id}`, { tipo: 'ot_ativo', id: v.data.ativo_id });
    return c.json({ rascunho: true, nivel_purdue: s.nivel_purdue, zona_id: zona?.id ?? null, zona_nome: zona?.nome ?? null, justificativa: s.justificativa });
  } catch (e) { return erro500(c, 'Falha ao sugerir a zona', e); }
});

const PROMPT_COMPLETUDE = `Você extrai, de uma descrição de ativo de tecnologia operacional (OT), os campos mínimos do inventário do item 4.3.1 da RO-CB.BR.01
do ONS: tipo de dispositivo, fabricante, modelo, função, endereço IP, MAC, hostname, protocolos/portas e versão de firmware ou sistema operacional.
Responda só JSON com esses campos (null quando a descrição não disser) e texto_apoio: até 3 frases, em português do Brasil, dizendo o que falta
coletar em campo. Não invente valor. Endereços, MACs e nomes de host vêm como marcadores entre [[ ]]: copie o marcador para ip, mac ou hostname,
e NUNCA o escreva em outro campo nem no texto_apoio.`;
const texto = (max: number) => z.string().max(max).nullable();
const COMPLETUDE_SAIDA = z.object({
  tipo_dispositivo: texto(200), fabricante: texto(200), modelo: texto(200), funcao: texto(500), ip: texto(100), mac: texto(100), hostname: texto(255),
  protocolos_portas: z.array(z.object({ protocolo: z.string().min(1).max(50), porta: z.number().int().min(0).max(65535).nullable().optional() }).strict()).max(50),
  firmware_so_versao: texto(200), texto_apoio: z.string().max(1500),
}).strict();
const nulo = { type: ['string', 'null'] };
const COMPLETUDE_JSON = {
  type: 'object', additionalProperties: false,
  required: ['tipo_dispositivo', 'fabricante', 'modelo', 'funcao', 'ip', 'mac', 'hostname', 'protocolos_portas', 'firmware_so_versao', 'texto_apoio'],
  properties: {
    tipo_dispositivo: nulo, fabricante: nulo, modelo: nulo, funcao: nulo, ip: nulo, mac: nulo, hostname: nulo, firmware_so_versao: nulo,
    protocolos_portas: { type: 'array', items: { type: 'object', properties: { protocolo: { type: 'string' }, porta: { type: ['integer', 'null'] } }, required: ['protocolo'] } },
    texto_apoio: { type: 'string' },
  },
};
const preenchido = (v: unknown) => typeof v === 'string' && v.trim() !== '';

otSaidasApp.post('/ia/completude', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, otIaCompletudeSchema);
    if (!v.success) return v.response;
    let s: z.infer<typeof COMPLETUDE_SAIDA>;
    try { s = await perguntarIa(c.env, PROMPT_COMPLETUDE, v.data.descricao, COMPLETUDE_SAIDA, COMPLETUDE_JSON); } catch (e) { const r = recusa(c, e); if (r) return r; throw e; }
    const { texto_apoio, ...campos } = s;
    // O que falta do 4.3.1 é conta do servidor sobre os campos extraídos, não afirmação do modelo.
    const faltando = ([
      ['Tipo de dispositivo', preenchido(campos.tipo_dispositivo)], ['Fabricante', preenchido(campos.fabricante)], ['Função', preenchido(campos.funcao)],
      ['IP ou MAC', preenchido(campos.ip) || preenchido(campos.mac)], ['Protocolo/porta', campos.protocolos_portas.length > 0],
      ['Firmware/SO', preenchido(campos.firmware_so_versao)],
    ] as const).filter(([, ok]) => !ok).map(([rotulo]) => rotulo);
    await trilha(c, 'ot.ia.completude', projectId, 'Checagem de completude do 4.3.1 pedida à IA');
    return c.json({ rascunho: true, campos, faltando, completo: faltando.length === 0, texto_apoio });
  } catch (e) { return erro500(c, 'Falha ao checar a completude', e); }
});
