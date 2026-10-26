import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { apiKeyRoleViolation } from '../auth-policy';
import { decisaoDaRota, CABECALHO_FERRAMENTA, CABECALHO_MOTIVO, MOTIVO_MAX } from './decisoes-agente';
import { logAudit, consultorDesignado, projetosDoAgente, ehComercial } from '../helpers';

/**
 * Identidade de um agente de IA conectado pelo MCP remoto (spec
 * 2026-09-29-receita-agentes-mcp-remoto). Chega em `env.AGENTE`, que só o
 * handler /mcp preenche — requisição externa não escolhe o `env`.
 */
export interface PropsAgente {
  userId: string;
  email: string;
  projectId: string;
  concessaoId: string;
  /** Escolhido no consentimento e gravado na concessão (migration 0070). Token anterior ao papel: consultor. */
  papel?: PapelAgente;
}

/** Consultor implementa; auditor só lê o projeto e registra achado e nota de auditoria (ISO 27001, 9.2). */
export type PapelAgente = 'consultor' | 'auditor';
export const PAPEIS_AGENTE: readonly PapelAgente[] = ['consultor', 'auditor'];

const REFACA = 'Acesso do agente revogado, expirado ou sem designação no projeto: refaça o login no cliente MCP.';

/**
 * A concessão vale agora? Não revogada, não expirada, consultor ativo, projeto da
 * MESMA organização do consultor e AINDA designado na governança do projeto.
 * Única fonte da regra: o handler /mcp a consulta antes de abrir a sessão MCP (401 para o cliente reabrir o OAuth) e
 * o resolverAgente a cada chamada interna.
 */
/**
 * Nome do cliente para exibir (projeto com alias `p`): cai para o nome do
 * projeto quando `client_name` está vazio, e para o id em último caso. Usado no
 * login OAuth do agente e na trilha — nunca "agente de x ()".
 */
export const NOME_CLIENTE_SQL = `COALESCE(NULLIF(trim(p.client_name), ''), p.project_name, p.id)`;

export async function concessaoValida(
  db: D1Database,
  p: PropsAgente
): Promise<{ email: string; client_name: string; project_name: string; papel: PapelAgente; role: string; org_id: string | null } | null> {
  const row = await db.prepare(
    `SELECT u.email, u.role, u.org_id, u.ativo, ac.papel, ${NOME_CLIENTE_SQL} AS client_name,
            COALESCE(NULLIF(trim(p.project_name), ''), p.id) AS project_name
       FROM agente_concessoes ac
       JOIN users u ON u.id = ac.user_id
       JOIN projects p ON p.id = ac.project_id
      WHERE ac.id = ? AND ac.user_id = ? AND ac.project_id = ?
        AND ac.revogado_em IS NULL AND ac.expira_em > datetime('now')
        -- multiconsultoria: o projeto tem de ser da organização do consultor da concessão
        AND p.org_id = u.org_id
        -- organização suspensa derruba o agente da equipe dela (a ness. não é suspensa)
        AND (u.org_id = 'org_ness' OR EXISTS (SELECT 1 FROM organizations o WHERE o.id = u.org_id AND o.status = 'Active'))
        -- separação de funções: a mesma conta não tem consultor E auditor ativos no mesmo projeto. O consentimento
        -- já recusa o segundo; se os dois coexistirem (corrida), nenhum vale: falha fechada.
        AND NOT EXISTS (SELECT 1 FROM agente_concessoes o WHERE o.user_id = ac.user_id AND o.project_id = ac.project_id
                          AND o.papel <> ac.papel AND o.revogado_em IS NULL AND o.expira_em > datetime('now'))`
  ).bind(p.concessaoId, p.userId, p.projectId).first<{ email: string; role: string; org_id: string | null; ativo: number | null; papel: PapelAgente; client_name: string; project_name: string }>();
  if (!row || row.ativo === 0 || (row.role !== 'consultor' && row.role !== 'consultant' && row.role !== 'consultoria_admin')) return null;
  // O papel vale pelo BANCO; o do token só confere. Token sem papel é anterior à 0070, quando só havia consultor.
  if ((p.papel ?? 'consultor') !== row.papel) return null;

  // Tirar o consultor da governança derruba o agente na próxima requisição,
  // sem esperar o token expirar.
  // Mesma regra do consultor humano (D5): uma fonte só.
  // consultoria_admin: o projeto da própria organização (p.org_id = u.org_id, acima) basta, sem designação.
  const alcanca = row.role === 'consultoria_admin' || await consultorDesignado(db, row.email, p.projectId);
  return alcanca ? { email: row.email, client_name: row.client_name, project_name: row.project_name, papel: row.papel, role: row.role, org_id: row.org_id } : null;
}

