import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData, seedTwoProjects, workerEnv, habilitarOt, concederModulos, designarConsultor, sessionFor } from './helpers/d1';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { criarFornecedor, lerFornecedores, apagarFornecedor } from '../src/services/ot-fornecedores';

const A = 'proj-a';
const P = '/api/v1/projects/proj-a';
const CHAVE = 'chave-forn-leitura';
const AGENTE = { userId: 'cons:cons-forn@ness.lat', email: 'cons-forn@ness.lat', projectId: 'proj-a', concessaoId: 'c-forn' };
const TODOS = JSON.stringify(['site1', 'site2']);
type H = Record<string, string>;
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();
const nforn = async () => (await env.DB.prepare('SELECT count(*) n FROM ot_fornecedores').first<{ n: number }>())!.n;
const chamar = (h: H, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), { ...workerEnv(), ...extra });
const lista = async (h: H, q = '') => (await (await chamar(h, 'GET', `${P}/ot/fornecedores${q}`)).json<{ fornecedores: { id: string; papel: string }[] }>()).fornecedores;

describe('ot_fornecedores (0116) e rotas', () => {
  let cons: H, tec: H, sem: H, chave: H;
  beforeAll(async () => {
    await applySchema(); await resetData(); await seedTwoProjects(); await habilitarOt(A);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-tec', 'tec@c.teste', 'x', 'T', 'org_user', 'proj-a'), ('u-sem', 'sem@c.teste', 'x', 'S', 'org_user', 'proj-a')`),
      env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-forn', 'proj-a', ?, 'k', 'read', 'Active')`).bind(await sha256Hex(CHAVE)),
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('site1', 'proj-a', 'S1'), ('site2', 'proj-a', 'S2'), ('siteB', 'proj-b', 'SB')`),
      env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome) VALUES ('at1', 'proj-a', 'site1', 'RTU'), ('at2', 'proj-a', 'site2', 'PLC')`),
      env.DB.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_ativo_id, externo) VALUES ('fx1', 'proj-a', 'site1', 'at1', 1), ('fx2', 'proj-a', 'site2', 'at2', 1)`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('forn1', 'proj-a', 'organizacao', 'Integradora Segredo Ltda'), ('fornB', 'proj-b', 'organizacao', 'Outra'), ('pessoa1', 'proj-a', 'pessoa', 'Ana'), ('interessada', 'proj-a', 'organizacao', 'ANPD'), ('forn2', 'proj-a', 'organizacao', 'Segunda')`),
      env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('v1', 'proj-a', 'interessada', 'parte_interessada', 'projeto', 'proj-a')`),
      env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-tec', 'site2', 'proj-a', 'x')`),
    ]);
    await designarConsultor(AGENTE.email, 'proj-a');
    await env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-forn', ?, 'proj-a', datetime('now', '+30 days'))`).bind(AGENTE.userId).run();
    await concederModulos(['u-tec', AGENTE.userId], ['iso', 'ot']);
    await concederModulos(['u-sem'], ['iso']);
    const s = (id: string, role: string, extra = {}) => sessionFor({ id, email: `${id}@c.teste`, role, ...extra });
    cons = await sessionFor({ id: AGENTE.userId, email: AGENTE.email, role: 'consultor' });
    tec = await s('u-tec', 'org_user', { client_project_id: 'proj-a' });
    sem = await s('u-sem', 'org_user', { client_project_id: 'proj-a' });
    chave = { 'X-API-Key': CHAVE };
  });

  let idSite1: string;
  it('consultor liga fornecedor a site (201) e a fluxo; lê; repetir é idempotente (200, sem duplicar), inclusive só com fluxo', async () => {
    const r = await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn1', papel: 'integrador', ot_site_id: 'site1' });
    expect(r.status, await r.clone().text()).toBe(201);
    idSite1 = (await r.json<{ id: string }>()).id;
    expect((await lista(cons)).map((x) => x.id)).toEqual([idSite1]);
    const rep = await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn1', papel: 'integrador', ot_site_id: 'site1' });
    expect(rep.status).toBe(200);
    expect((await rep.json<{ id: string }>()).id).toBe(idSite1);
    const f1 = await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn1', papel: 'fabricante', ot_fluxo_id: 'fx1' });
    expect(f1.status).toBe(201);
    expect((await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn1', papel: 'fabricante', ot_fluxo_id: 'fx1' })).status).toBe(200);
    // site + fluxo do mesmo site também dedupe; fluxo de outro site → 400
    expect((await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn1', papel: 'acesso_remoto', ot_site_id: 'site1', ot_fluxo_id: 'fx1' })).status).toBe(201);
    expect((await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn1', papel: 'acesso_remoto', ot_site_id: 'site1', ot_fluxo_id: 'fx1' })).status).toBe(200);
    expect((await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn1', papel: 'acesso_remoto', ot_site_id: 'site1', ot_fluxo_id: 'fx2' })).status).toBe(400);
    expect(await nforn()).toBe(3);
    expect((await lista(cons, '?ot_site_id=site2'))).toHaveLength(0);
  });

  it('o índice único também barra a duplicata com NULL direto no banco', async () => {
    await expect(run(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, criado_por) VALUES ('dup', 'proj-a', 'forn1', 'integrador', 'site1', 'u')`)).rejects.toThrow(/UNIQUE/);
    await expect(run(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, criado_por) VALUES ('dup', 'proj-a', 'forn1', 'integrador', 'u')`)).rejects.toThrow(/CHECK/);
  });

  it('corpo estrito: papel inválido, sem site/fluxo, campo extra → 400', async () => {
    for (const b of [{ parte_id: 'forn1', papel: 'dono', ot_site_id: 'site1' }, { parte_id: 'forn1', papel: 'integrador' }, { parte_id: 'forn1', papel: 'integrador', ot_site_id: 'site1', project_id: 'proj-b' }])
      expect((await chamar(cons, 'POST', `${P}/ot/fornecedores`, b)).status, JSON.stringify(b)).toBe(400);
  });

  it('outro projeto (parte, site) → 404; pessoa e parte interessada → 422 em português; site/fluxo removido → 404', async () => {
    for (const b of [{ parte_id: 'fornB', papel: 'integrador', ot_site_id: 'site1' }, { parte_id: 'forn1', papel: 'integrador', ot_site_id: 'siteB' }])
      expect((await chamar(cons, 'POST', `${P}/ot/fornecedores`, b)).status, JSON.stringify(b)).toBe(404);
    for (const p of ['pessoa1', 'interessada']) {
      const r = await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: p, papel: 'integrador', ot_site_id: 'site1' });
      expect(r.status, p).toBe(422);
      expect((await r.json<{ error: string }>()).error).toContain('fornecedora');
    }
    // mesmo com o site do outro projeto "permitido", o fluxo de outro projeto não entra (conferência de projeto no serviço)
    await run(`INSERT INTO ot_ativos (id, project_id, site_id, nome) VALUES ('atB', 'proj-b', 'siteB', 'X')`);
    await run(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_ativo_id, externo) VALUES ('fxB', 'proj-b', 'siteB', 'atB', 1)`);
    const x = await criarFornecedor(env.DB, A, { parte_id: 'forn2', papel: 'integrador', ot_fluxo_id: 'fxB' }, 'u', JSON.stringify(['siteB']));
    expect(x.ok ? 'ok' : x.status).toBe(404);
    await run(`UPDATE ot_fluxos SET status = 'removido' WHERE id = 'fx2'`);
    expect((await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn2', papel: 'integrador', ot_fluxo_id: 'fx2' })).status).toBe(404);
    await run(`UPDATE ot_fluxos SET status = 'ativo' WHERE id = 'fx2'`);
    expect(await nforn()).toBe(3);
  });

  it('técnico: não escreve (403); lê só o site dele, e fluxo-only vale pelo site do fluxo', async () => {
    expect((await chamar(tec, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn1', papel: 'integrador', ot_site_id: 'site2' })).status).toBe(403);
    expect((await chamar(tec, 'DELETE', `${P}/ot/fornecedores/${idSite1}`)).status).toBe(403);
    expect(await lista(tec)).toEqual([]);
    await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn2', papel: 'integrador', ot_fluxo_id: 'fx2' }); // só fluxo, do site2
    await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn2', papel: 'integrador', ot_site_id: 'site2' });
    expect((await lista(tec)).map((x) => x.papel)).toEqual(['integrador', 'integrador']);
    expect(await lista(cons)).toHaveLength(5);
  });

  it('serviço: sitesPermitidosJson restringe criar, ler e apagar (fluxo-only incluso)', async () => {
    const SO2 = JSON.stringify(['site2']);
    const f = (r: Awaited<ReturnType<typeof criarFornecedor>>) => (r.ok ? 'ok' : r.status);
    expect(f(await criarFornecedor(env.DB, A, { parte_id: 'forn2', papel: 'fabricante', ot_site_id: 'site1' }, 'u', SO2))).toBe(404);
    expect(f(await criarFornecedor(env.DB, A, { parte_id: 'forn2', papel: 'fabricante', ot_fluxo_id: 'fx1' }, 'u', SO2))).toBe(404);
    expect(f(await criarFornecedor(env.DB, A, { parte_id: 'forn2', papel: 'fabricante', ot_fluxo_id: 'fx2' }, 'u', SO2))).toBe('ok');
    expect((await lerFornecedores(env.DB, A, SO2)).every((x) => x.site_efetivo_id === 'site2')).toBe(true);
    expect(await lerFornecedores(env.DB, A, '[]')).toEqual([]);
    expect(await apagarFornecedor(env.DB, A, idSite1, SO2)).toBe(false); // site1 fora do escopo
    expect(await apagarFornecedor(env.DB, A, idSite1, '[]')).toBe(false);
    expect(await nforn()).toBe(6);
  });

  it('pessoa sem ot, chave de API e agente: 403 em GET/POST/DELETE', async () => {
    for (const [h, extra] of [[sem, {}], [chave, {}], [{}, { AGENTE }]] as [H, Record<string, unknown>][]) {
      for (const [m, u, b] of [['GET', '', undefined], ['POST', '', { parte_id: 'forn1', papel: 'integrador', ot_site_id: 'site1' }], ['DELETE', `/${idSite1}`, undefined]] as const) {
        const r = await chamar(h, m, `${P}/ot/fornecedores${u}`, b, extra);
        expect(r.status, `${m} ${JSON.stringify(h)}`).toBe(403);
        expect(await r.text()).not.toContain(idSite1);
      }
    }
    expect(await nforn()).toBe(6);
  });

  it('a parte segue na lista comum sem nenhum campo de OT (pessoa com e sem ot)', async () => {
    for (const h of [sem, cons]) {
      const res = await chamar(h, 'GET', `${P}/partes`);
      expect(res.status).toBe(200);
      const t = await res.text();
      expect(t).toContain('Integradora Segredo Ltda');
      for (const x of ['integrador', 'fabricante', 'acesso_remoto', 'ot_fornecedores', 'ot_site_id', 'ot_fluxo_id', 'papel_ot']) expect(t, x).not.toContain(x);
      const det = await (await chamar(h, 'GET', `${P}/partes/forn1`)).text();
      for (const x of ['acesso_remoto', 'ot_site_id', 'ot_fluxo_id', 'ot_fornecedores']) expect(det, x).not.toContain(x);
    }
  });

  it('a exportação (pessoa com ot e chave de leitura) não leva a tabela, o papel nem os ids de OT', async () => {
    for (const h of [cons, chave]) {
      const res = await chamar(h, 'GET', `${P}/export`);
      expect(res.status).toBe(200);
      const t = await res.text();
      expect(t).toContain('Integradora Segredo Ltda'); // a parte comum sai, como sempre
      for (const x of ['ot_fornecedores', 'acesso_remoto', 'fabricante', 'ot_fluxo_id', 'fx1', 'site1']) expect(t, x).not.toContain(x);
    }
  });

  it('DELETE: 200 e some; de novo 404; trilha só com ids; CASCADE ao apagar a parte', async () => {
    expect((await chamar(cons, 'DELETE', `${P}/ot/fornecedores/${idSite1}`)).status).toBe(200);
    expect((await chamar(cons, 'DELETE', `${P}/ot/fornecedores/${idSite1}`)).status).toBe(404);
    const tr = await env.DB.prepare(`SELECT details, entity_type FROM audit_logs WHERE action LIKE 'ot.fornecedor.%'`).all<{ details: string }>();
    expect(JSON.stringify(tr.results)).not.toContain('Segredo');
    expect(tr.results.map((x) => x.details)).toContain('Fornecedor de OT removido');
    await run(`DELETE FROM partes WHERE id = 'forn1'`);
    expect(await env.DB.prepare(`SELECT count(*) n FROM ot_fornecedores WHERE parte_id = 'forn1'`).first<{ n: number }>()).toEqual({ n: 0 });
    await run(`DELETE FROM ot_sites WHERE id = 'site2'`); // leva fluxos e vínculos
    expect(await nforn()).toBe(0);
  });
});

describe('perguntas de OT na avaliação do fornecedor (decisão 7)', () => {
  let cons: H, tec: H, fid: string;
  const URL = () => `${P}/ot/fornecedores/${fid}/perguntas-padrao`;
  const nperg = async () => (await env.DB.prepare(`SELECT count(*) n FROM homologacao_perguntas WHERE project_id = 'proj-a'`).first<{ n: number }>())!.n;
  beforeAll(async () => {
    await applySchema(); await resetData(); await seedTwoProjects(); await habilitarOt(A);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-tec2', 'tec2@c.teste', 'x', 'T', 'org_user', 'proj-a')`),
      env.DB.prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('key-forn2', 'proj-a', ?, 'k', 'write', 'Active')`).bind(await sha256Hex(CHAVE)),
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('site1', 'proj-a', 'S1')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('forn1', 'proj-a', 'organizacao', 'Integradora Segredo Ltda')`),
    ]);
    await designarConsultor(AGENTE.email, 'proj-a');
    await concederModulos(['u-tec2', AGENTE.userId], ['iso', 'ot']);
    cons = await sessionFor({ id: AGENTE.userId, email: AGENTE.email, role: 'consultor' });
    tec = await sessionFor({ id: 'u-tec2', email: 'tec2@c.teste', role: 'org_user', client_project_id: 'proj-a' });
    fid = (await (await chamar(cons, 'POST', `${P}/ot/fornecedores`, { parte_id: 'forn1', papel: 'integrador', ot_site_id: 'site1' })).json<{ id: string }>()).id;
  });

  it('sem o privacy no projeto: 403 como o da avaliação e nenhuma pergunta gravada', async () => {
    const r = await chamar(cons, 'POST', URL());
    expect(r.status).toBe(403);
    const aval = await chamar(cons, 'POST', `${P}/terceiros/forn1/avaliacoes`, {});
    expect(aval.status).toBe(403);
    expect((await r.json<{ error: string }>()).error).toBe((await aval.json<{ error: string }>()).error);
    expect(await nperg()).toBe(0);
  });

  it('projeto com privacy mas pessoa sem: 403 e nenhuma pergunta', async () => {
    await run(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES ('proj-a', 'privacy', 'teste')`); // só o projeto: a pessoa não tem
    expect((await chamar(cons, 'POST', URL())).status).toBe(403);
    expect(await nperg()).toBe(0);
  });

  it('agente, chave de API e técnico são recusados', async () => {
    await concederModulos([AGENTE.userId], ['privacy']);
    expect((await chamar(tec, 'POST', URL())).status).toBe(403);
    expect((await chamar({ 'X-API-Key': CHAVE }, 'POST', URL())).status).toBe(403);
    expect(await nperg()).toBe(0);
  });

  it('técnico COM ot e privacy (o módulo não é o motivo) continua recusado: o 403 é do papel', async () => {
    await concederModulos(['u-tec2'], ['privacy']);
    const r = await chamar(tec, 'POST', URL());
    expect(r.status).toBe(403);
    expect((await r.json<{ error: string }>()).error).toMatch(/role|papel/); // a trava de papel (auth.ts ou a do topo de ot.ts), não a de módulo
    expect(await nperg()).toBe(0);
  });

  it('com os dois módulos: cria 4 perguntas do projeto; repetir não duplica; id alheio é 404', async () => {
    const r = await chamar(cons, 'POST', URL());
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await r.json()).toEqual({ ok: true, criadas: 4 });
    expect(await nperg()).toBe(4);
    expect(await (await chamar(cons, 'POST', URL())).json()).toEqual({ ok: true, criadas: 0 });
    expect(await nperg()).toBe(4);
    expect((await chamar(cons, 'POST', `${P}/ot/fornecedores/nao-existe/perguntas-padrao`)).status).toBe(404);
    const tx = JSON.stringify((await env.DB.prepare(`SELECT tema, texto, origem, tipo FROM homologacao_perguntas WHERE project_id = 'proj-a'`).all()).results);
    for (const x of ['n.ot', 'Segredo', 'integrador', 'site1', 'RO-CB', 'ISO', 'NIST', 'IEC']) expect(tx, x).not.toContain(x);
    expect((await env.DB.prepare(`SELECT DISTINCT origem, tipo FROM homologacao_perguntas`).all()).results).toEqual([{ origem: 'projeto', tipo: null }]);
  });

  it('as perguntas de OT só entram no questionário do fornecedor ligado ao n.ot (decisão do dono, 19/11)', async () => {
    const { criarHomologacao, lerHomologacao } = await import('../src/services/homologacao');
    await run(`INSERT OR IGNORE INTO organizations (id, name, slug, status) VALUES ('org_ness', 'ness.', 'ness', 'Active')`); // o modelo de questionário é da organização do projeto
    await run(`UPDATE partes SET terceiro_tipo = 'medio' WHERE id = 'forn1'`);
    await run(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('forn-comum', 'proj-a', 'organizacao', 'Papelaria Comum', 'medio')`);
    const { PERGUNTAS_OT_FORNECEDOR } = await import('../src/data/ot-perguntas-fornecedor');
    const temas = async (parte: string) => { // o texto, não o tema: o modelo padrão também tem um tema "Incidentes"
      const h = await criarHomologacao(env.DB, A, 'x@x', { parte_id: parte, dias: 10 });
      if (!h.ok) throw new Error(JSON.stringify(h));
      return (await lerHomologacao(env.DB, A, h.id))!.perguntas.map((p: { texto: string }) => p.texto);
    };
    const OT = PERGUNTAS_OT_FORNECEDOR.map((p) => p.texto);
    const comum = await temas('forn-comum');
    for (const t of OT) expect(comum, t).not.toContain(t);
    expect(comum.length).toBeGreaterThan(0); // o questionário do modelo segue inteiro
    const ligado = await temas('forn1');
    for (const t of OT) expect(ligado, t).toContain(t);
    expect(ligado.length).toBe(comum.length + OT.length);
  });
});

