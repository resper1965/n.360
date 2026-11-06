// CSV das Solicitações (pedidos do titular) e hora de Brasília nas exportações. Dados fictícios.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { dataHoraBr } from '../src/services/exportacao';

const P = 'ept-proj';
const OUTRO = 'ept-outro';
const B = `/api/v1/projects/${P}`;
let ana: Record<string, string>;
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request(`http://localhost${caminho}`, { headers: h }), workerEnv());

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('ept-a', 'ana-ept@ness.lat', 'x', 'Ana', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-ept', ?, 'Ana', 'ana-ept@ness.lat', 'consultor', 'Consultora')`).bind(P),
    env.DB.prepare(`INSERT INTO titular_pedidos (id, project_id, protocolo, tipo, canal, titular_nome, titular_contato, descricao, recebido_em, status) VALUES
      ('ept-1', ?1, 'PT-2026-0001', 'acesso', 'formulario', 'Titular Sigiloso', 'sigiloso@exemplo.invalid', 'Descrição sigilosa', '2026-10-01 10:00:00', 'recebido'),
      ('ept-2', ?1, 'PT-2026-0002', 'correcao', 'email', 'Outro Sigiloso', NULL, NULL, '2026-10-02', 'em_andamento'),
      ('ept-o', ?2, 'PT-2026-0001', 'acesso', 'email', 'Alheio', NULL, NULL, '2026-10-01', 'recebido')`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  ana = await sessionFor({ id: 'ept-a', email: 'ana-ept@ness.lat', role: 'consultor' });
});

describe('CSV das Solicitações', () => {
  it('protocolo e andamento em pt-BR, hora de Brasília, sem dado do titular, só do projeto; filtra por tipo e status', async () => {
    const r = await chamar(ana, `${B}/export/pedidos-titular`);
    expect(r.status).toBe(200);
    const csv = await r.text();
    const linhas = csv.split('\r\n');
    expect(linhas[0]).toBe('﻿"Protocolo";"Tipo";"Canal";"Recebido em";"Prazo";"Situação do prazo";"Status";"Respondido em"');
    expect(csv).toContain('"PT-2026-0001";"Acesso aos dados";"Formulário";"01/10/2026 07:00"');
    expect(csv).toContain('"PT-2026-0002";"Correção";"E-mail";"02/10/2026"');
    expect(csv).not.toMatch(/Sigiloso|sigilos|Alheio/);
    expect(linhas.filter((l) => l.startsWith('"PT-'))).toHaveLength(2);
    const so = await (await chamar(ana, `${B}/export/pedidos-titular?tipo=correcao&status=em_andamento`)).text();
    expect(so).toContain('PT-2026-0002');
    expect(so).not.toContain('PT-2026-0001');
    expect((await chamar(ana, `${B}/export/pedidos-titular?tipo=inventado`)).status).toBe(400);
    expect((await chamar(ana, `${B}/export/pedidos-titular?status=inventado`)).status).toBe(400);
    const t = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'exportacao.csv' AND project_id = ? ORDER BY rowid DESC LIMIT 1`).bind(P).first<any>();
    expect(t.details).toMatch(/^Exportação CSV de solicitações do titular: \d+ linhas/);
  });

  it('dataHoraBr: SQLite e ISO sem fuso são UTC, ISO com fuso respeita o fuso, data pura fica como está', () => {
    expect(dataHoraBr('2026-10-01 10:00:00')).toBe('01/10/2026 07:00');
    expect(dataHoraBr('2026-10-01T10:00:00Z')).toBe('01/10/2026 07:00');
    expect(dataHoraBr('2026-10-01T10:00:00-03:00')).toBe('01/10/2026 10:00');
    expect(dataHoraBr('2026-10-01 01:30:00')).toBe('30/09/2026 22:30');
    expect(dataHoraBr('2026-10-01')).toBe('01/10/2026');
    expect(dataHoraBr(null)).toBe('');
  });
});
