import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, confirmar, pedirTexto, showToast, formatarData, openModal } from '../ui.js';
import { emDiasSP } from '../hoje.js';
import { podeEditarOt, podeCriarLote, ehGestor, classePrimario, mensagemDeErro, dataDoSqlite, AREA, ETAPAS_IMPLANTACAO, areaDaFase } from '../ot-comum.js';

// n.ot, cabeçalho do site (spec 2026-11-26 §1 e §4): na Implantação e na Obra, a régua das 4 etapas (a etapa vem do servidor) e o
// cartão "Para avançar" com o que falta (`falta`); na Operação, desde quando. O cartão leva o único .btn-primary da tela.
// Lê GET .../sites/:id/situacao; pedir, aprovar e devolver a base são POSTs do Gestor/equipe.

const OBRA_MAX_DIAS = 90; // o mesmo teto do servidor
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const mkBotao = (sem) => (rotulo, acao, ...a) => `<button class="${classePrimario(sem)}" data-action="${acao}" data-args='${args(...a)}'>${escapeHTML(rotulo)}</button>`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Texto e ação do cartão para cada `proximo_passo`. Pura. `site` é o id; `gestor` é quem aprova a base. */
export function proximoPasso(sit, site, { gestor, editar, criar = editar, semPrimario }) {
    const botao = mkBotao(semPrimario); // com lote ou levantamento aberto, o primário é o da tela de dentro
    switch (sit.proximo_passo) {
        case 'comecar': return { texto: 'Comece o levantamento', acao: criar ? botao('Novo levantamento', 'otNovoLevantamentoDoSite', site) : '' };
        case 'revisar': {
            const n = sit.rascunhos || 0;
            return n ? { texto: `Revise ${plural(n, 'achado', 'achados')}`, acao: botao('Revisar', 'otSiteSub', 'revisar') }
                : { texto: 'Defina as zonas dos níveis 2, 3 e 4', acao: botao('Cadastrar as zonas', 'otSiteSub', 'cadastrar') };
        }
        case 'aguardar_lote': return { texto: 'Aguardando o Gestor decidir o lote', acao: sit.lote_em_revisao_id ? botao('Abrir o lote', 'otIrParaLote', site, sit.lote_em_revisao_id) : '' };
        case 'levantar': return { texto: 'Levante os ativos do site', acao: criar ? botao('Novo levantamento', 'otNovoLevantamentoDoSite', site) : '' };
        case 'pedir_base': return { texto: 'Tudo aprovado: peça a aprovação da base', acao: editar ? botao('Pedir aprovação da base', 'otPedirBase', site) : '' };
        case 'aguardar_base': return gestor
            ? { texto: 'Aguardando o Gestor aprovar a base', acao: `${sit.eu_pedi_a_base ? '<p class="org-dica">Quem pediu a base não a aprova: peça a outra pessoa.</p>' : botao('Aprovar a base', 'otAprovarBase', site)}<button class="btn" data-action="otDevolverBase" data-args='${args(site)}'>Devolver</button>` }
            : { texto: 'Aguardando o Gestor aprovar a base', acao: '' };
        case 'revalidar': return { texto: `Revalide o inventário até ${sit.revalidar_em ? ddmm(sit.revalidar_em) : 'o prazo'}`, acao: criar ? botao('Novo levantamento', 'otNovoLevantamentoDoSite', site) : '' };
        case 'em_operacao': return { texto: 'Acompanhe a operação do site', acao: botao('Abrir a operação', 'otSiteModo', 'operacao') };
        default: return { texto: 'Situação do site indisponível', acao: '' };
    }
}

/** Régua + cartão. `sit` é o corpo de /situacao, ou null quando a leitura falhou. */
export function cabecalhoDoSite(sit, site, papeis = { gestor: ehGestor(), editar: podeEditarOt(), criar: podeCriarLote() }) {
    if (!sit) return '<section class="card mb-4"><p class="org-dica" role="alert">Não foi possível carregar a situação do site.</p></section>';
    const area = AREA[sit.area] ? sit.area : areaDaFase(sit.fase); // situação sem `area` (servidor antigo): a fase dá o nome
    const desde = sit.base_aprovada_em ? formatarData(dataDoSqlite(sit.base_aprovada_em)) : '';
    const { texto, acao } = proximoPasso(sit, site, papeis);
    const falta = Array.isArray(sit.falta) ? sit.falta : [];
    const obra = sit.obra ? `<span class="badge" title="${escapeHTML(sit.obra.justificativa || '')}">Obra até ${escapeHTML(ddmm(sit.obra.ate))}</span>` : '';
    const btnObra = !papeis.gestor ? '' : sit.obra ? (sit.obra.renovada ? '' : `<button class="btn" data-action="otObra" data-args='${args('renovar', site, sit.obra.ate)}'>Renovar obra</button>`)
        : sit.fase === 'em_operacao' ? `<button class="btn" data-action="otObra" data-args='${args('abrir', site)}'>Abrir obra</button>` : '';
    const topo = area === 'operacao' ? (desde ? `<p class="org-dica mb-3">Operação desde ${escapeHTML(desde)}</p>` : '')
        : `<ol class="ot-regua" aria-label="${area === 'obra' ? 'Etapas da obra' : 'Etapas da implantação'}">${ETAPAS_IMPLANTACAO.map((e, i) => (i + 1 === sit.etapa
            ? `<li aria-current="step"><strong>${i + 1}. ${e}</strong></li>` : `<li>${i + 1}. ${e}</li>`)).join('')}</ol>`;
    const corpo = falta.length ? `<ul>${falta.map((f) => `<li>${escapeHTML(f)}</li>`).join('')}</ul>` : `<span>${escapeHTML(texto)}</span>`;
    return `<section class="card mb-4">${topo}
        <h3 class="mb-2">${area === 'operacao' ? 'Operação' : 'Para avançar'}</h3><div class="d-flex gap-4 items-center flex-wrap">${obra}${corpo}${acao}${btnObra}</div></section>`;
}

