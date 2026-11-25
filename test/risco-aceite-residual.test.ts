// Aceite do risco residual (ISO/IEC 27001, 6.1.3 e; migration 0120): quem tem a alçada aceita, com senha, um risco por vez; o aceite
// congela o estado do risco e cai sozinho quando o residual, a estratégia ou o controle mudam; só quem aceitou revoga, com motivo.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../src/index';
import { applySchema, resetData, sessionFor, workerEnv } from './helpers/d1';
import { hashPassword } from '../src/helpers';

const P = 'p-aceite';
const SENHA = 'Senha-forte-123!';
let ceo: Record<string, string>, lider: Record<string, string>, cons: Record<string, string>, admin: Record<string, string>, leitor: Record<string, string>;

const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  worker.fetch(new Request('http://localhost' + caminho, { method: metodo, headers: { ...h, 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }), workerEnv());
const lista = async (h: Record<string, string>) => (await (await chamar(h, 'GET', `/api/v1/projects/${P}/risks`)).json<any>()).risks as any[];
const doRisco = async (h: Record<string, string>, id: string) => (await lista(h)).find((r) => r.id === id);
const aceitar = async (h: Record<string, string>, id: string, extra: Record<string, unknown> = {}) => {
  const hash = (await doRisco(h, id))?.aceite?.hash ?? '0'.repeat(64);
  return chamar(h, 'POST', `/api/v1/risks/${id}/aceite`, { senha: SENHA, hash_visto: hash, ...extra });
};
const risco = (id: string) => env.DB.prepare('SELECT status, accepted_by, accepted_at FROM risks WHERE id = ?').bind(id).first<any>();
const aceites = (id: string) => env.DB.prepare('SELECT * FROM risco_aceites WHERE risk_id = ? ORDER BY aceito_em').bind(id).all<any>().then((r) => r.results);
const trilha = (acao: string, id: string) => env.DB.prepare(`SELECT actor, details, justification FROM audit_logs WHERE action = ? AND details LIKE ? ORDER BY rowid DESC`).bind(acao, `%${id}%`).first<any>();

beforeAll(async () => { await applySchema(); });

beforeEach(async () => {
  await resetData();
  const h = await hashPassword(SENHA);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status) VALUES ('c-1', ?1, 'ISO 27001:2022', 'A.8.13 Backup', 'Implemented'), ('c-2', ?1, 'ISO 27001:2022', 'A.8.14 Redundância', 'Implemented')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES
      ('u-ceo', 'ceo@cliente.com', ?1, 'Carla Ceo', 'org_user', ?2, 'org_ness'),
      ('u-lider', 'lider@cliente.com', ?1, 'Lia Lider', 'org_user', ?2, 'org_ness'),
      ('u-adm', 'adm@cliente.com', ?1, 'Ada Admin', 'org_admin', ?2, 'org_ness'),
      ('u-leitor', 'leitor@cliente.com', ?1, 'Leo Leitor', 'org_user', ?2, 'org_ness'),
      ('u-cons', 'cons@ness.lat', ?1, 'Cons', 'consultor', NULL, 'org_ness')`).bind(h, P),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES
      (?1, 'Carla Ceo', 'ceo@cliente.com', 'cliente', 'CEO'),
      (?1, 'Lia Lider', 'lider@cliente.com', 'cliente', 'Líder do SGSI'),
      (?1, 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, impact, probability, risk_level, treatment, treatment_plan, control_id, status,
        residual_impact, residual_probability, residual_level) VALUES
      ('rk-1', ?1, 'Servidor de arquivos', 'Ransomware', 5, 4, 'High', 'Mitigate', 'Backup diário', 'c-1', 'Mitigated', 2, 2, 'Low'),
      ('rk-2', ?1, 'ERP', 'Indisponibilidade', 4, 4, 'High', 'Mitigate', 'Redundância', 'c-2', 'Open', 3, 4, 'Medium'),
      ('rk-sem', ?1, 'Notebook', 'Furto', 3, 3, 'Medium', 'Mitigate', NULL, NULL, 'Open', NULL, NULL, NULL)`).bind(P),
  ]);
  ceo = await sessionFor({ id: 'u-ceo', email: 'ceo@cliente.com', name: 'Carla Ceo', role: 'org_user', client_project_id: P });
  lider = await sessionFor({ id: 'u-lider', email: 'lider@cliente.com', name: 'Lia Lider', role: 'org_user', client_project_id: P });
  admin = await sessionFor({ id: 'u-adm', email: 'adm@cliente.com', name: 'Ada Admin', role: 'org_admin', client_project_id: P });
  leitor = await sessionFor({ id: 'u-leitor', email: 'leitor@cliente.com', name: 'Leo Leitor', role: 'org_user', client_project_id: P });
  cons = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
});

