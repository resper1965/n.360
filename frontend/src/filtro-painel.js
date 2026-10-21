import { S } from './state.js';
import { escapeHTML } from './ui.js';
import { hojeSP, emDiasSP } from './hoje.js';

// Filtro por situação com que o painel abre uma lista de destino ("O que fazer" > botão). O estado é só uma chave desta lista
// fechada, em memória (`S.filtroPainel`, gravado pelo `navigate` e apagado na navegação seguinte); do n.360 para um módulo vai
// pelo sessionStorage (produto.js), nunca pelo endereço. Nada de dado: a chave diz "atrasados", não quem nem o quê.

const dia = (v) => String(v || '').slice(0, 10);
/** Hoje em São Paulo: o mesmo dia do servidor. */
const hoje = () => hojeSP();
const emDias = (n) => emDiasSP(n);
const PEDIDO_ABERTO = ['recebido', 'em_andamento'];
const vencida = (d) => !!d && dia(d) < hoje();

/** `tela:aba:filtro` -> [rótulo do chip, quem fica na lista]. As mesmas regras da visão do encarregado e do painel (servidor). */
export const FILTROS = {
    'titular:pedidos:atrasados': ['atrasados', (p) => p.situacao_prazo === 'atrasado'],
    'titular:pedidos:vencem_7_dias': ['vencem em até 7 dias', (p) => PEDIDO_ABERTO.includes(p.status) && !!p.prazo_em && dia(p.prazo_em) >= hoje() && dia(p.prazo_em) <= emDias(7)],
    'titular:incidentes:comunicacao_atrasada': ['comunicação atrasada',
        (i) => i.status !== 'encerrado' && i.risco_titular !== 'sem_risco' && (i.situacao_anpd === 'atrasado' || i.situacao_titular === 'atrasado')],
    'titular:incidentes:sem_avaliacao': ['sem avaliação de risco', (i) => i.status !== 'encerrado' && !i.risco_titular],
    'terceiros::vencidos': ['avaliação vencida', (t) => t.situacao === 'vencida'],
    'terceiros::pendentes': ['nunca avaliados', (t) => !!t.terceiro_tipo && t.situacao === 'pendente'],
    'vendors::vencidos': ['avaliação vencida', (v) => v.situacao === 'vencida'],
    'evidence::vencidas': ['vencidas', (e) => vencida(e.valido_ate)],
    'evidence::vencidas_ou_nao_conformes': ['vencidas ou não conformes', (e) => vencida(e.valido_ate) || e.evaluation_status === 'non_conforming'],
    'capa::vencidas': ['vencidas', (a) => a.status !== 'Closed' && vencida(a.due_date)],
};

const chave = (tela, aba, filtro) => `${tela}:${aba || ''}:${filtro}`;

/** O pedido de filtro, se a chave existe; senão null (filtro desconhecido não filtra nada). */
export function filtroValido(tela, aba, filtro) {
    return typeof tela === 'string' && typeof filtro === 'string' && FILTROS[chave(tela, aba, filtro)] ? { tela, aba: aba || null, filtro } : null;
}

/**
 * A lista da tela com o filtro do painel aplicado e o chip que o mostra. Sem filtro para esta tela (e aba), a lista inteira e
 * chip vazio. `filtrado` serve ao texto da lista vazia.
 */
export function filtrarDoPainel(tela, aba, lista) {
    const f = S.filtroPainel;
    const regra = f && f.tela === tela && (f.aba || null) === (aba || null) ? FILTROS[chave(tela, aba, f.filtro)] : null;
    if (!regra) return { itens: lista, chip: '', filtrado: false };
    const [rotulo, fica] = regra;
    const chip = `<div class="filtro-painel" role="status"><span>Filtro: <strong>${escapeHTML(rotulo)}</strong> &mdash;</span>
        <button type="button" class="btn btn-ghost btn-sm" data-action="limparFiltroPainel" aria-label="${escapeHTML(`Limpar o filtro: ${rotulo}`)}">limpar</button></div>`;
    return { itens: lista.filter(fica), chip, filtrado: true };
}

/** "limpar": a mesma tela, sem o filtro (o navigate apaga o filtro). */
window.limparFiltroPainel = function () {
    S.filtroPainel = null;
    if (typeof window.navigate === 'function') window.navigate(S.view);
};
