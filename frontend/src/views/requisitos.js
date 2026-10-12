import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML } from '../ui.js';
import { produtoAtual } from '../produto.js';

// Catálogo de requisitos (fatia 2 do núcleo): fontes (ISO 27001, ISO 27701, LGPD, GDPR), cada requisito com as
// equivalências validadas pelo jurídico e, nas leis, a cobertura do projeto (documento vigente ou controle ligado por
// mapeamento validado). Toda regra é do servidor; aqui só se mostra e se chama. Todo texto é escapado.

const SITUACAO = { coberto: ['Coberto', 'success'], parcial: ['Parcial', 'warning'], lacuna: ['Lacuna', 'danger'] };
const TIPO_MAPA = { equivalente: 'Equivalente', parcial: 'Parcial', relacionado: 'Relacionado' };
const ORIGEM = { documento: 'Documento', evidencia: 'Evidência', controle: 'Controle' };
const FONTES_COM_COBERTURA = ['lgpd', 'gdpr'];

const ehAdmin = () => !!S.user && S.user.role === 'platform_admin';
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));

async function renderRequisitos(c, h, a) {
    h.textContent = 'Requisitos';
    const proj = projetoAtivo();
    let fontes = [];
    try { fontes = lista(await api('GET', '/api/v1/requisitos/fontes')); } catch (e) { /* tela vazia e aviso abaixo */ }
    const escolhida = fontes.find((f) => f.id === S.fonteRequisitos && f.requisitos > 0)
        || fontes.find((f) => f.requisitos > 0) || fontes[0];
    const fonteId = escolhida ? escolhida.id : null;
    S.fonteRequisitos = fonteId;

    a.innerHTML = ehAdmin() ? '<button class="btn" data-action="semearRequisitos">Carregar catálogo</button>' : '';
    // Sem nenhuma fonte com requisito, o seletor só listaria zeros: não aparece.
    const algumaCarregada = fontes.some((f) => f.requisitos > 0);
    const seletor = algumaCarregada ? `<div class="form-group" style="max-width:360px"><label class="form-label" for="req-fonte">Fonte</label>
        <select class="form-input" id="req-fonte" data-action-change="escolherFonteRequisitos" data-arg-val>${fontes.map((f) =>
        `<option value="${escapeHTML(f.id)}" ${f.id === fonteId ? 'selected' : ''}>${escapeHTML(f.nome)} (${escapeHTML(String(f.requisitos))})</option>`).join('')}</select></div>` : '';

    if (!escolhida || !escolhida.requisitos) {
        // Só o administrador carrega o catálogo: para ele, a ação primária; para os demais, a quem pedir (não um beco sem saída).
        const privacy = produtoAtual() === 'privacy';
        const proximo = ehAdmin()
            ? `<button class="btn btn-primary" data-action="semearRequisitos" style="margin-top:1rem">${privacy ? 'Carregar catálogo LGPD/ANPD' : 'Carregar catálogo'}</button>`
            : `<p>O catálogo é carregado pelo administrador da plataforma. Peça a ele para habilitar os requisitos ${privacy ? 'da LGPD e da ANPD' : 'das normas do projeto'}.</p>`;
        if (ehAdmin()) a.innerHTML = '';
        c.innerHTML = `${seletor}<div class="empty-state fade-in"><h3>Catálogo ainda não carregado</h3>
            <p>${escolhida && algumaCarregada ? escapeHTML(escolhida.nome) + ' ainda não tem requisitos carregados.' : 'Nenhuma fonte de requisitos foi carregada.'}</p>${proximo}</div>`;
        return;
    }

    let reqs = [];
    try { reqs = lista(await api('GET', `/api/v1/requisitos?fonte=${encodeURIComponent(fonteId)}`)); } catch (e) { /* lista vazia */ }
    const comCobertura = FONTES_COM_COBERTURA.includes(fonteId) && !!proj;
    let cobertura = new Map();
    let resumo = null;
    if (comCobertura) {
        try {
            const r = await api('GET', `/api/v1/projects/${proj.id}/requisitos/lacunas?fonte=${encodeURIComponent(fonteId)}`);
            cobertura = new Map(lista(r.itens).map((i) => [i.requisito_id, i]));
            resumo = r.resumo;
        } catch (e) { /* sem a coluna de cobertura */ }
    }

    const linhas = reqs.map((r) => {
        const cob = cobertura.get(r.id);
        const [rot, tom] = cob ? SITUACAO[cob.situacao] || [cob.situacao, 'info'] : [null, null];
        const origens = cob ? cob.origens.map((o) => `${ORIGEM[o.tipo] || 'Controle'}: ${escapeHTML(o.titulo)}`).join('; ') : '';
        const linha = [
            escapeHTML(r.referencia),
            escapeHTML(r.titulo),
            r.papel ? escapeHTML(r.papel) : '—',
        ];
        if (comCobertura) linha.push(rot ? window.renderStatusBadge(rot, tom) : '—', origens || '—');
        linha.push(`<button class="btn btn-ghost btn-sm" data-action="abrirRequisito" data-args='${args(r.id)}'>Abrir</button>`);
        return linha;
    });
    const cab = ['Referência', 'Título', 'Papel'];
    if (comCobertura) cab.push('Cobertura', 'Origem');
    cab.push('Ações');
    const aviso = comCobertura
        ? `<p style="color:var(--text-dim)">Cobertura: documento vigente ligado ao requisito, ou controle implementado ligado por equivalência validada pelo jurídico.</p>`
        : '';
    const quadro = resumo
        ? `<p><strong>${escapeHTML(String(resumo.cobertos))}</strong> cobertos, <strong>${escapeHTML(String(resumo.parciais))}</strong> parciais e <strong>${escapeHTML(String(resumo.lacunas))}</strong> lacunas, de ${escapeHTML(String(resumo.total))}.</p>`
        : '';
    c.innerHTML = seletor + quadro + aviso + window.renderDataTable(cab, linhas, { emptyState: 'Nenhum requisito nesta fonte.' });
}

