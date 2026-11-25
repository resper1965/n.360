import { escapeHTML, formatarData, openModal, forceCloseModal } from './ui.js';
import { rotuloDe } from './rotulos.js';

// Aceite do risco residual (ISO/IEC 27001, 6.1.3 e; migration 0120). O servidor manda, em cada risco, o bloco `aceite`: a situação
// (aceito, pendente, revogado), quem e quando, a alçada do nível residual, o hash do estado que se aceitaria agora e se ESTA pessoa
// pode aceitar ou revogar. A tela só mostra o que o servidor permite; quem decide de novo é a rota (alçada, senha, um risco por vez).

const PAPEL = { ceo: 'Direção (CEO)', ciso: 'Liderança do SGSI' };
export const SITUACOES_ACEITE = [['aceito', 'Aceito'], ['pendente', 'Aceite pendente'], ['revogado', 'Aceite revogado']];
const quando = (s) => formatarData(s, { hora: true, vazio: 'data desconhecida' });
const el = (id) => document.getElementById(id);

export const podeAceitar = (r) => !!r?.aceite?.pode_aceitar;
export const podeRevogar = (r) => !!r?.aceite?.pode_revogar;
/** No lugar do botão de aceite: o servidor manda `motivo_nao_aceita` só quando falta o residual (a qualquer pessoa). */
export const avisoSemResidual = (r) => (r?.aceite?.motivo_nao_aceita && r.aceite.situacao !== 'aceito'
    ? '<span class="t-sm t-dim">Defina o risco residual (impacto e probabilidade residuais) antes do aceite.</span>' : '');
/** Pedir o aceite a quem tem a alçada: só quem pede (a consultoria, o administrador do cliente) e com o residual avaliado. */
export const podePedirAceite = (r, user) => !!r?.aceite && r.aceite.situacao !== 'aceito' && !!r.aceite.alcada
    && !['Closed', 'Accepted'].includes(r.status) && typeof window.podePedirAprovacao === 'function' && window.podePedirAprovacao(user);

/** Uma linha, HTML escapado: "Aceito por X em ...", "Aceite revogado ..." ou vazio quando pendente. */
export function linhaDeAceite(r) {
    const a = r?.aceite;
    if (a?.situacao === 'aceito') {
        if (r.aceite_manual) return `Aceite registrado à mão: ${escapeHTML(a.por || '')} em ${quando(a.em)}`;
        return `Aceito por ${escapeHTML(a.por || '')} em ${quando(a.em)}${a.com_senha ? '' : ' (registro anterior, sem senha)'}`;
    }
    if (a?.situacao === 'revogado' && a.revogado) return `Aceite revogado por ${escapeHTML(a.revogado.por || '')} em ${quando(a.revogado.em)}`;
    return '';
}

/** O texto da coluna "Aceite" da lista: quem e quando, ou a situação. */
export const colunaDeAceite = (r) => linhaDeAceite(r) || '<span class="t-dim">Aceite pendente</span>';

// Tudo o que entra no hash do aceite aparece na janela antes da senha (COLUNAS_RISCO em src/services/pedidos.ts).
const campo = (rotulo, valor) => `<div><dt class="rotulo-campo">${escapeHTML(rotulo)}</dt><dd>${escapeHTML(String(valor))}</dd></div>`;

// Guarda do modal aberto: o caminho do risco e o que fazer depois (recarregar a tela de quem chamou).
let ABERTO = null;

