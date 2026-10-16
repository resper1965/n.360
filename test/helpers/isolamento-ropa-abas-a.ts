/**
 * Entradas do pacote A para a varredura de isolamento entre organizações (`test/contrato-isolamento-org.test.ts`). Cada rota nova de
 * escrita da ficha em abas, que tem parâmetro, é varrida por id sozinha, mas precisa de corpo que passe no esquema (senão para no 400 e a
 * varredura reclama): acrescente aqui, com a chave `MÉTODO /caminho/do/roteador` (ex.: `PUT /api/v1/projects/:projectId/ropa/:recordId/escopo`).
 * Entrada de rota que não existe reprova ("entrada órfã"). Arquivo do pacote A: nenhum outro pacote o edita.
 */
export type Alvo = { org: string; m: string; proj: string; rec: string };
export type Contexto = { de: Alvo; alheio: Alvo; token?: string };

/** Corpos que passam na validação, para a guarda de organização ser o que recusa. */
export const CORPOS_A: Record<string, (alvo: Alvo) => unknown> = {};
/** Rota do PRÓPRIO projeto com id de recurso alheio no corpo (`owner_parte_id`, `controle_id`, `responsavel_parte_id`...): deve ser 4xx. */
export const VINCULOS_A: [string, (p: Contexto) => string, (p: Contexto) => unknown][] = [];
/** Rotas que param no 400 e não têm corpo simples que chegue à guarda, cada uma com o motivo. */
export const NAO_PROVADAS_A: Record<string, string> = {};
