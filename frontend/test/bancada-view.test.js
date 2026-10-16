import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, baixarArquivo: vi.fn(), API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/monitor.js';
import { renderBancada } from '../src/views/bancada.js';
import catalogo from '../../contracts/bancada/catalogo.json';
import bancada from '../../contracts/bancada/bancada.json';
import passoJson from '../../contracts/bancada/passo.json';
import campos from '../../contracts/bancada/campos.json';

const copia = (o) => JSON.parse(JSON.stringify(o));
const tela = () => {
  // o modal único (openModal) precisa do esqueleto de login.html
  document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
  return ['c', 'h', 'a'].map((id) => document.getElementById(id));
};
const servir = ({ detalhe = passoJson, concluir = { ok: true, estado: 'concluido' } } = {}) => apiMock.mockImplementation(async (metodo, url) => {
  if (url === '/api/v1/projects') return [{ id: 'p1', client_name: 'Cliente Fictício', modulos: ['iso'] }];
  if (url === '/api/v1/passos/catalogo') return catalogo;
  if (url === '/api/v1/projects/p1/bancada') return bancada;
  if (url === '/api/v1/projects/p1/governance') return [];
  if (url === '/api/v1/projects/p1/prontidao') return { indicador: { implementados: 31, aplicaveis: 90 } };
  if (/\/passos\/p3_\d\/campos$/.test(url) && metodo === 'PUT') return campos;
  if (/\/passos\/p3_\d\/concluir$/.test(url)) return concluir;
  if (/\/passos\/p3_3$/.test(url)) return detalhe;
  if (/\/passos\/p3_4$/.test(url)) return { ...copia(passoJson), passo: { id: 'p3_4', estado: 'nao_iniciado' } };
  throw new Error(`sem dublê para ${metodo} ${url}`);
});

beforeEach(() => { vi.useFakeTimers(); apiMock.mockReset(); S.passosCatalogo = null; S.bancadaAlvo = null; S.user = { role: 'consultor' }; S.currentProject = { id: 'p1', client_name: 'Cliente Fictício' }; window.ehEquipeNess = () => true; });
afterEach(() => vi.useRealTimers());

