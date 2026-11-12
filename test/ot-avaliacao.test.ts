import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { conformidadeOt, conformidadePorSite, ITENS_TECNICOS } from '../src/services/ot-conformidade';
import { applySchema, execSql, resetData, seedTwoProjects } from './helpers/d1';
import mig from '../migrations/0112_ot_assessment.sql?raw';
import req from '../migrations/0090_ot_requisitos.sql?raw';
import app from '../src/index';
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { diaMaisSP } from '../src/services/hoje';
import { sessionFor, workerEnv, habilitarOt, concederModulos } from './helpers/d1';

const P = 'proj-a';
const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).run();

describe('ot-avaliacao: migração 0112 e conformidade técnica por site', () => {
  beforeAll(async () => { await applySchema(); });
  beforeEach(async () => {
    await resetData(); await seedTwoProjects(); await execSql(req);
    for (const s of ['s1', 's2']) await run(`INSERT INTO ot_sites (id, project_id, nome) VALUES (?, ?, ?)`, s, P, s);
  });

  it('0112 é reaplicável e o CHECK recusa parcial sem justificativa', async () => {
    await execSql(mig);
    for (const n of [1, 2, 3]) await run(`INSERT OR IGNORE INTO ot_requisitos (id, framework, codigo, titulo, versao) VALUES (?, 'F', ?, 't', 'v')`, `rq${n}`, `9.${n}`);
    const ins = (sit: string, just: string | null, rq = 'rq1') => run(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, justificativa, atualizado_por) VALUES (?, ?, ?, ?, ?, 'u')`, `a-${rq}-${sit}-${just}`, P, rq, sit, just);
    await expect(ins('parcial', null)).rejects.toThrow(/CHECK/);
    await expect(ins('parcial', ' a ')).rejects.toThrow(/CHECK/);
    await ins('atende', null);
    await ins('nao_atende', 'não há política escrita', 'rq2');
    await ins('nao_se_aplica', 'ARCiber sem terceiros', 'rq3');
    await expect(ins('nao_se_aplica', null, 'rq3')).rejects.toThrow(/CHECK/);
  });

  it('por site: o site com zonas 2, 3 e 4 difere do que não tem', async () => {
    for (const n of [2, 3, 4]) await run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, ?, 's1', 'z', ?)`, `z${n}`, P, n);
    await run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('zx', ?, 's2', 'z', 4)`, P);
    await run(`INSERT INTO ot_fluxos (id, project_id, site_id, origem_zona_id, destino_zona_id, externo, via_vpn) VALUES ('f1', ?, 's2', 'zx', 'zx', 1, 0)`, P);
    const r = await conformidadePorSite(env.DB, P, ['s1', 's2']);
    expect(Object.keys(r.s1).sort()).toEqual([...ITENS_TECNICOS].sort());
    expect(r.s1['4.1.1'].situacao).toBe('evidencia_no_inventario');
    expect(r.s2['4.1.1'].situacao).toBe('nao_atende');
    expect(r.s2['4.1.3'].situacao).toBe('nao_atende');
    expect(r.s1['4.1.3'].situacao).toBe('sem_evidencia');
    expect(r.s1['4.2.1']).toEqual(r.s2['4.2.1']);
    expect(await conformidadePorSite(env.DB, P, [])).toEqual({});
  });

  it('o agregado concorda com os sites (mesma regra)', async () => {
    for (const n of [2, 3, 4]) await run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, ?, 's1', 'z', ?)`, `z${n}`, P, n);
    const todos = await conformidadeOt(env.DB, P, JSON.stringify(['s1']));
    const por = await conformidadePorSite(env.DB, P, ['s1']);
    for (const c of ITENS_TECNICOS) {
      const { situacao, evidencia } = todos.itens.find((i) => i.codigo === c)!;
      expect({ situacao, evidencia }).toEqual({ situacao: por.s1[c].situacao, evidencia: por.s1[c].evidencia });
    }
    expect(por.s1['4.1.1'].situacao).toBe('evidencia_no_inventario');
  });

  it('site de outro projeto: contagens zeradas e nada do projeto alheio', async () => {
    await run(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('sb', 'proj-b', 'B')`);
    for (const n of [2, 3, 4]) await run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, 'proj-b', 'sb', 'z', ?)`, `zb${n}`, n);
    const r = await conformidadePorSite(env.DB, P, ['sb']);
    expect(r.sb['4.1.1'].situacao).toBe('nao_atende');
    expect(r.sb['4.1.1'].numeros).toEqual({ sites: 1, sites_com_3_zonas: 0 });
    expect(r.sb['4.1.3'].numeros).toEqual({ externos: 0, sem_vpn: 0 });
    expect(r.sb['4.3.1'].numeros).toEqual({ arciber: 0, sem_verificacao: 0, vencidos: 0, sem_zona: 0 });
  });
});

