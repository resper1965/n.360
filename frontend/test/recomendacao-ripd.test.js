// Texto da recomendação de RIPD: diz o que o servidor decidiu e, incompleto, quantas perguntas faltam. Dados fictícios.
import { describe, it, expect } from 'vitest';
import { textoRecomendacao } from '../src/recomendacao-ripd.js';

const q = (id, grupo, resposta) => ({ id, grupo, resposta, curto: `motivo ${id}` });

describe('textoRecomendacao', () => {
    it('incompleto conta o que falta: sem resposta e "Não sei"; o alto risco é opcional e não conta', () => {
        const imp = { recomendacao: { resultado: 'incompleto', motivos: [] }, perguntas: [
            q('alto_risco', 'alto_risco', null), q('g1', 'geral', 'nao'), q('g2', 'geral', 'nao_sei'), q('e1', 'especifico', null), q('e2', 'especifico', 'sim'),
        ] };
        expect(textoRecomendacao(imp)).toBe('Teste de impacto incompleto: falta responder "Sim" ou "Não" em 2 perguntas ("Não sei" conta como falta).');
        imp.perguntas[2].resposta = 'nao';
        expect(textoRecomendacao(imp)).toContain('em 1 pergunta ("Não sei"');
    });
    it('recomendado lista os motivos e dispensável pede a confirmação', () => {
        const perguntas = [q('g1', 'geral', 'sim'), q('e1', 'especifico', 'sim')];
        expect(textoRecomendacao({ recomendacao: { resultado: 'recomendado', motivos: ['g1', 'e1'] }, perguntas })).toBe('RIPD recomendado: motivo g1; motivo e1.');
        expect(textoRecomendacao({ recomendacao: { resultado: 'dispensavel_a_confirmar', motivos: [] }, perguntas })).toContain('a confirmar por uma pessoa');
        expect(textoRecomendacao({})).toBe('');
    });
});
