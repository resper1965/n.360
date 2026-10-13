import { S } from './state.js';
import { api } from './api.js';
import { produtoAtual, temProduto } from './produto.js';

// Selos de vencimento do menu do n.privacy (DSAR, Terceiros, Incidentes). Os números vêm da visão do encarregado
// (`GET /projects/:id/encarregado`, já calculados no servidor); aqui só se mostram. Carregam depois do menu, sem bloquear
// tela, e qualquer falha deixa o item sem selo: o menu não pode quebrar por causa de um contador.

const plural = (q, um, varios) => `${q} ${q === 1 ? um : varios}`;
// [id do selo, quantos, em atraso (tom de perigo), texto para leitor de tela]
const SELOS = (v) => {
    const pt = v.pedidos_titular || {}, inc = v.incidentes || {}, te = v.terceiros || {};
    return [
        ['selo-titular', pt.exigem_atencao, pt.atrasados, (q) => `${plural(q, 'pedido vencido ou a vencer', 'pedidos vencidos ou a vencer')} em 7 dias`],
        ['selo-terceiros', te.com_pendencia, (te.vencidos || 0) + (te.reprovados || 0), (q) => plural(q, 'terceiro sem avaliação, vencida ou reprovada', 'terceiros sem avaliação, vencida ou reprovada')],
        ['selo-incidentes', inc.comunicacoes_pendentes, inc.comunicacoes_atrasadas, (q) => plural(q, 'comunicação de incidente pendente', 'comunicações de incidente pendentes')],
    ];
};

function mostrar(doc, id, quantos, ruim, texto) {
    const el = doc.getElementById(id);
    if (!el) return;
    const q = Number.isFinite(quantos) ? Math.trunc(quantos) : 0;
    if (q <= 0) { el.hidden = true; el.textContent = ''; el.removeAttribute('aria-label'); return; }
    el.textContent = q > 99 ? '99+' : String(q);
    el.setAttribute('aria-label', texto(q));
    el.classList.toggle('is-danger', ruim > 0);
    el.hidden = false;
}

let rodada = 0;
let feito = null; // projeto e pessoa dos selos já carregados: o menu redesenha a cada tela, a chamada não
/** `forcar` recarrega mesmo para o mesmo projeto (ao voltar ao painel do Encarregado). */
export async function atualizarSelos(doc = document, forcar = false) {
    const p = S.activeProject;
    const chave = p && S.user ? `${p.id}|${S.user.id || S.user.email || S.user.role}` : null;
    if (!forcar && chave && chave === feito) return;
    const eu = ++rodada;
    feito = null;
    const limpar = () => SELOS({}).forEach(([id]) => mostrar(doc, id, 0, 0, () => ''));
    // Só no n.privacy, com projeto que tem o módulo e papel que chega à visão (stakeholder e comercial não chegam).
    if (produtoAtual() !== 'privacy' || !p || !temProduto(p) || !S.user || ['stakeholder', 'comercial'].includes(S.user.role)) { limpar(); return; }
    let v;
    try { v = await api('GET', `/api/v1/projects/${p.id}/encarregado`); } catch (e) { if (eu === rodada) limpar(); return; }
    if (eu !== rodada || !v || typeof v !== 'object') return;
    feito = chave;
    SELOS(v).forEach(([id, q, ruim, texto]) => mostrar(doc, id, q, ruim, texto));
}
