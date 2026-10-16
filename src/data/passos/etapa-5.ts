// Etapa 5 da trilha (fases 29 a 33): treinamento, monitoramento, auditoria interna, ações corretivas e análise crítica.
// Conteúdo editorial do produto; a estrutura segue o contrato de ./tipos.
import type { FaseDoCatalogo, Passo } from './tipos';

export const FASES_ETAPA_5: FaseDoCatalogo[] = [
  {
    numero: 29, etapa: 5, titulo: 'Conscientização e treinamento', clausula: 'Cl 7.2, 7.3 e A.6.3',
    objetivo: 'Treinar as pessoas do escopo em segurança da informação e privacidade, medir se o treinamento funciona e guardar os registros que o auditor vai conferir por amostragem.',
  },
  {
    numero: 30, etapa: 5, titulo: 'Monitoramento e indicadores', clausula: 'Cl 9.1',
    objetivo: 'Definir o que será medido no sistema de gestão, com meta, responsável e frequência, e guardar os resultados de cada período. São eles que alimentam a análise crítica da direção.',
  },
  {
    numero: 31, etapa: 5, titulo: 'Auditoria interna', clausula: 'Cl 9.2',
    objetivo: 'Planejar e executar a auditoria interna de todo o escopo, com auditores imparciais, e entregar o relatório à direção. É o ensaio do que o organismo certificador fará depois.',
  },
  {
    numero: 32, etapa: 5, titulo: 'Não conformidades e ações corretivas', clausula: 'Cl 10.2',
    objetivo: 'Registrar cada não conformidade, descobrir a causa, corrigir e conferir depois se a correção funcionou. O auditor externo confere se os achados da auditoria interna foram realmente tratados.',
  },
  {
    numero: 33, etapa: 5, titulo: 'Análise crítica pela direção', clausula: 'Cl 9.3',
    objetivo: 'Reunir a alta direção para avaliar se o sistema continua adequado, suficiente e eficaz, e registrar em ata as decisões, as melhorias e os recursos aprovados.',
  },
];

