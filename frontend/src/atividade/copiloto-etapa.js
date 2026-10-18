import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, showToast } from '../ui.js';
import { url } from './estado.js';
import { ORIGENS } from './catalogo-inline.js';

// Rascunho da descrição de UMA etapa (PR2, D2.3). É PROPOSTA: a tela mostra "Proposta do assistente: confira", com Aceitar e Descartar.
// Aceitar copia o texto para o campo e dispara `input` (o autosave da etapa grava como qualquer digitação) e marca as origens propostas
// (o `change` delas grava, como qualquer clique). Nada grava sem Aceitar. Quem pode é a equipe da consultoria e o administrador do cliente
// (o mesmo critério de `podePedirRascunho` no servidor); o servidor é a verdade e recusa o resto.

const ORIGENS_VALIDAS = new Set(ORIGENS.map(([v]) => v));
const txt = (v) => escapeHTML(v == null ? '' : v);

// Espelho de PAPEIS_NESS (src/helpers.ts): equipe da consultoria. Só decide o que MOSTRAR; o servidor barra.
const PAPEIS_EQUIPE = new Set(['consultor', 'consultant', 'platform_admin', 'consultoria_admin']);

/** Quem pode pedir: equipe da consultoria e o administrador do cliente (o critério de `podePedirRascunho`, no servidor). */
export function podeRascunho() {
    const papel = S.user && S.user.role;
    return PAPEIS_EQUIPE.has(papel) || papel === 'org_admin';
}

/** Botão secundário "Rascunhar a descrição desta etapa" e a área da proposta. Vazio para quem não pode ou em etapa travada. */
export function botaoRascunho(id, ctx) {
    if (!podeRascunho() || !ctx.editavel || ctx.nao_aplicavel) return '';
    return `<div class="et-copiloto" data-etapa-copiloto="${txt(id)}">
        <button type="button" class="btn btn-secondary btn-sm" data-copiloto="rascunhar">Rascunhar a descrição desta etapa</button>
        <div class="et-copiloto-saida" data-copiloto-saida aria-live="polite"></div></div>`;
}

const saida = (corpo) => corpo.querySelector('[data-copiloto-saida]');

function mostrarIndisponivel(caixa) {
    caixa.innerHTML = '<p class="at-ajuda" role="status">O assistente não está disponível agora. Escreva a descrição.</p>';
}

function mostrarProposta(caixa, r) {
    const avisos = (r.avisos || []).map((a) => `<li>${txt(a)}</li>`).join('');
    const perguntas = (r.perguntas_a_confirmar || []).map((p) => `<li>${txt(p)}</li>`).join('');
    caixa.innerHTML = `<section class="et-proposta" aria-label="Proposta do assistente para esta etapa">
        <h5 class="et-painel-titulo">Proposta do assistente: confira</h5>
        ${r.descricao ? `<p class="et-proposta-texto">${txt(r.descricao)}</p>` : '<p class="at-ajuda">Sem texto proposto: o contexto ainda não basta.</p>'}
        ${avisos ? `<ul class="at-ajuda" aria-label="Avisos">${avisos}</ul>` : ''}
        ${perguntas ? `<ul class="at-ajuda" aria-label="O que falta">${perguntas}</ul>` : ''}
        <div class="et-acoes"><button type="button" class="btn btn-sm" data-copiloto="aceitar">Aceitar</button>
        <button type="button" class="btn btn-ghost btn-sm" data-copiloto="descartar">Descartar</button></div></section>`;
    caixa.dataset.origem = JSON.stringify((r.origem || []).filter((o) => ORIGENS_VALIDAS.has(o)));
    caixa.dataset.texto = r.descricao || '';
}

/** Aceitar: copia o texto, dispara `input` no campo e marca as origens propostas. Só aqui há gravação, e é de quem clicou. */
function aceitar(corpo, id, caixa) {
    const campo = corpo.querySelector(`#et-desc-${id}`);
    if (campo && caixa.dataset.texto) {
        campo.value = caixa.dataset.texto;
        campo.dispatchEvent(new Event('input', { bubbles: true }));
    }
    for (const o of JSON.parse(caixa.dataset.origem || '[]')) {
        const box = Array.from(corpo.querySelectorAll('[data-origem]')).find((x) => x.value === o);
        if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    caixa.innerHTML = '';
}

/** Liga o botão da etapa. `ctx`: { pid, rid }. Um clique por vez: o botão fica desabilitado até a resposta. */
export function ligarRascunho(corpo, id, ctx) {
    corpo.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-copiloto]');
        if (!b || b.disabled) return;
        const caixa = saida(corpo);
        if (b.dataset.copiloto === 'descartar') { caixa.innerHTML = ''; return; }
        if (b.dataset.copiloto === 'aceitar') { aceitar(corpo, id, caixa); return; }
        if (b.dataset.copiloto !== 'rascunhar' || !caixa) return;
        b.disabled = true;
        try {
            const r = await api('POST', url(ctx.pid, ctx.rid, `/etapas/${id}/rascunho`), {});
            if (r && r.indisponivel) mostrarIndisponivel(caixa);
            else mostrarProposta(caixa, r || {});
        } catch (err) {
            showToast((err && err.message) || 'Não foi possível pedir o rascunho. Tente de novo.', 'error');
        } finally {
            b.disabled = false;
        }
    });
}
