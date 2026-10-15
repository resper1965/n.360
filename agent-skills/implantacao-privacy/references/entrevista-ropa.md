# Entrevista de RoPA: 8 blocos (A a H)

É a mesma sequência da tela de entrevista do n.privacy (`frontend/src/views/ropa-entrevista.js`). Uma pergunta por vez, em
português de consultor. Toda pergunta, menos a finalidade, aceita "não sei agora": fica vazia e entra na lista de pendências.

Gravação:

- Fim do bloco A: `niso_privacy_propor_tratamento` (nasce `Draft`). Se a finalidade já existe, a ferramenta devolve o id: siga com
  `niso_privacy_atualizar_tratamento` naquele registro.
- Blocos seguintes: `niso_privacy_atualizar_tratamento` com os campos do bloco; itens, departamentos e base do catálogo com
  `niso_privacy_ligar_tratamento`.
- Antes de cada gravação, mostre o que vai gravar e espere o "sim".

## A. O que é a atividade

| Pergunta | Campo |
|---|---|
| Qual atividade da empresa usa dados de pessoas? (ex.: Folha de pagamento, Recrutamento, Atendimento a clientes, Cobrança, Câmeras) | `processing_purpose` |
| Em uma frase, para que essa atividade serve? ("RH" não basta) | junta em `processing_purpose`: "Folha de pagamento: pagar salários e recolher encargos" |
| Quem responde por ela? | `owner` e, se a pessoa está em `/partes`, `owner_parte_id` |
| Qual área executa? | `departamentos` em `niso_privacy_ligar_tratamento` |

## B. De quem são os dados

| Pergunta | Campo |
|---|---|
| De quem são os dados? (colaboradores, candidatos, dependentes, clientes pessoa física, visitantes, usuários do site...) | `data_subjects` |
| Há crianças ou adolescentes (menores de 18)? | `criancas_adolescentes` |
| Se sim e a base for consentimento: o responsável legal sabe e concordou? | `consent_details` |
| Mais ou menos quantas pessoas? | sem campo: só insumo do bloco H |

## C. Quais dados

| Pergunta | Campo |
|---|---|
| Que tipos de dado? (identificação, contato, financeiro, profissional, acesso e uso, imagem e voz, localização) | `data_categories` |
| Algum é sensível? (saúde, biometria, origem racial ou étnica, religião, opinião política, filiação sindical, vida sexual, genético) | `dados_sensiveis` (e entra em `data_categories`) |
| A atividade toma decisão automática sobre pessoas? | sem campo: insumo do bloco H |

## D. Por quê (base legal)

| Pergunta | Campo |
|---|---|
| Qual motivo descreve melhor por que a empresa usa esses dados? (a lei manda; há contrato com a pessoa; a pessoa autorizou; defender direitos em processo; proteger a saúde; interesse legítimo que a pessoa espera) | orienta a escolha, não grava |
| Confirme a hipótese legal | `legal_basis` (texto) e `base_legal_id` (catálogo: liste `/api/v1/requisitos?fonte=lgpd`) |
| Se consentimento: como é pedido e guardado? | `consent_details` |
| Se legítimo interesse: vamos rascunhar a LIA agora? | `niso_privacy_rascunhar_lia` (concluir é de uma pessoa) |

Regra: com dado sensível, a base tem de ser do art. 11 (no catálogo, `lgpd:art11:*`; no texto, o sufixo " (art. 11)"). Base do
art. 7 com sensível: não grave; volte ao bloco C ou troque a base.

## E. De onde vêm e por onde passam

| Pergunta | Campo |
|---|---|
| De onde vêm os dados? (a própria pessoa, outro sistema, parceiro, fonte pública) | sem campo: vai para o resumo e para o RIPD |
| Em quais sistemas ou arquivos esses dados passam? | `itens` em `niso_privacy_ligar_tratamento` (ids de `/assets`; o que não existe, cadastre pela interface ou proponha) |

## F. Com quem compartilha

| Pergunta | Campo |
|---|---|
| A empresa envia esses dados para alguém de fora? | controla o resto do bloco |
| Para quem? Órgãos públicos entram como texto | `recipients` |
| Cada organização: trata em nome da empresa (operador), decide junto (cocontrolador), subcontratada do operador (suboperador) ou só recebe (destinatário)? | vínculo da parte ao tratamento, pela interface ou `niso_executar` em `/partes/{id}/vinculos` |
| Existe contrato com cláusula de proteção de dados? | leia `niso_privacy_terceiros`; avaliação pela skill `avaliacao-terceiros` |

## G. Quanto tempo ficam

| Pergunta | Campo |
|---|---|
| Por quanto tempo a empresa guarda e com que critério? | `retention_period` |
| Como o dado é eliminado ao fim? | sem campo: resumo |

Não proponha prazo de retenção como fato: proponha o critério e peça ao cliente ou ao jurídico a confirmação.

## H. Transferência internacional e riscos

| Pergunta | Campo |
|---|---|
| Algum dado vai para fora do Brasil ou fica em servidor no exterior? (e-mail em nuvem, sistema hospedado fora) | `international_transfers` |
| Para qual país e com qual mecanismo? | `transfer_safeguards` (resumo); país e destinatário em `/ropa/{id}/transferencias`, pela interface ou `niso_executar` |
| Se vazasse, o que aconteceria com as pessoas? | sem campo: insumo da recomendação |
| Precisa de relatório de impacto (RIPD)? | `dpia_required`; se sim, `niso_privacy_criar_dpia_do_tratamento` |

Recomende RIPD quando houver dado sensível, menores, larga escala, decisão automatizada ou dano alto em caso de vazamento. A
decisão é da pessoa; registre o motivo da recomendação no resumo.

## Fecho do tratamento

1. `niso_privacy_ropa_detalhe`: confira ligações, LIA, DPIAs, ciclo de vida, bases adicionais e teste de impacto, e as pendências.
2. Mostre ao usuário o resumo e as pendências (sem base, sem responsável, sem mecanismo de transferência, LIA em rascunho, RIPD
   pendente, terceiro sem avaliação vigente).
3. Pedir aprovação é da interface (pedido de aprovação do tratamento). Você não aprova.
