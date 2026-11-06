# Roteiro de aceite do n.360 em produção

Cerca de 90 minutos, logado em `https://n360.ness.com.br`, num **projeto de teste vazio** com os módulos n.iso e n.privacy
habilitados (e o n.ot, para a seção 11). Não use projeto de cliente. Atualizado em 06/11/2026: entram as fichas de RIPD e LIA, a mescla,
o CNPJ, os órgãos públicos, o portal do titular, o incidente completo e o n.ot.

Anote cada passo como OK ou FALHA. Para cada FALHA, registre a tela, o que você fez, o que esperava e o que aconteceu. Cada falha
vira um PR próprio.

Antes de começar:

- Confira a versão em produção. O `version` deve ser o SHA do último merge na `main` (`git log -1 origin/main`).

  ```
  curl -s https://n360.ness.com.br/health
  ```

- Ligue o segundo fator na sua conta (cartão de perfil, no rodapé da barra lateral). Sem ele, o passo 11.6 (exportar do n.ot) não funciona.
- Para a seção 11, uma segunda conta da equipe no mesmo projeto: o lote do n.ot não é aprovado por quem o criou.

## 1. Entrada (n.360)

| # | Faça | Esperado |
|---|---|---|
| 1.1 | Entre em `/` | Início com uma linha por módulo, cada uma com o nome e uma frase do que o módulo cobre. |
| 1.2 | Clique em "Abrir o n.iso" | Vai para `/iso`. No Painel, o cabeçalho mostra o seletor "n.iso / n.privacy" com o n.iso marcado. |
| 1.3 | No seletor, clique em "n.privacy" | Vai para `/privacy`, com o n.privacy marcado. |
| 1.4 | Abra qualquer outra tela do n.privacy | O seletor não aparece fora do Painel. A troca de módulo é pelo link do rodapé do menu. |
| 1.5 | No rodapé do menu, clique em "n.360" | Volta ao início. |

## 2. n.privacy: menu

| # | Faça | Esperado |
|---|---|---|
| 2.1 | Olhe o menu | Dashboard e Empresas; Cadastros (Áreas, Ativos, Titulares, Dados de titular, Parceiros, Pessoas); Mapeamento (Atividades, DPIA, LIA); Diagnóstico (Gaps, Riscos); Fornecedores (Fornecedores, Avaliações); Documentos e Solicitações; Mais (Referência jurídica, Incidentes, Consentimentos, Cobertura da LGPD, Políticas, Evidências, Treinamento, Papéis e comitê, Importar programa); Assistente. |

## 3. n.privacy: cadastros

| # | Faça | Esperado |
|---|---|---|
| 3.1 | Titulares: crie "Colaborador" com uma descrição | O item aparece na lista, com a descrição. |
| 3.2 | Crie "colaborador" de novo | O sistema recusa e mostra que já existe "Colaborador". |
| 3.3 | Dados de titular: crie "Saúde" e marque "É um Dado Sensível?" | Aparece com o selo Sensível; o filtro "Sensíveis" a mostra. |
| 3.4 | Exclua "Saúde" e marque "Mostrar inativos" | Some da lista; volta com o filtro, com o selo Inativo e o botão Reativar. Reative. |
| 3.5 | Áreas: crie "RH" com uma descrição | Aparece com a descrição. Edite e inative. |
| 3.6 | Ativos: crie "ERP Exemplo" com uma descrição | Aparece na lista com Ativo, Descrição e Empresa. |
| 3.7 | Pessoas: crie "Responsável Exemplo", com um e-mail seu | Só pessoas aparecem aqui; organizações ficam em Parceiros e Fornecedores. |
| 3.8 | Parceiros: crie "Fornecedor Exemplo" | A organização aparece na lista. |
| 3.9 | Empresas: abra "Dados da empresa" e preencha à mão | Salva sem depender da consulta de CNPJ. Se a consulta falhar, a mensagem pede o preenchimento à mão e nada bloqueia. |
| 3.10 | Ainda em Empresas, digite um CNPJ com o último dígito trocado | O sistema recusa o CNPJ inválido. Com um CNPJ válido, a consulta (administrador da plataforma ou da consultoria) preenche razão social e endereço. |
| 3.11 | Pessoas → Mais → Padronizar nomes | Lista cada nome antes e depois. Se houver duplicata (o mesmo nome escrito de dois jeitos), "Mesclar" mostra a prévia e só une depois de confirmar; o duplicado fica inativo. |

