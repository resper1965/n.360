# Aprovação em lote: requisitos para valer diante do auditor

Data: 14/10/2026. Origem: retorno de uma implantação real sobre o que a aprovação em lote precisa provar. Aqui o texto está
generalizado: sem nome de cliente, sem código ou quantidade de documentos de um pacote específico. Complementa
`2026-10-14-aprovacao-em-lote-design.md` (a primeira fatia, já desenhada) e descreve as fatias seguintes.

## Requisitos

1. **Um registro por documento, mesmo em lote.** Cada aprovação grava: documento, versão e hash do texto aprovado.
2. **Quem aprovou e como.** Usuário logado, cargo (papel de aprovação), data e hora. **Ninguém aprova em nome de outra
   pessoa**, nem a consultoria: a autoridade vem da designação da pessoa no projeto, nunca de quem opera a tela.
3. **Mais papéis do que CISO e CEO.** Um pacote real distribui a aprovação entre vários cargos de direção (por exemplo CEO,
   CIO, CTO e COO), cada um com um conjunto diferente de documentos.
4. **Todos os aprovadores exigidos antes da vigência.** Documento com mais de um aprovador só fica vigente quando todos
   aprovaram a mesma versão.
5. **Trilha que não se apaga, inclusive da revogação, e histórico visível na página do documento.**
6. **Publicação automática.** Completadas as aprovações exigidas, a versão aprovada vira a vigente e a anterior passa a
   substituída, sem um segundo ato humano.

## Situação hoje (conferir antes de implementar; fontes: `AGENTS.md` e o código)

| Requisito | Hoje | Lacuna |
|---|---|---|
| 1. Registro por documento | Cada decisão é uma linha de `pedido_destinatarios` com o hash do pedido; o lote da primeira fatia grava uma por item. | Atende. O histórico por documento e versão ainda não aparece numa tela só. |
| 2. Quem e com qual papel | `autoridadeNoPedido` e a matriz de governança decidem o papel; nome, IP, user-agent e MFA ficam na linha da decisão. | Atende para `ciso` e `ceo`. O cargo gravado é o papel exigido, não o cargo designado da pessoa. |
| 3. Mais papéis | `pedidos.papel_exigido` aceita só `ciso`, `ceo` e `ciente` (CHECK no banco); a aprovação do documento é derivada desses dois. | **Falta.** Exige migration (a 0055 já reconstruiu `pedidos` uma vez) e a matriz de governança conhecer os cargos novos. |
| 4. Vários aprovadores | Um pedido tem um papel; documento com dois papéis precisa de dois pedidos, e nada diz que "só vira vigente com todos". | **Falta.** É preciso declarar, por documento, quais papéis aprovam (ou herdar do tipo) e conferir que todos aprovaram o mesmo hash. |
| 5. Trilha e histórico | A prova é imutável por trigger e há `audit_logs`; a revogação de aprovação existe para controle, não para documento. Tela do documento lista ciências e aprovação por versão. | **Parcial.** Falta revogar aprovação de documento (com trilha) e a linha do tempo na página. |
| 6. Publicação automática | Hoje se publica a versão **antes** de pedir aprovação (o pedido congela a vigente) e publicar é ato humano. | **Falta, e inverte o modelo:** aprovar rascunho e publicar sozinho. É decisão de produto, não só de código. |

## Fatias propostas (cada uma com spec e plano próprios)

- **A. Papéis de aprovação.** Tabela de papéis (em vez do CHECK com três valores), com os cargos de direção; a matriz de
  governança passa a mapear cargo designado para papel; `autoridadeNoPedido` e `assinarEvidencia` leem dela.
- **B. Aprovadores por documento e vigência.** O documento declara os papéis que o aprovam; "aprovado" só quando todos
  aprovaram o hash da versão; a tela mostra quem falta.
- **C. Aprovar o rascunho e publicar sozinho.** Pedido sobre a versão em rascunho; ao completar as aprovações, publica
  (reaproveita `publicarVersao` e a conferência de pedidos) e marca a anterior como substituída. O texto aprovado é o hash
  gravado: se o rascunho mudar, a aprovação cai.
- **D. Revogação e histórico.** Revogar aprovação de documento (motivo obrigatório, trilha própria, a prova original
  permanece) e a linha do tempo por versão na página do documento.
- **E. Pedido em lote.** Quem pede cria o pedido de vários documentos de uma vez para os aprovadores de cada um.

A primeira fatia (aprovação em lote de pedidos existentes) não depende de nenhuma dessas; elas a ampliam.

## Decisões em aberto (do dono do produto)

1. **C inverte o fluxo atual** (publicar primeiro, aprovar depois). Mantém-se os dois caminhos (por tipo de documento) ou
   troca-se?
2. Quais cargos entram de saída em A, e se o cliente pode cadastrar o seu.
3. Revogar aprovação de um aprovador derruba a vigência da versão ou só marca o documento como "aprovação incompleta"?

## Fora de escopo

Assinatura eletrônica com certificado digital (ICP-Brasil) e geração dos termos em Word: são outro assunto. A prova aqui é
a decisão autenticada por senha (e MFA, quando ativo), com hash, IP e user-agent, como já é em toda aprovação do produto.
