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

const passo2 = {
  ...catalogo.passos[0],
  campos: [
    { id: 'justificativas', rotulo: 'Justificativas', tipo: 'texto_longo', obrigatorio: true, exemplo: 'A.7.4: sem acesso físico.' },
    { id: 'prazo', rotulo: 'Prazo', tipo: 'data', obrigatorio: false, exemplo: '2026-11-05' },
    { id: 'nivel', rotulo: 'Nível', tipo: 'escolha', obrigatorio: false, exemplo: 'Alto', opcoes: ['Alto', 'Baixo'] },
    { id: 'aprovado_por', rotulo: 'Quem aprovou?', tipo: 'texto', obrigatorio: true, exemplo: 'Nome e cargo.', semIA: true },
  ],
};
let focados;
const monta2 = (extra = {}) => {
  document.body.innerHTML = '<aside id="el"></aside>';
  aceitos = []; focados = [];
  montarCopiloto({ el: document.getElementById('el'), projectId: 'p1', passo: passo2, podeUsar: true, valoresAtuais: () => ({}), aoAceitar: (c, v) => aceitos.push([c, v]), focarCampo: (id) => focados.push(id), ...extra });
};
const CONVERSA = 'O cliente disse que a revisão é trimestral e que o time é remoto.';
const escreve = (txt) => { const t = document.getElementById('copiloto-conversa'); t.value = txt; window.bancadaCopilotoContar(); };
const texto = () => document.getElementById('el').textContent;

describe('painel do copiloto (modo conversa)', () => {
  it('caixa com contador em texto, sem limite escondido, e o contador acompanha o que se digita', () => {
    monta2();
    expect(document.getElementById('copiloto-conversa').hasAttribute('maxlength')).toBe(false);
    expect(document.querySelector('label[for="copiloto-conversa"]').textContent).toContain('O que o cliente disse');
    expect(document.getElementById('copiloto-contador').textContent).toBe('0 de 8.000');
    escreve('a'.repeat(1234));
    expect(document.getElementById('copiloto-contador').textContent).toBe('1.234 de 8.000');
    expect([...document.querySelectorAll('button')].map((b) => b.textContent)).toContain('Escrever a partir da conversa');
  });
  it('menos de 20 ou mais de 8.000 caracteres: explica e não chama o servidor', async () => {
    monta2();
    escreve('curta');
    await window.bancadaCopilotoConversa();
    expect(texto()).toContain('pelo menos 20 caracteres');
    escreve('a'.repeat(8001));
    await window.bancadaCopilotoConversa();
    expect(texto()).toContain('passa de 8.000 caracteres');
    expect(apiMock).not.toHaveBeenCalled();
    expect(document.getElementById('copiloto-conversa').value).toHaveLength(8001);
  });
  it('uma proposta por campo, com Aceitar e Descartar; o que o cliente não falou é listado; nada grava sem Aceitar', async () => {
    apiMock.mockResolvedValue({ ok: true, propostas: { justificativas: 'Revisão trimestral.', nivel: 'Alto' }, nao_encontrado: ['prazo'], avisos: ['A conversa cita "saúde".'] });
    monta2({ valoresAtuais: () => ({ nivel: 'Baixo' }) });
    escreve(CONVERSA);
    await window.bancadaCopilotoConversa();
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/passos/p3_3/copiloto/da-conversa', { conversa: CONVERSA }, { timeoutMs: 60000 });
    expect(document.querySelectorAll('.bancada-proposta')).toHaveLength(2);
    expect(texto()).toContain('Proposta do assistente');
    expect(texto()).toContain('O cliente não falou de: Prazo');
    expect(texto()).toContain('A conversa cita "saúde".');
    expect(texto()).toContain('Substitui o texto atual: Baixo');
    expect(aceitos).toHaveLength(0);
    const rotulos = [...document.querySelectorAll('button')].map((b) => b.textContent);
    expect(rotulos.filter((r) => r === 'Aceitar')).toHaveLength(2);
    expect(rotulos).toContain('Aceitar todas');
    expect(rotulos).toContain('Descartar todas');
    expect(document.getElementById('copiloto-conversa').value).toBe(CONVERSA);
  });
  it('Aceitar uma entrega só aquela; Descartar uma tira só aquela', async () => {
    apiMock.mockResolvedValue({ ok: true, propostas: { justificativas: 'A', prazo: '2026-11-05', nivel: 'Alto' }, nao_encontrado: [], avisos: [] });
    monta2();
    escreve(CONVERSA);
    await window.bancadaCopilotoConversa();
    window.bancadaCopilotoAceitarUma('justificativas');
    expect(aceitos).toEqual([['justificativas', 'A']]);
    window.bancadaCopilotoDescartarUma('prazo');
    expect(aceitos).toHaveLength(1);
    expect(document.querySelectorAll('.bancada-proposta')).toHaveLength(1);
    expect(texto()).toContain('Nível');
  });
  it('Aceitar todas entrega todas na ordem do passo; Descartar todas não entrega nada', async () => {
    apiMock.mockResolvedValue({ ok: true, propostas: { nivel: 'Alto', justificativas: 'A' }, nao_encontrado: [], avisos: [] });
    monta2();
    escreve(CONVERSA);
    await window.bancadaCopilotoConversa();
    window.bancadaCopilotoAceitarTodas();
    expect(aceitos).toEqual([['justificativas', 'A'], ['nivel', 'Alto']]);
    expect(document.querySelector('.bancada-proposta')).toBeNull();
    await window.bancadaCopilotoConversa();
    window.bancadaCopilotoDescartarTodas();
    expect(aceitos).toHaveLength(2);
    expect(document.querySelector('.bancada-proposta')).toBeNull();
  });
  it('proposta de campo semIA ou fora do passo nunca aparece; texto da IA é escapado; indisponível mantém a escrita manual', async () => {
    apiMock.mockResolvedValueOnce({ ok: true, propostas: { aprovado_por: 'Maria', inexistente: 'x', justificativas: '<img src=x onerror=alert(1)>' }, nao_encontrado: [], avisos: [] });
    monta2();
    escreve(CONVERSA);
    await window.bancadaCopilotoConversa();
    expect(document.querySelectorAll('.bancada-proposta')).toHaveLength(1);
    expect(texto()).not.toContain('Maria');
    expect(document.querySelector('#el img')).toBeNull();
    apiMock.mockResolvedValueOnce({ indisponivel: true });
    await window.bancadaCopilotoConversa();
    expect(texto()).toContain('O assistente não está disponível agora');
    expect(document.getElementById('copiloto-conversa').value).toBe(CONVERSA);
  });
  it('o texto da conversa sobrevive a um rascunho de campo', async () => {
    apiMock.mockResolvedValue({ indisponivel: true });
    monta2();
    escreve(CONVERSA);
    await window.bancadaCopilotoRascunhar();
    expect(document.getElementById('copiloto-conversa').value).toBe(CONVERSA);
  });
});

