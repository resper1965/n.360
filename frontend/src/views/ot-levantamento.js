import { S } from '../state.js';
import { api, API_BASE, cabecalhosAuth } from '../api.js';
import { escapeHTML, renderDataTable, falhaDeCarga, renderStatusBadge, openModal, forceCloseModal, showToast, formatarData, confirmar } from '../ui.js';
import { podeEditarOt, mensagemDeErro, lista, opcoes, nomeDe, camposDoAtivo, lerCamposDoAtivo, listaDeErros, nomeDoAtivo } from '../ot-comum.js';
import { hojeSP } from '../hoje.js';

// Levantamento do n.ot (L1, descoberta operacional): sessões de entrevista, visita de campo e documento, com o roteiro guiado e os
// achados que viram lote da coleta (a aprovação continua na Coleta). O operador é só função e turno. IP/MAC aparecem como a API
// devolve; o confronto com o inventário (`confronto`) só chega a quem vê completo, e só então é mostrado.

const el = (id) => document.getElementById(id);
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const falhou = (e, padrao) => showToast(mensagemDeErro(e, padrao), 'error');

const TIPO = { entrevista: 'Entrevista', visita: 'Visita de campo', documento: 'Documento' };
const RESPOSTA = { sim: 'Sim', nao: 'Não', nao_perguntado: 'Não perguntado' };
const ACHADO = { rascunho: ['neutral', 'Rascunho'], enviado: ['info', 'Enviado ao lote'], descartado: ['warning', 'Descartado'] };
const selo = (mapa, v) => renderStatusBadge(...(mapa[v] || ['neutral', v || '—']));
const situacao = (l) => (l.situacao === 'encerrado' ? renderStatusBadge('neutral', 'Encerrado') : renderStatusBadge('info', 'Aberto'));
const quem = (l) => (l.tipo === 'documento' ? escapeHTML(l.documento_titulo || '—')
    : [l.funcao, l.turno && `turno ${l.turno}`].filter(Boolean).map(escapeHTML).join(' · ') || '—');

let sites = [];
let atual = null;
let perguntas = [];
let achados = [];