describe('aceite direto, com senha', () => {
  it('o CEO aceita com senha; a lista mostra quem e quando; a prova congela o estado', async () => {
    expect((await doRisco(ceo, 'rk-1')).aceite).toMatchObject({ situacao: 'pendente', pode_aceitar: true, alcada: 'ceo' });
    const r = await aceitar(ceo, 'rk-1', { justificativa: 'Residual baixo com backup testado' });
    expect(r.status, await r.clone().text()).toBe(200);

    const linha = await doRisco(cons, 'rk-1');
    expect(linha.status).toBe('Accepted');
    expect(linha.aceite).toMatchObject({ situacao: 'aceito', por: 'Carla Ceo', com_senha: true, papel: 'ceo', pode_aceitar: false });
    expect(linha.aceite.em).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/);

    const [prova] = await aceites('rk-1');
    expect(prova).toMatchObject({
      aceito_por: 'ceo@cliente.com', aceito_nome: 'Carla Ceo', papel: 'ceo', nivel_residual: 'Low', estrategia: 'Mitigate',
      controles_json: '["c-1"]', justificativa: 'Residual baixo com backup testado', status_anterior: 'Mitigated', situacao: 'vigente', pedido_id: null,
    });
    expect(JSON.parse(prova.conteudo_json)).toMatchObject({ nivel_residual: 'Low', estrategia: 'Mitigate', controle: 'A.8.13 Backup', plano: 'Backup diário' });
    expect(prova.hash).toMatch(/^[0-9a-f]{64}$/);
    expect((await trilha('risk.aceite_residual', 'rk-1')).justification).toBe('Residual baixo com backup testado');
  });

  it('senha errada é 401 e não grava; conteúdo diferente do visto é 409', async () => {
    expect((await aceitar(ceo, 'rk-1', { senha: 'errada' })).status).toBe(401);
    expect((await aceitar(ceo, 'rk-1', { hash_visto: 'a'.repeat(64) })).status).toBe(409);
    expect((await risco('rk-1')).status).toBe('Mitigated');
    expect(await aceites('rk-1')).toEqual([]);
  });

  it('sem a alçada: não vê o botão (pode_aceitar false) e a API devolve 403', async () => {
    for (const h of [lider, leitor, cons, admin]) {
      expect((await doRisco(h, 'rk-1')).aceite.pode_aceitar).toBe(false);
      expect((await aceitar(h, 'rk-1')).status).toBe(403);
    }
    expect((await risco('rk-1')).status).toBe('Mitigated');
  });

  it('sem residual avaliado não há aceite', async () => {
    expect((await doRisco(ceo, 'rk-sem')).aceite.pode_aceitar).toBe(false);
    const r = await aceitar(ceo, 'rk-sem');
    expect(r.status).toBe(403);
    expect((await r.json<any>()).error).toContain('risco residual');
  });

  it('status Accepted não se grava pelo PUT nem nasce no POST; aceito com senha não sai por status', async () => {
    expect((await chamar(cons, 'PUT', '/api/v1/risks/rk-2', { status: 'Accepted' })).status).toBe(403);
    expect((await chamar(cons, 'POST', `/api/v1/projects/${P}/risks`, { asset: 'X', threat: 'Y', status: 'Accepted' })).status).toBe(403);
    await aceitar(ceo, 'rk-1');
    expect((await chamar(cons, 'PUT', '/api/v1/risks/rk-1', { status: 'Open' })).status).toBe(409);
    expect((await risco('rk-1')).status).toBe('Accepted');
  });
});

