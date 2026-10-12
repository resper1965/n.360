import { S } from '../state.js';
import { api, API_BASE, cabecalhosAuth } from '../api.js';
import { escapeHTML, openModal, showToast } from '../ui.js';

// Importar programa (n.privacy, fatia 1). A regra é do servidor (`/projects/:id/importacoes`); aqui: lotes, envio de arquivos (um por
// requisição), processamento arquivo a arquivo, revisão dos tratamentos propostos e confirmação em rodadas. TUDO o que vem da API
// (nome de arquivo, origem, motivo, dados) é texto que um modelo extraiu de arquivo do cliente: sai sempre por escapeHTML.

const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const e = (v) => escapeHTML(String(v ?? ''));
// Caminhos escritos por extenso em cada chamada: test/contrato-tela-api.test.ts só confere o que é literal /api/v1/...
const pid = () => projetoAtivo().id;
const lid = () => encodeURIComponent(E.loteId);
const SESSAO = /Unauthorized|Sessão expirada/;

// Estado da tela (um lote aberto por vez).
const E = { c: null, h: null, a: null, lotes: null, loteId: null, det: null, msg: '', envios: [], resultados: null, cancelando: false, ocupado: false };

const STATUS_LOTE = { recebendo: 'Recebendo arquivos', processando: 'Processando', em_revisao: 'Em revisão', gravando: 'Gravando', concluida: 'Concluída', cancelada: 'Cancelada' };
const STATUS_ARQ = { pendente: ['Na fila', 'neutral'], processado: ['Processado', 'success'], aguardando: ['Sem extração', 'info'], erro: ['Erro', 'danger'] };
const TIPOS = { inventario: 'Inventário de tratamentos', desconhecido: 'Não reconhecido' };
const CONF = { alta: ['Alta', 'success'], media: ['Média', 'warning'], baixa: ['Baixa', 'danger'] };
const DECISAO = { pendente: ['Pendente', 'neutral'], aceito: ['Aceito', 'info'], descartado: ['Descartado', 'neutral'], recusado: ['Recusado', 'danger'], gravado: ['Gravado', 'success'] };
const CAMPOS = [
    ['finalidade', 'Finalidade'], ['base_legal', 'Base legal'], ['categorias_dados', 'Categorias de dados'], ['titulares', 'Titulares'],
    ['retencao', 'Retenção'], ['destinatarios', 'Destinatários'], ['salvaguardas', 'Salvaguardas'], ['responsavel', 'Responsável'],
];
const LISTAS = [['sistemas', 'Sistemas'], ['areas', 'Áreas'], ['pessoas', 'Pessoas']];
const ROTULO = Object.fromEntries([...CAMPOS, ...LISTAS]);

const badge = (par) => window.renderStatusBadge(par[0], par[1]);

function pinta() {
    if (!E.c) return;
    E.c.innerHTML = E.det ? htmlLote() : E.lotes ? htmlLista() : '';
}

async function renderImportacao(c, h, a) {
    h.textContent = 'Importar programa';
    a.innerHTML = '';
    Object.assign(E, { c, h, a });
    if (!projetoAtivo()) {
        c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>';
        return;
    }
    if (E.loteId) return recarrega();
    E.det = null;
    try { E.lotes = (await api('GET', `/api/v1/projects/${pid()}/importacoes`)).lotes || []; } catch (err) {
        c.innerHTML = `<div class="empty-state fade-in"><h3>Não foi possível listar os lotes</h3><p>${e(err.message)}</p></div>`;
        return;
    }
    pinta();
}

async function recarrega() {
    try { E.det = await api('GET', `/api/v1/projects/${pid()}/importacoes/${lid()}`); } catch (err) {
        E.loteId = null; E.det = null;
        showToast((err && err.message) || 'Não foi possível abrir o lote', 'error');
        return renderImportacao(E.c, E.h, E.a);
    }
    pinta();
}

// ─── lista ───────────────────────────────────────────────────────────────────────────────────────

function htmlLista() {
    const linhas = E.lotes.map((l) => [
        e(l.created_at), badge([STATUS_LOTE[l.status] || l.status, l.status === 'concluida' ? 'success' : l.status === 'cancelada' ? 'neutral' : 'info']),
        e(l.arquivos), e(l.itens), l.status === 'cancelada' ? '' : `<button class="btn btn-ghost btn-sm" data-action="importacaoAbrir" data-args='${args(l.id)}'>Abrir</button>`,
    ]);
    return `
        <p style="margin:0 0 1rem;color:var(--text-dim)">Envie o inventário de tratamentos que o cliente já tem (planilha, documento ou PDF). A IA propõe os tratamentos; você revisa e confirma antes de gravar no RoPA.</p>
        <button class="btn btn-primary" data-action="importacaoNovo" style="margin-bottom:1rem">Novo lote</button>
        ${window.renderDataTable(['Criado em', 'Situação', 'Arquivos', 'Tratamentos propostos', 'Ações'], linhas, { emptyState: 'Nenhum lote de importação neste projeto.' })}`;
}

