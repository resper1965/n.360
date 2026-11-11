import { S } from '../state.js';
import { api, API_BASE, cabecalhosAuth, sessaoTerminada } from '../api.js';
import { escapeHTML, renderDataTable, falhaDeCarga, renderStatusBadge, openModal, forceCloseModal, showToast, formatarData, confirmar } from '../ui.js';
import { podeEditarOt, podeAprovarOt, mensagemDeErro, lista, opcoes, nomeDe, camposDoAtivo, lerCamposDoAtivo, listaDeErros, nomeDoAtivo, rotaDoFluxo, ROTULO_CAMPO, semRepetir } from '../ot-comum.js';
import { hojeSP } from '../hoje.js';
import { preencherCartoes } from './ot-sensores.js';

// Levantamento do n.ot (L1, descoberta operacional): sessões de entrevista, visita de campo e documento, com o roteiro guiado e os
// achados que viram lote da coleta (a aprovação continua na Coleta). O operador é só função e turno. IP/MAC aparecem como a API
// devolve; o confronto com o inventário (`confronto`) só chega a quem vê completo, e só então é mostrado.

const el = (id) => document.getElementById(id);
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const falhou = (e, padrao) => showToast(mensagemDeErro(e, padrao), 'error');

const TIPO = { entrevista: 'Entrevista', visita: 'Visita de campo', documento: 'Documento' };
const RESPOSTA = { sim: 'Sim', nao: 'Não', nao_perguntado: 'Não perguntado' };
const ACHADO = { rascunho: ['neutral', 'Rascunho'], enviado: ['info', 'Enviado ao lote'], descartado: ['warning', 'Descartado'] };
const SELO_ORIGEM = { ia: 'Sugerido pela IA', agente: 'Enviado pelo agente' };
// O sensor de rede grava origem 'consultor'; a fonte fica na evidência (EVIDENCIA_SENSOR, src/services/ot-rede.ts).
export const seloDoAchado = (x) => SELO_ORIGEM[x.origem] || (String(x.evidencia || '').startsWith('Sensor de rede (Zeek): ') ? 'Sensor de rede' : '');
const selo = (mapa, v) => renderStatusBadge(...(mapa[v] || ['neutral', v || '—']));
const situacao = (l) => (l.situacao === 'encerrado' ? renderStatusBadge('neutral', 'Encerrado') : renderStatusBadge('info', 'Aberto'));
const quem = (l) => (l.tipo === 'documento' ? escapeHTML(l.documento_titulo || '—')
    : [l.funcao, l.turno && `turno ${l.turno}`].filter(Boolean).map(escapeHTML).join(' · ') || '—');

let sites = [];
let atual = null;
let perguntas = [];
let achados = [];
let nomesPontas = {}; // `nomes_pontas` da sessão: id → nome das pontas dos fluxos (nunca de /ativos, que traria IP/MAC)
let ativosDoSite = []; // `ativos_do_site`: { id, nome } para escolher a ponta
let perguntaDoAchado = null;

let fixo = null; // site fixo da tela do site: recorta a lista e tira o seletor de site do formulário