describe('o aceite congela o estado do risco', () => {
  const casos: [string, Record<string, unknown>, string][] = [
    ['nível residual', { residual_impact: 4 }, 'impacto_residual'],
    ['estratégia de tratamento', { treatment: 'Transfer' }, 'estrategia'],
    ['controle vinculado', { control_id: 'c-2' }, 'controle'],
  ];
  for (const [o, corpo, campo] of casos) {
    it(`mudar ${o} de um risco aceito o devolve a "aceite pendente"`, async () => {
      await aceitar(ceo, 'rk-1');
      const r = await chamar(cons, 'PUT', '/api/v1/risks/rk-1', corpo);
      expect(r.status, await r.clone().text()).toBe(200);
      const [prova] = await aceites('rk-1');
      expect(prova.situacao).toBe('invalidado');
      expect(prova.motivo).toContain(campo);
      expect(prova.encerrado_por).toBe('cons@ness.lat');
      // Volta ao status de antes do aceite, sem o carimbo.
      expect(await risco('rk-1')).toEqual({ status: 'Mitigated', accepted_by: null, accepted_at: null });
      expect((await doRisco(cons, 'rk-1')).aceite.situacao).toBe('pendente');
      expect((await trilha('risk.aceite_invalidado', 'rk-1')).details).toContain(campo);
    });
  }

  it('editar o que não foi aceito (responsável) mantém o aceite', async () => {
    await aceitar(ceo, 'rk-1');
    expect((await chamar(cons, 'PUT', '/api/v1/risks/rk-1', { owner: 'TI' })).status).toBe(200);
    expect((await aceites('rk-1'))[0].situacao).toBe('vigente');
    expect((await risco('rk-1')).status).toBe('Accepted');
  });

  it('a prova não se reescreve: o banco recusa mudar o que foi aceito ou reabrir um aceite encerrado', async () => {
    await aceitar(ceo, 'rk-1');
    const [prova] = await aceites('rk-1');
    await expect(env.DB.prepare(`UPDATE risco_aceites SET hash = 'x' WHERE id = ?`).bind(prova.id).run()).rejects.toThrow();
    await expect(env.DB.prepare(`UPDATE risco_aceites SET aceito_por = 'outro@x.com' WHERE id = ?`).bind(prova.id).run()).rejects.toThrow();
    await chamar(cons, 'PUT', '/api/v1/risks/rk-1', { residual_impact: 4 });
    await expect(env.DB.prepare(`UPDATE risco_aceites SET situacao = 'vigente' WHERE id = ?`).bind(prova.id).run()).rejects.toThrow();
  });
});

