import { S } from './state.js';
import { api } from './api.js';
import { produtoAtual, temProduto } from './produto.js';

// Selos do menu do n.privacy (Painel, Pedidos do titular, Terceiros, Incidentes). Os números vêm da visão do encarregado
// (`GET /projects/:id/encarregado`, já calculados no servidor); aqui só se mostram. Carregam depois do menu, sem bloquear
// tela, e o menu não quebra por causa de um contador. Falha não apaga o selo em silêncio (sem selo leria "nada a tratar"):
// as filas mostram "?" com o motivo para leitor de tela e no title.
const TEXTO_FALHA = 'Não foi possível conferir os prazos agora. Abra a tela para ver a lista.';
// O NÚMERO é o total a tratar; a FORMA diz se algo atrasou: contorno âmbar é pendente, fundo vermelho (`is-danger`) é atraso.
// O Painel só tem selo com atraso, e o número dele é a soma dos atrasados das filas.

const plural = (q, um, varios) => `${q} ${q === 1 ? um : varios}`;
const inteiro = (v) => (Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);
// [id do selo, quantos, quantos atrasados, texto para leitor de tela (q, atrasados)]
const SELOS = (v) => {
    const pt = v.pedidos_titular || {}, inc = v.incidentes || {}, te = v.terceiros || {};
    const fila = [
        ['selo-titular', pt.exigem_atencao, inteiro(pt.atrasados),
            (q, r) => `${plural(q, 'pedido vencido ou a vencer', 'pedidos vencidos ou a vencer')} em 7 dias${r ? `, ${plural(r, 'atrasado', 'atrasados')}` : ''}`],
        ['selo-terceiros', te.com_pendencia, inteiro(te.vencidos) + inteiro(te.reprovados),
            (q, r) => `${plural(q, 'terceiro sem avaliação, vencida ou reprovada', 'terceiros sem avaliação, vencida ou reprovada')}${r ? `, ${r} com avaliação vencida ou reprovada` : ''}`],
        ['selo-incidentes', inc.comunicacoes_pendentes, inteiro(inc.comunicacoes_atrasadas),
            (q, r) => `${plural(q, 'comunicação de incidente pendente', 'comunicações de incidente pendentes')}${r ? `, ${plural(r, 'atrasada', 'atrasadas')}` : ''}`],
    ];
    const atrasados = fila.reduce((s, [, , r]) => s + r, 0);
    return [['selo-painel', atrasados, atrasados, (q) => plural(q, 'item atrasado', 'itens atrasados')], ...fila];
};

function mostrar(doc, id, quantos, atrasados, texto) {
    const el = doc.getElementById(id);
    if (!el) return;
    const q = inteiro(quantos);
    el.classList.remove('is-falha');
    el.removeAttribute('title');
    if (q <= 0) { el.hidden = true; el.textContent = ''; el.removeAttribute('aria-label'); return; }
    el.textContent = q > 99 ? '99+' : String(q);
    el.setAttribute('aria-label', texto(q, atrasados));
    el.classList.toggle('is-danger', atrasados > 0);
    el.hidden = false;
}

function falhou(doc, id) {
    const el = doc.getElementById(id);
    if (!el) return;
    el.textContent = '?';
    el.setAttribute('aria-label', TEXTO_FALHA);
    el.title = TEXTO_FALHA;
    el.classList.remove('is-danger');
    el.classList.add('is-falha');
    el.hidden = false;
}

let rodada = 0;
let feito = null; // projeto e pessoa dos selos já carregados: o menu redesenha a cada tela, a chamada não
const chaveAtual = () => (S.activeProject && S.user ? `${S.activeProject.id}|${S.user.id || S.user.email || S.user.role}` : null);

/**
 * Os selos com os números que o painel de entrada já trouxe (`selos` de `GET /projects/:id/painel`): no Painel do n.privacy a
 * visão do encarregado chega junto, sem a segunda chamada.
 */
export function aplicarSelos(v, doc = document) {
    if (produtoAtual() !== 'privacy' || !v || typeof v !== 'object') return;
    rodada += 1;
    feito = chaveAtual();
    SELOS(v).forEach(([id, q, atrasados, texto]) => mostrar(doc, id, q, atrasados, texto));
}
/** `forcar` recarrega mesmo para o mesmo projeto (ao voltar ao painel do Encarregado). */
export async function atualizarSelos(doc = document, forcar = false) {
    const p = S.activeProject;
    const chave = chaveAtual();
    if (!forcar && chave && chave === feito) return;
    // No Painel, os números chegam com o painel (aplicarSelos): nada de segunda chamada. No boot o menu desenha antes de a tela
    // ser escolhida, então a decisão espera a volta do laço de eventos.
    if (!forcar) {
        await new Promise((r) => setTimeout(r, 0));
        if (S.view === 'encarregado') return;
    }
    const eu = ++rodada;
    feito = null;
    const limpar = () => SELOS({}).forEach(([id]) => mostrar(doc, id, 0, 0, () => ''));
    // Só no n.privacy, com projeto que tem o módulo e papel que chega à visão (stakeholder e comercial não chegam).
    if (produtoAtual() !== 'privacy' || !p || !temProduto(p) || !S.user || ['stakeholder', 'comercial'].includes(S.user.role)) { limpar(); return; }
    let v;
    try { v = await api('GET', `/api/v1/projects/${p.id}/encarregado`); } catch (e) {
        if (eu !== rodada) return;
        limpar();
        SELOS({}).slice(1).forEach(([id]) => falhou(doc, id));
        return;
    }
    if (eu !== rodada || !v || typeof v !== 'object') return;
    feito = chave;
    SELOS(v).forEach(([id, q, atrasados, texto]) => mostrar(doc, id, q, atrasados, texto));
}
