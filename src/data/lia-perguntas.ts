/**
 * Perguntas do questionário da LIA (migration 0084). Tudo o que é texto de pergunta mora aqui: trocar a redação é editar este arquivo.
 * As respostas ficam em `lia_respostas`. O id é estável (é a chave gravada): nunca renomeie um id em uso.
 *
 * Fonte: o guia da LIA gravado no legado (docs/superpowers/specs/2026-10-27-guia-legado-ripd-lia-perguntas.md): 23 perguntas, 7 + 5 + 11,
 * textos exatos. No legado toda resposta é caixa de texto livre, então todas são `texto` (o mecanismo `escolha` fica no código, sem uso).
 * A aba Conclusão não tem perguntas aqui: são as colunas de `lia_assessments`.
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
  // Finalidade (7)
  { id: 'finalidades', aba: 'finalidade', texto: 'Para quais finalidades os dados pessoais serão tratados?', tipo: 'texto', sugestao: 'base_legal' },
  { id: 'beneficios_empresa', aba: 'finalidade', texto: 'Quais benefícios serão auferidos pela Cia com o tratamento dos dados pessoais? Por exemplo, melhoria de processos internos, aperfeiçoamento de serviços, ganhos de competitividade ou financeiros, etc.', tipo: 'texto' },
  { id: 'beneficios_terceiros', aba: 'finalidade', texto: 'O tratamento dos dados pessoais beneficiará também a terceiros? Por exemplo, o próprio titular terá alguma vantagem com o tratamento de seus dados? Algum parceiro da Cia ou a própria sociedade terão algum benefício?', tipo: 'texto' },
  { id: 'relevancia_beneficios', aba: 'finalidade', texto: 'Qual a relevância dos benefícios identificados nos dois campos anteriores?', tipo: 'texto' },
  { id: 'consequencias_nao_tratamento', aba: 'finalidade', texto: 'Quais as consequências da não realização do tratamento para a Cia?', tipo: 'texto' },
  { id: 'regulamentacoes_setoriais', aba: 'finalidade', texto: 'O tratamento dos dados pessoais será realizado com base em regulamentações setoriais ou códigos e políticas específicas aplicáveis à Cia? Em caso positivo, favor especificar as regulamentações ou códigos e políticas.', tipo: 'texto' },
  { id: 'aspecto_antietico', aba: 'finalidade', texto: 'Existe algum aspecto do tratamento dos dados pessoais que possa ser considerado antiético? Por exemplo, ainda que o tratamento não seja ilegal, trata-se de uma prática rejeitada pelo mercado ou de potencial questionamento ou repercussão social e midiática? Se sim, qual(is)?', tipo: 'texto' },
  // Necessidade (5)
  { id: 'tratamento_necessario', aba: 'necessidade', texto: 'O tratamento dos dados pessoais é realmente necessário para atingir a finalidade?', tipo: 'texto' },
  { id: 'tratamento_proporcional_finalidade', aba: 'necessidade', texto: 'O tratamento dos dados pessoais será realizado de forma proporcional à finalidade? Por exemplo, tudo o que se pretende fazer com os dados nesta atividade de tratamento está relacionado com a finalidade desejada?', tipo: 'texto' },
  { id: 'finalidade_sem_dados', aba: 'necessidade', texto: 'A finalidade poderia ser alcançada sem o tratamento dos dados pessoais?', tipo: 'texto' },
  { id: 'finalidade_menos_dados', aba: 'necessidade', texto: 'A finalidade poderia ser alcançada com o tratamento de quantidade menor de dados pessoais? Em caso positivo, favor informar quais são os dados estritamente necessários para alcançar a finalidade.', tipo: 'texto' },
  { id: 'finalidade_menos_danosa', aba: 'necessidade', texto: 'A finalidade poderia ser alcançada com o tratamento dos dados pessoais de forma menos danosa para o titular do que a que se propõe? Por exemplo, o tratamento poderia ser realizado com menos riscos para o titular?', tipo: 'texto' }, // texto parcial no guia do legado: confirmar o final
  // Proporcionalidade (11)
  { id: 'dados_sensiveis', aba: 'proporcionalidade', texto: 'Os dados pessoais a serem tratados são considerados dados sensíveis (dado pessoal sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural)?', tipo: 'texto', sugestao: 'dados_sensiveis' },
  { id: 'relacao_formal', aba: 'proporcionalidade', texto: 'Existe uma relação formal com o titular cujo dado se pretende tratar? Se sim, de qual natureza?', tipo: 'texto', sugestao: 'titulares' },
  { id: 'tratamento_anterior', aba: 'proporcionalidade', texto: 'Já foram tratados dados pessoais deste mesmo titular anteriormente? Se sim, para qual finalidade?', tipo: 'texto' },
  { id: 'coleta_direta', aba: 'proporcionalidade', texto: 'Os dados pessoais foram coletados diretamente do titular, ou seja, fornecidos diretamente por ele para a Cia? Se sim, para qual finalidade?', tipo: 'texto' },
  { id: 'ciencia_coleta_terceiros', aba: 'proporcionalidade', texto: 'Se os dados pessoais foram coletados por terceiros, incluindo correspondentes bancários, o titular está ciente do compartilhamento de seus dados pessoais? Se sim, qual a prova dessa ciência? Por exemplo, há algum documento, aceite, registro ou outra forma de demonstrá-la?', tipo: 'texto' },
  { id: 'tempo_desde_coleta', aba: 'proporcionalidade', texto: 'Há quanto tempo os dados pessoais foram coletados?', tipo: 'texto' },
  { id: 'mudanca_expectativa_titular', aba: 'proporcionalidade', texto: 'Desde a coleta dos dados pessoais, houve alguma alteração tecnológica ou contextual que poderia afetar as expectativas originais do titular? Por exemplo, os dados pessoais passaram a ser utilizados de alguma forma distinta da originalmente prevista ou para finalidades diferentes daquelas originalmente informadas ao titular?', tipo: 'texto' },
  { id: 'tecnicas_adequadas', aba: 'proporcionalidade', texto: 'As técnicas que serão utilizadas para o tratamento dos dados pessoais são adequadas e seguem razoavelmente as técnicas de proteção de dados? Por exemplo, o tratamento adotará mecanismos de segurança e outros padrões exigidos e praticados pelo setor?', tipo: 'texto' },
  { id: 'tratamento_inovador', aba: 'proporcionalidade', texto: 'Os dados pessoais serão tratados para a realização de algo novo ou inovador? Por exemplo, algum produto ou serviço diferente e fora das práticas normais de mercado?', tipo: 'texto' },
  { id: 'registro_expectativa_original', aba: 'proporcionalidade', texto: 'Existe algum registro apto a comprovar a expectativa original do titular em relação ao tratamento de seus dados pessoais? Por exemplo, no contrato, ou em outra documentação vinculada ao titular, cláusula ou texto explicando como e por que os dados pessoais serão tratados?', tipo: 'texto' },
  { id: 'registro_ciencia_titulares', aba: 'proporcionalidade', texto: 'Existe algum registro que permita definir se os titulares estão ou não cientes de que tratamento como o que se pretende poderia vir a ser realizado? Por exemplo, no contrato ou outra documentação vinculada ao titular, cláusula ou texto esclarecendo que haverá tratamento de dados pessoais e a respectiva finalidade desse tratamento?', tipo: 'texto' },
];

export const PERGUNTA_LIA_POR_ID = new Map(PERGUNTAS_LIA.map((p) => [p.id, p]));
/** Teto do corpo do PUT e do texto de cada resposta (o CHECK do banco repete o do texto). */
export const MAX_RESPOSTAS_POR_PUT = 40;
export const MAX_TEXTO_RESPOSTA = 2000;
