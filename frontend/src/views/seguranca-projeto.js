import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML, showToast } from '../ui.js';

// Segurança do projeto (SSO, SCIM e política). Só a equipe da consultoria: as rotas são `somenteNess` em src/routes/projects.ts
// e o servidor recusa o resto com 403; aqui só se decide o que MOSTRAR. O client_secret é só de escrita: a API nunca o devolve
// e a tela nunca o repõe no campo. O token SCIM aparece uma vez, logo depois de gerado.

// Projeto ativo, sem cair em outro: editar o cliente errado é pior que não editar. `alvo` fixa o id no render, para o clique
// gravar no projeto que a tela mostrou, mesmo que o projeto ativo mude no meio.
const projetoAtivo = () => S.activeProject;
let alvo = null;
const e = (v) => escapeHTML(String(v ?? ''));
const PAPEIS = [['org_admin', 'Administrador do cliente'], ['org_user', 'Usuário do cliente'], ['client', 'Cliente (leitura)']];
const val = (id) => document.getElementById(id)?.value ?? '';
const msg = (id, t) => { const n = document.getElementById(id); if (n) n.textContent = t || ''; };

async function renderSegurancaProjeto(c, h, a) {
    h.textContent = 'Segurança do projeto';
    alvo = null;
    a.innerHTML = '';
    if (!window.ehEquipeNess()) {
        c.innerHTML = window.renderEmptyState({ titulo: 'Acesso restrito', texto: 'Esta tela é da equipe da consultoria.' });
        return;
    }
    const proj = projetoAtivo();
    alvo = proj?.id ?? null;
    if (!proj) {
        c.innerHTML = window.renderSemProjeto();
        return;
    }
    h.textContent = `Segurança do projeto: ${proj.project_name || proj.client_name || proj.id}`;
    c.innerHTML = '<div class="loading"></div>';
    let sso, pol;
    try {
        [sso, pol] = await Promise.all([
            api('GET', `/api/v1/projects/${proj.id}/sso`),
            api('GET', `/api/v1/projects/${proj.id}/security-policy`),
        ]);
    } catch (err) {
        if (alvo !== proj.id || S.view !== 'seguranca-projeto') return; // render velho: outro projeto ou outra tela
        c.innerHTML = window.renderEmptyState({ titulo: 'Não foi possível carregar', texto: err.message });
        return;
    }
    if (alvo !== proj.id || S.view !== 'seguranca-projeto') return; // render velho: não pinta o formulário de um projeto sobre o de outro
    const s = sso?.sso || null;
    const p = pol?.politica || {};
    const ips = String(p.ip_allowlist || '').split(',').map((x) => x.trim()).filter(Boolean).join(', ');
    const campo = (id, rotulo, valor, extra = '') => `<div class="form-group"><label class="form-label" for="${id}">${rotulo}</label><input class="form-input" id="${id}" value="${e(valor)}" ${extra}></div>`;
    c.innerHTML = `
        <section class="card fade-in" aria-labelledby="sso-titulo" style="margin-bottom:1.5rem;padding:1.25rem">
            <h3 id="sso-titulo" style="margin:0 0 .25rem">Login corporativo (SSO)</h3>
            <p class="form-hint" style="margin:0 0 1rem">Quem controla o issuer controla quem entra. O papel padrão vale para contas criadas no primeiro acesso.</p>
            ${campo('sso-issuer', 'Issuer (URL https)', s?.issuer)}
            ${campo('sso-client-id', 'Client ID', s?.client_id)}
            <div class="form-group">
                <label class="form-label" for="sso-secret">Client secret</label>
                <input class="form-input" id="sso-secret" type="password" autocomplete="new-password" placeholder="Digite para definir ou trocar">
                <p id="sso-secret-estado" class="form-hint" style="margin:.25rem 0 0">Segredo ${s ? 'definido' : 'não definido'}. Ele nunca é mostrado; a gravação exige digitá-lo de novo.</p>
            </div>
            ${campo('sso-dominios', 'Domínios de e-mail (separados por vírgula)', s?.dominios)}
            <div class="form-group">
                <label class="form-label" for="sso-papel">Papel padrão</label>
                <select class="form-input" id="sso-papel">${PAPEIS.map(([v, t]) => `<option value="${v}"${(s?.papel_padrao || 'org_user') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
            </div>
            <label style="display:flex;gap:.5rem;align-items:center;margin-bottom:1rem"><input type="checkbox" id="sso-ativo"${s?.ativo ? ' checked' : ''}> SSO ativo neste projeto</label>
            <p id="sso-erro" role="alert" style="color:var(--danger);margin:0 0 .5rem"></p>
            <button class="btn btn-primary" data-action="salvarSsoProjeto">Salvar SSO</button>
        </section>

        <section class="card fade-in" aria-labelledby="scim-titulo" style="margin-bottom:1.5rem;padding:1.25rem">
            <h3 id="scim-titulo" style="margin:0 0 .25rem">Provisionamento (SCIM)</h3>
            <p class="form-hint" style="margin:0 0 1rem">Gerar um token novo invalida o anterior. O token aparece uma vez.</p>
            <p id="scim-erro" role="alert" style="color:var(--danger);margin:0 0 .5rem"></p>
            <button class="btn btn-primary" data-action="gerarTokenScim">Gerar token SCIM</button>
            <div id="scim-novo" role="status" aria-live="polite"></div>
        </section>

        <section class="card fade-in" aria-labelledby="pol-titulo" style="margin-bottom:1.5rem;padding:1.25rem">
            <h3 id="pol-titulo" style="margin:0 0 .25rem">Política de segurança</h3>
            <p class="form-hint" style="margin:0 0 1rem">Vale para os usuários deste cliente. Uma lista de IPs que não casa com ninguém tranca o cliente para fora.</p>
            <label style="display:flex;gap:.5rem;align-items:center;margin-bottom:1rem"><input type="checkbox" id="pol-mfa"${p.mfa_obrigatorio ? ' checked' : ''}> MFA obrigatório para usuários do cliente</label>
            ${campo('pol-ttl', 'Duração da sessão em segundos (300 a 86400; vazio usa o padrão)', p.sessao_ttl_seg, 'type="number" min="300" max="86400" step="1"')}
            <div class="form-group">
                <label class="form-label" for="pol-ips">IPs permitidos (IPv4 ou CIDR, separados por vírgula ou linha; vazio libera todos)</label>
                <textarea class="form-input" id="pol-ips" rows="3">${e(ips)}</textarea>
            </div>
            <p id="pol-erro" role="alert" style="color:var(--danger);margin:0 0 .5rem"></p>
            <button class="btn btn-primary" data-action="salvarPoliticaProjeto">Salvar política</button>
        </section>`;
}

window.salvarSsoProjeto = async function () {
    const proj = { id: alvo };
    if (!alvo) return;
    msg('sso-erro', '');
    const secret = val('sso-secret');
    if (!secret) { msg('sso-erro', 'Digite o client_secret: a rota o exige a cada gravação.'); return; }
    try {
        await api('PUT', `/api/v1/projects/${proj.id}/sso`, {
            issuer: val('sso-issuer').trim(), client_id: val('sso-client-id').trim(), client_secret: secret,
            dominios: val('sso-dominios').trim(), papel_padrao: val('sso-papel'),
            ativo: !!document.getElementById('sso-ativo')?.checked,
        });
        const campo = document.getElementById('sso-secret');
        if (campo) campo.value = '';
        const est = document.getElementById('sso-secret-estado');
        if (est) est.textContent = 'Segredo definido. Ele nunca é mostrado; a gravação exige digitá-lo de novo.';
        showToast('SSO salvo');
    } catch (err) {
        msg('sso-erro', err.message || 'Não foi possível salvar o SSO.');
    }
};

window.gerarTokenScim = async function () {
    const proj = { id: alvo };
    if (!alvo) return;
    msg('scim-erro', '');
    try {
        const r = await api('POST', `/api/v1/projects/${proj.id}/scim-token`);
        document.getElementById('scim-novo').innerHTML = `
            <div style="margin-top:1rem;padding:1rem;border:1px solid var(--border);">
                <label class="form-label" for="scim-url">URL base do SCIM</label>
                <div style="display:flex;gap:.5rem;margin-bottom:.75rem">
                    <input class="form-input" id="scim-url" readonly value="${e(r.base_url)}">
                    <button class="btn btn-ghost" data-action="copiarScim" data-args='["scim-url"]'>Copiar</button>
                </div>
                <label class="form-label" for="scim-token">Token</label>
                <div style="display:flex;gap:.5rem">
                    <input class="form-input" id="scim-token" readonly value="${e(r.token)}">
                    <button class="btn btn-ghost" data-action="copiarScim" data-args='["scim-token"]'>Copiar</button>
                </div>
                <p class="form-hint" style="margin:.5rem 0 0">Copie agora: o token não aparece de novo. Gerar outro invalida este.</p>
            </div>`;
    } catch (err) {
        msg('scim-erro', err.message || 'Não foi possível gerar o token.');
    }
};

window.copiarScim = async function (id) {
    const campo = document.getElementById(id);
    if (!campo) return;
    try {
        await navigator.clipboard.writeText(campo.value);
        showToast('Copiado');
    } catch {
        campo.select();
        showToast('Selecione o texto e copie com Ctrl+C');
    }
};

window.salvarPoliticaProjeto = async function () {
    const proj = { id: alvo };
    if (!alvo) return;
    msg('pol-erro', '');
    const ttl = val('pol-ttl').trim();
    const ips = val('pol-ips').split(/[,\n]/).map((x) => x.trim()).filter(Boolean).join(',');
    try {
        await api('PUT', `/api/v1/projects/${proj.id}/security-policy`, {
            mfa_obrigatorio: !!document.getElementById('pol-mfa')?.checked,
            sessao_ttl_seg: ttl ? Number(ttl) : null,
            ip_allowlist: ips,
        });
        showToast('Política salva');
    } catch (err) {
        msg('pol-erro', err.message || 'Não foi possível salvar a política.');
    }
};

export { renderSegurancaProjeto };
window.renderSegurancaProjeto = renderSegurancaProjeto;