// ─── serviço e rotas ────────────────────────────────────────────────────────
type H = Record<string, string>;
const U = '/api/v1/projects/proj-a/ot';
let gestor: H, cons: H, tecnico: H;
async function chamar(h: H, metodo: string, caminho: string, corpo?: unknown) {
  const ctx = createExecutionContext();
  const r = await app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), workerEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return r;
}
const item = async (h: H, codigo: string) => ((await (await chamar(h, 'GET', `${U}/assessment`)).json()) as any).itens.find((i: any) => i.codigo === codigo);
const evid = (id: string, proj: string, valido: string | null = null) => run(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, valido_ate) VALUES (?, ?, ?, 'k', 'h', 'u', ?)`, id, proj, `${id}.pdf`, valido);

describe('ot-avaliacao: assessment', () => {
  beforeAll(async () => { await applySchema(); });
  beforeEach(async () => {
    await resetData(); await seedTwoProjects(); await habilitarOt('proj-a', 'proj-b'); await execSql(req);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-t', 't@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-b', 'b@cliente.teste', 'x', 'Outro', 'org_admin', 'proj-b')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('cons:c@ness.lat', 'c@ness.lat', 'x', 'Consultor', 'consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('proj-a', 'Consultor', 'c@ness.lat', 'consultor', 'Consultor')`),
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', 'proj-a', 'SE Norte', 'em_operacao'), ('s2', 'proj-a', 'SE Sul', 'em_operacao'), ('s3', 'proj-a', 'SE Nova', 'em_levantamento'), ('sb', 'proj-b', 'SE B', 'em_operacao')`),
    ]);
    await concederModulos(['u-g', 'u-t', 'u-b', 'cons:c@ness.lat'], ['ot']);
    gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
    tecnico = await sessionFor({ id: 'u-t', email: 't@cliente.teste', role: 'org_user', client_project_id: 'proj-a' });
    cons = await sessionFor({ id: 'cons:c@ness.lat', email: 'c@ness.lat', role: 'consultor' });
  });

  it('pior site em operação define a organização; site em levantamento não conta', async () => {
    for (const s of ['s1', 's2']) for (const n of [2, 3, 4]) await run(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES (?, ?, ?, 'z', ?)`, `${s}z${n}`, P, s, n);
    expect((await item(cons, '4.1.1')).situacao_org).toBe('evidencia_no_inventario');
    // s3 (em levantamento) não tem zonas e mesmo assim não derruba a organização
    await run(`UPDATE ot_zonas SET status = 'removido' WHERE id = 's2z3'`);
    const i = await item(cons, '4.1.1');
    expect(i.situacao_org).toBe('nao_atende');
    expect(i.por_site.map((s: any) => s.site_id).sort()).toEqual(['s1', 's2', 's3']);
    expect(i.por_site.find((s: any) => s.site_id === 's3').situacao).toBe('nao_atende');
    await run(`UPDATE ot_sites SET fase = 'em_levantamento'`);
    expect((await item(cons, '4.1.1')).situacao_org).toBe('nao_avaliado');
  });

  it('salvar: parcial sem justificativa e item técnico dão 400; responsável de fora, 400', async () => {
    expect((await chamar(cons, 'PUT', `${U}/assessment/4.4.1`, { situacao: 'parcial' })).status).toBe(400);
    expect((await chamar(cons, 'PUT', `${U}/assessment/4.1.1`, { situacao: 'atende' })).status).toBe(400);
    expect((await chamar(cons, 'PUT', `${U}/assessment/5.1.1`, { situacao: 'atende' })).status).toBe(400);
    expect((await chamar(cons, 'PUT', `${U}/assessment/4.4.1`, { situacao: 'atende', responsavel_id: 'u-b' })).status).toBe(400);
    expect((await chamar(cons, 'PUT', `${U}/assessment/4.4.1`, { situacao: 'parcial', justificativa: 'Fale com a-b@x.com' })).status).toBe(400);
    expect((await chamar(cons, 'PUT', `${U}/assessment/9.9.9`, { situacao: 'atende' })).status).toBe(404);
    expect((await chamar(cons, 'PUT', `${U}/assessment/4.4.1`, { situacao: 'parcial', justificativa: 'Falta política escrita', responsavel_id: 'u-g' })).status).toBe(200);
    const a = (await item(cons, '4.4.1')).avaliacao;
    expect(a).toMatchObject({ situacao: 'parcial', responsavel_nome: 'Gestor', confirmado: false });
  });

  it('editar tira a confirmação; confirmar é só do Gestor; técnico não escreve', async () => {
    const antes = (await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action LIKE 'ot.assessment.%'`).first<any>()).n;
    const corpo = { situacao: 'atende' };
    expect((await chamar(tecnico, 'PUT', `${U}/assessment/4.4.1`, corpo)).status).toBe(403);
    expect((await chamar(gestor, 'POST', `${U}/assessment/4.4.1/confirmar`)).status).toBe(404); // sem avaliação
    await chamar(cons, 'PUT', `${U}/assessment/4.4.1`, corpo);
    expect((await chamar(cons, 'POST', `${U}/assessment/4.4.1/confirmar`)).status).toBe(403);
    expect((await chamar(gestor, 'POST', `${U}/assessment/4.4.1/confirmar`)).status).toBe(200);
    expect((await chamar(gestor, 'POST', `${U}/assessment/4.4.1/confirmar`)).status).toBe(409);
    const a = (await item(cons, '4.4.1')).avaliacao;
    expect(a).toMatchObject({ confirmado: true, confirmado_por_nome: 'Gestor', proxima_revisao: diaMaisSP(365) });
    await chamar(cons, 'PUT', `${U}/assessment/4.4.1`, { situacao: 'nao_se_aplica', justificativa: 'Sem firmware' });
    expect((await item(cons, '4.4.1')).avaliacao).toMatchObject({ confirmado: false, confirmado_por_nome: null });
    const acoes = (await env.DB.prepare(`SELECT action FROM audit_logs WHERE action LIKE 'ot.assessment.%' AND project_id = 'proj-a' ORDER BY rowid`).all<any>()).results.map((r) => r.action).slice(antes);
    expect(acoes).toEqual(['ot.assessment.salvo', 'ot.assessment.confirmado', 'ot.assessment.salvo']);
  });

  it('evidência: vencida põe revisar; ligar não tira a confirmação; de outro projeto 404', async () => {
    await chamar(cons, 'PUT', `${U}/assessment/4.4.1`, { situacao: 'atende' });
    await chamar(gestor, 'POST', `${U}/assessment/4.4.1/confirmar`);
    await evid('e-ok', 'proj-a', diaMaisSP(30)); await evid('e-old', 'proj-a', diaMaisSP(-1)); await evid('e-b', 'proj-b');
    expect((await chamar(cons, 'POST', `${U}/assessment/4.4.1/evidencias`, { evidencia_id: 'e-b' })).status).toBe(404);
    expect((await chamar(cons, 'POST', `${U}/assessment/4.4.1/evidencias`, { evidencia_id: 'e-ok' })).status).toBe(200);
    expect((await item(cons, '4.4.1')).revisar).toBe(false);
    expect((await chamar(cons, 'POST', `${U}/assessment/4.4.1/evidencias`, { evidencia_id: 'e-old' })).status).toBe(200);
    const i = await item(cons, '4.4.1');
    expect(i.revisar).toBe(true);
    expect(i.avaliacao.confirmado).toBe(true);
    expect(i.evidencias.map((e: any) => [e.id, e.vencida]).sort()).toEqual([['e-ok', false], ['e-old', true]]);
    expect((await chamar(cons, 'DELETE', `${U}/assessment/4.4.1/evidencias/e-old`)).status).toBe(200);
    expect((await chamar(cons, 'DELETE', `${U}/assessment/4.4.1/evidencias/e-old`)).status).toBe(404);
    expect((await item(cons, '4.4.1')).revisar).toBe(false);
  });

  it('subsídio: a resposta do roteiro aparece no item da norma (lista separada por vírgula)', async () => {
    await run(`INSERT OR IGNORE INTO ot_roteiro_perguntas (id, ordem, texto, item_norma) VALUES ('rot-02', 2, 'Fornecedores acessam remotamente?', '4.1.3, 4.5.1.5'), ('rot-06', 6, 'Firmware?', '4.4.1')`);
    await run(`INSERT INTO ot_levantamentos (id, project_id, site_id, tipo, realizado_em, roteiro, criado_por) VALUES ('l1', ?, 's1', 'entrevista', '2026-11-01', ?, 'u')`,
      P, JSON.stringify({ 'rot-02': { resposta: 'sim' }, 'rot-06': { resposta: 'nao_perguntado' } }));
    const s = (await item(cons, '4.5.1.5')).subsidio;
    expect(s).toEqual([expect.objectContaining({ levantamento_id: 'l1', site_id: expect.any(String), site_nome: 'SE Norte', resposta: 'sim', realizado_em: '2026-11-01' })]);
    expect((await item(cons, '4.4.1')).subsidio).toEqual([]);
  });

  it('resumo e isolamento entre projetos', async () => {
    await chamar(cons, 'PUT', `${U}/assessment/4.4.1`, { situacao: 'atende' });
    await chamar(cons, 'PUT', `${U}/assessment/4.4.2`, { situacao: 'parcial', justificativa: 'Em andamento', proxima_revisao: diaMaisSP(-2) });
    await chamar(gestor, 'POST', `${U}/assessment/4.4.1/confirmar`);
    const r: any = await (await chamar(cons, 'GET', `${U}/assessment`)).json();
    const total = r.itens.length;
    expect(r.resumo).toMatchObject({ atende: 1, parcial: 1, nao_se_aplica: 0, revisar: 1, a_confirmar: 1 });
    expect(Object.values(r.resumo).slice(0, 5).reduce((a: number, b: any) => a + b, 0)).toBe(total);
    expect(r.itens.find((i: any) => i.codigo === '5.1.1')).toMatchObject({ tipo: 'excecao', situacao: 'nao_avaliado' });
    const gb = await sessionFor({ id: 'u-b', email: 'b@cliente.teste', role: 'org_admin', client_project_id: 'proj-b' });
    const b: any = await (await chamar(gb, 'GET', '/api/v1/projects/proj-b/ot/assessment')).json();
    expect(b.resumo).toMatchObject({ atende: 0, parcial: 0, a_confirmar: 0 });
    expect(b.itens.find((i: any) => i.codigo === '4.1.1').por_site.map((s: any) => s.site_id)).toEqual(['sb']);
  });
});
