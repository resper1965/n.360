import { describe, it, expect, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0090 from '../migrations/0090_ot_requisitos.sql?raw';

// Reconstrói o esquema (DROP + applySchema): numa máquina lenta/carregada passa fácil de 5 s.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const DEZOITO = ['4.1.2', '4.1.3', '4.2.1', '4.2.2', '4.3.1', '4.3.2', '4.3.3', '4.6.1'];

describe('migration 0090: catálogo ONS RO-CB.BR.01 do n.ot', () => {
  it('carrega os 25 itens com os prazos do Anexo 1, códigos únicos, e é repetível sobre o banco sem a tabela', async () => {
    await applySchema();
    await execSql('DROP TABLE IF EXISTS ot_requisitos;');
    await execSql(migration0090);
    await execSql(migration0090);

    const linhas = (await env.DB.prepare(`SELECT codigo, prazo_meses, framework, versao FROM ot_requisitos ORDER BY codigo`).all<{ codigo: string; prazo_meses: number | null; framework: string; versao: string }>()).results;
    expect(linhas).toHaveLength(25);
    expect(new Set(linhas.map((l) => l.codigo)).size).toBe(25);
    expect(new Set(linhas.map((l) => `${l.framework} ${l.versao}`))).toEqual(new Set(['ONS-RO-CB.BR.01 Rev.00']));
    expect(linhas.filter((l) => l.prazo_meses === 18).map((l) => l.codigo).sort()).toEqual(DEZOITO);
    expect(linhas.filter((l) => l.prazo_meses === 27)).toHaveLength(16);
    expect(linhas.filter((l) => l.prazo_meses === null).map((l) => l.codigo)).toEqual(['5.1.1']);

    await expect(env.DB.prepare(`INSERT INTO ot_requisitos (id, framework, codigo, titulo, versao) VALUES ('x', 'ONS-RO-CB.BR.01', '4.1.1', 't', 'Rev.00')`).run()).rejects.toThrow(/UNIQUE/);
    await expect(env.DB.prepare(`INSERT INTO ot_requisitos (id, framework, codigo, titulo, versao, prazo_meses) VALUES ('y', 'F', 'c', 't', 'v', 0)`).run()).rejects.toThrow(/CHECK/);
  });
});