export async function montarLevantamento(c, a, p) {
    if (S.otLevantamento) { await montarSessao(c, a, p, S.otLevantamento); return; }
    let levs;
    try {
        const [s, l] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/levantamentos`)]);
        sites = lista(s, 'sites'); levs = lista(l, 'levantamentos');
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os levantamentos do n.ot.', e); return; }
    if (podeEditarOt() && sites.length) a.innerHTML = '<button class="btn btn-primary" data-action="otNovoLevantamento">+ Novo levantamento</button>';
    c.innerHTML = `<p class="org-header-intro">Entrevistas, visitas de campo e documentos do site. O operador é registrado só por função e turno: não escreva nomes, IP, MAC, e-mail ou telefone nas notas.</p>
        ${renderDataTable(['Tipo', 'Data', 'Quem ou documento', 'Site', 'Achados', 'Situação', 'Ações'], levs.map((l) => [
        escapeHTML(TIPO[l.tipo] || l.tipo), escapeHTML(formatarData(l.realizado_em)), quem(l), escapeHTML(nomeDe(sites, l.site_id)), escapeHTML(String(l.achados ?? 0)), situacao(l),
        `<button class="btn btn-sm" data-action="otAbrirLevantamento" data-args='${args(l.id)}' aria-label="${escapeHTML(`Abrir ${TIPO[l.tipo] || l.tipo} de ${formatarData(l.realizado_em)}`)}">Abrir</button>`,
    ]), { emptyMessage: 'Nenhum levantamento registrado.', emptyHint: 'Comece por uma entrevista ou visita de campo no site.' })}`;
}

window.otAbrirLevantamento = (id) => { S.otLevantamento = id; window.render(); };
window.otVoltarLevantamentos = async () => { await esvaziarNotas(); S.otLevantamento = null; window.render(); };

// ─── nova sessão ───────────────────────────────────────────────────────────
window.otNovoLevantamento = () => {
    const campo = (id, rotulo, tipo = 'text', extra = '') => `<div class="form-group"><label class="form-label" for="${id}">${rotulo}</label><input class="form-input" type="${tipo}" id="${id}"${extra}></div>`;
    openModal(`<div class="modal-header"><span class="modal-title">Novo levantamento</span></div>
        <div class="form-group"><label class="form-label" for="lev-f-site">Site</label><select class="form-input" id="lev-f-site">${opcoes(sites.map((s) => [s.id, s.nome]), S.otSite)}</select></div>
        <div class="form-group"><label class="form-label" for="lev-f-tipo">Tipo</label><select class="form-input" id="lev-f-tipo" data-action-change="otTipoLevantamento" data-arg-val>${opcoes(Object.entries(TIPO), 'entrevista')}</select></div>
        ${campo('lev-f-data', 'Data', 'date', ` value="${hojeSP()}"`)}
        <div id="lev-f-pessoa">${campo('lev-f-funcao', 'Função (sem nome da pessoa)', 'text', ' maxlength="100"')}${campo('lev-f-turno', 'Turno', 'text', ' maxlength="50"')}</div>
        <div id="lev-f-doc" hidden>${campo('lev-f-titulo', 'Título do documento', 'text', ' maxlength="200"')}${campo('lev-f-doc-data', 'Data do documento', 'date')}</div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otCriarLevantamento">Criar levantamento</button></div>`);
};
window.otTipoLevantamento = (tipo) => { el('lev-f-pessoa').hidden = tipo === 'documento'; el('lev-f-doc').hidden = tipo !== 'documento'; };
window.otCriarLevantamento = async () => {
    const v = (id) => el(id)?.value.trim() || '';
    const tipo = v('lev-f-tipo');
    const corpo = { site_id: v('lev-f-site'), tipo, realizado_em: v('lev-f-data') };
    const extra = tipo === 'documento' ? { documento_titulo: v('lev-f-titulo'), documento_data: v('lev-f-doc-data') } : { funcao: v('lev-f-funcao'), turno: v('lev-f-turno') };
    for (const [k, x] of Object.entries(extra)) if (x) corpo[k] = x;
    if (tipo === 'documento' && !corpo.documento_titulo) return showToast('Informe o título do documento.', 'error');
    try {
        const r = await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/levantamentos`, corpo);
        forceCloseModal();
        S.otLevantamento = r.id;
        window.render();
    } catch (e) { falhou(e, 'Não foi possível criar o levantamento.'); }
};

// ─── a sessão ──────────────────────────────────────────────────────────────
async function montarSessao(c, a, p, id) {
    let r;
    try {
        const [lv, rot] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/levantamentos/${encodeURIComponent(id)}`), api('GET', `/api/v1/projects/${p.id}/ot/roteiro`)]);
        r = lv; perguntas = lista(rot, 'perguntas');
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar o levantamento.', e, { acao: 'otVoltarLevantamentos' }); return; }
    const l = r.levantamento;
    atual = l;
    atualPid = p.id;
    achados = lista(r, 'achados');
    const editar = podeEditarOt();
    const aberto = l.situacao !== 'encerrado';
    const rascunhos = achados.filter((x) => x.situacao === 'rascunho');
    a.innerHTML = '<button class="btn" data-action="otVoltarLevantamentos">Voltar aos levantamentos</button>'
        + (editar ? `<button class="btn" data-action="otEncerrarLevantamento" data-args='${args(aberto ? 'encerrado' : 'aberto')}'>${aberto ? 'Encerrar' : 'Reabrir'}</button>` : '')
        + (editar && aberto ? '<button class="btn" data-action="otNovoAchado">Registrar achado</button>' : '')
        + (editar && rascunhos.length ? '<button class="btn btn-primary" data-action="otEnviarAchados" aria-describedby="lev-envio-dica" disabled>Enviar ao lote</button>' : '');

    const doTipo = perguntas.filter((q) => Array.isArray(q.tipos_sessao) && q.tipos_sessao.includes(l.tipo));
    const roteiro = !doTipo.length ? '' : `<h3 class="mb-3">Roteiro</h3>
        ${renderDataTable(['Pergunta', 'Item da norma', 'Resposta', ...(editar ? ['Responder'] : [])], doTipo.map((q) => {
        const resp = l.roteiro?.[q.id]?.resposta;
        return [escapeHTML(q.texto), `<span class="badge">${escapeHTML(q.item_norma || '—')}</span>`, escapeHTML(RESPOSTA[resp] || '—'),
            ...(editar ? [`<div class="d-flex gap-2 ot-resposta">${Object.entries(RESPOSTA).map(([v, rot]) => `<button class="btn btn-sm" data-action="otResponderRoteiro" data-args='${args(q.id, v)}' aria-pressed="${resp === v}">${rot}</button>`).join('')}</div>`] : [])];
    }))}`;

    const comConfronto = achados.some((x) => 'confronto' in x);
    const tabela = renderDataTable([...(editar ? ['Enviar'] : []), 'Nome', 'IP', 'MAC', 'Evidência', ...(comConfronto ? ['Inventário'] : []), 'Avisos', 'Situação', ...(editar ? ['Ações'] : [])],
        achados.map((x) => {
            const d = x.dados || {};
            const rasc = x.situacao === 'rascunho';
            return [...(editar ? [rasc ? `<input type="checkbox" id="ach-sel-${escapeHTML(x.id)}" data-action-change="otMarcarAchado" aria-label="${escapeHTML(`Enviar ${d.nome || 'achado'} ao lote`)}">` : '—'] : []),
                escapeHTML(d.nome || '—'), `<span class="f-mono">${escapeHTML(d.ip ?? '—')}</span>`, `<span class="f-mono">${escapeHTML(d.mac ?? '—')}</span>`, escapeHTML(x.evidencia || '—'),
                ...(comConfronto ? [escapeHTML(x.confronto === 'confirma' ? `Confirma ${nomeDoAtivo(x.alvo_id)}` : x.confronto === 'novo' ? 'Novo no inventário' : '—')] : []), listaDeErros(x.erros), selo(ACHADO, x.situacao),
                ...(editar ? [rasc ? `<button class="btn btn-sm" data-action="otDescartarAchado" data-args='${args(x.id)}' aria-label="${escapeHTML(`Descartar ${d.nome || 'achado'}`)}">Descartar</button>` : '—'] : [])];
        }), { emptyMessage: 'Nenhum achado registrado.', emptyHint: editar && aberto ? 'Registre cada equipamento ou acesso visto ou relatado nesta sessão.' : '' });

    c.innerHTML = `<h3 class="mb-2">${escapeHTML(TIPO[l.tipo] || l.tipo)} · ${quem(l)} · ${escapeHTML(nomeDe(sites, l.site_id))} ${situacao(l)}</h3>
        <p class="org-dica mb-3">Realizado em ${escapeHTML(formatarData(l.realizado_em))}.${l.documento_data ? ` Documento de ${escapeHTML(formatarData(l.documento_data))}.` : ''} Os achados enviados viram um lote da Coleta, que outra pessoa aprova antes do inventário.</p>
        <div class="bloco mb-4"><h3 class="mb-3">Notas</h3>
            <div class="form-group"><label class="form-label" for="lev-notas">Notas da sessão (sem nomes, IP, MAC, e-mail ou telefone)</label>
            <textarea class="form-input" id="lev-notas" rows="5" maxlength="20000"${editar ? ' data-action-input="otNotasDigitadas" data-action-blur="otSalvarNotas" aria-describedby="lev-notas-status"' : ' readonly'}>${escapeHTML(notasNaTela(l))}</textarea></div>
            ${editar ? '<div class="d-flex gap-2 items-center"><p class="at-salvo" id="lev-notas-status" role="status"></p><span id="lev-notas-tentar"></span></div>' : ''}</div>
        ${roteiro}
        <h3 class="mb-3">Achados</h3>
        ${editar && rascunhos.length ? '<p class="org-dica mb-2" id="lev-envio-dica">Marque os achados que vão ao lote.</p>' : ''}${tabela}`;
    if (editar) mostrarStatusNotas();
}

