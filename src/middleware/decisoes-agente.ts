/**
 * Decisões do consultor que o agente MCP toma com o "sim" do consultor no chat e um motivo (spec
 * 2026-10-23-agente-decide-como-consultor). Fonte única: o middleware (resolverAgente) exige a ferramenta certa por rota, e o
 * servidor MCP gera as ferramentas daqui. Ato do CLIENTE não entra aqui (segue em FORA_DO_AGENTE ou na própria rota).
 */
export const CABECALHO_FERRAMENTA = 'X-Agente-Ferramenta';
export const CABECALHO_MOTIVO = 'X-Agente-Motivo';
export const MOTIVO_MAX = 500;

export const FERRAMENTAS_DE_DECISAO = [
  'niso_publicar_documento', 'niso_revisar_documento', 'niso_decidir_passo', 'niso_avaliar_fornecedor', 'niso_situacao_atividade',
  'niso_concluir_acao', 'niso_encerrar_incidente', 'niso_registrar_revogacao', 'niso_importar_programa', 'niso_padronizar_nomes',
  'niso_editar_catalogo',
] as const;
export type FerramentaDecisao = (typeof FERRAMENTAS_DE_DECISAO)[number];

/** `caminho`: modelo com `{param}`; `{projectId}` a ferramenta preenche com o projeto da conexão. `corpo`: a ação leva `dados`. */
export type Decisao = { ferramenta: FerramentaDecisao; acao: string; metodo: 'GET' | 'POST' | 'PUT' | 'DELETE'; caminho: string; corpo?: boolean };

