import { S } from '../state.js';
import { api, API_BASE } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML, STATUS_DA_FASE, formatarData, traduzStatus, tituloDaTela } from '../ui.js';
import { vazioSemFases } from './monitor.js';
import { navigate } from '../router.js';
import { DOC_WIZARDS } from '../data/wizards.js';
import { PRODUTOS, produtoAtual, modulosVisiveis, enderecoDoProduto, irPara } from '../produto.js';
import { podeCriarProjeto } from './empresa.js';

// Domínio canônico de evidence.evaluation_status (src/constants.ts, EVALUATION_STATUSES).
// O selo comparava com a grafia antiga ('conforme', 'parcial', 'nao conforme'), que o banco
// não usa mais: todo item aparecia pendente com borda vermelha.
const SELO_AVALIACAO = {
    conforming: { rotulo: 'Conforme', cor: 'var(--success)', problema: false },
    partial: { rotulo: 'Parcial', cor: 'var(--warning)', problema: true },
    non_conforming: { rotulo: 'Não conforme', cor: 'var(--danger)', problema: true },
};
window.seloDaAvaliacao = (status) => SELO_AVALIACAO[status] || { rotulo: 'Aguarda revisão', cor: 'var(--text-dim)', problema: false };

// A "Dica" de cada item sai do assistente do próprio item (frontend/src/data/wizards.js): antes eram duas listas
// separadas e as duas derivaram para itens errados. Uma fonte só, chaveada pelo id do checklist.
export const ISO_GUIDELINES = Object.fromEntries(Object.entries(DOC_WIZARDS).map(([id, w]) =>
    [id, { control: w.isoRef, tip: w.title, advice: w.auditorTip, evidence: w.evidence }]));

// Item do checklist que as entrevistas por trilha concluem: "Conduzir Entrevistas com Gestores".
const ITEM_ENTREVISTAS = 'p2_1';

/** Área de texto do rascunho (do assistente ou da IA) que a pessoa revisa antes de aprovar. */
const campoDoRascunho = (texto) => `<textarea id="wiz-doc-content" class="form-input" style="width:100%; height:350px; font-family:monospace; font-size:0.8rem; line-height:1.5; background:rgba(0,0,0,0.3); resize:vertical; padding:12px; color:var(--text); border:1px solid var(--border);">${escapeHTML(texto || '')}</textarea>`;

/** Texto do item do checklist (S.checklistsConfig, servido por /phases/config); o id só se o item não estiver carregado. */
function textoDoItem(itemId) {
    for (const itens of Object.values(S.checklistsConfig || {})) {
        const item = (itens || []).find((i) => i.id === itemId);
        if (item) return item.text;
    }
    return itemId;
}

// Os módulos (do projeto E da pessoa) em que a lista oferece "Abrir no": fora o do caminho, onde já se está.
const modulosParaAbrir = (p) => modulosVisiveis(p).filter((m) => (m === 'iso' || m === 'privacy') && m !== produtoAtual());