// ─── notas: gravam sozinhas e nunca se perdem num redesenho ──────────────────
// O texto digitado vive aqui até o servidor aceitar: responder o roteiro, registrar achado ou encerrar redesenham a tela a partir da
// API, e o rascunho volta ao campo. Recusa do servidor (IP, MAC, CPF, e-mail, telefone) aparece no status e o texto fica.
const ESPERA_NOTAS = 1500;
// Tudo por sessão (chave projeto|levantamento): o texto de uma sessão nunca substitui o de outra, e o projeto é o do momento em que se
// digitou (trocar de projeto com a gravação agendada não manda as notas ao projeto novo).
let atualPid = null;
const pendentes = new Map(); // chave → { pid, lid, texto } ainda não aceito pelo servidor
const recusados = new Map(); // chave → texto que o servidor recusou (400): não se reenvia enquanto não mudar
const status = new Map(); // chave → { texto, erro, tentar }
let timerNotas = null;
let emVoo = null;
const chave = (pid, lid) => `${pid}|${lid}`;
const chaveAtual = () => (atual ? chave(atualPid, atual.id) : '');
const notasNaTela = (l) => pendentes.get(chave(atualPid, l.id))?.texto ?? (l.notas || '');
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function mostrarStatusNotas(busy = false) {
    const st = el('lev-notas-status');
    if (!st) return;
    const e = status.get(chaveAtual()) || { texto: '', erro: false, tentar: false };
    st.textContent = e.texto;
    st.classList.toggle('t-perigo', e.erro);
    st.setAttribute('aria-busy', String(busy));
    const t = el('lev-notas-tentar');
    if (t) t.innerHTML = e.tentar ? '<button class="btn btn-sm" data-action="otSalvarNotas">Tentar de novo</button>' : '';
}

