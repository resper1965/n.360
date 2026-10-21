// Copiloto por etapa (PR2, D2.3): o rascunho é PROPOSTA. Nada grava sem Aceitar; Aceitar copia para o campo e o autosave da etapa grava.
// Dados fictícios; `fetch` dublado com o molde de servir-api.js.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { S } from '../src/state.js';
import { botaoRascunho, ligarRascunho, podeRascunho } from '../src/atividade/copiloto-etapa.js';
import { limparAutosaves } from '../src/atividade/estado.js';
import { B, prepararDom, chamadas, corpoDe, esperar } from './helpers-atividade.js';
import { servir } from './servir-api.js';

const ROTA = `POST ${B}/etapas/uso/rascunho`;
const ctx = { pid: 'p9', rid: 'r1', editavel: true };

/** Monta o bloco da etapa como a tela faz: o botão e a área de saída, dentro de um corpo com o campo da descrição. */
function montar(extra = {}) {
    document.body.innerHTML = `<div id="corpo"><textarea id="et-desc-uso" data-campo="descricao" rows="3">Descrição escrita</textarea>
        ${botaoRascunho('uso', { editavel: true, nao_aplicavel: false, ...extra })}
        <fieldset><input type="checkbox" data-origem value="titular" id="o-titular"><input type="checkbox" data-origem value="sistema" id="o-sistema"></fieldset></div>`;
    const corpo = document.getElementById('corpo');
    ligarRascunho(corpo, 'uso', ctx);
    return corpo;
}
const botao = () => document.querySelector('[data-copiloto="rascunhar"]');
const campo = () => document.getElementById('et-desc-uso');

beforeEach(() => { prepararDom(); S.user = { role: 'consultor' }; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); limparAutosaves(); });

describe('quem pode pedir o rascunho', () => {
    it('equipe da consultoria e administrador do cliente veem o botão; cliente comum não', () => {
        S.user = { role: 'consultor' };
        expect(podeRascunho()).toBe(true);
        expect(botaoRascunho('uso', { editavel: true })).toContain('Rascunhar a descrição desta etapa');
        S.user = { role: 'org_admin' };
        expect(podeRascunho()).toBe(true);
        S.user = { role: 'org_user' };
        expect(podeRascunho()).toBe(false);
        expect(botaoRascunho('uso', { editavel: true })).toBe('');
    });

    it('etapa só de leitura (cancelada ou Não Aplicável): sem botão', () => {
        expect(botaoRascunho('uso', { editavel: false })).toBe('');
        expect(botaoRascunho('uso', { editavel: true, nao_aplicavel: true })).toBe('');
    });
});

