import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
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
const run = async (_m: string, p: { messages: { content: string }[] }) => {
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
const multipart = (h: H, caminho: string, csv: string, campos: Record<string, string> = {}, nome = 'inv.csv') => {
  const fd = new FormData();
  fd.set('file', new File([csv], nome));
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return app.fetch(new Request('http://localhost' + caminho, { method: 'POST', headers: h, body: fd }), { ...workerEnv(), ...ENV_EXTRA });
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

  it('recusas: sessão de entrevista, técnico, chave de API, PDF, campo repetido, campo de banco, índice fora, perfil com IP', async () => {
    expect((await proposta(cons, CSV, ids.ent)).status).toBe(409);
    expect((await aplicar(cons, { mapeamento: MAPA }, CSV, ids.ent)).status).toBe(409);
    expect((await proposta(cons, CSV, 'nao-existe')).status).toBe(404);
    expect((await proposta(tec)).status).toBe(403);
    expect((await proposta({ 'X-API-Key': CHAVE })).status).toBe(403);
    expect((await chamar({ 'X-API-Key': CHAVE }, 'GET', `${P}/depara/perfis`)).status).toBe(403);
    expect((await proposta(cons, CSV, ids.doc, 'inv.pdf')).status).toBe(400);
    expect((await aplicar(cons, { mapeamento: JSON.stringify({ '0': 'nome', '1': 'nome' }) })).status).toBe(400);
    expect((await aplicar(cons, { mapeamento: JSON.stringify({ '0': 'nome', '1': 'ip_cifrado' }) })).status).toBe(400);
    expect((await aplicar(cons, { mapeamento: JSON.stringify({ '0': 'nome', '7': 'ip' }) })).status).toBe(400);
    expect((await aplicar(cons, { mapeamento: 'não é json' })).status).toBe(400);
    expect((await aplicar(cons, { mapeamento: MAPA, perfil_nome: 'Lista do 10.1.9.9' })).status).toBe(400);
  });

  it('11ª proposta com IA na hora: 429 teto_por_hora', async () => {
    let r: Response | undefined;
    for (let i = 0; i < 12; i++) {
      r = await proposta(cons, `Coluna${i};IP\nA;10.1.8.${i}\n`);
      if (r.status !== 200) break;
    }
    expect(r!.status).toBe(429);
    expect(await r!.json()).toMatchObject({ codigo: 'teto_por_hora' });
    expect(chamadasIa).toBe(10);
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