/** "Abrir no n.…" da lista: ativa o projeto, guarda-o para o outro caminho (o state o hidrata de lá) e vai ao módulo. */
window.abrirProjetoNoModulo = function abrirProjetoNoModulo(projectId, modulo) {
    const p = (S.projects || []).find((x) => x.id === projectId);
    if (!p || !modulosParaAbrir(p).includes(modulo)) return;
    S.activeProject = p;
    S.currentProject = p;
    try { localStorage.setItem('niso_activeProject', JSON.stringify(p)); } catch (e) { /* sem storage: o módulo abre no primeiro projeto */ }
    irPara(enderecoDoProduto(modulo));
};

    async function renderProjects(c, h, a) {
        h.textContent = window.produtoAtual() === 'iso' ? 'Gestão de Projetos ISO' : 'Projetos';
        // Criar projeto: platform_admin e administrador da consultoria (decisão do dono). Os demais não veem o botão.
        a.innerHTML = podeCriarProjeto() ? '<button class="btn btn-primary" data-action="abrirNovoProjeto">Novo projeto</button>' : '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            const projects = await api('GET', '/api/v1/projects');
            const projs = window.projetosDoProduto(projects); // só os projetos do módulo do caminho (no início do n.360, todos)
            
            // Sem faixa de KPIs — três contagens da lista que aparece logo abaixo não informam decisão nenhuma.
            const escopoDe = (p) => {
                if (p.standard) return p.standard;
                const m = p.modulos || ['iso'];
                return [m.includes('iso') ? 'ISO 27001:2022' : '', m.includes('privacy') ? 'LGPD' : ''].filter(Boolean).join(' · ') || '—';
            };
            const equipe = typeof window.ehEquipeNess === 'function' && window.ehEquipeNess();
            const tableHtml = window.renderDataTable(
                ['Cliente / Projeto', 'Setor / Ramo', 'Status', 'Escopo', 'Ações'],
                projs.map(p => {
                    const abrir = modulosParaAbrir(p);
                    const jornada = (p.modulos || ['iso']).includes('iso') && window.produtoAtual() === 'iso';
                    const nome = escapeHTML(p.client_name || p.project_name || 'Sem nome');
                    // Um só destino possível: o nome do cliente é o link e a linha não repete o botão.
                    const unico = !jornada && abrir.length === 1;
                    return [
                        unico
                            ? `<button class="btn-ghost" style="padding:0;font-size:inherit;font-weight:600;text-align:left" data-action="abrirProjetoNoModulo" data-args='${escapeHTML(JSON.stringify([p.id, abrir[0]]))}'>${nome}</button>`
                            : `<strong>${nome}</strong>`,
                        escapeHTML(p.sector || 'Geral'),
                        window.renderStatusBadge(p.status || 'active', p.status === 'completed' ? 'success' : 'info'),
                        escapeHTML(escopoDe(p)),
                        acoesDoProjeto(p, abrir, jornada, unico, equipe),
                    ];
                }),
                { emptyState: 'Nenhum projeto de implementação ativo no momento.' }
            );

            c.innerHTML = tableHtml;
        } catch (e) {
            window.falhaDeCarga(c, a, 'Não foi possível carregar os projetos.', e);
        }
    }

    // Uma ação à vista por linha (a jornada no n.iso, ou abrir no primeiro módulo); dados da empresa, módulos e os outros
    // destinos no "Mais ações" da linha. Nenhum primário por linha: o primário da tela é "Novo projeto".
    function acoesDoProjeto(p, abrir, jornada, unico, equipe) {
        const abrirEm = (m) => ({ rotulo: `Abrir no n.${m}`, action: 'abrirProjetoNoModulo', args: [p.id, m] });
        const destinos = unico ? [] : abrir.map(abrirEm);
        const aVista = jornada ? { rotulo: 'Gerenciar jornada', action: 'openProjectDetail', args: [p.id] } : destinos.shift();
        const botao = aVista ? `<button class="btn btn-secondary btn-sm" data-action="${aVista.action}" data-args='${escapeHTML(JSON.stringify(aVista.args))}'>${aVista.rotulo}</button>` : '';
        const resto = [...destinos, { rotulo: 'Dados da empresa', action: 'abrirDadosEmpresa', args: [p.id] },
            equipe && { rotulo: 'Módulos do projeto', action: 'abrirProdutosDoProjeto', args: [p.id] }];
        return `<div class="acoes-linha">${botao}${window.renderMaisAcoes(resto, { nome: p.client_name || p.project_name || '' })}</div>`;
    }

    async function openProjectDetail(id) {
        try {
            const p = await api('GET', `/api/v1/projects/${id}`);
            S.activeProject = p;
            S.currentProject = p;
            navigate('project-detail');
        } catch(e) { showToast('Erro ao carregar projeto', 'error'); }
    }

    const CATEGORIA_DO_ITEM = { task: 'Tarefa', document: 'Documento', evidence: 'Evidência' };

    /** Começar a jornada: carrega as fases num projeto sem elas (só a equipe; o servidor recusa o resto e não duplica). */
    window.carregarFases = async function (projectId) {
        try {
            await api('POST', `/api/v1/projects/${projectId}/phases`);
            showToast('Fases da jornada carregadas', 'success');
            navigate('project-detail');
        } catch (e) { showToast(`Não foi possível carregar as fases: ${e.message}`, 'error'); }
    };

    async function renderProjectDetail(c, h, a) {
        let p = S.currentProject || S.activeProject;
        if (!p || !p.id) {
            if (Array.isArray(S.projects) && S.projects.length > 0) {
                p = S.projects[0];
                S.activeProject = p;
                S.currentProject = p;
            } else {
                try {
                    const projs = await api('GET', '/api/v1/projects');
                    if (Array.isArray(projs) && projs.length > 0) {
                        p = projs[0];
                        S.activeProject = p;
                        S.currentProject = p;
                    }
                } catch (err) { /* sem projeto: a lista de projetos abaixo mostra a falha */ }
            }
        }
        if (!p || !p.id) { navigate('projects'); return; }
        h.textContent = tituloDaTela('nav-project', 'Jornada');
        if (!S.expandedJourneys) S.expandedJourneys = {};
        if (!S.expandedPhases) S.expandedPhases = {};
        a.innerHTML = `<button class="btn mr-2" data-action="abrirDadosEmpresa" data-args='${escapeHTML(JSON.stringify([p.id]))}'>Dados da empresa</button><button class="btn mr-2" data-action="openAuditorNotesModal" data-args='["${p.id}"]'>Notas do Auditor</button><button class="btn btn-ghost" data-action="navigate" data-args='["projects"]'>&larr; Voltar</button>`;
        c.innerHTML = '<div class="loading"></div>';
        
        try {
            const [phases, config, checklistProgress, governanceMembers, phaseQuestions, phaseAnswers, prontidao] = await Promise.all([
                api('GET', `/api/v1/projects/${p.id}/phases`),
                S.checklistsConfig ? Promise.resolve(S.checklistsConfig) : api('GET', '/api/v1/phases/config'),
                // Secundários (progresso, governança, perguntas e respostas): sem eles a jornada abre sem as marcas.
                api('GET', `/api/v1/projects/${p.id}/checklist-progress`).catch(() => []),
                api('GET', `/api/v1/projects/${p.id}/governance`).catch(() => []),
                S.phaseQuestions ? Promise.resolve(S.phaseQuestions) : api('GET', '/api/v1/phase-questions').catch(() => ({})),
                api('GET', `/api/v1/projects/${p.id}/phase-answers`).catch(() => []),
                // O indicador de progresso (controles aplicáveis implementados) é o da prontidão: o mesmo do Painel e do Monitor.
                api('GET', `/api/v1/projects/${p.id}/prontidao`).catch(() => null),
            ]);
            // Banco de perguntas por fase (cacheado) + respostas do projeto (mapa fase→{key:answer}).
            S.phaseQuestions = phaseQuestions || {};
            S.phaseAnswers = {};
            (Array.isArray(phaseAnswers) ? phaseAnswers : []).forEach(r => {
                (S.phaseAnswers[r.phase_number] = S.phaseAnswers[r.phase_number] || {})[r.question_key] = r.answer;
            });
            
            S.checklistsConfig = (config && config.checklists) ? config.checklists : (config || {});
            S.currentGovernance = governanceMembers || [];
            // ponytail: hydrate phaseChecks and metadata from D1 (server wins over stale localStorage)
            if (!S.phaseChecksNotes) S.phaseChecksNotes = {};
            if (!S.phaseChecksAssigned) S.phaseChecksAssigned = {};
            if (!S.phaseChecksDueDate) S.phaseChecksDueDate = {};
            if (!S.phaseChecksEvidence) S.phaseChecksEvidence = {};
            if (!S.phaseChecksStatus) S.phaseChecksStatus = {};
            if (!S.phaseChecksEvaluationNotes) S.phaseChecksEvaluationNotes = {};
            if (Array.isArray(checklistProgress)) {
                checklistProgress.forEach(row => {
                    S.phaseChecks[p.id + '_' + row.item_id] = !!row.is_checked;
                    S.phaseChecksNotes[p.id + '_' + row.item_id] = row.notes || '';
                    S.phaseChecksAssigned[p.id + '_' + row.item_id] = row.assigned_to || '';
                    S.phaseChecksDueDate[p.id + '_' + row.item_id] = row.due_date || '';
                    S.phaseChecksEvidence[p.id + '_' + row.item_id] = row.evidence_id || '';
                    S.phaseChecksStatus[p.id + '_' + row.item_id] = row.evaluation_status || '';
                    S.phaseChecksEvaluationNotes[p.id + '_' + row.item_id] = row.evaluation_notes || '';
                });
                localStorage.setItem('niso_phaseChecks', JSON.stringify(S.phaseChecks));
                localStorage.setItem('niso_phaseChecksNotes', JSON.stringify(S.phaseChecksNotes));
                localStorage.setItem('niso_phaseChecksAssigned', JSON.stringify(S.phaseChecksAssigned));
                localStorage.setItem('niso_phaseChecksDueDate', JSON.stringify(S.phaseChecksDueDate));
            }
            
            const JOURNEYS = [
                { name: "Etapa 1: Mobilização e Diagnóstico", range: [0, 6], desc: "Planejamento inicial, entrevistas, escopo e diagnóstico GRC" },
                { name: "Etapa 2: Mapeamento e Riscos", range: [7, 13], desc: "Ativos, processos, riscos de segurança/privacidade e SoA" },
                { name: "Etapa 3: Implementação SGSI (ISO 27001)", range: [14, 20], desc: "Desenho da arquitetura documental e implementação de controles práticos" },
                { name: "Etapa 4: Implementação SGPI (ISO 27701)", range: [21, 28], desc: "Implementação prática do programa de privacidade e direitos de titulares" },
                { name: "Etapa 5: Operação e Auditoria", range: [29, 33], desc: "Treinamentos, métricas operacionais, auditoria interna e revisão pela direção" },
                { name: "Etapa 6: Certificação Oficial", range: [34, 40], desc: "Melhorias contínuas, auditorias de certificação estágio 1 e 2" }
            ];

            const allPhases = Array.isArray(phases) ? phases : [];
            const totalPhasesCount = allPhases.length;
            const completedPhasesCount = allPhases.filter(ph => ph.status === 'completed').length;
            const blockedPhasesCount = allPhases.filter(ph => ph.status === 'blocked').length;

            const statusFilter = S.jornadaStatusFilter || 'all';
            const categoryFilter = S.jornadaCategoryFilter || 'all';
            const searchQuery = (S.jornadaSearchQuery || '').toLowerCase().trim();

            const equipe = typeof window.ehEquipeNess === 'function' && window.ehEquipeNess();
            const bloqueadas = allPhases.filter(ph => ph.status === 'blocked');
            const ind = prontidao && prontidao.indicador;
            // Um indicador de progresso só, com a definição escrita; as fases medem o plano de trabalho, não a conformidade.
            const metricsHtml = `
                <div class="jornada-numeros">
                    <div><div class="jornada-numero">${ind ? `${ind.implementados} de ${ind.aplicaveis}` : '—'}</div>
                        <div class="jornada-rotulo">${ind ? 'controles aplicáveis implementados' : 'Não foi possível carregar o indicador de controles; tente de novo em instantes.'}</div></div>
                    <div><div class="jornada-numero">${completedPhasesCount} de ${totalPhasesCount}</div>
                        <div class="jornada-rotulo">fases da jornada concluídas (o andamento do plano de trabalho)</div></div>
                    <div><div class="jornada-numero">${blockedPhasesCount}</div>
                        <div class="jornada-rotulo">${blockedPhasesCount ? `${blockedPhasesCount === 1 ? 'fase bloqueada' : 'fases bloqueadas'}: ${escapeHTML(bloqueadas.map(ph => `Fase ${ph.phase_number}`).join(', '))}` : 'fases bloqueadas'}</div></div>
                </div>
            `;

            const filtersHtml = `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:1.5rem; background:rgba(255,255,255,0.01); padding:10px 16px; border:1px solid var(--border); backdrop-filter: var(--glass-blur);">
                    <div class="relativo flex-1">
                        <input type="text" class="form-input" style="width:100%; padding-left:2.25rem; font-size:0.8rem; height:38px; background: rgba(255,255,255,0.02); border-color: var(--border);" placeholder="Buscar fase ou atividade..." value="${escapeHTML(S.jornadaSearchQuery || '')}" data-action-input="__setFilter" data-args='["jornadaSearchQuery"]' data-arg-val>
                        <svg viewBox="0 0 24 24" style="position:absolute; left:10px; top:10px; width:18px; height:18px; stroke:var(--text-dim); stroke-width:2; fill:none; pointer-events:none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </div>
                    <div class="d-flex gap-3">
                        <div class="d-flex items-center gap-2">
                            <label class="t-sm t-dim caixa-alta fw-600">Status</label>
                            <select class="form-input" style="height:38px; padding:0 12px; font-size:0.8rem; background: rgba(255,255,255,0.02); border-color: var(--border);" data-action-change="__setFilter" data-args='["jornadaStatusFilter"]' data-arg-val>
                                <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>Todos</option>
                                ${Object.entries(STATUS_DA_FASE).map(([k, v]) => `<option value="${k}" ${statusFilter === k ? 'selected' : ''}>${v}</option>`).join('')}
                            </select>
                        </div>
                        <div class="d-flex items-center gap-2">
                            <label class="t-sm t-dim caixa-alta fw-600">Categoria</label>
                            <select class="form-input" style="height:38px; padding:0 12px; font-size:0.8rem; background: rgba(255,255,255,0.02); border-color: var(--border);" data-action-change="__setFilter" data-args='["jornadaCategoryFilter"]' data-arg-val>
                                <option value="all" ${categoryFilter === 'all' ? 'selected' : ''}>Todas</option>
                                ${Object.entries(CATEGORIA_DO_ITEM).map(([k, v]) => `<option value="${k}" ${categoryFilter === k ? 'selected' : ''}>${v}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            `;

            let journeysHtml = '';
            
            JOURNEYS.forEach((journeyItem, journeyIdx) => {
                const jPhases = Array.isArray(phases) ? phases.filter(ph => ph.phase_number >= journeyItem.range[0] && ph.phase_number <= journeyItem.range[1]) : [];
                
                // Filter phases inside this journey
                let filteredPhases = jPhases.filter(ph => {
                    if (statusFilter !== 'all' && ph.status !== statusFilter) return false;
                    const phRaw = S.checklistsConfig ? (S.checklistsConfig[ph.phase_number] || (S.checklistsConfig.checklists && S.checklistsConfig.checklists[ph.phase_number])) : [];
                    const phChecklist = Array.isArray(phRaw) ? phRaw : [];
                    const matchingItems = phChecklist.filter(item => {
                        if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
                        if (searchQuery) {
                            return item.text.toLowerCase().includes(searchQuery);
                        }
                        return true;
                    });
                    if (searchQuery) {
                        const phaseTitleMatch = ph.title.toLowerCase().includes(searchQuery) || String(ph.phase_number).includes(searchQuery);
                        if (phaseTitleMatch) return true;
                        return matchingItems.length > 0;
                    }
                    if (categoryFilter !== 'all') {
                        return matchingItems.length > 0;
                    }
                    return true;
                });

                if (filteredPhases.length === 0 && (searchQuery || statusFilter !== 'all' || categoryFilter !== 'all')) {
                    return;
                }

                const completedCount = jPhases.filter(ph => ph.status === 'completed').length;
                const totalCount = jPhases.length;
                const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
                
                const isJExpanded = (S.expandedJourneys && S.expandedJourneys[journeyIdx]) === true;
                
                journeysHtml += `
                    <div class="journey-card fade-in">
                        <div class="journey-header" data-action="toggleJourney" data-args='["${journeyIdx}"]'>
                            <div class="journey-title-container">
                                <div class="journey-title">${escapeHTML(journeyItem.name)}</div>
                                <div class="journey-meta">${escapeHTML(journeyItem.desc)}</div>
                            </div>
                            <div class="journey-prog-wrapper">
                                <div class="journey-meta">${completedCount} de ${totalCount} fases</div>
                                <div class="progress-bar" style="flex:1; max-width: 120px">
                                    <div class="progress-fill" style="width: ${percent}%"></div>
                                </div>
                            </div>
                            <div class="journey-toggle-icon ${isJExpanded ? 'expanded' : ''}">&darr;</div>
                        </div>
                        <div class="journey-content ${isJExpanded ? 'expanded' : ''}" id="j-content-${journeyIdx}">
                            ${filteredPhases.map(ph => {
                                const isPhExpanded = (S.expandedPhases && S.expandedPhases[ph.phase_number]) === true;
                                const phItemRaw = S.checklistsConfig ? (S.checklistsConfig[ph.phase_number] || (S.checklistsConfig.checklists && S.checklistsConfig.checklists[ph.phase_number])) : [];
                                const phChecklist = Array.isArray(phItemRaw) ? phItemRaw : [];
                                const filteredItems = phChecklist.filter(item => {
                                    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
                                    if (searchQuery) {
                                        const matchText = item.text.toLowerCase().includes(searchQuery);
                                        const phaseTitleMatch = ph.title.toLowerCase().includes(searchQuery) || String(ph.phase_number).includes(searchQuery);
                                        return matchText || phaseTitleMatch;
                                    }
                                    return true;
                                });
                                
                                return `
                                    <div class="phase-card">
                                        <div class="phase-card-header" data-action="togglePhase" data-args='["${ph.phase_number}"]'>
                                            <div class="phase-card-title">
                                                <div class="phase-num">${ph.phase_number}</div>
                                                <div class="title-text">${escapeHTML(ph.title)}</div>
                                            </div>
                                            <div class="phase-actions-wrapper" data-action="__noop">
                                                ${equipe ? `<select class="phase-status-select" aria-label="Situação da fase ${ph.phase_number}" data-action-change="changePhaseStatus" data-args='["${p.id}","${ph.phase_number}"]' data-arg-el>
                                                    ${Object.entries(STATUS_DA_FASE).map(([k, v]) => `<option value="${k}" ${ph.status === k ? 'selected' : ''}>${v}</option>`).join('')}
                                                </select>` : `<span class="phase-status-texto">${escapeHTML(STATUS_DA_FASE[ph.status] || ph.status || '')}</span>`}
                                                <div class="phase-toggle-icon ${isPhExpanded ? 'expanded' : ''}" data-action="togglePhase" data-args='["${ph.phase_number}"]'>&darr;</div>
                                            </div>
                                        </div>
                                        <div class="phase-details ${isPhExpanded ? 'expanded' : ''}" id="p-details-${ph.phase_number}">
                                            ${ph.notes ? `
                                                <div class="t-sm t-dim mb-4 p-2 bg-sutil borda">
                                                    <strong>Notas:</strong> ${escapeHTML(ph.notes)}
                                                </div>
                                            ` : ''}
                                            
                                            ${(window.PHASE_PLAYBOOKS && window.PHASE_PLAYBOOKS[ph.phase_number]) ? `
                                                <div class="playbook-card mb-5 p-3 bg-surface borda t-sm">
                                                    <div class="fw-500 t-texto mb-1 f-titulo caixa-alta t-xs">Diretriz do Consultor: ${escapeHTML(window.PHASE_PLAYBOOKS[ph.phase_number].obj)}</div>
                                                    <div class="t-texto lh-14">${escapeHTML(window.PHASE_PLAYBOOKS[ph.phase_number].guideline)}</div>
                                                </div>
                                            ` : ''}

                                            ${(S.phaseQuestions && S.phaseQuestions[ph.phase_number] && S.phaseQuestions[ph.phase_number].length) ? `
                                                <div style="margin-bottom:1.25rem; padding:12px; background:rgba(255,255,255,0.02); border:1px dashed var(--border); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap">
                                                    <div class="t-xs t-dim"><strong>Questionário da fase</strong> — ${Object.values((S.phaseAnswers && S.phaseAnswers[ph.phase_number]) || {}).filter(v => v != null && String(v).trim() !== '').length}/${S.phaseQuestions[ph.phase_number].length} respondidas</div>
                                                    <div class="d-flex gap-2">
                                                        ${Object.values((S.phaseAnswers && S.phaseAnswers[ph.phase_number]) || {}).filter(v => v != null && String(v).trim() !== '').length > 0 ? `<button class="btn-inline-action" data-action="interpretPhaseAnswers" data-args='["${ph.phase_number}","${p.id}"]'>Interpretar</button><button class="btn-inline-action" data-action="suggestControlAdequacao" data-args='["${ph.phase_number}","${p.id}"]'>Adequar controles</button>` : ''}
                                                        <button class="btn-inline-action borda-accent t-accent fw-600" data-action="openPhaseQuestionnaire" data-args='["${ph.phase_number}","${p.id}"]'>Responder</button>
                                                    </div>
                                                </div>
                                            ` : ''}

                                            <div class="checklist-title">Checklist de Conformidade (${phChecklist.length} itens)</div>
                                            ${filteredItems.length > 0 ? `
                                                <div class="checklist-list">
                                                    ${filteredItems.map(item => {
                                                        const checkKey = `${p.id}_${item.id}`;
                                                        const isChecked = S.phaseChecks[checkKey] === true;
                                                        const itemNotes = (S.phaseChecksNotes && S.phaseChecksNotes[checkKey]) || '';
                                                        const itemAssigned = (S.phaseChecksAssigned && S.phaseChecksAssigned[checkKey]) || '';
                                                        const itemDueDate = (S.phaseChecksDueDate && S.phaseChecksDueDate[checkKey]) || '';
                                                        const itemEvidenceId = (S.phaseChecksEvidence && S.phaseChecksEvidence[checkKey]) || '';
                                                        const itemStatus = (S.phaseChecksStatus && S.phaseChecksStatus[checkKey]) || '';
                                                        const itemEvalNotes = (S.phaseChecksEvaluationNotes && S.phaseChecksEvaluationNotes[checkKey]) || '';
                                                        const isDetailsExpanded = S.expandedChecklistDetails && S.expandedChecklistDetails[item.id] === true;
                                                        
                                                        const hasTip = !!ISO_GUIDELINES[item.id];
                                                        const isTipExpanded = S.expandedTips && S.expandedTips[item.id] === true;
                                                        const tipInfo = ISO_GUIDELINES[item.id];

                                                        let badgeHtml = '';
                                                        const selo = window.seloDaAvaliacao(itemStatus);
                                                        if (isChecked && itemEvidenceId) {
                                                            badgeHtml = `<span style="font-size:0.72rem; padding:2px 6px; border:1px solid ${selo.cor}; color:${selo.cor}; margin-left:8px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">${selo.rotulo}</span>`;
                                                        }

                                                        let borderLeftColor = 'rgba(255, 255, 255, 0.06)';
                                                        if (isChecked) {
                                                            borderLeftColor = selo.problema ? 'var(--danger)' : 'var(--success)';
                                                        }

                                                        return `
                                                            <div class="checklist-item-wrapper" style="margin-bottom: 0.75rem; background: rgba(255,255,255,0.01); border: 1px solid var(--border); border-left: 1px solid ${borderLeftColor}; padding: 0.75rem;">
                                                                <div class="d-flex items-center justify-between gap-3">
                                                                    <div class="checklist-left d-flex items-center gap-2 flex-1">
                                                                        <input type="checkbox" class="checklist-item-checkbox" 
                                                                            ${isChecked ? 'checked' : ''} 
                                                                            data-action="toggleChecklistItem" data-args='["${p.id}","${item.id}"]' data-arg-el
                                                                            ${(!isChecked && item.id === ITEM_ENTREVISTAS) ? 'disabled' : ''}>
                                                                        <span class="badge-cat ${item.category}">${CATEGORIA_DO_ITEM[item.category] || escapeHTML(item.category || '')}</span>
                                                                        <span class="checklist-text ${isChecked ? 'checked' : ''}">${escapeHTML(item.text)}</span>
                                                                        ${badgeHtml}
                                                                        ${hasTip ? `
                                                                            <button class="btn-ghost" data-action="toggleAuditorTip" data-args='["${item.id}"]' style="font-size:0.85rem; padding:2px 6px; color:var(--accent); line-height:1; display:inline-flex; align-items:center; justify-content:center;" title="Ver dica do auditor">Dica</button>
                                                                        ` : ''}
                                                                    </div>
                                                                    <div class="checklist-actions d-flex items-center gap-2">
                                                                        ${itemEvidenceId ? `
                                                                            <button class="btn-inline-action borda-accent t-accent" data-action="openInternalDocumentEditor" data-args='["${itemEvidenceId}"]'>Editar Doc</button>
                                                                        ` : ''}
                                                                        ${(item.category === 'evidence' || item.category === 'document') ? `
                                                                            <button class="btn-inline-action" data-action="wsUploadEvidence" data-args='["${item.id}"]'>Enviar</button>
                                                                        ` : ''}
                                                                        ${(!isChecked && (item.category === 'document' || DOC_WIZARDS[item.id])) ? `
                                                                            <button class="btn-inline-action primary" data-action="openDocWizard" data-args='["${p.id}","${item.id}"]'>${DOC_WIZARDS[item.id] ? (DOC_WIZARDS[item.id].evidenceOnly ? 'Registrar Evidência' : 'Preencher e Gerar') : 'Gerar IA'}</button>
                                                                        ` : ''}
                                                                        ${(item.id === ITEM_ENTREVISTAS) ? `
                                                                            <button class="btn-inline-action primary" data-action="openInterviewWizard" data-args='["${p.id}"]'>${isChecked ? 'Ver Entrevistas' : 'Conduzir Entrevistas'}</button>
                                                                        ` : ''}
                                                                        <button class="btn-ghost" data-action="toggleChecklistDetails" data-args='["${item.id}"]' style="font-size:0.75rem; color:${isDetailsExpanded ? 'var(--accent)' : 'var(--text-dim)'}; padding:4px 6px; display:inline-flex; align-items:center;" title="Editar detalhes, responsável e prazo">Editar</button>
                                                                    </div>
                                                                </div>
                                                                ${(hasTip && isTipExpanded) ? `
                                                                    <div style="margin-top:0.6rem; background:rgba(0,173,232,0.03); border:1px solid rgba(0,173,232,0.1); padding:10px; font-size:0.75rem; text-align: left;">
                                                                        <div class="t-accent fw-600 mb-1 caixa-alta t-xs">Auditoria (${escapeHTML(tipInfo.control)}) - ${escapeHTML(tipInfo.tip)}</div>
                                                                        <div class="t-texto mb-15"><strong class="t-dim">Dica:</strong> ${escapeHTML(tipInfo.advice)}</div>
                                                                        <div class="t-dim"><strong class="t-dim">Evidência Recomendada:</strong> ${escapeHTML(tipInfo.evidence)}</div>
                                                                    </div>
                                                                ` : ''}
                                                                ${(isChecked && selo.problema && itemEvalNotes) ? `
                                                                    <div style="margin-top:0.6rem; background:rgba(255,77,77,0.03); border:1px solid rgba(255,77,77,0.15); padding:10px; font-size:0.75rem; text-align: left;">
                                                                        <div class="t-perigo fw-600 mb-1 caixa-alta t-xs">Lacunas apontadas na avaliação</div>
                                                                        <div class="t-texto">${escapeHTML(itemEvalNotes)}</div>
                                                                    </div>
                                                                ` : ''}
                                                                ${isDetailsExpanded ? `
                                                                    <div class="checklist-notes-group" style="margin-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.04); padding-top: 0.5rem;">
                                                                        <div class="t-sm t-dim mb-1">Anotação / Conteúdo da Atividade</div>
                                                                        ${itemNotes.trim().startsWith('{') && itemNotes.trim().endsWith('}') ? formatActivityNotes(itemNotes) : ''}
                                                                        <textarea class="form-input" 
                                                                            placeholder="Digite aqui para registrar informações (Ex: nome do sponsor executivo, link do documento, etc.)"
                                                                            style="width: 100%; height: 50px; background: rgba(0,0,0,0.2); border: 1px solid var(--border); padding: 6px 10px; color: var(--text); font-size: 0.7rem; font-family: inherit; resize: vertical; margin-bottom: 0.5rem;"
                                                                            data-action-blur="saveChecklistItemNotes" data-args='["${p.id}","${ph.phase_number}","${item.id}"]' data-arg-val>${itemNotes.trim().startsWith('{') && itemNotes.trim().endsWith('}') ? '' : escapeHTML(itemNotes)}</textarea>
                                                                        
                                                                        <div class="d-flex gap-3 items-center">
                                                                            <div class="flex-1">
                                                                                <div class="t-xs t-dim mb-1">Responsável</div>
                                                                                <select class="form-input w-full t-xs bg-fundo borda py-1 px-2 t-texto"
                                                                                    data-action-change="saveChecklistItemAssigned" data-args='["${p.id}","${ph.phase_number}","${item.id}"]' data-arg-val>
                                            ${window.renderGovernanceSelectOptions(S.currentGovernance, itemAssigned)}
                                            </select>
                                                                            </div>
                                                                            <div style="width: 150px;">
                                                                                <div class="t-xs t-dim mb-1">Prazo</div>
                                                                                <input type="date" class="form-input w-full t-xs bg-fundo borda py-05 px-2 t-texto"
                                                                                    value="${itemDueDate}"
                                                                                    data-action-change="saveChecklistItemDueDate" data-args='["${p.id}","${ph.phase_number}","${item.id}"]' data-arg-val>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ` : ''}
                                                            </div>
                                                        `;
                                                    }).join('')}
                                                </div>
                                            ` : window.renderEmptyState({ titulo: 'Nenhum item de checklist para esta fase.', compacto: true })}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            });
            
            // Sem fases, contadores "0 de 0" e filtros sobre lista vazia não dizem nada: o vazio explica.
            // Sem fases, o primeiro passo real (carregar as fases, ou a prontidão), nunca o Monitor nem a lista de projetos.
            c.innerHTML = totalPhasesCount === 0 ? vazioSemFases(p.id) : `
                <div class="mt-2">
                    ${metricsHtml}
                    <div class="d-flex justify-end mb-3">
                        <button class="btn" data-action="navigate" data-args='["certification"]'>Ver a prontidão para a certificação</button>
                        <button class="btn" data-action="generateJourneyDossier" data-args='["${p.id}"]'>Gerar dossiê da jornada</button>
                    </div>
                    ${filtersHtml}
                    ${journeysHtml || window.renderEmptyState({ titulo: 'Nenhuma fase corresponde aos filtros', texto: 'Limpe a busca ou troque o status e a categoria para ver as fases.' })}
                </div>
            `;
            if (window.refreshDoDDrawer) window.refreshDoDDrawer();
        } catch (e) {
            // `a` fica: "Voltar" e os atalhos do projeto continuam valendo.
            window.falhaDeCarga(c, null, 'Não foi possível carregar a jornada do projeto.', e);
        }
    }

    window.changeActiveProject = async function(projectId) {
        if (!projectId) {
            S.activeProject = null;
            S.currentProject = null;
            localStorage.removeItem('niso_activeProject');
            updateActiveProjectWidget();
            navigate(PRODUTOS[produtoAtual()].inicio);
            return;
        }
        try {
            const p = S.projects.find(proj => proj.id === projectId) || await api('GET', `/api/v1/projects/${projectId}`);
            S.activeProject = p;
            S.currentProject = p;
            localStorage.setItem('niso_activeProject', JSON.stringify(p));
            updateActiveProjectWidget();
            // No n.360 fica na tela do hub (a certificação é do n.iso, e o projeto pode ser só n.privacy); da lista, nos módulos,
            // o n.iso abre a certificação e o n.privacy o início dele.
            const produto = produtoAtual();
            const daLista = S.view === 'projects' || S.view === 'project-detail';
            navigate(produto === 'n360' ? (S.view || 'inicio') : daLista ? (produto === 'iso' ? 'certification' : PRODUTOS[produto].inicio) : (S.view || PRODUTOS[produto].inicio));
        } catch(e) {
            showToast('Erro ao mudar de projeto', 'error');
        }
    };

    window.openDocWizard = function(projectId, itemId) {
        const wiz = DOC_WIZARDS[itemId];
        if (!wiz) { generateDocumentNatively(projectId, itemId, event.target); return; }

        // Pre-fill from existing notes if available
        const noteKey = projectId + '_' + itemId;
        let savedAnswers = {};
        try {
            const raw = (S.phaseChecksNotes && S.phaseChecksNotes[noteKey]) || '';
            if (raw.trim().startsWith('{') && raw.trim().endsWith('}')) savedAnswers = JSON.parse(raw);
        } catch (e) { /* nota que não é JSON: o assistente abre em branco */ }

        let fieldsHtml = wiz.fields.map(f => {
            const val = savedAnswers[f.id] || '';
            const escapedVal = typeof val === 'string' ? val.replace(/"/g, '&quot;').replace(/</g, '&lt;') : val;
            const req = f.required ? '<span class="t-perigo">*</span>' : '';
            let input = '';
            if (f.type === 'textarea') {
                input = `<textarea id="wiz-${f.id}" class="form-input" style="width:100%; min-height:80px; font-size:0.8rem; resize:vertical; background:rgba(0,0,0,0.2); border:1px solid var(--border); padding:8px 12px; color:var(--text); font-family:inherit;" placeholder="${f.placeholder || ''}">${escapedVal}</textarea>`;
            } else if (f.type === 'select') {
                const opts = (f.options || []).map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
                input = `<select id="wiz-${f.id}" class="form-input w-full t-md bg-fundo borda py-15 px-3 t-texto"><option value="">Selecionar...</option>${opts}</select>`;
            } else if (f.type === 'date') {
                input = `<input type="date" id="wiz-${f.id}" class="form-input w-full t-md bg-fundo borda py-15 px-3 t-texto" value="${escapedVal}">`;
            } else {
                input = `<input type="text" id="wiz-${f.id}" class="form-input w-full t-md bg-fundo borda py-15 px-3 t-texto" value="${escapedVal}" placeholder="${f.placeholder || ''}">`;
            }
            return `<div class="mb-4"><label class="t-sm t-dim fw-500 d-block mb-1">${f.label} ${req}</label>${input}</div>`;
        }).join('');

        openModal(`
            <div class="modal-header">
                <span class="modal-title">${escapeHTML(wiz.title)}</span>
                
            </div>
            <div class="py-6 px-0">
                <div style="background:rgba(0,173,232,0.04); border:1px solid rgba(0,173,232,0.1); padding:12px; margin-bottom:1.25rem; font-size:0.75rem;">
                    <div class="t-accent fw-600 mb-1 caixa-alta t-sm">Dica do Auditor (${wiz.isoRef})</div>
                    <div class="t-texto lh-14">${escapeHTML(wiz.auditorTip)}</div>
                </div>
                <div id="wiz-form-fields">${fieldsHtml}</div>
                <div id="wiz-preview-area" style="display:none;"></div>
                <div id="wiz-actions" class="d-flex justify-end gap-25 mt-5">
                    <button class="btn bg-sutil-2 borda-cor" data-action="forceCloseModal">Cancelar</button>
                    <button class="btn borda-accent t-accent" data-action="wizSaveProgress" data-args='["${projectId}","${itemId}"]'>Salvar Rascunho</button>
                    <button class="btn btn-primary" id="wiz-generate-btn" data-action="wizGenerate" data-args='["${projectId}","${itemId}"]' data-arg-el>Gerar Documento</button>
                </div>
            </div>
        `, 'modal-large');
    };

    window.wizCollectFields = function(itemId) {
        const wiz = DOC_WIZARDS[itemId];
        if (!wiz) return {};
        const data = {};
        wiz.fields.forEach(f => {
            const el = document.getElementById('wiz-' + f.id);
            if (el) data[f.id] = el.value || '';
        });
        return data;
    };

    window.wizSaveProgress = function(projectId, itemId) {
        const data = wizCollectFields(itemId);
        const noteKey = projectId + '_' + itemId;
        if (!S.phaseChecksNotes) S.phaseChecksNotes = {};
        S.phaseChecksNotes[noteKey] = JSON.stringify(data);
        localStorage.setItem('niso_phaseChecksNotes', JSON.stringify(S.phaseChecksNotes));
        showToast('Rascunho salvo localmente');
    };

    window.wizGenerate = async function(projectId, itemId, btnEl) {
        const wiz = DOC_WIZARDS[itemId];
        const data = wizCollectFields(itemId);
        // Validate required fields
        const missing = wiz.fields.filter(f => f.required && !data[f.id]);
        if (missing.length > 0) {
            showToast('Preencha os campos obrigatórios: ' + missing.map(f => f.label).join(', '), 'error');
            return;
        }
        // Save progress first
        wizSaveProgress(projectId, itemId);
        const prevText = btnEl.textContent;
        btnEl.disabled = true;

        // ponytail: evidenceOnly items generate document locally without AI
        if (wiz.evidenceOnly) {
            btnEl.textContent = 'Gerando registro...';
            let content = '# ' + wiz.title + '\n\n';
            content += '**Referência ISO:** ' + wiz.isoRef + '\n';
            content += '**Data de registro:** ' + formatarData(new Date()) + '\n\n';
            content += '---\n\n';
            wiz.fields.forEach(f => {
                if (data[f.id]) content += '## ' + f.label + '\n' + data[f.id] + '\n\n';
            });
            if (wiz.auditorTip) content += '---\n\n> **Nota do Auditor:** ' + wiz.auditorTip + '\n';
            if (wiz.linkedTo) content += '\n> **Vinculado a:** ' + wiz.linkedTo + '\n';
            // Show preview directly
            document.getElementById('wiz-form-fields').style.display = 'none';
            const preview = document.getElementById('wiz-preview-area');
            preview.style.display = 'block';
            preview.innerHTML = `
                <div class="mb-3 t-sm t-accent fw-600 caixa-alta">Preview do Registro de Evidência</div>
                ${campoDoRascunho(content)}
            `;
            document.getElementById('wiz-actions').innerHTML = `
                <button class="btn bg-sutil-2 borda-cor" data-action="wizBackToForm" data-args='["${projectId}","${itemId}"]'>Voltar e Editar</button>
                <button class="btn btn-primary" data-action="wizApprove" data-args='["${projectId}","${itemId}"]' data-arg-el>Confirmar e Registrar Evidência</button>
            `;
            btnEl.disabled = false;
            btnEl.textContent = prevText;
            return;
        }

        btnEl.textContent = 'Gerando documento...';
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/generate-document`, { itemId, fields: data });
            // Show preview
            document.getElementById('wiz-form-fields').style.display = 'none';
            const preview = document.getElementById('wiz-preview-area');
            preview.style.display = 'block';
            preview.innerHTML = `
                <div class="mb-3 t-sm t-accent fw-600 caixa-alta">Preview do Documento Gerado</div>
                ${campoDoRascunho(res.content)}
            `;
            document.getElementById('wiz-actions').innerHTML = `
                <button class="btn bg-sutil-2 borda-cor" data-action="wizBackToForm" data-args='["${projectId}","${itemId}"]'>Voltar e Editar Dados</button>
                <button class="btn btn-primary" data-action="wizApprove" data-args='["${projectId}","${itemId}"]' data-arg-el>Aprovar e Salvar como Evidência</button>
            `;
        } catch(e) {
            showToast('Erro ao gerar documento: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.wizBackToForm = function(projectId, itemId) {
        document.getElementById('wiz-form-fields').style.display = 'block';
        document.getElementById('wiz-preview-area').style.display = 'none';
        document.getElementById('wiz-actions').innerHTML = `
            <button class="btn bg-sutil-2 borda-cor" data-action="forceCloseModal">Cancelar</button>
            <button class="btn borda-accent t-accent" data-action="wizSaveProgress" data-args='["${projectId}","${itemId}"]'>Salvar Rascunho</button>
            <button class="btn btn-primary" id="wiz-generate-btn" data-action="wizGenerate" data-args='["${projectId}","${itemId}"]' data-arg-el>Gerar Documento</button>
        `;
    };

    window.wizApprove = async function(projectId, itemId, btnEl) {
        const content = document.getElementById('wiz-doc-content').value;
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Salvando...';
        try {
            await api('POST', `/api/v1/projects/${projectId}/approve-document`, { itemId, content });
            showToast('Documento aprovado e salvo como evidência!');
            forceCloseModal();
            render();
        } catch(e) {
            showToast('Erro ao aprovar: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.openInterviewWizard = function(projectId) {
        const tracks = [
            { id: 'executiva', name: 'Executiva' },
            { id: 'tecnologia', name: 'Tecnologia' },
            { id: 'juridico', name: 'Jurídico' },
            { id: 'rh', name: 'Recursos Humanos' },
            { id: 'operacoes', name: 'Operações' }
        ];

        // Ensure track progress state initialized
        if (!S.interviewProgress) S.interviewProgress = {};

        const sidebarHtml = tracks.map(t => {
            const isDone = S.interviewProgress[projectId + '_' + t.id];
            const check = isDone ? '<span class="t-sucesso fw-600 mr-1"></span>' : '';
            return `<div class="wizard-sidebar-item" id="track-tab-${t.id}" data-action="changeInterviewTrack" data-args='["${projectId}","${t.id}"]' style="padding: 10px 12px; font-size: 0.8rem; cursor: pointer; color: var(--text-dim); transition: all 0.2s; border-left: 3px solid transparent; display: flex; align-items: center; justify-content: space-between;">
                <span>${check}${t.name}</span>
            </div>`;
        }).join('');

        openModal(`
            <div class="modal-header">
                <span class="modal-title">Conduzir Entrevistas por Trilha (Mapeamento Inicial)</span>
                
            </div>
            <div style="padding: 1.25rem 0; display: flex; gap: 20px; min-height: 480px;">
                <div style="width: 200px; display: flex; flex-direction: column; gap: 6px; border-right: 1px solid var(--border); padding-right: 12px;">
                    <div class="t-sm t-accent fw-600 caixa-alta mb-2">Trilhas de Auditoria</div>
                    ${sidebarHtml}
                </div>
                <div class="flex-1 d-flex flex-col justify-between pl-2">
                    <div id="interview-questions-container" style="max-height: 400px; overflow-y: auto; padding-right: 8px;">
                        ${window.renderEmptyState({ titulo: 'Selecione uma trilha', texto: 'Escolha uma trilha na barra lateral para iniciar a entrevista.' })}
                    </div>
                    <div id="interview-actions-container" style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 1rem; margin-top: 1rem;">
                        <button class="btn bg-sutil-2 borda-cor" data-action="forceCloseModal">Fechar</button>
                        <div id="interview-buttons-right" class="d-flex gap-25"></div>
                    </div>
                </div>
            </div>
        `, 'modal-large');

        // Automatically load first track
        changeInterviewTrack(projectId, 'executiva');
    };

    window.changeInterviewTrack = async function(projectId, track) {
        // Highlight active tab
        document.querySelectorAll('.wizard-sidebar-item').forEach(el => {
            el.style.background = 'none';
            el.style.color = 'var(--text-dim)';
            el.style.borderLeftColor = 'transparent';
        });
        const tabEl = document.getElementById('track-tab-' + track);
        if (tabEl) {
            tabEl.style.background = 'rgba(0,173,232,0.05)';
            tabEl.style.color = 'var(--text)';
            tabEl.style.borderLeftColor = 'var(--accent)';
        }

        const container = document.getElementById('interview-questions-container');
        container.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-dim);">Carregando perguntas...</div>';
        document.getElementById('interview-buttons-right').innerHTML = '';

        try {
            const res = await api('GET', `/api/v1/projects/${projectId}/interviews/${track}`);
            const qs = res.questions || [];

            if (qs.length === 0) {
                container.innerHTML = window.renderEmptyState({ titulo: 'Sem perguntas', texto: 'Nenhuma pergunta cadastrada para esta trilha.' });
                return;
            }

            // Save active track questions metadata globally in S
            S.activeInterviewTrackQuestions = qs;

            container.innerHTML = qs.map((q, idx) => {
                const ans = q.answer || '';
                const who = q.interviewee || '';
                const gap = q.gap_detected === 1;

                return `
                    <div class="list-item d-flex flex-col gap-25 p-5 bg-sutil borda mb-3">
                        <div class="t-base fw-600 t-texto lh-14">
                            ${idx + 1}. ${escapeHTML(q.question)}
                        </div>
                        <div class="d-flex flex-col gap-2 mt-1">
                            <label class="t-sm t-dim fw-500">Resposta / Constatação do Auditor</label>
                            <textarea id="ans-${q.key}" class="form-input" style="width: 100%; min-height: 70px; font-size: 0.8rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border); padding: 8px 12px; color: var(--text); resize: vertical; font-family: inherit;" placeholder="Registre a resposta ou evidências coletadas...">${escapeHTML(ans)}</textarea>
                        </div>
                        <div class="d-flex gap-3 items-center mt-1">
                            <div class="flex-1 d-flex flex-col gap-1">
                                <label class="t-sm t-dim fw-500">Entrevistado (Nome / Cargo)</label>
                                <input type="text" id="who-${q.key}" class="form-input t-md bg-fundo borda py-15 px-3 t-texto" value="${escapeHTML(who)}" placeholder="Ex: João CISO, Maria DevOps">
                            </div>
                            <div class="d-flex items-center gap-2 pt-4">
                                <input type="checkbox" id="gap-${q.key}" ${gap ? 'checked' : ''} class="clicavel">
                                <label for="gap-${q.key}" class="t-sm t-perigo fw-600 clicavel d-flex items-center gap-1">
                                    Lacuna Detectada
                                </label>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            // Load buttons
            const tracksList = ['executiva', 'tecnologia', 'juridico', 'rh', 'operacoes'];
            const allSaved = tracksList.every(tId => S.interviewProgress[projectId + '_' + tId]);

            // Uma ação principal: com as cinco trilhas salvas, concluir passa a ser o primário e salvar fica secundário.
            let rightButtons = `<button class="btn${allSaved ? '' : ' btn-primary'}" data-action="saveInterviewTrack" data-args='["${projectId}","${track}"]' data-arg-el>Salvar Trilha</button>`;
            if (allSaved) {
                rightButtons += `<button class="btn btn-primary" data-action="completeInterviewsTask" data-args='["${projectId}"]' data-arg-el>Concluir e Registrar</button>`;
            }

            document.getElementById('interview-buttons-right').innerHTML = rightButtons;

        } catch (e) {
            container.innerHTML = `<div style="color:var(--danger-ink); text-align:center; padding:3rem;">Erro ao carregar perguntas: ${escapeHTML(e.message)}</div>`;
        }
    };

    window.saveInterviewTrack = async function(projectId, track, btnEl) {
        const qs = S.activeInterviewTrackQuestions || [];
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Salvando...';

        try {
            // Um envio só, no formato do interviewSchema: { answers: [...] }.
            const answers = [];
            for (const q of qs) {
                const answer = document.getElementById('ans-' + q.key).value.trim();
                if (!answer) continue;
                answers.push({
                    track,
                    question: q.question,
                    answer,
                    interviewee: document.getElementById('who-' + q.key).value.trim(),
                    gap_detected: document.getElementById('gap-' + q.key).checked ? 1 : 0
                });
            }
            if (answers.length) await api('POST', `/api/v1/projects/${projectId}/interviews`, { answers });

            showToast(`Trilha '${track.toUpperCase()}' salva com sucesso!`);
            
            // Mark progress
            S.interviewProgress[projectId + '_' + track] = true;
            localStorage.setItem('niso_interviewProgress', JSON.stringify(S.interviewProgress));

            // Reload wizard modal to update tabs checkmarks and complete buttons
            openInterviewWizard(projectId);
            changeInterviewTrack(projectId, track);

        } catch (e) {
            showToast('Erro ao salvar respostas: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.completeInterviewsTask = async function(projectId, btnEl) {
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Concluindo...';

        try {
            const checkKey = `${projectId}_${ITEM_ENTREVISTAS}`;
            S.phaseChecks[checkKey] = true;
            localStorage.setItem('niso_phaseChecks', JSON.stringify(S.phaseChecks));

            await api('PUT', `/api/v1/projects/${projectId}/checklist-progress`, {
                items: [{
                    phase_number: 2,
                    item_id: ITEM_ENTREVISTAS,
                    is_checked: true,
                    notes: 'Entrevistas por trilha (Executiva, Tecnologia, Jurídico, RH, Operações) concluídas e registradas.',
                    assigned_to: S.user ? S.user.id : null,
                    due_date: null
                }]
            });

            showToast('Entrevistas por trilha concluídas e checklist atualizado!');
            forceCloseModal();
            render();
        } catch (e) {
            showToast('Erro ao concluir tarefa: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.toggleAuditorTip = function(itemId) {
        if (!S.expandedTips) S.expandedTips = {};
        S.expandedTips[itemId] = !S.expandedTips[itemId];
        render();
    };

    window.formatActivityNotes = function(notes) {
        if (!notes) return '';
        const trimmed = notes.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const obj = JSON.parse(trimmed);
                const parts = [];
                for (const [key, val] of Object.entries(obj)) {
                    let label = key;
                    if (key === 'engagement') label = 'Engajamento';
                    else if (key === 'trustScore') label = 'Confiança';
                    else if (key === 'sub_id') label = 'ID Cliente';
                    else if (key === 'timeline') label = 'Prazo';
                    else if (key === 'main_risk') label = 'Risco Principal';
                    
                    parts.push(`<span style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:3px 8px; margin-right:4px;"><strong>${label}</strong>: ${val}</span>`);
                }
                return `<div class="d-flex flex-wrap gap-2 t-xs t-dim mb-2">${parts.join('')}</div>`;
            } catch (e) { /* metadado que não é JSON: sem as etiquetas */ }
        }
        return '';
    };

    window.toggleChecklistDetails = function(itemId) {
        if (!S.expandedChecklistDetails) S.expandedChecklistDetails = {};
        S.expandedChecklistDetails[itemId] = !S.expandedChecklistDetails[itemId];
        render();
    };

    // ── Questionário POR FASE (perguntas especializadas ancoradas na cláusula) ──
    window.openPhaseQuestionnaire = function(phaseNumber, projectId) {
        const questions = (S.phaseQuestions && S.phaseQuestions[phaseNumber]) || [];
        if (!questions.length) { showToast('Sem perguntas para esta fase', 'error'); return; }
        const saved = (S.phaseAnswers && S.phaseAnswers[phaseNumber]) || {};
        const playbook = window.PHASE_PLAYBOOKS && window.PHASE_PLAYBOOKS[phaseNumber];
        const titulo = playbook ? playbook.obj : `Fase ${phaseNumber}`;

        const campos = questions.map(q => {
            const cur = saved[q.key] || '';
            let input = '';
            if (q.type === 'text') {
                input = `<textarea id="pq-${q.key}" class="form-input w-full" rows="2">${escapeHTML(cur)}</textarea>`;
            } else if (q.type === 'multi') {
                const marcados = String(cur).split('||');
                input = `<div class="d-flex flex-wrap gap-2">` + (q.options || []).map(opt =>
                    `<label class="t-md d-flex items-center gap-1"><input type="checkbox" name="pq-${q.key}" value="${escapeHTML(opt)}" ${marcados.includes(opt) ? 'checked' : ''}> ${escapeHTML(opt)}</label>`
                ).join('') + `</div>`;
            } else {
                input = `<select id="pq-${q.key}" class="form-input w-full"><option value="">— selecione —</option>` +
                    (q.options || []).map(opt => `<option value="${escapeHTML(opt)}" ${cur === opt ? 'selected' : ''}>${escapeHTML(opt)}</option>`).join('') + `</select>`;
            }
            return `<div class="mb-4"><label class="t-sm t-dim d-block mb-15">${escapeHTML(q.question)}</label>${input}</div>`;
        }).join('');

        openModal(`
            <div class="modal-header"><span class="modal-title">Questionário — ${escapeHTML(titulo)}</span></div>
            <div style="padding:1.25rem 0; text-align:left; max-height:60vh; overflow-y:auto">${campos}
                <div class="d-flex justify-end gap-25 mt-2">
                    <button class="btn bg-sutil-2 borda-cor" data-action="forceCloseModal">Cancelar</button>
                    <button class="btn btn-primary" data-action="savePhaseQuestionnaire" data-args='["${phaseNumber}","${projectId}"]'>Salvar</button>
                </div>
            </div>`);
    };

    window.savePhaseQuestionnaire = async function(phaseNumber, projectId) {
        // A delegação entrega os args como string (data-args JSON); o backend e o
        // contrato da API esperam phase_number numérico. Normaliza na fronteira.
        phaseNumber = Number(phaseNumber);
        const questions = (S.phaseQuestions && S.phaseQuestions[phaseNumber]) || [];
        const answers = {};
        questions.forEach(q => {
            if (q.type === 'multi') {
                const marcados = Array.from(document.querySelectorAll(`input[name="pq-${q.key}"]:checked`)).map(el => el.value);
                answers[q.key] = marcados.join('||');
            } else {
                const el = document.getElementById(`pq-${q.key}`);
                if (el) answers[q.key] = el.value;
            }
        });
        try {
            await api('PUT', `/api/v1/projects/${projectId}/phase-answers`, { phase_number: phaseNumber, answers });
            if (!S.phaseAnswers) S.phaseAnswers = {};
            // reflete localmente só o que tem valor (para o contador de respondidas)
            const limpo = {};
            Object.entries(answers).forEach(([k, v]) => { if (v) limpo[k] = v; });
            S.phaseAnswers[phaseNumber] = limpo;
            showToast('Respostas salvas!');
            forceCloseModal();
            render();
        } catch (e) {
            showToast('Falha ao salvar: ' + e.message, 'error');
        }
    };

    // Interpretação coesa das respostas da fase (F2) — chama o agente e mostra
    // um diagnóstico ESPECÍFICO (prontidão, pontos citando a pergunta, próximos
    // passos), com a cobertura determinística das perguntas sem resposta.
    window.interpretPhaseAnswers = async function(phaseNumber, projectId) {
        const questions = (S.phaseQuestions && S.phaseQuestions[phaseNumber]) || [];
        const textoDaPergunta = k => (questions.find(q => q.key === k) || {}).question || k;
        openModal(`<div class="modal-header"><span class="modal-title">Interpretando a fase…</span></div>
            <div class="py-6 px-0 t-center t-dim">Analisando as respostas com o agente de conformidade…</div>`);
        try {
            const r = await api('GET', `/api/v1/projects/${projectId}/phase-answers/${phaseNumber}/interpret`);
            const badge = { em_dia: ['var(--success)', 'Em dia'], atencao: ['var(--warning)', 'Atenção'], critico: ['var(--danger)', 'Crítico'] };
            const sevCor = { critico: 'var(--danger)', alto: 'var(--warning)', medio: 'var(--text-dim)' };
            const it = r.interpretacao;
            const cab = r.clausula ? `${escapeHTML(r.titulo)} — cláusula ${escapeHTML(r.clausula)}` : escapeHTML(r.titulo || ('Fase ' + phaseNumber));
            const cov = r.cobertura || { total: 0, respondidas: 0, sem_resposta: [] };
            const completo = cov.total > 0 && cov.respondidas === cov.total;

            let corpo = '';
            if (it) {
                const [cor, rotulo] = badge[it.prontidao] || badge.atencao;
                corpo += `<div class="d-flex items-center gap-25 mb-4">
                    <span style="background:${cor}; color:var(--bg); padding:3px 12px; font-size:0.72rem; font-weight:500; text-transform:uppercase; letter-spacing:0.5px">${rotulo}</span>
                    <span class="t-sm t-dim">Prontidão da fase</span></div>`;
                if (it.resumo) corpo += `<p class="t-base lh-15 mb-4">${escapeHTML(it.resumo)}</p>`;
                if (it.pontos && it.pontos.length) {
                    corpo += `<div class="fw-500 t-sm mb-2 caixa-alta t-dim">Pontos de atenção</div>`;
                    corpo += it.pontos.map(pt => `<div style="border-top:2px solid ${sevCor[pt.severidade] || 'var(--text-dim)'}; padding:6px 10px; margin-bottom:8px; background:rgba(255,255,255,0.02);">
                        <div class="t-xs t-dim caixa-alta">${escapeHTML(pt.severidade)} · ${escapeHTML(textoDaPergunta(pt.pergunta_key))}</div>
                        <div style="font-size:0.82rem; line-height:1.45; margin-top:2px">${escapeHTML(pt.observacao)}</div></div>`).join('');
                }
                if (it.proximos_passos && it.proximos_passos.length) {
                    corpo += `<div style="font-weight:500; font-size:0.78rem; margin:1rem 0 0.5rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-dim)">Próximos passos</div>`;
                    corpo += `<ol class="t-md lh-15 pl-5 m-0">${it.proximos_passos.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ol>`;
                }
            } else {
                // Sem contradição: com a fase completa, dizemos isso em vez de
                // "sem respostas suficientes"; o motivo real vem do backend.
                const motivoSuffix = r.motivo ? ` (${escapeHTML(r.motivo)})` : '';
                const abre = completo
                    ? 'As respostas desta fase estão completas, mas a interpretação por IA não pôde ser gerada agora.'
                    : 'A interpretação assistida por IA está indisponível no momento.';
                corpo += `<p class="t-md t-dim lh-15">${abre}${motivoSuffix}</p>`;
            }

            corpo += `<div style="margin-top:1.25rem; padding-top:1rem; border-top:1px solid var(--border)">
                <div class="t-sm t-dim"><strong class="fw-500">Cobertura</strong> — ${cov.respondidas}/${cov.total} perguntas respondidas</div>`;
            if (cov.sem_resposta && cov.sem_resposta.length) {
                corpo += `<ul style="font-size:0.78rem; color:var(--text-dim); line-height:1.45; margin:0.5rem 0 0; padding-left:1.2rem">${cov.sem_resposta.map(q => `<li>Sem resposta: ${escapeHTML(q.pergunta)}</li>`).join('')}</ul>`;
            }
            corpo += `</div>`;

            openModal(`<div class="modal-header"><span class="modal-title">Interpretação — ${cab}</span></div>
                <div style="padding:1.25rem 0; text-align:left; max-height:65vh; overflow-y:auto">${corpo}
                    <div style="font-size:var(--fs-xs); color:var(--text-dim); margin-top:1rem; font-style:normal">${escapeHTML(r.rotulo || '')}</div>
                </div>`);
        } catch (e) {
            forceCloseModal();
            showToast('Falha ao interpretar: ' + e.message, 'error');
        }
    };

    // Dossiê da Jornada (F3) — consolida as respostas por fase num documento
    // apresentável e imprimível (Salvar como PDF) para compartilhar com stakeholders.
    window.generateJourneyDossier = async function(projectId) {
        openModal(`<div class="modal-header"><span class="modal-title">Gerando dossiê…</span></div>
            <div class="py-6 px-0 t-center t-dim">Consolidando as respostas da jornada…</div>`);
        try {
            const d = await api('GET', `/api/v1/projects/${projectId}/journey-dossier`);
            const pj = d.projeto || {};
            const secoes = d.secoes || [];

            const secoesHtml = secoes.length ? secoes.map(s => `
                <section style="margin-bottom:1.5rem; page-break-inside:avoid">
                    <h3 style="font-size:0.95rem; margin:0 0 0.25rem">Fase ${s.phase} — ${escapeHTML(s.titulo)}${s.clausula ? ` <span class="fw-400 t-dim">· cláusula ${escapeHTML(s.clausula)}</span>` : ''}</h3>
                    <div class="t-xs t-dim mb-2">Situação: ${escapeHTML(traduzStatus(s.status))} · ${s.cobertura.respondidas}/${s.cobertura.total} respondidas</div>
                    <dl class="m-0">
                        ${s.respostas.map(r => `
                            <dt class="t-md fw-600 mt-2">${escapeHTML(r.pergunta)}</dt>
                            <dd style="font-size:0.82rem; margin:0 0 0.25rem; color:${r.resposta ? 'var(--text)' : 'var(--text-dim)'}">${r.resposta ? escapeHTML(r.resposta) : '— sem resposta —'}</dd>
                        `).join('')}
                    </dl>
                </section>`).join('') : window.renderEmptyState({ titulo: 'Nenhuma resposta registrada na jornada ainda.', compacto: true });

            const doc = `<div id="dossie-print" class="t-left">
                <div style="border-bottom:2px solid var(--accent); padding-bottom:0.75rem; margin-bottom:1rem">
                    <h2 style="margin:0 0 0.25rem">Dossiê da Jornada — ${escapeHTML(pj.client_name || '')}</h2>
                    <div class="t-sm t-dim">
                        Normas: ${escapeHTML(pj.standards || '')} · Papel: ${escapeHTML(traduzStatus(pj.org_role || ''))} · Situação: ${escapeHTML(traduzStatus(pj.status || ''))}<br>
                        ${pj.scope ? 'Escopo: ' + escapeHTML(pj.scope) + '<br>' : ''}
                        Gerado em ${formatarData(d.generated_at, { hora: true })} · ${d.resumo.fases_iniciadas} fase(s) iniciada(s) · ${d.resumo.respondidas} resposta(s)
                    </div>
                </div>
                ${secoesHtml}
                <div style="font-size:var(--fs-xs); color:var(--text-dim); border-top:1px solid var(--border); padding-top:0.5rem; margin-top:1rem">${escapeHTML(d.rotulo || '')}</div>
            </div>`;

            openModal(`<div class="modal-header"><span class="modal-title">Dossiê da Jornada</span>
                    <div class="d-flex gap-2">
                        <button class="btn btn-primary" data-action="printDossie">Imprimir / PDF</button>
                        
                    </div>
                </div>
                <div style="padding:1.25rem 0; max-height:68vh; overflow-y:auto">${doc}</div>`);
        } catch (e) {
            forceCloseModal();
            showToast('Falha ao gerar dossiê: ' + e.message, 'error');
        }
    };

    // Imprime só o dossiê, numa janela isolada (não depende de CSS @media print da app).
    window.printDossie = function() {
        const el = document.getElementById('dossie-print');
        if (!el) return;
        const w = window.open('', '_blank');
        if (!w) { showToast('Permita pop-ups para imprimir o dossiê', 'error'); return; }
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Dossiê da Jornada</title>
            <style>body{font-family:'Segoe UI',Arial,sans-serif;color:#111;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.4}
            h2{color:#00ade8}h3{margin:0 0 .25rem}dt{font-weight:600;margin-top:.5rem}dd{margin:0 0 .25rem}section{margin-bottom:1.25rem}
            :root{--text:#111;--text-dim:#666;--accent:#00ade8;--border:#ddd}</style></head><body>${el.innerHTML}</body></html>`);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 250);
    };

    // Adequação de controles (F3) — a IA sugere; o humano aprova cada item.
    // Nada muda no controle até clicar "Aplicar" (guarda-rail: só status seguros).
    window.suggestControlAdequacao = async function(phaseNumber, projectId) {
        openModal(`<div class="modal-header"><span class="modal-title">Sugerindo adequações…</span></div>
            <div class="py-6 px-0 t-center t-dim">Analisando as respostas e os controles do projeto…</div>`);
        try {
            const r = await api('GET', `/api/v1/projects/${projectId}/control-adequacao/${phaseNumber}/suggestions`);
            const sugs = r.sugestoes || [];
            S._adequacaoSugestoes = {}; // guarda para o Aplicar por índice
            const cab = r.clausula ? `${escapeHTML(r.titulo)} — cláusula ${escapeHTML(r.clausula)}` : escapeHTML(r.titulo || ('Fase ' + phaseNumber));

            let corpo;
            if (!sugs.length) {
                corpo = `<p class="t-md t-dim lh-15">Sem sugestões de adequação para esta fase no momento (sem IA configurada, sem respostas, ou nada que as respostas sustentem com base objetiva).</p>`;
            } else {
                corpo = sugs.map((s, i) => {
                    S._adequacaoSugestoes[i] = { control_id: s.control_id, status: s.sugestao_status, maturity: s.sugestao_maturidade, justificativa: s.justificativa, pergunta_key: s.pergunta_key, phase_number: phaseNumber };
                    const alvo = [s.sugestao_status ? `status: <strong>${escapeHTML(s.sugestao_status)}</strong>` : '', (s.sugestao_maturidade != null) ? `maturidade: <strong>${s.sugestao_maturidade}</strong>` : ''].filter(Boolean).join(' · ');
                    return `<div id="adeq-item-${i}" class="borda p-25 mb-25">
                        <div class="t-md fw-600">${escapeHTML(s.control_id)} — ${escapeHTML(s.control_title || '')}</div>
                        <div style="font-size:0.72rem; color:var(--text-dim); margin:2px 0 6px">atual: status ${escapeHTML(String(s.status_atual ?? '—'))} · maturidade ${escapeHTML(String(s.maturidade_atual ?? 0))} → ${alvo}</div>
                        <div class="t-md lh-14 mb-2">${escapeHTML(s.justificativa)}</div>
                        <button class="btn-inline-action borda-accent t-accent fw-600" data-action="applyControlAdequacao" data-args='["${i}","${projectId}"]'>Aplicar ao controle</button>
                    </div>`;
                }).join('');
            }

            openModal(`<div class="modal-header"><span class="modal-title">Adequação de controles — ${cab}</span></div>
                <div style="padding:1.25rem 0; text-align:left; max-height:65vh; overflow-y:auto">${corpo}
                    <div class="t-xs t-dim mt-3">${escapeHTML(r.rotulo || '')}</div>
                </div>`);
        } catch (e) {
            forceCloseModal();
            showToast('Falha ao sugerir adequação: ' + e.message, 'error');
        }
    };

    window.applyControlAdequacao = async function(idx, projectId) {
        const s = S._adequacaoSugestoes && S._adequacaoSugestoes[idx];
        if (!s) return;
        try {
            await api('POST', `/api/v1/projects/${projectId}/control-adequacao/apply`, s);
            const card = document.getElementById(`adeq-item-${idx}`);
            if (card) { card.style.opacity = '0.5'; const b = card.querySelector('button'); if (b) b.outerHTML = '<span class="t-xs t-accent fw-600">Aplicado</span>'; }
            showToast('Adequação aplicada ao controle ' + s.control_id);
        } catch (e) {
            showToast('Falha ao aplicar: ' + e.message, 'error');
        }
    };

    // "Gerar IA" de item sem assistente: a IA só devolve o rascunho. Ele abre para leitura e edição, e o item
    // só é concluído quando a pessoa aprova (wizApprove → approve-document, a mesma porta do assistente).
    window.generateDocumentNatively = async function(projectId, itemId, btnEl) {
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Gerando...';
        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/checklist/${itemId}/generate`);
            openModal(`
                <div class="modal-header">
                    <span class="modal-title">${escapeHTML(textoDoItem(itemId))}</span>
                </div>
                <div class="py-6 px-0">
                    <div class="mb-3 t-sm t-accent fw-600 caixa-alta">Rascunho gerado por IA: revise antes de aprovar</div>
                    ${campoDoRascunho(res.content)}
                    <div id="wiz-actions" class="d-flex justify-end gap-25 mt-5">
                        <button class="btn bg-sutil-2 borda-cor" data-action="forceCloseModal">Descartar</button>
                        <button class="btn btn-primary" data-action="wizApprove" data-args='["${projectId}","${itemId}"]' data-arg-el>Aprovar e Salvar como Evidência</button>
                    </div>
                </div>
            `, 'modal-large');
        } catch(e) {
            showToast('Erro ao gerar documento: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.openInternalDocumentEditor = async function(evidenceId) {
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Editor de Documento Interno</span>
                
            </div>
            <div id="doc-editor-body" class="py-6 px-0">
                <div class="loading"></div>
            </div>
        `, 'modal-large');

        try {
            const data = await api('GET', `/api/v1/evidence/${evidenceId}/content`);
            
            document.getElementById('doc-editor-body').innerHTML = `
                <div class="mb-4">
                    <label class="t-sm t-dim caixa-alta fw-600 d-block mb-2">Nome do Arquivo</label>
                    <input type="text" class="form-input w-full t-base" value="${escapeHTML(data.file_name)}" readonly disabled>
                </div>
                <div class="mb-6">
                    <label class="t-sm t-dim caixa-alta fw-600 d-block mb-2">Conteúdo do Documento (Markdown)</label>
                    <textarea id="internal-doc-text" class="form-input" style="width:100%; height:450px; font-family:monospace; font-size:0.8rem; line-height:1.4; background:rgba(0,0,0,0.35); resize:vertical; padding:12px;">${escapeHTML(data.content || '')}</textarea>
                </div>
                <div class="d-flex justify-end gap-25">
                    <button class="btn bg-sutil-2 borda-cor" data-action="forceCloseModal">Cancelar</button>
                    <button class="btn btn-primary" data-action="saveInternalDocument" data-args='["${evidenceId}"]' data-arg-el>Salvar Alterações</button>
                </div>
            `;
        } catch(e) {
            document.getElementById('doc-editor-body').innerHTML = `
                <div class="t-perigo p-4 t-center">
                    Erro ao carregar documento: ${escapeHTML(e.message)}
                    <div class="mt-4 t-sm t-dim">Este arquivo pode ser um anexo binário externo (PDF, imagem, etc.).</div>
                </div>
            `;
        }
    };

    window.saveInternalDocument = async function(evidenceId, btnEl) {
        const content = document.getElementById('internal-doc-text').value;
        const prevText = btnEl.textContent;
        btnEl.disabled = true;
        btnEl.textContent = 'Salvando...';
        try {
            await api('PUT', `/api/v1/evidence/${evidenceId}/content`, { content });
            showToast('Documento atualizado com sucesso!');
            forceCloseModal();
            render();
        } catch(e) {
            showToast('Erro ao salvar documento: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

    window.toggleJourney = function(jIdx) {
        const targetVal = !S.expandedJourneys[jIdx];
        if (targetVal) {
            S.expandedJourneys = {};
            S.expandedJourneys[jIdx] = true;
        } else {
            S.expandedJourneys[jIdx] = false;
        }
        render();
    };

    window.togglePhase = function(phaseNum) {
        if (!S.expandedPhases) S.expandedPhases = {};
        const targetVal = !S.expandedPhases[phaseNum];
        if (targetVal) {
            S.expandedPhases = {};
            S.expandedPhases[phaseNum] = true;
        } else {
            S.expandedPhases[phaseNum] = false;
        }
        render();
    };

    window.changePhaseStatus = async function(projectId, phaseNum, selectEl) {
        const newStatus = selectEl.value;
        
        // Critério de Aceite de Entregas (Definition of Done)
        if (newStatus === 'completed') {
            const phChecklist = S.checklistsConfig[phaseNum] || [];
            const pendingItens = phChecklist.filter(item => {
                const checkKey = `${projectId}_${item.id}`;
                return S.phaseChecks[checkKey] !== true;
            });
            
            if (pendingItens.length > 0) {
                window.openDoDDrawer(projectId, phaseNum, selectEl, pendingItens);
                return;
            }
        }

        selectEl.disabled = true;
        try {
            await api('PUT', `/api/v1/projects/${projectId}/phases/${phaseNum}`, { status: newStatus });
            selectEl.setAttribute('data-prev', newStatus);
            showToast(`Fase ${phaseNum}: ${STATUS_DA_FASE[newStatus] || traduzStatus(newStatus)}`);
            render();
        } catch (e) {
            showToast(`Erro ao atualizar fase: ${e.message}`);
            selectEl.value = selectEl.getAttribute('data-prev') || selectEl.value;
        } finally {
            selectEl.disabled = false;
        }
    };

    window.toggleChecklistItem = function(projectId, itemId, checkboxEl) {
        const checkKey = `${projectId}_${itemId}`;
        S.phaseChecks[checkKey] = checkboxEl.checked;
        localStorage.setItem('niso_phaseChecks', JSON.stringify(S.phaseChecks));
        
        const labelEl = checkboxEl.parentElement.querySelector('.checklist-text');
        if (checkboxEl.checked) {
            labelEl.classList.add('checked');
        } else {
            labelEl.classList.remove('checked');
        }
        showToast(checkboxEl.checked ? 'Item concluído' : 'Item reaberto');
        if (window.refreshDoDDrawer) window.refreshDoDDrawer();

        // ponytail: debounced save to D1
        if (window._checklistSaveTimer) clearTimeout(window._checklistSaveTimer);
        window._checklistSaveTimer = setTimeout(async () => {
            const items = [];
            for (const key in S.phaseChecks) {
                if (key.startsWith(projectId + '_')) {
                    const iid = key.replace(projectId + '_', '');
                    const match = iid.match(/^p(\d+)_/);
                    if (match) {
                        items.push({ 
                            phase_number: parseInt(match[1]), 
                            item_id: iid, 
                            is_checked: !!S.phaseChecks[key],
                            notes: (S.phaseChecksNotes && S.phaseChecksNotes[key]) || null,
                            assigned_to: (S.phaseChecksAssigned && S.phaseChecksAssigned[key]) || null,
                            due_date: (S.phaseChecksDueDate && S.phaseChecksDueDate[key]) || null
                        });
                    }
                }
            }
            if (items.length > 0) {
                try { await api('PUT', '/api/v1/projects/' + projectId + '/checklist-progress', { items }); }
                catch (e) { console.warn('Checklist sync error:', e); }
            }
        }, 500);
    };

    async function openPhaseDetail(projectId, phaseNum) {
        // Basic implementation
        showToast('Detalhes da fase ' + phaseNum);
    }

    async function wsUploadEvidence(docType) {
        const labels = { organograma:'Organograma', policy:'Políticas Existentes', inventory:'Inventário de Ativos', topology:'Topologia de Rede', systems:'Lista de Sistemas', contracts:'Contratos Fornecedores', incidents:'Registro de Incidentes', certifications:'Certificações Vigentes', floorplan:'Planta Baixa', audit_report:'Relatório de Auditoria', ropa:'RoPA / Mapeamento Dados', backup_dr:'Backup e DR' };
        openModal(`<h3 class="mb-4">Enviar: ${escapeHTML(labels[docType] || textoDoItem(docType))}</h3>
            <div class="form-group"><label class="form-label">Arquivo</label><input type="file" id="doc-file" class="form-input" accept=".pdf,.docx,.xlsx,.txt,.csv,.md,.png,.jpg,.jpeg"></div>
            <div id="doc-msg" class="t-xs t-dim my-2 mx-0"></div>
            <div class="d-flex gap-2 justify-end">
                <button class="btn" data-action="closeModal">Cancelar</button>
                <button class="btn btn-primary" data-action="doDocUpload" data-args='["${docType}"]'>Upload e Extrair</button>
            </div>`);
    }

    async function doDocUpload(docType) {
        const file = document.getElementById('doc-file')?.files?.[0];
        if (!file) { document.getElementById('doc-msg').textContent = 'Selecione um arquivo.'; return; }
        document.getElementById('doc-msg').textContent = 'Enviando...';
        try {
            const fd = new FormData();
            fd.append('file', file);
            // O servidor liga a evidência ao controle do item e marca o item no checklist.
            fd.append('item_id', docType);
            const res = await fetch(`${API_BASE}/api/v1/projects/${S.activeProject.id}/documents/upload`, {
                method: 'POST', headers: { 'Authorization': 'Bearer ' + S.token }, body: fd
            });
            const data = await res.json();
            if (data.ok) {
                showToast('Upload concluído');
                closeModal();
                render();
            } else {
                document.getElementById('doc-msg').textContent = data.error || 'Erro no upload.';
                document.getElementById('doc-msg').style.color = 'var(--danger)';
            }
        } catch(e) {
            document.getElementById('doc-msg').textContent = 'Erro: ' + e.message;
        }
    }

    async function wsViewExtraction(docId) {
        try {
            const docs = await api('GET', `/api/v1/projects/${S.currentProject.id}/documents`);
            const doc = (docs || []).find(d => d.id === docId);
            if (!doc) return;
            openModal(`<h3 class="mb-4">Extracao: ${escapeHTML(doc.filename)}</h3>
                <div class="t-xs t-dim mb-2">Situação: ${escapeHTML(traduzStatus(doc.status))} | Tipo: ${escapeHTML(doc.document_type || '')}</div>
                <textarea class="form-input t-xs f-mono lh-16" id="doc-ext-edit" rows="12">${escapeHTML(doc.extracted_summary || '')}</textarea>
                <div class="d-flex gap-2 justify-end mt-3">
                    <button class="btn" data-action="forceCloseModal">Fechar</button>
                    <button class="btn btn-primary" data-action="wsConfirmExtraction" data-args='["${docId}"]'>Confirmar e Indexar</button>
                </div>`);
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    async function wsConfirmExtraction(docId) {
        const summary = document.getElementById('doc-ext-edit')?.value;
        if (!summary) return;
        await api('PUT', `/api/v1/projects/${S.currentProject.id}/documents/${docId}`, { extracted_summary: summary, status: 'confirmed' });
        forceCloseModal();
        render();
    }

    window.saveChecklistItemMetadata = function(projectId, phaseNum, itemId) {
        // A delegação entrega phaseNum como string (data-args JSON); o payload
        // phase_number precisa ser numérico. Normaliza na fronteira.
        phaseNum = Number(phaseNum);
        const key = projectId + '_' + itemId;
        const isChecked = S.phaseChecks[key] === true;
        
        if (window._checklistSaveTimer) clearTimeout(window._checklistSaveTimer);
        window._checklistSaveTimer = setTimeout(async () => {
            const items = [];
            for (const k in S.phaseChecks) {
                if (k.startsWith(projectId + '_')) {
                    const id = k.replace(projectId + '_', '');
                    const match = id.match(/^p(\d+)_/);
                    if (match) {
                        items.push({
                            phase_number: parseInt(match[1]),
                            item_id: id,
                            is_checked: !!S.phaseChecks[k],
                            notes: S.phaseChecksNotes[k] || null,
                            assigned_to: S.phaseChecksAssigned[k] || null,
                            due_date: S.phaseChecksDueDate[k] || null
                        });
                    }
                }
            }
            if (!items.some(i => i.item_id === itemId)) {
                items.push({
                    phase_number: phaseNum,
                    item_id: itemId,
                    is_checked: isChecked,
                    notes: S.phaseChecksNotes[key] || null,
                    assigned_to: S.phaseChecksAssigned[key] || null,
                    due_date: S.phaseChecksDueDate[key] || null
                });
            }
            if (items.length > 0) {
                try {
                    await api('PUT', `/api/v1/projects/${projectId}/checklist-progress`, { items });
                } catch(e) {
                    console.error('Error saving checklist progress metadata:', e);
                }
            }
        }, 800);
    };

    window.saveChecklistItemNotes = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksNotes) S.phaseChecksNotes = {};
        S.phaseChecksNotes[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksNotes', JSON.stringify(S.phaseChecksNotes));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    };

    window.saveChecklistItemAssigned = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksAssigned) S.phaseChecksAssigned = {};
        S.phaseChecksAssigned[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksAssigned', JSON.stringify(S.phaseChecksAssigned));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    };

    window.saveChecklistItemDueDate = async function(projectId, phaseNum, itemId, value) {
        if (!S.phaseChecksDueDate) S.phaseChecksDueDate = {};
        S.phaseChecksDueDate[projectId + '_' + itemId] = value;
        localStorage.setItem('niso_phaseChecksDueDate', JSON.stringify(S.phaseChecksDueDate));
        window.saveChecklistItemMetadata(projectId, phaseNum, itemId);
    };

    async function downloadAuditPack(projectId) {
        try {
            const headers = {};
            if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
            const r = await fetch(API_BASE + `/api/v1/projects/${projectId}/audit-pack`, { headers });
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-pack-${projectId}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch(e) { showToast('Erro ao baixar o pacote de auditoria: ' + e.message, 'error'); }
    }

window.renderProjects = renderProjects;
window.openProjectDetail = openProjectDetail;
window.renderProjectDetail = renderProjectDetail;
window.openPhaseDetail = openPhaseDetail;
window.wsUploadEvidence = wsUploadEvidence;
window.doDocUpload = doDocUpload;
window.wsViewExtraction = wsViewExtraction;
window.wsConfirmExtraction = wsConfirmExtraction;
window.downloadAuditPack = downloadAuditPack;
