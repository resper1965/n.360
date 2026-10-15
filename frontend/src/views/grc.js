import { rotuloDe } from '../rotulos.js';
import { S } from '../state.js';
import { api, API_BASE } from '../api.js';
import { showToast, openModal, closeModal, escapeHTML, traduzStatus, formatarData } from '../ui.js';
import { navigate } from '../router.js';
import { renderAcessoAuditor } from './auditor-acesso.js';
import { opcoesDePartes } from '../partes-opcoes.js';
import { nivelDaNota, nivelDoEscore } from '../nivel-risco.js';
import { filtrarDoPainel } from '../filtro-painel.js';

// S2: wrappers para handlers COMPOSTOS/inline (a delegação chama uma função só).
window.__grcDeleteRisk = async function (riskId) {
    if (await window.confirmar('O risco sai do registro e da matriz deste projeto.', { titulo: 'Excluir risco', perigo: true, rotulo: 'Excluir' })) {
        api('DELETE', `/api/v1/risks/${riskId}`).then(() => { window.forceCloseModal(); window.render(); });
    }
};
window.__grcCloseExecAudit = function (id) {
    window.forceCloseModal();
    navigate('audit-execution', { activeAuditId: id });
};

    async function renderRisks(c, h, a) {
        h.textContent = 'Riscos';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = window.renderSemProjeto(); return; }
        const isOrgUser = S.user && S.user.role === 'org_user';
        a.innerHTML = isOrgUser ? '' : `<button class="btn btn-primary" data-action="openNewRiskModal" data-args='["${proj.id}"]'>+ Novo Risco</button>`;
        
        let risks = [];
        try { risks = await api('GET', `/api/v1/projects/${proj.id}/risks`); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os riscos.', e); return; }
        if (!Array.isArray(risks)) risks = [];
        S.risks = risks;
        
        // Reset filter if project changed
        if (S.riskFilterProjectId !== proj.id) {
            S.riskFilter = null;
            S.riskFilterProjectId = proj.id;
        }

        // Calculate stats
        let criticalCount = 0;
        let highCount = 0;
        let mediumCount = 0;
        let lowCount = 0;
        let totalScore = 0;

        // Faixa de nível do servidor (`riskLevel`), a mesma do mapa do n.privacy.
        risks.forEach(r => {
            const score = r.risk_score || (r.impact * r.probability);
            totalScore += score;
            const nivel = nivelDoEscore(score);
            if (nivel === 'Critical') criticalCount++;
            else if (nivel === 'High') highCount++;
            else if (nivel === 'Medium') mediumCount++;
            else lowCount++;
        });

        const averageScore = risks.length ? (totalScore / risks.length).toFixed(1) : '—';

        const getCellLevel = nivelDaNota;

        const getCellColor = (level) => {
            switch(level) {
                case 'Critical': return { bg: 'rgba(165, 29, 29, 0.65)', border: 'rgba(239, 68, 68, 0.45)' };
                case 'High':     return { bg: 'rgba(180, 80, 25, 0.55)', border: 'rgba(249, 115, 22, 0.4)' };
                case 'Medium':   return { bg: 'rgba(145, 110, 25, 0.45)', border: 'rgba(234, 179, 8, 0.45)' };
                case 'Low': default: return { bg: 'rgba(20, 60, 100, 0.65)', border: 'rgba(0, 173, 232, 0.35)' };
            }
        };

        // Render cells
        let cellsHTML = '';
        for (let p = 5; p >= 1; p--) {
            for (let i = 1; i <= 5; i++) {
                const cellRisks = risks.filter(r => r.probability === p && r.impact === i);
                const count = cellRisks.length;
                const level = getCellLevel(p, i);
                const colors = getCellColor(level);
                const isSelected = S.riskFilter && S.riskFilter.probability === p && S.riskFilter.impact === i;
                
                cellsHTML += `
                    <div class="matrix-cell ${isSelected ? 'selected' : ''}" 
                         style="background: ${colors.bg}; border: 1px solid ${isSelected ? 'var(--accent)' : colors.border};" 
                         data-action="toggleRiskFilter" data-args='[${p},${i}]'
                         title="Probabilidade: ${p}, Impacto: ${i} (${count} risco${count !== 1 ? 's' : ''})">
                        ${count > 0 ? `<span class="cell-counter">${count}</span>` : ''}
                    </div>
                `;
            }
        }

        // Vazio por filtro e vazio de verdade dizem coisas diferentes.
        const VAZIO_RISCOS = risks.length
            ? { titulo: 'Nenhum risco nesta célula da matriz', texto: 'Limpe o filtro para ver os demais riscos.' }
            : { titulo: 'Nenhum risco registrado', texto: 'A apreciação de riscos (ISO 27001, 6.1.2) é o que justifica cada controle da SoA. Registre os riscos de segurança e de privacidade do escopo.',
                acao: isOrgUser ? '' : `<button class="btn btn-primary" data-action="openNewRiskModal" data-args='["${proj.id}"]'>Novo risco</button>` };
        // Apply filter if active
        let filteredRisks = risks;
        let filterIndicatorBar = '';
        if (S.riskFilter) {
            filteredRisks = risks.filter(r => r.probability === S.riskFilter.probability && r.impact === S.riskFilter.impact);
            filterIndicatorBar = `
                <div class="filter-indicator-bar" style="display:flex; justify-content:space-between; align-items:center; background:rgba(0, 173, 232, 0.1); border: 1px solid rgba(0, 173, 232, 0.2); padding:0.5rem 1rem; margin-bottom:1.5rem; font-size:0.8rem; animation: fadeIn 0.2s ease-out;">
                    <span>Filtrando riscos com <strong>Impacto ${S.riskFilter.impact}</strong> e <strong>Probabilidade ${S.riskFilter.probability}</strong> (${filteredRisks.length} encontrado${filteredRisks.length !== 1 ? 's' : ''})</span>
                    <button class="btn btn-ghost" data-action="toggleRiskFilter" data-args='[${S.riskFilter.probability},${S.riskFilter.impact}]' style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--accent);">Limpar Filtro</button>
                </div>
            `;
        }

        const levelColor = l => l === 'Critical' ? 'var(--danger)' : l === 'High' ? 'var(--warning)' : l === 'Medium' ? 'var(--warning)' : 'var(--accent)';

        c.innerHTML = `
            <div class="fade-in">
                <!-- Matrix Container -->
                <div class="matrix-container">
                    <!-- Matrix Card -->
                    <div class="card" style="flex: 1.2; min-width: 320px; padding: 1.5rem; margin-bottom: 0;">
                        <div class="card-label">Matriz de Riscos (Impacto vs Probabilidade)</div>
                        <div class="matrix-layout">
                            <!-- Vertical label -->
                            <div class="matrix-y-title">PROBABILIDADE</div>
                            <!-- Y-axis numbers -->
                            <div class="matrix-y-axis">
                                <div>5</div>
                                <div>4</div>
                                <div>3</div>
                                <div>2</div>
                                <div>1</div>
                            </div>
                            <!-- 5x5 Grid cells -->
                            <div class="matrix-grid-5x5">
                                ${cellsHTML}
                            </div>
                            <!-- Spacers -->
                            <div></div>
                            <div></div>
                            <!-- X-axis numbers -->
                            <div class="matrix-x-axis">
                                <div>1</div>
                                <div>2</div>
                                <div>3</div>
                                <div>4</div>
                                <div>5</div>
                            </div>
                            <!-- Spacers -->
                            <div></div>
                            <div></div>
                            <!-- Horizontal title -->
                            <div class="matrix-x-title">IMPACTO</div>
                        </div>
                    </div>
                    
                    <!-- Stats Sidebar -->
                    <div class="matrix-sidebar">
                        <div class="card" style="padding: 1.25rem; margin-bottom: 0;">
                            <div class="card-label">Distribuição de Riscos</div>
                            <div class="legend-list">
                                <div class="legend-item">
                                    <div class="legend-color" style="background: rgba(165, 29, 29, 0.65); border: 1px solid rgba(239, 68, 68, 0.45);"></div>
                                    <div style="flex: 1;">Crítico (nota 21-25)</div>
                                    <div style="font-weight: 600; color: var(--danger);">${criticalCount}</div>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color" style="background: rgba(180, 80, 25, 0.55); border: 1px solid rgba(249, 115, 22, 0.4);"></div>
                                    <div style="flex: 1;">Alto (nota 13-20)</div>
                                    <div style="font-weight: 600; color: var(--warning);">${highCount}</div>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color" style="background: rgba(145, 110, 25, 0.45); border: 1px solid rgba(234, 179, 8, 0.45);"></div>
                                    <div style="flex: 1;">Médio (nota 6-12)</div>
                                    <div style="font-weight: 600; color: var(--warning);">${mediumCount}</div>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color" style="background: rgba(20, 60, 100, 0.65); border: 1px solid rgba(0, 173, 232, 0.35);"></div>
                                    <div style="flex: 1;">Baixo (nota 1-5)</div>
                                    <div style="font-weight: 600; color: var(--accent);">${lowCount}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="card" style="padding: 1.25rem; margin-bottom: 0; display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <div class="card-label" style="margin-bottom: 0.25rem;">Total de Riscos</div>
                                <div style="font-size: 1.8rem; font-weight: 500; font-family: 'Montserrat', sans-serif;">${risks.length}</div>
                            </div>
                            <div style="text-align: right;">
                                <div class="card-label" style="margin-bottom: 0.25rem;">Score Médio</div>
                                <div style="font-size: 1.8rem; font-weight: 500; color: var(--text); font-family: 'Montserrat', sans-serif;">${averageScore}</div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Filter indicator -->
                ${filterIndicatorBar}
                
                <!-- List Section -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; margin-top: 1rem;">
                    <div class="card-label" style="margin-bottom: 0;">Lista Detalhada de Riscos</div>
                    ${risks.length ? `<button class="btn" data-action="exportCSV" data-args='["risks"]' style="font-size:0.7rem; padding:0.4rem 0.8rem">Exportar Riscos</button>` : ''}
                </div>
                
                <div>
                    ${filteredRisks.length ? filteredRisks.map(r => `
                        <div class="list-item" style="cursor:pointer" data-action="openRiskDetailsModal" data-args='["${r.id}"]'>
                            <div style="flex:1">
                                <div class="item-name">${escapeHTML(r.asset)} — ${escapeHTML(r.threat)}</div>
                                <div class="item-meta" style="margin-top:0.25rem">
                                    <strong>Probabilidade:</strong> ${r.probability} | <strong>Impacto:</strong> ${r.impact} | 
                                    <strong>Tratamento:</strong> ${escapeHTML(traduzStatus(r.treatment) || 'Não definido')} | <strong>Responsável:</strong> ${escapeHTML(r.owner_parte_nome || r.owner || 'Sem dono')}
                                    ${r.control_standard ? ` | <strong>Controle:</strong> <span class="badge badge-implemented" style="padding:2px 6px;font-size:0.75rem">${escapeHTML(r.control_standard)}</span>` : ''}
                                    ${r.treatment === 'Accept' && r.accepted_by ? ` | <strong>Aceito por:</strong> ${escapeHTML(r.accepted_by)}` : ''}
                                </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:0.5rem">
                                <span style="font-weight:600;color:${levelColor(r.risk_level)}">${r.risk_score || (r.impact * r.probability)}</span>
                                <span class="ctx-tag" style="background:color-mix(in oklab, ${levelColor(r.risk_level)} 12%, transparent);color:${levelColor(r.risk_level)}">${escapeHTML(traduzStatus(r.risk_level) || 'Sem nível')}</span>
                            </div>
                        </div>
                    `).join('') : window.renderEmptyState(VAZIO_RISCOS)}
                </div>
            </div>
        `;
    }

    window.toggleRiskFilter = function(p, i) {
        if (S.riskFilter && S.riskFilter.probability === p && S.riskFilter.impact === i) {
            S.riskFilter = null;
        } else {
            S.riskFilter = { probability: p, impact: i };
        }
        render();
    };

    window.onRiskAssetSelectChange = function(select) {
        const manualGroup = document.getElementById('risk-asset-manual-group');
        const manualInput = document.getElementById('risk-asset');
        if (select.value === '__manual__' || select.value === '') {
            manualGroup.style.display = '';
            if (select.value === '') manualInput.value = '';
        } else {
            manualGroup.style.display = 'none';
            const opt = select.options[select.selectedIndex];
            manualInput.value = opt.getAttribute('data-name');
        }
    };

    window.onRiskTreatmentChange = function(select) {
        const acceptGroup = document.getElementById('risk-accept-group');
        if (select.value === 'Accept') {
            acceptGroup.style.display = '';
            const dtInput = document.getElementById('risk-accepted-at');
            if (!dtInput.value) dtInput.value = new Date().toISOString().split('T')[0];
        } else {
            acceptGroup.style.display = 'none';
        }
    };

    window.openNewRiskModal = async function(projectId) {
        let assets = [];
        let controls = [];
        try { 
            const r = await api('GET', `/api/v1/projects/${projectId}/assets`);
            assets = Array.isArray(r) ? r : (r?.assets || []);
            controls = await api('GET', `/api/v1/projects/${projectId}/controls`);
        } catch (e) { /* dado secundário: o formulário abre sem as opções de ativo e controle */ }
        if (!Array.isArray(controls)) controls = [];
        const parteOptions = await opcoesDePartes(projectId, null);

        const controlOptions = controls
            .filter(c => c.status !== 'Not Applicable')
            .map(c => `<option value="${c.id}">${escapeHTML(c.standard)} - ${escapeHTML(c.title)}</option>`)
            .join('');

        openModal(`
            <div class="modal-header"><span class="modal-title">Novo Risco</span></div>
            <div class="form-group">
                <label class="form-label">Ativo do Inventário (Opcional)</label>
                <select class="form-input" id="risk-asset-select" data-action-change="onRiskAssetSelectChange" data-arg-el>
                    <option value="">-- Escolha um ativo --</option>
                    ${assets.map(a => `<option value="${a.id}" data-name="${escapeHTML(a.name)}">${escapeHTML(a.name)} (${a.category})</option>`).join('')}
                    <option value="__manual__">-- Digitar manualmente --</option>
                </select>
            </div>
            <div class="form-group" id="risk-asset-manual-group">
                <label class="form-label">Nome do Ativo</label>
                <input class="form-input" id="risk-asset" placeholder="Ex: Servidor de producao">
            </div>
            <div class="form-group"><label class="form-label">Ameaça</label><input class="form-input" id="risk-threat" placeholder="Ex.: acesso não autorizado"></div>
            <div class="form-group"><label class="form-label">Vulnerabilidade</label><input class="form-input" id="risk-vuln" placeholder="Ex: Falta de MFA"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Impacto (1-5)</label><input class="form-input" id="risk-impact" type="number" min="1" max="5" value="3"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Probabilidade (1-5)</label><input class="form-input" id="risk-prob" type="number" min="1" max="5" value="3"></div>
            </div>
            <div class="form-group">
                <label class="form-label">Tratamento</label>
                <select class="form-input" id="risk-treatment" data-action-change="onRiskTreatmentChange" data-arg-el>
                    <option value="Mitigate">Mitigar</option>
                    <option value="Accept">Aceitar</option>
                    <option value="Transfer">Transferir</option>
                    <option value="Avoid">Evitar</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Controle Annex A Vinculado (Opcional)</label>
                <select class="form-input" id="risk-control">
                    <option value="">-- Sem controle vinculado --</option>
                    ${controlOptions}
                </select>
            </div>
            <div id="risk-accept-group" style="display:none">
                <div class="form-group"><label class="form-label">Assinado/Aceito por</label><input class="form-input" id="risk-accepted-by" placeholder="Ex: Maria Silva (CEO)"></div>
                <div class="form-group"><label class="form-label">Data do Aceite</label><input class="form-input" id="risk-accepted-at" type="date"></div>
            </div>
            <div class="form-group"><label class="form-label">Responsável (cadastro de partes)</label><select class="form-input" id="risk-owner-parte">${parteOptions}</select></div>
            <div class="form-group"><label class="form-label">Responsável (texto livre)</label><input class="form-input" id="risk-owner" placeholder="Ex: CISO"></div>
            <div class="form-group"><label class="form-label">Plano de Tratamento</label><textarea class="form-input" id="risk-plan" rows="2" placeholder="Descreva as acoes..."></textarea></div>
            <button class="btn btn-primary" style="width:100%" data-action="createRisk" data-args='["${projectId}"]'>Registrar Risco</button>
        `);
    };

    window.createRisk = async function(projectId) {
        const select = document.getElementById('risk-asset-select');
        const assetId = select.value && select.value !== '__manual__' ? select.value : null;
        const assetName = document.getElementById('risk-asset').value;
        const treatment = document.getElementById('risk-treatment').value;

        const body = {
            asset_id: assetId,
            asset: assetName,
            threat: document.getElementById('risk-threat').value,
            vulnerability: document.getElementById('risk-vuln').value,
            impact: +document.getElementById('risk-impact').value,
            probability: +document.getElementById('risk-prob').value,
            treatment: treatment,
            control_id: document.getElementById('risk-control').value || null,
            owner: document.getElementById('risk-owner').value,
            owner_parte_id: document.getElementById('risk-owner-parte').value || null,
            treatment_plan: document.getElementById('risk-plan').value,
            accepted_by: treatment === 'Accept' ? document.getElementById('risk-accepted-by').value : null,
            accepted_at: treatment === 'Accept' ? document.getElementById('risk-accepted-at').value : null
        };
        if (!body.asset || !body.threat) return;
        await api('POST', `/api/v1/projects/${projectId}/risks`, body);
        forceCloseModal(); render();
    };

    window.openEditRiskModal = async function(riskId) {
        const r = S.risks.find(x => x.id === riskId) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        let controls = [];
        try { 
            controls = await api('GET', `/api/v1/projects/${projectId}/controls`);
        } catch (e) { /* dado secundário: o formulário abre sem as opções de controle */ }
        if (!Array.isArray(controls)) controls = [];
        const parteOptions = await opcoesDePartes(projectId, r.owner_parte_id);

        const controlOptions = controls
            .filter(c => c.status !== 'Not Applicable')
            .map(c => `<option value="${c.id}" ${c.id === r.control_id ? 'selected' : ''}>${escapeHTML(c.standard)} - ${escapeHTML(c.title)}</option>`)
            .join('');

        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Risco</span></div>
            <div class="form-group"><label class="form-label">Ativo</label><input class="form-input" id="risk-e-asset" value="${escapeHTML(r.asset||'')}"></div>
            <div class="form-group"><label class="form-label">Ameaça</label><input class="form-input" id="risk-e-threat" value="${escapeHTML(r.threat||'')}"></div>
            <div class="form-group"><label class="form-label">Vulnerabilidade</label><input class="form-input" id="risk-e-vuln" value="${escapeHTML(r.vulnerability||'')}"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Impacto (1-5)</label><input class="form-input" id="risk-e-impact" type="number" min="1" max="5" value="${r.impact||3}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Probabilidade (1-5)</label><input class="form-input" id="risk-e-prob" type="number" min="1" max="5" value="${r.probability||3}"></div>
            </div>
            <div class="form-group"><label class="form-label">Tratamento</label>
                <select class="form-input" id="risk-e-treatment">${[{v:'Mitigate',l:'Mitigar'},{v:'Accept',l:'Aceitar'},{v:'Transfer',l:'Transferir'},{v:'Avoid',l:'Evitar'}].map(o => `<option value="${o.v}" ${o.v===r.treatment?'selected':''}>${o.l}</option>`).join('')}</select></div>
            <div class="form-group">
                <label class="form-label">Controle Annex A Vinculado (Opcional)</label>
                <select class="form-input" id="risk-e-control">
                    <option value="">-- Sem controle vinculado --</option>
                    ${controlOptions}
                </select>
            </div>
            <div class="form-group"><label class="form-label">Responsável (cadastro de partes)</label><select class="form-input" id="risk-e-owner-parte">${parteOptions}</select></div>
            <div class="form-group"><label class="form-label">Responsável (texto livre)</label><input class="form-input" id="risk-e-owner" value="${escapeHTML(r.owner||'')}"></div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem">
                <button class="btn" style="color:var(--danger)" data-action="__grcDeleteRisk" data-args='["${riskId}"]'>Excluir</button>
                <button class="btn btn-primary" data-action="updateRisk" data-args='["${riskId}"]'>Salvar</button>
            </div>
        `);
    };

    window.updateRisk = async function(id) {
        const body = { 
            asset: document.getElementById('risk-e-asset').value, 
            threat: document.getElementById('risk-e-threat').value, 
            vulnerability: document.getElementById('risk-e-vuln').value, 
            impact: +document.getElementById('risk-e-impact').value, 
            probability: +document.getElementById('risk-e-prob').value, 
            treatment: document.getElementById('risk-e-treatment').value, 
            control_id: document.getElementById('risk-e-control').value || null,
            owner: document.getElementById('risk-e-owner').value,
            owner_parte_id: document.getElementById('risk-e-owner-parte').value || null
        };
        await api('PUT', `/api/v1/risks/${id}`, body);
        forceCloseModal(); render();
    };

    window.openRiskDetailsModal = function(id) {
        const r = S.risks.find(x => x.id === id) || {};
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const levelColor = l => l === 'Critical' ? 'var(--danger)' : l === 'High' ? 'var(--warning)' : l === 'Medium' ? 'var(--warning)' : 'var(--accent)';
        const score = r.risk_score || (r.impact * r.probability);
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes do Risco</span>
                
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(r.asset || '')} — ${escapeHTML(r.threat || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Nível de Risco</div>
                        <span class="ctx-tag" style="background:color-mix(in oklab, ${levelColor(r.risk_level)} 12%, transparent); color:${levelColor(r.risk_level)}; font-weight:600">${escapeHTML(traduzStatus(r.risk_level) || 'Sem nível')}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Score Total</div>
                        <span style="font-size:1.1rem; font-weight:700; color:${levelColor(r.risk_level)}">${score}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Probabilidade</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${r.probability} / 5</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Impacto</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${r.impact} / 5</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Estratégia de Tratamento</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(traduzStatus(r.treatment || ''))}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Responsável</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.owner_parte_nome || r.owner || 'Sem dono')}</div>
                    </div>
                    ${r.control_standard ? `
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Controle de Segurança Vinculado</div>
                        <div style="display:flex; align-items:center; gap:8px">
                            <span class="badge badge-implemented" style="padding:4px 8px;font-size:0.75rem">${escapeHTML(r.control_standard)}</span>
                        </div>
                    </div>` : ''}
                    ${r.treatment === 'Accept' && r.accepted_by ? `
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Risco Aceito por</div>
                        <div style="font-size:0.85rem; font-weight:500; color:var(--text)">${escapeHTML(r.accepted_by)} em ${formatarData(r.accepted_at, { vazio: 'data desconhecida' })}</div>
                    </div>` : ''}
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" data-action="forceCloseModal">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" data-action="openEditRiskModal" data-args='["${id}"]'>Editar Risco</button>` : ''}
            </div>
        `);
    };

    async function renderVendors(c, h, a) {
        h.textContent = 'Gestão de Fornecedores (KYV)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = window.renderSemProjeto(); 
            return; 
        }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = canCrud ? `<button class="btn btn-primary" data-action="openNewVendorModal" data-args='["${proj.id}"]'>+ Novo Fornecedor</button>` : '';

        let vendors = [];
        try { 
            const res = await api('GET', `/api/v1/projects/${proj.id}/vendors`); 
            vendors = Array.isArray(res) ? res : (res && Array.isArray(res.vendors)) ? res.vendors : [];
        } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os fornecedores.', e); return; }
        S.vendors = vendors;

        const totalVendors = vendors.length;
        const avgScore = totalVendors ? Math.round(vendors.reduce((acc, v) => acc + (v.trust_score || 0), 0) / totalVendors) : 0;
        const dpaSignedCount = vendors.filter(v => v.dpa_signed).length;
        const highDilCount = vendors.filter(v => v.diligence_level === 'High' || v.diligence_level === 'Critical').length;

        const statsHtml = window.renderStatCards([
            { label: 'Total Fornecedores', value: totalVendors, color: 'var(--text)', subtext: 'Terceiros mapeados' },
            // Sem fornecedor não há postura a medir: "—", nunca "0/100" em vermelho.
            { label: 'Índice de confiança médio', value: totalVendors ? `${avgScore}/100` : '—', color: !totalVendors ? 'var(--text-dim)' : avgScore >= 80 ? 'var(--success)' : avgScore >= 50 ? 'var(--warning)' : 'var(--danger)', subtext: 'Postura global' },
            { label: 'DPAs Assinados', value: dpaSignedCount, color: 'var(--text)', subtext: 'Proteção de dados' },
            { label: 'Alta Diligência', value: highDilCount, color: highDilCount ? 'var(--warning)' : 'var(--text)', subtext: 'Acompanhamento rigoroso' }
        ]);

        const tableHtml = window.renderDataTable(
            ['Fornecedor', 'Categoria', 'Índice de confiança', 'DPA assinado', 'Certificações', 'Nível de diligência', 'Ações'],
            vendors.map(v => {
                const certs = [];
                if (v.has_iso27001) certs.push('ISO 27001');
                if (v.has_iso27701) certs.push('ISO 27701');
                if (v.has_soc2) certs.push('SOC 2');
                if (v.attached_certifications) certs.push(v.attached_certifications);
                const certStr = certs.length ? certs.join(', ') : '—';
                const scoreColor = (v.trust_score || 0) >= 80 ? 'var(--success)' : (v.trust_score || 0) >= 50 ? 'var(--warning)' : 'var(--danger)';

                return [
                    `<strong>${escapeHTML(v.name)}</strong>`,
                    escapeHTML(v.category || 'Geral'),
                    `<span style="font-weight:700;color:${scoreColor}">${v.trust_score || 0}/100</span>`,
                    v.dpa_signed ? window.renderStatusBadge('Sim', 'success') : window.renderStatusBadge('Não', 'danger'),
                    `<span style="font-size:0.75rem;color:var(--text-dim)">${escapeHTML(certStr)}</span>`,
                    window.renderStatusBadge(v.diligence_level || 'Low', v.diligence_level === 'High' ? 'danger' : 'info'),
                    `<button class="btn btn-ghost btn-sm" data-action="openVendorDetailsModal" data-args='["${v.id}"]'>Detalhes</button>`
                ];
            }),
            { emptyState: 'Nenhum fornecedor registrado neste projeto.',
              emptyHint: 'Fornecedor com acesso a informação do escopo precisa de requisitos de segurança acordados e acompanhados (ISO 27001, A.5.19 a A.5.22).',
              emptyAction: canCrud ? `<button class="btn btn-primary" data-action="openNewVendorModal" data-args='["${proj.id}"]'>Novo fornecedor</button>` : '' }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    window.openVendorDetailsModal = function(id) {
        const v = S.vendors.find(x => x.id === id) || {};
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const dilColor = d => d === 'Low' ? 'var(--accent)' : d === 'Medium' ? 'var(--info)' : 'var(--danger)';
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes do Fornecedor</span>
                
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.4rem; color:var(--accent)">
                    ${escapeHTML(v.name || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Categoria</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(v.category || 'Geral')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Nível de Diligencia</div>
                        <span class="ctx-tag" style="color:${dilColor(v.diligence_level)}; font-weight:600">${escapeHTML(traduzStatus(v.diligence_level || 'Low'))}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Índice de confiança (calculado)</div>
                        <span style="font-size:1.1rem; font-weight:700; color:${v.trust_score >= 80 ? 'var(--success)' : v.trust_score >= 50 ? 'var(--warning)' : 'var(--danger)'}">${v.trust_score || 0} / 100</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">DPA Assinado</div>
                        <span class="ctx-tag" style="background:${v.dpa_signed ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)'}; color:${v.dpa_signed ? 'var(--success)' : 'var(--text-dim)'}; font-weight:600">${v.dpa_signed ? 'Sim' : 'Não'}</span>
                    </div>
                    
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Postura de Segurança</div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px">
                            <span class="ctx-tag" style="color:${v.has_mfa ? 'var(--success)' : 'var(--text-dim)'}; border-color:${v.has_mfa ? 'var(--success)' : 'var(--border)'}">MFA Habilitado: ${v.has_mfa ? 'Sim' : 'Não'}</span>
                            <span class="ctx-tag" style="color:${v.has_encryption ? 'var(--success)' : 'var(--text-dim)'}; border-color:${v.has_encryption ? 'var(--success)' : 'var(--border)'}">Criptografia: ${v.has_encryption ? 'Sim' : 'Não'}</span>
                            <span class="ctx-tag" style="color:${v.has_backup ? 'var(--success)' : 'var(--text-dim)'}; border-color:${v.has_backup ? 'var(--success)' : 'var(--border)'}">Backup Ativo: ${v.has_backup ? 'Sim' : 'Não'}</span>
                            <span class="ctx-tag" style="color:${v.has_incident_plan ? 'var(--success)' : 'var(--text-dim)'}; border-color:${v.has_incident_plan ? 'var(--success)' : 'var(--border)'}">Resposta a Incidentes: ${v.has_incident_plan ? 'Sim' : 'Não'}</span>
                            <span class="ctx-tag" style="color:${v.has_pentest ? 'var(--success)' : 'var(--text-dim)'}; border-color:${v.has_pentest ? 'var(--success)' : 'var(--border)'}">Pentest Recente: ${v.has_pentest ? 'Sim' : 'Não'}</span>
                        </div>
                    </div>

                    ${v.trust_center_url ? `
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Portal de segurança (Trust Center)</div>
                        <a href="${escapeHTML(v.trust_center_url)}" target="_blank" style="color:var(--accent); font-size:0.85rem; text-decoration:none">${escapeHTML(v.trust_center_url)} &nearr;</a>
                    </div>` : ''}

                    ${v.dpa_url ? `
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">DPA Padrão / Termos de Privacidade</div>
                        <a href="${escapeHTML(v.dpa_url)}" target="_blank" style="color:var(--accent); font-size:0.85rem; text-decoration:none">${escapeHTML(v.dpa_url)} &nearr;</a>
                    </div>` : ''}

                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Certificações e Padrões Públicos</div>
                        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:4px">
                            ${v.has_iso27001 ? '<span class="ctx-tag ctx-tag-green">ISO 27001</span>' : ''}
                            ${v.has_iso27701 ? '<span class="ctx-tag ctx-tag-green">ISO 27701</span>' : ''}
                            ${v.has_soc2 ? '<span class="ctx-tag ctx-tag-green">SOC 2</span>' : ''}
                            ${v.attached_certifications ? v.attached_certifications.split(',').map(c => `<span class="ctx-tag ctx-tag-green">${escapeHTML(c.trim())}</span>`).join('') : ''}
                            ${(!v.has_iso27001 && !v.has_iso27701 && !v.has_soc2 && !v.attached_certifications) ? '<span style="font-size:0.8rem; color:var(--text-dim)">Nenhuma cadastrada</span>' : ''}
                        </div>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" data-action="forceCloseModal">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" data-action="openEditVendorModal" data-args='["${id}"]'>Editar Fornecedor</button>` : ''}
            </div>
        `);
    };

    window.previewVendorScore = function() {
        let score = 0;
        if (document.getElementById('vnd-iso27001')?.checked) score += 20;
        if (document.getElementById('vnd-iso27701')?.checked) score += 15;
        if (document.getElementById('vnd-soc2')?.checked) score += 15;
        if (document.getElementById('vnd-mfa')?.checked) score += 10;
        if (document.getElementById('vnd-enc')?.checked) score += 15;
        if (document.getElementById('vnd-bkp')?.checked) score += 10;
        if (document.getElementById('vnd-inc')?.checked) score += 10;
        if (document.getElementById('vnd-pen')?.checked) score += 10;
        if (document.getElementById('vnd-tc-url')?.value.trim().length > 0) score += 5;
        if (document.getElementById('vnd-dpa')?.value === '1' || document.getElementById('vnd-dpa-url')?.value.trim().length > 0) score += 10;
        
        const finalScore = Math.min(100, score);
        const scorePreviewEl = document.getElementById('vnd-score-preview');
        if (scorePreviewEl) {
            scorePreviewEl.textContent = finalScore + ' / 100';
            scorePreviewEl.style.color = finalScore >= 80 ? 'var(--success)' : finalScore >= 50 ? 'var(--warning)' : 'var(--danger)';
        }
    };

    window.openNewVendorModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Novo Fornecedor</span></div>
            <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="vnd-name" placeholder="Ex: AWS, Cloudflare"></div>
            <div class="form-group"><label class="form-label">Categoria</label><input class="form-input" id="vnd-cat" placeholder="Ex: Cloud, SaaS, Consultoria"></div>
            
            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Certificações Conhecidas</div>
            <div style="display:flex; gap:1rem; margin-bottom:1rem">
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-iso27001" data-action-change="previewVendorScore"> ISO 27001</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-iso27701" data-action-change="previewVendorScore"> ISO 27701</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-soc2" data-action-change="previewVendorScore"> SOC 2</label>
            </div>
            
            <div class="form-group">
                <label class="form-label">Outras Certificações (Separadas por vírgula)</label>
                <input class="form-input" id="vnd-attached-certs" placeholder="Ex: PCI-DSS, HIPAA, ISO 27017">
            </div>

            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Postura de Segurança (se houver questionário ou dados)</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:1rem">
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-mfa" data-action-change="previewVendorScore"> MFA Habilitado</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-enc" data-action-change="previewVendorScore"> Criptografia Ativa</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-bkp" data-action-change="previewVendorScore"> Backups Regulares</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-inc" data-action-change="previewVendorScore"> Plano de Incidentes</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem; grid-column:span 2"><input type="checkbox" id="vnd-pen" data-action-change="previewVendorScore"> Testes de Invasao (Pentest)</label>
            </div>

            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Canais públicos (portal de segurança e DPA padrão)</div>
            <div class="form-group">
                <label class="form-label">Portal de segurança (URL)</label>
                <input class="form-input" id="vnd-tc-url" placeholder="Ex: https://aws.amazon.com/compliance/" data-action-input="previewVendorScore">
            </div>
            <div style="display:flex; gap:0.5rem">
                <div class="form-group" style="flex:1">
                    <label class="form-label">DPA Assinado?</label>
                    <select class="form-input" id="vnd-dpa" data-action-change="previewVendorScore">
                        <option value="0">Não</option>
                        <option value="1">Sim</option>
                    </select>
                </div>
                <div class="form-group" style="flex:2">
                    <label class="form-label">DPA URL (Padrão do Site)</label>
                    <input class="form-input" id="vnd-dpa-url" placeholder="Ex: https://aws.amazon.com/dpa/" data-action-input="previewVendorScore">
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; margin-bottom:1rem; background:rgba(255,255,255,0.01); border:1px solid var(--border); padding:12px">
                <span style="font-size:0.8rem; font-weight:600">Índice de confiança estimado:</span>
                <span id="vnd-score-preview" style="font-size:1.1rem; font-weight:700; color:var(--danger)">0 / 100</span>
            </div>

            <button class="btn btn-primary" style="width:100%" data-action="createVendor" data-args='["${projectId}"]'>Registrar Fornecedor</button>
        `);
        window.previewVendorScore();
    };

    window.createVendor = async function(projectId) {
        const body = { 
            name: document.getElementById('vnd-name').value, 
            category: document.getElementById('vnd-cat').value, 
            dpa_signed: +document.getElementById('vnd-dpa').value, 
            has_iso27001: document.getElementById('vnd-iso27001').checked ? 1 : 0, 
            has_iso27701: document.getElementById('vnd-iso27701').checked ? 1 : 0, 
            has_soc2: document.getElementById('vnd-soc2').checked ? 1 : 0,
            has_mfa: document.getElementById('vnd-mfa').checked ? 1 : 0,
            has_encryption: document.getElementById('vnd-enc').checked ? 1 : 0,
            has_backup: document.getElementById('vnd-bkp').checked ? 1 : 0,
            has_incident_plan: document.getElementById('vnd-inc').checked ? 1 : 0,
            has_pentest: document.getElementById('vnd-pen').checked ? 1 : 0,
            trust_center_url: document.getElementById('vnd-tc-url').value,
            dpa_url: document.getElementById('vnd-dpa-url').value,
            attached_certifications: document.getElementById('vnd-attached-certs').value
        };
        if (!body.name) return;
        await api('POST', `/api/v1/projects/${projectId}/vendors`, body);
        forceCloseModal(); render();
    };

    window.openEditVendorModal = function(id) {
        const v = S.vendors.find(x => x.id === id) || {};
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Fornecedor</span></div>
            <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="vnd-e-name" value="${escapeHTML(v.name||'')}"></div>
            <div class="form-group"><label class="form-label">Categoria</label><input class="form-input" id="vnd-e-cat" value="${escapeHTML(v.category||'')}"></div>
            
            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Certificações Conhecidas</div>
            <div style="display:flex; gap:1rem; margin-bottom:1rem">
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-iso27001" ${v.has_iso27001?'checked':''} data-action-change="previewVendorScore"> ISO 27001</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-iso27701" ${v.has_iso27701?'checked':''} data-action-change="previewVendorScore"> ISO 27701</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-soc2" ${v.has_soc2?'checked':''} data-action-change="previewVendorScore"> SOC 2</label>
            </div>
            
            <div class="form-group">
                <label class="form-label">Outras Certificações (Separadas por vírgula)</label>
                <input class="form-input" id="vnd-attached-certs" value="${escapeHTML(v.attached_certifications||'')}" placeholder="Ex: PCI-DSS, HIPAA, ISO 27017">
            </div>

            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Postura de Segurança</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-bottom:1rem">
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-mfa" ${v.has_mfa?'checked':''} data-action-change="previewVendorScore"> MFA Habilitado</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-enc" ${v.has_encryption?'checked':''} data-action-change="previewVendorScore"> Criptografia Ativa</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-bkp" ${v.has_backup?'checked':''} data-action-change="previewVendorScore"> Backups Regulares</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem"><input type="checkbox" id="vnd-inc" ${v.has_incident_plan?'checked':''} data-action-change="previewVendorScore"> Plano de Incidentes</label>
                <label style="font-size:0.7rem; color:var(--muted); display:flex; align-items:center; gap:0.25rem; grid-column:span 2"><input type="checkbox" id="vnd-pen" ${v.has_pentest?'checked':''} data-action-change="previewVendorScore"> Testes de Invasao (Pentest)</label>
            </div>

            <div class="card-label" style="margin-top:1rem; margin-bottom:0.5rem">Canais Públicos</div>
            <div class="form-group">
                <label class="form-label">Portal de segurança (URL)</label>
                <input class="form-input" id="vnd-tc-url" value="${escapeHTML(v.trust_center_url||'')}" placeholder="Ex: https://aws.amazon.com/compliance/" data-action-input="previewVendorScore">
            </div>
            <div style="display:flex; gap:0.5rem">
                <div class="form-group" style="flex:1">
                    <label class="form-label">DPA Assinado?</label>
                    <select class="form-input" id="vnd-dpa" data-action-change="previewVendorScore">
                        <option value="0" ${!v.dpa_signed?'selected':''}>Não</option>
                        <option value="1" ${v.dpa_signed?'selected':''}>Sim</option>
                    </select>
                </div>
                <div class="form-group" style="flex:2">
                    <label class="form-label">DPA URL</label>
                    <input class="form-input" id="vnd-dpa-url" value="${escapeHTML(v.dpa_url||'')}" placeholder="Ex: https://aws.amazon.com/dpa/" data-action-input="previewVendorScore">
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; margin-bottom:1rem; background:rgba(255,255,255,0.01); border:1px solid var(--border); padding:12px">
                <span style="font-size:0.8rem; font-weight:600">Índice de confiança estimado:</span>
                <span id="vnd-score-preview" style="font-size:1.1rem; font-weight:700; color:var(--danger)">${v.trust_score||0} / 100</span>
            </div>

            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1.5rem">
                <button class="btn" style="color:var(--danger)" data-action="deleteVendor" data-args='["${id}"]'>Excluir</button>
                <button class="btn btn-primary" data-action="updateVendor" data-args='["${id}"]'>Salvar</button>
            </div>
        `);
        window.previewVendorScore = function() {
            let score = 0;
            if (document.getElementById('vnd-iso27001')?.checked) score += 20;
            if (document.getElementById('vnd-iso27701')?.checked) score += 15;
            if (document.getElementById('vnd-soc2')?.checked) score += 15;
            if (document.getElementById('vnd-mfa')?.checked) score += 10;
            if (document.getElementById('vnd-enc')?.checked) score += 15;
            if (document.getElementById('vnd-bkp')?.checked) score += 10;
            if (document.getElementById('vnd-inc')?.checked) score += 10;
            if (document.getElementById('vnd-pen')?.checked) score += 10;
            if (document.getElementById('vnd-tc-url')?.value.trim().length > 0) score += 5;
            if (document.getElementById('vnd-dpa')?.value === '1' || document.getElementById('vnd-dpa-url')?.value.trim().length > 0) score += 10;
            
            const finalScore = Math.min(100, score);
            const scorePreviewEl = document.getElementById('vnd-score-preview');
            if (scorePreviewEl) {
                scorePreviewEl.textContent = finalScore + ' / 100';
                scorePreviewEl.style.color = finalScore >= 80 ? 'var(--success)' : finalScore >= 50 ? 'var(--warning)' : 'var(--danger)';
            }
        };
        window.previewVendorScore();
    };

    window.updateVendor = async function(id) {
        const body = { 
            name: document.getElementById('vnd-e-name').value, 
            category: document.getElementById('vnd-e-cat').value, 
            dpa_signed: +document.getElementById('vnd-dpa').value, 
            has_iso27001: document.getElementById('vnd-iso27001').checked ? 1 : 0, 
            has_iso27701: document.getElementById('vnd-iso27701').checked ? 1 : 0, 
            has_soc2: document.getElementById('vnd-soc2').checked ? 1 : 0,
            has_mfa: document.getElementById('vnd-mfa').checked ? 1 : 0,
            has_encryption: document.getElementById('vnd-enc').checked ? 1 : 0,
            has_backup: document.getElementById('vnd-bkp').checked ? 1 : 0,
            has_incident_plan: document.getElementById('vnd-inc').checked ? 1 : 0,
            has_pentest: document.getElementById('vnd-pen').checked ? 1 : 0,
            trust_center_url: document.getElementById('vnd-tc-url').value,
            dpa_url: document.getElementById('vnd-dpa-url').value,
            attached_certifications: document.getElementById('vnd-attached-certs').value
        };
        await api('PUT', `/api/v1/vendors/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteVendor = async function(id) {
        if (await window.confirmar('O fornecedor e a avaliação dele saem deste projeto.', { titulo: 'Excluir fornecedor', perigo: true, rotulo: 'Excluir' })) { await api('DELETE', `/api/v1/vendors/${id}`); render(); }
    };

    async function renderTraining(c, h, a) {
        h.textContent = 'Treinamento & Conscientização';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = window.renderSemProjeto(); 
            return; 
        }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = (canCrud ? `<button class="btn btn-primary" data-action="openNewTrainingModal" data-args='["${proj.id}"]'>+ Novo Registro</button> ` : '') +
            `<button class="btn btn-ghost" data-action="openImportTrainingModal" data-args='["${proj.id}"]'>Importar JSON</button>`;

        let records = [];
        let summary = {};
        try { 
            const res = await api('GET', `/api/v1/projects/${proj.id}/training`); 
            records = Array.isArray(res) ? res : (res && Array.isArray(res.records)) ? res.records : [];
        } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os registros de treinamento.', e); return; }
        try { summary = await api('GET', `/api/v1/projects/${proj.id}/training/summary`); } catch (e) { /* secundário: a cobertura sai dos registros */ }
        S.training = records;

        const totalRecords = records.length;
        const completedRecords = records.filter(r => r.status === 'Completed').length;
        const coveragePct = summary.coverage_percent || (totalRecords ? Math.round((completedRecords / totalRecords) * 100) : 0);

        const statsHtml = window.renderStatCards([
            // Sem registro não há cobertura a medir: "—", nunca "0%" e "Non-Compliant" em vermelho.
            { label: 'Cobertura de Treinamento', value: totalRecords ? `${coveragePct}%` : '—', color: !totalRecords ? 'var(--text-dim)' : coveragePct >= 80 ? 'var(--success)' : 'var(--warning)', subtext: 'Meta ISO 27001' },
            { label: 'Pendentes / Expirados', value: totalRecords - completedRecords, color: totalRecords - completedRecords > 0 ? 'var(--warning)' : 'var(--text)', subtext: 'Requer atenção' },
            // O fato registrado, sem veredito de conformidade (é decisão do auditor).
            { label: 'Concluíram', value: totalRecords ? `${completedRecords} de ${totalRecords}` : '—', color: 'var(--text)', subtext: totalRecords ? 'registros de treinamento concluídos' : 'Nenhum registro de treinamento' }
        ]);

        const tableHtml = window.renderDataTable(
            ['Treinamento', 'Colaborador', 'Pontuação (%)', 'Data de conclusão', 'Evidência', 'Status', 'Ações'],
            records.map(r => {
                const hasEvidence = !!r.evidence_file;
                const statusType = r.status === 'Completed' ? 'success' : r.status === 'Expired' ? 'danger' : 'warning';

                return [
                    `<strong>${escapeHTML(r.training_name)}</strong>`,
                    escapeHTML(r.employee_name),
                    r.score ? `<strong>${r.score}%</strong>` : '—',
                    formatarData(r.completion_date),
                    hasEvidence ? '<span style="color:var(--success)"> Anexada</span>' : '<span style="color:var(--text-dim)"> Ausente</span>',
                    window.renderStatusBadge(r.status || 'Pending', statusType),
                    `<button class="btn btn-ghost btn-sm" data-action="openTrainingDetailsModal" data-args='["${r.id}"]'>Detalhes</button>`
                ];
            }),
            { emptyState: 'Nenhum registro de treinamento neste projeto.',
              emptyHint: 'O registro de quem foi treinado e quando é a evidência de conscientização (ISO 27001, 7.2 e 7.3; A.6.3).',
              emptyAction: canCrud ? `<button class="btn btn-primary" data-action="openNewTrainingModal" data-args='["${proj.id}"]'>Novo registro</button>` : '' }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    window.openTrainingDetailsModal = function(id) {
        const r = S.training.find(x => x.id === id) || {};
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const statusColor = s => s === 'Completed' ? 'var(--accent)' : s === 'Expired' ? 'var(--danger)' : 'var(--warning)';
        
        let evidenceHtml = '<span style="color:var(--text-dim); font-size:0.85rem">Nenhuma evidência anexada</span>';
        if (r.evidence_file) {
            if (r.evidence_file.includes('|')) {
                const [evId, evName] = r.evidence_file.split('|');
                evidenceHtml = `
                    <div style="display:flex; align-items:center; gap:8px">
                        <span style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(evName)}</span>
                        <button class="btn btn-sm" data-action="downloadEvidenceFile" data-args='["${evId}"]'>Baixar</button>
                    </div>`;
            } else if (r.evidence_file.startsWith('http')) {
                evidenceHtml = `<a href="${escapeHTML(r.evidence_file)}" target="_blank" class="btn" style="padding:4px 8px; font-size:0.7rem; display:inline-block; border-color:var(--accent); color:var(--accent)">Abrir Link</a>`;
            } else {
                evidenceHtml = `<span style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.evidence_file)}</span>`;
            }
        }

        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes do Treinamento</span>
                
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(r.training_name || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Colaborador</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.employee_name || '')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status</div>
                        <span class="ctx-tag" style="color:${statusColor(r.status)}; font-weight:600">${escapeHTML(traduzStatus(r.status || 'Pending'))}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Pontuação</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${r.score ? r.score + '%' : 'N/A'}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Data de Conclusão</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${formatarData(r.completion_date)}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Evidência de Participação</div>
                        <div style="margin-top:6px">${evidenceHtml}</div>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" data-action="forceCloseModal">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" data-action="openEditTrainingModal" data-args='["${id}"]'>Editar Registro</button>` : ''}
            </div>
        `);
    };

    window.uploadTrainingEvidence = async function(input, projectId) {
        const statusDiv = document.getElementById('tr-upload-status');
        const evidenceInput = document.getElementById('tr-evidence') || document.getElementById('tr-e-evidence');
        if (!input.files || !input.files.length) return;
        
        statusDiv.style.display = 'block';
        statusDiv.style.color = 'var(--text-dim)';
        statusDiv.textContent = 'Enviando arquivo para R2...';
        
        const file = input.files[0];
        const formData = new FormData();
        formData.append('file', file);
        // Certificado de treinamento é evidência de conscientização (A.6.3). Leniente no servidor:
        // projeto sem esse controle recebe o arquivo sem vínculo.
        formData.append('control_ref', 'A.6.3');
        
        try {
            const headers = {};
            if (S.token) headers['Authorization'] = `Bearer ${S.token}`;
            const r = await fetch(API_BASE + `/api/v1/projects/${projectId}/evidence/upload`, { 
                method: 'POST', 
                headers, 
                body: formData 
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Erro no upload');
            
            evidenceInput.value = `${data.id}|${file.name}`;
            statusDiv.style.color = 'var(--success)';
            statusDiv.textContent = `Upload concluído: ${file.name}`;
        } catch(e) {
            statusDiv.style.color = 'var(--danger)';
            statusDiv.textContent = `Erro no upload: ${e.message}`;
        }
    };

    window.openNewTrainingModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Novo Registro de Treinamento</span></div>
            <div class="form-group"><label class="form-label">Nome do Colaborador</label><input class="form-input" id="tr-name" placeholder="Ex: Ana Silva"></div>
            <div class="form-group"><label class="form-label">Treinamento</label><input class="form-input" id="tr-training" placeholder="Ex: Segurança da Informação Básico"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Status</label>
                    <select class="form-input" id="tr-status"><option value="Pending">Pendente</option><option value="Completed">Concluído</option><option value="Expired">Vencido</option></select></div>
                <div class="form-group" style="flex:1"><label class="form-label">Score (%)</label><input class="form-input" id="tr-score" type="number" min="0" max="100" placeholder="85"></div>
            </div>
            <div class="form-group"><label class="form-label">Data de Conclusao</label><input class="form-input" id="tr-date" type="date"></div>
            <div class="form-group">
                <label class="form-label">Evidência / Certificado (Upload ou Link Manual)</label>
                <div style="display:flex; gap:0.5rem; align-items:center">
                    <input class="form-input" id="tr-evidence" style="flex:1" placeholder="Ex: Link do certificado ou upload de arquivo">
                    <label class="btn" style="padding:0.6rem 1rem; margin:0; cursor:pointer; font-size:0.8rem; display:flex; align-items:center; justify-content:center; white-space:nowrap">
                        Upload
                        <input type="file" style="display:none" data-action-change="uploadTrainingEvidence" data-args='["${projectId}"]' data-arg-el>
                    </label>
                </div>
                <div id="tr-upload-status" style="font-size:0.7rem; color:var(--text-dim); margin-top:4px; display:none"></div>
            </div>
            <button class="btn btn-primary" style="width:100%" data-action="createTraining" data-args='["${projectId}"]'>Registrar</button>
        `);
    };

    window.createTraining = async function(projectId) {
        const body = { 
            employee_name: document.getElementById('tr-name').value, 
            training_name: document.getElementById('tr-training').value, 
            status: document.getElementById('tr-status').value, 
            score: +document.getElementById('tr-score').value || null, 
            completion_date: document.getElementById('tr-date').value || null,
            evidence_file: document.getElementById('tr-evidence').value || null
        };
        if (!body.employee_name || !body.training_name) return;
        await api('POST', `/api/v1/projects/${projectId}/training`, body);
        forceCloseModal(); render();
    };

    window.openEditTrainingModal = function(id) {
        const r = S.training.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Treinamento</span></div>
            <div class="form-group"><label class="form-label">Colaborador</label><input class="form-input" id="tr-e-name" value="${escapeHTML(r.employee_name||'')}"></div>
            <div class="form-group"><label class="form-label">Treinamento</label><input class="form-input" id="tr-e-training" value="${escapeHTML(r.training_name||'')}"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Status</label>
                    <select class="form-input" id="tr-e-status">${['Pending','Completed','Expired'].map(o => `<option ${o===r.status?'selected':''}>${o}</option>`).join('')}</select></div>
                <div class="form-group" style="flex:1"><label class="form-label">Score (%)</label><input class="form-input" id="tr-e-score" type="number" value="${r.score||''}"></div>
            </div>
            <div class="form-group"><label class="form-label">Data de Conclusão</label><input class="form-input" id="tr-e-date" type="date" value="${r.completion_date||''}"></div>
            <div class="form-group">
                <label class="form-label">Evidência / Certificado (Upload ou Link Manual)</label>
                <div style="display:flex; gap:0.5rem; align-items:center">
                    <input class="form-input" id="tr-e-evidence" style="flex:1" placeholder="Ex: Link do certificado ou upload de arquivo" value="${escapeHTML(r.evidence_file||'')}">
                    <label class="btn" style="padding:0.6rem 1rem; margin:0; cursor:pointer; font-size:0.8rem; display:flex; align-items:center; justify-content:center; white-space:nowrap">
                        Upload
                        <input type="file" style="display:none" data-action-change="uploadTrainingEvidence" data-args='["${projectId}"]' data-arg-el>
                    </label>
                </div>
                <div id="tr-upload-status" style="font-size:0.7rem; color:var(--text-dim); margin-top:4px; display:none"></div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem">
                <button class="btn" style="color:var(--danger)" data-action="deleteTraining" data-args='["${id}"]'>Excluir</button>
                <button class="btn btn-primary" data-action="updateTraining" data-args='["${id}"]'>Salvar</button>
            </div>
        `);
    };

    window.updateTraining = async function(id) {
        const body = { 
            employee_name: document.getElementById('tr-e-name').value, 
            training_name: document.getElementById('tr-e-training').value, 
            status: document.getElementById('tr-e-status').value, 
            score: +document.getElementById('tr-e-score').value || null,
            completion_date: document.getElementById('tr-e-date').value || null,
            evidence_file: document.getElementById('tr-e-evidence').value || null
        };
        await api('PUT', `/api/v1/training/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteTraining = async function(id) {
        if (await window.confirmar('O registro de treinamento sai deste projeto.', { titulo: 'Excluir registro de treinamento', perigo: true, rotulo: 'Excluir' })) { await api('DELETE', `/api/v1/training/${id}`); render(); }
    };

    window.openImportTrainingModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Importar Treinamentos via JSON</span></div>
            <p style="font-size:0.75rem;color:var(--muted);margin-bottom:1rem">
                Cole o payload JSON de cobertura de treinamento gerado pelo seu sistema externo para realizar a importação em lote de dados.
            </p>
            <div class="form-group">
                <label class="form-label">Payload JSON</label>
                <textarea class="form-input" id="training-json-payload" style="height:150px;font-family:monospace;font-size:0.7rem;background:rgba(0,0,0,0.2)" placeholder='{
  "records": [
    {
      "employee_name": "Maria Silva",
      "training_name": "ISO 27001 Security Awareness",
      "completion_date": "2026-07-15",
      "score": 95,
      "status": "Completed"
    }
  ]
}'></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Endpoint de Integração do Webhook</label>
                <input class="form-input" style="font-family:monospace;font-size:0.75rem;background:rgba(255,255,255,0.02)" readonly value="${window.location.origin}/api/v1/projects/${projectId}/training/import-external">
            </div>
            <button class="btn btn-primary" id="btn-import-training" style="width:100%" data-action="doImportTraining" data-args='["${projectId}"]'>Confirmar Importação</button>
        `);
    };

    window.doImportTraining = async function(projectId) {
        const payloadText = document.getElementById('training-json-payload').value.trim();
        const btn = document.getElementById('btn-import-training');
        if (!payloadText) {
            showToast('Cole o JSON de entrada para importar.', 'error');
            return;
        }

        let parsed;
        try {
            parsed = JSON.parse(payloadText);
        } catch(e) {
            showToast('JSON inválido: ' + e.message, 'error');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Importando...';

        try {
            const res = await api('POST', `/api/v1/projects/${projectId}/training/import-external`, parsed);
            if (res.ok) {
                showToast(`${res.count} registros de treinamento importados com sucesso!`);
                forceCloseModal();
                render();
            } else {
                throw new Error(res.error || 'Erro desconhecido');
            }
        } catch(e) {
            showToast('Falha na importação: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Confirmar Importação';
        }
    };

    async function renderCAPA(c, h, a) {
        h.textContent = 'Ações Corretivas (CAPA)';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = window.renderSemProjeto(); 
            return; 
        }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = canCrud ? `<button class="btn btn-primary" data-action="openNewCAPAModal" data-args='["${proj.id}"]'>+ Nova Ação</button>` : '';

        let items = [];
        try { 
            const res = await api('GET', `/api/v1/projects/${proj.id}/capa`); 
            items = Array.isArray(res) ? res : (res && Array.isArray(res.actions)) ? res.actions : (res && Array.isArray(res.capa)) ? res.capa : [];
        } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar as ações corretivas.', e); return; }
        S.capa = items;

        const totalCAPA = items.length;
        const openCAPA = items.filter(i => i.status === 'Open' || i.status === 'In Progress').length;
        const closedCAPA = items.filter(i => i.status === 'Closed').length;
        const criticalCAPA = items.filter(i => i.severity === 'Critical' || i.severity === 'High').length;

        const statsHtml = window.renderStatCards([
            { label: 'Total Ações CAPA', value: totalCAPA, color: 'var(--text)', subtext: 'Planos registrados' },
            { label: 'Abertas / Em Andamento', value: openCAPA, color: openCAPA > 0 ? 'var(--warning)' : 'var(--text)', subtext: 'Requer acompanhamento' },
            { label: 'Concluídas / Fechadas', value: closedCAPA, color: 'var(--text)', subtext: 'Resoluções efetivas' },
            { label: 'Críticas / Alta Severidade', value: criticalCAPA, color: criticalCAPA > 0 ? 'var(--danger)' : 'var(--text)', subtext: 'Prioridade máxima' }
        ]);

        // Vindo do painel, a lista abre filtrada pela situação do item, com o chip para limpar.
        const { itens: acoesDaLista, chip: chipFiltro, filtrado } = filtrarDoPainel('capa', null, items);
        const tableHtml = window.renderDataTable(
            ['Título da Ação', 'Responsável', 'Prazo', 'Severidade', 'Status', 'Ações'],
            acoesDaLista.map(ca => {
                const sevBadgeType = ca.severity === 'Critical' ? 'danger' : ca.severity === 'High' ? 'warning' : 'info';
                const statusBadgeType = ca.status === 'Closed' ? 'success' : ca.status === 'In Progress' ? 'warning' : 'info';

                return [
                    `<strong>${escapeHTML(ca.title)}</strong>`,
                    escapeHTML(ca.assigned_to_parte_nome || ca.assigned_to || 'Sem responsável'),
                    formatarData(ca.due_date),
                    window.renderStatusBadge(ca.severity || 'Medium', sevBadgeType),
                    window.renderStatusBadge(ca.status || 'Open', statusBadgeType),
                    `<button class="btn btn-ghost btn-sm" data-action="openCAPADetailsModal" data-args='["${ca.id}"]'>Detalhes</button>`
                ];
            }),
            { emptyState: 'Nenhuma ação corretiva registrada neste projeto.',
              emptyHint: 'Cada não conformidade pede ação para eliminar a causa e o registro do resultado (ISO 27001, 10.2).',
              emptyAction: canCrud ? `<button class="btn btn-primary" data-action="openNewCAPAModal" data-args='["${proj.id}"]'>Nova ação</button>` : '',
              ...(filtrado ? { emptyState: 'Nenhuma ação nesta situação.', emptyHint: 'Limpe o filtro para ver todas.', emptyAction: '' } : {}) }
        );

        c.innerHTML = `
            ${statsHtml}
            ${chipFiltro}
            ${tableHtml}
        `;
    }

    window.openCAPADetailsModal = async function(id) {
        const ca = S.capa.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const sevColor = s => s === 'Critical' ? 'var(--danger)' : s === 'High' ? 'var(--warning)' : s === 'Medium' ? 'var(--warning)' : 'var(--accent)';
        const statusColor = s => s === 'Closed' ? 'var(--accent)' : s === 'In Progress' ? 'var(--warning)' : 'var(--muted)';
        
        let risks = [];
        let audits = [];
        // Dado secundário: sem ele o modal abre sem o risco e a auditoria de origem.
        try { risks = await api('GET', `/api/v1/projects/${projectId}/risks`); } catch (e) { /* idem */ }
        try { audits = await api('GET', `/api/v1/projects/${projectId}/audits`); } catch (e) { /* idem */ }

        const audObj = audits.find(a => a.id === ca.audit_id);
        const riskObj = risks.find(r => r.id === ca.risk_id);
        const ctrlObj = S.controls.find(c => c.id === ca.control_id);

        let associationHtml = '';
        if (audObj) associationHtml += `<div style="margin-top:0.25rem"><span class="ctx-tag" style="color:var(--accent); border-color:var(--accent-glow)">Auditoria: ${escapeHTML(audObj.title)}</span></div>`;
        if (riskObj) associationHtml += `<div style="margin-top:0.25rem"><span class="ctx-tag" style="color:var(--danger); border-color:var(--danger)">Risco: ${escapeHTML(riskObj.title || riskObj.description)}</span></div>`;
        if (ctrlObj) associationHtml += `<div style="margin-top:0.25rem"><span class="ctx-tag" style="color:var(--success); border-color:var(--success)">Controle: ${ctrlObj.id} - ${escapeHTML(ctrlObj.title)}</span></div>`;
        if (!associationHtml) associationHtml = '<span style="color:var(--text-dim); font-size:0.8rem">Nenhuma associacao</span>';

        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes da Ação Corretiva</span>
                
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(ca.title || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:16px">
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Descrição</div>
                        <div style="font-size:0.85rem; color:var(--text)">${escapeHTML(ca.description || 'Sem descricao')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Severidade</div>
                        <span class="ctx-tag" style="color:${sevColor(ca.severity)}; font-weight:600">${escapeHTML(traduzStatus(ca.severity || 'Low'))}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status</div>
                        <span class="ctx-tag" style="color:${statusColor(ca.status)}; font-weight:600">${escapeHTML(traduzStatus(ca.status || 'Open'))}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Responsável</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(ca.assigned_to_parte_nome || ca.assigned_to || 'Sem responsavel')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Prazo de Conclusao</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${formatarData(ca.due_date)}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Causa Raiz (Root Cause)</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(ca.root_cause || 'Não analisada')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Plano de ação</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(ca.action_plan || 'Não definido')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Resolução / Evidência de Fechamento</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(ca.resolution || 'Nenhuma resolução cadastrada')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Associacoes e Vinculos</div>
                        <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px">${associationHtml}</div>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" data-action="forceCloseModal">Fechar</button>
                ${canCrud ? `<button class="btn btn-primary" data-action="openEditCAPAModal" data-args='["${id}"]'>Editar Ação</button>` : ''}
            </div>
        `);
    };

    window.openNewCAPAModal = async function(projectId) {
        let risks = [];
        let audits = [];
        // Dado secundário: sem ele o modal abre sem o risco e a auditoria de origem.
        try { risks = await api('GET', `/api/v1/projects/${projectId}/risks`); } catch (e) { /* idem */ }
        try { audits = await api('GET', `/api/v1/projects/${projectId}/audits`); } catch (e) { /* idem */ }
        const projectControls = S.controls.filter(ctrl => ctrl.project_id === projectId);
        const parteOptions = await opcoesDePartes(projectId, null);

        openModal(`
            <div class="modal-header"><span class="modal-title">Nova Ação Corretiva</span></div>
            <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="capa-title" placeholder="Ex: Implementar MFA em todos os sistemas"></div>
            <div class="form-group"><label class="form-label">Descrição</label><textarea class="form-input" id="capa-desc" placeholder="Detalhe a acao corretiva..."></textarea></div>
            <div class="form-group"><label class="form-label">Causa Raiz (Root Cause)</label><textarea class="form-input" id="capa-root" placeholder="Causa identificada do problema..."></textarea></div>
            <div class="form-group"><label class="form-label">Plano de ação</label><textarea class="form-input" id="capa-plan" placeholder="Passos a serem tomados..."></textarea></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Severidade</label>
                    <select class="form-input" id="capa-sev"><option value="Low">Baixo</option><option value="Medium" selected>Médio</option><option value="High">Alto</option><option value="Critical">Crítico</option></select></div>
                <div class="form-group" style="flex:1"><label class="form-label">Prazo</label><input class="form-input" id="capa-due" type="date"></div>
            </div>
            <div class="form-group"><label class="form-label">Responsável (cadastro de partes)</label><select class="form-input" id="capa-assigned-parte">${parteOptions}</select></div>
            <div class="form-group"><label class="form-label">Responsável (texto livre)</label><input class="form-input" id="capa-assigned" placeholder="Ex: CISO"></div>
            
            <div class="card-label" style="margin-top:1rem;margin-bottom:0.5rem">Vinculos e Associacao</div>
            <div class="form-group">
                <label class="form-label">Auditoria Relacionada</label>
                <select class="form-input" id="capa-audit">
                    <option value="">Nenhuma</option>
                    ${audits.map(a => `<option value="${a.id}">${escapeHTML(a.title)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Risco Relacionado</label>
                <select class="form-input" id="capa-risk">
                    <option value="">Nenhuma</option>
                    ${risks.map(r => `<option value="${r.id}">${escapeHTML(r.title || r.description)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Controle Relacionado (SoA)</label>
                <select class="form-input" id="capa-control">
                    <option value="">Nenhum</option>
                    ${projectControls.map(c => `<option value="${c.id}">${c.id} - ${escapeHTML(c.title)}</option>`).join('')}
                </select>
            </div>
            
            <button class="btn btn-primary" style="width:100%;margin-top:1rem" data-action="createCAPA" data-args='["${projectId}"]'>Registrar</button>
        `);
    };

    window.createCAPA = async function(projectId) {
        const body = { 
            title: document.getElementById('capa-title').value, 
            description: document.getElementById('capa-desc').value, 
            root_cause: document.getElementById('capa-root').value,
            action_plan: document.getElementById('capa-plan').value,
            severity: document.getElementById('capa-sev').value, 
            due_date: document.getElementById('capa-due').value || null, 
            assigned_to: document.getElementById('capa-assigned').value,
            assigned_to_parte_id: document.getElementById('capa-assigned-parte').value || null,
            audit_id: document.getElementById('capa-audit').value || null,
            risk_id: document.getElementById('capa-risk').value || null,
            control_id: document.getElementById('capa-control').value || null
        };
        if (!body.title) return;
        await api('POST', `/api/v1/projects/${projectId}/capa`, body);
        forceCloseModal(); render();
    };

    // Os dois últimos argumentos vêm do clique num aviso (globals.js): o projeto e o registro já
    // buscados, porque S.capa e o projeto ativo ainda não refletem a tela que acabou de abrir.
    window.openEditCAPAModal = async function(id, projetoDoAviso, registro) {
        const ca = registro || S.capa.find(x => x.id === id) || {};
        const projectId = projetoDoAviso || (S.activeProject ? S.activeProject.id : '');
        let risks = [];
        let audits = [];
        // Dado secundário: sem ele o modal abre sem o risco e a auditoria de origem.
        try { risks = await api('GET', `/api/v1/projects/${projectId}/risks`); } catch (e) { /* idem */ }
        try { audits = await api('GET', `/api/v1/projects/${projectId}/audits`); } catch (e) { /* idem */ }
        const projectControls = S.controls.filter(ctrl => ctrl.project_id === projectId);
        const parteOptions = await opcoesDePartes(projectId, ca.assigned_to_parte_id);

        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Ação Corretiva</span></div>
            <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="capa-e-title" value="${escapeHTML(ca.title||'')}"></div>
            <div class="form-group"><label class="form-label">Descrição</label><textarea class="form-input" id="capa-e-desc">${escapeHTML(ca.description||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Causa Raiz (Root Cause)</label><textarea class="form-input" id="capa-e-root">${escapeHTML(ca.root_cause||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Plano de ação</label><textarea class="form-input" id="capa-e-plan">${escapeHTML(ca.action_plan||'')}</textarea></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Severidade</label>
                    <select class="form-input" id="capa-e-sev">
                        ${[{v:'Low',l:'Baixo'},{v:'Medium',l:'Médio'},{v:'High',l:'Alto'},{v:'Critical',l:'Crítico'}].map(o => `<option value="${o.v}" ${o.v===ca.severity?'selected':''}>${o.l}</option>`).join('')}
                    </select></div>
                <div class="form-group" style="flex:1"><label class="form-label">Status</label>
                    <select class="form-input" id="capa-e-status">
                        ${[{v:'Open',l:'Aberto'},{v:'In Progress',l:'Em Andamento'},{v:'Closed',l:'Fechado'}].map(o => `<option value="${o.v}" ${o.v===ca.status?'selected':''}>${o.l}</option>`).join('')}
                    </select></div>
            </div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Prazo</label><input class="form-input" id="capa-e-due" type="date" value="${ca.due_date||''}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Responsável (cadastro de partes)</label><select class="form-input" id="capa-e-assigned-parte">${parteOptions}</select></div>
            </div>
            <div class="form-group"><label class="form-label">Responsável (texto livre)</label><input class="form-input" id="capa-e-assigned" value="${escapeHTML(ca.assigned_to||'')}"></div>
            <div class="form-group"><label class="form-label">Resolução (se fechada)</label><textarea class="form-input" id="capa-e-resolution">${escapeHTML(ca.resolution||'')}</textarea></div>
            
            <div class="card-label" style="margin-top:1rem;margin-bottom:0.5rem">Vinculos e Associacao</div>
            <div class="form-group">
                <label class="form-label">Auditoria Relacionada</label>
                <select class="form-input" id="capa-e-audit">
                    <option value="">Nenhuma</option>
                    ${audits.map(a => `<option value="${a.id}" ${a.id===ca.audit_id?'selected':''}>${escapeHTML(a.title)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Risco Relacionado</label>
                <select class="form-input" id="capa-e-risk">
                    <option value="">Nenhuma</option>
                    ${risks.map(r => `<option value="${r.id}" ${r.id===ca.risk_id?'selected':''}>${escapeHTML(r.title || r.description)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Controle Relacionado (SoA)</label>
                <select class="form-input" id="capa-e-control">
                    <option value="">Nenhum</option>
                    ${projectControls.map(c => `<option value="${c.id}" ${c.id===ca.control_id?'selected':''}>${c.id} - ${escapeHTML(c.title)}</option>`).join('')}
                </select>
            </div>

            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1.5rem">
                <button class="btn" style="color:var(--danger)" data-action="deleteCAPA" data-args='["${id}"]'>Excluir</button>
                <button class="btn btn-primary" data-action="updateCAPA" data-args='["${id}"]'>Salvar</button>
            </div>
        `);
    };

    window.updateCAPA = async function(id) {
        const body = { 
            title: document.getElementById('capa-e-title').value, 
            description: document.getElementById('capa-e-desc').value, 
            root_cause: document.getElementById('capa-e-root').value,
            action_plan: document.getElementById('capa-e-plan').value,
            severity: document.getElementById('capa-e-sev').value, 
            status: document.getElementById('capa-e-status').value, 
            assigned_to: document.getElementById('capa-e-assigned').value,
            assigned_to_parte_id: document.getElementById('capa-e-assigned-parte').value || null,
            due_date: document.getElementById('capa-e-due').value || null,
            resolution: document.getElementById('capa-e-resolution').value || null,
            audit_id: document.getElementById('capa-e-audit').value || null,
            risk_id: document.getElementById('capa-e-risk').value || null,
            control_id: document.getElementById('capa-e-control').value || null
        };
        await api('PUT', `/api/v1/capa/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteCAPA = async function(id) { 
        if (await window.confirmar('A ação corretiva sai deste projeto, e a não conformidade de origem fica sem tratamento registrado.', { titulo: 'Excluir ação corretiva', perigo: true, rotulo: 'Excluir' })) { 
            await api('DELETE', `/api/v1/capa/${id}`); 
            forceCloseModal(); 
            render(); 
        } 
    };

    async function renderAudits(c, h, a) {
        h.textContent = 'Auditorias';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = window.renderSemProjeto(); 
            return; 
        }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = canCrud ? `<button class="btn btn-primary" data-action="openNewAuditModal" data-args='["${proj.id}"]'>+ Nova Auditoria</button>` : '';

        let audits = [];
        try { 
            const res = await api('GET', `/api/v1/projects/${proj.id}/audits`); 
            audits = Array.isArray(res) ? res : (res && Array.isArray(res.audits)) ? res.audits : [];
        } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar as auditorias.', e); return; }
        S.audits = audits;

        const totalAudits = audits.length;
        const plannedAudits = audits.filter(au => au.status === 'Planned' || au.status === 'In Progress').length;
        const completedAudits = audits.filter(au => au.status === 'Completed').length;
        const totalFindings = audits.reduce((acc, au) => acc + (au.findings_count || 0), 0);

        const statsHtml = window.renderStatCards([
            { label: 'Total de Auditorias', value: totalAudits, color: 'var(--text)', subtext: 'Ciclo de auditoria' },
            { label: 'Agendadas / Em Execução', value: plannedAudits, color: 'var(--text)', subtext: 'Próximas fases' },
            { label: 'Concluídas', value: completedAudits, color: 'var(--text)', subtext: 'Relatórios emitidos' },
            { label: 'Total de Achados', value: totalFindings, color: totalFindings > 0 ? 'var(--danger)' : 'var(--text)', subtext: 'Achados registrados nas auditorias' }
        ]);

        const tableHtml = window.renderDataTable(
            ['Título da Auditoria', 'Tipo', 'Auditor Responsável', 'Data Agendada', 'Achados', 'Status', 'Ações'],
            audits.map(au => {
                const statusBadgeType = au.status === 'Completed' ? 'success' : au.status === 'In Progress' ? 'warning' : 'info';
                const executeBtn = au.status !== 'Completed' 
                    ? `<button class="btn btn-sm" style="margin-right:0.25rem" data-action="navigate" data-args='["audit-execution",{"activeAuditId":"${au.id}"}]' data-stop>Executar</button>`
                    : '';

                return [
                    `<strong>${escapeHTML(au.title)}</strong>`,
                    escapeHTML(rotuloDe('auditoria', au.audit_type || 'Internal')),
                    escapeHTML(au.auditor_name || 'TBD'),
                    formatarData(au.scheduled_date),
                    au.findings_count ? `<span style="color:var(--danger);font-weight:600">${au.findings_count} achados</span>` : '—',
                    window.renderStatusBadge(rotuloDe('auditoria', au.status || 'Planned'), statusBadgeType),
                    `${executeBtn}<button class="btn btn-ghost btn-sm" data-action="openAuditDetailsModal" data-args='["${au.id}"]'>Detalhes</button>`
                ];
            }),
            { emptyState: 'Nenhuma auditoria agendada neste projeto.',
              emptyHint: 'A auditoria interna em intervalos planejados é requisito da certificação (ISO 27001, 9.2). Agende a primeira para fechar o ciclo antes do estágio 1.',
              emptyAction: canCrud ? `<button class="btn btn-primary" data-action="openNewAuditModal" data-args='["${proj.id}"]'>Nova auditoria</button>` : '' }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
            <div id="acesso-auditor"></div>
        `;
        await renderAcessoAuditor(c.querySelector('#acesso-auditor'), proj.id, S.user?.role);
    }

    window.openAuditDetailsModal = function(id) {
        const au = S.audits.find(x => x.id === id) || {};
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const statusColor = s => s === 'Completed' ? 'var(--accent)' : s === 'In Progress' ? 'var(--warning)' : 'var(--muted)';
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes da Auditoria</span>
                
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:700; font-size:1.3rem; color:var(--accent)">
                    ${escapeHTML(au.title || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Tipo de Auditoria</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(rotuloDe('auditoria', au.audit_type || ''))}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status</div>
                        <span class="ctx-tag" style="color:${statusColor(au.status)}; font-weight:600">${escapeHTML(rotuloDe('auditoria', au.status || 'Planned'))}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Auditor / Organismo</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(au.auditor_name || 'Não definido')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Data Agendada</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${formatarData(au.scheduled_date, { vazio: '' })}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Escopo</div>
                        <div style="font-size:0.85rem; font-weight:500; color:var(--text)">${escapeHTML(au.scope || 'Geral')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Não Conformidades / Achados</div>
                        <div style="font-size:0.85rem; font-weight:600; color:${au.findings_count ? 'var(--danger)' : 'var(--text)'}">${au.findings_count || 0} achados</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Data de Conclusao</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${au.completed_at ? formatarData(au.completed_at) : 'Não concluída'}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Notas / Observacoes</div>
                        <div style="font-size:0.85rem; color:var(--muted); white-space:pre-wrap; margin-top:4px">${escapeHTML(au.notes || 'Nenhuma observação registrada.')}</div>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px">
                <button class="btn" data-action="forceCloseModal">Fechar</button>
                ${au.status !== 'Completed' ? `<button class="btn btn-primary" data-action="__grcCloseExecAudit" data-args='["${id}"]'>Executar Auditoria</button>` : ''}
                ${canCrud ? `<button class="btn" style="border-color:var(--accent); color:var(--accent)" data-action="openEditAuditModal" data-args='["${id}"]'>Editar Auditoria</button>` : ''}
            </div>
        `);
    };

    window.openNewAuditModal = function(projectId) {
        openModal(`
            <div class="modal-header"><span class="modal-title">Nova Auditoria</span></div>
            <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="aud-title" placeholder="Ex: Auditoria Interna Anual"></div>
            <div class="form-group"><label class="form-label">Tipo</label>
                <select class="form-input" id="aud-type"><option value="Internal">Interna</option><option value="External">Externa</option><option value="Surveillance">Supervisão</option><option value="Certification">Certificação</option></select></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Data</label><input class="form-input" id="aud-date" type="date"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Auditor</label><input class="form-input" id="aud-auditor" placeholder="Ex: BSI, SGS"></div>
            </div>
            <div class="form-group"><label class="form-label">Escopo</label><input class="form-input" id="aud-scope" placeholder="Ex: Controles A.5-A.8"></div>
            <div class="form-group"><label class="form-label">Notas / Observacoes</label><textarea class="form-input" id="aud-notes" placeholder="Detalhes adicionais..."></textarea></div>
            <button class="btn btn-primary" style="width:100%" data-action="createAudit" data-args='["${projectId}"]'>Agendar</button>
        `);
    };

    window.createAudit = async function(projectId) {
        const body = { 
            title: document.getElementById('aud-title').value, 
            audit_type: document.getElementById('aud-type').value, 
            scheduled_date: document.getElementById('aud-date').value, 
            auditor_name: document.getElementById('aud-auditor').value, 
            scope: document.getElementById('aud-scope').value,
            notes: document.getElementById('aud-notes').value
        };
        if (!body.title || !body.scheduled_date) return;
        await api('POST', `/api/v1/projects/${projectId}/audits`, body);
        forceCloseModal(); render();
    };

    window.openEditAuditModal = function(id) {
        const au = S.audits.find(x => x.id === id) || {};
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar Auditoria</span></div>
            <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="aud-e-title" value="${escapeHTML(au.title||'')}"></div>
            <div class="form-group"><label class="form-label">Tipo</label>
                <select class="form-input" id="aud-e-type">
                    ${['Internal','External','Surveillance','Certification'].map(o => `<option ${o===au.audit_type?'selected':''}>${o}</option>`).join('')}
                </select></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Data</label><input class="form-input" id="aud-e-date" type="date" value="${au.scheduled_date||''}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Auditor</label><input class="form-input" id="aud-e-auditor" value="${escapeHTML(au.auditor_name||'')}"></div>
            </div>
            <div class="form-group"><label class="form-label">Escopo</label><input class="form-input" id="aud-e-scope" value="${escapeHTML(au.scope||'')}"></div>
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Status</label>
                    <select class="form-input" id="aud-e-status">${['Planned','Scheduled','In Progress','Completed'].map(o => `<option ${o===au.status?'selected':''}>${o}</option>`).join('')}</select></div>
                <div class="form-group" style="flex:1"><label class="form-label">Findings</label><input class="form-input" id="aud-e-findings" type="number" value="${au.findings_count||0}"></div>
            </div>
            <div class="form-group"><label class="form-label">Notas / Observacoes</label><textarea class="form-input" id="aud-e-notes">${escapeHTML(au.notes||'')}</textarea></div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem">
                <button class="btn" style="color:var(--danger)" data-action="deleteAudit" data-args='["${id}"]'>Excluir</button>
                <button class="btn btn-primary" data-action="updateAudit" data-args='["${id}"]'>Salvar</button>
            </div>
        `);
    };

    window.updateAudit = async function(id) {
        const body = { 
            title: document.getElementById('aud-e-title').value, 
            audit_type: document.getElementById('aud-e-type').value, 
            scheduled_date: document.getElementById('aud-e-date').value, 
            auditor_name: document.getElementById('aud-e-auditor').value, 
            scope: document.getElementById('aud-e-scope').value, 
            status: document.getElementById('aud-e-status').value, 
            findings_count: +document.getElementById('aud-e-findings').value,
            notes: document.getElementById('aud-e-notes').value
        };
        await api('PUT', `/api/v1/audits/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteAudit = async function(id) { 
        if (await window.confirmar('A auditoria sai do calendário deste projeto.', { titulo: 'Excluir auditoria', perigo: true, rotulo: 'Excluir' })) { 
            await api('DELETE', `/api/v1/audits/${id}`); 
            forceCloseModal(); 
            render(); 
        } 
    };

    async function renderAuditExecution(c, h, a) {
        h.textContent = 'Executar Auditoria Interna';
        a.innerHTML = `<button data-action="navigate" data-args='["audits"]' class="btn" style="border-color:var(--border)">Voltar ao Calendário</button>`;
        if (!S.activeAuditId) {
            c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Selecione uma auditoria no calendário.</div>';
            return;
        }
        
        c.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando painel de auditoria...</div>';
        try {
            const [controls, findings, audit] = await Promise.all([
                api('GET', `/api/v1/projects/${S.activeProject.id}/controls`),
                api('GET', `/api/v1/audits/${S.activeAuditId}/findings`),
                api('GET', `/api/v1/projects/${S.activeProject.id}/audits`)
            ]);
            
            const currentAudit = (audit || []).find(au => au.id === S.activeAuditId) || {};
            // 9.2: a consultoria implementa, não audita — o servidor recusa o achado (auth.ts).
            const podeRegistrarAchado = !['consultor', 'consultant', 'consultoria_admin'].includes(S.user?.role);
            
            let html = `
                <div class="stat-card" style="margin-bottom:2rem;border:1px solid var(--border);background:rgba(229,235,255,0.02)">
                    <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.15rem;color:var(--accent);margin-bottom:6px">${escapeHTML(currentAudit.title || 'Auditoria')}</div>
                    <div style="font-size:0.85rem;color:var(--muted)">
                        <strong>Auditor:</strong> ${escapeHTML(currentAudit.auditor_name || 'TBD')} | 
                        <strong>Escopo:</strong> ${escapeHTML(currentAudit.scope || 'Todo o ISMS')} | 
                        <strong>Data:</strong> ${formatarData(currentAudit.scheduled_date)}
                    </div>
                </div>
                
                <div style="display:grid;grid-template-columns:3fr 2fr;gap:24px">
                    <div>
                        <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:1rem">Controles Aplicáveis no Escopo</div>
                        <div class="data-table" style="max-height:600px;overflow-y:auto">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Controle</th>
                                        <th>Status Atual</th>
                                        <th style="width:180px;text-align:center">Auditar</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
            
            (controls || []).filter(ctrl => ctrl.status !== 'Not Applicable').forEach(ctrl => {
                const ctrlFindings = findings.filter(f => f.control_id === ctrl.id);
                html += `
                    <tr>
                        <td style="font-weight:600;color:var(--accent)">${escapeHTML(ctrl.standard)}</td>
                        <td style="font-size:0.85rem;font-weight:500">${escapeHTML(ctrl.title)}</td>
                        <td>
                            <span class="badge badge-${(ctrl.status || 'missing').toLowerCase().replace(/\s/g,'-')}">
                                ${escapeHTML(traduzStatus(ctrl.status || 'Missing'))}
                            </span>
                        </td>
                        <td style="text-align:center">
                            ${podeRegistrarAchado ? `<button data-action="openAddFindingModal" data-args="${escapeHTML(JSON.stringify([ctrl.id, ctrl.standard]))}" class="btn" style="padding:4px 10px;font-size:0.75rem;border-color:var(--accent);color:var(--accent)">
                                ${ctrlFindings.length > 0 ? 'Registrar Achado (' + ctrlFindings.length + ')' : '+ Novo Achado'}
                            </button>` : `<span style="font-size:0.75rem;color:var(--muted)">${ctrlFindings.length}</span>`}
                        </td>
                    </tr>
                `;
            });
            
            html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div>
                        <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:1rem">Achados Registrados (${findings.length})</div>
            `;
            
            if (findings.length === 0) {
                html += window.renderEmptyState({ titulo: 'Nenhum achado registrado nesta auditoria', texto: 'Registre cada não conformidade ou observação com a evidência que a sustenta (ISO 27001, 9.2).' });
            } else {
                html += `<div style="display:flex;flex-direction:column;gap:12px;max-height:600px;overflow-y:auto">`;
                findings.forEach(f => {
                    const badgeClass = f.finding_type === 'major_nc' ? 'badge-critical' : f.finding_type === 'minor_nc' ? 'badge-warning' : f.finding_type === 'observation' ? 'badge-info' : 'badge-default';
                    const badgeLabel = f.finding_type === 'major_nc' ? 'NC Maior' : f.finding_type === 'minor_nc' ? 'NC Menor' : f.finding_type === 'observation' ? 'Observação' : 'Oportunidade';
                    html += `
                        <div class="stat-card" style="border:1px solid var(--border);padding:12px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                                <span class="badge ${badgeClass}">${badgeLabel}</span>
                                <span style="font-weight:600;color:var(--accent)">${escapeHTML(f.control_id || 'Geral')}</span>
                            </div>
                            <div style="font-size:0.85rem;margin-bottom:8px">${escapeHTML(f.description)}</div>
                            ${f.auditor_notes ? `<div style="font-size:0.75rem;color:var(--muted);background:rgba(255,255,255,0.02);padding:6px 10px;margin-bottom:8px"><strong>Notas:</strong> ${escapeHTML(f.auditor_notes)}</div>` : ''}
                            <div style="display:flex;justify-content:space-between;align-items:center">
                                <span style="font-size:0.7rem;color:var(--muted)">Registrado em: ${formatarData(f.created_at)}</span>
                                ${podeRegistrarAchado ? `<button data-action="deleteFinding" data-args='["${f.id}"]' class="btn" style="padding:2px 6px;font-size:0.7rem;color:red;border-color:rgba(255,0,0,0.15)">Deletar</button>` : ''}
                            </div>
                        </div>
                    `;
                });
                html += `</div>`;
            }
            
            html += `
                    </div>
                </div>
            `;
            c.innerHTML = html;
        } catch(e) {
            // `a` fica: "Voltar ao Calendário" continua valendo.
            window.falhaDeCarga(c, null, 'Não foi possível carregar a execução da auditoria.', e);
        }
    }

    window.openAddFindingModal = function(controlId, controlStandard) {
        const html = `
            <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:1.25rem;margin-bottom:1.5rem;color:var(--accent)">
                Registrar Achado — Controle ${controlStandard}
            </div>
            <form id="finding-form" data-action-submit="submitFinding" data-arg-event data-args='["${controlId}"]'>
                <div class="form-group" style="margin-bottom:12px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Tipo de Achado</label>
                    <select name="finding_type" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)">
                        <option value="observation">Observação</option>
                        <option value="minor_nc">Não Conformidade Menor (NC Menor)</option>
                        <option value="major_nc">Não Conformidade Maior (NC Maior)</option>
                        <option value="opportunity">Oportunidade de Melhoria</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom:12px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Evidência Analisada (Opcional)</label>
                    <input type="text" name="evidence_reviewed" placeholder="Ex: Política de Acesso ver. 1.2, logs de MFA" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text)" />
                </div>
                <div class="form-group" style="margin-bottom:12px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Descrição da Constatação / Achado</label>
                    <textarea name="description" required style="width:100%;height:80px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit" placeholder="Descreva de forma clara e objetiva o achado da auditoria..."></textarea>
                </div>
                <div class="form-group" style="margin-bottom:20px">
                    <label style="display:block;margin-bottom:4px;font-size:0.85rem">Notas de Auditoria</label>
                    <textarea name="auditor_notes" style="width:100%;height:60px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;color:var(--text);font-family:inherit" placeholder="Ex: Recomendações iniciais, referências normativas..."></textarea>
                </div>
                <div style="text-align:right">
                    <button type="button" data-action="closeModal" class="btn-secondary" style="margin-right:8px">Cancelar</button>
                    <button type="submit" class="btn-primary">Registrar Achado</button>
                </div>
            </form>
        `;
        openModal(html);
    };

    window.submitFinding = async function(e, controlId) {
        e.preventDefault();
        const form = document.getElementById('finding-form');
        const formData = new FormData(form);
        const body = {
            project_id: S.activeProject.id,
            control_id: controlId,
            finding_type: formData.get('finding_type'),
            description: formData.get('description'),
            evidence_reviewed: formData.get('evidence_reviewed'),
            auditor_notes: formData.get('auditor_notes')
        };
        
        try {
            await api('POST', `/api/v1/audits/${S.activeAuditId}/findings`, body);
            showToast('Achado de auditoria registrado');
            if (body.finding_type === 'minor_nc' || body.finding_type === 'major_nc') {
                showToast('Ação corretiva (CAPA) aberta automaticamente para a NC', 'warning');
            }
            closeModal();
            render();
        } catch(err) {
            showToast('Erro ao salvar achado de auditoria', 'error');
        }
    };

    window.deleteFinding = async function(id) {
        if (!(await window.confirmar('O achado sai desta auditoria.', { titulo: 'Excluir achado', perigo: true, rotulo: 'Excluir' }))) return;
        try {
            await api('DELETE', `/api/v1/audit-findings/${id}`);
            showToast('Achado removido');
            render();
        } catch(e) {
            showToast('Erro ao deletar achado', 'error');
        }
    };

window.renderRisks = renderRisks;
window.renderVendors = renderVendors;
window.renderTraining = renderTraining;
window.renderCAPA = renderCAPA;
window.renderAudits = renderAudits;
window.renderAuditExecution = renderAuditExecution;
