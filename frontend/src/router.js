import { S } from './state.js';
import { atualizarSelos } from './selos-menu.js';
import { produtoAtual, TELAS_DO_HUB, moduloPara, enderecoNoModulo, irPara, abrirGrupo } from './produto.js';

export     function navigate(view, data) {
        let targetView = view;
        const isClient = S.user && (S.user.role === 'org_admin' || S.user.role === 'org_user' || S.user.role === 'client');
        if (isClient && (view === 'dashboard' || view === 'projects')) {
            targetView = 'project-detail';
        }
        const produto = produtoAtual();
        // O n.360 é o hub: tela de módulo leva ao módulo, na própria tela (`?tela=`, lido no boot dele); a dos dois módulos vai a um
        // que o projeto tem. Sem módulo para ela, fica no início do portal. Nada de tela de módulo desenhada dentro do portal.
        if (produto === 'n360' && !TELAS_DO_HUB.includes(targetView)) {
            const proj = (data && (data.activeProject || data.currentProject)) || S.activeProject;
            const modulo = moduloPara(targetView, proj);
            if (modulo) { irPara(enderecoNoModulo(modulo, targetView, proj)); return; }
            targetView = 'inicio';
        }
        // Fornecedores é a tela ISO (KYV, Trust Score); no n.privacy o cadastro deles é Terceiros.
        if (produto === 'privacy' && targetView === 'vendors') targetView = 'terceiros';
        
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
        // No n.privacy a aba de incidentes tem item próprio.
        const navId = targetView === 'titular' && produto === 'iso' ? 'nav-incidentes'
            : targetView === 'titular' && produto === 'privacy' && S.titularAba === 'incidentes' ? 'nav-incidentes-privacy'
            : targetView === 'projects' && produto !== 'n360' ? 'nav-project'
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
        
        if (S.view === 'inicio') renderInicio(c, h, a);
        else if (S.view === 'dashboard') renderDashboard(c, h, a);
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
        else if (S.view === 'titular') renderTitular(c, h, a);
        else if (S.view === 'encarregado') renderEncarregado(c, h, a);
        else if (S.view === 'importacao') renderImportacao(c, h, a);
        else if (S.view === 'training') renderTraining(c, h, a);
        else if (S.view === 'ropa') renderROPA(c, h, a);
        else if (S.view === 'ropa-entrevista') renderRopaEntrevista(c, h, a);
        else if (S.view === 'dpia') renderDPIA(c, h, a);
        else if (S.view === 'audits') renderAudits(c, h, a);
        else if (S.view === 'capa') renderCAPA(c, h, a);
        else if (S.view === 'evidence') renderEvidence(c, h, a);
        else if (S.view === 'controls') renderControls(c, h, a);
        else if (S.view === 'governance') renderGovernance(c, h, a);
        else if (S.view === 'certification') renderCertification(c, h, a);
        else if (S.view === 'ai-chat') renderAIChat(c, h, a);
        else if (S.view === 'settings') renderSettings(c, h, a);
        else if (S.view === 'meus-pedidos') renderMeusPedidos(c, h, a);
        else if (S.view === 'users') renderUsers(c, h, a);
        else if (S.view === 'api-keys') renderApiKeys(c, h, a);
        else if (S.view === 'conectar-agente') renderConectarAgente(c, h, a);
        else if (S.view === 'seguranca-projeto') renderSegurancaProjeto(c, h, a);
        else if (S.view === 'catalogo') renderCatalogo(c, h, a);
        else if (S.view === 'config-comercial') renderConfigComercial(c, h, a);
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
        if (S.view === 'encarregado') atualizarSelos(document, true);
    }

window.navigate = navigate;
window.render = render;
