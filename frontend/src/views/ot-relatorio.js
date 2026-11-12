import { api } from '../api.js';
import { escapeHTML, renderDataTable, renderStatusBadge, formatarData, falhaDeCarga } from '../ui.js';
import { SITUACAO, AVALIACAO, FASE, dataDoSqlite } from '../ot-comum.js';

// n.ot, relatório de conformidade da RO-CB.BR.01 (spec fluidez §5) sobre GET /ot/relatorio/conformidade. Página para imprimir ou salvar
// em PDF: o @media print esconde o resto da aplicação. O servidor já mascarou IP e MAC; aqui só se desenha e escapa.

const ROTULO = { ...SITUACAO, ...AVALIACAO, nao_avaliado: ['neutral', 'Não avaliado'] };
const selo = (s) => renderStatusBadge(...(ROTULO[s] || ROTULO.nao_avaliado));
const dia = (v) => escapeHTML(formatarData(v));
const instante = (v) => escapeHTML(formatarData(dataDoSqlite(v), { hora: true }));
const IMPRESSAO = `<style>@media print { body * { visibility: hidden; } #ot-relatorio, #ot-relatorio * { visibility: visible; }
    #ot-relatorio { position: absolute; left: 0; top: 0; width: 100%; } .ot-rel-acoes { display: none !important; } }</style>`;

function detalhe(i) {
    if (i.tipo === 'tecnico') return (i.por_site || []).map((s) => `${escapeHTML(s.site_nome)}: ${selo(s.situacao)} ${escapeHTML(s.evidencia || '')}`).join('<br>') || '—';
    return escapeHTML(i.justificativa || '—');
}
function linha(i) {
    const evs = (i.evidencias || []).map((e) => `${escapeHTML(e.file_name)}${e.valido_ate ? ` (válida até ${dia(e.valido_ate)})` : ''}${e.vencida ? ' — vencida' : ''}`).join('<br>');
    const conf = i.confirmado_em ? `${escapeHTML(i.confirmado_por_nome || '—')} em ${instante(i.confirmado_em)}` : '—';
    return [escapeHTML(i.codigo), escapeHTML(i.titulo), selo(i.situacao), i.prazo ? dia(i.prazo) : 'Sem prazo', detalhe(i), evs || '—',
        escapeHTML(i.responsavel_nome || '—'), conf, i.proxima_revisao ? dia(i.proxima_revisao) : '—'];
}

export async function montarRelatorio(c, a, p) {
    let r;
    try { r = await api('GET', `/api/v1/projects/${p.id}/ot/relatorio/conformidade`); } catch (e) { falhaDeCarga(c, a, 'Não foi possível gerar o relatório de conformidade.', e); return; }
    a.innerHTML = '';
    c.innerHTML = `${IMPRESSAO}<div id="ot-relatorio">
        <div class="ot-rel-acoes d-flex gap-2 mb-3"><button class="btn" data-action="otTela" data-args='["relatorios"]'>Voltar a Relatórios</button><button class="btn btn-primary" data-action="otImprimirRelatorio">Imprimir / Salvar PDF</button></div>
        <h2>Relatório de conformidade RO-CB.BR.01</h2>
        <p class="org-header-intro">Projeto: <strong>${escapeHTML(r.projeto || '—')}</strong> · Gerado em ${instante(r.gerado_em)} por ${escapeHTML(r.gerado_por || '—')}</p>
        <h3 class="mt-6 mb-3">Sites</h3>
        ${renderDataTable(['Site', 'Fase', 'Base aprovada em'], (r.sites || []).map((s) => [escapeHTML(s.nome), escapeHTML(FASE[s.fase] || s.fase), s.base_aprovada_em ? instante(s.base_aprovada_em) : '—']),
        { emptyMessage: 'Nenhum site no inventário.' })}
        <h3 class="mt-6 mb-3">Itens</h3>
        ${renderDataTable(['Código', 'Requisito', 'Situação', 'Prazo ONS', 'Justificativa ou inventário', 'Evidências', 'Responsável', 'Confirmado por', 'Próxima revisão'], (r.itens || []).map(linha),
        { emptyMessage: 'Catálogo da RO-CB.BR.01 ainda não carregado.' })}
        <p class="org-dica">Itens técnicos vêm do inventário, por site, com contagens; IP e MAC são mascarados no texto livre.</p></div>`;
}

window.otImprimirRelatorio = () => window.print();
