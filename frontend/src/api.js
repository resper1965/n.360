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
        if (e.name === 'TimeoutError') throw new Error(`Tempo esgotado ao chamar ${p} (${Math.round((timeoutMs || 30000) / 1000)}s)`);
        if (e.name === 'AbortError') throw new Error(`Requisição cancelada (${p})`);
        throw new Error(`Falha de rede ao chamar ${p}`);
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
        throw new Error(`Resposta HTTP ${r.status} não é JSON (${p})`);
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
        throw new Error('Unauthorized');
    }
    if (!r.ok) {
        const err = new Error(data.error || (data.details ? data.details.map(i => i.message).join(', ') : 'API Error'));
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

export { api, baixarArquivo };
window.api = api;