describe('fornecedor de OT: fluxo visível, parte ativa, mescla e corrida (fix round 1)', () => {
  const SO2 = JSON.stringify(['site2']);
  const mesclarPartes = (manter: string, remover: string) => import('../src/services/mesclar').then((m) => m.mesclar(env.DB, 'partes', A, 'x@x', manter, remover));
  beforeAll(async () => {
    await applySchema(); await resetData(); await seedTwoProjects(); await habilitarOt(A);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('site1', 'proj-a', 'S1'), ('site2', 'proj-a', 'S2')`),
      env.DB.prepare(`INSERT INTO ot_ativos (id, project_id, site_id, nome) VALUES ('at1', 'proj-a', 'site1', 'RTU'), ('at2', 'proj-a', 'site2', 'PLC')`),
      // fluxo do site2 com a ponta de destino no site1
      env.DB.prepare(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_ativo_id, destino_ativo_id) VALUES ('fxX', 'proj-a', 'site2', 'at2', 'at1'), ('fxOk', 'proj-a', 'site2', 'at2', 'at2')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('k', 'proj-a', 'organizacao', 'Mantida'), ('d', 'proj-a', 'organizacao', 'Duplicada')`),
    ]);
  });

  it('fluxo com uma ponta fora do escopo: não é listado, não apaga e não se cria (técnico restrito ao site2)', async () => {
    await run(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_fluxo_id, criado_por) VALUES ('fx-x', 'proj-a', 'k', 'integrador', 'fxX', 'u'), ('fx-ok', 'proj-a', 'k', 'integrador', 'fxOk', 'u')`);
    expect((await lerFornecedores(env.DB, A, SO2)).map((x) => x.id)).toEqual(['fx-ok']);
    expect((await lerFornecedores(env.DB, A, TODOS)).map((x) => x.id).sort()).toEqual(['fx-ok', 'fx-x']);
    expect(await apagarFornecedor(env.DB, A, 'fx-x', SO2)).toBe(false);
    const c = await criarFornecedor(env.DB, A, { parte_id: 'k', papel: 'fabricante', ot_fluxo_id: 'fxX' }, 'u', SO2);
    expect(c.ok ? 'ok' : c.status).toBe(404);
    expect(await apagarFornecedor(env.DB, A, 'fx-x', TODOS)).toBe(true);
  });

  it('parte inativa: o vínculo some da leitura; reativada, volta', async () => {
    await run(`UPDATE partes SET status = 'inativa' WHERE id = 'k'`);
    expect(await lerFornecedores(env.DB, A, TODOS)).toEqual([]);
    await run(`UPDATE partes SET status = 'ativa' WHERE id = 'k'`);
    expect(await lerFornecedores(env.DB, A, TODOS)).toHaveLength(1);
  });

  it('parte inativa não é aceita na criação (422, não 404)', async () => {
    await run(`UPDATE partes SET status = 'inativa' WHERE id = 'd'`);
    const r = await criarFornecedor(env.DB, A, { parte_id: 'd', papel: 'integrador', ot_site_id: 'site1' }, 'u', TODOS);
    expect(r.ok ? 'ok' : r.status).toBe(422);
    await run(`UPDATE partes SET status = 'ativa' WHERE id = 'd'`);
  });

  it('mesclar partes leva os vínculos de OT do duplicado para o que fica e descarta o que já existia', async () => {
    await run(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, criado_por) VALUES ('m-novo', 'proj-a', 'd', 'fabricante', 'site1', 'u'), ('m-dup', 'proj-a', 'd', 'integrador', 'site2', 'u'), ('m-ja', 'proj-a', 'k', 'integrador', 'site2', 'u')`);
    const r = await mesclarPartes('k', 'd');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const linhas = await env.DB.prepare(`SELECT id, parte_id FROM ot_fornecedores WHERE id LIKE 'm-%' ORDER BY id`).all<{ id: string; parte_id: string }>();
    expect(linhas.results).toEqual([{ id: 'm-ja', parte_id: 'k' }, { id: 'm-novo', parte_id: 'k' }]);
    expect(JSON.stringify(r)).not.toMatch(/fornecedor de OT|n\.ot|ot_fornecedores/i);
  });

  it('a prévia da junção é idêntica com e sem vínculo de OT no duplicado (nem a contagem aparece); a junção ainda move', async () => {
    const m = await import('../src/services/mesclar');
    await run(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('k2', 'proj-a', 'organizacao', 'Mantida 2'), ('d2', 'proj-a', 'organizacao', 'Duplicada 2')`);
    const sem = await m.previaDaMescla(env.DB, 'partes', A, 'k2', 'd2');
    await run(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, criado_por) VALUES ('p-ot', 'proj-a', 'd2', 'integrador', 'site1', 'u')`);
    expect(await m.previaDaMescla(env.DB, 'partes', A, 'k2', 'd2')).toEqual(sem);
    const r = await m.mesclar(env.DB, 'partes', A, 'x@x', 'k2', 'd2');
    expect(r).toEqual(sem);
    expect(await env.DB.prepare(`SELECT parte_id FROM ot_fornecedores WHERE id = 'p-ot'`).first()).toEqual({ parte_id: 'k2' });
    const log = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'cadastro.mesclado' ORDER BY rowid DESC LIMIT 1`).first<{ details: string }>();
    expect(log!.details).not.toMatch(/OT|fornecedor/i);
  });

  it('corrida: a segunda criação barrada pelo índice único devolve o existente, sem 500', async () => {
    await run(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, criado_por) VALUES ('corrida', 'proj-a', 'k', 'acesso_remoto', 'site1', 'u')`);
    // o NOT EXISTS "já tinha passado" quando a outra chamada gravou: simula com um INSERT direto, que o índice único barra
    const direto = { prepare: (sql: string) => sql.includes('INSERT INTO ot_fornecedores')
      ? { bind: (...b: unknown[]) => ({ run: () => env.DB.prepare(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, ot_fluxo_id, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(...b.slice(0, 7)).run() }) }
      : env.DB.prepare(sql) } as unknown as D1Database;
    const r = await criarFornecedor(direto, A, { parte_id: 'k', papel: 'acesso_remoto', ot_site_id: 'site1' }, 'u', TODOS);
    expect(r).toEqual({ ok: true, id: 'corrida', criado: false });
  });
});