## 4. n.privacy: fornecedores (TPRM)

| # | Faça | Esperado |
|---|---|---|
| 4.1 | Fornecedores: "Adicionar parte existente" com "Fornecedor Exemplo" | Entra na lista com "Falta: Tipo, Criticidade, Avaliação, DPA". |
| 4.2 | Abra o fornecedor, aba Criticidade: responda as 5 perguntas, uma delas em "Alto", e confirme | O nível é Alto e o tipo vira Crítico. A lista mostra Alto, e as pendências "Tipo" e "Criticidade" somem. |
| 4.3 | Aba Avaliações: registre uma avaliação aprovada, com validade daqui a 1 ano e uma observação | A situação fica Vigente. A observação aparece no histórico. |
| 4.4 | Aba Documentos: ligue como DPA um documento de Documentos (seção 6.3), publicado e com arquivo | A pendência "DPA" some e a linha do topo diz "Completo". Um documento sem arquivo não conta como DPA. |
| 4.5 | Aba Segurança: marque MFA e salve. Abra o n.iso, em Fornecedores | O mesmo fornecedor aparece com MFA marcado. |
| 4.6 | Avaliações (menu): abra a fila | O fornecedor aparece em "Em dia". Um fornecedor sem avaliação aparece em "Sem avaliação"; críticos primeiro. |

## 5. n.privacy: atividades (RoPA)

| # | Faça | Esperado |
|---|---|---|
| 5.1 | Atividades: "Nova atividade" com a finalidade "Folha de pagamento", modo guiado | A primeira pergunta é o responsável. |
| 5.2 | Clique em "Não sei agora" | Vem a pergunta seguinte, sobre as áreas. |
| 5.3 | Responda as áreas (RH) e clique em "Continuar" | Avança para os titulares da Coleta. |
| 5.4 | Responda tudo até o fim | O guiado lista "Falta 1 resposta que você deixou para depois", com "Responder agora". |
| 5.5 | Clique em "Responder agora" e preencha o responsável | Termina com "Tudo respondido" e sugere gaps e riscos. |
| 5.6 | Na etapa Compartilhamento Externo, escolha "Fornecedor Exemplo" | Em Fornecedores, a coluna Atividades mostra 1, e a ficha lista a atividade com a origem "Compartilhamento externo". |
| 5.7 | Na etapa Eliminação, escolha um ativo diferente do Armazenamento | A Eliminação guarda os próprios ativos; o Armazenamento não muda. |
| 5.8 | Aba Agentes de Tratamento: "Adicionar órgão" (nome e obrigação legal) | O órgão entra na lista e nos destinatários da atividade. Remover pede confirmação. |
| 5.9 | Aba Base Jurídica: escolha uma base | A finalidade da atividade já vem preenchida na base escolhida. |
| 5.10 | Aba Teste de Impacto: responda as perguntas em sequência | Cada resposta grava sem travar a próxima. |
| 5.11 | Saia do guiado e percorra as 9 abas | Cada aba mostra o que foi respondido. Nenhuma tela dá erro. |
| 5.12 | Em Ações, clique em "Conferir/Aprovar" | Mostra o que falta ou abre o pedido de aprovação. |

## 6. n.privacy: diagnóstico, documentos e jurídico

| # | Faça | Esperado |
|---|---|---|
| 6.1 | Gaps: abra um gap e confira as abas Gap, Plano de Ação e Anexo | Edita e salva. A área e o "Em atraso" aparecem na lista. |
| 6.2 | Riscos: use os filtros Motivo, Área, Risco e Status; abra "Tratar Risco" | Três abas: Risco (leitura), Tratamento (campos obrigatórios, grava) e Risco residual com "Recalcular". |
| 6.3 | Documentos: crie um documento com tipo, status, vencimento e um PDF | Aparece com vencimento e arquivo; ver e baixar funcionam. Marque "Sem vencimento": a data some. |
| 6.4 | Mais → Referência jurídica | LGPD (art. 7 e art. 11 como "Bases legais"), ANPD e GDPR com as seis bases; a busca por "consentimento" acha. |
| 6.5 | Só como administrador da plataforma: "Validar mapeamentos propostos" | Mostra a contagem, pede confirmação e depois mostra "Validado por <seu e-mail> em <data>". Faça só se você é quem valida. |
| 6.6 | Consentimentos: registre um | O consentimento fica ligado à atividade. |
| 6.7 | Cobertura da LGPD e Dashboard | Abrem sem erro; a cobertura explica a regra (só o implementado cobre). |

