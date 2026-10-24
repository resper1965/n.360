import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { contextoDaPolitica } from '../src/services/contexto-politica';

const P = 'p-ctx';
const R15 = 'iso27001:2022:A.5.15';
const R18 = 'iso27001:2022:A.5.18';

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, scope, sector, org_role, status, org_id) VALUES (?, 'Cliente Ctx', 'ISO 27001', 'Plataforma web', 'Varejo', 'controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO projeto_modulos (project_id, modulo) VALUES (?, 'iso')`).bind(P),
    env.DB.prepare(`INSERT INTO empresas (project_id, setor, porte) VALUES (?, 'Comércio', 'Médio')`).bind(P),
    env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome, versao) VALUES ('iso27001:2022', 'ISO/IEC 27001', '2022')`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES (?, 'iso27001:2022', 'A.5.15', 'Controle de acesso'), (?, 'iso27001:2022', 'A.5.18', 'Direitos de acesso')`).bind(R15, R18),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description, requisito_id) VALUES
      ('ctx-15', ?, 'ISO 27001', 'A.5.15 Controle de acesso', 'Implemented', 'A empresa não tem CISO; a responsabilidade é do CIO', ?),
      ('ctx-18', ?, 'ISO 27001', 'A.5.18 Direitos de acesso', 'In Progress', NULL, ?)`).bind(P, R15, P, R18),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'Fulana Teste', 'fulana@exemplo.test', 'ciso', 'CIO')`).bind(P),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'Consultora Ness', 'c@ness.test', 'consultor', 'Consultora')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, description, requisito_id) VALUES ('ctx-20', ?, 'ISO 27001', 'A.5.20 Nota longa', 'Planned', ?, ?)`).bind(P, 'linha um\n\n' + 'x'.repeat(600) + '\nfim', R15),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome) VALUES ('ctx-it', ?, 'ERP Fictício')`).bind(P),
    env.DB.prepare(`INSERT INTO item_seguranca (item_id, project_id, classificacao) VALUES ('ctx-it', ?, 'Confidencial')`).bind(P),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, risk_level, control_id) VALUES ('ctx-rk', ?, 'ERP', 'Acesso indevido', 'High', 'ctx-15')`).bind(P),
    env.DB.prepare(`INSERT INTO documentos (id, project_id, tipo, titulo, status) VALUES ('doc-psi', ?, 'politica', 'POL-PSI-001 Segurança da Informação', 'vigente')`).bind(P),
    env.DB.prepare(`INSERT INTO documento_versoes (id, project_id, documento_id, numero, texto, hash, estado) VALUES ('dv-psi', ?, 'doc-psi', 1, ?, 'h', 'vigente')`).bind(P, '# PSI\n\nPrincípios.'),
    env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, descricao, recebido_em) VALUES ('ctx-tp', ?, 'PT-2026-0001', 'acesso', 'CPF 123', '2026-10-01')`).bind(P),
  ]);
});

describe('contexto da política', () => {
  it('junta o cadastro em blocos e não leva dado de titular', async () => {
    const t = await contextoDaPolitica(env.DB, P, [R15, R18], 'doc-novo');
    expect(t).toContain('Escopo do SGSI: Plataforma web');
    expect(t).toContain('A.5.15');
    expect(t).toContain('A empresa não tem CISO; a responsabilidade é do CIO');
    expect(t).toContain('CIO');
    expect(t).toContain('Confidencial');
    expect(t).toContain('Acesso indevido');
    expect(t).toContain('Princípios.');
    expect(t).not.toContain('CPF 123');
    expect(t).not.toMatch(/@/);
  });
  it('nota longa vira uma linha de até 400 caracteres; consultor fora; atividade e funcionários aparecem', async () => {
    const t = await contextoDaPolitica(env.DB, P, [R15], 'doc-novo');
    const l = t.split('\n').find((x) => x.startsWith('- A.5.20'))!;
    expect(l).toContain('linha um xxx');
    expect(l.split(' | ')[2].length).toBeLessThanOrEqual(400);
    expect(t).not.toContain('Consultora Ness');
    expect(t).toContain('Atividade: não informada');
    expect(t).toContain('Funcionários: não informado');
  });
  it('a própria PSI não entra como contexto dela mesma', async () => {
    expect(await contextoDaPolitica(env.DB, P, [], 'doc-psi')).not.toContain('Princípios.');
  });
});
