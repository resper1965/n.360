import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { estadoDasAbas } from '../src/services/ropa-abas/ficha';
import type { DadosAtividade } from '../src/services/ropa-abas/conferencia';
import { ETAPAS } from '../src/schemas/ropa-abas';
import { prepararProjeto, chamar, json, base, novaAtividade, aprovarTratamentoDeTeste, P, type Sessoes } from './helpers/ropa-abas';

/** Dados de uma atividade recém-criada (sistema vazio). */
const vazia: DadosAtividade = {
  id: 'r', nome: null, finalidade: 'Finalidade exemplo', descricao_atividade: null, volume_mensal: null, processamento_automatizado: null, owner_parte_id: null, owner_nome: null,
  papel_controlador: null, papel_operador: null, dados_sensiveis: 0, base_legal_id: null, base_art11_na: null, gaps_nao_aplicavel: null, international_transfers: 0,
  transfer_safeguards: null, legal_basis: null, base_gdpr: null, impacto_finalizado_em: null, base_titulo: null, adicionais: null, lia_status: null,
  art7: 0, art11: 0, gdpr: 0, gdpr_li: 0, medidas: 0, riscos: 0, gaps: 0, gaps_abertos: 0, sem_responsavel: 0, respondidas: 0, logs: 0,
  status: 'Draft', reaberta_em: null, areas_json: null, empresa: null, iso: 0, ultima_aprovacao_por: null, ultima_aprovacao_em: null,
};
const etapas = (n: number) => ETAPAS.map((e, i) => ({ etapa: e, situacao: i < n ? ('concluida' as const) : ('pendente' as const), faltas: [] }));
const aba = (d: Partial<DadosAtividade>, id: keyof ReturnType<typeof estadoDasAbas>, et = etapas(0)) => estadoDasAbas({ ...vazia, ...d }, et)[id];

describe('estadoDasAbas (função pura, a regra de cada aba)', () => {
  it('escopo: feito com finalidade e volume ou descrição; senão pendente', () => {
    expect(aba({}, 'escopo').estado).toBe('pendente');
    expect(aba({ volume_mensal: '100' }, 'escopo').estado).toBe('feito');
    expect(aba({ descricao_atividade: 'Descrição' }, 'escopo').estado).toBe('feito');
    expect(aba({ finalidade: '', volume_mensal: '100' }, 'escopo').estado).toBe('pendente');
  });
  it('tratamento: feito com todas as etapas concluídas ou N/A, nunca na; senão pendente com a contagem', () => {
    expect(aba({}, 'tratamento', etapas(6))).toEqual({ estado: 'feito', resumo: '6 de 6 etapas concluídas.' });
    expect(aba({}, 'tratamento', etapas(3))).toEqual({ estado: 'pendente', resumo: '3 de 6 etapas concluídas.' });
    expect(aba({}, 'tratamento', ETAPAS.map((e) => ({ etapa: e, situacao: 'nao_aplicavel' as const, faltas: [] }))).estado).toBe('feito');
    expect(aba({}, 'tratamento', etapas(0)).estado).toBe('pendente');
  });
  it('agentes: feito com papel informado, senão pendente', () => {
    expect(aba({}, 'agentes').estado).toBe('pendente');
    expect(aba({ papel_controlador: 1 }, 'agentes').estado).toBe('feito');
    expect(aba({ papel_operador: 1 }, 'agentes').estado).toBe('feito');
    expect(aba({ papel_controlador: 0, papel_operador: 0 }, 'agentes').estado).toBe('pendente');
  });
  it('medidas: vazio com zero, feito com 1+', () => {
    expect(aba({}, 'medidas').estado).toBe('vazio');
    expect(aba({ medidas: 1 }, 'medidas')).toEqual({ estado: 'feito', resumo: '1 medida.' });
  });
  it('base jurídica: feito com inciso principal, adicional ou GDPR; pendente com dado sensível sem art. 11 nem N/A; senão vazio', () => {
    expect(aba({}, 'base_juridica').estado).toBe('vazio');
    expect(aba({ base_legal_id: 'lgpd:art7:i', art7: 1 }, 'base_juridica').estado).toBe('feito');
    expect(aba({ art7: 2 }, 'base_juridica').resumo).toBe('2 incisos do art. 7º');
    expect(aba({ gdpr: 1 }, 'base_juridica').estado).toBe('feito');
    expect(aba({ dados_sensiveis: 1, art7: 1 }, 'base_juridica').estado).toBe('pendente');
    expect(aba({ dados_sensiveis: 1, art7: 1, art11: 1 }, 'base_juridica').estado).toBe('feito');
    expect(aba({ dados_sensiveis: 1, art7: 1, base_art11_na: 1 }, 'base_juridica').estado).toBe('feito');
  });
  it('gaps: na quando Não Aplicável; feito com todos fechados; pendente com algum aberto; vazio sem nada', () => {
    expect(aba({ gaps_nao_aplicavel: 1 }, 'gaps').estado).toBe('na');
    expect(aba({}, 'gaps').estado).toBe('vazio');
    expect(aba({ gaps: 2, gaps_abertos: 0 }, 'gaps').estado).toBe('feito');
    expect(aba({ gaps: 2, gaps_abertos: 1 }, 'gaps')).toEqual({ estado: 'pendente', resumo: '2 gaps, 1 aberto.' });
  });
  it('impacto: feito se finalizado, senão pendente com "N de M respondidas"', () => {
    expect(aba({ impacto_finalizado_em: '2026-10-10 10:00:00' }, 'impacto').estado).toBe('feito');
    expect(aba({ respondidas: 4 }, 'impacto').estado).toBe('pendente');
    expect(aba({ respondidas: 4 }, 'impacto').resumo).toMatch(/^4 de \d+ respondidas\.$/);
  });
  it('riscos e logs: feito com 1+, vazio sem', () => {
    expect(aba({}, 'riscos').estado).toBe('vazio');
    expect(aba({ riscos: 3 }, 'riscos')).toEqual({ estado: 'feito', resumo: '3 riscos.' });
    expect(aba({}, 'logs').estado).toBe('vazio');
    expect(aba({ logs: 5 }, 'logs')).toEqual({ estado: 'feito', resumo: '5 registros.' });
  });
});

