import { S } from '../state.js';
import { api, API_BASE, cabecalhosAuth, baixarArquivo } from '../api.js';
import { showToast, openModal, forceCloseModal, escapeHTML, formatarData, tituloDaTela } from '../ui.js';
import { render, navigate } from '../router.js';
import { opcoesDePartes } from '../partes-opcoes.js';
import { temProduto, projetoDoId, produtoAtual } from '../produto.js';
import { podeEntrevistar, confirmaEdicaoAprovada } from '../atividade/estado.js';
import { listarItens, criarItem } from '../atividade/catalogo-inline.js';
import './atividade.js';
import { BASES_ART7, BASES_ART11, ART11, BASES_LEGADO, normaliza, rotuloBase, camposDaBase, idsDoCatalogo } from '../bases-legais.js';

    // Base legal: as listas e a coerência texto/catálogo vivem em bases-legais.js (as ligações e a entrevista usam as mesmas).
    let catalogoBases = new Set();
    function opcoesBase(atual) {
        // Valor antigo fica selecionado com o valor GRAVADO: salvar sem mexer não reescreve legal_basis (que reenviaria os pedidos
        // de aprovação do documento). Só a escolha de outra hipótese grava o texto novo.
        const antigo = BASES_LEGADO[normaliza(atual)] && atual !== rotuloBase(atual) ? atual : null;
        const sel = antigo ? null : rotuloBase(atual);
        const conhecidos = [...BASES_ART7, ...BASES_ART11.map(ART11)];
        const opt = (valor, rotulo) => `<option value="${escapeHTML(valor)}" ${valor === sel ? 'selected' : ''}>${escapeHTML(rotulo)}</option>`;
        // Texto livre (importado de planilha, por exemplo) não some ao editar: fica como opção, selecionado.
        const livre = antigo ? `<option value="${escapeHTML(antigo)}" selected>${escapeHTML(rotuloBase(antigo))} (valor antigo)</option>`
            : sel && !conhecidos.includes(sel) ? opt(sel, sel) : '';
        return `<option value="">Selecione a hipótese</option>${livre}
            <optgroup label="Art. 7 (dados pessoais)">${BASES_ART7.map((b) => opt(b, b)).join('')}</optgroup>
            <optgroup label="Art. 11 (dados sensíveis)">${BASES_ART11.map((b) => opt(ART11(b), b)).join('')}</optgroup>`;
    }
    const STATUS_ROPA = [['Active', 'Ativo'], ['Inactive', 'Inativo'], ['Draft', 'Rascunho'], ['Under Review', 'Em revisão']];
    const opcoesStatus = (lista, atual) => lista.map(([v, r]) => `<option value="${v}" ${atual === v ? 'selected' : ''}>${r}</option>`).join('');
    // Os dois campos de maior consequência legal ficam logo abaixo da base legal, em tamanho normal.
    const riscosDoTratamento = (p, r = {}) => `
            <fieldset style="border:1px solid var(--border); padding:0.75rem 1rem; margin:0 0 1.25rem">
                <legend class="form-label" style="padding:0 0.25rem">Riscos do tratamento</legend>
                <label style="display:flex; align-items:center; gap:0.5rem; color:var(--text); margin-bottom:0.5rem"><input type="checkbox" id="${p}-intl" data-action-change="alternarSalvaguarda" data-args='["${p}"]' ${r.international_transfers ? 'checked' : ''}> Transferência internacional (arts. 33-36)</label>
                <div class="form-group" style="margin:0 0 0.75rem 1.5rem" ${r.international_transfers ? '' : 'hidden'}><label class="form-label" for="${p}-safeguards">Salvaguarda de transferência</label><input class="form-input" id="${p}-safeguards" value="${escapeHTML(r.transfer_safeguards || '')}" placeholder="Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)"></div>
                <label style="display:flex; align-items:center; gap:0.5rem; color:var(--text)"><input type="checkbox" id="${p}-dpia" ${r.dpia_required ? 'checked' : ''}> Exige RIPD</label>
                <label style="display:flex; align-items:center; gap:0.5rem; color:var(--text); margin-top:0.5rem"><input type="checkbox" id="${p}-sensiveis" ${r.dados_sensiveis ? 'checked' : ''}> Dados sensíveis (art. 11)</label>
                <label style="display:flex; align-items:center; gap:0.5rem; color:var(--text); margin-top:0.5rem"><input type="checkbox" id="${p}-criancas" ${r.criancas_adolescentes ? 'checked' : ''}> Crianças e adolescentes (art. 14)</label>
            </fieldset>`;
    window.alternarSalvaguarda = function(p) {
        const grupo = document.getElementById(`${p}-safeguards`)?.closest('.form-group');
        if (grupo) grupo.hidden = !document.getElementById(`${p}-intl`)?.checked;
    };

    async function renderROPA(c, h, a) {
        // No n.privacy o título é o rótulo do menu (ROTULOS_PRIVACY).
        h.textContent = tituloDaTela('nav-ropa', 'Tratamentos (RoPA)');
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = window.renderSemProjeto(); 
            return; 
        }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const comPrivacy = temProduto(proj, 'privacy');
        const btnImportar = canCrud && comPrivacy ? `<button class="btn" data-action="openImportarRopaModal" data-args='["${proj.id}"]'>Importar planilha</button>` : '';
        // A entrevista é o caminho principal (equipe e administrador do cliente); o formulário inteiro fica como edição avançada da equipe.
        const entrevista = podeEntrevistar();
        // Uma ação principal: "Nova atividade" abre a escolha entre a entrevista guiada e o preenchimento direto nas abas.
        const btnNova = () => (entrevista || canCrud ? `<button class="btn btn-primary" data-action="abrirNovaAtividade" data-args='["${proj.id}"]'>Nova atividade</button>` : '');
        const btnNovo = (rotulo) => (canCrud ? `<button class="btn" data-action="openNewROPAModal" data-args='["${proj.id}"]'>${rotulo}</button>` : '');

        let records = [];
        try { records = await api('GET', `/api/v1/projects/${proj.id}/ropa`); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar o inventário de tratamentos.', e); return; }
        if (!Array.isArray(records)) records = [];
        S.ropa = records;
        // Uma ação principal (a entrevista); importar, exportar (o PDF é do projeto inteiro, não da linha) e a edição avançada
        // ficam no "Mais ações": seis botões no cabeçalho quebravam o título em 1440px.
        const args = [proj.id];
        a.innerHTML = [window.renderMaisAcoes([
            canCrud && comPrivacy && { rotulo: 'Importar planilha', action: 'openImportarRopaModal', args },
            records.length && { rotulo: 'Exportar RoPA (PDF)', action: 'openROPAReport', args },
            records.length && { rotulo: 'Exportar CSV', action: 'exportarCsvAtividades', args },
            records.length && comPrivacy && { rotulo: 'Exportar LIAs (CSV)', action: 'exportarCsvLia', args },
            canCrud && { rotulo: 'Edição avançada', action: 'openNewROPAModal', args },
        ]), btnNova()].filter(Boolean).join(' ');

        // A conta de "legítimo interesse sem LIA" é do servidor (visão do encarregado): a lista do RoPA não traz a LIA.
        let liaPendente = null;
        if (comPrivacy) { try { const v = await api('GET', `/api/v1/projects/${proj.id}/encarregado`); if (v && v.tratamentos) liaPendente = v.tratamentos.lia_pendente || 0; } catch (e) { /* sem o cartão */ } }

        // Atividade cancelada (situação derivada no servidor) continua na lista, esmaecida, mas fica fora dos cartões de contagem.
        const cancelada = (r) => !!(r.situacao && r.situacao.codigo === 'cancelada');
        const contaveis = records.filter((r) => !cancelada(r));
        const totalRecords = contaveis.length;
        const dpiaReqCount = contaveis.filter(r => r.dpia_required).length;
        const intlTransCount = contaveis.filter(r => r.international_transfers).length;
        const semSalvaguarda = contaveis.filter(r => r.international_transfers && !String(r.transfer_safeguards || '').trim()).length;
        const activeRecords = contaveis.filter(r => r.status === 'Active' || !r.status).length;

        // Número em var(--text); cor só quando há alerta (transferência sem salvaguarda, LIA pendente).
        const statsHtml = window.renderStatCards([
            { label: 'Tratamentos', value: totalRecords, color: 'var(--text)', subtext: 'Atividades mapeadas' },
            { label: 'Atividades ativas', value: activeRecords, color: 'var(--text)', subtext: 'Em operação' },
            { label: 'Exige RIPD', value: dpiaReqCount, color: 'var(--text)', subtext: 'Relatório de impacto' },
            { label: 'Com transferência internacional', value: intlTransCount, color: semSalvaguarda ? 'var(--warning)' : 'var(--text)', subtext: semSalvaguarda ? `${semSalvaguarda} sem salvaguarda` : 'Arts. 33-36' },
            ...(liaPendente === null ? [] : [{ label: 'Legítimo interesse sem LIA', value: liaPendente, color: liaPendente ? 'var(--warning)' : 'var(--text)', subtext: 'Faça na etapa 3 da atividade' }]),
        ]);

        const tableHtml = window.renderDataTable(
            ['Finalidade do tratamento', 'Base legal', 'Titulares', 'Retenção', 'Exige RIPD', 'Situação', 'Ações'],
            records.map(r => {
                const statusType = r.status === 'Active' || !r.status ? 'success' : 'info';
                return [
                    `<strong${cancelada(r) ? ' class="at-esmaecida"' : ''}>${escapeHTML(r.nome || r.processing_purpose)}</strong>${Array.isArray(r.nao_informado) && r.nao_informado.length ? ` ${window.renderStatusBadge('Importado: revisar', 'warning')}` : ''}`,
                    escapeHTML(rotuloBase(r.legal_basis) || 'N/A'),
                    escapeHTML(r.data_subjects || 'N/A'),
                    escapeHTML(r.retention_period || 'N/A'),
                    r.dpia_required ? window.renderStatusBadge('Sim', 'warning') : window.renderStatusBadge('Não', 'neutral'),
                    // Situação derivada do servidor (Rascunho, Em Revisão, Aprovada, Cancelada), escrita; sem ela, o status antigo.
                    r.situacao && r.situacao.rotulo
                        ? window.renderStatusBadge(r.situacao.rotulo, { aprovada: 'success', cancelada: 'neutral', em_revisao: 'warning', rascunho: 'info' }[r.situacao.codigo] || 'info')
                        : window.renderStatusBadge(r.status || 'Active', statusType),
                    // n.privacy: a atividade tem página própria, com as etapas (atividade.js). Um botão, um nome.
                    comPrivacy
                        ? `<button class="btn btn-ghost btn-sm" data-action="abrirAtividade" data-args='${escapeHTML(JSON.stringify([proj.id, r.id]))}' aria-label="Abrir a atividade: ${escapeHTML(r.nome || r.processing_purpose)}">Abrir</button>`
                        : `<button class="btn btn-ghost btn-sm" data-action="openROPADetailsModal" data-args='["${r.id}"]'>Detalhes</button>
                     ${entrevista ? `<button class="btn btn-ghost btn-sm" data-action="abrirRopaEntrevista" data-args='["${proj.id}","${r.id}"]'>Continuar entrevista</button>` : ''}`
                ];
            }),
            {
                emptyState: 'O inventário de tratamentos (art. 37) está vazio.',
                emptyHint: 'Registre a primeira atividade ou importe a planilha que o cliente já tem.',
                emptyAction: btnNova() + btnNovo('Edição avançada') + btnImportar,
            }
        );

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    // Assinatura direta do RoPA (n.iso): o modelo antigo, ao lado do pedido de aprovação.
    const assinaturasDiretas = (r, projectId) => `
                <h4 style="font-family:'Montserrat',sans-serif; font-size:0.7rem; color:var(--text-dim); margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.05em">Assinaturas do RoPA</h4>
                <div style="display:flex; flex-direction:column; gap:0.75rem">
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; font-size:0.75rem">
                        <div>
                            <strong>Líder SGSI:</strong> 
                            ${r.ciso_approved_by ? `<span style="color:var(--success)">Aprovado por ${escapeHTML(r.ciso_approved_by)} em ${formatarData(r.ciso_approved_at)}</span>` : `<span style="color:var(--text-dim)">Aguardando assinatura</span>`}
                        </div>
                        ${!r.ciso_approved_by ? `<button class="btn" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="approveROPA" data-args='["${projectId}","${r.id}","ciso"]'>Assinar</button>` : podeRevogar() ? `<button class="btn-secondary" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="revogarROPA" data-args='["${projectId}","${r.id}","ciso"]'>Revogar</button>` : ''}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; font-size:0.75rem">
                        <div>
                            <strong>Direção Executiva:</strong> 
                            ${r.ceo_approved_by ? `<span style="color:var(--success)">Aprovado por ${escapeHTML(r.ceo_approved_by)} em ${formatarData(r.ceo_approved_at)}</span>` : `<span style="color:var(--text-dim)">Aguardando assinatura</span>`}
                        </div>
                        ${!r.ceo_approved_by ? `<button class="btn" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="approveROPA" data-args='["${projectId}","${r.id}","ceo"]'>Assinar</button>` : podeRevogar() ? `<button class="btn-secondary" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="revogarROPA" data-args='["${projectId}","${r.id}","ceo"]'>Revogar</button>` : ''}
                    </div>
                </div>`;

    window.openROPADetailsModal = function(id) {
        const r = S.ropa.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        // n.privacy (onda 2): uma aprovação só, a do pedido, na etapa 5 da página da atividade. A assinatura direta fica só no n.iso
        // (o POST .../approve continua no servidor, por compatibilidade).
        const comPrivacy = temProduto(projetoDoId(projectId), 'privacy');
        const aprovacao = comPrivacy
            ? `<p class="at-nota" id="ropa-aprovacao-pedido">A aprovação desta atividade é por pedido, com o conteúdo congelado: veja e peça na etapa 5 da atividade.</p>
               <button class="btn" data-action="abrirAtividade" data-args='${escapeHTML(JSON.stringify([projectId, id]))}'>Abrir a atividade</button>`
            : assinaturasDiretas(r, projectId);
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes da atividade (RoPA)</span>
                
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:600; font-size:1.3rem; color:var(--text)">
                    ${escapeHTML(r.processing_purpose || '')}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:16px">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Base Legal</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(rotuloBase(r.legal_basis) || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Responsável / Owner</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.owner_parte_nome || r.owner || 'Sem responsável')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Categorias de Dados</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.data_categories || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Titulares</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.data_subjects || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Período de Retenção</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.retention_period || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Destinatários / Compartilhamento</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(r.recipients || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status</div>
                        <span class="ctx-tag" style="font-weight:600">${escapeHTML(window.traduzStatus(r.status || 'Active'))}</span>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Exige RIPD</div>
                        <span class="ctx-tag" style="background:${r.dpia_required ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.05)'}; color:${r.dpia_required ? 'var(--warning)' : 'var(--text-dim)'}; font-weight:600">${r.dpia_required ? 'Sim' : 'Não'}</span>
                    </div>
                    ${r.international_transfers ? `
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Transferência Internacional</div>
                        <div style="font-size:0.85rem; font-weight:500; color:var(--text)">
                            Salvaguardas: ${escapeHTML(r.transfer_safeguards || 'Sem salvaguardas especificadas')}
                        </div>
                    </div>` : ''}
                </div>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem; margin-top:16px">${aprovacao}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px">
                <button class="btn btn-secondary" data-action="openROPAReport" data-args='["${projectId}"]'>Exportar RoPA (PDF)</button>
                <div>
                    <button class="btn" data-action="forceCloseModal">Fechar</button>
                    ${podeEntrevistar() ? `<button class="btn btn-primary" data-action="abrirRopaEntrevista" data-args='${escapeHTML(JSON.stringify([projectId, id]))}'>Continuar entrevista</button>` : ''}
                </div>
            </div>
        `);
    };

    // "Nova atividade" (PR3): nome, área e responsável, e a escolha de como preencher. A equipe da ness. que migra cliente
    // começa no direto; o cliente, na entrevista guiada. O nome vira a finalidade provisória (editável na aba Escopo).
    const EQUIPE_NESS = ['platform_admin', 'consultant', 'consultor', 'consultoria_admin'];
    // Continuar entrevista e a escolha guiada da Nova atividade: a atividade abre no modo guiado (`?modo=guiado`, lido pela casca).
    window.abrirRopaEntrevista = function (projectId, recordId) {
        if (!recordId) return window.abrirNovaAtividade(projectId);
        S.atividade = { projectId, ropaId: recordId, modo: 'guiado', avancou: true };
        navigate('ropa-atividade');
    };
    window.abrirNovaAtividade = async function(projectId) {
        const [parteOptions, areas] = await Promise.all([opcoesDePartes(projectId, null), listarItens(projectId, 'area').catch(() => [])]);
        const equipe = EQUIPE_NESS.includes(S.user && S.user.role);
        const opcoesAreas = ['<option value="">Sem área</option>', ...areas.map((a) => `<option value="${escapeHTML(a.id)}">${escapeHTML(a.nome)}</option>`)].join('');
        openModal(`
            <div class="modal-header"><span class="modal-title">Nova atividade</span></div>
            <div class="form-group"><label class="form-label" for="ra-nome">Nome da atividade (obrigatório)</label><input class="form-input" id="ra-nome" maxlength="200" placeholder="Ex: Folha de pagamento"></div>
            <div class="form-group"><label class="form-label" for="ra-area">Área</label><select class="form-input" id="ra-area">${opcoesAreas}</select>
                <div class="form-group"><label class="form-label" for="ra-nova-area">Nova área</label><input class="form-input" id="ra-nova-area" maxlength="200"></div>
                <button type="button" class="btn btn-ghost btn-sm" data-action="criarAreaNaAtividade" data-args='["${projectId}"]'>+ Criar área</button></div>
            <div class="form-group"><label class="form-label" for="ra-responsavel">Responsável</label><select class="form-input" id="ra-responsavel">${parteOptions}</select></div>
            <fieldset class="form-group"><legend class="form-label">Como quer preencher?</legend>
                <label><input type="radio" name="ra-modo" value="guiada" ${equipe ? '' : 'checked'}> Entrevista guiada</label>
                <label><input type="radio" name="ra-modo" value="direta" ${equipe ? 'checked' : ''}> Direto nas abas</label>
            </fieldset>
            <p class="form-label" id="ra-erro" role="alert"></p>
            <button class="btn btn-primary" data-action="criarNovaAtividade" data-args='["${projectId}"]'>Criar</button>
        `);
    };

    window.criarAreaNaAtividade = async function(projectId) {
        const campo = document.getElementById('ra-nova-area');
        const nome = (campo && campo.value || '').trim();
        if (!nome) return;
        try {
            const r = await criarItem(projectId, 'area', { nome }, await listarItens(projectId, 'area'));
            if (r && r.item) {
                const sel = document.getElementById('ra-area');
                sel.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(r.item.id)}">${escapeHTML(r.item.nome || nome)}</option>`);
                sel.value = r.item.id;
                campo.value = '';
            } else document.getElementById('ra-erro').textContent = 'Já existe uma área com esse nome. Escolha-a na lista.';
        } catch (e) { document.getElementById('ra-erro').textContent = 'Não foi possível criar a área.'; }
    };

    window.criarNovaAtividade = async function(projectId) {
        const nomeCampo = document.getElementById('ra-nome');
        const nome = (nomeCampo.value || '').trim();
        const erro = document.getElementById('ra-erro');
        if (!nome) { erro.textContent = 'Dê um nome à atividade.'; nomeCampo.focus(); return; }
        const area = document.getElementById('ra-area').value;
        const responsavel = document.getElementById('ra-responsavel').value;
        const guiada = (document.querySelector('input[name="ra-modo"]:checked') || {}).value === 'guiada';
        let criada;
        try {
            criada = await api('POST', `/api/v1/projects/${projectId}/ropa`, { processing_purpose: nome });
            await api('PUT', `/api/v1/projects/${projectId}/ropa/${criada.id}/escopo`, { nome, owner_parte_id: responsavel || null, areas_ids: area ? [area] : [] });
        } catch (e) { erro.textContent = 'Não foi possível criar a atividade. Tente de novo.'; return; }
        forceCloseModal();
        if (guiada) window.abrirRopaEntrevista(projectId, criada.id);
        else window.abrirAtividade(projectId, criada.id);
    };

    window.openNewROPAModal = async function(projectId) {
        const parteOptions = await opcoesDePartes(projectId, null);
        catalogoBases = await idsDoCatalogo(api);
        openModal(`
            <div class="modal-header"><span class="modal-title">Nova atividade de tratamento (RoPA), edição avançada</span></div>
            <div class="form-group"><label class="form-label" for="ropa-purpose">Finalidade do tratamento</label><input class="form-input" id="ropa-purpose" placeholder="Ex: Folha de pagamento"></div>
            <div class="form-group"><label class="form-label" for="ropa-categories">Categorias de dados</label><input class="form-input" id="ropa-categories" placeholder="Ex: Dados pessoais, financeiros, biometria"></div>
            <div class="form-group"><label class="form-label" for="ropa-subjects">Titulares</label><input class="form-input" id="ropa-subjects" placeholder="Ex: Colaboradores, Clientes"></div>
            <div class="form-group"><label class="form-label" for="ropa-basis">Base legal</label>
                <select class="form-input" id="ropa-basis">${opcoesBase('')}</select></div>
            ${riscosDoTratamento('ropa')}
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label" for="ropa-retention">Retenção</label><input class="form-input" id="ropa-retention" placeholder="Ex: 5 anos"></div>
                <div class="form-group" style="flex:1"><label class="form-label" for="ropa-owner-parte">Responsável (cadastro de partes)</label><select class="form-input" id="ropa-owner-parte">${parteOptions}</select></div>
            </div>
            <div class="form-group"><label class="form-label" for="ropa-owner">Responsável (texto livre)</label><input class="form-input" id="ropa-owner" placeholder="Ex: DPO"></div>
            <div class="form-group"><label class="form-label" for="ropa-recipients">Destinatários / compartilhamento</label><input class="form-input" id="ropa-recipients" placeholder="Ex: Contabilidade, INSS, provedores de nuvem"></div>
            <p class="form-label" id="ropa-nasce-rascunho">A atividade nasce como rascunho. O status muda depois, na edição ou pela aprovação.</p>
            <button class="btn btn-primary" style="width:100%" data-action="createROPA" data-args='["${projectId}"]'>Registrar</button>
        `);
    };

    window.createROPA = async function(projectId) {
        const body = { 
            processing_purpose: document.getElementById('ropa-purpose').value, 
            data_categories: document.getElementById('ropa-categories').value, 
            data_subjects: document.getElementById('ropa-subjects').value, 
            ...camposDaBase(document.getElementById('ropa-basis').value, catalogoBases), 
            retention_period: document.getElementById('ropa-retention').value, 
            recipients: document.getElementById('ropa-recipients').value, 
            owner: document.getElementById('ropa-owner').value, 
            owner_parte_id: document.getElementById('ropa-owner-parte').value || null,
            transfer_safeguards: document.getElementById('ropa-safeguards').value,
            international_transfers: document.getElementById('ropa-intl').checked ? 1 : 0, 
            dpia_required: document.getElementById('ropa-dpia').checked ? 1 : 0,
            dados_sensiveis: document.getElementById('ropa-sensiveis').checked ? 1 : 0,
            criancas_adolescentes: document.getElementById('ropa-criancas').checked ? 1 : 0
        };
        if (!body.processing_purpose.trim()) { showToast('Informe a finalidade do tratamento', 'error'); document.getElementById('ropa-purpose').focus(); return; }
        try { await api('POST', `/api/v1/projects/${projectId}/ropa`, body); }
        catch (e) { showToast('Não foi possível registrar a atividade: ' + e.message, 'error'); return; }
        forceCloseModal(); render();
    };

    window.openEditROPAModal = async function(id) {
        const r = S.ropa.find(x => x.id === id) || {};
        const parteOptions = await opcoesDePartes(r.project_id || (S.activeProject && S.activeProject.id), r.owner_parte_id);
        catalogoBases = await idsDoCatalogo(api);
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar atividade (RoPA), edição avançada</span></div>
            <div class="form-group"><label class="form-label" for="ropa-e-purpose">Finalidade</label><input class="form-input" id="ropa-e-purpose" value="${escapeHTML(r.processing_purpose||'')}"></div>
            <div class="form-group"><label class="form-label" for="ropa-e-categories">Categorias de dados</label><input class="form-input" id="ropa-e-categories" value="${escapeHTML(r.data_categories||'')}"></div>
            <div class="form-group"><label class="form-label" for="ropa-e-subjects">Titulares</label><input class="form-input" id="ropa-e-subjects" value="${escapeHTML(r.data_subjects||'')}"></div>
            <div class="form-group"><label class="form-label" for="ropa-e-basis">Base legal</label>
                <select class="form-input" id="ropa-e-basis">${opcoesBase(r.legal_basis)}</select></div>
            ${riscosDoTratamento('ropa-e', r)}
            <div style="display:flex;gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label" for="ropa-e-retention">Retenção</label><input class="form-input" id="ropa-e-retention" value="${escapeHTML(r.retention_period||'')}"></div>
                <div class="form-group" style="flex:1"><label class="form-label" for="ropa-e-owner-parte">Responsável (cadastro de partes)</label><select class="form-input" id="ropa-e-owner-parte">${parteOptions}</select></div>
            </div>
            <div class="form-group"><label class="form-label" for="ropa-e-owner">Responsável (texto livre)</label><input class="form-input" id="ropa-e-owner" value="${escapeHTML(r.owner||'')}"></div>
            <div class="form-group"><label class="form-label" for="ropa-e-recipients">Destinatários / compartilhamento</label><input class="form-input" id="ropa-e-recipients" value="${escapeHTML(r.recipients||'')}"></div>
            <div class="form-group"><label class="form-label" for="ropa-e-status">Status</label>
                <select class="form-input" id="ropa-e-status" ${r.status==='Approved'?'disabled':''}>
                    ${r.status==='Approved' ? '<option value="Approved" selected>Aprovado (para reabrir, revogue a aprovação)</option>' : opcoesStatus(STATUS_ROPA, r.status || 'Active')}
                </select></div>
            <div style="display:flex;gap:0.5rem;justify-content:space-between;margin-top:1rem">
                <button class="btn" style="color:var(--danger-ink)" data-action="deleteROPA" data-args='["${id}"]'>Excluir</button>
                <button class="btn btn-primary" data-action="updateROPA" data-args='["${id}"]'>Salvar</button>
            </div>
        `);
    };

    window.updateROPA = async function(id) {
        const body = { 
            processing_purpose: document.getElementById('ropa-e-purpose').value, 
            data_categories: document.getElementById('ropa-e-categories').value, 
            data_subjects: document.getElementById('ropa-e-subjects').value, 
            ...camposDaBase(document.getElementById('ropa-e-basis').value, catalogoBases), 
            retention_period: document.getElementById('ropa-e-retention').value, 
            recipients: document.getElementById('ropa-e-recipients').value, 
            owner: document.getElementById('ropa-e-owner').value, 
            owner_parte_id: document.getElementById('ropa-e-owner-parte').value || null,
            transfer_safeguards: document.getElementById('ropa-e-safeguards').value,
            international_transfers: document.getElementById('ropa-e-intl').checked ? 1 : 0, 
            dpia_required: document.getElementById('ropa-e-dpia').checked ? 1 : 0,
            dados_sensiveis: document.getElementById('ropa-e-sensiveis').checked ? 1 : 0,
            criancas_adolescentes: document.getElementById('ropa-e-criancas').checked ? 1 : 0
        };
        // Aprovar é pelo fluxo de assinatura; o PUT recusa 'Approved' e status em ROPA já aprovado.
        const st = document.getElementById('ropa-e-status');
        if (!st.disabled) body.status = st.value;
        if (!body.processing_purpose.trim()) { showToast('Informe a finalidade do tratamento', 'error'); return; }
        if (!(await confirmaEdicaoAprovada(S.ropa.find(x => x.id === id)))) return;
        try { await api('PUT', `/api/v1/ropa/${id}`, body); }
        catch (e) { showToast('Não foi possível salvar a atividade: ' + e.message, 'error'); return; }
        forceCloseModal(); render();
    };

    window.deleteROPA = async function(id) { 
        if (await window.confirmar('O tratamento sai do RoPA deste projeto.', { titulo: 'Excluir registro do RoPA', perigo: true, rotulo: 'Excluir' })) { await api('DELETE', `/api/v1/ropa/${id}`); render(); } 
    };

    const STATUS_RIPD = { Draft: 'Rascunho', 'Under Review': 'Em revisão', Approved: 'Aprovado' };
    let listaRipd = null;
    /** `filtrar` falso no primeiro desenho: o select ainda é o da tela anterior. */
    function tabelaRipd(filtrar = true) {
        const { assessments, projectId, vazio } = listaRipd;
        const st = filtrar && document.getElementById('ripd-filtro-status') ? document.getElementById('ripd-filtro-status').value : '';
        const itens = assessments.filter(dp => !st || (dp.status || 'Draft') === st);
        return window.renderDataTable(
            ['Atividade', 'Sistema ou operação', 'Titulares', 'Categorias de dados', 'Risco residual', 'Status', 'Ações'],
            itens.map(dp => {
                const statusType = dp.status === 'Approved' ? 'success' : dp.status === 'Under Review' ? 'warning' : 'info';
                return [
                    escapeHTML(dp.atividade || '—'),
                    `<strong>${escapeHTML(dp.system_name)}</strong>`,
                    escapeHTML(dp.data_subjects_types || 'N/A'),
                    escapeHTML(dp.personal_data_categories || 'N/A'),
                    escapeHTML(dp.residual_risk_level || '—'),
                    // Selo "mudou na origem" (F3): só aviso; a aprovação do RIPD não muda por isso.
                    window.renderStatusBadge(dp.status || 'Draft', statusType) + (dp.origem_mudou ? ` ${window.renderStatusBadge('RoPA mudou depois deste RIPD: revise', 'warning')}` : ''),
                    `<button class="btn btn-ghost btn-sm" data-action="openDPIADetailsModal" data-args='["${dp.id}"]'>Detalhes</button>
                     <button class="btn btn-ghost btn-sm" style="color:var(--accent)" data-action="openDPIAReport" data-args='["${projectId}","${dp.id}"]' data-stop>PDF</button>
                     <button class="btn btn-ghost btn-sm" data-action="baixarWordRipd" data-args='["${projectId}","${dp.id}"]' data-stop>Word</button>`
                ];
            }),
            st ? { emptyState: 'Nenhum RIPD com este status.', emptyHint: 'Limpe o filtro para ver todos.' } : vazio
        );
    }
    window.filtrarRipd = function () { if (listaRipd && document.getElementById('ripd-lista')) document.getElementById('ripd-lista').innerHTML = tabelaRipd(); };

    async function renderDPIA(c, h, a) {
        // O termo legal brasileiro vem primeiro (LGPD, art. 5º, XVII).
        h.textContent = tituloDaTela('nav-dpia', 'RIPD');
        const proj = S.activeProject || S.projects[0];
        if (!proj) { 
            a.innerHTML = '';
            c.innerHTML = window.renderSemProjeto(); 
            return; 
        }
        
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        a.innerHTML = canCrud ? `<button class="btn btn-primary" data-action="openNewDPIAModal" data-args='["${proj.id}"]'>Novo RIPD</button>` : '';

        let assessments = [];
        try { assessments = await api('GET', `/api/v1/projects/${proj.id}/dpia`); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar os RIPDs.', e); return; }
        if (!Array.isArray(assessments)) assessments = [];
        S.dpia = assessments;
        if (assessments.length) a.innerHTML = `<button class="btn" data-action="exportarCsvRipd" data-args='["${proj.id}"]'>Exportar CSV</button> ` + a.innerHTML;

        // Sem RIPD, o vazio diz onde ele é exigido: os tratamentos marcados "Exige RIPD" no RoPA.
        let exigem = 0;
        if (!assessments.length) {
            try { const rs = await api('GET', `/api/v1/projects/${proj.id}/ropa`); exigem = Array.isArray(rs) ? rs.filter(r => r.dpia_required).length : 0; } catch (e) { /* secundário: o vazio sai sem a contagem */ }
        }

        const totalDPIA = assessments.length;
        const approvedCount = assessments.filter(dp => dp.status === 'Approved').length;
        const reviewCount = assessments.filter(dp => dp.status === 'Under Review').length;
        const draftCount = totalDPIA - (approvedCount + reviewCount);

        const statsHtml = window.renderStatCards([
            { label: 'RIPDs', value: totalDPIA, color: 'var(--text)', subtext: 'Relatórios registrados' },
            { label: 'Aprovados', value: approvedCount, color: 'var(--text)', subtext: 'Risco aceitável ou mitigado' },
            { label: 'Em revisão', value: reviewCount, color: reviewCount ? 'var(--warning)' : 'var(--text)', subtext: 'Aguardando o encarregado' },
            { label: 'Rascunhos', value: draftCount, color: 'var(--text)', subtext: 'Em elaboração' }
        ]);

        const vazioRipd = exigem
            ? { emptyState: `Nenhum RIPD. ${exigem} ${exigem === 1 ? 'tratamento do RoPA está marcado' : 'tratamentos do RoPA estão marcados'} como "Exige RIPD".`,
                emptyAction: `<button class="btn" data-action="navigate" data-args='["ropa"]'>Abrir o RoPA</button>${canCrud ? `<button class="btn btn-primary" data-action="openNewDPIAModal" data-args='["${proj.id}"]'>Novo RIPD</button>` : ''}` }
            : { emptyState: 'Nenhum RIPD registrado.',
                emptyHint: 'Marque no RoPA os tratamentos de alto risco para saber onde o RIPD é exigido.',
                emptyAction: `<button class="btn" data-action="navigate" data-args='["ropa"]'>Abrir o RoPA</button>` };
        listaRipd = { assessments, projectId: proj.id, vazio: vazioRipd };
        // Atividade (finalidade do RoPA ligado) e risco residual na lista; filtro de status na tela (spec 2026-10-19).
        const filtroRipd = assessments.length ? `<div class="co-controles"><label class="co-campo"><span class="co-campo-rotulo">Status</span>
            <select class="form-select" id="ripd-filtro-status" data-action-change="filtrarRipd"><option value="">Todos</option>
            ${Object.entries(STATUS_RIPD).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></label></div>` : '';
        const tableHtml = `${filtroRipd}<div id="ripd-lista">${tabelaRipd(false)}</div>`;

        c.innerHTML = `
            ${statsHtml}
            ${tableHtml}
        `;
    }

    window.openDPIADetailsModal = function(id) {
        const dp = S.dpia.find(x => x.id === id) || {};
        const projectId = S.activeProject ? S.activeProject.id : '';
        const canCrud = S.user && (S.user.role === 'platform_admin' || S.user.role === 'consultant' || S.user.role === 'consultor');
        const statusColor = s => s === 'Approved' ? 'var(--success)' : s === 'Under Review' ? 'var(--warning)' : 'var(--muted)';
        // No n.privacy quem assina pelo papel `ciso` é o encarregado (o cargo DPO dá a autoridade, monitor.js).
        const papelCiso = produtoAtual() === 'privacy' ? 'Encarregado (DPO)' : 'Líder SGSI';
        
        openModal(`
            <div class="modal-header">
                <span class="modal-title">Detalhes do RIPD</span>
                
            </div>
            <div style="display:flex; flex-direction:column; gap:16px; font-family:'Inter',sans-serif;">
                <div style="font-family:'Montserrat',sans-serif; font-weight:600; font-size:1.3rem; color:var(--text)">
                    ${escapeHTML(dp.system_name)}
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:16px">
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Descrição do Fluxo de Dados</div>
                        <div style="font-size:0.85rem; color:var(--text)">${escapeHTML(dp.data_flow_description || 'Sem descrição')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Tipos de Titulares</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(dp.data_subjects_types || 'N/A')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Categorias de Dados Pessoais</div>
                        <div style="font-size:0.85rem; font-weight:600; color:var(--text)">${escapeHTML(dp.personal_data_categories || 'N/A')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Necessidade e Proporcionalidade</div>
                        <div style="font-size:0.85rem; color:var(--text)">${escapeHTML(dp.necessity_proportionality || 'Sem justificativa cadastrada')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Riscos identificados à privacidade</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(dp.risks_identified || 'Nenhum risco listado')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Medidas de mitigação e salvaguardas</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(dp.mitigation_measures || 'Nenhuma medida cadastrada')}</div>
                    </div>
                    <div style="grid-column:span 2">
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Parecer do DPO (Encarregado)</div>
                        <div style="font-size:0.85rem; color:var(--text); white-space:pre-wrap">${escapeHTML(dp.dpo_opinion || 'Aguardando parecer formal do DPO')}</div>
                    </div>
                    <div>
                        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:500; margin-bottom:4px">Status do RIPD</div>
                        <span class="ctx-tag" style="color:${statusColor(dp.status)}; border-color:${statusColor(dp.status)}; font-weight:600">${escapeHTML(window.traduzStatus(dp.status || 'Draft'))}</span>
                    </div>
                </div>
            </div>
            <div style="border-top:1px solid rgba(255,255,255,0.08); padding-top:1rem; margin-top:16px">
                <h4 style="font-family:'Montserrat',sans-serif; font-size:0.7rem; color:var(--text-dim); margin-bottom:0.75rem; text-transform:uppercase; letter-spacing:0.05em">Assinaturas do RIPD</h4>
                <div style="display:flex; flex-direction:column; gap:0.75rem">
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; font-size:0.75rem">
                        <div>
                            <strong>${papelCiso}:</strong> 
                            ${dp.dpo_signature ? `<span style="color:var(--success)">Aprovado por ${escapeHTML(dp.dpo_signature)}</span>` : `<span style="color:var(--text-dim)">Aguardando assinatura</span>`}
                        </div>
                        ${!dp.dpo_signature ? `<button class="btn" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="approveDPIA" data-args='["${projectId}","${dp.id}","ciso"]'>Assinar</button>` : ''}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem; font-size:0.75rem">
                        <div>
                            <strong>Direção Executiva:</strong> 
                            ${dp.ceo_signature ? `<span style="color:var(--success)">Aprovado por ${escapeHTML(dp.ceo_signature)}</span>` : `<span style="color:var(--text-dim)">Aguardando assinatura</span>`}
                        </div>
                        ${!dp.ceo_signature ? `<button class="btn" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="approveDPIA" data-args='["${projectId}","${dp.id}","ceo"]'>Assinar</button>` : ''}
                    </div>
                    ${podeRevogar() && (dp.dpo_signature || dp.ceo_signature || dp.status === 'Approved') ? `<div style="text-align:right"><button class="btn-secondary" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="revogarDPIA" data-args='["${projectId}","${dp.id}"]'>Revogar aprovação do RIPD</button></div>` : ''}
                    ${window.podePedirAprovacao?.(S.user) ? `<div style="text-align:right"><button class="btn-secondary" style="padding:0.2rem 0.6rem; font-size:0.75rem" data-action="abrirPedidoAprovacao" data-args='${escapeHTML(JSON.stringify([projectId, 'dpia', dp.id]))}'>Pedir aprovação</button></div>` : ''}
                </div>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px">
                <div>
                    <button class="btn btn-secondary" data-action="openDPIAReport" data-args='["${projectId}","${dp.id}"]'>Exportar RIPD (PDF)</button>
                    <button class="btn btn-secondary" data-action="baixarWordRipd" data-args='["${projectId}","${dp.id}"]'>Baixar Word</button>
                </div>
                <div>
                    <button class="btn" data-action="forceCloseModal">Fechar</button>
                    ${canCrud ? `<button class="btn btn-primary" data-action="openEditDPIAModal" data-args='["${id}"]'>Editar RIPD</button>` : ''}
                </div>
            </div>
        `);
    };

    // Novo RIPD (n.privacy): a atividade do RoPA vem primeiro e o RIPD nasce dela, herdando o que já foi informado (finalidade,
    // titulares, categorias, base legal, retenção, teste de impacto). Sem atividade, ou sem o n.privacy, o formulário à mão de sempre.
    window.openNewDPIAModal = async function(projectId) {
        const comPrivacy = temProduto(projetoDoId(projectId), 'privacy');
        let atividades = [];
        if (comPrivacy) {
            // api() já desembrulha `{ ok, records }` na lista; o objeto inteiro só chega se a rota mudar de forma.
            try { const r = await api('GET', `/api/v1/projects/${projectId}/ropa`); atividades = Array.isArray(r) ? r : (Array.isArray(r?.records) ? r.records : []); }
            catch (e) { atividades = []; /* secundário: sem a lista, o formulário à mão */ }
        }
        const escolha = atividades.length ? `<div class="form-group"><label class="form-label" for="dpia-ropa">Atividade do RoPA</label>
            <select class="form-input" id="dpia-ropa" data-action-change="novoRipdAtividade" data-arg-val>
                <option value="">Sem atividade: preencher à mão</option>
                ${atividades.map((x) => `<option value="${escapeHTML(x.id)}">${escapeHTML(x.processing_purpose || x.id)}</option>`).join('')}
            </select><p class="re-nota" id="dpia-ropa-dica">Com a atividade, o RIPD nasce com o que o RoPA e o teste de impacto já informaram.</p></div>` : '';
        openModal(`
            <div class="modal-header"><span class="modal-title">Novo RIPD</span></div>
            ${escolha}
            <div id="dpia-manual">
            <div class="form-group"><label class="form-label" for="dpia-system">Nome do Sistema / Processo de Dados</label><input class="form-input" id="dpia-system" placeholder="Ex: CRM Salesforce, Sistema de RH Interno"><p class="campo-erro" id="dpia-system-erro" aria-live="polite"></p></div>
            <div class="form-group"><label class="form-label">Descrição do Fluxo de Dados</label><textarea class="form-input" id="dpia-flow" placeholder="Descreva como os dados entram, circulam e saem do sistema..."></textarea></div>
            <div style="display:flex; gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Tipos de Titulares</label><input class="form-input" id="dpia-subjects" placeholder="Ex: Clientes, Colaboradores"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Categorias de Dados</label><input class="form-input" id="dpia-categories" placeholder="Ex: Nome, CPF, e-mail, cartão"></div>
            </div>
            <div class="form-group"><label class="form-label">Necessidade e Proporcionalidade</label><textarea class="form-input" id="dpia-necessity" placeholder="Por que estes dados são estritamente necessários para a finalidade?"></textarea></div>
            <div class="form-group"><label class="form-label">Riscos Identificados para a Privacidade</label><textarea class="form-input" id="dpia-risks" placeholder="Ex: Vazamento de dados em trânsito, acesso não autorizado..."></textarea></div>
            <div class="form-group"><label class="form-label">Medidas de Mitigação e Salvaguardas</label><textarea class="form-input" id="dpia-mitigations" placeholder="Ex: Uso de criptografia TLS/AES-256, MFA ativo, auditorias..."></textarea></div>
            <div class="form-group"><label class="form-label">Parecer DPO (Opcional)</label><textarea class="form-input" id="dpia-opinion" placeholder="Parecer inicial do encarregado..."></textarea></div>
            </div>
            <button class="btn btn-primary" style="width:100%; margin-top:1rem" data-action="createDPIA" data-args='["${projectId}"]'>Registrar RIPD</button>
        `);
    };

    window.novoRipdAtividade = function(v) {
        const manual = document.getElementById('dpia-manual');
        if (manual) manual.hidden = !!v;
    };

    window.createDPIA = async function(projectId) {
        const atividade = document.getElementById('dpia-ropa')?.value;
        if (atividade) {
            try { await api('POST', `/api/v1/projects/${projectId}/ropa/${atividade}/dpia`); }
            catch (e) {
                if (e.status !== 409) { showToast(`Não foi possível criar o RIPD: ${e.message}`, 'error'); return; }
                showToast('Esta atividade já tem RIPD.', 'info');
            }
            forceCloseModal(); render();
            return;
        }
        const body = {
            system_name: document.getElementById('dpia-system').value,
            data_flow_description: document.getElementById('dpia-flow').value,
            data_subjects_types: document.getElementById('dpia-subjects').value,
            personal_data_categories: document.getElementById('dpia-categories').value,
            necessity_proportionality: document.getElementById('dpia-necessity').value,
            risks_identified: document.getElementById('dpia-risks').value,
            mitigation_measures: document.getElementById('dpia-mitigations').value,
            dpo_opinion: document.getElementById('dpia-opinion').value
        };
        const nome = document.getElementById('dpia-system');
        const erroNome = document.getElementById('dpia-system-erro');
        if (!body.system_name.trim()) {
            nome.setAttribute('aria-invalid', 'true');
            nome.setAttribute('aria-describedby', 'dpia-system-erro');
            erroNome.textContent = 'Informe o sistema ou processo avaliado, ou escolha uma atividade do RoPA.';
            nome.focus();
            return;
        }
        nome.removeAttribute('aria-invalid');
        erroNome.textContent = '';
        try { await api('POST', `/api/v1/projects/${projectId}/dpia`, body); }
        catch (e) { showToast(`Não foi possível registrar o RIPD: ${e.message}`, 'error'); return; }
        forceCloseModal(); render();
    };

    window.openEditDPIAModal = function(id) {
        const dp = S.dpia.find(x => x.id === id) || {};
        openModal(`
            <div class="modal-header"><span class="modal-title">Editar RIPD</span></div>
            <div class="form-group"><label class="form-label">Nome do Sistema</label><input class="form-input" id="dpia-e-system" value="${escapeHTML(dp.system_name||'')}"></div>
            <div class="form-group"><label class="form-label">Descrição do Fluxo</label><textarea class="form-input" id="dpia-e-flow">${escapeHTML(dp.data_flow_description||'')}</textarea></div>
            <div style="display:flex; gap:0.5rem">
                <div class="form-group" style="flex:1"><label class="form-label">Tipos de Titulares</label><input class="form-input" id="dpia-e-subjects" value="${escapeHTML(dp.data_subjects_types||'')}"></div>
                <div class="form-group" style="flex:1"><label class="form-label">Categorias de Dados</label><input class="form-input" id="dpia-e-categories" value="${escapeHTML(dp.personal_data_categories||'')}"></div>
            </div>
            <div class="form-group"><label class="form-label">Necessidade e Proporcionalidade</label><textarea class="form-input" id="dpia-e-necessity">${escapeHTML(dp.necessity_proportionality||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Riscos Identificados</label><textarea class="form-input" id="dpia-e-risks">${escapeHTML(dp.risks_identified||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Medidas de Mitigação</label><textarea class="form-input" id="dpia-e-mitigations">${escapeHTML(dp.mitigation_measures||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Parecer do DPO (Encarregado)</label><textarea class="form-input" id="dpia-e-opinion">${escapeHTML(dp.dpo_opinion||'')}</textarea></div>
            <div class="form-group"><label class="form-label">Status</label>
                <select class="form-input" id="dpia-e-status" ${dp.status==='Approved'?'disabled':''}>
                    ${dp.status==='Approved' ? '<option value="Approved" selected>Aprovado (para reabrir, revogue a aprovação)</option>' : `
                    <option value="Draft" ${dp.status==='Draft'?'selected':''}>Rascunho</option>
                    <option value="Under Review" ${dp.status==='Under Review'?'selected':''}>Em revisão</option>`}
                </select></div>

            <div style="display:flex; gap:0.5rem; justify-content:space-between; margin-top:1.5rem">
                <button class="btn" style="color:var(--danger-ink)" data-action="deleteDPIA" data-args='["${id}"]'>Excluir</button>
                <button class="btn btn-primary" data-action="updateDPIA" data-args='["${id}"]'>Salvar</button>
            </div>
        `);
    };

    window.updateDPIA = async function(id) {
        const body = {
            system_name: document.getElementById('dpia-e-system').value,
            data_flow_description: document.getElementById('dpia-e-flow').value,
            data_subjects_types: document.getElementById('dpia-e-subjects').value,
            personal_data_categories: document.getElementById('dpia-e-categories').value,
            necessity_proportionality: document.getElementById('dpia-e-necessity').value,
            risks_identified: document.getElementById('dpia-e-risks').value,
            mitigation_measures: document.getElementById('dpia-e-mitigations').value,
            dpo_opinion: document.getElementById('dpia-e-opinion').value
        };
        // Aprovar é pelo fluxo de assinatura; o PUT só move entre Draft e Under Review e recusa
        // status em DPIA já aprovada.
        const st = document.getElementById('dpia-e-status');
        if (!st.disabled) body.status = st.value;
        await api('PUT', `/api/v1/dpia/${id}`, body);
        forceCloseModal(); render();
    };

    window.deleteDPIA = async function(id) {
        if (await window.confirmar('O RIPD sai deste projeto.', { titulo: 'Excluir RIPD', perigo: true, rotulo: 'Excluir' })) {
            await api('DELETE', `/api/v1/dpia/${id}`);
            forceCloseModal();
            render();
        }
    };


    // O relatório é HTML autenticado: busca com o cabeçalho da sessão e abre o conteúdo como blob. O token nunca vai na URL
    // (ficava no histórico do navegador, em log de proxy e no Referer).
    async function abrirRelatorio(caminho) {
        let r;
        try { r = await fetch(API_BASE + caminho, { headers: cabecalhosAuth(), signal: AbortSignal.timeout(30000) }); }
        catch (e) { showToast('Não foi possível gerar o relatório', 'error'); return; }
        if (!r.ok) { showToast(`Não foi possível gerar o relatório (erro ${r.status})`, 'error'); return; }
        const url = URL.createObjectURL(new Blob([await r.text()], { type: 'text/html;charset=utf-8' }));
        if (!window.open(url, '_blank')) showToast('O navegador bloqueou a nova janela. Permita pop-ups para este endereço.', 'error');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    window.openROPAReport = (projectId) => abrirRelatorio(`/api/v1/projects/${projectId}/ropa/report`);

    // Arquivos (F4): CSV que abre no Excel e Word do RIPD, pelo caminho autenticado de api.js. Erro vira aviso na tela.
    const baixar = (promessa) => promessa.catch((e) => showToast(e.message || 'Não foi possível baixar o arquivo', 'error'));
    window.exportarCsvAtividades = (projectId) => baixar(baixarArquivo(`/api/v1/projects/${projectId}/export/atividades`));
    window.exportarCsvLia = (projectId) => baixar(baixarArquivo(`/api/v1/projects/${projectId}/export/lia`));
    window.exportarCsvRipd = (projectId) => baixar(baixarArquivo(`/api/v1/projects/${projectId}/export/ripd`));
    window.baixarWordRipd = (projectId, id) => baixar(baixarArquivo(`/api/v1/projects/${projectId}/dpia/${id}/docx`));

    // Desaprovar é ato da direção (F6): só platform_admin e org_admin veem o botão; o servidor decide de novo.
    // O motivo é obrigatório e vai para a trilha.
    function podeRevogar() {
        return !!S.user && (S.user.role === 'platform_admin' || S.user.role === 'org_admin');
    }
    async function pedeMotivo(o_que) {
        const motivo = (await window.pedirTexto(`Revogar ${o_que}. Informe o motivo (obrigatório, vai para a trilha de auditoria).`, { titulo: 'Revogar aprovação', rotulo: 'Revogar', perigo: true })) || '';
        if (motivo.length < 5) {
            if (motivo) showToast('Motivo muito curto (mínimo de 5 caracteres)', 'error');
            return null;
        }
        return motivo;
    }

    window.revogarROPA = async function(projectId, recordId, role) {
        const motivo = await pedeMotivo(role === 'ciso' ? 'a aprovação do Líder SGSI no ROPA' : 'a aprovação da Direção no ROPA');
        if (!motivo) return;
        try {
            await api('POST', `/api/v1/projects/${projectId}/ropa/${recordId}/revoke-approval`, { role, reason: motivo });
            showToast('Aprovação do ROPA revogada');
            forceCloseModal();
            // Falha na recarga não zera a lista: o render() abaixo refaz a tela e mostra o erro ali.
            try { S.ropa = await api('GET', `/api/v1/projects/${projectId}/ropa`); } catch (e) { /* idem */ }
            window.openROPADetailsModal(recordId);
            render();
        } catch(e) {
            showToast('Erro ao revogar aprovação: ' + e.message, 'error');
        }
    };

    window.revogarDPIA = async function(projectId, id) {
        const motivo = await pedeMotivo('a aprovação e as assinaturas do RIPD');
        if (!motivo) return;
        try {
            await api('POST', `/api/v1/projects/${projectId}/dpia/${id}/revoke-approval`, { reason: motivo });
            showToast('Aprovação do RIPD revogada');
            forceCloseModal();
            // Falha na recarga não zera a lista: o render() abaixo refaz a tela e mostra o erro ali.
            try { S.dpia = await api('GET', `/api/v1/projects/${projectId}/dpia`); } catch (e) { /* idem */ }
            window.openDPIADetailsModal(id);
            render();
        } catch(e) {
            showToast('Erro ao revogar aprovação: ' + e.message, 'error');
        }
    };

    window.approveROPA = async function(projectId, recordId, role) {
        try {
            await api('POST', `/api/v1/projects/${projectId}/ropa/${recordId}/approve`, { role });
            showToast('ROPA assinado com sucesso!');
            forceCloseModal();
            setTimeout(async () => {
                // Falha na recarga não zera a lista: o render() abaixo refaz a tela e mostra o erro ali.
                try { S.ropa = await api('GET', `/api/v1/projects/${projectId}/ropa`); } catch (e) { /* idem */ }
                window.openROPADetailsModal(recordId);
                render();
            }, 300);
        } catch(e) {
            showToast('Erro ao assinar ROPA: ' + e.message, 'error');
        }
    };

    window.openDPIAReport = (projectId, id) => abrirRelatorio(`/api/v1/projects/${projectId}/dpia/${id}/report`);

    window.approveDPIA = async function(projectId, id, role) {
        try {
            await api('POST', `/api/v1/projects/${projectId}/dpia/${id}/approve`, { role });
            showToast('RIPD assinado.');
            forceCloseModal();
            setTimeout(async () => {
                // Falha na recarga não zera a lista: o render() abaixo refaz a tela e mostra o erro ali.
                try { S.dpia = await api('GET', `/api/v1/projects/${projectId}/dpia`); } catch (e) { /* idem */ }
                window.openDPIADetailsModal(id);
                render();
            }, 300);
        } catch(e) {
            showToast('Erro ao assinar DPIA: ' + e.message, 'error');
        }
    };

export { renderROPA, renderDPIA };
window.renderROPA = renderROPA;
window.renderDPIA = renderDPIA;