window.escolherFonteRequisitos = function (valor) {
    S.fonteRequisitos = valor;
    window.render();
};

window.semearRequisitos = async function () {
    try {
        const r = await api('POST', '/api/v1/requisitos/semear');
        showToast(`Catálogo: ${r.requisitos} requisitos criados, ${r.controles_ligados} controles ligados.`, 'success');
        window.render();
    } catch (e) { showToast((e && e.message) || 'Não foi possível carregar o catálogo', 'error'); }
};

// Data de hoje no Brasil (AAAA-MM-DD), não em UTC: à noite o UTC já é o dia seguinte.
const hojeBr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dataBr = (d) => String(d || '').slice(0, 10).split('-').reverse().join('/');
// Recusa em duas etapas dentro da própria janela (o app não usa confirm()): guarda qual mapeamento espera confirmação.
let recusando = null;

window.abrirRequisito = async function (id, mantemRecusa) {
    if (!mantemRecusa) recusando = null;
    let r;
    try { r = await api('GET', `/api/v1/requisitos/${encodeURIComponent(id)}`); } catch (e) { showToast((e && e.message) || 'Não foi possível abrir o requisito', 'error'); return; }
    const mapas = lista(r.mapeamentos).map((m) => {
        const outro = m.de_id === r.id ? m.para_id : m.de_id;
        let quem;
        if (m.estado === 'validado_juridico') {
            quem = `Validado por ${escapeHTML(m.validado_por || '')} em ${escapeHTML(dataBr(m.validado_em))}`;
        } else {
            quem = window.renderStatusBadge('Proposto', 'warning');
            if (ehAdmin()) {
                const chave = `${m.de_id}|${m.para_id}`;
                quem += recusando === chave
                    ? ` <button class="btn btn-danger btn-sm" data-action="recusarMapeamentoConfirmado" data-args='${args(m.de_id, m.para_id, r.id)}'>Confirmar recusa</button>
                        <button class="btn btn-ghost btn-sm" data-action="cancelarRecusaMapeamento" data-args='${args(r.id)}'>Cancelar</button>`
                    : ` <button class="btn btn-sm" data-action="validarMapeamento" data-args='${args(m.de_id, m.para_id, m.tipo, r.id, m.nota || null)}'>Validar</button>
                        <button class="btn btn-ghost btn-sm" data-action="recusarMapeamento" data-args='${args(m.de_id, m.para_id, r.id)}'>Recusar</button>`;
            }
        }
        return `<tr><td>${escapeHTML(outro)}</td><td>${escapeHTML(TIPO_MAPA[m.tipo] || m.tipo)}</td><td>${quem}</td><td>${escapeHTML(m.nota || '')}</td></tr>`;
    }).join('');
    openModal(`
        <h3>${escapeHTML(r.referencia)} — ${escapeHTML(r.titulo)}</h3>
        <p style="color:var(--text-dim)">${escapeHTML(r.fonte_id)}${r.papel ? ' · ' + escapeHTML(r.papel) : ''}</p>
        <h4 style="margin:1rem 0 0.5rem">Equivalências</h4>
        ${mapas ? `<table class="data-table"><thead><tr><th>Requisito</th><th>Tipo</th><th>Validação</th><th>Nota</th></tr></thead><tbody>${mapas}</tbody></table>`
            : '<p style="color:var(--text-dim)">Nenhuma equivalência registrada.</p>'}
    `, 'modal-large');
};

window.validarMapeamento = async function (de, para, tipo, requisitoId, nota) {
    try {
        await api('PUT', '/api/v1/requisitos/mapeamentos', {
            de_id: de, para_id: para, tipo, estado: 'validado_juridico',
            validado_por: (S.user && (S.user.name || S.user.email)) || '', validado_em: hojeBr(), nota: nota || null,
        });
        showToast('Mapeamento validado.', 'success');
    } catch (e) { showToast((e && e.message) || 'Não foi possível validar o mapeamento', 'error'); return; }
    return window.abrirRequisito(requisitoId);
};

window.recusarMapeamento = function (de, para, requisitoId) {
    recusando = `${de}|${para}`;
    return window.abrirRequisito(requisitoId, true);
};

window.cancelarRecusaMapeamento = function (requisitoId) {
    recusando = null;
    return window.abrirRequisito(requisitoId);
};

window.recusarMapeamentoConfirmado = async function (de, para, requisitoId) {
    recusando = null;
    try {
        await api('DELETE', `/api/v1/requisitos/mapeamentos?de=${encodeURIComponent(de)}&para=${encodeURIComponent(para)}`);
        showToast('Mapeamento recusado.', 'success');
    } catch (e) { showToast((e && e.message) || 'Não foi possível recusar o mapeamento', 'error'); return; }
    return window.abrirRequisito(requisitoId);
};

window.renderRequisitos = renderRequisitos;
