import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';
import { sha256Hex, sessionRevoked, SESSION_TTL_SEC, ehPapelCliente } from '../helpers';
import { apiKeyRoleViolation, expirouPorInatividade, isAuditWrite, PAPEIS_IMPLEMENTACAO } from '../auth-policy';
import { situacaoLegal, rotaLiberadaComBloqueio, type DocumentoLegal } from '../legal-policy';
import { politicaDoProjeto, avaliarPolitica, type PoliticaTenant } from '../politica-tenant';
import { resolverAgente, acaoDestrutiva } from './agente';
import { logAudit } from '../helpers';
import { alvoDaExclusao } from '../trilha-exclusao';
import { ESCRITAS_DO_TECNICO } from '../services/ot-inventario';
import { equipeDeOrgSuspensa, orgDaEquipeAChecar, tipoDaOrg, ORG_SUSPENSA } from '../services/organizacao';

/** De quanto em quanto tempo a marca de atividade da sessão é reescrita. */
const RENOVA_ATIVIDADE_MS = 60 * 1000;

/**
 * Resolve o usuário a partir de uma API key (X-API-Key). Retorna o contexto de
 * usuário (escopado ao projeto da chave, papel read-only `client`) ou uma Response
 * de erro. A chave só é aceita se existir, estiver Active e não expirada.
 */
/** A linha de `api_keys` que a resolução precisa. Tipada porque `.first()` sem
 * parâmetro devolve `unknown` por coluna, e o antigo `c: any` escondia isso. */
interface LinhaChaveApi {
  id: string;
  project_id: string | null;
  name: string | null;
  permissions: string | null;
  status: string | null;
  expires_at: string | null;
}

async function resolveApiKeyUser(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  apiKey: string
): Promise<{ user: Variables['user']; writeCapable: boolean } | Response> {
  const keyHash = await sha256Hex(apiKey);
  const row = await c.env.DB.prepare(
    'SELECT id, project_id, name, permissions, status, expires_at FROM api_keys WHERE key_hash = ?'
  ).bind(keyHash).first<LinhaChaveApi>();

  if (!row || row.status !== 'Active' || (row.expires_at && new Date(row.expires_at) < new Date())) {
    return c.json({ error: 'Unauthorized: Invalid or expired API key' }, 401);
  }

  // Todo o isolamento de tenant de uma chave se apoia no `project_id` que ela
  // carrega — é ele que vira `client_project_id` logo abaixo. A coluna é
  // nullable no schema (`project_id TEXT REFERENCES projects(id)`), e uma chave
  // sem projeto passaria daqui como `client` sem escopo: o filtro do portfólio
  // (routes/platform.ts) só restringe quando `client_project_id` é truthy, então
  // ela enxergaria os projetos de TODOS os tenants. Hoje o único caminho de
  // criação tira o id do path e nunca grava nulo, mas isso é garantia de
  // chamador, não do schema — falha fechado aqui, no ponto onde a chave vira
  // identidade.
  if (!row.project_id) {
    return c.json({ error: 'Unauthorized: API key is not scoped to a project' }, 401);
  }

  // Falha fechada: a chave do agente de coleta do n.ot só vale em /ot-coleta/mcp (que não passa por aqui).
  // Sem isto, ela (não writeCapable) leria qualquer GET da API.
  if (row.permissions === 'ot_coleta') {
    return c.json({ error: 'Forbidden: a chave de coleta do n.ot só vale no endpoint do agente (/ot-coleta/mcp)' }, 403);
  }

  // Enforce permissions: chaves 'read' (o default) não podem executar mutações.
  // 'consultant' e 'auditor' escrevem, mas cada um só no seu conjunto de rotas
  // (ver auth-policy.ts) — é a independência 9.2 aplicada no backend.
  const method = c.req.method.toUpperCase();
  const writeCapable =
    row.permissions === 'write' ||
    row.permissions === 'admin' ||
    row.permissions === 'consultant' ||
    row.permissions === 'auditor';
  if (!writeCapable && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
    return c.json({ error: 'Forbidden: read-only API key cannot perform write operations' }, 403);
  }

  // Separação de papéis: consultor não registra achado; auditor não escreve
  // implementação. Não afeta 'write'/'admin' (retrocompatível).
  // `?? ''`: a coluna é nullable e `apiKeyRoleViolation` só reconhece
  // 'consultant'/'auditor' — string vazia cai no mesmo ramo permissivo em que
  // um NULL já caía, e a escrita segue barrada pelo `writeCapable` acima.
  // Comportamento idêntico ao anterior; o que muda é o tipo dizer isso.
  const roleViolation = apiKeyRoleViolation(row.permissions ?? '', method, c.req.path);
  if (roleViolation) {
    return c.json({ error: roleViolation }, 403);
  }

  // last_used_at é best-effort: não deve derrubar a request se falhar.
  await c.env.DB.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").bind(row.id).run().catch(() => {});

  // API keys entram como papel `client` escopado ao projeto, herdando o isolamento
  // de tenant. `writeCapable` é devolvido porque a autorização de escrita de uma
  // chave é o campo `permissions` acima — não o allow-list de humano read-only.
  //
  // `id` continua sendo só `apikey:<id>`: é ele que o rate limit usa como conta
  // (middleware/rate-limit.ts) e o nome não tem por que entrar nessa chave.
  //
  // `email` é o campo que vira `actor` no audit_logs e `uploaded_by` na evidência,
  // então é onde a rastreabilidade humana precisa aparecer: `apikey:<id>` sozinho
  // diz QUE chave agiu, mas o auditor quer QUEM. O prefixo vem antes do nome de
  // propósito — o nome é texto que o criador da chave escolhe, e um nome como
  // "admin@ness.io" passaria por usuário real se aparecesse primeiro. Com o
  // prefixo na frente, todo ator de chave é inconfundível, escreva-se o que for
  // no nome.
  return {
    user: {
      id: `apikey:${row.id}`,
      email: atorDaChave(row.id, row.name),
      role: 'client',
      client_project_id: row.project_id,
    },
    writeCapable,
  };
}