/** Só `resolverAgente` lê; ele só roda com `env.AGENTE`, então de fora o cabeçalho é inerte. */
export const CABECALHO_CONFIRMADO = 'X-Agente-Confirmado';

/**
 * O consultor humano alcança estas rotas; o agente não. Não são documento nem
 * achado do SGSI: são controle de acesso, configuração de segurança do cliente,
 * visão de todos os clientes ou a área comercial. O agente não amplia o próprio
 * acesso nem enxerga fora do projeto.
 */
/** Terceiro campo opcional: só estes métodos são recusados (GET /projects segue valendo, escopado). */
const FORA_DO_AGENTE: Array<[RegExp, string, string[]?]> = [
  [/^\/api\/v1\/(users|admin\/users)(\/|$)/, 'gestão de usuários'],
  [/^\/api\/v1\/platform(\/|$)/, 'administração da plataforma (consultorias)'],
  [/^\/api\/v1\/dashboard(\/|$)/, 'o painel global agrega todos os clientes'],
  [/^\/api\/v1\/carteira(\/|$)/, 'a carteira agrega os projetos do consultor; o agente está preso a um projeto'],
  [/^\/api\/v1\/(assessments|leads|proposals|funil)(\/|$)/, 'área comercial'],
  [/^\/api\/v1\/org(\/|$)/, 'área comercial'],
  [/^\/api\/v1\/servicos(\/|$)/, 'área comercial'],
  [/^\/api\/v1\/propostas(\/|$)/, 'área comercial'],
  [/^\/api\/v1\/projects\/[^/]+\/(sso|security-policy|scim-token|api-keys|webhooks)(\/|$)/, 'configuração de segurança do cliente'],
  [/^\/api\/v1\/webhooks(\/|$)/, 'configuração de segurança do cliente'],
  // O principal do agente carrega o users.id REAL do consultor: rotas de "minha conta" agiriam sobre ele.
  [/^\/api\/v1\/(auth|legal|notifications)(\/|$)/, 'conta pessoal do consultor'],
  [/^\/api\/v1\/projects\/[^/]+\/auditor-token(\/|$)/, 'credencial de auditor externo'],
  // A governança dá acesso (consultor), autoridade de assinatura e abre o portal de políticas ao e-mail e ao domínio: o agente só lê.
  [/^\/api\/v1\/projects\/[^/]+\/governance(\/|$)/, 'a governança dá acesso, assinatura e o portal de políticas; o agente só lê', ['POST', 'PUT', 'PATCH', 'DELETE']],
  [/^\/api\/v1\/projects\/?$/, 'o agente está preso a um projeto', ['POST']],
  [/^\/api\/v1\/projects\/consulta-cnpj(\/|$)/, 'consulta de CNPJ é do assistente de criação de projeto, pela interface'],
  // `ropa/:id/agentes` é a aba "Agentes de Tratamento" (controlador e operador), não a gestão de concessões: exceção explícita.
  [/^(?!\/api\/v1\/projects\/[^/]+\/ropa\/[^/]+\/agentes$).*\/agentes(\/|$)/, 'o agente não gere o próprio acesso'],
  // Desaprovar é ato da direção, pela interface (F6, decisão D1): o agente não revoga a aprovação de
  // ROPA nem de DPIA, e não apaga análise crítica, que é registro assinado. Revogar aprovação de
  // CONTROLE e do projeto também é ato do cliente (abaixo).
  // Assinatura eletrônica é ato humano, pela interface (senha do assinante).
  [/^\/api\/v1\/evidence\/[^/]+\/(signatures\/)?approve$/, 'assinatura eletrônica é ato humano, pela interface', ['POST', 'PUT']],
  [/^\/api\/v1\/projects\/[^/]+\/(ropa|dpia)\/[^/]+\/revoke-approval$/, 'revogar aprovação de ROPA e DPIA é da direção, pela interface'],
  [/^\/api\/v1\/(controls\/[^/]+\/revoke-approval|projects\/[^/]+\/revoke-approvals)$/, 'revogar aprovação é ato do cliente', ['POST']],
  [/^\/api\/v1\/projects\/[^/]+\/data-subject\/erase$/, 'eliminar dado do titular é ato humano, pela interface', ['POST']],
  [/^\/api\/v1\/projects\/[^/]+\/policy-acknowledgments$/, 'ciência de política é registrada por uma pessoa, pela interface', ['POST', 'PUT']],
  [/^\/api\/v1\/projects\/[^/]+\/documentos\/[^/]+$/, 'excluir documento é ato humano do administrador da plataforma, pela interface', ['DELETE']],
  // Aceitar o documento gerado grava a evidência e conclui o item do checklist: é a pessoa que decide.
  [/^\/api\/v1\/projects\/[^/]+\/approve-document$/, 'aceitar documento e concluir item do checklist é ato humano, pela interface', ['POST']],
  [/^\/api\/v1\/pedidos\/[^/]+\/(aprovar|recusar)$/, 'aprovar ou recusar pedido é ato do destinatário, com a senha dele', ['POST']],
  [/^\/api\/v1\/pedidos\/lote$/, 'aprovar em lote é ato humano, com a senha de quem aprova', ['POST']],
  [/^\/api\/v1\/parametros-legais(\/|$)/, 'prazo legal é parâmetro revisado pelo jurídico, edição do administrador da plataforma; o agente só lê', ['PUT', 'DELETE']],
  [/^\/api\/v1\/requisitos(\/|$)/, 'o catálogo de requisitos é edição do administrador da plataforma; o agente só lê', ['POST', 'PUT', 'DELETE']],
  [/^\/api\/v1\/projects\/[^/]+\/documentos-arquivo(\/|$)/, 'documento em arquivo (cadastro, envio e exclusão) é feito pela interface; o agente só lê', ['POST', 'PUT', 'DELETE']],
  // Rascunho de IA do n.privacy é da tela, para a pessoa revisar (fatia 5.3); o agente já é a IA.
  [/^\/api\/v1\/projects\/[^/]+\/(ropa\/copiloto|ropa\/[^/]+\/sugestao|titular-pedidos\/[^/]+\/rascunho|incidentes\/[^/]+\/rascunho-comunicacao)$/, 'rascunho de IA do n.privacy é pela interface'],
  // Parecidos por significado (embeddings) servem ao "Cadastrar agora" da entrevista, na tela; o agente já é a IA.
  [/^\/api\/v1\/projects\/[^/]+\/similares$/, 'parecidos por significado são recurso de IA da tela'],
  // Exportação em arquivo (F4 e as antigas do n.iso): planilha e Word são da tela; o agente lê os mesmos dados em JSON.
  [/^\/api\/v1\/projects\/[^/]+\/(export\/(atividades|ripd|riscos-atividade|acoes-atividade|lia|risks|vendors|training|audit-log|assets)|dpia\/[^/]+\/docx|documentos\/[^/]+\/docx|ropa\/[^/]+\/lia\/docx)$/, 'exportação em arquivo é pela interface'],
  [/^\/api\/v1\/management-reviews\/[^/]+$/,'excluir análise crítica destrói registro assinado: use a interface', ['DELETE']],
  // Bancada da trilha (spec 2026-10-15): o rascunho de IA é da tela; concluir, reabrir e bloquear passo são decisões (`niso_decidir_passo`).
  [/^\/api\/v1\/projects\/[^/]+\/passos\/[^/]+\/copiloto\/[a-z-]+$/, 'rascunho de IA da trilha é pela interface; o agente já é a IA', ['POST']],
  // Ficha em abas (spec 2026-10-16): anexo de gap e relatório são da tela; a situação é decisão (`niso_situacao_atividade`).
  [/^\/api\/v1\/projects\/[^/]+\/ropa\/[^/]+\/gaps\/[^/]+\/anexos(\/[^/]+)?$/, 'anexo de gap é arquivo enviado por uma pessoa, pela interface'],
  [/^\/api\/v1\/projects\/[^/]+\/ropa\/[^/]+\/relatorio$/, 'impressão da atividade é pela interface'],
  [/^\/api\/v1\/projects\/[^/]+\/ropa\/[^/]+\/etapas\/[^/]+\/rascunho$/, 'rascunho de IA da etapa é pela interface; o agente já é a IA', ['POST']],
];

