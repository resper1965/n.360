import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, execSql, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { ehDpo } from '../src/services/encarregado-pessoa';
import migration0062 from '../migrations/0062_dpo_encarregado.sql?raw';

/** O DPO da governança do n.iso é o encarregado do n.privacy: a mesma pessoa, um vínculo `encarregado` no projeto. */
const P = 'dp-proj';
const SEM = 'dp-sem';
const MIG = 'dp-mig';
const MIG2 = 'dp-mig2';
const MIG3 = 'dp-mig3';

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());
const json = async <T>(r: Response) => (await r.json()) as T;
let consultor: Record<string, string>;
const vinculos = async (p: string) => (await env.DB.prepare(
  `SELECT pa.nome, pa.email FROM parte_vinculos v JOIN partes pa ON pa.id = v.parte_id WHERE v.project_id = ? AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto'`
).bind(p).all<{ nome: string; email: string | null }>()).results;
const gov = (p: string, corpo: Record<string, unknown>) => chamar(consultor, 'POST', `/api/v1/projects/${p}/governance`, corpo);

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Sem', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Mig', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Mig2', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Mig3', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, SEM, MIG, MIG2, MIG3),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-dp', 'cons@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
  ]);
  await env.DB.batch([P, SEM, MIG].map((p) => env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES (?, ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind('gc-' + p, p)));
  await habilitarPrivacy(P, SEM, MIG, MIG2, MIG3);
  consultor = await sessionFor({ id: 'u-dp', email: 'cons@ness.lat', role: 'consultor' });
});

describe('ehDpo', () => {
  it('reconhece DPO e encarregado(a) no cargo, ou a categoria dpo', () => {
    expect(ehDpo({ job_title: 'DPO' })).toBe(true);
    expect(ehDpo({ job_title: 'Encarregada de Dados' })).toBe(true);
    expect(ehDpo({ role_category: 'dpo', job_title: 'x' })).toBe(true);
    expect(ehDpo({ job_title: 'CISO' })).toBe(false);
    expect(ehDpo({ job_title: 'Diretor de Operações' })).toBe(false);
  });
});

describe('POST /governance', () => {
  it('membro DPO vira parte pessoa (e-mail minúsculo) com vínculo encarregado; repetir não duplica', async () => {
    const corpo = { name: 'Rita Exemplo', email: 'Rita@Cliente.com', role_category: 'executivo', job_title: 'DPO' };
    expect((await gov(P, corpo)).status).toBe(200);
    expect((await gov(P, corpo)).status).toBe(200);
    expect(await vinculos(P)).toEqual([{ nome: 'Rita Exemplo', email: 'rita@cliente.com' }]);
    const n = await env.DB.prepare(`SELECT count(*) AS n FROM partes WHERE project_id = ? AND tipo = 'pessoa'`).bind(P).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });
  it('membro CISO não ganha vínculo', async () => {
    await gov(SEM, { name: 'Caio Exemplo', email: 'caio@cliente.com', role_category: 'tech', job_title: 'CISO' });
    expect(await vinculos(SEM)).toEqual([]);
  });
});