describe('revogação', () => {
  it('só quem aceitou revoga, com motivo; o risco volta ao status anterior e a lista mostra "revogado"', async () => {
    await aceitar(ceo, 'rk-1');
    expect((await doRisco(lider, 'rk-1')).aceite.pode_revogar).toBe(false);
    expect((await chamar(lider, 'POST', '/api/v1/risks/rk-1/aceite/revogar', { motivo: 'Não fui eu que aceitei', senha: SENHA })).status).toBe(403);
    expect((await chamar(ceo, 'POST', '/api/v1/risks/rk-1/aceite/revogar', { senha: SENHA })).status).toBe(400);
    expect((await chamar(ceo, 'POST', '/api/v1/risks/rk-1/aceite/revogar', { motivo: 'Auditoria apontou falha no backup' })).status).toBe(400);
    expect((await chamar(ceo, 'POST', '/api/v1/risks/rk-1/aceite/revogar', { motivo: 'Auditoria apontou falha no backup', senha: 'errada' })).status).toBe(401);
    expect((await risco('rk-1')).status).toBe('Accepted');
    expect((await doRisco(ceo, 'rk-1')).aceite.pode_revogar).toBe(true);
    const r = await chamar(ceo, 'POST', '/api/v1/risks/rk-1/aceite/revogar', { motivo: 'Auditoria apontou falha no backup', senha: SENHA });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await risco('rk-1')).status).toBe('Mitigated');
    const linha = await doRisco(cons, 'rk-1');
    expect(linha.aceite).toMatchObject({ situacao: 'revogado', revogado: { por: 'ceo@cliente.com', motivo: 'Auditoria apontou falha no backup' } });
    expect((await trilha('risk.aceite_revogado', 'rk-1')).justification).toBe('Auditoria apontou falha no backup');
    // A prova fica: risco que já teve aceite não se exclui, pelas duas portas.
    expect((await chamar(cons, 'DELETE', '/api/v1/risks/rk-1')).status).toBe(409);
    expect((await aceites('rk-1'))).toHaveLength(1);
    // Pode ser aceito de novo depois.
    expect((await aceitar(ceo, 'rk-1')).status).toBe(200);
    expect((await aceites('rk-1')).map((a: any) => a.situacao)).toEqual(['revogado', 'vigente']);
  });
});