/** Identidade da chave para a trilha de auditoria: `apikey:<id> (<nome>)`. */
function atorDaChave(id: string, name: string | null): string {
  // Quebra de linha no nome viraria injeção de linha falsa num log lido como
  // texto; o teto evita que um nome enorme inche cada registro de auditoria.
  const limpo = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return limpo ? `apikey:${id} (${limpo})` : `apikey:${id}`;
}

// Rotas públicas validadas por token NO PRÓPRIO handler (não exigem sessão nISO):
// - links públicos de assessment (/api/v1/assessments/public/:token...) validam access_token.
// O portal do auditor externo (/api/v1/public/auditor/*) é montado antes deste middleware, com o
// token no corpo. '/api/v1/auditor-notes/...' é rota interna autenticada.
const PUBLIC_TOKEN_PREFIXES = ['/api/v1/assessments/public/'];

// Único conjunto que uma sessão AINDA pendente de segundo fator pode alcançar.
// Lista fechada, não prefixo: `/setup`, `/activate` e sobretudo `/disable` não
// entram — ver o comentário na checagem, abaixo.
const MFA_PENDENTE_PERMITIDO = new Set([
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/mfa/status',
]);

// Auto-serviço de MFA do próprio usuário. Não toca dado de tenant nenhum, e é o
// caminho que um papel read-only PRECISA percorrer para conseguir entrar: sem
// esta entrada no allow-list, um `org_user` com MFA ativo recebe 403 em
// /verify e fica trancado para fora em definitivo, mesmo com o código correto.
const MFA_AUTO_SERVICO = /^\/api\/v1\/auth\/mfa\/(setup|activate|verify|disable)$/;

// A própria senha, pelo mesmo argumento. `/reset-password-first` é o caminho
// OBRIGATÓRIO do primeiro acesso (`users.requires_password_change`): sem esta
// entrada, um `org_user` recém-criado recebe 403 ao definir a primeira senha e
// não consegue usar a conta. Nenhuma das duas toca dado de tenant — as duas
// escrevem só o hash do próprio usuário.
const SENHA_AUTO_SERVICO = /^\/api\/v1\/auth\/(change-password|reset-password-first)$/;

/**
 * Allow-list de CAMINHOS do papel `stakeholder` (mínimo privilégio), para qualquer método: perfil,
 * senha, MFA, aceite legal e, na fatia 2, `/api/v1/pedidos*`. Lista fechada: o resto do app é 403,
 * inclusive GET. Prefixo largo aqui abriria tudo; `test/stakeholder-acesso.test.ts` varre as rotas.
 */
