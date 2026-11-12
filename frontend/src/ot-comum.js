import { S } from './state.js';
import { escapeHTML, pedirTexto } from './ui.js';
import { api } from './api.js';

// Peças comuns das abas do n.ot (views/ot.js, ot-coleta.js, ot-saidas.js). Os papéis aqui só ESCONDEM o que a API recusaria; a
// barreira é o servidor (src/services/ot-inventario.ts: podeEditarOt, podeCriarLote, podeVerCompleto/podeAprovar).
// IP e MAC aparecem como a API devolve (mascarados ou completos) e vivem só na memória da tela: nunca em localStorage,
// sessionStorage, endereço ou cache.

/** `created_at` do SQLite (`YYYY-MM-DD HH:MM:SS`, UTC sem Z) como Date; sem isto o navegador leria no fuso local. */
export const dataDoSqlite = (s) => (s == null ? null : new Date(/^\d{4}-\d{2}-\d{2} /.test(s) ? `${s.replace(' ', 'T')}Z` : s));

const papel = () => S.user?.role || '';

/** Classe do botão principal da tela: a tela do site tem um só primário (o cartão Próximo passo), as sub-abas pedem `semPrimario`. */
export const classePrimario = (sem) => (sem ? 'btn' : 'btn btn-primary');
/** O Gestor ARCiber (org_admin) aprova e devolve a base; o servidor confere de novo (`ehGestorArciber`). */
export const ehGestor = () => papel() === 'org_admin';

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
    // 400 do esquema: a recusa de endereço ou de dado pessoal em texto livre explica o motivo e a saída; ela vem em `details`, não em `error`.
    const explicada = e?.status === 400 && (e.body?.details || []).map((d) => d.message).find((t) => /dado sensível|^Não informe/.test(String(t)));
    if (explicada) return explicada;
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

/** Rótulo de cada campo do ativo: o mesmo no formulário e nos erros e avisos que a API devolve por `campo` (nunca a chave na tela). */
export const ROTULO_CAMPO = {
    nome: 'Nome', zona: 'Zona', zona_id: 'Zona', no_arciber: 'Ativo do ARCiber', categoria_arciber: 'Categoria ARCiber', tipo_dispositivo: 'Tipo de dispositivo',
    fabricante: 'Fabricante', modelo: 'Modelo', funcao: 'Função', ip: 'Endereço IP', mac: 'Endereço MAC', protocolos_portas: 'Protocolos e portas',
    firmware_so_versao: 'Firmware ou sistema operacional (versão)', firmware_nao_aplicavel: 'Firmware/SO não se aplica', '4.3.1': 'Campos mínimos do 4.3.1',
};
/** Lista de erros/avisos `[{ campo, motivo }]` da API, com o rótulo do campo; '—' se não houver. */
export const listaDeErros = (xs, classe = '') => (xs && xs.length
    ? `<ul class="m-0${classe ? ` ${classe}` : ''}">${xs.map((x) => `<li>${escapeHTML(ROTULO_CAMPO[x.campo] || 'Campo não reconhecido')}: ${escapeHTML(x.motivo)}</li>`).join('')}</ul>` : '—');

/** Nome dos ativos do inventário já carregado nesta tela (id → nome; nunca IP/MAC), para dizer qual ativo a duplicata ou o achado confirma. */
export const nomesDeAtivos = new Map();
export const nomeDoAtivo = (id) => (id && nomesDeAtivos.get(id)) || 'ativo existente';

const ponta = (d, lado, nomes) => {
    const id = d[`${lado}_ativo_id`] || d[`${lado}_zona_id`];
    if (id) return (Object.hasOwn(nomes, id) && nomes[id]) || 'ponta removida';
    return d.externo ? 'Fora da empresa' : '—';
};
/** "origem → destino" de um fluxo (texto, a escapar por quem mostra). `nomes`: `nomes_pontas` da API (id → nome; nunca IP/MAC). */
export const rotaDoFluxo = (d = {}, nomes = {}) => `${ponta(d, 'origem', nomes)} → ${ponta(d, 'destino', nomes)}`;

/**
 * Campos do ativo (4.3.1 da RO-CB.BR.01), para o cadastro e para a entrada manual da coleta. `d` é o ativo como a API devolve ou o
 * rascunho da IA. Na edição, IP e MAC nascem vazios: em branco mantém o registrado (o valor mascarado não volta ao servidor).
 * `recolher`: o nome fica à vista e o resto vai para "Detalhes do ativo (opcional)" (o achado durante a entrevista).
 */
