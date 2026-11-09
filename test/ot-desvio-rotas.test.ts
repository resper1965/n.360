import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../src/index';
import { genId } from '../src/helpers';
import { chavesOt, cifrarEnderecos } from '../src/services/ot-cifra';
import { applySchema, sessionFor, workerEnv, seedTwoProjects, habilitarOt, concederModulos } from './helpers/d1';

// n.ot desvio (Task 4): lista, tratar e aceitar. D1 real, linhas semeadas direto; o fetch global captura o webhook.
type H = Record<string, string>;
const P = '/api/v1/projects/proj-a/ot';
const entregas: Record<string, any>[] = [];
const IP = '10.40.0.7';
let gestor: H, cons: H, tec: H;

async function chamar(h: H, metodo: string, caminho: string, corpo?: unknown) {
  const ctx = createExecutionContext();
  const r = await app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return r;
}
const dia = (mais: number) => new Date(Date.now() + mais * 86_400_000).toISOString().slice(0, 10);
const trilhas = async (acao: string) => (await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = ? AND project_id = 'proj-a'`).bind(acao).all<{ details: string }>()).results;

/** Desvio de ativo com IP cifrado e desvio de fluxo (pendência) com hashes, mais o achado em rascunho da mesma chave. */
async function semear(id: string, site: string, tipo: 'ativo' | 'fluxo', projeto = 'proj-a') {
  const dados = tipo === 'ativo'
    ? { ...await cifrarEnderecos(chavesOt(workerEnv())!, projeto, 'ot_desvios', id, { ip: IP }), fabricante: 'SEL', protocolos_portas: [{ protocolo: 'modbus', porta: 502 }] }
    : { protocolo: 'modbus', porta: 502, externo: true, origem_ip_hash: 'h-origem', destino_ip_hash: 'h-destino' };
  await env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez) VALUES (?, ?, ?, ?, ?, ?, '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')`)
    .bind(id, projeto, site, tipo, `chave-${id}`, JSON.stringify(dados)).run();
}

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a', 'proj-b');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s1', 'proj-a', 'SE Norte'), ('s2', 'proj-a', 'SE Sul'), ('sb', 'proj-b', 'SE B')`),
    env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's1', 'proj-a', 'x')`),
    env.DB.prepare(`INSERT INTO webhooks (id, project_id, url, events, secret, status) VALUES ('w1', 'proj-a', 'https://soc.example/h', 'ot.desvio', 'seg', 'Active')`),
  ]);
  await concederModulos(['u-g', 'u-t'], ['ot']);
  gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  tec = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
  // consultor designado no projeto: edita e vê completo, mas não é o Gestor ARCiber
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('cons:c@ness.lat', 'c@ness.lat', 'x', 'Consultor', 'consultor')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('proj-a', 'Consultor', 'c@ness.lat', 'consultor', 'Consultor')`),
  ]);
  await concederModulos(['cons:c@ness.lat'], ['ot']);
  cons = await sessionFor({ id: 'cons:c@ness.lat', email: 'c@ness.lat', role: 'consultor' });
  await semear('d-a1', 's1', 'ativo'); await semear('d-f1', 's1', 'fluxo'); await semear('d-a2', 's2', 'ativo'); await semear('d-b', 'sb', 'ativo', 'proj-b');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, criado_por) VALUES ('lev1', 'proj-a', 's2', 'visita', '2026-11-01', 'x')`),
    env.DB.prepare(`INSERT INTO ot_achados (id, project_id, levantamento_id, criado_por, chave_sensor) VALUES ('ach1', 'proj-a', 'lev1', 'x', 'chave-d-a2'),
      ('ach-enviado', 'proj-a', 'lev1', 'x', 'chave-d-f1')`),
    env.DB.prepare(`UPDATE ot_achados SET situacao = 'enviado' WHERE id = 'ach-enviado'`),
  ]);
  vi.spyOn(globalThis, 'fetch').mockImplementation((async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    if (url.startsWith('https://cloudflare-dns.com/')) {
      return new Response(JSON.stringify({ Answer: new URL(url).searchParams.get('type') === 'A' ? [{ type: 1, data: '93.184.216.34' }] : [] }));
    }
    entregas.push(JSON.parse(String(init!.body)));
    return new Response(null, { status: 200 });
  }) as typeof fetch);
});

