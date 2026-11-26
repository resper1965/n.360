import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderDataTable, renderEmptyState } from '../ui.js';
import { lista, podeAprovarOt, podeEditarOt, ehGestor, dataDoSqlite, rotuloDaArea, areaDaFase } from '../ot-comum.js';
import { emDiasSP, hojeSP } from '../hoje.js';

// n.ot, tela Início (spec 2026-11-11 fluidez §2): "Espera por você", Sites e Postura RO-CB.BR.01. Clique pela delegação:
// data-action="otTela" / "otIrParaLote" (definidas na casca, Task 5). Tudo que vem da API passa por escapeHTML.

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const PRAZO_DIAS = 7;
const PASSO = { comecar: 'Começar o levantamento', revisar: 'Revisar', aguardar_lote: 'Aguardar o lote', pedir_base: 'Pedir a base', aguardar_base: 'Aguardar a base', em_operacao: 'Acompanhar', revalidar: 'Revalidar' };
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const alvo = (site, aba, lote) => ({ tela: 'site', site, aba, ...(lote ? { lote } : {}) }); // aba nula: a área do site decide

/** Linhas de "Espera por você" para o papel de quem olha. Pura: recebe os dados já lidos. `sites` mapeia id → nome. */
export function pendenciasDoPapel({ lotes = [], desvios = [], aceitos = [], rascunhosPorSite = {}, sondas = [], sites = {}, situacoes = {}, assessment = null }, { id, podeAprovar, podeEditar, gestor }) {
    const nome = (s) => sites[s] || 'site';
    const out = [];
    if (podeAprovar) {
        for (const l of lotes.filter((x) => x.status === 'em_revisao' && x.criado_por !== id)) {
            const criado = dataDoSqlite(l.created_at);
            const [, m, d] = criado ? emDiasSP(PRAZO_DIAS, criado).split('-') : [];
            out.push({ tipo: 'lote', texto: `Lote de aprovação em ${nome(l.site_id)}${criado ? `: decidir até ${d}/${m}` : ''}`, acao: alvo(l.site_id, null, l.id) });
        }
        const porSite = {};
        for (const d of desvios.filter((x) => !situacoes[x.site_id]?.obra)) porSite[d.site_id] = (porSite[d.site_id] || 0) + 1;
        for (const [s, n] of Object.entries(porSite)) out.push({ tipo: 'desvio', texto: `${plural(n, 'desvio aberto', 'desvios abertos')} em ${nome(s)}`, acao: alvo(s, 'desvios') });
    }
    if (gestor) {
        // quem pediu a base não a aprova: não espera por essa pessoa
        for (const [s] of Object.entries(situacoes).filter(([, x]) => x?.proximo_passo === 'aguardar_base' && !x.eu_pedi_a_base)) out.push({ tipo: 'base', texto: `Base de ${nome(s)} aguardando sua aprovação`, acao: alvo(s, null) });
    }
    if (gestor) {
        const hoje = hojeSP(); const limite = emDiasSP(PRAZO_DIAS);
        const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
        const verbo = (iso) => (iso < hoje ? 'venceu' : 'vence');
        for (const [s, x] of Object.entries(situacoes)) if (x?.obra?.ate && x.obra.ate <= limite) out.push({ tipo: 'obra', texto: `Obra em ${nome(s)} ${verbo(x.obra.ate)} em ${dm(x.obra.ate)}`, acao: alvo(s, null) });
        for (const d of aceitos) { // aceito_ate é um instante: o dia vale em São Paulo
            const t = dataDoSqlite(d.aceito_ate);
            const dia = t && hojeSP(t);
            if (dia && dia <= limite) out.push({ tipo: 'aceite', texto: `Aceite de desvio ${verbo(dia)} em ${dm(dia)} (${nome(d.site_id)})`, acao: alvo(d.site_id, 'desvios') });
        }
    }
    if (podeEditar) {
        for (const [s, n] of Object.entries(rascunhosPorSite).filter(([, n]) => n > 0)) out.push({ tipo: 'rascunho', texto: `${plural(n, 'achado em rascunho', 'achados em rascunho')} em ${nome(s)}`, acao: alvo(s, 'aprovacao') });
        // a API devolve a situação da sonda em `saude`
        for (const s of sondas) {
            const sit = s.saude || s.situacao;
            if (sit === 'parada' || sit === 'atrasada') out.push({ tipo: 'sonda', texto: `Sonda ${s.nome} ${sit} em ${nome(s.site_id)}`, acao: alvo(s.site_id, 'saude') });
        }
    }
    // assessment: mesma regra do "Só o que espera por mim" da tela (ot-assessment.js). O Gestor confirma e revisa; quem edita preenche.
    const ass = (texto, filtro) => out.push({ tipo: 'assessment', texto, acao: { tela: 'assessment', filtro } });
    if (assessment && gestor) {
        const { a_confirmar: total = 0, revisar: rev = 0 } = assessment.resumo || {};
        // quem avaliou o item não o confirma: sai da conta
        const conf = total - (assessment.itens || []).filter((i) => i.avaliacao?.eu_avaliei && !i.avaliacao.confirmado).length;
        if (conf > 0) ass(`${plural(conf, 'item do assessment', 'itens do assessment')} para confirmar`, 'meus');
        if (rev > 0) ass(`${plural(rev, 'item do assessment', 'itens do assessment')} para revisar`, 'revisar');
    } else if (assessment && podeEditar) {
        const n = (assessment.itens || []).filter((i) => i.tipo === 'politica' && !i.avaliacao).length;
        if (n > 0) ass(`${plural(n, 'item do assessment', 'itens do assessment')} sem preencher`, 'meus');
    }
    for (const l of lotes.filter((x) => x.status === 'rejeitado' && x.criado_por === id)) out.push({ tipo: 'recusado', texto: `Seu lote em ${nome(l.site_id)} foi recusado`, acao: alvo(l.site_id, null, l.id) });
    return out;
}

