import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { gerarSegredoTotp, gerarCodigoTotp } from '../src/services/totp';
import { TETOS_OT } from '../src/services/ot-stepup';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos } from './helpers/d1';

// Modelo de ameaças do n.ot, P1-1: revelar IP/MAC e exportar o inventário exigem TOTP do n.360 confirmado nos últimos 10 minutos
// (mesmo com SSO), justificativa em audit_logs.justification, teto por hora (pessoa e projeto) e aviso ao Gestor ARCiber (titular e
// suplente de project_governance). Contra o D1 real.

type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const chamar = async (h: H, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), { ...workerEnv(), ...extra });

const IP1 = '10.1.1.10';
const MOTIVO = 'suporte ao incidente 123 do cliente';
const SEGREDO = gerarSegredoTotp();
const ids: Record<string, string> = {};
let semTotp: H, totpVelho: H, gestor: H, plat: H;

const revelar = (h: H, corpo: unknown = { justificativa: MOTIVO }) => chamar(h, 'POST', `${P}/ativos/${ids.a1}/revelar`, corpo);
const exportar = (h: H, corpo: Record<string, unknown> = {}) =>
  chamar(h, 'POST', `${P}/exportacao`, { formato: 'csv', site_id: ids.s1, justificativa: MOTIVO, ...corpo });
const conta = async (acao: string) => (await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = ?`).bind(acao).first<{ n: number }>())!.n;
const avisos = async () => (await env.DB.prepare(`SELECT user_id FROM notifications WHERE type = 'ot_acesso_sensivel' ORDER BY user_id`)
  .all<{ user_id: string }>()).results.map((r) => r.user_id);
const limparTetos = () => env.DB.prepare(`DELETE FROM rate_limits WHERE key LIKE 'ot:%'`).run();

beforeAll(async () => {
  await applySchema();
  await seedTwoProjects();
  await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, totp_secret, totp_enabled) VALUES
      ('u-gestor', 'gestor@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a', NULL, 0),
      ('u-sup', 'suplente@cliente.teste', 'x', 'Suplente', 'org_admin', 'proj-a', NULL, 0),
      ('u-pa', 'pa@ness.lat', 'x', 'Plataforma', 'platform_admin', NULL, ?, 1),
      ('u-outro', 'gestor-b@cliente.teste', 'x', 'Gestor de B', 'org_admin', 'proj-b', NULL, 0)`).bind(SEGREDO),
    // Titular e suplente do Gestor ARCiber (spec §3). A conta de proj-b com o mesmo cargo em proj-b não é avisada.
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title, is_primary) VALUES
      ('proj-a', 'Gestor', 'gestor@cliente.teste', 'tech', 'Gestor ARCiber', 1),
      ('proj-a', 'Suplente', 'SUPLENTE@cliente.teste', 'tech', 'Gestor ARCiber', 0),
      ('proj-b', 'Gestor de B', 'gestor-b@cliente.teste', 'tech', 'Gestor ARCiber', 1)`),
  ]);
  await concederModulos(['u-gestor', 'u-sup', 'u-outro'], ['ot']);
  const agora = Date.now();
  gestor = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a', totp_em: agora });
  semTotp = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  totpVelho = await sessionFor({ id: 'u-gestor', email: 'gestor@cliente.teste', role: 'org_admin', client_project_id: 'proj-a', totp_em: agora - 11 * 60_000 });
  plat = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });

  const criar = async (rota: string, corpo: unknown) => {
    const r = await chamar(gestor, 'POST', `${P}/${rota}`, corpo);
    expect(r.status, `${rota} ${await r.clone().text()}`).toBe(201);
    return ((await r.json()) as { id: string }).id;
  };
  ids.s1 = await criar('sites', { nome: 'SE Norte' });
  ids.a1 = await criar('ativos', { site_id: ids.s1, nome: 'RTU 1', ip: IP1, mac: 'AA-BB-CC-11-22-33' });
});

beforeEach(async () => {
  await limparTetos();
  await env.DB.prepare(`DELETE FROM notifications WHERE type = 'ot_acesso_sensivel'`).run();
});
afterEach(() => vi.restoreAllMocks());

describe('P1-1: TOTP do n.360 nos últimos 10 minutos', () => {
  it('sem TOTP na sessão (SSO ou login sem MFA) ou com TOTP de mais de 10 min: 403 totp_necessario, nada revelado nem exportado', async () => {
    const n0 = { v: await conta('ot.inventario.ver_sensivel'), e: await conta('ot.inventario.exportar') };
    for (const h of [semTotp, totpVelho, plat]) {
      for (const r of [await revelar(h), await exportar(h)]) {
        expect(r.status).toBe(403);
        const corpo = await r.json() as { codigo: string; error: string };
        expect(corpo.codigo).toBe('totp_necessario');
        expect(JSON.stringify(corpo)).not.toContain(IP1);
      }
    }
    expect(await conta('ot.inventario.ver_sensivel')).toBe(n0.v);
    expect(await conta('ot.inventario.exportar')).toBe(n0.e);
    expect(await avisos()).toEqual([]);
  });

  it('o 403 diz se a conta tem TOTP ativo (quem não tem precisa ativar antes)', async () => {
    expect(await (await revelar(semTotp)).json()).toMatchObject({ codigo: 'totp_necessario', totp_ativo: false });
    expect(await (await revelar(plat)).json()).toMatchObject({ codigo: 'totp_necessario', totp_ativo: true });
  });

  it('confirmar o código em /auth/mfa/verify marca a sessão e libera revelar por 10 minutos', async () => {
    const h = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin' });
    expect((await revelar(h)).status).toBe(403);
    const codigo = await gerarCodigoTotp(SEGREDO, Math.floor(Date.now() / 30_000));
    const v = await chamar(h, 'POST', '/api/v1/auth/mfa/verify', { codigo });
    expect(v.status, await v.clone().text()).toBe(200);
    const r = await revelar(h);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toMatchObject({ ip: IP1, mascarado: false });
  });
});

describe('P1-1: justificativa em audit_logs.justification', () => {
  it('revelar com TOTP recente e justificativa grava ot.inventario.ver_sensivel com a justificativa', async () => {
    const h = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', totp_em: Date.now() });
    expect((await revelar(h, {})).status).toBe(400);
    const r = await revelar(h);
    expect(r.status, await r.clone().text()).toBe(200);
    const l = await env.DB.prepare(`SELECT actor, justification, entity_id FROM audit_logs WHERE action = 'ot.inventario.ver_sensivel' ORDER BY rowid DESC LIMIT 1`).first();
    expect(l).toEqual({ actor: 'pa@ness.lat', justification: MOTIVO, entity_id: ids.a1 });
  });

  it('exportar exige justificativa (400 sem ela) e a grava em ot.inventario.exportar', async () => {
    expect((await exportar(gestor, { justificativa: undefined })).status).toBe(400);
    expect((await exportar(gestor, { justificativa: 'curta' })).status).toBe(400);
    const r = await exportar(gestor);
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.text()).toContain(IP1);
    const l = await env.DB.prepare(`SELECT actor, justification FROM audit_logs WHERE action = 'ot.inventario.exportar' ORDER BY rowid DESC LIMIT 1`).first();
    expect(l).toEqual({ actor: 'gestor@cliente.teste', justification: MOTIVO });
  });

  it('justificativa com IP ou MAC é recusada (vai à trilha e ao aviso)', async () => {
    expect((await exportar(gestor, { justificativa: 'conferir o 10.1.1.10 em campo' })).status).toBe(400);
    expect((await revelar(gestor, { justificativa: 'conferir aa:bb:cc:11:22:33 em campo' })).status).toBe(400);
  });

  it('exportar por GET (justificativa no endereço) não existe mais', async () => {
    expect((await chamar(gestor, 'GET', `${P}/exportacao?formato=csv&site_id=${ids.s1}`)).status).toBe(404);
  });
});

describe('P1-1: teto por hora', () => {
  it(`exportar: ${TETOS_OT.exportar.pessoa}/h por pessoa; a seguinte é 429 teto_por_hora e não grava trilha`, async () => {
    for (let i = 0; i < TETOS_OT.exportar.pessoa; i++) expect((await exportar(gestor)).status, `exportação ${i + 1}`).toBe(200);
    const n = await conta('ot.inventario.exportar');
    const r = await exportar(gestor);
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ codigo: 'teto_por_hora' });
    expect(await conta('ot.inventario.exportar')).toBe(n);
  });

  it(`revelar: ${TETOS_OT.revelar.pessoa}/h por pessoa; a seguinte é 429`, async () => {
    const h = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', totp_em: Date.now() });
    for (let i = 0; i < TETOS_OT.revelar.pessoa; i++) expect((await revelar(h)).status, `revelação ${i + 1}`).toBe(200);
    const r = await revelar(h);
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ codigo: 'teto_por_hora' });
  });

  it('teto do projeto vale para qualquer pessoa (outra conta também recebe 429)', async () => {
    const agora = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO rate_limits (key, count, window_start) VALUES (?, ?, ?)`).bind('ot:exportar:projeto:proj-a', TETOS_OT.exportar.projeto, agora),
      env.DB.prepare(`INSERT INTO rate_limits (key, count, window_start) VALUES (?, ?, ?)`).bind('ot:revelar:projeto:proj-a', TETOS_OT.revelar.projeto, agora),
    ]);
    expect((await exportar(gestor)).status).toBe(429);
    expect((await revelar(await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', totp_em: Date.now() }))).status).toBe(429);
  });
});

