// Catálogo do modo guiado (PR3): a ajuda e o exemplo de cada pergunta, na chave `aba/campo` que o servidor devolve em
// `ficha.proxima_pergunta`. Os textos de Escopo, Titulares, Dados, Base e Sistemas são os da entrevista antiga (já removida do frontend),
// sem mudança. O que não existia nela (agentes, medidas, coleta da descrição, impacto) é texto novo, a revisar pelo dono.

export const PERGUNTAS_GUIADAS = {
    'escopo/finalidade': {
        titulo: 'Qual atividade da empresa usa dados de pessoas?',
        ajuda: 'Cada atividade vira uma linha do inventário que a ANPD pode pedir (art. 37 da LGPD). Use o nome que a empresa usa no dia a dia.',
        exemplos: ['Folha de pagamento', 'Recrutamento e seleção', 'Cadastro e atendimento de clientes', 'Cobrança', 'Controle de acesso e câmeras', 'Marketing e newsletter'],
    },
    'escopo/responsavel': {
        titulo: 'Quem responde por essa atividade na empresa?',
        ajuda: 'É quem explica o fluxo dos dados se a ANPD ou o titular perguntarem. As opções vêm do cadastro de partes do projeto.',
    },
    'escopo/areas': {
        titulo: 'Qual área executa a atividade?',
        ajuda: 'Delimita quem acessa os dados e quem precisa de treinamento. As áreas vêm do cadastro de departamentos.',
    },
    'escopo/volume_mensal': {
        titulo: 'Quantas pessoas, ou quantos registros, passam por esta atividade em um mês?',
        ajuda: 'Dá a escala do tratamento, que pesa no risco e na decisão sobre o RIPD. Uma estimativa serve.',
        exemplos: ['Cerca de 300 colaboradores', '5 mil cadastros por mês'],
    },
    'tratamento/coleta.titulares': {
        titulo: 'De quem são os dados que a atividade usa?',
        ajuda: 'Os direitos e os prazos mudam conforme a pessoa (art. 18). Marque todos os grupos.',
    },
    'tratamento/coleta.dados': {
        titulo: 'Que tipos de dado cada titular fornece?',
        ajuda: 'É o coração do inventário: sem saber quais dados, não há análise de risco. Dados sensíveis são marcados no próprio item.',
    },
    'tratamento/coleta.consentimento_e_criancas': {
        titulo: 'A coleta pede consentimento, e há crianças ou adolescentes entre essas pessoas?',
        ajuda: 'Consentimento só vale se for livre, informado e comprovável (art. 8). Menores de 18 anos têm proteção reforçada (art. 14).',
    },
    'tratamento/coleta.descricao': {
        titulo: 'Como a coleta acontece, em uma ou duas frases?',
        ajuda: 'Descreva o momento em que o dado entra na empresa. Fica na etapa Coleta e entra na conferência antes da aprovação.',
    },
    'tratamento/coleta.ativos': {
        titulo: 'Em quais sistemas ou arquivos a coleta acontece?',
        ajuda: 'Mostra onde procurar o dado e onde aplicar segurança. As opções vêm dos itens do projeto.',
    },
    'agentes/papel': {
        titulo: 'Nesta atividade, a empresa é controladora, operadora, ou as duas?',
        ajuda: 'O controlador decide para que o dado é tratado; o operador trata em nome dele. Marque o que se aplica.',
    },
    'base_juridica/base': {
        titulo: 'Confirme a hipótese legal',
        ajuda: 'É o texto que vai para o relatório do RoPA e para os pedidos de aprovação. Com dado sensível, só as hipóteses do art. 11 aparecem.',
    },
    'base_juridica/art11': {
        titulo: 'Qual hipótese do art. 11 permite tratar o dado sensível?',
        ajuda: 'A atividade tem dado sensível, e ele só pode ser tratado nas hipóteses do art. 11 da LGPD. Se o dado sensível não entra nesta atividade, marque Não Aplicável.',
    },
    'medidas/medida': {
        titulo: 'Quais medidas de segurança protegem esses dados?',
        ajuda: 'Registre ao menos uma medida. Se o projeto tem o n.iso, pode ligar a medida a um controle já implementado, sem redigitar.',
    },
    'impacto/finalizado': {
        titulo: 'Finalize o teste de impacto',
        ajuda: 'Com todas as perguntas respondidas, marque o teste como finalizado. A recomendação de RIPD aparece na mesma aba.',
    },
};

/** Texto da pergunta. Pergunta de impacto (uma por critério) cai no texto geral: o enunciado completo fica na própria aba. */
export function textoDaPergunta(p) {
    const texto = PERGUNTAS_GUIADAS[`${p.aba}/${p.campo}`];
    if (texto) return texto;
    if (p.aba === 'impacto') {
        return { titulo: 'Responda a pergunta do teste de impacto', ajuda: 'O enunciado completo está na aba Teste de Impacto. Responda sim, não ou não sei.' };
    }
    return { titulo: 'Responda este campo', ajuda: '' };
}
