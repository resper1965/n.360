import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { montarConferencia, type EntradaConferencia } from '../src/services/ropa-abas/conferencia';
import { ETAPAS } from '../src/schemas/ropa-abas';
import { prepararProjeto, chamar, json, base, novaAtividade, P, type Sessoes } from './helpers/ropa-abas';

const etapa = (situacao: 'pendente' | 'concluida' | 'nao_aplicavel') => ETAPAS.map((e) => ({ etapa: e, situacao, faltas: [] }));
/** Atividade completa: nada bloqueia nem avisa. */
const ok: EntradaConferencia = {
  finalidade: 'Finalidade exemplo', etapas: etapa('concluida'), temBase: true, dadosSensiveis: false, art11Incisos: 0, art11Na: false, impactoFinalizado: true,
  gapsAbertosSemResponsavel: 0, gaps: 1, gapsNaoAplicavel: false, medidas: 1, riscos: 1, transferencia: false, salvaguarda: null, liaExigida: false, liaConcluida: false,
};
const com = (x: Partial<EntradaConferencia>) => montarConferencia({ ...ok, ...x });
const ids = (l: { id: string }[]) => l.map((i) => i.id);

describe('montarConferencia (função pura)', () => {
  it('tudo em dia: pronta, sem bloqueio nem aviso', () => { expect(com({})).toEqual({ pronta: true, bloqueios: [], avisos: [] }); });

  describe('bloqueios', () => {
    it('finalidade vazia', () => { expect(ids(com({ finalidade: '  ' }).bloqueios)).toEqual(['sem_finalidade']); });
    it('etapas pendentes, no singular e no plural', () => {
      const um = [...etapa('concluida').slice(0, 5), { etapa: 'eliminacao' as const, situacao: 'pendente' as const, faltas: [] }];
      expect(com({ etapas: um }).bloqueios[0]).toEqual({ id: 'etapa_pendente', aba: 'tratamento', texto: 'Tratamento de Dados: 1 etapa pendente.' });
      expect(com({ etapas: etapa('pendente') }).bloqueios[0].texto).toBe('Tratamento de Dados: 6 etapas pendentes.');
    });
    it('dado sensível sem inciso do art. 11 e sem Não Aplicável', () => {
      expect(ids(com({ dadosSensiveis: true }).bloqueios)).toEqual(['sensivel_sem_art11']);
      expect(com({ dadosSensiveis: true, art11Incisos: 1 }).pronta).toBe(true);
      expect(com({ dadosSensiveis: true, art11Na: true }).pronta).toBe(true);
    });
    it('teste de impacto não finalizado', () => { expect(ids(com({ impactoFinalizado: false }).bloqueios)).toEqual(['impacto_nao_finalizado']); });
    it('gap aberto sem responsável', () => { expect(ids(com({ gapsAbertosSemResponsavel: 2 }).bloqueios)).toEqual(['gap_sem_responsavel']); });
  });

  describe('avisos (nenhum bloqueia)', () => {
    const so = (x: Partial<EntradaConferencia>, id: string) => {
      const c = com(x);
      expect(ids(c.avisos), id).toEqual([id]);
      expect(c.pronta, id).toBe(true);
    };
    it('sem medidas', () => so({ medidas: 0 }, 'sem_medidas'));
    it('sem riscos', () => so({ riscos: 0 }, 'sem_riscos'));
    it('sem base jurídica (sem dado sensível)', () => so({ temBase: false }, 'sem_base'));
    it('transferência internacional sem salvaguarda', () => so({ transferencia: true, salvaguarda: ' ' }, 'transferencia_sem_salvaguarda'));
    it('legítimo interesse sem LIA concluída', () => so({ liaExigida: true }, 'lia_pendente'));
    it('Controle de GAPs sem gaps e sem Não Aplicável', () => so({ gaps: 0 }, 'gaps_nao_tratados'));
    it('Não Aplicável cobre a falta de gaps', () => { expect(com({ gaps: 0, gapsNaoAplicavel: true }).avisos).toEqual([]); });
  });
});