## 7. n.privacy: RIPD e LIA

| # | Faça | Esperado |
|---|---|---|
| 7.1 | DPIA: "Novo RIPD" e escolha "Folha de pagamento" | Abre a página do RIPD com as abas Dados, Teste de Impacto, Conformidade, Armazenamento e Logs, já com o que a atividade informa. |
| 7.2 | Responda uma pergunta de Conformidade e troque de aba | A resposta fica gravada. A pergunta das bases legais mostra as bases da atividade, só para leitura. |
| 7.3 | Aba Logs | Mostra os eventos do RIPD, sem o texto das respostas. |
| 7.4 | "Baixar Word" | Baixa o RIPD com "RASCUNHO" no cabeçalho enquanto não for aprovado. |
| 7.5 | Numa atividade com base "legítimo interesse", abra a LIA (menu LIA) | Abas Finalidade, Necessidade, Proporcionalidade, Conclusão e Logs, com as 23 perguntas do legado. |
| 7.6 | Responda uma pergunta e "Imprimir LIA" | Grava a resposta; o Word traz as perguntas com a resposta. |

## 8. n.privacy: Solicitações e portal do titular

| # | Faça | Esperado |
|---|---|---|
| 8.1 | Solicitações: registre um pedido | Recebe um protocolo PT-AAAA-NNNN, com Canal. O prazo aparece, ou "não calculado" se o parâmetro legal não estiver cadastrado. |
| 8.2 | Abra o pedido e registre uma tratativa ("Nova tratativa") | A tratativa entra no histórico do atendimento. |
| 8.3 | No pedido, "Identidade do titular": escolha "Presencial", uma observação, e "Registrar conferência" | Mostra o método e "Conferida por <você> em <data>". Uma observação com número de documento é recusada. |
| 8.4 | Noutro pedido, sem conferência, mude o status para Respondido e salve | Pergunta "Identidade não conferida. Responder mesmo assim?". Na lista, os pedidos abertos sem conferência têm o selo. |
| 8.5 | "Encaminhar" a "Responsável Exemplo" (com e-mail) com prazo e mensagem | O encaminhamento aparece com o prazo e "Aguardando"; vira uma tratativa. O e-mail ao ponto focal não traz nome, contato nem descrição do titular. |
| 8.6 | "Registrar retorno" com um texto; noutro encaminhamento, "Cancelar" | O retorno fica registrado; o cancelado pede confirmação e sai de "Aguardando". |
| 8.7 | "Link do portal" → "Gerar link" | Mostra o link do portal de solicitações. |
| 8.8 | Abra o link numa janela anônima e envie uma solicitação | A página devolve o protocolo. O pedido aparece em Solicitações com o canal Formulário. |
| 8.8a | Na confirmação, anote o protocolo e o código; abra "Acompanhar uma solicitação" e consulte. Abra também o link do e-mail do protocolo | A página mostra a situação (Recebida), o tipo, a data de abertura e o prazo, sem nome nem descrição. O link do e-mail já abre a consulta. Um código errado diz "Protocolo ou código não conferem". |
| 8.9 | "Gerar novo link" e tente o link antigo | O sistema avisa antes de trocar; o link antigo para de funcionar. Desative o portal no fim. |
| 8.10 | Filtre a lista por Tipo e "Exportar CSV" | A planilha abre no Excel em português, só com os pedidos do filtro: protocolo, tipo, canal, datas na hora de Brasília, prazo e status. Não leva nome, contato nem descrição do titular. |

## 9. Incidente (n.privacy, Mais → Incidentes)

