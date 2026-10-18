/**
 * Entradas do pacote S para a varredura de isolamento entre organizações (`test/contrato-isolamento-org.test.ts`). Cada rota nova de
 * escrita da ficha em abas, que tem parâmetro, é varrida por id sozinha, mas precisa de corpo que passe no esquema (senão para no 400 e a
 * varredura reclama): acrescente aqui, com a chave `MÉTODO /caminho/do/roteador` (ex.: `PUT /api/v1/projects/:projectId/ropa/:recordId/escopo`).
 * Entrada de rota que não existe reprova ("entrada órfã"). Arquivo do pacote S: nenhum outro pacote o edita.
 */
export type Alvo = { org: string; m: string; proj: string; rec: string };
export type Contexto = { de: Alvo; alheio: Alvo; token?: string };

/** Corpos que passam na validação, para a guarda de organização ser o que recusa. */
const R = '/api/v1/projects/:projectId/ropa/:recordId';
export const CORPOS_S: Record<string, (alvo: Alvo) => unknown> = {
  [`POST ${R}/situacao`]: () => ({ acao: 'enviar_revisao' }),
  [`POST ${R}/gaps`]: (alvo) => ({ gap: 'Gap exemplo', responsavel_parte_id: alvo.rec }),
  [`PUT ${R}/gaps/nao-aplicavel`]: () => ({ valor: true }),
  [`PUT ${R}/gaps/:id`]: () => ({ status: 'Closed' }),
};
/** Rota do PRÓPRIO projeto com id de recurso alheio no corpo (`owner_parte_id`, `controle_id`, `responsavel_parte_id`...): deve ser 4xx. */
export const VINCULOS_S: [string, (p: Contexto) => string, (p: Contexto) => unknown][] = [
  ['POST', (p) => `/api/v1/projects/${p.de.proj}/ropa/${p.de.rec}/gaps`, (p) => ({ gap: 'Gap exemplo', responsavel_parte_id: p.alheio.rec })],
];
/** Rotas que param no 400 e não têm corpo simples que chegue à guarda, cada uma com o motivo. */
export const NAO_PROVADAS_S: Record<string, string> = {};