/**
 * Área comercial para o agente (decisão do dono de 15/10/2026): LÊ e RASCUNHA. Lista e lê leads, funil, levantamentos,
 * propostas e serviços; cria lead e muda o status dele (a rota recusa "ganho" ao agente); cria proposta (nasce rascunho) e
 * edita a que está em rascunho (a rota confere). Gerar, enviar, link, aceite manual, desconto, revisão, documento, preço,
 * catálogo, `/org`, o fluxo antigo `/proposals` e apagar seguem fora (`FORA_DO_AGENTE`). Allow-list: rota comercial que não
 * está aqui é recusada, inclusive rota nova. Vale só para o agente consultor de quem é do comercial (`ehComercial`, relido).
 */
const COMERCIAL_DO_AGENTE: Array<[string, RegExp]> = [
  ['GET', /^\/api\/v1\/(leads|funil|propostas|servicos|assessments)$/],
  ['GET', /^\/api\/v1\/(leads|propostas|servicos)\/[^/]+$/],
  ['GET', /^\/api\/v1\/propostas\/[^/]+\/previa$/],
  ['GET', /^\/api\/v1\/assessments\/(?!public$)[^/]+(\/answers|\/block\/[^/]+)?$/],
  ['POST', /^\/api\/v1\/(leads|propostas)$/],
  ['PUT', /^\/api\/v1\/leads\/[^/]+\/status$/],
  ['PUT', /^\/api\/v1\/propostas\/[^/]+$/],
];
export const comercialDoAgente = (method: string, path: string): boolean =>
  COMERCIAL_DO_AGENTE.some(([m, re]) => m === method && re.test(path));

