import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import JSZip from 'jszip';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';

// Saídas do n.ot (N4): exportação do inventário (serializador único, P0-6; fórmulas, T15; trilha, P1-7), indicadores derivados do
// inventário, IA com máscara própria (P0-7) e a recusa de chave de API e agente (P0-2) em todas elas. Contra o D1 real.

type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const PB = '/api/v1/projects/proj-b/ot';
type Run = (m: string, p: { messages: { content: string }[] }, o: unknown) => Promise<unknown>;
const chamar = async (h: H, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), { ...workerEnv(), ...extra });
const comIa = (run: Run) => ({ AI: { run } });

const IP1 = '10.1.1.10';
const IP2 = '10.2.2.20';
const ATIVO = {
  no_arciber: true, categoria_arciber: 'centro_operacao', tipo_dispositivo: 'RTU', fabricante: 'Fab', modelo: 'M1', funcao: 'telecontrole',
  ip: IP1, mac: 'AA-BB-CC-11-22-33', protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }], firmware_so_versao: 'R136',
};
const CHAVE = 'chave-ot-saidas';
const AGENTE = { userId: 'cons:cons-ot@ness.lat', email: 'cons-ot@ness.lat', projectId: 'proj-a', concessaoId: 'c-ot-s' };

let plat: H, gestor: H, tec: H, tec0: H, cli: H, cons: H, caNao: H;
const ids: Record<string, string> = {};
const criar = async (h: H, rota: string, corpo: unknown, base = P) => {
  const r = await chamar(h, 'POST', `${base}/${rota}`, corpo);
  expect(r.status, `${rota} ${await r.clone().text()}`).toBe(201);
  return ((await r.json()) as { id: string }).id;
};

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  await habilitarOt('proj-a', 'proj-b');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'),
      ('u-tec', 'tec@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a'),
      ('u-tec0', 'tec0@cliente.teste', 'x', 'Técnico sem site', 'org_user', 'proj-a'),
      ('u-cli', 'cli@cliente.teste', 'x', 'Leitura', 'client', 'proj-a'),
      ('u-ca-n', 'ca-n@ness.lat', 'x', 'Admin não designado', 'consultoria_admin', NULL)`),
    env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-ot-s', 'proj-a', ?, 'escrita', 'write', 'Active')`).bind(await sha256Hex(CHAVE)),
  ]);
  await designarConsultor(AGENTE.email, 'proj-a');
  await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES (?, ?, 'proj-a', datetime('now', '+30 days'))`).bind(AGENTE.concessaoId, AGENTE.userId).run();
  await concederModulos(['u-gestor', 'u-tec', 'u-tec0', 'u-cli', 'u-ca-n', AGENTE.userId], ['ot']);
  plat = await sessionFor({ ...{ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' }, totp_em: Date.now() });
  gestor = await sessionFor({ ...{ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' }, totp_em: Date.now() });
  tec = await sessionFor({ ...{ id: 'u-tec', email: 'tec@cliente.teste', role: 'org_user', client_project_id: 'proj-a' }, totp_em: Date.now() });
  tec0 = await sessionFor({ ...{ id: 'u-tec0', email: 'tec0@cliente.teste', role: 'org_user', client_project_id: 'proj-a' }, totp_em: Date.now() });
  cli = await sessionFor({ ...{ id: 'u-cli', email: 'cli@cliente.teste', role: 'client', client_project_id: 'proj-a' }, totp_em: Date.now() });
  cons = await sessionFor({ ...{ id: AGENTE.userId, email: AGENTE.email, role: 'consultor' }, totp_em: Date.now() });
  caNao = await sessionFor({ ...{ id: 'u-ca-n', email: 'ca-n@ness.lat', role: 'consultoria_admin' }, totp_em: Date.now() });

  ids.s1 = await criar(cons, 'sites', { nome: '=SE Norte', tipo: 'subestacao' });
  ids.s2 = await criar(cons, 'sites', { nome: 'SE Sul' });
  ids.sb = await criar(plat, 'sites', { nome: 'SE B' }, PB);
  for (const [k, nivel] of [['z2', 2], ['z3', 3], ['z4', 4]] as const) ids[k] = await criar(cons, 'zonas', { site_id: ids.s1, nome: `Zona ${nivel}`, nivel_purdue: nivel });
  ids.a1 = await criar(gestor, 'ativos', { site_id: ids.s1, zona_id: ids.z2, nome: 'RTU Bay 1', ...ATIVO });
  ids.a2 = await criar(cons, 'ativos', { site_id: ids.s1, zona_id: ids.z3, nome: '=HYPERLINK("http://x")', fabricante: '+SUM(1)', funcao: '-2+3', modelo: '@cmd', ip: IP2 });
  ids.a3 = await criar(cons, 'ativos', { site_id: ids.s1, nome: 'Switch sem zona', tipo_dispositivo: 'Switch' });
  ids.a4 = await criar(cons, 'ativos', { site_id: ids.s2, nome: 'IED Sul', mac: '00:11:22:33:44:55' });
  ids.ab = await criar(plat, 'ativos', { site_id: ids.sb, nome: 'IED B', ...ATIVO }, PB);
  await criar(cons, 'fluxos', { site_id: ids.s1, origem_ativo_id: ids.a1, externo: true, via_vpn: false, finalidade: 'Manutenção remota' });
  await criar(cons, 'fluxos', { site_id: ids.s1, origem_ativo_id: ids.a1, externo: true, via_vpn: true, finalidade: 'Acesso do ONS' });
  await criar(cons, 'fluxos', { site_id: ids.s2, origem_ativo_id: ids.a4, externo: true, via_vpn: false, finalidade: 'Telemetria' });
  await criar(plat, 'fluxos', { site_id: ids.sb, origem_ativo_id: ids.ab, externo: true, via_vpn: false, finalidade: 'B' }, PB);
  expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tec', site_id: ids.s2 })).status).toBe(201);
});

// P1-1: POST com justificativa, sessão com TOTP recente (beforeAll) e teto por hora zerado a cada caso (test/ot-stepup.test.ts cobre o teto).
const MOTIVO = 'entrega do inventário ao ONS';
const exportar = (h: H, formato = 'csv', site = ids.s1, base = P, extra: Record<string, unknown> = {}) =>
  chamar(h, 'POST', `${base}/exportacao`, { formato, site_id: site, justificativa: MOTIVO }, extra);
const planilha = async (r: Response) => {
  const zip = await JSZip.loadAsync(await r.arrayBuffer());
  return zip.file('xl/worksheets/sheet1.xml')!.async('string');
};

describe('exportação do inventário (CSV e XLSX)', () => {
  beforeEach(async () => { await env.DB.prepare(`DELETE FROM rate_limits WHERE key LIKE 'ot:%'`).run(); });

  it('Gestor ARCiber: CSV com o cabeçalho dos 6 campos do 4.3.1, IP/MAC completos, sem cache, e uma linha de trilha sem conteúdo', async () => {
    const r = await exportar(gestor);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/csv');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const csv = await r.text();
    const cabecalho = csv.split('\r\n')[0];
    for (const campo of ['Tipo de dispositivo', 'Fabricante', 'Função', 'Endereço IP', 'MAC Address', 'Protocolo/porta', 'Firmware/SO']) expect(cabecalho).toContain(`"${campo}"`);
    expect(csv).toContain(IP1);
    expect(csv).toContain('aa:bb:cc:11:22:33');
    expect(csv).toContain('DNP3/20000');
    expect(csv).not.toContain('IED Sul');
    expect(csv).not.toMatch(/ot1:|ip_hash/);
    const l = await env.DB.prepare(`SELECT actor, details, project_id, entity_id FROM audit_logs WHERE action = 'ot.inventario.exportar' ORDER BY rowid DESC LIMIT 1`).first<Record<string, string>>();
    expect(l).toMatchObject({ actor: 'gestor@cliente.teste', project_id: 'proj-a', entity_id: ids.s1 });
    expect(l!.details).toBe('Exportação csv do site: 3 ativo(s), IP/MAC sem máscara');
  });

  it('XLSX válido, mesmo cabeçalho e os mesmos valores, células sempre texto (sem fórmula)', async () => {
    const r = await exportar(cons, 'xlsx');
    expect(r.status, await r.clone().text()).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('spreadsheetml');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const xml = await planilha(r);
    expect(xml).toContain('Tipo de dispositivo');
    expect(xml).toContain(IP1);
    expect(xml).not.toMatch(/<f[ >]/);
    expect(xml).not.toContain('t="n"');
  });

  it('T15: célula iniciada por = + - @ sai neutralizada em CSV e XLSX', async () => {
    const csv = await (await exportar(gestor)).text();
    const xml = await planilha(await exportar(gestor, 'xlsx'));
    for (const v of ['=HYPERLINK(""http://x"")', '+SUM(1)', '-2+3', '@cmd', '=SE Norte']) expect(csv, v).toContain(`"'${v}"`);
    for (const v of ['=HYPERLINK(&quot;http://x&quot;)', '+SUM(1)', '-2+3', '@cmd', '=SE Norte']) expect(xml, v).toContain(`>'${v}<`);
    expect(csv).not.toMatch(/(^|;)"[=+\-@]/m);
  });

  it('client e org_user recebem 403 e nunca IP/MAC em claro, em nenhum formato', async () => {
    for (const h of [cli, tec, tec0]) {
      for (const f of ['csv', 'xlsx']) {
        for (const s of [ids.s1, ids.s2]) {
          const r = await exportar(h, f, s);
          expect(r.status, `${f} ${s}`).toBe(403);
          const t = await r.text();
          expect(t).not.toContain(IP1);
          expect(t).not.toContain('00:11:22:33:44:55');
        }
      }
    }
  });

  it('quem exporta mas não vê completo (platform_admin, consultoria_admin não designado) recebe a máscara do serializador único', async () => {
    const ativos = (await (await chamar(plat, 'GET', `${P}/ativos?site_id=${ids.s1}`)).json()) as { ativos: { id: string; ip: string; mac: string }[] };
    const a1 = ativos.ativos.find((a) => a.id === ids.a1)!;
    for (const h of [plat, caNao]) {
      const csv = await (await exportar(h)).text();
      const xml = await planilha(await exportar(h, 'xlsx'));
      for (const t of [csv, xml]) {
        expect(t).not.toContain(IP1);
        expect(t).not.toContain(IP2);
        expect(t).not.toContain('11:22:33');
        expect(t).toContain(a1.mac);
        expect(t).toContain(a1.ip);
      }
    }
    const l = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'ot.inventario.exportar' ORDER BY rowid DESC LIMIT 1`).first<{ details: string }>();
    expect(l!.details).toBe('Exportação xlsx do site: 3 ativo(s), IP/MAC mascarados');
  });

  it('só por site (§12.1, pergunta 5): sem site_id é 400; site de outro projeto é 404; formato desconhecido é 400', async () => {
    expect((await chamar(gestor, 'POST', `${P}/exportacao`, { formato: 'csv', justificativa: MOTIVO })).status).toBe(400);
    expect((await exportar(gestor, 'csv', ids.sb)).status).toBe(404);
    expect((await exportar(gestor, 'pdf')).status).toBe(400);
  });

  it('sem as chaves do inventário: 503', async () => {
    const r = await exportar(gestor, 'csv', ids.s1, P, { OT_INVENTARIO_KEY: undefined });
    expect(r.status).toBe(503);
  });
});

describe('indicadores do projeto', () => {
  type Ind = {
    completude: { total: number; completos: number; percentual: number | null; situacao: string; arciber: { total: number; completos: number } };
    por_nivel: Record<string, number>; sem_zona: number; sem_ip: number; sem_mac: number; por_zona: { zona_id: string; nivel_purdue: number; ativos: number }[];
    fluxos_externos: { externos: number; sem_vpn: number; situacao: string };
    prazos: { codigo: string; prazo_meses: number; prazo_em: string; dias_restantes: number; vencido: boolean; situacao: string }[];
  };
  const ler = async (h: H, base = P) => { const r = await chamar(h, 'GET', `${base}/indicadores`); expect(r.status, await r.clone().text()).toBe(200); return (await r.json()) as Ind; };

  it('derivados do inventário: % com os 6 campos, ativos por zona e nível, externos sem VPN, prazo por item', async () => {
    const i = await ler(gestor);
    expect(i.completude).toMatchObject({ total: 4, completos: 1, percentual: 25, situacao: 'sem_evidencia', arciber: { total: 1, completos: 1 } });
    expect(i.por_nivel).toEqual({ 2: 1, 3: 1, 4: 0 });
    expect(i.sem_zona).toBe(2);
    // Decisão do dono: falta de IP ou de MAC é aviso, contado sobre os ativos visíveis (o 4.3.1 pede só um dos dois).
    const c = await env.DB.prepare(`SELECT sum(ip_cifrado IS NULL) AS ip, sum(mac_cifrado IS NULL) AS mac FROM ot_ativos WHERE project_id = 'proj-a' AND status = 'ativo'`).first<{ ip: number; mac: number }>();
    expect(i.sem_ip).toBe(c!.ip);
    expect(i.sem_mac).toBe(c!.mac);
    expect(i.sem_ip + i.sem_mac).toBeGreaterThan(0);
    expect(i.por_zona.find((z) => z.zona_id === ids.z2)).toMatchObject({ nivel_purdue: 2, ativos: 1 });
    expect(i.fluxos_externos).toEqual({ externos: 3, sem_vpn: 2, situacao: 'nao_atende' });
    const p431 = i.prazos.find((p) => p.codigo === '4.3.1')!;
    expect(p431).toMatchObject({ prazo_meses: 18, prazo_em: '2023-01-09', vencido: true });
    expect(p431.dias_restantes).toBeLessThan(0);
    expect(i.prazos.find((p) => p.codigo === '4.4.1')).toMatchObject({ prazo_meses: 27, prazo_em: '2023-10-09' });
    expect(i.prazos.some((p) => p.codigo === '5.1.1')).toBe(false);
    for (const p of i.prazos) expect(['nao_atende', 'evidencia_no_inventario', 'sem_evidencia']).toContain(p.situacao);
    expect(JSON.stringify(i)).not.toMatch(/10\.1\.1\.10|ot1:|"atende"/);
  });

  it('P0-4: o técnico conta só o site dele; sem vínculo, nada (e nada se afirma)', async () => {
    const t = await ler(tec);
    expect(t.completude).toMatchObject({ total: 1, completos: 0 });
    expect(t.fluxos_externos).toMatchObject({ externos: 1, sem_vpn: 1 });
    const z = await ler(tec0);
    expect(z.completude).toMatchObject({ total: 0, completos: 0, percentual: null, situacao: 'sem_evidencia' });
    expect(z.fluxos_externos).toEqual({ externos: 0, sem_vpn: 0, situacao: 'sem_evidencia' });
    expect(z.por_zona).toEqual([]);
  });

  it('isolamento: o projeto B não conta nada do A', async () => {
    const b = await ler(plat, PB);
    expect(b.completude).toMatchObject({ total: 1 });
    expect(b.fluxos_externos).toMatchObject({ externos: 1, sem_vpn: 1 });
  });

  it('4.3.1: ativos completos mas nenhum do ARCiber não é evidência do item (que é dos ativos do ARCiber)', async () => {
    const s3 = await criar(cons, 'sites', { nome: 'SE Leste' });
    await criar(cons, 'ativos', { site_id: s3, nome: 'RTU fora do ARCiber', ...ATIVO, no_arciber: false, categoria_arciber: null, ip: '10.3.3.30', mac: null });
    expect((await chamar(gestor, 'POST', `${P}/acessos`, { user_id: 'u-tec0', site_id: s3 })).status).toBe(201);
    const i = await ler(tec0);
    expect(i.completude).toMatchObject({ total: 1, completos: 1, situacao: 'sem_evidencia', arciber: { total: 0, completos: 0 } });
    expect(i.prazos.find((p) => p.codigo === '4.3.1')!.situacao).toBe('sem_evidencia');
  });
});

describe('IA: sugestão de zona Purdue e completude do 4.3.1 (P0-7)', () => {
  it('zona sugerida: o modelo não recebe IP, MAC nem nome do ativo; a sugestão volta como rascunho com a zona do site', async () => {
    const prompts: string[] = [];
    const run: Run = async (_m, p, o) => {
      prompts.push(JSON.stringify(p), JSON.stringify(o));
      return { response: { nivel_purdue: 3, zona: 2, justificativa: 'RTU de telecontrole fica na supervisão.' } };
    };
    const r = await chamar(cons, 'POST', `${P}/ia/zona-sugerida`, { ativo_id: ids.a1 }, comIa(run));
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toMatchObject({ rascunho: true, nivel_purdue: 3, zona_id: ids.z3, zona_nome: 'Zona 3' });
    const tudo = prompts.join(' ');
    expect(tudo).not.toContain(IP1);
    expect(tudo).not.toMatch(/11-22-33|11:22:33|RTU Bay 1/);
    expect(tudo).toContain('"collectLog":false');
    expect(tudo).toContain('telecontrole');
  });

  it('zona sugerida: índice de zona fora da lista vira null; ativo de outro projeto é 404', async () => {
    const run: Run = async () => ({ response: { nivel_purdue: 2, zona: 99, justificativa: 'nível 2' } });
    expect(await (await chamar(gestor, 'POST', `${P}/ia/zona-sugerida`, { ativo_id: ids.a1 }, comIa(run))).json()).toMatchObject({ zona_id: null, nivel_purdue: 2 });
    expect((await chamar(gestor, 'POST', `${P}/ia/zona-sugerida`, { ativo_id: ids.ab }, comIa(run))).status).toBe(404);
  });

  it('completude: a descrição vai mascarada; ip/mac voltam restaurados; o que falta do 4.3.1 é calculado, não afirmado pela IA', async () => {
    const prompts: string[] = [];
    const run: Run = async (_m, p) => {
      const u = p.messages[1].content;
      prompts.push(u);
      const tk = (s: string) => new RegExp(`\\[\\[${s}_[0-9a-f]{8}\\]\\]`).exec(u)![0];
      return { response: {
        tipo_dispositivo: 'RTU', fabricante: 'SEL', modelo: null, funcao: 'telecontrole', ip: tk('IP'), mac: tk('MAC'), hostname: null,
        protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }], firmware_so_versao: null, texto_apoio: 'Falta a versão do firmware.',
      } };
    };
    const descricao = 'RTU SEL de telecontrole em 192.168.10.5, MAC 00-1A-2B-3C-4D-5E, fala DNP3 na porta 20000.';
    const r = await chamar(cons, 'POST', `${P}/ia/completude`, { descricao }, comIa(run));
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toMatchObject({
      rascunho: true, completo: false, faltando: ['Firmware/SO'], texto_apoio: 'Falta a versão do firmware.',
      campos: { ip: '192.168.10.5', mac: '00-1A-2B-3C-4D-5E', fabricante: 'SEL' },
    });
    expect(prompts.join(' ')).not.toMatch(/192\.168\.10\.5|00-1A-2B-3C-4D-5E/);
  });

  it('completude: token no texto de apoio ou em campo livre recusa (422), sem devolver o valor', async () => {
    const run: Run = async (_m, p) => {
      const t = /\[\[IP_[0-9a-f]{8}\]\]/.exec(p.messages[1].content)![0];
      return { response: { tipo_dispositivo: null, fabricante: null, modelo: null, funcao: null, ip: null, mac: null, hostname: null,
        protocolos_portas: [], firmware_so_versao: null, texto_apoio: `Confirme o endereço ${t}.` } };
    };
    const r = await chamar(cons, 'POST', `${P}/ia/completude`, { descricao: 'Ativo em 192.168.10.5 sem mais dados' }, comIa(run));
    expect(r.status).toBe(422);
    expect(await r.text()).not.toContain('192.168.10.5');
  });

  it('client e org_user não usam a IA do n.ot (403)', async () => {
    const run: Run = async () => { throw new Error('não devia chamar'); };
    for (const h of [cli, tec]) {
      expect((await chamar(h, 'POST', `${P}/ia/zona-sugerida`, { ativo_id: ids.a1 }, comIa(run))).status).toBe(403);
      expect((await chamar(h, 'POST', `${P}/ia/completude`, { descricao: 'RTU em 10.0.0.1 qualquer' }, comIa(run))).status).toBe(403);
    }
  });
});

describe('P0-2: chave de API e agente MCP recusados em todas as saídas', () => {
  const ROTAS: [string, string, unknown?][] = [
    ['GET', `${P}/indicadores`], ['POST', `${P}/exportacao`, { formato: 'csv', site_id: '__S1__', justificativa: 'entrega do inventário ao ONS' }],
    ['POST', `${P}/ia/zona-sugerida`, { ativo_id: '__A1__' }], ['POST', `${P}/ia/completude`, { descricao: 'RTU em 10.0.0.1 qualquer' }],
  ];
  const resolver = (c: string) => c.replace('__S1__', ids.s1);
  const corpoDe = (b: unknown) => (b && typeof b === 'object' && 'ativo_id' in b ? { ativo_id: ids.a1 } : b && typeof b === 'object' && 'site_id' in b ? { ...b, site_id: ids.s1 } : b);

  it('chave de API de escrita: 403', async () => {
    for (const [m, c, b] of ROTAS) expect((await chamar({ 'X-API-Key': CHAVE }, m, resolver(c), corpoDe(b))).status, `${m} ${c}`).toBe(403);
  });

  it('agente MCP, inclusive com decisão confirmada: 403', async () => {
    const decisao = { 'X-Agente-Confirmado': '1', 'X-Agente-Ferramenta': 'niso_decidir_passo', 'X-Agente-Motivo': 'pedido do consultor' };
    for (const h of [{}, decisao]) {
      for (const [m, c, b] of ROTAS) expect((await chamar(h, m, resolver(c), corpoDe(b), { AGENTE })).status, `${m} ${c}`).toBe(403);
    }
  });
});
