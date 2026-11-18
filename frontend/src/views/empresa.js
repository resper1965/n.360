import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, openModal, escapeHTML, formatarData } from '../ui.js';
import { modulosDaPessoa, orgDireta } from '../produto.js';
import { semRepetir } from '../ot-comum.js';

// Cadastro da empresa do projeto (migration 0071) e o assistente "Novo projeto". O servidor decide tudo de novo:
// CNPJ com dígito verificador, duplicidade na organização, quem cria e quem edita. Aqui é só a tela.

/** Quem cria projeto e consulta CNPJ (decisão do dono): platform_admin e o administrador da consultoria. */
export const podeCriarProjeto = () => !!S.user && ['platform_admin', 'consultoria_admin'].includes(S.user.role);

export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

/** Espelho de `cnpjValido` (src/schemas/corpos.ts): 14 dígitos e os dois verificadores do módulo 11. */
export function cnpjValido(d) {
    if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
    const dv = (n) => {
        let s = 0;
        for (let i = 0; i < n; i++) s += Number(d[i]) * ((n - i - 1) % 8 + 2);
        const r = s % 11;
        return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

export function mascaraCnpj(v) {
    const d = soDigitos(v).slice(0, 14);
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

export function mascaraCep(v) {
    const d = soDigitos(v).slice(0, 8);
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// Grupos do formulário: [campo, rótulo, atributos extras]. Os nomes são as colunas de `empresas`.
const GRUPOS = [
    ['Identificação', [
        ['razao_social', 'Razão social', 'maxlength="300" required'], ['nome_fantasia', 'Nome fantasia', 'maxlength="300"'],
        ['natureza_juridica', 'Natureza jurídica', 'maxlength="200"'], ['porte', 'Porte', 'maxlength="100"'],
        ['data_abertura', 'Data de abertura', 'type="date"'], ['situacao_cadastral', 'Situação cadastral', 'maxlength="100"'],
    ]],
    ['Atividade', [
        ['cnae_codigo', 'CNAE principal (código)', 'maxlength="20"'], ['cnae_descricao', 'CNAE principal (descrição)', 'maxlength="300"'],
        ['setor', 'Setor', 'maxlength="200"'], ['funcionarios', 'Funcionários', 'type="number" min="0" step="1"'],
    ]],
    ['Endereço', [
        ['cep', 'CEP', 'maxlength="20" inputmode="numeric" data-action-input="mascararCepCampo" data-arg-el'], ['logradouro', 'Logradouro', 'maxlength="300"'],
        ['numero', 'Número', 'maxlength="30"'], ['complemento', 'Complemento', 'maxlength="200"'],
        ['bairro', 'Bairro', 'maxlength="200"'], ['municipio', 'Município', 'maxlength="200"'], ['uf', 'UF', 'maxlength="2"'],
    ]],
    ['Contato', [
        ['telefone', 'Telefone', 'maxlength="40" type="tel"'], ['email', 'E-mail', 'maxlength="320" type="email"'], ['site', 'Site', 'maxlength="500"'],
    ]],
];
const CAMPOS_TEXTO = GRUPOS.flatMap(([, cs]) => cs.map(([k]) => k));

const grade = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0 16px';

const valorDe = (e, k) => (k === 'cnpj' ? mascaraCnpj(e.cnpj || '') : k === 'cep' && e.cep ? mascaraCep(e.cep) : e[k] ?? '');

/**
 * O formulário da empresa (assistente e "Dados da empresa"). `editar` desliga os campos; `consultar` mostra o botão de
 * buscar o CNPJ. Os ids são `emp-<campo>`; mensagens em `#emp-cnpj-msg` e `#emp-consulta` (aria-live).
 */
export function formEmpresaHtml(e = {}, { editar = true, consultar = podeCriarProjeto(), representante = false } = {}) {
    const dis = editar ? '' : 'disabled';
    const semCnpj = !e.cnpj && (!!e.documento_alternativo || (e.pais && e.pais !== 'BR'));
    const campo = ([k, rotulo, extra]) => `<div class="form-group"><label class="form-label" for="emp-${k}">${rotulo}</label>
        <input class="form-input" id="emp-${k}" name="${k}" value="${escapeHTML(valorDe(e, k))}" ${extra} ${dis}></div>`;
    const grupos = (representante ? [...GRUPOS, ['Representante legal', [['representante_nome', 'Nome', 'maxlength="200"'], ['representante_cargo', 'Cargo', 'maxlength="200"']]]] : GRUPOS)
        .map(([titulo, cs]) => `<fieldset style="border:0;padding:0;margin:0 0 0.5rem"><legend class="form-label" style="font-weight:600;margin-bottom:0.5rem">${titulo}</legend>
            <div style="${grade}">${cs.map(campo).join('')}</div></fieldset>`).join('');
    return `
        <div class="form-group">
            <label style="display:inline-flex;gap:8px;align-items:center;cursor:pointer">
                <input type="checkbox" id="emp-sem-cnpj" data-action-change="alternarSemCnpj" data-arg-el ${semCnpj ? 'checked' : ''} ${dis}> Empresa sem CNPJ (estrangeira ou dispensada)
            </label>
        </div>
        <div id="emp-bloco-cnpj" style="${semCnpj ? 'display:none' : ''}">
            <div class="form-group"><label class="form-label" for="emp-cnpj">CNPJ</label>
                <div style="display:flex;gap:8px">
                    <input class="form-input" id="emp-cnpj" name="cnpj" inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00" value="${escapeHTML(valorDe(e, 'cnpj'))}"
                        aria-describedby="emp-cnpj-msg" data-action-input="mascararCnpjCampo" data-arg-el ${consultar ? 'data-action-blur="cnpjSaiuDoCampo" data-arg-el' : ''} ${dis}>
                    ${consultar && editar ? '<button type="button" class="btn" data-action="buscarDadosDoCnpj">Buscar dados do CNPJ</button>' : ''}
                </div>
                <div id="emp-cnpj-msg" role="status" aria-live="polite" style="font-size:0.8rem;color:var(--text-dim);margin-top:4px"></div>
            </div>
            <div id="emp-consulta" role="status" aria-live="polite"></div>
        </div>
        <div id="emp-bloco-alt" style="${grade};${semCnpj ? '' : 'display:none'}">
            <div class="form-group"><label class="form-label" for="emp-documento_alternativo">Documento (registro no país de origem)</label>
                <input class="form-input" id="emp-documento_alternativo" maxlength="100" value="${escapeHTML(e.documento_alternativo || '')}" ${dis}></div>
            <div class="form-group"><label class="form-label" for="emp-pais">País</label>
                <input class="form-input" id="emp-pais" maxlength="60" value="${escapeHTML(e.pais || 'BR')}" ${dis}></div>
        </div>
        ${grupos}`;
}

/** Lê o formulário no formato do `empresaSchema` (vazio vira null: o servidor limpa o campo). */
export function lerFormEmpresa(representante = false) {
    const v = (k) => { const el = document.getElementById(`emp-${k}`); return el ? el.value.trim() : ''; };
    const semCnpj = !!document.getElementById('emp-sem-cnpj')?.checked;
    const out = {};
    for (const k of [...CAMPOS_TEXTO, ...(representante ? ['representante_nome', 'representante_cargo'] : [])]) out[k] = v(k) || null;
    out.cnpj = semCnpj ? null : soDigitos(v('cnpj')) || null;
    out.documento_alternativo = semCnpj ? v('documento_alternativo') || null : null;
    out.pais = semCnpj ? v('pais') || 'BR' : 'BR';
    out.cep = out.cep ? (soDigitos(out.cep).length === 8 && out.pais === 'BR' ? soDigitos(out.cep) : out.cep) : null;
    out.uf = out.uf ? out.uf.toUpperCase() : null;
    out.funcionarios = v('funcionarios') === '' ? null : Number(v('funcionarios'));
    return out;
}

window.mascararCnpjCampo = function (el) {
    el.value = mascaraCnpj(el.value);
    const d = soDigitos(el.value);
    const msg = document.getElementById('emp-cnpj-msg');
    if (msg) msg.textContent = d.length < 14 ? '' : cnpjValido(d) ? 'CNPJ válido.' : 'CNPJ inválido: confira os dígitos.';
};
window.mascararCepCampo = function (el) {
    if (document.getElementById('emp-sem-cnpj')?.checked) return; // CEP estrangeiro: sem máscara
    el.value = mascaraCep(el.value);
};
window.alternarSemCnpj = function (el) {
    document.getElementById('emp-bloco-cnpj').style.display = el.checked ? 'none' : '';
    document.getElementById('emp-bloco-alt').style.display = el.checked ? '' : 'none';
    document.getElementById(el.checked ? 'emp-documento_alternativo' : 'emp-cnpj')?.focus();
};

// O último CNPJ consultado: sair do campo sem mudar não repete a consulta.
let ultimaConsulta = '';
window.cnpjSaiuDoCampo = function (el) {
    const d = soDigitos(el.value);
    if (cnpjValido(d) && d !== ultimaConsulta) return window.buscarDadosDoCnpj();
};

/** Consulta a BrasilAPI pelo servidor e PROPÕE os dados: tudo fica editável, nada é gravado aqui. */
let consultando = null; // sair do campo e clicar no botão disparam juntos: a mesma consulta serve aos dois
window.buscarDadosDoCnpj = function () {
    const d = soDigitos(document.getElementById('emp-cnpj')?.value);
    if (consultando && consultando.d === d) return consultando.p;
    const p = consultar(d).finally(() => { consultando = null; });
    consultando = { d, p };
    return p;
};
async function consultar(d) {
    const caixa = document.getElementById('emp-consulta');
    const msg = document.getElementById('emp-cnpj-msg');
    if (!cnpjValido(d)) { if (msg) msg.textContent = 'CNPJ inválido: confira os dígitos.'; return; }
    ultimaConsulta = d;
    if (caixa) caixa.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem">Consultando a Receita Federal...</p>';
    let r;
    try { r = await api('GET', `/api/v1/projects/consulta-cnpj/${d}`); } catch { // falha nunca bloqueia salvar: a pessoa preenche à mão
        if (caixa) caixa.innerHTML = `<p style="color:var(--text-dim);font-size:0.85rem">A consulta de CNPJ está indisponível. Preencha os dados à mão.</p>`;
        return;
    }
    const partes = [];
    const projetoAtual = S.empresaProjetoId;
    if (r.existente && r.existente.id !== projetoAtual) {
        partes.push(`<p style="color:var(--warning);font-size:0.85rem">Já existe: <strong>${escapeHTML(r.existente.nome)}</strong>.
            <button type="button" class="btn btn-ghost btn-sm" data-action="abrirProjetoExistente" data-args='${escapeHTML(JSON.stringify([r.existente.id]))}'>Abrir?</button></p>`);
    }
    if (r.indisponivel || !r.proposta) {
        partes.push('<p style="color:var(--text-dim);font-size:0.85rem">A consulta de CNPJ está indisponível. Preencha os dados à mão.</p>');
    } else {
        const p = r.proposta;
        for (const k of [...CAMPOS_TEXTO]) {
            const el = document.getElementById(`emp-${k}`);
            if (el && p[k] != null && p[k] !== '') el.value = k === 'cep' ? mascaraCep(p[k]) : String(p[k]);
        }
        const situacao = String(p.situacao_cadastral || '');
        if (situacao && situacao.toUpperCase() !== 'ATIVA') {
            partes.push(`<p style="color:var(--warning);font-size:0.85rem">Situação cadastral na Receita: <strong>${escapeHTML(situacao)}</strong>. Confirme com o cliente antes de seguir.</p>`);
        }
        partes.push('<p style="color:var(--text-dim);font-size:0.85rem">Dados trazidos da Receita como proposta: confira e corrija o que precisar.</p>');
    }
    if (caixa) caixa.innerHTML = partes.join('');
}

window.abrirProjetoExistente = async function (id) {
    window.forceCloseModal();
    if (typeof window.openProjectDetail === 'function') await window.openProjectDetail(id);
};

// ─── Assistente "Novo projeto" ─────────────────────────────────────────────────────────────────────────

const NORMAS = [['ISO 27001', 'ISO/IEC 27001:2022'], ['ISO 27701:2025', 'ISO/IEC 27701:2025'], ['LGPD', 'LGPD']];
const PAPEIS = [['Controller', 'Controlador'], ['Processor', 'Operador'], ['Both', 'Controlador e operador']];
const PASSOS = ['Empresa', 'Programa', 'Pessoas-chave', 'Resumo', 'Pessoas e acessos', 'Primeiros passos'];

let W = null;

const $ = (id) => document.getElementById(id);
const NOME_MODULO = { iso: 'n.iso', privacy: 'n.privacy', ot: 'n.ot' };
/** A organização em que o projeto nasceu é direta? A do platform_admin é a do seletor (X-Org-Id); a dos outros, a da sessão. */
const orgDoProjetoDireta = () => {
    const t = S.user && S.user.role === 'platform_admin' && typeof window.tipoOrgAtuacao === 'function' ? window.tipoOrgAtuacao() : null;
    // Falha fechada: o platform_admin sem o tipo da organização carregado recebe só a opção de equipe (o servidor decide de qualquer forma).
    if (S.user && S.user.role === 'platform_admin') return t ? t === 'direta' : true;
    return orgDireta();
};
/** Papéis do passo: a direta só tem equipe (onda 1, decisão 8; o servidor recusa o resto); a consultoria convida também o cliente. */
const papeisDoPasso = () => (orgDoProjetoDireta() ? [['consultor', 'Pessoa da equipe']]
    : [['consultor', 'Consultor'], ['org_admin', 'Gestor do cliente'], ['org_user', 'Colaborador do cliente']]);
/** Módulos que se oferecem a uma pessoa: os do projeto que quem convida também tem (espelho do teto; o servidor decide). */
const modulosOferecidos = () => { const meus = modulosDaPessoa(); return W.projeto.modulos.filter((m) => !meus || meus.includes(m)); };
/** P0-1: o n.ot nunca nasce marcado para uma pessoa; só vale marcado à mão. */
const novaPessoa = () => ({ nome: '', email: '', papel: 'consultor', modulos: modulosOferecidos().filter((m) => m !== 'ot') });

function linhaPessoa(p, i) {
    const off = p.convidado ? ' disabled' : '';
    const semDesignar = p.convidado && !p.designado && p.papel === 'consultor'
        ? ` <button type="button" class="btn btn-ghost btn-sm" data-action="novoProjetoIr" data-args='[6]'>Continuar sem designar</button>` : '';
    return `<fieldset class="np-pessoa"><legend class="form-label">Pessoa ${i + 1}</legend>
        <div class="form-group"><label class="form-label" for="np-p${i}-nome">Nome</label><input class="form-input" id="np-p${i}-nome" maxlength="200" value="${escapeHTML(p.nome)}"${off}></div>
        <div class="form-group"><label class="form-label" for="np-p${i}-email">E-mail</label><input class="form-input" id="np-p${i}-email" type="email" maxlength="320" value="${escapeHTML(p.email)}"${off}></div>
        <div class="form-group"><label class="form-label" for="np-p${i}-papel">Papel</label><select class="form-input" id="np-p${i}-papel"${off}>${papeisDoPasso().map(([v, r]) => `<option value="${v}" ${p.papel === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <fieldset class="np-modulos"><legend class="form-label">Módulos</legend>${modulosOferecidos().map((m) => `<label><input type="checkbox" name="np-p${i}-modulo" value="${escapeHTML(m)}" ${p.modulos.includes(m) ? 'checked' : ''}${off}> ${NOME_MODULO[m] || escapeHTML(m)}${m === 'ot' ? ' (só se marcado)' : ''}</label>`).join('')}</fieldset>
        <p class="np-erro-pessoa" id="np-p${i}-erro" role="alert">${escapeHTML(p.msg || '')}</p>${semDesignar}</fieldset>`;
}

function pessoasHtml() {
    return `<p class="np-dica">Convide quem vai trabalhar no projeto. Cada pessoa recebe um e-mail para criar a senha. O n.ot nunca vem marcado: só dá acesso se for marcado aqui, pessoa a pessoa.</p>
        ${W.acessos.map(linhaPessoa).join('')}
        <button type="button" class="btn btn-ghost btn-sm" data-action="novoProjetoMaisPessoa">Adicionar pessoa</button>`;
}

function primeirosHtml() { return '<p>O projeto foi criado.</p>'; }

/** Lê as linhas do passo 5 para `W.acessos` (sem validar: validar é do convidar). */
function lerAcessos() {
    W.acessos = W.acessos.map((p, i) => (p.convidado ? p : {
        nome: ($(`np-p${i}-nome`) || {}).value?.trim() ?? p.nome,
        email: ($(`np-p${i}-email`) || {}).value?.trim() ?? p.email,
        papel: ($(`np-p${i}-papel`) || {}).value || p.papel,
        modulos: [...document.querySelectorAll(`input[name="np-p${i}-modulo"]:checked`)].map((x) => x.value),
    }));
}

const erroDoPasso = (texto) => {
    const el = document.getElementById('np-erro');
    if (el) el.textContent = texto || '';
};

function passoHtml() {
    const cab = `<div class="modal-header"><span class="modal-title" id="np-titulo" tabindex="-1">Novo projeto — ${PASSOS[W.passo - 1]}</span>
        </div>
        <ol style="display:flex;gap:16px;list-style:none;padding:0;margin:0 0 1rem;font-size:0.8rem">${PASSOS.map((p, i) =>
            `<li ${i + 1 === W.passo ? 'aria-current="step" style="color:var(--accent);font-weight:600"' : 'style="color:var(--text-dim)"'}>${i + 1}. ${p}</li>`).join('')}</ol>`;
    const erro = '<div id="np-erro" role="alert" aria-live="assertive" style="color:var(--danger-ink);font-size:0.85rem;min-height:1.2em;margin:0.5rem 0"></div>';
    // Depois de criado o projeto (passos 5 e 6) não há "Voltar": o projeto já existe.
    if (W.passo === 5) return `${cab}<div id="np-passo">${pessoasHtml()}</div>${erro}<div class="np-rodape"><button class="btn btn-ghost" data-action="novoProjetoIr" data-args='[6]'>Pular</button><button class="btn btn-primary" data-action="novoProjetoConvidar">Convidar e seguir</button></div>`;
    if (W.passo === 6) return `${cab}<div id="np-passo">${primeirosHtml()}</div>${erro}<div class="np-rodape"><span></span><button class="btn btn-primary" data-action="novoProjetoFechar">Fechar</button></div>`;
    const voltar = W.passo > 1 ? `<button class="btn btn-ghost" data-action="novoProjetoIr" data-args='[${W.passo - 1}]'>Voltar</button>` : '<span></span>';
    const seguir = W.passo < 4
        ? `<button class="btn btn-primary" data-action="novoProjetoIr" data-args='[${W.passo + 1}]'>Continuar</button>`
        : '<button class="btn btn-primary" id="np-criar" data-action="criarNovoProjeto">Criar projeto</button>';
    const rodape = `${erro}<div style="display:flex;justify-content:space-between;gap:8px;margin-top:0.5rem">${voltar}${seguir}</div>`;
    let corpo = '';
    if (W.passo === 1) corpo = formEmpresaHtml(W.empresa, { editar: true, consultar: true });
    if (W.passo === 2) {
        const meus = modulosDaPessoa() || ['iso'];
        const p = W.programa;
        corpo = `
            <div class="form-group"><label class="form-label" for="np-nome">Nome do projeto</label>
                <input class="form-input" id="np-nome" maxlength="500" value="${escapeHTML(p.project_name || '')}" placeholder="Ex.: SGSI 2027"></div>
            <fieldset style="border:0;padding:0;margin:0 0 1rem"><legend class="form-label">Normas</legend>
                ${NORMAS.map(([v, r]) => `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="np-norma" value="${v}" ${p.normas.includes(v) ? 'checked' : ''}> ${r}</label>`).join('')}</fieldset>
            <div class="form-group"><label class="form-label" for="np-papel">Papel na LGPD</label>
                <select class="form-input" id="np-papel">${PAPEIS.map(([v, r]) => `<option value="${v}" ${p.org_role === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
            <fieldset style="border:0;padding:0;margin:0 0 1rem"><legend class="form-label">Módulos</legend>
                ${meus.map((m) => `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="np-modulo" value="${m}" ${p.modulos.includes(m) ? 'checked' : ''}> n.${m}</label>`).join('')}
                <p style="color:var(--text-dim);font-size:0.8rem;margin:4px 0 0">Só os módulos que a consultoria contratou. O limite de projetos do plano é conferido ao criar.</p></fieldset>`;
    }
    if (W.passo === 3) {
        const r = W.pessoas.representante, d = W.pessoas.dpo;
        corpo = `<p style="color:var(--text-dim);font-size:0.85rem;margin-top:0">Opcional. As duas pessoas entram em Partes do projeto; o DPO como encarregado do n.privacy. Não pedimos CPF.</p>
            <fieldset style="border:0;padding:0;margin:0 0 1rem"><legend class="form-label" style="font-weight:600">Representante legal</legend><div style="${grade}">
                <div class="form-group"><label class="form-label" for="np-rep-nome">Nome</label><input class="form-input" id="np-rep-nome" maxlength="200" value="${escapeHTML(r.nome)}"></div>
                <div class="form-group"><label class="form-label" for="np-rep-cargo">Cargo</label><input class="form-input" id="np-rep-cargo" maxlength="200" value="${escapeHTML(r.cargo)}"></div></div></fieldset>
            <fieldset style="border:0;padding:0;margin:0"><legend class="form-label" style="font-weight:600">Encarregado (DPO)</legend><div style="${grade}">
                <div class="form-group"><label class="form-label" for="np-dpo-nome">Nome</label><input class="form-input" id="np-dpo-nome" maxlength="200" value="${escapeHTML(d.nome)}"></div>
                <div class="form-group"><label class="form-label" for="np-dpo-email">E-mail</label><input class="form-input" id="np-dpo-email" type="email" maxlength="320" value="${escapeHTML(d.email)}"></div></div></fieldset>`;
    }
    if (W.passo === 4) {
        const e = W.empresa, p = W.programa, ps = W.pessoas;
        const linha = (r, v) => `<tr><th scope="row" style="text-align:left;padding:4px 12px 4px 0;color:var(--text-dim);font-weight:500">${r}</th><td>${escapeHTML(v || '—')}</td></tr>`;
        corpo = `<table style="width:100%;border-collapse:collapse;font-size:0.9rem"><tbody>
            ${linha('Empresa', e.razao_social)}${linha('Nome fantasia', e.nome_fantasia)}
            ${linha(e.cnpj ? 'CNPJ' : 'Documento', e.cnpj ? mascaraCnpj(e.cnpj) : e.documento_alternativo)}
            ${linha('Local', [e.municipio, e.uf].filter(Boolean).join('/') + (e.pais && e.pais !== 'BR' ? ` (${e.pais})` : ''))}
            ${linha('Projeto', p.project_name || e.nome_fantasia || e.razao_social)}${linha('Normas', p.normas.join(', '))}
            ${linha('Papel na LGPD', (PAPEIS.find(([v]) => v === p.org_role) || [, ''])[1])}${linha('Módulos', p.modulos.map((m) => `n.${m}`).join(', '))}
            ${linha('Representante legal', [ps.representante.nome, ps.representante.cargo].filter(Boolean).join(', '))}
            ${linha('Encarregado (DPO)', [ps.dpo.nome, ps.dpo.email].filter(Boolean).join(', '))}
        </tbody></table>`;
    }
    return `${cab}<div id="np-passo">${corpo}</div>${rodape}`;
}

function mostrarPasso() {
    openModal(passoHtml(), 'modal-large');
    // Foco: no primeiro campo do passo; no resumo, no título (leitor de tela anuncia o passo).
    const alvo = W.passo >= 4 ? document.getElementById('np-titulo') : document.querySelector('#np-passo input:not([type=checkbox]):not([disabled]), #np-passo select');
    alvo?.focus();
}

/** Guarda o que está na tela do passo atual e diz o erro que impede seguir (ou ''). */
function guardarPasso() {
    if (W.passo === 5) { lerAcessos(); return ''; }
    if (W.passo === 1) {
        W.empresa = lerFormEmpresa();
        if (!W.empresa.razao_social && !W.empresa.nome_fantasia) return 'Informe a razão social (ou o nome fantasia).';
        if (W.empresa.cnpj && !cnpjValido(W.empresa.cnpj)) return 'CNPJ inválido: confira os dígitos ou marque "Empresa sem CNPJ".';
    }
    if (W.passo === 2) {
        W.programa = {
            project_name: document.getElementById('np-nome').value.trim(),
            normas: [...document.querySelectorAll('input[name=np-norma]:checked')].map((x) => x.value),
            org_role: document.getElementById('np-papel').value,
            modulos: [...document.querySelectorAll('input[name=np-modulo]:checked')].map((x) => x.value),
        };
        if (!W.programa.modulos.length) return 'Escolha ao menos um módulo.';
    }
    if (W.passo === 3) {
        const v = (id) => document.getElementById(id).value.trim();
        W.pessoas = { representante: { nome: v('np-rep-nome'), cargo: v('np-rep-cargo') }, dpo: { nome: v('np-dpo-nome'), email: v('np-dpo-email') } };
        if (W.pessoas.dpo.email && !W.pessoas.dpo.nome) return 'Informe o nome do DPO.';
        if (W.pessoas.representante.cargo && !W.pessoas.representante.nome) return 'Informe o nome do representante legal.';
    }
    return '';
}

window.abrirNovoProjeto = function () {
    if (!podeCriarProjeto()) return;
    const meus = modulosDaPessoa() || ['iso'];
    ultimaConsulta = '';
    S.empresaProjetoId = null;
    W = { passo: 1, empresa: { pais: 'BR' }, programa: { project_name: '', normas: ['ISO 27001'], org_role: 'Controller', modulos: [...meus] },
        pessoas: { representante: { nome: '', cargo: '' }, dpo: { nome: '', email: '' } } };
    mostrarPasso();
};

window.novoProjetoIr = function (passo) {
    if (!W) return;
    if (W.passo >= 5 && passo < 5) return; // o projeto já existe
    // Voltar não valida; seguir valida o passo atual.
    if (passo > W.passo) {
        const erro = guardarPasso();
        if (erro) { erroDoPasso(erro); return; }
    } else guardarPasso();
    W.passo = passo;
    mostrarPasso();
};

window.criarNovoProjeto = async function () {
    if (!W) return;
    const btn = document.getElementById('np-criar');
    if (btn) btn.disabled = true;
    const e = W.empresa, p = W.programa, ps = W.pessoas;
    const pessoas = {};
    if (ps.representante.nome) pessoas.representante = { nome: ps.representante.nome, cargo: ps.representante.cargo || null };
    if (ps.dpo.nome) pessoas.dpo = { nome: ps.dpo.nome, email: ps.dpo.email || null };
    const corpo = {
        client_name: e.nome_fantasia || e.razao_social,
        project_name: p.project_name || null,
        standards: p.normas.join(', ') || null,
        org_role: p.org_role,
        modulos: p.modulos,
        empresa: e,
        ...(Object.keys(pessoas).length ? { pessoas } : {}),
    };
    let r;
    try { r = await api('POST', '/api/v1/projects', corpo); } catch (err) {
        if (btn) btn.disabled = false;
        const outro = err && err.body && err.body.projeto_existente;
        if (outro) {
            const caixa = document.getElementById('np-erro');
            if (caixa) caixa.innerHTML = `Já existe: <strong>${escapeHTML(outro.nome)}</strong>. <button type="button" class="btn btn-ghost btn-sm" data-action="abrirProjetoExistente" data-args='${escapeHTML(JSON.stringify([outro.id]))}'>Abrir?</button>`;
            return;
        }
        erroDoPasso((err && err.message) || 'Não foi possível criar o projeto');
        return;
    }
    showToast('Projeto criado.', 'success');
    if (typeof window.loadProjects === 'function') await window.loadProjects();
    W.projeto = { id: r.id, modulos: Array.isArray(r.modulos) ? r.modulos : [] };
    W.acessos = [novaPessoa()];
    W.passo = 5;
    mostrarPasso();
};

window.novoProjetoFechar = () => { W = null; window.forceCloseModal(); if (typeof window.render === 'function') window.render(); };

window.novoProjetoMaisPessoa = function () {
    if (!W || W.passo !== 5) return;
    lerAcessos();
    W.acessos.push(novaPessoa());
    mostrarPasso();
};

/** Convida cada linha preenchida (POST /users; consultor também designado no projeto). Erro fica na linha; só segue sem erro. */
window.novoProjetoConvidar = () => semRepetir('novoProjetoConvidar', async () => {
    if (!W || W.passo !== 5) return;
    lerAcessos();
    const pid = W.projeto.id;
    let falhou = false;
    for (const [i, p] of W.acessos.entries()) {
        if (p.designado || (!p.nome && !p.email)) continue;
        const erro = (t) => { p.msg = t; const el = $(`np-p${i}-erro`); if (el) el.textContent = t; falhou = true; };
        const cliente = p.papel !== 'consultor';
        if (!p.convidado) {
            if (!p.nome || !p.email) { erro('Informe nome e e-mail.'); continue; }
            if (!p.modulos.length) { erro('Escolha ao menos um módulo.'); continue; }
            try {
                const r = await api('POST', '/api/v1/users', { name: p.nome, email: p.email, role: p.papel, client_project_id: cliente ? pid : null, modulos: p.modulos });
                p.convidado = true; // a conta existe: o retry nunca repete o convite
                p.msg = 'Convite enviado.';
                if (r && r.emailEnviado === false) { p.msg = 'Conta criada, mas o e-mail não foi enviado: reenvie o convite em Usuários.'; falhou = true; } // fica à vista até a pessoa seguir
            } catch (err) { erro((err && err.message) || 'Não foi possível convidar.'); continue; }
        }
        if (cliente) { p.designado = true; continue; }
        try {
            await api('POST', `/api/v1/projects/${pid}/governance`, { name: p.nome, email: p.email, role_category: 'consultor', job_title: 'Consultor' });
            p.designado = true;
        } catch (err) { erro(`Convite enviado, mas a designação falhou: ${(err && err.message) || 'erro'}. Tente de novo ou designe em Governança.`); }
    }
    if (falhou) mostrarPasso();
    if (!falhou) window.novoProjetoIr(6);
});

// ─── Dados da empresa (projeto existente) ──────────────────────────────────────────────────────────────

window.abrirDadosEmpresa = async function (projectId) {
    let r;
    try { r = await api('GET', `/api/v1/projects/${projectId}/empresa`); } catch (e) { showToast((e && e.message) || 'Não foi possível ler o cadastro da empresa', 'error'); return; }
    const editar = !!r.pode_editar;
    ultimaConsulta = soDigitos(r.empresa && r.empresa.cnpj);
    S.empresaProjetoId = projectId;
    // Histórico: a trilha do projeto filtrada pela ação (quem e quando; os campos, nunca os valores).
    let hist = [];
    try { hist = (await api('GET', `/api/v1/projects/${projectId}/audit-trail`)).filter((l) => l.action === 'empresa.atualizada').slice(0, 10); } catch (e) { /* sem trilha: sem histórico */ }
    openModal(`
        <div class="modal-header"><span class="modal-title" id="emp-titulo" tabindex="-1">Dados da empresa</span></div>
        ${editar ? '' : '<p style="color:var(--text-dim);font-size:0.85rem;margin-top:0">Somente leitura: quem edita é a equipe da consultoria e o administrador do cliente.</p>'}
        ${formEmpresaHtml(r.empresa || {}, { editar, consultar: editar && podeCriarProjeto(), representante: true })}
        <div id="emp-erro" role="alert" aria-live="assertive" style="color:var(--danger-ink);font-size:0.85rem;min-height:1.2em"></div>
        ${editar ? `<button class="btn btn-primary" data-action="salvarDadosEmpresa" data-args='${escapeHTML(JSON.stringify([projectId]))}'>Salvar</button>` : ''}
        ${hist.length ? `<h4 style="margin:1.25rem 0 0.5rem">Histórico</h4><ul style="margin:0;padding-left:1.2rem;font-size:0.8rem;color:var(--text-dim)">${hist.map((l) =>
            `<li>${formatarData(l.created_at, { hora: true })} · ${escapeHTML(l.actor || '')} · ${escapeHTML(String(l.details || '').replace(/^.*?:\s*/, '') || 'cadastro atualizado')}</li>`).join('')}</ul>` : ''}
    `, 'modal-large');
    document.getElementById('emp-titulo')?.focus();
};

window.salvarDadosEmpresa = async function (projectId) {
    const dados = lerFormEmpresa(true);
    const erro = document.getElementById('emp-erro');
    if (dados.cnpj && !cnpjValido(dados.cnpj)) { if (erro) erro.textContent = 'CNPJ inválido: confira os dígitos.'; return; }
    try {
        await api('PUT', `/api/v1/projects/${projectId}/empresa`, dados);
    } catch (e) {
        const outro = e && e.body && e.body.projeto_existente;
        if (erro) erro.textContent = outro ? `Já existe: ${outro.nome}.` : (e && e.message) || 'Não foi possível salvar';
        return;
    }
    window.forceCloseModal();
    showToast('Dados da empresa salvos.', 'success');
    if (typeof window.loadProjects === 'function') await window.loadProjects();
    if (typeof window.render === 'function') window.render();
};

// ─── Empresas (n.privacy, menu do legado; spec 2026-10-19) ──────────────────────────────────────────────────
// A empresa do projeto numa lista de uma linha, como no legado; "Ver/Editar" abre o mesmo modal do "Dados da empresa" do painel.
window.renderEmpresas = async function (c, h, a) {
    h.textContent = 'Empresas';
    a.innerHTML = '';
    const proj = S.activeProject || (S.projects || [])[0];
    if (!proj) { c.innerHTML = window.renderSemProjeto(); return; }
    let r;
    try { r = await api('GET', `/api/v1/projects/${proj.id}/empresa`); } catch (e) { window.falhaDeCarga(c, a, 'Não foi possível carregar a empresa.', e); return; }
    const e = (r && r.empresa) || {};
    const cidade = [e.municipio, e.uf].filter(Boolean).join('/');
    c.innerHTML = window.renderDataTable(['Empresa', 'CNPJ', 'Cidade', 'Ações'], [[
        `<strong>${escapeHTML(e.nome_fantasia || e.razao_social || proj.client_name || '—')}</strong>`,
        escapeHTML(e.cnpj ? mascaraCnpj(e.cnpj) : e.documento_alternativo || '—'),
        escapeHTML(cidade || '—'),
        `<button class="btn btn-ghost btn-sm" data-action="abrirDadosEmpresa" data-args='${escapeHTML(JSON.stringify([proj.id]))}'>Ver/Editar</button>`,
    ]]);
};
