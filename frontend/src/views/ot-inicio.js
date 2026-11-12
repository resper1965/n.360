import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderDataTable, renderEmptyState } from '../ui.js';
import { lista, podeAprovarOt, podeEditarOt, ehGestor, dataDoSqlite } from '../ot-comum.js';
import { emDiasSP, hojeSP } from '../hoje.js';

// n.ot, tela Início (spec 2026-11-11 fluidez §2): "Espera por você", Sites e Postura RO-CB.BR.01. Clique pela delegação:
// data-action="otTela" / "otIrParaLote" (definidas na casca, Task 5). Tudo que vem da API passa por escapeHTML.

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const PRAZO_DIAS = 7;
const FASE = { em_levantamento: 'Em levantamento', base_em_aprovacao: 'Base em aprovação', em_operacao: 'Em operação', em_obra: 'Em obra' };
const PASSO = { comecar: 'Começar o levantamento', revisar: 'Revisar', aguardar_lote: 'Aguardar o lote', pedir_base: 'Pedir a base', aguardar_base: 'Aguardar a base', em_operacao: 'Em operação' };
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const alvo = (site, modo, lote) => ({ tela: 'site', site, modo, ...(lote ? { lote } : {}) });

/** Linhas de "Espera por você" para o papel de quem olha. Pura: recebe os dados já lidos. `sites` mapeia id → nome. */
export function pendenciasDoPapel({ lotes = [], desvios = [], aceitos = [], rascunhosPorSite = {}, sondas = [], sites = {}, situacoes = {} }, { id, podeAprovar, podeEditar, gestor }) {
    const nome = (s) => sites[s] || 'site';
    const out = [];
    if (podeAprovar) {
        for (const l of lotes.filter((x) => x.status === 'em_revisao' && x.criado_por !== id)) {
            const criado = dataDoSqlite(l.created_at);
            const [, m, d] = criado ? emDiasSP(PRAZO_DIAS, criado).split('-') : [];
            out.push({ tipo: 'lote', texto: `Lote de aprovação em ${nome(l.site_id)}${criado ? `: decidir até ${d}/${m}` : ''}`, acao: alvo(l.site_id, 'projeto', l.id) });
        }
        const porSite = {};
        for (const d of desvios) porSite[d.site_id] = (porSite[d.site_id] || 0) + 1;
        for (const [s, n] of Object.entries(porSite)) out.push({ tipo: 'desvio', texto: `${plural(n, 'desvio aberto', 'desvios abertos')} em ${nome(s)}`, acao: { ...alvo(s, 'operacao'), extra: { otSub: 'desvios' } } });
    }
    if (gestor) {
        for (const [s] of Object.entries(situacoes).filter(([, x]) => x?.proximo_passo === 'aguardar_base')) out.push({ tipo: 'base', texto: `Base de ${nome(s)} aguardando sua aprovação`, acao: alvo(s, 'projeto') });
    }
    if (gestor) {
        const hoje = hojeSP(); const limite = emDiasSP(PRAZO_DIAS);
        const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
        const verbo = (iso) => (iso < hoje ? 'venceu' : 'vence');
        for (const [s, x] of Object.entries(situacoes)) if (x?.obra?.ate && x.obra.ate <= limite) out.push({ tipo: 'obra', texto: `Obra em ${nome(s)} ${verbo(x.obra.ate)} em ${dm(x.obra.ate)}`, acao: alvo(s, 'projeto') });
        for (const d of aceitos) { // aceito_ate é um instante: o dia vale em São Paulo
            const t = dataDoSqlite(d.aceito_ate);
            const dia = t && hojeSP(t);
            if (dia && dia <= limite) out.push({ tipo: 'aceite', texto: `Aceite de desvio ${verbo(dia)} em ${dm(dia)} (${nome(d.site_id)})`, acao: { ...alvo(d.site_id, 'operacao'), extra: { otSub: 'desvios' } } });
        }
    }
    if (podeEditar) {
        for (const [s, n] of Object.entries(rascunhosPorSite).filter(([, n]) => n > 0)) out.push({ tipo: 'rascunho', texto: `${plural(n, 'achado em rascunho', 'achados em rascunho')} em ${nome(s)}`, acao: { ...alvo(s, 'projeto'), extra: { otSub: 'aprovacao' } } });
        // a API devolve a situação da sonda em `saude`
        for (const s of sondas) {
            const sit = s.saude || s.situacao;
            if (sit === 'parada' || sit === 'atrasada') out.push({ tipo: 'sonda', texto: `Sonda ${s.nome} ${sit} em ${nome(s.site_id)}`, acao: alvo(s.site_id, 'operacao') });
        }
    }
    for (const l of lotes.filter((x) => x.status === 'rejeitado' && x.criado_por === id)) out.push({ tipo: 'recusado', texto: `Seu lote em ${nome(l.site_id)} foi recusado`, acao: alvo(l.site_id, 'projeto', l.id) });
    return out;
}

const botao = (rotulo, aria, acao, ...a) => `<button class="btn btn-sm" data-action="${acao}" data-args='${args(...a)}' aria-label="${escapeHTML(aria)}">${rotulo}</button>`;
const abrir = (a) => (a.lote ? botao('Abrir', 'Abrir lote', 'otIrParaLote', a.site, a.lote)
    : a.site ? botao('Abrir', 'Abrir site', 'otTela', 'site', a.site, a.modo, ...(a.extra ? [a.extra] : [])) : botao('Abrir', 'Abrir sites', 'otTela', 'sites'));