describe('POST /governance: DPO que deixa de ser DPO', () => {
  const montar = async (p: string) => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Troca', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(p).run();
    await env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES (?, ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind('gc-' + p, p).run();
    await habilitarPrivacy(p);
  };
  const dpo = { name: 'Vera Exemplo', email: 'vera@cliente.com', role_category: 'executivo', job_title: 'DPO' };
  const idDe = async (p: string, email: string) => (await env.DB.prepare('SELECT id FROM project_governance WHERE project_id = ? AND email = ?').bind(p, email).first<{ id: string }>())!.id;

  it('DPO que vira CISO perde o vínculo encarregado e a trilha registra', async () => {
    await montar('dp-troca');
    await gov('dp-troca', dpo);
    expect(await vinculos('dp-troca')).toHaveLength(1);
    const id = await idDe('dp-troca', dpo.email);
    expect((await gov('dp-troca', { ...dpo, id, role_category: 'tech', job_title: 'CISO' })).status).toBe(200);
    expect(await vinculos('dp-troca')).toEqual([]);
    const log = await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'governanca.encarregado.removido' AND project_id = 'dp-troca'`).first<{ n: number }>();
    expect(log!.n).toBe(1);
  });
  it('com outro DPO casando a mesma parte, o vínculo fica', async () => {
    await montar('dp-troca2');
    await gov('dp-troca2', dpo);
    await gov('dp-troca2', { ...dpo, name: 'Vera Duplicada' });
    const ids = (await env.DB.prepare('SELECT id FROM project_governance WHERE project_id = ? AND email = ?').bind('dp-troca2', dpo.email).all<{ id: string }>()).results;
    expect(ids).toHaveLength(2);
    expect((await gov('dp-troca2', { ...dpo, id: ids[0].id, role_category: 'tech', job_title: 'CISO' })).status).toBe(200);
    expect(await vinculos('dp-troca2')).toHaveLength(1);
  });
});

describe('DELETE /governance: DPO excluído', () => {
  const dpo = { name: 'Nina Exemplo', email: 'nina@cliente.com', role_category: 'executivo', job_title: 'DPO' };
  const montar = async (p: string) => {
    await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Exclui', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(p).run();
    await env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES (?, ?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind('gc-' + p, p).run();
    await habilitarPrivacy(p);
  };
  const ids = async (p: string) => (await env.DB.prepare('SELECT id FROM project_governance WHERE project_id = ? AND email = ?').bind(p, dpo.email).all<{ id: string }>()).results.map((r) => r.id);
  const apagar = (p: string, id: string) => chamar(consultor, 'DELETE', `/api/v1/projects/${p}/governance/${id}`);

  it('DPO único excluído: o vínculo sai e a trilha registra', async () => {
    await montar('dp-del');
    await gov('dp-del', dpo);
    expect(await vinculos('dp-del')).toHaveLength(1);
    expect((await apagar('dp-del', (await ids('dp-del'))[0])).status).toBe(200);
    expect(await vinculos('dp-del')).toEqual([]);
    const log = await env.DB.prepare(`SELECT count(*) AS n FROM audit_logs WHERE action = 'governanca.encarregado.removido' AND project_id = 'dp-del'`).first<{ n: number }>();
    expect(log!.n).toBe(1);
  });
  it('outro DPO casando a mesma parte: o vínculo fica', async () => {
    await montar('dp-del2');
    await gov('dp-del2', dpo);
    await gov('dp-del2', { ...dpo, name: 'Nina Duplicada' });
    const lista = await ids('dp-del2');
    expect(lista).toHaveLength(2);
    expect((await apagar('dp-del2', lista[0])).status).toBe(200);
    expect(await vinculos('dp-del2')).toHaveLength(1);
  });
});

describe('visão do encarregado', () => {
  it('devolve os encarregados do projeto', async () => {
    const v = await json<{ encarregados: { nome: string }[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${P}/encarregado`));
    expect(v.encarregados).toEqual([expect.objectContaining({ nome: 'Rita Exemplo' })]);
  });
  it('sem encarregado: prioridade alta "Nenhum encarregado indicado"', async () => {
    const v = await json<{ encarregados: unknown[]; prioridades: { nivel: string; texto: string }[] }>(await chamar(consultor, 'GET', `/api/v1/projects/${SEM}/encarregado`));
    expect(v.encarregados).toEqual([]);
    expect(v.prioridades).toContainEqual(expect.objectContaining({ nivel: 'alta', texto: expect.stringContaining('Nenhum encarregado indicado') }));
  });
});