function abreLote(id) { Object.assign(E, { loteId: id, envios: [], resultados: null, msg: '', cancelando: false }); return recarrega(); }

window.importacaoNovo = async function () {
    try { await abreLote((await api('POST', `/api/v1/projects/${pid()}/importacoes`)).id); } catch (err) { showToast((err && err.message) || 'Não foi possível criar o lote', 'error'); }
};
window.importacaoAbrir = (id) => abreLote(id);
window.importacaoVoltar = async function () {
    E.loteId = null; E.det = null;
    await renderImportacao(E.c, E.h, E.a);
};

// ─── lote ────────────────────────────────────────────────────────────────────────────────────────

function htmlLote() {
    const { lote, arquivos, itens } = E.det;
    const ativo = lote.status !== 'cancelada';
    const fila = arquivos.filter((x) => x.status === 'pendente' || x.status === 'erro').length;
    const bloqueado = E.ocupado ? ' disabled' : '';
    const arqs = window.renderDataTable(['Arquivo', 'Situação', 'Tipo detectado', 'Observação'], arquivos.map((x) => [
        e(x.nome), badge(STATUS_ARQ[x.status] || [x.status, 'neutral']), e(x.tipo ? TIPOS[x.tipo] || x.tipo : ''), e(x.erro || ''),
    ]), { emptyState: 'Nenhum arquivo enviado ainda.' });
    const envios = E.envios.length ? `<ul style="margin:0.5rem 0;padding-left:1.2rem">${E.envios.map((v) => `<li style="color:${v.ok ? 'var(--text-2)' : 'var(--danger)'}">${e(v.nome)}: ${e(v.ok ? 'enviado' : v.erro)}</li>`).join('')}</ul>` : '';
    return `
        <div style="display:flex;gap:0.75rem;align-items:center;margin-bottom:1rem">
            <button class="btn btn-ghost btn-sm" data-action="importacaoVoltar">Voltar aos lotes</button>
            ${badge([STATUS_LOTE[lote.status] || lote.status, 'info'])}
        </div>
        <div id="importacao-msg" role="status" style="margin-bottom:1rem;color:var(--text-2)">${e(E.msg)}</div>
        <h3 style="margin:0 0 0.5rem">Arquivos</h3>
        ${ativo ? `<div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;margin-bottom:0.5rem">
            <input type="file" id="importacao-arquivos" class="form-input" multiple accept=".pdf,.docx,.xlsx,.xls,.ods,.csv,.json,.html,.xml" style="max-width:420px">
            <button class="btn btn-primary" data-action="importacaoEnviar"${bloqueado}>Enviar arquivos</button>
            <button class="btn" data-action="importacaoProcessar"${bloqueado}${fila ? '' : ' disabled'}>Processar</button>
        </div>` : ''}
        ${envios}${arqs}
        <h3 style="margin:1.5rem 0 0.5rem">Revisão</h3>
        ${htmlItens(itens, ativo)}
        ${E.resultados && E.resultados.length ? htmlResultados(itens) : ''}
        ${ativo ? htmlRodape(itens, lote) : ''}`;
}