| # | Faça | Esperado |
|---|---|---|
| 9.1 | "+ Registrar incidente" | Recebe um protocolo IN-AAAA-NNNN e o prazo da ANPD (ou "não calculado"). |
| 9.2 | Abra o incidente | Página com as abas Registro, Análise, Ações corretivas, Comunicação, Post mortem e Histórico, e os botões "Voltar aos incidentes" e "Baixar em Word". |
| 9.3 | Registro → "Editar registro": severidade, tipo, áreas, comprometimento e titulares × dados | Grava tudo de uma vez; o registro mostra os nomes. |
| 9.4 | Registro → "Anexar evidência" com um PDF | O anexo aparece e baixa. |
| 9.5 | Análise → "Registrar análise" | A análise aparece com o seu nome e a data; só você pode alterá-la. |
| 9.6 | Ações corretivas → "Nova ação" com tratamento Contenção | A ação aparece com o protocolo `IN-…-PA01`. |
| 9.7 | Comunicação: canal SEI, um nº de protocolo, "Registrei a comunicação à ANPD" | Pede confirmação. Depois mostra `IN-…-COM01`, a data, o canal e o protocolo. A comunicação não se desfaz. |
| 9.8 | Post mortem, antes de encerrar | A aba diz que o post mortem abre depois do encerramento. |
| 9.9 | Registro: avalie o risco ao titular como Baixo ("Salvar avaliação") e "Encerrar incidente" | Encerra (só a equipe da consultoria encerra). O registro deixa de ser editável. |
| 9.10 | Post mortem: responda 2 das 14 perguntas e "Salvar post mortem" | Grava sem reabrir o incidente. |
| 9.11 | Histórico | Mostra Registrado, Registro alterado, Evidência, Análise, Ação corretiva, Comunicação registrada, Risco ao titular avaliado, Encerrado e "Post mortem: 2 de 14 respondidas", sem texto livre. "Exportar CSV" baixa a planilha, com a hora de Brasília. |
| 9.12 | "Baixar em Word" | O Word traz todas as seções, sem "RASCUNHO" (o incidente está encerrado). |

## 10. n.iso

| # | Faça | Esperado |
|---|---|---|
| 10.1 | Painel do n.iso | Abre sem erro. |
| 10.2 | Controles: abra um controle e mude o status para Implementado | Grava. A cobertura muda. |
| 10.3 | SoA | Lista os controles com aplicabilidade. |
| 10.4 | Riscos: crie um risco | Aparece no mapa de risco. |
| 10.5 | Bancada (trilha) | Mostra os passos, e o passo atual tem uma ação. |
| 10.6 | Documentos → "Nova política": escolha um tema | Cria a política em rascunho com as seções do tema; gerar uma seção grava o texto no rascunho, nunca publica. O indicador de cobertura mostra os controles sem política. |
| 10.7 | Peça uma aprovação de um documento e aprove em Minhas aprovações | A aprovação fica registrada, com o hash. |

## 11. n.ot

Antes: em Projetos, habilite o n.ot no projeto de teste e, em Usuários, marque o n.ot nas duas contas (a caixa nunca vem marcada).

| # | Faça | Esperado |
|---|---|---|
| 11.1 | No início do n.360, abra o n.ot | Abas Catálogo RO-CB.BR.01, Inventário, Fluxos, Coleta, Levantamento, Saídas e Acessos e agente. Uma conta sem o n.ot não vê o item. |
| 11.2 | Inventário: "Novo site", "Nova zona" e "Novo ativo" | Cada um aparece na lista. |
| 11.3 | Coleta: "Entrada manual", "Adicionar ao lote" e "Enviar lote" | O lote fica para revisão. Quem o criou não consegue aprová-lo. |
| 11.4 | Com a segunda conta: "Revisar" e "Aprovar lote" | O ativo entra no inventário. |
| 11.5 | Levantamento: "+ Novo levantamento" (entrevista), responda uma pergunta do roteiro e "Enviar ao lote" | O achado vira item de lote; nada entra no inventário sem aprovação. |
| 11.6 | Saídas: "Exportar CSV" com uma justificativa | Pede o código do autenticador; com ele, baixa a planilha. |
| 11.7 | Acessos e agente: "Nova sonda" | A credencial aparece uma vez só; a sonda fica na lista com a saúde da coleta. Revogue-a no fim. |

## Resultado

O aceite passa quando todos os passos estão OK. Guarde o roteiro marcado fora do repositório se ele tiver nome de pessoa real.
