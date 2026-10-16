import { describe, it, expect } from 'vitest';
import { htmlDoCartao } from '../src/bancada/cartao.js';
import { indexarCatalogo } from '../src/bancada/estado.js';
import catalogo from '../../contracts/bancada/catalogo.json';
import passoJson from '../../contracts/bancada/passo.json';

const ind = indexarCatalogo(catalogo);
const monta = (extra = {}, detalhe = passoJson) => {
  const el = document.createElement('div');
  el.innerHTML = htmlDoCartao({ ind, passo: ind.passo('p3_3'), detalhe, equipe: true, podeAdmin: true, ultimo: false, opcoesResponsavel: '<option value="">Escolha</option>', salvo: '', ...extra });
  return el;
};

describe('cartão do passo', () => {
  it('cabeçalho: h2 da fase, h3 do passo com posição, cláusula e título', () => {
    const el = monta();
    expect(el.querySelector('h2').textContent).toMatch(/^Fase 3 · /);
    expect(el.querySelector('h3').textContent).toMatch(/^Passo 1 de 2 · Cl 6\.1\.3 · /);
  });
  it('todo campo tem label ligado, exemplo no placeholder e na descrição, e "obrigatório" em texto', () => {
    const el = monta();
    const area = el.querySelector('#campo-justificativas');
    expect(el.querySelector('label[for="campo-justificativas"]').textContent).toContain('obrigatório');
    expect(area.getAttribute('placeholder')).toMatch(/^Ex\.: /);
    expect(el.querySelector('#' + area.getAttribute('aria-describedby')).textContent).toContain('Exemplo:');
    expect(area.tagName).toBe('TEXTAREA');
    expect(Number(area.getAttribute('rows'))).toBeGreaterThanOrEqual(8);
  });
  it('"concluído quando" diz feito ou falta em texto, com o detalhe', () => {
    const itens = [...monta().querySelectorAll('.bancada-criterios li')].map((li) => li.textContent);
    expect(itens.some((t) => t.includes('Feito'))).toBe(true);
    expect(itens.some((t) => t.includes('Falta') && t.includes('nenhum arquivo ligado a este passo'))).toBe(true);
  });
  it('um só primário; último passo troca o texto; sem estilo inline', () => {
    expect(monta().querySelectorAll('.btn-primary')).toHaveLength(1);
    expect(monta().querySelector('.btn-primary').textContent).toBe('Salvar e ir ao próximo passo');
    expect(monta({ ultimo: true }).querySelector('.btn-primary').textContent).toBe('Salvar e ver a prontidão');
    expect(monta().innerHTML).not.toContain('style=');
  });
  it('papel sem direito não vê bloquear nem exceção; equipe vê as duas', () => {
    const leitor = monta({ equipe: false, podeAdmin: false }).textContent;
    expect(leitor).not.toContain('Bloquear este passo');
    expect(leitor).not.toContain('Concluir com exceção');
    const equipe = monta().textContent;
    expect(equipe).toContain('Bloquear este passo');
    expect(equipe).toContain('Concluir com exceção');
  });
  it('escapa o que vem do banco e marca o valor herdado', () => {
    const det = JSON.parse(JSON.stringify(passoJson));
    det.valores.justificativas = { valor: '<img src=x onerror=alert(1)>', atualizado_em: null, por: null, herdado: true };
    const el = monta({}, det);
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('Veio do preenchimento anterior');
  });
  it('passo bloqueado mostra quem e por quê e oferece desbloquear', () => {
    const det = JSON.parse(JSON.stringify(passoJson));
    det.passo.estado = 'bloqueado';
    det.bloqueio = { motivo: 'Aguardando a diretoria', responsavel: 'Maria Souza', em: '2026-10-15 09:00:00' };
    const t = monta({}, det).textContent;
    expect(t).toContain('Bloqueado por Maria Souza: Aguardando a diretoria');
    expect(t).toContain('Desbloquear este passo');
  });
});