describe('quem aceitou é a conta, não o e-mail', () => {
  it('o e-mail da conta muda; quem aceitou ainda revoga, e outra conta com o e-mail antigo não', async () => {
    await aceitar(ceo, 'rk-1');
    await env.DB.prepare(`UPDATE users SET email = 'carla@cliente.com' WHERE id = 'u-ceo'`).run();
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) SELECT 'u-outra', 'ceo@cliente.com', password_hash, 'Outra', 'org_user', ?, 'org_ness' FROM users WHERE id = 'u-ceo'`).bind(P).run();
    const outra = await sessionFor({ id: 'u-outra', email: 'ceo@cliente.com', name: 'Outra', role: 'org_user', client_project_id: P });
    expect((await chamar(outra, 'POST', '/api/v1/risks/rk-1/aceite/revogar', { motivo: 'Não fui eu', senha: SENHA })).status).toBe(403);
    const carla = await sessionFor({ id: 'u-ceo', email: 'carla@cliente.com', name: 'Carla Ceo', role: 'org_user', client_project_id: P });
    expect((await chamar(carla, 'POST', '/api/v1/risks/rk-1/aceite/revogar', { motivo: 'Revisão do backup', senha: SENHA })).status).toBe(200);
  });
});

describe('alçada mudada no meio do aceite', () => {
  it('a alçada muda entre a leitura e a gravação (durante a senha): o aceite não grava', async () => {
    const hash = (await doRisco(ceo, 'rk-1')).aceite.hash;
    let armada = false, usada = false;
    const db = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'prepare') return (sql: string) => { if (sql.includes('INSERT INTO risco_aceites')) armada = true; return alvo.prepare(sql); };
        if (prop === 'batch') {
          return async (stmts: D1PreparedStatement[]) => {
            if (armada && !usada) {
              usada = true;
              await alvo.prepare(`INSERT INTO risco_alcadas (project_id, nivel, papel, atualizado_por) VALUES (?, 'Low', 'ciso', 'adm@cliente.com')`).bind(P).run();
            }
            return alvo.batch(stmts);
          };
        }
        const v = (alvo as any)[prop];
        return typeof v === 'function' ? v.bind(alvo) : v;
      },
    });
    const r = await worker.fetch(new Request('http://localhost/api/v1/risks/rk-1/aceite', {
      method: 'POST', headers: { ...ceo, 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: SENHA, hash_visto: hash }),
    }), { ...workerEnv(), DB: db } as any);
    expect(r.status).toBe(409);
    expect(await aceites('rk-1')).toEqual([]);
    expect((await risco('rk-1')).status).toBe('Mitigated');
  });
});

describe('pedido de aceite em "Minhas aprovações"', () => {
  const pedir = (papel = 'ceo', ref = 'rk-1') => chamar(cons, 'POST', `/api/v1/projects/${P}/pedidos`,
    { tipo: 'risco', ref_id: ref, papel_exigido: papel, destinatarios: [{ email: 'ceo@cliente.com' }] });

  it('o consultor pede; o CEO vê, aprova com senha, e o risco fica aceito com a prova ligada ao pedido', async () => {
    const r = await pedir();
    expect(r.status, await r.clone().text()).toBe(201);
    const { id } = await r.json<any>();
    const meus = (await (await chamar(ceo, 'GET', '/api/v1/pedidos')).json<any>()).pedidos;
    expect(meus.map((p: any) => p.id)).toContain(id);
    const aberto = await (await chamar(ceo, 'GET', `/api/v1/pedidos/${id}`)).json<any>();
    expect(aberto.pedido.conteudo).toMatchObject({ nivel_residual: 'Low', estrategia: 'Mitigate', controle: 'A.8.13 Backup' });

    const ap = await chamar(ceo, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
    expect(ap.status, await ap.clone().text()).toBe(200);
    expect((await risco('rk-1')).status).toBe('Accepted');
    const [prova] = await aceites('rk-1');
    expect(prova).toMatchObject({ pedido_id: id, aceito_por: 'ceo@cliente.com', papel: 'ceo', situacao: 'vigente' });
  });

  it('a alçada mudou depois do pedido: o papel antigo não aprova', async () => {
    const { id } = await (await pedir()).json<any>();
    await chamar(admin, 'PUT', `/api/v1/projects/${P}/risco-alcadas`, { alcadas: { Low: 'ciso' } });
    const r = await chamar(ceo, 'POST', `/api/v1/pedidos/${id}/aprovar`, { senha: SENHA });
    expect(r.status).toBe(409);
    expect((await r.json<any>()).error).toContain('alçada');
    expect((await risco('rk-1')).status).toBe('Mitigated');
  });

  it('o papel do pedido é a alçada do nível residual; sem residual não há pedido', async () => {
    const r = await pedir('ciso');
    expect(r.status).toBe(400);
    expect((await r.json<any>()).alcada).toBe('ceo');
    expect((await pedir('ciente')).status).toBe(400);
    // Uma pessoa só: o primeiro "aprovar" fecha o risco, um segundo destinatário ficaria pendente para sempre.
    const dois = await chamar(cons, 'POST', `/api/v1/projects/${P}/pedidos`,
      { tipo: 'risco', ref_id: 'rk-1', papel_exigido: 'ceo', destinatarios: [{ email: 'ceo@cliente.com' }, { email: 'outro@cliente.com' }] });
    expect(dois.status).toBe(400);
    expect((await pedir('ceo', 'rk-sem')).status).toBe(400);
  });

  it('não existe aceite em lote: o lote ignora o pedido de risco', async () => {
    const { id } = await (await pedir()).json<any>();
    // O lote é de quem decide pela fila (o papel stakeholder): o CEO aqui entra como stakeholder.
    await env.DB.prepare(`UPDATE users SET role = 'stakeholder' WHERE id = 'u-ceo'`).run();
    const ceoFila = await sessionFor({ id: 'u-ceo', email: 'ceo@cliente.com', name: 'Carla Ceo', role: 'stakeholder', client_project_id: P });
    const { pedido } = await (await chamar(ceoFila, 'GET', `/api/v1/pedidos/${id}`)).json<any>();
    const resp = await chamar(ceoFila, 'POST', '/api/v1/pedidos/lote', { senha: SENHA, itens: [{ tipo: 'pedido', id, hash_visto: pedido.hash }] });
    const r = await resp.json<any>();
    expect(resp.status, JSON.stringify(r)).toBe(200);
    expect(r.aprovados).toBe(0);
    expect(r.resultados[0]).toMatchObject({ resultado: 'ignorado', motivo: expect.stringContaining('um por vez') });
    expect((await risco('rk-1')).status).toBe('Mitigated');
    // A rota de aceite é de um risco só: corpo com lista é recusado.
    expect((await chamar(ceo, 'POST', '/api/v1/risks/rk-1/aceite', { senha: SENHA, hash_visto: '0'.repeat(64), riscos: ['rk-1', 'rk-2'] })).status).toBe(400);
  });

  it('o residual muda para um nível de outra alçada: o pedido aberto é cancelado, não substituído', async () => {
    await chamar(admin, 'PUT', `/api/v1/projects/${P}/risco-alcadas`, { alcadas: { Medium: 'ciso' } });
    const { id } = await (await pedir()).json<any>();
    await chamar(cons, 'PUT', '/api/v1/risks/rk-1', { residual_impact: 3, residual_probability: 3 });
    const p = await env.DB.prepare('SELECT status, substituido_por FROM pedidos WHERE id = ?').bind(id).first<any>();
    expect(p).toEqual({ status: 'cancelado', substituido_por: null });
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM pedidos WHERE tipo = 'risco' AND ref_id = 'rk-1' AND status = 'aberto'`).first<any>()).n).toBe(0);
  });

  it('o risco muda com o pedido aberto: o pedido é substituído pelo conteúdo novo', async () => {
    const { id } = await (await pedir()).json<any>();
    await chamar(cons, 'PUT', '/api/v1/risks/rk-1', { treatment_plan: 'Backup diário e cópia fora do site' });
    const p = await env.DB.prepare('SELECT status, substituido_por FROM pedidos WHERE id = ?').bind(id).first<any>();
    expect(p.status).toBe('substituido');
    const novo = await env.DB.prepare('SELECT conteudo_json FROM pedidos WHERE id = ?').bind(p.substituido_por).first<any>();
    expect(JSON.parse(novo.conteudo_json).plano).toBe('Backup diário e cópia fora do site');
  });
});

