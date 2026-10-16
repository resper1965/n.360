import { env } from 'cloudflare:test';
import worker from '../../src/index';
import { applySchema, workerEnv, sessionFor, concederModulos, designarConsultor } from './d1';
import { seedPhases } from '../../src/services/project-setup';
import { ENTIDADES, catalogoSchema, type Catalogo } from '../../src/data/passos/tipos';
import catalogoJson from '../../contracts/bancada/catalogo.json';
import type { ContextoProjeto, LinhaProgresso } from '../../src/services/passos/contexto';

export const linha = (o: Partial<LinhaProgresso> = {}): LinhaProgresso => ({
  phase_number: 3, item_id: 'p3_3', is_checked: 0, checked_at: null, evidence_id: null, notes: null, assigned_to: null, due_date: null,
  bloqueio_motivo: null, bloqueio_responsavel: null, bloqueado_em: null, excecao_motivo: null, excecao_por: null, excecao_em: null, ...o,
});
export const ctxVazio = (): ContextoProjeto => ({
  progresso: new Map(), respostas: new Map(), evidencias: new Set(), trilhas: new Set(), pedidos: new Map(), fases: new Map(),
  entidades: Object.fromEntries(ENTIDADES.map((e) => [e, 0])) as ContextoProjeto['entidades'],
});

export interface Sessoes { adm: Record<string, string>; leitura: Record<string, string>; admB: Record<string, string>; cons: Record<string, string> }

/** Dois projetos (com as 41 fases), quatro contas e módulos concedidos. `adm`/`leitura` são do p-a, `admB` do p-b, `cons` é da equipe. */
export async function semearBancada(): Promise<Sessoes> {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status) VALUES ('p-a','Cliente A','ISO 27001','controller','Active'), ('p-b','Cliente B','ISO 27001','controller','Active')`),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-a','a@x.test','x','A','org_admin','p-a'), ('u-ro','ro@x.test','x','RO','org_user','p-a'), ('u-b','b@x.test','x','B','org_admin','p-b'), ('u-cons','cons@ness.lat','x','Cons','consultor',NULL)`),
  ]);
  await seedPhases(env.DB, 'p-a');
  await seedPhases(env.DB, 'p-b');
  await concederModulos(['u-a', 'u-ro', 'u-b', 'u-cons']);
  await designarConsultor('cons@ness.lat', 'p-a', 'p-b'); // consultor só alcança projeto em que consta na governança
  return {
    adm: await sessionFor({ id: 'u-a', email: 'a@x.test', role: 'org_admin', client_project_id: 'p-a' }),
    leitura: await sessionFor({ id: 'u-ro', email: 'ro@x.test', role: 'org_user', client_project_id: 'p-a' }),
    admB: await sessionFor({ id: 'u-b', email: 'b@x.test', role: 'org_admin', client_project_id: 'p-b' }),
    cons: await sessionFor({ id: 'u-cons', email: 'cons@ness.lat', role: 'consultor' }),
  };
}

export const chamar = (metodo: string, caminho: string, headers: Record<string, string>, corpo?: unknown, ambiente: Record<string, unknown> = {}) =>
  worker.fetch(new Request(`http://localhost${caminho}`, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...headers }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }), { ...workerEnv(), ...ambiente } as never);


/** O catálogo do contrato (p3_3, p3_4) mais: `p3_3.pergunta_antiga` (substitui p3_q1) e p2_1 (exige as trilhas executiva e rh). */
export function catalogoDeTeste(): Catalogo {
  const { ok: _ok, ...cru } = catalogoJson as Record<string, unknown>;
  const c = catalogoSchema.parse(cru);
  c.passos[0].campos.push({ id: 'escopo_antigo', rotulo: 'Escopo (pergunta antiga)', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Todo o escritório.', pergunta: 'p3_q1' });
  c.fases.push({ numero: 2, etapa: 1, titulo: 'Entrevistas', clausula: 'Cl 4.1', objetivo: 'Ouvir as áreas.' });
  c.etapas[0].fases.push(2);
  c.passos.push({
    id: 'p2_1', fase: 2, ordem: 1, titulo: 'Fazer as entrevistas', clausula: 'Cl 4.1', porQue: 'O auditor quer ver quem foi ouvido.',
    campos: [{ id: 'resumo', rotulo: 'Resumo', tipo: 'texto', obrigatorio: true, exemplo: 'Cinco áreas ouvidas.' }],
    prova: { descricao: 'Nenhuma.', obrigatoria: false, aceita: 'arquivo' }, ondeVive: [],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Resumo escrito' },
      { tipo: 'entrevistas_concluidas', rotulo: 'Executiva e RH ouvidas', trilhas: ['executiva', 'rh'] },
    ],
  });
  return catalogoSchema.parse(c);
}