/**
 * O auditor só LÊ, e só o projeto da concessão, mais as duas escritas de auditoria. Allow-list: rota que não está
 * aqui é recusada, inclusive rota nova (falha fechada). Devolve o motivo da recusa, ou null.
 */
export function foraDoAuditor(method: string, path: string, projectId: string): string | null {
  const doProjeto = path === `/api/v1/projects/${projectId}` || path.startsWith(`/api/v1/projects/${projectId}/`);
  if (method === 'GET' || method === 'HEAD') {
    const leitura = doProjeto
      || path === '/api/v1/portfolio' // escopado ao projeto da concessão (role client)
      || /^\/api\/v1\/audits\/[^/]+\/findings$/.test(path)
      || /^\/api\/v1\/evidence\/[^/]+\/(content|detail|download)$/.test(path);
    return leitura ? null : 'o agente auditor lê só o projeto desta conexão';
  }
  if (method === 'POST' && (/^\/api\/v1\/audits\/[^/]+\/findings$/.test(path) || path === `/api/v1/projects/${projectId}/auditor-notes`)) return null;
  return 'o agente auditor só lê e registra achado e nota de auditoria; quem audita não implementa (ISO 27001, 9.2)';
}

/** Única definição do que exige confirmação: apagar, anonimizar titular, revogar aprovações. */
export function acaoDestrutiva(method: string, path: string): boolean {
  return method.toUpperCase() === 'DELETE' || path.endsWith('/data-subject/erase') || /\/revoke-approvals?$/.test(path);
}

/** O PUT de ação/gap só é decisão quando fecha (status Closed). Lê uma cópia: a rota lê o corpo de novo. */
async function corpoFechaAcao(c: Context): Promise<boolean> {
  try { return ((await c.req.raw.clone().json()) as { status?: unknown })?.status === 'Closed'; } catch { return false; }
}

