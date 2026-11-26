import { api, baixarArquivo } from '../api.js';
import { escapeHTML, renderDataTable, renderStatCards, renderStatusBadge, falhaDeCarga, showToast, formatarData, pedirTexto } from '../ui.js';
import { podeEditarOt, pode, mensagemDeErro, comStepUp, lista, opcoes, nomeDe, SITUACAO } from '../ot-comum.js';
import { S } from '../state.js';
import { montarRelatorio } from './ot-relatorio.js';

// Saídas do n.ot (N4; spec §8): indicadores e conformidade por item da RO-CB.BR.01, ambos calculados do inventário pelo servidor
// (services/ot-indicadores.ts e ot-conformidade.ts). A tela não soma nem decide nada; mostra os três estados do servidor, e nenhum
// deles afirma que o item é cumprido (princípio I). A exportação é por site, pelo fetch autenticado (o token nunca vai no endereço).

const el = (id) => document.getElementById(id);
const args = (...xs) => escapeHTML(JSON.stringify(xs));
// Indicador clicável: leva à Base do site, com o filtro de zona ('sem' = ativos sem zona).
const irBase = (site, zona, rotulo, aria) => `<button class="btn btn-sm" data-action="otIrBase" data-args='${args(site, zona)}' aria-label="${escapeHTML(aria)}">${escapeHTML(rotulo)}</button>`;
let raiz = null;
let acoes = null;
const situacao = (s) => renderStatusBadge(...(SITUACAO[s] || ['neutral', 'Sem evidência']));
const dias = (p) => (!p ? 'Sem prazo' : p.vencido ? `Vencido há ${Math.abs(p.dias_restantes)} dia(s)` : `Faltam ${p.dias_restantes} dia(s)`);

