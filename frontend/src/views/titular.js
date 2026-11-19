import { S } from '../state.js';
import { api, baixarArquivo, API_BASE, cabecalhosAuth } from '../api.js';
import { showToast, openModal, forceCloseModal, escapeHTML, formatarData, tituloDaTela, confirmar } from '../ui.js';
import { navigate } from '../router.js';
import { produtoAtual, limparFichaDoEndereco } from '../produto.js';
import { filtrarDoPainel } from '../filtro-painel.js';
import { montarLista, colunasDe, consultaDe } from '../lista.js';
import { carregarConsentimentos, telaConsentimentos } from './consentimentos.js';
import { hojeSP } from '../hoje.js';
import { vinculoOtHTML, montarVinculoOt } from '../ot-vinculo.js';
import { rotuloDe } from '../rotulos.js';
import { semRepetir } from '../ot-comum.js';

// Titular e incidentes (fatia 7 do núcleo, só registro interno): pedidos do titular, incidentes, consentimentos e prazos legais.
// Toda regra é do servidor (protocolo, prazo congelado, encerramento do incidente); aqui só se mostra e se chama. Texto escapado.

const TIPOS_PEDIDO = { confirmacao: 'Confirmação de tratamento', acesso: 'Acesso aos dados', correcao: 'Correção', anonimizacao_bloqueio_eliminacao: 'Anonimização, bloqueio ou eliminação', portabilidade: 'Portabilidade',
    informacao_compartilhamento: 'Informação sobre compartilhamento', revogacao_consentimento: 'Revogação do consentimento', oposicao: 'Oposição', outro: 'Outro' };
const CANAIS = { email: 'E-mail', telefone: 'Telefone', formulario: 'Formulário', presencial: 'Presencial', outro: 'Outro' };
// Conferência de identidade e encaminhamento a ponto focal (spec 2026-11-06; valores do servidor em src/schemas/nucleo.ts).
const METODOS_IDENTIDADE = { documento_foto: 'Documento com foto', dados_cadastrais: 'Dados cadastrais conferidos', canal_autenticado: 'Canal autenticado do cliente', presencial: 'Presencial', outro: 'Outro' };
const STATUS_ENCAMINHAMENTO = { aguardando: 'Aguardando', respondido: 'Respondido', cancelado: 'Cancelado' };
const STATUS_PEDIDO = { recebido: 'Recebido', em_andamento: 'Em andamento', respondido: 'Respondido', negado: 'Negado', arquivado: 'Arquivado' };
const TIPOS_TRATATIVA = { comunicacao_titular: 'Comunicação ao titular', encaminhamento: 'Encaminhamento a ponto focal', evidencia: 'Evidência recebida', nota: 'Nota interna' };
const PRAZO = { sem_prazo: ['Prazo não calculado', 'neutral'], encerrado: ['Encerrado', 'neutral'], no_prazo: ['No prazo', 'success'], vence_hoje: ['Vence hoje', 'warning'], atrasado: ['Atrasado', 'danger'], comunicado: ['Comunicado', 'success'] };
const RISCOS = { sem_risco: 'Sem risco', baixo: 'Baixo', relevante: 'Relevante' };
const STATUS_INCIDENTE = { aberto: 'Aberto', avaliado: 'Avaliado', comunicado: 'Comunicado', encerrado: 'Encerrado' };
// Registro completo do incidente (0098; listas aprovadas pelo dono em 04/11/2026). Os valores são os do servidor (src/schemas/nucleo.ts).
const SEVERIDADES = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
const TIPOS_INCIDENTE = { acesso_indevido: 'Acesso indevido', vazamento: 'Vazamento ou exposição', perda: 'Perda ou extravio', indisponibilidade: 'Indisponibilidade',
    alteracao_indevida: 'Alteração indevida', terceiro: 'Incidente em terceiro (fornecedor ou operador)', malware: 'Malware ou ransomware', engenharia_social: 'Engenharia social', outro: 'Outro' };
const CANAIS_ANPD = { sei: 'Peticionamento eletrônico (SEI)', formulario_anpd: 'Formulário da ANPD', email: 'E-mail', outro: 'Outro' };
const TRATAMENTOS_ACAO = { contencao: 'Contenção', correcao: 'Correção', aperfeicoamento: 'Aperfeiçoamento' };
const STATUS_ACAO = { 'Open': 'Aberto', 'In Progress': 'Em andamento', 'Closed': 'Concluído' };
const COMPROMETIMENTOS = { confidencialidade: 'Confidencialidade', integridade: 'Integridade', disponibilidade: 'Disponibilidade' };
const CRITERIOS_RISCO = { sensiveis: 'Dados sensíveis', criancas_idosos: 'Crianças, adolescentes ou idosos', financeiros: 'Dados financeiros', autenticacao: 'Autenticação em sistemas',
    sigilo: 'Sigilo legal, judicial ou profissional', larga_escala: 'Larga escala', nenhum: 'Não afeta nenhum dos critérios' };
const UNIDADES = { horas: 'horas', dias_corridos: 'dias corridos', dias_uteis: 'dias úteis' };
const ABAS = { pedidos: 'Pedidos do titular', incidentes: 'Incidentes', consentimentos: 'Consentimentos', prazos: 'Prazos legais' };
const MENU_DA_ABA = { pedidos: 'nav-titular', incidentes: 'nav-incidentes-privacy', consentimentos: 'nav-consentimentos' };

const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin'].includes(S.user.role);
// O administrador do cliente registra e responde pedido do titular e registra e avalia incidente (o servidor já o deixa: o allow-list
// de só leitura cobre org_user e client). Encerrar incidente, consentimento e prazo legal seguem com `podeEditar`.
const podeRegistrar = () => podeEditar() || (!!S.user && S.user.role === 'org_admin');
// Papéis que a rota /data-subject aceita (expõe PII).
const podeDados = () => !!S.user && ['platform_admin', 'consultor', 'org_admin'].includes(S.user.role);
const ehAdmin = () => !!S.user && S.user.role === 'platform_admin';
// Rascunho de IA (services/rascunhos-privacy.ts): equipe e o administrador do cliente; só no n.privacy.
const podeRascunho = () => podeRegistrar() && produtoAtual() === 'privacy';
const AVISO_IA = 'Rascunho gerado por IA — revise antes de usar';
const caixaRascunho = (id, texto) => `<p><strong>${escapeHTML(AVISO_IA)}</strong></p>
    <textarea class="form-input" id="${id}" rows="8" maxlength="8000" aria-label="${escapeHTML(AVISO_IA)}">${escapeHTML(texto)}</textarea>`;
