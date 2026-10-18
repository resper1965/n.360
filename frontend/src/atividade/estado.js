import { S } from '../state.js';
import { api } from '../api.js';
import { ABAS } from './contrato.js';
import { criarAutosave } from '../bancada/autosave.js';
import { escapeHTML } from '../ui.js';
import { podeEditar as equipeEdita } from '../views/tratamento-ligacoes.js';

// Estado e acesso à API da ficha em abas (spec 2026-10-16). Toda regra é do servidor; aqui só se lê, se grava e se mostra.

export const url = (pid, rid, sufixo = '') => `/api/v1/projects/${pid}/ropa/${rid}${sufixo}`;

/** A ficha (cabeçalho, situação, ações, estado de cada aba) fica em `S.atividadeFicha`. */
export async function carregarFicha(pid, rid) {
    const ficha = await api('GET', url(pid, rid, '/ficha'));
    S.atividadeFicha = ficha;
    return ficha;
}

/**
 * A linha inteira do registro (volume, processamento, papéis, transferência...): a ficha só traz o cabeçalho, e o contrato congelado
 * não tem GET de escopo. A lista do projeto devolve `r.*`, inclusive as colunas da 0079.
 */
export async function carregarRegistro(pid, rid) {
    const lista = await api('GET', `/api/v1/projects/${pid}/ropa`);
    return (Array.isArray(lista) ? lista : []).find((r) => r.id === rid) || null;
}

export function abaDoEndereco(loc = window.location) {
    const id = new URLSearchParams(loc.search).get('aba');
    return ABAS.some((a) => a.id === id) ? id : 'escopo';
}

/** `replaceState`: trocar de aba não empilha histórico. */
export function gravarAbaNoEndereco(id) {
    const u = new URL(window.location.href);
    u.searchParams.set('aba', id);
    window.history.replaceState(null, '', u);
}

/** Equipe da consultoria (as mesmas funções de tratamento-ligacoes.js) e o administrador do cliente. */
export const podeEditar = equipeEdita;
export const podeEscrever = (ficha) => (podeEditar() || (!!S.user && S.user.role === 'org_admin')) && !(ficha && ficha.situacao && ficha.situacao.codigo === 'cancelada');

export const lista = (r) => (Array.isArray(r) ? r : []);
export const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// ─── autosave: um por campo-grupo, todos esvaziados antes de trocar de aba ───
const vivos = new Set();

/** Grava o que estiver pendente em todos os autosaves da tela (antes de trocar de aba ou de sair). */
export async function esvaziarTudo() { await Promise.all([...vivos].map((a) => a.esvaziar())); }
export function limparAutosaves() { vivos.clear(); }

const TEXTO_SITUACAO = {
    salvando: () => 'Salvando...',
    salvo: (e) => `Salvo às ${hora(e.salvoEm)}`,
    repetindo: () => 'Sem conexão. Tentando de novo...',
    erro: (e) => e.mensagem,
};

/**
 * Autosave de um bloco de campos da ficha. `rota` é o sufixo do PUT (`/escopo`, `/agentes`, `/ciclo`...), ou `caminho` inteiro; `status` é o elemento
 * `role="status"` que mostra "Salvo às HH:MM". Conflito (409, atividade cancelada) mostra a mensagem do servidor.
 */
export function novoAutosave({ pid, rid, rota = '/escopo', caminho, status, montar = (lote) => lote }) {
    let mensagem409 = '';
    const escreve = (t) => { if (status) status.textContent = t; };
    const a = criarAutosave({
        salvar: async (lote) => {
            try { await api('PUT', caminho || url(pid, rid, rota), montar(lote)); } catch (e) { if (e && e.status === 409) mensagem409 = e.message; throw e; }
            return { salvo_em: new Date().toISOString() };
        },
        aoMudar: (e) => escreve(e.situacao === 'conflito' ? mensagem409 : (TEXTO_SITUACAO[e.situacao] || (() => ''))(e)),
    });
    vivos.add(a);
    return a;
}

/** Grava já (clique de caixa de marcar, escolha de rádio) e escreve o resultado no `role="status"` da aba. */
export async function gravarAgora({ pid, rid, rota, corpo, status }) {
    const escreve = (t) => { if (status) status.textContent = t; };
    escreve('Salvando...');
    try { await api('PUT', url(pid, rid, rota), corpo); } catch (e) { escreve((e && e.message) || 'Não foi possível salvar.'); return false; }
    escreve(`Salvo às ${hora(new Date().toISOString())}`);
    return true;
}

/**
 * Campo com rótulo visível e ajuda em TEXTO (sem ícone "?"), ligados por aria-describedby. `tipo`: input | textarea | select.
 * `opcoes` = [[valor, rótulo]] para select. Obrigatório vai escrito no rótulo, nunca só em cor ou asterisco.
 */
export function campo({ id, rotulo, ajuda = '', tipo = 'input', valor = '', opcoes = [], travado = false, obrigatorio = false, max = 500 }) {
    const desc = [ajuda && `${id}-ajuda`, `${id}-erro`].filter(Boolean).join(' ');
    const trava = travado ? ' disabled' : '';
    const ctl = tipo === 'textarea'
        ? `<textarea class="form-input" id="${id}" rows="3" maxlength="${max}" aria-describedby="${desc}"${trava}>${escapeHTML(valor)}</textarea>`
        : tipo === 'select'
            ? `<select class="form-input" id="${id}" aria-describedby="${desc}"${trava}>${opcoes.map(([v, r]) => `<option value="${escapeHTML(v)}"${v === valor ? ' selected' : ''}>${escapeHTML(r)}</option>`).join('')}</select>`
            : `<input class="form-input" id="${id}" maxlength="${max}" value="${escapeHTML(valor)}" aria-describedby="${desc}"${trava}>`;
    return `<div class="form-group"><label class="form-label" for="${id}">${escapeHTML(rotulo)}${obrigatorio ? ' (obrigatório)' : ''}</label>${ctl}
        ${ajuda ? `<p class="at-ajuda" id="${id}-ajuda">${escapeHTML(ajuda)}</p>` : ''}<p class="at-erro" id="${id}-erro" aria-live="polite"></p></div>`;
}

/** Cabeça padrão de cada aba: o `role="status"` onde "Salvo às HH:MM" aparece. */
export const faixaSalvo = () => '<p class="at-salvo" id="at-salvo" role="status"></p>';
