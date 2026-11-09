# Ciclo de avaliação do fornecedor: modelos da consultoria, validade, crítico e lembretes (TPRM)

Data: 09/11/2026. Situação: **aprovada pelo dono em 09/11/2026** (abordagem A); fatias 1 (migration 0106; plano `docs/arquivo/planos/2026-11-09-modelos-fornecedor.md`) e 2 (sem migration; plano `docs/superpowers/plans/2026-11-09-reavaliacao-fornecedor.md`) construídas.
Base: a análise das rotinas de TPRM de 09/11/2026 (correções no #566) e as specs `2026-10-18-criticidade-fornecedor-design.md`
e da homologação por questionário (F5, migration 0075).

## Problema

- O questionário de homologação é um só por projeto, com as 12 perguntas genéricas de `PERGUNTAS_PADRAO`
  (`src/services/homologacao.ts`), igual para fornecedor crítico e pequeno. A consultoria o reconfigura cliente por cliente, e a
  configuração mora num botão secundário de Fornecedores ("Perguntas do questionário"), visível só à equipe.
- A validade da avaliação é livre (aceita 2099). Quando a criticidade muda o tipo, a avaliação feita no tipo antigo continua
  "vigente". O crítico (método formal: auditoria) fica vigente só com o questionário, sem evidência.
- O link do questionário vence sem lembrete, não se prorroga nem se reenvia, e o questionário respondido esperando conclusão não
  aparece na fila de avaliações.

## Decisões do dono (09/11/2026)

1. **Modelos da consultoria.** A consultoria mantém os modelos uma vez; cada projeto herda e ajusta sem mexer no modelo.
2. **Um modelo por tipo**: crítico, médio, pequeno (questionário) e grande provedor (roteiro de conferência do trust center). O
   sistema escolhe o modelo pelo tipo do fornecedor, sem pergunta extra.
3. **Prazo no modelo, como teto.** A validade vem preenchida com o prazo do tipo e não pode passar dele.
4. **Tipo mudou: reavaliação pendente.** A avaliação fica no histórico, deixa de valer e o fornecedor entra na fila.
5. **Crítico: questionário + evidência.** Concluir a avaliação do crítico exige ao menos um link de evidência.
6. **Lembrete e prorrogação.** E-mail ao fornecedor 3 dias antes de o link vencer; a equipe prorroga ou gera um link novo.
7. **Herança viva (abordagem A).** O projeto guarda só os ajustes; melhorar o modelo chega a todos os clientes.
8. **Quem edita os modelos:** o `consultoria_admin` (os da própria organização) e o `platform_admin`. O consultor ajusta os projetos.

## 1. Dados (migration 0106, também no `schema.sql`)

| Tabela ou coluna | Regra |
|---|---|
| `fornecedor_modelos` | `id`, `org_id` (`organizations`, CASCADE), `tipo` (CHECK `critico`, `medio`, `pequeno`, `grande_provedor`), `prazo_meses` (1 a 60), `origem` (`padrao` ou `consultoria`), `atualizado_por`, `updated_at`; UNIQUE (`org_id`, `tipo`). |
| `fornecedor_modelo_perguntas` | `id`, `modelo_id` (CASCADE), `tema` (1 a 80), `texto` (1 a 500), `ordem`, `ativa` (0/1), `origem` (`padrao` ou `consultoria`). Não se apaga: desativa. No grande provedor são os itens do roteiro de conferência. |
| `homologacao_perguntas` (existe) | Passa a ser só a pergunta PRÓPRIA do projeto. Ganha `tipo` (NULL = todos os tipos que recebem questionário; ou `critico`, `medio`, `pequeno`). |
| `homologacao_ajustes` (nova) | `project_id`, `modelo_pergunta_id` (CASCADE), `ativa` (0); PK (`project_id`, `modelo_pergunta_id`). O projeto desliga uma pergunta do modelo; não edita o texto dela. |
| `avaliacoes_terceiro.tipo_avaliado` | O tipo do fornecedor no momento da avaliação, gravado pelo servidor. A 0106 preenche as linhas antigas com o `terceiro_tipo` atual (nada vira pendência na migração). |
| `homologacoes.tipo` | O tipo no envio (o modelo usado). Linhas antigas: o tipo atual da parte. |
| `homologacoes.email_destino` | O e-mail do fornecedor, gravado SÓ enquanto `aberta`, para o lembrete; apagado quando sai de `aberta` (gatilho). Hoje o endereço não é gravado. |
| `homologacoes.lembrete_em` | Quando o lembrete saiu (uma vez por homologação). |

**Migração do que existe.** As perguntas de projeto com `origem = 'padrao'` (o semeio genérico, igual ao do modelo) saem; as com
`origem = 'projeto'` (editadas ou criadas pela equipe) ficam como próprias do projeto, com `tipo` NULL. Pergunta padrão que o projeto
tinha DESATIVADO perde a desativação (o modelo novo vem ativo). Antes de aplicar, conferir em produção quantas há de cada:
`SELECT origem, ativa, count(*) FROM homologacao_perguntas GROUP BY origem, ativa`. Backup antes e o "sim" do dono.

**Semeio.** Organização sem modelo para um tipo ganha, na primeira leitura, o modelo `padrao`, com as 12 perguntas genéricas de hoje
(para crítico, médio e pequeno) e um roteiro mínimo do trust center (grande provedor), todos marcados "a validar pela consultoria".
**Prazos provisórios, a validar pelo dono:** crítico 12 meses, médio 24, pequeno 36, grande provedor 12. Não há texto normativo
inventado: o conteúdo de verdade entra pela consultoria.

## 2. Questionário montado

`perguntasDoEnvio(db, projectId, tipo)`: as perguntas ativas do modelo do tipo (da organização do projeto), menos as que o projeto
desligou em `homologacao_ajustes`, mais as próprias do projeto ativas com `tipo` NULL ou igual ao tipo, na ordem do modelo e depois as
do projeto. É o que `criarHomologacao` congela em `perguntas_json` (como hoje: envio feito não muda). Grande provedor não recebe
questionário (`PODE_QUESTIONARIO` não muda): o roteiro dele aparece na ficha, aba Avaliações, como lista de conferência para a equipe.

## 3. Validade e reavaliação

- **Teto.** `registrarAvaliacao` recusa (400) `valido_ate` além de `hoje + prazo_meses` do modelo do tipo atual, com a mensagem do
  teto. A tela preenche a data com o teto. A conclusão do questionário segue a mesma regra.
- **`tipo_avaliado`** é gravado pelo servidor em toda avaliação (manual, questionário, importação).
- **Reavaliação pendente.** `situacaoDe` ganha a situação `reavaliar`: a avaliação mais recente não reprovada, ainda no prazo, mas com
  `tipo_avaliado` diferente do tipo atual. Ela não conta como vigente: `pendencias` traz "Avaliação" e a ficha diz "Reavaliar: o tipo
  mudou de médio para crítico". Vale nos dois sentidos (tipo que sobe ou desce), porque o modelo e o prazo mudaram.
- **Consumidores** da situação (lista, ficha, fila, painel, selos, avisos de prazo, CSV) passam a conhecer `reavaliar`; o selo e o
  painel a contam como pendente (não como atraso).

## 4. Crítico com evidência

Para o tipo `critico`, registrar avaliação `aprovado` ou `com_ressalvas` exige `evidencia_url` (400 sem ela), na avaliação manual e na
conclusão do questionário (o formulário de conclusão ganha o campo). `reprovado` não exige.

## 5. Ciclo do link

- **Prorrogar:** `PUT .../homologacoes/:id/prazo` com `{ dias }` (1 a 60, contados de agora), só `aberta` (inclusive já vencida sem
  resposta). Trilha `homologacao.prorrogada`.
- **Novo link:** `POST .../homologacoes/:id/novo-link` com `{ email? }`: cancela a aberta e cria outra para o mesmo fornecedor, com as
  perguntas atuais do modelo (respostas parciais não passam: as perguntas podem ter mudado). O token não muda numa homologação
  existente (o gatilho `homologacao_imutavel` o protege).
- **Lembrete:** fonte nova `homologacao` nos avisos de prazo (`src/services/avisos-prazo.ts`, rotina das 08:00): homologação `aberta`,
  sem envio, que vence em até 3 dias e ainda não teve lembrete recebe UM e-mail ao `email_destino` (`emailLembreteHomologacao` em
  `src/services/emails.ts`, pelo `montarEmail`, amostra e teste de marca). **O e-mail não leva o link** (o banco só tem o hash do
  token): diz o fornecedor, o cliente, a data do envio e do vencimento e pede para usar o link do e-mail original, ou pedir um novo a
  quem enviou (`reply_to`). Sem `email_destino`, nada vai ao fornecedor.
- **Equipe:** a mesma fonte avisa no sino (faixa `privacy`, os consultores designados ou o `consultoria_admin`, como `avisarEnvio`) o
  link que vence em 3 dias, o link vencido sem resposta (D0) e o questionário respondido há 2 dias sem conclusão.
- **Fila de avaliações** (`frontend/src/views/avaliacoes-terceiros.js`) ganha os grupos "Reavaliar: tipo mudou", "Questionário
  respondido, aguardando conclusão" e "Link vencido sem resposta"; reprovada sobe para junto de vencida (o selo já a trata como atraso).

## 6. Telas

- **Conta e acessos (n.360): "Modelos de avaliação de fornecedor"** (tela `modelos-fornecedor`, em `TELAS_DA_CONTA`). Uma aba por tipo:
  prazo em meses e a lista de perguntas (ou itens do roteiro), com criar, editar, reordenar e desativar. Edita o `consultoria_admin`
  (da própria organização) e o `platform_admin` (escolhe a organização). O consultor vê, só leitura. O selo "a validar" some quando a
  consultoria edita o modelo.
- **n.privacy → Fornecedores → "Questionários"** (item novo na seção Fornecedores, página `questionarios-fornecedor`). Uma aba por tipo:
  as perguntas do modelo (só leitura, com "Usar neste projeto" ligado/desligado) e as próprias do projeto (criar, editar, desativar,
  escolher o tipo ou "todos"), e o prazo do modelo. A equipe edita; o `org_admin` vê, só leitura. O botão "Perguntas do questionário"
  da lista sai (vira o item do menu).
- **Ficha:** a data da nova avaliação vem com o teto e não passa dele; no crítico, o campo de evidência é obrigatório; a situação
  `reavaliar` aparece com o tipo antigo e o novo; a seção do questionário ganha "Prorrogar" e "Novo link".

## 7. Rotas e permissões

| Rota | Quem | Agente |
|---|---|---|
| `GET /api/v1/fornecedor-modelos` (organização por `X-Org-Id` só para o `platform_admin`) | equipe (leitura) | fora (lê o questionário pelo projeto) |
| `PUT /api/v1/fornecedor-modelos/:tipo` (prazo) e `POST/PUT .../:tipo/perguntas[/:id]` | `consultoria_admin` da org, `platform_admin` | `FORA_DO_AGENTE` |
| `GET /projects/:id/homologacoes/perguntas?tipo=` (montado, com origem de cada pergunta) | quem lê o projeto | lê |
| `PUT /projects/:id/homologacoes/perguntas/modelo/:perguntaId` (`{ ativa }`, o ajuste) | equipe | `niso_avaliar_fornecedor` |
| `POST/PUT .../homologacoes/perguntas` (própria, com `tipo`) | equipe (como hoje) | `niso_avaliar_fornecedor` |
| `PUT .../homologacoes/:id/prazo`, `POST .../homologacoes/:id/novo-link` | equipe | `niso_avaliar_fornecedor` |

Rotas de projeto na faixa `privacy` (segmento `homologacoes`, como hoje). `/api/v1/fornecedor-modelos` é da organização, fora de
projeto. Toda escrita com `logAudit` sem texto livre de pergunta.

## 8. Fatias (um PR cada)

1. **Modelos da consultoria**: migration 0106 inteira, semeio, `perguntasDoEnvio`, as duas telas, a saída do botão antigo.
2. **Validade e reavaliação**: teto, `tipo_avaliado`, situação `reavaliar` e os consumidores.
3. **Crítico com evidência.**
4. **Ciclo do link**: prorrogar, novo link, lembrete, sino e fila.

## 9. Testes

- D1 real: semeio por organização (isolamento entre consultorias); montagem do questionário (modelo menos ajustes mais próprias, por
  tipo); envio congela; editar o modelo chega ao próximo envio de todos os projetos e não ao envio feito; migração (padrão sai,
  própria fica, `tipo_avaliado` preenchido); permissões (consultor não edita modelo, `org_admin` não ajusta projeto, agente fora dos
  modelos); teto da validade; `reavaliar` ao mudar o tipo pela criticidade e pelo select; crítico sem evidência recusado; prorrogar só
  `aberta`; novo link cancela o anterior; lembrete uma vez, sem link, só com `email_destino`, que é apagado quando sai de `aberta`.
- Tela (jsdom): as duas páginas, a ficha (teto, evidência, `reavaliar`, prorrogar, novo link), a fila com os grupos novos.
- Contratos: faixas, openapi, agente, tela↔API, migrations, e-mail (marca e amostra).

## 10. Fora

- Anexo de evidência pelo fornecedor na página pública.
- Questionário por categoria de serviço.
- Pontuação automática do questionário (o resultado continua decisão da equipe).
- Fornecedor no n.iso (o selo que cobra avaliação que o n.iso não registra): desenho próprio.
- Desligamento formal do fornecedor, vigência do contrato e incidente ligado ao fornecedor: desenho próprio.
