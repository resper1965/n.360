# Onda 2: catálogo único de requisitos

Data: 17/11/2026. Situação: **rascunho para aprovação do dono**. Onda 2 da spec guarda-chuva
`2026-11-14-n360-posicionamento-e-fluxo-design.md`. Base: levantamento somente leitura sobre o HEAD `4a5d4ec`
(`/tmp/claude-0/-home-user/0c1d5499-e055-503d-a651-849433c76e01/scratchpad/onda2-levantamento.md`, com arquivo:linha e o comando de cada número).

## O pedido

Um catálogo só de requisitos para todos os frameworks, com situação em um vocabulário só, mapeamento entre quaisquer frameworks e
progresso por framework. Sem mudar, sem explicação, os números que o cliente já acompanha (indicador do n.iso, cobertura LGPD/ANPD,
resumo do assessment do n.ot).

## Decisões do dono

| # | Decisão | Resposta |
|---|---|---|
| 1 | Onde mora a avaliação | **Cada uma onde está** (`compliance_controls` no n.iso, `ot_avaliacoes` no n.ot) **e uma visão única de leitura.** Tabela nova só para os frameworks sem casa (CIS e afins), quando entrarem. A spec guarda-chuva dizia "uma avaliação por projeto e requisito": passa a ser "uma leitura única", não "uma tabela única" |
| 4 | Indicador do n.iso | **Mantém o "X de Y" somado** (o número de hoje) **e acrescenta o detalhe por framework**, com um aviso na tela quando o projeto tem mais de uma norma. Trocar o número principal fica para quando houver nota ao cliente |
| 10 | Material da ISO 42001 e do CIS v8.1 | **Não está no repositório e não bloqueia a onda.** As entregas abaixo andam sem eles; 42001 e CIS entram em spec própria quando o dono fornecer o material revisado e a licença permitir reproduzir o texto |

### A rever (recomendação minha, ainda não respondida)

| # | Tema | Recomendação |
|---|---|---|
| 2 | Vocabulário no banco ou derivado | **Derivado por função** (como `classeDoControle`): `compliance_controls.status` não é regravado. O vocabulário único tem CHECK só nas tabelas novas e em `ot_avaliacoes` |
| 3 | `Planned` | Vale `nao_atende` na leitura única (não cobre na LGPD hoje). O Painel continua mostrando "em andamento" pela classe antiga |
| 5 | Validação de mapeamento | Em lote **por par de fontes** (de → para) com prévia do efeito na cobertura; o `PUT /mapeamentos` passa a carimbar a sessão (hoje aceita `validado_por` do corpo). Quem valida segue `platform_admin` |
| 6 | Texto normativo | Colunas `texto` (anulável) e `fonte_texto` (URL, data da consulta, quem revisou) em `requisitos`, preenchidas só quando a licença permite (ONS e lei sim, ISO não). Um teste reprova texto em fonte ISO |
| 7 | Catálogo ONS em `GET /api/v1/requisitos` | Filtrado pelo módulo da pessoa: sem `ot`, o catálogo ONS não aparece |
| 8, 9 | Casca do CIS; impacto de IA da 42001 | Ficam para a spec própria dos dois (recomendação adiantada: CIS no n.iso com avaliação periódica; impacto de IA em tabela nova) |

## O que existe hoje (resumo; detalhe no levantamento)

- `requisitos` não tem texto, versão nem origem do texto. É carregado à mão por `POST /api/v1/requisitos/semear` (só `platform_admin`).
  Catálogo: 27001 = 93; 27701 = 31 + 18 + 29; LGPD = 72; ANPD = 49. GDPR tem a fonte e nenhum requisito.
- Mapeamentos: 179 pares, todos ISO → LGPD/ANPD, gravados como propostos.
- `ot_requisitos`: 25 linhas por migration (0090), com o texto integral da ONS. `ot_avaliacoes` já usa o vocabulário limpo
  (`atende | parcial | nao_atende | nao_se_aplica`, com CHECK).
- `compliance_controls` (avaliação do n.iso) tem `status` em texto livre e é alvo de FK em 7 tabelas: refazê-la é caro.
- Sete vocabulários de situação convivem. Vocabulário único proposto: `atende`, `parcial`, `nao_atende`, `nao_se_aplica`, `nao_avaliado`.

## O que muda

### Entrega 1: base e números travados (sem migration)

- Testes de caracterização que **fixam** o indicador do n.iso, a cobertura LGPD/ANPD e o resumo do assessment do n.ot com dados de
  exemplo. Eles precedem qualquer mudança e continuam verdes até o fim da onda.