/** O campo na tela vira rascunho da sessão aberta, se difere do que o servidor tem. */
function lerCampo() {
    const campo = el('lev-notas');
    if (!campo || !atual || campo.readOnly) return;
    const k = chaveAtual();
    if (campo.value !== (atual.notas || '') || pendentes.has(k)) pendentes.set(k, { pid: atualPid, lid: atual.id, texto: campo.value });
}

window.otNotasDigitadas = () => {
    lerCampo();
    clearTimeout(timerNotas);
    timerNotas = setTimeout(() => { esvaziarNotas(); }, ESPERA_NOTAS);
};

async function gravar(k, { pid, lid, texto }) {
    status.set(k, { texto: 'Salvando…', erro: false, tentar: false });
    if (k === chaveAtual()) mostrarStatusNotas(true);
    try {
        await api('PUT', `/api/v1/projects/${pid}/ot/levantamentos/${encodeURIComponent(lid)}`, { notas: texto });
        if (atual && k === chaveAtual()) atual.notas = texto;
        if (pendentes.get(k)?.texto === texto) pendentes.delete(k);
        recusados.delete(k);
        status.set(k, { texto: `Salvo às ${hora()}`, erro: false, tentar: false });
        return true;
    } catch (e) {
        if (e && e.status === 400) {
            // 400 é o texto que o servidor recusa: repetir daria o mesmo; a pessoa corrige. O motivo vem em `details` (src/schemas/index.ts).
            recusados.set(k, texto);
            const motivo = e.body?.details?.map((d) => d.message).join('. ') || mensagemDeErro(e, 'O servidor recusou as notas');
            status.set(k, { texto: `${motivo}${motivo.endsWith('.') ? '' : '.'} O texto continua aqui: corrija e saia do campo.`, erro: true, tentar: false });
        } else status.set(k, { texto: 'Não foi possível salvar. Tente de novo.', erro: true, tentar: true });
        return false;
    } finally { if (k === chaveAtual()) mostrarStatusNotas(); }
}

/**
 * Grava, em fila, as notas pendentes de todas as sessões (a recusada só depois de mudar). Devolve true se nada da sessão aberta ficou
 * pendente. Chamado antes de todo redesenho, troca de aba, de sessão ou de projeto.
 */
export async function esvaziarNotas() {
    clearTimeout(timerNotas); timerNotas = null;
    while (emVoo) await emVoo; // uma gravação por vez: a mais antiga nunca chega depois da mais nova
    lerCampo();
    const p = (async () => {
        let ok = true;
        for (const [k, r] of [...pendentes]) {
            if (recusados.get(k) === r.texto) { if (k === chaveAtual()) ok = false; continue; }
            if (!await gravar(k, r) && k === chaveAtual()) ok = false;
        }
        return ok;
    })();
    emVoo = p;
    try { return await p; } finally { if (emVoo === p) emVoo = null; }
}

// Fechar ou recarregar a página com notas pendentes: o PUT segue com keepalive, com o mesmo cabeçalho de autenticação de api().
window.addEventListener('pagehide', () => {
    lerCampo();
    for (const [k, { pid, lid, texto }] of pendentes) {
        if (recusados.get(k) === texto) continue;
        fetch(`${API_BASE}/api/v1/projects/${pid}/ot/levantamentos/${encodeURIComponent(lid)}`, {
            method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json', ...cabecalhosAuth() }, body: JSON.stringify({ notas: texto }),
        }).catch(() => {});
    }
});
const redesenhar = async () => { await esvaziarNotas(); window.render(); };