export async function montarLevantamento(c, a, p, { siteFixo } = {}) {
    fixo = siteFixo || null;
    if (S.otLevantamento) { await montarSessao(c, a, p, S.otLevantamento); return; }
    let levs;
    try {
        const [s, l] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/sites`), api('GET', `/api/v1/projects/${p.id}/ot/levantamentos`)]);
        sites = lista(s, 'sites'); levs = lista(l, 'levantamentos');
        if (fixo) { sites = sites.filter((x) => x.id === fixo); levs = levs.filter((x) => x.site_id === fixo); }
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os levantamentos do n.ot.', e); return; }
    if (podeEditarOt() && sites.length) a.innerHTML = '<button class="btn btn-primary" data-action="otNovoLevantamento">+ Novo levantamento</button>';
    c.innerHTML = `<div id="ot-cartoes-slot"></div><p class="org-header-intro">Entrevistas, visitas de campo e documentos do site. O operador é registrado só por função e turno: não escreva nomes, IP, MAC, e-mail ou telefone nas notas.</p>
        ${renderDataTable(['Tipo', 'Data', 'Quem ou documento', 'Site', 'Achados', 'Situação', 'Ações'], levs.map((l) => [
        escapeHTML(TIPO[l.tipo] || l.tipo), escapeHTML(formatarData(l.realizado_em)), quem(l), escapeHTML(nomeDe(sites, l.site_id)), escapeHTML(String(l.achados ?? 0)), situacao(l),
        `<button class="btn btn-sm" data-action="otAbrirLevantamento" data-args='${args(l.id)}' aria-label="${escapeHTML(`Abrir ${TIPO[l.tipo] || l.tipo} de ${formatarData(l.realizado_em)}`)}">Abrir</button>`,
    ]), { emptyMessage: 'Nenhum levantamento registrado.', emptyHint: 'Comece por uma entrevista ou visita de campo no site.' })}`;
    preencherCartoes(p, sites); // sem await: a lista não espera os cartões
}

window.otAbrirLevantamento = (id) => { S.otLevantamento = id; window.render(); };
window.otVoltarLevantamentos = async () => { await esvaziarNotas(); S.otLevantamento = null; window.render(); };

// ─── nova sessão ───────────────────────────────────────────────────────────
window.otNovoLevantamento = () => {
    const campo = (id, rotulo, tipo = 'text', extra = '') => `<div class="form-group"><label class="form-label" for="${id}">${rotulo}</label><input class="form-input" type="${tipo}" id="${id}"${extra}></div>`;
    openModal(`<div class="modal-header"><span class="modal-title">Novo levantamento</span></div>
        ${fixo ? `<input type="hidden" id="lev-f-site" value="${escapeHTML(fixo)}">` : `<div class="form-group"><label class="form-label" for="lev-f-site">Site</label><select class="form-input" id="lev-f-site">${opcoes(sites.map((s) => [s.id, s.nome]), S.otSite)}</select></div>`}
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
    nomesPontas = r.nomes_pontas || {};
    ativosDoSite = lista(r, 'ativos_do_site');
    const editar = podeEditarOt();
    const aberto = l.situacao !== 'encerrado';
    const rascunhos = achados.filter((x) => x.situacao === 'rascunho');
    a.innerHTML = '<button class="btn" data-action="otVoltarLevantamentos">Voltar aos levantamentos</button>'
        + (editar ? `<button class="btn" data-action="otEncerrarLevantamento" data-args='${args(aberto ? 'encerrado' : 'aberto')}'>${aberto ? 'Encerrar' : 'Reabrir'}</button>` : '')
        + (editar && aberto ? '<button class="btn" data-action="otNovoAchado">Registrar achado</button>' : '')
        + (editar && aberto && l.tipo === 'documento' ? '<button class="btn" data-action="otImportarArquivo">Importar arquivo</button>' : '')
        + (editar && rascunhos.length ? '<button class="btn btn-primary" data-action="otEnviarAchados" aria-describedby="lev-envio-dica" disabled>Enviar ao lote</button>' : '');

    const doTipo = perguntas.filter((q) => Array.isArray(q.tipos_sessao) && q.tipos_sessao.includes(l.tipo));
    const roteiro = !doTipo.length ? '' : `<h3 class="mb-3">Roteiro</h3>
        ${renderDataTable(['Pergunta', 'Item da norma', 'Resposta', ...(editar ? ['Responder'] : [])], doTipo.map((q) => {
        const resp = l.roteiro?.[q.id]?.resposta;
        return [escapeHTML(q.texto), `<span class="badge">${escapeHTML(q.item_norma || '—')}</span>`, escapeHTML(RESPOSTA[resp] || '—'),
            ...(editar ? [`<div class="d-flex gap-2 ot-resposta">${Object.entries(RESPOSTA).map(([v, rot]) => `<button class="btn btn-sm" data-action="otResponderRoteiro" data-args='${args(q.id, v)}' aria-pressed="${resp === v}">${rot}</button>`).join('')}</div>`] : [])];
    }))}`;

    const comConfronto = achados.some((x) => 'confronto' in x);
    const tabela = renderDataTable([...(editar ? ['Enviar'] : []), 'Tipo', 'Nome', 'IP', 'MAC', 'Evidência', ...(comConfronto ? ['Confronto'] : []), 'Avisos', 'Situação', ...(editar ? ['Ações'] : [])],
        achados.map((x) => {
            const d = x.dados || {};
            const fluxo = x.entidade === 'fluxo';
            const nome = nomeDoAchado(x.id, 'achado');
            const rasc = x.situacao === 'rascunho';
            return [...(editar ? [rasc ? `<input type="checkbox" id="ach-sel-${escapeHTML(x.id)}" data-action-change="otMarcarAchado" aria-label="${escapeHTML(`Enviar ${nome} ao lote`)}">` : '—'] : []),
                fluxo ? 'Fluxo' : 'Ativo', escapeHTML(nome) + (seloDoAchado(x) ? ` <span class="badge selo-info">${seloDoAchado(x)}</span>` : ''), `<span class="f-mono">${escapeHTML(fluxo ? '—' : d.ip ?? '—')}</span>`, `<span class="f-mono">${escapeHTML(fluxo ? '—' : d.mac ?? '—')}</span>`, escapeHTML(x.evidencia || '—'),
                ...(comConfronto ? [confronto(x)] : []), listaDeErros(x.erros), selo(ACHADO, x.situacao),
                ...(editar ? [rasc ? `<button class="btn btn-sm" data-action="otDescartarAchado" data-args='${args(x.id)}' aria-label="${escapeHTML(`Descartar ${nome}`)}">Descartar</button>` : '—'] : [])];
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

const CONTRADIZ = 'O inventário registra esse fluxo de outro jeito (externo ou VPN)';
function confronto(x) {
    if (x.confronto === 'contradiz') return `<span class="badge selo-warning" title="${escapeHTML(CONTRADIZ)}">Contradiz</span>`;
    if (x.confronto === 'confirma') return escapeHTML(x.entidade === 'fluxo' ? 'Confirma' : `Confirma ${nomeDoAtivo(x.alvo_id)}`);
    return x.confronto === 'novo' ? (x.entidade === 'fluxo' ? 'Novo' : 'Novo no inventário') : '—';
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
// O navegador recusa keepalive acima de 64 KB somados: manda as notas que cabem; as demais ficam como estavam no servidor.
const TETO_KEEPALIVE = 64 * 1024;
window.addEventListener('pagehide', () => {
    lerCampo();
    let soma = 0;
    for (const [k, { pid, lid, texto }] of pendentes) {
        if (recusados.get(k) === texto) continue;
        const body = JSON.stringify({ notas: texto });
        const bytes = new TextEncoder().encode(body).length;
        if (soma + bytes > TETO_KEEPALIVE) continue;
        soma += bytes;
        fetch(`${API_BASE}/api/v1/projects/${pid}/ot/levantamentos/${encodeURIComponent(lid)}`, {
            method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json', ...cabecalhosAuth() }, body,
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
    if (ok && resposta === 'sim' && q?.entidade_esperada && atual.situacao !== 'encerrado') {
        await window.otNovoAchado(`Roteiro: ${q.texto} Resposta: sim. `, q.id, q.entidade_esperada === 'fluxo' ? 'fluxo' : 'ativo');
    }
};
window.otEncerrarLevantamento = (situacao) => salvar({ situacao }, 'Não foi possível alterar a situação do levantamento.', situacao === 'encerrado' ? 'Levantamento encerrado.' : 'Levantamento reaberto.');

// Pontas do fluxo num select só: "a:<id>" ativo, "z:<id>" zona, "fora" fora da empresa (marca Externo = Sim e não vai ao servidor).
const selectPonta = (id, rotulo, zonas) => `<div class="form-group"><label class="form-label" for="${id}">${rotulo}</label><select class="form-input" id="${id}" data-action-change="otPontaFluxo" data-arg-val><option value="">—</option>
    <optgroup label="Ativos">${opcoes(ativosDoSite.map((x) => [`a:${x.id}`, x.nome]))}</optgroup>
    <optgroup label="Zonas">${opcoes(zonas.map((x) => [`z:${x.id}`, x.nome]))}</optgroup>
    <option value="fora">Fora da empresa</option></select></div>`;
// Externo e Via VPN: "Não informado" não vai ao servidor, que então não compara nem grava o campo (nunca vira "não" por omissão).
const simNao = (id, rotulo) => `<div class="form-group"><label class="form-label" for="${id}">${rotulo}</label><select class="form-input" id="${id}"><option value="">Não informado</option>${opcoes([['sim', 'Sim'], ['nao', 'Não']])}</select></div>`;
const camposDoFluxo = (zonas) => `${selectPonta('lev-fx-origem', 'Origem', zonas)}${selectPonta('lev-fx-destino', 'Destino', zonas)}
    <div class="form-group"><label class="form-label" for="lev-fx-protocolo">Protocolo</label><input class="form-input" id="lev-fx-protocolo" maxlength="50"></div>
    <div class="form-group"><label class="form-label" for="lev-fx-porta">Porta</label><input class="form-input" type="number" id="lev-fx-porta" min="0" max="65535" step="1"></div>
    <div class="form-group"><label class="form-label" for="lev-fx-direcao">Direção</label><select class="form-input" id="lev-fx-direcao"><option value="">—</option>${opcoes([['unidirecional', 'Unidirecional'], ['bidirecional', 'Bidirecional']])}</select></div>
    <div class="form-group"><label class="form-label" for="lev-fx-finalidade">Finalidade</label><input class="form-input" id="lev-fx-finalidade" maxlength="500"></div>
    ${simNao('lev-fx-externo', 'Externo')}${simNao('lev-fx-vpn', 'Via VPN')}`;
window.otPontaFluxo = (v) => { if (v === 'fora') el('lev-fx-externo').value = 'sim'; };
window.otEntidadeAchado = (v) => {
    el('lev-ach-ativo').hidden = v === 'fluxo';
    el('lev-ach-fluxo').hidden = v !== 'fluxo';
    const r = document.querySelector(`input[name="ach-entidade"][value="${v === 'fluxo' ? 'fluxo' : 'ativo'}"]`);
    if (r) r.checked = true;
};
window.otNovoAchado = async (evidencia = '', perguntaId = null, entidade = 'ativo') => {
    perguntaDoAchado = perguntaId;
    const zonas = lista(await api('GET', `/api/v1/projects/${S.activeProject.id}/ot/zonas?site_id=${encodeURIComponent(atual.site_id)}`).catch(() => null), 'zonas');
    const radio = (v, rot) => `<label class="d-flex gap-2 items-center"><input type="radio" name="ach-entidade" value="${v}" data-action-change="otEntidadeAchado" data-arg-val${v === entidade ? ' checked' : ''}> ${rot}</label>`;
    openModal(`<div class="modal-header"><span class="modal-title">Registrar achado</span></div>
        <p class="org-dica mb-3">O achado fica nesta sessão até ser enviado ao lote. Campos que faltam viram aviso, não impedem o registro.</p>
        <div class="form-group"><label class="form-label" for="lev-evidencia">Evidência (o que foi visto ou relatado, sem nomes, IP ou MAC)</label><textarea class="form-input" id="lev-evidencia" rows="3" maxlength="2000" autofocus>${escapeHTML(evidencia)}</textarea></div>
        <fieldset class="form-group"><legend class="form-label">O que foi achado</legend><div class="d-flex gap-4">${radio('ativo', 'Ativo')}${radio('fluxo', 'Fluxo')}</div></fieldset>
        <div id="lev-ach-ativo"${entidade === 'fluxo' ? ' hidden' : ''}>${camposDoAtivo({}, { zonas, recolher: true })}</div>
        <div id="lev-ach-fluxo"${entidade === 'fluxo' ? '' : ' hidden'}>${camposDoFluxo(zonas)}</div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otSalvarAchado">Registrar</button></div>`, 'modal-large');
};
// Fluxo: só o que foi preenchido; externo e via_vpn só se escolhidos (Sim/Não). Devolve { erro } se a porta não for inteiro de 0 a 65535.
function lerCamposDoFluxo() {
    const v = (id) => el(id)?.value.trim() || '';
    const d = {};
    for (const [k, id] of [['externo', 'lev-fx-externo'], ['via_vpn', 'lev-fx-vpn']]) if (v(id)) d[k] = v(id) === 'sim';
    for (const lado of ['origem', 'destino']) {
        const x = v(`lev-fx-${lado}`);
        if (x === 'fora') d.externo = true;
        else if (x) d[`${lado}_${x[0] === 'a' ? 'ativo' : 'zona'}_id`] = x.slice(2);
    }
    for (const k of ['protocolo', 'direcao', 'finalidade']) if (v(`lev-fx-${k}`)) d[k] = v(`lev-fx-${k}`);
    const porta = v('lev-fx-porta');
    if (porta) {
        if (!/^\d+$/.test(porta) || Number(porta) > 65535) return { erro: 'Porta: número inteiro de 0 a 65535.' };
        d.porta = Number(porta);
    }
    return { dados: d };
}
window.otSalvarAchado = async () => {
    const entidade = document.querySelector('input[name="ach-entidade"]:checked')?.value === 'fluxo' ? 'fluxo' : 'ativo';
    const { dados, erro } = entidade === 'fluxo' ? lerCamposDoFluxo() : lerCamposDoAtivo({ vazio: 'omitir' });
    if (erro) return showToast(erro, 'error');
    const evidencia = el('lev-evidencia').value.trim();
    if (!evidencia) return showToast('Descreva a evidência do achado.', 'error');
    try {
        const r = await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/levantamentos/${encodeURIComponent(atual.id)}/achados`,
            { entidade, dados, evidencia, ...(perguntaDoAchado ? { pergunta_id: perguntaDoAchado } : {}) });
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
function nomeDoAchado(id, padrao = 'achado sem nome') {
    const x = achados.find((a) => a.id === id);
    return x?.entidade === 'fluxo' ? rotaDoFluxo(x.dados, nomesPontas) : x?.dados?.nome || padrao;
}
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
    const fl = ids.filter((id) => achados.find((x) => x.id === id)?.entidade === 'fluxo').length;
    const at = ids.length - fl;
    const conta = [at && `${at} ${at === 1 ? 'ativo' : 'ativos'}`, fl && `${fl} ${fl === 1 ? 'fluxo' : 'fluxos'}`].filter(Boolean).join(' e ');
    if (!await confirmar(`Enviar ${ids.length} ${ids.length === 1 ? 'achado' : 'achados'} ao lote (${conta}): ${ids.map((id) => nomeDoAchado(id)).join(', ')}. O lote vai para a Coleta, onde outra pessoa aprova antes do inventário.`,
        { titulo: 'Enviar ao lote', rotulo: 'Enviar ao lote' })) return;
    await esvaziarNotas();
    try {
        const r = await api('POST', `/api/v1/projects/${S.activeProject.id}/ot/levantamentos/${encodeURIComponent(atual.id)}/enviar`, { achados: ids });
        showToast(`Lote criado com ${r.itens} item(ns). A aprovação é do Gestor ARCiber.`, 'success');
        S.otLote = r.id; S.otLevantamento = null; S.otSub = 'aprovacao'; S.otAba = 'coleta';
        // Fora da tela do site (casca antiga, sem otTela) o salto continua pela aba Coleta.
        if (window.otTela) window.otTela('site', atual.site_id || S.otSite, 'projeto'); else window.render();
    } catch (e) { falhou(e, 'Não foi possível enviar os achados ao lote.'); }
};

// ─── importar arquivo (L4, de-para): o arquivo fica só na memória desta tela e vai de novo, o mesmo, ao aplicar ─────
const CAMPOS_DEPARA = ['nome', 'ip', 'mac', 'fabricante', 'modelo', 'tipo_dispositivo', 'funcao', 'protocolos_portas', 'firmware_so_versao',
    'no_arciber', 'categoria_arciber', 'firmware_nao_aplicavel', 'zona']; // src/services/ot-depara.ts
const ORIGEM_DEPARA = { ia: 'Sugerido pela IA', cabecalho: 'Pelo nome da coluna', nozomi: 'Perfil Nozomi (export de ativos)' };
let importacao = null; // { file, cabecalho }
let observador = null;
let fechamentos = 0; // conta os fechamentos do modal: a proposta que chega depois de um fechamento é descartada
const conta = (k, um, varios) => `${k} ${k === 1 ? um : varios}`;

/** Fechar o modal por qualquer caminho (Cancelar, Fechar, Esc, fundo) solta o arquivo guardado na memória da tela. */
function soltarAoFechar() {
    observador?.disconnect();
    const ov = el('modal-overlay');
    observador = new MutationObserver(() => {
        if (ov.classList.contains('open')) return;
        importacao = null;
        fechamentos++;
        const input = el('lev-imp-arquivo');
        if (input) input.value = '';
        observador.disconnect(); observador = null;
    });
    observador.observe(ov, { attributes: true, attributeFilter: ['class'] });
}

/** Multipart (o api() só manda JSON): `enviar` faz o fetch, com o caminho literal (catraca contrato-tela-api). Devolve o corpo do 2xx ou lança Error para a tela. */
async function enviarArquivo(enviar) {
    let r, corpo;
    try {
        r = await enviar();
        corpo = await r.json().catch(() => ({}));
    } catch { throw new Error('Não foi possível enviar o arquivo. Verifique a conexão e tente de novo.'); }
    if (r.status === 401) throw sessaoTerminada(corpo, '401 no de-para do n.ot');
    if (r.status === 429) throw new Error('Limite por hora do de-para atingido; tente mais tarde.');
    if (r.status === 422) throw new Error(`${String(corpo.error || 'A IA não respondeu').replace(/\.$/, '')}. Registre os achados à mão.`);
    if (!r.ok) throw Object.assign(new Error(corpo.error || ''), { status: r.status, body: corpo });
    return corpo;
}

// O resumo de rede só vai a quem vê o inventário completo (a rota recusa os demais com 403); podeAprovar = podeVerCompleto no servidor.
const ofereceRede = () => podeAprovarOt();

window.otImportarArquivo = () => {
    importacao = null;
    const rede = ofereceRede();
    openModal(`<div class="modal-header"><span class="modal-title">Importar arquivo</span></div>
        <p class="org-dica mb-3">O arquivo é lido e descartado; não fica guardado. IP, MAC e dados pessoais são mascarados antes da IA.</p>
        <div class="form-group"><label class="form-label" for="lev-imp-arquivo">${rede ? 'Planilha (CSV ou XLSX), documento (TXT ou DOCX) ou resumo de rede (JSON)' : 'Planilha (CSV ou XLSX) ou documento (TXT ou DOCX)'}</label>
        <input class="form-input" type="file" id="lev-imp-arquivo" accept=".csv,.xlsx,.txt,.docx${rede ? ',.json' : ''}"></div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otLerArquivo">Continuar</button></div>`);
    soltarAoFechar();
};

window.otLerArquivo = () => semRepetir('otLerArquivo', lerArquivo);
async function lerArquivo() {
    const file = el('lev-imp-arquivo')?.files?.[0];
    if (!file) return showToast('Escolha o arquivo.', 'error');
    const ext = file.name.split('.').pop().toLowerCase();
    const fd = new FormData();
    fd.append('file', file);
    if (ext === 'txt' || ext === 'docx') {
        if (!await confirmar('A IA vai ler o texto mascarado e sugerir achados. Revise cada um antes de enviar ao lote.', { titulo: 'Ler documento', rotulo: 'Ler com a IA' })) return;
        try {
            const r = await enviarArquivo(() => fetch(`${API_BASE}/api/v1/projects/${S.activeProject.id}/ot/levantamentos/${encodeURIComponent(atual.id)}/depara/texto`,
            { method: 'POST', headers: cabecalhosAuth(), body: fd, signal: AbortSignal.timeout(120000) }));
            forceCloseModal();
            showToast(`${conta(r.criados, 'achado sugerido', 'achados sugeridos')} pela IA. ${conta(r.descartados, 'descartado', 'descartados')} por evidência ausente.`
                + (r.trechos_pulados > 0 ? ` ${conta(r.trechos_pulados, 'trecho pulado', 'trechos pulados')} por endereço sem máscara.` : ''), 'success');
            await redesenhar();
        } catch (e) { falhou(e, 'Não foi possível ler o documento.'); }
        return;
    }
    if (ext === 'json' && ofereceRede()) return lerResumoRede(file);
    if (ext !== 'csv' && ext !== 'xlsx') return showToast('Use CSV, XLSX, TXT ou DOCX.', 'error');
    let p;
    const aberto = fechamentos;
    try { p = await enviarArquivo(() => fetch(`${API_BASE}/api/v1/projects/${S.activeProject.id}/ot/levantamentos/${encodeURIComponent(atual.id)}/depara/planilha/proposta`,
            { method: 'POST', headers: cabecalhosAuth(), body: fd, signal: AbortSignal.timeout(120000) })); }
    catch (e) { return falhou(e, 'Não foi possível ler a planilha.'); }
    if (aberto !== fechamentos) return; // fechou durante a leitura: não reabre o mapeamento nem guarda o arquivo
    importacao = { file, cabecalho: p.cabecalho || [] };
    const seloOrigem = p.origem === 'perfil' ? `Perfil salvo: ${p.perfil?.nome || ''}` : ORIGEM_DEPARA[p.origem] || p.origem;
    const linhas = importacao.cabecalho.map((c, i) => {
        const rotulo = c.trim() || `Coluna ${i + 1}`;
        return [escapeHTML(rotulo), `<select class="form-input" id="lev-map-${i}" aria-label="${escapeHTML(`Campo do n.ot para ${rotulo}`)}"><option value="">Ignorar</option>${opcoes(CAMPOS_DEPARA.map((k) => [k, ROTULO_CAMPO[k]]), p.mapeamento?.[i])}</select>`];
    });
    openModal(`<div class="modal-header"><span class="modal-title">Importar planilha</span></div>
        <p class="d-flex gap-2 items-center mb-2"><span class="badge selo-info">${escapeHTML(seloOrigem)}</span> <span>${escapeHTML(conta(p.linhas, 'linha', 'linhas'))}</span></p>
        ${p.aviso ? `<p class="org-dica mb-3" role="status">${escapeHTML(p.aviso)}</p>` : ''}
        ${renderDataTable(['Coluna da planilha', 'Campo do n.ot'], linhas)}
        <label class="opcao-check mb-3" for="lev-imp-perfil"><input type="checkbox" id="lev-imp-perfil"> Salvar como perfil</label>
        <div class="form-group"><label class="form-label" for="lev-imp-perfil-nome">Nome do perfil</label><input class="form-input" id="lev-imp-perfil-nome" maxlength="100" value="${escapeHTML(p.perfil?.nome || '')}"></div>
        <div class="form-group"><label class="form-label" for="lev-imp-perfil-fonte">Fonte (sistema que gera a planilha)</label><input class="form-input" id="lev-imp-perfil-fonte" maxlength="200" value="${escapeHTML(p.perfil?.fonte || '')}"></div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otAplicarDepara">Criar achados</button></div>`, 'modal-large');
}

window.otAplicarDepara = () => semRepetir('otAplicarDepara', aplicarDepara);
async function aplicarDepara() {
    if (!importacao) return;
    const mapeamento = {};
    importacao.cabecalho.forEach((_, i) => { const v = el(`lev-map-${i}`)?.value; if (v) mapeamento[i] = v; });
    const campos = Object.values(mapeamento);
    if (!campos.length) return showToast('Escolha o campo de ao menos uma coluna.', 'error');
    const repetido = campos.find((c, i) => campos.indexOf(c) !== i);
    if (repetido) return showToast(`O campo "${ROTULO_CAMPO[repetido]}" está em mais de uma coluna. Deixe só uma.`, 'error');
    const fd = new FormData();
    fd.append('file', importacao.file);
    fd.append('mapeamento', JSON.stringify(mapeamento));
    if (el('lev-imp-perfil')?.checked) {
        const nome = el('lev-imp-perfil-nome').value.trim();
        if (!nome) return showToast('Dê um nome ao perfil.', 'error');
        fd.append('perfil_nome', nome);
        const fonte = el('lev-imp-perfil-fonte').value.trim();
        if (fonte) fd.append('perfil_fonte', fonte);
    }
    try {
        const r = await enviarArquivo(() => fetch(`${API_BASE}/api/v1/projects/${S.activeProject.id}/ot/levantamentos/${encodeURIComponent(atual.id)}/depara/planilha/aplicar`,
            { method: 'POST', headers: cabecalhosAuth(), body: fd, signal: AbortSignal.timeout(120000) }));
        importacao = null;
        forceCloseModal();
        showToast(`${conta(r.criados, 'achado criado', 'achados criados')} (${r.com_aviso} com aviso).`
            + (r.macs_gateway > 0 ? ` ${conta(r.macs_gateway, 'MAC de roteador ignorado', 'MACs de roteador ignorados')}.` : ''), 'success');
        await redesenhar();
    } catch (e) { falhou(e, 'Não foi possível criar os achados.'); }
}

// ─── resumo do sensor de rede (L3): a tela só confere o formato e conta; quem valida, cifra e cruza com o inventário é o servidor ─────
async function lerResumoRede(file) {
    // mesmo teto do servidor (sessaoEArquivo): não lê para a memória um arquivo que seria recusado
    if (file.size > 5 * 1024 * 1024) return showToast('Resumo acima de 5 MB: gere de novo com o script atual, que corta as conexões menos frequentes', 'error');
    const aberto = fechamentos;
    let j = null;
    try { j = JSON.parse(await file.text()); } catch { /* cai na recusa abaixo */ }
    if (aberto !== fechamentos) return;
    if (j?.formato !== 'n.ot-resumo-rede/1' || !Array.isArray(j.ativos) || !Array.isArray(j.conexoes)) return showToast('Arquivo não é um resumo de rede do n.ot', 'error');
    importacao = { file };
    const periodo = j.periodo ? `Período: ${formatarData(j.periodo.inicio, { hora: true })} a ${formatarData(j.periodo.fim, { hora: true })}.` : 'Sem período no resumo.';
    openModal(`<div class="modal-header"><span class="modal-title">Importar resumo de rede</span></div>
        <p class="org-dica mb-3">IP e MAC entram cifrados; o arquivo não fica guardado.</p>
        <p class="mb-2">${escapeHTML(periodo)}</p>
        <p class="mb-3">${escapeHTML(`${conta(j.ativos.length, 'ativo', 'ativos')} e ${conta(j.conexoes.length, 'conexão', 'conexões')} no resumo.`)}</p>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otImportarRede">Criar achados</button></div>`);
}

window.otImportarRede = () => semRepetir('otImportarRede', importarRede);
async function importarRede() {
    if (!importacao?.file) return;
    const fd = new FormData();
    fd.append('file', importacao.file);
    try {
        const r = await enviarArquivo(() => fetch(`${API_BASE}/api/v1/projects/${S.activeProject.id}/ot/levantamentos/${encodeURIComponent(atual.id)}/depara/rede`,
            { method: 'POST', headers: cabecalhosAuth(), body: fd, signal: AbortSignal.timeout(120000) }));
        importacao = null;
        forceCloseModal();
        const fora = (r.nao_importados || 0) + (r.pendentes_nao_importados || 0);
        showToast(`Achados criados: ${conta(r.ativos_novos, 'ativo novo', 'ativos novos')}, ${conta(r.macs_completados, 'MAC completado', 'MACs completados')}, `
            + `${conta(r.fluxos_criados, 'fluxo criado', 'fluxos criados')}.`
            + (r.ativos_conhecidos > 0 ? ` ${conta(r.ativos_conhecidos, 'ativo já estava', 'ativos já estavam')} no inventário.` : '')
            + (r.fluxos_pendentes > 0 ? ` ${conta(r.fluxos_pendentes, 'fluxo espera', 'fluxos esperam')} a aprovação dos ativos novos.` : '')
            + (fora > 0 ? ` ${conta(fora, 'item ficou', 'itens ficaram')} de fora pelo limite da sessão.` : ''), 'success');
        await redesenhar();
    } catch (e) { falhou(e, 'Não foi possível importar o resumo de rede.'); }
}
