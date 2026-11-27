import { S } from '../state.js';
import { api } from '../api.js';
import { irPara, enderecoDoProduto, moduloPara } from '../produto.js';
import { escapeHTML, renderEmptyState, renderDataTable, falhaDeCarga } from '../ui.js';
import { lista, areaDaFase, rotuloDaArea, pode, podeEditarOt } from '../ot-comum.js';
import { cartaoAgente } from './ot-agente.js';
import { areaSondas } from './ot-sensores.js';
import { cartaoIntegracao } from './ot-integracao.js';

// Telas de Configuração do n.ot (spec 2026-11-26): o que era "Acessos e sondas" vira Sondas, Agente de coleta e Integração ness.OS
// (Acessos de técnicos fica em ot.js, junto da concessão). Cada tela é só o cartão que já existia; a API decide o que a pessoa vê
// (o cartão vem vazio para quem não pode), e a casca (ot.js) só abre estas telas para quem edita.

const args = (...xs) => escapeHTML(JSON.stringify(xs));
const vazio = (c, titulo, texto) => { c.innerHTML = renderEmptyState({ titulo, texto }); };

export async function montarSondas(c, a, p) {
    let sites;
    try { sites = lista(await api('GET', `/api/v1/projects/${p.id}/ot/sites`), 'sites'); } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os sites do n.ot.', e); return; }
    const html = await areaSondas(p, sites);
    if (html) c.innerHTML = html;
    else vazio(c, sites.length ? 'Sondas indisponíveis' : 'Nenhum site no inventário', sites.length ? 'Seu papel não abre as sondas neste projeto.' : 'Cadastre um site em Sites antes de cadastrar uma sonda.');
}

export async function montarAgente(c, _a, p) {
    const html = await cartaoAgente(p);
    if (html) c.innerHTML = html; else vazio(c, 'Agente de coleta indisponível', 'Seu papel não liga nem emite chave do agente neste projeto, ou a leitura falhou. Tente de novo em instantes.');
}

export async function montarIntegracao(c, _a, p) {
    const html = await cartaoIntegracao(p);
    if (html) c.innerHTML = html; else vazio(c, 'Integração indisponível', 'Não foi possível ler as integrações deste projeto. Tente de novo em instantes.');
}

// Implantação (spec 2026-11-26 §3): a lista de verificação do projeto (só quem edita; o servidor diz 403 aos demais) e, abaixo, os
// sites que ainda não estão em Operação, lidos do painel do n.ot (a mesma resposta guardada em S.painel por 60 s).
const ESTADO = { feito: 'Feito', falta: 'Falta', opcional: 'Opcional' };
const VALIDADE_MS = 60000;

async function sitesEmImplantacao(p) {
    S.painel = S.painel || {};
    const chave = `${S.user ? S.user.id : ''}|${p.id}|ot`;
    let dados = S.painel[chave] && Date.now() - S.painel[chave].t < VALIDADE_MS ? S.painel[chave].dados : null;
    if (!dados) { dados = await api('GET', `/api/v1/projects/${p.id}/painel?modulo=ot`); S.painel[chave] = { t: Date.now(), dados }; }
    const ot = dados && dados.modulos && dados.modulos.ot;
    return (ot && Array.isArray(ot.por_site) ? ot.por_site : []).filter((s) => (s.area ?? areaDaFase(s.fase)) !== 'operacao');
}

/** Botão do passo; sem lugar para abrir (Sondas fora do papel, governança sem módulo que a tenha), um texto no lugar. */
function acaoDoPasso(x) {
    if (x.link.tela === 'sondas' && !pode('ver_sondas')) return { html: '<span class="org-dica">Sondas ficam fora do seu papel.</span>', primario: false };
    if (x.link.tela === 'n360-governanca' && !moduloPara('governance', S.activeProject)) return { html: '<span class="org-dica">Abra a governança em um módulo do projeto.</span>', primario: false };
    return { html: '', primario: true };
}

function listaDeVerificacao(passos) {
    const acoes = passos.map(acaoDoPasso);
    const primeiro = passos.findIndex((x, i) => x.estado === 'falta' && acoes[i].primario);
    return `<h3 class="mb-3">Lista de verificação do projeto</h3><ol class="ot-verificacao" aria-label="Lista de verificação do projeto">${passos.map((x, i) => `
        <li><strong>${escapeHTML(x.texto)}</strong> <span class="org-dica">${escapeHTML(ESTADO[x.estado] || x.estado)}</span> <span>${escapeHTML(x.detalhe)}</span>
        ${acoes[i].html || `<button type="button" class="btn btn-sm${i === primeiro ? ' btn-primary' : ''}" data-action="otIrPasso" data-args='${args(x.link)}' aria-label="${escapeHTML(`Abrir: ${x.texto}`)}">Abrir</button>`}</li>`).join('')}</ol>`;
}

export async function montarImplantacao(c, a, p) {
    const [lv, st] = await Promise.allSettled([podeEditarOt() ? api('GET', `/api/v1/projects/${p.id}/ot/implantacao`) : null, sitesEmImplantacao(p)]);
    if (st.status === 'rejected') { falhaDeCarga(c, a, 'Não foi possível carregar os sites do n.ot.', st.reason); return; }
    // só 403 (papel sem a lista) esconde a lista; 500 e rede mostram o erro com "tentar de novo"
    if (lv.status === 'rejected' && !(lv.reason && lv.reason.status === 403)) { falhaDeCarga(c, a, 'Não foi possível carregar a lista de verificação.', lv.reason); return; }
    const verificacao = lv.status === 'fulfilled' && lv.value && Array.isArray(lv.value.passos) ? listaDeVerificacao(lv.value.passos) : '';
    const sites = renderDataTable(['Site', 'Área', 'Ações'], st.value.map((s) => [`<strong>${escapeHTML(s.nome)}</strong>`, escapeHTML(rotuloDaArea(s.area ?? areaDaFase(s.fase), s.etapa)),
        `<button type="button" class="btn btn-sm" data-action="otTela" data-args='${args('site', s.id, null)}' aria-label="${escapeHTML(`Abrir ${s.nome}`)}">Abrir</button>`]),
    { emptyMessage: 'Nenhum site em implantação.', emptyHint: 'Os sites em Operação ficam em Sites; um site novo começa aqui.' });
    c.innerHTML = `${verificacao}<h3 class="${verificacao ? 'mt-6 ' : ''}mb-3">Sites em implantação</h3>${sites}`;
}

/** "Abrir" de um passo: n.360 (Usuários, Papéis e comitê) por endereço; o resto é tela do n.ot. */
window.otIrPasso = (link) => {
    if (!link) return;
    if (link.tela === 'n360-usuarios') irPara(`${enderecoDoProduto('n360')}?tela=users`);
    else if (link.tela === 'n360-governanca') { const m = moduloPara('governance', S.activeProject); if (m) irPara(`${enderecoDoProduto(m)}?tela=governance`); } // a governança é de módulo, não do n.360
    else if (link.aba === 'novo-site') window.otNovoSite();
    else if (link.tela === 'site') window.otTela('site', link.site, link.aba ?? null);
    else window.otTela(link.tela);
};
