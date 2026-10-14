import { parseModulos } from './schemas/nucleo';
/**
 * n.iso e n.privacy são MÓDULOS do n.360 sobre o mesmo cadastro (decisão do dono de 09/10/2026, modelo A: um Worker, um banco).
 * O que o projeto habilitou (`projeto_modulos`) decide o que a API aceita: cada rota cai numa FAIXA.
 *   - `nucleo`: o cadastro compartilhado (partes, itens, documentos, evidência, RoPA, DPIA, pedidos, incidentes…). Vale com QUALQUER módulo.
 *   - `iso`: o que só o n.iso faz (controles, SoA, riscos, auditorias, certificação…).
 *   - `privacy`: o que só o n.privacy faz (requisitos por projeto, terceiros, pedidos do titular, consentimentos, encarregado,
 *     ligações do tratamento, LIA).
 * Rota nova precisa estar classificada aqui: `test/modulos-produto.test.ts` reprova a que não estiver.
 */

export const MODULOS_PRODUTO = ['iso', 'privacy'] as const;
export type Modulo = (typeof MODULOS_PRODUTO)[number];
export type Faixa = 'nucleo' | Modulo;

export const NOME_DO_PRODUTO: Record<Modulo, string> = { iso: 'n.iso', privacy: 'n.privacy' };

/** Primeiro segmento depois de `/api/v1/projects/:projectId/` → faixa. `''` é o próprio projeto. */
export const FAIXA_DO_SEGMENTO: Record<string, Faixa> = {
  // núcleo: o cadastro compartilhado e a administração do projeto
  '': 'nucleo', agentes: 'nucleo', 'api-keys': 'nucleo', assets: 'nucleo', 'audit-trail': 'nucleo', chat: 'nucleo',
  'company-profile': 'nucleo', context: 'nucleo', 'data-subject': 'nucleo', departamentos: 'nucleo', documentos: 'nucleo',
  documents: 'nucleo', dpia: 'nucleo', empresa: 'nucleo', evidence: 'nucleo', export: 'nucleo', governance: 'nucleo', modulos: 'nucleo',
  partes: 'nucleo', 'padronizar-nomes': 'nucleo', pedidos: 'nucleo', 'ponto-de-partida': 'nucleo', ropa: 'nucleo', 'scim-token': 'nucleo', 'security-policy': 'nucleo', similares: 'nucleo', sso: 'nucleo',
  incidentes: 'nucleo', stakeholders: 'nucleo', training: 'nucleo', vendors: 'nucleo', webhooks: 'nucleo',
  // só n.iso
  'approve-document': 'iso', assessment: 'iso', 'audit-pack': 'iso', 'auditor-notes': 'iso', 'auditor-token': 'iso', audits: 'iso',
  capa: 'iso', certification: 'iso', checklist: 'iso', 'checklist-progress': 'iso', coherence: 'iso', 'control-adequacao': 'iso',
  controls: 'iso', 'gap-analysis': 'iso', 'generate-document': 'iso', 'generate-policies-bulk': 'iso', 'generate-policy': 'iso',
  interviews: 'iso', 'journey-dossier': 'iso', 'management-reviews': 'iso', metrics: 'iso', 'migrate-27701': 'iso',
  'migrate-27701-2025': 'iso', 'phase-answers': 'iso', phases: 'iso', policies: 'iso', 'policy-acknowledgments': 'iso',
  'readiness-check': 'iso', 'revoke-approvals': 'iso', 'risk-matrix': 'iso', risks: 'iso', 'scope-changes': 'iso',
  'seed-27001-2022': 'iso', 'seed-27701-2025': 'iso', traceability: 'iso',
  // só n.privacy
  consentimentos: 'privacy', encarregado: 'privacy', importacoes: 'privacy', requisitos: 'privacy', terceiros: 'privacy',
  'titular-pedidos': 'privacy',
};

/** Sub-rotas de um segmento do núcleo que são do n.iso (a exportação de riscos lê a matriz ISO; as outras exportações seguem no núcleo). */
const SUBROTAS_ISO: RegExp[] = [/^export\/risks$/];

/** Sub-rotas de um segmento do núcleo que são do n.privacy (o registro é compartilhado; a camada nova não). */
const SUBROTAS_PRIVACY: RegExp[] = [
  /^ropa\/(importar|copiloto)$/,
  /^ropa\/[^/]+\/(ligacoes|itens|departamentos|transferencias|diagrama|dpia|lia|sugestao|impacto)$/,
  /^incidentes\/[^/]+\/rascunho-comunicacao$/,
  /^documentos\/[^/]+\/requisitos$/,
  /^evidence\/[^/]+\/(requisitos|validade)$/,
];