const STAKEHOLDER_PERMITIDO: RegExp[] = [
  /^\/api\/v1\/auth\/(me|logout|change-password|reset-password-first)$/,
  /^\/api\/v1\/auth\/mfa\/(setup|activate|verify|disable|status)$/,
  /^\/api\/v1\/legal\/(pending|accept)$/,
  /^\/api\/v1\/pedidos(\/.*)?$/,
];

type Leitura = { orgSuspensa: boolean; orgDireta: boolean; docs: DocumentoLegal[]; aceitos: string[]; politica: PoliticaTenant | null; totp: number | null };
type Pedido = { org: string | null; legal: boolean; userId: string; projeto: string | null };
type LinhaDoc = { id: string; kind: string; version: string; classification: DocumentoLegal['classification']; title: string; url: string | null; published_at: string; aceito: number | null };
type LinhaPolitica = PoliticaTenant & { totp: number | null };

// O aceite vem junto do documento e o TOTP junto da política: uma consulta para cada par, como antes da #369 (nada a mais preparado).
const SQL_DOCS = `SELECT id, kind, version, classification, title, url, published_at,
    (SELECT 1 FROM legal_acceptances a WHERE a.document_id = legal_documents.id AND a.user_id = ?1) AS aceito
  FROM legal_documents WHERE published_at IS NOT NULL`;
const SQL_POLITICA = `SELECT project_id, mfa_obrigatorio, sessao_ttl_seg, ip_allowlist, (SELECT totp_enabled FROM users WHERE id = ?2) AS totp
  FROM project_security_policy WHERE project_id = ?1`;
const comoDoc = (d: LinhaDoc): DocumentoLegal => ({ id: d.id, kind: d.kind, version: d.version, classification: d.classification, title: d.title, url: d.url, publishedAt: d.published_at });

/**
 * As leituras que toda requisição autenticada faz (organização suspensa, documentos legais com o aceite, política do projeto com o
 * TOTP), num `db.batch`: uma viagem ao D1 no lugar de até cinco (#369, o banco fica longe do usuário). Se o batch falhar (tabela
 * ainda não migrada, por exemplo), refaz uma a uma, com o tratamento de erro de antes.
 */
async function lerChecagens(env: Bindings, q: Pedido): Promise<Leitura> {
  const db = env.DB;
  const stmts: D1PreparedStatement[] = [];
  const pos: { org?: number; docs?: number; politica?: number } = {};
  if (q.org) pos.org = stmts.push(db.prepare('SELECT status, tipo FROM organizations WHERE id = ?').bind(q.org)) - 1;
  if (q.legal) pos.docs = stmts.push(db.prepare(SQL_DOCS).bind(q.userId)) - 1;
  if (q.projeto) pos.politica = stmts.push(db.prepare(SQL_POLITICA).bind(q.projeto, q.userId)) - 1;
  if (!stmts.length) return { orgSuspensa: false, orgDireta: false, docs: [], aceitos: [], politica: null, totp: null };
  let r: D1Result[];
  try { r = await db.batch(stmts); } catch { return lerUmaAUma(env, q); }
  const linhas = <T>(i?: number) => (i === undefined ? [] : ((r[i].results ?? []) as T[]));
  const docs = linhas<LinhaDoc>(pos.docs);
  const pol = linhas<LinhaPolitica>(pos.politica)[0];
  return {
    orgSuspensa: q.org ? linhas<{ status: string | null }>(pos.org)[0]?.status !== 'Active' : false,
    orgDireta: q.org ? linhas<{ tipo: string | null }>(pos.org)[0]?.tipo === 'direta' : false,
    docs: docs.map(comoDoc),
    aceitos: docs.filter((d) => d.aceito === 1).map((d) => d.id),
    politica: pol ? { project_id: pol.project_id, mfa_obrigatorio: pol.mfa_obrigatorio, sessao_ttl_seg: pol.sessao_ttl_seg, ip_allowlist: pol.ip_allowlist } : null,
    totp: pol?.totp ?? null,
  };
}

