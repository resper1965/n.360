// Anti-duplicação por regra (src/similares.js): igual recusa, parecido oferece o existente. Nomes fictícios.
import { describe, it, expect } from 'vitest';
import { normalizarNome, parecidos, mesmoEmail } from '../src/similares.js';

const nomes = (r) => r.map((x) => x.item.nome);

describe('normalizarNome', () => {
    it('ignora acento, caixa, pontuação e palavras vazias; genérica sai, salvo sozinha', () => {
        expect(normalizarNome('  Sistema de Folha!  ')).toBe('folha');
        expect(normalizarNome('Gestão Financeira')).toBe('financeira');
        expect(normalizarNome('The Payroll System')).toBe('payroll');
        expect(normalizarNome('Sistema')).toBe('sistema');
        expect(normalizarNome('Área de T.I.')).toBe('t i');
    });
});

describe('parecidos', () => {
    const existentes = [{ id: 1, nome: 'Folha de pagamento' }, { id: 2, nome: 'Recursos Humanos' }, { id: 3, nome: 'CRM Vendas' }, { id: 4, nome: 'Portaria' }];

    it('sinônimo PT/EN do negócio', () => {
        const r = parecidos('Payroll system', existentes);
        expect(nomes(r)).toEqual(['Folha de pagamento']);
        expect(r[0]).toMatchObject({ igual: false, motivo: 'sinônimo' });
        expect(nomes(parecidos('processo de pagamento', existentes))).toEqual(['Folha de pagamento']);
        expect(nomes(parecidos('RH', existentes))).toEqual(['Recursos Humanos']);
        expect(nomes(parecidos('people', existentes))).toEqual(['Recursos Humanos']);
        expect(nomes(parecidos('Customers', existentes))).toContain('CRM Vendas');
    });

    it('acento e caixa não separam: igual é igual', () => {
        const r = parecidos('FOLHA DE PAGAMENTO', existentes);
        expect(r[0]).toMatchObject({ igual: true, motivo: 'mesmo nome' });
        expect(parecidos('recursos humanos', [{ nome: 'Recursos Humános' }])[0].igual).toBe(true);
        expect(parecidos('sistema de folha', [{ nome: 'Folha' }])[0].igual).toBe(true);
    });

    it('prefixo conta como parecido; nada em comum não aparece', () => {
        expect(parecidos('Portarias', existentes)[0]).toMatchObject({ igual: false, motivo: 'começa igual' });
        expect(parecidos('Marketing', existentes)).toEqual([]);
        expect(parecidos('', existentes)).toEqual([]);
        expect(parecidos('de', existentes)).toEqual([]);
    });

    it('respeita o limite e ordena do mais parecido', () => {
        const muitos = [{ nome: 'Folha' }, { nome: 'Folha de pagamento antiga' }, { nome: 'Pagamentos' }, { nome: 'Salários' }];
        const r = parecidos('folha', muitos, { limite: 2 });
        expect(r).toHaveLength(2);
        expect(r[0].item.nome).toBe('Folha');
    });
});

describe('mesmoEmail', () => {
    it('acha a pessoa pelo e-mail, sem caixa nem espaço', () => {
        const pessoas = [{ id: 'p1', nome: 'Ana', email: 'ana@exemplo.com' }, { id: 'p2', nome: 'Bia', email: null }];
        expect(mesmoEmail(' ANA@exemplo.com ', pessoas).id).toBe('p1');
        expect(mesmoEmail('outra@exemplo.com', pessoas)).toBeNull();
        expect(mesmoEmail('', pessoas)).toBeNull();
    });
});
