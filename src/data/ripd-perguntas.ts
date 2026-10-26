/**
 * Perguntas do questionário do RIPD (migration 0083). Tudo o que é texto de pergunta mora aqui: trocar a redação é editar este arquivo.
 * As respostas ficam em `dpia_respostas`, fora do hash da aprovação. O id é estável (é a chave gravada): nunca renomeie um id em uso.
 *
 * Fonte: as quatro abas do RIPD do legado (docs/paridade-legado-2026-10-20.md, seção 1). O texto exato das perguntas de Conformidade
 * está cortado nas capturas do legado; as marcadas `// texto a confirmar com o dono` são aproximadas.
 */
export const ABAS_RIPD = [
  { id: 'teste_impacto', rotulo: 'Teste de Impacto' },
  { id: 'conformidade', rotulo: 'Conformidade' },
  { id: 'armazenamento', rotulo: 'Armazenamento' },
] as const;
export type AbaRipd = (typeof ABAS_RIPD)[number]['id'];

export const ESCOLHAS_RIPD = ['sim', 'nao', 'nao_sei'] as const;
export type EscolhaRipd = (typeof ESCOLHAS_RIPD)[number];

/** `sugestao` diz de onde a tela pode propor "A atividade já indica": nunca é gravada. */
export type PerguntaRipd = { id: string; aba: AbaRipd; texto: string; tipo: 'texto' | 'escolha'; sugestao?: 'operadores' | 'armazenamento' | 'volume' };

export const PERGUNTAS_RIPD: readonly PerguntaRipd[] = [
  // Teste de Impacto
  { id: 'resultado_esperado', aba: 'teste_impacto', texto: 'Resultado esperado', tipo: 'texto' },
  { id: 'beneficios', aba: 'teste_impacto', texto: 'Benefícios', tipo: 'texto' },
  { id: 'terceiros_operadores', aba: 'teste_impacto', texto: 'Existem terceiros (operadores) por parte das etapas de tratamento?', tipo: 'escolha', sugestao: 'operadores' },
  { id: 'documentos_escopo_agentes', aba: 'teste_impacto', texto: 'Existem documentos que definem o escopo de atuação desses agentes?', tipo: 'escolha' },
  // Conformidade (texto a confirmar com o dono: o legado corta as perguntas nas capturas)
  { id: 'problema_anterior', aba: 'conformidade', texto: 'Houve algum problema anterior ou incidente registrado com este tratamento?', tipo: 'texto' }, // texto a confirmar com o dono
  { id: 'o_que_muda', aba: 'conformidade', texto: 'O que muda depois do projeto?', tipo: 'texto' }, // texto a confirmar com o dono
  { id: 'por_que_coletados', aba: 'conformidade', texto: 'Por que os dados são coletados?', tipo: 'texto' }, // texto a confirmar com o dono
  { id: 'quantos_titulares', aba: 'conformidade', texto: 'Quantos titulares são afetados?', tipo: 'texto', sugestao: 'volume' }, // texto a confirmar com o dono
  { id: 'quem_aprova_mudancas', aba: 'conformidade', texto: 'Quem aprova mudanças neste tratamento?', tipo: 'texto' }, // texto a confirmar com o dono
  { id: 'partes_envolvidas', aba: 'conformidade', texto: 'As partes interessadas foram envolvidas?', tipo: 'escolha' }, // texto a confirmar com o dono
  { id: 'auditorias_acesso', aba: 'conformidade', texto: 'Há auditorias de acesso aos dados?', tipo: 'escolha' }, // texto a confirmar com o dono
  { id: 'disponibilidade', aba: 'conformidade', texto: 'Como a disponibilidade dos dados é garantida?', tipo: 'texto' }, // texto a confirmar com o dono
  // Armazenamento
  { id: 'onde_ficam', aba: 'armazenamento', texto: 'Onde os dados ficam armazenados?', tipo: 'texto', sugestao: 'armazenamento' },
  { id: 'territorio_nacional', aba: 'armazenamento', texto: 'Os dados ficam em território nacional?', tipo: 'escolha' },
  { id: 'backup_exterior', aba: 'armazenamento', texto: 'Há backup fora do país?', tipo: 'escolha' },
  { id: 'armazenamento_fisico', aba: 'armazenamento', texto: 'Há armazenamento físico?', tipo: 'escolha' },
  { id: 'mecanismos_seguranca', aba: 'armazenamento', texto: 'Quais são os mecanismos de segurança?', tipo: 'texto' },
];

export const PERGUNTA_RIPD_POR_ID = new Map(PERGUNTAS_RIPD.map((p) => [p.id, p]));
/** Teto do corpo do PUT e do texto de cada resposta (o CHECK do banco repete o do texto). */
export const MAX_RESPOSTAS_POR_PUT = 40;
export const MAX_TEXTO_RESPOSTA = 2000;