describe('migration 0062', () => {
  it('cria parte e vínculo do DPO que já existia, e aplicada duas vezes não duplica', async () => {
    await env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('gm1', ?, ' Dora Exemplo ', 'Dora@Cliente.com', 'executivo', 'Encarregada de Dados'), ('gm2', ?, 'Caio Exemplo', NULL, 'tech', 'CISO')`).bind(MIG, MIG).run();
    await execSql(migration0062);
    await execSql(migration0062);
    expect(await vinculos(MIG)).toEqual([{ nome: 'Dora Exemplo', email: 'dora@cliente.com' }]);
    const n = await env.DB.prepare(`SELECT count(*) AS n FROM partes WHERE project_id = ?`).bind(MIG).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });
});

describe('migration 0062: casos de borda', () => {
  const dpo = (id: string, p: string, nome: string, email: string | null) =>
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES (?, ?, ?, ?, 'executivo', 'DPO')`).bind(id, p, nome, email);
  const partes = async (p: string) => (await env.DB.prepare(`SELECT nome FROM partes WHERE project_id = ? ORDER BY nome`).bind(p).all<{ nome: string }>()).results.map((r) => r.nome);

  it('governança de projeto que não existe mais não aborta a migration', async () => {
    // Sem a FK de project_id (CTAS não leva constraint): o jeito de ter o órfão que produção pode ter.
    await execSql(`CREATE TABLE pg_sem_fk AS SELECT * FROM project_governance; DROP TABLE project_governance; ALTER TABLE pg_sem_fk RENAME TO project_governance;`);
    await env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('go1', 'dp-orfao', 'Ana Exemplo', 'ana@cliente.com', 'executivo', 'DPO')`).run();
    await execSql(migration0062);
    expect((await env.DB.prepare(`SELECT count(*) AS n FROM partes WHERE project_id = 'dp-orfao'`).first<{ n: number }>())!.n).toBe(0);
  });

  it('dois membros DPO iguais no mesmo projeto: uma parte e um vínculo', async () => {
    await env.DB.batch([dpo('gd1', MIG2, 'Eva Exemplo', 'eva@cliente.com'), dpo('gd2', MIG2, ' eva  exemplo', 'EVA@cliente.com'), dpo('gd3', MIG2, 'Eva Exemplo', null)]);
    await execSql(migration0062);
    expect(await partes(MIG2)).toEqual(['Eva Exemplo']);
    expect(await vinculos(MIG2)).toHaveLength(1);
  });

  it('e-mail casa uma parte e o nome outra: só a do e-mail ganha o vínculo', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('pm-a', ?, 'pessoa', 'Outro Nome', 'ivo@cliente.com'), ('pm-b', ?, 'pessoa', 'Ivo Exemplo', 'outro@cliente.com')`).bind(MIG3, MIG3),
      dpo('gi1', MIG3, 'Ivo Exemplo', 'ivo@cliente.com'),
    ]);
    await execSql(migration0062);
    expect(await vinculos(MIG3)).toEqual([{ nome: 'Outro Nome', email: 'ivo@cliente.com' }]);
  });
});

describe('POST /governance com falha do vínculo', () => {
  it('o membro fica salvo e a resposta é a de sucesso', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const DB = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'prepare') return (sql: string) => { if (/INSERT INTO partes/.test(sql)) throw new Error('D1_ERROR: indisponível'); return alvo.prepare(sql); };
        const v = (alvo as any)[prop];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    const res = await app.fetch(new Request(`http://localhost/api/v1/projects/${SEM}/governance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...consultor },
      body: JSON.stringify({ name: 'Lia Exemplo', email: 'lia@cliente.com', role_category: 'executivo', job_title: 'DPO' }),
    }), { ...workerEnv(), DB } as any);
    expect(res.status).toBe(200);
    const n = await env.DB.prepare(`SELECT count(*) AS n FROM project_governance WHERE project_id = ? AND name = 'Lia Exemplo'`).bind(SEM).first<{ n: number }>();
    expect(n!.n).toBe(1);
  });
});
