import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML, formatarData } from '../ui.js';
import { montarLista, colunasDe } from '../lista.js';
import { navigate } from '../router.js';
import { limparFichaDoEndereco } from '../produto.js';
import { mascaraCnpj } from './empresa.js';

// Fornecedores (n.privacy; antes "Terceiros", fatia 6 do núcleo): organizações com tipo, o método que o tipo define, a avaliação
// com validade, a criticidade e o DPA ligado. A lista filtra na própria tela; a ficha é uma página em abas, com a parte e a aba no
// endereço (spec 2026-10-19). Toda regra é do servidor; aqui só se mostra e se chama. Todo texto vindo do servidor é escapado.

const TIPOS = { grande_provedor: 'Grande provedor', medio: 'Médio', pequeno: 'Pequeno', critico: 'Crítico' };
const METODOS = { trust_center: 'Trust center', questionario: 'Questionário', auditoria: 'Auditoria' };
const RESULTADOS = { aprovado: 'Aprovado', com_ressalvas: 'Aprovado com ressalvas', reprovado: 'Reprovado' };
const SITUACOES = { pendente: ['Pendente', 'neutral'], vigente: ['Vigente', 'success'], vencida: ['Vencida', 'danger'], reprovada: ['Reprovada', 'danger'], reavaliar: ['Reavaliar', 'warning'] };
const PAPEIS_DOC = { dpa: 'DPA', contrato: 'Contrato', outro: 'Outro' };
const STATUS_DOC = { rascunho: 'Rascunho', vigente: 'Vigente', publicado: 'Publicado', obsoleto: 'Obsoleto' };
const ORIGENS = { vinculo: 'Vínculo', compartilhamento_externo: 'Compartilhamento externo' };
const PENDENCIAS = ['Tipo', 'Criticidade', 'Avaliação', 'DPA'];
/** "Completo" ou "Falta: Tipo, DPA", do `pendencias` que o servidor manda (a ficha e a lista usam a mesma linha). */
const situacaoTprm = (t) => (lista(t.pendencias).length ? `Falta: ${lista(t.pendencias).join(', ')}` : 'Completo');
const NIVEIS_CRITICIDADE = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' };
const ABAS = [['cadastro', 'Cadastro'], ['criticidade', 'Criticidade'], ['avaliacoes', 'Avaliações'], ['seguranca', 'Segurança'],
    ['documentos', 'Documentos'], ['atividades', 'Atividades de tratamento'], ['suboperadores', 'Suboperadores']];

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin'].includes(S.user.role);
// Tipo, criticidade e avaliação: a equipe e o administrador do cliente (decisão de 09/11/2026); o questionário e o resto, só a equipe.
const podeAvaliar = () => podeEditar() || S.user?.role === 'org_admin';
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const dataBr = (s) => formatarData(s);
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');
const opcoes = (mapa, atual) => Object.entries(mapa).map(([v, r]) => `<option value="${v}" ${atual === v ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('');
const titulo = (t) => `<h4 style="margin:1.25rem 0 0.5rem">${t}</h4>`;
const vazio = (t) => window.renderEmptyState({ titulo: t, compacto: true });
const parteDoEndereco = () => new URLSearchParams(window.location.search).get('parte') || (S.terceiro && S.terceiro.parteId);

/** Só link http(s) vira âncora; qualquer outra coisa (javascript:, data:) aparece como texto. */
const linkSeguro = (u) => (/^https?:\/\/\S+$/i.test(String(u || '')) ? `<a href="${escapeHTML(u)}" target="_blank" rel="noopener noreferrer">${escapeHTML(u)}</a>` : escapeHTML(u || ''));

// ─── Lista ──────────────────────────────────────────────────────────────────────────────────────────────────────

async function renderTerceiros(c, h, a) {
    h.textContent = 'Fornecedores';
    const proj = projetoAtivo();
    // Fornecedor é parte do tipo organização: cadastrar daqui abre o formulário de Partes já como organização.
    const cadastrar = podeEditar() && proj ? `<button class="btn btn-primary" data-action="openNovaParteModal" data-args='${args(proj.id, 'organizacao')}'>Cadastrar fornecedor</button>` : '';
    // Regulador e cliente (só parte interessada no n.iso) não entram na lista; quem quiser tratá-los como fornecedor os adiciona aqui.
    const adicionar = podeEditar() && proj ? `<button class="btn" data-action="abrirAdicionarTerceiro" data-args='${args(proj.id)}'>Adicionar parte existente</button>` : '';
    // As perguntas do questionário moram em Fornecedores > Questionários (modelo da consultoria + ajustes do projeto, migration 0106).
    a.innerHTML = adicionar + cadastrar;
    if (!proj) {
        c.innerHTML = window.renderSemProjeto();
        return;
    }
    let terceiros = [];
    try { terceiros = lista(await api('GET', `/api/v1/projects/${proj.id}/terceiros`)); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os fornecedores.', e); return; }
    const vencidos = terceiros.filter((t) => t.situacao === 'vencida').length;
    const aviso = vencidos ? `<p class="t-perigo">${escapeHTML(String(vencidos))} ${vencidos === 1 ? 'fornecedor com avaliação vencida' : 'fornecedores com avaliação vencida'}.</p>` : '';
    // Vindo do painel, a lista abre filtrada pela situação do item, com o chip para limpar (o componente aplica o filtro).
    c.innerHTML = `${aviso}<div id="tc-lista"></div>`;
    montarLista(el('tc-lista'), {
        id: 'tc',
        linhas: terceiros,
        filtroPainel: { tela: 'terceiros' },
        busca: (t) => t.nome || '',
        buscaDica: 'Fornecedor',
        colunas: colunasDe(['Fornecedor', 'CNPJ', 'Criticidade', 'Tipo', 'Avaliação', 'Vale até', 'Data de envio', '% do questionário', 'DPA', 'Situação do TPRM', 'Atividades', 'Ações'], (t) => {
            const [rotulo, tom] = SITUACOES[t.situacao] || [t.situacao, 'neutral'];
            return [
                `<strong>${escapeHTML(t.nome)}</strong>`,
                escapeHTML(t.cnpj ? mascaraCnpj(t.cnpj) : '—'),
                escapeHTML(NIVEIS_CRITICIDADE[t.nivel] || 'Não avaliada'),
                escapeHTML(TIPOS[t.terceiro_tipo] || '—'),
                window.renderStatusBadge(rotulo, tom),
                (t.ultima_avaliacao ? dataBr(t.ultima_avaliacao.valido_ate) : '—'),
                t.questionario && t.questionario.enviada_em ? dataBr(String(t.questionario.enviada_em).slice(0, 10)) : '—',
                t.questionario ? `${escapeHTML(String(t.questionario.percentual))}%` : '—',
                t.dpa ? 'Sim' : 'Não',
                escapeHTML(situacaoTprm(t)),
                escapeHTML(String(t.atividades ?? t.tratamentos ?? 0)),
                `<button class="btn btn-ghost btn-sm" data-action="abrirTerceiro" data-args='${args(proj.id, t.id)}'>Abrir</button>`,
            ];
        }),
        filtros: [
            { chave: 'nivel', rotulo: 'Criticidade', valor: (t) => t.nivel || 'nao_avaliada', opcoes: Object.entries({ ...NIVEIS_CRITICIDADE, nao_avaliada: 'Não avaliada' }) },
            { chave: 'situacao', rotulo: 'Situação', valor: (t) => t.situacao, opcoes: Object.entries(SITUACOES).map(([k, [r]]) => [k, r]) },
            // A linha cai em "Com pendência" e em cada "Falta ..." que tiver; sem nenhuma, em "Completos".
            { chave: 'pendencia', rotulo: 'Pendência', valor: (t) => (lista(t.pendencias).length ? ['pendente', ...lista(t.pendencias)] : ['completo']),
                opcoes: [['completo', 'Completos'], ['pendente', 'Com pendência'], ...PENDENCIAS.map((x) => [x, `Falta ${x}`])] },
        ],
        vazio: {
            titulo: 'Nenhuma organização cadastrada.',
            dica: 'Cadastre os fornecedores e operadores que tratam dados para o cliente, ou traga os que já estão no projeto.',
            // Pessoas mostra só pessoas: a importação das organizações do projeto se dispara daqui.
            acao: `${cadastrar}${cadastrar ? `<button class="btn" data-action="importarPartes" data-args='${args(proj.id)}'>Importar do projeto</button>` : ''}`,
        },
    });
}

// ─── Ficha (página em abas) ─────────────────────────────────────────────────────────────────────────────────────

const abaDoEndereco = () => {
    const id = new URLSearchParams(window.location.search).get('aba');
    return ABAS.some(([x]) => x === id) ? id : 'cadastro';
};
/** `replaceState`: abrir e trocar de aba não empilham histórico; recarregar volta à mesma ficha e aba. */
function gravarNoEndereco(parteId, aba) {
    const u = new URL(window.location.href);
    u.searchParams.set('tela', 'terceiro');
    u.searchParams.set('parte', parteId);
    u.searchParams.set('aba', aba);
    window.history.replaceState(null, '', u);
}

window.abrirTerceiro = function (projectId, parteId, aba = 'cadastro') {
    if (typeof window.forceCloseModal === 'function') window.forceCloseModal();
    S.terceiro = { projectId, parteId };
    gravarNoEndereco(parteId, aba);
    navigate('terceiro');
};
window.tcVoltar = function () {
    S.terceiro = null;
    limparFichaDoEndereco();
    navigate('terceiros');
};

let ultimo = null;
let sequencia = 0;
const voltar = '<button type="button" class="btn" data-action="tcVoltar">Voltar aos fornecedores</button>';

async function renderTerceiro(c, h, a) {
    ultimo = { c, h, a };
    a.innerHTML = voltar;
    const parteId = parteDoEndereco();
    const projectId = (S.terceiro && S.terceiro.parteId === parteId && S.terceiro.projectId) || (projetoAtivo() || {}).id;
    if (!parteId || !projectId) {
        h.textContent = 'Fornecedor';
        c.innerHTML = window.renderEmptyState({ titulo: 'Nenhum fornecedor aberto', texto: 'Abra um fornecedor pela lista.', acao: voltar });
        return;
    }
    const minha = ++sequencia;
    const aba = abaDoEndereco();
    const editar = podeEditar();
    let t;
    try { t = await api('GET', `/api/v1/projects/${projectId}/terceiros/${parteId}`); } catch (e) {
        if (minha !== sequencia) return;
        if (e && e.status === 404) {
            h.textContent = 'Fornecedor';
            c.innerHTML = window.renderEmptyState({ titulo: 'Fornecedor não encontrado', texto: 'Ele pode ter saído da lista de fornecedores.', acao: voltar });
        } else window.falhaDeCarga(c, a, 'Não foi possível abrir o fornecedor.', e);
        return;
    }
    // O que só a aba aberta usa. Falha aqui não derruba a ficha: a aba diz que não carregou ou fica vazia.
    const extra = {};
    if (aba === 'criticidade') { try { extra.crit = await api('GET', `/api/v1/projects/${projectId}/terceiros/${parteId}/criticidades`); } catch (e) { extra.crit = null; } }
    // grande provedor: o roteiro de conferência do trust center, do modelo da consultoria (migration 0106)
    if (aba === 'avaliacoes' && t.terceiro_tipo === 'grande_provedor') {
        try { extra.roteiro = lista((await api('GET', `/api/v1/projects/${projectId}/homologacoes/perguntas?tipo=grande_provedor`)).perguntas); } catch (e) { extra.roteiro = null; }
    }
    if (aba === 'avaliacoes' && t.pode_questionario) {
        try { extra.homologacoes = lista(await api('GET', `/api/v1/projects/${projectId}/homologacoes?parte_id=${encodeURIComponent(parteId)}`)); } catch (e) { extra.homologacoes = []; }
    }
    if (aba === 'cadastro' && editar) { try { extra.pessoas = lista(await api('GET', `/api/v1/projects/${projectId}/partes?tipo=pessoa&status=ativa`)); } catch (e) { extra.pessoas = []; } }
    if (aba === 'documentos' && editar) {
        try { extra.documentos = lista(await api('GET', `/api/v1/projects/${projectId}/documentos`)); } catch (e) { extra.documentos = []; }
        try { extra.arquivos = lista(await api('GET', `/api/v1/projects/${projectId}/documentos-arquivo`)); } catch (e) { extra.arquivos = []; }
    }
    if (minha !== sequencia) return;

    const [rotulo, tom] = SITUACOES[t.situacao] || [t.situacao, 'neutral'];
    const corpo = { cadastro: abaCadastro, criticidade: abaCriticidade, avaliacoes: abaAvaliacoes, seguranca: abaSeguranca,
        documentos: abaDocumentos, atividades: abaAtividades, suboperadores: abaSuboperadores }[aba](projectId, parteId, t, editar, extra);
    h.textContent = t.nome;
    // reavaliar: a avaliação no prazo foi feita noutro tipo (o modelo e o prazo mudaram com a criticidade ou o tipo)
    const mudou = t.situacao === 'reavaliar' && t.ultima_avaliacao
        ? ` · o tipo mudou de ${escapeHTML(TIPOS[t.ultima_avaliacao.tipo_avaliado] || t.ultima_avaliacao.tipo_avaliado || '—')} para ${escapeHTML(TIPOS[t.terceiro_tipo] || '—')}: registre uma nova avaliação` : '';
    c.innerHTML = `<div class="tc"><p class="tc-resumo">${window.renderStatusBadge(rotulo, tom)} ${t.ultima_avaliacao ? `avaliação válida até ${dataBr(t.ultima_avaliacao.valido_ate)}` : 'nunca avaliado'}${mudou}
            · Criticidade: ${escapeHTML(NIVEIS_CRITICIDADE[t.nivel] || 'Não avaliada')}</p>
        <p class="tc-resumo" id="tc-tprm">Situação do TPRM: ${escapeHTML(situacaoTprm(t))}</p>
        <div class="at-abas" role="tablist" aria-label="Abas do fornecedor">${ABAS.map(([id, r]) =>
            `<button type="button" role="tab" class="at-aba" id="tc-aba-${id}" aria-controls="tc-painel" aria-selected="${id === aba}" tabindex="${id === aba ? 0 : -1}"
                data-action="tcIrParaAba" data-action-keydown="tcTeclaAba" data-arg-event data-args='${args(id)}'>${escapeHTML(r)}</button>`).join('')}</div>
        <div role="tabpanel" class="tc-painel" id="tc-painel" aria-labelledby="tc-aba-${aba}" tabindex="0">${corpo}</div></div>`;
}

const repintar = () => (ultimo ? renderTerceiro(ultimo.c, ultimo.h, ultimo.a) : undefined);

async function irParaAba(id) {
    const parteId = parteDoEndereco();
    if (!parteId) return;
    gravarNoEndereco(parteId, id);
    await repintar();
    const botao = el(`tc-aba-${id}`);
    if (botao) botao.focus();
}
// Clique e teclado passam pela delegação com o evento primeiro (`data-arg-event`) e a aba depois.
window.tcIrParaAba = (_e, id) => irParaAba(id);
window.tcTeclaAba = function (e, atual) {
    const i = ABAS.findIndex(([x]) => x === atual);
    const n = ABAS.length;
    const proxima = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (proxima === undefined) return;
    e.preventDefault();
    return irParaAba(ABAS[proxima][0]);
};

const linhaMetodo = (t) => `<p class="t-dim">${t.metodo ? `O tipo define o método de avaliação: <strong>${escapeHTML(METODOS[t.metodo])}</strong>.` : 'Defina o tipo para saber o método de avaliação.'}</p>`;
const dl = (pares) => `<dl style="display:grid; grid-template-columns:max-content 1fr; gap:0.5rem 1.5rem; margin:0">${pares.map(([k, v]) => `<dt>${k}</dt><dd style="margin:0">${v}</dd>`).join('')}</dl>`;

/** Responsável do fornecedor: a pessoa com o vínculo `responsavel` sobre a organização (o vínculo do núcleo, sem tabela nova). */
function blocoResponsaveis(projectId, parteId, t, editar, pessoas) {
    const resp = lista(t.responsaveis);
    const ja = new Set(resp.map((x) => x.id));
    const livres = lista(pessoas).filter((p) => !ja.has(p.id));
    return `${titulo('Responsável')}
        <div id="tc-resp">${resp.length ? `<ul>${resp.map((x) => `<li>${escapeHTML(x.nome)}${x.email ? ` (${escapeHTML(x.email)})` : ''}
            ${editar ? `<button class="btn btn-ghost btn-sm" data-action="removerResponsavelTerceiro" data-args='${args(projectId, x.id, x.vinculo_id)}'>Remover</button>` : ''}</li>`).join('')}</ul>` : vazio('Nenhum responsável definido.')}</div>
        ${editar && livres.length ? `<div class="form-group"><label class="form-label" for="tc-resp-sel">Pessoa</label>
            <select class="form-input" id="tc-resp-sel">${livres.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join('')}</select>
            <button class="btn btn-ghost btn-sm" data-action="adicionarResponsavelTerceiro" data-args='${args(projectId, parteId)}'>Adicionar responsável</button></div>` : ''}`;
}

function abaCadastro(projectId, parteId, t, editar, extra = {}) {
    return `${dl([['Nome', escapeHTML(t.nome)], ['CNPJ', escapeHTML(t.cnpj ? mascaraCnpj(t.cnpj) : '—')], ['E-mail', escapeHTML(t.email || '—')]])}
        ${editar ? `<p class="t-dim"><button class="btn btn-ghost btn-sm" data-action="openParteModal" data-args='${args(projectId, parteId)}'>Editar nome, e-mail e CNPJ</button></p>` : ''}
        ${blocoResponsaveis(projectId, parteId, t, editar, extra.pessoas)}
        ${titulo('Tipo e método')}
        <div id="tc-tipo">
            ${podeAvaliar() ? `<div style="display:flex; gap:0.5rem; align-items:flex-end"><div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-tipo-sel">Tipo do fornecedor</label>
                <select class="form-input" id="tc-tipo-sel"><option value="">— sem tipo —</option>${opcoes(TIPOS, t.terceiro_tipo)}</select></div>
                <button class="btn btn-sm" data-action="salvarTipoTerceiro" data-args='${args(projectId, parteId)}'>Salvar</button></div>`
                : `<p>${escapeHTML(TIPOS[t.terceiro_tipo] || 'Sem tipo')}</p>`}
            ${linhaMetodo(t)}
        </div>`;
}

function abaAvaliacoes(projectId, parteId, t, editar, extra) {
    const hist = lista(t.historico);
    return `${linhaMetodo(t)}
        ${podeAvaliar() && t.terceiro_tipo ? `${titulo('Nova avaliação')}<div id="tc-nova" style="display:flex; gap:0.5rem; align-items:flex-end; flex-wrap:wrap">
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-res">Resultado</label><select class="form-input" id="tc-res">${opcoes(RESULTADOS)}</select></div>
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-val">Vale até${t.validade_maxima ? ` (no máximo ${escapeHTML(dataBr(t.validade_maxima))})` : ''}</label><input class="form-input" id="tc-val" type="date"${t.validade_maxima ? ` value="${escapeHTML(t.validade_maxima)}" max="${escapeHTML(t.validade_maxima)}"` : ''}></div>
            <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-url">Evidência (link)</label><input class="form-input" id="tc-url" maxlength="2000" placeholder="https://"></div>
            <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-obs">Observação</label><input class="form-input" id="tc-obs" maxlength="2000"></div>
            <button class="btn btn-primary btn-sm" data-action="registrarAvaliacaoTerceiro" data-args='${args(projectId, parteId)}'>Registrar</button></div>` : ''}
        ${titulo('Histórico de avaliações')}
        <div id="tc-historico">${hist.length ? `<table class="data-table"><thead><tr><th>Em</th><th>Método</th><th>Resultado</th><th>Vale até</th><th>Evidência</th><th>Observação</th><th>Por</th></tr></thead><tbody>${hist.map((x) =>
            `<tr><td>${dataBr(x.created_at)}</td><td>${escapeHTML(METODOS[x.metodo] || x.metodo)}</td><td>${escapeHTML(RESULTADOS[x.resultado] || x.resultado)}</td><td>${dataBr(x.valido_ate)}</td><td>${linkSeguro(x.evidencia_url)}</td><td>${escapeHTML(x.observacao || '')}</td><td>${escapeHTML(x.avaliado_por || '')}</td></tr>`).join('')}</tbody></table>`
            : vazio('Nenhuma avaliação registrada.')}</div>
        ${t.pode_questionario ? secaoHomologacao(projectId, parteId, extra.homologacoes || [], editar) : ''}
        ${t.terceiro_tipo === 'grande_provedor' ? secaoRoteiro(extra.roteiro) : ''}`;
}

/** Roteiro de conferência do trust center (grande provedor): o que a equipe confere antes de registrar a avaliação. Só leitura. */
function secaoRoteiro(roteiro) {
    if (roteiro === null) return `${titulo('Roteiro de conferência do trust center')}<p class="t-dim">Não foi possível carregar o roteiro.</p>`;
    const itens = lista(roteiro).filter((p) => p.usada);
    return `${titulo('Roteiro de conferência do trust center')}
        <p class="t-dim">Do modelo da consultoria (Conta e acessos &gt; Modelos de avaliação de fornecedor). Confira cada item antes de registrar a avaliação.</p>
        ${itens.length ? `<ul id="tc-roteiro">${itens.map((p) => `<li><strong>${escapeHTML(p.tema)}:</strong> ${escapeHTML(p.texto)}</li>`).join('')}</ul>` : vazio('O roteiro do modelo está vazio.')}`;
}

// Perfil de segurança: a linha de `vendors` da parte (o mesmo perfil da tela Fornecedores do n.iso), salvo pelo PUT dela.
const SEG_MARCAS = [['iso27001', 'has_iso27001', 'ISO 27001'], ['iso27701', 'has_iso27701', 'ISO 27701'], ['soc2', 'has_soc2', 'SOC 2'],
    ['mfa', 'has_mfa', 'MFA habilitado'], ['cripto', 'has_encryption', 'Criptografia ativa'], ['backup', 'has_backup', 'Backups regulares'],
    ['incidente', 'has_incident_plan', 'Plano de incidentes'], ['pentest', 'has_pentest', 'Testes de invasão (pentest)']];
const SEG_TEXTOS = [['tc-url', 'trust_center_url', 'Trust center (link)'],
    ['certs', 'attached_certifications', 'Outras certificações (separadas por vírgula)'], ['notas', 'notes', 'Observações']];

// O DPA é o documento ligado (aba Documentos, fonte única de 20/10/2026). O legado do perfil (caixa marcada ou link) só aparece,
// só leitura, enquanto nenhum documento DPA estiver ligado.
const dpaDeclarado = (t, v) => (!t.dpa && (v.dpa_signed || String(v.dpa_url || '').trim())
    ? `<p class="t-sm">DPA declarado, sem documento (link antigo): ${linkSeguro(v.dpa_url) || '—'}. Ligue o documento na aba Documentos.</p>` : '');

function abaSeguranca(projectId, parteId, t, editar) {
    const v = t.seguranca;
    if (!v) return '<p>Sem perfil de segurança.</p>';
    if (!editar) {
        return dpaDeclarado(t, v) + dl([...SEG_MARCAS.map(([, campo, r]) => [r, v[campo] ? 'Sim' : 'Não']),
            ...SEG_TEXTOS.map(([, campo, r]) => [r, campo.endsWith('url') ? (linkSeguro(v[campo]) || '—') : escapeHTML(v[campo] || '—')])]);
    }
    return `${dpaDeclarado(t, v)}<fieldset class="form-group"><legend class="form-label">Certificações e postura de segurança</legend>
            <div style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:0.5rem">
            ${SEG_MARCAS.map(([id, campo, r]) => `<label class="opcao-check"><input type="checkbox" id="tc-seg-${id}" ${v[campo] ? 'checked' : ''}> ${r}</label>`).join('')}</div></fieldset>
        ${SEG_TEXTOS.map(([id, campo, r]) => `<div class="form-group"><label class="form-label" for="tc-seg-${id}">${r}</label>${campo === 'notes'
            ? `<textarea class="form-input" id="tc-seg-${id}" rows="3" maxlength="4000">${escapeHTML(v[campo] || '')}</textarea>`
            : `<input class="form-input" id="tc-seg-${id}" maxlength="2000" value="${escapeHTML(v[campo] || '')}">`}</div>`).join('')}
        <button class="btn btn-primary" data-action="salvarSegurancaTerceiro" data-args='${args(projectId, parteId, v.id)}'>Salvar perfil de segurança</button>`;
}

window.salvarSegurancaTerceiro = async function (projectId, parteId, vendorId) {
    let atual;
    try { atual = (await api('GET', `/api/v1/projects/${projectId}/terceiros/${parteId}`)).seguranca; } catch (e) { falha(e, 'Não foi possível ler o perfil'); return; }
    if (!atual) return;
    // O PUT grava o perfil inteiro: nome, categoria e status seguem os gravados (o nome é o da parte).
    const corpo = { name: atual.name, category: atual.category ?? null, status: atual.status || 'Active' };
    for (const [id, campo] of SEG_MARCAS) corpo[campo] = el(`tc-seg-${id}`).checked ? 1 : 0;
    for (const [id, campo] of SEG_TEXTOS) corpo[campo] = el(`tc-seg-${id}`).value.trim() || null;
    return acao(() => api('PUT', `/api/v1/vendors/${vendorId}`, corpo), 'Não foi possível salvar o perfil de segurança', 'Perfil de segurança salvo.');
};

function abaDocumentos(projectId, parteId, t, editar, extra) {
    const ligados = lista(t.documentos_ligados);
    const documentos = extra.documentos || [];
    const arquivos = extra.arquivos || [];
    return `<div id="tc-docs">${ligados.length ? `<table class="data-table"><thead><tr><th>Documento</th><th>Papel</th><th>Situação</th><th></th></tr></thead><tbody>${ligados.map((d) =>
            `<tr><td>${escapeHTML(d.titulo)}${d.origem === 'arquivo' ? ' <span class="t-dim">(arquivo)</span>' : ''}</td><td>${escapeHTML(PAPEIS_DOC[d.papel] || d.papel)}</td><td>${escapeHTML(STATUS_DOC[d.status] || d.status || '')}</td><td class="t-right">${editar
                ? `<button class="btn btn-ghost btn-sm" data-action="desligarDocumentoTerceiro" data-args='${args(projectId, parteId, d.id, d.papel, d.origem === 'arquivo' ? 'arquivo' : '')}'>Desligar</button>` : ''}</td></tr>`).join('')}</tbody></table>`
            : vazio('Nenhum documento ligado.')}
            ${editar && (documentos.length || arquivos.length) ? `<div style="display:flex; gap:0.5rem; align-items:flex-end; margin-top:0.75rem"><div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-doc">Documento</label>
                <select class="form-input" id="tc-doc">${documentos.map((d) => `<option value="doc:${escapeHTML(d.id)}">${escapeHTML(d.titulo)}</option>`).join('')}${arquivos.map((d) => `<option value="arquivo:${escapeHTML(d.id)}">${escapeHTML(d.nome)} (arquivo)</option>`).join('')}</select></div>
                <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-doc-papel">Papel</label><select class="form-input" id="tc-doc-papel">${opcoes(PAPEIS_DOC)}</select></div>
                <button class="btn btn-sm" data-action="ligarDocumentoTerceiro" data-args='${args(projectId, parteId)}'>Ligar</button></div>` : ''}</div>`;
}

function abaAtividades(projectId, parteId, t) {
    const itens = lista(t.tratamentos_afetados);
    return `<div id="tc-trat">${itens.length ? `<table class="data-table"><thead><tr><th>Atividade</th><th>Origem</th><th></th></tr></thead><tbody>${itens.map((r) =>
        `<tr><td>${escapeHTML(r.finalidade)}</td><td>${escapeHTML(ORIGENS[r.origem] || r.origem || '')}</td>
            <td class="t-right"><button class="btn btn-ghost btn-sm" data-action="abrirAtividade" data-args='${args(projectId, r.id)}'>Abrir atividade</button></td></tr>`).join('')}</tbody></table>`
        : vazio('Nenhuma atividade de tratamento usa este fornecedor.')}</div>`;
}

function abaSuboperadores(projectId, parteId, t) {
    const subs = lista(t.suboperadores);
    return `<div id="tc-subs">${subs.length ? `<ul>${subs.map((s) => `<li>${escapeHTML(s.nome)}</li>`).join('')}</ul>` : vazio('Nenhum suboperador.')}</div>`;
}

window.abrirAdicionarTerceiro = async function (projectId) {
    let cand;
    try { cand = lista(await api('GET', `/api/v1/projects/${projectId}/terceiros/candidatos`)); } catch (e) { falha(e, 'Não foi possível listar as partes'); return; }
    openModal(`
        <h3>Adicionar parte existente como fornecedor</h3>
        ${cand.length ? `<div class="form-group"><label class="form-label" for="tc-cand">Parte</label>
            <select class="form-input" id="tc-cand">${cand.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label" for="tc-cand-tipo">Tipo do fornecedor</label>
            <select class="form-input" id="tc-cand-tipo">${opcoes(TIPOS)}</select></div>
            <button class="btn btn-primary" data-action="adicionarTerceiro" data-args='${args(projectId)}'>Adicionar</button>`
            : vazio('Nenhuma parte para adicionar: as organizações do projeto já são fornecedores.')}
    `);
};

window.adicionarTerceiro = async function (projectId) {
    try {
        await api('PUT', `/api/v1/projects/${projectId}/terceiros/${el('tc-cand').value}/tipo`, { terceiro_tipo: el('tc-cand-tipo').value });
        closeModal();
        showToast('Fornecedor adicionado.', 'success');
        window.render();
    } catch (e) { falha(e, 'Não foi possível adicionar o fornecedor'); }
};

async function acao(fazer, padrao, sucesso) {
    try {
        await fazer();
        if (sucesso) showToast(sucesso, 'success');
        await repintar();
    } catch (e) { falha(e, padrao); }
}

window.adicionarResponsavelTerceiro = (projectId, parteId) => acao(
    () => api('POST', `/api/v1/projects/${projectId}/partes/${el('tc-resp-sel').value}/vinculos`, { papel: 'responsavel', alvo_tipo: 'parte', alvo_id: parteId }), 'Não foi possível adicionar o responsável', 'Responsável adicionado.');

window.removerResponsavelTerceiro = (projectId, pessoaId, vinculoId) => acao(
    () => api('DELETE', `/api/v1/projects/${projectId}/partes/${pessoaId}/vinculos/${vinculoId}`), 'Não foi possível remover o responsável', 'Responsável removido.');

window.salvarTipoTerceiro = (projectId, parteId) => acao(
    () => api('PUT', `/api/v1/projects/${projectId}/terceiros/${parteId}/tipo`, { terceiro_tipo: el('tc-tipo-sel').value || null }), 'Não foi possível salvar o tipo', 'Tipo salvo.');

window.registrarAvaliacaoTerceiro = function (projectId, parteId) {
    const validoAte = el('tc-val').value;
    if (!validoAte) { showToast('Informe até quando a avaliação vale', 'error'); return; }
    return acao(() => api('POST', `/api/v1/projects/${projectId}/terceiros/${parteId}/avaliacoes`, {
        resultado: el('tc-res').value, valido_ate: validoAte, evidencia_url: el('tc-url').value.trim() || null, observacao: el('tc-obs').value.trim() || null,
    }), 'Não foi possível registrar a avaliação', 'Avaliação registrada.');
};

/** O select mistura documento versionado (`doc:<id>`) e documento em arquivo (`arquivo:<id>`): o corpo leva um só dos dois ids. */
const documentoDoSelect = (valor, papel) => (valor.startsWith('arquivo:') ? { arquivo_id: valor.slice(8), papel } : { documento_id: valor.replace(/^doc:/, ''), papel });

window.ligarDocumentoTerceiro = (projectId, parteId) => acao(
    () => api('POST', `/api/v1/projects/${projectId}/terceiros/${parteId}/documentos`, documentoDoSelect(el('tc-doc').value, el('tc-doc-papel').value)), 'Não foi possível ligar o documento', 'Documento ligado.');

window.desligarDocumentoTerceiro = (projectId, parteId, documentoId, papel, origem) => acao(
    () => api('DELETE', `/api/v1/projects/${projectId}/terceiros/${parteId}/documentos/${documentoId}?papel=${encodeURIComponent(papel)}${origem === 'arquivo' ? '&origem=arquivo' : ''}`), 'Não foi possível desligar o documento', 'Documento desligado.');

// ─── Avaliação de criticidade (spec 2026-10-18) ─────────────────────────────────────────────────────────────────
// Cinco blocos, uma resposta cada, com a pergunta do legado (spec 2026-10-19). O nível é derivado no servidor (pior critério); o tipo segue o nível, salvo grande provedor.

const CRITERIOS_CRITICIDADE = [
    { chave: 'impacto', pergunta: 'Qual o impacto da falha deste fornecedor nas operações da empresa?', titulo: 'Impacto no Negócio', opcoes: [['alto', 'Alto (interrupção total ou significativa)'], ['medio', 'Médio (impacto relevante, com soluções paliativas)'], ['baixo', 'Baixo (impacto mínimo ou inexistente)']] },
    { chave: 'exclusividade', pergunta: 'Quão fácil é substituir este fornecedor?', titulo: 'Exclusividade e Alternativas', opcoes: [['sem_alternativas', 'Sem alternativas (fornecedor único ou substituição muito difícil)'], ['poucas_alternativas', 'Poucas alternativas (existem, com dificuldades técnicas ou financeiras)'], ['varias_alternativas', 'Várias alternativas (fácil de substituir)']] },
    { chave: 'risco_financeiro', pergunta: 'Qual o nível de risco financeiro deste fornecedor?', titulo: 'Risco Financeiro', opcoes: [['alto', 'Alto (histórico de instabilidade ou inadimplência)'], ['medio', 'Médio (algumas oscilações)'], ['baixo', 'Baixo (financeiramente sólido)']] },
    { chave: 'conformidade', pergunta: 'Quanto à conformidade regulatória:', titulo: 'Conformidade', opcoes: [['regulamentado', 'Está sujeito à Regulamentação Específica no setor de atuação'], ['sem_regulamentacao', 'Não há Regulamentação Específica no setor de atuação']] },
    { chave: 'risco_reputacional', pergunta: 'Falhas deste fornecedor poderiam causar danos à imagem da empresa?', titulo: 'Risco Reputacional', opcoes: [['alto', 'Alto (relação direta de reconhecimento da marca entre as empresas)'], ['medio', 'Médio (algum conhecimento da dependência)'], ['baixo', 'Baixo (risco mínimo)']] },
];
const respostaEmTexto = (c, v) => (c.opcoes.find(([x]) => x === v) || [v, v || ''])[1];

const abaCriticidade = (projectId, parteId, t, editar, extra) => secaoCriticidade(projectId, parteId, t, extra.crit, podeAvaliar());

function secaoCriticidade(projectId, parteId, t, crit, editar) {
    const cabeca = '<h4>Avaliação de criticidade</h4>';
    if (!crit) return `${cabeca}<p>Não foi possível carregar a avaliação de criticidade.</p>`;
    const atual = crit.atual;
    const resumo = atual
        ? `<p>Nível atual: <strong>${escapeHTML(NIVEIS_CRITICIDADE[atual.nivel] || atual.nivel)}</strong> · avaliado em ${dataBr(atual.created_at)}${atual.avaliado_por ? ` por ${escapeHTML(atual.avaliado_por)}` : ''}.</p>`
        : '<p><strong>Sem avaliação de criticidade.</strong> Responda as cinco perguntas para definir o tipo deste fornecedor.</p>';
    const tipo = t.terceiro_tipo === 'grande_provedor'
        ? `<p>Tipo: ${escapeHTML(TIPOS[t.terceiro_tipo])}. Grande provedor é mantido: a avaliação não troca o tipo.</p>`
        : `<p>Tipo resultante: ${escapeHTML(TIPOS[t.terceiro_tipo] || 'Sem tipo')}${t.metodo ? ` (método: ${escapeHTML(METODOS[t.metodo])})` : ''}.</p>`;
    const perguntas = editar ? `${CRITERIOS_CRITICIDADE.map((c) => `<fieldset class="form-group" aria-describedby="tc-crit-p-${c.chave}"><legend class="form-label">${escapeHTML(c.titulo)}</legend>
            <p class="at-nota" id="tc-crit-p-${c.chave}">${escapeHTML(c.pergunta)}</p>
            ${c.opcoes.map(([v, r]) => `<label><input type="radio" name="tc-crit-${c.chave}" value="${v}"> ${escapeHTML(r)}</label>`).join('<br>')}</fieldset>`).join('')}
        <button class="btn btn-primary" data-action="confirmarCriticidadeTerceiro" data-args='${args(projectId, parteId)}'>Confirmar avaliação</button>` : '';
    const historico = lista(crit.historico);
    const tabela = historico.length ? `<table class="data-table"><thead><tr><th>Em</th><th>Nível</th>${CRITERIOS_CRITICIDADE.map((c) => `<th>${escapeHTML(c.titulo)}</th>`).join('')}<th>Por</th></tr></thead><tbody>${historico.map((h) =>
        `<tr><td>${dataBr(h.created_at)}</td><td>${escapeHTML(NIVEIS_CRITICIDADE[h.nivel] || h.nivel)}</td>${CRITERIOS_CRITICIDADE.map((c) => `<td>${escapeHTML(respostaEmTexto(c, h[c.chave]))}</td>`).join('')}<td>${escapeHTML(h.avaliado_por || '')}</td></tr>`).join('')}</tbody></table>`
        : vazio('Nenhuma avaliação de criticidade registrada.');
    return `${cabeca}<div id="tc-crit">${resumo}${tipo}${perguntas}</div>
        <h5>Histórico de criticidade</h5><div id="tc-crit-historico">${tabela}</div>`;
}

window.confirmarCriticidadeTerceiro = function (projectId, parteId) {
    const resposta = {};
    for (const c of CRITERIOS_CRITICIDADE) {
        const marcado = document.querySelector(`input[name="tc-crit-${c.chave}"]:checked`);
        if (!marcado) { showToast('Responda as cinco perguntas da avaliação de criticidade', 'error'); return; }
        resposta[c.chave] = marcado.value;
    }
    return acao(() => api('POST', `/api/v1/projects/${projectId}/terceiros/${parteId}/criticidades`, resposta),
        'Não foi possível registrar a avaliação de criticidade', 'Avaliação de criticidade registrada.');
};

// ─── Homologação por questionário (F5) ──────────────────────────────────────────────────────────────────────────
// O link para o fornecedor sai uma vez, na criação; concluir é ato humano e grava a avaliação acima (método questionário).

const STATUS_HOMOLOGACAO = { aberta: ['Aguardando resposta', 'neutral'], respondida: ['Respondida', 'warning'], concluida: ['Concluída', 'success'], cancelada: ['Cancelada', 'neutral'] };
const RESPOSTAS_HOMOLOGACAO = { sim: 'Sim', nao: 'Não', parcial: 'Parcial', na: 'Não se aplica' };

function secaoHomologacao(projectId, parteId, homologacoes, editar) {
    const linhas = homologacoes.map((h) => {
        const [rotulo, tom] = h.expirada ? ['Link vencido', 'danger'] : (STATUS_HOMOLOGACAO[h.status] || [h.status, 'neutral']);
        return `<tr><td>${dataBr(h.created_at)}</td><td>${window.renderStatusBadge(rotulo, tom)}</td>
            <td>${escapeHTML(`${h.percentual}% (${h.respondidas} de ${h.total})`)}</td><td>${dataBr(String(h.expira_em || '').slice(0, 10))}</td>
            <td>${escapeHTML(RESULTADOS[h.resultado] || '')}</td>
            <td style="text-align:right">${editar ? `<button class="btn btn-ghost btn-sm" data-action="revisarHomologacao" data-args='${args(projectId, parteId, h.id)}'>Revisar</button>` : ''}</td></tr>`;
    }).join('');
    return `<h4 style="margin:1.25rem 0 0.5rem">Homologação por questionário</h4>
        <div id="tc-homologacao">${homologacoes.length
            ? `<table class="data-table"><thead><tr><th>Criada em</th><th>Situação</th><th>Respondido</th><th>Link vale até</th><th>Resultado</th><th></th></tr></thead><tbody>${linhas}</tbody></table>`
            : window.renderEmptyState({ titulo: 'Nenhum questionário enviado.', compacto: true })}
        ${editar ? `<div style="display:flex; gap:0.5rem; align-items:flex-end; flex-wrap:wrap; margin-top:0.75rem">
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-hm-dias">Link vale (dias)</label><input class="form-input" id="tc-hm-dias" type="number" min="1" max="60" value="15"></div>
            <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-hm-email">E-mail do fornecedor (opcional)</label><input class="form-input" id="tc-hm-email" type="email" maxlength="254"></div>
            <button class="btn btn-sm" data-action="criarHomologacaoTerceiro" data-args='${args(projectId, parteId)}'>Homologar</button></div>
            <div id="tc-hm-link"></div>` : ''}</div>`;
}

window.criarHomologacaoTerceiro = async function (projectId, parteId) {
    const dias = Number(el('tc-hm-dias').value);
    if (!Number.isInteger(dias) || dias < 1 || dias > 60) { showToast('Informe a validade do link em dias, de 1 a 60', 'error'); return; }
    const email = el('tc-hm-email').value.trim();
    let r;
    try {
        r = await api('POST', `/api/v1/projects/${projectId}/homologacoes`, email ? { parte_id: parteId, dias, email } : { parte_id: parteId, dias });
    } catch (e) { falha(e, 'Não foi possível criar a homologação'); return; }
    await repintar();
    const alvo = el('tc-hm-link');
    if (!alvo) return;
    alvo.innerHTML = `<div style="margin-top:1rem; padding:1rem; border:1px solid var(--border)">
        <label class="form-label" for="tc-hm-url">Link do questionário, válido até ${dataBr(String(r.expira_em || '').slice(0, 10))}</label>
        <div style="display:flex; gap:0.5rem"><input class="form-input" id="tc-hm-url" readonly value="${escapeHTML(r.url)}"><button class="btn btn-ghost" data-action="copiarLinkHomologacao">Copiar</button></div>
        <p style="color:var(--text-dim); margin:0.5rem 0 0">${r.email_enviado ? 'O link também foi enviado por e-mail. ' : ''}Copie agora: o link não aparece de novo. Envie-o só ao fornecedor.</p></div>`;
};

window.copiarLinkHomologacao = async function () {
    const campo = el('tc-hm-url');
    if (!campo) return;
    try {
        await navigator.clipboard.writeText(campo.value);
        showToast('Link copiado');
    } catch {
        campo.select();
        showToast('Selecione o link e copie com Ctrl+C');
    }
};

window.revisarHomologacao = async function (projectId, parteId, id) {
    let h;
    try { h = await api('GET', `/api/v1/projects/${projectId}/homologacoes/${id}`); } catch (e) { falha(e, 'Não foi possível abrir a homologação'); return; }
    const [rotulo, tom] = h.expirada ? ['Link vencido', 'danger'] : (STATUS_HOMOLOGACAO[h.status] || [h.status, 'neutral']);
    const linhas = lista(h.perguntas).map((p) => `<tr><td>${escapeHTML(p.tema)}</td><td>${escapeHTML(p.texto)}</td>
        <td>${escapeHTML(RESPOSTAS_HOMOLOGACAO[p.resposta] || 'Sem resposta')}</td><td>${escapeHTML(p.justificativa || '')}</td></tr>`).join('');
    openModal(`
        <h3>Homologação de ${escapeHTML(h.parte_nome)}</h3>
        <p>${window.renderStatusBadge(rotulo, tom)} ${escapeHTML(`${h.percentual}% respondido (${h.respondidas} de ${h.total})`)}${h.enviada_em ? ` · enviado em ${dataBr(h.enviada_em)}` : ''}</p>
        <table class="data-table" id="tc-hm-respostas"><thead><tr><th>Tema</th><th>Pergunta</th><th>Resposta</th><th>Justificativa</th></tr></thead><tbody>${linhas}</tbody></table>
        ${h.status === 'respondida' ? `<h4 style="margin:1.25rem 0 0.5rem">Concluir</h4>
            <p style="color:var(--text-dim)">Concluir grava a avaliação do terceiro (método questionário) com o resultado e a validade abaixo.</p>
            <div style="display:flex; gap:0.5rem; align-items:flex-end; flex-wrap:wrap">
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-hm-res">Resultado</label><select class="form-input" id="tc-hm-res">${Object.entries(RESULTADOS).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></div>
            <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tc-hm-val">Vale até</label><input class="form-input" id="tc-hm-val" type="date"></div>
            <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tc-hm-obs">Observação</label><input class="form-input" id="tc-hm-obs" maxlength="1500"></div>
            <button class="btn btn-primary btn-sm" data-action="concluirHomologacao" data-args='${args(projectId, parteId, id)}'>Concluir</button></div>` : ''}
        ${['aberta', 'respondida'].includes(h.status) ? `<div style="margin-top:1rem"><button class="btn btn-ghost btn-sm" data-action="cancelarHomologacao" data-args='${args(projectId, parteId, id)}'>Cancelar homologação</button></div>` : ''}
        <div style="margin-top:1rem"><button class="btn btn-ghost btn-sm" data-action="abrirTerceiro" data-args='${args(projectId, parteId, 'avaliacoes')}'>Voltar ao fornecedor</button></div>
    `, 'modal-large');
};

window.concluirHomologacao = async function (projectId, parteId, id) {
    const validoAte = el('tc-hm-val').value;
    if (!validoAte) { showToast('Informe até quando a avaliação vale', 'error'); return; }
    try {
        await api('POST', `/api/v1/projects/${projectId}/homologacoes/${id}/concluir`, { resultado: el('tc-hm-res').value, valido_ate: validoAte, observacao: el('tc-hm-obs').value.trim() || null });
        showToast('Homologação concluída e avaliação registrada.', 'success');
        window.abrirTerceiro(projectId, parteId, 'avaliacoes');
    } catch (e) { falha(e, 'Não foi possível concluir a homologação'); }
};

window.cancelarHomologacao = async function (projectId, parteId, id) {
    if (!(await window.confirmar('O link deixa de valer na hora e as respostas ficam guardadas.', { titulo: 'Cancelar homologação', perigo: true, rotulo: 'Cancelar homologação' }))) return;
    try {
        await api('POST', `/api/v1/projects/${projectId}/homologacoes/${id}/cancelar`);
        showToast('Homologação cancelada.');
        window.abrirTerceiro(projectId, parteId, 'avaliacoes');
    } catch (e) { falha(e, 'Não foi possível cancelar a homologação'); }
};


window.renderTerceiros = renderTerceiros;
window.renderTerceiro = renderTerceiro;
