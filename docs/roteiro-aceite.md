# Roteiro de aceite do n.360 em produção

Etapa 5 do plano `docs/superpowers/plans/2026-10-18-versao-final.md`. Cerca de 40 minutos, logado em `https://n360.ness.com.br`,
num **projeto de teste vazio** com os dois módulos habilitados. Não use projeto de cliente. Atualizado em 20/10/2026 para o menu do
legado.

Anote cada passo como OK ou FALHA. Para cada FALHA, registre a tela, o que você fez, o que esperava e o que aconteceu. Cada falha
vira um PR próprio.

Antes de começar, confira a versão em produção:

```
curl -s https://n360.ness.com.br/health
```

O `version` deve ser o SHA do último merge na `main` (`git log -1 origin/main`).

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
| 3.7 | Pessoas: crie "Responsável Exemplo" | Só pessoas aparecem aqui; organizações ficam em Parceiros e Fornecedores. |
| 3.8 | Parceiros: crie "Fornecedor Exemplo" | A organização aparece na lista. |
| 3.9 | Empresas: abra "Dados da empresa" e preencha à mão | Salva sem depender da consulta de CNPJ. Se a consulta falhar, a mensagem pede o preenchimento à mão e nada bloqueia. |

## 4. n.privacy: fornecedores (TPRM)

| # | Faça | Esperado |
|---|---|---|
| 4.1 | Fornecedores: "Adicionar parte existente" com "Fornecedor Exemplo" | Entra na lista com "Falta: Tipo, Criticidade, Avaliação, DPA". |
| 4.2 | Abra o fornecedor, aba Criticidade: responda as 5 perguntas, uma delas em "Alto", e confirme | O nível é Alto e o tipo vira Crítico. A lista mostra Alto, e as pendências "Tipo" e "Criticidade" somem. |
| 4.3 | Aba Avaliações: registre uma avaliação aprovada, com validade daqui a 1 ano e uma observação | A situação fica Vigente. A observação aparece no histórico. |
| 4.4 | Aba Documentos: ligue um documento como DPA | A pendência "DPA" some e a linha do topo diz "Completo". |
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
| 5.7 | Saia do guiado e percorra as 9 abas | Cada aba mostra o que foi respondido. Nenhuma tela dá erro. |
| 5.8 | Em Ações, clique em "Conferir/Aprovar" | Mostra o que falta ou abre o pedido de aprovação. |

## 6. n.privacy: diagnóstico, documentos e jurídico

| # | Faça | Esperado |
|---|---|---|
| 6.1 | Gaps: abra um gap e confira as abas Gap, Plano de Ação e Anexo | Edita e salva. A área e o "Em atraso" aparecem na lista. |
| 6.2 | Riscos: use os filtros Motivo, Área, Risco e Status; abra "Tratar Risco" | Três abas: Risco (leitura), Tratamento (campos obrigatórios) e Risco residual com "Recalcular". |
| 6.3 | Documentos: crie um documento com tipo, status, vencimento e um PDF | Aparece com vencimento e arquivo; ver e baixar funcionam. Marque "Sem vencimento": a data some. |
| 6.4 | Solicitações: registre um pedido | Recebe um protocolo PT-AAAA-NNNN, com Canal. O prazo aparece, ou "não calculado" se o parâmetro legal não estiver cadastrado. |
| 6.5 | Mais → Referência jurídica | LGPD (art. 7 e art. 11 como "Bases legais"), ANPD e GDPR com as seis bases; a busca por "consentimento" acha. |
| 6.6 | Só como administrador da plataforma: "Validar mapeamentos propostos" | Mostra a contagem, pede confirmação e depois mostra "Validado por <seu e-mail> em <data>". Faça só se você é quem valida. |
| 6.7 | Incidentes e Consentimentos: registre um de cada | Protocolo IN-AAAA-NNNN; o consentimento fica ligado à atividade. |
| 6.8 | Cobertura da LGPD e Dashboard | Abrem sem erro; a cobertura explica a regra (só o implementado cobre). |

## 7. n.iso

| # | Faça | Esperado |
|---|---|---|
| 7.1 | Painel do n.iso | Abre sem erro. |
| 7.2 | Controles: abra um controle e mude o status para Implementado | Grava. A cobertura muda. |
| 7.3 | SoA | Lista os controles com aplicabilidade. |
| 7.4 | Riscos: crie um risco | Aparece no mapa de risco. |
| 7.5 | Bancada (trilha) | Mostra os passos, e o passo atual tem uma ação. |
| 7.6 | Peça uma aprovação de um documento e aprove em Minhas aprovações | A aprovação fica registrada, com o hash. |

## Resultado

O aceite passa quando todos os passos estão OK. Guarde o roteiro marcado fora do repositório se ele tiver nome de pessoa real.
