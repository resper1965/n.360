/**
 * Perguntas do questionário da LIA (migration 0084). Tudo o que é texto de pergunta mora aqui: trocar a redação é editar este arquivo.
 * As respostas ficam em `lia_respostas`. O id é estável (é a chave gravada): nunca renomeie um id em uso.
 *
 * Fonte: as guias da LIA do legado (docs/paridade-legado-2026-10-20.md, seção 2). As redações são aproximadas e as marcadas
 * `// texto a confirmar com o dono` precisam da revisão dele. A aba Conclusão não tem perguntas aqui: são as colunas de `lia_assessments`.
 */
export const ABAS_LIA = [
  { id: 'finalidade', rotulo: 'Finalidade' },
  { id: 'necessidade', rotulo: 'Necessidade' },
  { id: 'proporcionalidade', rotulo: 'Proporcionalidade' },
] as const;
export type AbaLia = (typeof ABAS_LIA)[number]['id'];

export const ESCOLHAS_LIA = ['sim', 'nao', 'nao_sei'] as const;

/** `sugestao` diz de onde a tela pode propor "A atividade já indica": nunca é gravada. */
export type PerguntaLia = { id: string; aba: AbaLia; texto: string; tipo: 'texto' | 'escolha'; sugestao?: 'base_legal' | 'titulares' | 'dados_sensiveis' };

export const PERGUNTAS_LIA: readonly PerguntaLia[] = [
  // Finalidade
  { id: 'finalidades', aba: 'finalidade', texto: 'Quais são as finalidades do tratamento?', tipo: 'texto', sugestao: 'base_legal' }, // texto a confirmar com o dono
  { id: 'beneficios_empresa', aba: 'finalidade', texto: 'Quais são os benefícios para a empresa?', tipo: 'texto' }, // texto a confirmar com o dono
  { id: 'beneficios_terceiros', aba: 'finalidade', texto: 'Quais são os benefícios para terceiros?', tipo: 'texto' }, // texto a confirmar com o dono
  { id: 'relevancia_beneficios', aba: 'finalidade', texto: 'Qual é a relevância desses benefícios?', tipo: 'texto' }, // texto a confirmar com o dono
  // Necessidade
  { id: 'realmente_necessario', aba: 'necessidade', texto: 'O tratamento é realmente necessário?', tipo: 'escolha' }, // texto a confirmar com o dono
  { id: 'proporcional', aba: 'necessidade', texto: 'O tratamento é proporcional?', tipo: 'escolha' }, // texto a confirmar com o dono
  { id: 'alcancada_sem_dados', aba: 'necessidade', texto: 'A finalidade seria alcançada sem o uso dos dados?', tipo: 'escolha' }, // texto a confirmar com o dono
  { id: 'menos_dados', aba: 'necessidade', texto: 'A finalidade seria alcançada com menos dados? Quais?', tipo: 'texto' }, // texto a confirmar com o dono
  // Proporcionalidade
  { id: 'dados_sensiveis', aba: 'proporcionalidade', texto: 'Há dados sensíveis no tratamento?', tipo: 'escolha', sugestao: 'dados_sensiveis' }, // texto a confirmar com o dono
  { id: 'relacao_formal', aba: 'proporcionalidade', texto: 'Existe relação formal com o titular?', tipo: 'escolha', sugestao: 'titulares' }, // texto a confirmar com o dono
  { id: 'tratamento_anterior', aba: 'proporcionalidade', texto: 'Já houve tratamento anterior dos dados desse titular?', tipo: 'escolha' }, // texto a confirmar com o dono
  { id: 'coleta_direta', aba: 'proporcionalidade', texto: 'A coleta dos dados é direta?', tipo: 'escolha' }, // texto a confirmar com o dono
];

export const PERGUNTA_LIA_POR_ID = new Map(PERGUNTAS_LIA.map((p) => [p.id, p]));
/** Teto do corpo do PUT e do texto de cada resposta (o CHECK do banco repete o do texto). */
export const MAX_RESPOSTAS_POR_PUT = 40;
export const MAX_TEXTO_RESPOSTA = 2000;