const salvar = async (corpo, padrao, ok) => {
    await esvaziarNotas();
    try {
        await api('PUT', `/api/v1/projects/${S.activeProject.id}/ot/levantamentos/${encodeURIComponent(atual.id)}`, corpo);
        if (ok) showToast(ok, 'success');
        window.render();
        return true;
    } catch (e) { falhou(e, padrao); return false; }
};
window.otSalvarNotas = () => esvaziarNotas();
// "Sim" numa pergunta que espera um achado abre o registro já com a pergunta na evidência (editável).
window.otResponderRoteiro = async (pergunta, resposta) => {
    const ok = await salvar({ roteiro: { ...atual.roteiro, [pergunta]: { ...atual.roteiro?.[pergunta], resposta } } }, 'Não foi possível registrar a resposta.');
    const q = perguntas.find((x) => x.id === pergunta);
    if (ok && resposta === 'sim' && q?.entidade_esperada && atual.situacao !== 'encerrado') await window.otNovoAchado(`Roteiro: ${q.texto} Resposta: sim. `);
};
window.otEncerrarLevantamento = (situacao) => salvar({ situacao }, 'Não foi possível alterar a situação do levantamento.', situacao === 'encerrado' ? 'Levantamento encerrado.' : 'Levantamento reaberto.');

window.otNovoAchado = async (evidencia = '') => {
    const zonas = lista(await api('GET', `/api/v1/projects/${S.activeProject.id}/ot/zonas?site_id=${encodeURIComponent(atual.site_id)}`).catch(() => null), 'zonas');
    openModal(`<div class="modal-header"><span class="modal-title">Registrar achado</span></div>
        <p class="org-dica mb-3">O achado fica nesta sessão até ser enviado ao lote. Campos que faltam viram aviso, não impedem o registro.</p>
        <div class="form-group"><label class="form-label" for="lev-evidencia">Evidência (o que foi visto ou relatado, sem nomes, IP ou MAC)</label><textarea class="form-input" id="lev-evidencia" rows="3" maxlength="2000" autofocus>${escapeHTML(evidencia)}</textarea></div>
        ${camposDoAtivo({}, { zonas, recolher: true })}
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otSalvarAchado">Registrar</button></div>`, 'modal-large');
};
window.otSalvarAchado = async () => {
    const { dados, erro } = lerCamposDoAtivo({ vazio: 'omitir' });
    if (erro) return showToast(erro, 'error');
    const evidencia = el('lev-evidencia').value.trim();
    if (!evidencia) return showToast('Descreva a evidência do achado.', 'error');
    try {
        const r = await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/levantamentos/${encodeURIComponent(atual.id)}/achados`, { dados, evidencia });
        forceCloseModal();
        showToast(r.erros?.length ? `Achado registrado com ${r.erros.length} aviso(s).` : 'Achado registrado.', 'success');
        await redesenhar();
    } catch (e) { falhou(e, 'Não foi possível registrar o achado.'); }
};
window.otDescartarAchado = async (id) => {
    try {
        await api('PUT', `/api/v1/projects/${S.activeProject.id}/ot/levantamentos/${encodeURIComponent(atual.id)}/achados/${encodeURIComponent(id)}`, { situacao: 'descartado' });
        showToast('Achado descartado.', 'success');
        await redesenhar();
    } catch (e) { falhou(e, 'Não foi possível descartar o achado.'); }
};
const marcados = () => [...document.querySelectorAll('input[id^="ach-sel-"]:checked')].map((x) => x.id.slice('ach-sel-'.length));
const nomeDoAchado = (id) => achados.find((x) => x.id === id)?.dados?.nome || 'achado sem nome';
window.otMarcarAchado = () => {
    const n = marcados().length;
    const b = document.querySelector('[data-action="otEnviarAchados"]');
    if (b) b.disabled = !n;
    const dica = el('lev-envio-dica');
    if (dica) dica.textContent = n ? `${n} ${n === 1 ? 'achado marcado' : 'achados marcados'} para o lote.` : 'Marque os achados que vão ao lote.';
};
window.otEnviarAchados = async () => {
    const ids = marcados();
    if (!ids.length) return;
    const n = ids.length;
    if (!await confirmar(`Enviar ${n} ${n === 1 ? 'achado' : 'achados'} ao lote: ${ids.map(nomeDoAchado).join(', ')}. O lote vai para a Coleta, onde outra pessoa aprova antes do inventário.`,
        { titulo: 'Enviar ao lote', rotulo: 'Enviar ao lote' })) return;
    await esvaziarNotas();
    try {
        const r = await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/levantamentos/${encodeURIComponent(atual.id)}/enviar`, { achados: ids });
        showToast(`Lote criado com ${r.itens} item(ns). A aprovação é do Gestor ARCiber.`, 'success');
        S.otLote = r.id; S.otLevantamento = null; S.otAba = 'coleta';
        window.render();
    } catch (e) { falhou(e, 'Não foi possível enviar os achados ao lote.'); }
};
