import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML } from '../ui.js';
import './ponto-de-partida.js';
import { projetosDoProduto } from '../produto.js';

// Espelho de `ehComercial` (src/helpers.ts): o funil de leads é do comercial.
// Local, e não `window.ehComercial`, para a view não depender da ordem de carga.
const ehComercial = () => !!(S.user && ['platform_admin', 'comercial', 'consultoria_admin'].includes(S.user.role));

    async function renderDashboard(c, h, a) {
        h.textContent = 'Dashboard Executivo';
        a.innerHTML = `<button class="btn btn-primary" data-action="openCreateLeadModal">+ Novo Lead</button>
                       <button class="btn btn-ghost" data-action="navigate" data-args='["monitor"]'>Monitor</button>`;
        if (S.user && (S.user.role === 'org_admin' || S.user.role === 'org_user' || S.user.role === 'client') && !S.user.client_project_id) {
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
                    <h2 style="font-family:'Montserrat'; font-weight:700; font-size:2rem; margin-bottom:0.5rem; color:var(--text)">Bem-vindo ao n.iso</h2>
                    <p style="color:var(--text-dim); font-size:0.95rem; margin-bottom:2.5rem">Seu ambiente de governança de segurança da informação (SGSI) está em fase de preparação.</p>
                    <div style="display:flex; flex-direction:column; gap:1.5rem">
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 1</div>
                                <h3 style="font-family:'Montserrat'; font-weight:500; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Levantamento de escopo</h3>
                                <p style="color:var(--text-dim); font-size:0.85rem; margin:0">Questionário para mapear as atividades, equipe e tecnologia do seu negócio para cálculo do pricing e maturidade.</p>
                            </div>
                            <div style="text-align:right">
                                ${assessmentActionHtml}
                            </div>
                        </div>
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 2</div>
                                <h3 style="font-family:'Montserrat'; font-weight:500; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Proposta Comercial e Assinatura</h3>
                                <p style="color:var(--text-dim); font-size:0.85rem; margin:0">Aprovação da proposta comercial baseada no escopo mapeado e assinatura digital para início da adequação.</p>
                            </div>
                            <div style="text-align:right">
                                ${proposalStatus === 'Approved' ? '<span class="status-badge" style="background:rgba(0,173,232,0.1); color:var(--accent); border:1px solid rgba(0,173,232,0.2)">Assinado</span>' : S.clientProposalId ? '<span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Proposta enviada pelo comercial</span>' : '<span class="status-badge" style="background:rgba(255,255,255,0.05); color:var(--text-dim)">Aguardando levantamento</span>'}
                            </div>
                        </div>
                        <div class="card" style="padding:1.5rem; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02)">
                            <div>
                                <div style="font-size:0.75rem; color:var(--accent); font-weight:600; text-transform:uppercase; letter-spacing:0.5px">Fase 3</div>
                                <h3 style="font-family:'Montserrat'; font-weight:500; font-size:1.15rem; margin:0.25rem 0 0.5rem 0">Início do SGSI & Projetos</h3>
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
            return;
        }
        c.innerHTML = '<div class="loading"></div>';
        try {
            const [leads, assessments, projects, controls] = await Promise.all([
                ehComercial() ? api('GET', '/api/v1/leads').catch(() => []) : [],
                api('GET', '/api/v1/assessments').catch(() => []),
                api('GET', '/api/v1/projects').catch(() => []),
                api('GET', '/api/v1/controls').catch(() => [])
            ]);
            const activeProjectsList = projetosDoProduto(projects); // só os projetos do produto deste domínio
            const leadsCount = Array.isArray(leads) ? leads.length : 0;
            const assessmentsCount = Array.isArray(assessments) ? assessments.length : 0;
            const projectsCount = activeProjectsList.length;

            const totalControls = (Array.isArray(controls) && controls.length > 0) ? controls.length : 93;
            const approvedControls = Array.isArray(controls) ? controls.filter(ctrl => {
                const s = String(ctrl.status || '').toUpperCase();
                return s === 'APPROVED' || s === 'IMPLEMENTED' || s === 'COMPLETED' || s === 'CONFORME';
            }).length : 0;
            const gapsControls = Math.max(0, totalControls - approvedControls);
            const complianceRate = totalControls > 0 ? Math.round((approvedControls / totalControls) * 100) : 0;

            const statsHtml = window.renderStatCards([
                // Só o comercial vê o funil; para o consultor o cartão mostraria 0 e enganaria.
                ...(ehComercial() ? [{ label: 'Leads Ativos', value: leadsCount, color: 'var(--text)', subtext: 'Oportunidades em pré-venda' }] : []),
                // Contagem é neutra (--text); cor só quando o número diz algo (conformidade a partir de 80%).
                { label: 'Levantamentos', value: assessmentsCount, color: 'var(--text)', subtext: 'Levantamentos de escopo cadastrados' },
                { label: 'Projetos em Curso', value: projectsCount, color: 'var(--text)', subtext: 'Implementações ISO ativas' },
                { label: 'Taxa de Conformidade', value: `${complianceRate}%`, color: complianceRate >= 80 ? 'var(--success)' : 'var(--text)', subtext: `${approvedControls} de ${totalControls} controles` }
            ]);

            const assessmentsTable = window.renderDataTable(
                [
                    { label: 'Cliente', key: 'client_name' },
                    { label: 'Status', key: 'status', render: (row) => window.renderStatusBadge(row.status === 'completed' ? 'success' : row.status === 'in_progress' ? 'warning' : 'info', row.status || 'Pendente') },
                    {
                        label: 'Ações', align: 'right', render: (row) => `
                            <button class="btn btn-ghost" style="padding:0.25rem 0.6rem; font-size:0.7rem;" data-action="openAssessmentDetail" data-args='["${row.id}"]'>Ver</button>
                        `
                    }
                ],
                assessments.slice(0, 5),
                { emptyMessage: 'Nenhum levantamento cadastrado.', emptyHint: 'O levantamento de escopo mapeia atividades, equipe e tecnologia do cliente e é a base da proposta.' }
            );

            const projectsTable = window.renderDataTable(
                [
                    { label: 'Projeto', render: (row) => escapeHTML(row.project_name || row.client_name || 'Sem nome') },
                    {
                        label: 'Progresso', render: (row) => {
                            const progVal = (row.progress !== undefined && row.progress !== null && row.progress > 0) ? row.progress : complianceRate;
                            return `
                            <div style="display:flex; align-items:center; gap:0.75rem; width:100%;">
                                <div class="progress-bar" style="flex:1; height:6px; background:var(--surface-2); overflow:hidden;"><div class="progress-fill" style="width:${progVal}%; background:var(--accent); height:100%;"></div></div>
                                <span style="font-size:0.75rem; font-weight:600; color:var(--text); font-variant-numeric:tabular-nums">${progVal}%</span>
                            </div>
                            `;
                        }
                    },
                    { label: 'Ação', align: 'right', render: (row) => `<button class="btn btn-ghost" style="padding:0.25rem 0.6rem; font-size:0.7rem;" data-action="openProjectDetail" data-args='["${row.id}"]'>Gerenciar</button>` }
                ],
                activeProjectsList.slice(0, 5),
                { emptyMessage: 'Nenhum projeto ativo.', emptyHint: 'O projeto nasce quando a proposta é aprovada; a jornada de adequação começa por ele.', emptyAction: `<button class="btn" data-action="navigate" data-args='["projects"]'>Ver projetos</button>` }
            );

            c.innerHTML = `
                <div class="fade-in">
                    <div id="ponto-de-partida"></div>
                    ${statsHtml}

                    <div class="card" id="progresso-controles" style="margin-bottom:1.5rem">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:0.75rem">
                            <h3 style="font-family:var(--font-head); font-weight:600; font-size:1rem; margin:0; color:var(--text)">Progresso de implementação dos controles</h3>
                            ${window.renderStatusBadge('info', `${complianceRate}% implementado`)}
                        </div>
                        <div class="progress-bar" style="height:8px; background:var(--surface-2); margin-bottom:1rem" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${complianceRate}" aria-label="Controles implementados">
                            <div class="progress-fill" style="width:${complianceRate}%; background:var(--accent); height:100%"></div>
                        </div>
                        <div style="display:flex; gap:1.5rem; font-size:0.8rem; color:var(--text-dim); font-variant-numeric:tabular-nums">
                            <div><strong style="color:var(--text)">Controles implementados:</strong> ${approvedControls}</div>
                            <div><strong style="color:var(--text)">Gaps restantes:</strong> ${gapsControls}</div>
                            <div><strong style="color:var(--text)">Total do SGSI:</strong> ${totalControls}</div>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap:1.5rem;">
                        <div>
                            <h3 style="font-family:'Montserrat',sans-serif; font-weight:500; font-size:1.05rem; margin-bottom:0.8rem; color:var(--text)">Levantamentos recentes</h3>
                            ${assessmentsTable}
                        </div>
                        <div>
                            <h3 style="font-family:'Montserrat',sans-serif; font-weight:500; font-size:1.05rem; margin-bottom:0.8rem; color:var(--text)">Projetos Ativos</h3>
                            ${projectsTable}
                        </div>
                    </div>
                </div>
            `;
            if (S.activeProject && S.activeProject.id) window.renderPontoDePartida(c.querySelector('#ponto-de-partida'), S.activeProject.id, 'iso');
        } catch (e) {
            c.innerHTML = '<div class="error">Erro ao carregar dashboard</div>';
        }
    }

    async function loadDashboardStats() { try { S.stats = await api('GET', '/api/v1/dashboard/stats'); } catch(e) { S.stats = {}; } }

export { renderDashboard };
window.renderDashboard = renderDashboard;
window.loadDashboardStats = loadDashboardStats;