/** Abre o aceite: o estado que se aceita, a justificativa opcional e a senha. `caminho` é o do risco (`/api/v1/risks/:id` ou a sub-rota da atividade). */
export function aceitarRisco(api, caminho, r, aoConcluir) {
    ABERTO = { api, caminho, hash: r.aceite?.hash, aoConcluir };
    openModal(`
        <div class="modal-header"><span class="modal-title">Aceitar risco residual</span></div>
        <form id="ar-form" data-action-submit="confirmarAceiteRisco" data-prevent novalidate>
            <p class="mb-3">${escapeHTML(r.threat || '')} (${escapeHTML(r.asset || '')})</p>
            <dl class="grid-2 gap-2 mb-3" id="ar-estado">
                ${campo('Nível do risco', `${rotuloDe('', r.risk_level) || '—'} (impacto ${r.impact ?? '—'}, probabilidade ${r.probability ?? '—'})`)}
                ${campo('Nível residual', `${rotuloDe('', r.residual_level) || '—'} (impacto ${r.residual_impact ?? '—'}, probabilidade ${r.residual_probability ?? '—'})`)}
                ${campo('Estratégia de tratamento', rotuloDe('', r.treatment) || '—')}
                ${campo('Controle vinculado', r.control_title || r.control_id || 'Nenhum')}
                ${campo('Plano de tratamento', r.treatment_plan || '—')}
                ${campo('Alçada', PAPEL[r.aceite?.alcada] || '—')}
            </dl>
            <p class="t-dim mb-3">O aceite fica registrado em seu nome, com data e hora, e congela este estado. Se o nível residual, a estratégia ou o controle mudarem, o aceite cai e o risco volta a aceite pendente.</p>
            <div class="form-group">
                <label class="form-label" for="ar-just">Justificativa (opcional)</label>
                <textarea class="form-input" id="ar-just" rows="3" maxlength="2000"></textarea>
            </div>
            <div class="form-group">
                <label class="form-label" for="ar-senha">Sua senha, para registrar o aceite</label>
                <input class="form-input" id="ar-senha" type="password" autocomplete="current-password">
            </div>
            <p class="login-error" id="ar-erro" role="alert" aria-live="polite"></p>
            <div class="acoes-rodape">
                <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Cancelar</button>
                <button type="submit" class="btn btn-primary">Aceitar o risco residual</button>
            </div>
        </form>`);
    el('ar-senha')?.focus();
}

window.confirmarAceiteRisco = async function () {
    const senha = el('ar-senha').value;
    const erro = el('ar-erro');
    erro.textContent = '';
    if (!senha) { erro.textContent = 'Informe a sua senha'; el('ar-senha').focus(); return; }
    const { api, caminho, hash, aoConcluir } = ABERTO || {};
    try {
        await api('POST', `${caminho}/aceite`, { senha, hash_visto: hash, justificativa: el('ar-just').value.trim() || null });
    } catch (e) { erro.textContent = e.message; return; }
    forceCloseModal();
    if (typeof aoConcluir === 'function') await aoConcluir('Risco residual aceito.');
};

/** Revogar o próprio aceite: o motivo é obrigatório. */
export function revogarAceiteRisco(api, caminho, aoConcluir) {
    ABERTO = { api, caminho, aoConcluir };
    openModal(`
        <div class="modal-header"><span class="modal-title">Revogar o aceite</span></div>
        <form id="rv-form" data-action-submit="confirmarRevogarAceite" data-prevent novalidate>
            <p class="t-dim mb-3">O risco volta a aceite pendente. O aceite revogado continua no histórico, com o motivo.</p>
            <div class="form-group">
                <label class="form-label" for="rv-motivo">Motivo</label>
                <textarea class="form-input" id="rv-motivo" rows="3" maxlength="2000" required aria-required="true"></textarea>
            </div>
            <div class="form-group">
                <label class="form-label" for="rv-senha">Sua senha, para registrar a revogação</label>
                <input class="form-input" id="rv-senha" type="password" autocomplete="current-password">
            </div>
            <p class="login-error" id="rv-erro" role="alert" aria-live="polite"></p>
            <div class="acoes-rodape">
                <button type="button" class="btn btn-secondary" data-action="forceCloseModal">Cancelar</button>
                <button type="submit" class="btn btn-primary">Revogar</button>
            </div>
        </form>`);
    el('rv-motivo')?.focus();
}

window.confirmarRevogarAceite = async function () {
    const motivo = el('rv-motivo').value.trim();
    const erro = el('rv-erro');
    erro.textContent = '';
    if (motivo.length < 5) { erro.textContent = 'Informe o motivo da revogação'; el('rv-motivo').focus(); return; }
    const senha = el('rv-senha').value;
    if (!senha) { erro.textContent = 'Informe a sua senha'; el('rv-senha').focus(); return; }
    const { api, caminho, aoConcluir } = ABERTO || {};
    try { await api('POST', `${caminho}/aceite/revogar`, { motivo, senha }); } catch (e) { erro.textContent = e.message; return; }
    forceCloseModal();
    if (typeof aoConcluir === 'function') await aoConcluir('Aceite revogado.');
};

/** Pede o aceite em "Minhas aprovações", com o papel da alçada do nível residual (o servidor confere de novo). */
export function pedirAceiteRisco(projectId, r) {
    return window.abrirPedidoAprovacao(projectId, 'risco', r.id, r.aceite?.alcada);
}
