import { S } from '../state.js';
import { api, API_BASE, cabecalhosAuth } from '../api.js';
import { escapeHTML, openModal, showToast } from '../ui.js';

// Importar programa (n.privacy, fatias 1 a 4). A regra é do servidor (`/projects/:id/importacoes`); aqui: lotes, envio de arquivos (um
// por requisição), processamento arquivo a arquivo, revisão dos itens propostos (uma aba por entidade: tratamentos, terceiros,
// documentos, avaliações, estas com DPIA e LIA juntas, e histórico, com pedidos do titular, incidentes e consentimentos juntos) e
// confirmação em rodadas. TUDO o que vem da API
// (nome de arquivo, origem, motivo, dados) é texto que um modelo extraiu de arquivo do cliente: sai sempre por escapeHTML.

const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const args = (...v) => escapeHTML(JSON.stringify(v));
const e = (v) => escapeHTML(String(v ?? ''));
// Caminhos escritos por extenso em cada chamada: test/contrato-tela-api.test.ts só confere o que é literal /api/v1/...
const pid = () => projetoAtivo().id;
const lid = () => encodeURIComponent(E.loteId);
const SESSAO = /Unauthorized|Sessão expirada/;

// Estado da tela (um lote aberto por vez).
const E = { c: null, h: null, a: null, lotes: null, loteId: null, det: null, msg: '', envios: [], resultados: null, cancelando: false, ocupado: false, aba: 'tratamento' };

const STATUS_LOTE = { recebendo: 'Recebendo arquivos', processando: 'Processando', em_revisao: 'Em revisão', gravando: 'Gravando', concluida: 'Concluída', cancelada: 'Cancelada' };
const STATUS_ARQ = { pendente: ['Na fila', 'neutral'], processado: ['Processado', 'success'], aguardando: ['Sem extração', 'info'], erro: ['Erro', 'danger'] };
const TIPOS = { inventario: 'Inventário de tratamentos', terceiros: 'Lista de terceiros', documento: 'Documento', avaliacao: 'Avaliação (DPIA, LIA)', historico: 'Histórico operacional', desconhecido: 'Não reconhecido' };
const CONF = { alta: ['Alta', 'success'], media: ['Média', 'warning'], baixa: ['Baixa', 'danger'] };
const DECISAO = { pendente: ['Pendente', 'neutral'], aceito: ['Aceito', 'info'], descartado: ['Descartado', 'neutral'], recusado: ['Recusado', 'danger'], gravado: ['Gravado', 'success'] };
const CAMPOS = [
    ['finalidade', 'Finalidade'], ['base_legal', 'Base legal'], ['categorias_dados', 'Categorias de dados'], ['titulares', 'Titulares'],
    ['retencao', 'Retenção'], ['destinatarios', 'Destinatários'], ['salvaguardas', 'Salvaguardas'], ['responsavel', 'Responsável'],
];
const LISTAS = [['sistemas', 'Sistemas'], ['areas', 'Áreas'], ['pessoas', 'Pessoas']];
const ROTULO = Object.fromEntries([...CAMPOS, ...LISTAS, ['nome', 'Nome'], ['tipo', 'Tipo'], ['ultima_avaliacao', 'Avaliação'], ['titulo', 'Título'], ['tratamento', 'Tratamento'], ['conclusao', 'Conclusão'], ['riscos', 'Riscos'],
    ['protocolo', 'Protocolo de origem'], ['risco_titular', 'Risco ao titular'], ['versao_aviso', 'Versão do aviso']]);
