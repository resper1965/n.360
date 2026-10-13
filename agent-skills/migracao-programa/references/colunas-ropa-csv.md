# Planilha do RoPA em CSV (`POST /api/v1/projects/{p}/ropa/importar`)

Corpo: `{ "csv": "<o arquivo inteiro como texto>" }`. Delimitador `;` ou `,` (o da primeira linha que aparece mais). Campo entre
aspas aceita aspas dobradas e quebra de linha. Até 500 linhas por envio.

Cabeçalho sem acento nem caixa (o servidor normaliza). Nomes aceitos:

| Coluna da planilha | Campo do RoPA |
|---|---|
| `finalidade`, `finalidade_do_tratamento` | `processing_purpose` (obrigatória; chave contra duplicata) |
| `categorias`, `categorias_de_dados` | `data_categories` |
| `titulares` | `data_subjects` |
| `base_legal` | `legal_basis` (texto; o id do catálogo vem depois, com `niso_privacy_ligar_tratamento`) |
| `retencao`, `prazo_de_retencao` | `retention_period` |
| `destinatarios`, `compartilhamento` | `recipients` |
| `transferencia_internacional` | `international_transfers` (sim/não) |
| `salvaguardas` | `transfer_safeguards` |
| `dpia_requerido` | `dpia_required` (sim/não) |
| `dados_sensiveis` | `dados_sensiveis` (sim/não) |
| `criancas_e_adolescentes` | `criancas_adolescentes` (sim/não) |
| `responsavel` | `owner` |

O que saber:

- Cria tudo em `Draft`. Reimportar não duplica: finalidade igual (sem acento e caixa) é recusada e aparece no relatório.
- Coluna ausente não é "não": sem `dados_sensiveis`, `criancas_e_adolescentes` ou `transferencia_internacional`, esses campos ficam
  sem informação real e precisam ser perguntados (blocos B, C e H da entrevista).
- Linhas recusadas voltam no relatório com o motivo: mostre ao consultor, não corrija em silêncio.
- Antes de enviar: mostre ao usuário quantas linhas, as colunas reconhecidas e as ignoradas, e espere o "sim".
