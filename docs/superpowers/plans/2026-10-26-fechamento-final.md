# Fechamento do n.360: o que falta e como resolver

> **Para agentes:** SUB-SKILL: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Cada fase é
> uma leva de PRs pelo `scripts/ci/ship.sh`. Leia antes `docs/estado-2026-10-20.md` (como publicar e as armadilhas).

**Objetivo (o inicial):** trocar o sistema legado (DPO as a Service) pelo n.privacy com o menor impacto para os clientes,
mantendo o n.iso íntegro e os dois módulos sobre o mesmo cadastro.

**Estado em 26/10/2026** (conferido no código da `main` `164b669`, sem migration pendente em produção): as etapas 0 a 4 do plano de
18/10 estão no ar. Dos dois documentos de lacunas de 20/10 (`docs/equalizacao-modulos-2026-10-20.md`, 8 P0, 13 P1 e P2; e
`docs/paridade-legado-2026-10-20.md`) resolveram-se 7 de 8 P0 e 9 de 13 P1. Sobra o que está abaixo.

## Restrições globais

- Commits sem atribuição de IA, autor `Ricardo Esper <44273656+resper1965@users.noreply.github.com>`. Nenhum dado real de cliente.
- Migration em produção só com o "sim" do dono, backup antes e conferência por `PRAGMA`; o merge vem depois da migration.
- "Em produção" só com o SHA do `/health`. Um `ship.sh` por vez, sem outra suíte rodando.
- O MCP nunca aprova. Rota nova de escrita que exige decisão humana entra em `FORA_DO_AGENTE`.

---

## Fase 0: decisões do dono (destravam as fases 2 e 3)

Cada uma com a minha recomendação. Sem decidir, a fase correspondente não começa.

| # | Decisão | Recomendação | Por quê |
|---|---|---|---|
| D1 | RIPD: as respostas do questionário novo (Teste de Impacto, Conformidade, Armazenamento) entram no hash da aprovação? E o texto exato das perguntas de Conformidade, que estão cortadas nas capturas. | **Fora do hash** (tabela própria, como `tratamento_impacto`). | Não invalida as aprovações que já existem. O conteúdo atual do RIPD (`COLUNAS_DPIA`) continua provado como hoje. |
| D2 | LIA: as 12 perguntas do legado viram uma ficha com abas (Finalidade, Necessidade, Proporcionalidade)? | **Sim.** | A LIA não tem pedido nem hash, então não há restrição. |
| D3 | Logs da atividade com valor anterior e novo? | **Sim, só para campo que não é texto livre** (status, datas, listas de ids, escolhas); texto livre registra "alterado". | Dá o antes e depois do legado sem pôr dado pessoal na trilha. |
| D4 | CNPJ de pessoa jurídica e responsável do fornecedor entram já no núcleo? | **CNPJ só para organização** (coluna em `partes` com CHECK) e **responsável pelo vínculo** que já existe. Plano de ações, aprovações e assunção de risco ficam no n.tprm. | O CNPJ de empresa não é dado pessoal. Mantém o fornecedor como a `partes` do núcleo. |
| D5 | Mesclar ativos e parceiros (o ícone amarelo do legado)? | **Sim**, movendo os vínculos, com confirmação e trilha. | Hoje "Padronizar nomes" só lista duplicata e manda unir à mão. |
| D6 | Atividade aprovada que volta a rascunho ao editar a Coleta: manter? | **Manter.** | É a regra mais segura para a prova e já está no ar. |

---

## Fase 1: correções sem decisão (4 PRs, podem sair já)

### PR 1.1: trilha, fuso e segurança

- Trilha do projeto (P0-8): `GET .../audit-trail` em `src/routes/projects.ts:1284` devolve `SELECT *`. Cortar `details` e a
  justificativa para quem não é da equipe e filtrar por `project_id`, não por `details LIKE`.
- `diaAtras` em `src/trilha.ts:76` passa a usar São Paulo, como `src/services/hoje.ts`.
- **Testes:** `test/` com cliente e consultor lendo a mesma trilha (cliente não vê `details`); isolamento entre projetos; a retenção
  corta no dia de São Paulo.

### PR 1.2: uma regra por conceito (n.iso e n.privacy)

- Riscos e ações contados: definir uma função de escopo (com e sem os itens da atividade) e usá-la na lista de riscos, na CAPA,
  no Painel, na coherence e na Bancada (`src/routes/risks.ts:9`, `src/services/coherence.ts:32`).
- Evidência vencida: um critério único no Painel e no "O que fazer" (`SQL_EVIDENCIA_VENCIDA` x `SQL_EVIDENCIA_RUIM`).
- Responsável da CAPA obrigatório no servidor, não só na tela.
- Aviso ao apagar controle ligado a medida de atividade.
- **Testes:** um teste de contrato que conta a mesma entidade pelas telas e exige o mesmo número.

### PR 1.3: n.privacy, ações e indicadores menores

