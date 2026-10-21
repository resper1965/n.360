import { S } from './state.js';

export const API_BASE = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' ? 'http://127.0.0.1:8787' : window.location.origin;

// Cabeçalhos de autenticação de TODA chamada (api() e os fetch binários: logo, Word). O
// `X-Org-Id` só existe para o platform_admin que escolheu outra organização no seletor do
// cabeçalho (S.orgAtuacao); para qualquer outro papel nunca sai, mesmo com S.orgAtuacao
// preenchido: o servidor o ignora, mas mandar daria a impressão de que vale.
export function cabecalhosAuth() {
    const h = {};
    if (S.token) h['Authorization'] = `Bearer ${S.token}`;
    const org = S.user?.role === 'platform_admin' ? S.orgAtuacao : null;
    if (org && org !== 'org_ness') h['X-Org-Id'] = org;
    return h;
}

// Mensagens que chegam à tela: português de quem usa, sem caminho de API, código HTTP nem termo em inglês. O detalhe técnico
// vai só para o console. `codigo` deixa quem chama distinguir o caso sem casar texto (a importação repete por tempo esgotado).
const MSG = {
    tempo: 'O servidor demorou a responder. Tente de novo em instantes.',
    cancelado: 'A operação foi cancelada.',
    rede: 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.',
    formato: 'O servidor respondeu de um jeito inesperado. Tente de novo em instantes.',
    sessao: 'Sua sessão terminou. Entre de novo para continuar.',
};
// Texto genérico em inglês que o servidor (ou um proxy) às vezes devolve em `error`: não serve para a tela.
const ERRO_GENERICO = /^(unauthorized|forbidden|not found|internal server error|bad request|bad gateway|service unavailable|api error)$/i;
function porStatus(status) {
    if (status === 403) return 'Você não tem permissão para esta ação.';
    if (status === 404) return 'O registro não foi encontrado. Ele pode ter sido removido.';
    if (status === 429) return 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.';
    if (status >= 500) return 'O servidor não conseguiu concluir a operação. Tente de novo em instantes.';
    return 'Não foi possível concluir a operação. Confira os dados e tente de novo.';
}
function falha(codigo, detalhe, extra = {}) {
    console.error(`[api] ${detalhe}`);
    return Object.assign(new Error(MSG[codigo]), { codigo }, extra);
}

