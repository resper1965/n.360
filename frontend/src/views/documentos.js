import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML, formatarData, tituloDaTela } from '../ui.js';
import { temProduto, projetoDoId, produtoAtual } from '../produto.js';
import { hojeSP } from '../hoje.js';
import { montarLista, colunasDe } from '../lista.js';

// Documentos do projeto (fatia 3.4 do núcleo): árvore política → norma → procedimento, dono, revisão, versões,
// rascunho (inclusive o do agente), ciências e aprovação por versão. Toda regra é do servidor; aqui só se mostra
// e se chama. Texto, título e nomes vindos do servidor são sempre escapados.

const TIPOS = { politica: 'Política', norma: 'Norma', procedimento: 'Procedimento' };
const STATUS = { rascunho: ['Rascunho', 'info'], vigente: ['Vigente', 'success'], obsoleto: ['Obsoleto', 'info'] };
const ESTADO_VERSAO = { rascunho: 'Rascunho', vigente: 'Vigente', substituida: 'Substituída' };
const CANAIS = { conta: 'conta', link: 'link', portal: 'portal' };
const SITUACAO_EXCECAO = { aprovada: 'Aprovada', aguardando: 'Aguardando aprovação', sem_pedido: 'Sem pedido de aprovação', vencida: 'Vencida', revogada: 'Revogada' };
const PAPEL_APROVADOR = { ciso: 'Líder SGSI', ceo: 'Direção' };

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin', 'org_admin'].includes(S.user.role);
const podePedir = () => typeof window.podePedirAprovacao === 'function' && window.podePedirAprovacao(S.user);
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const dataBr = (s) => formatarData(s);
const hoje = () => hojeSP();
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

/** Selo de aprovação por versão (derivada dos pedidos): quem aprovou a versão vigente, ou nada. */
function aprovacaoTexto(ap) {
    if (!ap || (!ap.ciso && !ap.ceo)) return '—';
    if (ap.ciso && ap.ceo) return 'Aprovado: Líder SGSI e Direção';
    return ap.ciso ? 'Aprovado: Só Líder SGSI' : 'Aprovado: Só Direção';
}

/** Raízes primeiro, filhos logo abaixo do pai, com o nível de recuo. Órfão (pai fora da lista) vira raiz. */
function arvore(docs) {
    const ids = new Set(docs.map((d) => d.id));
    const filhos = new Map();
    for (const d of docs) {
        const chave = d.pai_id && ids.has(d.pai_id) ? d.pai_id : null;
        filhos.set(chave, [...(filhos.get(chave) ?? []), d]);
    }
    const saida = [];
    const descer = (pai, nivel) => {
        for (const d of filhos.get(pai) ?? []) {
            saida.push({ doc: d, nivel });
            descer(d.id, nivel + 1);
        }
    };
    descer(null, 0);
    return saida;
}

// O que um programa de adequação à LGPD costuma ter (n.privacy). Orientação, não lista de obrigação: o casamento é pelo
// título sem acento nem caixa, então um documento com outro nome não conta e o aviso continua — por isso só "costuma".
const DOCS_LGPD = [
    { tipo: 'politica', titulo: 'Política de privacidade', ref: 'aviso aos titulares — LGPD art. 9' },
    { tipo: 'procedimento', titulo: 'Procedimento de atendimento ao titular', ref: 'art. 18' },
    { tipo: 'procedimento', titulo: 'Plano de resposta a incidente', ref: 'arts. 48 e 50, §2º, I, g; Res. CD/ANPD 15/2024' },
    { tipo: 'politica', titulo: 'Política de retenção e descarte', ref: 'arts. 15 e 16' },
];
const normal = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const faltandoLgpd = (docs) => DOCS_LGPD.filter((m) => !docs.some((d) => normal(d.titulo).includes(normal(m.titulo))));

const nomeDaParte = (id) => ((S.partes || []).find((p) => p.id === id) || {}).nome || '';