export const PASSOS_ETAPA_5: Passo[] = [
  // ── Fase 29: Conscientização e treinamento ─────────────────────────────────
  {
    id: 'p29_1', fase: 29, ordem: 1,
    titulo: 'Aplicar o treinamento geral de segurança e privacidade',
    clausula: 'Cl 7.3 e A.6.3',
    porQue: 'O auditor pede o conteúdo do treinamento e a lista de quem participou. A.6.3 exige que as pessoas do escopo recebam conscientização, educação e treinamento adequados à função, com atualização periódica; a cláusula 7.3 exige que conheçam a política e a contribuição delas para o sistema. Ele costuma sortear alguns nomes e perguntar o que lembram.',
    campos: [
      { id: 'date', rotulo: 'Em que data o treinamento foi aplicado?', tipo: 'data', obrigatorio: true, exemplo: '' },
      { id: 'format', rotulo: 'Como foi aplicado?', tipo: 'escolha', obrigatorio: true, exemplo: '', opcoes: ['Presencial', 'Online ao vivo', 'E-learning', 'Híbrido'] },
      { id: 'attendance', rotulo: 'Quantas pessoas participaram, em relação ao total?', tipo: 'texto', obrigatorio: true, exemplo: '92% (230 de 250 pessoas)' },
      { id: 'topics', rotulo: 'Quais temas foram cobertos?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Política de segurança, senhas, golpes por e-mail, mesa limpa, tratamento de dados pessoais (LGPD) e como comunicar um incidente.' },
      { id: 'evidence_desc', rotulo: 'Quais registros comprovam o treinamento?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Lista de presença assinada e relatório da plataforma de ensino, exportados em 12/03.' },
      { id: 'programa', rotulo: 'Existe um programa de conscientização em segurança e privacidade?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim, recorrente', 'Pontual', 'Não'], pergunta: 'p29_q1' },
    ],
    prova: { descricao: 'Lista de presença ou relatório da plataforma de ensino, junto com o conteúdo aplicado.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'training', rotulo: 'Abrir os treinamentos' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Data, formato, participação e registros preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Lista de presença ou relatório da plataforma anexado' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos um treinamento registrado', entidade: 'treinamentos', minimo: 1 },
    ],
  },
  {
    id: 'p29_2', fase: 29, ordem: 2,
    titulo: 'Simular golpes por e-mail (phishing) com a equipe',
    clausula: 'Cl 7.2 e A.6.3',
    porQue: 'Nenhuma cláusula exige a simulação, mas ela é a evidência mais usada de que o treinamento funciona: a cláusula 7.2 pede avaliar a eficácia das ações de competência. O auditor quer ver o resultado (quem clicou, quem avisou o suporte) e o que foi feito depois. Avise a equipe de que simulações acontecem e trate o resultado individual com discrição.',
    campos: [
      { id: 'date', rotulo: 'Em que data a simulação foi feita?', tipo: 'data', obrigatorio: true, exemplo: '' },
      { id: 'scope', rotulo: 'Quem recebeu a simulação e qual foi o cenário?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Todas as 250 pessoas do escopo; e-mail falso pedindo troca de senha do correio.' },
      { id: 'results', rotulo: 'Qual foi o resultado?', tipo: 'texto_longo', obrigatorio: true, exemplo: '250 e-mails enviados, 18 pessoas clicaram, 40 avisaram o suporte.' },
      { id: 'actions', rotulo: 'O que foi feito com quem clicou?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Treinamento curto de 15 minutos e nova simulação no trimestre seguinte.' },
    ],
    prova: { descricao: 'Relatório da simulação com o resultado e as ações de reforço.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'training', rotulo: 'Abrir os treinamentos' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Data, público, cenário e resultado preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Relatório da simulação anexado' },
    ],
  },
  {
    id: 'p29_3', fase: 29, ordem: 3,
    titulo: 'Registrar a participação de cada pessoa',
    clausula: 'Cl 7.2',
    porQue: 'O auditor sorteia nomes do quadro de pessoas e pede a prova de que cada uma foi treinada: a cláusula 7.2 exige informação documentada como evidência de competência. Quem entrou depois do treinamento geral também precisa constar, com a data do treinamento que recebeu.',
    campos: [
      { id: 'total', rotulo: 'Quantas pessoas do escopo já foram treinadas?', tipo: 'texto', obrigatorio: true, exemplo: '230 de 250' },
      { id: 'coverage_pct', rotulo: 'Qual o percentual de cobertura?', tipo: 'texto', obrigatorio: true, exemplo: '92%' },
      { id: 'coverage', rotulo: 'Em que faixa está a cobertura de treinamento entre as pessoas?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['> 90%', '50–90%', '< 50%'], pergunta: 'p29_q2' },
      { id: 'storage', rotulo: 'Onde ficam guardados os registros?', tipo: 'texto', obrigatorio: true, exemplo: 'Plataforma de ensino, com cópia mensal em planilha do RH.' },
      { id: 'records', rotulo: 'Os registros de treinamento (evidências) são mantidos?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p29_q3' },
      { id: 'evidence_desc', rotulo: 'Que relatório ou lista mostra a participação de cada pessoa?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Relatório da plataforma de ensino com nome, data e nota, exportado em 15/03.' },
    ],
    prova: { descricao: 'Registro de participação de todas as pessoas do escopo, com data e conteúdo.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'training', rotulo: 'Abrir os registros de treinamento' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Total, cobertura e local dos registros preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Relatório de participação anexado' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos um treinamento registrado', entidade: 'treinamentos', minimo: 1 },
    ],
  },

  // ── Fase 30: Monitoramento e indicadores ───────────────────────────────────
  {
    id: 'p30_1', fase: 30, ordem: 1,
    titulo: 'Definir os indicadores do sistema de gestão',
    clausula: 'Cl 9.1',
    porQue: 'O auditor pergunta o que a organização decidiu medir, por qual método, quando, quem mede e quem analisa os resultados (Cl 9.1). Indicador sem meta, método, frequência e responsável não permite avaliar o desempenho nem a eficácia do sistema, e é isso que ele vai cobrar.',
    campos: [
      { id: 'kpis', rotulo: 'Quais indicadores serão acompanhados?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Correções críticas aplicadas em até 15 dias; tempo médio de resposta a incidentes; pessoas treinadas; vulnerabilidades críticas abertas.' },
      { id: 'targets', rotulo: 'Qual a meta, o método de medição e a frequência de cada um?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Pessoas treinadas: meta 95%, relatório da plataforma de ensino, medido todo trimestre.' },
      { id: 'owner', rotulo: 'Quem mede e quem analisa os resultados?', tipo: 'texto', obrigatorio: true, semIA: true, exemplo: 'Nome e cargo de quem mede e de quem analisa cada indicador.' },
      { id: 'defined', rotulo: 'Os indicadores (de desempenho e de risco) de segurança foram definidos?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p30_q1' },
    ],
    prova: { descricao: 'Ficha de cada indicador com meta, método, frequência e responsável.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'metrics', rotulo: 'Abrir os indicadores' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Indicadores, responsável e metas preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Ficha dos indicadores anexada' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos três indicadores cadastrados', entidade: 'metricas', minimo: 3 },
    ],
    gera: 'documento',
  },
  {
    id: 'p30_2', fase: 30, ordem: 2,
    titulo: 'Montar o painel de conformidade',
    clausula: 'Cl 9.1',
    porQue: 'O painel deixa os resultados visíveis para quem decide. O auditor pede para ver os indicadores de segurança com os valores do período e a data da leitura, e confere se a direção usa esses dados na análise crítica (Cl 9.3).',
    campos: [
      { id: 'tool', rotulo: 'Em que ferramenta fica o painel?', tipo: 'texto', obrigatorio: true, exemplo: 'Painel do n.360, com exportação mensal em planilha.' },
      { id: 'kpis', rotulo: 'Quais indicadores aparecem no painel?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Pessoas treinadas, correções críticas em dia, incidentes do mês, controles implementados.' },
      { id: 'evidence_desc', rotulo: 'Que captura do painel prova os valores e a data?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Captura de tela do painel de 05/04, com os valores do primeiro trimestre.' },
    ],
    prova: { descricao: 'Captura do painel com os indicadores, os valores e a data.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'metrics', rotulo: 'Abrir os indicadores' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Ferramenta, indicadores e captura descritos' },
      { tipo: 'evidencia_anexada', rotulo: 'Captura do painel anexada' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos um indicador cadastrado no n.360', entidade: 'metricas', minimo: 1 },
    ],
  },
  {
    id: 'p30_3', fase: 30, ordem: 3,
    titulo: 'Guardar os relatórios periódicos de monitoramento',
    clausula: 'Cl 9.1',
    porQue: 'A cláusula 9.1 exige informação documentada como evidência dos resultados de monitoramento e medição. O auditor quer ver mais de um período, para enxergar a tendência: um painel do dia não prova que o monitoramento acontece de fato.',
    campos: [
      { id: 'metricas_coletadas', rotulo: 'Quais métricas são coletadas e com que frequência?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Mensal: incidentes e vulnerabilidades críticas abertas. Trimestral: pessoas treinadas e controles implementados.', pergunta: 'p30_q2' },
      { id: 'content', rotulo: 'O que o relatório periódico traz?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Valor de cada indicador, tendência em relação ao período anterior, incidentes, ações corretivas e próximos passos.' },
      { id: 'frequency', rotulo: 'Com que frequência o relatório é emitido?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Mensal', 'Trimestral', 'Semestral'] },
    ],
    prova: { descricao: 'Relatórios periódicos dos indicadores, guardados com a data de cada período.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'metrics', rotulo: 'Abrir os indicadores' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Métricas, conteúdo e frequência preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Relatórios de ao menos um período anexados' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos um indicador cadastrado no n.360', entidade: 'metricas', minimo: 1 },
    ],
  },

  // ── Fase 31: Auditoria interna ─────────────────────────────────────────────
  {
    id: 'p31_1', fase: 31, ordem: 1,
    titulo: 'Elaborar o programa e o plano de auditoria interna',
    clausula: 'Cl 9.2.2',
    porQue: 'O auditor pede o programa de auditoria interna, com frequência, métodos, responsabilidades, exigências de planejamento e relatórios, que leva em conta a importância dos processos e os resultados de auditorias anteriores (Cl 9.2.2). Também pede o plano de cada auditoria, com critérios e escopo.',
    campos: [
      { id: 'program', rotulo: 'Qual a frequência, o método, quem audita e a agenda do programa?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Anual, por entrevista e amostra de registros, conduzida por auditor externo independente; ciclo completo em março.' },
      { id: 'criteria', rotulo: 'Contra o que a auditoria vai comparar o sistema?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Cláusulas 4 a 10 da ISO/IEC 27001:2022, controles do Anexo A aplicáveis na declaração de aplicabilidade e os documentos do próprio sistema.' },
      { id: 'scope', rotulo: 'O que será auditado neste ciclo?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Todo o escopo do certificado: desenvolvimento e operação da plataforma, na sede e no trabalho remoto.' },
      { id: 'programa_existe', rotulo: 'Existe um programa de auditoria interna do sistema?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Rascunho', 'Não'], pergunta: 'p31_q1' },
    ],
    prova: { descricao: 'Programa de auditoria aprovado e plano da auditoria do ciclo.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'audits', rotulo: 'Abrir o programa de auditorias' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Programa, critérios e escopo preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Programa e plano de auditoria anexados' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma auditoria agendada', entidade: 'auditorias', minimo: 1 },
    ],
    gera: 'documento',
  },
  {
    id: 'p31_2', fase: 31, ordem: 2,
    titulo: 'Executar a auditoria interna de todo o escopo',
    clausula: 'Cl 9.2.1 e 9.2.2',
    porQue: 'A auditoria interna verifica se o sistema atende aos requisitos da organização e da norma e se está implementado e mantido (Cl 9.2.1). O auditor externo pergunta se o ciclo cobriu todas as cláusulas e os controles aplicáveis e se quem audita é imparcial: ninguém audita o próprio trabalho (Cl 9.2.2).',
    campos: [
      { id: 'date', rotulo: 'Em que data ou período a auditoria foi feita?', tipo: 'texto', obrigatorio: true, exemplo: '10 a 14 de março' },
      { id: 'auditor', rotulo: 'Quem conduziu a auditoria?', tipo: 'texto', obrigatorio: true, semIA: true, ajuda: 'A ISO 19011 orienta como conduzir auditorias de sistemas de gestão.', exemplo: 'Nome e vínculo do auditor (por exemplo, consultor externo).' },
      { id: 'independent', rotulo: 'Os auditores internos são independentes da área auditada?', tipo: 'escolha', obrigatorio: true, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p31_q2' },
      { id: 'scope', rotulo: 'O que foi auditado?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Cláusulas 4 a 10 e os controles do Anexo A aplicáveis, nas áreas de TI, RH, Jurídico e Desenvolvimento.' },
      { id: 'findings', rotulo: 'Em resumo, o que a auditoria encontrou?', tipo: 'texto_longo', obrigatorio: true, exemplo: '2 não conformidades maiores, 5 menores e 3 oportunidades de melhoria.' },
      { id: 'evidence_desc', rotulo: 'Quais registros da auditoria existem?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Plano da auditoria, lista de entrevistados, amostras de evidências avaliadas e relatório.' },
    ],
    prova: { descricao: 'Registros da auditoria: plano, entrevistas e evidências avaliadas.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'audit-execution', rotulo: 'Abrir a execução da auditoria' }, { tela: 'audits', rotulo: 'Abrir o programa de auditorias' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Data, auditor, independência, escopo e achados preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Plano, entrevistas e evidências da auditoria anexados' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma auditoria registrada', entidade: 'auditorias', minimo: 1 },
    ],
  },
  {
    id: 'p31_3', fase: 31, ordem: 3,
    titulo: 'Emitir o relatório da auditoria interna',
    clausula: 'Cl 9.2.2',
    porQue: 'Os resultados da auditoria precisam ser relatados à gerência responsável, e o relatório é a informação documentada que prova o programa e seus resultados (Cl 9.2.2). Ele alimenta as ações corretivas (Cl 10.2) e a análise crítica pela direção (Cl 9.3).',
    campos: [
      { id: 'findings', rotulo: 'Quais foram os achados, com a referência da cláusula ou do controle?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'NC maior: sem revisão de acessos nos últimos 12 meses (A.5.18). Oportunidade: automatizar o aviso de desligamento.' },
      { id: 'conclusion', rotulo: 'Qual a conclusão geral sobre o sistema?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'O sistema está implementado, com duas não conformidades maiores a corrigir antes da auditoria de certificação.' },
      { id: 'reported_to', rotulo: 'Para quem e quando o relatório foi entregue?', tipo: 'texto', obrigatorio: false, semIA: true, exemplo: 'Nome e cargo de quem recebeu, e a data da entrega.' },
    ],
    prova: { descricao: 'Relatório da auditoria interna entregue à direção.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'audits', rotulo: 'Abrir o programa de auditorias' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Achados e conclusão escritos' },
      { tipo: 'evidencia_anexada', rotulo: 'Relatório entregue à direção anexado' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma auditoria registrada', entidade: 'auditorias', minimo: 1 },
    ],
    gera: 'documento',
  },

  // ── Fase 32: Não conformidades e ações corretivas ──────────────────────────
  {
    id: 'p32_1', fase: 32, ordem: 1,
    titulo: 'Registrar as não conformidades e descobrir a causa',
    clausula: 'Cl 10.2',
    porQue: 'Diante de uma não conformidade, a organização reage, controla e corrige, avalia se precisa eliminar a causa (analisando-a e vendo se há casos parecidos) e guarda a natureza da não conformidade e as ações tomadas (Cl 10.2). O auditor externo parte do relatório da auditoria interna e confere se cada achado tem registro e causa.',
    campos: [
      { id: 'ncs', rotulo: 'Quais não conformidades foram registradas?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'NC 1: sem revisão semestral de acessos (A.5.18). NC 2: ata da análise crítica sem decisões registradas (Cl 9.3.3).' },
      { id: 'analysis', rotulo: 'Qual a causa de cada uma e como foi descoberta?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'NC 1: ninguém era responsável pela revisão. Método: cinco porquês com o gerente de TI.' },
      { id: 'registered', rotulo: 'As não conformidades são registradas e tratadas como ações corretivas?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p32_q1' },
    ],
    prova: { descricao: 'Registro das não conformidades com a análise da causa (no n.360, em Ações corretivas).', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'capa', rotulo: 'Abrir as ações corretivas' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Não conformidades e causas escritas' },
      { tipo: 'evidencia_anexada', rotulo: 'Registro das não conformidades anexado' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma ação corretiva aberta', entidade: 'acoes_corretivas', minimo: 1 },
    ],
    gera: 'documento',
  },
  {
    id: 'p32_2', fase: 32, ordem: 2,
    titulo: 'Executar as ações corretivas no prazo',
    clausula: 'Cl 10.2',
    porQue: 'As ações corretivas precisam ser proporcionais aos efeitos da não conformidade e executadas no prazo (Cl 10.2). O auditor pede a lista com responsável, prazo e situação: corrigir só o sintoma, sem tratar a causa, faz o problema voltar.',
    campos: [
      { id: 'actions', rotulo: 'Quais ações foram definidas, com responsável, prazo e situação?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'NC 1: criar a rotina de revisão semestral de acessos; responsável: gerente de TI; prazo: 30/04; situação: em andamento.' },
    ],
    prova: { descricao: 'Ações corretivas com responsável, prazo e situação.', obrigatoria: false, aceita: 'ambos' },
    ondeVive: [{ tela: 'capa', rotulo: 'Abrir as ações corretivas' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Ações, responsáveis e prazos escritos' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma ação corretiva cadastrada', entidade: 'acoes_corretivas', minimo: 1 },
      { tipo: 'responsavel_e_prazo', rotulo: 'Responsável e prazo definidos no passo' },
    ],
  },
  {
    id: 'p32_3', fase: 32, ordem: 3,
    titulo: 'Verificar se as correções funcionaram',
    clausula: 'Cl 10.2',
    porQue: 'A cláusula 10.2 pede analisar a eficácia de toda ação corretiva tomada. O auditor escolhe uma não conformidade antiga e pergunta o que foi verificado depois da correção e se o problema voltou; correção sem verificação de eficácia costuma virar nova constatação.',
    campos: [
      { id: 'verifier', rotulo: 'Quem verificou a eficácia?', tipo: 'texto', obrigatorio: true, semIA: true, exemplo: 'Nome e cargo de quem verificou, diferente de quem corrigiu.' },
      { id: 'date', rotulo: 'Em que data foi feita a verificação?', tipo: 'data', obrigatorio: true, exemplo: '' },
      { id: 'method', rotulo: 'Como a eficácia das ações corretivas é verificada?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Nova amostra de 20 acessos três meses depois da correção; nenhum acesso sem revisão registrada.', pergunta: 'p32_q2' },
      { id: 'result', rotulo: 'Qual foi o resultado da verificação?', tipo: 'escolha', obrigatorio: true, exemplo: '', opcoes: ['Todas as correções eficazes', 'Maioria eficaz, retrabalho em algumas', 'Correções ineficazes'] },
      { id: 'evidence_desc', rotulo: 'Que registro mostra a verificação?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Planilha da amostra, com data e responsável, e a ação corretiva fechada no n.360.' },
    ],
    prova: { descricao: 'Registro da verificação de eficácia, com data e responsável.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'capa', rotulo: 'Abrir as ações corretivas' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Quem verificou, quando, como e com que resultado' },
      { tipo: 'evidencia_anexada', rotulo: 'Registro da verificação anexado' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma ação corretiva cadastrada', entidade: 'acoes_corretivas', minimo: 1 },
    ],
  },

  // ── Fase 33: Análise crítica pela direção ──────────────────────────────────
  {
    id: 'p33_1', fase: 33, ordem: 1,
    titulo: 'Preparar as entradas da análise crítica',
    clausula: 'Cl 9.3.2',
    porQue: 'A cláusula 9.3.2 lista o que a direção precisa receber: situação das ações de análises anteriores; mudanças nas questões internas e externas e nas necessidades das partes interessadas; desempenho (não conformidades, monitoramento, auditorias e objetivos); retorno das partes interessadas; resultado da avaliação de riscos e do tratamento; oportunidades de melhoria.',
    campos: [
      { id: 'agenda', rotulo: 'Quais itens estarão na pauta?', tipo: 'texto_longo', obrigatorio: true, exemplo: '1. Ações da análise anterior. 2. Mudanças internas e externas. 3. Indicadores. 4. Auditorias e não conformidades. 5. Riscos e seu tratamento. 6. Retorno das partes interessadas. 7. Melhorias e recursos.' },
      { id: 'material', rotulo: 'Que dados e relatórios vão para a direção antes da reunião?', tipo: 'texto_longo', obrigatorio: false, exemplo: 'Relatório da auditoria interna, painel de indicadores do ano e lista de ações corretivas abertas.' },
    ],
    prova: { descricao: 'Pauta e material de entrada preparados para a reunião.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'management-review', rotulo: 'Abrir a análise crítica' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Pauta com todos os itens da cláusula 9.3.2 escrita' },
      { tipo: 'evidencia_anexada', rotulo: 'Pauta e material de entrada anexados' },
    ],
    gera: 'documento',
  },
  {
    id: 'p33_2', fase: 33, ordem: 2,
    titulo: 'Realizar a reunião de análise crítica com a alta direção',
    clausula: 'Cl 9.3.1',
    porQue: 'A alta direção analisa o sistema em intervalos planejados para garantir que continua adequado, suficiente e eficaz (Cl 9.3.1). O auditor confere se quem participou é de fato a alta direção e se todas as entradas da cláusula 9.3.2 foram tratadas.',
    campos: [
      { id: 'date', rotulo: 'Em que data a reunião aconteceu?', tipo: 'data', obrigatorio: true, exemplo: '' },
      { id: 'participants', rotulo: 'Quem da alta direção participou?', tipo: 'texto_longo', obrigatorio: true, semIA: true, exemplo: 'Nome e cargo de cada participante, como na lista de presença.' },
      { id: 'inputs_covered', rotulo: 'Quais entradas da cláusula 9.3.2 foram tratadas?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Ações anteriores, mudanças, indicadores, auditorias, não conformidades, riscos, melhorias.' },
      { id: 'evidence_desc', rotulo: 'Que registros comprovam a reunião?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Convocação de 02/04, lista de presença assinada e ata aprovada.' },
      { id: 'regularidade', rotulo: 'A análise crítica pela direção acontece com regularidade?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Uma vez', 'Não'], pergunta: 'p33_q1' },
    ],
    prova: { descricao: 'Convocação, lista de presença e ata da reunião.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'management-review', rotulo: 'Abrir a análise crítica' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Data, participantes e entradas tratadas preenchidos' },
      { tipo: 'evidencia_anexada', rotulo: 'Convocação, presença e ata anexadas' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma análise crítica registrada', entidade: 'analises_criticas', minimo: 1 },
    ],
  },
  {
    id: 'p33_3', fase: 33, ordem: 3,
    titulo: 'Emitir a ata da análise crítica',
    clausula: 'Cl 9.3.3',
    porQue: 'Os resultados da análise incluem decisões sobre oportunidades de melhoria e sobre qualquer necessidade de mudar o sistema (Cl 9.3.3), e a organização guarda a informação documentada como evidência. A ata é o registro que o auditor sempre pede, com decisão, responsável e prazo.',
    campos: [
      { id: 'date', rotulo: 'Em que data foi a reunião?', tipo: 'data', obrigatorio: true, exemplo: '' },
      { id: 'participants', rotulo: 'Quem participou?', tipo: 'texto_longo', obrigatorio: true, semIA: true, exemplo: 'Nome e cargo de cada participante.' },
      { id: 'decisions', rotulo: 'Quais decisões foram tomadas?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Aprovado orçamento para a ferramenta de gestão de vulnerabilidades; escopo mantido; objetivos do próximo ano aprovados.' },
      { id: 'actions', rotulo: 'Quais ações foram definidas, com responsável e prazo?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'Contratar a ferramenta (diretor de TI, até 30/06); revisar a política de acesso (gerente de segurança, até 31/05).' },
      { id: 'registered_in_ata', rotulo: 'As decisões e ações são registradas em ata?', tipo: 'escolha', obrigatorio: false, exemplo: '', opcoes: ['Sim', 'Parcial', 'Não'], pergunta: 'p33_q2' },
    ],
    prova: { descricao: 'Ata aprovada, com as decisões e as ações com responsável e prazo.', obrigatoria: true, aceita: 'ambos' },
    ondeVive: [{ tela: 'management-review', rotulo: 'Abrir a análise crítica' }],
    concluidoQuando: [
      { tipo: 'campos_preenchidos', rotulo: 'Data, participantes, decisões e ações escritas' },
      { tipo: 'evidencia_anexada', rotulo: 'Ata aprovada anexada' },
      { tipo: 'registro_vinculado', rotulo: 'Ao menos uma análise crítica registrada', entidade: 'analises_criticas', minimo: 1 },
    ],
    gera: 'documento',
  },
];
