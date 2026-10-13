---
name: atendimento-titular
description: Use ao atender pedido de titular de dados (DSAR) no n.privacy: registrar com protocolo, conferir o prazo como parâmetro em parametros_legais, verificar a identidade, localizar os dados, rascunhar a resposta e deixar o registro da resposta e o encerramento com uma pessoa
---

# Atendimento ao titular (DSAR) no n.privacy

## Papel

- Você ajuda o consultor e o encarregado a atender o pedido: registra, organiza a verificação, localiza onde estão os dados e
  **rascunha** a resposta no chat. Enviar a resposta ao titular, registrá-la e encerrar o pedido são de uma pessoa, pela interface.
- Cada gravação vem depois do "sim" do usuário. **PEÇA APROVAÇÃO HUMANA.**
- Não é parecer jurídico. Negar um pedido, ou atender só em parte, é decisão do encarregado com o jurídico.
- Use o mínimo de dado pessoal: o necessário para atender, nada a mais no chat nem nos campos livres.

## Prazo: é PARÂMETRO, não número

- O prazo de resposta vem do parâmetro `titular.resposta` em `parametros_legais` (`GET /api/v1/parametros-legais`), com fonte e
  data de revisão cadastradas pelo administrador da plataforma. O sistema congela o prazo no pedido quando ele é registrado.
- Sem o parâmetro cadastrado, o pedido nasce com prazo "não calculado" (`situacao_prazo: sem_prazo`). Diga isso ao encarregado e
  peça o cadastro. **Não use um número de dias de memória** e não escreva prazo no texto da resposta sem conferir o parâmetro.
- Você não edita prazo nem o parâmetro (o servidor recusa).

## Fluxo

| Passo | Lê | Faz (depois do "sim") | Para |
|---|---|---|---|
| 1. Registrar | `niso_privacy_titular_pedidos` (já existe?) | `niso_privacy_registrar_pedido_titular`: `tipo`, `canal`, `recebido_em` (a data em que chegou, não a de hoje), `descricao` | Devolva o protocolo e o prazo ao usuário |
| 2. Verificar identidade | O que o titular enviou | Rascunhe o pedido de confirmação de identidade (`references/verificacao-identidade.md`) | O consultor envia; você não contata o titular |
| 3. Localizar os dados | `niso_privacy_ropa` (tratamentos em que esse tipo de titular aparece; sistemas ligados); `GET /api/v1/projects/{p}/data-subject?identificador=...` (só o que o próprio n.360 guarda do titular, não os sistemas do cliente) | Lista de onde procurar, por tratamento e sistema, para o cliente buscar | O cliente faz a busca nos sistemas dele |
| 4. Rascunhar a resposta | Pedido, achados da busca, tratamentos | Texto da resposta no chat, por tipo de pedido | Revisão do encarregado |
| 5. Registrar e encerrar | `niso_privacy_titular_pedidos` | Nada: a pessoa registra a resposta e o status (respondido, negado) pela interface | |

Eliminação dos registros do titular no próprio n.360 (`data-subject/erase`) é destrutiva: exige `confirmado_pelo_usuario: true`
depois de mostrar o que será apagado, e só quando o encarregado decidiu.

## Rascunho por tipo de pedido

| `tipo` | O que a resposta precisa trazer |
|---|---|
| `confirmacao` | Se há ou não tratamento de dados do titular |
| `acesso` | Os dados tratados, a finalidade, a forma e a duração, com quem são compartilhados |
| `correcao` | O que foi corrigido e onde |
| `anonimizacao_bloqueio_eliminacao` | O que foi feito e o que fica guardado por obrigação, com o motivo |
| `portabilidade` | Os dados em formato estruturado, ou o motivo de não ser possível |
| `informacao_compartilhamento` | Com quem os dados são compartilhados (tratamentos, bloco F) |
| `revogacao_consentimento` | A revogação registrada e o que muda; revogar o consentimento no sistema é ato de pessoa, pela interface |
| `oposicao` | A análise do pedido e a decisão |
| `outro` | Encaminhamento ao encarregado |

Tudo no rascunho sai do que foi encontrado; o que não foi encontrado é dito como tal. A resposta final é do encarregado.

## Critério de pronto

- Pedido registrado com protocolo e prazo (ou com a pendência do parâmetro anotada).
- Identidade verificada antes de qualquer envio de dado.
- Rascunho revisado pelo encarregado; resposta registrada por uma pessoa dentro do prazo.
- Nenhum pedido `atrasado` em `niso_privacy_titular_pedidos` sem justificativa anotada.