function htmlItens(itens, ativo) {
    const alta = itens.filter((i) => i.confianca === 'alta' && i.decisao === 'pendente' && !i.duplicata_de).length;
    const barra = alta ? `<button class="btn btn-ghost btn-sm" style="margin-bottom:0.75rem" data-action="importacaoAceitarAlta"${E.ocupado ? ' disabled' : ''}>Aceitar todos de confiança alta (${alta})</button>` : '';
    const linhas = itens.map((i) => {
        const d = i.dados || {};
        const falta = (i.faltando || []).map((k) => e(ROTULO[k] || k)).join(', ');
        const dup = i.duplicata_de ? `<div>${badge(['Já existe', 'warning'])} <button class="btn btn-ghost btn-sm" data-action="navigate" data-args='${args('ropa')}'>Ver no RoPA</button></div>` : '';
        const origem = i.origem ? `<details><summary>Origem</summary><div style="white-space:pre-wrap;color:var(--text-dim)">${e(i.origem)}</div></details>` : '';
        const motivo = i.motivo ? `<div style="color:var(--danger)">${e(i.motivo)}</div>` : '';
        const resumo = `<strong>${e(d.finalidade || '(sem finalidade)')}</strong><div style="color:var(--text-dim)">${[
            ['Base legal', d.base_legal], ['Dados', d.categorias_dados], ['Titulares', d.titulares], ['Retenção', d.retencao],
        ].filter(([, v]) => v).map(([k, v]) => `${e(k)}: ${e(v)}`).join(' · ')}</div>${origem}${motivo}`;
        const acoes = !ativo || i.decisao === 'gravado' ? '' : `
            <button class="btn btn-ghost btn-sm" data-action="importacaoEditar" data-args='${args(i.id)}'>Editar</button>
            ${i.decisao !== 'aceito' && i.decisao !== 'recusado' ? `<button class="btn btn-ghost btn-sm" data-action="importacaoDecidir" data-args='${args(i.id, 'aceito')}'>Aceitar</button>` : ''}
            ${i.decisao !== 'descartado' ? `<button class="btn btn-ghost btn-sm" data-action="importacaoDecidir" data-args='${args(i.id, 'descartado')}'>Descartar</button>` : ''}`;
        return [resumo, badge(CONF[i.confianca] || [i.confianca, 'neutral']), falta || 'Nada', `${badge(DECISAO[i.decisao] || [i.decisao, 'neutral'])}${dup}`, acoes];
    });
    return barra + window.renderDataTable(['Tratamento proposto', 'Confiança', 'Faltando', 'Situação', 'Ações'], linhas, { emptyState: 'Nenhum tratamento proposto. Envie arquivos e clique em Processar.' });
}

function htmlResultados(itens) {
    const nome = (id) => (itens.find((i) => i.id === id)?.dados?.finalidade) || id;
    const linhas = E.resultados.map((r) => [e(nome(r.item_id)), badge(r.decisao === 'gravado' ? ['Gravado', 'success'] : ['Recusado', 'danger']), e(r.motivo || '')]);
    return `<h3 style="margin:1.5rem 0 0.5rem">Resultado da importação</h3>${window.renderDataTable(['Tratamento', 'Resultado', 'Motivo'], linhas, { emptyState: 'Nenhum item gravado.' })}`;
}

// Processamento cujo Worker morreu: depois de 10 minutos sem atualização o servidor deixa a confirmação retomar o lote.
// `updated_at` vem do D1 em UTC ('AAAA-MM-DD HH:MM:SS').
function processamentoVelho(lote) {
    const t = Date.parse(String(lote.updated_at || '').replace(' ', 'T') + 'Z');
    return Number.isFinite(t) && Date.now() - t > 10 * 60000;
}

function htmlRodape(itens, lote) {
    const aceitos = itens.filter((i) => i.decisao === 'aceito').length;
    // Com outro processamento ou gravação em curso (outra aba, outra pessoa) o servidor recusaria com 409.
    const travado = lote.status === 'gravando' || (lote.status === 'processando' && !processamentoVelho(lote));
    if (E.cancelando) {
        return `<div role="alert" style="margin-top:1.5rem;padding:1rem;border:1px solid var(--danger)">
            <p style="margin:0 0 0.75rem">Cancelar o lote apaga os arquivos enviados e os tratamentos propostos. O que já foi gravado no RoPA permanece. Confirma?</p>
            <button class="btn btn-danger" data-action="importacaoCancelarSim">Sim, cancelar o lote</button>
            <button class="btn" data-action="importacaoCancelarNao">Voltar</button></div>`;
    }
    return `<div style="margin-top:1.5rem;display:flex;gap:0.75rem">
        <button class="btn btn-primary" data-action="importacaoConfirmar"${aceitos && !E.ocupado && !travado ? '' : ' disabled'}>Confirmar importação (${aceitos})</button>
        <button class="btn btn-ghost" data-action="importacaoCancelar">Cancelar lote</button></div>`;
}

function msg(t) { E.msg = t; const m = document.getElementById('importacao-msg'); if (m) m.textContent = t; }

// ─── envio e processamento ───────────────────────────────────────────────────────────────────────