// `extras` carrega cabeçalho por chamada — hoje só o X-Operacao, que agrupa as
// linhas da trilha de uma ação em lote. Fica opcional para não tocar nas ~200
// chamadas existentes.
async function api(m, p, b, extras) {
    // `timeoutMs` (opcional) é do cliente, não vira cabeçalho: chamada lenta por natureza (IA) pede mais que os 30 s padrão.
    const { timeoutMs, ...cab } = extras || {};
    const headers = { 'Content-Type': 'application/json', ...cab, ...cabecalhosAuth() };
    // Escolha da própria chamada (filtro de organização da tela Usuários) vale sobre a do seletor do cabeçalho.
    if (cab['X-Org-Id'] && S.user?.role === 'platform_admin') headers['X-Org-Id'] = cab['X-Org-Id'];
    // AbortSignal.timeout é nativo: sem ele, um backend travado deixava a UI
    // esperando para sempre, sem erro e sem feedback.
    const o = { method: m, headers, signal: AbortSignal.timeout(timeoutMs || 30000) };
    if (b) o.body = JSON.stringify(b);
    let r;
    try {
        r = await fetch(API_BASE + p, o);
    } catch (e) {
        if (e.name === 'TimeoutError') throw falha('tempo', `tempo esgotado em ${m} ${p} (${Math.round((timeoutMs || 30000) / 1000)}s)`);
        if (e.name === 'AbortError') throw falha('cancelado', `requisição cancelada: ${m} ${p}`);
        throw falha('rede', `falha de rede em ${m} ${p}: ${e && e.message}`);
    }
    // 401 nas rotas de MFA é resposta ESPERADA a erro do usuário: senha errada
    // em /setup e /disable, código errado em /activate e /verify. Deslogar aqui
    // punia quem errou um dígito — no /verify chegava a destruir a sessão e
    // jogar o usuário de volta ao login. Estas rotas tratam o próprio erro e
    // precisam da mensagem real do servidor, não de "Unauthorized".
    // `/auth/change-password` entra na mesma isenção: "senha atual incorreta" é 401
    // esperado, e a tela de Trocar senha precisa mostrá-lo junto do campo.
    // Aprovar/recusar pedido (e o lote de aprovação) também: a decisão pede a senha, e "senha incorreta" (401) é erro do usuário.
    const autoatendimentoMfa = p.startsWith('/api/v1/auth/mfa/') || p === '/api/v1/auth/change-password'
        || /^\/api\/v1\/pedidos\/[^/]+\/(aprovar|recusar)$/.test(p) || p === '/api/v1/pedidos/lote';

    // O corpo é lido UMA vez. A checagem de 401 precisa dele (para separar
    // sessão expirada de sessão inválida) e o erro logo abaixo também; ler duas
    // vezes exigiria `clone()`, que nem todo Response de teste implementa.
    const contentType = r.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
        data = await r.json();
    } else {
        await r.text();
        throw falha('formato', `resposta HTTP ${r.status} sem JSON em ${m} ${p}`, { status: r.status });
    }

    if (r.status === 401 && p !== '/api/v1/auth/login' && !autoatendimentoMfa) {
        // Sessão expirada NÃO é o mesmo que sessão inválida. Expirou por
        // inatividade: o usuário continua sendo quem era e pode ter edição
        // aberta na tela — derrubar tudo perde o trabalho dele. Reautentica no
        // lugar, preservando o rascunho (ver pedirReautenticacao em globals.js).
        if (data?.expired === 'inactivity' && window.pedirReautenticacao) {
            window.pedirReautenticacao();
            throw new Error('Sessão expirada por inatividade');
        }
        if (window.doLogout) window.doLogout();
        throw falha('sessao', `401 em ${m} ${p}`, { status: 401 });
    }
    if (!r.ok) {
        const doServidor = data.error && !ERRO_GENERICO.test(String(data.error).trim()) ? data.error
            : (!data.error && data.details ? data.details.map(i => i.message).join(', ') : '');
        if (!doServidor) console.error(`[api] HTTP ${r.status} em ${m} ${p}`, data);
        const err = new Error(doServidor || porStatus(r.status));
        // O corpo inteiro fica pendurado no erro. O login precisa dos campos que
        // acompanham a mensagem (`challengeRequired`, `attemptsRemaining`,
        // `locked`) e antes eles se perdiam: só a string sobrevivia ao throw.
        err.status = r.status;
        err.body = data;
        throw err;
    }
    // Desembrulha só o envelope de lista pura: `{ ok: true, <uma lista> }` e mais nada.
    // Com qualquer outro campo (ou duas listas) devolve o objeto inteiro: antes a primeira
    // lista vinha e o resto sumia sem erro (entrevistas sem `questions`, lacunas sem
    // `coverage_pct`, jornada recebendo `titles` no lugar de `checklists`).
    if (data && data.ok === true) {
        const chaves = Object.keys(data).filter((k) => k !== 'ok');
        if (chaves.length === 1 && Array.isArray(data[chaves[0]])) return data[chaves[0]];
    }
    return data;
}

/**
 * Baixa um arquivo da API (CSV, Word) com o cabeçalho da sessão: o token nunca vai na URL. O nome sai do
 * Content-Disposition do servidor (já sanitizado lá). Erro vira exceção com a mensagem do servidor quando houver.
 */
async function baixarArquivo(p) {
    const r = await fetch(API_BASE + p, { headers: cabecalhosAuth(), signal: AbortSignal.timeout(60000) });
    if (!r.ok) {
        let msg = `Não foi possível baixar o arquivo (erro ${r.status})`;
        try { const d = await r.json(); if (d && d.error) msg = d.error; } catch (e) { /* corpo sem JSON */ }
        throw new Error(msg);
    }
    const nome = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || 'arquivo';
    const url = URL.createObjectURL(await r.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Relatório HTML autenticado: busca com o cabeçalho da sessão e abre o blob. O token nunca vai na URL
// (fica no histórico, no Referer e nos logs). Erro vira exceção com a mensagem para a tela.
async function abrirRelatorio(p) {
    // A aba abre antes do fetch: depois de um await o clique já não conta e o bloqueador de pop-up recusa a janela.
    const aba = window.open('', '_blank');
    if (!aba) throw new Error('O navegador bloqueou a nova janela. Permita pop-ups para este endereço.');
    let r;
    try { r = await fetch(API_BASE + p, { headers: cabecalhosAuth(), signal: AbortSignal.timeout(30000) }); }
    catch (e) { aba.close(); throw new Error('Não foi possível gerar o relatório'); }
    if (!r.ok) { aba.close(); throw new Error(`Não foi possível gerar o relatório (erro ${r.status})`); }
    const url = URL.createObjectURL(new Blob([await r.text()], { type: 'text/html;charset=utf-8' }));
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    aba.location.href = url;
}

export { api, baixarArquivo, abrirRelatorio };
window.api = api;
