// PONTE: sai na PR2 (aba-tratamento.js)
import { api } from '../api.js';
import { escapeHTML } from '../ui.js';
import { ETAPAS } from './contrato.js';
import { url, lista, novoAutosave, gravarAgora, campo, faixaSalvo } from './estado.js';

// Aba Tratamento de Dados, versão ponte: as seis etapas em acordeão sobre o ciclo de vida que a F3 já grava (`/ciclo`). Cada etapa
// tem "Não Aplicável", a descrição (até 1.000 caracteres) e UM ativo. Titulares e dados ainda se editam na entrevista; a PR2 troca
// esta aba pelas etapas completas.

const TETO_DESCRICAO = 1000;
const ESTADO = { registrada: 'Concluído', nao_aplicavel: 'Não Aplicável' };
const estadoTexto = (sit) => ESTADO[sit] || 'Pendente';

export async function montar(painel, ctx) {
    const { projectId: pid, ropaId: rid, registro = {}, editavel } = ctx;
    let ciclo = []; let ativos = [];
    try { ciclo = lista((await api('GET', url(pid, rid, '/ciclo'))).etapas); } catch (e) { /* abre com as seis etapas pendentes */ }
    try { const r = await api('GET', `/api/v1/projects/${pid}/assets`); ativos = Array.isArray(r) ? r : lista(r && r.assets); } catch (e) { /* sem seletor */ }
    const por = new Map(ciclo.map((e) => [e.etapa, e]));
    const trava = editavel ? '' : ' disabled';

    const etapa = (e) => {
        const c = por.get(e.id) || {};
        const na = c.situacao === 'nao_aplicavel';
        return `<section class="at-etapa-bloco" data-etapa="${e.id}">
            <h3 class="at-etapa-titulo"><button type="button" class="at-etapa-botao" id="at-et-${e.id}-b" aria-expanded="false" aria-controls="at-et-${e.id}">
                <span>${escapeHTML(e.rotulo)}</span><span class="at-etapa-situacao" data-sit="${escapeHTML(c.situacao || 'pendente')}">${estadoTexto(c.situacao)}</span></button></h3>
            <div class="at-etapa-corpo" id="at-et-${e.id}" role="region" aria-labelledby="at-et-${e.id}-b" hidden>
                <label class="re-opcao"><input type="checkbox" class="at-na"${na ? ' checked' : ''}${trava}><span class="re-opcao-texto">Não Aplicável</span></label>
                ${campo({ id: `at-desc-${e.id}`, rotulo: 'Descrição do tratamento', tipo: 'textarea', max: TETO_DESCRICAO, valor: c.descricao || '', travado: !editavel || na,
                    ajuda: `Conte como esta etapa acontece na prática. Até ${TETO_DESCRICAO.toLocaleString('pt-BR')} caracteres.` })}
                ${ativos.length || c.item_id ? `<div class="form-group"><label class="form-label" for="at-ativo-${e.id}">Ativo</label>
                    <select class="form-input" id="at-ativo-${e.id}"${trava || na ? ' disabled' : ''}><option value="">Nenhum</option>${ativos.map((a) => `<option value="${escapeHTML(a.id)}"${a.id === c.item_id ? ' selected' : ''}>${escapeHTML(a.nome || a.name || '')}</option>`).join('')}</select></div>`
                    : '<p class="at-nota">Nenhum ativo cadastrado. Um ativo é um sistema, arquivo ou documento que guarda dados. Cadastre-os em Pessoas, áreas e sistemas.</p>'}
                ${e.id === 'coleta' ? `<div id="at-coleta-leitura"><p class="at-nota">Titulares: ${escapeHTML(registro.data_subjects || 'não informados')}</p>
                    <p class="at-nota">Dados pessoais: ${escapeHTML(registro.data_categories || 'não informados')}</p>
                    <p class="at-nota">Edite em Continuar a entrevista.</p>
                    ${editavel ? `<button type="button" class="btn btn-sm" data-action="abrirRopaEntrevista" data-args='${escapeHTML(JSON.stringify([pid, rid]))}'>Continuar a entrevista</button>` : ''}</div>` : ''}
            </div></section>`;
    };

    painel.innerHTML = `<div class="at-aba-corpo">${faixaSalvo()}<div id="at-etapas">${ETAPAS.map(etapa).join('')}</div></div>`;
    const status = painel.querySelector('#at-salvo');

    painel.querySelectorAll('.at-etapa-botao').forEach((b) => b.addEventListener('click', () => {
        const abre = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', String(abre));
        painel.querySelector(`#${b.getAttribute('aria-controls')}`).hidden = !abre;
    }));
    if (!editavel) return;

    painel.querySelectorAll('.at-etapa-bloco').forEach((bloco) => {
        const id = bloco.dataset.etapa;
        const atual = por.get(id) || { etapa: id };
        por.set(id, atual);
        const selo = bloco.querySelector('.at-etapa-situacao');
        const desc = bloco.querySelector(`#at-desc-${id}`);
        const ativo = bloco.querySelector(`#at-ativo-${id}`);
        const marca = (sit) => { atual.situacao = sit; selo.textContent = estadoTexto(sit); selo.dataset.sit = sit || 'pendente'; };
        const salvo = novoAutosave({ pid, rid, rota: '/ciclo', status,
            montar: (lote) => ({ etapas: [{ etapa: id, situacao: atual.situacao === 'nao_aplicavel' ? 'registrada' : (atual.situacao || 'registrada'), descricao: lote.descricao }] }) });
        desc.addEventListener('input', () => { atual.descricao = desc.value; if (!atual.situacao) marca('registrada'); salvo.agendar('descricao', desc.value); });
        desc.addEventListener('blur', () => salvo.esvaziar());
        if (ativo) ativo.addEventListener('change', async () => {
            if (await gravarAgora({ pid, rid, rota: '/ciclo', status, corpo: { etapas: [{ etapa: id, situacao: 'registrada', item_id: ativo.value || null }] } })) { atual.item_id = ativo.value || null; marca('registrada'); }
        });
        bloco.querySelector('.at-na').addEventListener('change', async (ev) => {
            const na = ev.target.checked;
            await salvo.esvaziar();
            if (await gravarAgora({ pid, rid, rota: '/ciclo', status, corpo: { etapas: [{ etapa: id, situacao: na ? 'nao_aplicavel' : 'registrada' }] } })) {
                marca(na ? 'nao_aplicavel' : 'registrada');
                desc.disabled = na; if (ativo) ativo.disabled = na;
            } else ev.target.checked = !na;
        });
    });
}