// Terceiros (fatia 2): os mesmos rótulos da tela de terceiros.
const TIPO_TERCEIRO = { grande_provedor: 'Grande provedor', medio: 'Médio', pequeno: 'Pequeno', critico: 'Crítico' };
const RESULTADO = { aprovado: 'Aprovado', com_ressalvas: 'Aprovado com ressalvas', reprovado: 'Reprovado' };
// [campo, rótulo, maxlength]: os tetos de terceiroPropostoSchema (src/schemas/importacao.ts).
const CAMPOS_TERCEIRO = [['nome', 'Nome', 200], ['cnpj', 'CNPJ', 30], ['contato', 'Contato', 200], ['dpa', 'DPA (nome do documento)', 300]];
// Documentos e avaliações (fatia 3): os tipos da tabela de documentos; DPIA e LIA dividem a aba.
const TIPO_DOCUMENTO = { politica: 'Política', norma: 'Norma', procedimento: 'Procedimento' };
const AVALIACAO = { dpia: 'DPIA', lia: 'LIA' };
// Histórico (fatia 4): os mesmos rótulos da tela do titular (views/titular.js); as três entidades dividem a aba.
const HISTORICO = { titular_pedido: 'Pedido', incidente: 'Incidente', consentimento: 'Consentimento' };
const TIPOS_PEDIDO = { confirmacao: 'Confirmação de tratamento', acesso: 'Acesso aos dados', correcao: 'Correção', anonimizacao_bloqueio_eliminacao: 'Anonimização, bloqueio ou eliminação', portabilidade: 'Portabilidade',
    informacao_compartilhamento: 'Informação sobre compartilhamento', revogacao_consentimento: 'Revogação do consentimento', oposicao: 'Oposição', outro: 'Outro' };
const CANAIS = { email: 'E-mail', telefone: 'Telefone', formulario: 'Formulário', presencial: 'Presencial', outro: 'Outro' };
const STATUS_PEDIDO = { recebido: 'Recebido', em_andamento: 'Em andamento', respondido: 'Respondido', negado: 'Negado', arquivado: 'Arquivado' };
const RISCOS = { sem_risco: 'Sem risco', baixo: 'Baixo', relevante: 'Relevante' };
const STATUS_INCIDENTE = { aberto: 'Aberto', avaliado: 'Avaliado', comunicado: 'Comunicado', encerrado: 'Encerrado' };
// Item sem `entidade` é da fatia 1.
const entidade = (i) => i.entidade || 'tratamento';
const abaDe = (i) => (AVALIACAO[entidade(i)] ? 'avaliacao' : HISTORICO[entidade(i)] ? 'historico' : entidade(i));
const ABAS = [['tratamento', 'Tratamentos'], ['terceiro', 'Terceiros'], ['documento', 'Documentos'], ['avaliacao', 'Avaliações'], ['historico', 'Histórico']];
const nomeItem = (i) => (i.dados && (i.dados.finalidade || i.dados.nome || i.dados.titulo || i.dados.tratamento || i.dados.protocolo)) || '';

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
        c.innerHTML = window.renderSemProjeto();
        return;
    }
    if (E.loteId) return recarrega();
    E.det = null;
    try { E.lotes = (await api('GET', `/api/v1/projects/${pid()}/importacoes`)).lotes || []; } catch (err) {
        c.innerHTML = window.renderEmptyState({ titulo: 'Não foi possível listar os lotes', texto: err.message });
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
        <p style="margin:0 0 1rem;color:var(--text-dim)">Envie o inventário de tratamentos, a lista de terceiros, as políticas e normas, as DPIAs e LIAs e o histórico de pedidos de titulares, incidentes e consentimentos que o cliente já tem (planilha, documento ou PDF). A IA propõe os itens; você revisa e confirma antes de gravar.</p>
        <button class="btn btn-primary" data-action="importacaoNovo" style="margin-bottom:1rem">Novo lote</button>
        ${window.renderDataTable(['Criado em', 'Situação', 'Arquivos', 'Itens propostos', 'Ações'], linhas, { emptyState: 'Nenhum lote de importação neste projeto.' })}`;
}

function abreLote(id) { Object.assign(E, { loteId: id, envios: [], resultados: null, msg: '', cancelando: false, aba: 'tratamento' }); return recarrega(); }

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
        ${htmlAbas(itens)}
        ${(TABELA[E.aba] || htmlItens)(itens.filter((i) => abaDe(i) === E.aba), ativo)}
        ${E.resultados && E.resultados.length ? htmlResultados(itens) : ''}
        ${ativo ? htmlRodape(itens, lote) : ''}`;
}

