import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema } from './helpers/d1';
import migration0079 from '../migrations/0079_ropa_abas.sql?raw';
import { aprovacoesDoProjeto } from '../src/services/documentos';

/** 0079: RoPA em abas. Aditiva: o registro de antes sobrevive igual e a aprovação com hash continua valendo. */
const colunas = async (t: string) => (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((c) => c.name);
const tabela = async (t: string) => !!(await env.DB.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).bind(t).first());

const NOVAS_ROPA = ['nome', 'descricao_atividade', 'volume_mensal', 'processamento_automatizado', 'papel_controlador', 'papel_operador', 'previsao_legal',
  'base_legal_finalidade', 'base_art11_na', 'gaps_nao_aplicavel', 'etapas_materializadas_em', 'reaberta_em'];
const TABELAS = ['catalogo_itens', 'tratamento_etapa_itens', 'tratamento_interno_areas', 'tratamento_externo_parceiros', 'tratamento_etapa_titulares',
  'tratamento_etapa_dados', 'tratamento_medidas', 'tratamento_bases_gdpr', 'acao_anexos'];

async function banco_de_antes() {
  await applySchema();
  // Desfaz só o que a 0079 cria, para simular o banco da 0078. Índice e gatilhos primeiro; depois tabelas filhas; depois as colunas.
  await execSql(`
    DROP INDEX IF EXISTS idx_risks_ropa_idr;
    DROP TABLE IF EXISTS incidente_dados; -- da 0098: aponta para catalogo_itens, que a 0079 cria
    ${TABELAS.slice().reverse().map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n')}
    ${NOVAS_ROPA.map((c) => `ALTER TABLE ropa_records DROP COLUMN ${c};`).join('\n')}
    ALTER TABLE tratamento_ciclo DROP COLUMN origem; ALTER TABLE tratamento_ciclo DROP COLUMN solicita_consentimento;
    ALTER TABLE tratamento_ciclo DROP COLUMN descricao_etapa; ALTER TABLE tratamento_ciclo DROP COLUMN descarte; ALTER TABLE tratamento_ciclo DROP COLUMN migrado;
    ALTER TABLE tratamento_bases DROP COLUMN finalidade;
    ALTER TABLE corrective_actions DROP COLUMN recomendacao;
    ALTER TABLE risks DROP COLUMN idr; ALTER TABLE risks DROP COLUMN treatment_due_date;`);
}