let ocupado = false;
async function enviar(fn, ok, erro, depois = () => window.render()) {
    if (ocupado) return;
    ocupado = true;
    let deu = false;
    try { await fn(); deu = true; showToast(ok, 'success'); } catch (e) { showToast(mensagemDeErro(e, erro), 'error'); } finally { ocupado = false; }
    (deu ? depois : () => window.render())();
}
const proj = () => S.activeProject;

window.otNovoLevantamentoDoSite = async () => {
    // em operação (revalidar) o Levantamento é aba da implantação: o modo vai junto, senão a tela cai em Saúde da coleta
    if (S.otSub !== 'levantar' || S.otModo !== 'projeto') { S.otSub = 'levantar'; S.otModo = 'projeto'; await window.render(); }
    window.otNovoLevantamento();
};
window.otPedirBase = async (site) => {
    if (!(await confirmar('Pedir ao Gestor a aprovação da base deste site?', { rotulo: 'Pedir aprovação' }))) return;
    await enviar(() => api('POST', `/api/v1/projects/${proj().id}/ot/sites/${encodeURIComponent(site)}/base/pedir`, {}), 'Aprovação da base pedida.', 'Não foi possível pedir a aprovação da base.');
};
window.otAprovarBase = async (site) => {
    if (!(await confirmar('Confirmo que este inventário representa o site.', { titulo: 'Aprovar a base', rotulo: 'Aprovar a base' }))) return;
    await enviar(() => api('POST', `/api/v1/projects/${proj().id}/ot/sites/${encodeURIComponent(site)}/base/aprovar`, { declaracao: true }), 'Base aprovada.', 'Não foi possível aprovar a base.', () => window.otTela('site', site, 'desvios')); // aprovada, o site abre na Operação, em Desvios
};
window.otDevolverBase = async (site) => {
    const motivo = await pedirTexto('Diga o que precisa ser corrigido (3 a 500 caracteres; sem IP ou MAC).', { titulo: 'Devolver a base', rotulo: 'Devolver' });
    if (motivo === null) return;
    if (motivo.trim().length < 3) { showToast('Escreva o motivo da devolução (ao menos 3 caracteres).', 'error'); return; }
    await enviar(() => api('POST', `/api/v1/projects/${proj().id}/ot/sites/${encodeURIComponent(site)}/base/devolver`, { motivo: motivo.trim() }), 'Base devolvida.', 'Não foi possível devolver a base.');
};

// Abrir e renovar pedem o mesmo (fim e justificativa); o servidor confere o teto, a fase e o papel.
// Abrir: de amanhã a hoje + 90. Renovar: depois do fim atual, até o fim atual + 90 (o servidor confere de novo).
const faixaObra = (atual) => (atual ? [emDiasSP(1, new Date(`${atual}T12:00:00Z`)), emDiasSP(OBRA_MAX_DIAS, new Date(`${atual}T12:00:00Z`))] : [emDiasSP(1), emDiasSP(OBRA_MAX_DIAS)]);
window.otObra = (quem, site, atual) => {
    const abrir = quem === 'abrir';
    const [min, max] = faixaObra(abrir ? null : atual);
    openModal(`<div class="modal-header"><span class="modal-title">${abrir ? 'Abrir obra' : 'Renovar obra'}</span></div>
        <p class="org-dica mb-3">${abrir ? 'Durante a obra os desvios são registrados sem alerta.' : 'A obra só pode ser renovada uma vez.'}</p>
        <div class="form-group"><label class="form-label" for="obra-just">Justificativa</label><textarea class="form-input" id="obra-just" rows="3" maxlength="500" autofocus></textarea><p class="org-dica">Não escreva IP ou MAC.</p></div>
        <div class="form-group"><label class="form-label" for="obra-ate">${abrir ? 'Fim da obra' : 'Novo prazo'}</label><input class="form-input" type="date" id="obra-ate" min="${min}" max="${max}"><p class="org-dica">De ${ddmm(min)} a ${ddmm(max)}.</p></div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn" data-action="otSalvarObra" data-args='${args(quem, site, atual)}'>${abrir ? 'Abrir obra' : 'Renovar obra'}</button></div>`);
};
window.otSalvarObra = async (quem, site, atual) => {
    const justificativa = document.getElementById('obra-just')?.value.trim();
    const ate = document.getElementById('obra-ate')?.value;
    if (!justificativa) { showToast('Escreva a justificativa da obra.', 'error'); return; }
    if (!ate) { showToast(`Informe a data de fim (no máximo ${OBRA_MAX_DIAS} dias).`, 'error'); return; }
    const [min, max] = faixaObra(quem === 'abrir' ? null : atual);
    if (ate < min || ate > max) { showToast(`A data deve ficar entre ${ddmm(min)} e ${ddmm(max)}.`, 'error'); return; }
    const corpo = { justificativa, ate };
    const depois = () => { window.closeModal?.(); window.render(); };
    // Um literal por rota: o contrato tela-API (varredura estática) precisa enxergar cada caminho.
    await enviar(() => (quem === 'abrir' ? api('POST', `/api/v1/projects/${proj().id}/ot/sites/${encodeURIComponent(site)}/obra/abrir`, corpo)
        : api('POST', `/api/v1/projects/${proj().id}/ot/sites/${encodeURIComponent(site)}/obra/renovar`, corpo)),
    quem === 'abrir' ? 'Obra aberta.' : 'Obra renovada.', quem === 'abrir' ? 'Não foi possível abrir a obra.' : 'Não foi possível renovar a obra.', depois);
};