/** Resto do caminho depois de `/api/v1/projects/:id/`, ou null se o caminho não é de projeto. */
export function restoDoCaminho(caminho: string): string | null {
  const m = /^\/api\/v1\/projects\/[^/]+\/?(.*)$/.exec(caminho);
  return m ? m[1].replace(/\/+$/, '') : null;
}

/** Faixa de um caminho de projeto (concreto ou padrão do roteador). null = segmento não classificado. */
export function faixaDoCaminho(caminho: string): Faixa | null {
  const resto = restoDoCaminho(caminho);
  if (resto === null) return null;
  if (SUBROTAS_ISO.some((re) => re.test(resto))) return 'iso';
  if (SUBROTAS_PRIVACY.some((re) => re.test(resto))) return 'privacy';
  const seg = resto.split('/')[0];
  return Object.hasOwn(FAIXA_DO_SEGMENTO, seg) ? FAIXA_DO_SEGMENTO[seg] : null;
}

/** Tabela de recurso (rotas por id, `requireResourceAccess`) → faixa. */
export const FAIXA_DA_TABELA: Record<string, Faixa> = {
  compliance_controls: 'iso', risks: 'iso', audit_schedule: 'iso', corrective_actions: 'iso', certification_tracking: 'iso',
  audit_findings: 'iso', management_reviews: 'iso', performance_metrics: 'iso', auditor_notes: 'iso',
  vendors: 'nucleo', training_records: 'nucleo', ropa_records: 'nucleo', evidence: 'nucleo', itens: 'nucleo', stakeholders: 'nucleo',
  dpia_assessments: 'nucleo', webhooks: 'nucleo', api_keys: 'nucleo',
};

export async function modulosDoProjeto(db: D1Database, projectId: string): Promise<Modulo[]> {
  const { results } = await db.prepare('SELECT modulo FROM projeto_modulos WHERE project_id = ?').bind(projectId).all<{ modulo: Modulo }>();
  return results.map((r) => r.modulo);
}

/**
 * A recusa (mensagem) se o projeto não tem o produto que a faixa exige; null se pode. Sem nenhum módulo é projeto INEXISTENTE
 * (todo projeto real tem ao menos um: o gatilho dá na criação e o PUT recusa tirar o último): passa, e a rota responde o 404 dela.
 */
export function recusaDeModulo(faixa: Faixa, modulos: readonly Modulo[]): string | null {
  if (!modulos.length || faixa === 'nucleo') return null;
  return modulos.includes(faixa) ? null : `Produto ${NOME_DO_PRODUTO[faixa]} não habilitado neste projeto`;
}

/** O que a organização contratou (o teto dos projetos dela). Mesma leitura de `estadoDosModulos` em routes/nucleo.ts. */
export async function modulosContratados(db: D1Database, orgId: string): Promise<Modulo[]> {
  const o = await db.prepare('SELECT modulos_contratados AS m FROM organizations WHERE id = ?').bind(orgId).first<{ m: string | null }>();
  return parseModulos(o?.m);
}

/** Quem pede acesso: o principal da requisição (sessão, chave de API ou agente). */
export interface PrincipalDeModulo {
  id?: string;
  role?: string;
  client_project_id?: string | null;
}

/**
 * Os módulos da PESSOA (n.360, fatia 3; migration 0066). `platform_admin`: todos, sem linha. Chave de API (`id`
 * `apikey:<id>`, ver `middleware/auth.ts`): não é pessoa, vale o projeto dela. Agente MCP: o `id` do principal é o
 * `users.id` do consultor que concedeu (`middleware/agente.ts`), então lê os dele. Os demais: `usuario_modulos`.
 * Consulta por requisição: conceder ou tirar vale na hora, sem derrubar sessão.
 */
export async function modulosDaPessoa(db: D1Database, user: PrincipalDeModulo): Promise<Modulo[]> {
  if (user.role === 'platform_admin') return [...MODULOS_PRODUTO];
  if (user.id?.startsWith('apikey:')) return user.client_project_id ? modulosDoProjeto(db, user.client_project_id) : [];
  // ponytail: principal sem `id` não tem módulo nenhum, de propósito (falha fechada): `''` não casa com conta alguma.
  const { results } = await db.prepare('SELECT modulo FROM usuario_modulos WHERE user_id = ? ORDER BY modulo').bind(user.id ?? '').all<{ modulo: Modulo }>();
  return results.map((r) => r.modulo);
}

/** A recusa se a faixa é de um módulo que a pessoa não tem; null se pode. O núcleo não exige módulo da pessoa. */
export function recusaDaPessoa(faixa: Faixa, modulos: readonly Modulo[]): string | null {
  if (faixa === 'nucleo' || modulos.includes(faixa)) return null;
  return `Você não tem acesso ao ${NOME_DO_PRODUTO[faixa]}`;
}
