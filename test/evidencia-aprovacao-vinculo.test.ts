// Tarefa 3: a aprovação de CISO/CEO vale para a EVIDÊNCIA (conteúdo + hash), não para o vínculo com um controle.
// Ligar ou desligar controle não zera a aprovação; mudar o conteúdo (hash novo) zera. A mudança de vínculo vai à trilha.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv } from './helpers/d1';

const P = 'p-aprv';
let cons: Record<string, string>;
const chamar = (metodo: string, caminho: string, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...cons, 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv());
const aprovacao = () => env.DB.prepare(
  `SELECT file_hash, evaluation_status, ciso_approved_by, ciso_approved_at, ceo_approved_by, ceo_approved_at FROM evidence WHERE id = 'ev-ap'`,
).first<Record<string, string | null>>();
const ASSINADA = { file_hash: 'hash-original', evaluation_status: 'conforming', ciso_approved_by: 'Lia Lider', ciso_approved_at: '2026-11-01T10:00:00Z', ceo_approved_by: 'Caio Ceo', ceo_approved_at: '2026-11-02T10:00:00Z' };

beforeAll(async () => { await applySchema(); });

beforeEach(async () => {
  await resetData();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES
      ('c-1', ?1, 'ISO 27001:2022', 'A.5.1 Políticas', 'Implemented'), ('c-2', ?1, 'ISO 27001:2022', 'A.5.2 Papéis', 'Implemented')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO evidence (id, project_id, control_id, file_name, file_type, r2_key, file_hash, uploaded_by, evaluation_status,
        ciso_approved_by, ciso_approved_at, ceo_approved_by, ceo_approved_at)
      VALUES ('ev-ap', ?, 'c-1', 'politica.md', 'text/markdown', 'evidence/p-aprv/politica.md', 'hash-original', 'ana@cliente.com', 'conforming',
        'Lia Lider', '2026-11-01T10:00:00Z', 'Caio Ceo', '2026-11-02T10:00:00Z')`).bind(P),
  ]);
  await env.STORAGE.put('evidence/p-aprv/politica.md', 'texto aprovado');
  cons = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
});

const trilha = (acao: string) => env.DB.prepare(`SELECT details FROM audit_logs WHERE action = ? AND details LIKE '%ev-ap%' ORDER BY rowid DESC`).bind(acao).first<{ details: string }>();

describe('aprovação da evidência e o vínculo com controles', () => {
  it('ligar a outro controle NÃO zera a aprovação; a trilha registra a ligação e a aprovação mantida', async () => {
    const r = await chamar('POST', '/api/v1/evidence/ev-ap/controles', { control_id: 'c-2' });
    expect(r.status, await r.clone().text()).toBe(201);
    expect(await aprovacao()).toEqual(ASSINADA);
    expect((await trilha('evidence.controle_ligado'))!.details).toBe(
      'Evidência ev-ap ligada ao controle c-2. Aprovação mantida: Líder SGSI (Lia Lider) e Direção (Caio Ceo), conteúdo hash-original.');
  });

  it('desligar de um controle NÃO zera a aprovação; a trilha registra o desligamento', async () => {
    await chamar('POST', '/api/v1/evidence/ev-ap/controles', { control_id: 'c-2' });
    const r = await chamar('DELETE', '/api/v1/evidence/ev-ap/controles/c-1');
    expect(r.status, await r.clone().text()).toBe(200);
    expect(await aprovacao()).toEqual(ASSINADA);
    expect((await trilha('evidence.controle_desligado'))!.details).toContain('desligada do controle c-1. Aprovação mantida');
    // Trocar pelo PUT antigo também não zera.
    const put = await chamar('PUT', '/api/v1/evidence/ev-ap', { control_id: 'c-1' });
    expect((await put.json<any>()).approvals_reset).toBe(false);
    expect(await aprovacao()).toEqual(ASSINADA);
  });

  it('conteúdo mudou no meio da ligação: a trilha registra o estado de depois, não a aprovação que caiu', async () => {
    // O batch da ligação roda depois de o conteúdo ter sido trocado (hash novo, assinaturas apagadas), como numa corrida.
    // Dispara só no batch que grava o vínculo (o middleware de autenticação também usa batch, antes da rota ler a evidência).
    let armada = false, usada = false;
    const db = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'prepare') return (sql: string) => { if (sql.includes('INTO evidencia_controles')) armada = true; return alvo.prepare(sql); };
        if (prop === 'batch') {
          return async (stmts: D1PreparedStatement[]) => {
            if (armada && !usada) {
              usada = true;
              await alvo.prepare(`UPDATE evidence SET file_hash = 'hash-novo', ciso_approved_by = NULL, ceo_approved_by = NULL WHERE id = 'ev-ap'`).run();
            }
            return alvo.batch(stmts);
          };
        }
        const v = (alvo as any)[prop];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    const r = await worker.fetch(new Request('http://localhost/api/v1/evidence/ev-ap/controles', {
      method: 'POST', headers: { ...cons, 'Content-Type': 'application/json' }, body: JSON.stringify({ control_id: 'c-2' }),
    }), { ...workerEnv(), DB: db } as any);
    expect(r.status, await r.clone().text()).toBe(201);
    expect((await trilha('evidence.controle_ligado'))!.details).toBe('Evidência ev-ap ligada ao controle c-2.');
  });

  it('mudar o conteúdo (hash novo) ZERA a aprovação', async () => {
    const r = await chamar('PUT', '/api/v1/evidence/ev-ap/content', { content: 'texto alterado depois da aprovação' });
    expect(r.status, await r.clone().text()).toBe(200);
    const depois = await aprovacao();
    expect(depois!.file_hash).not.toBe('hash-original');
    expect(depois).toMatchObject({ evaluation_status: 'pending', ciso_approved_by: null, ciso_approved_at: null, ceo_approved_by: null, ceo_approved_at: null });
    expect((await trilha('evidence.content_updated'))!.details).toContain('assinaturas apagadas de: Líder SGSI (Lia Lider) e Direção (Caio Ceo)');
  });
});