export async function resolverAgente(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  p: PropsAgente
): Promise<Variables['user'] | Response> {
  const method = c.req.method.toUpperCase();
  // Caminho DECODIFICADO, o mesmo que o Hono usa para rotear: testar o cru
  // deixava `%67enerate-policies-bulk` passar pela recusa e chegar à rota.
  const path = c.req.path;
  // `%2F` o Hono não decodifica; `.`/`..` e `\` só aparecem aqui por
  // codificação. Nenhum caminho legítimo do agente tem isso.
  if (/%2f/i.test(path) || path.includes('\\') || path.split('/').some((s) => s === '.' || s === '..')) {
    return c.json({ error: 'Forbidden: caminho inválido' }, 403);
  }

  // A concessão primeiro: agente revogado, expirado ou sem designação ouve 401 ("refaça o
  // login") em QUALQUER rota. Com a lista de proibidas antes, ele ouvia 403 e não sabia que
  // precisava reconectar.
  const row = await concessaoValida(c.env.DB, p);
  if (!row) return c.json({ error: REFACA }, 401);

  // Paridade com o consultor, preso ao projeto: `role: 'client'` + `client_project_id`
  // herda o isolamento de tenant; o que é destrutivo exige confirmação.
  // Área comercial (allow-list): só o agente consultor de quem É do comercial agora; o de quem não é segue recusado por
  // `FORA_DO_AGENTE`, como sempre foi.
  const comercial = row.papel === 'consultor' && comercialDoAgente(method, path) && ehComercial({ role: row.role });
  for (const [re, motivo, metodos] of FORA_DO_AGENTE) {
    if (!comercial && re.test(path) && (!metodos || metodos.includes(method))) return c.json({ error: `Forbidden: fora do alcance do agente (${motivo}) — use a interface` }, 403);
  }
  if (row.papel === 'auditor') {
    const motivo = foraDoAuditor(method, path, p.projectId);
    if (motivo) return c.json({ error: `Forbidden: ${motivo}` }, 403);
  }
  let decisao: { ferramenta: string; motivo: string } | undefined;
  const d = row.papel === 'consultor' ? decisaoDaRota(method, path) : null;
  // concluir ação/gap pelo PUT genérico só é decisão com status Closed; o resto do PUT é edição comum.
  const exige = d && (d.ferramenta !== 'niso_concluir_acao' || (await corpoFechaAcao(c)));
  if (d && exige) {
    let motivo = '';
    try { motivo = decodeURIComponent(c.req.header(CABECALHO_MOTIVO) ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim(); } catch { motivo = ''; }
    if (c.req.header(CABECALHO_FERRAMENTA) !== d.ferramenta || c.req.header(CABECALHO_CONFIRMADO) !== '1' || !motivo || motivo.length > MOTIVO_MAX) {
      return c.json({ error: `Forbidden: decisão do consultor: use ${d.ferramenta}, mostre ao consultor o que muda, peça o "sim" e informe o motivo` }, 403);
    }
    decisao = { ferramenta: d.ferramenta, motivo };
  }
  if (acaoDestrutiva(method, path) && c.req.header(CABECALHO_CONFIRMADO) !== '1') {
    return c.json({ error: 'Forbidden: apagar, eliminar titular e revogar aprovações exigem confirmação — mostre ao usuário o que será feito, espere o "sim" e reenvie com confirmado_pelo_usuario: true' }, 403);
  }
  // Segunda camada, a mesma da chave de API: consultor não registra achado; auditor só escreve achado.
  const violacao = apiKeyRoleViolation(row.papel === 'auditor' ? 'auditor' : 'consultant', method, path);
  if (violacao) return c.json({ error: violacao }, 403);

  await c.env.DB.prepare(`UPDATE agente_concessoes SET ultimo_uso_em = datetime('now') WHERE id = ?`)
    .bind(p.concessaoId).run().catch(() => {});

  // `role: 'client'` + `client_project_id` herda o isolamento de tenant do
  // projectAccessMiddleware; a escrita é liberada pelo chamador (writeCapable).
  // Sem nome de cliente, NOME_CLIENTE_SQL já cai para o projeto: não repita o nome.
  const rotulo = row.client_name === row.project_name ? row.client_name : `${row.client_name} / ${row.project_name}`;
  // `id` é o users.id REAL do consultor: os módulos da pessoa (`modulosDaPessoa`) saem dele, então o agente alcança
  // só o n.iso/n.privacy que o consultor que concedeu tem, e tirar o módulo dele vale na chamada seguinte.
  const email = `${row.papel === 'auditor' ? 'agente auditor' : 'agente'} de ${row.email} (${rotulo})`;
  if (decisao) {
    await logAudit(c.env.DB, 'agente.decisao', email, `${decisao.ferramenta}: ${method} ${path} — motivo: ${decisao.motivo}`, '', '', p.projectId);
  }
  // Área comercial (allow-list acima): o papel e a organização REAIS de quem concedeu, relidos agora, para `somenteComercial` e
  // `exigirOrg` cortarem pela organização dela. Só nestas rotas: no resto o agente segue `client` preso ao projeto.
  if (comercial) return { id: p.userId, email, role: row.role, org_id: row.org_id ?? undefined, client_project_id: null, agente: true, agente_papel: row.papel, ...(decisao ? { agente_decisao: decisao } : {}) };
  return {
    id: p.userId,
    email,
    role: 'client',
    client_project_id: p.projectId,
    agente: true,
    agente_papel: row.papel,
    ...(decisao ? { agente_decisao: decisao } : {}),
  };
}
