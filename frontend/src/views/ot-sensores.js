import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, renderDataTable, renderStatusBadge, openModal, showToast, confirmar, formatarData } from '../ui.js';
import { mensagemDeErro, lista, semRepetir } from '../ot-comum.js';
import { seloDoAchado } from './ot-levantamento.js';

const EVIDENCIA_SENSOR = 'Sensor de rede (Zeek): ';

// n.ot, sonda de rede com envio automático (plano 2026-11-05, Task 8): a área "Sondas" por site na aba Acessos e agente e os cartões
// "Saúde da coleta" e "Pontos a esclarecer" no topo do Levantamento, sobre /ot/sites/:sid/sensores e /ot/sensores* (src/routes/ot.ts).
// As rotas são de quem vê o inventário completo: quem leva 403 não vê a área nem os cartões. A credencial em claro vive só no modal
// que a mostra (nunca em variável de módulo, S ou storage) e o modal é esvaziado ao fechar. No código é `sensor`; na tela, "Sonda".

const el = (id) => document.getElementById(id);
const proj = () => S.activeProject;
const args = (...xs) => escapeHTML(JSON.stringify(xs));
const falhou = (e, padrao) => showToast(mensagemDeErro(e, padrao), 'error');
const SAUDE = { em_dia: ['success', 'Em dia'], atrasada: ['warning', 'Atrasada'], parada: ['danger', 'Parada'] };
const PERDA_MAXIMA = 5; // % de perda de captura acima da qual a sonda avisa
const DIA = 86400000;

/** "há 3 h", "há 2 dias": o tempo desde um instante da API (UTC). */
export function haQuanto(iso, agora = Date.now()) {
    const t = new Date(/^\d{4}-\d{2}-\d{2} /.test(iso) ? `${iso.replace(' ', 'T')}Z` : iso).getTime();
    if (!Number.isFinite(t)) return '—';
    const min = Math.max(0, Math.round((agora - t) / 60000));
    if (min < 60) return `há ${min} min`;
    if (min < 1440) return `há ${Math.round(min / 60)} h`;
    const d = Math.round(min / 1440);
    return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}
const diasAte = (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DIA));

/** Sondas ativas de cada site. null se a pessoa não vê o inventário completo (403: a área some em silêncio); `falhas` conta os sites que não carregaram por outro erro. */
async function lerSondas(p, sites) {
    const rs = await Promise.allSettled(sites.map((s) => api('GET', `/api/v1/projects/${p.id}/ot/sites/${encodeURIComponent(s.id)}/sensores`)));
    if (rs.some((r) => r.status === 'rejected' && r.reason?.status === 403)) return null;
    return { por: sites.map((s, i) => ({ site: s, sensores: rs[i].status === 'fulfilled' ? lista(rs[i].value, 'sensores') : [] })), falhas: rs.filter((r) => r.status === 'rejected').length };
}

// ─── área "Sondas" (aba Acessos e agente) ───────────────────────────────────────
function linha(s) {
    const perda = typeof s.capture_loss === 'number' ? s.capture_loss : null;
    const aviso = perda !== null && perda > PERDA_MAXIMA ? ` ${renderStatusBadge('warning', 'Perda alta')}` : '';
    const cred = (s.credenciais || []).map((k) => `<div class="d-flex gap-2 items-center">${s.vencendo && diasAte(k.expira_em) <= 30 ? `<span>vence em ${diasAte(k.expira_em)} dias</span>` : `<span>até ${escapeHTML(formatarData(k.expira_em))}</span>`}
        <button class="btn btn-sm" data-action="otRevogarCredencialSonda" data-args='${args(s.id, k.id)}' aria-label="${escapeHTML(`Revogar credencial de ${s.nome} que vale até ${formatarData(k.expira_em)}`)}">Revogar credencial</button></div>`).join('') || '<span>Sem credencial ativa</span>';
    return [`<strong>${escapeHTML(s.nome)}</strong><div class="org-dica f-mono">${escapeHTML(s.faixa_origem)}</div>`,
        renderStatusBadge(...(SAUDE[s.saude] || ['neutral', s.saude || '—'])),
        escapeHTML(s.ultimo_envio ? formatarData(s.ultimo_envio, { hora: true }) : 'Nunca'),
        perda === null ? '—' : `${escapeHTML(String(perda))}%${aviso}`,
        cred,
        `<div class="d-flex gap-2"><button class="btn btn-sm" data-action="otNovaCredencialSonda" data-args='${args(s.id)}' aria-label="${escapeHTML(`Gerar nova credencial de ${s.nome}`)}">Gerar nova credencial</button>
        <button class="btn btn-sm" data-action="otRevogarSonda" data-args='${args(s.id, s.nome)}' aria-label="${escapeHTML(`Revogar sonda ${s.nome}`)}">Revogar sonda</button></div>`];
}

