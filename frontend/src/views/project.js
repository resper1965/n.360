import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML } from '../ui.js';
import { navigate } from '../router.js';
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


    /** Começar a jornada: carrega as fases num projeto sem elas (só a equipe; o servidor recusa o resto e não duplica). */
    window.carregarFases = async function (projectId) {
        try {
            await api('POST', `/api/v1/projects/${projectId}/phases`);
            showToast('Fases da jornada carregadas', 'success');
            navigate('project-detail');
        } catch (e) { showToast(`Não foi possível carregar as fases: ${e.message}`, 'error'); }
    };

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

    window.openInterviewWizard = async function(projectId) {
        const tracks = [
            { id: 'executiva', name: 'Executiva' },
            { id: 'tecnologia', name: 'Tecnologia' },
            { id: 'juridico', name: 'Jurídico' },
            { id: 'rh', name: 'Recursos Humanos' },
            { id: 'operacoes', name: 'Operações' }
        ];

        // O que aparece como feito vem do servidor (trilhas com ao menos uma resposta), não do navegador. O `api()` entrega a lista do envelope `{ ok, summary }` já desembrulhada.
        let feitas = new Set();
        try { const r = await api('GET', `/api/v1/projects/${projectId}/interviews/summary`); feitas = new Set((Array.isArray(r) ? r : (r.summary || [])).map(x => x.track)); } catch (e) { /* sem o resumo, as trilhas aparecem sem marca */ }

        const sidebarHtml = tracks.map(t => {
            const isDone = feitas.has(t.id);
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

            // Uma ação principal: salvar a trilha. Concluir o passo é o botão principal do cartão da Bancada.
            const rightButtons = `<button class="btn btn-primary" data-action="saveInterviewTrack" data-args='["${projectId}","${track}"]' data-arg-el>Salvar trilha</button>`;

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
            
            // Recarrega o diálogo (marcas das trilhas vêm do servidor) e o passo, cujo "Concluído quando" olha as entrevistas.
            await openInterviewWizard(projectId);
            changeInterviewTrack(projectId, track);
            if (window.bancadaRecarregarPasso) window.bancadaRecarregarPasso();

        } catch (e) {
            showToast('Erro ao salvar respostas: ' + e.message, 'error');
        } finally {
            btnEl.disabled = false;
            btnEl.textContent = prevText;
        }
    };

window.renderProjects = renderProjects;
window.openProjectDetail = openProjectDetail;
