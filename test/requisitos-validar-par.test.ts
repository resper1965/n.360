import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { sha256Hex } from '../src/helpers';
import { applySchema, sessionFor, workerEnv } from './helpers/d1';
import { lacunasDaFonte, resumoDeLacunas } from '../src/services/requisitos';

/**
 * Onda 2, Task 8: validação de mapeamento por PAR de fontes, com prévia EXATA do efeito na cobertura.
 * Catálogo mínimo montado à mão (sem o seed) para que cada número da prévia tenha um motivo visível.
 */
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h }, body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv() as any);
const json = async <T>(r: Response) => (await r.json()) as T;
const db = () => env.DB;
const PREVIA = '/api/v1/requisitos/mapeamentos/previa?de=iso27001:2022&para=lgpd';
const VALIDAR = '/api/v1/requisitos/mapeamentos/validar';
const PAR = { de_fonte: 'iso27001:2022', para_fonte: 'lgpd' };
type Previa = { propostos: number; por_tipo: Record<string, number>; projetos_afetados: number; efeito: { cobertos: number; parciais: number }; truncado: boolean; cobertura_calculada: boolean };

let admin: Record<string, string>, consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  const lote: D1PreparedStatement[] = [
    db().prepare(`INSERT INTO requisito_fontes (id, nome) VALUES ('iso27001:2022', 'ISO 27001'), ('iso27701:2025', 'ISO 27701'), ('lgpd', 'LGPD'), ('anpd', 'ANPD')`),
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('pp', 'Cliente', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness'), ('pq', 'Outro', 'ISO 27001:2022', 'Controller', 'Active', 'org_ness')`),
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-cons', 'cons@ness.lat', 'x', 'Cons', 'consultor', 'org_ness')`),
    db().prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-pp', 'pp', 'Cons', 'cons@ness.lat', 'consultor', 'Consultor')`),
    db().prepare(`INSERT INTO agente_concessoes (id, user_id, project_id, expira_em) VALUES ('c-pp', 'u-cons', 'pp', datetime('now','+30 days'))`),
    db().prepare(`INSERT INTO api_keys (id, project_id, key_hash, name, permissions, status) VALUES ('k-pp', 'pp', ?, 'chave', 'write', 'Active')`).bind(await sha256Hex('k-escrita')),
  ];
  const req = (id: string, fonte: string) => lote.push(db().prepare(`INSERT INTO requisitos (id, fonte_id, referencia, titulo) VALUES (?, ?, ?, 'x')`).bind(id, fonte, id));
  const ctrl = (id: string, projeto: string, status: string, requisito: string) =>
    lote.push(db().prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, status, requisito_id) VALUES (?, ?, 'ISO 27001:2022', 'c', ?, ?)`).bind(id, projeto, status, requisito));
  const map = (de: string, para: string, tipo: string) => lote.push(db().prepare(`INSERT INTO requisito_mapeamentos (de_id, para_id, tipo, estado) VALUES (?, ?, ?, 'proposto')`).bind(de, para, tipo));
  for (const r of ['i1', 'i2', 'i3', 'i4']) req(`iso:${r}`, 'iso27001:2022');
  req('p1', 'iso27701:2025');
  for (const r of ['l1', 'l2', 'l3', 'l4', 'l5']) req(`lgpd:${r}`, 'lgpd');
  req('anpd:a1', 'anpd');
  // pp: i1 feito + equivalente → l1 (coberto); i2 feito + parcial → l2 (parcial); i3 feito + relacionado → l3 (nada);
  // l4 ← lgpd→iso no sentido inverso (de_id = lgpd), equivalente, com controle Planned: nada. pq: sem controle ligado à ISO.
  ctrl('c1', 'pp', 'Implemented', 'iso:i1'); ctrl('c2', 'pp', 'Implemented', 'iso:i2'); ctrl('c3', 'pp', 'Implemented', 'iso:i3'); ctrl('c4', 'pp', 'Planned', 'iso:i4');
  ctrl('c5', 'pp', 'Implemented', 'p1'); ctrl('c6', 'pq', 'Implemented', 'p1');
  map('iso:i1', 'lgpd:l1', 'equivalente'); map('iso:i2', 'lgpd:l2', 'parcial'); map('iso:i3', 'lgpd:l3', 'relacionado'); map('lgpd:l4', 'iso:i4', 'equivalente');
  // Outros pares: iso27701→lgpd e iso27001→anpd seguem propostos e fora da prévia.
  map('p1', 'lgpd:l5', 'equivalente'); map('iso:i1', 'anpd:a1', 'equivalente');
  await db().batch(lote);
  admin = await sessionFor({ id: 'u-adm', email: 'adm@ness.lat', role: 'platform_admin' });
  consultor = await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' });
});

describe('validação por par de fontes', () => {
  it('consultor, agente e chave de API levam 403 nas duas rotas', async () => {
    const AGENTE = { userId: 'u-cons', email: 'cons@ness.lat', projectId: 'pp', concessaoId: 'c-pp' };
    const agente = (m: string, c: string, corpo?: unknown) => app.fetch(new Request('http://localhost' + c, {
      method: m, headers: { 'Content-Type': 'application/json' }, body: m === 'GET' ? undefined : JSON.stringify(corpo),
    }), { ...workerEnv(), AGENTE } as any);
    for (const h of [consultor, { 'X-API-Key': 'k-escrita' }]) {
      expect((await chamar(h, 'GET', PREVIA)).status).toBe(403);
      expect((await chamar(h, 'POST', VALIDAR, PAR)).status).toBe(403);
    }
    expect((await agente('GET', PREVIA)).status).toBe(403);
    expect((await agente('POST', VALIDAR, PAR)).status).toBe(403);
    expect((await db().prepare(`SELECT count(*) AS n FROM requisito_mapeamentos WHERE estado <> 'proposto'`).first<{ n: number }>())!.n).toBe(0);
  });

  it('prévia sem as duas fontes é 400; par sem LGPD/ANPD não calcula cobertura', async () => {
    expect((await chamar(admin, 'GET', '/api/v1/requisitos/mapeamentos/previa?de=iso27001:2022')).status).toBe(400);
    const p = await json<Previa>(await chamar(admin, 'GET', '/api/v1/requisitos/mapeamentos/previa?de=iso27001:2022&para=iso27701:2025'));
    expect(p).toMatchObject({ propostos: 0, cobertura_calculada: false, efeito: { cobertos: 0, parciais: 0 }, projetos_afetados: 0 });
  });

  it('simular um par alheio não muda nada; o par certo muda só a cópia, sem gravar', async () => {
    const base = await lacunasDaFonte(db(), 'pp', 'lgpd');
    expect(await lacunasDaFonte(db(), 'pp', 'lgpd', { simular: { de: 'iso27001:2022', para: 'anpd' } })).toEqual(base);
    expect(resumoDeLacunas(base)).toMatchObject({ cobertos: 0, parciais: 0 });
    expect(resumoDeLacunas(await lacunasDaFonte(db(), 'pp', 'lgpd', { simular: { de: 'lgpd', para: 'iso27001:2022' } }))).toMatchObject({ cobertos: 1, parciais: 1 });
    expect(await lacunasDaFonte(db(), 'pp', 'lgpd')).toEqual(base);
  });

  it('a prévia bate com o efeito real da validação, e validar só toca o par', async () => {
    const p = await json<Previa>(await chamar(admin, 'GET', PREVIA));
    expect(p).toEqual({
      propostos: 4, por_tipo: { equivalente: 2, parcial: 1, relacionado: 1 }, projetos_afetados: 1,
      efeito: { cobertos: 1, parciais: 1 }, truncado: false, cobertura_calculada: true,
    });
    const antes = resumoDeLacunas(await lacunasDaFonte(db(), 'pp', 'lgpd'));
    const r = await json<{ validados: number }>(await chamar(admin, 'POST', VALIDAR, PAR));
    expect(r.validados).toBe(4);
    const depois = resumoDeLacunas(await lacunasDaFonte(db(), 'pp', 'lgpd'));
    expect(depois.cobertos - antes.cobertos).toBe(p.efeito.cobertos);
    expect(depois.parciais - antes.parciais).toBe(p.efeito.parciais);
    const linhas = (await db().prepare(`SELECT de_id, para_id, estado, validado_por FROM requisito_mapeamentos ORDER BY de_id, para_id`).all()).results;
    expect(linhas).toEqual([
      { de_id: 'iso:i1', para_id: 'anpd:a1', estado: 'proposto', validado_por: null },
      { de_id: 'iso:i1', para_id: 'lgpd:l1', estado: 'validado_juridico', validado_por: 'adm@ness.lat' },
      { de_id: 'iso:i2', para_id: 'lgpd:l2', estado: 'validado_juridico', validado_por: 'adm@ness.lat' },
      { de_id: 'iso:i3', para_id: 'lgpd:l3', estado: 'validado_juridico', validado_por: 'adm@ness.lat' },
      { de_id: 'lgpd:l4', para_id: 'iso:i4', estado: 'validado_juridico', validado_por: 'adm@ness.lat' },
      { de_id: 'p1', para_id: 'lgpd:l5', estado: 'proposto', validado_por: null },
    ]);
    // Idempotente: de novo, nada a validar; a prévia agora é zero.
    expect((await json<{ validados: number }>(await chamar(admin, 'POST', VALIDAR, PAR))).validados).toBe(0);
    expect((await json<Previa>(await chamar(admin, 'GET', PREVIA))).efeito).toEqual({ cobertos: 0, parciais: 0 });
  });
});