function htmlAbas(itens) {
    return window.renderAbas(ABAS.map(([k, r]) => [k, `${e(r)} (${itens.filter((i) => abaDe(i) === k).length})`]), E.aba, 'importacaoAba');
}
window.importacaoAba = (k) => { E.aba = k; pinta(); };

const altaPendentes = (itens) => itens.filter((i) => i.confianca === 'alta' && i.decisao === 'pendente' && !i.duplicata_de);
function barraAlta(itens) {
    const alta = altaPendentes(itens).length;
    return alta ? `<button class="btn btn-ghost btn-sm" style="margin-bottom:0.75rem" data-action="importacaoAceitarAlta"${E.ocupado ? ' disabled' : ''}>Aceitar todos de confiança alta (${alta})</button>` : '';
}
// Origem, motivo e ações de um item, iguais nas duas abas.
const rodapeItem = (i) => `${i.origem ? `<details><summary>Origem</summary><div style="white-space:pre-wrap;color:var(--text-dim)">${e(i.origem)}</div></details>` : ''}${i.motivo ? `<div style="color:var(--danger)">${e(i.motivo)}</div>` : ''}`;
const acoesItem = (i, ativo) => (!ativo || i.decisao === 'gravado' ? '' : `
            <button class="btn btn-ghost btn-sm" data-action="importacaoEditar" data-args='${args(i.id)}'>Editar</button>
            ${i.decisao !== 'aceito' && i.decisao !== 'recusado' ? `<button class="btn btn-ghost btn-sm" data-action="importacaoDecidir" data-args='${args(i.id, 'aceito')}'>Aceitar</button>` : ''}
            ${i.decisao !== 'descartado' ? `<button class="btn btn-ghost btn-sm" data-action="importacaoDecidir" data-args='${args(i.id, 'descartado')}'>Descartar</button>` : ''}`);
const situacaoItem = (i, destino, rotulo) => `${badge(DECISAO[i.decisao] || [i.decisao, 'neutral'])}${i.duplicata_de ? `<div>${badge(['Já existe', 'warning'])} <button class="btn btn-ghost btn-sm" data-action="navigate" data-args='${args(destino)}'>${rotulo}</button></div>` : ''}`;
const faltaItem = (i) => (i.faltando || []).map((k) => e(ROTULO[k] || k)).join(', ') || 'Nada';

function htmlTerceiros(itens, ativo) {
    const linhas = itens.map((i) => {
        const d = i.dados || {};
        const av = d.ultima_avaliacao;
        const resumo = `<strong>${e(d.nome || '(sem nome)')}</strong><div style="color:var(--text-dim)">${[
            ['Tipo', d.tipo && (TIPO_TERCEIRO[d.tipo] || d.tipo)], ['CNPJ', d.cnpj], ['Contato', d.contato],
            ['Avaliação', av && `${RESULTADO[av.resultado] || av.resultado} até ${av.valido_ate}${av.metodo ? ` (${av.metodo})` : ''}`],
            ['DPA', d.dpa], ['Tratamentos', (d.tratamentos || []).join(', ')],
        ].filter(([, v]) => v).map(([k, v]) => `${e(k)}: ${e(v)}`).join(' · ')}</div>${rodapeItem(i)}`;
        return [resumo, badge(CONF[i.confianca] || [i.confianca, 'neutral']), faltaItem(i), situacaoItem(i, 'terceiros', 'Ver terceiros'), acoesItem(i, ativo)];
    });
    return barraAlta(itens) + window.renderDataTable(['Terceiro proposto', 'Confiança', 'Faltando', 'Situação', 'Ações'], linhas, { emptyState: 'Nenhum terceiro proposto. Envie a lista de terceiros e clique em Processar.' });
}

