import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { diaMaisSP } from '../src/services/hoje';
import { applySchema, resetData, sessionFor, workerEnv, concederModulos } from './helpers/d1';

/** Frente 4, 4.3: o Painel do n.iso mostra fornecedor com avaliação vencida e pedidos esperando decisão; a lista de fornecedores traz a situação. */
const db = () => env.DB;
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);

type Item = { grupo: string; tela: string; filtro?: string; texto: string };
type PainelIso = { modulos: { iso: { fazer?: Item[]; selos: { fornecedores: { pendentes: number; vencidos: number }; pedidos: { abertos: number }; capa: { abertas: number; vencidas: number }; evidencias: { em_analise: number; ruins: number } } } } };

let equipe: Record<string, string>, cliente: Record<string, string>;

beforeEach(async () => {
  await applySchema();
  await resetData();
  await db().batch([
    db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('pi', 'Só ISO', 'ISO 27001', 'Controller', 'Active', 'org_ness')`),
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-eq', 'eq@ness.lat', 'x', 'Eq', 'consultor', NULL, 'org_ness'),
      ('u-cl', 'cl@cliente.com', 'x', 'Cl', 'org_user', 'pi', 'org_ness')`),
    db().prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g1', 'pi', 'Eq', 'eq@ness.lat', 'consultor', 'C')`),
    db().prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('f1', 'pi', 'organizacao', 'Nuvem Vencida'), ('f2', 'pi', 'organizacao', 'Nunca Avaliada')`),
    db().prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('v1', 'pi', 'f1', 'terceiro', 'projeto', 'pi'), ('v2', 'pi', 'f2', 'terceiro', 'projeto', 'pi')`),
    db().prepare(`INSERT INTO avaliacoes_terceiro (id, project_id, parte_id, metodo, resultado, valido_ate) VALUES ('av1', 'pi', 'f1', 'questionario', 'aprovado', ?)`).bind(diaMaisSP(-1)),
    db().prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, papel_exigido, conteudo_json, hash, criado_por) VALUES
      ('pd1', 'org_ness', 'pi', 'tratamento', 'r1', 'Aprovar', 'ciso', '{}', 'h', 'eq@ness.lat')`),
    db().prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, user_id) VALUES ('d1', 'pd1', 'cl@cliente.com', 'u-cl'), ('d2', 'pd1', 'outro@cliente.com', NULL)`),
  ]);
  await concederModulos(['u-eq', 'u-cl'], ['iso']);
  equipe = await sessionFor({ id: 'u-eq', email: 'eq@ness.lat', role: 'consultor', org_id: 'org_ness' });
  cliente = await sessionFor({ id: 'u-cl', email: 'cl@cliente.com', role: 'org_user', client_project_id: 'pi', org_id: 'org_ness' });
});

describe('Painel do n.iso: ligações da Frente 4', () => {
  it('equipe: fornecedor vencido (atraso), pedidos esperando (semana) e selos', async () => {
    const corpo = (await (await chamar(equipe, '/api/v1/projects/pi/painel?modulo=iso')).json()) as PainelIso;
    const fazer = corpo.modulos.iso.fazer!;
    expect(fazer.find((i) => i.tela === 'vendors')).toMatchObject({ grupo: 'atraso', filtro: 'vencidos', texto: '1 fornecedor com avaliação vencida' });
    expect(fazer.find((i) => i.tela === 'meus-pedidos')).toMatchObject({ grupo: 'semana', texto: '1 pedido esperando decisão' });
    expect(corpo.modulos.iso.selos.fornecedores).toEqual({ pendentes: 1, vencidos: 1 });
    expect(corpo.modulos.iso.selos.pedidos.abertos).toBe(1);
  });
  it('cliente: o item de pedidos não aparece', async () => {
    const corpo = (await (await chamar(cliente, '/api/v1/projects/pi/painel?modulo=iso')).json()) as PainelIso;
    expect(corpo.modulos.iso.selos.pedidos.abertos).toBe(0);
    expect(corpo.modulos.iso.selos.fornecedores.vencidos).toBe(1);
  });
  it('a lista de fornecedores traz a situação', async () => {
    const r = (await (await chamar(equipe, '/api/v1/projects/pi/vendors')).json()) as { vendors: { name: string; situacao: string }[] };
    expect(Object.fromEntries(r.vendors.map((v) => [v.name, v.situacao]))).toEqual({ 'Nuvem Vencida': 'vencida', 'Nunca Avaliada': 'pendente' });
  });
});
