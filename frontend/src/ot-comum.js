import { S } from './state.js';
import { escapeHTML, pedirTexto } from './ui.js';
import { api } from './api.js';

// Peças comuns das abas do n.ot (views/ot.js, ot-coleta.js, ot-saidas.js). Os papéis aqui só ESCONDEM o que a API recusaria; a
// barreira é o servidor (src/services/ot-inventario.ts: podeEditarOt, podeCriarLote, podeVerCompleto/podeAprovar).
// IP e MAC aparecem como a API devolve (mascarados ou completos) e vivem só na memória da tela: nunca em localStorage,
// sessionStorage, endereço ou cache.

export const baseOt = (proj) => `/api/v1/projects/${encodeURIComponent(proj.id)}/ot`;
const papel = () => S.user?.role || '';

/** Cadastra e altera o inventário, exporta e pede rascunho à IA: Gestor ARCiber (org_admin) e a equipe. */
export const podeEditarOt = () => ['org_admin', 'consultor', 'consultant', 'consultoria_admin', 'platform_admin'].includes(papel());
/** Cria lote de coleta: quem edita e o técnico (org_user), este só nos sites concedidos. */
export const podeCriarLote = () => podeEditarOt() || papel() === 'org_user';
/** Aprova ou rejeita lote: quem vê o inventário em claro. O consultoria_admin só no projeto em que está designado (o servidor confere). */
export const podeAprovarOt = () => ['org_admin', 'consultor', 'consultant', 'consultoria_admin'].includes(papel());
/** "Revelar" é do platform_admin, que vê mascarado por padrão; quem vê completo já recebe o valor (a API decide `mascarado`). */
export const podeRevelar = (ativo) => !!ativo && ativo.mascarado === true && papel() === 'platform_admin';

/** Mensagem para a tela; o 403 diz claramente que é falta de permissão, com o motivo do servidor sem o "Forbidden:". */
export function mensagemDeErro(e, padrao) {
    const m = String((e && e.message) || '').replace(/^Forbidden:\s*/i, '').trim();
    if (e && e.status === 403 && e.body?.codigo !== 'totp_necessario') return `Sem permissão: ${m || 'seu papel não faz esta ação no n.ot'}.`.replace(/\.\.$/, '.');
    return m || padrao;
}

export const lista = (r, chave) => (Array.isArray(r?.[chave]) ? r[chave] : Array.isArray(r) ? r : []);
export const opcoes = (pares, atual) => pares.map(([v, r]) => `<option value="${escapeHTML(v)}"${String(v) === String(atual ?? '') ? ' selected' : ''}>${escapeHTML(r)}</option>`).join('');
export const nomeDe = (xs, id) => (xs.find((x) => x.id === id) || {}).nome || '—';

export const TIPOS_SITE = { subestacao: 'Subestação', usina: 'Usina', centro_operacao: 'Centro de operação', outro: 'Outro' };
export const CRITICIDADE = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const TIPOS_ZONA = { supervisao: 'Supervisão', dmz_operativa: 'DMZ operativa', corporativa: 'Corporativa', outra: 'Outra' };
export const CATEGORIAS = { centro_operacao: 'Centro de operação', infra_dados_voz: 'Infraestrutura de dados e voz', ambiente_ons: 'Ambiente ONS' };

