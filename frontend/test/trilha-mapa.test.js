// Os assistentes (DOC_WIZARDS) e as dicas (ISO_GUIDELINES) da trilha são chaveados pelo id do item do checklist,
// que mora no backend (PHASE_CHECKLISTS em src/constants.ts). As três listas derivaram: p3_3 "Justificar Exclusões de
// Controles" abria "Processos Incluídos no Escopo", p18_4 Vulnerabilidades abria Criptografia, p21_2 RoPA abria
// "DPO Nomeado", e ~60 assistentes apontavam para itens que não existiam mais. Este teste lê a lista do backend e
// reprova chave órfã, item sem assistente e assistente de tema trocado.
import { describe, it, expect } from 'vitest';
import { DOC_WIZARDS } from '../src/data/wizards.js';
import { ISO_GUIDELINES } from '../src/views/project.js';

// Sem `node:fs`: o Vite entrega o texto (padrão do repo).
const constantes = Object.values(import.meta.glob('../../src/constants.ts', { query: '?raw', import: 'default', eager: true }))[0];
const ITENS = [...constantes.matchAll(/\{ id: '(p\d+_\d+)', text: '([^']*)', category: '(\w+)' \}/g)]
    .map((m) => ({ id: m[1], text: m[2], category: m[3] }));
const IDS = new Set(ITENS.map((i) => i.id));

describe('trilha: assistentes e dicas casam com o checklist', () => {
    it('leu o checklist do backend', () => {
        expect(ITENS.length).toBeGreaterThan(100);
        expect(IDS.size).toBe(ITENS.length);
    });

    it('toda chave de DOC_WIZARDS é um item do checklist', () => {
        expect(Object.keys(DOC_WIZARDS).filter((k) => !IDS.has(k))).toEqual([]);
    });

    it('toda chave de ISO_GUIDELINES é um item do checklist', () => {
        expect(Object.keys(ISO_GUIDELINES).filter((k) => !IDS.has(k))).toEqual([]);
    });

    it('todo item tem assistente e dica', () => {
        expect(ITENS.filter((i) => !DOC_WIZARDS[i.id]).map((i) => i.id)).toEqual([]);
        expect(ITENS.filter((i) => !ISO_GUIDELINES[i.id]).map((i) => i.id)).toEqual([]);
    });

    it('a dica traz controle, tema, conselho e evidência recomendada', () => {
        const faltando = Object.entries(ISO_GUIDELINES)
            .filter(([, g]) => ['control', 'tip', 'advice', 'evidence'].some((c) => typeof g[c] !== 'string' || !g[c].trim()))
            .map(([k]) => k);
        expect(faltando).toEqual([]);
    });

    it('item que cita controle do Anexo A tem assistente com o mesmo controle', () => {
        const trocados = ITENS
            .map((i) => [i, /\((A\.\d+\.\d+)\)/.exec(i.text)?.[1]])
            .filter(([i, ref]) => ref && !new RegExp(`${ref.replace(/\./g, '\\.')}(?!\\d)`).test(DOC_WIZARDS[i.id].isoRef))
            .map(([i, ref]) => `${i.id} cita ${ref}, assistente diz ${DOC_WIZARDS[i.id].isoRef}`);
        expect(trocados).toEqual([]);
    });

    // Os pares da crítica de design (2026-10-15): cada um abria o assistente ou a dica de outro tema.
    it.each([
        ['p0_5', /comunica/i],
        ['p3_3', /exclus/i],
        ['p4_2', /lacuna/i],
        ['p11_1', /tratamento de riscos/i],
        ['p14_2', /codifica/i],
        ['p14_3', /vers/i],
        ['p18_4', /vulnerabilidade/i],
        ['p18_5', /criptografia/i],
        ['p21_2', /RoPA/],
        ['p21_4', /RIPD/],
    ])('%s abre assistente e dica do próprio tema', (id, tema) => {
        expect(DOC_WIZARDS[id].title).toMatch(tema);
        expect(ISO_GUIDELINES[id].tip).toMatch(tema);
    });
});