- Excluir ativo (soft) em `sistemas.js`. Reabrir a LIA com confirmação (`tratamento-ligacoes.js:74`).
- RIPD criado de atividade sem sistema: título pela finalidade (`src/services/lia.ts:169`).
- Painel: % de Gaps concluídos, % de Riscos concluídos e solicitações **por mês**.
- Fornecedores: busca e colunas Data de envio e % do questionário.
- Ficha da atividade: Eliminação com escolha própria de ativos; Armazenamento com edição em modal.
- Forma e rótulo: "Organização/Instituição" no Compartilhamento Externo; "+ Medida" e "Ativo" (não "Ativa"); coluna "Registrado";
  "Limpar" nos modais de cadastro; "É sensível?" como caixa de marcar. O Teste de Impacto: conferir a polaridade do alto risco.
- **Testes:** jsdom por tela; E2E do Painel; contrato `casca-menu` se o menu mudar.

### PR 1.4: documentos

- Word para o documento versionado (hoje só RIPD e LIA, `src/services/documento-word.ts`).
- `documentos_arquivo` entra no Painel e na cobertura, e no vínculo de DPA.
- CSV de Gaps com Área, Recomendação e Plano, e os CSVs de Gaps e Riscos respeitando os filtros da tela.
- **Testes:** D1 real para a cobertura; o CSV com o cabeçalho esperado e o filtro aplicado.

---

## Fase 2: com D1 a D3

### PR 2.1: LIA com as 12 perguntas (D2)

- Nova ficha com três abas de quatro perguntas, na Base Jurídica; as colunas atuais continuam. Migration aditiva (colunas nulas) e
  Word atualizado. Texto das perguntas copiado do guia do legado, sem dado de cliente.
- **Testes:** serviço sobre D1 real; tela jsdom; E2E; o importador de LIA aceita o modelo novo (`docs/modelos-importacao/lia.csv`).

### PR 2.2: RIPD como página com abas (D1)

- Abas Teste de Impacto, Conformidade, Armazenamento e Logs, no lugar do modal. Respostas em tabela própria; o conteúdo do hash não muda.
- Os campos hoje só na API (`technical_measures`, `residual_risk_level`, `dpo_recommendations`, `data_category_risk`) ganham edição.
- **Testes:** a aprovação existente continua válida depois da migration (teste de hash antes e depois); isolamento por projeto.

### PR 2.3: logs com antes e depois (D3)

- A trilha da atividade guarda o valor anterior e o novo dos campos não textuais; o RIPD e a LIA ganham `entity_type` e aba de logs.
- **Testes:** nenhum texto livre na trilha (teste que varre o `details`); a aba Logs mostra a linha do tempo.

---

## Fase 3: com D4 e D5

- **PR 3.1: CNPJ e responsável do fornecedor** (migration aditiva com CHECK `tipo = 'organizacao'`), na ficha, na lista e no modelo de importação de terceiros.
- **PR 3.2: mesclar ativos e parceiros:** rota que move os vínculos e inativa o duplicado, com confirmação, trilha e teste de isolamento.

---

## Fase 4: aceite e migração (do dono, com apoio meu)

| Passo | Quem | Entrega | Teste |
|---|---|---|---|
| 4.1 Rodar `docs/roteiro-aceite.md` em produção | Dono | Lista de falhas | Cada falha vira um PR meu |
| 4.2 Validar os mapeamentos jurídicos (botão na Referência jurídica) | Dono | Mapeamentos `validado_juridico` com o seu e-mail | A cobertura da LGPD muda |
| 4.3 Construir a exportação no legado (um CSV por entidade, cabeçalho de `docs/modelos-importacao/`) | Dono | CSVs da cliente fora do repositório | O importador lê sem recusar cabeçalho |
| 4.4 Ajustar o importador onde a planilha real não couber | Eu | PR pequeno | Amostra fictícia por entidade |
| 4.5 Importação por lote com relatório de reconciliação (lidos, aceitos, recusados, duplicados) | Eu, com o dono revisando | Relatório por lote, guardado fora do repositório | Contagens batem com o legado |
| 4.6 Backup do D1, importar a base da cliente, conferir uma amostra contra o legado | Dono | O "sim" da virada | Amostra conferida campo a campo |
| 4.7 Desligar o legado | Dono | Data decidida por você | A cliente opera uma semana só no n.privacy |

## Pendências de configuração (do dono; a trava de permissão do assistente as bloqueia)

`RESEND_API_KEY` no sentinela (`npx wrangler secret put RESEND_API_KEY --name n-sentinela`); exclusão de
`C:\Users\resper\worktrees` no antivírus; desmarcar "Require branches to be up to date" na regra "main protegida"; e as pendências
antigas do n.iso em `docs/plano-2026-10-fechamento.md` (H2, F2, F4, F5, T5).

## Ordem e critério de pronto

1. **Já:** PR 1.1 a 1.4, em levas de dois, e D1 a D6 respondidas.
2. **Depois das decisões:** PR 2.1 a 2.3 e 3.1 a 3.2.
3. **Em paralelo, do dono:** 4.1 e 4.3.
4. **Pronto** quando: o roteiro passa sem falha aberta, a base da cliente importa com a reconciliação conferida, e o legado está desligado.