export async function montarSaidas(c, a, p) {
    raiz = c; acoes = a;
    let ind, conf, sites;
    try {
        [ind, conf, sites] = await Promise.all([api('GET', `/api/v1/projects/${p.id}/ot/indicadores`), api('GET', `/api/v1/projects/${p.id}/ot/conformidade`), pode('leitor') ? { sites: [] } : api('GET', `/api/v1/projects/${p.id}/ot/sites`)]); // o leitor não lê sites (spec 2026-11-26, decisão 4)
        sites = lista(sites, 'sites');
    } catch (e) { falhaDeCarga(c, a, 'Não foi possível calcular as saídas do n.ot.', e); return; }
    const comp = ind.completude || {};
    const fx = ind.fluxos_externos || {};
    const prazos = Object.fromEntries((ind.prazos || []).map((x) => [x.codigo, x]));
    const resumo = conf.resumo || {};
    const porZona = Array.isArray(ind.por_zona) ? ind.por_zona : [];

    const exportar = podeEditarOt() && sites.length ? `<h3 class="mt-6 mb-3">Exportação do inventário</h3>
        <div class="d-flex gap-4 flex-wrap items-center">
            <div class="form-group"><label class="form-label" for="ot-exp-site">Site</label><select class="form-input" id="ot-exp-site">${opcoes(sites.map((s) => [s.id, s.nome]), S.otSite)}</select></div>
            <button class="btn" data-action="otExportar" data-args='["csv"]'>Exportar CSV</button>
            <button class="btn" data-action="otExportar" data-args='["xlsx"]'>Exportar XLSX</button></div>
        <p class="org-dica">A exportação é por site, com IP e MAC como o seu papel os vê. Pede justificativa e o código do autenticador, fica registrada na trilha de auditoria e avisa o Gestor ARCiber do projeto.</p>` : '';

    a.innerHTML = '<button class="btn btn-primary" data-action="otRelatorioConformidade">Relatório de conformidade</button>';
    const semZona = ind.sem_zona && sites.length ? `<p class="mb-2">Ver os ativos sem zona na Base: ${sites.map((s) => irBase(s.id, 'sem', s.nome, `Ativos sem zona em ${s.nome}`)).join(' ')}</p>` : '';
    c.innerHTML = `<h3 class="mb-3">Indicadores do inventário</h3>
        ${renderStatCards([
        { label: 'Completude do 4.3.1', value: comp.percentual === null || comp.percentual === undefined ? '—' : `${comp.percentual}%`, subtext: `${comp.completos ?? 0} de ${comp.total ?? 0} ativo(s) com os 6 campos` },
        { label: 'Ativos do ARCiber completos', value: `${comp.arciber?.completos ?? 0} de ${comp.arciber?.total ?? 0}` },
        { label: 'Ativos sem zona', value: ind.sem_zona ?? 0 },
        { label: 'Ativos sem IP', value: ind.sem_ip ?? 0 },
        { label: 'Ativos sem MAC', value: ind.sem_mac ?? 0 },
        { label: 'Fluxos externos sem VPN', value: `${fx.sem_vpn ?? 0} de ${fx.externos ?? 0}`, color: fx.sem_vpn ? 'var(--danger-ink)' : undefined },
    ])}
        ${semZona}
        <p class="mb-2">Completude: ${situacao(comp.situacao)} ${escapeHTML(comp.evidencia || '')}</p>
        <p class="mb-4">Fluxos externos: ${situacao(fx.situacao)}</p>
        <h3 class="mt-6 mb-3">Ativos por zona e nível Purdue</h3>
        ${renderDataTable(['Nível Purdue', 'Zona', 'Site', 'Ativos'], porZona.map((z) => [escapeHTML(String(z.nivel_purdue)), escapeHTML(z.nome), escapeHTML(nomeDe(sites, z.site_id)),
        irBase(z.site_id, z.zona_id, String(z.ativos), `Ativos da zona ${z.nome}`)]),
        { emptyMessage: 'Nenhuma zona registrada.', emptyHint: 'Cadastre as zonas de cada site em Sites.' })}
        <h3 class="mt-6 mb-3">RO-CB.BR.01 por item, pelo inventário</h3>
        <p class="org-header-intro">Não atende: ${escapeHTML(String(resumo.nao_atende ?? 0))} · Evidência no inventário: ${escapeHTML(String(resumo.evidencia_no_inventario ?? 0))} · Sem evidência: ${escapeHTML(String(resumo.sem_evidencia ?? 0))}.
            O inventário mostra a falta do que ele registra e a evidência que ele guarda; ausência de falta não prova o item.</p>
        ${renderDataTable(['Código', 'Requisito', 'Prazo', 'Situação do prazo', 'Situação', 'Evidência'], lista(conf, 'itens').map((i) => [
        escapeHTML(i.codigo), escapeHTML(i.titulo), escapeHTML(i.prazo_em ? formatarData(i.prazo_em) : 'Sem prazo'), escapeHTML(i.prazo_em ? dias(prazos[i.codigo]) : 'Sem prazo'),
        situacao(i.situacao), escapeHTML(i.evidencia || '—'),
    ]), { emptyMessage: 'Catálogo da RO-CB.BR.01 ainda não carregado.' })}
        ${exportar}`;
}

window.otIrBase = (site, zona) => window.otTela('site', site, 'base', { otZona: zona });
window.otRelatorioConformidade = () => montarRelatorio(raiz, acoes, S.activeProject);

window.otExportar = async (formato) => {
    const site = el('ot-exp-site')?.value;
    if (!site || !['csv', 'xlsx'].includes(formato)) return;
    const nome = el('ot-exp-site').selectedOptions?.[0]?.textContent || 'o site';
    const justificativa = await pedirTexto('Por que exportar o inventário deste site? IP e MAC saem como o seu papel os vê. O motivo vai para a trilha de auditoria e para o aviso ao Gestor ARCiber (mínimo de 10 caracteres, sem IP nem MAC).',
        { titulo: `Exportar ${nome} (${formato.toUpperCase()})`, rotulo: 'Exportar' });
    if (justificativa === null) return;
    if (justificativa.length < 10) { showToast('Escreva o motivo com ao menos 10 caracteres.', 'error'); return; }
    try {
        // POST: a justificativa vai no corpo, não no endereço (P1-1).
        await comStepUp(() => baixarArquivo(`/api/v1/projects/${S.activeProject.id}/ot/exportacao`, { formato, site_id: site, justificativa }));
    } catch (e) { showToast(mensagemDeErro(e, 'Não foi possível exportar o inventário.'), 'error'); }
};