describe('fornecedor de OT: junção para parte que não é fornecedora, painel e prefixo neutro (fix final)', () => {
  beforeAll(async () => {
    await applySchema(); await resetData(); await seedTwoProjects(); await habilitarOt(A);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('site1', 'proj-a', 'S1')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('org1', 'proj-a', 'organizacao', 'Org'), ('int1', 'proj-a', 'organizacao', 'ANPD')`),
      env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('vi', 'proj-a', 'int1', 'parte_interessada', 'projeto', 'proj-a')`),
    ]);
  });

  it('depois de mesclar na parte que não é fornecedora, o vínculo some da leitura', async () => {
    await run(`INSERT INTO ot_fornecedores (id, project_id, parte_id, papel, ot_site_id, criado_por) VALUES ('mf', 'proj-a', 'org1', 'integrador', 'site1', 'u')`);
    expect(await lerFornecedores(env.DB, A, TODOS)).toHaveLength(1);
    const m = await import('../src/services/mesclar');
    const r = await m.mesclar(env.DB, 'partes', A, 'x@x', 'int1', 'org1');
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await env.DB.prepare(`SELECT parte_id FROM ot_fornecedores WHERE id = 'mf'`).first()).toEqual({ parte_id: 'int1' });
    expect(await lerFornecedores(env.DB, A, TODOS)).toEqual([]);
  });

  it('painel: o último movimento de quem não tem ot ignora linhas ot.*; quem tem ot as vê', async () => {
    const { carteira } = await import('../src/services/painel');
    await run(`INSERT INTO audit_logs (id, action, actor, details, project_id, created_at) VALUES ('l1', 'cadastro.criado', 'x', 'd', 'proj-a', '2030-01-01 10:00:00')`);
    const em = async (mods: ('iso' | 'ot')[]) => (await carteira(env.DB, null, mods)).find((x) => x.id === 'proj-a')!.ultimo_movimento;
    const antes = await em(['iso']);
    await run(`INSERT INTO audit_logs (id, action, actor, details, project_id, created_at) VALUES ('l2', 'ot.fornecedor.criado', 'x', 'd', 'proj-a', '2031-01-01 10:00:00')`);
    expect(antes).toBe('2030-01-01 10:00:00');
    expect(await em(['iso'])).toBe(antes);
    expect(await em(['iso', 'ot'])).toBe('2031-01-01 10:00:00');
  });

  it('as perguntas semeadas usam id neutro (hp-pd-), sem sinal do n.ot', async () => {
    const { semearPerguntasOt } = await import('../src/services/fornecedor-modelos');
    expect(await semearPerguntasOt(env.DB, A)).toBeGreaterThan(0);
    const ids = (await env.DB.prepare(`SELECT id FROM homologacao_perguntas WHERE project_id = 'proj-a'`).all<{ id: string }>()).results.map((x) => x.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(/^hp-pd-/);
    expect(await semearPerguntasOt(env.DB, A)).toBe(0);
  });
});
