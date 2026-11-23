# Onda 2: catálogo único de requisitos

Data: 17/11/2026. Situação: **aprovada pelo dono em 17/11/2026**. Onda 2 da spec guarda-chuva
`2026-11-14-n360-posicionamento-e-fluxo-design.md`. Base: levantamento somente leitura sobre o HEAD `4a5d4ec`
(arquivo:linha e o comando de cada número; não versionado).

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

### A rever (recomendação adotada com a aprovação da spec)

| # | Tema | Recomendação |
|---|---|---|
| 2 | Vocabulário no banco ou derivado | **Derivado por função** (como `classeDoControle`): `compliance_controls.status` não é regravado. O vocabulário único tem CHECK só nas tabelas novas e em `ot_avaliacoes` _(recomendação adotada com a aprovação da spec)_ |
| 3 | `Planned` | Vale `nao_atende` na leitura única (não cobre na LGPD hoje). O Painel continua mostrando "em andamento" pela classe antiga _(recomendação adotada com a aprovação da spec)_ |
| 5 | Validação de mapeamento | Em lote **por par de fontes** (de → para) com prévia do efeito na cobertura; o `PUT /mapeamentos` passa a carimbar a sessão (hoje aceita `validado_por` do corpo). Quem valida segue `platform_admin` _(recomendação adotada com a aprovação da spec)_ |
| 6 | Texto normativo | Colunas `texto` (anulável) e `fonte_texto` (URL, data da consulta, quem revisou) em `requisitos`, preenchidas só quando a licença permite (ONS e lei sim, ISO não). Um teste reprova texto em fonte ISO _(recomendação adotada com a aprovação da spec)_ |
| 7 | Catálogo ONS em `GET /api/v1/requisitos` | Filtrado pelo módulo da pessoa: sem `ot`, o catálogo ONS não aparece _(recomendação adotada com a aprovação da spec)_ |
| 8, 9 | Casca do CIS; impacto de IA da 42001 | Ficam para a spec própria dos dois (recomendação adiantada: CIS no n.iso com avaliação periódica; impacto de IA em tabela nova) _(recomendação adotada com a aprovação da spec)_ |

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

## Rulings da execução

- (a) O detalhe do indicador por norma é o irmão `indicador_por_norma` em `/prontidao`, não `indicador.por_norma`: assim o teste de caracterização do indicador continua estrito (o objeto `indicador` não ganha chave).
- (b) O `platform_admin` vê a fonte ONS (`modulosDaPessoa` lhe dá todos os módulos); agente e chave de API nunca.
- (c) A leitura única é uma função de serviço e uma rota (`GET /projects/:projectId/requisitos-situacao`), não uma VIEW. As linhas `n.iso` exigem pessoa e projeto com `iso`; as `n.ot`, pessoa e projeto com `ot` e `fonteVisivel`.
- (d) A prévia da validação corta em 100 projetos (`LIMITE_PREVIA`, com `truncado`). **Verificado em 17/11/2026** na documentação da Cloudflare (https://developers.cloudflare.com/d1/platform/limits/): um `db.batch()` conta como UMA consulta no limite por invocação (1000 no plano pago, 50 no gratuito; subrequests do Worker: 10.000 no pago desde 11/02/2026). O corte de 100 projetos (cerca de 200 consultas) é seguro no plano pago. No gratuito, até 100 estouraria os 50: se a produção estiver no plano gratuito, baixar `LIMITE_PREVIA` para 20. O plano da conta é para o dono confirmar (não foi conferido aqui).
- (e) **ABERTO (decisão do dono sobre conteúdo normativo).** `migrate-27701-2025` grava ids grossos de `CONTROL_MAP_27701_2019_TO_2025` (por exemplo `A.1.1`) que não têm linha no catálogo 27701:2025 (o catálogo começa em `A.1.2.2`): esses controles ficam com `requisito_id` nulo mesmo depois de `ligarControles`. Já era assim antes; precisa de decisão de produto (mapear para referências reais ou descartar).
- (f) **RESOLVIDO:** a 0114 foi aplicada em 17/11/2026 (`migrations/README.md`). A sonda de produção (as seis consultas só de leitura de `scripts/sonda-onda2.sql`) FOI rodada em 17/11/2026 pelo controlador, ANTES de aplicar a 0114, pelo conector D1 da Cloudflare (só leitura). Resultado: `requisitos` por fonte: anpd 49, iso27001:2022 93, iso27701:2025 78, lgpd 72 (ainda sem ONS); status de `compliance_controls`: In Progress 134, Implemented 84, Not Applicable 15, Partial 11, Missing 11, Planned 2, Excluded 1; controles sem requisito: 1 (ISO 27701:2019); Not Applicable sem justificativa: 0; mapeamentos: 179, todos `validado_juridico`; `ot_requisitos`: 25; última migration então aplicada: 0112.
- (g) Armadilha do parâmetro `ve` (padrão `false`) em `definirRequisitosDoDocumento` e `definirRequisitosDaEvidencia`: esquecê-lo trata a ONS como inexistente (o id vira `desconhecidos`). Todos os chamadores o passam hoje; considerar torná-lo obrigatório.
- (h) Texto normativo: `fonteAceitaTexto` (falso para fonte `iso*`); `PUT /requisitos/:id` recusa texto de ISO com 400 e exige `fonte_texto` junto de `texto`.
- (i) `Excluded` → `nao_se_aplica` por decisão do dono em 17/11/2026, só na leitura única (`situacaoUnica`); o indicador segue contando como em andamento (1 controle em produção).

## Não conferido

A sonda de produção foi rodada (item (f)), então contagens, valores de `compliance_controls.status`, controles sem `requisito_id` e `Not Applicable` sem justificativa estão conferidos. Não conferido: se `/semear` já foi chamado além do que a contagem de `requisitos` mostra. Fatos da ISO 42001 e do CIS v8.1 (a confirmar com material
revisado) e a licença do CIS. Se D1 aceita `CREATE VIEW` (a leitura única foi feita como função, então não bloqueia). A 0114 foi validada em SQLite puro e em D1 local, não reexecutada a partir do histórico completo.

### Remediação dos gaps das ondas 1 e 2 (17/11/2026, plano `2026-11-17-remediacao-gaps-ondas-1-2`)

- RESOLVIDO (Task 4, `299ff83`): `migrate-27701` e `migrate-27701-2025` devolvem `sem_requisito` (ids dos controles do padrão-alvo ainda sem `requisito_id`), então os ids grossos do item (e) ficam visíveis; mapeá-los continua aberto.
- RESOLVIDO (Task 5, `1db97f7`): o botão de aprovar sai para quem pediu a base (`eu_pedi_a_base`) ou avaliou o item (`eu_avaliei`), booleanos sem ids.
- RESOLVIDO (Task 7): limite do D1 verificado, item (d); migrações 0113/0114 aplicadas, item (f).
- ABERTO: mapear os ids grossos de 27701:2025 (decisão do dono); ISO 42001 e CIS (material e licença).
