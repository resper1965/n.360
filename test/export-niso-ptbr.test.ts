import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, designarConsultor, inserirAtivo } from './helpers/d1';

/** CSV do n.iso no formato que abre no Excel em pt-BR (spec 3C, C1): BOM, `;`, CRLF, cabeçalho e valores em português. */
const P = 'exn-proj';
const chamar = (h: Record<string, string>, caminho: string, metodo = 'GET', corpo?: unknown) => app.fetch(new Request('http://localhost' + caminho, {
  method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
}), workerEnv());
let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, vulnerability, impact, probability, risk_level, treatment, owner, status)
                    VALUES ('exn-r', ?, 'Servidor', 'Vazamento', 'Senha fraca', 4, 4, 'High', 'Mitigate', 'Ana', 'Open')`).bind(P),
    env.DB.prepare(`INSERT INTO training_records (id, project_id, employee_name, training_name, status, score, completion_date)
                    VALUES ('exn-t', ?, 'Bia', 'LGPD básica', 'Completed', 9, '2026-10-01')`).bind(P),
    env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, details, project_id) VALUES ('exn-a', 'risk.created', 'cons@ness.lat', 'Risco criado', ?)`).bind(P),
  ]);
  await inserirAtivo({ id: 'exn-at', project_id: P, name: 'Notebook', category: 'Hardware', classification: 'Confidential' });
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
  expect((await chamar(consultor, `/api/v1/projects/${P}/vendors`, 'POST', { name: 'Nuvem Exemplo', has_iso27001: 1 })).status).toBe(201);
});

const baixar = async (tipo: string) => {
  const r = await chamar(consultor, `/api/v1/projects/${P}/export/${tipo}`);
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toContain('charset=utf-8');
  const texto = await r.text();
  expect(texto.charCodeAt(0)).toBe(0xfeff);
  const linhas = texto.slice(1).split('\r\n');
  expect(linhas.at(-1)).toBe('');
  return linhas;
};

describe('CSV do n.iso em pt-BR', () => {
  it('riscos: cabeçalho em português, nível, tratamento e status traduzidos', async () => {
    const [cab, linha] = await baixar('risks');
    // Nível residual e as três colunas do aceite do risco residual (migration 0120): sem aceite, "Aceite pendente".
    expect(cab).toBe('"Ativo";"Ameaça";"Vulnerabilidade";"Impacto";"Probabilidade";"Nível";"Tratamento";"Nível residual";"Responsável";"Status";"Aceite do risco residual";"Aceito por";"Aceito em (UTC)"');
    expect(linha).toBe('"Servidor";"Vazamento";"Senha fraca";"4";"4";"Alto";"Mitigar";"";"Ana";"Aberto";"Aceite pendente";"";""');
  });

  it('fornecedores: Sim/Não e o nível de diligência traduzido', async () => {
    const [cab, linha] = await baixar('vendors');
    expect(cab).toBe('"Nome";"Categoria";"Índice de confiança";"Nível de diligência";"ISO 27001";"SOC 2";"DPA"');
    expect(linha).toMatch(/^"Nuvem Exemplo";"";"\d+";"(Baixo|Médio|Alto)";"Sim";"Não";"Não"$/);
  });

  it('treinamento: status pelo rótulo do treinamento', async () => {
    const [cab, linha] = await baixar('training');
    expect(cab).toBe('"Colaborador";"Treinamento";"Status";"Nota";"Data de conclusão"');
    expect(linha).toBe('"Bia";"LGPD básica";"Concluído";"9";"2026-10-01"');
  });

  it('trilha de auditoria: cabeçalho em português', async () => {
    const [cab, ...linhas] = await baixar('audit-log');
    expect(cab).toBe('"ID";"Ação";"Quem";"Detalhes";"Quando"');
    expect(linhas.some((l) => l.startsWith('"exn-a";"risk.created";"cons@ness.lat";"Risco criado";'))).toBe(true);
  });

  it('ativos: classificação e status traduzidos', async () => {
    const [cab, linha] = await baixar('assets');
    expect(cab).toBe('"Nome";"Categoria";"Classificação";"Responsável";"Local";"Status";"Descrição";"Confidencialidade";"Integridade";"Disponibilidade"');
    expect(linha.startsWith('"Notebook";"Hardware";"Confidencial";')).toBe(true);
    expect(linha).toContain(';"Ativo";');
  });
});