/** HTML do bloco Sondas (um por site), ou '' para quem não vê o inventário completo. */
export async function areaSondas(p, sites) {
    if (!sites.length) return '';
    const lidas = await lerSondas(p, sites);
    if (!lidas) return '';
    const { por, falhas } = lidas;
    return `<section class="card mt-6" id="ot-sondas" aria-labelledby="ot-sondas-titulo">
        <h3 id="ot-sondas-titulo">Sondas</h3>
        <p class="org-header-intro">Uma sonda de rede envia o resumo do tráfego sozinha, todo dia. Os pontos novos entram como rascunho no Levantamento, e nada vai ao inventário sem revisão.</p>
        ${falhas ? '<p class="org-dica" role="alert">Não foi possível carregar as sondas de alguns sites. Tente de novo em instantes.</p>' : ''}
        ${por.map(({ site, sensores }) => `<div class="d-flex gap-2 items-center mt-3"><h4>${escapeHTML(site.nome)}</h4>
            <button class="btn btn-sm btn-secondary" data-action="otNovaSonda" data-args='${args(site.id)}' aria-label="${escapeHTML(`Nova sonda em ${site.nome}`)}">Nova sonda</button></div>
            ${renderDataTable(['Sonda', 'Situação', 'Último envio', 'Perda de captura', 'Credencial', 'Ações'], sensores.map(linha), { emptyMessage: 'Nenhuma sonda neste site.' })}`).join('')}</section>`;
}

window.otNovaSonda = (siteId) => {
    openModal(`<div class="modal-header"><span class="modal-title">Nova sonda</span></div>
        <div class="form-group"><label class="form-label" for="ot-so-nome">Nome</label><input class="form-input" id="ot-so-nome" maxlength="80" placeholder="Ex.: sonda do barramento" autofocus></div>
        <div class="form-group"><label class="form-label" for="ot-so-faixa">Faixa de origem</label><input class="form-input f-mono" id="ot-so-faixa" placeholder="Ex.: 203.0.113.0/24">
        <p class="org-dica">Só envios vindos desta faixa de IP são aceitos.</p></div>
        <div class="acoes-rodape"><button class="btn" data-action="closeModal">Cancelar</button><button class="btn btn-primary" data-action="otSalvarSonda" data-args='${args(siteId)}'>Criar sonda</button></div>`);
};

window.otSalvarSonda = (siteId) => semRepetir('otSalvarSonda', async () => {
    const nome = el('ot-so-nome').value.trim();
    const faixa_origem = el('ot-so-faixa').value.trim();
    if (!nome) { showToast('Dê um nome à sonda.', 'error'); return; }
    if (!faixa_origem) { showToast('Informe a faixa de origem da sonda.', 'error'); return; }
    let r;
    try { r = await api('POST', `/api/v1/projects/${proj().id}/ot/sites/${encodeURIComponent(siteId)}/sensores`, { nome, faixa_origem }); } catch (e) { falhou(e, 'Não foi possível criar a sonda.'); return; }
    mostrarCredencial('Credencial da sonda', r.credencial, r.expira_em, r.conf);
    r = null;
    window.render();
});

/** Mostra a credencial uma vez; `conf` (bloco do /etc/n-ot-sonda.conf) só vem na criação da sonda. */
function mostrarCredencial(titulo, credencial, expiraEm, conf) {
    openModal(`<div class="modal-header"><span class="modal-title">${escapeHTML(titulo)}</span></div>
        <p class="org-dica mb-3"><strong>Guarde agora: ela não será mostrada de novo.</strong> Vale até ${escapeHTML(formatarData(expiraEm))}.</p>
        <label class="rotulo-campo" for="ot-so-cred">Credencial</label>
        <div class="ca-bloco"><input class="form-input f-mono" id="ot-so-cred" readonly value="${escapeHTML(credencial)}"><button class="btn" data-action="otCopiarSonda" data-args='${args('ot-so-cred')}'>Copiar</button></div>
        ${conf ? `<div class="rotulo-campo mt-3">Arquivo /etc/n-ot-sonda.conf (dono n-ot-sonda, o usuário da sonda; modo 0600)</div>
        <textarea class="form-input f-mono" id="ot-so-conf" rows="4" readonly>${escapeHTML(conf)}</textarea>
        <button class="btn mt-2" data-action="otCopiarSonda" data-args='${args('ot-so-conf')}'>Copiar</button>` : ''}
        <div class="acoes-rodape"><button class="btn btn-primary" data-action="forceCloseModal">Fechar</button></div>`);
    const ov = el('modal-overlay');
    const obs = new MutationObserver(() => { // fechar por qualquer caminho apaga a credencial do DOM
        if (ov.classList.contains('open')) return;
        obs.disconnect();
        el('modal-content').innerHTML = '';
    });
    obs.observe(ov, { attributes: true, attributeFilter: ['class'] });
}

