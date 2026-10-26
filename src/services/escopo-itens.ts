/**
 * Riscos e ações corretivas têm dois donos: o programa (`ropa_id IS NULL`, o que o n.iso gerencia) e as
 * atividades de tratamento do n.privacy (`ropa_id IS NOT NULL`). Cada tela escolhe UM escopo, aqui, em vez de
 * escrever o filtro à mão: foi assim que Painel, Prontidão e coherence passaram a contar um número e a matriz,
 * a CAPA e a Bancada outro.
 *
 *  - `programa`: só o do programa (Painel, Prontidão, coherence, contexto de política);
 *  - `atividades`: só os itens ligados a atividades (painel e "O que fazer" do n.privacy);
 *  - `todos`: de propósito, os dois (matriz de riscos e CAPA do n.iso, Bancada, carteira).
 */
export type EscopoItens = 'programa' | 'atividades' | 'todos';

/** Trecho SQL para acrescentar ao WHERE (começa com ` AND`, ou é vazio em `todos`). Constante, sem entrada de usuário. */
export function escopoRopa(escopo: EscopoItens, coluna = 'ropa_id'): string {
  if (escopo === 'programa') return ` AND ${coluna} IS NULL`;
  if (escopo === 'atividades') return ` AND ${coluna} IS NOT NULL`;
  return '';
}
