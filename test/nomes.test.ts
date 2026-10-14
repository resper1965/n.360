import { describe, it, expect } from 'vitest';
import { normalizarNome, chaveNome } from '../src/services/nomes';

const CASOS: [string, string][] = [
  ['ti', 'TI'],
  ['ger. de ti', 'Ger. de TI'],
  ['depto financeiro', 'Departamento Financeiro'],
  ['DEPTO. FINANCEIRO', 'Departamento Financeiro'],
  ['maria da silva', 'Maria da Silva'],
  ['MARIA DA SILVA', 'Maria da Silva'],
  ["  joão   d'ávila  ", "João D'Ávila"],
  ['SAP', 'SAP'],
  ['servidor de arquivos', 'Servidor de Arquivos'],
  ['McDonald', 'McDonald'],
  ['iPhone corporativo', 'iPhone Corporativo'],
  ['tecnologia da informação (ti)', 'Tecnologia da Informação (TI)'],
  ['ti/rh', 'TI/RH'],
  ['ana a. silva', 'Ana A. Silva'],
  ['acme ltda', 'Acme Ltda.'],
  ['infra e mkt', 'Infraestrutura e Marketing'],
  ['o setor', 'O Setor'],
  ['Gerência DE TI', 'Gerência de TI'],
  ['PC-001', 'PC-001'],
  ['Ativo do A revisado', 'Ativo do A Revisado'],
  ['ANA E SILVA', 'Ana e Silva'],
  ['maria-clara', 'Maria-Clara'],
  ['', ''],
  ['   ', ''],
];

describe('normalizarNome', () => {
  it.each(CASOS)('%j vira %j', (entrada, saida) => expect(normalizarNome(entrada)).toBe(saida));
  it('é idempotente', () => { for (const [, saida] of CASOS) expect(normalizarNome(saida)).toBe(saida); });
});

describe('chaveNome', () => {
  it('ignora caixa, acento e espaço repetido', () => {
    expect(chaveNome('  João   DA Silva ')).toBe(chaveNome('joao da silva'));
    expect(chaveNome('TI')).toBe(chaveNome('ti'));
  });
});