/** "Modbus:502, DNP3:20000" ↔ [{ protocolo, porta }]. Porta que não é inteiro de 0 a 65535 devolve null (a tela avisa). */
export function lerProtocolos(texto) {
    const out = [];
    for (const p of String(texto || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
        const i = p.lastIndexOf(':');
        if (i < 0) { out.push({ protocolo: p }); continue; }
        const protocolo = p.slice(0, i).trim();
        const porta = p.slice(i + 1).trim();
        if (!protocolo || !/^\d+$/.test(porta) || Number(porta) > 65535) return null;
        out.push({ protocolo, porta: Number(porta) });
    }
    return out;
}
export const protocolosTexto = (xs) => (Array.isArray(xs) ? xs : []).map((p) => (p.porta === undefined || p.porta === null ? p.protocolo : `${p.protocolo}:${p.porta}`)).join(', ');

const campo = (id, rotulo, valor, extra = '') => `<div class="form-group"><label class="form-label" for="${id}">${rotulo}</label>`
    + `<input class="form-input" id="${id}" value="${escapeHTML(valor ?? '')}"${extra}></div>`;
const marca = (id, rotulo, ligado) => `<label class="opcao-check mb-3" for="${id}"><input type="checkbox" id="${id}"${ligado ? ' checked' : ''}> ${rotulo}</label>`;

/**
 * Campos do ativo (4.3.1 da RO-CB.BR.01), para o cadastro e para a entrada manual da coleta. `d` é o ativo como a API devolve ou o
 * rascunho da IA. Na edição, IP e MAC nascem vazios: em branco mantém o registrado (o valor mascarado não volta ao servidor).
 */
export function camposDoAtivo(d = {}, { zonas = [], edicao = false } = {}) {
    const ipMac = edicao ? ' placeholder="Em branco: mantém o valor registrado" autocomplete="off"' : ' autocomplete="off"';
    return `${campo('ot-f-nome', 'Nome', d.nome, ' maxlength="200"')}
        <div class="form-group"><label class="form-label" for="ot-f-zona">Zona</label>
            <select class="form-input" id="ot-f-zona"><option value="">Sem zona</option>${opcoes(zonas.map((z) => [z.id, `${z.nome} (nível ${z.nivel_purdue})`]), d.zona_id)}</select></div>
        ${marca('ot-f-arciber', 'Ativo do ARCiber (exige os campos mínimos do 4.3.1)', d.no_arciber === true)}
        <div class="form-group"><label class="form-label" for="ot-f-categoria">Categoria ARCiber</label>
            <select class="form-input" id="ot-f-categoria"><option value="">—</option>${opcoes(Object.entries(CATEGORIAS), d.categoria_arciber)}</select></div>
        ${campo('ot-f-tipo', 'Tipo de dispositivo', d.tipo_dispositivo, ' maxlength="200"')}
        ${campo('ot-f-fabricante', 'Fabricante', d.fabricante, ' maxlength="200"')}
        ${campo('ot-f-modelo', 'Modelo', d.modelo, ' maxlength="200"')}
        ${campo('ot-f-funcao', 'Função', d.funcao, ' maxlength="500"')}
        ${campo('ot-f-ip', 'Endereço IP', edicao ? '' : d.ip, `${ipMac} maxlength="100"`)}
        ${campo('ot-f-mac', 'Endereço MAC', edicao ? '' : d.mac, `${ipMac} maxlength="100"`)}
        ${campo('ot-f-protocolos', 'Protocolos e portas (ex.: Modbus:502, DNP3:20000)', protocolosTexto(d.protocolos_portas), ' maxlength="2000"')}
        ${campo('ot-f-firmware', 'Firmware ou sistema operacional (versão)', d.firmware_so_versao, ' maxlength="200"')}
        ${marca('ot-f-firmware-na', 'Firmware/SO não se aplica', d.firmware_nao_aplicavel === true)}
        <p class="org-dica">Ativo do ARCiber precisa de categoria, tipo, fabricante, função, IP ou MAC, ao menos um protocolo e firmware/SO (ou "não se aplica"). Não escreva IP nem MAC nos campos de texto livre.</p>`;
}

/**
 * Lê os campos do ativo. `vazio`: 'nulo' (cadastro: campo vazio vira null) ou 'omitir' (item da coleta: só o que foi digitado).
 * IP e MAC só entram quando digitados. Devolve { erro } se os protocolos não forem lidos.
 */
export function lerCamposDoAtivo({ vazio = 'nulo' } = {}) {
    const v = (id) => document.getElementById(id)?.value.trim() || '';
    const marcado = (id) => !!document.getElementById(id)?.checked;
    const protocolos = lerProtocolos(v('ot-f-protocolos'));
    if (!protocolos) return { erro: 'Protocolos e portas: use "protocolo:porta", separados por vírgula, com porta de 0 a 65535.' };
    const d = {
        nome: v('ot-f-nome'), zona_id: v('ot-f-zona'), no_arciber: marcado('ot-f-arciber'), categoria_arciber: v('ot-f-categoria'),
        tipo_dispositivo: v('ot-f-tipo'), fabricante: v('ot-f-fabricante'), modelo: v('ot-f-modelo'), funcao: v('ot-f-funcao'),
        protocolos_portas: protocolos, firmware_so_versao: v('ot-f-firmware'), firmware_nao_aplicavel: marcado('ot-f-firmware-na'),
    };
    for (const [k, x] of Object.entries(d)) {
        if (x !== '') continue;
        if (vazio === 'omitir' || k === 'nome') delete d[k]; else d[k] = null;
    }
    if (vazio === 'omitir' && !protocolos.length) delete d.protocolos_portas;
    if (v('ot-f-ip')) d.ip = v('ot-f-ip');
    if (v('ot-f-mac')) d.mac = v('ot-f-mac');
    return { dados: d };
}

/** Situação de um item da RO-CB.BR.01 calculada do inventário: só três, e nenhuma afirma que o item é cumprido. */
export const SITUACAO = {
    nao_atende: ['danger', 'Não atende'],
    evidencia_no_inventario: ['info', 'Evidência no inventário'],
    sem_evidencia: ['warning', 'Sem evidência'],
};

/**
 * Revelar e exportar (P1-1): o servidor pede o TOTP confirmado nos últimos 10 min (403 `totp_necessario`). Aqui a tela pede o código,
 * confirma em /auth/mfa/verify (o mesmo do login, que carimba a sessão) e repete `fazer` uma vez. Conta sem TOTP ativo e o 429 do teto
 * por hora sobem como erro, com a mensagem do servidor.
 */
export async function comStepUp(fazer) {
    try { return await fazer(); } catch (e) {
        if (!(e && e.status === 403 && e.body && e.body.codigo === 'totp_necessario' && e.body.totp_ativo)) throw e;
    }
    const codigo = await pedirTexto('Esta ação pede o código de 6 dígitos do seu autenticador (vale por 10 minutos).',
        { titulo: 'Confirmar o segundo fator', rotulo: 'Confirmar' });
    if (codigo === null) return null;
    await api('POST', '/api/v1/auth/mfa/verify', { codigo: codigo.trim() });
    return fazer();
}
