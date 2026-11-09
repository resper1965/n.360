import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, workerEnv, habilitarPrivacy, sessionFor, concederModulos } from './helpers/d1';
import { sha256Hex } from '../src/helpers';
import { lacunasDaFonte, resumoDeLacunas } from '../src/services/requisitos';

/** Requisito "não aplicável" por projeto, com justificativa (migration 0107). Catálogo e dados fictícios. */
const P = 'na-proj';
const base = `/api/v1/projects/${P}/requisitos`;
const JUST = 'A empresa é privada e não trata dado como poder público.';
const json = { 'Content-Type': 'application/json' };
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv());
const AGENTE = { userId: 'na-cons', email: 'cons@na.lat', projectId: P, concessaoId: 'na-conc' };
const comoAgente = (metodo: string, caminho: string, h: Record<string, string>, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...json, ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
    { ...workerEnv(), AGENTE } as any);
const DECISAO = (motivo = 'o consultor confirmou') => ({ 'X-Agente-Ferramenta': 'niso_excluir_requisito', 'X-Agente-Confirmado': '1', 'X-Agente-Motivo': encodeURIComponent(motivo) });
const item = async (id: string) => (await lacunasDaFonte(env.DB, P, 'na-lei')).find((l) => l.requisito_id === id)!;

let consultor: Record<string, string>, cliente: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('na-cons', 'cons@na.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'),
      ('na-cli', 'cli@na.lat', 'x', 'Cli', 'org_admin', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('na-g', ?, 'Cons', 'cons@na.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('na-conc', 'na-cons', ?, datetime('now','+30 days'))`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome) VALUES ('na-lei', 'Lei fictícia')`),
    // raiz com dois filhos e um neto; um avulso com documento vigente ligado
    env.DB.prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo, pai_id) VALUES
      ('na-raiz', 'na-lei', 'Res. 1', 'Resolução inteira', NULL), ('na-f1', 'na-lei', 'Res. 1, art. 1', 'Filho 1', 'na-raiz'),
      ('na-f2', 'na-lei', 'Res. 1, art. 2', 'Filho 2', 'na-raiz'), ('na-neto', 'na-lei', 'Res. 1, art. 2, I', 'Neto', 'na-f2'),
      ('na-art', 'na-lei', 'Art. 23', 'Poder público', NULL), ('na-outro', 'na-lei', 'Art. 7', 'Outro', NULL)`),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('na-doc', ?, 'politica', 'Política', 'vigente')`).bind(P),
    env.DB.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES ('na-doc', 'na-art', ?)`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await concederModulos(['na-cons', 'na-cli'], ['privacy']);
  consultor = await sessionFor({ id: 'na-cons', email: 'cons@na.lat', role: 'consultor', org_id: 'org_ness' });
  cliente = await sessionFor({ id: 'na-cli', email: 'cli@na.lat', role: 'org_admin', client_project_id: P, org_id: 'org_ness' });
});

describe('requisito não aplicável', () => {
  it('só a equipe marca, com justificativa de 20+ caracteres; o requisito tem de existir; a trilha não leva o texto', async () => {
    expect((await chamar(cliente, 'PUT', `${base}/na-art/exclusao`, { justificativa: JUST })).status).toBe(403);
    await env.DB.prepare(`INSERT INTO api_keys (id, project_id, name, key_hash, permissions, status) VALUES ('na-k', ?, 'chave', ?, 'write', 'Active')`).bind(P, await sha256Hex('chave-na')).run();
    expect((await chamar({ 'X-API-Key': 'chave-na' }, 'PUT', `${base}/na-art/exclusao`, { justificativa: JUST })).status).toBe(403);
    expect((await chamar(consultor, 'PUT', `${base}/na-art/exclusao`, { justificativa: 'não se aplica' })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${base}/na-nada/exclusao`, { justificativa: JUST })).status).toBe(404);
    const r = await chamar(consultor, 'PUT', `${base}/na-art/exclusao`, { justificativa: JUST });
    expect(r.status, await r.clone().text()).toBe(200);
    const trilha = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'requisito.excluido'`).first<string>('details');
    expect(trilha).toContain('Art. 23');
    expect(trilha).not.toContain('poder público');
  });

  it('a exclusão vence a cobertura e mantém as origens; o cliente lê autor, data e justificativa', async () => {
    const art = await item('na-art');
    expect(art).toMatchObject({ situacao: 'nao_aplicavel', exclusao: { justificativa: JUST, decidido_por: 'cons@na.lat' } });
    expect(art.origens).toEqual([expect.objectContaining({ tipo: 'documento', id: 'na-doc' })]);
    const r = await chamar(cliente, 'GET', `${base}/lacunas?fonte=na-lei`);
    const corpo = (await r.json()) as { itens: { requisito_id: string; exclusao?: { decidido_em: string } }[] };
    expect(corpo.itens.find((i) => i.requisito_id === 'na-art')!.exclusao!.decidido_em).toBeTruthy();
  });

  it('excluir o pai exclui filhos e netos ("herdada de"); marcar um filho de excluído é 409', async () => {
    expect((await chamar(consultor, 'PUT', `${base}/na-raiz/exclusao`, { justificativa: 'A empresa não é agente de pequeno porte.' })).status).toBe(200);
    expect(await item('na-neto')).toMatchObject({ situacao: 'nao_aplicavel', exclusao: { herdada_de: 'Res. 1' } });
    expect((await item('na-raiz')).exclusao!.herdada_de).toBeUndefined();
    const filho = await chamar(consultor, 'PUT', `${base}/na-f2/exclusao`, { justificativa: JUST });
    expect(filho.status).toBe(409);
    expect(((await filho.json()) as { error: string }).error).toContain('Res. 1');
  });

  it('o total do resumo conta só os aplicáveis; o painel do encarregado usa o mesmo resumo', async () => {
    const resumo = resumoDeLacunas(await lacunasDaFonte(env.DB, P, 'na-lei'));
    expect(resumo).toEqual({ total: 1, cobertos: 0, parciais: 0, lacunas: 1, nao_aplicaveis: 5 });
  });

  it('voltar a aplicar: só a equipe; a cobertura volta; DELETE do que não está excluído é 404', async () => {
    expect((await chamar(cliente, 'DELETE', `${base}/na-art/exclusao`)).status).toBe(403);
    expect((await chamar(consultor, 'DELETE', `${base}/na-art/exclusao`)).status).toBe(200);
    expect(await item('na-art')).toMatchObject({ situacao: 'coberto' });
    expect((await item('na-art')).exclusao).toBeUndefined();
    expect((await chamar(consultor, 'DELETE', `${base}/na-art/exclusao`)).status).toBe(404);
    expect(await env.DB.prepare(`SELECT 1 FROM audit_logs WHERE action = 'requisito.reincluido'`).first()).not.toBeNull();
  });

  it('o agente marca e desmarca só pela decisão confirmada, com o motivo na trilha', async () => {
    expect((await comoAgente('PUT', `${base}/na-outro/exclusao`, {}, { justificativa: JUST })).status).toBe(403);
    const r = await comoAgente('PUT', `${base}/na-outro/exclusao`, DECISAO('cliente não usa esta base legal'), { justificativa: JUST });
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'agente.decisao' ORDER BY rowid DESC`).first<string>('details')).toContain('niso_excluir_requisito');
    expect((await comoAgente('DELETE', `${base}/na-outro/exclusao`, DECISAO())).status).toBe(200);
  });
});