window.importacaoEnviar = async function () {
    const input = document.getElementById('importacao-arquivos');
    const files = input ? [...input.files] : [];
    if (!files.length) return msg('Selecione ao menos um arquivo.');
    E.ocupado = true; E.envios = [];
    pinta(); // desabilita os botões (os arquivos já foram lidos acima)
    for (const [n, f] of files.entries()) {
        msg(`Enviando ${n + 1} de ${files.length}...`);
        const fd = new FormData();
        fd.append('file', f);
        try {
            const r = await fetch(`${API_BASE}/api/v1/projects/${pid()}/importacoes/${lid()}/arquivos`, { method: 'POST', headers: cabecalhosAuth(), body: fd });
            const corpo = await r.json().catch(() => ({}));
            E.envios.push(r.ok ? { nome: f.name, ok: true } : { nome: f.name, ok: false, erro: corpo.error || `HTTP ${r.status}` });
        } catch (err) { E.envios.push({ nome: f.name, ok: false, erro: 'falha de rede' }); }
    }
    E.ocupado = false;
    E.msg = `${E.envios.filter((v) => v.ok).length} de ${files.length} arquivo(s) enviado(s).`;
    await recarrega();
};

// A IA pode levar mais que os 30 s padrão do api() num arquivo grande.
const TEMPO_PROCESSAR = 150000;

window.importacaoProcessar = async function () {
    const fila = E.det.arquivos.filter((x) => x.status === 'pendente' || x.status === 'erro');
    E.ocupado = true; pinta();
    const falhas = [];
    let parou = '';
    let sessao = false;
    arquivos: for (const [n, x] of fila.entries()) {
        const andamento = `Processando ${n + 1} de ${fila.length}: ${x.nome}`;
        msg(andamento);
        // Um passo por chamada (conversão, depois um bloco): chama de novo enquanto o servidor disser que restam blocos.
        for (;;) {
            let r;
            try { r = await api('POST', `/api/v1/projects/${pid()}/importacoes/${lid()}/arquivos/${encodeURIComponent(x.id)}/processar`, undefined, { timeoutMs: TEMPO_PROCESSAR }); } catch (err) {
                const m = (err && err.message) || 'falha';
                if (SESSAO.test(m)) { sessao = true; parou = m; break arquivos; }
                if (/^Tempo esgotado/.test(m)) {
                    // O Worker pode ter terminado depois do corte: o servidor é quem sabe a situação do arquivo.
                    try { E.det = await api('GET', `/api/v1/projects/${pid()}/importacoes/${lid()}`); } catch (e2) { falhas.push(`${x.nome}: ${m}`); break arquivos; }
                    const atual = E.det.arquivos.find((a) => a.id === x.id);
                    if (atual && (atual.status === 'processado' || atual.status === 'aguardando')) { pinta(); msg(andamento); continue arquivos; }
                    parou = `O arquivo ${x.nome} ainda está em processamento; aguarde e clique em Processar de novo.`;
                    break arquivos;
                }
                // Falha da IA fica gravada no arquivo (status erro); 409 (gravação/cancelamento) e rede param o laço.
                falhas.push(`${x.nome}: ${m}`);
                if (/em gravação|em processamento|cancelado|cancelada|Falha de rede/.test(m)) break arquivos;
                break;
            }
            const a = (r && r.arquivo) || {};
            if (!(r && r.restantes > 0) || a.status !== 'pendente') break;
            const total = a.blocos_total || r.restantes;
            msg(`${andamento}, bloco ${total - r.restantes + 1} de ${total}`);
        }
        try { E.det = await api('GET', `/api/v1/projects/${pid()}/importacoes/${lid()}`); pinta(); msg(andamento); } catch (err) { break; }
    }
    E.ocupado = false;
    E.msg = [falhas.length ? `Falhas no processamento: ${falhas.join('; ')}` : '', parou].filter(Boolean).join(' ') || 'Processamento concluído.';
    if (sessao) return pinta();
    await recarrega();
};

// ─── revisão ─────────────────────────────────────────────────────────────────────────────────────

const atualiza = (iid, corpo) => api('PUT', `/api/v1/projects/${pid()}/importacoes/${lid()}/itens/${encodeURIComponent(iid)}`, corpo);

window.importacaoDecidir = async function (iid, decisao) {
    try { await atualiza(iid, { decisao }); E.msg = ''; } catch (err) { E.msg = (err && err.message) || 'Não foi possível atualizar o item'; }
    await recarrega();
};