describe('painel do copiloto (modo revisão de auditor)', () => {
  const revisao = {
    ok: true, resumo: 'Falta a data da revisão.', rotulo: 'Revisão assistida; não é parecer de certificação',
    pontos: [
      { severidade: 'critico', alvo: { tipo: 'campo', id: 'justificativas' }, o_que_o_auditor_questionaria: 'Quem revisou?', por_que: 'Sem responsável <b>x</b>.' },
      { severidade: 'alto', alvo: { tipo: 'prova', id: 'prova' }, o_que_o_auditor_questionaria: 'Onde está o arquivo?', por_que: 'Nada anexado.' },
      { severidade: 'medio', alvo: { tipo: 'criterio', id: 'evidencia_anexada' }, o_que_o_auditor_questionaria: 'Falta a prova?', por_que: 'O critério não passa.' },
    ],
  };
  it('o rótulo de revisão assistida está sempre visível, e o botão existe', () => {
    monta2();
    expect(texto()).toContain('Revisão assistida; não é parecer de certificação');
    expect([...document.querySelectorAll('button')].map((b) => b.textContent)).toContain('Revisão de auditor');
  });
  it('lista os pontos com a severidade em texto; cada um leva o foco ao alvo; nada é gravado', async () => {
    apiMock.mockResolvedValue(revisao);
    monta2();
    await window.bancadaCopilotoRevisao();
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/projects/p1/passos/p3_3/copiloto/revisao', {}, { timeoutMs: 60000 });
    expect(texto()).toContain('Falta a data da revisão.');
    const itens = [...document.querySelectorAll('#el li')];
    expect(itens).toHaveLength(3);
    expect(itens[0].textContent).toContain('Crítico');
    expect(itens[0].textContent).toContain('Campo: Justificativas');
    expect(itens[1].textContent).toContain('Alto');
    expect(itens[2].textContent).toContain('Médio');
    expect(document.querySelector('#el li b')).toBeNull();
    const botoes = [...document.querySelectorAll('#el li button')];
    expect(botoes.map((b) => b.textContent)).toEqual(['Ir ao campo', 'Ir à prova', 'Ir ao critério']);
    window.bancadaCopilotoIrAo('campo', 'justificativas');
    window.bancadaCopilotoIrAo('prova', 'prova');
    window.bancadaCopilotoIrAo('criterio', 'evidencia_anexada');
    expect(focados).toEqual(['justificativas', 'prova', 'criterio:evidencia_anexada']);
    expect(aceitos).toHaveLength(0);
    expect(texto()).toContain('Revisão assistida; não é parecer de certificação');
  });
  it('sem pontos, indisponível e erro de rede', async () => {
    apiMock.mockResolvedValueOnce({ ...revisao, pontos: [] });
    monta2();
    await window.bancadaCopilotoRevisao();
    expect(texto()).toContain('Nenhum ponto apontado');
    apiMock.mockResolvedValueOnce({ indisponivel: true });
    await window.bancadaCopilotoRevisao();
    expect(texto()).toContain('O assistente não está disponível agora');
    apiMock.mockRejectedValueOnce(new Error('Sem conexão'));
    await window.bancadaCopilotoRevisao();
    expect(texto()).toContain('Sem conexão');
  });
});
