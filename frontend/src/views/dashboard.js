import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML } from '../ui.js';
import { projetosDoProduto } from '../produto.js';

// Espelho de `ehComercial` (src/helpers.ts): o funil de leads é do comercial.
// Local, e não `window.ehComercial`, para a view não depender da ordem de carga.
const ehComercial = () => !!(S.user && ['platform_admin', 'comercial', 'consultoria_admin'].includes(S.user.role));

    /**
     * Entrada do n.iso. O painel do projeto (views/painel.js) é a entrada de quem conduz a adequação; o comercial, que não
     * alcança projeto, entra na tela Comercial; o cliente ainda sem projeto vê as fases da contratação.
     */
    async function renderDashboard(c, h, a) {
        if (S.user && S.user.role === 'comercial') return renderComercial(c, h, a);
        if (!(S.user && (S.user.role === 'org_admin' || S.user.role === 'org_user' || S.user.role === 'client') && !S.user.client_project_id)) return window.renderPainel(c, h, a, 'iso');
        h.textContent = 'Bem-vindo';
        a.innerHTML = '';
        {
            let assessmentStatus = 'Pending';
            let proposalStatus = 'Pending';
            if (S.clientAssessmentId) assessmentStatus = 'In Progress';
            if (S.clientProposalId) {
                assessmentStatus = 'Completed';
                proposalStatus = S.clientProposalStatus || 'Draft';
            }

            let assessmentActionHtml = '';
            if (assessmentStatus === 'Completed') {
                assessmentActionHtml = '<span class="status-badge" style="background:rgba(0,173,232,0.1); color:var(--accent); border:1px solid rgba(0,173,232,0.2)">Concluído</span>';
            } else if (S.clientAssessmentId) {
                assessmentActionHtml = '<span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Em andamento</span>';
            } else {
                assessmentActionHtml = '<span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Aguardando Liberação</span>';
            }

            let html = `
                <div class="fade-in" style="max-width:800px; margin:0 auto; padding:2rem 0">
                    <h2 style="font-family:var(--font-head); font-weight:600; font-size:2rem; margin-bottom:0.5rem; color:var(--text)">Bem-vindo ao n.iso</h2>
                    <p style="color:var(--text-dim); font-size:0.95rem; margin-bottom:2.5rem">Seu ambiente de governança de segurança da informação (SGSI) está em fase de preparação.</p>
                    <div style="display:flex; flex-direction:column; gap:1.5rem">
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 1</div>
                                <h3 style="font-family:var(--font-head); font-weight:500; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Levantamento de escopo</h3>
                                <p style="color:var(--text-dim); font-size:0.85rem; margin:0">Questionário para mapear as atividades, equipe e tecnologia do seu negócio para cálculo do pricing e maturidade.</p>
                            </div>
                            <div style="text-align:right">
                                ${assessmentActionHtml}
                            </div>
                        </div>
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 2</div>
                                <h3 style="font-family:var(--font-head); font-weight:500; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Proposta Comercial e Assinatura</h3>
                                <p style="color:var(--text-dim); font-size:0.85rem; margin:0">Aprovação da proposta comercial baseada no escopo mapeado e assinatura digital para início da adequação.</p>
                            </div>
                            <div style="text-align:right">
                                ${proposalStatus === 'Approved' ? '<span class="status-badge" style="background:rgba(0,173,232,0.1); color:var(--accent); border:1px solid rgba(0,173,232,0.2)">Assinado</span>' : S.clientProposalId ? '<span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Proposta enviada pelo comercial</span>' : '<span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Aguardando levantamento</span>'}
                            </div>
                        </div>
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 3</div>
                                <h3 style="font-family:var(--font-head); font-weight:500; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Início do SGSI & Projetos</h3>
                                <p style="color:var(--text-dim); font-size:0.85rem; margin:0">Criação automatizada de todas as 41 fases do projeto no n.iso, checklists de conformidade e ativação dos assistentes de IA.</p>
                            </div>
                            <div style="text-align:right">
                                <span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Bloqueado até assinatura</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            c.innerHTML = html;
        }
    }

    /** Tela Comercial (decisão 5 do estudo do painel): o funil saiu da entrada do n.iso e mora aqui, no grupo Comercial. */
    async function renderComercial(c, h, a) {
        h.textContent = 'Comercial';
        a.innerHTML = ehComercial() ? '<button class="btn btn-primary" data-action="openCreateLeadModal">+ Novo Lead</button>' : '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const [leads, assessments, projects] = await Promise.all([
                ehComercial() ? api('GET', '/api/v1/leads') : [],
                api('GET', '/api/v1/assessments'),
                api('GET', '/api/v1/projects'),
            ]);
            const activeProjectsList = projetosDoProduto(projects); // só os projetos do módulo deste caminho (/iso ou /privacy)
            const statsHtml = window.renderStatCards([
                // Só o comercial vê o funil; para o consultor o cartão mostraria 0 e enganaria.
                ...(ehComercial() ? [{ label: 'Leads Ativos', value: Array.isArray(leads) ? leads.length : 0, color: 'var(--text)', subtext: 'Oportunidades em pré-venda' }] : []),
                { label: 'Levantamentos', value: Array.isArray(assessments) ? assessments.length : 0, color: 'var(--text)', subtext: 'Levantamentos de escopo cadastrados' },
                { label: 'Projetos em Curso', value: activeProjectsList.length, color: 'var(--text)', subtext: 'Implementações ISO ativas' },
            ]);

            const assessmentsTable = window.renderDataTable(
                [
                    { label: 'Cliente', key: 'client_name' },
                    { label: 'Status', key: 'status', render: (row) => window.renderStatusBadge(row.status === 'completed' ? 'success' : row.status === 'in_progress' ? 'warning' : 'info', row.status || 'Pendente') },
                    { label: 'Ações', align: 'right', render: (row) => `<button class="btn btn-ghost btn-sm" data-action="openAssessmentDetail" data-args='${escapeHTML(JSON.stringify([row.id]))}'>Ver</button>` },
                ],
                (Array.isArray(assessments) ? assessments : []).slice(0, 5),
                { emptyMessage: 'Nenhum levantamento cadastrado.', emptyHint: 'O levantamento de escopo mapeia atividades, equipe e tecnologia do cliente e é a base da proposta.' }
            );

            const projectsTable = window.renderDataTable(
                [
                    { label: 'Projeto', render: (row) => escapeHTML(row.project_name || row.client_name || 'Sem nome') },
                    { label: 'Ação', align: 'right', render: (row) => `<button class="btn btn-ghost btn-sm" data-action="openProjectDetail" data-args='${escapeHTML(JSON.stringify([row.id]))}'>Gerenciar</button>` },
                ],
                activeProjectsList.slice(0, 5),
                { emptyMessage: 'Nenhum projeto ativo.', emptyHint: 'O projeto nasce quando a proposta é aprovada; a jornada de adequação começa por ele.', emptyAction: `<button class="btn" data-action="navigate" data-args='["projects"]'>Ver projetos</button>` }
            );

            c.innerHTML = `
                <div class="fade-in">
                    ${statsHtml}
                    <div class="comercial-tabelas">
                        <section aria-labelledby="com-lev"><h2 id="com-lev" class="comercial-titulo">Levantamentos recentes</h2>${assessmentsTable}</section>
                        <section aria-labelledby="com-proj"><h2 id="com-proj" class="comercial-titulo">Projetos ativos</h2>${projectsTable}</section>
                    </div>
                </div>
            `;
        } catch (e) {
            window.falhaDeCarga(c, a, 'Não foi possível carregar a tela Comercial.', e);
        }
    }

export { renderDashboard, renderComercial };
window.renderDashboard = renderDashboard;
window.renderComercial = renderComercial;