describe('proposta do assistente', () => {
    it('clicar pede o rascunho e mostra a proposta marcada, sem gravar nada', async () => {
        montar();
        const f = servir({
            [ROTA]: { descricao: 'Usamos o sistema para calcular a folha mensal.', origem: [], avisos: [], perguntas_a_confirmar: [] },
        });
        vi.stubGlobal('fetch', f);
        botao().click();
        await esperar(() => expect(document.querySelector('[data-copiloto-saida]').textContent).toContain('Proposta do assistente: confira'));
        expect(document.querySelector('[data-copiloto-saida]').textContent).toContain('Usamos o sistema para calcular a folha mensal.');
        expect(chamadas(f)).toEqual([ROTA]);
        expect(corpoDe(f, ROTA)).toEqual({});
        expect(campo().value).toBe('Descrição escrita');
    });

    it('Aceitar copia para o campo (que dispara o autosave) e marca as origens propostas; Descartar só some com a proposta', async () => {
        const corpo = montar();
        vi.stubGlobal('fetch', servir({
            [ROTA]: { descricao: 'Texto proposto.', origem: ['titular', 'nao_existe'], avisos: [], perguntas_a_confirmar: [] },
        }));
        botao().click();
        await esperar(() => expect(document.querySelector('[data-copiloto-saida]').textContent).toContain('Texto proposto.'));
        const aoDigitar = vi.fn();
        campo().addEventListener('input', aoDigitar);
        document.querySelector('[data-copiloto="aceitar"]').click();
        expect(campo().value).toBe('Texto proposto.');
        expect(aoDigitar).toHaveBeenCalledTimes(1);
        expect(document.getElementById('o-titular').checked).toBe(true);
        expect(document.getElementById('o-sistema').checked).toBe(false);
        expect(document.querySelector('[data-copiloto-saida]').textContent).toBe('');
        expect(corpo).toBeTruthy();
    });

    it('Descartar limpa a proposta e deixa o campo como estava', async () => {
        montar();
        vi.stubGlobal('fetch', servir({ [ROTA]: { descricao: 'Texto proposto.', avisos: [], perguntas_a_confirmar: [] } }));
        botao().click();
        await esperar(() => expect(document.querySelector('[data-copiloto="descartar"]')).not.toBeNull());
        document.querySelector('[data-copiloto="descartar"]').click();
        expect(document.querySelector('[data-copiloto-saida]').textContent).toBe('');
        expect(campo().value).toBe('Descrição escrita');
    });

    it('avisos aparecem como texto; as perguntas do que falta não (o "Falta preencher" do topo já diz)', async () => {
        montar();
        vi.stubGlobal('fetch', servir({ [ROTA]: { descricao: 'Texto.', avisos: ['O texto cita "atestados": responda você.'], perguntas_a_confirmar: ['Quais áreas recebem os dados?'] } }));
        botao().click();
        await esperar(() => expect(document.querySelector('[data-copiloto-saida]').textContent).toContain('atestados'));
        expect(document.querySelector('[data-copiloto-saida]').textContent).not.toContain('Quais áreas recebem os dados?');
    });

    it('a proposta vem numa caixa própria, com o texto e "Feito a partir de" com as fontes', async () => {
        montar();
        vi.stubGlobal('fetch', servir({ [ROTA]: { descricao: 'Texto proposto.', avisos: [], perguntas_a_confirmar: [], fontes: ['finalidade', '2 titulares', 'sua nota'] } }));
        botao().click();
        await esperar(() => expect(document.querySelector('.et-proposta')).not.toBeNull());
        const caixa = document.querySelector('.et-proposta');
        expect(caixa.querySelector('.et-painel-titulo').textContent).toBe('Proposta do assistente: confira');
        expect(caixa.querySelector('.et-proposta-texto').textContent).toBe('Texto proposto.');
        expect(caixa.textContent).toContain('Feito a partir de: finalidade, 2 titulares, sua nota.');
    });

    it('a nota preenchida vai no corpo do POST; em branco, o corpo segue vazio', async () => {
        montar();
        const f = servir({ [ROTA]: { descricao: 'Texto.', avisos: [], perguntas_a_confirmar: [], fontes: ['finalidade', 'sua nota'] } });
        vi.stubGlobal('fetch', f);
        const nota = document.querySelector('[data-copiloto-nota]');
        expect(nota.getAttribute('maxlength')).toBe('2000');
        expect(document.querySelector(`label[for="${nota.id}"]`).textContent).toBe('O que você sabe desta etapa (opcional)');
        nota.value = '  o RH recebe a ficha por e-mail  ';
        botao().click();
        await esperar(() => expect(document.querySelector('.et-proposta')).not.toBeNull());
        expect(corpoDe(f, ROTA)).toEqual({ nota: 'o RH recebe a ficha por e-mail' });
    });

    it('sem base: nada de proposta, só o que fazer para rascunhar, sem repetir as faltas', async () => {
        montar();
        vi.stubGlobal('fetch', servir({ [ROTA]: { avisos: [], perguntas_a_confirmar: ['Quais sistemas usam os dados nesta etapa?'], sem_base: true } }));
        botao().click();
        const saidaEl = () => document.querySelector('[data-copiloto-saida]');
        await esperar(() => expect(saidaEl().textContent).toContain('Para rascunhar, preencha antes os titulares ou os ativos desta etapa, ou escreva o que você sabe no campo acima.'));
        expect(saidaEl().querySelector('.et-proposta')).toBeNull();
        expect(saidaEl().querySelector('[data-copiloto="aceitar"]')).toBeNull();
        expect(saidaEl().textContent).not.toContain('Quais sistemas');
    });
});

describe('indisponível e erro', () => {
    it('assistente fora do ar: mensagem simples e o campo segue digitável', async () => {
        montar();
        vi.stubGlobal('fetch', servir({ [ROTA]: { indisponivel: true } }));
        botao().click();
        await esperar(() => expect(document.querySelector('[data-copiloto-saida]').textContent).toContain('O assistente não está disponível agora. Escreva a descrição.'));
        expect(campo().disabled).toBe(false);
        expect(botao().disabled).toBe(false);
    });

    it('erro de rede: aviso e o botão volta a ficar disponível', async () => {
        montar();
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('rede fora'); }));
        botao().click();
        await esperar(() => expect(botao().disabled).toBe(false));
        expect(campo().value).toBe('Descrição escrita');
    });
});