- Função de situação única derivada (V1 → `atende | parcial | nao_atende | nao_se_aplica | nao_avaliado`), sem gravar nada. Tabela de
  correspondência do levantamento, seção 2:
  - classe `feito` → `atende`; `Partial`, `In Progress` e texto desconhecido → `parcial`; `Planned` → `nao_atende`;
  - `Missing`, `NOT STARTED`, vazio → `nao_avaliado`; `Not Applicable` → `nao_se_aplica` (sem exigir justificativa na leitura);
  - o item técnico do n.ot **nunca** vira `atende` (fica derivado do inventário, D2); a cobertura de fonte (`coberto | parcial | lacuna |
    nao_aplicavel`) continua separada, porque mede documento e evidência, não a avaliação.
- `ligarControles` garantido para todos os projetos antes de qualquer conta por framework (controles sem `requisito_id`).
- `PUT /api/v1/requisitos/mapeamentos`: carimbo de `validado_por` e `validado_em` pela sessão, não pelo corpo.
- Sonda de produção (antes da entrega 2): valores distintos de `compliance_controls.status`, controles com `requisito_id` nulo, se
  `/semear` já rodou.

### Entrega 2: catálogo único (migration aditiva)

- `requisitos` ganha `texto`, `fonte_texto` e `categoria`; só colunas novas, sem refazer tabela.
- Os 25 requisitos ONS entram em `requisitos` (fonte `ons-ro-cb-br-01`) **com os mesmos ids de hoje**; `ot_requisitos` ganha
  `requisito_id` apontando para eles e continua como satélite (`prazo_meses`, `categoria`, `descricao`). `ot_avaliacoes` e
  `ot_requisito_evidencias` **ficam com o nome `ot_*`**: a portabilidade exporta toda tabela com `project_id` que não comece por `ot_`,
  então uma tabela genérica com linhas do n.ot vazaria o assessment no export.
- **Trava da fonte ONS nas rotas genéricas** (`/projects/:id/requisitos/*`, faixa `privacy`, que o agente alcança): recusar a fonte ONS
  para agente e chave de API, senão o agente poderia excluir requisitos do n.ot ou ligar evidência a eles (P0-2).
- Filtro por módulo em `GET /api/v1/requisitos` (decisão 7).
- Detalhe do indicador por framework ao lado do número somado, com o aviso quando o projeto tem mais de uma norma (decisão 4).
- Validação de mapeamento em lote por par de fontes com prévia do efeito na cobertura (decisão 5). O botão "validar tudo" de hoje
  deixa de existir, porque um seed grande seguido de um clique mudaria a cobertura LGPD na hora.
- A visão única de leitura (decisão 1) entra aqui. Dúvida técnica: D1 pode não aceitar `CREATE VIEW` no fluxo de migration do
  repositório (hoje `grep -c "CREATE VIEW" schema.sql` = 0); se não aceitar, a leitura única é uma função/consulta no serviço, não uma
  view, e o resultado para o dono é o mesmo.

### Entregas seguintes (spec própria, depois do material)

42001 e CIS v8.1, a tabela de avaliação periódica para frameworks sem casa, o inventário de sistemas de IA e a avaliação de impacto.

## O que não muda (e não pode regredir)

- Os números mostrados ao cliente: indicador do n.iso, cobertura LGPD/ANPD, resumo do assessment n.ot. Travados pelos testes da entrega 1.
- P0-1 (`ot` nunca concedido automaticamente) e P0-2 (sem chave de API nem agente no n.ot), máscara e step-up, e a exportação de
  portabilidade sem tabela `ot_*`.
- Contratos do MCP e dos agentes: ids no formato `fonte:referencia`, o campo `status` em inglês nos controles, os nomes `lgpd` e `anpd`.
  Só se acrescentam campos.
- Mapeamento proposto só conta depois de validado por uma pessoa (a regra de hoje); `relacionado` nunca conta.

## Testes

- Caracterização dos três números (entrega 1), com dados de exemplo fixos.
- Função de situação derivada: uma linha de teste por linha da tabela de correspondência.
- Fonte ONS: agente e chave de API recusados nas rotas genéricas; pessoa sem `ot` não vê o catálogo ONS; `ot_avaliacoes` fora do export.
- Texto: teste que reprova `texto` preenchido em fonte ISO.
- Validação por par de fontes: a prévia bate com o efeito real; o carimbo vem da sessão.
- Migration: `test/migrations-consistencia.test.ts`; a migration é só aditiva (ADD COLUMN, INSERT OR IGNORE, tabela nova).

## Entrega

Dois PRs: (1) base e números travados, sem migration; (2) catálogo único, com migration aditiva (backup, apply remoto, conferir, só então merge).

## Não conferido

Nada em produção: contagem real de `requisitos`, se `/semear` já foi chamado, valores distintos de `compliance_controls.status`,
controles com `requisito_id` nulo, `Not Applicable` sem justificativa. Fatos da ISO 42001 e do CIS v8.1 (a confirmar com material
revisado) e a licença do CIS. `routes/controls.ts` e `routes/projects.ts:1193` linha a linha; o formato completo de `GET /controls`
consumido pelo MCP. Se D1 aceita `CREATE VIEW`.
