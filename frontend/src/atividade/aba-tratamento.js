import { api } from '../api.js';
import { openModal, escapeHTML, showToast } from '../ui.js';
import { ETAPAS } from './contrato.js';
import { url, esvaziarTudo } from './estado.js';
import { corpoDaEtapa, ligarEtapa, situacaoDaEtapa } from './etapas.js';

// Aba Tratamento de Dados (spec 2026-10-16, seção 5): resumo das seis etapas em duas colunas (Concluído e Não Aplicável), um
// acordeão por etapa e "Ver o fluxo" (o diagrama Mermaid que o servidor deriva). Contrato de aba da casca: `montar(painel, ctx)`,
// devolve `{ esvaziar }` para a casca gravar o que estiver pendente antes de trocar de aba. Não há botão "Salvar" nesta aba.

// Chevron funcional do acordeão (gira com aria-expanded), mesmo traço dos ícones da casca.
const CHEVRON = '<svg class="at-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>';
// Pergunta do guiado (`coleta.<campo>`) para o controle que a responde; o resto cai na descrição da etapa.
const ALVO_DO_CAMPO = {
    titulares: (e) => `#at-et-${e}-titulares [data-acao="add-titular"]`,
    dados: (e) => `#at-et-${e}-titulares button`,
    consentimento_e_criancas: (e) => `#at-et-c-${e} [data-bool="solicita_consentimento"]`,
    ativos: (e) => `#at-et-${e}-ativos [data-acao="add-ativo"]`,
};

