import { ABAS } from './contrato.js';
import { escapeHTML } from '../ui.js';

const ESTADO = { feito: 'feito', pendente: 'pendente', na: 'não se aplica', vazio: 'vazio' };
// Logs ROPA é histórico, nunca uma parte a concluir: fica sem número e sem estado de feito/pendente.
const PARTES = ABAS.filter((a) => a.id !== 'logs');
const numeroDa = (id) => PARTES.findIndex((a) => a.id === id) + 1;
// Gaps e Riscos são sugestão, não pendência (como no guiado): mostram o estado na barra, mas ficam fora da conta e do "Próximo".
const CONTAM = PARTES.filter((a) => a.id !== 'gaps' && a.id !== 'riscos');

/**
 * Onde a atividade está: quantas das 6 partes (sem Gaps e Riscos) estão concluídas e qual é a próxima (a primeira pendente ou vazia, na ordem).
 * "Não se aplica" conta como concluída: a parte foi resolvida e nunca vira "feito".
 */
export function progressoDaFicha(ficha) {
    const est = (id) => ((ficha.abas || {})[id] || { estado: 'vazio' }).estado;
    const feitas = CONTAM.filter((a) => est(a.id) === 'feito' || est(a.id) === 'na').length;
    const proxima = CONTAM.find((a) => est(a.id) === 'pendente' || est(a.id) === 'vazio') || null;
    return { feitas, total: CONTAM.length, proxima };
}

/** A linha de progresso acima das abas. O botão é secundário: a ficha não tem ação principal. */
export function desenharProgresso(ficha) {
    const { feitas, total, proxima } = progressoDaFicha(ficha);
    if (!proxima) {
        return `<div class="at-progresso"><p class="at-progresso-texto"><strong>Todas as ${total} partes concluídas</strong>
            <span class="at-progresso-sep" aria-hidden="true">·</span> Próximo: enviar para aprovação no menu Ações</p></div>`;
    }
    return `<div class="at-progresso"><p class="at-progresso-texto"><strong>${feitas} de ${total} partes concluídas</strong>
            <span class="at-progresso-sep" aria-hidden="true">·</span> Próximo: ${escapeHTML(proxima.rotulo)}</p>
        <button type="button" class="btn btn-sm" data-action="atIrParaPendencia" data-aba="${proxima.id}">Ir para a próxima pendência</button></div>`;
}

/**
 * A faixa de abas (WAI-ARIA tabs, ativação automática). O estado vai ESCRITO no rótulo e no `aria-label`, nunca só em cor.
 * Clique e teclado passam pela delegação; o id da aba vai em `data-aba` (a delegação chama a função com `this` = o botão).
 */
export function desenharAbas(ficha, ativa) {
    return `<div class="at-abas" role="tablist" aria-label="Abas da atividade">${ABAS.map((a) => {
        const est = a.id === 'logs' ? { estado: 'historico', resumo: (ficha.abas[a.id] || {}).resumo } : (ficha.abas[a.id] || { estado: 'vazio', resumo: '' });
        const texto = a.id === 'logs' ? 'histórico' : (ESTADO[est.estado] || est.estado);
        const n = numeroDa(a.id);
        const nome = n ? `${n}. ${a.rotulo}` : a.rotulo;
        return `<button type="button" role="tab" class="at-aba" id="at-aba-${a.id}" aria-controls="at-painel" aria-selected="${a.id === ativa}" tabindex="${a.id === ativa ? 0 : -1}"
            aria-label="${escapeHTML(`${nome}, ${texto}`)}" data-aba="${a.id}" data-estado="${escapeHTML(est.estado)}" title="${escapeHTML(est.resumo || '')}"
            data-action="atIrParaAba" data-action-keydown="atTeclaAba" data-arg-event>
            <span class="at-aba-nome">${n ? `<span class="at-aba-n">${n}.</span> ` : ''}${escapeHTML(a.rotulo)}</span><span class="at-aba-estado">${escapeHTML(texto)}</span></button>`;
    }).join('')}</div>`;
}

/** Próxima aba para a tecla (setas, Home, End); null se a tecla não é de navegação. A seta passa da última para a primeira. */
export function abaParaTecla(ativa, tecla) {
    const i = ABAS.findIndex((a) => a.id === ativa);
    const n = ABAS.length;
    if (tecla === 'ArrowRight') return ABAS[(i + 1) % n].id;
    if (tecla === 'ArrowLeft') return ABAS[(i + n - 1) % n].id;
    if (tecla === 'Home') return ABAS[0].id;
    if (tecla === 'End') return ABAS[n - 1].id;
    return null;
}