describe('GET /ficha', () => {
  let s: Sessoes;
  beforeAll(async () => { s = await prepararProjeto(); });
  const ficha = async (rid: string, h = s.consultor) => json<any>(await chamar(h, 'GET', `${base(rid)}/ficha`));

  const mesmasChaves = (real: any, forma: any, caminho = ''): string[] => {
    // valor nulo ou lista na resposta (sistema vazio) não tem filhos para comparar
    if (forma === null || typeof forma !== 'object' || Array.isArray(forma) || real === null || Array.isArray(real)) return [];
    const faltas: string[] = [];
    for (const k of new Set([...Object.keys(real ?? {}), ...Object.keys(forma)])) {
      if (!(k in (real ?? {}))) faltas.push(`${caminho}${k} (falta na resposta)`);
      else if (!(k in forma)) faltas.push(`${caminho}${k} (a mais na resposta)`);
      else faltas.push(...mesmasChaves(real[k], forma[k], `${caminho}${k}.`));
    }
    return faltas;
  };

  it('sistema vazio: a atividade recém-criada responde com a forma exata do contrato', async () => {
    const forma = (await import('../contracts/ropa-abas/ficha.json')).default;
    const rid = await novaAtividade(s.consultor);
    const f = await ficha(rid);
    expect(mesmasChaves(f, forma)).toEqual([]);
    expect(f.situacao).toEqual({ codigo: 'rascunho', rotulo: 'Rascunho', aprovacao_desatualizada: false, em_nova_revisao: false });
    expect(f.registro.areas).toEqual([]);
    expect(f.registro.responsavel).toBeNull();
    expect(f.proxima_pergunta).toBeNull();
  });

  it('registro: nome cai na finalidade; empresa do cadastro e, sem ele, do cliente do projeto; responsável e áreas', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('fi-p', ?, 'pessoa', 'Responsável exemplo')`).bind(P),
      env.DB.prepare(`INSERT INTO departamentos (id, project_id, nome) VALUES ('fi-d', ?, 'Área exemplo')`).bind(P),
    ]);
    const rid = await novaAtividade(s.consultor, { processing_purpose: 'Finalidade da ficha', owner_parte_id: 'fi-p' });
    await chamar(s.consultor, 'PUT', `${base(rid)}/departamentos`, { departamentos: ['fi-d'] });
    let f = await ficha(rid);
    expect(f.registro).toMatchObject({ id: rid, nome: 'Finalidade da ficha', finalidade: 'Finalidade da ficha', empresa: 'Cliente exemplo', responsavel: { id: 'fi-p', nome: 'Responsável exemplo' }, areas: [{ id: 'fi-d', nome: 'Área exemplo' }] });
    await env.DB.prepare(`UPDATE ropa_records SET nome = 'Nome da atividade' WHERE id = ?`).bind(rid).run();
    await env.DB.prepare(`INSERT OR REPLACE INTO empresas (project_id, razao_social) VALUES (?, 'Razão social exemplo Ltda.')`).bind(P).run();
    f = await ficha(rid);
    expect(f.registro).toMatchObject({ nome: 'Nome da atividade', empresa: 'Razão social exemplo Ltda.' });
    await env.DB.prepare('DELETE FROM empresas WHERE project_id = ?').bind(P).run();
  });

  it('situação e ações: com pendência, Conferir/Aprovar fica desabilitada e diz quantas', async () => {
    const rid = await novaAtividade(s.consultor);
    await chamar(s.consultor, 'POST', `${base(rid)}/situacao`, { acao: 'enviar_revisao' });
    const f = await ficha(rid);
    expect(f.situacao.codigo).toBe('em_revisao');
    expect(f.acoes.conferir_aprovar.habilitada).toBe(false);
    expect(f.acoes.conferir_aprovar.motivo).toMatch(/^Há \d+ pendências a resolver antes de pedir a aprovação\.$/);
    expect(f.acoes.alterar_para_em_revisao.habilitada).toBe(false);
    expect(f.acoes.cancelar.habilitada).toBe(true);
    expect(f.acoes.excluir.habilitada).toBe(true);
    // o cliente org_user vê, mas não age
    const c = await ficha(rid, s.cliente);
    expect(c.acoes.cancelar.habilitada).toBe(false);
    expect(c.acoes.excluir.habilitada).toBe(false);
    expect(c.acoes.imprimir.habilitada).toBe(true);
  });

  it('aprovada por pedido: situação Aprovada; reabrir só para o administrador; mudou depois: selo de desatualizada', async () => {
    const rid = await aprovarTratamentoDeTeste(env.DB, P);
    expect((await ficha(rid)).situacao.codigo).toBe('aprovada');
    expect((await ficha(rid)).acoes.reabrir.habilitada).toBe(false);
    expect((await ficha(rid, s.adminCliente)).acoes.reabrir.habilitada).toBe(true);
    await env.DB.prepare(`UPDATE ropa_records SET processing_purpose = 'Mudou depois da aprovação' WHERE id = ?`).bind(rid).run();
    expect((await ficha(rid)).situacao).toMatchObject({ codigo: 'rascunho', aprovacao_desatualizada: true });
  });

  it('estado das abas na rota: sistema vazio e depois de gaps, medidas e riscos', async () => {
    const rid = await novaAtividade(s.consultor);
    let f = await ficha(rid);
    expect(f.abas.escopo.estado).toBe('pendente');
    expect(f.abas.tratamento).toEqual({ estado: 'pendente', resumo: '0 de 6 etapas concluídas.' });
    expect(f.abas.gaps.estado).toBe('vazio');
    expect(f.abas.riscos.estado).toBe('vazio');
    await chamar(s.consultor, 'POST', `${base(rid)}/riscos`, { threat: 'Risco exemplo', impact: 2, probability: 2 });
    await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/nao-aplicavel`, { valor: true });
    f = await ficha(rid);
    expect(f.abas.riscos).toEqual({ estado: 'feito', resumo: '1 risco.' });
    expect(f.abas.gaps.estado).toBe('na');
    expect(f.abas.logs.estado).toBe('feito');
  });

  it('módulos: iso verdadeiro só se o projeto tem n.iso', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await ficha(rid)).modulos).toEqual({ iso: true });
    await env.DB.prepare(`DELETE FROM projeto_modulos WHERE project_id = ? AND modulo = 'iso'`).bind(P).run();
    expect((await ficha(rid)).modulos).toEqual({ iso: false });
    await env.DB.prepare(`INSERT INTO projeto_modulos (project_id, modulo) VALUES (?, 'iso')`).bind(P).run();
  });

  it('acesso: org_user com o módulo lê (200); sem o módulo 403; outro projeto 404/403; sem sessão 401', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await chamar(s.cliente, 'GET', `${base(rid)}/ficha`)).status).toBe(200);
    expect((await chamar(s.soIso, 'GET', `${base(rid)}/ficha`)).status).toBe(403);
    expect((await chamar(s.outro, 'GET', `${base(rid)}/ficha`)).status).toBeGreaterThanOrEqual(403);
    expect((await chamar(s.consultor, 'GET', `${base('nao-existe')}/ficha`)).status).toBe(404);
    expect((await chamar({}, 'GET', `${base(rid)}/ficha`)).status).toBe(401);
  });

  it('desempenho: a ficha inteira (com a autenticação) cabe em poucas consultas', async () => {
    const rid = await novaAtividade(s.consultor);
    let n = 0;
    const DB = new Proxy(env.DB, { get: (alvo, p) => (p === 'prepare' ? (...a: [string]) => { n++; return alvo.prepare(...a); } : (alvo as any)[p].bind?.(alvo) ?? (alvo as any)[p]) });
    const r = await chamar(s.consultor, 'GET', `${base(rid)}/ficha`, undefined, { DB });
    expect(r.status).toBe(200);
    console.log('consultas da ficha:', n);
    expect(n).toBeLessThanOrEqual(12);
  });
});
