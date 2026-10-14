# Normalização de nomes (pessoas, organizações, departamentos, ativos)

Data: 14/10/2026. Aprovado em conversa com o dono do produto (escolhas: forma e abreviaturas expandidas; automático ao
gravar mais saneamento sob demanda do que já existe).

## Problema

No mapeamento do RoPA (e nas outras entradas de cadastro) o nome é gravado como foi digitado: `ti`, `depto financeiro`,
`MARIA DA SILVA`. A lista fica com dois padrões, a comparação de duplicata erra (`ti` e `TI`) e o relatório sai
desigual.

## Regra (uma função só, `normalizarNome`, em `src/services/nomes.ts`)

Entrada e saída são texto. A função é pura e idempotente (`normalizarNome(normalizarNome(x)) === normalizarNome(x)`).

1. Junta espaços repetidos e tira os das pontas (Unicode NFC).
2. Cada palavra, por esta ordem:
   - inicial com ponto (`a.`) fica em maiúscula (`A.`);
   - abreviatura **inequívoca** é expandida (`depto`, `dpto`, `dept` → `Departamento`; `mkt` → `Marketing`; `infra` →
     `Infraestrutura`; `ltda` → `Ltda.`). Ambígua (`ger.`, `adm.`, `dir.`, `coord.`) fica como foi digitada;
   - sigla conhecida (`TI`, `RH`, `DPO`, `CISO`, `LGPD`, `ANPD`...) fica em maiúsculas;
   - conector fora da primeira posição (`de`, `da`, `do`, `das`, `dos`, `e`, `em`, `na`, `no`, `para`, `por`, `com`, `a`, `o`)
     fica em minúsculas;
   - palavra com maiúscula no meio (`McDonald`, `iPhone`, `D'Ávila`) fica como está;
   - palavra toda em maiúsculas de 2 a 4 letras fica como está (sigla ou marca: `SAP`, `PC-001`), **exceto** quando o texto
     inteiro está em maiúsculas e tem mais de uma palavra ou mais de 4 letras (`MARIA DA SILVA` → `Maria da Silva`);
   - o resto vira Title Case, também depois de hífen, apóstrofo e barra (`maria-clara` → `Maria-Clara`).
3. Pontuação em volta da palavra (parênteses, vírgula) é preservada.

## Onde entra

- **Servidor, ao gravar** (vale para tela, importação e agente): os esquemas de entrada (`nome` de `departamento` e `parte`,
  `name` de ativo) e os gravadores que não passam por eles (`importarPartes`, fornecedor, encarregado, importação de
  programa, `stmtsCriarAtivo`). Idempotente, então aplicar duas vezes é inofensivo.
- **`chaveNome(texto)`**: caixa baixa, sem acento, espaços juntados. Usada só pelo saneamento para achar duplicata.
  As comparações que já existem (`norm` em cada serviço) ficam como estão: já ignoram a caixa e funcionam com nome novo e
  antigo.

## Saneamento do que já existe

`GET /projects/:id/padronizar-nomes` devolve `{ propostas, duplicatas }`:

- `propostas`: linhas de `partes`, `departamentos` e `itens` do projeto cujo nome mudaria
  (`{ tabela, id, antes, depois, conflito }`; `conflito` quando outra linha da mesma tabela já tem exatamente o nome novo).
- `duplicatas`: grupos de linhas da mesma tabela com a mesma `chaveNome` (informativo; unir é decisão humana, nunca
  automática).

`POST /projects/:id/padronizar-nomes` recebe `{ itens: [{ tabela, id }] }` (até 200) e aplica só o que o servidor recalcula
na hora: o texto novo nunca vem do cliente. `UPDATE ... WHERE id = ? AND project_id = ? AND nome = <antes>`: se o nome mudou
entre a lista e o clique, a linha é ignorada. Conflito é ignorado e informado. Trilha `nome.padronizado` por linha. Só a
equipe da consultoria e o `platform_admin`; fora do agente MCP.

Tela: botão "Padronizar nomes" em Partes, com a lista antes → depois, caixas de seleção e "Aplicar selecionados".

## Fora de escopo

Dicionário por projeto; unir duplicatas; e-mails (já minúsculos); nomes em `responsavel_texto` e outros campos de texto livre.

## Teste

Tabela de casos da função (inclui idempotência), um teste por ponto de gravação, e o saneamento (lista, aplica, conflito,
nome alterado no meio, outro projeto, papel sem permissão).
