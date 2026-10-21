// O CSV do servidor e a tela falam a mesma língua: cada rótulo dos mapas de exportacao.ts é o de rotuloDe.
import { describe, it, expect } from 'vitest';
import { rotuloDe } from '../src/rotulos.js';
import { STATUS, NIVEL, ESTRATEGIA, CLASSIFICACAO, TREINAMENTO } from '../../src/services/exportacao.ts';

describe('o CSV usa os mesmos rótulos da tela', () => {
    it.each([...Object.entries(STATUS), ...Object.entries(NIVEL), ...Object.entries(ESTRATEGIA), ...Object.entries(CLASSIFICACAO)])('%s', (valor, rotulo) => {
        expect(rotulo).toBe(rotuloDe('', valor));
    });
    it.each(Object.entries(TREINAMENTO))('treinamento: %s', (valor, rotulo) => {
        expect(rotulo).toBe(rotuloDe('treinamento', valor));
    });
    it('ação e risco: Aberto / Em andamento / Concluído / Mitigado / Aceito', () => {
        expect(['Open', 'In Progress', 'Closed', 'Mitigated', 'Accepted'].map((v) => rotuloDe('', v)))
            .toEqual(['Aberto', 'Em andamento', 'Concluído', 'Mitigado', 'Aceito']);
        expect(rotuloDe('', 'publicado')).toBe('Vigente');
    });
});
