// Registro completo do incidente (0098): campos novos, áreas, titulares × dados e evidências. Dados fictícios.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';

const P = 'ir-proj';
const OUTRO = 'ir-outro';
const B = `/api/v1/projects/${P}`;
let consultor: Record<string, string>;
let cliente: Record<string, string>;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request(`http://localhost${caminho}`, { method: metodo, headers: { ...h, ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined }), workerEnv());
const json = async <T = any>(r: Response) => (await r.json()) as T;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('ir-cons', 'cons-ir@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness'), ('ir-cli', 'cli-ir@cliente.com', 'x', 'Cli', 'org_user', ?, 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ir', ?, 'Cons', 'cons-ir@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('ir-d1', ?1, 'TI'), ('ir-d2', ?1, 'Comercial'), ('ir-d-o', ?2, 'Alheia')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO catalogo_itens (id, project_id, tipo, nome, sensivel) VALUES ('ir-t1', ?1, 'titular', 'Clientes', 0), ('ir-dd1', ?1, 'dado', 'E-mail', 0), ('ir-dd2', ?1, 'dado', 'Saúde', 1), ('ir-t-o', ?2, 'titular', 'Alheio', 0)`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  await concederModulos('ir-cli', ['privacy']);
  consultor = await sessionFor({ id: 'ir-cons', email: 'cons-ir@ness.lat', role: 'consultor' });
  cliente = await sessionFor({ id: 'ir-cli', email: 'cli-ir@cliente.com', role: 'org_user', client_project_id: P });
});

const novo = async () => (await json<{ id: string }>(await chamar(consultor, 'POST', `${B}/incidentes`, { titulo: 'Incidente exemplo', ciencia_em: new Date(Date.now() - 3_600_000).toISOString() }))).id;
const ler = async (id: string) => json(await chamar(consultor, 'GET', `${B}/incidentes/${id}`));

describe('registro completo do incidente', () => {
  it('grava os campos, as áreas e os titulares × dados de uma vez; a leitura devolve as listas e os nomes', async () => {
    const id = await novo();
    const r = await chamar(consultor, 'PUT', `${B}/incidentes/${id}`, {
      origem_alerta: 'Alerta do SOC', severidade: 'alta', tipo: 'vazamento', comprometimento: ['confidencialidade', 'integridade'],
      titulares_estimados: 120, criterios_risco: ['sensiveis', 'larga_escala'], ocorrido_em: '2026-10-01', fim_em: '2026-10-02',
      areas: ['ir-d1', 'ir-d2'], dados: [{ titular_id: 'ir-t1', dado_id: 'ir-dd1' }, { titular_id: 'ir-t1', dado_id: 'ir-dd2' }],
    });
    expect(r.status).toBe(200);
    const i = await ler(id);
    expect(i).toMatchObject({ origem_alerta: 'Alerta do SOC', severidade: 'alta', tipo: 'vazamento', comprometimento: ['confidencialidade', 'integridade'],
      titulares_estimados: 120, criterios_risco: ['sensiveis', 'larga_escala'], fim_em: '2026-10-02' });
    expect(i.areas.map((a: any) => a.nome)).toEqual(['Comercial', 'TI']);
    expect(i.dados).toEqual([
      { titular_id: 'ir-t1', titular: 'Clientes', dado_id: 'ir-dd1', dado: 'E-mail', sensivel: 0 },
      { titular_id: 'ir-t1', titular: 'Clientes', dado_id: 'ir-dd2', dado: 'Saúde', sensivel: 1 },
    ]);
    // Listas enviadas substituem; ausentes mantêm.
    expect((await chamar(consultor, 'PUT', `${B}/incidentes/${id}`, { areas: ['ir-d1'] })).status).toBe(200);
    const j = await ler(id);
    expect(j.areas.map((a: any) => a.id)).toEqual(['ir-d1']);
    expect(j.dados).toHaveLength(2);
    const trilha = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'incidente.alterado' AND details LIKE ? ORDER BY rowid`).bind(`%${i.protocolo}%`).all<{ details: string }>();
    expect(trilha.results[0].details).toContain('severidade');
    expect(trilha.results[0].details).toContain('areas, dados');
    expect(JSON.stringify(trilha.results)).not.toContain('Alerta do SOC');
  });

  it('recusa: lista fora do catálogo, "nenhum" com outro critério, fim antes da ocorrência, área ou dado de outro projeto, titular no lugar de dado', async () => {
    const id = await novo();
    for (const corpo of [{ severidade: 'gravissima' }, { tipo: 'meteoro' }, { comprometimento: ['autenticidade'] }, { criterios_risco: ['nenhum', 'sensiveis'] },
      { titulares_estimados: -1 }, { ocorrido_em: '2026-10-05', fim_em: '2026-10-01' }, { areas: ['ir-d-o'] }, { dados: [{ titular_id: 'ir-t-o', dado_id: 'ir-dd1' }] },
      { dados: [{ titular_id: 'ir-dd1', dado_id: 'ir-t1' }] }, { areas: ['ir-d1', 'ir-d1'] }]) {
      expect((await chamar(consultor, 'PUT', `${B}/incidentes/${id}`, corpo)).status, JSON.stringify(corpo)).toBe(400);
    }
    // O gatilho do banco é a segunda trava (SQL direto).
    await expect(env.DB.prepare(`INSERT INTO incidente_departamentos (incidente_id, departamento_id, project_id) VALUES (?, 'ir-d-o', ?)`).bind(id, P).run()).rejects.toThrow(/outro projeto/);
  });

  it('evidências: anexa PDF, lista, baixa e remove; arquivo que não é PDF/DOC é 400; encerrado não muda; cliente só lê', async () => {
    const id = await novo();
    const envia = (h: Record<string, string>, bytes: Uint8Array, nome: string) => {
      const fd = new FormData(); fd.append('file', new File([bytes], nome));
      return app.fetch(new Request(`http://localhost${B}/incidentes/${id}/anexos`, { method: 'POST', headers: h, body: fd }), workerEnv());
    };
    expect((await envia(consultor, new Uint8Array([1, 2, 3, 4]), 'falso.pdf')).status).toBe(400);
    expect((await envia(cliente, PDF, 'laudo.pdf')).status).toBe(403);
    const r = await envia(consultor, PDF, 'laudo.pdf');
    expect(r.status).toBe(201);
    const { id: anexo } = await json(r);
    const lista = await json(await chamar(consultor, 'GET', `${B}/incidentes/${id}/anexos`));
    expect(lista.anexos.map((a: any) => [a.file_name, a.file_type])).toEqual([['laudo.pdf', 'pdf']]);
    expect((await chamar(cliente, 'GET', `${B}/incidentes/${id}/anexos`)).status).toBe(200);
    const baixa = await chamar(consultor, 'GET', `${B}/incidentes/${id}/anexos/${anexo}`);
    expect(baixa.status).toBe(200);
    expect(new Uint8Array(await baixa.arrayBuffer())).toEqual(PDF);
    expect((await chamar(consultor, 'DELETE', `${B}/incidentes/${id}/anexos/${anexo}`)).status).toBe(200);
    expect((await json(await chamar(consultor, 'GET', `${B}/incidentes/${id}/anexos`))).anexos).toEqual([]);
    await chamar(consultor, 'PUT', `${B}/incidentes/${id}/risco`, { risco_titular: 'sem_risco' });
    await chamar(consultor, 'POST', `${B}/incidentes/${id}/encerrar`);
    expect((await envia(consultor, PDF, 'depois.pdf')).status).toBe(409);
    expect((await chamar(consultor, 'PUT', `${B}/incidentes/${id}`, { severidade: 'baixa' })).status).toBe(409);
  });

  it('isolamento: incidente de outro projeto é 404 nos anexos e na edição', async () => {
    await env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em) VALUES ('ir-i-o', ?, 'IN-2026-0099', 'Alheio', '2026-10-01')`).bind(OUTRO).run();
    expect((await chamar(consultor, 'GET', `${B}/incidentes/ir-i-o/anexos`)).status).toBe(404);
    expect((await chamar(consultor, 'PUT', `${B}/incidentes/ir-i-o`, { severidade: 'alta' })).status).toBe(404);
  });
});
