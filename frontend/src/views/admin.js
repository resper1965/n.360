import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, closeModal, forceCloseModal, escapeHTML, formatarData, tituloDaTela } from '../ui.js';
import { render } from '../router.js';

// S2: wrappers para os handlers COMPOSTOS (a delegação chama uma função só).
window.__adminFecharConcluir = () => { window.forceCloseModal(); window.render(); };
window.__adminCopiarApiKey = () => {
    navigator.clipboard.writeText(document.getElementById('apikey-plain').value);
    window.showToast('Copiada');
};

    async function renderSettings(c, h, a) {
        h.textContent = 'Preços e margens';
        a.innerHTML = '';
        c.innerHTML = '<div class="loading"></div>';
        try {
            let raw;
            try {
                raw = await api('GET', '/api/v1/pricing-config');
            } catch(err) {
                raw = await api('GET', '/api/v1/proposals/config/pricing');
            }
            // Configuração incompleta não derruba a tela: o que faltar vira zero e o campo continua editável.
            const cfg = {
                taxaVendaPD: raw?.taxaVendaPD || {}, custoInternoPD: raw?.custoInternoPD || {},
                tributos: raw?.tributos || {}, bufferRisco: raw?.bufferRisco || {},
                overheadPct: raw?.overheadPct ?? 0, margemAlvo: raw?.margemAlvo ?? 0, comissaoPct: raw?.comissaoPct ?? 0,
            };
            const pct = (v, d = 2) => ((Number(v) || 0) * 100).toFixed(d);

            function numInput(id, val, label, suffix) {
                return `<div class="form-group" style="flex:1;min-width:140px">
                    <label class="form-label">${label}</label>
                    <div style="display:flex;align-items:center;gap:0.25rem">
                        <input type="number" id="${id}" class="form-input" value="${val}" step="any" style="width:100%">
                        ${suffix ? `<span style="font-size:0.75rem;color:var(--muted)">${suffix}</span>` : ''}
                    </div>
                </div>`;
            }

            c.innerHTML = `
            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 class="titulo-secao">Taxa de venda por PD (R$/dia)</h3>
                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">O que cobramos do cliente por Person-Day (8h). Inclui margem, overhead e impostos.</p>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-venda-1', (cfg.taxaVendaPD[1] ?? 0), 'Foundation (Tier 1)', 'R$/PD')}
                    ${numInput('cfg-venda-2', (cfg.taxaVendaPD[2] ?? 0), 'Standard (Tier 2)', 'R$/PD')}
                    ${numInput('cfg-venda-3', (cfg.taxaVendaPD[3] ?? 0), 'Enterprise (Tier 3)', 'R$/PD')}
                    ${numInput('cfg-venda-4', (cfg.taxaVendaPD[4] ?? 0), 'Critical (Tier 4)', 'R$/PD')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 class="titulo-secao">Custo interno por PD (R$/dia)</h3>
                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">Custo real do consultor por dia (salário + benefícios). Usado para calcular margem operacional.</p>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-custo-1', (cfg.custoInternoPD[1] ?? 0), 'Foundation (Tier 1)', 'R$/PD')}
                    ${numInput('cfg-custo-2', (cfg.custoInternoPD[2] ?? 0), 'Standard (Tier 2)', 'R$/PD')}
                    ${numInput('cfg-custo-3', (cfg.custoInternoPD[3] ?? 0), 'Enterprise (Tier 3)', 'R$/PD')}
                    ${numInput('cfg-custo-4', (cfg.custoInternoPD[4] ?? 0), 'Critical (Tier 4)', 'R$/PD')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 class="titulo-secao">Tributos e encargos</h3>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-iss', pct(cfg.tributos.iss), 'ISS', '%')}
                    ${numInput('cfg-pis', pct(cfg.tributos.pis), 'PIS', '%')}
                    ${numInput('cfg-cofins', pct(cfg.tributos.cofins), 'COFINS', '%')}
                    ${numInput('cfg-irpj', pct(cfg.tributos.irpj), 'IRPJ', '%')}
                    ${numInput('cfg-csll', pct(cfg.tributos.csll), 'CSLL', '%')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 class="titulo-secao">Parâmetros gerais</h3>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-overhead', pct(cfg.overheadPct, 1), 'Overhead', '%')}
                    ${numInput('cfg-margem', pct(cfg.margemAlvo, 1), 'Margem Alvo (referência)', '%')}
                    ${numInput('cfg-comissao', pct(cfg.comissaoPct, 1), 'Comissão', '%')}
                </div>
            </div>

            <div class="card fade-in" style="margin-bottom:1.5rem">
                <h3 class="titulo-secao">Buffer de risco por tier</h3>
                <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">Multiplicador adicional sobre o preço de venda para cobrir riscos e imprevistos.</p>
                <div style="display:flex;flex-wrap:wrap;gap:1rem">
                    ${numInput('cfg-buffer-1', pct(cfg.bufferRisco[1], 1), 'Foundation', '%')}
                    ${numInput('cfg-buffer-2', pct(cfg.bufferRisco[2], 1), 'Standard', '%')}
                    ${numInput('cfg-buffer-3', pct(cfg.bufferRisco[3], 1), 'Enterprise', '%')}
                    ${numInput('cfg-buffer-4', pct(cfg.bufferRisco[4], 1), 'Critical', '%')}
                </div>
            </div>

            <button class="btn btn-primary" style="padding:0.6rem 2rem" data-action="savePricingConfig">Salvar preços e margens</button>
            `;
        } catch(e) {
            console.error('Tabela de preços:', e);
            c.innerHTML = window.renderEmptyState({ titulo: 'Não foi possível carregar a tabela de preços', texto: 'Tente de novo; se persistir, avise o suporte.', acao: `<button class="btn btn-secondary" data-action="navigate" data-args='["settings"]'>Tentar de novo</button>` });
        }
    }

    async function savePricingConfig() {
        try {
            const g = id => parseFloat(document.getElementById(id).value) || 0;
            const config = {
                taxaVendaPD: { 1: g('cfg-venda-1'), 2: g('cfg-venda-2'), 3: g('cfg-venda-3'), 4: g('cfg-venda-4') },
                custoInternoPD: { 1: g('cfg-custo-1'), 2: g('cfg-custo-2'), 3: g('cfg-custo-3'), 4: g('cfg-custo-4') },
                tributos: {
                    iss: g('cfg-iss')/100, pis: g('cfg-pis')/100, cofins: g('cfg-cofins')/100,
                    irpj: g('cfg-irpj')/100, csll: g('cfg-csll')/100
                },
                overheadPct: g('cfg-overhead')/100,
                margemAlvo: g('cfg-margem')/100,
                comissaoPct: g('cfg-comissao')/100,
                bufferRisco: { 1: g('cfg-buffer-1')/100, 2: g('cfg-buffer-2')/100, 3: g('cfg-buffer-3')/100, 4: g('cfg-buffer-4')/100 }
            };
            try {
                await api('PUT', '/api/v1/pricing-config', config);
            } catch(err) {
                await api('PUT', '/api/v1/proposals/config/pricing', config);
            }
            showToast('Preços e margens salvos');
        } catch(e) { showToast('Erro: ' + e.message, 'error'); }
    }

    const MODULOS_CONTA = [['iso', 'n.iso'], ['privacy', 'n.privacy']];
    // Resposta antiga (sem o campo) mostra traço, não "sem módulo".
    const rotuloModulos = (m) => (!Array.isArray(m) ? '—' : m.length ? MODULOS_CONTA.filter(([v]) => m.includes(v)).map(([, r]) => r).join(' · ') : 'Nenhum');

    // Contas desativadas ficam escondidas por padrão; a escolha vale até recarregar a página.
    let mostrarDesativadas = false;
    // Filtro de organização da lista (só platform_admin): '' = todas as organizações.
    let filtroOrg = '';
    let contasListadas = [];
    const contaAtiva = (u) => u.ativo !== false;
    // A própria conta não se desativa nem se exclui (o servidor recusa com 409): sem botão.
    const propria = (u) => !!(S.user && S.user.id && String(S.user.id) === String(u.id));

    async function renderUsers(c, h, a) {
        h.textContent = 'Usuários';
        a.innerHTML = `<button class="btn btn-ghost" data-action="alternarDesativadas">${mostrarDesativadas ? 'Ocultar desativadas' : 'Mostrar desativadas'}</button>
            <button class="btn btn-primary" data-action="openUserModal">Novo usuário</button>`;
        c.innerHTML = '<div class="loading"></div>';
        try {
            const souPA = S.user?.role === 'platform_admin';
            const users = await (filtroOrg && souPA ? api('GET', '/api/v1/users', undefined, { 'X-Org-Id': filtroOrg }) : api('GET', '/api/v1/users'));
            const todas = Array.isArray(users) ? users : [];
            contasListadas = todas;
            const desativadas = todas.filter(u => !contaAtiva(u)).length;
            const userArr = mostrarDesativadas ? todas : todas.filter(contaAtiva);
            if (!S.projects || S.projects.length === 0) {
                await loadProjects();
            }
            const projMap = {};
            (S.projects || []).forEach(p => {
                projMap[p.id] = p.project_name || p.client_name;
            });

            // Os cartões contam todas as contas; o filtro de desativadas só muda a tabela.
            const totalUsers = todas.length;
            const admins = todas.filter(u => ['platform_admin', 'admin', 'consultor', 'consultant', 'comercial', 'consultoria_admin'].includes(u.role)).length;
            const clientUsers = totalUsers - admins;

            const statsHtml = window.renderStatCards([
                { label: 'Total de Usuários', value: totalUsers, color: 'var(--text)', subtext: desativadas ? `${desativadas} desativada(s)` : 'Nenhuma desativada' },
                { label: 'Administradores & Consultores', value: admins, color: 'var(--text)', subtext: 'Equipe da plataforma' },
                { label: 'Usuários de Clientes', value: clientUsers, color: 'var(--text)', subtext: 'Acesso às orgs' }
            ]);

            const tableHtml = window.renderDataTable(
                ['Nome', 'E-mail', 'Papel', 'Projeto', 'Consultoria', 'Módulos', 'Situação', 'Ações'],
                userArr.map(u => {
                    const projectName = u.client_project_id ? (projMap[u.client_project_id] || u.client_project_id) : '—';
                    const roleLabel = u.role === 'platform_admin' ? 'Admin Plataforma' : 
                                      u.role === 'consultant' || u.role === 'consultor' ? 'Consultor' :
                                      u.role === 'comercial' ? 'Comercial' :
                                      u.role === 'consultoria_admin' ? 'Admin da consultoria' :
                                      u.role === 'stakeholder' ? 'Stakeholder' :
                                      u.role === 'org_admin' ? 'Gestor Cliente' : 
                                      u.role === 'org_user' ? 'Colaborador Cliente' : u.role;
                    return [
                        `<strong>${escapeHTML(u.name)}</strong>`,
                        escapeHTML(u.email),
                        window.renderStatusBadge(roleLabel, u.role === 'platform_admin' ? 'info' : 'success'),
                        escapeHTML(projectName),
                        escapeHTML(window.nomeOrgDe?.(u.org) || '—'),
                        escapeHTML(rotuloModulos(u.modulos)),
                        window.renderStatusBadge(!contaAtiva(u) ? 'Desativada' : u.convite_pendente ? 'Convite pendente' : 'Ativa', contaAtiva(u) && !u.convite_pendente ? 'success' : 'info'),
                        // Uma ação à vista (Editar); reenviar convite, desativar e o destrutivo ficam no "Mais ações" da linha.
                        `<div class="acoes-linha"><button class="btn btn-ghost btn-sm" data-action="openUserModal" data-args='["${u.id}"]' aria-label="Editar: ${escapeHTML(u.name || u.email || '')}">Editar</button>
                         ${propria(u) ? '' : window.renderMaisAcoes([
                             u.convite_pendente && { rotulo: 'Reenviar convite', action: 'reenviarConviteUsuario', args: [u.id] },
                             { rotulo: contaAtiva(u) ? 'Desativar' : 'Reativar', action: 'confirmarContaAtiva', args: [u.id] },
                             S.user && S.user.role === 'platform_admin' && { rotulo: 'Excluir definitivamente', action: 'confirmarExclusaoDefinitiva', args: [u.id], perigo: true },
                         ], { nome: u.name || u.email || '' })}</div>`
                    ];
                }),
                { emptyState: 'Nenhum usuário cadastrado ainda. Use "Novo usuário" para convidar a equipe da ness. ou o administrador do cliente.' }
            );

            // Platform admin escolhe aqui de qual organização listar; sem escolha, todas.
            const orgsLista = souPA ? (window.orgsConhecidas?.() || []) : [];
            const nota = souPA && orgsLista.length ? `<div class="org-filtro-usuarios"><label class="org-sel-rotulo" for="usr-org">Consultoria</label>
                <select class="org-sel" id="usr-org" data-action-change="__usuariosFiltrarOrg" data-arg-val>
                    <option value="">Todas as consultorias</option>
                    ${orgsLista.map((o) => `<option value="${escapeHTML(o.id)}"${o.id === filtroOrg ? ' selected' : ''}>${escapeHTML(o.nome)}</option>`).join('')}
                </select></div>` : '';
            c.innerHTML = `
                ${statsHtml}
                ${nota}
                ${tableHtml}
            `;
        } catch (e) {
            window.falhaDeCarga(c, a, 'Não foi possível carregar os usuários.', e);
        }
    }

    async function renderAuditTrail(c, h, a) {
        h.textContent = tituloDaTela('nav-audit-trail', 'Trilha de auditoria');
        a.innerHTML = '';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            c.innerHTML = window.renderSemProjeto(); 
            return; 
        }

        c.innerHTML = '<div class="loading"></div>';
        let logs = [];
        try { logs = await api('GET', `/api/v1/projects/${proj.id}/audit-trail`); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar a trilha de auditoria.', e); return; }
        if (!Array.isArray(logs)) logs = [];

        const statsHtml = window.renderStatCards([
            { label: 'Total de Eventos', value: logs.length, color: 'var(--text)', subtext: 'Registros na trilha' },
            { label: 'Projeto Ativo', value: escapeHTML(proj.client_name || 'Sem nome'), color: 'var(--text)', subtext: `ID: ${proj.id}` }
        ]);

        const tableHtml = window.renderDataTable(
            ['Data / Hora', 'Usuário / Ator', 'Ação Realizada', 'Detalhes'],
            logs.map(l => [
                `<span style="white-space:nowrap;color:var(--text-dim);font-size:0.75rem">${formatarData(l.created_at || l.timestamp, { hora: true })}</span>`,
                `<strong>${escapeHTML(l.actor || l.user_email || 'System')}</strong>`,
                window.renderStatusBadge(l.action, 'info'),
                `<span style="font-size:0.75rem;color:var(--text-dim)">${escapeHTML(l.details || '—')}</span>`
            ]),
            { emptyState: 'Nenhum log registrado para este projeto até o momento.' }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    function alternarDesativadas() {
        mostrarDesativadas = !mostrarDesativadas;
        render();
    }

    // Confirmação na própria janela da tela (sem window.confirm).
    function janelaConfirmar(titulo, texto, acao, rotulo, perigo) {
        openModal(`
            <div class="modal-header"><span class="modal-title">${escapeHTML(titulo)}</span></div>
            <div style="padding:1.25rem 0;text-align:left"><p>${texto}</p>
                <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:1rem">
                    <button class="btn" data-action="forceCloseModal">Cancelar</button>
                    <button class="btn btn-primary"${perigo ? ' style="background:var(--danger);border-color:var(--danger)"' : ''} data-action="${acao.nome}" data-args='${JSON.stringify(acao.args)}'>${rotulo}</button>
                </div>
            </div>`);
    }

    function confirmarContaAtiva(id) {
        const u = contasListadas.find(x => x.id === id);
        if (!u) return;
        const ativar = !contaAtiva(u);
        const quem = `<strong>${escapeHTML(u.name)}</strong> (${escapeHTML(u.email)})`;
        janelaConfirmar(ativar ? 'Reativar conta' : 'Desativar conta',
            ativar ? `${quem} volta a poder entrar no sistema.`
                   : `${quem} deixa de poder entrar (senha e SSO) e as sessões abertas caem. Os registros continuam e a conta pode ser reativada. As chaves de API do projeto continuam valendo; revogue-as em Chaves de API.`,
            { nome: 'definirContaAtiva', args: [id, ativar] }, ativar ? 'Reativar' : 'Desativar', false);
    }

    async function definirContaAtiva(id, ativo) {
        try {
            await api('PUT', `/api/v1/users/${id}/ativo`, { ativo });
            forceCloseModal();
            showToast(ativo ? 'Conta reativada' : 'Conta desativada');
            render();
        } catch (e) {
            forceCloseModal();
            showToast('Erro ao ' + (ativo ? 'reativar' : 'desativar') + ' a conta: ' + e.message, 'error');
        }
    }

    function confirmarExclusaoDefinitiva(id) {
        const u = contasListadas.find(x => x.id === id);
        if (!u) return;
        janelaConfirmar('Excluir definitivamente',
            `Isto apaga a conta <strong>${escapeHTML(u.name)}</strong> (${escapeHTML(u.email)}) do sistema e não pode ser desfeito. Para só impedir o acesso, use Desativar.`,
            { nome: 'excluirContaDefinitiva', args: [id] }, 'Excluir definitivamente', true);
    }

    async function excluirContaDefinitiva(id) {
        try {
            const r = await api('DELETE', `/api/v1/users/${id}?definitivo=1`);
            forceCloseModal();
            showToast(r && r.anonimizado ? 'A conta tem histórico: ficou sem identidade e sem acesso, e o e-mail foi liberado' : 'Conta excluída definitivamente');
            render();
        } catch (e) {
            forceCloseModal();
            showToast('Erro ao excluir a conta: ' + e.message, 'error');
        }
    }

    async function reenviarConviteUsuario(id) {
        try {
            const r = await api('POST', `/api/v1/users/${id}/reenviar-convite`, {});
            showToast(r && r.emailEnviado === false ? 'O convite não saiu por e-mail. Tente de novo mais tarde.' : 'Convite reenviado. O link anterior deixou de valer.', r && r.emailEnviado === false ? 'error' : undefined);
            render();
        } catch (e) {
            showToast('Erro ao reenviar o convite: ' + e.message, 'error');
        }
    }

    async function openUserModal(userId) {
        let user = null;
        let tetoModulos = [];
        if (userId) {
            try {
                const users = await api('GET', '/api/v1/users');
                user = users.find(u => u.id === userId);
                tetoModulos = (user && user.teto_modulos) || [];
            } catch(e) {
                showToast('Erro ao buscar dados do usuário', 'error');
                return;
            }
        } else {
            // Conta nova: o teto de quem cria é o maior teto das contas que ele enxerga (platform_admin, todos).
            const lista = await api('GET', '/api/v1/users').catch(() => []); // secundário: sem a lista, o formulário abre sem teto de módulos
            tetoModulos = [...new Set((Array.isArray(lista) ? lista : []).flatMap(u => u.teto_modulos || []))];
        }

        if (!S.projects || S.projects.length === 0) {
            try {
                await loadProjects();
            } catch (e) { /* secundário: o seletor de projeto abre vazio */ }
        }

        const projectSelectOptions = (S.projects || []).map(p => `
            <option value="${p.id}" ${user && user.client_project_id === p.id ? 'selected' : ''}>
                ${escapeHTML(p.project_name || p.client_name)}
            </option>
        `).join('');

        // Papéis que quem usa pode atribuir — espelho de soPlatformAdmin (users.ts), que é quem barra:
        // platform_admin, qualquer um; consultoria_admin, a equipe da própria organização e o cliente
        // (nunca platform_admin); os demais gestores, só usuário de cliente. O valor é o do
        // PAPEIS_DE_CONTA do servidor (`consultor`, não a grafia legada `consultant`).
        const papelAtual = S.user && S.user.role === 'admin' ? 'platform_admin' : S.user?.role;
        const isSystemAdmin = papelAtual === 'platform_admin' || papelAtual === 'consultoria_admin';
        const PAPEIS = [
            ['platform_admin', 'Administrador de Plataforma', ['platform_admin']],
            ['consultoria_admin', 'Administrador da consultoria', ['platform_admin', 'consultoria_admin']],
            ['consultor', 'Consultor', ['platform_admin', 'consultoria_admin']],
            ['comercial', 'Comercial', ['platform_admin', 'consultoria_admin']],
            ['org_admin', 'Gestor do Cliente', null],
            ['org_user', 'Colaborador do Cliente', null],
        ];
        const papelDoUsuario = user && user.role === 'consultant' ? 'consultor' : user?.role;
        const roleOptions = '<option value="">Selecione um papel</option>' + PAPEIS
            .filter(([, , quem]) => !quem || quem.includes(papelAtual))
            .map(([v, rotulo]) => `<option value="${v}" ${papelDoUsuario === v ? 'selected' : ''}>${rotulo}</option>`).join('');
        // platform_admin: a conta de equipe nasce na organização do seletor do cabeçalho (X-Org-Id).
        const notaOrg = papelAtual === 'platform_admin'
            ? `<p class="org-dica" id="user-m-org-nota">Conta de equipe (administrador, consultor, comercial) nasce na consultoria em que você atua: ${S.orgAtuacao ? escapeHTML(window.nomeOrgAtuacao?.() || S.orgAtuacao) : 'a ness.'}. Para outra, troque no seletor do cabeçalho.</p>`
            : '';

        const activeProjId = S.activeProject ? S.activeProject.id : (S.user ? S.user.client_project_id : null);
        let govMembers = [];
        if (activeProjId) {
            try {
                govMembers = await api('GET', `/api/v1/projects/${activeProjId}/governance`);
            } catch(e) {
                govMembers = [];
            }
        }
        
        let govImportHtml = '';
        if (!user && govMembers.length > 0) {
            govImportHtml = `
                <div class="form-group" style="margin-bottom: 1.25rem; border-bottom: 1px dashed var(--border); padding-bottom: 1.25rem;">
                    <label class="form-label" style="color:var(--accent)">Importar da Governança do Projeto</label>
                    <select id="user-m-gov-import" class="form-input" data-action-change="importFromGovernance" data-arg-val>
                        <option value="">Selecione um membro para importar...</option>
                        ${govMembers.map((m, idx) => `<option value="${idx}">${escapeHTML(m.name)} (${escapeHTML(m.job_title)})</option>`).join('')}
                    </select>
                </div>
            `;
        }
        
        window.govMembersList = govMembers;
        window.importFromGovernance = function(idx) {
            if (idx === '') return;
            const member = window.govMembersList[parseInt(idx, 10)];
            if (!member) return;
            
            const nameInput = document.getElementById('user-m-name');
            const emailInput = document.getElementById('user-m-email');
            const roleSelect = document.getElementById('user-m-role');
            
            if (nameInput) nameInput.value = member.name || '';
            if (emailInput) emailInput.value = member.email || '';
            
            if (roleSelect) {
                const title = (member.job_title || '').toLowerCase();
                if (title.includes('ceo') || title.includes('ciso') || title.includes('sgsi') || title.includes('diret') || title.includes('execut')) {
                    roleSelect.value = 'org_admin';
                } else {
                    roleSelect.value = 'org_user';
                }
            }
        };

        const isClientRole = user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client');
        const showProjectSelect = isSystemAdmin && (!user || isClientRole);

        const html = `
            <div class="modal-header">
                <span class="modal-title">${user ? 'Editar Usuário' : 'Novo Usuário'}</span>
                
            </div>
            <div style="display:flex; flex-direction:column; gap:1.25rem">
                ${govImportHtml}
                <div class="form-group">
                    <label class="form-label">Nome Completo</label>
                    <input type="text" id="user-m-name" class="form-input" value="${user ? escapeHTML(user.name) : ''}" placeholder="Ex: Roberto Silva">
                </div>
                <div class="form-group">
                    <label class="form-label">E-mail</label>
                    <input type="email" id="user-m-email" class="form-input" value="${user ? escapeHTML(user.email) : ''}" placeholder="usuario@empresa.com" ${user && S.user?.role !== 'platform_admin' ? 'readonly style="opacity: 0.6"' : ''}>
                </div>
                ${user ? (user.id === S.user?.id ? `<div class="form-group">
                    <label class="form-label" for="user-m-password">Senha (deixe em branco para manter a atual)</label>
                    <input type="password" id="user-m-password" class="form-input" placeholder="••••••••" autocomplete="new-password">
                </div>` : `<div class="form-group">
                    <label class="org-dica"><input type="checkbox" id="user-m-redefinir"> Redefinir a senha: a atual deixa de valer e a pessoa recebe um link para criar a dela (vale 72 horas)</label>
                </div>`) : '<p class="org-dica" id="user-m-convite-nota">A pessoa recebe um e-mail com o link para criar a própria senha (vale 72 horas). Ninguém mais conhece a senha.</p>'}
                <div class="form-group">
                    <label class="form-label">Papel</label>
                    <select id="user-m-role" class="form-input" data-action-change="toggleUserProjectSelect" data-arg-val>
                        ${roleOptions}
                    </select>
                    ${notaOrg}
                </div>
                
                <div class="form-group" id="user-m-project-group" style="display: ${showProjectSelect ? 'block' : 'none'}">
                    <label class="form-label">Projeto Associado</label>
                    <select id="user-m-project" class="form-input">
                        <option value="">Nenhum projeto selecionado</option>
                        ${projectSelectOptions}
                    </select>
                </div>

                <fieldset class="form-group" id="user-m-modulos-grupo" style="border:0;padding:0;margin:0">
                    <legend class="form-label">Módulos</legend>
                    ${MODULOS_CONTA.map(([v, r]) => {
                        const tem = !!(user && Array.isArray(user.modulos) && user.modulos.includes(v));
                        const pode = tetoModulos.includes(v);
                        return `<label style="display:block"><input type="checkbox" class="user-m-modulo" value="${v}" ${tem ? 'checked' : ''} ${pode ? '' : 'disabled'}> ${r}${pode ? '' : ' (fora do que a consultoria ou o projeto contratou)'}</label>`;
                    }).join('')}
                    <p class="org-dica">${user ? 'Define a que a pessoa acessa nos projetos que têm o módulo.' : 'Sem marcar nenhum, a conta recebe os módulos padrão do projeto ou da consultoria.'}</p>
                </fieldset>

                <div style="display:flex; gap:1rem; margin-top:1.5rem">
                    <button class="btn btn-primary" style="flex:1" data-action="saveUser" data-args='["${user ? user.id : ""}"]'>Salvar</button>
                    <button class="btn" style="flex:1" data-action="closeModal">Cancelar</button>
                </div>
            </div>
        `;
        openModal(html);
    }

    window.toggleUserProjectSelect = function(role) {
        const group = document.getElementById('user-m-project-group');
        if (group) {
            const isSystemAdmin = S.user && ['platform_admin', 'admin', 'consultor', 'consultant', 'consultoria_admin'].includes(S.user.role);
            if (isSystemAdmin && (role === 'org_admin' || role === 'org_user' || role === 'client')) {
                group.style.display = 'block';
            } else {
                group.style.display = 'none';
                const projSelect = document.getElementById('user-m-project');
                if (projSelect) projSelect.value = '';
            }
        }
    };

    window.saveUser = async function(id) {
        const name = document.getElementById('user-m-name').value.trim();
        const email = document.getElementById('user-m-email').value.trim();
        const campoSenha = document.getElementById('user-m-password');
        const password = campoSenha ? campoSenha.value : '';
        const role = document.getElementById('user-m-role').value;
        const projectEl = document.getElementById('user-m-project');
        const client_project_id = projectEl ? (projectEl.value || null) : null;

        if (!name || !email || !role) {
            showToast('Preencha os campos obrigatórios (Nome, E-mail e Papel).', 'error');
            return;
        }

        const payload = { name, email, role, client_project_id };
        // Só na edição: a conta nova nasce sem senha e a pessoa a cria pelo link do convite.
        if (id && password) {
            payload.password = password;
        }
        if (id && document.getElementById('user-m-redefinir')?.checked) payload.redefinir_senha = true;
        // Caixas de módulo (só as habilitadas, dentro do teto). Na criação vai `modulos` se marcou algum; na edição, o PUT
        // próprio depois do salvar e só se mudou.
        const caixas = [...document.querySelectorAll('.user-m-modulo:not(:disabled)')];
        const marcados = caixas.filter(x => x.checked).map(x => x.value);

        try {
            if (id) {
                await api('PUT', `/api/v1/users/${id}`, payload);
                const antes = caixas.filter(x => x.defaultChecked).map(x => x.value);
                if (caixas.length && marcados.join() !== antes.join()) await api('PUT', `/api/v1/users/${id}/modulos`, { modulos: marcados });
                showToast('Usuário atualizado com sucesso');
            } else {
                if (marcados.length) payload.modulos = marcados;
                const r = await api('POST', '/api/v1/users', payload);
                showToast(r && r.emailEnviado === false ? 'Usuário criado, mas o e-mail do convite não saiu: use "Reenviar convite".' : 'Usuário criado. O convite foi enviado por e-mail.', r && r.emailEnviado === false ? 'error' : undefined);
            }
            closeModal();
            render();
        } catch (e) {
            showToast('Erro ao salvar usuário: ' + e.message, 'error');
        }
    };

    // ── Chaves de API (MCP / Integrações) — EXCLUSIVO Platform Admin ──────────────
    // Papéis atuais; `write`/`admin` só aparecem como rótulo de chaves antigas, não se oferecem na criação.
    const PAPEL_CHAVE = { consultant: 'Consultor', consultor: 'Consultor', auditor: 'Auditor', read: 'Somente leitura', write: 'Escrita (legado)', admin: 'Admin (legado)' };
    const rotuloPapelChave = (p) => PAPEL_CHAVE[p || 'read'] || String(p);

    async function renderApiKeys(c, h, a) {
        h.textContent = 'Chaves de API';
        a.innerHTML = '';
        if (!S.user || S.user.role !== 'platform_admin') {
            c.innerHTML = '<div class="error">Acesso restrito ao administrador da plataforma.</div>';
            return;
        }
        c.innerHTML = '<div class="loading"></div>';
        try {
            if (!S.projects || S.projects.length === 0) { await loadProjects(); }
            const projects = S.projects || [];
            if (!S.apiKeysProjectId && projects.length) S.apiKeysProjectId = projects[0].id;
            const pid = S.apiKeysProjectId;
            a.innerHTML = `<button class="btn btn-primary" data-action="openApiKeyModal" ${pid ? '' : 'disabled'}>Nova chave</button>`;
            const projOptions = projects.map(p =>
                `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${escapeHTML(p.project_name || p.client_name || p.id)}</option>`
            ).join('');

            let tabela = '';
            if (pid) {
                // api() desembrulha o envelope { ok, keys: [...] } e devolve o array direto.
                // Deixar o erro propagar para o catch externo — não mascarar falha como "sem chaves".
                const resp = await api('GET', `/api/v1/projects/${pid}/api-keys`);
                const keys = Array.isArray(resp) ? resp : ((resp && resp.keys) || []);
                tabela = window.renderDataTable(
                    ['Nome', 'Papel', 'Status', 'Último uso', 'Criada', ''],
                    keys.map(k => {
                        const active = k.status === 'Active';
                        return [
                            escapeHTML(k.name || ''),
                            escapeHTML(rotuloPapelChave(k.permissions)),
                            window.renderStatusBadge(k.status, active ? 'success' : 'info'),
                            formatarData(k.last_used_at, { hora: true }),
                            formatarData(k.created_at),
                            active ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger-ink)" data-action="revokeApiKey" data-args='["${k.id}"]'>Revogar</button>` : '',
                        ];
                    }),
                    { emptyState: 'Nenhuma chave para este projeto.' }
                );
            }

            c.innerHTML = `
            <div class="card fade-in" style="margin-bottom:1rem">
                <p class="form-hint" style="margin-bottom:1rem">Chaves de API para integrações e agentes MCP. Papéis: <strong>Consultor</strong> (implementação), <strong>Auditor</strong> (achados de auditoria), <strong>Somente leitura</strong>. A chave em texto puro aparece <strong>uma única vez</strong> na criação — só o hash é armazenado.</p>
                <div class="form-group" style="max-width:420px;margin:0">
                    <label class="form-label" for="apikeys-projeto">Projeto</label>
                    <select id="apikeys-projeto" class="form-input" data-action-change="__setFilter" data-args='["apiKeysProjectId"]' data-arg-val>${projOptions}</select>
                </div>
            </div>
            ${tabela}`;
        } catch (e) {
            window.falhaDeCarga(c, a, 'Não foi possível carregar as chaves de API.', e);
        }
    }

    window.openApiKeyModal = function () {
        if (!S.apiKeysProjectId) { showToast('Selecione um projeto', 'error'); return; }
        openModal(`
            <div class="modal-header"><span class="modal-title">Nova chave de API</span></div>
            <div style="padding:1.25rem 0;text-align:left">
                <div class="form-group"><label class="form-label">Nome</label><input id="apikey-name" class="form-input" placeholder="ex: consultor-clienteX"></div>
                <div class="form-group"><label class="form-label">Papel</label>
                    <select id="apikey-perm" class="form-input">
                        <option value="consultant">Consultor — implementação</option>
                        <option value="auditor">Auditor — achados de auditoria</option>
                        <option value="read">Somente leitura</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">Expiração</label>
                    <select id="apikey-exp" class="form-input">
                        <option value="90">90 dias (recomendado)</option>
                        <option value="30">30 dias</option>
                        <option value="180">180 dias</option>
                        <option value="365">1 ano</option>
                        <option value="">Sem expiração (não recomendado)</option>
                    </select>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:1rem">
                    <button class="btn" data-action="forceCloseModal" style="background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1)">Cancelar</button>
                    <button class="btn btn-primary" data-action="createApiKey">Criar</button>
                </div>
            </div>`);
    };

    window.createApiKey = async function () {
        const pid = S.apiKeysProjectId;
        const name = (document.getElementById('apikey-name').value || '').trim();
        const permissions = document.getElementById('apikey-perm').value;
        const expDays = document.getElementById('apikey-exp').value;
        if (!name) { showToast('Informe um nome', 'error'); return; }
        try {
            const body = { name, permissions };
            if (expDays) body.expires_at = new Date(Date.now() + parseInt(expDays, 10) * 86400000).toISOString();
            const res = await api('POST', `/api/v1/projects/${pid}/api-keys`, body);
            const key = (res && res.key) || '';
            openModal(`
                <div class="modal-header"><span class="modal-title">Chave criada</span><button class="btn-ghost" data-action="__adminFecharConcluir">Fechar</button></div>
                <div style="padding:1.25rem 0;text-align:left">
                    <p style="font-size:0.8rem;color:var(--danger-ink);margin-bottom:0.75rem"><strong>Copie agora.</strong> Esta chave não será exibida novamente — só o hash é armazenado.</p>
                    <div style="display:flex;gap:8px;align-items:center">
                        <input id="apikey-plain" class="form-input" readonly value="${escapeHTML(key)}" style="font-family:monospace;font-size:0.8rem">
                        <button class="btn" data-action="__adminCopiarApiKey">Copiar</button>
                    </div>
                    <div style="display:flex;justify-content:flex-end;margin-top:1rem">
                        <button class="btn btn-primary" data-action="__adminFecharConcluir">Concluir</button>
                    </div>
                </div>`);
        } catch (e) { showToast('Erro ao criar chave: ' + e.message, 'error'); }
    };

    window.revokeApiKey = async function (id) {
        if (!(await window.confirmar('A integração que usa esta chave perde o acesso na próxima chamada. A revogação é permanente.', { titulo: 'Revogar chave de API', rotulo: 'Revogar', perigo: true }))) return;
        try {
            await api('DELETE', `/api/v1/api-keys/${id}`);
            showToast('Chave revogada');
            render();
        } catch (e) { showToast('Erro ao revogar: ' + e.message, 'error'); }
    };

export { renderSettings, renderUsers, renderAuditTrail, renderApiKeys };
window.renderSettings = renderSettings;
window.renderUsers = renderUsers;
window.renderAuditTrail = renderAuditTrail;
window.renderApiKeys = renderApiKeys;
window.savePricingConfig = savePricingConfig;
window.alternarDesativadas = alternarDesativadas;
window.__usuariosFiltrarOrg = (id) => { filtroOrg = id || ''; render(); };
window.confirmarContaAtiva = confirmarContaAtiva;
window.reenviarConviteUsuario = reenviarConviteUsuario;
window.definirContaAtiva = definirContaAtiva;
window.confirmarExclusaoDefinitiva = confirmarExclusaoDefinitiva;
window.excluirContaDefinitiva = excluirContaDefinitiva;
window.openUserModal = openUserModal;