function htmlDocumentos(itens, ativo) {
    const linhas = itens.map((i) => {
        const d = i.dados || {};
        const resumo = `<strong>${e(d.titulo || '(sem título)')}</strong><div style="color:var(--text-dim)">${d.tipo ? `Tipo: ${e(TIPO_DOCUMENTO[d.tipo] || d.tipo)}` : ''}</div>${d.resumo ? `<div style="color:var(--text-dim)">${e(d.resumo)}</div>` : ''}${rodapeItem(i)}`;
        return [resumo, badge(CONF[i.confianca] || [i.confianca, 'neutral']), faltaItem(i), situacaoItem(i, 'documentos', 'Ver documentos'), acoesItem(i, ativo)];
    });
    return `<p style="margin:0 0 0.5rem;color:var(--text-dim)">Cada documento é gravado como rascunho, com o texto do arquivo; publicar fica para a tela do documento. O arquivo original fica como evidência ligada.</p>`
        + barraAlta(itens) + window.renderDataTable(['Documento proposto', 'Confiança', 'Faltando', 'Situação', 'Ações'], linhas, { emptyState: 'Nenhum documento proposto. Envie políticas, avisos ou normas e clique em Processar.' });
}

function htmlAvaliacoes(itens, ativo) {
    const linhas = itens.map((i) => {
        const d = i.dados || {};
        const resumo = `${badge([AVALIACAO[entidade(i)] || entidade(i), 'info'])} <strong>${e(d.tratamento || '(sem tratamento)')}</strong><div style="color:var(--text-dim)">${[
            ['Conclusão', d.conclusao], ['Riscos', (d.riscos || []).join('; ')],
        ].filter(([, v]) => v).map(([k, v]) => `${e(k)}: ${e(v)}`).join(' · ')}</div>${rodapeItem(i)}`;
        const [destino, rotulo] = entidade(i) === 'lia' ? ['ropa', 'Ver no RoPA'] : ['dpia', 'Ver DPIAs'];
        return [resumo, badge(CONF[i.confianca] || [i.confianca, 'neutral']), faltaItem(i), situacaoItem(i, destino, rotulo), acoesItem(i, ativo)];
    });
    return `<p style="margin:0 0 0.5rem;color:var(--text-dim)">A avaliação é ligada ao tratamento do RoPA com a mesma finalidade; sem ele, é recusada. DPIA e LIA nascem em rascunho.</p>`
        + barraAlta(itens) + window.renderDataTable(['Avaliação proposta', 'Confiança', 'Faltando', 'Situação', 'Ações'], linhas, { emptyState: 'Nenhuma avaliação proposta. Envie DPIAs ou LIAs e clique em Processar.' });
}

function htmlItens(itens, ativo) {
    const barra = barraAlta(itens);
    const linhas = itens.map((i) => {
        const d = i.dados || {};
        const resumo = `<strong>${e(d.finalidade || '(sem finalidade)')}</strong><div style="color:var(--text-dim)">${[
            ['Base legal', d.base_legal], ['Dados', d.categorias_dados], ['Titulares', d.titulares], ['Retenção', d.retencao],
        ].filter(([, v]) => v).map(([k, v]) => `${e(k)}: ${e(v)}`).join(' · ')}</div>${rodapeItem(i)}`;
        return [resumo, badge(CONF[i.confianca] || [i.confianca, 'neutral']), faltaItem(i), situacaoItem(i, 'ropa', 'Ver no RoPA'), acoesItem(i, ativo)];
    });
    return barra + window.renderDataTable(['Tratamento proposto', 'Confiança', 'Faltando', 'Situação', 'Ações'], linhas, { emptyState: 'Nenhum tratamento proposto. Envie arquivos e clique em Processar.' });
}