describe('GET /conferencia', () => {
  let s: Sessoes;
  beforeAll(async () => { s = await prepararProjeto(); });
  const conf = async (rid: string) => json<any>(await chamar(s.consultor, 'GET', `${base(rid)}/conferencia`));
  const concluirEtapas = (rid: string) => env.DB.batch(ETAPAS.map((e) =>
    env.DB.prepare(`INSERT OR REPLACE INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao) VALUES (?, ?, ?, 'nao_aplicavel')`).bind(rid, P, e)));

  it('sistema vazio: a atividade recém-criada responde, bloqueia e avisa, sem erro', async () => {
    const rid = await novaAtividade(s.consultor);
    const c = await conf(rid);
    expect(c.pronta).toBe(false);
    expect(ids(c.bloqueios)).toEqual(['etapa_pendente', 'impacto_nao_finalizado']);
    expect(ids(c.avisos)).toEqual(expect.arrayContaining(['sem_medidas', 'sem_riscos', 'gaps_nao_tratados']));
  });

  it('devolve a forma de contracts/ropa-abas/conferencia.json', async () => {
    const forma = (await import('../contracts/ropa-abas/conferencia.json')).default as any;
    const c = await conf(await novaAtividade(s.consultor));
    expect(Object.keys(c).sort()).toEqual(Object.keys(forma).sort());
    expect(Object.keys(c.bloqueios[0]).sort()).toEqual(Object.keys(forma.bloqueios[0]).sort());
    expect(Object.keys(c.avisos[0]).sort()).toEqual(Object.keys(forma.avisos[0]).sort());
  });

  it('atividade completa: pronta; com uma etapa pendente, aparece etapa_pendente', async () => {
    const rid = await novaAtividade(s.consultor);
    await concluirEtapas(rid);
    await env.DB.prepare(`UPDATE ropa_records SET impacto_finalizado_em = datetime('now') WHERE id = ?`).bind(rid).run();
    expect(await conf(rid)).toMatchObject({ pronta: true, bloqueios: [] });
    await env.DB.prepare(`DELETE FROM tratamento_ciclo WHERE ropa_id = ? AND etapa = 'uso'`).bind(rid).run();
    expect(ids((await conf(rid)).bloqueios)).toEqual(['etapa_pendente']);
  });

  it('gap sem responsável (criado pela rota antiga /acoes) bloqueia; sensível sem art. 11 bloqueia; legítimo interesse avisa', async () => {
    const rid = await novaAtividade(s.consultor, { dados_sensiveis: true, legal_basis: 'Legítimo interesse' });
    expect(ids((await conf(rid)).bloqueios)).toContain('sensivel_sem_art11');
    expect(ids((await conf(rid)).avisos)).toContain('lia_pendente');
    await chamar(s.consultor, 'POST', `${base(rid)}/acoes`, { title: 'Ação exemplo' });
    expect(ids((await conf(rid)).bloqueios)).toContain('gap_sem_responsavel');
    // Responsável só em texto (o campo antigo da CAPA) também conta.
    await env.DB.prepare(`UPDATE corrective_actions SET assigned_to = 'Pessoa exemplo' WHERE ropa_id = ?`).bind(rid).run();
    expect(ids((await conf(rid)).bloqueios)).not.toContain('gap_sem_responsavel');
    await env.DB.prepare(`UPDATE ropa_records SET base_art11_na = 1 WHERE id = ?`).bind(rid).run();
    expect(ids((await conf(rid)).bloqueios)).not.toContain('sensivel_sem_art11');
  });

  it('outro projeto 404; sem sessão 401', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await chamar(s.outro, 'GET', `${base(rid)}/conferencia`)).status).toBeGreaterThanOrEqual(403);
    expect((await chamar(s.consultor, 'GET', `${base('nao-existe')}/conferencia`)).status).toBe(404);
    expect((await chamar({}, 'GET', `${base(rid)}/conferencia`)).status).toBe(401);
  });
});
