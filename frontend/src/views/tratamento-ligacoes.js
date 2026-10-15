import { S } from '../state.js';
import { api, baixarArquivo } from '../api.js';
import { showToast, openModal, escapeHTML } from '../ui.js';
import { textoDaBase } from '../bases-legais.js';
import { NIVEIS } from './mapa-de-risco.js';

// Ligações do registro do RoPA (fatia 4.1 e 4.2 do núcleo): base legal do catálogo, itens, departamentos, partes,
// transferências internacionais e o diagrama derivado. Toda regra é do servidor; aqui só se mostra e se chama.
// Todo texto vindo do servidor é escapado.

const PAPEIS_PARTE = { operador: 'Operador', cocontrolador: 'Cocontrolador', suboperador: 'Suboperador', terceiro: 'Destinatário', responsavel: 'Responsável' };
const TIPOS_ITEM = { sistema: 'Sistema', ativo: 'Ativo', base: 'Base', processo: 'Processo' };
const PAIS_DAS_BASES = ['lgpd:art7', 'lgpd:art11'];

const podePedir = () => typeof window.podePedirAprovacao === 'function' && window.podePedirAprovacao(S.user);
const podeEditar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin'].includes(S.user.role);
// Quem o servidor deixa pedir rascunho de IA (services/rascunhos-privacy.ts): equipe e o administrador do cliente.
const podeRascunho = () => podeEditar() || (!!S.user && S.user.role === 'org_admin');
const AVISO_IA = 'Rascunho gerado por IA — revise antes de usar';
// Selo "mudou na origem" (F3): o tratamento mudou depois que a DPIA/LIA nasceu dele. Só aviso; nada é invalidado.
const ORIGEM_MUDOU = 'O tratamento mudou depois que esta avaliação nasceu: revise.';
let basesAbertas = [];
const lista = (r) => (Array.isArray(r) ? r : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const el = (id) => document.getElementById(id);
const falha = (e, padrao) => showToast((e && e.message) || padrao, 'error');

async function acao(projectId, ropaId, fazer, padrao, sucesso) {
    try {
        await fazer();
        if (sucesso) showToast(sucesso, 'success');
        await window.openLigacoesTratamento(projectId, ropaId);
    } catch (e) { falha(e, padrao); }
}

/** Aprovação derivada dos pedidos: vale o pedido aprovado cujo conteúdo é o de hoje; mudar o registro ou uma ligação tira a validade. */
const textoAprovacao = (ap) => {
    if (!ap || (!ap.ciso && !ap.ceo)) return 'Sem aprovação por pedido vigente.';
    const quem = (c) => `${escapeHTML(c.por)} em ${escapeHTML(String(c.em || '').slice(0, 10))}`;
    return [ap.ciso ? `Líder SGSI: ${quem(ap.ciso)}` : '', ap.ceo ? `Direção: ${quem(ap.ceo)}` : ''].filter(Boolean).join(' · ');
};

const CONCLUSOES = { prevalece: 'O interesse do controlador prevalece', nao_prevalece: 'Os direitos do titular prevalecem' };
const campoLia = (id, rotulo, valor, travado) => `<div class="form-group"><label class="form-label" for="${id}">${rotulo}</label><textarea class="form-input" id="${id}" rows="2" maxlength="5000" ${travado ? 'disabled' : ''}>${escapeHTML(valor || '')}</textarea></div>`;

/** Formulário da LIA: rascunho salva, concluir exige o conjunto, concluída só reabre. Texto sempre escapado. */
function formularioLia(lia, projectId, ropaId) {
    const travado = !!lia && lia.status === 'concluida';
    return `<div id="tl-lia">
        ${campoLia('tl-lia-fin', 'Finalidade legítima', lia && lia.finalidade_legitima, travado)}
        ${campoLia('tl-lia-nec', 'Necessidade', lia && lia.necessidade, travado)}
        ${campoLia('tl-lia-bal', 'Balanceamento com os direitos do titular', lia && lia.balanceamento, travado)}
        ${campoLia('tl-lia-sal', 'Salvaguardas', lia && lia.salvaguardas, travado)}
        <div class="form-group"><label class="form-label" for="tl-lia-con">Conclusão</label>
            <select class="form-input" id="tl-lia-con" ${travado ? 'disabled' : ''}><option value="">— sem conclusão —</option>${Object.entries(CONCLUSOES).map(([v, r]) =>
                `<option value="${v}" ${lia && lia.conclusao === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap">
            ${travado ? `<button class="btn btn-sm" data-action="reabrirLiaTratamento" data-args='${args(projectId, ropaId)}'>Reabrir para editar</button>`
                : `<button class="btn btn-sm" data-action="salvarLiaTratamento" data-args='${args(projectId, ropaId, false)}'>Salvar rascunho</button>
                   <button class="btn btn-primary btn-sm" data-action="salvarLiaTratamento" data-args='${args(projectId, ropaId, true)}'>Concluir</button>`}
        </div></div>`;
}

// ─── Riscos e ações da atividade (F2): o MESMO cadastro do n.iso, pelas sub-rotas do n.privacy. Nada aqui leva ao n.iso. ───
const TRATAMENTOS = { Mitigate: 'Mitigar', Accept: 'Aceitar', Avoid: 'Evitar', Transfer: 'Transferir' };
const SITUACAO_RISCO = { Open: 'Aberto', Mitigated: 'Mitigado', Accepted: 'Aceito', Closed: 'Encerrado' };
const SITUACAO_ACAO = { Open: 'Aberta', 'In Progress': 'Em andamento', Closed: 'Concluída' };
const NOTAS = [1, 2, 3, 4, 5];
const opcoes = (mapa, atual) => Object.entries(mapa).map(([v, r]) => `<option value="${escapeHTML(v)}" ${v === atual ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('');
const opcoesNota = (atual, vazioRotulo) => (vazioRotulo ? `<option value="">${vazioRotulo}</option>` : '') + NOTAS.map((n) => `<option value="${n}" ${n === atual ? 'selected' : ''}>${n}</option>`).join('');
const opcoesPartes = (partes, atual) => `<option value="">— sem responsável —</option>${partes.map((p) => `<option value="${escapeHTML(p.id)}" ${p.id === atual ? 'selected' : ''}>${escapeHTML(p.nome)}</option>`).join('')}`;
const nivel = (n) => escapeHTML(NIVEIS[n] || n || '—');
const dataCurta = (d) => (d ? `${escapeHTML(String(d).slice(8, 10))}/${escapeHTML(String(d).slice(5, 7))}/${escapeHTML(String(d).slice(0, 4))}` : '—');

/** Riscos: lista e formulário. O formulário novo já vem com o primeiro sistema ligado à atividade e o responsável dela. */
function blocoRiscos(projectId, ropaId, riscos, itensLigados, partes, editar, dono) {
    const linhas = riscos.length ? `<table class="data-table"><thead><tr><th>Ameaça</th><th>Impacto x probabilidade</th><th>Nível</th><th>Residual</th><th>Tratamento</th><th>Situação</th><th></th></tr></thead><tbody>${riscos.map((k) =>
        `<tr><td>${escapeHTML(k.threat)}${k.asset ? `<div style="color:var(--text-dim); font-size:0.8rem">${escapeHTML(k.asset)}</div>` : ''}</td><td>${escapeHTML(String(k.impact))} x ${escapeHTML(String(k.probability))}</td>
            <td>${nivel(k.risk_level)}</td><td>${k.residual_level ? nivel(k.residual_level) : '—'}</td><td>${escapeHTML(TRATAMENTOS[k.treatment] || k.treatment || '—')}</td>
            <td>${escapeHTML(SITUACAO_RISCO[k.status] || k.status || '—')}</td><td style="text-align:right; white-space:nowrap">${editar
                ? `<button class="btn btn-ghost btn-sm" data-action="editarRiscoAtividade" data-args='${args(k.id)}'>Editar</button><span data-apagar-risco="${escapeHTML(k.id)}"><button class="btn btn-ghost btn-sm" data-action="apagarRiscoAtividade" data-args='${args(projectId, ropaId, k.id, false)}'>Apagar</button></span>` : ''}</td></tr>`).join('')}</tbody></table>`
        : vazio('Nenhum risco registrado nesta atividade.');
    if (!editar) return `<div id="tl-riscos">${linhas}</div>`;
    const ativo = itensLigados.length ? itensLigados[0].id : '';
    return `<div id="tl-riscos">${linhas}
        <h5 id="tl-rk-titulo" style="margin:1rem 0 0.5rem">Novo risco</h5><input type="hidden" id="tl-rk-id" value="">
        <div class="form-group"><label class="form-label" for="tl-rk-ameaca">Ameaça</label><input class="form-input" id="tl-rk-ameaca" maxlength="500"></div>
        <div class="form-group"><label class="form-label" for="tl-rk-vuln">Vulnerabilidade</label><input class="form-input" id="tl-rk-vuln" maxlength="5000"></div>
        <div class="form-group"><label class="form-label" for="tl-rk-ativo">Sistema ou base afetado</label><select class="form-input" id="tl-rk-ativo"><option value="">— a atividade como um todo —</option>${itensLigados.map((i) =>
            `<option value="${escapeHTML(i.id)}" ${i.id === ativo ? 'selected' : ''}>${escapeHTML(i.nome)}</option>`).join('')}</select></div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap">
            <div class="form-group" style="flex:1"><label class="form-label" for="tl-rk-imp">Impacto (1 a 5)</label><select class="form-input" id="tl-rk-imp">${opcoesNota(3)}</select></div>
            <div class="form-group" style="flex:1"><label class="form-label" for="tl-rk-prob">Probabilidade (1 a 5)</label><select class="form-input" id="tl-rk-prob">${opcoesNota(3)}</select></div>
            <div class="form-group" style="flex:1"><label class="form-label" for="tl-rk-trat">Tratamento</label><select class="form-input" id="tl-rk-trat">${opcoes(TRATAMENTOS, 'Mitigate')}</select></div>
        </div>
        <div class="form-group"><label class="form-label" for="tl-rk-plano">Plano de tratamento</label><textarea class="form-input" id="tl-rk-plano" rows="2" maxlength="5000"></textarea></div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap">
            <div class="form-group" style="flex:1"><label class="form-label" for="tl-rk-rimp">Impacto residual</label><select class="form-input" id="tl-rk-rimp">${opcoesNota(null, '— não avaliado —')}</select></div>
            <div class="form-group" style="flex:1"><label class="form-label" for="tl-rk-rprob">Probabilidade residual</label><select class="form-input" id="tl-rk-rprob">${opcoesNota(null, '— não avaliada —')}</select></div>
            <div class="form-group" style="flex:1"><label class="form-label" for="tl-rk-status">Situação</label><select class="form-input" id="tl-rk-status">${opcoes(SITUACAO_RISCO, 'Open')}</select></div>
        </div>
        <div class="form-group"><label class="form-label" for="tl-rk-resp">Responsável</label><select class="form-input" id="tl-rk-resp">${opcoesPartes(partes, dono)}</select></div>
        <div style="display:flex; gap:0.5rem"><button class="btn btn-primary btn-sm" data-action="salvarRiscoAtividade" data-args='${args(projectId, ropaId)}'>Salvar risco</button>
            <button class="btn btn-ghost btn-sm" data-action="openLigacoesTratamento" data-args='${args(projectId, ropaId)}'>Limpar</button></div></div>`;
}

/** Ações (gaps): lista e formulário; o responsável novo nasce o da atividade, e o risco só pode ser um desta atividade. */
function blocoAcoes(projectId, ropaId, acoes, riscos, partes, editar, dono) {
    const linhas = acoes.length ? `<table class="data-table"><thead><tr><th>Ação</th><th>Prazo</th><th>Responsável</th><th>Risco</th><th>Situação</th><th></th></tr></thead><tbody>${acoes.map((x) =>
        `<tr><td>${escapeHTML(x.title)}</td><td>${dataCurta(x.due_date)}</td><td>${escapeHTML(x.assigned_to_parte_nome || x.assigned_to || '—')}</td><td>${escapeHTML(x.risco_ameaca || '—')}</td>
            <td>${escapeHTML(SITUACAO_ACAO[x.status] || x.status || '—')}</td><td style="text-align:right; white-space:nowrap">${editar
                ? `<button class="btn btn-ghost btn-sm" data-action="editarAcaoAtividade" data-args='${args(x.id)}'>Editar</button>${x.status === 'Closed' ? '' : `<button class="btn btn-ghost btn-sm" data-action="concluirAcaoAtividade" data-args='${args(projectId, ropaId, x.id)}'>Concluir</button>`}<span data-apagar-acao="${escapeHTML(x.id)}"><button class="btn btn-ghost btn-sm" data-action="apagarAcaoAtividade" data-args='${args(projectId, ropaId, x.id, false)}'>Apagar</button></span>` : ''}</td></tr>`).join('')}</tbody></table>`
        : vazio('Nenhuma ação registrada nesta atividade.');
    if (!editar) return `<div id="tl-acoes">${linhas}</div>`;
    return `<div id="tl-acoes">${linhas}
        <h5 id="tl-ac-titulo-form" style="margin:1rem 0 0.5rem">Nova ação</h5><input type="hidden" id="tl-ac-id" value="">
        <div class="form-group"><label class="form-label" for="tl-ac-titulo">Ação</label><input class="form-input" id="tl-ac-titulo" maxlength="500"></div>
        <div class="form-group"><label class="form-label" for="tl-ac-desc">Descrição</label><textarea class="form-input" id="tl-ac-desc" rows="2" maxlength="5000"></textarea></div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap">
            <div class="form-group" style="flex:1"><label class="form-label" for="tl-ac-prazo">Prazo</label><input class="form-input" id="tl-ac-prazo" type="date"></div>
            <div class="form-group" style="flex:1"><label class="form-label" for="tl-ac-status">Situação</label><select class="form-input" id="tl-ac-status">${opcoes(SITUACAO_ACAO, 'Open')}</select></div>
        </div>
        <div class="form-group"><label class="form-label" for="tl-ac-resp">Responsável</label><select class="form-input" id="tl-ac-resp">${opcoesPartes(partes, dono)}</select></div>
        <div class="form-group"><label class="form-label" for="tl-ac-risco">Risco que a ação trata</label><select class="form-input" id="tl-ac-risco"><option value="">— nenhum —</option>${riscos.map((k) =>
            `<option value="${escapeHTML(k.id)}">${escapeHTML(k.threat)}</option>`).join('')}</select></div>
        <div style="display:flex; gap:0.5rem"><button class="btn btn-primary btn-sm" data-action="salvarAcaoAtividade" data-args='${args(projectId, ropaId)}'>Salvar ação</button>
            <button class="btn btn-ghost btn-sm" data-action="openLigacoesTratamento" data-args='${args(projectId, ropaId)}'>Limpar</button></div></div>`;
}

const secao = (titulo, corpo) => `<h4 style="margin:1.25rem 0 0.5rem">${titulo}</h4>${corpo}`;
const vazio = (texto) => `<p style="color:var(--text-dim)">${texto}</p>`;

window.openLigacoesTratamento = async function (projectId, ropaId) {
    let lig;
    try { lig = await api('GET', `/api/v1/projects/${projectId}/ropa/${ropaId}/ligacoes`); } catch (e) { falha(e, 'Não foi possível abrir as ligações'); return; }
    const editar = podeEditar();
    let itens = [], deptos = [], partes = [], bases = [], diagrama = '', lia = null;
    try { diagrama = (await api('GET', `/api/v1/projects/${projectId}/ropa/${ropaId}/diagrama`)).mermaid || ''; } catch (e) { /* abre sem o diagrama */ }
    try { lia = (await api('GET', `/api/v1/projects/${projectId}/ropa/${ropaId}/lia`)).lia || null; } catch (e) { /* abre sem a LIA */ }
    let riscos = [], acoes = [];
    try { riscos = lista((await api('GET', `/api/v1/projects/${projectId}/ropa/${ropaId}/riscos`)).riscos); } catch (e) { /* abre sem os riscos */ }
    try { acoes = lista((await api('GET', `/api/v1/projects/${projectId}/ropa/${ropaId}/acoes`)).acoes); } catch (e) { /* abre sem as ações */ }
    S.riscosAtividade = riscos;
    S.acoesAtividade = acoes;
    if (editar) {
        try { const r = await api('GET', `/api/v1/projects/${projectId}/assets`); itens = Array.isArray(r) ? r : lista(r && r.assets); } catch (e) { /* sem seletor de itens */ }
        try { deptos = lista(await api('GET', `/api/v1/projects/${projectId}/departamentos`)); } catch (e) { /* idem */ }
        try { partes = lista(await api('GET', `/api/v1/projects/${projectId}/partes`)).filter((p) => p.status !== 'inativa'); } catch (e) { /* idem */ }
    }
    try { bases = lista(await api('GET', '/api/v1/requisitos?fonte=lgpd')).filter((r) => PAIS_DAS_BASES.includes(r.pai_id)); } catch (e) { /* sem catálogo */ }
    basesAbertas = bases;
    S.ligacoesTratamento = { itens: lig.itens.map((i) => i.id), departamentos: lig.departamentos.map((d) => d.id) };
    const registro = (S.ropa || []).find((r) => r.id === ropaId) || {};
    const finalidade = registro.processing_purpose || '';
    const dono = registro.owner_parte_id || '';

    const marcados = (lst, ids, rotulo, tipo) => lst.length
        ? `<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:0.25rem 1rem">${lst.map((x) =>
            `<label style="display:flex; gap:0.4rem; align-items:center"><input type="checkbox" data-tl="${tipo}" value="${escapeHTML(x.id)}" ${ids.includes(x.id) ? 'checked' : ''}> ${rotulo(x)}</label>`).join('')}</div>`
        : vazio('Nada cadastrado neste projeto ainda.');

    const tabelaItens = lig.itens.length ? lig.itens.map((i) => `${escapeHTML(i.nome)} (${escapeHTML(TIPOS_ITEM[i.tipo] || i.tipo)})`).join(', ') : 'Nenhum';
    const tabelaDeptos = lig.departamentos.length ? lig.departamentos.map((d) => escapeHTML(d.nome)).join(', ') : 'Nenhum';

    openModal(`
        <h3>Ligações do tratamento</h3>
        <p style="color:var(--text-dim)">${escapeHTML(finalidade)}</p>
        ${secao('Aprovação', `<p id="tl-aprovacao">${textoAprovacao(lig.aprovacao)}</p>
            ${podePedir() ? `<button class="btn btn-sm" data-action="pedirAprovacaoTratamento" data-args='${args(projectId, ropaId)}'>Pedir aprovação</button>` : ''}`)}
        ${secao('Avaliações', `<div id="tl-avaliacoes">
            <p><strong>DPIA</strong>: ${lig.dpias.length ? lig.dpias.map((d) => `${escapeHTML(d.nome || 'Sem nome')} (${escapeHTML(d.status || '—')})${d.origem_mudou ? ` <span class="tl-origem">${ORIGEM_MUDOU}</span>` : ''}`).join(', ') + ` <button class="btn btn-ghost btn-sm" data-action="navigate" data-args='["dpia"]'>Abrir a tela de DPIA</button>`
                : (lig.dpia_pendente ? 'exigida por este registro e ainda não criada.' : 'nenhuma ligada.')}
            ${editar && !lig.dpias.length ? `<button class="btn btn-sm" data-action="criarDpiaDoTratamento" data-args='${args(projectId, ropaId)}'>Criar DPIA a partir do tratamento</button>` : ''}</p>
            <p><strong>LIA</strong> (teste de legítimo interesse): ${lig.lia.exigida ? 'exigida pela base legal' : 'não exigida pela base legal'}${lig.lia.existe ? ` · ${escapeHTML(lig.lia.status === 'concluida' ? 'concluída' : 'em rascunho')}` : (lig.lia.exigida ? ' · ainda não feita' : '')}.${lig.lia.origem_mudou ? ` <span class="tl-origem">${ORIGEM_MUDOU}</span>` : ''}${lia ? ` <button class="btn btn-ghost btn-sm" data-action="baixarWordLia" data-args='${args(projectId, ropaId)}'>Baixar Word</button>` : ''}</p>
            ${editar ? formularioLia(lia, projectId, ropaId) : (lia ? `<p style="color:var(--text-dim)">${escapeHTML(lia.finalidade_legitima || '')}</p>` : '')}</div>`)}
        ${secao('Riscos', blocoRiscos(projectId, ropaId, riscos, lig.itens, partes, editar, dono))}
        ${secao('Ações', blocoAcoes(projectId, ropaId, acoes, riscos, partes, editar, dono))}
        ${secao('Base legal', `
            <p id="tl-base-atual">${lig.base_legal ? `${escapeHTML(lig.base_legal.referencia)} — ${escapeHTML(lig.base_legal.titulo)}` : 'Não definida'}</p>
            ${editar && bases.length ? `<div style="display:flex; gap:0.5rem; align-items:flex-end"><div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tl-base">Base legal do catálogo</label>
                <select class="form-input" id="tl-base"><option value="">— sem base do catálogo —</option>${bases.map((b) =>
                    `<option value="${escapeHTML(b.id)}" ${lig.base_legal && lig.base_legal.id === b.id ? 'selected' : ''}>${escapeHTML(b.referencia)} — ${escapeHTML(b.titulo)}</option>`).join('')}</select></div>
                <button class="btn btn-sm" data-action="salvarBaseLegalTratamento" data-args='${args(projectId, ropaId)}'>Salvar</button></div>`
                : (editar ? vazio('O catálogo da LGPD ainda não tem as bases legais carregadas; vale o texto livre do registro.') : '')}`)}
        ${podeRascunho() ? secao('Sugestão da IA', `<p style="color:var(--text-dim)">Base legal, retenção e DPIA sugeridas a partir da descrição do tratamento. Nada muda até você aplicar.</p>
            <button class="btn btn-sm" data-action="sugerirTratamento" data-args='${args(projectId, ropaId)}'>Sugerir</button>
            <div id="tl-sugestao" style="margin-top:0.75rem"></div>`) : ''}
        ${secao('Sistemas, bases e processos', editar
            ? `<div id="tl-itens">${marcados(itens, S.ligacoesTratamento.itens, (x) => `${escapeHTML(x.nome || x.name || '')}${x.tipo ? ` (${escapeHTML(TIPOS_ITEM[x.tipo] || x.tipo)})` : ''}`, 'item')}</div>
               <button class="btn btn-sm" style="margin-top:0.5rem" data-action="salvarItensTratamento" data-args='${args(projectId, ropaId)}'>Salvar itens</button>`
            : `<p id="tl-itens">${tabelaItens}</p>`)}
        ${secao('Departamentos', editar
            ? `<div id="tl-deptos">${marcados(deptos, S.ligacoesTratamento.departamentos, (x) => escapeHTML(x.nome), 'depto')}</div>
               <button class="btn btn-sm" style="margin-top:0.5rem" data-action="salvarDepartamentosTratamento" data-args='${args(projectId, ropaId)}'>Salvar departamentos</button>`
            : `<p id="tl-deptos">${tabelaDeptos}</p>`)}
        ${secao('Partes', `<div id="tl-partes">
            ${lista(lig.terceiros_com_avaliacao_vencida).length ? `<p id="tl-vencidos" style="color:var(--danger)">Avaliação vencida: ${lista(lig.terceiros_com_avaliacao_vencida).map((x) => escapeHTML(x.nome)).join(', ')}. Renove na tela Terceiros.</p>` : ''}
            ${lig.partes.length ? `<table class="data-table"><thead><tr><th>Parte</th><th>Papel</th><th></th></tr></thead><tbody>${lig.partes.map((p) =>
                `<tr><td>${escapeHTML(p.nome)}</td><td>${escapeHTML(PAPEIS_PARTE[p.papel] || p.papel)}</td><td style="text-align:right">${editar
                    ? `<button class="btn btn-ghost btn-sm" data-action="removerParteTratamento" data-args='${args(projectId, ropaId, p.parte_id, p.vinculo_id)}'>Remover</button>` : ''}</td></tr>`).join('')}</tbody></table>`
                : vazio('Nenhuma parte ligada.')}
            ${editar && partes.length ? `<div style="display:flex; gap:0.5rem; align-items:flex-end; margin-top:0.75rem; flex-wrap:wrap">
                <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tl-parte">Parte</label><select class="form-input" id="tl-parte">${partes.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join('')}</select></div>
                <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tl-papel">Papel</label><select class="form-input" id="tl-papel">${Object.entries(PAPEIS_PARTE).map(([v, r]) => `<option value="${v}">${r}</option>`).join('')}</select></div>
                <button class="btn btn-sm" data-action="adicionarParteTratamento" data-args='${args(projectId, ropaId)}'>Ligar parte</button></div>` : ''}</div>`)}
        ${secao('Transferências internacionais', `<div id="tl-transf">
            ${lig.transferencias.length ? `<table class="data-table"><thead><tr><th>País</th><th>Destinatário</th><th>Mecanismo</th><th></th></tr></thead><tbody>${lig.transferencias.map((t) =>
                `<tr><td>${escapeHTML(t.pais)}</td><td>${escapeHTML(t.destinatario || '—')}</td><td>${escapeHTML(t.mecanismo || '—')}</td><td style="text-align:right">${editar
                    ? `<button class="btn btn-ghost btn-sm" data-action="removerTransferenciaTratamento" data-args='${args(projectId, ropaId, t.id)}'>Remover</button>` : ''}</td></tr>`).join('')}</tbody></table>`
                : vazio('Nenhuma transferência registrada.')}
            ${editar ? `<div style="display:flex; gap:0.5rem; align-items:flex-end; margin-top:0.75rem; flex-wrap:wrap">
                <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tl-pais">País</label><input class="form-input" id="tl-pais" maxlength="100"></div>
                <div class="form-group" style="flex:1; margin:0"><label class="form-label" for="tl-dest">Destinatário</label><select class="form-input" id="tl-dest"><option value="">— não informado —</option>${partes.map((p) => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.nome)}</option>`).join('')}</select></div>
                <div class="form-group" style="flex:2; margin:0"><label class="form-label" for="tl-mec">Mecanismo</label><input class="form-input" id="tl-mec" maxlength="300"></div>
                <button class="btn btn-sm" data-action="adicionarTransferenciaTratamento" data-args='${args(projectId, ropaId)}'>Registrar</button></div>` : ''}</div>`)}
        ${secao('Diagrama', `<p style="color:var(--text-dim)">Gerado das ligações acima; muda quando elas mudam. Cole em qualquer visualizador de Mermaid.</p>
            <pre id="tl-diagrama" style="white-space:pre-wrap; max-height:240px; overflow:auto; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:0.75rem">${escapeHTML(diagrama)}</pre>
            ${diagrama ? '<button class="btn btn-ghost btn-sm" data-action="copiarDiagramaTratamento">Copiar diagrama</button>' : ''}`)}
    `, 'modal-large');
};

// ─── Riscos e ações: salvar (POST novo, PUT editado), editar (preenche o formulário), apagar com confirmação na linha ───
const notaOuNulo = (id) => (el(id).value ? Number(el(id).value) : null);
const preencher = (campo, v) => { el(campo).value = v === null || v === undefined ? '' : String(v); };

window.salvarRiscoAtividade = function (projectId, ropaId) {
    const threat = el('tl-rk-ameaca').value.trim();
    if (!threat) { showToast('Informe a ameaça', 'error'); return; }
    const corpo = {
        threat, vulnerability: el('tl-rk-vuln').value.trim() || null, asset_id: el('tl-rk-ativo').value || null,
        impact: Number(el('tl-rk-imp').value), probability: Number(el('tl-rk-prob').value), treatment: el('tl-rk-trat').value,
        treatment_plan: el('tl-rk-plano').value.trim() || null, residual_impact: notaOuNulo('tl-rk-rimp'), residual_probability: notaOuNulo('tl-rk-rprob'),
        owner_parte_id: el('tl-rk-resp').value || null, status: el('tl-rk-status').value,
    };
    const id = el('tl-rk-id').value;
    return acao(projectId, ropaId, () => (id
        ? api('PUT', `/api/v1/projects/${projectId}/ropa/${ropaId}/riscos/${id}`, corpo)
        : api('POST', `/api/v1/projects/${projectId}/ropa/${ropaId}/riscos`, corpo)), 'Não foi possível salvar o risco', 'Risco salvo.');
};

window.editarRiscoAtividade = function (id) {
    const k = (S.riscosAtividade || []).find((x) => x.id === id);
    if (!k) return;
    preencher('tl-rk-id', k.id); preencher('tl-rk-ameaca', k.threat); preencher('tl-rk-vuln', k.vulnerability); preencher('tl-rk-ativo', k.asset_id);
    preencher('tl-rk-imp', k.impact); preencher('tl-rk-prob', k.probability); preencher('tl-rk-trat', k.treatment); preencher('tl-rk-plano', k.treatment_plan);
    preencher('tl-rk-rimp', k.residual_impact); preencher('tl-rk-rprob', k.residual_probability); preencher('tl-rk-status', k.status); preencher('tl-rk-resp', k.owner_parte_id);
    el('tl-rk-titulo').textContent = 'Editar risco';
    el('tl-rk-ameaca').focus();
};

/** Apagar pede a confirmação na própria linha (o app não usa confirm()); a ação ligada ao risco continua, sem o vínculo. */
window.apagarRiscoAtividade = function (projectId, ropaId, id, confirmado) {
    if (confirmado) {
        return acao(projectId, ropaId, () => api('DELETE', `/api/v1/projects/${projectId}/ropa/${ropaId}/riscos/${id}`), 'Não foi possível apagar o risco', 'Risco apagado.');
    }
    const lugar = [...document.querySelectorAll('[data-apagar-risco]')].find((n) => n.getAttribute('data-apagar-risco') === id);
    if (lugar) lugar.innerHTML = `<button class="btn btn-sm" style="color:var(--danger)" data-action="apagarRiscoAtividade" data-args='${args(projectId, ropaId, id, true)}'>Confirmar exclusão</button>`;
};

window.salvarAcaoAtividade = function (projectId, ropaId) {
    const title = el('tl-ac-titulo').value.trim();
    if (!title) { showToast('Informe a ação', 'error'); return; }
    const corpo = {
        title, description: el('tl-ac-desc').value.trim() || null, due_date: el('tl-ac-prazo').value || null,
        assigned_to_parte_id: el('tl-ac-resp').value || null, risk_id: el('tl-ac-risco').value || null, status: el('tl-ac-status').value,
    };
    const id = el('tl-ac-id').value;
    return acao(projectId, ropaId, () => (id
        ? api('PUT', `/api/v1/projects/${projectId}/ropa/${ropaId}/acoes/${id}`, corpo)
        : api('POST', `/api/v1/projects/${projectId}/ropa/${ropaId}/acoes`, corpo)), 'Não foi possível salvar a ação', 'Ação salva.');
};

window.editarAcaoAtividade = function (id) {
    const x = (S.acoesAtividade || []).find((a) => a.id === id);
    if (!x) return;
    preencher('tl-ac-id', x.id); preencher('tl-ac-titulo', x.title); preencher('tl-ac-desc', x.description);
    preencher('tl-ac-prazo', x.due_date ? String(x.due_date).slice(0, 10) : ''); preencher('tl-ac-status', x.status);
    preencher('tl-ac-resp', x.assigned_to_parte_id); preencher('tl-ac-risco', x.risk_id);
    el('tl-ac-titulo-form').textContent = 'Editar ação';
    el('tl-ac-titulo').focus();
};

window.concluirAcaoAtividade = (projectId, ropaId, id) => acao(projectId, ropaId,
    () => api('PUT', `/api/v1/projects/${projectId}/ropa/${ropaId}/acoes/${id}`, { status: 'Closed' }), 'Não foi possível concluir a ação', 'Ação concluída.');

window.apagarAcaoAtividade = function (projectId, ropaId, id, confirmado) {
    if (confirmado) {
        return acao(projectId, ropaId, () => api('DELETE', `/api/v1/projects/${projectId}/ropa/${ropaId}/acoes/${id}`), 'Não foi possível apagar a ação', 'Ação apagada.');
    }
    const lugar = [...document.querySelectorAll('[data-apagar-acao]')].find((n) => n.getAttribute('data-apagar-acao') === id);
    if (lugar) lugar.innerHTML = `<button class="btn btn-sm" style="color:var(--danger)" data-action="apagarAcaoAtividade" data-args='${args(projectId, ropaId, id, true)}'>Confirmar exclusão</button>`;
};

const marcadosDe = (tipo) => [...document.querySelectorAll(`input[data-tl="${tipo}"]:checked`)].map((i) => i.value);

window.pedirAprovacaoTratamento = (projectId, ropaId) => window.abrirPedidoAprovacao(projectId, 'tratamento', ropaId);

window.criarDpiaDoTratamento = (projectId, ropaId) => acao(projectId, ropaId,
    () => api('POST', `/api/v1/projects/${projectId}/ropa/${ropaId}/dpia`), 'Não foi possível criar a DPIA', 'DPIA criada. Complete-a na tela de DPIA.');

// Word da LIA (F4), pelo caminho autenticado de api.js.
window.baixarWordLia = (projectId, ropaId) => baixarArquivo(`/api/v1/projects/${projectId}/ropa/${ropaId}/lia/docx`)
    .catch((e) => showToast(e.message || 'Não foi possível baixar o Word', 'error'));

window.salvarLiaTratamento = (projectId, ropaId, concluir) => acao(projectId, ropaId, () => api('PUT', `/api/v1/projects/${projectId}/ropa/${ropaId}/lia`, {
    finalidade_legitima: el('tl-lia-fin').value.trim() || null, necessidade: el('tl-lia-nec').value.trim() || null,
    balanceamento: el('tl-lia-bal').value.trim() || null, salvaguardas: el('tl-lia-sal').value.trim() || null,
    conclusao: el('tl-lia-con').value || null, status: concluir ? 'concluida' : 'rascunho',
}), 'Não foi possível salvar a LIA', concluir ? 'LIA concluída.' : 'LIA salva.');

window.reabrirLiaTratamento = (projectId, ropaId) => acao(projectId, ropaId,
    () => api('PUT', `/api/v1/projects/${projectId}/ropa/${ropaId}/lia`, { status: 'rascunho' }), 'Não foi possível reabrir a LIA', 'LIA reaberta.');

window.salvarItensTratamento = (projectId, ropaId) => acao(projectId, ropaId,
    () => api('PUT', `/api/v1/projects/${projectId}/ropa/${ropaId}/itens`, { itens: marcadosDe('item') }), 'Não foi possível salvar os itens', 'Itens salvos.');

window.salvarDepartamentosTratamento = (projectId, ropaId) => acao(projectId, ropaId,
    () => api('PUT', `/api/v1/projects/${projectId}/ropa/${ropaId}/departamentos`, { departamentos: marcadosDe('depto') }), 'Não foi possível salvar os departamentos', 'Departamentos salvos.');

// O catálogo manda: o texto de `legal_basis` (que a LIA, o PDF e os pedidos leem) sai do id escolhido. "Sem base do catálogo" só
// desliga o id: o texto gravado (às vezes texto livre importado, sem id) não se perde por um Salvar sem escolha.
const baseCoerente = (id) => (id ? { base_legal_id: id, ...(textoDaBase(id) ? { legal_basis: textoDaBase(id) } : {}) } : { base_legal_id: null });

window.salvarBaseLegalTratamento = (projectId, ropaId) => {
    const registro = (S.ropa || []).find((r) => r.id === ropaId) || {};
    return acao(projectId, ropaId,
        () => api('PUT', `/api/v1/ropa/${ropaId}`, { processing_purpose: registro.processing_purpose, ...baseCoerente(el('tl-base').value) }),
        'Não foi possível salvar a base legal', 'Base legal salva.');
};

// Sugestão de IA: o servidor só devolve a proposta (esquema estrito). Aplicar é o PUT do registro, com o que a pessoa deixou nos campos.
window.sugerirTratamento = async function (projectId, ropaId) {
    let r;
    try { r = await api('POST', `/api/v1/projects/${projectId}/ropa/${ropaId}/sugestao`); } catch (e) { falha(e, 'Não foi possível gerar a sugestão'); return; }
    const s = r.sugestao;
    const opcoesBase = basesAbertas.some((b) => b.id === s.base_legal) ? basesAbertas : [...basesAbertas, { id: s.base_legal, referencia: s.base_legal, titulo: '' }];
    el('tl-sugestao').innerHTML = `<p><strong>${escapeHTML(AVISO_IA)}</strong></p>
        <div class="form-group"><label class="form-label" for="tl-sug-base">Base legal</label><select class="form-input" id="tl-sug-base">${opcoesBase.map((b) =>
            `<option value="${escapeHTML(b.id)}" ${b.id === s.base_legal ? 'selected' : ''}>${escapeHTML(b.referencia)}${b.titulo ? ` — ${escapeHTML(b.titulo)}` : ''}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label" for="tl-sug-ret">Retenção</label><input class="form-input" id="tl-sug-ret" maxlength="500" value="${escapeHTML(s.retencao)}"></div>
        <label style="display:flex; gap:0.4rem; align-items:center"><input type="checkbox" id="tl-sug-dpia" ${s.dpia_requerido ? 'checked' : ''}> DPIA requerida</label>
        <p id="tl-sug-just" style="color:var(--text-dim); white-space:pre-wrap">${escapeHTML(s.justificativa)}</p>
        <button class="btn btn-primary btn-sm" data-action="aplicarSugestaoTratamento" data-args='${args(projectId, ropaId)}'>Aplicar</button>`;
};

window.aplicarSugestaoTratamento = (projectId, ropaId) => {
    const registro = (S.ropa || []).find((r) => r.id === ropaId) || {};
    return acao(projectId, ropaId, () => api('PUT', `/api/v1/ropa/${ropaId}`, {
        processing_purpose: registro.processing_purpose, ...baseCoerente(el('tl-sug-base').value),
        retention_period: el('tl-sug-ret').value.trim() || null, dpia_required: el('tl-sug-dpia').checked,
    }), 'Não foi possível aplicar a sugestão', 'Sugestão aplicada ao registro.');
};

window.adicionarParteTratamento = (projectId, ropaId) => acao(projectId, ropaId,
    () => api('POST', `/api/v1/projects/${projectId}/partes/${el('tl-parte').value}/vinculos`, { papel: el('tl-papel').value, alvo_tipo: 'tratamento', alvo_id: ropaId }),
    'Não foi possível ligar a parte', 'Parte ligada.');

window.removerParteTratamento = (projectId, ropaId, parteId, vinculoId) => acao(projectId, ropaId,
    () => api('DELETE', `/api/v1/projects/${projectId}/partes/${parteId}/vinculos/${vinculoId}`), 'Não foi possível remover a parte', 'Parte removida.');

window.adicionarTransferenciaTratamento = function (projectId, ropaId) {
    const pais = el('tl-pais').value.trim();
    if (!pais) { showToast('Informe o país', 'error'); return; }
    return acao(projectId, ropaId, () => api('POST', `/api/v1/projects/${projectId}/ropa/${ropaId}/transferencias`, {
        pais, destinatario_parte_id: el('tl-dest').value || null, mecanismo: el('tl-mec').value.trim() || null,
    }), 'Não foi possível registrar a transferência', 'Transferência registrada.');
};

window.removerTransferenciaTratamento = (projectId, ropaId, id) => acao(projectId, ropaId,
    () => api('DELETE', `/api/v1/projects/${projectId}/ropa/${ropaId}/transferencias/${id}`), 'Não foi possível remover a transferência', 'Transferência removida.');

window.copiarDiagramaTratamento = async function () {
    const texto = el('tl-diagrama').textContent;
    try { await navigator.clipboard.writeText(texto); showToast('Diagrama copiado.', 'success'); }
    catch (e) {
        const faixa = document.createRange(); faixa.selectNodeContents(el('tl-diagrama'));
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(faixa);
        showToast('Selecionado: use Ctrl+C para copiar.', 'info');
    }
};


// ─── Importação por planilha (fatia 4.4) ─────────────────────────────────────────────────────────────

const MODELO_CSV = 'finalidade;categorias de dados;titulares;base legal;retencao;destinatarios;transferencia internacional;salvaguardas;dpia requerido;responsavel\n'
    + 'Folha de pagamento;Dados financeiros;Colaboradores;Obrigação legal;5 anos;Contabilidade;nao;;nao;DPO\n';

window.openImportarRopaModal = function (projectId) {
    openModal(`
        <h3>Importar RoPA por planilha</h3>
        <p style="color:var(--text-dim)">Arquivo CSV com cabeçalho. Só a coluna <strong>finalidade</strong> é obrigatória. Os registros entram como rascunho; o que já existe (mesma finalidade) é pulado, então repetir a importação não duplica.</p>
        <div class="form-group"><label class="form-label" for="ri-arquivo">Arquivo CSV</label><input class="form-input" id="ri-arquivo" type="file" accept=".csv,text/csv"></div>
        <div style="display:flex; gap:0.5rem">
            <button class="btn btn-primary btn-sm" data-action="enviarImportacaoRopa" data-args='${args(projectId)}'>Importar</button>
            <button class="btn btn-ghost btn-sm" data-action="baixarModeloRopa">Baixar modelo</button>
        </div>
        <div id="ri-relatorio" style="margin-top:1rem"></div>
    `);
};

window.baixarModeloRopa = function () {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + MODELO_CSV], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'modelo-ropa.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

window.enviarImportacaoRopa = async function (projectId) {
    const arq = el('ri-arquivo').files && el('ri-arquivo').files[0];
    if (!arq) { showToast('Escolha o arquivo CSV', 'error'); return; }
    let r;
    try { r = await api('POST', `/api/v1/projects/${projectId}/ropa/importar`, { csv: await arq.text() }); } catch (e) { falha(e, 'Não foi possível importar a planilha'); return; }
    const recusadas = lista(r.recusadas);
    el('ri-relatorio').innerHTML = `<p><strong>${escapeHTML(String(r.criados))}</strong> criados, <strong>${escapeHTML(String(r.ja_existiam))}</strong> já existiam, <strong>${escapeHTML(String(recusadas.length))}</strong> recusadas.</p>`
        + (recusadas.length ? `<table class="data-table"><thead><tr><th>Linha</th><th>Motivo</th></tr></thead><tbody>${recusadas.map((x) => `<tr><td>${escapeHTML(String(x.linha))}</td><td>${escapeHTML(x.motivo)}</td></tr>`).join('')}</tbody></table>` : '');
    if (r.criados) window.render();
};