window.otCopiarSonda = async (id) => {
    const campo = el(id);
    if (!campo) return;
    try { await navigator.clipboard.writeText(campo.value); showToast('Copiado.', 'success'); } catch { campo.select(); showToast('Selecione o texto e copie com Ctrl+C.'); }
};

window.otNovaCredencialSonda = (id) => semRepetir('otNovaCredencialSonda', async () => {
    if (!await confirmar('Gerar uma nova credencial? A atual continua valendo até você revogá-la; cada sonda tem até 2 credenciais ativas.', { titulo: 'Gerar nova credencial', rotulo: 'Gerar' })) return;
    let r;
    try { r = await api('POST', `/api/v1/projects/${proj().id}/ot/sensores/${encodeURIComponent(id)}/credenciais`); } catch (e) { falhou(e, 'Não foi possível gerar a credencial.'); return; }
    mostrarCredencial('Nova credencial', r.credencial, r.expira_em);
    r = null;
    window.render();
});

window.otRevogarCredencialSonda = (id, cid) => semRepetir('otRevogarCredencialSonda', async () => {
    if (!await confirmar('Revogar esta credencial? A sonda que a usa deixa de enviar até receber outra.', { titulo: 'Revogar credencial', rotulo: 'Revogar', perigo: true })) return;
    try {
        await api('DELETE', `/api/v1/projects/${proj().id}/ot/sensores/${encodeURIComponent(id)}/credenciais/${encodeURIComponent(cid)}`);
        showToast('Credencial revogada.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível revogar a credencial.'); }
});

window.otRevogarSonda = (id, nome) => semRepetir('otRevogarSonda', async () => {
    if (!await confirmar(`Revogar a sonda ${nome}? Todas as credenciais dela deixam de valer. Os pontos já enviados continuam no Levantamento.`, { titulo: 'Revogar sonda', rotulo: 'Revogar', perigo: true })) return;
    try {
        await api('DELETE', `/api/v1/projects/${proj().id}/ot/sensores/${encodeURIComponent(id)}`);
        showToast('Sonda revogada.', 'success'); window.render();
    } catch (e) { falhou(e, 'Não foi possível revogar a sonda.'); }
});

// ─── cartões no topo do Levantamento ────────────────────────────────────────────
/** Preenche #ot-cartoes-slot depois de a lista ser desenhada. Sem sonda, ou sem ver o inventário completo, o espaço fica vazio. */
export async function preencherCartoes(p, sites) {
    const lidas = await lerSondas(p, sites);
    const sensores = (lidas?.por || []).flatMap((x) => x.sensores);
    if (!sensores.length) return;
    let pontos = null;
    try { pontos = await api('GET', `/api/v1/projects/${p.id}/ot/sensores/pontos`); } catch { /* o cartão de saúde segue sem a contagem */ }
    let nDesvios = null;
    try { nDesvios = lista(await api('GET', `/api/v1/projects/${p.id}/ot/desvios?situacao=aberto`), 'desvios').length; } catch { /* a linha some */ }
    const slot = el('ot-cartoes-slot');
    if (!slot) return; // outra tela já foi desenhada
    const emDia = sensores.filter((s) => s.saude === 'em_dia').length;
    const ultimo = sensores.map((s) => s.ultimo_envio).filter(Boolean).sort().pop();
    const corSaude = emDia === sensores.length ? 'success' : emDia ? 'warning' : 'danger';
    const n = (v, um, varios) => `<strong>${v}</strong> ${v === 1 ? um : varios}`;
    slot.innerHTML = `<div class="d-flex gap-3 mb-4" id="ot-cartoes-coleta">
        <section class="card" aria-labelledby="ot-saude-titulo"><h3 id="ot-saude-titulo">Saúde da coleta</h3>
        <p>${renderStatusBadge(corSaude, `${emDia} de ${sensores.length}`)} <span>· Último resumo ${escapeHTML(ultimo ? haQuanto(ultimo) : 'nunca')}</span></p></section>
        <section class="card" aria-labelledby="ot-pontos-titulo"><h3 id="ot-pontos-titulo">Pontos a esclarecer</h3>
        ${pontos ? `<p>${n(pontos.ativos, 'ativo', 'ativos')} · ${n(pontos.fluxos, 'fluxo', 'fluxos')} <span class="badge selo-info">${seloDoAchado({ evidencia: EVIDENCIA_SENSOR })}</span></p>
        <p class="org-dica">Rascunhos que a sonda trouxe e ninguém revisou.</p>${nDesvios === null ? '' : `<p>${n(nDesvios, 'desvio aberto', 'desvios abertos')}</p>`}` : '<p class="org-dica">Não foi possível contar os pontos agora.</p>'}</section></div>`;
}