describe('GET /desvios', () => {
  it('Gestor vê IP só do desvio de ativo, filtra por tipo/situação e nunca recebe hash nem cifra', async () => {
    const r = await chamar(gestor, 'GET', `${P}/desvios`);
    expect(r.status).toBe(200);
    const { desvios } = await r.json() as { desvios: Record<string, any>[] };
    expect(desvios.map((d) => d.id).sort()).toEqual(['d-a1', 'd-a2', 'd-f1']);
    const a1 = desvios.find((d) => d.id === 'd-a1')!;
    expect(a1).toMatchObject({ site_nome: 'SE Norte', tipo: 'ativo', situacao: 'aberto', ip: IP, protocolo: 'modbus', porta: 502, ocorrencias: 1, achado_id: null });
    const f1 = desvios.find((d) => d.id === 'd-f1')!;
    expect(f1).toMatchObject({ externo: true, origem: { ativo: null, zona: null } });
    expect('ip' in f1).toBe(false);
    expect(JSON.stringify(desvios)).not.toMatch(/h-origem|h-destino|ip_cifrado|ot1:|_hash/);
    const so = await (await chamar(gestor, 'GET', `${P}/desvios?tipo=fluxo&site_id=s1&situacao=aberto`)).json() as { desvios: { id: string }[] };
    expect(so.desvios.map((d) => d.id)).toEqual(['d-f1']);
  });

  it('quem vê mascarado recebe sem IP, e só dos sites permitidos; outro projeto não aparece', async () => {
    const { desvios } = await (await chamar(tec, 'GET', `${P}/desvios`)).json() as { desvios: Record<string, any>[] };
    expect(desvios.map((d) => d.id).sort()).toEqual(['d-a1', 'd-f1']);
    expect(desvios.every((d) => !('ip' in d))).toBe(true);
    expect(JSON.stringify(desvios)).not.toContain(IP);
  });

  it('achado_id é o rascunho com a mesma chave_sensor', async () => {
    const { desvios } = await (await chamar(gestor, 'GET', `${P}/desvios?site_id=s2`)).json() as { desvios: { achado_id: string }[] };
    expect(desvios[0].achado_id).toBe('ach1');
    // achado já enviado não conta
    const f = await (await chamar(gestor, 'GET', `${P}/desvios?tipo=fluxo`)).json() as { desvios: { achado_id: string | null }[] };
    expect(f.desvios[0].achado_id).toBeNull();
  });
});

describe('tratar e aceitar', () => {
  it('desvio de outro projeto → 404; tratar sem nota → 400', async () => {
    expect((await chamar(gestor, 'POST', `${P}/desvios/d-b/tratar`, { nota: 'ok' })).status).toBe(404);
    expect((await chamar(gestor, 'POST', `${P}/desvios/d-a1/tratar`, {})).status).toBe(400);
    expect((await chamar(gestor, 'POST', `${P}/desvios/d-a1/tratar`, { nota: '' })).status).toBe(400);
  });

  it('consultor trata: vira tratado, webhook fechado sem endereço, trilha só com ids', async () => {
    const antes = entregas.length;
    const r = await chamar(cons, 'POST', `${P}/desvios/d-f1/tratar`, { nota: 'Fluxo do fornecedor, janela de manutenção' });
    expect(r.status).toBe(200);
    expect(await env.DB.prepare(`SELECT situacao, nota FROM ot_desvios WHERE id = 'd-f1'`).first()).toEqual({ situacao: 'tratado', nota: 'Fluxo do fornecedor, janela de manutenção' });
    const novos = entregas.slice(antes);
    expect(novos).toHaveLength(1);
    expect(novos[0].desvios[0]).toMatchObject({ id: 'd-f1', acao: 'fechado', situacao: 'tratado' });
    expect(JSON.stringify(novos)).not.toMatch(IP);
    const t = await trilhas('ot.desvio.tratado');
    expect(t).toHaveLength(1);
    expect(t[0].details).toBe('Desvio d-f1 tratado');
    // já tratado: não trata de novo
    expect((await chamar(cons, 'POST', `${P}/desvios/d-f1/tratar`, { nota: 'de novo' })).status).toBe(409);
  });

  it('técnico não trata (403); consultor não aceita (403); prazo de 91 dias → 400', async () => {
    expect((await chamar(tec, 'POST', `${P}/desvios/d-a1/tratar`, { nota: 'x' })).status).toBe(403);
    expect((await chamar(cons, 'POST', `${P}/desvios/d-a1/aceitar`, { justificativa: 'ok', ate: dia(30) })).status).toBe(403);
    expect((await chamar(gestor, 'POST', `${P}/desvios/d-a1/aceitar`, { justificativa: 'ok', ate: dia(91) })).status).toBe(400);
    expect((await chamar(gestor, 'POST', `${P}/desvios/d-a1/aceitar`, { justificativa: 'ok', ate: dia(-1) })).status).toBe(400);
    expect((await chamar(gestor, 'POST', `${P}/desvios/d-a1/aceitar`, { justificativa: '', ate: dia(30) })).status).toBe(400);
  });

  it('Gestor aceita por 90 dias: aceito, aceito_ate, webhook fechado e trilha só com ids', async () => {
    const antes = entregas.length;
    const r = await chamar(gestor, 'POST', `${P}/desvios/d-a1/aceitar`, { justificativa: 'Equipamento de teste do fornecedor', ate: dia(90) });
    expect(r.status).toBe(200);
    const l = await env.DB.prepare(`SELECT situacao, aceito_ate, atualizado_por FROM ot_desvios WHERE id = 'd-a1'`).first<Record<string, string>>();
    expect(l).toMatchObject({ situacao: 'aceito', aceito_ate: `${dia(90)}T23:59:59.999Z`, atualizado_por: 'u-g' });
    const novos = entregas.slice(antes);
    expect(novos[0].desvios[0]).toMatchObject({ id: 'd-a1', acao: 'fechado', situacao: 'aceito' });
    expect(JSON.stringify(novos)).not.toContain(IP);
    expect((await trilhas('ot.desvio.aceito')).map((t) => t.details)).toEqual(['Desvio d-a1 aceito']);
    const { desvios } = await (await chamar(gestor, 'GET', `${P}/desvios?situacao=aceito`)).json() as { desvios: { id: string; aceito_ate: string }[] };
    expect(desvios.map((d) => d.id)).toEqual(['d-a1']);
  });
});
