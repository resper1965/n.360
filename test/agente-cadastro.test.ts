import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { tokenDoAgente, chamarFerramenta } from './helpers/mcp-agente';
import { SKILLS } from '../src/mcp/skills-gerado';
import { ROTEIROS, MAPA_DA_APP } from '../src/mcp/contexto';

const E = '/api/v1/projects/p-cad/empresa';
/** niso_executar devolve "HTTP <status>" na primeira linha e o JSON da resposta depois. */
const corpo = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text.slice(r.content[0].text.indexOf('\n') + 1));

describe('agente consultor preenche o cadastro do cliente (skill cadastro-cliente)', () => {
  let consultor: string;
  let auditor: string;

  beforeAll(async () => {
    await applySchema();
    const senha = await hashPassword('senha-forte-123');
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-cad','Cliente Fictício','ISO 27001','controller','Active')`),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-cad','cad@ness.lat',?,'Cad','consultor')`).bind(senha),
      env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('u-aud','aud@ness.lat',?,'Aud','consultor')`).bind(senha),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-cad','Cad','cad@ness.lat','consultor','Consultor')`),
      env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES ('p-cad','Aud','aud@ness.lat','consultor','Consultor')`),
    ]);
    consultor = await tokenDoAgente('cad@ness.lat', 'p-cad');
    auditor = await tokenDoAgente('aud@ness.lat', 'p-cad', 'auditor');
  }, 60_000);

  it('a skill e o roteiro existem e o mapa cita a empresa, os vínculos e o CNPJ da organização', () => {
    expect(Object.keys(SKILLS)).toContain('cadastro-cliente');
    expect(ROTEIROS).toContain('cadastro-cliente');
    expect(MAPA_DA_APP).toContain('{p}/empresa');
    expect(MAPA_DA_APP).toContain('/vinculos');
    expect(SKILLS['cadastro-cliente'].arquivos['SKILL.md']).toContain('PEÇA APROVAÇÃO HUMANA');
  });

  it('o agente consultor grava a empresa (só os campos enviados), lê de volta e a trilha leva o agente', async () => {
    const r = await chamarFerramenta(consultor, 'niso_executar', { metodo: 'PUT', caminho: E, corpo: { cnpj: '11.222.333/0001-81', razao_social: 'Empresa Fictícia Ltda', representante_nome: 'Ana Exemplo' } });
    expect(r.isError, r.content[0].text).toBeFalsy();
    const lido = await chamarFerramenta(consultor, 'niso_ler', { caminho: E });
    expect(lido.content[0].text).toContain('11222333000181');
    expect(lido.content[0].text).toContain('Empresa Fictícia Ltda');

    const de = await chamarFerramenta(consultor, 'niso_executar', { metodo: 'PUT', caminho: E, corpo: { setor: 'Serviços' } }); // ausente não mexe
    expect(de.isError, de.content[0].text).toBeFalsy();
    const depois = await env.DB.prepare('SELECT cnpj, razao_social, setor FROM empresas WHERE project_id = ?').bind('p-cad').first<Record<string, string>>();
    expect(depois).toMatchObject({ cnpj: '11222333000181', razao_social: 'Empresa Fictícia Ltda', setor: 'Serviços' });
    const trilha = await env.DB.prepare(`SELECT actor FROM audit_logs WHERE action = 'empresa.atualizada' ORDER BY rowid DESC`).first<{ actor: string }>();
    expect(trilha?.actor).toContain('agente de cad@ness.lat');
  });

  it('CNPJ com dígito errado volta como erro e nada é gravado', async () => {
    const r = await chamarFerramenta(consultor, 'niso_executar', { metodo: 'PUT', caminho: E, corpo: { cnpj: '11.222.333/0001-82' } });
    expect(r.isError).toBe(true);
    expect((await env.DB.prepare('SELECT cnpj FROM empresas WHERE project_id = ?').bind('p-cad').first<{ cnpj: string }>())?.cnpj).toBe('11222333000181');
  });

  it('o agente auditor continua só lendo: o PUT da empresa não passa', async () => {
    const r = await chamarFerramenta(auditor, 'niso_executar', { metodo: 'PUT', caminho: E, corpo: { razao_social: 'Invasora' } });
    expect(r.isError).toBe(true);
    expect((await env.DB.prepare('SELECT razao_social FROM empresas WHERE project_id = ?').bind('p-cad').first<{ razao_social: string }>())?.razao_social).toBe('Empresa Fictícia Ltda');
  });

  it('o agente cria organização com CNPJ e o responsável pelo vínculo do núcleo', async () => {
    const org = await chamarFerramenta(consultor, 'niso_executar', { metodo: 'POST', caminho: '/api/v1/projects/p-cad/partes', corpo: { tipo: 'organizacao', nome: 'Fornecedora Fictícia', cnpj: '45.723.174/0001-10' } });
    expect(org.isError, org.content[0].text).toBeFalsy();
    const pessoa = await chamarFerramenta(consultor, 'niso_executar', { metodo: 'POST', caminho: '/api/v1/projects/p-cad/partes', corpo: { tipo: 'pessoa', nome: 'Beto Exemplo', email: 'beto@exemplo.com' } });
    const orgId = corpo(org).id as string;
    const pessoaId = corpo(pessoa).id as string;
    const v = await chamarFerramenta(consultor, 'niso_executar', { metodo: 'POST', caminho: `/api/v1/projects/p-cad/partes/${pessoaId}/vinculos`, corpo: { papel: 'responsavel', alvo_tipo: 'parte', alvo_id: orgId } });
    expect(v.isError, v.content[0].text).toBeFalsy();
    expect((await env.DB.prepare('SELECT cnpj FROM partes WHERE id = ?').bind(orgId).first<{ cnpj: string }>())?.cnpj).toBe('45723174000110');
    expect(await env.DB.prepare(`SELECT 1 FROM parte_vinculos WHERE parte_id = ? AND papel = 'responsavel' AND alvo_tipo = 'parte' AND alvo_id = ?`).bind(pessoaId, orgId).first()).not.toBeNull();
  });
});
