import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import JSZip from 'jszip';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// De-para de planilha do n.ot (L4): proposta (perfil, IA mascarada ou cabeçalho), aplicação como achados da sessão documental, perfis
// por projeto. O arquivo fica em memória (P0-3): nada vai ao R2 nem ao toMarkdown. Trilha só com ids e contagens (P1-7). D1 real.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const CHAVE = 'chave-ot-depara';
let chamadasIa = 0;
const toMarkdown: unknown[] = [];
const puts: unknown[] = [];
let chamadasTexto = 0;
type Entrada = { messages: { content: string }[]; response_format: { json_schema: { required: string[] } } };
const run = async (_m: string, p: Entrada) => {
  if (p.response_format.json_schema.required.includes('itens')) {
    // texto: um ativo por IP citado, evidência copiada do texto recebido
    chamadasTexto++;
    const itens = [...p.messages[1].content.matchAll(/RTU (\w+) em (\[\[IP_[0-9a-f]{8}\]\])/g)].map((x) => ({ nome: `RTU ${x[1]}`, ip: x[2], evidencia: x[0] }));
    return { response: { itens } };
  }
  chamadasIa++;
  const n = (p.messages[1].content.match(/"indice"/g) ?? []).length;
  return { response: { colunas: [{ indice: 0, campo: 'nome' }, ...(n > 1 ? [{ indice: 1, campo: 'ip' }] : [])] } };
};
const ENV_EXTRA = {
  AI: { run, toMarkdown: async (...a: unknown[]) => { toMarkdown.push(a); return []; } },
  STORAGE: { put: async (...a: unknown[]) => { puts.push(a); } }, TRILHA: { put: async (...a: unknown[]) => { puts.push(a); } },
};
const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), { ...workerEnv(), ...ENV_EXTRA });
const multipart = (h: H, caminho: string, csv: BlobPart, campos: Record<string, string> = {}, nome = 'inv.csv', extra: Record<string, unknown> = ENV_EXTRA) => {
  const fd = new FormData();
  fd.set('file', new File([csv], nome));
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return app.fetch(new Request('http://localhost' + caminho, { method: 'POST', headers: h, body: fd }), { ...workerEnv(), ...extra });
};
const criar = async (h: H, rota: string, corpo: unknown) => {
  const r = await chamar(h, 'POST', `${P}/${rota}`, corpo);
  expect(r.status, `${rota} ${await r.clone().text()}`).toBe(201);
  return (await r.json<{ id: string }>()).id;
};

const CSV = 'Equipamento;Endereço;Observação\nRTU Depara;10.1.9.1;campo\nIHM Depara;10.1.9.2;\n;;\n';
let gestor: H, tec: H, cons: H;
const ids: Record<string, string> = {};
const proposta = (h: H, csv = CSV, lev = ids.doc, nome?: string) => multipart(h, `${P}/levantamentos/${lev}/depara/planilha/proposta`, csv, {}, nome);
const aplicar = (h: H, campos: Record<string, string>, csv = CSV, lev = ids.doc) => multipart(h, `${P}/levantamentos/${lev}/depara/planilha/aplicar`, csv, campos);

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'),
      ('u-tec', 'tec@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a')`),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-ot-d', 'proj-a', ?, 'escrita', 'write', 'Active')`).bind(await sha256Hex(CHAVE)),
  ]);
  await designarConsultor('cons-ot@ness.lat', 'proj-a');
  await concederModulos(['u-gestor', 'u-tec', 'cons:cons-ot@ness.lat'], ['ot']);
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tec = await sessionFor({ id: 'u-tec', email: 'tec@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', role: 'consultor' });
  ids.s1 = await criar(cons, 'sites', { nome: 'SE Norte' });
  expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tec', site_id: ids.s1 })).status).toBe(201);
  ids.doc = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'documento', realizado_em: '2026-11-03', documento_titulo: 'Inventário 2023' });
  ids.ent = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'entrevista', realizado_em: '2026-11-03' });
});

type Ach = { id: string; origem: string; dados: Record<string, unknown>; evidencia: string };
const MAPA = JSON.stringify({ '0': 'nome', '1': 'ip' });