describe('migration 0079 — RoPA em abas', () => {
  it('sobre o banco de antes: preserva o registro, acrescenta colunas nulas e cria as tabelas', async () => {
    await banco_de_antes();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m79', 'Cliente exemplo', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, data_subjects, data_categories, legal_basis, status) VALUES ('m79-r', 'm79', 'Folha exemplo', 'Titular exemplo A, Titular exemplo B', 'Dado exemplo 1; Dado exemplo 2', 'Execução de contrato', 'Draft')`),
    ]);
    const antes = await env.DB.prepare(`SELECT * FROM ropa_records WHERE id = 'm79-r'`).first<Record<string, unknown>>();
    // Um tratamento com pedido de aprovação aprovado ANTES da migration (o conteúdo congelado são 16 chaves, nenhuma é coluna nova).
    const { aprovarTratamentoDeTeste } = await import('./helpers/ropa-abas');
    const ref = await aprovarTratamentoDeTeste(env.DB, 'm79c');
    const aprovadoAntes = (await aprovacoesDoProjeto(env.DB, 'm79c', undefined, 'tratamento')).get(ref);
    expect(aprovadoAntes?.ciso).toBeTruthy();
    await execSql(migration0079);
    const depois = await env.DB.prepare(`SELECT * FROM ropa_records WHERE id = 'm79-r'`).first<Record<string, unknown>>();
    expect(depois).toEqual({ ...antes, ...Object.fromEntries(NOVAS_ROPA.map((c) => [c, null])) });
    // A aprovação de antes continua valendo depois da migration: o hash do conteúdo atual é o mesmo.
    expect((await aprovacoesDoProjeto(env.DB, 'm79c', undefined, 'tratamento')).get(ref)?.ciso).toEqual(aprovadoAntes?.ciso);
    for (const t of TABELAS) expect(await tabela(t), t).toBe(true);
    expect(await colunas('tratamento_ciclo')).toEqual(expect.arrayContaining(['origem', 'solicita_consentimento', 'descricao_etapa', 'descarte', 'migrado']));
    expect(await colunas('tratamento_bases')).toContain('finalidade');
    expect(await colunas('corrective_actions')).toContain('recomendacao');
    expect(await colunas('risks')).toEqual(expect.arrayContaining(['idr', 'treatment_due_date']));
    await applySchema(); // convive com o schema canônico
  }, 30_000);

  it('o IDR dos riscos que já tinham atividade sai em sequência, por criação, e risco sem atividade fica sem IDR', async () => {
    await banco_de_antes();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('m79b', 'Cliente exemplo', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('m79b-r', 'm79b', 'Atividade exemplo'), ('m79b-s', 'm79b', 'Outra exemplo')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, ropa_id, asset, threat, created_at) VALUES
        ('k3', 'm79b', 'm79b-r', 'a', 'terceiro', '2026-03-03 10:00:00'), ('k1', 'm79b', 'm79b-r', 'a', 'primeiro', '2026-03-01 10:00:00'),
        ('k2', 'm79b', 'm79b-r', 'a', 'segundo', '2026-03-02 10:00:00'), ('s1', 'm79b', 'm79b-s', 'a', 'x', '2026-03-05 10:00:00'),
        ('iso', 'm79b', NULL, 'a', 'so iso', '2026-03-01 10:00:00')`),
    ]);
    await execSql(migration0079);
    const idr = Object.fromEntries((await env.DB.prepare(`SELECT id, idr FROM risks WHERE project_id = 'm79b'`).all<{ id: string; idr: number | null }>()).results.map((r) => [r.id, r.idr]));
    expect(idr).toEqual({ k1: 1, k2: 2, k3: 3, s1: 1, iso: null });
    await expect(env.DB.prepare(`INSERT INTO risks (id, project_id, ropa_id, asset, threat, idr) VALUES ('dup', 'm79b', 'm79b-r', 'a', 'x', 2)`).run()).rejects.toThrow();
    await applySchema();
  }, 30_000);

  it('os gatilhos de tenant recusam item, área, parte, titular, dado, base do GDPR, medida e anexo de outro projeto, inclusive em SQL direto', async () => {
    await applySchema();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('t1', 'A', 'LGPD', 'Controller', 'Active'), ('t2', 'B', 'LGPD', 'Controller', 'Active')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('t1-r', 't1', 'Atividade exemplo')`),
      env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('t2-i', 't2', 'Item de outro', 'sistema')`),
      env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('t2-d', 't2', 'Área de outro')`),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('t2-p', 't2', 'organizacao', 'Parceiro de outro')`),
      env.DB.prepare(`INSERT INTO catalogo_itens (id, project_id, tipo, nome) VALUES ('t2-c', 't2', 'titular', 'Titular de outro'), ('t2-d', 't2', 'dado', 'Dado de outro')`),
      env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title) VALUES ('t2-a', 't2', 'Ação de outro')`),
    ]);
    const recusa = (sql: string) => expect(env.DB.prepare(sql).run()).rejects.toThrow(/outro projeto/);
    await recusa(`INSERT INTO tratamento_etapa_itens (ropa_id, etapa, item_id, project_id) VALUES ('t1-r', 'coleta', 't2-i', 't1')`);
    await recusa(`INSERT INTO tratamento_interno_areas (ropa_id, departamento_id, project_id) VALUES ('t1-r', 't2-d', 't1')`);
    await recusa(`INSERT INTO tratamento_externo_parceiros (ropa_id, parte_id, project_id) VALUES ('t1-r', 't2-p', 't1')`);
    await recusa(`INSERT INTO tratamento_etapa_titulares (ropa_id, etapa, titular_id, situacao, project_id) VALUES ('t1-r', 'coleta', 't2-c', 'definido', 't1')`);
    await recusa(`INSERT INTO tratamento_etapa_dados (ropa_id, etapa, titular_id, dado_id, project_id) VALUES ('t1-r', 'coleta', 't2-c', 't2-d', 't1')`);
    await recusa(`INSERT INTO tratamento_bases_gdpr (ropa_id, base, finalidade, project_id) VALUES ('t1-r', 'contrato', 'Finalidade exemplo', 't2')`);
    await recusa(`INSERT INTO acao_anexos (id, project_id, acao_id, file_name, r2_key, file_hash, file_type, file_size, uploaded_by) VALUES ('an', 't1', 't2-a', 'a.pdf', 'k', 'h', 'pdf', 10, 'u')`);
    await recusa(`INSERT INTO tratamento_medidas (id, project_id, ropa_id, medida, status) VALUES ('m', 't2', 't1-r', 'Medida exemplo', 'ativa')`);
  }, 30_000);
});