describe('alçada por nível', () => {
  it('o administrador do cliente põe o nível Medium na Liderança do SGSI: a líder aceita, o CEO não', async () => {
    expect((await chamar(cons, 'PUT', `/api/v1/projects/${P}/risco-alcadas`, { alcadas: { Medium: 'ciso' } })).status).toBe(403);
    const r = await chamar(admin, 'PUT', `/api/v1/projects/${P}/risco-alcadas`, { alcadas: { Medium: 'ciso' } });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await r.json<any>()).alcadas).toEqual({ Low: 'ceo', Medium: 'ciso', High: 'ceo', Critical: 'ceo' });
    expect((await doRisco(ceo, 'rk-2')).aceite).toMatchObject({ alcada: 'ciso', pode_aceitar: false });
    expect((await aceitar(ceo, 'rk-2')).status).toBe(403);
    expect((await doRisco(lider, 'rk-2')).aceite.pode_aceitar).toBe(true);
    expect((await aceitar(lider, 'rk-2')).status).toBe(200);
    expect((await aceites('rk-2'))[0].papel).toBe('ciso');
    expect((await trilha('risco.alcada', P))?.details ?? (await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'risco.alcada' ORDER BY rowid DESC`).first<any>()).details).toContain('Medium ceo -> ciso');
  });
});

describe('exportação e pacote de auditoria', () => {
  it('o CSV de riscos e o pacote de auditoria trazem o aceite', async () => {
    await aceitar(ceo, 'rk-1');
    const csv = await (await chamar(cons, 'GET', `/api/v1/projects/${P}/export/risks`)).text();
    expect(csv).toContain('Aceite do risco residual');
    expect(csv).toContain('"Carla Ceo"');
    expect(csv).toContain('"Aceite pendente"');
    const pack = (await (await chamar(cons, 'GET', `/api/v1/projects/${P}/audit-pack`)).json<any>()).pack;
    expect(pack.risks.find((r: any) => r.id === 'rk-1').status).toBe('Accepted');
    expect(pack.risk_acceptances).toHaveLength(1);
    expect(pack.risk_acceptances[0]).toMatchObject({ risk_id: 'rk-1', aceito_nome: 'Carla Ceo', situacao: 'vigente' });
    expect(pack.risk_acceptances[0]).not.toHaveProperty('ip');
  });
});
