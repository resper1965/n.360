import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import schemaSql from '../schema.sql?raw';
import { applySchema } from './helpers/d1';
import { perdasPorReconstrucao, colunasAdicionadas, EXCECOES_R2, type Migracao } from './helpers/migrations-lint';

const arquivos = import.meta.glob('../migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const MIGRACOES: Migracao[] = Object.entries(arquivos).map(([k, sql]) => ({ nome: k.split('/').pop()!, sql }));

// Regra R1: migration que refaz tabela (DROP + RENAME) recria os gatilhos e índices que o schema.sql define sobre ela.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS t (id TEXT PRIMARY KEY, a TEXT);
CREATE INDEX IF NOT EXISTS idx_t_a ON t(a);
CREATE TRIGGER IF NOT EXISTS t_trg BEFORE INSERT ON t
WHEN NEW.a IS NULL
BEGIN
    SELECT RAISE(ABORT, 'a obrigatorio');
END;
`;
const REFAZ_T = `
CREATE TABLE t_nova (id TEXT PRIMARY KEY, a TEXT, b TEXT);
INSERT INTO t_nova (id, a) SELECT id, a FROM t;
DROP TABLE t;
ALTER TABLE t_nova RENAME TO t;
`;

describe('R1: tabela refeita por migration recria gatilho e índice (lint puro)', () => {
  it('migration que refaz a tabela e não recria o gatilho nem o índice: acusa os dois', () => {
    const perdas = perdasPorReconstrucao([{ nome: '0001_refaz.sql', sql: REFAZ_T }], SCHEMA);
    expect(perdas).toHaveLength(2);
    expect(perdas.join('\n')).toContain('0001_refaz.sql');
    expect(perdas.join('\n')).toContain('gatilho t_trg');
    expect(perdas.join('\n')).toContain('indice idx_t_a');
  });

  it('migration posterior que recria o gatilho e o índice: nada a acusar', () => {
    const migs: Migracao[] = [
      { nome: '0001_refaz.sql', sql: REFAZ_T },
      { nome: '0002_devolve.sql', sql: `CREATE INDEX IF NOT EXISTS idx_t_a ON t(a);\nCREATE TRIGGER IF NOT EXISTS t_trg BEFORE INSERT ON t\nWHEN NEW.a IS NULL\nBEGIN\n  SELECT RAISE(ABORT, 'x');\nEND;` },
    ];
    expect(perdasPorReconstrucao(migs, SCHEMA)).toEqual([]);
  });

  it('recriar na própria migration que refaz também vale', () => {
    const sql = `${REFAZ_T}\nCREATE INDEX idx_t_a ON t(a);\nCREATE TRIGGER t_trg BEFORE INSERT ON t\nBEGIN\n  SELECT 1;\nEND;`;
    expect(perdasPorReconstrucao([{ nome: '0001_refaz.sql', sql }], SCHEMA)).toEqual([]);
  });

  it('recriar só em migration ANTERIOR não basta (o DROP posterior leva o objeto)', () => {
    const migs: Migracao[] = [
      { nome: '0001_cria.sql', sql: `CREATE INDEX idx_t_a ON t(a);\nCREATE TRIGGER t_trg BEFORE INSERT ON t\nBEGIN\n  SELECT 1;\nEND;` },
      { nome: '0002_refaz.sql', sql: REFAZ_T },
    ];
    expect(perdasPorReconstrucao(migs, SCHEMA)).toHaveLength(2);
  });

  it('migration que não refaz tabela (só ADD COLUMN ou índice novo) não é acusada; comentário não conta', () => {
    const sql = `-- DROP TABLE t; ALTER TABLE x RENAME TO t;\nALTER TABLE t ADD COLUMN c TEXT;\nCREATE INDEX idx_novo ON t(c);`;
    expect(perdasPorReconstrucao([{ nome: '0001_soma.sql', sql }], SCHEMA)).toEqual([]);
  });

  it('tabela refeita sem objeto no schema: nada a acusar', () => {
    const sql = `CREATE TABLE u_nova (id TEXT);\nDROP TABLE u;\nALTER TABLE u_nova RENAME TO u;`;
    expect(perdasPorReconstrucao([{ nome: '0001_u.sql', sql }], SCHEMA)).toEqual([]);
  });
});

describe('migrations do repositório x schema.sql', () => {
  it('R1: nenhuma migration que refaz tabela deixa de recriar o gatilho ou o índice do schema.sql', () => {
    expect(perdasPorReconstrucao(MIGRACOES, schemaSql)).toEqual([]);
  });

  it('R2: toda coluna criada por ADD COLUMN existe no schema.sql (tabela aposentada só com motivo em EXCECOES_R2)', async () => {
    await applySchema();
    const cache = new Map<string, Set<string>>();
    const colunas = async (t: string) => {
      if (!cache.has(t)) cache.set(t, new Set(((await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results as { name: string }[]).map((r) => r.name.toLowerCase())));
      return cache.get(t)!;
    };
    const faltas: string[] = [];
    for (const c of colunasAdicionadas(MIGRACOES)) {
      if (EXCECOES_R2[c.tabela]) continue;
      if (!(await colunas(c.tabela)).has(c.coluna)) {
        faltas.push(`${c.migracao}: ${c.tabela}.${c.coluna} não está no schema.sql (o schema muda em dois lugares: schema.sql e a migration)`);
      }
    }
    expect(faltas).toEqual([]);
  });

  it('as exceções de R2 têm motivo escrito', () => {
    for (const [tabela, motivo] of Object.entries(EXCECOES_R2)) expect(motivo.length, tabela).toBeGreaterThan(15);
  });
});
