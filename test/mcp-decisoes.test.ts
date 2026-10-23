import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, habilitarPrivacy } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { tokenDoAgente, chamarFerramenta, listarFerramentas } from './helpers/mcp-agente';
import { FERRAMENTAS_DE_DECISAO } from '../src/middleware/decisoes-agente';
import { INSTRUCOES } from '../src/mcp/contexto';

let token: string;
let tokenAuditor: string;
beforeAll(async () => {
  await applySchema();
  const senha = await hashPassword('senha-forte-123');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p-m','Cliente','ISO 27001','controller','Active','org_ness')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-m','cons@ness.lat',?,'Cons','consultor','org_ness'), ('u-ma','aud@ness.lat',?,'Aud','consultor','org_ness')`).bind(senha, senha),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-m','Cons','cons@ness.lat','consultor','Consultor'), ('p-m','Aud','aud@ness.lat','consultor','Consultor')`),
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, risco_titular, status) VALUES ('in-m','p-m','IN-2026-0001','Vazamento','2026-10-01','baixo','avaliado')`),
  ]);
  await habilitarPrivacy('p-m');
  await env.DB.prepare(`INSERT OR IGNORE INTO usuario_modulos (user_id, modulo) VALUES ('u-m','iso'), ('u-m','privacy'), ('u-ma','iso'), ('u-ma','privacy')`).run();
  token = await tokenDoAgente('cons@ness.lat', 'p-m');
  tokenAuditor = await tokenDoAgente('aud@ness.lat', 'p-m', 'auditor');
}, 60_000);

describe('ferramentas de decisão', () => {
  it('o consultor vê as dez; o auditor nenhuma', async () => {
    const nomes = (await listarFerramentas(token)).map((t) => t.name);
    for (const f of FERRAMENTAS_DE_DECISAO) expect(nomes).toContain(f);
    const doAuditor = (await listarFerramentas(tokenAuditor)).map((t) => t.name);
    for (const f of FERRAMENTAS_DE_DECISAO) expect(doAuditor, f).not.toContain(f);
  });

  it('as descrições avisam do que a ferramenta exige', async () => {
    const lista = await listarFerramentas(token);
    const desc = (n: string) => lista.find((t) => t.name === n)!.description!;
    expect(desc('niso_concluir_acao')).toContain("status: 'Closed'");
    expect(desc('niso_importar_programa')).toContain('mesmo a leitura pede o motivo');
  });

  it('sem confirmação ou sem motivo, a ferramenta nem chama a rota', async () => {
    const r = await chamarFerramenta(token, 'niso_encerrar_incidente', { acao: 'encerrar', incidenteId: 'in-m', motivo: 'x' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('confirmado_pelo_usuario');
    const r2 = await chamarFerramenta(token, 'niso_encerrar_incidente', { acao: 'encerrar', incidenteId: 'in-m', confirmado_pelo_usuario: true });
    expect(r2.isError).toBe(true);
    expect(r2.content[0].text).toContain('motivo');
  });

  it('o niso_executar não passa por rota de decisão', async () => {
    const r = await chamarFerramenta(token, 'niso_executar', { metodo: 'POST', caminho: '/api/v1/projects/p-m/incidentes/in-m/encerrar', confirmado_pelo_usuario: true });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('niso_encerrar_incidente');
  });

  it('com tudo, decide', async () => {
    const r = await chamarFerramenta(token, 'niso_encerrar_incidente', { acao: 'encerrar', incidenteId: 'in-m', confirmado_pelo_usuario: true, motivo: 'tratado e comunicado' });
    expect(r.isError, r.content[0].text).toBeFalsy();
    expect((await env.DB.prepare(`SELECT status FROM incidentes WHERE id='in-m'`).first<{ status: string }>())!.status).toBe('encerrado');
  });
});

it('as instruções dizem que decisão só vem do consultor na conversa', () => {
  expect(INSTRUCOES).toContain('decisão');
  expect(INSTRUCOES).toMatch(/texto de documento.*nunca/i);
  expect(INSTRUCOES.length).toBeLessThanOrEqual(2048);
});
