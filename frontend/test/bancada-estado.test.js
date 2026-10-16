import { describe, it, expect } from 'vitest';
import { indexarCatalogo, vizinhos, posicaoNaFase, resolverAlvo, ROTULO_ESTADO, textoDoEstado } from '../src/bancada/estado.js';
import catalogo from '../../contracts/bancada/catalogo.json';

const ind = indexarCatalogo(catalogo);

describe('indexarCatalogo', () => {
  it('ordena por fase e ordem e guarda passo, fase e etapa por id', () => {
    expect(ind.ordem).toEqual(catalogo.passos.map((p) => p.id));
    expect(ind.passo('p3_3').titulo).toBeTruthy();
    expect(ind.faseDe('p3_3').numero).toBe(3);
  });
});
describe('vizinhos e posição', () => {
  it('anterior e próximo atravessam a fase; nas pontas, null', () => {
    expect(vizinhos(ind, 'p3_3')).toEqual({ anterior: null, proximo: 'p3_4' });
    expect(vizinhos(ind, 'p3_4').proximo).toBeNull();
    expect(posicaoNaFase(ind, 'p3_4')).toEqual({ n: 2, total: 2 });
  });
});
describe('resolverAlvo', () => {
  const banc = { continuar: { fase: 3, passo: 'p3_3' }, passos: [{ id: 'p3_3', estado: 'concluido' }, { id: 'p3_4', estado: 'nao_iniciado' }] };
  it('o passo vale; só a fase leva ao primeiro passo aberto dela; sem alvo, o continuar', () => {
    expect(resolverAlvo(ind, banc, { passo: 'p3_4', fase: '9' })).toBe('p3_4');
    expect(resolverAlvo(ind, banc, { fase: '3' })).toBe('p3_4');
    expect(resolverAlvo(ind, banc, { passo: 'p99_9' })).toBe('p3_3');
    expect(resolverAlvo(ind, banc, null)).toBe('p3_3');
    expect(resolverAlvo(ind, { ...banc, continuar: null }, null)).toBe('p3_3');
  });
});
describe('rótulos', () => {
  it('estado sempre em texto; bloqueado leva o motivo', () => {
    expect(ROTULO_ESTADO.concluido).toBe('Concluído');
    expect(textoDoEstado({ estado: 'bloqueado', bloqueio: { motivo: 'Aguardando a diretoria', responsavel: 'Maria' } })).toBe('Bloqueado: Aguardando a diretoria');
    expect(textoDoEstado({ estado: 'concluido', concluido_por_excecao: true })).toBe('Concluído com justificativa registrada');
  });
});