/** O caminho de antes, consulta por consulta (só quando o batch falha). */
async function lerUmaAUma(env: Bindings, q: Pedido): Promise<Leitura> {
  const db = env.DB;
  const orgSuspensa = q.org ? await equipeDeOrgSuspensa(db, { role: 'consultor', org_id: q.org }) : false;
  const docs = q.legal ? await db.prepare(SQL_DOCS).bind(q.userId).all<LinhaDoc>().then((x) => x.results ?? []).catch(() => [] as LinhaDoc[]) : [];
  const politica = q.projeto ? await politicaDoProjeto(env, q.projeto) : null;
  const totp = politica ? ((await db.prepare('SELECT totp_enabled FROM users WHERE id = ?').bind(q.userId).first<{ totp_enabled: number | null }>())?.totp_enabled ?? null) : null;
  const orgDireta = q.org ? await tipoDaOrg(db, q.org) === 'direta' : false;
  return { orgSuspensa, orgDireta, docs: docs.map(comoDoc), aceitos: docs.filter((d) => d.aceito === 1).map((d) => d.id), politica, totp };
}

export const authMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  // Decodificado, como o roteador do Hono: o cru deixava `%69` passar pelas regras e chegar à rota.
  const path = c.req.path;
  if (PUBLIC_TOKEN_PREFIXES.some(p => path.startsWith(p))) {
    return next();
  }

  let user: Variables['user'];
  let apiKeyWriteCapable = false;
  let orgAChecar: string | null = null;

  const apiKey = c.req.header('X-API-Key');
  const agente = c.env.AGENTE;
  if (agente) {
    // Requisição interna do /mcp: precedência sobre chave e sessão.
    const resolvido = await resolverAgente(c, agente);
    if (resolvido instanceof Response) return resolvido;
    user = resolvido;
    apiKeyWriteCapable = true;
  } else if (apiKey) {
    const resolved = await resolveApiKeyUser(c, apiKey);
    if (resolved instanceof Response) return resolved;
    user = resolved.user;
    apiKeyWriteCapable = resolved.writeCapable;
  } else {
    const sessionId =
      c.req.header('X-Session-ID') ||
      c.req.header('Authorization')?.replace('Bearer ', '') ||
      c.req.query('token') ||
      c.req.query('sessionId') ||
      c.req.query('session_id') ||
      c.req.query('session');

    if (!sessionId) {
      return c.json({ error: 'Unauthorized: Missing session token' }, 401);
    }

    // Só a chave própria da sessão: o KV SESSIONS guarda também códigos e contadores (OTP do portal, código
    // de redefinição de senha) sob nomes que quem está de fora conhece, e eles não podem virar sessão.
    const sessionData = await c.env.SESSIONS.get(`session_${sessionId}`);
    if (!sessionData) {
      return c.json({ error: 'Unauthorized: Invalid or expired session' }, 401);
    }

    try {
      user = JSON.parse(sessionData);
    } catch (e) {
      return c.json({ error: 'Unauthorized: Malformed session data' }, 401);
    }
    // Sessão de verdade sempre tem conta, papel e carimbo (o login, o SSO e o MFA gravam os três).
    if (!user || typeof user !== 'object' || !user.id || typeof user.role !== 'string' || !user.iat) {
      return c.json({ error: 'Unauthorized: Malformed session data' }, 401);
    }

    // Sessão pode ter sido revogada depois de emitida (troca de senha, mudança
    // de papel, exclusão do usuário). Sem esta checagem, uma sessão roubada
    // sobrevive à troca de senha por até 24h — a sessão vive no KV sob um token
    // aleatório e não há como enumerá-la para apagar.
    if (await sessionRevoked(c.env.SESSIONS, user.id, user.iat)) {
      return c.json({ error: 'Unauthorized: Session revoked, please sign in again' }, 401);
    }

    // Sessão pendente de segundo fator: só pode falar com /verify e /status.
    // Sem esta trava o MFA seria decorativo — o token do login já daria acesso
    // a tudo. E liberar todo o /auth/mfa/* era quase tão ruim: quem tem a senha
    // obtém a sessão pendente e a usa em /disable, apresentando a MESMA senha
    // para desligar o segundo fator. O fator caía com exatamente aquilo que ele
    // existe para complementar.
    if (user.mfa_pending && !MFA_PENDENTE_PERMITIDO.has(path.replace(/\/+$/, ''))) {
      return c.json({ error: 'Unauthorized: Second factor required', mfa_required: true }, 401);
    }

    // Guarda o identificador para que /auth/mfa/verify possa reescrever a
    // própria sessão ao confirmar o código.
    c.set('sessionId', sessionId);

    // Expiração por INATIVIDADE, separada do teto absoluto de 24 h: 30 min para
    // papel de Cliente, 8 h para consultor. Antes só existia o teto, então uma
    // sessão de cliente aberta num navegador compartilhado seguia válida o dia
    // inteiro sem ninguém tocar nela.
    const agora = Date.now();
    // Sessão sem marca nenhuma não expira por inatividade aqui: `sessionRevoked` já a recusou acima.
    const visto = user.seen ?? user.iat ?? agora;
    if (expirouPorInatividade(agora, visto, user.role)) {
      await c.env.SESSIONS.delete(`session_${sessionId}`);
      await c.env.SESSIONS.delete(sessionId);
      return c.json({ error: 'Unauthorized: Session expired due to inactivity', expired: 'inactivity' }, 401);
    }

    // Renova a marca de atividade, mas só de minuto em minuto: reescrever a
    // sessão a cada requisição seria uma escrita de KV por chamada de API.
    // O TTL é o RESTANTE do teto de 24 h, nunca 24 h de novo — renovar o teto
    // faria a sessão viver para sempre e a revalidação diária nunca chegaria.
    if (agora - visto > RENOVA_ATIVIDADE_MS) {
      const restante = Math.floor((SESSION_TTL_SEC * 1000 - (agora - (user.iat ?? agora))) / 1000);
      if (restante > 60) {
        const renovada = { ...user, seen: agora };
        await c.env.SESSIONS.put(`session_${sessionId}`, JSON.stringify(renovada), { expirationTtl: restante });
      }
    }

    // Legacy role mapping for backward compatibility.
    // Keep consistent with the login handler (routes/auth.ts): 'admin' is a
    // platform-level admin, not a project-scoped org_admin.
    //
    // `consultant` → `consultor`, e NÃO `platform_admin`. Esta linha era a única
    // das três que traduzia a palavra assim: o login (routes/auth.ts) e a
    // listagem (routes/users.ts) sempre mandaram para `consultor`. Como o
    // middleware roda em toda requisição, uma sessão que ainda carregasse
    // `consultant` — emitida antes daquela normalização, ou reescrita por outro
    // caminho — era promovida a administrador de plataforma a cada chamada.
    //
    // Consultor entrega serviço a cliente; administrador opera a plataforma.
    // São coisas diferentes, e uma letra de diferença entre as duas grafias não
    // pode ser o que decide qual delas a conta é.
    if (user.role === 'admin') user.role = 'platform_admin';
    else if (user.role === 'user') user.role = 'org_user';
    else if (user.role === 'consultant') user.role = 'consultor';
    else if (user.role === 'client_admin') user.role = 'client';
    // `employee`: grafia antiga de conta de cliente (há uma em produção, de 22/07/2026). Sem este mapa
    // ela virava papel desconhecido e, com o corte de acesso por papel, perdia o projeto do próprio cliente.
    else if (user.role === 'employee') user.role = 'org_user';
    // Só CLIENTE é preso a projeto por `client_project_id`. Em conta de equipe (ou papel
    // desconhecido) o campo não vale nada, e rota que o lê direto (portal do cliente) não pode
    // obedecê-lo. Os helpers de acesso também o ignoram (`ehPapelCliente`): defesa em profundidade.
    // `stakeholder` também é preso ao projeto (o convite grava), mas NÃO é `ehPapelCliente`: os
    // helpers de projeto o negam, e o allow-list abaixo o limita aos caminhos de auto-serviço.
    if (user.role !== 'platform_admin' && user.role !== 'stakeholder' && !ehPapelCliente(user)) user.client_project_id = null;

    // Sessão aberta antes da suspensão da organização morre na requisição seguinte (o login já
    // recusa). Uma consulta só para equipe de fora da ness.; o agente tem a mesma regra em
    // `concessaoValida`, e a chave de API é de cliente (presa a projeto).
    orgAChecar = orgDaEquipeAChecar(user);
  }

  // As leituras de toda requisição numa ida só ao banco (#369): o D1 fica longe do usuário e cada consulta é uma viagem.
  const precisaLegal = !apiKey && !agente && !rotaLiberadaComBloqueio(path);
  const leitura = await lerChecagens(c.env, { org: orgAChecar, legal: precisaLegal, userId: user.id, projeto: user.client_project_id ?? null });
  if (leitura.orgSuspensa) return c.json(ORG_SUSPENSA, 403);
  // Lido do banco nesta requisição (nunca da sessão): `ehComercial` nega a conta de organização direta (decisão 11).
  user.org_direta = leitura.orgDireta;

  // Documento legal MATERIAL pendente barra o acesso até o aceite — muda base
  // legal ou retenção, e seguir usando o produto sem aceitar seria tratar o
  // usuário como se já tivesse concordado. Mudança comum não passa por aqui:
  // ela apenas rende a faixa de aviso que a tela monta a partir de /pending.
  //
  // Só vale para sessão humana: uma API key não tem a quem apresentar o texto,
  // e barrá-la derrubaria integração por decisão que não é dela.
  if (precisaLegal && leitura.docs.length) {
    const situacao = situacaoLegal(leitura.docs, leitura.aceitos);
    if (situacao.bloqueia) {
      return c.json({
        error: 'É necessário aceitar os documentos atualizados para continuar',
        legal_acceptance_required: true,
        pendentes: situacao.pendentes,
      }, 403);
    }
  }

  if (user.role === 'stakeholder' && !STAKEHOLDER_PERMITIDO.some((re) => re.test(path.replace(/\/+$/, '')))) {
    return c.json({ error: 'Forbidden: papel sem acesso a este recurso' }, 403);
  }

  // Global RBAC enforcement for org_user / client roles (aplica a sessões E API keys).
  const method = c.req.method.toUpperCase();

  // Independência 9.2 na sessão humana: a chave 'consultant' já é barrada em apiKeyRoleViolation.
  // Exceção: o consultoria_admin da organização direta (a empresa audita a si mesma; decisão 7). `org_direta` vem do banco acima.
  if (!apiKey && !agente && PAPEIS_IMPLEMENTACAO.has(user.role) && isAuditWrite(method, path)
      && !(user.role === 'consultoria_admin' && user.org_direta === true)) {
    return c.json({ error: 'Forbidden: consultoria não registra achado de auditoria' }, 403);
  }

  // Chave de API com permissão de escrita já foi autorizada por `permissions` acima;
  // o allow-list abaixo existe para papéis HUMANOS read-only. Sem esta exceção, uma
  // integração legítima (o mcp-server-niso) tomava 403 mesmo com chave 'write'.
  // O isolamento de tenant continua valendo — projectAccessMiddleware roda depois.
  if (!apiKeyWriteCapable && (user.role === 'org_user' || user.role === 'client') && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
    // Allow-list preciso (método + rota) das escritas permitidas a papéis
    // read-only. Matching por sufixo/regex — nunca substring — para que
    // DELETE de evidência e ações de aprovação/assinatura/avaliação fiquem
    // sempre bloqueadas (antes vazavam via path.includes('/evidence')).
    const allowedWrites: Array<{ methods: string[]; test: (p: string) => boolean }> = [
      { methods: ['PUT', 'POST'], test: p => p.endsWith('/checklist-progress') },
      // Bancada: preencher campos, definir responsável e prazo, concluir e reabrir passo (paridade com marcar item). Bloquear e exceção a rota decide.
      { methods: ['PUT'], test: p => /\/passos\/[^/]+\/campos$/.test(p) },
      { methods: ['PATCH'], test: p => /\/passos\/[^/]+$/.test(p) },
      { methods: ['POST'], test: p => /\/passos\/[^/]+\/(concluir|reabrir)$/.test(p) },
      { methods: ['POST'], test: p => p.endsWith('/evidence/upload') },
      { methods: ['PUT'], test: p => /\/evidence\/[^/]+\/content$/.test(p) },
      { methods: ['POST'], test: p => p.endsWith('/documents/upload') },
      { methods: ['POST', 'PUT'], test: p => p.endsWith('/policy-acknowledgments') },
      { methods: ['POST', 'PUT'], test: p => p.endsWith('/policies/ack') },
      { methods: ['POST'], test: p => p.endsWith('/chat') },
      { methods: ['POST'], test: p => MFA_AUTO_SERVICO.test(p) },
      { methods: ['POST'], test: p => SENHA_AUTO_SERVICO.test(p) },
      // Decisão do PRÓPRIO pedido de aprovação/ciência (o handler exige ser destinatário e a senha).
      // Criar pedido continua bloqueado para estes papéis.
      { methods: ['POST'], test: p => /^\/api\/v1\/pedidos\/[^/]+\/(aprovar|recusar)$/.test(p) },
      // n.ot: o técnico (org_user) escreve só a lista fechada ESCRITAS_DO_TECNICO (modelo de ameaças P1-2, E3); o site e o papel a rota confere.
      { methods: ['POST', 'PUT'], test: p => /^\/api\/v1\/projects\/[^/]+\/ot(\/.*)$/.test(p) && ESCRITAS_DO_TECNICO.test(p.replace(/^.*?\/ot(?=\/)/, '')) },
    ];
    const isAllowed = allowedWrites.some(a => a.methods.includes(method) && a.test(path));
    if (!isAllowed) {
      return c.json({ error: 'Forbidden: Read-only role cannot perform write operations' }, 403);
    }
  }

  /*
   * Política de segurança do TENANT (item 4.3). Vem por último, depois de a
   * identidade estar resolvida e do RBAC global — só faz sentido apertar para
   * quem já provou quem é.
   *
   * Alcança apenas quem é escopado a um projeto: conta de staff não tem
   * `client_project_id`, então nenhuma política a alcança. Isso não é folga, é a
   * garantia de que uma allowlist de IP mal preenchida ainda possa ser corrigida
   * por alguém.
   *
   * A consulta só acontece quando há projeto — tenant sem política é o caso
   * comum, e a linha ausente devolve `null` sem custo adicional por requisição
   * de staff.
   */
  if (user.client_project_id) {
    const politica = leitura.politica;
    if (politica) {
      // `totp_enabled` sai do BANCO (lido no mesmo batch), não da sessão: a sessão foi gravada no
      // login e não reflete um fator cadastrado depois. Ler daqui é o que
      // permite alguém sair da exigência sem precisar deslogar.
      const recusa = avaliarPolitica({
        politica,
        caminho: path,
        ip: c.req.header('CF-Connecting-IP') || null,
        totpAtivo: leitura.totp === 1,
        iat: (user as { iat?: number }).iat,
      });

      if (recusa) return c.json({ error: recusa.erro, ...(recusa.extra ?? {}) }, recusa.status);
    }
  }

  c.set('user', user);
  // Trilha central de exclusão (C4): o projeto do recurso é resolvido ANTES do handler, que
  // apaga a linha. O agente fica de fora: já tem a sua (`agente.acao_destrutiva`), abaixo.
  // DELETE de conta sem `?definitivo=1` só DESATIVA (routes/users.ts grava `user.desativado`): não é exclusão.
  const soDesativa = /^\/api\/v1\/(admin\/)?users\/[^/]+\/?$/.test(c.req.path) && c.req.query('definitivo') !== '1';
  const exclusao = c.req.method === 'DELETE' && user.agente !== true && !soDesativa ? await alvoDaExclusao(c.env.DB, c.req.path) : null;
  await next();
  if (exclusao && c.res.status < 400) {
    await logAudit(c.env.DB, 'registro.excluido', user.email, `${c.req.method} ${c.req.path}`,
      '', c.req.header('CF-Connecting-IP') ?? '', exclusao.projectId ?? undefined).catch(() => {});
  }
  // Trilha genérica do agente: toda ação destrutiva que passou leva o projeto,
  // sem depender de cada handler lembrar de registrar.
  if (user.agente === true && acaoDestrutiva(c.req.method, c.req.path) && c.res.status < 400) {
    await logAudit(c.env.DB, 'agente.acao_destrutiva', user.email, `${c.req.method} ${c.req.path}`,
      'confirmado pelo usuário', c.req.header('CF-Connecting-IP') ?? '', user.client_project_id ?? undefined).catch(() => {});
  }
});