export async function montar(painel, ctx) {
    const { projectId: pid, ropaId: rid } = ctx;
    const abertas = new Set();
    let etapas = [];

    try {
        etapas = (await api('GET', url(pid, rid, '/etapas'))).etapas || [];
    } catch (e) {
        painel.innerHTML = `<p class="at-erro" role="alert">Não foi possível carregar o Tratamento de Dados. Tente de novo.</p>
            <div class="et-acoes"><button type="button" class="btn btn-sm" data-action="atRepintar">Tentar de novo</button></div>`;
        return undefined;
    }

    async function recarregar() {
        await esvaziarTudo();
        try { etapas = (await api('GET', url(pid, rid, '/etapas'))).etapas || []; } catch (e) { showToast('Não foi possível atualizar as etapas. Tente de novo.', 'error'); }
        desenhar();
    }

    function desenhar() {
        // As seis etapas sempre existem na tela, mesmo que o servidor não as mande (vira "pendente" sem dado).
        const porId = {};
        ETAPAS.forEach((rot) => { porId[rot.id] = etapas.find((e) => e.etapa === rot.id) || { etapa: rot.id, situacao: 'pendente', faltas: [] }; });
        const contexto = { pid, rid, editavel: !!ctx.editavel, ficha: ctx.ficha, porId };
        const linhas = ETAPAS.map((rot) => {
            const s = situacaoDaEtapa(porId[rot.id] || { situacao: 'pendente' });
            return `<tr><th scope="row">${escapeHTML(rot.rotulo)}</th><td>${s.sit === 'concluida' ? 'Sim' : ''}</td><td>${s.sit === 'nao_aplicavel' ? 'Sim' : ''}</td></tr>`;
        });
        const secoes = ETAPAS.map((rot, i) => {
            const d = porId[rot.id] || { etapa: rot.id, situacao: 'pendente', faltas: [] };
            const s = situacaoDaEtapa(d);
            const bloqueada = s.sit === 'bloqueada';
            const aberta = abertas.has(rot.id) && !bloqueada;
            const nome = `${i + 1}. ${rot.rotulo}`;
            return `<section class="at-etapa-bloco" data-etapa="${rot.id}">
                <h3 class="at-etapa-titulo"><button type="button" class="at-etapa-botao" id="at-et-b-${rot.id}" aria-expanded="${aberta}" aria-controls="at-et-c-${rot.id}"
                    aria-label="${escapeHTML(`${nome}, ${s.nome}`)}"${bloqueada ? ' aria-disabled="true"' : ''} data-etapa-botao="${rot.id}" data-sit="${s.sit}">
                    <span class="at-etapa-rotulo">${CHEVRON}<span><span class="at-etapa-num">${i + 1}.</span> ${escapeHTML(rot.rotulo)}</span></span><span class="at-etapa-situacao" data-sit="${bloqueada ? 'pendente' : s.sit}">${escapeHTML(s.texto)}</span></button></h3>
                <div class="at-etapa-corpo" id="at-et-c-${rot.id}" role="region" aria-labelledby="at-et-b-${rot.id}"${aberta ? '' : ' hidden'}>${bloqueada ? '' : corpoDaEtapa(rot.id, contexto)}</div>
            </section>`;
        });
        painel.innerHTML = `<div class="at-aba-corpo et">
            <div class="et-topo"><button type="button" class="btn btn-sm" data-acao="ver-fluxo">Ver o fluxo</button></div>
            <table class="et-resumo"><caption class="sr-only">Situação das seis etapas</caption>
                <thead><tr><th scope="col">Etapa</th><th scope="col">Concluído</th><th scope="col">Não Aplicável</th></tr></thead>
                <tbody>${linhas.join('')}</tbody></table>
            <div class="et-etapas" id="at-etapas">${secoes.join('')}</div>
        </div>`;
        painel.querySelector('[data-acao="ver-fluxo"]').addEventListener('click', verFluxo);
        painel.querySelectorAll('[data-etapa-botao]').forEach((b) => b.addEventListener('click', () => {
            const id = b.dataset.etapaBotao;
            if (b.getAttribute('aria-expanded') === 'true') {
                abertas.delete(id);
                b.setAttribute('aria-expanded', 'false');
                painel.querySelector(`#at-et-c-${id}`).hidden = true;
                marcarAtual();
            } else abrirEtapa(id);
        }));
        marcarAtual();
        ETAPAS.forEach((rot) => {
            const secao = painel.querySelector(`[data-etapa="${rot.id}"]`);
            if (secao) ligarEtapa(secao, rot.id, { ...contexto, recarregar });
        });
    }

    /** Abre a etapa (etapa bloqueada não abre). Devolve o botão dela, ou null. */
    function abrirEtapa(id) {
        const b = painel.querySelector(`[data-etapa-botao="${id}"]`);
        if (!b || b.getAttribute('aria-disabled') === 'true') return null;
        abertas.add(id);
        b.setAttribute('aria-expanded', 'true');
        painel.querySelector(`#at-et-c-${id}`).hidden = false;
        marcarAtual();
        return b;
    }

    // "Você está aqui": a primeira etapa aberta; sem nenhuma aberta, a primeira pendente que já pode ser preenchida.
    function marcarAtual() {
        const botoes = [...painel.querySelectorAll('[data-etapa-botao]')];
        const atual = botoes.find((b) => b.getAttribute('aria-expanded') === 'true') || botoes.find((b) => b.dataset.sit === 'pendente');
        botoes.forEach((b) => { if (b === atual) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    }

    /** O campo da pergunta do guiado (`coleta.descricao`...): abre a etapa e foca o campo. false se o campo não é de etapa. */
    function focar(campo) {
        const [etapa, sub] = String(campo || '').split('.');
        if (!ETAPAS.some((e) => e.id === etapa) || !abrirEtapa(etapa)) return false;
        const alvo = painel.querySelector(ALVO_DO_CAMPO[sub] ? ALVO_DO_CAMPO[sub](etapa) : `#et-desc-${etapa}`) || painel.querySelector(`#et-desc-${etapa}`);
        if (alvo) alvo.focus();
        return !!alvo;
    }

    /** "Ir para a próxima pendência": abre a primeira etapa pendente e leva o foco ao botão dela. */
    function abrirPendente() {
        const pend = ETAPAS.find((e) => { const b = painel.querySelector(`[data-etapa-botao="${e.id}"]`); return b && b.dataset.sit === 'pendente'; });
        const b = pend && abrirEtapa(pend.id);
        if (b) b.focus();
        return !!b;
    }

    /** "Ver o fluxo": o diagrama é derivado no servidor (nunca guardado). Falha aparece no próprio modal, não como vazio. */
    async function verFluxo() {
        let mermaid = null;
        try {
            const r = await api('GET', url(pid, rid, '/diagrama'));
            mermaid = typeof r.mermaid === 'string' ? r.mermaid : null;
        } catch (e) { mermaid = null; }
        openModal(`<h2 class="modal-title">Fluxo do tratamento</h2>
            <p class="at-ajuda">Diagrama derivado das etapas. Não é gravado: acompanha a atividade.</p>
            ${mermaid === null
                ? '<p class="at-erro" role="alert">Não foi possível carregar o fluxo. Tente de novo.</p>'
                : `<pre class="et-diagrama">${escapeHTML(mermaid)}</pre>
                   <div class="et-acoes"><button type="button" class="btn btn-sm" data-copiar>Copiar diagrama</button></div>`}
            <div class="et-acoes"><button type="button" class="btn" data-action="forceCloseModal">Fechar</button></div>`);
        const copiar = document.querySelector('#modal-content [data-copiar]');
        if (copiar) copiar.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(mermaid); showToast('Diagrama copiado.'); } catch (e) { showToast('Não foi possível copiar. Selecione o texto e copie.', 'error'); }
        });
    }

    desenhar();
    return { esvaziar: () => esvaziarTudo(), focar, abrirPendente };
}