window.importacaoAceitarAlta = async function () {
    const alvo = E.det.itens.filter((i) => i.confianca === 'alta' && i.decisao === 'pendente' && !i.duplicata_de);
    E.ocupado = true;
    let ok = 0;
    E.msg = '';
    for (const i of alvo) {
        try { await atualiza(i.id, { decisao: 'aceito' }); ok++; } catch (err) { E.msg = (err && err.message) || 'Falha ao aceitar'; break; }
    }
    E.ocupado = false;
    if (!E.msg) E.msg = `${ok} item(ns) aceito(s).`;
    await recarrega();
};

window.importacaoEditar = function (iid) {
    const i = E.det.itens.find((x) => x.id === iid);
    if (!i) return;
    const d = i.dados || {};
    const campo = ([k, r]) => `<div class="form-group"><label class="form-label" for="imp-${k}">${e(r)}</label><input class="form-input" id="imp-${k}" value="${e(d[k])}" maxlength="500"></div>`;
    const lista = ([k, r]) => `<div class="form-group"><label class="form-label" for="imp-${k}">${e(r)} (separe por vírgula)</label><input class="form-input" id="imp-${k}" value="${e((d[k] || []).join(', '))}"></div>`;
    const tri = (k, r) => `<div class="form-group"><label class="form-label" for="imp-${k}">${e(r)}</label><select class="form-input" id="imp-${k}">${[['', 'Não informado'], ['true', 'Sim'], ['false', 'Não']].map(([v, t]) => `<option value="${v}"${String(d[k] ?? '') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>`;
    openModal(`
        <div class="modal-header"><span class="modal-title">Editar tratamento</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        ${CAMPOS.map(campo).join('')}${tri('transferencia_internacional', 'Transferência internacional')}${tri('dpia_requerido', 'DPIA requerido')}${LISTAS.map(lista).join('')}
        <div id="imp-erro" role="alert" style="color:var(--danger);margin-bottom:0.5rem"></div>
        <button class="btn btn-primary" style="width:100%" data-action="importacaoSalvarItem" data-args='${args(iid)}'>Salvar</button>`);
};

window.importacaoSalvarItem = async function (iid) {
    const v = (k) => document.getElementById(`imp-${k}`)?.value ?? '';
    const dados = {};
    for (const [k] of CAMPOS) { const t = v(k).trim(); dados[k] = t === '' ? null : t; }
    for (const k of ['transferencia_internacional', 'dpia_requerido']) dados[k] = v(k) === '' ? null : v(k) === 'true';
    for (const [k] of LISTAS) dados[k] = v(k).split(',').map((s) => s.trim()).filter(Boolean);
    if (!dados.finalidade) { document.getElementById('imp-erro').textContent = 'A finalidade é obrigatória.'; return; }
    try { await atualiza(iid, { dados }); } catch (err) { document.getElementById('imp-erro').textContent = (err && err.message) || 'Não foi possível salvar'; return; }
    window.forceCloseModal();
    await recarrega();
};

// ─── confirmar e cancelar ────────────────────────────────────────────────────────────────────────

window.importacaoConfirmar = async function () {
    E.ocupado = true; E.resultados = []; pinta();
    // O servidor grava até 30 itens por chamada e devolve `restantes`; chama de novo até zerar (ou até uma rodada sem progresso).
    try {
        for (;;) {
            msg(`Gravando... ${E.resultados.length} item(ns) processado(s).`);
            const r = await api('POST', `/api/v1/projects/${pid()}/importacoes/${lid()}/confirmar`);
            E.resultados.push(...(r.resultados || []));
            if (!(r.restantes > 0) || !(r.resultados || []).length) break;
        }
        const n = (d) => E.resultados.filter((r) => r.decisao === d).length;
        E.msg = `Importação concluída: ${n('gravado')} gravado(s), ${n('recusado')} recusado(s).`;
    } catch (err) {
        E.msg = `${(err && err.message) || 'Falha ao confirmar'}. Você pode tentar de novo.`;
        if (SESSAO.test(E.msg)) { E.ocupado = false; return pinta(); }
    }
    E.ocupado = false;
    await recarrega();
};

window.importacaoCancelar = function () { E.cancelando = true; pinta(); };
window.importacaoCancelarNao = function () { E.cancelando = false; pinta(); };
window.importacaoCancelarSim = async function () {
    try {
        await api('DELETE', `/api/v1/projects/${pid()}/importacoes/${lid()}`);
        E.cancelando = false;
        showToast('Lote cancelado.', 'success');
        await window.importacaoVoltar();
    } catch (err) { E.cancelando = false; E.msg = (err && err.message) || 'Não foi possível cancelar'; await recarrega(); }
};

window.renderImportacao = renderImportacao;
