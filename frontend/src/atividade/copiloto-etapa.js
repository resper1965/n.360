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

// Teto da nota: o mesmo de `etapaRascunhoSchema` (src/schemas/ropa-abas.ts).
const MAX_NOTA = 2000;

// Espelho de PAPEIS_NESS (src/helpers.ts): equipe da consultoria. Só decide o que MOSTRAR; o servidor barra.
const PAPEIS_EQUIPE = new Set(['consultor', 'consultant', 'platform_admin', 'consultoria_admin']);

/** Quem pode pedir: equipe da consultoria e o administrador do cliente (o critério de `podePedirRascunho`, no servidor). */
export function podeRascunho() {
    const papel = S.user && S.user.role;
    return PAPEIS_EQUIPE.has(papel) || papel === 'org_admin';
}

/** Nota opcional, botão secundário "Rascunhar a descrição desta etapa" e a área da proposta. Vazio para quem não pode ou em etapa travada. */
export function botaoRascunho(id, ctx) {
    if (!podeRascunho() || !ctx.editavel || ctx.nao_aplicavel) return '';
    return `<div class="et-copiloto" data-etapa-copiloto="${txt(id)}">
        <div class="form-group"><label class="form-label" for="et-nota-${txt(id)}">O que você sabe desta etapa (opcional)</label>
            <textarea class="form-input" id="et-nota-${txt(id)}" data-copiloto-nota rows="2" maxlength="${MAX_NOTA}" aria-describedby="et-nota-${txt(id)}-ajuda"></textarea>
            <p class="at-ajuda" id="et-nota-${txt(id)}-ajuda">Ex.: o RH recebe a ficha do colaborador por e-mail</p></div>
        <div class="et-acoes"><button type="button" class="btn btn-secondary btn-sm" data-copiloto="rascunhar">Rascunhar a descrição desta etapa</button></div>
        <div class="et-copiloto-saida" data-copiloto-saida aria-live="polite"></div></div>`;
}

const saida = (corpo) => corpo.querySelector('[data-copiloto-saida]');

function mostrarIndisponivel(caixa) {
    caixa.innerHTML = '<p class="at-ajuda" role="status">O assistente não está disponível agora. Escreva a descrição.</p>';
}

function mostrarSemBase(caixa) {
    caixa.innerHTML = '<p class="at-ajuda" role="status">Para rascunhar, preencha antes os titulares ou os ativos desta etapa, ou escreva o que você sabe no campo acima.</p>';
}

// `perguntas_a_confirmar` não aparece: cada uma é uma falta (titulares, ativos, áreas, parceiros) que o "Falta preencher" do topo já mostra.
function mostrarProposta(caixa, r) {
    const avisos = (r.avisos || []).map((a) => `<li>${txt(a)}</li>`).join('');
    const fontes = (r.fontes || []).length ? `<p class="at-ajuda">Feito a partir de: ${txt(r.fontes.join(', '))}.</p>` : '';
    caixa.innerHTML = `<section class="et-proposta" aria-label="Proposta do assistente para esta etapa">
        <h5 class="et-painel-titulo">Proposta do assistente: confira</h5>
        ${r.descricao ? `<p class="et-proposta-texto">${txt(r.descricao)}</p>` : '<p class="at-ajuda">Sem texto proposto: o contexto ainda não basta.</p>'}
        ${fontes}
        ${avisos ? `<ul class="at-ajuda" aria-label="Avisos">${avisos}</ul>` : ''}
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
            const nota = (corpo.querySelector('[data-copiloto-nota]')?.value || '').trim();
            const r = await api('POST', url(ctx.pid, ctx.rid, `/etapas/${id}/rascunho`), nota ? { nota } : {});
            if (r && r.indisponivel) mostrarIndisponivel(caixa);
            else if (r && r.sem_base) mostrarSemBase(caixa);
            else mostrarProposta(caixa, r || {});
        } catch (err) {
            showToast((err && err.message) || 'Não foi possível pedir o rascunho. Tente de novo.', 'error');
        } finally {
            b.disabled = false;
        }
    });
}