const rotulo = (mapa, v) => (v ? mapa[v] || v : '');
const linhaDados = (pares) => pares.filter(([, v]) => v).map(([k, v]) => `${e(k)}: ${e(v)}`).join(' · ');
function resumoHistorico(i) {
    const d = i.dados || {};
    const ent = entidade(i);
    let titulo;
    let pares;
    if (ent === 'titular_pedido') {
        titulo = rotulo(TIPOS_PEDIDO, d.tipo) || '(sem tipo)';
        pares = [['Protocolo de origem', d.protocolo], ['Recebido em', d.recebido_em], ['Situação', rotulo(STATUS_PEDIDO, d.status)], ['Respondido em', d.respondido_em], ['Canal', rotulo(CANAIS, d.canal)], ['Titular', d.titular_ref]];
    } else if (ent === 'incidente') {
        titulo = d.titulo || '(sem título)';
        pares = [['Protocolo de origem', d.protocolo], ['Ciência em', d.ciencia_em], ['Risco ao titular', rotulo(RISCOS, d.risco_titular)], ['Comunicação à ANPD', d.comunicacao_anpd_em], ['Comunicação ao titular', d.comunicacao_titular_em], ['Situação', rotulo(STATUS_INCIDENTE, d.status)]];
    } else {
        titulo = d.tratamento || '(sem tratamento)';
        pares = [['Finalidade', d.finalidade], ['Titular', d.titular_ref], ['Obtido em', d.obtido_em], ['Revogado em', d.revogado_em], ['Versão do aviso', d.versao_aviso], ['Canal', d.canal]];
    }
    return `${badge([HISTORICO[ent] || ent, 'info'])} <strong>${e(titulo)}</strong><div style="color:var(--text-dim)">${linhaDados(pares)}</div>${rodapeItem(i)}`;
}

function htmlHistorico(itens, ativo) {
    const linhas = itens.map((i) => [resumoHistorico(i), badge(CONF[i.confianca] || [i.confianca, 'neutral']), faltaItem(i), situacaoItem(i, 'titular', 'Ver no titular e incidentes'), acoesItem(i, ativo)]);
    return `<p style="margin:0 0 0.5rem;color:var(--text-dim)">E-mail, CPF e telefone do arquivo não vão à IA: viram um pseudônimo (tit-...). Datas e situação ficam as do registro de origem e o protocolo de origem vai na descrição. Registro encerrado entra sem prazo; o aberto com prazo legal já vencido aparece atrasado, e o aviso de atraso só começa na semana seguinte. O consentimento é ligado ao tratamento do RoPA com a mesma finalidade.</p>`
        + barraAlta(itens) + window.renderDataTable(['Registro proposto', 'Confiança', 'Faltando', 'Situação', 'Ações'], linhas, { emptyState: 'Nenhum registro proposto. Envie o histórico de pedidos, incidentes ou consentimentos e clique em Processar.' });
}

const TABELA = { terceiro: htmlTerceiros, documento: htmlDocumentos, avaliacao: htmlAvaliacoes, historico: htmlHistorico };

