# Roteiro de aceite do n.360 em produção

Etapa 5 do plano `docs/superpowers/plans/2026-10-18-versao-final.md`. Cerca de 30 minutos, logado em
`https://n360.ness.com.br`, num **projeto de teste vazio** com os dois módulos habilitados. Não use projeto de cliente.

Anote cada passo como OK ou FALHA. Para cada FALHA, registre a tela, o que você fez, o que esperava e o que aconteceu. Cada falha
vira um PR próprio.

Antes de começar, confira a versão em produção:

```
curl -s https://n360.ness.com.br/health
```

O `version` deve ser o SHA do último merge na `main`.

## 1. Entrada (n.360)

| # | Faça | Esperado |
|---|---|---|
| 1.1 | Entre em `/` | Início com uma linha por módulo. Cada linha traz o nome e uma frase do que o módulo cobre. |
| 1.2 | Clique em "Abrir o n.iso" | Vai para `/iso`, com a casca do n.iso. O cabeçalho mostra o seletor "n.iso / n.privacy", com o n.iso marcado. |
| 1.3 | No seletor, clique em "n.privacy" | Vai para `/privacy`, com o n.privacy marcado. |
| 1.4 | No rodapé do menu, clique em "n.360" | Volta ao início. |

## 2. n.privacy: menu

| # | Faça | Esperado |
|---|---|---|
| 2.1 | Olhe o menu | Painel; Mapear (Tratamentos, Importar programa); Cadastros (Pessoas; Áreas; Sistemas; Fornecedores; Titulares e dados pessoais); Avaliar; Responder; Provar. |

## 3. n.privacy: cadastros

| # | Faça | Esperado |
|---|---|---|
| 3.1 | Titulares e dados pessoais, aba Titulares: crie "Colaborador" | O item aparece na lista. |
| 3.2 | Crie "colaborador" de novo | O sistema recusa e mostra que já existe "Colaborador". |
| 3.3 | Aba Dados pessoais: crie "Saúde" | Nasce marcado como Sensível. |
| 3.4 | Inative "Saúde", depois marque "Mostrar inativos" | Some da lista; volta com o filtro. Reative. |
| 3.5 | Crie a pessoa "Responsável Exemplo" em Pessoas, a área "RH" em Áreas, o sistema "ERP Exemplo" em Sistemas e a organização "Fornecedor Exemplo" em Fornecedores | Cada um aparece na sua lista. |
| 3.6 | Fornecedores: "Adicionar parte existente" com "Fornecedor Exemplo" | O fornecedor entra na lista com a criticidade "Não avaliada". |
| 3.7 | Abra o fornecedor, aba Criticidade: responda as 5 perguntas, com uma em "Alto", e confirme | O nível é Alto e o tipo vira Crítico. A lista mostra Alto. |
| 3.8 | Aba Avaliações: registre uma avaliação aprovada, com validade daqui a 1 ano e uma observação | A situação fica Vigente, e a observação aparece no histórico. |
| 3.9 | Aba Segurança: marque MFA e salve. Abra o n.iso, em Fornecedores | O mesmo fornecedor aparece com MFA marcado. |

## 4. n.privacy: RoPA

| # | Faça | Esperado |
|---|---|---|
| 4.1 | Tratamentos: "Nova atividade" com a finalidade "Folha de pagamento" | Abre o modo guiado. A primeira pergunta é o responsável. |
| 4.2 | Clique em "Não sei agora" | Vem a pergunta seguinte, sobre as áreas. |
| 4.3 | Responda as áreas (RH) e clique em "Continuar" | Avança para os titulares da Coleta. |
| 4.4 | Responda todas as perguntas até o fim | O guiado lista "Falta 1 resposta que você deixou para depois", com "Responder agora". |
| 4.5 | Clique em "Responder agora" e preencha o responsável | O guiado termina com "Tudo respondido" e sugere gaps e riscos. |
| 4.6 | Na etapa Compartilhamento Externo, escolha "Fornecedor Exemplo" como parceiro | Em Fornecedores, a coluna Atividades do fornecedor mostra 1, e a ficha lista a atividade com a origem "Compartilhamento externo". |
| 4.7 | Saia do guiado e percorra as 9 abas | Cada aba mostra o que foi respondido. Nenhuma tela dá erro. |
| 4.8 | Em Ações, clique em "Conferir/Aprovar" | Mostra o que falta ou abre o pedido de aprovação. |

## 5. n.privacy: avaliar, responder e provar

| # | Faça | Esperado |
|---|---|---|
| 5.1 | Cobertura da LGPD | Abre sem erro e explica a regra: só o implementado cobre. |
| 5.2 | Pedidos do titular: registre um pedido | Recebe um protocolo PT-AAAA-NNNN. O prazo aparece, ou aparece "não calculado" se o parâmetro legal não estiver cadastrado. |
| 5.3 | Incidentes: registre um incidente | Recebe um protocolo IN-AAAA-NNNN. |
| 5.4 | Consentimentos: registre um consentimento ligado a "Folha de pagamento" | Aparece na lista. |
| 5.5 | Painel | A frase de saúde e "O que fazer agora" refletem o que você cadastrou. |

## 6. n.iso

| # | Faça | Esperado |
|---|---|---|
| 6.1 | Painel do n.iso | Abre sem erro. |
| 6.2 | Controles: abra um controle e mude o status para Implementado | Grava. A cobertura muda. |
| 6.3 | SoA | Lista os controles com aplicabilidade. |
| 6.4 | Riscos: crie um risco | Aparece no mapa de risco. |
| 6.5 | Bancada (trilha) | Mostra os passos, e o passo atual tem uma ação. |
| 6.6 | Peça uma aprovação de um documento e aprove em Minhas aprovações | A aprovação fica registrada, com o hash. |

## Resultado

O aceite passa quando todos os passos estão OK. Guarde o roteiro marcado fora do repositório se ele tiver nome de pessoa real.