const projetoAtivo = () => S.activeProject || (S.projects || [])[0];
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const dia = (s) => formatarData(s);
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');
const selo = (chave) => { const [r, t] = PRAZO[chave] || [chave, 'neutral']; return window.renderStatusBadge(r, t); };
const opcoes = (mapa, atual) => Object.entries(mapa).map(([v, r]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('');
const valorOuNulo = (id) => { const v = el(id).value.trim(); return v || null; };

// No n.iso o incidente é cadastro do núcleo (A.5.26/A.5.27): a tela mostra só ele. Pedidos, consentimentos e prazos são do n.privacy.
const soIncidentes = () => produtoAtual() !== 'privacy';

async function renderTitular(c, h, a) {
    const proj = projetoAtivo();
    if (!proj) {
        a.innerHTML = '';
        c.innerHTML = window.renderSemProjeto();
        return;
    }
    const abasDoProduto = soIncidentes() ? { incidentes: ABAS.incidentes } : ABAS;
    const aba = abasDoProduto[S.titularAba] ? S.titularAba : Object.keys(abasDoProduto)[0];
    S.titularAba = aba;
    // O título é o rótulo do item de menu que abre a aba (no n.privacy, "Solicitações" para os pedidos); sem item, o da aba.
    h.textContent = MENU_DA_ABA[aba] ? tituloDaTela(MENU_DA_ABA[aba], ABAS[aba]) : ABAS[aba];
    const editar = podeEditar();
    const registrar = podeRegistrar();
    // Pedidos e incidentes são lidos sempre: a contagem (e o atraso) aparece na aba, sem precisar abri-la. Falha vira `null`:
    // na aba aberta, é o estado de erro (nunca "nenhum pedido", com prazo correndo); na outra, só some a contagem.
    const ler = (pedido) => pedido.then(lista, (e) => { console.error('Falha ao carregar a lista', e); return null; });
    const [pedidos, incidentes] = await Promise.all([
        soIncidentes() ? [] : ler(api('GET', `/api/v1/projects/${proj.id}/titular-pedidos`)),
        ler(api('GET', `/api/v1/projects/${proj.id}/incidentes`)),
    ]);
    const contagem = (l, atrasados) => (l && l.length ? ` (${l.length}${atrasados ? ` · <span style="color:var(--danger-ink)">${atrasados} ${atrasados === 1 ? 'atrasado' : 'atrasados'}</span>` : ''})` : '');
    const rotulos = {
        pedidos: contagem(pedidos, (pedidos || []).filter((p) => p.situacao_prazo === 'atrasado').length),
        incidentes: contagem(incidentes, (incidentes || []).filter((i) => i.status !== 'encerrado' && (i.situacao_anpd === 'atrasado' || i.situacao_titular === 'atrasado')).length),
    };
    const abas = window.renderAbas(Object.entries(abasDoProduto).map(([v, r]) => [v, escapeHTML(r) + (rotulos[v] || '')]), aba, 'escolherAbaTitular');
    const novo = (acao, rotulo, primario = true) => ((acao === 'abrirNovoConsentimento' ? editar : registrar) ? `<button class="btn${primario ? ' btn-primary' : ''}" data-action="${acao}" data-args='${args(proj.id)}'>${rotulo}</button>` : '');
    // Link do portal público de solicitações (o cliente publica no site/app); gerá-lo é de quem registra os pedidos.
    const portalBtn = registrar ? ` <button class="btn" data-action="abrirPortalTitular" data-args='${args(proj.id)}'>Link do portal</button>` : '';
    // Canal do titular (0117): todos leem; quem registra os pedidos edita no mesmo botão.
    const canalBtn = ` <button class="btn" data-action="abrirCanalTitular" data-args='${args(proj.id)}'>Canal do titular</button>`;
    a.innerHTML = aba === 'pedidos' ? novo('abrirNovoPedidoTitular', '+ Registrar pedido') + portalBtn + canalBtn
        : aba === 'incidentes' ? novo('abrirNovoIncidente', '+ Registrar incidente')
        : aba === 'consentimentos' ? novo('abrirNovoConsentimento', '+ Registrar consentimento') : '';

    // Sem o prazo legal cadastrado, todo registro novo nasce "prazo não calculado": avisar antes, não depois de salvar.
    let aviso = '';
    if (!soIncidentes() && (aba === 'pedidos' || aba === 'incidentes')) {
        const chaves = aba === 'pedidos' ? ['titular.resposta'] : ['incidente.comunicacao_anpd', 'incidente.comunicacao_titular'];
        // Secundário: sem a lista de parâmetros, o aviso não aparece.
        const faltam = ((await ler(api('GET', '/api/v1/parametros-legais'))) || []).filter((p) => chaves.includes(p.chave) && !p.definido);
        if (faltam.length) aviso = `<p id="titular-aviso-prazos" style="color:var(--warning-ink); margin:0 0 1rem">Prazos legais não cadastrados: ${aba === 'pedidos' ? 'novos pedidos ficarão sem prazo' : 'novos incidentes ficarão sem prazo de comunicação'}. Fale com o administrador.
            <button class="btn btn-ghost btn-sm" data-action="escolherAbaTitular" data-args='${args('prazos')}'>Ver prazos legais</button></p>`;
    }

    const falhou = (mensagem) => { a.innerHTML = ''; c.innerHTML = abas + window.renderErrorState(mensagem, { texto: 'Nada foi apagado nem alterado, e os prazos continuam correndo. Tente de novo; se continuar, avise o suporte da ness.' }); };
    if (aba === 'pedidos' && !pedidos) return falhou('Não foi possível carregar os pedidos do titular.');
    if (aba === 'incidentes' && !incidentes) return falhou('Não foi possível carregar os incidentes.');
    let corpo = '';
    let montar = null;
    // Vindo do painel, a lista abre filtrada pela situação do item, com o chip para limpar (o componente aplica o filtro e mostra o chip).
    const filtroPainel = { tela: 'titular', aba };
    if (aba === 'pedidos') {
        // Uma ação principal: com pedido atrasado à vista, responder o primeiro deles vence registrar um novo. Fica no cabeçalho,
        // não na linha: a linha pode estar além das 25 carregadas ou escondida pela busca, e a tela ficaria sem ação principal.
        const { itens: visiveis } = filtrarDoPainel('titular', aba, pedidos);
        const responderPrimeiro = registrar ? visiveis.find((p) => p.situacao_prazo === 'atrasado') : null;
        if (responderPrimeiro) {
            a.innerHTML = novo('abrirNovoPedidoTitular', '+ Registrar pedido', false) + portalBtn + canalBtn
                + ` <button class="btn btn-primary" data-action="abrirPedidoTitular" data-args='${args(proj.id, responderPrimeiro.id)}'>Responder ${escapeHTML(responderPrimeiro.protocolo)}</button>`;
        }
        // Filtros de tipo e status (spec 2026-10-19): na tela, sobre a lista já carregada.
        corpo = '<div id="pt-lista"></div>';
        montar = () => montarLista(el('pt-lista'), {
            id: 'pt',
            linhas: pedidos,
            filtroPainel,
            colunas: colunasDe(['Protocolo', 'Titular', 'Tipo', 'Canal', 'Recebido em', 'Prazo', 'Respondido em', 'Situação', 'Status', 'Ações'], (p) => [
                `<strong>${escapeHTML(p.protocolo)}</strong>`, escapeHTML(p.titular_nome || '—'), escapeHTML(TIPOS_PEDIDO[p.tipo] || p.tipo), escapeHTML(CANAIS[p.canal] || p.canal || '—'), dia(p.recebido_em),
                (p.prazo_em ? dia(p.prazo_em) : 'Não calculado'), dia(p.respondido_em),
                selo(p.situacao_prazo) + (['recebido', 'em_andamento'].includes(p.status) && !p.identidade_metodo ? ` ${window.renderStatusBadge('Identidade não conferida', 'warning')}` : ''),
                escapeHTML(STATUS_PEDIDO[p.status] || p.status),
                // Atrasado e aberto para quem responde: a ação da linha é responder, não só abrir.
                registrar && p.situacao_prazo === 'atrasado'
                    ? `<button class="btn btn-sm" data-action="abrirPedidoTitular" data-args='${args(proj.id, p.id)}' aria-label="Responder: ${escapeHTML(p.protocolo)}">Responder</button>`
                    : `<button class="btn btn-ghost btn-sm" data-action="abrirPedidoTitular" data-args='${args(proj.id, p.id)}'>Abrir</button>`,
            ]),
            busca: (p) => `${p.protocolo || ''} ${p.titular_nome || ''}`,
            buscaDica: 'Protocolo ou titular',
            filtros: [{ chave: 'tipo', rotulo: 'Tipo', valor: (p) => p.tipo, opcoes: Object.entries(TIPOS_PEDIDO) },
                { chave: 'status', rotulo: 'Status', valor: (p) => p.status, opcoes: Object.entries(STATUS_PEDIDO) }],
            // O CSV sai com os filtros da tela e sem dado do titular (só protocolo e andamento).
            exportar: { caminho: (e) => { const q = consultaDe({ tipo: e.filtros.tipo, status: e.filtros.status }); return `/api/v1/projects/${proj.id}/export/pedidos-titular${q}`; } },
            vazio: { titulo: 'Nenhum pedido de titular registrado.', dica: 'LGPD, art. 18. Registre cada pedido recebido para que o prazo de resposta comece a contar.', acao: novo('abrirNovoPedidoTitular', 'Registrar pedido', false) },
        });
    } else if (aba === 'incidentes') {
        corpo = '<div id="in-lista"></div>';
        montar = () => montarLista(el('in-lista'), {
            id: 'in',
            linhas: incidentes,
            filtroPainel,
            colunas: colunasDe(['Protocolo', 'Incidente', 'Ciência', 'Risco', 'ANPD', 'Titular', 'Status', 'Ações'], (i) => [
                `<strong>${escapeHTML(i.protocolo)}</strong>`, escapeHTML(i.titulo), dia(i.ciencia_em), escapeHTML(RISCOS[i.risco_titular] || 'Não avaliado'),
                selo(i.situacao_anpd), selo(i.situacao_titular), escapeHTML(STATUS_INCIDENTE[i.status] || i.status),
                `<button class="btn btn-ghost btn-sm" data-action="abrirIncidente" data-args='${args(proj.id, i.id)}'>Abrir</button>`,
            ]),
            vazio: { titulo: 'Nenhum incidente registrado.', dica: soIncidentes() ? '' : 'LGPD, art. 48. Registre o incidente com a data da ciência: é dela que contam os prazos de comunicação.', acao: novo('abrirNovoIncidente', 'Registrar incidente', false) },
        });
    } else if (aba === 'consentimentos') {
        c.innerHTML = `${abas}<p class="co-carregando" role="status">Carregando os consentimentos…</p>`;
        let l; try { l = await carregarConsentimentos(proj.id); } catch (e) { console.error(e); return falhou('Não foi possível carregar os consentimentos.'); }
        corpo = telaConsentimentos(proj.id, l, editar);
    } else {
        let l = []; try { l = lista(await api('GET', '/api/v1/parametros-legais')); } catch (e) { console.error(e); return falhou('Não foi possível carregar os prazos legais.'); }
        corpo = `<p style="color:var(--text-dim)">O prazo legal não vem do código: o administrador da plataforma cadastra cada valor com a fonte e a data da revisão do jurídico. Sem o valor, o prazo fica "não calculado".</p>`
            + window.renderDataTable(['Prazo', 'Valor', 'Fonte', 'Revisado', 'Ações'], l.map((p) => [
                `<strong>${escapeHTML(p.descricao)}</strong>`, p.definido ? escapeHTML(`${p.valor} ${UNIDADES[p.unidade] || p.unidade}`) : 'Não definido',
                escapeHTML(p.fonte || '—'), p.definido ? `${dia(p.revisado_em)} por ${escapeHTML(p.revisado_por)}` : '—',
                ehAdmin() ? `<button class="btn btn-ghost btn-sm" data-action="editarParametroLegal" data-args='${args(p.chave, p.descricao, p.valor ?? '', p.unidade || 'dias_corridos', p.fonte || '', p.revisado_em || '', p.revisado_por || '', !!p.definido)}'>${p.definido ? 'Editar' : 'Definir'}</button>` : '',
            ]), { emptyState: 'Sem parâmetros.' });
    }
    c.innerHTML = abas + aviso + corpo;
    if (montar) montar();
}

window.abrirIncidentesIso = function () { S.titularAba = 'incidentes'; navigate('titular'); };

// Pela navegação (não só render): o item ativo do menu acompanha a aba (Pedidos do titular, Incidentes).
window.escolherAbaTitular = function (aba) { S.titularAba = aba; navigate('titular'); };

async function acao(fazer, padrao, sucesso, reabrir) {
    try {
        await fazer();
        if (sucesso) showToast(sucesso, 'success');
        if (reabrir) await reabrir();
        window.render();
    } catch (e) { falha(e, padrao); }
}

// ─── Pedidos ──────────────────────────────────────────────────────────────────────────────────────
window.abrirNovoPedidoTitular = function (projectId) {
    openModal(`<h3>Registrar pedido do titular</h3>
        <div class="form-group"><label class="form-label" for="pt-tipo">Tipo</label><select class="form-input" id="pt-tipo">${opcoes(TIPOS_PEDIDO)}</select></div>
        <div class="form-group"><label class="form-label" for="pt-canal">Canal</label><select class="form-input" id="pt-canal">${opcoes(CANAIS, 'outro')}</select></div>
        <div class="form-group"><label class="form-label" for="pt-nome">Nome do titular (opcional)</label><input class="form-input" id="pt-nome" maxlength="200"></div>
        <div class="form-group"><label class="form-label" for="pt-contato">Contato (opcional)</label><input class="form-input" id="pt-contato" maxlength="300"></div>
        <div class="form-group"><label class="form-label" for="pt-data">Recebido em</label><input class="form-input" id="pt-data" type="date"></div>
        <div class="form-group"><label class="form-label" for="pt-desc">Descrição</label><textarea class="form-input" id="pt-desc" rows="3" maxlength="5000"></textarea></div>
        <button class="btn btn-primary" data-action="salvarNovoPedidoTitular" data-args='${args(projectId)}'>Registrar</button>`);
};

window.salvarNovoPedidoTitular = (projectId) => {
    // Um clique no formulário em branco criava um pedido vazio: sem a descrição, não há o que atender.
    if (!valorOuNulo('pt-desc')) { showToast('Descreva o pedido antes de registrar.', 'error'); el('pt-desc').focus(); return; }
    return acao(async () => {
    const r = await api('POST', `/api/v1/projects/${projectId}/titular-pedidos`, {
        tipo: el('pt-tipo').value, canal: el('pt-canal').value, titular_nome: valorOuNulo('pt-nome'), titular_contato: valorOuNulo('pt-contato'),
        descricao: valorOuNulo('pt-desc'), ...(el('pt-data').value ? { recebido_em: el('pt-data').value } : {}),
    });
    showToast(`Pedido ${r.protocolo} registrado. ${r.prazo_em ? `Prazo: ${dia(r.prazo_em)}.` : 'Prazo não calculado (cadastre o prazo legal).'}`, 'success');
    forceCloseModal();
}, 'Não foi possível registrar o pedido');
};

window.abrirPedidoTitular = async function (projectId, id) {
    let p;
    try { p = await api('GET', `/api/v1/projects/${projectId}/titular-pedidos/${id}`); } catch (e) { falha(e, 'Não foi possível abrir o pedido'); return; }
    const editar = podeRegistrar();
    const final = p.status === 'respondido' || p.status === 'negado';
    openModal(`<h3>${escapeHTML(p.protocolo)} — ${escapeHTML(TIPOS_PEDIDO[p.tipo] || p.tipo)}</h3>
        <p>${selo(p.situacao_prazo)} Recebido em ${dia(p.recebido_em)}; prazo ${(p.prazo_em ? dia(p.prazo_em) : 'não calculado')}.</p>
        <p id="pt-quem">${escapeHTML(p.titular_nome || 'Titular não identificado')} ${p.titular_contato ? `· ${escapeHTML(p.titular_contato)}` : ''} · ${escapeHTML(CANAIS[p.canal] || p.canal)}</p>
        <p id="pt-descricao" style="white-space:pre-wrap">${escapeHTML(p.descricao || '')}</p>
        ${editar && p.status !== 'arquivado' ? `<div class="form-group"><label class="form-label" for="pt-status">Status</label><select class="form-input" id="pt-status">${opcoes(final ? { [p.status]: STATUS_PEDIDO[p.status], arquivado: STATUS_PEDIDO.arquivado } : STATUS_PEDIDO, p.status)}</select></div>
            <div class="form-group"><label class="form-label" for="pt-resp">Resposta</label><textarea class="form-input" id="pt-resp" rows="4" maxlength="5000" ${final ? 'disabled' : ''}>${escapeHTML(p.resposta_texto || '')}</textarea></div>
            <button class="btn btn-primary" data-action="salvarPedidoTitular" data-args='${args(projectId, id)}'>Salvar</button>`
            : `<p id="pt-resposta" style="white-space:pre-wrap">${escapeHTML(p.resposta_texto || '')}</p>`}
        ${podeRascunho() && !final && p.status !== 'arquivado' ? `<div style="margin-top:0.75rem"><button class="btn btn-sm" data-action="rascunhoRespostaTitular" data-args='${args(projectId, id)}'>Rascunho</button></div>
            <div id="pt-rascunho" style="margin-top:0.75rem"></div>` : ''}
        ${podeDados() && p.titular_contato ? `<h4 style="margin:1rem 0 0.5rem">Dados do titular</h4>
            <div class="d-flex gap-2 flex-wrap">
                <button class="btn btn-sm" data-action="localizarDadosDoTitular" data-args='${args(projectId, id)}'>Localizar dados</button>
                ${p.tipo === 'anonimizacao_bloqueio_eliminacao' ? `<button class="btn btn-sm" data-action="eliminarDadosDoTitular" data-args='${args(projectId, id)}'>Eliminar dados</button>` : ''}
            </div><div id="pt-dados" style="margin-top:0.75rem"></div>` : ''}
        <div id="pt-identidade-box" class="mt-4"></div>
        <div id="pt-encaminhamentos-box" class="mt-4"></div>
        <div id="pt-tratativas-box" class="mt-4"></div>`, 'modal-large');
    pedidoAberto = p;
    montarIdentidade(projectId, p, editar);
    carregarEncaminhamentos(projectId, id, editar, ['recebido', 'em_andamento'].includes(p.status));
    carregarTratativas(projectId, id, podeRegistrar());
};

// Conferência de identidade (spec 2026-11-06): só registro; quem e quando vêm do servidor. Não trava responder.
function montarIdentidade(projectId, p, editar) {
    const box = el('pt-identidade-box');
    if (!box) return;
    const feita = p.identidade_metodo
        ? `<p>${escapeHTML(METODOS_IDENTIDADE[p.identidade_metodo] || p.identidade_metodo)}${p.identidade_obs ? ` · ${escapeHTML(p.identidade_obs)}` : ''}</p>
            <p class="at-nota">Conferida por ${escapeHTML(p.identidade_por_nome || p.identidade_por || '')} em ${dia(p.identidade_em)}</p>`
        : '<p class="at-nota">Identidade não conferida.</p>';
    const form = editar ? `<div class="form-group mt-2"><label class="form-label" for="pt-id-metodo">Como a identidade foi conferida</label>
            <select class="form-input" id="pt-id-metodo">${opcoes(METODOS_IDENTIDADE, p.identidade_metodo || 'documento_foto')}</select></div>
        <div class="form-group"><label class="form-label" for="pt-id-obs">Observação (sem número de documento)</label>
            <input class="form-input" id="pt-id-obs" maxlength="500" value="${escapeHTML(p.identidade_obs || '')}"></div>
        <button class="btn btn-sm" data-action="salvarIdentidadeTitular" data-args='${args(projectId, p.id)}'>${p.identidade_metodo ? 'Alterar conferência' : 'Registrar conferência'}</button>` : '';
    box.innerHTML = `<h4 class="mb-2">Identidade do titular</h4>${feita}${form}`;
}
window.salvarIdentidadeTitular = async function (projectId, id) {
    try {
        await api('PUT', `/api/v1/projects/${projectId}/titular-pedidos/${id}/identidade`, { metodo: el('pt-id-metodo').value, observacao: valorOuNulo('pt-id-obs') });
        showToast('Conferência de identidade registrada.', 'success');
        await window.abrirPedidoTitular(projectId, id);
    } catch (e) { falha(e, 'Não foi possível registrar a conferência'); }
};

// Encaminhamento a ponto focal (spec 2026-11-06): pessoa do cadastro com e-mail; ela responde por fora e o DPO registra o retorno.
async function carregarEncaminhamentos(projectId, id, editar, aberto) {
    const box = el('pt-encaminhamentos-box');
    if (!box) return;
    let es = [];
    try { es = lista((await api('GET', `/api/v1/projects/${projectId}/titular-pedidos/${id}/encaminhamentos`)).encaminhamentos); } catch (e) { box.innerHTML = '<p class="at-nota">Não foi possível carregar os encaminhamentos.</p>'; return; }
    const linha = (e) => `<li class="et-linha"><span><strong>${escapeHTML(e.parte_nome || '')}</strong> · prazo ${dia(e.prazo)} ${selo(e.situacao)} · ${escapeHTML(STATUS_ENCAMINHAMENTO[e.status] || e.status)}
            <br>${escapeHTML(e.mensagem || '')}${e.retorno ? `<br>Retorno: ${escapeHTML(e.retorno)}` : ''}</span>
        ${editar && e.status === 'aguardando' ? `<div class="form-group mt-2"><textarea class="form-input" id="pt-enc-ret-${escapeHTML(e.id)}" rows="2" maxlength="5000" aria-label="Retorno do ponto focal"></textarea></div>
            <div class="d-flex gap-2"><button class="btn btn-sm" data-action="registrarRetornoEncaminhamento" data-args='${args(projectId, id, e.id)}'>Registrar retorno</button>
            <button class="btn btn-ghost btn-sm" data-action="cancelarEncaminhamento" data-args='${args(projectId, id, e.id)}'>Cancelar</button></div>` : ''}</li>`;
    box.innerHTML = `<h4 class="mb-2">Encaminhamentos</h4>
        ${es.length ? `<ul class="et-lista">${es.map(linha).join('')}</ul>` : '<p class="at-nota">Nenhum encaminhamento.</p>'}
        ${editar && aberto ? `<button class="btn btn-sm mt-2" data-action="abrirEncaminhar" data-args='${args(projectId, id)}'>Encaminhar</button><div id="pt-enc-form"></div>` : ''}`;
}
window.abrirEncaminhar = async function (projectId, id) {
    const alvo = el('pt-enc-form');
    if (!alvo) return;
    let pessoas = [];
    try { pessoas = lista(await api('GET', `/api/v1/projects/${projectId}/partes?tipo=pessoa&status=ativa`)).filter((x) => x.email); } catch (e) { falha(e, 'Não foi possível carregar as pessoas'); return; }
    if (!pessoas.length) { alvo.innerHTML = '<p class="at-nota">Nenhuma pessoa ativa com e-mail no cadastro. Cadastre o ponto focal em Pessoas.</p>'; return; }
    alvo.innerHTML = `<div class="form-group mt-2"><label class="form-label" for="pt-enc-parte">Ponto focal</label>
            <select class="form-input" id="pt-enc-parte">${pessoas.map((x) => `<option value="${escapeHTML(x.id)}">${escapeHTML(x.nome)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label" for="pt-enc-prazo">Prazo interno</label><input class="form-input" id="pt-enc-prazo" type="date" min="${hojeSP()}"></div>
        <div class="form-group"><label class="form-label" for="pt-enc-msg">Mensagem (vai no e-mail; o e-mail não leva os dados do titular)</label>
            <textarea class="form-input" id="pt-enc-msg" rows="3" maxlength="2000"></textarea></div>
        <button class="btn btn-sm" data-action="salvarEncaminhamento" data-args='${args(projectId, id)}'>Enviar encaminhamento</button>`;
};
window.salvarEncaminhamento = async function (projectId, id) {
    const prazo = el('pt-enc-prazo').value;
    const mensagem = el('pt-enc-msg').value.trim();
    if (!prazo || !mensagem) { showToast('Informe o prazo e a mensagem.', 'error'); return; }
    try {
        const r = await api('POST', `/api/v1/projects/${projectId}/titular-pedidos/${id}/encaminhamentos`, { parte_id: el('pt-enc-parte').value, prazo, mensagem });
        showToast(r.email_enviado ? 'Pedido encaminhado; o e-mail foi enviado.' : 'Pedido encaminhado, mas o e-mail não foi enviado. Avise o ponto focal por outro canal.', r.email_enviado ? 'success' : 'error');
        await carregarEncaminhamentos(projectId, id, true, true);
        await carregarTratativas(projectId, id, true);
    } catch (e) { falha(e, 'Não foi possível encaminhar o pedido'); }
};
window.registrarRetornoEncaminhamento = async function (projectId, id, encId) {
    const retorno = (el(`pt-enc-ret-${encId}`)?.value || '').trim();
    if (!retorno) { showToast('Escreva o retorno do ponto focal.', 'error'); return; }
    try {
        await api('PUT', `/api/v1/projects/${projectId}/titular-pedidos/${id}/encaminhamentos/${encId}`, { status: 'respondido', retorno });
        showToast('Retorno registrado.', 'success');
        await carregarEncaminhamentos(projectId, id, true, ['recebido', 'em_andamento'].includes(pedidoAberto?.status));
    } catch (e) { falha(e, 'Não foi possível registrar o retorno'); }
};
window.cancelarEncaminhamento = async function (projectId, id, encId) {
    if (!(await confirmar('Cancelar este encaminhamento? O ponto focal não é avisado do cancelamento.', { rotulo: 'Cancelar encaminhamento', perigo: true }))) return;
    try {
        await api('PUT', `/api/v1/projects/${projectId}/titular-pedidos/${id}/encaminhamentos/${encId}`, { status: 'cancelado' });
        showToast('Encaminhamento cancelado.', 'success');
        await carregarEncaminhamentos(projectId, id, true, ['recebido', 'em_andamento'].includes(pedidoAberto?.status));
    } catch (e) { falha(e, 'Não foi possível cancelar o encaminhamento'); }
};

// Tratativas do atendimento: o histórico de passos (comunicação, encaminhamento, evidência, nota). Quem registra o pedido também as registra.
async function carregarTratativas(projectId, id, editar) {
    const box = el('pt-tratativas-box');
    if (!box) return;
    let ts = [];
    try { ts = lista(await api('GET', `/api/v1/projects/${projectId}/titular-pedidos/${id}/tratativas`)); } catch (e) { box.innerHTML = '<p class="at-nota">Não foi possível carregar as tratativas.</p>'; return; }
    const linhas = ts.length ? `<ul class="et-lista">${ts.map((t) => `<li class="et-linha"><span><strong>${escapeHTML(TIPOS_TRATATIVA[t.tipo] || t.tipo)}</strong> · ${dia(t.created_at)}<br>${escapeHTML(t.texto)}</span></li>`).join('')}</ul>`
        : '<p class="at-nota">Nenhuma tratativa registrada. Registre aqui a comunicação com o titular, o encaminhamento ao ponto focal e as evidências recebidas.</p>';
    const form = editar ? `<div class="form-group mt-2"><label class="form-label" for="pt-trat-tipo">Nova tratativa</label>
            <select class="form-input" id="pt-trat-tipo">${opcoes(TIPOS_TRATATIVA)}</select></div>
        <div class="form-group"><textarea class="form-input" id="pt-trat-texto" rows="3" maxlength="5000" aria-label="Texto da tratativa"></textarea></div>
        <button class="btn btn-sm" data-action="salvarTratativa" data-args='${args(projectId, id)}'>Registrar tratativa</button>` : '';
    box.innerHTML = `<h4 style="margin:0 0 0.5rem">Tratativas do atendimento</h4>${linhas}${form}`;
}

window.salvarTratativa = async function (projectId, id) {
    const texto = el('pt-trat-texto').value.trim();
    if (!texto) { showToast('Escreva o texto da tratativa.', 'error'); return; }
    try {
        await api('POST', `/api/v1/projects/${projectId}/titular-pedidos/${id}/tratativas`, { tipo: el('pt-trat-tipo').value, texto });
        await carregarTratativas(projectId, id, true);
        showToast('Tratativa registrada.', 'success');
    } catch (e) { falha(e, 'Não foi possível registrar a tratativa'); }
};

// ─── Portal público: o link que o cliente publica (migration 0096) ─────────────────────────────────
window.abrirPortalTitular = async function (projectId) {
    let p;
    try { p = await api('GET', `/api/v1/projects/${projectId}/titular-portal`); } catch (e) { falha(e, 'Não foi possível abrir o portal'); return; }
    openModal(`<h3>Link do portal de solicitações</h3>
        <p>Gere um link para o cliente publicar no site ou app. O titular abre a solicitação por ele e recebe um número de protocolo; as solicitações entram aqui, em Solicitações.</p>
        <p id="pt-portal-estado">${p.ativo ? 'Portal ativo. O link aparece só ao gerar; gere de novo para um link novo (o anterior deixa de valer).' : 'Portal desativado. Gere o link para ativar.'}</p>
        <div id="pt-portal-link" class="mt-3 mb-3"></div>
        <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-primary" data-action="gerarPortalTitular" data-args='${args(projectId, !!p.ativo)}'>${p.ativo ? 'Gerar novo link' : 'Gerar link'}</button>
            ${p.ativo ? `<button class="btn" data-action="desativarPortalTitular" data-args='${args(projectId)}'>Desativar</button>` : ''}
        </div>`);
};

window.gerarPortalTitular = async function (projectId, ativo) {
    // Regerar invalida o link que o cliente já publicou: confirmar antes (regra de design — destrutivo pede confirmação).
    if (ativo && !(await confirmar('O link que o cliente já publicou deixará de valer. Gerar um novo?', { rotulo: 'Gerar novo link', perigo: true }))) return;
    try {
        const r = await api('POST', `/api/v1/projects/${projectId}/titular-portal`);
        const box = el('pt-portal-link');
        if (box) box.innerHTML = `<label class="form-label" for="pt-portal-url">Link (copie agora; ele não é mostrado de novo)</label>
            <div class="d-flex gap-2"><input class="form-input" id="pt-portal-url" readonly value="${escapeHTML(r.url)}">
            <button class="btn" data-action="copiarLinkPortal">Copiar</button></div>`;
        const campo = el('pt-portal-url');
        if (campo) { campo.focus(); campo.select(); }
        const estado = el('pt-portal-estado');
        if (estado) estado.textContent = 'Portal ativo. Copie o link abaixo; ele não é mostrado de novo.';
        showToast('Link gerado.', 'success');
    } catch (e) { falha(e, 'Não foi possível gerar o link'); }
};

window.copiarLinkPortal = async function () {
    const campo = el('pt-portal-url');
    try { await navigator.clipboard.writeText(campo.value); showToast('Link copiado.', 'success'); } catch (e) { campo.select(); showToast('Não deu para copiar sozinho: o link está selecionado, use Ctrl+C.', 'error'); }
};

window.desativarPortalTitular = async function (projectId) {
    if (!(await confirmar('Desativar o portal interrompe a recepção de novas solicitações pelo link publicado. Continuar?', { rotulo: 'Desativar', perigo: true }))) return;
    try {
        await api('POST', `/api/v1/projects/${projectId}/titular-portal/desativar`);
        showToast('Portal desativado.', 'success');
        forceCloseModal();
    } catch (e) { falha(e, 'Não foi possível desativar o portal'); }
};

// ─── Canal do titular (migration 0117, spec 2026-11-19): por onde o titular fala com a empresa e onde isso está publicado ──────
// Grava quem registra os pedidos (`podeRegistrar`, o espelho de `podeGerirPortal` do servidor); os demais leem. A regra é do servidor
// (recusa o link do portal, carimba a conferência): aqui só se mostra e se chama.
const CAMPOS_CANAL = [['email', 'E-mail do canal', 'email', 200], ['telefone', 'Telefone', 'tel', 40],
    ['formulario_url', 'Página do formulário (https://)', 'url', 500], ['divulgacao_url', 'Página de divulgação (https://)', 'url', 500]];

window.abrirCanalTitular = async function (projectId) {
    const grava = podeRegistrar();
    let r, partes;
    try {
        [r, partes] = await Promise.all([
            api('GET', `/api/v1/projects/${projectId}/titular-canal`),
            // Secundário: sem a lista de pessoas, o responsável fica "Ninguém indicado".
            grava ? api('GET', `/api/v1/projects/${projectId}/partes?tipo=pessoa&status=ativa`).catch(() => []) : [],
        ]);
    } catch (e) { falha(e, 'Não foi possível abrir o canal do titular'); return; }
    const c = (r && r.canal) || {};
    const portal = r && r.portal_ativo
        ? '<p id="tc-portal" class="tc-dica">O portal de solicitações do n.360 está ativo e já conta como formulário. Não cole o link dele aqui: o link é a chave de acesso do formulário.</p>' : '';
    const conferido = `<p id="tc-conferido">${c.conferido_em ? `Página de divulgação conferida em ${escapeHTML(dia(c.conferido_em))}.` : 'Página de divulgação nunca conferida.'}</p>`;
    if (!grava) {
        const valor = (v) => (v ? escapeHTML(v) : '<span class="pn-falta">Não informado</span>');
        openModal(`<h3>Canal do titular</h3>${portal}
            <dl class="tc-leitura">${CAMPOS_CANAL.map(([k, rotulo]) => `<dt>${escapeHTML(rotulo)}</dt><dd>${valor(c[k])}</dd>`).join('')}
                <dt>Responsável</dt><dd>${valor(c.responsavel_nome)}</dd></dl>${conferido}`);
        return;
    }
    const pessoas = lista(partes).map((p) => `<option value="${escapeHTML(p.id)}"${p.id === c.responsavel_parte_id ? ' selected' : ''}>${escapeHTML(p.nome)}</option>`).join('');
    openModal(`<h3>Canal do titular</h3>
        <p id="tc-dica" class="tc-dica">Basta um meio. Use uma caixa institucional (por exemplo, privacidade@empresa.com.br), não o e-mail pessoal do encarregado. A página de divulgação é onde o canal e o encarregado aparecem para o público, no site da empresa.</p>
        ${portal}
        ${CAMPOS_CANAL.map(([k, rotulo, tipo, max]) => `<div class="form-group"><label class="form-label" for="tc-${k}">${escapeHTML(rotulo)}</label>
            <input class="form-input" id="tc-${k}" type="${tipo}" maxlength="${max}" aria-describedby="tc-dica" value="${escapeHTML(c[k] || '')}"></div>`).join('')}
        <div class="form-group"><label class="form-label" for="tc-resp">Responsável (opcional)</label>
            <select class="form-input" id="tc-resp"><option value="">Ninguém indicado</option>${pessoas}</select></div>
        ${conferido}
        <div class="form-group"><input type="checkbox" id="tc-conferir"> <label for="tc-conferir">Conferi a página de divulgação hoje</label></div>
        <button class="btn btn-primary" data-action="salvarCanalTitular" data-args='${args(projectId)}'>Salvar</button>`);
};

window.salvarCanalTitular = (projectId) => semRepetir('salvarCanalTitular', async () => {
    const corpo = { email: valorOuNulo('tc-email'), telefone: valorOuNulo('tc-telefone'), formulario_url: valorOuNulo('tc-formulario_url'),
        divulgacao_url: valorOuNulo('tc-divulgacao_url'), responsavel_parte_id: el('tc-resp').value || null, ...(el('tc-conferir').checked ? { conferir: true } : {}) };
    try {
        await api('PUT', `/api/v1/projects/${projectId}/titular-canal`, corpo);
        // O painel guardado deste projeto já não vale: o canal entra no passo 1 da trilha e no "O que fazer" (padrão de encarregado.js).
        if (S.painel) for (const k of Object.keys(S.painel)) if (k.split('|')[1] === projectId) delete S.painel[k];
        showToast('Canal do titular salvo.', 'success');
        forceCloseModal();
    } catch (e) { falha(e, 'Não foi possível salvar o canal do titular'); }
});

// Busca e eliminação pelo contato do pedido. A regra é do servidor (/data-subject: busca por igualdade, anonimização, trilha).
let pedidoAberto = null;
const painelDados = (html) => { el('pt-dados').innerHTML = html; };
// O contato vem do pedido do `id` recebido: se a janela aberta é de outro pedido, relê este (senão eliminaria outra pessoa).
async function pedidoDo(projectId, id) {
    if (!pedidoAberto || pedidoAberto.id !== id) pedidoAberto = await api('GET', `/api/v1/projects/${projectId}/titular-pedidos/${id}`);
    return pedidoAberto;
}

window.localizarDadosDoTitular = async function (projectId, id) {
    try {
        const p = await pedidoDo(projectId, id);
        const r = await api('GET', `/api/v1/projects/${projectId}/data-subject?identificador=${encodeURIComponent(p.titular_contato)}`);
        painelDados(r.encontrado
            ? `<p>${escapeHTML(String(r.total_registros))} registro(s) em ${escapeHTML(String(lista(r.ocorrencias).length))} tabela(s): ${lista(r.ocorrencias).map((o) => escapeHTML(o.tabela)).join(', ')}.</p>`
            : window.renderEmptyState({ titulo: 'Nenhum registro encontrado para este contato neste projeto.', compacto: true }));
    } catch (e) { falha(e, 'Não foi possível localizar os dados'); }
};

// Confirmação na própria janela (o app não usa confirm()).
window.eliminarDadosDoTitular = async function (projectId, id) {
    let p;
    try { p = await pedidoDo(projectId, id); } catch (e) { falha(e, 'Não foi possível abrir o pedido'); return; }
    painelDados(`<p>Os dados pessoais de ${escapeHTML(p.titular_contato)} serão anonimizados neste projeto; os registros permanecem sem o dado pessoal. A ação não se desfaz.</p>
        <div class="form-group"><label class="form-label" for="pt-elim-just">Justificativa</label><input class="form-input" id="pt-elim-just" maxlength="2000" value="${escapeHTML(`Pedido ${p.protocolo}`)}"></div>
        <button class="btn btn-primary btn-sm" data-action="confirmarEliminacaoTitular" data-args='${args(projectId, id)}'>Confirmar eliminação</button>`);
};

window.confirmarEliminacaoTitular = async function (projectId, id) {
    const justificativa = valorOuNulo('pt-elim-just');
    if (!justificativa) { showToast('Informe a justificativa', 'error'); return; }
    try {
        const p = await pedidoDo(projectId, id);
        const r = await api('POST', `/api/v1/projects/${projectId}/data-subject/erase`, { identificador: p.titular_contato, justificativa, pedido_id: id });
        painelDados(`<p>${escapeHTML(String(r.total))} registro(s) anonimizado(s). Registrado na trilha de auditoria.</p>`);
        showToast('Dados do titular anonimizados.', 'success');
    } catch (e) { falha(e, 'Não foi possível eliminar os dados'); }
};

// O rascunho fica numa caixa à parte; "Usar na resposta" copia para o campo Resposta, e enviar continua sendo o Salvar (PUT).
window.rascunhoRespostaTitular = async function (projectId, id) {
    let r;
    try { r = await api('POST', `/api/v1/projects/${projectId}/titular-pedidos/${id}/rascunho`); } catch (e) { falha(e, 'Não foi possível gerar o rascunho'); return; }
    el('pt-rascunho').innerHTML = caixaRascunho('pt-rascunho-texto', r.texto)
        + (el('pt-resp') ? '<button class="btn btn-sm" style="margin-top:0.5rem" data-action="usarRascunhoTitular">Usar na resposta</button>' : '');
};

window.usarRascunhoTitular = function () { el('pt-resp').value = el('pt-rascunho-texto').value; };

window.salvarPedidoTitular = async (projectId, id) => {
    // Identidade é só registro (spec 2026-11-06): responder sem a conferência pede confirmação, mas não trava.
    if (el('pt-status').value === 'respondido' && pedidoAberto && pedidoAberto.id === id && pedidoAberto.status !== 'respondido' && !pedidoAberto.identidade_metodo
        && !(await confirmar('Identidade não conferida. Responder mesmo assim?', { rotulo: 'Responder' }))) return;
    return acao(
    () => api('PUT', `/api/v1/projects/${projectId}/titular-pedidos/${id}`, { status: el('pt-status').value, resposta_texto: el('pt-resp').disabled ? undefined : valorOuNulo('pt-resp') }),
    'Não foi possível salvar o pedido', 'Pedido atualizado.', () => window.abrirPedidoTitular(projectId, id));
};

// ─── Incidentes ───────────────────────────────────────────────────────────────────────────────────
window.abrirNovoIncidente = function (projectId) {
    openModal(`<h3>Registrar incidente</h3>
        <div class="form-group"><label class="form-label" for="in-titulo">Título</label><input class="form-input" id="in-titulo" maxlength="500"></div>
        <div class="form-group"><label class="form-label" for="in-desc">Descrição</label><textarea class="form-input" id="in-desc" rows="3" maxlength="5000"></textarea></div>
        <div class="form-group"><label class="form-label" for="in-ocorrido">Ocorreu em (opcional)</label><input class="form-input" id="in-ocorrido" type="date"></div>
        <div class="form-group"><label class="form-label" for="in-ciencia">Ciência em (de onde contam os prazos)</label><input class="form-input" id="in-ciencia" type="date"></div>
        <button class="btn btn-primary" data-action="salvarNovoIncidente" data-args='${args(projectId)}'>Registrar</button>`);
};

window.salvarNovoIncidente = function (projectId) {
    const titulo = valorOuNulo('in-titulo'); const ciencia = el('in-ciencia').value;
    if (!titulo || !ciencia) { showToast('Informe o título e a data da ciência', 'error'); return; }
    // Depois de registrar, a janela vira o próprio incidente: o prazo da ANPD fica na faixa do topo, não num aviso que some.
    let novoId = null;
    return acao(async () => {
        const r = await api('POST', `/api/v1/projects/${projectId}/incidentes`, { titulo, descricao: valorOuNulo('in-desc'), ocorrido_em: el('in-ocorrido').value || null, ciencia_em: ciencia });
        novoId = r.id;
        showToast(`Incidente ${r.protocolo} registrado. ${r.prazo_anpd_em ? `Prazo ANPD: ${dia(r.prazo_anpd_em)}.` : 'Prazos não calculados (cadastre os prazos legais).'}`, 'success');
    }, 'Não foi possível registrar o incidente', null, () => (novoId ? window.abrirIncidente(projectId, novoId) : forceCloseModal()));
};

const diaMes = (s) => (s ? `${String(s).slice(8, 10)}/${String(s).slice(5, 7)}` : '—');
// Dias úteis (seg. a sex.) depois de hoje até o prazo, inclusive. ponytail: sem feriados; a contagem oficial é a do servidor.
function diasUteisAte(prazo) {
    const fim = new Date(`${String(prazo).slice(0, 10)}T00:00:00Z`);
    const d = new Date(`${hojeSP()}T00:00:00Z`);
    let n = 0;
    while (d < fim) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() % 6 !== 0) n++; }
    return n;
}
/** Faixa fixa do topo do incidente: o prazo da ANPD em contagem, ou a confirmação de que foi comunicado. */
function faixaAnpd(i) {
    const faixa = (cor, texto) => `<div id="in-faixa-anpd" role="status" style="position:sticky; top:0; z-index:2; background:var(--surface); border:1px solid ${cor}; color:${cor.replace(/var\(--(danger|warning)\)/, 'var(--$1-ink)')}; padding:0.6rem 0.9rem; margin:0 0 1rem; font-weight:600">${escapeHTML(texto)}</div>`;
    if (i.comunicacao_anpd_em) {
        const noPrazo = !i.prazo_anpd_em || String(i.comunicacao_anpd_em).slice(0, 10) <= String(i.prazo_anpd_em).slice(0, 10);
        return faixa('var(--text-2)', `Comunicado à ANPD em ${diaMes(i.comunicacao_anpd_em)}, ${noPrazo ? 'dentro do prazo' : 'fora do prazo'}.`);
    }
    if (i.status === 'encerrado' || i.risco_titular === 'sem_risco') return '';
    if (!i.prazo_anpd_em) return faixa('var(--warning)', 'Prazo da ANPD não calculado: cadastre os prazos legais.');
    // A data do prazo também decide (o servidor pode ainda dizer "no_prazo" no dia): nunca "faltam 0 dias úteis".
    const hoje = hojeSP(), prazo = String(i.prazo_anpd_em).slice(0, 10);
    if (i.situacao_anpd === 'atrasado' || prazo < hoje) return faixa('var(--danger)', `Comunicação à ANPD atrasada: o prazo era ${diaMes(i.prazo_anpd_em)}.`);
    if (i.situacao_anpd === 'vence_hoje' || prazo === hoje) return faixa('var(--danger)', `Comunicar à ANPD até hoje, ${diaMes(i.prazo_anpd_em)}.`);
    const n = diasUteisAte(i.prazo_anpd_em);
    return faixa(n <= 1 ? 'var(--danger)' : 'var(--warning)', `Comunicar à ANPD até ${diaMes(i.prazo_anpd_em)} (${n === 0 ? 'nenhum dia útil antes do prazo' : n === 1 ? 'falta 1 dia útil' : `faltam ${n} dias úteis`})`);
}

// ─── Ficha do incidente (fatia 3): página com abas, no molde da do RIPD, com o incidente e a aba no endereço
// (`?tela=incidente-ficha&incidente=<id>&aba=<aba>`). O post mortem (fatia 5) é a aba antes do Histórico.
const ABAS_INC = [['registro', 'Registro'], ['analise', 'Análise'], ['acoes', 'Ações corretivas'], ['comunicacao', 'Comunicação'], ['postmortem', 'Post mortem'], ['historico', 'Histórico']];
const incidenteDoEndereco = () => new URLSearchParams(window.location.search).get('incidente') || (S.incidente && S.incidente.id);
const abaIncDoEndereco = () => {
    const a = new URLSearchParams(window.location.search).get('aba');
    return ABAS_INC.some(([x]) => x === a) ? a : 'registro';
};
function gravarIncidenteNoEndereco(id, aba) {
    const u = new URL(window.location.href);
    u.searchParams.set('tela', 'incidente-ficha');
    u.searchParams.set('incidente', id);
    u.searchParams.set('aba', aba);
    window.history.replaceState(null, '', u);
}

window.abrirIncidente = function (projectId, id, aba = abaIncDoEndereco()) {
    if (typeof forceCloseModal === 'function') forceCloseModal();
    S.incidente = { projectId, id };
    gravarIncidenteNoEndereco(id, ABAS_INC.some(([x]) => x === aba) ? aba : 'registro');
    navigate('incidente-ficha');
};
window.incidenteVoltar = function () {
    S.incidente = null;
    limparFichaDoEndereco();
    S.titularAba = 'incidentes';
    navigate('titular');
};

let fichaInc = null;
let seqInc = 0;
const repintarIncidente = () => (fichaInc ? window.renderIncidenteFicha(fichaInc.c, fichaInc.h, fichaInc.a) : undefined);

function painelRegistro(i, projectId, id, editar, encerrar, semRisco) {
    return `<p id="in-prazos">Ciência em ${dia(i.ciencia_em)}. ANPD: ${selo(i.situacao_anpd)} (${(i.prazo_anpd_em ? dia(i.prazo_anpd_em) : 'prazo não calculado')}) · Titular: ${selo(i.situacao_titular)} (${(i.prazo_titular_em ? dia(i.prazo_titular_em) : 'prazo não calculado')}).</p>
        <p id="in-status">Status: ${escapeHTML(STATUS_INCIDENTE[i.status] || i.status)} · Risco ao titular: ${escapeHTML(RISCOS[i.risco_titular] || 'não avaliado')}</p>
        ${i.descricao ? `<p class="at-nota">${escapeHTML(i.descricao)}</p>` : ''}
        ${blocoRegistroIncidente(i)}
        ${editar ? `<button class="btn btn-ghost btn-sm" data-action="editarIncidente" data-args='${args(projectId, id)}'>Editar registro</button>` : ''}
        <h4 class="mt-4 mb-2">Evidências</h4><div id="in-anexos"></div>
        ${editar ? `<h4 class="mt-4 mb-2">Avaliar o risco</h4>
            <div class="form-group"><select class="form-input" id="in-risco" aria-label="Risco ao titular">${opcoes(RISCOS, i.risco_titular)}</select></div>
            <div class="form-group"><textarea class="form-input" id="in-aval" rows="2" maxlength="5000" placeholder="Justificativa">${escapeHTML(i.avaliacao_texto || '')}</textarea></div>
            <button class="btn btn-sm" data-action="avaliarRiscoIncidente" data-args='${args(projectId, id)}'>Salvar avaliação</button>` : ''}
        ${encerrar ? `<div class="mt-4"><div id="in-encerrar"></div>
            <button class="btn btn-ghost btn-sm" data-action="pedirEncerramentoIncidente" data-args='${args(projectId, id, !!i.comunicacao_anpd_em || semRisco, i.risco_titular || null)}'>Encerrar incidente</button></div>` : ''}
        ${vinculoOtHTML(projectId)}`;
}

function painelComunicacao(i, projectId, id, editar, semRisco) {
    // A ação primária é a próxima comunicação devida; sem risco ao titular não há comunicação devida (nem à ANPD).
    const proxima = semRisco ? null : !i.comunicacao_anpd_em ? 'anpd' : !i.comunicacao_titular_em ? 'titular' : null;
    const comunicar = (destino, rotulo) => `<button class="btn ${proxima === destino ? 'btn-primary' : ''} btn-sm" data-action="registrarComunicacaoIncidente" data-args='${args(projectId, id, destino)}'>${rotulo}</button>`;
    const feitas = `<ul class="at-lista">
        <li><strong>ANPD:</strong> ${i.comunicacao_anpd_em ? `${escapeHTML(i.anpd_protocolo_interno || '')}, enviada em ${dia(i.comunicacao_anpd_em)}${i.anpd_canal ? ` · ${escapeHTML(CANAIS_ANPD[i.anpd_canal] || i.anpd_canal)}` : ''}${i.anpd_protocolo ? ` · protocolo ${escapeHTML(i.anpd_protocolo)}` : ''}` : 'não registrada'}</li>
        <li><strong>Titular:</strong> ${i.comunicacao_titular_em ? `enviada em ${dia(i.comunicacao_titular_em)}` : 'não registrada'}</li></ul>`;
    return `${feitas}
        ${editar && !(i.comunicacao_anpd_em && i.comunicacao_titular_em) ? `<div class="form-group"><label class="form-label" for="in-com-data">Data da comunicação</label>
                <input class="form-input" id="in-com-data" type="date" max="${hojeSP()}" value="${hojeSP()}"></div>
            ${i.comunicacao_anpd_em ? '' : `<div class="at-linha-form"><div class="form-group"><label class="form-label" for="in-com-canal">Canal da comunicação à ANPD</label>
                <select class="form-input" id="in-com-canal"><option value="">Não informado</option>${opcoes(CANAIS_ANPD)}</select></div>
                <div class="form-group"><label class="form-label" for="in-com-prot">Nº do protocolo na ANPD (opcional)</label><input class="form-input" id="in-com-prot" maxlength="100"></div></div>`}
            <div class="d-flex gap-2 flex-wrap">
                ${i.comunicacao_anpd_em ? '' : comunicar('anpd', 'Registrei a comunicação à ANPD')}
                ${i.comunicacao_titular_em ? '' : comunicar('titular', 'Registrei a comunicação ao titular')}
            </div>` : ''}
        ${podeRascunho() ? `<h4 class="mt-4 mb-2">Rascunho da comunicação</h4>
            <div class="d-flex gap-2 flex-wrap">
                <button class="btn btn-sm" data-action="rascunhoComunicacaoIncidente" data-args='${args(projectId, id, 'anpd')}'>Rascunho para a ANPD</button>
                <button class="btn btn-sm" data-action="rascunhoComunicacaoIncidente" data-args='${args(projectId, id, 'titular')}'>Rascunho para o titular</button>
            </div><div id="in-rascunho" class="mt-3"></div>` : ''}`;
}

async function renderIncidenteFicha(c, h, a) {
    fichaInc = { c, h, a };
    const voltar = '<button type="button" class="btn" data-action="incidenteVoltar">Voltar aos incidentes</button>';
    a.innerHTML = voltar;
    const id = incidenteDoEndereco();
    const projectId = (S.incidente && S.incidente.id === id && S.incidente.projectId) || (projetoAtivo() || {}).id;
    if (!id || !projectId) {
        h.textContent = 'Incidente';
        c.innerHTML = window.renderEmptyState({ titulo: 'Nenhum incidente aberto', texto: 'Abra um incidente pela lista.', acao: voltar });
        return;
    }
    const minha = ++seqInc;
    let i;
    try { i = await api('GET', `/api/v1/projects/${projectId}/incidentes/${id}`); }
    catch (e) { if (minha === seqInc) { h.textContent = 'Incidente'; c.innerHTML = window.renderEmptyState({ titulo: 'Não foi possível abrir o incidente', texto: (e && e.message) || '', acao: voltar }); } return; }
    if (minha !== seqInc) return;
    a.innerHTML = `${voltar} <button type="button" class="btn" data-action="baixarIncidenteWord" data-args='${args(projectId, id)}'>Baixar em Word</button>`;
    const aba = abaIncDoEndereco();
    const editar = podeRegistrar() && i.status !== 'encerrado';
    const encerrar = podeEditar() && i.status !== 'encerrado';
    const semRisco = i.risco_titular === 'sem_risco';
    h.textContent = `${i.protocolo} — ${i.titulo}`;
    const corpo = aba === 'registro' ? painelRegistro(i, projectId, id, editar, encerrar, semRisco)
        : aba === 'comunicacao' ? painelComunicacao(i, projectId, id, editar, semRisco)
        : aba === 'analise' ? '<div id="in-analises"></div>'
        : aba === 'acoes' ? '<div id="in-acoes"></div>'
        : aba === 'postmortem' ? '<div id="in-postmortem"></div>'
        : '<div id="in-historico"></div>';
    c.innerHTML = `<div class="tc">${faixaAnpd(i)}
        <div class="at-abas" role="tablist" aria-label="Abas do incidente">${ABAS_INC.map(([x, r]) =>
            `<button type="button" role="tab" class="at-aba" id="in-aba-${x}" aria-controls="in-painel" aria-selected="${x === aba}" tabindex="${x === aba ? 0 : -1}"
                data-action="incidenteIrParaAba" data-action-keydown="incidenteTeclaAba" data-arg-event data-args='${args(x)}'>${escapeHTML(r)}</button>`).join('')}</div>
        <div role="tabpanel" class="tc-painel" id="in-painel" aria-labelledby="in-aba-${aba}" tabindex="0">${corpo}</div></div>`;
    if (aba === 'registro') carregarAnexosIncidente(projectId, id, editar);
    if (aba === 'registro') montarVinculoOt('incidente', id, projectId);
    // A ação segue depois do encerramento (a correção costuma vir depois): quem registra o incidente cuida dela.
    if (aba === 'acoes') carregarAcoesIncidente(projectId, id, podeRegistrar());
    if (aba === 'analise') carregarAnalises(projectId, id, editar);
    if (aba === 'postmortem') carregarPostmortem(projectId, id, podeRegistrar());
    if (aba === 'historico') carregarHistorico(projectId, id);
}
window.renderIncidenteFicha = renderIncidenteFicha;

async function irParaAbaInc(aba) {
    const id = incidenteDoEndereco();
    if (!id) return;
    gravarIncidenteNoEndereco(id, aba);
    await repintarIncidente();
    const b = el(`in-aba-${aba}`);
    if (b) b.focus();
}
window.incidenteIrParaAba = (_e, aba) => irParaAbaInc(aba);
window.incidenteTeclaAba = function (e, atual) {
    const k = ABAS_INC.findIndex(([x]) => x === atual);
    const n = ABAS_INC.length;
    const prox = { ArrowRight: (k + 1) % n, ArrowLeft: (k + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (prox === undefined) return;
    e.preventDefault();
    return irParaAbaInc(ABAS_INC[prox][0]);
};

// Análises (fatia 3): várias, cada uma com autor e data; só o autor altera a sua; encerrado não muda.
async function carregarAnalises(projectId, id, editar) {
    const box = el('in-analises');
    if (!box) return;
    let l = [];
    try { l = lista((await api('GET', `/api/v1/projects/${projectId}/incidentes/${id}/analises`)).analises); } catch (e) { box.innerHTML = '<p class="at-nota">Não foi possível carregar as análises.</p>'; return; }
    box.innerHTML = `<p class="at-nota">A análise é o registro do trabalho da equipe; a avaliação formal do risco ao titular fica no Registro.</p>
        ${l.length ? `<ul class="at-lista-itens">${l.map((x) => `<li class="at-log"><p class="at-nota">${escapeHTML(x.autor_nome || x.autor)} · ${formatarData(x.created_at, { hora: true })}${x.updated_at && x.updated_at !== x.created_at ? ' (alterada)' : ''}</p>
            ${x.pode_editar ? `<textarea class="form-input" id="in-an-${escapeHTML(x.id)}" rows="4" maxlength="10000" aria-label="Sua análise">${escapeHTML(x.texto)}</textarea>
                <button class="btn btn-sm mt-2" data-action="salvarAnaliseIncidente" data-args='${args(projectId, id, x.id)}'>Salvar alteração</button>`
                : `<p class="at-log-linha">${escapeHTML(x.texto)}</p>`}</li>`).join('')}</ul>` : '<p class="at-nota">Nenhuma análise.</p>'}
        ${editar ? `<div class="form-group mt-3"><label class="form-label" for="in-an-nova">Nova análise</label><textarea class="form-input" id="in-an-nova" rows="4" maxlength="10000"></textarea></div>
            <button class="btn btn-sm" data-action="salvarAnaliseIncidente" data-args='${args(projectId, id, null)}'>Registrar análise</button>` : ''}`;
}
window.salvarAnaliseIncidente = async function (projectId, id, analiseId) {
    const campo = el(analiseId ? `in-an-${analiseId}` : 'in-an-nova');
    const texto = (campo && campo.value || '').trim();
    if (!texto) { showToast('Escreva a análise.', 'error'); return; }
    try {
        if (analiseId) await api('PUT', `/api/v1/projects/${projectId}/incidentes/${id}/analises/${analiseId}`, { texto });
        else await api('POST', `/api/v1/projects/${projectId}/incidentes/${id}/analises`, { texto });
        showToast(analiseId ? 'Análise alterada.' : 'Análise registrada.', 'success');
        await carregarAnalises(projectId, id, true);
    } catch (e) { falha(e, 'Não foi possível salvar a análise'); }
};

// Post mortem (fatia 5): as 14 perguntas do legado, só depois do encerramento; responder não reabre o incidente.
async function carregarPostmortem(projectId, id, editar) {
    const box = el('in-postmortem');
    if (!box) return;
    let r;
    try { r = await api('GET', `/api/v1/projects/${projectId}/incidentes/${id}/postmortem`); } catch (e) { box.innerHTML = '<p class="at-nota">Não foi possível carregar o post mortem.</p>'; return; }
    if (!r.aberto) { box.innerHTML = '<p class="at-nota">O post mortem (análise de causa raiz) abre depois do encerramento do incidente.</p>'; return; }
    const perguntas = lista(r.perguntas);
    box.innerHTML = `<p class="at-nota">Análise de causa raiz. Responder não reabre o incidente.</p>
        <ol class="at-lista-itens">${perguntas.map((p) => `<li class="form-group"><label class="form-label" for="in-pm-${escapeHTML(p.id)}">${escapeHTML(p.texto)}</label>
            ${editar ? `<textarea class="form-input" id="in-pm-${escapeHTML(p.id)}" data-pergunta="${escapeHTML(p.id)}" rows="3" maxlength="5000">${escapeHTML(p.resposta || '')}</textarea>`
                : `<p class="at-log-linha" id="in-pm-${escapeHTML(p.id)}">${p.resposta ? escapeHTML(p.resposta) : 'Sem resposta.'}</p>`}</li>`).join('')}</ol>
        ${editar ? `<button class="btn btn-sm" data-action="salvarPostmortemIncidente" data-args='${args(projectId, id)}'>Salvar post mortem</button>` : ''}`;
}
window.salvarPostmortemIncidente = async function (projectId, id) {
    const respostas = {};
    document.querySelectorAll('#in-postmortem textarea[data-pergunta]').forEach((t) => { respostas[t.dataset.pergunta] = t.value.trim() || null; });
    try {
        await api('PUT', `/api/v1/projects/${projectId}/incidentes/${id}/postmortem`, { respostas });
        showToast('Post mortem salvo.', 'success');
        await carregarPostmortem(projectId, id, true);
    } catch (e) { falha(e, 'Não foi possível salvar o post mortem'); }
};

// Histórico (fatia 3): a trilha do incidente, sem texto livre; exporta em CSV.
async function carregarHistorico(projectId, id) {
    const box = el('in-historico');
    if (!box) return;
    let l = [];
    try { l = lista((await api('GET', `/api/v1/projects/${projectId}/incidentes/${id}/historico`)).historico); } catch (e) { box.innerHTML = '<p class="at-nota">Não foi possível carregar o histórico.</p>'; return; }
    box.innerHTML = `<div class="at-acoes"><button class="btn btn-sm" data-action="exportarHistoricoIncidente" data-args='${args(projectId, id)}'>Exportar CSV</button></div>
        ${l.length ? `<ul class="at-lista-itens">${l.map((x) => `<li class="at-log"><p class="at-log-linha">${escapeHTML(x.evento)}${x.detalhe ? `: ${escapeHTML(x.detalhe)}` : ''}</p>
            <p class="at-nota">${escapeHTML(x.nome || '')} · ${formatarData(x.data, { hora: true })}</p></li>`).join('')}</ul>`
        : '<p class="at-nota">Nenhum registro ainda. Registro, alterações, análises, ações, comunicações e encerramento passam a aparecer aqui.</p>'}`;
}
window.baixarIncidenteWord = (projectId, id) => baixarArquivo(`/api/v1/projects/${projectId}/incidentes/${id}/docx`).catch((e) => falha(e, 'Não foi possível gerar o Word'));
window.exportarHistoricoIncidente = (projectId, id) => baixarArquivo(`/api/v1/projects/${projectId}/incidentes/${id}/historico/csv`).catch((e) => falha(e, 'Não foi possível exportar o histórico'));

// Confirmação na própria janela (o app não usa confirm()). Sem a comunicação à ANPD (e com risco), a pergunta diz isso.
window.pedirEncerramentoIncidente = function (projectId, id, semPendenciaAnpd, risco) {
    // O servidor recusa nesses dois casos: dizer o que falta, sem oferecer um "encerrar mesmo assim" que não funciona.
    const impede = !risco ? 'Avalie o risco ao titular antes de encerrar.'
        : risco === 'relevante' && !semPendenciaAnpd ? 'Com risco relevante, o incidente só encerra depois de registrada a comunicação à ANPD.' : null;
    if (impede) { el('in-encerrar').innerHTML = `<p style="color:var(--warning-ink)">${impede}</p>`; return; }
    el('in-encerrar').innerHTML = `<p style="color:${semPendenciaAnpd ? 'var(--text)' : 'var(--warning-ink)'}">${semPendenciaAnpd
        ? 'Encerrar o incidente? Depois de encerrado, ele não recebe mais avaliação nem comunicação.'
        : 'A ANPD ainda não foi comunicada. Encerrar mesmo assim?'}</p>
        <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem">
            <button class="btn btn-sm" style="color:var(--danger-ink)" data-action="encerrarIncidente" data-args='${args(projectId, id)}'>Confirmar encerramento</button>
            <button class="btn btn-ghost btn-sm" data-action="cancelarEncerramentoIncidente">Cancelar</button>
        </div>`;
};
window.cancelarEncerramentoIncidente = function () { el('in-encerrar').innerHTML = ''; };

// Ações corretivas do incidente (fatia 4): a mesma ação da CAPA do n.iso, ligada ao incidente, nos dois módulos. Nada nasce sozinho.
async function carregarAcoesIncidente(projectId, id, editar) {
    const box = el('in-acoes');
    if (!box) return;
    let l = [];
    try { l = lista((await api('GET', `/api/v1/projects/${projectId}/incidentes/${id}/acoes`)).acoes); } catch (e) { box.innerHTML = '<p class="at-nota">Não foi possível carregar as ações.</p>'; return; }
    const detalhe = (a) => [TRATAMENTOS_ACAO[a.tratamento] || 'tratamento não informado', rotuloDe('acao', a.status),
        a.due_date ? `prazo ${dia(a.due_date)}` : 'sem prazo', a.assigned_to_parte_nome || 'sem responsável'].map(escapeHTML).join(' · ');
    box.innerHTML = `${l.length ? `<ul class="at-lista">${l.map((a) => `<li><span><strong>${escapeHTML(a.protocolo)}</strong> ${escapeHTML(a.title)}<br><span class="t-dim">${detalhe(a)}</span></span>
            ${editar ? `<button class="btn btn-ghost btn-sm" data-action="abrirAcaoIncidente" data-args='${args(projectId, id, a.id)}' aria-label="Abrir a ação ${escapeHTML(a.protocolo)}">Abrir</button>` : ''}</li>`).join('')}</ul>`
        : '<p class="at-nota">Nenhuma ação.</p>'}
        ${editar ? `<button class="btn btn-sm mt-2" data-action="abrirAcaoIncidente" data-args='${args(projectId, id, null)}'>Nova ação</button>` : ''}`;
}

window.abrirAcaoIncidente = async function (projectId, id, acaoId) {
    const [acoes, partes] = await Promise.all([
        acaoId ? opcional(async () => (await api('GET', `/api/v1/projects/${projectId}/incidentes/${id}/acoes`)).acoes) : Promise.resolve([]),
        opcional(() => api('GET', `/api/v1/projects/${projectId}/partes?status=ativa`)),
    ]);
    const a = acaoId ? lista(acoes).find((x) => x.id === acaoId) : {};
    if (!a) { showToast('Ação não encontrada.', 'error'); return; }
    const pessoas = Object.fromEntries(lista(partes).filter((p) => p.tipo === 'pessoa').map((p) => [p.id, p.nome]));
    const sel = (idCampo, mapa, atual, vazio) => `<select class="form-input" id="${idCampo}">${vazio ? `<option value="">${vazio}</option>` : ''}${opcoes(mapa, atual)}</select>`;
    openModal(`<h3>${acaoId ? `${escapeHTML(a.protocolo)}: ação corretiva` : 'Nova ação corretiva'}</h3>
        <div class="form-group"><label class="form-label" for="in-ac-titulo">Título (obrigatório)</label><input class="form-input" id="in-ac-titulo" maxlength="500" value="${escapeHTML(a.title || '')}"></div>
        <div class="form-group"><label class="form-label" for="in-ac-desc">Descrição</label><textarea class="form-input" id="in-ac-desc" rows="3" maxlength="5000">${escapeHTML(a.description || '')}</textarea></div>
        <div class="form-group"><label class="form-label" for="in-ac-trat">Tratamento</label>${sel('in-ac-trat', TRATAMENTOS_ACAO, a.tratamento, 'Não informado')}</div>
        <div class="form-group"><label class="form-label" for="in-ac-resp">Responsável</label>${sel('in-ac-resp', pessoas, a.assigned_to_parte_id, 'Não definido')}</div>
        <div class="form-group"><label class="form-label" for="in-ac-prazo">Prazo (opcional)</label><input class="form-input" id="in-ac-prazo" type="date" value="${escapeHTML(String(a.due_date || '').slice(0, 10))}"></div>
        ${acaoId ? `<div class="form-group"><label class="form-label" for="in-ac-status">Status</label>${sel('in-ac-status', STATUS_ACAO, a.status)}</div>
            <h4 class="mt-4 mb-2">Anexos</h4><div id="in-ac-anexos"></div>` : ''}
        <div class="d-flex gap-2 mt-3"><button class="btn btn-primary" data-action="salvarAcaoIncidente" data-args='${args(projectId, id, acaoId)}'>Salvar</button>
        <button class="btn" data-action="abrirIncidente" data-args='${args(projectId, id)}'>Voltar ao incidente</button></div>`, 'modal-large');
    if (acaoId) carregarAnexosAcao(projectId, id, acaoId);
};

window.salvarAcaoIncidente = function (projectId, id, acaoId) {
    const title = valorOuNulo('in-ac-titulo');
    if (!title) { showToast('Informe o título.', 'error'); return; }
    const corpo = { title, description: valorOuNulo('in-ac-desc'), tratamento: el('in-ac-trat').value || null,
        assigned_to_parte_id: el('in-ac-resp').value || null, due_date: el('in-ac-prazo').value || null, ...(acaoId ? { status: el('in-ac-status').value } : {}) };
    return acao(() => (acaoId ? api('PUT', `/api/v1/projects/${projectId}/incidentes/${id}/acoes/${acaoId}`, corpo)
        : api('POST', `/api/v1/projects/${projectId}/incidentes/${id}/acoes`, corpo)),
        'Não foi possível salvar a ação', acaoId ? 'Ação atualizada.' : 'Ação criada.', reabrirIncidente(projectId, id));
};

async function carregarAnexosAcao(projectId, id, acaoId) {
    const box = el('in-ac-anexos');
    if (!box) return;
    let l = [];
    try { l = lista((await api('GET', `/api/v1/projects/${projectId}/incidentes/${id}/acoes/${acaoId}/anexos`)).anexos); } catch (e) { box.innerHTML = '<p class="at-nota">Não foi possível carregar os anexos.</p>'; return; }
    box.innerHTML = `${l.length ? `<ul class="at-lista">${l.map((x) => `<li><span>${escapeHTML(x.file_name)}</span>
            <span class="d-flex gap-2"><button class="btn btn-ghost btn-sm" data-action="baixarAnexoAcao" data-args='${args(projectId, id, acaoId, x.id)}'>Baixar</button>
            <button class="btn btn-ghost btn-sm" data-action="removerAnexoAcao" data-args='${args(projectId, id, acaoId, x.id)}' aria-label="Remover ${escapeHTML(x.file_name)}">Remover</button></span></li>`).join('')}</ul>`
        : '<p class="at-nota">Nenhum anexo.</p>'}
        <div class="form-group mt-2"><label class="form-label" for="in-ac-arq">Anexar (PDF ou DOC, até 5 MB)</label><input class="form-input" id="in-ac-arq" type="file" accept=".pdf,.doc,.docx"></div>
        <button class="btn btn-sm" data-action="anexarAcao" data-args='${args(projectId, id, acaoId)}'>Anexar</button>`;
}
window.anexarAcao = async function (projectId, id, acaoId) {
    const arq = el('in-ac-arq')?.files?.[0];
    if (!arq) { showToast('Escolha o arquivo.', 'error'); return; }
    const fd = new FormData();
    fd.append('file', arq);
    try {
        const r = await fetch(`${API_BASE}/api/v1/projects/${projectId}/incidentes/${id}/acoes/${acaoId}/anexos`, { method: 'POST', headers: cabecalhosAuth(), body: fd });
        const corpo = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(corpo.error || 'Não foi possível anexar o arquivo.');
        showToast('Anexo incluído.', 'success');
        await carregarAnexosAcao(projectId, id, acaoId);
    } catch (e) { falha(e, 'Não foi possível anexar o arquivo'); }
};
window.baixarAnexoAcao = (projectId, id, acaoId, anexo) => baixarArquivo(`/api/v1/projects/${projectId}/incidentes/${id}/acoes/${acaoId}/anexos/${anexo}`).catch((e) => falha(e, 'Não foi possível baixar o arquivo'));
window.removerAnexoAcao = async function (projectId, id, acaoId, anexo) {
    if (!(await confirmar('Remover este anexo da ação?', { rotulo: 'Remover', perigo: true }))) return;
    try { await api('DELETE', `/api/v1/projects/${projectId}/incidentes/${id}/acoes/${acaoId}/anexos/${anexo}`); await carregarAnexosAcao(projectId, id, acaoId); } catch (e) { falha(e, 'Não foi possível remover o anexo'); }
};

const reabrirIncidente = (projectId, id) => () => window.abrirIncidente(projectId, id);

window.avaliarRiscoIncidente = (projectId, id) => acao(
    () => api('PUT', `/api/v1/projects/${projectId}/incidentes/${id}/risco`, { risco_titular: el('in-risco').value, avaliacao_texto: valorOuNulo('in-aval') }),
    'Não foi possível salvar a avaliação', 'Avaliação salva.', reabrirIncidente(projectId, id));

// Registrar a comunicação não se desfaz: pede a data (a de hoje vem preenchida) e confirma antes.
window.registrarComunicacaoIncidente = async function (projectId, id, destino) {
    const em = el('in-com-data')?.value || hojeSP();
    const quem = destino === 'anpd' ? 'à ANPD' : 'ao titular';
    if (!(await confirmar(`Registrar a comunicação ${quem} em ${dia(em)}? Depois de registrada, ela não se desfaz.`, { rotulo: 'Registrar' }))) return;
    // Canal e protocolo só vão com a comunicação à ANPD (o servidor recusa na do titular).
    const anpd = destino === 'anpd' ? { anpd_canal: el('in-com-canal')?.value || null, anpd_protocolo: (el('in-com-prot')?.value || '').trim() || null } : {};
    return acao(() => api('POST', `/api/v1/projects/${projectId}/incidentes/${id}/comunicacoes`, { destino, em, ...anpd }), 'Não foi possível registrar a comunicação', 'Comunicação registrada.', reabrirIncidente(projectId, id));
};

const nomes = (mapa, l) => (lista(l).length ? lista(l).map((v) => escapeHTML(mapa[v] || v)).join(', ') : 'não informado');
function blocoRegistroIncidente(i) {
    const linha = (rotulo, valor) => `<li><strong>${rotulo}:</strong> ${valor}</li>`;
    const dados = lista(i.dados);
    return `<ul class="at-lista" id="in-registro">
        ${linha('Origem do alerta', escapeHTML(i.origem_alerta || 'não informada'))}
        ${linha('Severidade', escapeHTML(SEVERIDADES[i.severidade] || 'não informada'))}
        ${linha('Tipo', escapeHTML(TIPOS_INCIDENTE[i.tipo] || 'não informado'))}
        ${linha('Comprometimento', nomes(COMPROMETIMENTOS, i.comprometimento))}
        ${linha('Ocorreu em', i.ocorrido_em ? dia(i.ocorrido_em) : 'não informado')} ${linha('Fim', i.fim_em ? dia(i.fim_em) : 'não informado')}
        ${linha('Áreas afetadas', lista(i.areas).length ? lista(i.areas).map((a) => escapeHTML(a.nome)).join(', ') : 'nenhuma')}
        ${linha('Titulares estimados', i.titulares_estimados == null ? 'não informado' : escapeHTML(String(i.titulares_estimados)))}
        ${linha('Titulares e dados afetados', dados.length ? dados.map((x) => `${escapeHTML(x.titular)}: ${escapeHTML(x.dado)}${x.sensivel ? ' (sensível)' : ''}`).join('; ') : 'nenhum')}
        ${linha('Critérios do risco', nomes(CRITERIOS_RISCO, i.criterios_risco))}
        ${i.comunicacao_anpd_em ? `${linha('Comunicação à ANPD', `${escapeHTML(i.anpd_protocolo_interno || '')}, enviada em ${dia(i.comunicacao_anpd_em)}`)}
            ${linha('Canal', escapeHTML(CANAIS_ANPD[i.anpd_canal] || 'não informado'))} ${linha('Nº do protocolo na ANPD', escapeHTML(i.anpd_protocolo || 'não informado'))}` : ''}
        ${i.anpd_justificativa ? linha('Justificativa (ANPD)', escapeHTML(i.anpd_justificativa)) : ''}
    </ul>`;
}

// Evidências do incidente: a lista vem depois da janela abrir (uma chamada a mais não atrasa o resto).
async function carregarAnexosIncidente(projectId, id, editar) {
    const box = el('in-anexos');
    if (!box) return;
    let l = [];
    try { l = lista((await api('GET', `/api/v1/projects/${projectId}/incidentes/${id}/anexos`)).anexos); } catch (e) { box.innerHTML = '<p class="at-nota">Não foi possível carregar as evidências.</p>'; return; }
    box.innerHTML = `${l.length ? `<ul class="at-lista">${l.map((a) => `<li><span>${escapeHTML(a.file_name)}</span>
            <span class="d-flex gap-2"><button class="btn btn-ghost btn-sm" data-action="baixarAnexoIncidente" data-args='${args(projectId, id, a.id)}'>Baixar</button>
            ${editar ? `<button class="btn btn-ghost btn-sm" data-action="removerAnexoIncidente" data-args='${args(projectId, id, a.id)}' aria-label="Remover ${escapeHTML(a.file_name)}">Remover</button>` : ''}</span></li>`).join('')}</ul>`
        : '<p class="at-nota">Nenhuma evidência anexada.</p>'}
        ${editar ? `<div class="form-group mt-2"><label class="form-label" for="in-anexo-arq">Anexar evidência (PDF ou DOC, até 5 MB)</label>
            <input class="form-input" id="in-anexo-arq" type="file" accept=".pdf,.doc,.docx"></div>
            <button class="btn btn-sm" data-action="anexarIncidente" data-args='${args(projectId, id)}'>Anexar</button>` : ''}`;
}

window.anexarIncidente = async function (projectId, id) {
    const arq = el('in-anexo-arq')?.files?.[0];
    if (!arq) { showToast('Escolha o arquivo.', 'error'); return; }
    const fd = new FormData();
    fd.append('file', arq);
    try {
        const r = await fetch(`${API_BASE}/api/v1/projects/${projectId}/incidentes/${id}/anexos`, { method: 'POST', headers: cabecalhosAuth(), body: fd });
        const corpo = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(corpo.error || 'Não foi possível anexar o arquivo.');
        showToast('Evidência anexada.', 'success');
        await carregarAnexosIncidente(projectId, id, true);
    } catch (e) { falha(e, 'Não foi possível anexar o arquivo'); }
};
window.baixarAnexoIncidente = (projectId, id, anexo) => baixarArquivo(`/api/v1/projects/${projectId}/incidentes/${id}/anexos/${anexo}`).catch((e) => falha(e, 'Não foi possível baixar o arquivo'));
window.removerAnexoIncidente = async function (projectId, id, anexo) {
    if (!(await confirmar('Remover esta evidência do incidente?', { rotulo: 'Remover', perigo: true }))) return;
    try { await api('DELETE', `/api/v1/projects/${projectId}/incidentes/${id}/anexos/${anexo}`); await carregarAnexosIncidente(projectId, id, true); } catch (e) { falha(e, 'Não foi possível remover a evidência'); }
};

// Edição do registro: áreas, titulares e dados vêm do cadastro do projeto; sem o n.privacy (catálogo), os titulares × dados não aparecem.
let edicao = null;
const opcional = async (f) => { try { return lista(await f()); } catch (e) { return null; } };
const caixas = (prefixo, mapa, marcados) => `<div class="d-flex gap-2 flex-wrap">${Object.entries(mapa).map(([v, r]) =>
    `<label class="re-opcao"><input type="checkbox" name="${prefixo}" value="${escapeHTML(v)}" ${lista(marcados).includes(v) ? 'checked' : ''}><span class="re-opcao-texto">${escapeHTML(r)}</span></label>`).join('')}</div>`;
const marcados = (nome) => [...document.querySelectorAll(`input[name="${nome}"]:checked`)].map((x) => x.value);
function listaDados() {
    const box = el('in-ed-dados-lista');
    if (!box) return;
    box.innerHTML = edicao.dados.length ? `<ul class="at-lista">${edicao.dados.map((x, n) => `<li><span>${escapeHTML(x.titular)}: ${escapeHTML(x.dado)}</span>
        <button class="btn btn-ghost btn-sm" data-action="removerDadoIncidente" data-args='${args(n)}' aria-label="Remover ${escapeHTML(x.titular)}: ${escapeHTML(x.dado)}">Remover</button></li>`).join('')}</ul>`
        : '<p class="at-nota">Nenhum titular e dado afetado registrado.</p>';
}
window.adicionarDadoIncidente = function () {
    const t = el('in-ed-titular'), d = el('in-ed-dado');
    if (!t.value || !d.value) { showToast('Escolha o titular e o dado.', 'error'); return; }
    if (!edicao.dados.some((x) => x.titular_id === t.value && x.dado_id === d.value)) {
        edicao.dados.push({ titular_id: t.value, titular: t.selectedOptions[0].textContent, dado_id: d.value, dado: d.selectedOptions[0].textContent });
    }
    listaDados();
};
window.removerDadoIncidente = function (n) { edicao.dados.splice(n, 1); listaDados(); };

window.editarIncidente = async function (projectId, id) {
    let i;
    try { i = await api('GET', `/api/v1/projects/${projectId}/incidentes/${id}`); } catch (e) { falha(e, 'Não foi possível abrir o incidente'); return; }
    const [areas, partes, titulares, dados] = await Promise.all([
        opcional(() => api('GET', `/api/v1/projects/${projectId}/departamentos`)), opcional(() => api('GET', `/api/v1/projects/${projectId}/partes?status=ativa`)),
        opcional(() => api('GET', `/api/v1/projects/${projectId}/catalogos/titulares`)), opcional(() => api('GET', `/api/v1/projects/${projectId}/catalogos/dados`)),
    ]);
    edicao = { dados: lista(i.dados).map((x) => ({ ...x })), comCatalogo: !!(titulares && dados), comAreas: !!areas };
    const select = (idCampo, mapa, atual, vazio) => `<select class="form-input" id="${idCampo}"><option value="">${vazio}</option>${opcoes(mapa, atual)}</select>`;
    const ativos = (l) => lista(l).filter((x) => (x.status || 'ativo') === 'ativo');
    const pessoas = Object.fromEntries(lista(partes).filter((p) => p.tipo === 'pessoa').map((p) => [p.id, p.nome]));
    const areasMarcadas = lista(i.areas).map((a) => a.id);
    openModal(`<h3>${escapeHTML(i.protocolo)}: editar registro</h3>
        <p class="at-nota">A data da ciência não muda aqui: os prazos de comunicação contam dela.</p>
        <div class="form-group"><label class="form-label" for="in-ed-titulo">Título</label><input class="form-input" id="in-ed-titulo" maxlength="500" value="${escapeHTML(i.titulo)}"></div>
        <div class="form-group"><label class="form-label" for="in-ed-desc">Descrição detalhada</label><textarea class="form-input" id="in-ed-desc" rows="4" maxlength="5000">${escapeHTML(i.descricao || '')}</textarea></div>
        <div class="form-group"><label class="form-label" for="in-ed-origem">Origem do alerta</label><input class="form-input" id="in-ed-origem" maxlength="500" value="${escapeHTML(i.origem_alerta || '')}"></div>
        <div class="form-group"><label class="form-label" for="in-ed-severidade">Severidade</label>${select('in-ed-severidade', SEVERIDADES, i.severidade, 'Não informada')}</div>
        <div class="form-group"><label class="form-label" for="in-ed-tipo">Tipo de incidente</label>${select('in-ed-tipo', TIPOS_INCIDENTE, i.tipo, 'Não informado')}</div>
        <fieldset class="at-grupo"><legend class="at-grupo-titulo">Comprometimento</legend>${caixas('in-ed-comp', COMPROMETIMENTOS, i.comprometimento)}</fieldset>
        <div class="form-group"><label class="form-label" for="in-ed-ocorrido">Ocorreu em (opcional)</label><input class="form-input" id="in-ed-ocorrido" type="date" max="${hojeSP()}" value="${escapeHTML(String(i.ocorrido_em || '').slice(0, 10))}"></div>
        <div class="form-group"><label class="form-label" for="in-ed-fim">Fim (opcional)</label><input class="form-input" id="in-ed-fim" type="date" max="${hojeSP()}" value="${escapeHTML(String(i.fim_em || '').slice(0, 10))}"></div>
        <div class="form-group"><label class="form-label" for="in-ed-resp">Responsável pelas tratativas</label>${select('in-ed-resp', pessoas, i.responsavel_parte_id, 'Não definido')}</div>
        <fieldset class="at-grupo"><legend class="at-grupo-titulo">Áreas afetadas</legend>${areas ? (ativos(areas).length ? caixas('in-ed-area', Object.fromEntries(ativos(areas).map((a) => [a.id, a.nome])), areasMarcadas) : '<p class="at-nota">Nenhuma área cadastrada. Cadastre em Áreas.</p>') : '<p class="at-nota">Não foi possível carregar as áreas.</p>'}</fieldset>
        <div class="form-group"><label class="form-label" for="in-ed-qtd">Quantidade estimada de titulares</label><input class="form-input" id="in-ed-qtd" type="number" min="0" value="${i.titulares_estimados ?? ''}"></div>
        <fieldset class="at-grupo"><legend class="at-grupo-titulo">Titulares e dados afetados</legend>
            ${edicao.comCatalogo ? `<div id="in-ed-dados-lista"></div><div class="at-linha-form">
                <div class="form-group"><label class="form-label" for="in-ed-titular">Titular</label><select class="form-input" id="in-ed-titular">${opcoes(Object.fromEntries(ativos(titulares).map((t) => [t.id, t.nome])))}</select></div>
                <div class="form-group"><label class="form-label" for="in-ed-dado">Dado</label><select class="form-input" id="in-ed-dado">${opcoes(Object.fromEntries(ativos(dados).map((d) => [d.id, d.nome])))}</select></div>
                <button type="button" class="btn btn-sm" data-action="adicionarDadoIncidente">Adicionar</button></div>`
                : '<p class="at-nota">Os titulares e dados vêm do catálogo do n.privacy (Titulares e dados pessoais).</p>'}
        </fieldset>
        <fieldset class="at-grupo"><legend class="at-grupo-titulo">Critérios do risco aos titulares</legend>${caixas('in-ed-crit', CRITERIOS_RISCO, i.criterios_risco)}</fieldset>
        <fieldset class="at-grupo"><legend class="at-grupo-titulo">Comunicação à ANPD</legend>
            ${i.comunicacao_anpd_em ? `<p class="at-nota">${escapeHTML(i.anpd_protocolo_interno || '')}, enviada em ${dia(i.comunicacao_anpd_em)}.</p>
                <div class="form-group"><label class="form-label" for="in-ed-canal">Canal</label>${select('in-ed-canal', CANAIS_ANPD, i.anpd_canal, 'Não informado')}</div>
                <div class="form-group"><label class="form-label" for="in-ed-prot">Nº do protocolo na ANPD</label><input class="form-input" id="in-ed-prot" maxlength="100" value="${escapeHTML(i.anpd_protocolo || '')}"></div>`
                : '<p class="at-nota">Canal e protocolo entram depois de registrada a comunicação à ANPD, na janela do incidente.</p>'}
            <div class="form-group"><label class="form-label" for="in-ed-just">Justificativa (comunicação fora do prazo ou não feita)</label><textarea class="form-input" id="in-ed-just" rows="2" maxlength="5000">${escapeHTML(i.anpd_justificativa || '')}</textarea></div>
        </fieldset>
        <div class="d-flex gap-2 mt-3"><button class="btn btn-primary" data-action="salvarEdicaoIncidente" data-args='${args(projectId, id)}'>Salvar</button>
        <button class="btn" data-action="abrirIncidente" data-args='${args(projectId, id)}'>Voltar sem salvar</button></div>`, 'modal-large');
    listaDados();
};

// O campo de data mostra só o dia: sem mudança, não manda (a hora que a API gravou, por exemplo pelo agente, não se perde).
const dataMudou = (idCampo) => { const c = el(idCampo); return c.value === c.defaultValue ? undefined : (c.value || null); };
window.salvarEdicaoIncidente = function (projectId, id) {
    const titulo = valorOuNulo('in-ed-titulo');
    if (!titulo) { showToast('Informe o título.', 'error'); return; }
    const qtd = el('in-ed-qtd').value.trim();
    const corpo = {
        titulo, descricao: valorOuNulo('in-ed-desc'), origem_alerta: valorOuNulo('in-ed-origem'), severidade: el('in-ed-severidade').value || null,
        tipo: el('in-ed-tipo').value || null, comprometimento: marcados('in-ed-comp'), ocorrido_em: dataMudou('in-ed-ocorrido'),
        fim_em: dataMudou('in-ed-fim'), responsavel_parte_id: el('in-ed-resp').value || null, titulares_estimados: qtd === '' ? null : Number(qtd),
        criterios_risco: marcados('in-ed-crit'), anpd_justificativa: valorOuNulo('in-ed-just'),
        // Protocolo e canal só existem (e só vão) depois de registrada a comunicação à ANPD.
        ...(el('in-ed-canal') ? { anpd_canal: el('in-ed-canal').value || null, anpd_protocolo: valorOuNulo('in-ed-prot') } : {}),
        // Sem a lista carregada (falha ou sem o n.privacy), o campo não vai: o servidor mantém o que já está gravado.
        ...(edicao?.comAreas ? { areas: marcados('in-ed-area') } : {}),
        ...(edicao?.comCatalogo ? { dados: edicao.dados.map((x) => ({ titular_id: x.titular_id, dado_id: x.dado_id })) } : {}),
    };
    return acao(() => api('PUT', `/api/v1/projects/${projectId}/incidentes/${id}`, corpo),
        'Não foi possível salvar o incidente', 'Incidente atualizado.', reabrirIncidente(projectId, id));
};

// O que tem e o que falta vêm do servidor, calculados do registro (Res. CD/ANPD 15/2024); o texto é editável e não é gravado.
window.rascunhoComunicacaoIncidente = async function (projectId, id, destino) {
    let r;
    try { r = await api('POST', `/api/v1/projects/${projectId}/incidentes/${id}/rascunho-comunicacao`, { destino }); } catch (e) { falha(e, 'Não foi possível gerar o rascunho'); return; }
    const itens = (l) => (lista(l).length ? lista(l).map((x) => escapeHTML(x)).join('; ') : 'nada');
    el('in-rascunho').innerHTML = `<p id="in-rascunho-tem">O incidente tem: ${itens(r.presentes)}.</p>
        <p id="in-rascunho-falta" style="color:var(--warning-ink)">Falta (complete antes de enviar): ${itens(r.faltando)}.</p>
        ${caixaRascunho('in-rascunho-texto', r.texto)}`;
};

window.encerrarIncidente = (projectId, id) => acao(
    () => api('POST', `/api/v1/projects/${projectId}/incidentes/${id}/encerrar`), 'Não foi possível encerrar o incidente', 'Incidente encerrado.', reabrirIncidente(projectId, id));

// ─── Prazos legais (só o administrador da plataforma) ─────────────────────────────────────────────
window.editarParametroLegal = function (chave, descricao, valor, unidade, fonte, revisadoEm, revisadoPor, definido) {
    openModal(`<h3>${escapeHTML(descricao)}</h3>
        <div class="form-group"><label class="form-label" for="pl-valor">Valor</label><input class="form-input" id="pl-valor" type="number" min="1" value="${escapeHTML(String(valor))}"></div>
        <div class="form-group"><label class="form-label" for="pl-unidade">Unidade</label><select class="form-input" id="pl-unidade">${opcoes(UNIDADES, unidade)}</select></div>
        <div class="form-group"><label class="form-label" for="pl-fonte">Fonte (norma e artigo)</label><input class="form-input" id="pl-fonte" maxlength="1000" value="${escapeHTML(fonte)}"></div>
        <div class="form-group"><label class="form-label" for="pl-rev-em">Revisado em</label><input class="form-input" id="pl-rev-em" type="date" value="${escapeHTML(String(revisadoEm).slice(0, 10))}"></div>
        <div class="form-group"><label class="form-label" for="pl-rev-por">Revisado por</label><input class="form-input" id="pl-rev-por" maxlength="200" value="${escapeHTML(revisadoPor)}"></div>
        <div style="display:flex; gap:0.5rem"><button class="btn btn-primary" data-action="salvarParametroLegal" data-args='${args(chave)}'>Salvar</button>
        ${definido ? `<button class="btn btn-ghost" data-action="removerParametroLegal" data-args='${args(chave)}'>Remover (volta a "não calculado")</button>` : ''}</div>`);
};

window.salvarParametroLegal = function (chave) {
    const valor = parseInt(el('pl-valor').value, 10);
    const dados = { valor, unidade: el('pl-unidade').value, fonte: valorOuNulo('pl-fonte'), revisado_em: el('pl-rev-em').value, revisado_por: valorOuNulo('pl-rev-por') };
    if (!Number.isInteger(valor) || valor < 1 || !dados.fonte || !dados.revisado_em || !dados.revisado_por) { showToast('Informe valor, fonte, data e quem revisou', 'error'); return; }
    return acao(async () => {
        await api('PUT', `/api/v1/parametros-legais/${chave}`, dados);
        forceCloseModal();
    }, 'Não foi possível salvar o prazo', 'Prazo legal salvo.');
};

window.removerParametroLegal = (chave) => acao(async () => {
    await api('DELETE', `/api/v1/parametros-legais/${chave}`);
    forceCloseModal();
}, 'Não foi possível remover o prazo', 'Prazo removido.');

window.renderTitular = renderTitular;
