import { describe, it, expect } from 'vitest';
import { htmlDaTrilha } from '../src/bancada/trilha.js';
import { indexarCatalogo } from '../src/bancada/estado.js';
import catalogo from '../../contracts/bancada/catalogo.json';
import bancada from '../../contracts/bancada/bancada.json';

const ind = indexarCatalogo(catalogo);
const monta = (atual, extra = {}) => {
  const el = document.createElement('div');
  el.innerHTML = htmlDaTrilha(ind, { ...bancada, ...extra }, atual);
  return el;
};

describe('trilha', () => {
  it('é um nav rotulado; etapas, fases e passos são botões de verdade', () => {
    const el = monta('p3_3');
    const nav = el.querySelector('nav');
    expect(nav.getAttribute('aria-label')).toBe('Trilha da jornada');
    expect(el.querySelectorAll('button').length).toBeGreaterThan(3);
    expect(el.querySelectorAll('a,[role=button],[onclick]').length).toBe(0);
  });
  it('só a etapa do passo atual está aberta; o passo atual leva aria-current="step"', () => {
    const el = monta('p3_3');
    expect(el.querySelectorAll('[aria-current="step"]').length).toBe(1);
    expect(el.querySelector('[aria-current="step"]').getAttribute('data-args')).toContain('p3_3');
    const abertas = [...el.querySelectorAll('[data-etapa][aria-expanded]')].filter((b) => b.getAttribute('aria-expanded') === 'true');
    expect(abertas).toHaveLength(1);
  });
  it('estado em texto, nunca só cor; bloqueio mostra o motivo logo abaixo da fase', () => {
    const el = monta('p3_3', { fases: [{ ...bancada.fases[0], situacao: 'blocked', bloqueio: { motivo: 'Aguardando a diretoria', responsavel: 'Maria' } }] });
    expect(el.textContent).toContain('Bloqueada');
    expect(el.textContent).toContain('Aguardando a diretoria');
  });
  it('escapa o que vem do banco', () => {
    const el = monta('p3_3', { fases: [{ ...bancada.fases[0], situacao: 'blocked', bloqueio: { motivo: '<img src=x onerror=alert(1)>', responsavel: 'M' } }] });
    expect(el.querySelector('img')).toBeNull();
  });
});