describe('de-para de planilha', () => {
  it('proposta sem perfil vem da IA, com cabeçalho e número de linhas', async () => {
    const r = await proposta(cons);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toEqual({ cabecalho: ['Equipamento', 'Endereço', 'Observação'], mapeamento: { '0': 'nome', '1': 'ip' }, origem: 'ia', linhas: 2 });
  });

  it('aplicar grava achados do consultor e salva o perfil; o IP chega ao ativo pelo envio e aprovação', async () => {
    const r = await aplicar(cons, { mapeamento: MAPA, perfil_nome: 'Inventário SE Norte 2023', perfil_fonte: 'Planilha da manutenção' });
    expect(r.status, await r.clone().text()).toBe(201);
    const b = await r.json<{ criados: number; com_aviso: number; perfil_id: string }>();
    expect(b).toMatchObject({ criados: 2, com_aviso: 0 });
    expect(b.perfil_id).toBeTruthy();
    const { achados } = await (await chamar(cons, 'GET', `${P}/levantamentos/${ids.doc}`)).json<{ achados: Ach[] }>();
    expect(achados).toHaveLength(2);
    expect(achados.every((a) => a.origem === 'consultor')).toBe(true);
    expect(achados.map((a) => a.evidencia)).toEqual(['Planilha importada, linha 2', 'Planilha importada, linha 3']);
    const e = await chamar(cons, 'POST', `${P}/levantamentos/${ids.doc}/enviar`, { achados: [achados[0].id] });
    expect(e.status, await e.clone().text()).toBe(201);
    expect((await chamar(gestor, 'POST', `${P}/lotes/${(await e.json<{ id: string }>()).id}/aprovar`)).status).toBe(200);
    const { ativos } = await (await chamar(cons, 'GET', `${P}/ativos?site_id=${ids.s1}`)).json<{ ativos: { nome: string; ip: string }[] }>();
    expect(ativos.find((a) => a.nome === 'RTU Depara')?.ip).toBe('10.1.9.1');
    const { perfis } = await (await chamar(cons, 'GET', `${P}/depara/perfis`)).json<{ perfis: { id: string; nome: string; fonte: string }[] }>();
    expect(perfis).toEqual([expect.objectContaining({ id: b.perfil_id, nome: 'Inventário SE Norte 2023', fonte: 'Planilha da manutenção' })]);
  });

  it('mesmo cabeçalho: proposta do perfil, sem IA', async () => {
    const antes = chamadasIa;
    const r = await proposta(cons, 'equipamento;endereco;observacao\nX;10.1.9.3;\n');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ origem: 'perfil', mapeamento: { '0': 'nome', '1': 'ip' }, perfil: { nome: 'Inventário SE Norte 2023' } });
    expect(chamadasIa).toBe(antes);
  });

  it('perfil removido sai da lista e volta ativo ao salvar de novo', async () => {
    const { perfis } = await (await chamar(cons, 'GET', `${P}/depara/perfis`)).json<{ perfis: { id: string }[] }>();
    expect((await chamar(cons, 'DELETE', `${P}/depara/perfis/${perfis[0].id}`)).status).toBe(200);
    expect((await (await chamar(cons, 'GET', `${P}/depara/perfis`)).json<{ perfis: unknown[] }>()).perfis).toEqual([]);
    expect((await chamar(cons, 'DELETE', `${P}/depara/perfis/${perfis[0].id}`)).status).toBe(404);
    const r = await aplicar(cons, { mapeamento: MAPA, perfil_nome: 'De novo' }, 'Equipamento;Endereço;Observação\n');
    expect(r.status).toBe(201);
    expect((await r.json<{ perfil_id: string }>()).perfil_id).toBe(perfis[0].id);
  });

  it('recusas: sessão de entrevista, chave de API, PDF, campo repetido, campo de banco, índice fora, perfil com IP', async () => {
    expect((await proposta(cons, CSV, ids.ent)).status).toBe(409);
    expect((await aplicar(cons, { mapeamento: MAPA }, CSV, ids.ent)).status).toBe(409);
    expect((await proposta(cons, CSV, 'nao-existe')).status).toBe(404);
    expect((await proposta({ 'X-API-Key': CHAVE })).status).toBe(403);
    expect((await chamar({ 'X-API-Key': CHAVE }, 'GET', `${P}/depara/perfis`)).status).toBe(403);
    expect((await proposta(cons, CSV, ids.doc, 'inv.pdf')).status).toBe(400);
    expect((await aplicar(cons, { mapeamento: JSON.stringify({ '0': 'nome', '1': 'nome' }) })).status).toBe(400);
    expect((await aplicar(cons, { mapeamento: JSON.stringify({ '0': 'nome', '1': 'ip_cifrado' }) })).status).toBe(400);
    expect((await aplicar(cons, { mapeamento: JSON.stringify({ '0': 'nome', '7': 'ip' }) })).status).toBe(400);
    expect((await aplicar(cons, { mapeamento: 'não é json' })).status).toBe(400);
    const vazio = await aplicar(cons, { mapeamento: '{}' });
    expect(vazio.status).toBe(400);
    expect(await vazio.json()).toEqual({ error: 'Escolha ao menos uma coluna' });
    expect((await aplicar(cons, { mapeamento: MAPA, perfil_nome: 'Lista do 10.1.9.9' })).status).toBe(400);
  });

  it('planilha acima dos tetos ou ilegível: 400 e nenhum lote nem item gravado (teto de linhas em ot-planilha, aqui pela rota)', async () => {
    const conta = async () => (await env.DB.prepare(`SELECT (SELECT count(*) FROM ot_lotes) + (SELECT count(*) FROM ot_lote_itens) + (SELECT count(*) FROM ot_achados) AS n`).first<{ n: number }>())!.n;
    const n0 = await conta();
    const CAB = 'nome;ip;mac';
    for (const [nome, conteudo] of [['g.csv', [CAB, ...Array(5001).fill('X;;')].join('\n')], ['x.xlsx', 'não é zip']] as const) {
      expect((await proposta(cons, conteudo, ids.doc, nome)).status, nome).toBe(400);
    }
    expect(await conta()).toBe(n0);
  });

  it('corpo sem Content-Length (chunked) acima do teto: 413, lido só até o teto', async () => {
    const pedaco = new Uint8Array(1024 * 1024).fill(97);
    let enviados = 0;
    const corpo = new ReadableStream<Uint8Array>({ pull(ctl) { if (enviados++ < 8) ctl.enqueue(pedaco); else ctl.close(); } });
    const r = await app.fetch(new Request(`http://localhost${P}/levantamentos/${ids.doc}/depara/planilha/proposta`,
      { method: 'POST', headers: { ...cons, 'Content-Type': 'multipart/form-data; boundary=x' }, body: corpo }), { ...workerEnv(), ...ENV_EXTRA });
    expect(r.status).toBe(413);
    expect(enviados, 'leu o corpo inteiro').toBeLessThan(8);
  });

  it('11ª proposta com IA na hora: 429 teto_por_hora', async () => {
    let r: Response | undefined;
    for (let i = 0; i < 12; i++) {
      r = await proposta(cons, `Coluna${i};IP\nA;10.1.8.${i}\n`);
      if (r.status !== 200) break;
    }
    expect(r!.status).toBe(429);
    expect(await r!.json()).toEqual({ error: 'Limite por hora do de-para atingido (10 por pessoa e 30 por projeto). Tente de novo mais tarde.', codigo: 'teto_por_hora' });
    expect(chamadasIa).toBe(10);
    // quem passou do próprio teto e insiste não gasta o do projeto
    const projeto = async () => (await env.DB.prepare(`SELECT count FROM rate_limits WHERE key = 'ot:depara:projeto:proj-a'`).first<{ count: number }>())?.count;
    expect(await projeto()).toBe(10);
    for (let i = 0; i < 3; i++) expect((await proposta(cons, `Outra${i};IP\nA;10.1.8.1\n`)).status).toBe(429);
    expect(await projeto()).toBe(10);
  });

  it('teto de 2.000 achados na sessão vale por linha: com 1.999, aplicar 3 linhas cria 1', async () => {
    const lev = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'documento', realizado_em: '2026-11-03', documento_titulo: 'Cheio' });
    await env.DB.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1999)
      INSERT INTO ot_achados (id, project_id, levantamento_id, criado_por) SELECT 'cheio-' || i, 'proj-a', ?, 'x' FROM n`).bind(lev).run();
    const r = await aplicar(cons, { mapeamento: MAPA }, 'Equipamento;Endereço\nA;10.1.9.11\nB;10.1.9.12\nC;10.1.9.13\n', lev);
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toMatchObject({ criados: 1 });
    const n = async () => (await env.DB.prepare('SELECT count(*) AS n FROM ot_achados WHERE levantamento_id = ?').bind(lev).first<{ n: number }>())!.n;
    expect(await n()).toBe(2000);
    expect((await aplicar(cons, { mapeamento: MAPA }, 'Equipamento;Endereço\nD;10.1.9.14\n', lev)).status).toBe(400);
    expect(await n()).toBe(2000);
  });

  it('trilha sem nome de arquivo nem IP; nada ao R2 nem ao toMarkdown', async () => {
    const { results } = await env.DB.prepare(`SELECT details, justification FROM audit_logs WHERE action LIKE 'ot.depara.%' LIMIT 100`).all<{ details: string; justification: string }>();
    expect(results.map((l) => l.details)).toContainEqual(expect.stringMatching(/^2 achados do levantamento .+ por de-para; perfil salvo: sim$/));
    for (const l of results) {
      expect(l.details + l.justification).not.toContain('inv.csv');
      expect(l.details + l.justification).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    }
    expect(puts).toEqual([]);
    expect(toMarkdown).toEqual([]);
  });
});

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
async function docx(corpo: string) {
  const z = new JSZip();
  z.file('word/document.xml', `<w:document ${W}><w:body>${corpo}</w:body></w:document>`);
  return z.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}
const par = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const texto = (h: H, arquivo: BlobPart, nome = 'relatorio.docx', lev = ids.doc, extra?: Record<string, unknown>) =>
  multipart(h, `${P}/levantamentos/${lev}/depara/texto`, arquivo, {}, nome, extra);
const contarAchados = async () => (await env.DB.prepare('SELECT count(*) AS n FROM ot_achados WHERE levantamento_id = ?').bind(ids.doc).first<{ n: number }>())!.n;

describe('de-para de texto', () => {
  beforeAll(async () => { await env.DB.prepare(`DELETE FROM rate_limits WHERE key LIKE 'ot:depara:%'`).run(); });

  it('DOCX com dois parágrafos sobre um ativo: 1 achado da IA em rascunho, evidência sem IP', async () => {
    const antes = await contarAchados();
    const r = await texto(cons, await docx(par('A RTU Texto em 10.1.7.7 faz o telecontrole.') + par('A RTU Texto fica na sala 2.')));
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toEqual({ criados: 1, com_aviso: 0, descartados: 0, trechos_pulados: 0 });
    expect(await contarAchados()).toBe(antes + 1);
    const { achados } = await (await chamar(cons, 'GET', `${P}/levantamentos/${ids.doc}`)).json<{ achados: (Ach & { situacao: string })[] }>();
    const a = achados.find((x) => x.origem === 'ia')!;
    expect(a).toMatchObject({ situacao: 'rascunho', evidencia: 'RTU Texto em [IP]', dados: { nome: 'RTU Texto' } });
    expect(a.evidencia).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });

  it('IA ausente: 422 com mensagem, nada gravado', async () => {
    const antes = await contarAchados();
    const r = await texto(cons, 'A RTU Sem em 10.1.7.8 faz algo.', 'nota.txt', ids.doc, { ...ENV_EXTRA, AI: undefined });
    expect(r.status).toBe(422);
    expect((await r.json<{ error: string }>()).error).toBeTruthy();
    expect(await contarAchados()).toBe(antes);
  });

  it('recusas: sessão encerrada, PDF, DOCX com DTD, acima de 60 mil caracteres, trechos demais', async () => {
    const enc = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'documento', realizado_em: '2026-11-03', documento_titulo: 'Encerrado' });
    expect((await chamar(cons, 'PUT', `${P}/levantamentos/${enc}`, { situacao: 'encerrado' })).status).toBe(200);
    expect((await texto(cons, 'RTU', 'a.txt', enc)).status).toBe(409);
    expect((await texto(cons, 'RTU', 'a.pdf')).status).toBe(400);
    expect((await texto(cons, await docx('<!DOCTYPE x>' + par('a')))).status).toBe(400);
    expect((await texto(cons, 'a'.repeat(61_000), 'a.txt')).status).toBe(413);
    const antes = chamadasTexto;
    const tentativas = async () => (await env.DB.prepare(`SELECT count FROM rate_limits WHERE key = 'ot:depara:pessoa:cons:cons-ot@ness.lat'`).first<{ count: number }>())?.count;
    const contadas = await tentativas();
    const vazio = await texto(cons, ' \n\n ', 'a.txt');
    expect(vazio.status).toBe(400);
    expect(await vazio.json()).toEqual({ error: 'Documento sem texto' });
    expect(await tentativas()).toBe(contadas); // documento vazio não gasta a tentativa da hora
    const muitos = await texto(cons, Array.from({ length: 37 }, () => 'b'.repeat(1600)).join('\n'), 'a.txt');
    expect(muitos.status).toBe(400);
    expect(await muitos.json()).toEqual({ error: 'Documento grande demais: divida em partes de até 60 mil caracteres' });
    expect(chamadasTexto).toBe(antes);
  });

  it('nada ao R2 nem ao toMarkdown; trilha sem nome de arquivo nem IP', async () => {
    const { results } = await env.DB.prepare(`SELECT details, justification FROM audit_logs WHERE action = 'ot.depara.texto' LIMIT 100`).all<{ details: string; justification: string }>();
    expect(results.map((l) => l.details)).toContainEqual(expect.stringMatching(/^1 achados do levantamento .+ sugeridos pela IA; 0 descartados; 0 trechos pulados$/));
    for (const l of results) {
      expect(l.details + l.justification).not.toMatch(/relatorio|nota\.txt|\d+\.\d+\.\d+\.\d+/);
    }
    expect(puts).toEqual([]);
    expect(toMarkdown).toEqual([]);
  });
});

// Export de ativos do Nozomi: cabeçalho real (19 colunas, na ordem real), linhas inventadas.
const NOZOMI_CAB = 'appliance_sites,appliance_hosts,capture_device,name,type,os_or_firmware,ip,vendor,product_name,serial_number,vlan_id,mac_address,mac_vendor,roles,level,protocols,zones,created_at,last_activity_time';
const nozomiLinha = (nome: string, ip: string, mac: string, protocols: string, zones: string) =>
  `Site Teste,guardian-t,port1,${nome},rtu,v1.0,${ip},FabX,ModY,SN-${nome},10,${mac},RouterCo,slave,1,"${protocols}","${zones}",2026-01-01,2026-01-02`;
const NOZOMI = [NOZOMI_CAB,
  nozomiLinha('RTU-N1', '10.30.0.1', '02:00:00:00:aa:01', 'tcp/445,other,iec104', 'Undefined,Controle Nozomi'),
  nozomiLinha('RTU-N2', '10.30.0.2', '02:00:00:00:ff:fe', 'other', 'Layer2'),
  nozomiLinha('RTU-N3', '10.30.0.3', '02:00:00:00:ff:fe', 'udp/161', 'Controle Nozomi'),
  nozomiLinha('RTU-N4', '192.0.2.4', '02:00:00:00:ff:fe', 'opc-ua', ''),
].join('\n') + '\n';

describe('de-para: perfil de fábrica Nozomi', () => {
  const contagens = async () => (await env.DB.prepare(`SELECT key, count FROM rate_limits WHERE key LIKE 'ot:depara:%' ORDER BY key`).all()).results;
  beforeAll(async () => {
    await env.DB.prepare(`DELETE FROM rate_limits WHERE key LIKE 'ot:depara:%'`).run();
    ids.noz = await criar(cons, 'levantamentos', { site_id: ids.s1, tipo: 'documento', realizado_em: '2026-11-10', documento_titulo: 'Export Nozomi' });
    ids.zNoz = await criar(cons, 'zonas', { site_id: ids.s1, nome: 'Controle Nozomi', nivel_purdue: 1 });
  });

  it('proposta: reconhece o export pelo cabeçalho, mapeia pelo nome da coluna, sem IA e sem gastar o teto da hora', async () => {
    const antes = chamadasIa, teto = await contagens();
    const r = await proposta(cons, NOZOMI, ids.noz);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toEqual({ cabecalho: NOZOMI_CAB.split(','), origem: 'nozomi', linhas: 4, mapeamento: { '3': 'nome', '4': 'tipo_dispositivo',
      '5': 'firmware_so_versao', '6': 'ip', '7': 'fabricante', '8': 'modelo', '11': 'mac', '15': 'protocolos_portas', '16': 'zona' } });
    expect(chamadasIa).toBe(antes);
    expect(await contagens()).toEqual(teto);
  });

  it('cabeçalho em outra ordem e com coluna a mais: mesmo mapeamento pelo nome', async () => {
    const r = await proposta(cons, 'extra,zones,capture_device,ip,name,appliance_hosts\nx,Controle,p1,10.30.0.9,RTU-X,g\n', ids.noz);
    expect(await r.json()).toMatchObject({ origem: 'nozomi', mapeamento: { '1': 'zona', '3': 'ip', '4': 'nome' } });
  });

  it('aplicar: protocolos e zona do Nozomi convertidos; MAC em 3 linhas sai, MAC único fica', async () => {
    const mapa = (await (await proposta(cons, NOZOMI, ids.noz)).json<{ mapeamento: Record<string, string> }>()).mapeamento;
    const r = await aplicar(cons, { mapeamento: JSON.stringify(mapa) }, NOZOMI, ids.noz);
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await r.json()).toMatchObject({ criados: 4, macs_gateway: 3 });
    const { achados } = await (await chamar(cons, 'GET', `${P}/levantamentos/${ids.noz}`)).json<{ achados: Ach[] }>();
    const por = (nome: string) => achados.find((a) => a.dados.nome === nome)!.dados;
    expect(por('RTU-N1')).toMatchObject({ fabricante: 'FabX', modelo: 'ModY', tipo_dispositivo: 'rtu', firmware_so_versao: 'v1.0', ip: '10.30.0.1',
      mac: '02:00:00:00:aa:01', zona_id: ids.zNoz });
    expect(por('RTU-N1').protocolos_portas).toEqual([{ protocolo: 'tcp', porta: 445 }, { protocolo: 'iec104' }]);
    expect(por('RTU-N2').protocolos_portas).toEqual([]); // só "other": nenhum protocolo
    expect(por('RTU-N2')).not.toHaveProperty('zona_id');
    expect(por('RTU-N3').protocolos_portas).toEqual([{ protocolo: 'udp', porta: 161 }]);
    for (const n of ['RTU-N2', 'RTU-N3', 'RTU-N4']) expect(por(n).mac).toBeNull();
  });

  it('mesmo ativo repetido (mesmo IP e MAC, visto por vários appliances) mantém o MAC', async () => {
    const lin = nozomiLinha('RTU-R', '10.30.0.20', '02:00:00:00:bb:01', 'tcp/502', 'Controle Nozomi');
    const mapa = (await (await proposta(cons, NOZOMI, ids.noz)).json<{ mapeamento: Record<string, string> }>()).mapeamento;
    const r = await aplicar(cons, { mapeamento: JSON.stringify(mapa) }, [NOZOMI_CAB, lin, lin, lin].join('\n') + '\n', ids.noz);
    expect(await r.json()).toMatchObject({ criados: 3, macs_gateway: 0 });
    const { achados } = await (await chamar(cons, 'GET', `${P}/levantamentos/${ids.noz}`)).json<{ achados: Ach[] }>();
    expect(achados.filter((a) => a.dados.nome === 'RTU-R').map((a) => a.dados.mac)).toEqual(Array(3).fill('02:00:00:00:bb:01'));
  });

  it('perfil salvo no projeto com a mesma assinatura vence o de fábrica', async () => {
    const mapa = JSON.stringify({ '3': 'nome', '6': 'ip' });
    expect((await aplicar(cons, { mapeamento: mapa, perfil_nome: 'Nozomi do cliente' }, NOZOMI_CAB + '\n', ids.noz)).status).toBe(201);
    const r = await proposta(cons, NOZOMI, ids.noz);
    expect(await r.json()).toMatchObject({ origem: 'perfil', mapeamento: { '3': 'nome', '6': 'ip' }, perfil: { nome: 'Nozomi do cliente' } });
  });

  it('planilha que não é Nozomi segue para a IA', async () => {
    const antes = chamadasIa;
    expect(await (await proposta(cons, 'name,ip,appliance_hosts\nX,10.30.0.8,g\n', ids.noz)).json()).toMatchObject({ origem: 'ia' });
    expect(chamadasIa).toBe(antes + 1);
  });
});