export function camposDoAtivo(d = {}, { zonas = [], edicao = false, recolher = false } = {}) {
    const R = ROTULO_CAMPO;
    const ipMac = edicao ? ' placeholder="Em branco: mantém o valor registrado" autocomplete="off"' : ' autocomplete="off"';
    const resto = `<div class="form-group"><label class="form-label" for="ot-f-zona">${R.zona}</label>
            <select class="form-input" id="ot-f-zona"><option value="">Sem zona</option>${opcoes(zonas.map((z) => [z.id, `${z.nome} (nível ${z.nivel_purdue})`]), d.zona_id)}</select></div>
        ${marca('ot-f-arciber', 'Ativo do ARCiber (exige os campos mínimos do 4.3.1)', d.no_arciber === true)}
        <div class="form-group"><label class="form-label" for="ot-f-categoria">${R.categoria_arciber}</label>
            <select class="form-input" id="ot-f-categoria"><option value="">—</option>${opcoes(Object.entries(CATEGORIAS), d.categoria_arciber)}</select></div>
        ${campo('ot-f-tipo', R.tipo_dispositivo, d.tipo_dispositivo, ' maxlength="200"')}
        ${campo('ot-f-fabricante', R.fabricante, d.fabricante, ' maxlength="200"')}
        ${campo('ot-f-modelo', R.modelo, d.modelo, ' maxlength="200"')}
        ${campo('ot-f-funcao', R.funcao, d.funcao, ' maxlength="500"')}
        ${campo('ot-f-ip', R.ip, edicao ? '' : d.ip, `${ipMac} maxlength="100"`)}
        ${campo('ot-f-mac', R.mac, edicao ? '' : d.mac, `${ipMac} maxlength="100"`)}
        ${campo('ot-f-protocolos', `${R.protocolos_portas} (ex.: Modbus:502, DNP3:20000)`, protocolosTexto(d.protocolos_portas), ' maxlength="2000"')}
        ${campo('ot-f-firmware', R.firmware_so_versao, d.firmware_so_versao, ' maxlength="200"')}
        ${marca('ot-f-firmware-na', R.firmware_nao_aplicavel, d.firmware_nao_aplicavel === true)}
        <p class="org-dica">Ativo do ARCiber precisa de categoria, tipo, fabricante, função, IP ou MAC, ao menos um protocolo e firmware/SO (ou "não se aplica"). Não escreva IP nem MAC nos campos de texto livre.</p>`;
    const nome = campo('ot-f-nome', R.nome, d.nome, ' maxlength="200"');
    return recolher ? `${nome}<details class="ot-detalhes"><summary>Detalhes do ativo (opcional)</summary>${resto}</details>` : `${nome}${resto}`;
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

export const FASE = { em_levantamento: 'Em levantamento', base_em_aprovacao: 'Base em aprovação', em_operacao: 'Em operação', em_obra: 'Em obra' };

/** Autoavaliação de um item de política do assessment (a do Gestor e da consultoria, não a do inventário). */
export const AVALIACAO = { atende: ['success', 'Atende'], parcial: ['warning', 'Parcial'], nao_atende: ['danger', 'Não atende'], nao_se_aplica: ['neutral', 'Não se aplica'] };

/** Situação de um item da RO-CB.BR.01 calculada do inventário: só três, e nenhuma afirma que o item é cumprido. */
export const SITUACAO = {
    nao_atende: ['danger', 'Não atende'],
    evidencia_no_inventario: ['info', 'Evidência no inventário'],
    sem_evidencia: ['warning', 'Sem evidência'],
};

/**
 * Revelar e exportar (P1-1): o servidor pede o TOTP confirmado nos últimos 10 min (403 `totp_necessario`). Aqui a tela pede o código,
 * confirma em /auth/mfa/verify (o mesmo do login, que carimba a sessão; código errado pede de novo) e repete `fazer` uma vez. Conta sem TOTP ativo e o 429 do teto
 * por hora sobem como erro, com a mensagem do servidor.
 */
export async function comStepUp(fazer) {
    try { return await fazer(); } catch (e) {
        if (!(e && e.status === 403 && e.body && e.body.codigo === 'totp_necessario' && e.body.totp_ativo)) throw e;
    }
    let texto = 'Esta ação pede o código de 6 dígitos do seu autenticador (vale por 10 minutos).';
    for (;;) {
        const codigo = await pedirTexto(texto, { titulo: 'Confirmar o segundo fator', rotulo: 'Confirmar', tipo: 'codigo' });
        if (codigo === null) return null;
        try { await api('POST', '/api/v1/auth/mfa/verify', { codigo }); break; } catch (e) {
            // Código errado (401) pede de novo: a justificativa já digitada fica em `fazer`. O resto (429, rede) sobe.
            if (!(e && e.status === 401)) throw e;
            texto = `${e.message || 'Código inválido'}. Digite o código atual do seu autenticador.`.replace(/\.\./, '.');
        }
    }
    return fazer();
}

/** Um envio por vez (aplicar não é idempotente; cada leitura gasta o teto por hora): os botões da ação ficam desabilitados até a resposta. */
let ocupado = false;
export async function semRepetir(acao, fazer) {
    if (ocupado) return;
    ocupado = true;
    const bs = [...document.querySelectorAll(`[data-action="${acao}"]`)];
    for (const b of bs) { b.disabled = true; b.setAttribute('aria-busy', 'true'); }
    try { await fazer(); } finally {
        ocupado = false;
        for (const b of bs) { b.disabled = false; b.removeAttribute('aria-busy'); }
    }
}
