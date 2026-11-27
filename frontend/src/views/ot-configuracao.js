import { api } from '../api.js';
import { escapeHTML, renderEmptyState, renderDataTable, falhaDeCarga } from '../ui.js';
import { lista, areaDaFase, rotuloDaArea } from '../ot-comum.js';
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

// Até o PR6 (lista de verificação) e o PR7 (assistente), a Implantação é a lista dos sites que ainda não estão em Operação.
export async function montarImplantacao(c, a, p) {
    let sites;
    try { sites = lista(await api('GET', `/api/v1/projects/${p.id}/ot/sites`), 'sites'); } catch (e) { falhaDeCarga(c, a, 'Não foi possível carregar os sites do n.ot.', e); return; }
    const em = sites.filter((s) => areaDaFase(s.fase) !== 'operacao');
    c.innerHTML = renderDataTable(['Site', 'Área', 'Ações'], em.map((s) => [`<strong>${escapeHTML(s.nome)}</strong>`, escapeHTML(rotuloDaArea(areaDaFase(s.fase))),
        `<button class="btn btn-sm" data-action="otTela" data-args='${args('site', s.id, null)}' aria-label="${escapeHTML(`Abrir ${s.nome}`)}">Abrir</button>`]),
    { emptyMessage: 'Nenhum site em implantação.', emptyHint: 'Os sites em Operação ficam em Sites; um site novo começa aqui.' });
}