export async function montarInicio(c, a, p) {
    const [rL, rD, rS, rC, rA] = await Promise.allSettled([
        api('GET', `/api/v1/projects/${p.id}/ot/lotes`),
        api('GET', `/api/v1/projects/${p.id}/ot/desvios?situacao=aberto`), api('GET', `/api/v1/projects/${p.id}/ot/sites`),
        api('GET', `/api/v1/projects/${p.id}/ot/conformidade`),
        ehGestor() ? api('GET', `/api/v1/projects/${p.id}/ot/desvios?situacao=aceito`) : Promise.resolve({ desvios: [] })]); // só o Gestor vê os aceites vencendo
    const v = (r, k) => (r.status === 'fulfilled' ? lista(r.value, k) : []);
    const sitesL = v(rS, 'sites');
    const sites = Object.fromEntries(sitesL.map((s) => [s.id, s.nome]));
    // sondas, fila de revisão e situação: uma chamada por site, as três levas em paralelo. A que falha deixa o site sem o dado
    // (403 sem inventário; a fila acende o aviso de carga parcial; a situação vira "—").
    const id = (s) => encodeURIComponent(s.id);
    const [rSo, rQ, rSit] = await Promise.all([
        Promise.allSettled(sitesL.map((s) => api('GET', `/api/v1/projects/${p.id}/ot/sites/${id(s)}/sensores`))),
        Promise.allSettled(sitesL.map((s) => api('GET', `/api/v1/projects/${p.id}/ot/achados?site_id=${id(s)}&situacao=rascunho&contagem=1`))),
        Promise.allSettled(sitesL.map((s) => api('GET', `/api/v1/projects/${p.id}/ot/sites/${id(s)}/situacao`)))]);
    const sondas = sitesL.flatMap((s, i) => (rSo[i].status === 'fulfilled' ? lista(rSo[i].value, 'sensores').map((x) => ({ ...x, site_id: s.id })) : []));
    const rascunhosPorSite = {};
    sitesL.forEach((s, i) => { if (rQ[i].status === 'fulfilled') rascunhosPorSite[s.id] = rQ[i].value?.total ?? 0; });
    const situacoes = {};
    sitesL.forEach((s, i) => { if (rSit[i].status === 'fulfilled') situacoes[s.id] = rSit[i].value; });
    const desvios = v(rD, 'desvios');
    const pend = pendenciasDoPapel({ lotes: v(rL, 'lotes'), desvios, aceitos: v(rA, 'desvios'), rascunhosPorSite, sondas, sites, situacoes },
        { id: S.user?.id, podeAprovar: podeAprovarOt() && S.user?.role !== 'consultoria_admin', podeEditar: podeEditarOt(), gestor: ehGestor() });

    const falhou = [rL, rD, ...rQ].some((r) => r.status === 'rejected') ? '<p class="org-dica" role="alert">Não foi possível carregar tudo o que espera por você.</p>' : '';
    const espera = pend.length
        ? `<ul class="empty-list">${pend.map((x) => `<li><span>${escapeHTML(x.texto)}</span>${abrir(x.acao)}</li>`).join('')}</ul>${falhou}`
        : falhou || '<p class="org-dica">Nada esperando por você agora.</p>';
    const abertos = {};
    for (const d of desvios) abertos[d.site_id] = (abertos[d.site_id] || 0) + 1;
    const sit = (s) => sondas.filter((x) => x.site_id === s).map((x) => x.saude || x.situacao);
    const pior = (s) => { const t = sit(s); return ['parada', 'atrasada'].find((x) => t.includes(x)); };
    const blocoSites = rS.status === 'rejected' ? '<p class="org-dica" role="alert">Não foi possível carregar os sites.</p>' : sitesL.length
        ? renderDataTable(['Site', 'Fase', 'Próximo passo', 'Desvios abertos', 'Sonda', 'Abrir'], sitesL.map((s) => [escapeHTML(s.nome),
            escapeHTML(FASE[situacoes[s.id]?.fase] || '—'), escapeHTML(PASSO[situacoes[s.id]?.proximo_passo] || '—'),
            escapeHTML(String(abertos[s.id] || 0)), escapeHTML(pior(s.id) || (sondas.some((x) => x.site_id === s.id) ? 'em dia' : '—')), botao('Abrir', `Abrir ${s.nome}`, 'otTela', 'site', s.id, null)]))
        : renderEmptyState({ titulo: 'Cadastre o primeiro site', texto: 'O site é onde o inventário e os levantamentos acontecem.', acao: podeEditarOt() ? `<button class="btn btn-primary" data-action="otTela" data-args='${args('sites')}'>Cadastrar site</button>` : '' });
    const r = rC.status === 'fulfilled' ? rC.value.resumo || {} : null;
    const postura = r
        ? `<p>Não atende: ${escapeHTML(String(r.nao_atende ?? 0))} · Evidência no inventário: ${escapeHTML(String(r.evidencia_no_inventario ?? 0))} · Sem evidência: ${escapeHTML(String(r.sem_evidencia ?? 0))}</p>
        ${botao('Ver assessment', 'Ver assessment da RO-CB.BR.01', 'otTela', 'assessment')}`
        : '<p class="org-dica">Não foi possível carregar a postura agora.</p>';
    c.innerHTML = `<section class="card mb-4"><h3 class="mb-3">Espera por você</h3>${espera}</section>
        <section class="card mb-4"><h3 class="mb-3">Sites</h3>${blocoSites}</section>
        <section class="card"><h3 class="mb-3">Postura RO-CB.BR.01</h3>${postura}</section>`;
}
