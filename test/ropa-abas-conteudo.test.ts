import { describe, it, expect } from 'vitest';
import { GDPR_BASES } from '../src/schemas/ropa-abas';
import { BASES_GDPR } from '../src/data/ropa-abas/gdpr';
import { ORIGENS_DOS_DADOS } from '../src/data/ropa-abas/origens';
import { PROBABILIDADE, IMPACTO, NIVEL_ROTULO, ESTRATEGIA_ROTULO } from '../src/data/ropa-abas/escalas';
import { SENSIVEIS_CONHECIDOS } from '../src/data/ropa-abas/sensiveis';
import { ROTULO_MEDIDA_STATUS, ROTULO_GAP_STATUS } from '../src/data/ropa-abas/status';
import { MEDIDA_STATUS, GAP_STATUS } from '../src/schemas/ropa-abas';
import { mascararPii } from '../src/services/rascunhos-privacy';

/**
 * Conteúdo FIXO da ficha em abas (enumerações do legado). Os catálogos do projeto (titulares, dados pessoais, medidas, motivos de
 * risco) NÃO têm lista aqui e nascem vazios (decisão do dono, 16/10/2026): nada neste diretório é semente de banco.
 */
const textos = (v: unknown): string[] => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(textos) : []);

describe('conteúdo fixo da ficha em abas', () => {
  it('as bases do GDPR cobrem exatamente as seis chaves do esquema, sem texto vazio', () => {
    expect(Object.keys(BASES_GDPR).sort()).toEqual([...GDPR_BASES].sort());
    for (const b of Object.values(BASES_GDPR)) { expect(b.rotulo.trim()).not.toBe(''); expect(b.texto.trim().length).toBeGreaterThan(20); }
  });
  it('escalas têm as notas de 1 a 5 sem repetição, e níveis e estratégias têm rótulo', () => {
    for (const e of [PROBABILIDADE, IMPACTO]) expect(e.map((x) => x.nota)).toEqual([1, 2, 3, 4, 5]);
    expect(Object.keys(NIVEL_ROTULO)).toEqual(['Low', 'Medium', 'High', 'Critical']);
    expect(Object.keys(ESTRATEGIA_ROTULO)).toEqual(['Accept', 'Mitigate', 'Avoid', 'Transfer']);
  });
  it('origens têm id único e rótulo', () => {
    const ids = ORIGENS_DOS_DADOS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ORIGENS_DOS_DADOS.length).toBeGreaterThanOrEqual(3);
    expect(ORIGENS_DOS_DADOS.every((o) => o.rotulo.trim())).toBe(true);
  });
  it('status de medida e de gap cobrem todos os valores do esquema', () => {
    expect(Object.keys(ROTULO_MEDIDA_STATUS)).toEqual([...MEDIDA_STATUS]);
    expect(Object.keys(ROTULO_GAP_STATUS)).toEqual([...GAP_STATUS]);
  });
  it('nenhum texto contém CPF, e-mail ou telefone, nem marca de pendência', () => {
    const todos = textos([BASES_GDPR, ORIGENS_DOS_DADOS, PROBABILIDADE, IMPACTO, NIVEL_ROTULO, ESTRATEGIA_ROTULO, SENSIVEIS_CONHECIDOS, ROTULO_MEDIDA_STATUS, ROTULO_GAP_STATUS]);
    for (const t of todos) { expect(mascararPii(t), t).toBe(t); expect(t, t).not.toMatch(/TODO|A definir|[{}]/); }
  });
  it('não existe semente de catálogo no código: o diretório de dados não exporta lista de titulares, dados, medidas nem motivos', async () => {
    const mods = import.meta.glob('../src/data/ropa-abas/*.ts');
    expect(Object.keys(mods).map((k) => k.split('/').pop()).sort()).toEqual(['escalas.ts', 'gdpr.ts', 'origens.ts', 'sensiveis.ts', 'status.ts']);
  });
});