async function renderDocumentos(c, h, a) {
    h.textContent = tituloDaTela('nav-documentos', 'Políticas e normas');
    const proj = projetoAtivo();
    if (!proj) {
        a.innerHTML = '';
        c.innerHTML = window.renderSemProjeto();
        return;
    }
    a.innerHTML = podeEditar()
        ? `<button class="btn" data-action="importarDocumentos" data-args='${args(proj.id)}'>Importar políticas</button>
           <button class="btn btn-primary" data-action="openNovoDocumentoModal" data-args='${args(proj.id)}'>+ Novo documento</button>`
        : '';

    let docs = [];
    try { docs = lista(await api('GET', `/api/v1/projects/${proj.id}/documentos`)); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os documentos.', e); return; }
    try { S.partes = lista(await api('GET', `/api/v1/projects/${proj.id}/partes`)); } catch (e) { S.partes = []; /* secundário: só o nome do responsável */ }
    S.documentos = docs;

    // A lista segue a ordem da árvore, com o recuo na coluna do título; com busca ou filtro ela fica plana, sem recuo (a filha
    // sem a mãe não fica recuada sob outro documento).
    const celulas = ({ doc: d, nivel: n }, ctx) => {
        const nivel = ctx?.filtrando ? 0 : n;
        const [rotuloStatus, tomStatus] = STATUS[d.status] || [d.status, 'info'];
        const vencida = d.status === 'vigente' && d.revisar_ate && String(d.revisar_ate).slice(0, 10) < hoje();
        return [
            `<span data-nivel="${nivel}" style="display:inline-block;padding-left:${nivel * 20}px"><strong>${escapeHTML(d.titulo)}</strong></span>`,
            escapeHTML(TIPOS[d.tipo] || d.tipo),
            window.renderStatusBadge(rotuloStatus, tomStatus) + (d.tem_rascunho ? ' <span class="ctx-tag">Rascunho pendente</span>' : ''),
            d.versao_vigente ? `v${escapeHTML(String(d.versao_vigente))}` : '—',
            d.revisar_ate ? `${dataBr(d.revisar_ate)}${vencida ? ' ' + window.renderStatusBadge('Revisão vencida', 'danger') : ''}` : '—',
            escapeHTML(nomeDaParte(d.dono_parte_id) || '—'),
            escapeHTML(aprovacaoTexto(d.aprovacao)),
            `<button class="btn btn-ghost btn-sm" data-action="openDocumentoModal" data-args='${args(proj.id, d.id)}'>Abrir</button>`,
        ];
    };
    const privacy = produtoAtual() === 'privacy';
    const faltam = privacy ? faltandoLgpd(docs) : [];
    const criar = (m) => (podeEditar() ? `<button class="btn btn-ghost btn-sm" data-action="openNovoDocumentoModal" data-args='${args(proj.id, m.tipo, m.titulo)}'>Criar</button>` : '');
    const vazio = privacy
        ? { titulo: 'Nenhum documento neste projeto',
            dica: 'Um programa de adequação à LGPD costuma ter os documentos abaixo. Comece por um deles, ou use "Importar políticas" para trazer os que já existem.',
            itens: faltam.map((m) => ({ texto: `${m.titulo} (${m.ref})`, acao: criar(m) })) }
        : { titulo: 'Nenhum documento neste projeto. Use "Importar políticas" para trazer as que já existem, ou crie um novo.' };
    const aviso = docs.length && faltam.length
        ? `<p id="docs-lgpd-faltando" class="mt-0 mb-4 t-sm t-dim">Costuma existir num programa LGPD e não encontramos pelo título: ${escapeHTML(faltam.map((m) => m.titulo).join('; '))}.</p>`
        : '';
    c.innerHTML = aviso + '<div id="documentos-lista"></div>';
    montarLista(c.querySelector('#documentos-lista'), {
        id: 'documentos',
        linhas: arvore(docs),
        colunas: colunasDe(['Documento', 'Tipo', 'Situação', 'Versão', 'Revisão', 'Dono', 'Aprovação', 'Ações'], celulas),
        busca: ({ doc: d }) => `${d.titulo} ${nomeDaParte(d.dono_parte_id)}`,
        filtros: [
            { chave: 'tipo', rotulo: 'Tipo', valor: ({ doc: d }) => d.tipo, opcoes: Object.entries(TIPOS).filter(([v]) => docs.some((d) => d.tipo === v)).sort((x, y) => x[1].localeCompare(y[1], 'pt-BR')) },
            { chave: 'situacao', rotulo: 'Situação', valor: ({ doc: d }) => d.status, opcoes: Object.entries(STATUS).filter(([v]) => docs.some((d) => d.status === v)).map(([v, [r]]) => [v, r]) },
        ],
        vazio,
    });
}

const opcoesPartes = (selecionada) => '<option value="">— sem dono —</option>' + (S.partes || [])
    .filter((p) => p.status !== 'inativa' || p.id === selecionada)
    .map((p) => `<option value="${escapeHTML(p.id)}" ${p.id === selecionada ? 'selected' : ''}>${escapeHTML(p.nome)}</option>`).join('');
/** Pais possíveis: política ou norma, exceto o próprio documento. O servidor confere o tipo de cada combinação. */
const opcoesPais = (selecionado, exceto) => '<option value="">— sem pai —</option>' + (S.documentos || [])
    .filter((d) => d.id !== exceto && (d.tipo === 'politica' || d.tipo === 'norma'))
    .map((d) => `<option value="${escapeHTML(d.id)}" ${d.id === selecionado ? 'selected' : ''}>${escapeHTML(d.titulo)} (${escapeHTML((TIPOS[d.tipo] || d.tipo).toLowerCase())})</option>`).join('');
const opcoesTipo = (atual) => Object.entries(TIPOS).map(([v, r]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${r}</option>`).join('');
const meses = (id) => { const n = parseInt(el(id).value, 10); return Number.isInteger(n) ? n : null; };
const valorOuNulo = (id) => el(id).value || null;

window.importarDocumentos = async function (projectId) {
    try {
        const r = await api('POST', `/api/v1/projects/${projectId}/documentos/importar`);
        const ign = (r.ignorados_nao_aplicavel || 0) + (r.ignorados_sem_texto || 0);
        showToast(`Importação: ${r.criados} criados, ${r.ja_existiam} já existiam, ${r.versoes} versões${ign ? `, ${ign} ignorados` : ''}.`, 'success');
        window.render();
    } catch (e) { falha(e, 'Não foi possível importar'); }
};

window.openNovoDocumentoModal = function (projectId, tipo = 'politica', titulo = '') {
    openModal(`
        <div class="modal-header"><span class="modal-title">Novo documento</span></div>
        <div class="form-group"><label class="form-label">Tipo</label><select class="form-input" id="doc-novo-tipo">${opcoesTipo(TIPOS[tipo] ? tipo : 'politica')}</select></div>
        <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="doc-novo-titulo" maxlength="300" value="${escapeHTML(titulo)}"></div>
        <div class="form-group"><label class="form-label">Texto (versão 1, em rascunho)</label><textarea class="form-input" id="doc-novo-texto" rows="8"></textarea></div>
        <div class="form-group"><label class="form-label">Documento pai (norma sob política; procedimento sob norma ou política)</label><select class="form-input" id="doc-novo-pai">${opcoesPais(null, null)}</select></div>
        <div class="form-group"><label class="form-label">Dono</label><select class="form-input" id="doc-novo-dono">${opcoesPartes(null)}</select></div>
        <div class="form-group"><label class="form-label">Revisar a cada (meses, opcional)</label><input class="form-input" id="doc-novo-meses" type="number" min="1" max="120"></div>
        <button class="btn btn-primary" style="width:100%" data-action="criarDocumentoNovo" data-args='${args(projectId)}'>Criar</button>
    `);
};

window.criarDocumentoNovo = async function (projectId) {
    const titulo = el('doc-novo-titulo').value.trim();
    const texto = el('doc-novo-texto').value;
    if (!titulo || !texto.trim()) { showToast('Informe o título e o texto', 'error'); return; }
    try {
        const r = await api('POST', `/api/v1/projects/${projectId}/documentos`, {
            tipo: el('doc-novo-tipo').value, titulo, texto, pai_id: valorOuNulo('doc-novo-pai'),
            dono_parte_id: valorOuNulo('doc-novo-dono'), revisar_a_cada_meses: meses('doc-novo-meses'),
        });
        window.forceCloseModal();
        window.render();
        await window.openDocumentoModal(projectId, r.id);
    } catch (e) { falha(e, 'Não foi possível criar o documento'); }
};

window.openDocumentoModal = async function (projectId, id) {
    let d;
    let ciencias = [];
    let excecoes = [];
    let requisitos = [];
    let catalogo = [];
    try { d = await api('GET', `/api/v1/projects/${projectId}/documentos/${id}`); } catch (e) { falha(e, 'Não foi possível abrir o documento'); return; }
    try { ciencias = lista(await api('GET', `/api/v1/projects/${projectId}/documentos/${id}/ciencias`)); } catch (e) { /* o resto do documento abre sem as ciências */ }
    try { excecoes = lista(await api('GET', `/api/v1/projects/${projectId}/documentos/${id}/excecoes`)); } catch (e) { /* idem, sem as exceções */ }
    // Requisitos são da faixa n.privacy: projeto sem o produto nem chama a rota (daria 403).
    const comPrivacy = temProduto(projetoDoId(projectId), 'privacy');
    if (comPrivacy) { try { requisitos = lista(await api('GET', `/api/v1/projects/${projectId}/documentos/${id}/requisitos`)); } catch (e) { /* idem, sem os requisitos */ } }
    const editar = podeEditar();
    if (editar && comPrivacy) { try { catalogo = lista(await api('GET', '/api/v1/requisitos')); } catch (e) { /* sem catálogo, sem seletor */ } }
    S.docRequisitos = requisitos.map((r) => r.id);
    const versoes = lista(d.versoes);
    const rascunho = versoes.find((v) => v.estado === 'rascunho');
    const vigente = versoes.find((v) => v.estado === 'vigente');
    const [rotuloStatus] = STATUS[d.status] || [d.status];

    const aviso = rascunho ? `
        <div id="doc-rascunho" style="border:1px solid var(--accent); padding:1rem; margin-bottom:1rem">
            <div style="font-family:'Montserrat',sans-serif; font-weight:600; margin-bottom:0.25rem">Rascunho ${rascunho.origem === 'agente' ? 'do agente ' : ''}aguardando revisão</div>
            <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:0.5rem">Por ${escapeHTML(rascunho.criado_por || 'autor não registrado')} em ${formatarData(rascunho.criado_em, { hora: true })}. O documento vigente só muda quando você publicar.</div>
            <div style="max-height:200px; overflow:auto; white-space:pre-wrap; font-size:0.8rem; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:0.75rem">${escapeHTML(rascunho.texto || '')}</div>
            ${editar ? `<div style="display:flex; gap:8px; margin-top:0.75rem">
                <button class="btn btn-primary btn-sm" data-action="publicarVersaoDocumento" data-args='${args(projectId, id, rascunho.numero)}'>Publicar rascunho</button>
                <button class="btn btn-sm" data-action="descartarRascunhoDocumento" data-args='${args(projectId, id)}'>Descartar</button>
            </div>` : ''}
        </div>` : '';

    const metadados = editar ? `
        <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="doc-e-titulo" maxlength="300" value="${escapeHTML(d.titulo)}"></div>
        <div style="display:flex; gap:0.5rem">
            <div class="form-group" style="flex:1"><label class="form-label">Tipo</label><select class="form-input" id="doc-e-tipo">${opcoesTipo(d.tipo)}</select></div>
            <div class="form-group" style="flex:2"><label class="form-label">Documento pai</label><select class="form-input" id="doc-e-pai">${opcoesPais(d.pai_id, d.id)}</select></div>
        </div>
        <div style="display:flex; gap:0.5rem">
            <div class="form-group" style="flex:2"><label class="form-label">Dono</label><select class="form-input" id="doc-e-dono">${opcoesPartes(d.dono_parte_id)}</select></div>
            <div class="form-group" style="flex:1"><label class="form-label">Revisar a cada (meses)</label><input class="form-input" id="doc-e-meses" type="number" min="1" max="120" value="${d.revisar_a_cada_meses ?? ''}"></div>
        </div>
        <button class="btn btn-sm" data-action="salvarMetadadosDocumento" data-args='${args(projectId, id)}'>Salvar dados do documento</button>`
        : `<div style="font-size:0.85rem; color:var(--text-dim)">${escapeHTML(TIPOS[d.tipo] || d.tipo)} · Dono: ${escapeHTML(nomeDaParte(d.dono_parte_id) || '—')} · Revisão: ${dataBr(d.revisar_ate)}</div>`;

    const aprovacao = d.aprovacao || {};
    const linhaAprovacao = (rotulo, ap) => `<div style="font-size:0.85rem">${rotulo}: ${ap ? `${escapeHTML(ap.por)} em ${formatarData(ap.em)}` : 'sem aprovação desta versão'}</div>`;

    // Uma ação à vista (pedir aprovação, ou a primeira que houver); as outras no "Mais ações", com aposentar e excluir por
    // último e separados: "Marcar como revisado" não fica mais ao lado de "Aposentar".
    const emVigor = d.status === 'vigente';
    const itensAcao = [
        podePedir() && emVigor && { rotulo: 'Pedir aprovação', action: 'pedirAprovacaoDocumento', args: [projectId, id] },
        editar && emVigor && d.revisar_a_cada_meses && { rotulo: 'Marcar como revisado', action: 'marcarDocumentoRevisado', args: [projectId, id] },
        podePedir() && emVigor && { rotulo: 'Pedir ciência por link', action: 'abrirCienciaLink', args: [projectId] },
        editar && d.status === 'obsoleto' && { rotulo: 'Reativar', action: 'mudarStatusDocumento', args: [projectId, id, 'vigente'] },
        editar && emVigor && { rotulo: 'Aposentar', action: 'mudarStatusDocumento', args: [projectId, id, 'obsoleto'], perigo: true },
        // Só o que nunca foi publicado se exclui (o servidor confere pedido e exceção); o resto se aposenta.
        S.user && S.user.role === 'platform_admin' && d.status === 'rascunho' && { rotulo: 'Excluir', action: 'excluirDocumento', args: [projectId, id], perigo: true },
    ].filter(Boolean);
    const aVista = itensAcao.find((i) => !i.perigo);
    const acoes = itensAcao.length ? `<div class="doc-acoes acoes-linha">${aVista ? `<button class="btn btn-sm" data-action="${aVista.action}" data-args='${escapeHTML(JSON.stringify(aVista.args))}'>${aVista.rotulo}</button>` : ''}${window.renderMaisAcoes(itensAcao.filter((i) => i !== aVista))}</div>` : '';

    const editor = editar ? `
        <div class="form-group" style="margin-top:1rem"><label class="form-label">Texto (salva como rascunho; publicar é um passo à parte)</label>
            <textarea class="form-input" id="doc-e-texto" rows="8">${escapeHTML((rascunho || vigente || {}).texto || '')}</textarea></div>
        <button class="btn btn-sm" data-action="salvarRascunhoDocumento" data-args='${args(projectId, id)}'>Salvar rascunho</button>` : '';

    openModal(`
        <div class="modal-header"><span class="modal-title">${escapeHTML(d.titulo)}</span></div>
        <div style="font-size:0.8rem; color:var(--text-dim); margin-bottom:0.75rem">${escapeHTML(rotuloStatus)}${d.versao_vigente ? ` · versão vigente ${escapeHTML(String(d.versao_vigente))}` : ''}</div>
        ${aviso}
        ${metadados}
        <div style="margin:1rem 0">
            ${linhaAprovacao('Líder SGSI', aprovacao.ciso)}
            ${linhaAprovacao('Direção', aprovacao.ceo)}
        </div>
        ${acoes}
        ${editor}
        <h4 style="margin:1.25rem 0 0.5rem">Versões</h4>
        ${versoes.length ? versoes.map((v) => `
            <details style="margin-bottom:0.5rem">
                <summary>Versão ${escapeHTML(String(v.numero))} · ${escapeHTML(ESTADO_VERSAO[v.estado] || v.estado)} · ${escapeHTML(v.origem || '')} · ${formatarData(v.criado_em, { hora: true })}</summary>
                <div style="font-size:0.7rem; color:var(--text-dim)">SHA-256 ${escapeHTML(v.hash || '')}</div>
                <div style="white-space:pre-wrap; font-size:0.85rem; margin-top:0.25rem">${escapeHTML(v.texto || '')}</div>
            </details>`).join('') : window.renderEmptyState({ titulo: 'Nenhuma versão.', compacto: true })}
        <h4 style="margin:1.25rem 0 0.5rem">Ciências</h4>
        ${ciencias.length ? `<table class="data-table"><thead><tr><th>Pessoa</th><th>Versão</th><th>Canal</th><th>Quando</th></tr></thead><tbody>
            ${ciencias.map((x) => `<tr><td>${escapeHTML(x.nome || x.email)}${x.nome ? `<div style="font-size:11px;color:var(--text-dim)">${escapeHTML(x.email)}</div>` : ''}</td>
                <td>${escapeHTML(String(x.numero))}${x.atual ? '' : ' (anterior)'}</td><td>${escapeHTML(CANAIS[x.canal] || x.canal || '')}</td><td>${formatarData(x.em, { hora: true, vazio: '' })}</td></tr>`).join('')}
        </tbody></table>` : '<p style="color:var(--text-dim)">Ninguém deu ciência ainda.</p>'}
        ${comPrivacy ? `<h4 style="margin:1.25rem 0 0.5rem">Requisitos</h4>
        <div id="doc-requisitos">
            ${requisitos.length ? requisitos.map((r) => `<span class="ctx-tag" title="${escapeHTML(r.titulo)}">${escapeHTML(r.fonte_id)} ${escapeHTML(r.referencia)}${editar ? ` <button class="btn btn-ghost btn-sm" data-action="desligarRequisitoDocumento" data-args='${args(projectId, id, r.id)}' aria-label="Desligar ${escapeHTML(r.referencia)}">×</button>` : ''}</span>`).join(' ')
                : window.renderEmptyState({ titulo: 'Nenhum requisito ligado a este documento.', compacto: true })}
            ${editar && catalogo.length ? `<div style="display:flex; gap:0.5rem; align-items:flex-end; margin-top:0.75rem">
                <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="doc-req-add">Ligar requisito</label>
                    <select class="form-input" id="doc-req-add"><option value="">— escolha —</option>${catalogo.filter((r) => !requisitos.some((x) => x.id === r.id))
                        .map((r) => `<option value="${escapeHTML(r.id)}">${escapeHTML(r.fonte_id)} ${escapeHTML(r.referencia)} — ${escapeHTML(r.titulo)}</option>`).join('')}</select></div>
                <button class="btn btn-sm" data-action="ligarRequisitoDocumento" data-args='${args(projectId, id)}'>Ligar</button>
            </div>` : ''}
        </div>` : ''}
        <h4 style="margin:1.25rem 0 0.5rem">Exceções</h4>
        <div id="doc-excecoes">
            ${excecoes.length ? `<table class="data-table"><thead><tr><th>Escopo</th><th>Motivo</th><th>Vence em</th><th>Situação</th><th>Aprovação</th><th></th></tr></thead><tbody>
                ${excecoes.map((x) => {
                    const ativa = x.status === 'ativa';
                    return `<tr><td>${escapeHTML(x.escopo)}</td><td>${escapeHTML(x.motivo)}</td><td>${dataBr(x.vence_em)}</td>
                    <td>${escapeHTML(SITUACAO_EXCECAO[x.situacao] || x.situacao)}</td>
                    <td>${x.aprovacao ? `${escapeHTML(x.aprovacao.por)} (${escapeHTML(PAPEL_APROVADOR[x.aprovacao.papel] || x.aprovacao.papel)})` : '—'}</td>
                    <td style="text-align:right;white-space:nowrap">
                        ${ativa && podePedir() ? `<button class="btn btn-ghost btn-sm" data-action="pedirAprovacaoExcecao" data-args='${args(projectId, x.id)}'>Pedir aprovação</button>` : ''}
                        ${ativa && editar ? `<button class="btn btn-ghost btn-sm" data-action="revogarExcecaoDocumento" data-args='${args(projectId, id, x.id)}'>Revogar</button>` : ''}
                    </td></tr>`;
                }).join('')}
            </tbody></table>` : window.renderEmptyState({ titulo: 'Nenhuma exceção registrada.', compacto: true })}
            ${editar ? `<div style="display:flex; gap:0.5rem; align-items:flex-end; flex-wrap:wrap; margin-top:0.75rem">
                <div class="form-group" style="flex:2; margin:0"><label class="form-label">A quem ou ao quê vale</label><input class="form-input" id="doc-exc-escopo" maxlength="2000"></div>
                <div class="form-group" style="flex:3; margin:0"><label class="form-label">Motivo</label><input class="form-input" id="doc-exc-motivo" maxlength="4000"></div>
                <div class="form-group" style="flex:1; margin:0"><label class="form-label">Vence em</label><input class="form-input" id="doc-exc-vence" type="date"></div>
                <button class="btn btn-sm" data-action="criarExcecaoDocumento" data-args='${args(projectId, id)}'>Registrar exceção</button>
            </div>` : ''}
        </div>
    `, 'modal-large');
};

/** Roda uma ação do detalhe; se der certo, reabre o detalhe e redesenha a lista. Erro: aviso, e o modal fica. */
async function acao(projectId, id, fazer, padrao, sucesso) {
    try {
        await fazer();
        if (sucesso) showToast(sucesso, 'success');
        await window.openDocumentoModal(projectId, id);
        window.render();
    } catch (e) { falha(e, padrao); }
}

window.salvarMetadadosDocumento = (projectId, id) => acao(projectId, id, () => api('PUT', `/api/v1/projects/${projectId}/documentos/${id}`, {
    titulo: el('doc-e-titulo').value.trim(), tipo: el('doc-e-tipo').value, pai_id: valorOuNulo('doc-e-pai'),
    dono_parte_id: valorOuNulo('doc-e-dono'), revisar_a_cada_meses: meses('doc-e-meses'),
}), 'Não foi possível salvar o documento', 'Documento atualizado.');

window.salvarRascunhoDocumento = async function (projectId, id) {
    const texto = el('doc-e-texto').value;
    if (!texto.trim()) { showToast('O texto não pode ficar vazio', 'error'); return; }
    await acao(projectId, id, () => api('POST', `/api/v1/projects/${projectId}/documentos/${id}/versoes`, { texto, origem: 'humano' }),
        'Não foi possível salvar o rascunho', 'Rascunho salvo. Publique quando estiver pronto.');
};

window.publicarVersaoDocumento = (projectId, id, numero) => acao(projectId, id,
    () => api('POST', `/api/v1/projects/${projectId}/documentos/${id}/versoes/${numero}/publicar`),
    'Não foi possível publicar', 'Versão publicada. Pedidos de ciência abertos foram conferidos e a aprovação anterior deixou de valer para esta versão.');

window.descartarRascunhoDocumento = (projectId, id) => acao(projectId, id,
    () => api('DELETE', `/api/v1/projects/${projectId}/documentos/${id}/rascunho`), 'Não foi possível descartar o rascunho', 'Rascunho descartado.');

window.excluirDocumento = async function (projectId, id) {
    if (!(await window.confirmar('O documento e o rascunho somem de vez. Só é possível enquanto ele nunca foi publicado nem teve pedido.', { titulo: 'Excluir documento', rotulo: 'Excluir', perigo: true }))) return;
    try {
        await api('DELETE', `/api/v1/projects/${projectId}/documentos/${id}`);
        closeModal();
        showToast('Documento excluído.', 'success');
        window.render();
    } catch (e) { falha(e, 'Não foi possível excluir o documento'); }
};

window.marcarDocumentoRevisado = (projectId, id) => acao(projectId, id,
    () => api('POST', `/api/v1/projects/${projectId}/documentos/${id}/revisar`), 'Não foi possível marcar como revisado', 'Documento revisado: a próxima revisão foi renovada.');

window.mudarStatusDocumento = (projectId, id, status) => acao(projectId, id,
    () => api('PUT', `/api/v1/projects/${projectId}/documentos/${id}`, { status }), 'Não foi possível mudar a situação do documento');

window.ligarRequisitoDocumento = function (projectId, id) {
    const novo = el('doc-req-add').value;
    if (!novo) { showToast('Escolha um requisito', 'error'); return; }
    return acao(projectId, id, () => api('PUT', `/api/v1/projects/${projectId}/documentos/${id}/requisitos`, { requisitos: [...(S.docRequisitos || []), novo] }),
        'Não foi possível ligar o requisito', 'Requisito ligado.');
};

window.desligarRequisitoDocumento = (projectId, id, requisitoId) => acao(projectId, id,
    () => api('PUT', `/api/v1/projects/${projectId}/documentos/${id}/requisitos`, { requisitos: (S.docRequisitos || []).filter((x) => x !== requisitoId) }),
    'Não foi possível desligar o requisito', 'Requisito desligado.');

window.criarExcecaoDocumento = async function (projectId, id) {
    const escopo = el('doc-exc-escopo').value.trim();
    const motivo = el('doc-exc-motivo').value.trim();
    const venceEm = el('doc-exc-vence').value;
    if (!escopo || !motivo || !venceEm) { showToast('Informe a quem vale, o motivo e o prazo', 'error'); return; }
    await acao(projectId, id, () => api('POST', `/api/v1/projects/${projectId}/documentos/${id}/excecoes`, { escopo, motivo, vence_em: venceEm }),
        'Não foi possível registrar a exceção', 'Exceção registrada. Peça a aprovação para ela valer.');
};

window.revogarExcecaoDocumento = (projectId, id, excecaoId) => acao(projectId, id,
    () => api('POST', `/api/v1/projects/${projectId}/documentos/${id}/excecoes/${excecaoId}/revogar`), 'Não foi possível revogar a exceção', 'Exceção revogada.');

window.pedirAprovacaoExcecao = function (projectId, excecaoId) {
    window.abrirPedidoAprovacao(projectId, 'excecao', excecaoId);
};

window.pedirAprovacaoDocumento = function (projectId, id) {
    window.abrirPedidoAprovacao(projectId, 'documento', id);
};

window.renderDocumentos = renderDocumentos;