function htmlResultados(itens) {
    const nome = (id) => nomeItem(itens.find((i) => i.id === id) || {}) || id;
    const linhas = E.resultados.map((r) => [e(nome(r.item_id)), badge(r.decisao === 'gravado' ? ['Gravado', 'success'] : ['Recusado', 'danger']), e(r.motivo || r.aviso || '')]);
    return `<h3 style="margin:1.5rem 0 0.5rem">Resultado da importação</h3>${window.renderDataTable(['Item', 'Resultado', 'Motivo ou aviso'], linhas, { emptyState: 'Nenhum item gravado.' })}`;
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
            <p style="margin:0 0 0.75rem">Cancelar o lote apaga os arquivos enviados e os itens propostos. O que já foi gravado permanece. Confirma?</p>
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
    const alvo = altaPendentes(E.det.itens.filter((i) => abaDe(i) === E.aba));
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
    if (entidade(i) === 'terceiro') return editarTerceiro(i);
    if (entidade(i) === 'documento') return editarDocumento(i);
    if (AVALIACAO[entidade(i)]) return editarAvaliacao(i);
    if (HISTORICO[entidade(i)]) return editarHistorico(i);
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

const opcoes = (k, r, mapa, atual) => `<div class="form-group"><label class="form-label" for="imp-${k}">${e(r)}</label><select class="form-input" id="imp-${k}">${[['', 'Não informado'], ...Object.entries(mapa)].map(([v, t]) => `<option value="${e(v)}"${String(atual ?? '') === v ? ' selected' : ''}>${e(t)}</option>`).join('')}</select></div>`;

function editarTerceiro(i) {
    const d = i.dados || {};
    const av = d.ultima_avaliacao || {};
    const campo = ([k, r, max]) => `<div class="form-group"><label class="form-label" for="imp-${k}">${e(r)}</label><input class="form-input" id="imp-${k}" value="${e(d[k])}" maxlength="${max}"></div>`;
    openModal(`
        <div class="modal-header"><span class="modal-title">Editar terceiro</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        ${CAMPOS_TERCEIRO.map(campo).join('')}${opcoes('tipo', 'Tipo', TIPO_TERCEIRO, d.tipo)}
        <div class="form-group"><label class="form-label" for="imp-tratamentos">Tratamentos (finalidades, separe por vírgula)</label><input class="form-input" id="imp-tratamentos" value="${e((d.tratamentos || []).join(', '))}"></div>
        ${opcoes('aval_resultado', 'Resultado da última avaliação', RESULTADO, av.resultado)}
        <div class="form-group"><label class="form-label" for="imp-aval_valido_ate">Avaliação válida até</label><input type="date" class="form-input" id="imp-aval_valido_ate" value="${e(av.valido_ate)}"></div>
        <div class="form-group"><label class="form-label" for="imp-aval_metodo">Método da avaliação (como está no arquivo)</label><input class="form-input" id="imp-aval_metodo" value="${e(av.metodo)}" maxlength="100"></div>
        <div id="imp-erro" role="alert" style="color:var(--danger);margin-bottom:0.5rem"></div>
        <button class="btn btn-primary" style="width:100%" data-action="importacaoSalvarItem" data-args='${args(i.id)}'>Salvar</button>`);
}

// [campo, rótulo, maxlength]: os tetos de documentoPropostoSchema e avaliacaoPropostaSchema (src/schemas/importacao.ts).
function editarDocumento(i) {
    const d = i.dados || {};
    openModal(`
        <div class="modal-header"><span class="modal-title">Editar documento</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        <div class="form-group"><label class="form-label" for="imp-titulo">Título</label><input class="form-input" id="imp-titulo" value="${e(d.titulo)}" maxlength="300"></div>
        ${opcoes('tipo', 'Tipo', TIPO_DOCUMENTO, d.tipo)}
        <div class="form-group"><label class="form-label" for="imp-resumo">Resumo</label><textarea class="form-input" id="imp-resumo" maxlength="2000" rows="3">${e(d.resumo)}</textarea></div>
        <div id="imp-erro" role="alert" style="color:var(--danger);margin-bottom:0.5rem"></div>
        <button class="btn btn-primary" style="width:100%" data-action="importacaoSalvarItem" data-args='${args(i.id)}'>Salvar</button>`);
}

function editarAvaliacao(i) {
    const d = i.dados || {};
    openModal(`
        <div class="modal-header"><span class="modal-title">Editar ${e(AVALIACAO[entidade(i)])}</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        <div class="form-group"><label class="form-label" for="imp-tratamento">Tratamento (finalidade, como está no RoPA)</label><input class="form-input" id="imp-tratamento" value="${e(d.tratamento)}" maxlength="500"></div>
        <div class="form-group"><label class="form-label" for="imp-conclusao">Conclusão</label><textarea class="form-input" id="imp-conclusao" maxlength="2000" rows="3">${e(d.conclusao)}</textarea></div>
        <div class="form-group"><label class="form-label" for="imp-riscos">Riscos (um por linha)</label><textarea class="form-input" id="imp-riscos" rows="4">${e((d.riscos || []).join('\n'))}</textarea></div>
        <div id="imp-erro" role="alert" style="color:var(--danger);margin-bottom:0.5rem"></div>
        <button class="btn btn-primary" style="width:100%" data-action="importacaoSalvarItem" data-args='${args(i.id)}'>Salvar</button>`);
}

// [campo, rótulo, maxlength] de texto e [campo, rótulo] de data: os de pedidoPropostoSchema, incidentePropostoSchema e
// consentimentoPropostoSchema (src/schemas/importacao.ts). O pseudônimo do titular não se edita: volta como veio.
const FORM_HISTORICO = {
    titular_pedido: { selects: [['tipo', 'Tipo', TIPOS_PEDIDO], ['canal', 'Canal', CANAIS], ['status', 'Situação', STATUS_PEDIDO]], datas: [['recebido_em', 'Recebido em'], ['respondido_em', 'Respondido em']], textos: [['protocolo', 'Protocolo de origem', 60]] },
    incidente: { selects: [['risco_titular', 'Risco ao titular', RISCOS], ['status', 'Situação', STATUS_INCIDENTE]], datas: [], textos: [['titulo', 'Título', 300], ['protocolo', 'Protocolo de origem', 60], ['ciencia_em', 'Ciência em (AAAA-MM-DD ou data e hora)', 30], ['comunicacao_anpd_em', 'Comunicação à ANPD em', 30], ['comunicacao_titular_em', 'Comunicação ao titular em', 30]] },
    consentimento: { selects: [], datas: [['obtido_em', 'Obtido em'], ['revogado_em', 'Revogado em']], textos: [['tratamento', 'Tratamento (finalidade, como está no RoPA)', 500], ['finalidade', 'Finalidade consentida', 500], ['versao_aviso', 'Versão do aviso', 100], ['canal', 'Canal', 100]] },
};
const OBRIG_HISTORICO = { titular_pedido: ['tipo', 'recebido_em', 'status'], incidente: ['titulo', 'ciencia_em', 'status'], consentimento: ['tratamento', 'finalidade', 'obtido_em'] };
// Ordem das chaves igual à do esquema (o PUT compara o corpo inteiro nos testes).
const CHAVES_HISTORICO = {
    titular_pedido: ['tipo', 'canal', 'recebido_em', 'status', 'respondido_em', 'protocolo', 'titular_ref'],
    incidente: ['titulo', 'protocolo', 'ciencia_em', 'risco_titular', 'comunicacao_anpd_em', 'comunicacao_titular_em', 'status'],
    consentimento: ['tratamento', 'titular_ref', 'finalidade', 'obtido_em', 'revogado_em', 'versao_aviso', 'canal'],
};

function editarHistorico(i) {
    const d = i.dados || {};
    const f = FORM_HISTORICO[entidade(i)];
    const texto = ([k, r, max]) => `<div class="form-group"><label class="form-label" for="imp-${k}">${e(r)}</label><input class="form-input" id="imp-${k}" value="${e(d[k])}" maxlength="${max}"></div>`;
    const data = ([k, r]) => `<div class="form-group"><label class="form-label" for="imp-${k}">${e(r)}</label><input type="date" class="form-input" id="imp-${k}" value="${e(d[k])}"></div>`;
    openModal(`
        <div class="modal-header"><span class="modal-title">Editar ${e((HISTORICO[entidade(i)] || '').toLowerCase())}</span><button class="btn-ghost" data-action="forceCloseModal">&times;</button></div>
        ${f.textos.map(texto).join('')}${f.selects.map(([k, r, mapa]) => opcoes(k, r, mapa, d[k])).join('')}${f.datas.map(data).join('')}
        ${d.titular_ref ? `<p style="color:var(--text-dim)">Titular (pseudônimo): ${e(d.titular_ref)}</p>` : ''}
        <div id="imp-erro" role="alert" style="color:var(--danger);margin-bottom:0.5rem"></div>
        <button class="btn btn-primary" style="width:100%" data-action="importacaoSalvarItem" data-args='${args(i.id)}'>Salvar</button>`);
}

function dadosHistorico(i, v) {
    const ent = entidade(i);
    const dados = {};
    for (const k of CHAVES_HISTORICO[ent]) dados[k] = k === 'titular_ref' ? (i.dados || {}).titular_ref ?? null : v(k).trim() || null;
    if (ent === 'consentimento' && !dados.titular_ref) delete dados.titular_ref;
    const falta = OBRIG_HISTORICO[ent].find((k) => !dados[k]);
    return falta ? { erro: `${ROTULO[falta] || falta} é obrigatório.` } : { dados };
}

// Dados do formulário de documento e de avaliação, ou o motivo de não salvar.
function dadosDocOuAvaliacao(i, v) {
    const t = (k) => v(k).trim() || null;
    if (entidade(i) === 'documento') {
        const dados = { titulo: v('titulo').trim(), tipo: t('tipo'), resumo: t('resumo') };
        return dados.titulo ? { dados } : { erro: 'O título é obrigatório.' };
    }
    const dados = { tratamento: v('tratamento').trim(), conclusao: t('conclusao'), riscos: v('riscos').split('\n').map((x) => x.trim()).filter(Boolean) };
    return dados.tratamento ? { dados } : { erro: 'O tratamento é obrigatório.' };
}

// Avaliação só com resultado E validade; sem um dos dois, vai nula (o servidor exige os dois).
function dadosTerceiro(v) {
    const t = (k) => v(k).trim() || null;
    const resultado = t('aval_resultado');
    const validoAte = t('aval_valido_ate');
    return {
        nome: v('nome').trim(), tipo: t('tipo'), cnpj: t('cnpj'), contato: t('contato'), dpa: t('dpa'),
        tratamentos: v('tratamentos').split(',').map((s) => s.trim()).filter(Boolean),
        ultima_avaliacao: resultado && validoAte ? { resultado, valido_ate: validoAte, metodo: t('aval_metodo') } : null,
    };
}

window.importacaoSalvarItem = async function (iid) {
    const v = (k) => document.getElementById(`imp-${k}`)?.value ?? '';
    const item = E.det.itens.find((x) => x.id === iid);
    if (item && (entidade(item) === 'documento' || AVALIACAO[entidade(item)] || HISTORICO[entidade(item)])) {
        const r = HISTORICO[entidade(item)] ? dadosHistorico(item, v) : dadosDocOuAvaliacao(item, v);
        if (r.erro) { document.getElementById('imp-erro').textContent = r.erro; return; }
        try { await atualiza(iid, { dados: r.dados }); } catch (err) { document.getElementById('imp-erro').textContent = (err && err.message) || 'Não foi possível salvar'; return; }
        window.forceCloseModal();
        return recarrega();
    }
    if (item && entidade(item) === 'terceiro') {
        const dados = dadosTerceiro(v);
        if (!dados.nome) { document.getElementById('imp-erro').textContent = 'O nome é obrigatório.'; return; }
        try { await atualiza(iid, { dados }); } catch (err) { document.getElementById('imp-erro').textContent = (err && err.message) || 'Não foi possível salvar'; return; }
        window.forceCloseModal();
        return recarrega();
    }
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
