/**
 * Post mortem do incidente ("Análise de Causa Raiz", fatia 5, migration 0103): as 14 perguntas do legado, com o texto exato das capturas
 * de 23/10/2026. Abre só depois do encerramento (decisão do dono de 04/11/2026). As respostas ficam em `incidente_postmortem`.
 * O id é estável (é a chave gravada): nunca renomeie um id em uso. Toda resposta é texto livre, como no legado.
 */
export const PERGUNTAS_POSTMORTEM = [
  { id: 'resposta_equipe', texto: 'Como a equipe de solução de incidentes respondeu? (descrever se a comunicação fluiu adequadamente, como os envolvidos na resolução do incidente reagiram):' },
  { id: 'procedimentos', texto: 'Os procedimentos documentados existentes na empresa para Gestão de Incidentes foram seguidos? Eles são adequados?' },
  { id: 'politica_adicional', texto: 'Uma política/procedimento adicional poderia ter evitado o incidente?' },
  { id: 'desobediencia', texto: 'O incidente de segurança ocorreu por falta de obediência a algum procedimento e/ou política interna? Caso positivo, o que pode ser feito de forma diferente para assegurar a obediência aos procedimentos e/ou política interna?' },
  { id: 'politica_atualizar', texto: 'Alguma política de segurança deve ser atualizada?' },
  { id: 'informacoes_cedo', texto: 'Quais informações foram necessárias mais cedo? A equipe teve acesso a todas as informações no tempo correto?' },
  { id: 'prejudicou_recuperacao', texto: 'Durante a gestão do incidente aconteceram situações que poderiam ter prejudicado a recuperação (por exemplo, um backup falhou ou alguém não pode ser contatado)?' },
  { id: 'melhorar', texto: 'O que a equipe de resolução de incidentes poderia melhorar para um eventual próximo incidente?' },
  { id: 'medidas_corretivas', texto: 'Quais medidas corretivas devem ser adotadas para evitar um incidente similar no futuro (por exemplo, estabelecer um fluxo de comunicação entre o RH e a equipe responsável pelo controle de acesso, manter sistemas operacionais atualizados etc.)?' },
  { id: 'recursos_adicionais', texto: 'Quais recursos adicionais são necessários para detectar, analisar e mitigar incidentes no futuro (recursos humanos e/ou tecnológicos)?' },
  { id: 'partes_informadas', texto: 'Em caso de vazamento de dados pessoais, as partes envolvidas foram informadas em um tempo apropriado?' },
  { id: 'autoridades', texto: 'Foi necessário comunicar autoridades sobre o incidente? Se sim, quais?' },
  { id: 'nao_comunicar', texto: 'A empresa decidiu por não comunicar nenhuma autoridade? Se sim, justificar.' },
  { id: 'documentado', texto: 'Todo o processo de gestão do incidente desde a ameaça até a recuperação foi documentado conforme previsto na política de gestão de incidentes da empresa?' },
] as const;

export const PERGUNTA_POSTMORTEM_IDS: ReadonlySet<string> = new Set(PERGUNTAS_POSTMORTEM.map((p) => p.id));
export const MAX_TEXTO_POSTMORTEM = 5000;
