/**
 * Entradas do pacote A para a varredura de isolamento entre organizações (`test/contrato-isolamento-org.test.ts`). Cada rota nova de
 * escrita da ficha em abas, que tem parâmetro, é varrida por id sozinha, mas precisa de corpo que passe no esquema (senão para no 400 e a
 * varredura reclama): acrescente aqui, com a chave `MÉTODO /caminho/do/roteador` (ex.: `PUT /api/v1/projects/:projectId/ropa/:recordId/escopo`).
 * Entrada de rota que não existe reprova ("entrada órfã"). Arquivo do pacote A: nenhum outro pacote o edita.
 */
export type Alvo = { org: string; m: string; proj: string; rec: string };
export type Contexto = { de: Alvo; alheio: Alvo; token?: string };

/** Corpos que passam na validação, para a guarda de organização ser o que recusa. */
const R = '/api/v1/projects/:projectId/ropa/:recordId';
export const CORPOS_A: Record<string, (alvo: Alvo) => unknown> = {
  [`PUT ${R}/escopo`]: () => ({ volume_mensal: 'Varredura' }),
  [`PUT ${R}/agentes`]: () => ({ papel_operador: true }),
  [`PUT ${R}/base-juridica`]: () => ({ previsao_legal: 'Varredura' }),
  [`POST ${R}/medidas`]: () => ({ medida: 'Varredura', status: 'ativa' }),
  [`PUT ${R}/medidas/:id`]: () => ({ status: 'ativa' }),
};
/** Rota do PRÓPRIO projeto com id de recurso alheio no corpo (`owner_parte_id`, `controle_id`, `responsavel_parte_id`...): deve ser 4xx. */
const propria = (p: Contexto) => `/api/v1/projects/${p.de.proj}/ropa/${p.de.rec}`;
export const VINCULOS_A: [string, (p: Contexto) => string, (p: Contexto) => unknown][] = [
  ['PUT', (p) => `${propria(p)}/escopo`, (p) => ({ owner_parte_id: p.alheio.rec })],
  ['PUT', (p) => `${propria(p)}/escopo`, (p) => ({ areas_ids: [p.alheio.rec] })],
  ['POST', (p) => `${propria(p)}/medidas`, (p) => ({ medida: 'Varredura', status: 'ativa', controle_id: p.alheio.rec })],
  ['PUT', (p) => `${propria(p)}/medidas/${p.de.rec}`, (p) => ({ controle_id: p.alheio.rec })],
];
/** Rotas que param no 400 e não têm corpo simples que chegue à guarda, cada uma com o motivo. */
export const NAO_PROVADAS_A: Record<string, string> = {};
