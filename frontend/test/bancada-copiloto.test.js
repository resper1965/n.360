import { describe, it, expect, vi, beforeEach } from 'vitest';
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock }));
import '../src/ui.js';
import { montarCopiloto } from '../src/bancada/copiloto.js';
import catalogo from '../../contracts/bancada/catalogo.json';
import resposta from '../../contracts/bancada/copiloto-campo.json';

const passo = { ...catalogo.passos[0], campos: [...catalogo.passos[0].campos, { id: 'aprovado_por', rotulo: 'Quem aprovou?', tipo: 'texto', obrigatorio: true, exemplo: 'Nome e cargo.', semIA: true }] };
let aceitos;
const monta = (extra = {}) => {
  document.body.innerHTML = '<aside id="el"></aside>';
  aceitos = [];
  montarCopiloto({ el: document.getElementById('el'), projectId: 'p1', passo, podeUsar: true, valoresAtuais: () => ({ justificativas: '' }), aoAceitar: (c, v) => aceitos.push([c, v]), focarCampo: () => {}, ...extra });
};
beforeEach(() => apiMock.mockReset());

describe('painel do copiloto (modo rascunhar campo)', () => {
  it('sem direito: explica e não oferece botão', () => {
    monta({ podeUsar: false });
    expect(document.getElementById('el').textContent).toContain('pedido pela equipe da consultoria');
    expect(document.querySelectorAll('button')).toHaveLength(0);
  });
  it('campo semIA não é oferecido', () => {
    monta();
    expect([...document.querySelectorAll('#copiloto-campo option')].map((o) => o.value)).toEqual(['justificativas']);
  });
  it('mostra a proposta marcada, com as fontes; só Aceitar entrega o texto', async () => {
    apiMock.mockResolvedValue({ ...resposta, proposta: { campo: 'justificativas', valor: 'Texto proposto', fontes: [{ id: 'emp', rotulo: 'Dados da empresa' }] }, avisos: [] });
    monta();
    await window.bancadaCopilotoRascunhar();
    const el = document.getElementById('el');
    expect(el.textContent).toContain('Proposta do assistente');
    expect(el.textContent).toContain('Com base em: Dados da empresa');
    expect(aceitos).toHaveLength(0);
    window.bancadaCopilotoAceitar();
    expect(aceitos).toEqual([['justificativas', 'Texto proposto']]);
    expect(el.textContent).not.toContain('Texto proposto');
  });
  it('Descartar não entrega nada', async () => {
    apiMock.mockResolvedValue({ ok: true, proposta: { campo: 'justificativas', valor: 'x', fontes: [] }, avisos: ['Sem base nos dados do projeto: revise com atenção.'] });
    monta();
    await window.bancadaCopilotoRascunhar();
    window.bancadaCopilotoDescartar();
    expect(aceitos).toHaveLength(0);
    expect(document.querySelector('.bancada-proposta')).toBeNull();
  });
  it('indisponível: texto simples; texto vindo da IA é escapado', async () => {
    apiMock.mockResolvedValueOnce({ indisponivel: true });
    monta();
    await window.bancadaCopilotoRascunhar();
    expect(document.getElementById('el').textContent).toContain('O assistente não está disponível agora');
    apiMock.mockResolvedValueOnce({ ok: true, proposta: { campo: 'justificativas', valor: '<img src=x onerror=alert(1)>', fontes: [] }, avisos: [] });
    await window.bancadaCopilotoRascunhar();
    expect(document.querySelector('#el img')).toBeNull();
  });
  it('erro de rede ou resposta sem proposta: mensagem, e a escrita manual segue', async () => {
    apiMock.mockRejectedValueOnce(new Error('Sem conexão'));
    monta();
    await window.bancadaCopilotoRascunhar();
    expect(document.getElementById('el').textContent).toContain('Sem conexão');
    apiMock.mockResolvedValueOnce({ ok: true, avisos: ['O assistente não conseguiu uma proposta válida para este campo (opção fora da lista). Escreva você.'] });
    await window.bancadaCopilotoRascunhar();
    expect(document.getElementById('el').textContent).toContain('Escreva você');
    expect(document.querySelector('#copiloto-campo')).not.toBeNull();
  });
  it('campo já preenchido: avisa que Aceitar substitui o texto atual', async () => {
    apiMock.mockResolvedValue({ ok: true, proposta: { campo: 'justificativas', valor: 'Novo', fontes: [] }, avisos: [] });
    monta({ valoresAtuais: () => ({ justificativas: 'Texto que a pessoa já escreveu' }) });
    await window.bancadaCopilotoRascunhar();
    expect(document.getElementById('el').textContent).toContain('Aceitar substitui o texto atual: Texto que a pessoa já escreveu');
  });
});