describe('Bancada', () => {
  it('abre no continuar, com h1 do projeto, h2 da fase e h3 do passo; catálogo pedido uma vez', async () => {
    servir();
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    expect(h.textContent).toBe('Cliente Fictício');
    expect(c.querySelector('h2').textContent).toMatch(/^Fase 3/);
    expect(c.querySelector('h3').textContent).toMatch(/Passo 1 de 2/);
    expect(apiMock.mock.calls.filter(([, u]) => u === '/api/v1/passos/catalogo')).toHaveLength(1);
    // um indicador de progresso só, com a definição escrita: controles, e o plano de trabalho rotulado como tal
    expect(document.getElementById('bancada-topo').textContent).toContain('31 de 90 controles aplicáveis implementados');
    expect(document.getElementById('bancada-topo').textContent).toContain('andamento do plano de trabalho');
  });
  it('o deep link manda no continuar', async () => {
    servir();
    S.bancadaAlvo = { passo: 'p3_4' };
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    expect(c.querySelector('h3').textContent).toMatch(/Passo 2 de 2/);
    expect(S.bancadaAlvo).toBeNull();
  });
  it('o endereço acompanha o passo aberto (fase e passo na query)', async () => {
    servir();
    S.bancadaAlvo = { passo: 'p3_4' };
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    expect(window.location.search).toContain('passo=p3_4');
    expect(window.location.search).toContain('fase=3');
  });
  it('digitar grava no servidor depois de 800 ms e mostra "Salvo às"', async () => {
    servir();
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    const area = c.querySelector('#campo-justificativas');
    area.value = 'Texto novo';
    window.bancadaDigitou('justificativas', 'Texto novo');
    await vi.advanceTimersByTimeAsync(800);
    const put = apiMock.mock.calls.find(([m, u]) => m === 'PUT' && /campos$/.test(u));
    expect(put[2]).toMatchObject({ campos: { justificativas: 'Texto novo' } });
    expect(c.querySelector('#bancada-salvo').textContent).toMatch(/^Salvo às \d{2}:\d{2}/);
  });
  it('critério pendente: não conclui, não navega, diz o que falta', async () => {
    servir();
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    await window.bancadaSalvarEIr();
    expect(apiMock.mock.calls.some(([, u]) => /concluir$/.test(u))).toBe(false);
    expect(c.querySelector('#bancada-faltas').textContent).toContain('Faltam:');
    expect(c.querySelector('h3').textContent).toMatch(/Passo 1 de 2/);
  });
  it('critério cumprido: conclui e abre o passo seguinte', async () => {
    const pronto = copia(passoJson); pronto.avaliacao = { ok: true, faltam: 0, criterios: pronto.avaliacao.criterios.map((x) => ({ ...x, ok: true })) };
    servir({ detalhe: pronto });
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    await window.bancadaSalvarEIr();
    expect(apiMock.mock.calls.some(([m, u]) => m === 'POST' && /p3_3\/concluir$/.test(u))).toBe(true);
    expect(c.querySelector('h3').textContent).toMatch(/Passo 2 de 2/);
  });
  it('o servidor recusa a conclusão (409): fica no passo e mostra o que falta', async () => {
    const pronto = copia(passoJson); pronto.avaliacao = { ok: true, faltam: 0, criterios: pronto.avaliacao.criterios.map((x) => ({ ...x, ok: true })) };
    servir({ detalhe: pronto });
    const base = apiMock.getMockImplementation();
    apiMock.mockImplementation(async (m, u, ...r) => {
      if (/p3_3\/concluir$/.test(u)) throw Object.assign(new Error('Há critérios pendentes'), { status: 409, body: { faltam: [{ tipo: 'evidencia_anexada', rotulo: 'Prova anexada', ok: false }] } });
      return base(m, u, ...r);
    });
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    await window.bancadaSalvarEIr();
    expect(c.querySelector('#bancada-faltas').textContent).toContain('Prova anexada');
    expect(c.querySelector('h3').textContent).toMatch(/Passo 1 de 2/);
  });
  it('bloquear sem motivo ou sem responsável não envia', async () => {
    servir();
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    window.bancadaBloquear();
    document.getElementById('bloq-motivo').value = 'ok';
    await window.bancadaConfirmarBloqueio();
    expect(apiMock.mock.calls.some(([, u]) => /bloquear$/.test(u))).toBe(false);
    expect(document.getElementById('bloq-erro').textContent).not.toBe('');
  });
  it('projeto sem fases mostra o vazio, não a Bancada', async () => {
    servir();
    const base = apiMock.getMockImplementation();
    apiMock.mockImplementation(async (m, u, ...r) => (u === '/api/v1/projects/p1/bancada' ? { ...bancada, tem_fases: false } : base(m, u, ...r)));
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    expect(c.textContent).toContain('Fases da jornada ainda não carregadas');
    expect(c.querySelector('.bancada-cartao')).toBeNull();
  });
  it('papel de leitura não vê bloquear nem exceção', async () => {
    servir();
    window.ehEquipeNess = () => false; S.user = { role: 'org_user' };
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    expect(c.textContent).not.toContain('Bloquear este passo');
    expect(c.textContent).not.toContain('Concluir com exceção');
  });
  it('trocar de passo grava antes o que estava pendente', async () => {
    servir();
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    window.bancadaDigitou('justificativas', 'a meio');
    await window.bancadaIrParaPasso('p3_4');
    expect(apiMock.mock.calls.findIndex(([m, u]) => m === 'PUT' && /p3_3\/campos$/.test(u))).toBeLessThan(apiMock.mock.calls.findIndex(([, u]) => /passos\/p3_4$/.test(u)));
  });
  it('conflito 409: mostra quem alterou e "Usar o dele" põe o texto dele no campo', async () => {
    servir();
    const conflitos = [{ campo: 'justificativas', valor_atual: 'Texto dele', atualizado_em: '2026-10-15 14:00:00', por: 'ana@exemplo.test' }];
    const base = apiMock.getMockImplementation();
    apiMock.mockImplementation(async (m, u, ...r) => {
      if (m === 'PUT' && /campos$/.test(u)) throw Object.assign(new Error('Outra pessoa alterou este campo'), { status: 409, body: { conflitos } });
      return base(m, u, ...r);
    });
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    window.bancadaDigitou('justificativas', 'Meu texto');
    await vi.advanceTimersByTimeAsync(800);
    expect(document.getElementById('modal-content').textContent).toContain('ana@exemplo.test alterou este campo');
    await window.bancadaResolverConflito('justificativas', 'dele');
    expect(document.getElementById('campo-justificativas').value).toBe('Texto dele');
  });
  it('falha de rede esgotada mostra o aviso e o botão "Tentar agora"', async () => {
    servir();
    const base = apiMock.getMockImplementation();
    apiMock.mockImplementation(async (m, u, ...r) => {
      if (m === 'PUT' && /campos$/.test(u)) throw new Error('rede');
      return base(m, u, ...r);
    });
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    window.bancadaDigitou('justificativas', 'x');
    await vi.advanceTimersByTimeAsync(800 + 2000 + 2000);
    expect(c.querySelector('#bancada-salvo').textContent).toContain('Não foi possível salvar');
    expect(c.querySelector('#bancada-tentar').hidden).toBe(false);
  });
  it('registrar como prova monta o registro, deixa conferir e só anexa ao aceitar', async () => {
    servir();
    const [c, h, a] = tela();
    await renderBancada(c, h, a);
    window.bancadaRegistrarProva();
    const texto = document.getElementById('bancada-rascunho-texto');
    expect(texto.value).toContain('## Quais controles ficam de fora e por quê?');
    expect(apiMock.mock.calls.some(([, u]) => /approve-document$/.test(u))).toBe(false);
  });
});