const P = '/api/v1/projects/{projectId}';
export const DECISOES: readonly Decisao[] = [
  { ferramenta: 'niso_publicar_documento', acao: 'publicar', metodo: 'POST', caminho: `${P}/documentos/{documentoId}/versoes/{numero}/publicar` },
  { ferramenta: 'niso_publicar_documento', acao: 'descartar_rascunho', metodo: 'DELETE', caminho: `${P}/documentos/{documentoId}/rascunho` },
  { ferramenta: 'niso_revisar_documento', acao: 'marcar_revisado', metodo: 'POST', caminho: `${P}/documentos/{documentoId}/revisar`, corpo: true },
  { ferramenta: 'niso_revisar_documento', acao: 'revogar_excecao', metodo: 'POST', caminho: `${P}/documentos/{documentoId}/excecoes/{excecaoId}/revogar`, corpo: true },
  { ferramenta: 'niso_decidir_passo', acao: 'concluir', metodo: 'POST', caminho: `${P}/passos/{itemId}/concluir`, corpo: true },
  { ferramenta: 'niso_decidir_passo', acao: 'reabrir', metodo: 'POST', caminho: `${P}/passos/{itemId}/reabrir`, corpo: true },
  { ferramenta: 'niso_decidir_passo', acao: 'bloquear', metodo: 'POST', caminho: `${P}/passos/{itemId}/bloquear`, corpo: true },
  { ferramenta: 'niso_decidir_passo', acao: 'desbloquear', metodo: 'POST', caminho: `${P}/passos/{itemId}/desbloquear`, corpo: true },
  { ferramenta: 'niso_decidir_passo', acao: 'descartar_anotacao_antiga', metodo: 'DELETE', caminho: `${P}/passos/{itemId}/anotacao-anterior` },
  { ferramenta: 'niso_decidir_passo', acao: 'encerrar_situacao_antiga', metodo: 'DELETE', caminho: `${P}/bancada/fases/{fase}/situacao-antiga` },
  { ferramenta: 'niso_avaliar_fornecedor', acao: 'definir_tipo', metodo: 'PUT', caminho: `${P}/terceiros/{parteId}/tipo`, corpo: true },
  { ferramenta: 'niso_avaliar_fornecedor', acao: 'registrar_criticidade', metodo: 'POST', caminho: `${P}/terceiros/{parteId}/criticidades`, corpo: true },
  { ferramenta: 'niso_avaliar_fornecedor', acao: 'registrar_avaliacao', metodo: 'POST', caminho: `${P}/terceiros/{parteId}/avaliacoes`, corpo: true },
  { ferramenta: 'niso_avaliar_fornecedor', acao: 'criar_homologacao', metodo: 'POST', caminho: `${P}/homologacoes`, corpo: true },
  { ferramenta: 'niso_avaliar_fornecedor', acao: 'criar_pergunta_homologacao', metodo: 'POST', caminho: `${P}/homologacoes/perguntas`, corpo: true },
  { ferramenta: 'niso_avaliar_fornecedor', acao: 'editar_pergunta_homologacao', metodo: 'PUT', caminho: `${P}/homologacoes/perguntas/{perguntaId}`, corpo: true },
  { ferramenta: 'niso_avaliar_fornecedor', acao: 'concluir_homologacao', metodo: 'POST', caminho: `${P}/homologacoes/{homologacaoId}/concluir`, corpo: true },
  { ferramenta: 'niso_avaliar_fornecedor', acao: 'cancelar_homologacao', metodo: 'POST', caminho: `${P}/homologacoes/{homologacaoId}/cancelar`, corpo: true },
  { ferramenta: 'niso_situacao_atividade', acao: 'mudar_situacao', metodo: 'POST', caminho: `${P}/ropa/{ropaId}/situacao`, corpo: true },
  { ferramenta: 'niso_concluir_acao', acao: 'concluir_capa', metodo: 'PUT', caminho: '/api/v1/capa/{acaoId}', corpo: true },
  { ferramenta: 'niso_concluir_acao', acao: 'concluir_acao_da_atividade', metodo: 'PUT', caminho: `${P}/ropa/{ropaId}/acoes/{acaoId}`, corpo: true },
  { ferramenta: 'niso_concluir_acao', acao: 'concluir_gap', metodo: 'PUT', caminho: `${P}/ropa/{ropaId}/gaps/{gapId}`, corpo: true },
  { ferramenta: 'niso_encerrar_incidente', acao: 'encerrar', metodo: 'POST', caminho: `${P}/incidentes/{incidenteId}/encerrar` },
  { ferramenta: 'niso_registrar_revogacao', acao: 'revogar_consentimento', metodo: 'POST', caminho: `${P}/consentimentos/{consentimentoId}/revogar`, corpo: true },
  { ferramenta: 'niso_importar_programa', acao: 'listar_lotes', metodo: 'GET', caminho: `${P}/importacoes` },
  { ferramenta: 'niso_importar_programa', acao: 'ler_lote', metodo: 'GET', caminho: `${P}/importacoes/{loteId}` },
  { ferramenta: 'niso_importar_programa', acao: 'reconciliacao', metodo: 'GET', caminho: `${P}/importacoes/{loteId}/reconciliacao` },
  { ferramenta: 'niso_importar_programa', acao: 'criar_lote', metodo: 'POST', caminho: `${P}/importacoes`, corpo: true },
  { ferramenta: 'niso_importar_programa', acao: 'processar_arquivo', metodo: 'POST', caminho: `${P}/importacoes/{loteId}/arquivos/{arquivoId}/processar` },
  { ferramenta: 'niso_importar_programa', acao: 'editar_item', metodo: 'PUT', caminho: `${P}/importacoes/{loteId}/itens/{itemId}`, corpo: true },
  { ferramenta: 'niso_importar_programa', acao: 'decidir_itens', metodo: 'POST', caminho: `${P}/importacoes/{loteId}/itens/decidir`, corpo: true },
  { ferramenta: 'niso_importar_programa', acao: 'confirmar', metodo: 'POST', caminho: `${P}/importacoes/{loteId}/confirmar` },
  { ferramenta: 'niso_importar_programa', acao: 'cancelar_lote', metodo: 'DELETE', caminho: `${P}/importacoes/{loteId}` },
  { ferramenta: 'niso_padronizar_nomes', acao: 'propostas', metodo: 'GET', caminho: `${P}/padronizar-nomes` },
  { ferramenta: 'niso_padronizar_nomes', acao: 'padronizar', metodo: 'POST', caminho: `${P}/padronizar-nomes`, corpo: true },
  // Editar o catálogo é da equipe da ness (ropa-abas.ts); criar segue livre a quem escreve, fora da decisão.
  { ferramenta: 'niso_editar_catalogo', acao: 'editar_item', metodo: 'PUT', caminho: `${P}/catalogos/{tipo}/{itemId}`, corpo: true },
];

export const parametrosDe = (modelo: string): string[] => [...modelo.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
const regexDe = (modelo: string) => new RegExp('^' + modelo.replace(/\{\w+\}/g, '[^/]+') + '$');
const COMPILADAS = DECISOES.map((d) => ({ d, re: regexDe(d.caminho) }));

/** A decisão que a rota é, ou null. Caminho já DECODIFICADO (c.req.path), sem query. */
export function decisaoDaRota(metodo: string, caminho: string): Decisao | null {
  const m = metodo.toUpperCase();
  return COMPILADAS.find(({ d, re }) => d.metodo === m && re.test(caminho))?.d ?? null;
}
