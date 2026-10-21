import { describe, it, expect, beforeAll } from 'vitest';
import { PERGUNTAS_IMPACTO } from '../src/services/impacto';
import { ETAPAS } from '../src/schemas/ropa-abas';
import { situacaoDaEtapa, type DadosDaEtapa } from '../src/services/ropa-abas/etapas';
import { FALTA_CAMPO, lacunas, proximaPergunta, type EntradaProxima } from '../src/services/ropa-abas/proxima-pergunta';
import { prepararProjeto, chamar, json, base, novaAtividade, P, type Sessoes } from './helpers/ropa-abas';

/** Atividade completa em tudo que a pergunta olha: a resposta de cada teste é a primeira lacuna que ele deixa aberta. */
const completa = (): EntradaProxima => ({
  finalidade: 'Folha de pagamento', responsavel: true, areas: 1, volumeOuDescricao: true,
  coleta: { titulares: [{ dados: 2 }], solicitaConsentimento: false, descricao: 'Coleta do cadastro', ativos: 1 },
  etapas: ETAPAS.map((etapa) => ({ etapa, situacao: 'concluida' as const, faltas: [] })),
  papelRespondido: true, temBase: true, art11Na: false, sensivelSemArt11: false, medidas: 1,
  impactoRespondidas: PERGUNTAS_IMPACTO.map((p) => p.id), impactoFinalizado: true,
});
const com = (o: Partial<EntradaProxima>): EntradaProxima => ({ ...completa(), ...o });
const pendente = (etapa: (typeof ETAPAS)[number], faltas: string[]) => ({ etapa, situacao: 'pendente' as const, faltas });

describe('proximaPergunta (função pura, primeira lacuna na ordem das abas)', () => {
  it('atividade sem finalidade: Escopo, finalidade', () => {
    expect(proximaPergunta(com({ finalidade: '' }))).toEqual({ aba: 'escopo', campo: 'finalidade' });
    expect(proximaPergunta(com({ finalidade: null }))).toEqual({ aba: 'escopo', campo: 'finalidade' });
  });
  it('só com finalidade: responsável, depois áreas (cabeçalho, que vive no Escopo)', () => {
    expect(proximaPergunta(com({ responsavel: false }))).toEqual({ aba: 'escopo', campo: 'responsavel' });
    expect(proximaPergunta(com({ areas: 0 }))).toEqual({ aba: 'escopo', campo: 'areas' });
  });
  it('Escopo sem volume mensal nem descrição: volume, depois das áreas (o que a aba Escopo cobra)', () => {
    expect(proximaPergunta(com({ volumeOuDescricao: false }))).toEqual({ aba: 'escopo', campo: 'volume_mensal' });
    expect(lacunas(com({ areas: 0, volumeOuDescricao: false })).slice(0, 2)).toEqual([{ aba: 'escopo', campo: 'areas' }, { aba: 'escopo', campo: 'volume_mensal' }]);
  });
  it('dado sensível sem art. 11: pergunta o art. 11, mesmo com outra base registrada', () => {
    expect(proximaPergunta(com({ sensivelSemArt11: true }))).toEqual({ aba: 'base_juridica', campo: 'art11' });
    expect(lacunas(com({ sensivelSemArt11: true, temBase: false })).filter((x) => x.aba === 'base_juridica')).toEqual([{ aba: 'base_juridica', campo: 'art11' }]);
  });
  it('Coleta: titulares, depois dados de cada titular, consentimento (grupo), descrição e ativos', () => {
    expect(proximaPergunta(com({ coleta: { titulares: [], solicitaConsentimento: false, descricao: 'x', ativos: 1 } }))).toEqual({ aba: 'tratamento', campo: 'coleta.titulares' });
    expect(proximaPergunta(com({ coleta: { titulares: [{ dados: 1 }, { dados: 0 }], solicitaConsentimento: false, descricao: 'x', ativos: 1 } }))).toEqual({ aba: 'tratamento', campo: 'coleta.dados' });
    expect(proximaPergunta(com({ coleta: { titulares: [{ dados: 1 }], solicitaConsentimento: null, descricao: 'x', ativos: 1 } }))).toEqual({ aba: 'tratamento', campo: 'coleta.consentimento_e_criancas' });
    expect(proximaPergunta(com({ coleta: { titulares: [{ dados: 1 }], solicitaConsentimento: true, descricao: '  ', ativos: 1 } }))).toEqual({ aba: 'tratamento', campo: 'coleta.descricao' });
    expect(proximaPergunta(com({ coleta: { titulares: [{ dados: 1 }], solicitaConsentimento: true, descricao: 'x', ativos: 0 } }))).toEqual({ aba: 'tratamento', campo: 'coleta.ativos' });
  });
  it('demais etapas, na ordem, com a primeira falta de cada uma (só depois da Coleta)', () => {
    const etapas = [
      { etapa: 'coleta' as const, situacao: 'concluida' as const, faltas: [] },
      pendente('uso', ['descrição', 'ao menos um ativo']),
      pendente('armazenamento', ['ao menos um ativo']),
    ];
    expect(proximaPergunta(com({ etapas }))).toEqual({ aba: 'tratamento', campo: 'uso.descricao' });
    expect(proximaPergunta(com({ etapas: [etapas[0], pendente('uso', ['titulares da Coleta'])] }))).toEqual({ aba: 'tratamento', campo: 'uso.titulares' });
    expect(proximaPergunta(com({ etapas: [etapas[0], pendente('eliminacao', ['prazo', 'descarte'])] }))).toEqual({ aba: 'tratamento', campo: 'eliminacao.prazo' });
  });
  it('agentes, base jurídica (salvo Não Aplicável do art. 11), medidas e, por fim, o teste de impacto', () => {
    expect(proximaPergunta(com({ papelRespondido: false }))).toEqual({ aba: 'agentes', campo: 'papel' });
    expect(proximaPergunta(com({ temBase: false, art11Na: false }))).toEqual({ aba: 'base_juridica', campo: 'base' });
    expect(proximaPergunta(com({ temBase: false, art11Na: true }))).toBeNull(); // Não Aplicável do art. 11 também conta como base respondida
    expect(proximaPergunta(com({ medidas: 0 }))).toEqual({ aba: 'medidas', campo: 'medida' });
    expect(proximaPergunta(com({ impactoRespondidas: [], impactoFinalizado: false }))).toEqual({ aba: 'impacto', campo: PERGUNTAS_IMPACTO[0].id });
    const todas = PERGUNTAS_IMPACTO.map((p) => p.id);
    expect(proximaPergunta(com({ impactoRespondidas: todas.slice(0, -1) }))).toEqual({ aba: 'impacto', campo: todas[todas.length - 1] });
    expect(proximaPergunta(com({ impactoFinalizado: false }))).toEqual({ aba: 'impacto', campo: 'finalizado' });
  });
  it('tudo respondido: null; gaps e riscos nunca são perguntados', () => {
    expect(proximaPergunta(completa())).toBeNull();
    expect(proximaPergunta(com({ medidas: 1 }))).toBeNull();
  });
  it('é estável: mesma entrada, mesma saída', () => {
    const e = com({ papelRespondido: false, medidas: 0 });
    expect(proximaPergunta(e)).toEqual(proximaPergunta({ ...e }));
  });
  it('lacunas: todas, na ordem das abas, a primeira é a proximaPergunta; tudo respondido, vazia', () => {
    const e = com({ responsavel: false, papelRespondido: false, medidas: 0 });
    expect(lacunas(e)).toEqual([{ aba: 'escopo', campo: 'responsavel' }, { aba: 'agentes', campo: 'papel' }, { aba: 'medidas', campo: 'medida' }]);
    expect(proximaPergunta(e)).toEqual(lacunas(e)[0]);
    expect(lacunas(completa())).toEqual([]);
    // "Não sei agora" não trava: a tela tem sempre a lacuna seguinte para mostrar
    const todasImpacto = lacunas(com({ impactoRespondidas: [], impactoFinalizado: false }));
    expect(todasImpacto.map((p) => p.campo)).toEqual([...PERGUNTAS_IMPACTO.map((p) => p.id), 'finalizado']);
  });
  it('toda falta que a situação da etapa produz tem campo mapeado', () => {
    const todas = new Set<string>();
    for (const etapa of ETAPAS) {
      const vazia: DadosDaEtapa = {
        etapa, naoAplicavel: false, descricao: null, ativos: [], areas: 0, parceiros: 0,
        titularesDaColeta: [{ titular_id: 't', dados: 0 }], titularesDaEtapa: [], prazo: null, descarte: null,
        armazenamento: { naoAplicavel: false, ativos: 0 },
      };
      for (const f of situacaoDaEtapa(vazia).faltas) todas.add(f);
      for (const f of situacaoDaEtapa({ ...vazia, titularesDaColeta: [], ativos: [{ local_armazenamento: null }], areas: 0, parceiros: 0 }).faltas) todas.add(f);
    }
    expect(todas.size).toBeGreaterThan(0);
    for (const f of todas) expect(FALTA_CAMPO[f], f).toBeDefined();
  });
});

