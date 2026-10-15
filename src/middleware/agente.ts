import type { Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { apiKeyRoleViolation } from '../auth-policy';
import { consultorDesignado, projetosDoAgente } from '../helpers';

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
): Promise<{ email: string; client_name: string; project_name: string; papel: PapelAgente } | null> {
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
  return alcanca ? { email: row.email, client_name: row.client_name, project_name: row.project_name, papel: row.papel } : null;
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
  [/^\/api\/v1\/platform(\/|$)/, 'administração da plataforma (organizações)'],
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
  [/^\/api\/v1\/projects\/?$/, 'o agente está preso a um projeto', ['POST']],
  [/^\/api\/v1\/projects\/consulta-cnpj(\/|$)/, 'consulta de CNPJ é do assistente de criação de projeto, pela interface'],
  [/\/agentes(\/|$)/, 'o agente não gere o próprio acesso'],
  // Desaprovar é ato da direção, pela interface (F6, decisão D1): o agente não revoga a aprovação de
  // ROPA nem de DPIA, e não apaga análise crítica, que é registro assinado. Revogar aprovação de
  // CONTROLE segue possível, com confirmação (acaoDestrutiva).
  // Assinatura eletrônica é ato humano, pela interface (senha do assinante).
  [/^\/api\/v1\/(evidence|controls)\/[^/]+\/(signatures\/)?approve$/, 'assinatura eletrônica é ato humano, pela interface', ['POST', 'PUT']],
  [/^\/api\/v1\/projects\/[^/]+\/(ropa|dpia)\/[^/]+\/revoke-approval$/, 'revogar aprovação de ROPA e DPIA é da direção, pela interface'],
  // O agente propõe política (rascunho); publicar e descartar o rascunho é ato humano, pela interface (fatia 3.2).
  [/^\/api\/v1\/projects\/[^/]+\/documentos\/[^/]+\/versoes\/[^/]+\/publicar$/, 'publicar versão de documento é ato humano, pela interface', ['POST']],
  [/^\/api\/v1\/projects\/[^/]+\/documentos\/[^/]+\/rascunho$/, 'descartar rascunho de documento é ato humano, pela interface', ['DELETE']],
  [/^\/api\/v1\/projects\/[^/]+\/documentos\/[^/]+$/, 'excluir documento é ato humano do administrador da plataforma, pela interface', ['DELETE']],
  [/^\/api\/v1\/pedidos\/lote$/, 'aprovar em lote é ato humano, com a senha de quem aprova', ['POST']],
  [/^\/api\/v1\/projects\/[^/]+\/padronizar-nomes$/, 'padronizar nomes é ato humano da equipe, pela interface', ['POST']],
  [/^\/api\/v1\/parametros-legais(\/|$)/, 'prazo legal é parâmetro revisado pelo jurídico, edição do administrador da plataforma; o agente só lê', ['PUT', 'DELETE']],
  [/^\/api\/v1\/projects\/[^/]+\/incidentes\/[^/]+\/encerrar$/, 'encerrar incidente é ato humano, pela interface', ['POST']],
  [/^\/api\/v1\/projects\/[^/]+\/consentimentos\/[^/]+\/revogar$/, 'revogar consentimento é ato humano, pela interface', ['POST']],
  // A importação de programa grava no RoPA depois da revisão de uma pessoa da equipe (spec 2026-10-11). A leitura também é recusada, pela rota (papel de equipe).
  [/^\/api\/v1\/projects\/[^/]+\/importacoes(\/|$)/, 'importação de programa é feita pela equipe, pela interface', ['POST', 'PUT', 'DELETE']],
  [/^\/api\/v1\/requisitos(\/|$)/, 'o catálogo de requisitos é edição do administrador da plataforma; o agente só lê', ['POST', 'PUT', 'DELETE']],
  [/^\/api\/v1\/projects\/[^/]+\/documentos\/[^/]+\/revisar$/, 'marcar documento como revisado é ato humano, pela interface', ['POST']],
  [/^\/api\/v1\/projects\/[^/]+\/documentos\/[^/]+\/excecoes\/[^/]+\/revogar$/, 'revogar exceção a documento é ato humano, pela interface', ['POST']],
  // Rascunho de IA do n.privacy é da tela, para a pessoa revisar (fatia 5.3); o agente já é a IA.
  [/^\/api\/v1\/projects\/[^/]+\/(ropa\/copiloto|ropa\/[^/]+\/sugestao|titular-pedidos\/[^/]+\/rascunho|incidentes\/[^/]+\/rascunho-comunicacao)$/, 'rascunho de IA do n.privacy é pela interface'],
  // Parecidos por significado (embeddings) servem ao "Cadastrar agora" da entrevista, na tela; o agente já é a IA.
  [/^\/api\/v1\/projects\/[^/]+\/similares$/, 'parecidos por significado são recurso de IA da tela'],
  // Riscos e ações da atividade (F2): o agente cria e edita rascunho; apagar é ato humano (aceitar e concluir, a rota recusa).
  [/^\/api\/v1\/projects\/[^/]+\/ropa\/[^/]+\/(riscos|acoes)\/[^/]+$/, 'apagar risco ou ação da atividade é ato humano, pela interface', ['DELETE']],
  // Exportação em arquivo (F4 e as antigas do n.iso): planilha e Word são da tela; o agente lê os mesmos dados em JSON.
  [/^\/api\/v1\/projects\/[^/]+\/(export\/(atividades|ripd|riscos-atividade|acoes-atividade|lia|risks|vendors|training|audit-log|assets)|dpia\/[^/]+\/docx|ropa\/[^/]+\/lia\/docx)$/, 'exportação em arquivo é pela interface'],
  // Homologação de fornecedor (F5): o link é credencial emitida pela consultoria e concluir grava a avaliação do terceiro; o agente só lê.
  [/^\/api\/v1\/projects\/[^/]+\/homologacoes(\/|$)/, 'homologação de fornecedor é conduzida pela equipe, pela interface; o agente só lê', ['POST', 'PUT', 'DELETE']],
  [/^\/api\/v1\/management-reviews\/[^/]+$/,'excluir análise crítica destrói registro assinado: use a interface', ['DELETE']],
];

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

/** Única definição do que exige confirmação: apagar, gerar em lote, anonimizar titular, revogar aprovações. */
export function acaoDestrutiva(method: string, path: string): boolean {
  return method.toUpperCase() === 'DELETE' || path.endsWith('/generate-policies-bulk') || path.endsWith('/data-subject/erase') || /\/revoke-approvals?$/.test(path);
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
  for (const [re, motivo, metodos] of FORA_DO_AGENTE) {
    if (re.test(path) && (!metodos || metodos.includes(method))) return c.json({ error: `Forbidden: fora do alcance do agente (${motivo}) — use a interface` }, 403);
  }
  if (row.papel === 'auditor') {
    const motivo = foraDoAuditor(method, path, p.projectId);
    if (motivo) return c.json({ error: `Forbidden: ${motivo}` }, 403);
  }
  if (acaoDestrutiva(method, path) && c.req.header(CABECALHO_CONFIRMADO) !== '1') {
    return c.json({ error: 'Forbidden: apagar, gerar em lote, eliminar titular e revogar aprovações exigem confirmação — mostre ao usuário o que será feito, espere o "sim" e reenvie com confirmado_pelo_usuario: true' }, 403);
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
  return {
    id: p.userId,
    email: `${row.papel === 'auditor' ? 'agente auditor' : 'agente'} de ${row.email} (${rotulo})`,
    role: 'client',
    client_project_id: p.projectId,
    agente: true,
    agente_papel: row.papel,
  };
}
