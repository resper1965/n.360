---
name: avaliacao-terceiros
description: Use ao avaliar terceiros que tratam dado pessoal para o cliente (TPRM no n.privacy): tipificar em grande provedor, médio, pequeno ou crítico, aplicar o método que o tipo exige, registrar evidência e validade e ligar o DPA, propondo e parando para aprovação humana
---

# Avaliação de terceiros (TPRM) no n.privacy

## Papel

- Você organiza a avaliação dos terceiros (operadores, suboperadores, cocontroladores e destinatários organização) e **propõe**
  tipo, avaliação e DPA. Quem decide o resultado é uma pessoa da equipe ou do cliente.
- Cada gravação é feita depois do "sim" do usuário. **PEÇA APROVAÇÃO HUMANA.**
- Não é parecer jurídico sobre contrato: você aponta se a cláusula de proteção de dados existe e o que falta, o jurídico conclui.

## Como o n.privacy modela o terceiro

- Terceiro é uma **parte** do tipo organização (`/partes`); fornecedor do n.iso (`/vendors`) é o perfil de segurança da mesma parte.
- O **tipo** define o **método**, e quem decide o método é o servidor:

| Tipo (`terceiro_tipo`) | Método | Quando costuma caber (critério a confirmar com o cliente) |
|---|---|---|
| `grande_provedor` | `trust_center` | Provedor de grande porte com página pública de segurança, certificações e relatórios (nuvem, e-mail, CRM em SaaS) |
| `medio` | `questionario` | Fornecedor com estrutura própria de TI e acesso a dado pessoal em volume moderado |
| `pequeno` | `questionario` (enxuto) | Prestador pequeno, acesso pontual ou volume baixo |
| `critico` | `auditoria` | Trata dado sensível, grande volume, ou é essencial à operação: avaliação mais profunda (visita, auditoria, relatório independente) |

- A **avaliação** guarda `resultado` (`aprovado`, `com_ressalvas`, `reprovado`), `valido_ate` (obrigatório e no futuro), link da
  evidência (http/https) e observação. O histórico fica; a **situação** sai da mais recente: `pendente` (nunca avaliado),
  `vigente`, `vencida`, `reprovada`.
- **DPA**: o documento (contrato, aditivo de proteção de dados) é ligado ao terceiro com papel `dpa`, `contrato` ou `outro`.
- A avaliação vencida aparece nos avisos de prazo e em `terceiros_com_avaliacao_vencida` das ligações de cada tratamento.

## O que você lê, propõe e onde para

| Passo | Lê | Propõe (depois do "sim") |
|---|---|---|
| 1. Quem são | `niso_privacy_terceiros`; operadores citados no bloco F dos tratamentos (`niso_privacy_ropa_detalhe`) | Organização que falta: cadastrar em Partes (pela interface) |
| 2. Tipo | O que o terceiro faz, que dado recebe, de quantos titulares | O tipo, no chat: a pessoa grava pela interface (criticidade ou tipo manual; o servidor recusa o agente) |
| 3. Avaliação | Evidências que o consultor trouxe (link do trust center, questionário respondido, relatório) | `resultado`, `valido_ate`, link e observação, no chat: a pessoa registra a avaliação pela interface (o servidor recusa o agente) |
| 4. DPA | `/documentos` (o contrato precisa existir como documento) | `POST /api/v1/projects/{p}/terceiros/{parteId}/documentos` com `{ "documento_id": ..., "papel": "dpa" }` |
| 5. Fecho | `niso_privacy_terceiros` de novo | Lista de pendências para o consultor |

**Pare** antes de qualquer resultado `reprovado` ou `com_ressalvas`: mostre o motivo e a evidência e deixe a decisão com a pessoa.

## Evidências por método

- `trust_center`: link da página de segurança ou privacidade do provedor; certificações e relatórios que ela lista (com data);
  termos de proteção de dados do provedor; onde ficam os dados (país). Validade: a do relatório ou certificação mais próxima de vencer.
- `questionario`: o questionário respondido e assinado pelo terceiro (perguntas em `references/questionario-base.md`), com as
  evidências que ele anexou. Validade: a combinada com o cliente para reavaliação.
- `auditoria`: relatório da visita ou auditoria, achados e plano de ação do terceiro. Validade: até a próxima auditoria planejada.

`valido_ate` nunca é inventado: sai da evidência ou da regra de reavaliação que o cliente definiu. Sem isso, pergunte.

## Critério de pronto

- Todo terceiro ligado a tratamento tem tipo, avaliação `vigente` e DPA ligado.
- Nenhum terceiro `reprovada` segue recebendo dado sem decisão registrada do cliente.
- Terceiro com transferência internacional tem o país e o mecanismo no tratamento (bloco H).
