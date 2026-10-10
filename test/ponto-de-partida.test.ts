import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { semearCatalogo } from '../src/services/requisitos';

/** Painel "ponto de partida": só consulta, faixa núcleo, vale para projeto só n.iso ou só n.privacy. */
const P = 'pp-proj', OUTRO = 'pp-outro';
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
type Ponto = {
  cadastro: Record<string, number | boolean>;
  cobertura: { fonte: string; total: number; cobertos: number; parciais: number; lacunas: number }[];
  iso_ajudados: { requisito_id: string; referencia: string; titulo: string; por: string[] }[];
};
let consultor: Record<string, string>, cliente: Record<string, string>;
const ver = async (projeto = P) => (await (await chamar(consultor, `/api/v1/projects/${projeto}/ponto-de-partida`)).json()) as Ponto;

beforeAll(async () => {
  await applySchema();
  await semearCatalogo(env.DB);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('u-cli', 'cli@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-pp', ?1, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor'), ('g-pp2', ?2, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('r1', ?1, 'A'), ('r2', ?1, 'B')`).bind(P),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, ropa_id) VALUES ('dp1', ?, 'r1')`).bind(P),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, titulo, status) VALUES ('d1', ?1, 'Vigente', 'vigente'), ('d2', ?1, 'Rascunho', 'rascunho')`).bind(P),
    env.DB.prepare(`INSERT INTO evidence (id, project_id, file_name, r2_key, file_hash, uploaded_by, evaluation_status, valido_ate) VALUES
      ('e1', ?1, 'a.pdf', 'k', 'h', 'u', 'conforming', NULL), ('e2', ?1, 'b.pdf', 'k', 'h', 'u', 'conforming', '2020-01-01')`).bind(P),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome) VALUES ('i1', ?, 'Sistema')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('p1', ?1, 'organizacao', 'Fornecedor'), ('p2', ?1, 'pessoa', 'Rita')`).bind(P),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES
      ('v1', ?1, 'p1', 'terceiro', 'projeto', ?1), ('v2', ?1, 'p2', 'encarregado', 'projeto', ?1)`).bind(P),
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, status) VALUES ('in1', ?, 'IN-1', 'X', '2026-10-01', 'aberto')`).bind(P),
    env.DB.prepare(`INSERT INTO training_records (id, project_id, employee_name, training_name, status) VALUES ('t1', ?1, 'A', 'T', 'Completed'), ('t2', ?1, 'B', 'T', 'Pending')`).bind(P),
    env.DB.prepare(`INSERT INTO documento_requisitos (documento_id, requisito_id, project_id) VALUES ('d1', 'lgpd:art37', ?)`).bind(P),
  ]);
  await habilitarPrivacy(P, OUTRO);
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'u-cli', email: 'cli@cliente.com', role: 'org_user', client_project_id: P });
});

describe('ponto de partida', () => {
  it('cadastro bate exatamente', async () => {
    expect((await ver()).cadastro).toEqual({
      tratamentos: 2, dpias: 1, documentos_vigentes: 1, evidencias_validas: 1, itens: 1,
      terceiros: 1, encarregado: true, incidentes: 1, treinamentos_concluidos: 1,
    });
  });

  it('cobertura traz lgpd e anpd com o total de requisitos da fonte', async () => {
    const v = await ver();
    for (const fonte of ['lgpd', 'anpd']) {
      const n = (await env.DB.prepare('SELECT count(*) AS n FROM requisitos WHERE fonte_id = ?').bind(fonte).first<{ n: number }>())!.n;
      const f = v.cobertura.find((x) => x.fonte === fonte)!;
      expect(f.total).toBe(n);
      expect(f.cobertos + f.parciais + f.lacunas).toBe(n);
    }
    expect(v.cobertura.find((x) => x.fonte === 'lgpd')!.cobertos).toBeGreaterThanOrEqual(1);
  });

  it('iso_ajudados só inclui mapeamento validado', async () => {
    const A59 = 'iso27001:2022:A.5.9';
    await env.DB.prepare(`DELETE FROM requisito_mapeamentos WHERE de_id = ? AND para_id = 'lgpd:art37'`).bind(A59).run();
    await env.DB.prepare(`INSERT INTO requisito_mapeamentos (de_id, para_id, tipo) VALUES (?, 'lgpd:art37', 'equivalente')`).bind(A59).run();
    expect((await ver()).iso_ajudados.map((x) => x.requisito_id)).not.toContain(A59);
    await env.DB.prepare(`UPDATE requisito_mapeamentos SET estado = 'validado_juridico', validado_por = 'Dra.', validado_em = '2026-10-01' WHERE de_id = ? AND para_id = 'lgpd:art37'`).bind(A59).run();
    const item = (await ver()).iso_ajudados.find((x) => x.requisito_id === A59);
    expect(item?.por).toEqual(['art. 37']);
    expect(item?.referencia).toBe('A.5.9');
  });

  it('funciona em projeto vazio e respeita o acesso por projeto', async () => {
    expect((await ver(OUTRO)).cadastro).toMatchObject({ tratamentos: 0, encarregado: false });
    expect((await chamar(cliente, `/api/v1/projects/${P}/ponto-de-partida`)).status).toBe(200);
    expect((await chamar(cliente, `/api/v1/projects/${OUTRO}/ponto-de-partida`)).status).toBe(403);
  });
});