describe('P1-1: aviso ao Gestor ARCiber (titular e suplente)', () => {
  it('cada revelação e exportação avisa titular e suplente no sino e por e-mail; ninguém de outro projeto', async () => {
    const enviados: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      enviados.push(...(JSON.parse(String((init as RequestInit).body)).to as string[]));
      return new Response('{}', { status: 200 });
    });
    const comEmail = { RESEND_API_KEY: 're_teste' };
    const h = await sessionFor({ id: 'u-pa', email: 'pa@ness.lat', role: 'platform_admin', totp_em: Date.now() });
    expect((await chamar(h, 'POST', `${P}/ativos/${ids.a1}/revelar`, { justificativa: MOTIVO }, comEmail)).status).toBe(200);
    expect(await avisos()).toEqual(['u-gestor', 'u-sup']);
    expect(enviados.sort()).toEqual(['SUPLENTE@cliente.teste', 'gestor@cliente.teste']);
    const r = await chamar(gestor, 'POST', `${P}/exportacao`, { formato: 'csv', site_id: ids.s1, justificativa: MOTIVO }, comEmail);
    expect(r.status).toBe(200);
    expect(await avisos()).toEqual(['u-gestor', 'u-gestor', 'u-sup', 'u-sup']);
    expect(enviados).toHaveLength(4);
    const n = await env.DB.prepare(`SELECT title, message FROM notifications WHERE type = 'ot_acesso_sensivel' ORDER BY rowid DESC LIMIT 1`).first<{ title: string; message: string }>();
    expect(n!.message).toContain('gestor@cliente.teste');
    expect(n!.message).toContain(MOTIVO);
    expect(JSON.stringify(n)).not.toContain(IP1);
  });

  it('recusa (sem TOTP, teto) não avisa', async () => {
    await revelar(plat);
    await exportar(semTotp);
    expect(await avisos()).toEqual([]);
  });
});