const botao = (rotulo, aria, acao, ...a) => `<button class="btn btn-sm" data-action="${acao}" data-args='${args(...a)}' aria-label="${escapeHTML(aria)}">${rotulo}</button>`;
const abrir = (a) => (a.tela === 'assessment' ? botao('Abrir', 'Abrir assessment', 'otTela', 'assessment', null, null, { otAssFiltro: a.filtro })
    : a.lote ? botao('Abrir', 'Abrir lote', 'otIrParaLote', a.site, a.lote)
    : a.site ? botao('Abrir', 'Abrir site', 'otTela', 'site', a.site, a.aba) : botao('Abrir', 'Abrir sites', 'otTela', 'sites'));

export async function montarInicio(c, a, p) {
    const [rL, rD, rS, rC, rA] = await Promise.allSettled([
        api('GET', `/api/v1/projects/${p.id}/ot/lotes`),
        api('GET', `/api/v1/projects/${p.id}/ot/desvios?situacao=aberto`), api('GET', `/api/v1/projects/${p.id}/ot/sites`),
        api('GET', `/api/v1/projects/${p.id}/ot/assessment`),
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
    const assessment = rC.status === 'fulfilled' ? { resumo: rC.value?.resumo || {}, itens: lista(rC.value, 'itens') } : null;
    const pend = pendenciasDoPapel({ lotes: v(rL, 'lotes'), desvios, aceitos: v(rA, 'desvios'), rascunhosPorSite, sondas, sites, situacoes, assessment },
        { id: S.user?.id, podeAprovar: podeAprovarOt() && S.user?.role !== 'consultoria_admin', podeEditar: podeEditarOt(), gestor: ehGestor() });

    const falhou = [rL, rD, rC, ...rQ].some((r) => r.status === 'rejected') ? '<p class="org-dica" role="alert">Não foi possível carregar tudo o que espera por você.</p>' : '';
    const espera = pend.length
        ? `<ul class="empty-list">${pend.map((x) => `<li><span>${escapeHTML(x.texto)}</span>${abrir(x.acao)}</li>`).join('')}</ul>${falhou}`
        : falhou || '<p class="org-dica">Nada esperando por você agora.</p>';
    const abertos = {};
    for (const d of desvios) abertos[d.site_id] = (abertos[d.site_id] || 0) + 1;
    const sit = (s) => sondas.filter((x) => x.site_id === s).map((x) => x.saude || x.situacao);
    const pior = (s) => { const t = sit(s); return ['parada', 'atrasada'].find((x) => t.includes(x)); };
    const blocoSites = rS.status === 'rejected' ? '<p class="org-dica" role="alert">Não foi possível carregar os sites.</p>' : sitesL.length
        ? renderDataTable(['Site', 'Área', 'Próximo passo', 'Desvios abertos', 'Sonda', 'Abrir'], sitesL.map((s) => [escapeHTML(s.nome),
            escapeHTML(situacoes[s.id] ? rotuloDaArea(situacoes[s.id].area ?? areaDaFase(situacoes[s.id].fase), situacoes[s.id].etapa) : '—'), escapeHTML(PASSO[situacoes[s.id]?.proximo_passo] || '—'),
            escapeHTML(String(abertos[s.id] || 0)), escapeHTML(pior(s.id) || (sondas.some((x) => x.site_id === s.id) ? 'em dia' : '—')), botao('Abrir', `Abrir ${s.nome}`, 'otTela', 'site', s.id, null)]))
        : renderEmptyState({ titulo: 'Cadastre o primeiro site', texto: 'O site é onde o inventário e os levantamentos acontecem.', acao: podeEditarOt() ? `<button class="btn btn-primary" data-action="otTela" data-args='${args('sites')}'>Cadastrar site</button>` : '' });
    const r = assessment?.resumo;
    const n = (k) => escapeHTML(String(r[k] ?? 0));
    const postura = r
        ? `<p>Atende: ${n('atende')} · Parcial: ${n('parcial')} · Não atende: ${n('nao_atende')} · Não se aplica: ${n('nao_se_aplica')} · Não avaliado: ${n('nao_avaliado')} · ${n('a_confirmar')} a confirmar</p>
        ${botao('Ver assessment', 'Ver assessment da RO-CB.BR.01', 'otTela', 'assessment')}`
        : '<p class="org-dica">Não foi possível carregar a postura agora.</p>';
    c.innerHTML = `<section class="card mb-4"><h3 class="mb-3">Espera por você</h3>${espera}</section>
        <section class="card mb-4"><h3 class="mb-3">Sites</h3>${blocoSites}</section>
        <section class="card"><h3 class="mb-3">Postura RO-CB.BR.01</h3>${postura}</section>`;
}
