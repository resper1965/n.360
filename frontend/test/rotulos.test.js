// A camada de exibição dos valores que o banco grava em inglês e o formatador único de datas.
import { describe, it, expect } from 'vitest';
import { rotuloDe } from '../src/rotulos.js';
import { formatarData, traduzStatus } from '../src/ui.js';

describe('rotuloDe()', () => {
    it.each([
        ['', 'Implemented', 'Implementado'], ['', 'Partial', 'Parcial'], ['', 'Compliant', 'Conforme'],
        ['', 'Not Applicable', 'Não aplicável'], ['', 'Open', 'Aberto'], ['', 'Closed', 'Concluído'],
        ['', 'In Progress', 'Em andamento'], ['', 'AT RISK', 'Em risco'], ['', 'EXPIRED', 'Vencido'],
        ['', 'WON', 'Ganho'], ['', 'LOST', 'Perdido'], ['', 'Pending', 'Pendente'], ['', 'Draft', 'Rascunho'],
        ['', 'Approved', 'Aprovado'], ['', 'Active', 'Ativo'], ['', 'Controller', 'Controlador'],
        ['', 'Processor', 'Operador'], ['', 'Under Review', 'Em revisão'], ['', 'CONFIDENTIAL', 'Confidencial'],
        ['', 'WEEKLY', 'Semanal'], ['', 'Gap Assessment', 'Análise de lacunas'],
    ])('%s "%s" vira "%s"', (dominio, valor, esperado) => {
        expect(rotuloDe(dominio, valor)).toBe(esperado);
    });

    it('o domínio decide quando o mesmo valor muda de sentido', () => {
        expect(rotuloDe('auditoria', 'Internal')).toBe('Interna');
        expect(rotuloDe('', 'Internal')).toBe('Interno');
        expect(rotuloDe('fase', 'pending')).toBe('Não iniciada');
    });

    it('domínio desconhecido cai no mapa geral; valor desconhecido volta como veio', () => {
        expect(rotuloDe('nada', 'High')).toBe('Alto');
        expect(rotuloDe('auditoria', 'Frobnicated')).toBe('Frobnicated');
    });

    it('vazio vira vazio, nunca "undefined"', () => {
        expect(rotuloDe('', undefined)).toBe('');
        expect(rotuloDe('', null)).toBe('');
    });

    it('traduzStatus é o mapa geral', () => {
        expect(traduzStatus('Under Review')).toBe(rotuloDe('', 'Under Review'));
    });
});

describe('formatarData()', () => {
    it('data só de dia vira dd/mm/aaaa sem passar por fuso', () => {
        expect(formatarData('2026-08-31')).toBe('31/08/2026');
        expect(formatarData('2026-01-01')).toBe('01/01/2026');
        expect(formatarData('2026-10-16T00:00:00.000Z')).toBe('16/10/2026');
    });

    it('data com hora: dia e, se pedido, hh:mm no fuso local', () => {
        const d = new Date(2026, 9, 15, 10, 5);
        expect(formatarData(d)).toBe('15/10/2026');
        expect(formatarData(d, { hora: true })).toBe('15/10/2026 10:05');
        expect(formatarData(d.toISOString(), { hora: true })).toBe('15/10/2026 10:05');
    });

    it('o "AAAA-MM-DD HH:MM:SS" do SQLite é UTC', () => {
        const esperado = new Date(Date.UTC(2026, 9, 15, 13, 15));
        expect(formatarData('2026-10-15 13:15:00', { hora: true })).toBe(formatarData(esperado, { hora: true }));
    });

    it('vazio vira travessão; texto que não é data volta como veio', () => {
        expect(formatarData('')).toBe('—');
        expect(formatarData(null)).toBe('—');
        expect(formatarData(undefined, { vazio: 'Sem prazo' })).toBe('Sem prazo');
        expect(formatarData('amanhã')).toBe('amanhã');
        // Texto que não é data volta escapado: as telas interpolam o resultado em innerHTML.
        expect(formatarData('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('nunca devolve ISO cru', () => {
        for (const v of ['2026-10-15T13:15:00Z', '2026-10-15T13:15:00.000Z', '2026-10-15 13:15:00', '2026-10-15']) {
            expect(formatarData(v, { hora: true })).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        }
    });
});
