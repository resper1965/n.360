import { S } from './state.js';
import { produtoAtual, TELAS_DO_HUB, moduloPara, enderecoNoModulo, irPara, abrirGrupo, limparFichaDoEndereco } from './produto.js';

/** Telas da área comercial: somem com o interruptor desligado (o servidor responde 404 às rotas delas). */
export const TELAS_COMERCIAIS = ['comercial', 'leads', 'assessments', 'assessment-detail', 'proposals', 'catalogo', 'config-comercial', 'settings'];

export     function navigate(view, data) {
        let targetView = view;
        // A entrevista em passos saiu (spec 2026-10-16, PR3): o endereço dela cai na ficha em abas, no modo guiado. Sem registro
        // gravado (Nova atividade ainda não criou a atividade), volta à lista do RoPA.
        if (view === 'ropa-entrevista') {
            const e = S.ropaEntrevista || {};
            S.ropaEntrevista = null;
            if (!e.projectId || !e.recordId) return navigate('ropa');
            S.atividade = { projectId: e.projectId, ropaId: e.recordId };
            const u = new URL(window.location.href);
            u.searchParams.delete('aba');
            u.searchParams.set('modo', 'guiado');
            window.history.replaceState(null, '', u);
            return navigate('ropa-atividade');
        }
        // O filtro do painel (filtro-painel.js) vale só para a navegação que o trouxe: qualquer outra o apaga.
        S.filtroPainel = (data && data.filtroPainel) || null;
        const isClient = S.user && (S.user.role === 'org_admin' || S.user.role === 'org_user' || S.user.role === 'client');
        // O cliente não vê a lista de projetos (só tem o dele): vai à Jornada. O Painel ele vê, na visão de cliente.
        if (isClient && view === 'projects') {
            targetView = 'project-detail';
        }
        // O comercial não alcança projeto: a entrada dele no n.iso é a tela Comercial, não o painel do projeto.
        if (S.user && S.user.role === 'comercial' && view === 'dashboard') targetView = 'comercial';
        // Área comercial desligada (COMERCIAL_ATIVO): tela comercial pedida por link, aviso ou atalho antigo cai no painel.
        if (TELAS_COMERCIAIS.includes(targetView) && !(typeof window.comercialAtivo === 'function' && window.comercialAtivo())) targetView = 'dashboard';
        const produto = produtoAtual();
        // O n.360 é o hub: tela de módulo leva ao módulo, na própria tela (`?tela=`, lido no boot dele); a dos dois módulos vai a um
        // que o projeto tem. Sem módulo para ela, fica no início do portal. Nada de tela de módulo desenhada dentro do portal.
        if (produto === 'n360' && !TELAS_DO_HUB.includes(targetView)) {
            const proj = (data && (data.activeProject || data.currentProject)) || S.activeProject;
            if (data && data.bancadaAlvo) S.bancadaAlvo = data.bancadaAlvo; // o endereço no módulo leva o passo da Bancada
            const modulo = moduloPara(targetView, proj);
            if (modulo) { irPara(enderecoNoModulo(modulo, targetView, proj)); return; }
            targetView = 'inicio';
        }
        // Fornecedores é a tela ISO (KYV, Trust Score); no n.privacy o cadastro deles é Terceiros.
        if (produto === 'privacy' && targetView === 'vendors') targetView = 'terceiros';
        
        // A ficha do fornecedor vive no endereço; qualquer outra tela a tira de lá.
        if (targetView !== 'terceiro') limparFichaDoEndereco();
        S.view = targetView;
        if (data) Object.assign(S, data);
        
        // Update active states in sidebar. aria-current expõe a página atual a
        // leitores de tela — antes o estado ativo era só cor (invisível para AT).
        document.querySelectorAll('.sidebar-nav').forEach(el => {
            el.classList.remove('active');
            el.removeAttribute('aria-current');
        });
        // No n.iso a tela titular é só Incidentes (nav-titular fica oculto): destaca o item que levou até ela.
        // Nos módulos, Projetos é do n.360 (fora do menu): a lista, aberta pelo Voltar da Jornada, destaca a Jornada.
        // No n.privacy as abas de incidentes e de consentimentos têm item próprio.
        const navId = targetView === 'titular' && produto === 'iso' ? 'nav-incidentes'
            : targetView === 'titular' && produto === 'privacy' ? ({ incidentes: 'nav-incidentes-privacy', consentimentos: 'nav-consentimentos' }[S.titularAba] || 'nav-titular')
            : targetView === 'projects' && produto !== 'n360' ? 'nav-project'
            : targetView === 'management-review' ? 'nav-mgmt'
            : targetView === 'terceiro' ? 'nav-terceiros'
            // O id inteiro vence o prefixo: 'audit-trail' é nav-audit-trail (nav-audit não existe).
            : document.getElementById(`nav-${targetView}`) ? `nav-${targetView}` : `nav-${targetView.split('-')[0]}`;
        const el = document.getElementById(navId);
        if (el) {
            el.classList.add('active');
            el.setAttribute('aria-current', 'page');
            // O grupo do item ativo abre sozinho: sem isto a página atual ficava dentro de um grupo recolhido.
            abrirGrupo(el.closest('.sidebar-group'));
        }

        render();
    }

    export function render() {
        const c = document.getElementById('content');
        const h = document.getElementById('header-title');
        const a = document.getElementById('header-actions');
        
        // Entradas: o painel (views/painel.js) no n.360 (inicio), no n.iso (dashboard) e no n.privacy (encarregado).
        if (S.view === 'inicio') renderInicio(c, h, a);
        else if (S.view === 'dashboard') renderDashboard(c, h, a);
        else if (S.view === 'comercial') renderComercial(c, h, a);
        else if (S.view === 'leads') renderLeads(c, h, a);
        else if (S.view === 'assessments') renderAssessments(c, h, a);
        else if (S.view === 'proposals') renderPropostas(c, h, a);  // o fluxo antigo (renderProposals) saiu na fatia 4
        else if (S.view === 'projects') renderProjects(c, h, a);
        else if (S.view === 'monitor') renderMonitor(c, h, a);
        else if (S.view === 'assets') renderAssets(c, h, a);
        else if (S.view === 'metrics') renderMetrics(c, h, a);
        else if (S.view === 'audit-trail') renderAuditTrail(c, h, a);
        else if (S.view === 'acknowledgments') renderAcknowledgments(c, h, a);
        else if (S.view === 'policies-dashboard') renderPoliciesDashboard(c, h, a);
        else if (S.view === 'risks') renderRisks(c, h, a);
        else if (S.view === 'vendors') renderVendors(c, h, a);
        else if (S.view === 'partes') renderPartes(c, h, a);
        else if (S.view === 'documentos') renderDocumentos(c, h, a);
        else if (S.view === 'requisitos') renderRequisitos(c, h, a);
        else if (S.view === 'terceiros') renderTerceiros(c, h, a);
        else if (S.view === 'terceiro') renderTerceiro(c, h, a);
        else if (S.view === 'catalogos') renderCatalogos(c, h, a);
        else if (S.view === 'mapa-de-risco') renderMapaDeRisco(c, h, a);
        else if (S.view === 'gaps') renderGaps(c, h, a);
        else if (S.view === 'lia') renderLia(c, h, a);
        else if (S.view === 'titular') renderTitular(c, h, a);
        else if (S.view === 'encarregado') renderEncarregado(c, h, a);
        else if (S.view === 'importacao') renderImportacao(c, h, a);
        else if (S.view === 'training') renderTraining(c, h, a);
        else if (S.view === 'ropa') renderROPA(c, h, a);
        else if (S.view === 'ropa-atividade') renderAtividade(c, h, a);
        else if (S.view === 'dpia') renderDPIA(c, h, a);
        else if (S.view === 'audits') renderAudits(c, h, a);
        else if (S.view === 'capa') renderCAPA(c, h, a);
        else if (S.view === 'evidence') renderEvidence(c, h, a);
        else if (S.view === 'controls') renderControls(c, h, a);
        else if (S.view === 'governance') renderGovernance(c, h, a);
        else if (S.view === 'certification') renderProntidao(c, h, a);
        else if (S.view === 'ai-chat') renderAIChat(c, h, a);
        else if (S.view === 'settings') renderSettings(c, h, a);
        else if (S.view === 'meus-pedidos') renderMeusPedidos(c, h, a);
        else if (S.view === 'users') renderUsers(c, h, a);
        else if (S.view === 'api-keys') renderApiKeys(c, h, a);
        else if (S.view === 'conectar-agente') renderConectarAgente(c, h, a);
        else if (S.view === 'seguranca-projeto') renderSegurancaProjeto(c, h, a);
        else if (S.view === 'catalogo') renderCatalogo(c, h, a);
        else if (S.view === 'config-comercial' || S.view === 'identidade-org') renderConfigComercial(c, h, a);
        else if (S.view === 'organizacoes') renderOrganizacoes(c, h, a);
        else if (S.view === 'assessment-detail') renderAssessmentDetail(c, h, a);
        else if (S.view === 'project-detail') renderProjectDetail(c, h, a);
        else if (S.view === 'soa') renderSoA(c, h, a);
        else if (S.view === 'stakeholders') renderStakeholders(c, h, a);
        else if (S.view === 'context') renderContext(c, h, a);
        else if (S.view === 'audit-execution') renderAuditExecution(c, h, a);
        else if (S.view === 'management-review') renderManagementReview(c, h, a);
        updateActiveProjectWidget();
        updateHeaderUser();
    }

window.navigate = navigate;
window.render = render;