describe('GET /ficha: proxima_pergunta vem do servidor', () => {
  let s: Sessoes;
  beforeAll(async () => { s = await prepararProjeto(); });
  const proxima = async (rid: string) => (await json<any>(await chamar(s.consultor, 'GET', `${base(rid)}/ficha`))).proxima_pergunta;

  it('atividade nova (com finalidade do POST): responsável; preencher o responsável avança para as áreas', async () => {
    const rid = await novaAtividade(s.consultor);
    expect(await proxima(rid)).toEqual({ aba: 'escopo', campo: 'responsavel' });
    const r = await chamar(s.consultor, 'PUT', `${base(rid)}/escopo`, { finalidade: 'Finalidade revista exemplo' });
    expect(r.status).toBe(200);
    expect(await proxima(rid)).toEqual({ aba: 'escopo', campo: 'responsavel' });
  });
  it('a ficha traz as lacunas em ordem, com a proxima_pergunta na frente', async () => {
    const rid = await novaAtividade(s.consultor);
    const f = await json<any>(await chamar(s.consultor, 'GET', `${base(rid)}/ficha`));
    expect(f.lacunas[0]).toEqual(f.proxima_pergunta);
    expect(f.lacunas.length).toBeGreaterThan(1);
    expect(f.lacunas.map((p: any) => p.aba)).toContain('agentes');
  });
  it('a resposta sai da ficha de outra pessoa do projeto (mesma pergunta)', async () => {
    const rid = await novaAtividade(s.consultor);
    expect(await proxima(rid)).toEqual(await json<any>(await chamar(s.cliente, 'GET', `${base(rid)}/ficha`)).then((f) => f.proxima_pergunta));
  });
});
