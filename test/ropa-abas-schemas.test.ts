import { describe, it, expect } from 'vitest';
import {
  escopoSchema, agentesSchema, medidaCriarSchema, medidaAtualizarSchema, baseJuridicaSchema, gapCriarSchema, gapAtualizarSchema,
  gapsNaoAplicavelSchema, situacaoSchema, ETAPAS, etapaCabecalhoSchema, etapaAtivosSchema, etapaTitularesColetaSchema, etapaTitularSchema,
  catalogoCriarSchema, ABAS_IDS,
} from '../src/schemas/ropa-abas';

describe('esquemas da ficha em abas', () => {
  it('são estritos: campo a mais é recusado', () => {
    expect(escopoSchema.safeParse({ finalidade: 'x', extra: 1 }).success).toBe(false);
    expect(situacaoSchema.safeParse({ acao: 'cancelar', motivo: 'duplicada aqui', x: 1 }).success).toBe(false);
  });
  it('escopo: ausente mantém, null limpa, finalidade vazia é recusada', () => {
    expect(escopoSchema.safeParse({}).success).toBe(true);
    expect(escopoSchema.safeParse({ volume_mensal: null }).success).toBe(true);
    expect(escopoSchema.safeParse({ finalidade: '   ' }).success).toBe(false);
    expect(escopoSchema.safeParse({ processamento_automatizado: 'talvez' }).success).toBe(false);
  });
  it('situação: cancelar e reabrir exigem motivo de 5+ caracteres; enviar_revisao e reativar não', () => {
    expect(situacaoSchema.safeParse({ acao: 'cancelar' }).success).toBe(false);
    expect(situacaoSchema.safeParse({ acao: 'cancelar', motivo: 'curto' }).success).toBe(true);
    expect(situacaoSchema.safeParse({ acao: 'reabrir', motivo: 'ab' }).success).toBe(false);
    expect(situacaoSchema.safeParse({ acao: 'enviar_revisao' }).success).toBe(true);
    expect(situacaoSchema.safeParse({ acao: 'aprovar', motivo: 'qualquer coisa' }).success).toBe(false); // aprovar não existe aqui: é o pedido
  });
  it('base jurídica: finalidade obrigatória por inciso, art. 11 N/A exclui incisos, GDPR só os seis códigos', () => {
    expect(baseJuridicaSchema.safeParse({ lgpd: [{ requisito_id: 'lgpd:art7:ii', finalidade: '' }] }).success).toBe(false);
    expect(baseJuridicaSchema.safeParse({ lgpd: [{ requisito_id: 'lgpd:art7:ii', finalidade: 'Cumprir obrigação legal' }] }).success).toBe(true);
    expect(baseJuridicaSchema.safeParse({ art11: { nao_aplicavel: true, incisos: [{ requisito_id: 'lgpd:art11:i', finalidade: 'x y z' }] } }).success).toBe(false);
    expect(baseJuridicaSchema.safeParse({ gdpr: [{ base: 'consentimento', finalidade: 'Marketing' }] }).success).toBe(true);
    expect(baseJuridicaSchema.safeParse({ gdpr: [{ base: 'outra', finalidade: 'Marketing' }] }).success).toBe(false);
    expect(baseJuridicaSchema.safeParse({ lgpd: [{ requisito_id: 'lgpd:art11:i', finalidade: 'Finalidade' }] }).success).toBe(false); // art. 11 vai em art11
  });
  it('gap: Gap e Responsável obrigatórios na criação; status padrão é do servidor', () => {
    expect(gapCriarSchema.safeParse({ gap: 'Falta exclusão', responsavel_parte_id: 'p1' }).success).toBe(true);
    expect(gapCriarSchema.safeParse({ gap: 'Falta exclusão' }).success).toBe(false);
    expect(gapCriarSchema.safeParse({ gap: '', responsavel_parte_id: 'p1' }).success).toBe(false);
    expect(gapAtualizarSchema.safeParse({ status: 'Closed' }).success).toBe(true);
    expect(gapsNaoAplicavelSchema.safeParse({ valor: true }).success).toBe(true);
  });
  it('etapas: seis ids, Eliminação sem ativos, titular com dados ou nao_usa', () => {
    expect(ETAPAS).toEqual(['coleta', 'uso', 'compartilhamento_interno', 'compartilhamento_externo', 'armazenamento', 'eliminacao']);
    expect(etapaAtivosSchema.safeParse({ ativos: [{ item_id: 'i1', local_armazenamento: 'Armário exemplo' }] }).success).toBe(true);
    expect(etapaTitularSchema.safeParse({ dados_ids: [] }).success).toBe(false);
    expect(etapaTitularSchema.safeParse({ dados_ids: [], nao_usa: true }).success).toBe(true);
    expect(etapaTitularSchema.safeParse({ dados_ids: ['d1'], nao_usa: true }).success).toBe(false);
    expect(etapaTitularesColetaSchema.safeParse({ titulares: [{ titular_id: 't1', dados_ids: [] }] }).success).toBe(false);
    expect(etapaCabecalhoSchema.safeParse({ nao_aplicavel: true, descricao: 'x' }).success).toBe(false); // N/A não tem conteúdo
  });
  it('catálogo e abas', () => {
    expect(catalogoCriarSchema.safeParse({ nome: 'Titular exemplo A' }).success).toBe(true);
    expect(catalogoCriarSchema.safeParse({ nome: 'Dado exemplo', sensivel: true }).success).toBe(true);
    expect(ABAS_IDS).toEqual(['escopo', 'tratamento', 'agentes', 'medidas', 'base_juridica', 'gaps', 'impacto', 'riscos', 'logs']);
    expect(medidaCriarSchema.safeParse({ medida: 'Acesso por login e senha pessoal', status: 'ativa' }).success).toBe(true);
    expect(medidaAtualizarSchema.safeParse({ status: 'desconhecida' }).success).toBe(false);
    expect(agentesSchema.safeParse({ papel_controlador: true, papel_operador: false, international_transfers: false }).success).toBe(true);
  });
});
