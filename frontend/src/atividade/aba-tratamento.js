import { api } from '../api.js';
import { openModal, escapeHTML, showToast } from '../ui.js';
import { ETAPAS } from './contrato.js';
import { url, esvaziarTudo } from './estado.js';
import { corpoDaEtapa, ligarEtapa, situacaoDaEtapa } from './etapas.js';

// Aba Tratamento de Dados (spec 2026-10-16, seção 5): resumo das seis etapas em duas colunas (Concluído e Não Aplicável), um
// acordeão por etapa e "Ver o fluxo" (o diagrama Mermaid que o servidor deriva). Contrato de aba da casca: `montar(painel, ctx)`,
// devolve `{ esvaziar }` para a casca gravar o que estiver pendente antes de trocar de aba. Não há botão "Salvar" nesta aba.

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
        const secoes = ETAPAS.map((rot) => {
            const d = porId[rot.id] || { etapa: rot.id, situacao: 'pendente', faltas: [] };
            const s = situacaoDaEtapa(d);
            const bloqueada = s.sit === 'bloqueada';
            const aberta = abertas.has(rot.id) && !bloqueada;
            return `<section class="at-etapa-bloco" data-etapa="${rot.id}">
                <h3 class="at-etapa-titulo"><button type="button" class="at-etapa-botao" id="at-et-b-${rot.id}" aria-expanded="${aberta}" aria-controls="at-et-c-${rot.id}"
                    aria-label="${escapeHTML(`${rot.rotulo}, ${s.nome}`)}"${bloqueada ? ' aria-disabled="true"' : ''} data-etapa-botao="${rot.id}">
                    <span>${escapeHTML(rot.rotulo)}</span><span class="at-etapa-situacao" data-sit="${bloqueada ? 'pendente' : s.sit}">${escapeHTML(s.texto)}</span></button></h3>
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
            if (b.getAttribute('aria-disabled') === 'true') return;
            const id = b.dataset.etapaBotao;
            const abre = b.getAttribute('aria-expanded') !== 'true';
            if (abre) abertas.add(id); else abertas.delete(id);
            b.setAttribute('aria-expanded', String(abre));
            painel.querySelector(`#at-et-c-${id}`).hidden = !abre;
        }));
        ETAPAS.forEach((rot) => {
            const secao = painel.querySelector(`[data-etapa="${rot.id}"]`);
            if (secao) ligarEtapa(secao, rot.id, { ...contexto, recarregar });
        });
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
    return { esvaziar: () => esvaziarTudo() };
}
