# F6: importação do legado (riscos, gaps, teste de impacto, ciclo, bases, RIPD e LIA com estrutura): plano

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam caixas `- [ ]`.

**Objetivo:** fechar a lacuna 8 do plano mestre (`docs/arquivo/planos/2026-10-14-legado-privacidade.md`): a "Importar programa" passa a trazer o que o legado
guarda e o n.360 já sabe receber depois das fases F1 a F3 (riscos e ações da atividade, teste de impacto, ciclo de vida, bases adicionais e
GDPR, RIPD e LIA com os campos de cada seção), por um caminho DETERMINÍSTICO (modelos de CSV de cabeçalho fixo, sem IA) além do caminho
por IA, e entrega o **relatório de reconciliação** por lote que o roteiro de virada exige para desligar o legado.

**Arquitetura:** a migration 0076 reconstrói só `importacao_itens` (CHECK de `entidade` com `risco`, `gap`, `impacto`, `ciclo`, `bases`, e a
coluna `aviso`). Esquemas estritos novos em `src/schemas/importacao.ts`; `gravarRisco`, `gravarGap`, `gravarImpacto`, `gravarCiclo`,
`gravarBases` em `src/services/importacao.ts` chamam os serviços da F1 a F3 (`salvarImpacto`, `criarRisco`/`criarAcao`, `salvarCiclo`,
`salvarBases`). Modelos de CSV em `src/services/importacao-modelos.ts`; reconciliação em `src/services/importacao.ts` e duas rotas GET em
`src/routes/importacao.ts`. Runbook de virada em `docs/runbook-migracao-legado.md`.

**Insumos:** plano mestre (restrições globais, "Migração do legado e desligamento", "Adequações para um projeto existente", parágrafo F6);
pesquisa de código (seção J e cenário 3); AGENTS.md (importação, fatias 1 a 4); moldes 0067 (rebuild de `importacao_itens`) e
`test/migration-0067.test.ts`; CSV com BOM da F4 (`src/services/exportacao.ts`).

## Decisões desta fase

| # | Decisão | Por quê |
|---|---|---|
| F6-a | 0076 reconstrói **só** `importacao_itens`, no molde da 0067: CHECK de `entidade` ganha `risco`, `gap`, `impacto`, `ciclo`, `bases`; coluna nova `aviso` (texto) | O CHECK só muda por rebuild. O aviso hoje só existe na resposta da confirmação; a reconciliação precisa contá-lo depois. Nenhuma tabela aponta para `importacao_itens` (o DROP não cascateia) e a cópia acontece antes do DROP |
| F6-b | **Nenhum tipo de arquivo novo.** Riscos, gaps, teste de impacto e ciclo vêm de arquivo `avaliacao` (a IA marca cada item com `tipo`, como já faz com `dpia`/`lia`); o modelo de CSV grava o tipo do arquivo como `inventario`, `terceiros` ou `avaliacao` e o nome do modelo em `modelo` | `importacao_arquivos.tipo` tem CHECK; reconstruir a tabela-mãe dos itens (ON DELETE CASCADE) sairia do escopo e arriscaria apagar itens |
| F6-c | Bases são **entidade própria** (`bases`: atividade, adicionais por texto ou id do catálogo, `base_gdpr`), não campos do tratamento | Precisam chegar também a atividade que já existe (delta, ou tratamento cadastrado à mão); campo do tratamento só valeria para o tratamento novo |
| F6-d | RIPD e LIA com estrutura: o `avaliacaoPropostaSchema` ganha campos opcionais (`necessidade`, `medidas`, `risco_residual` no RIPD; `finalidade_legitima`, `necessidade`, `balanceamento`, `salvaguardas` na LIA). Mesma entidade `dpia`/`lia` | O mínimo coerente: o arquivo antigo (só conclusão e riscos) continua válido; a LIA nasce em rascunho e a conclusão (`prevalece`) continua de uma pessoa |
| F6-e | Atividade casa por finalidade normalizada (`chave`); sem ela, `recusado`. Responsável por nome de pessoa (`partes` tipo pessoa); ativo/sistema por nome de `itens`. Não achou: **aviso**, sem criar pessoa nem item | A importação não inventa cadastro fora do tratamento (que já cria sistemas, áreas e pessoas que o revisor viu) |
| F6-f | Duplicata: risco por (atividade, ameaça); gap por (atividade, título); ciclo por (atividade, etapa); impacto pela atividade com teste já respondido. Duplicata nasce `descartado` | Mesmo padrão das fatias 1 a 4 |
| F6-g | **A importação nunca sobrescreve.** Impacto grava só as perguntas sem resposta; ciclo só a etapa sem linha; bases só acrescentam (a GDPR só se estiver vazia). Nada a gravar: `recusado` com o motivo. Teste de impacto não é finalizado pela importação | Não há como distinguir o que uma pessoa editou depois; o que já está no n.360 vence, e reimportar é idempotente |
| F6-h | Risco: notas 1 a 5 ou nível (`baixo`, `medio`, `alto`, `critico` vira 2x2, 3x3, 4x4, 5x5 com aviso); status `aceito` do legado entra como aberto com aviso (aceitar risco é ato de uma pessoa no n.360); prazo do risco vira ação ligada a ele (decisão D3 da pesquisa) | Uma regra de nível só (`riskLevel`); o aceite com o nome de quem confirmou a importação seria falso |
| F6-i | Texto livre de risco e ação (ameaça, vulnerabilidade, plano, título, descrição) passa por `mascararPii` (`[dado pessoal]`) nos dois caminhos; o arquivo `avaliacao` vai à IA também mascarado | Regra do plano: registro de origem não grava dado pessoal de titular |
| F6-j | Caminho determinístico: CSV (`;` ou `,`, com ou sem BOM) cujo cabeçalho é **exatamente** o conjunto de colunas de um modelo vira itens `pendente` de confiança alta, sem chamar a IA; `origem` é só "linha N do modelo" (nunca o texto). Modelos: tratamentos, terceiros, riscos, gaps, impacto, ciclo, bases, ripd, lia e pedidos (sem coluna de titular). Listas separadas por `|`; sim/não; datas AAAA-MM-DD | O caminho da migração não pode depender da IA. Revisão humana continua obrigatória |
| F6-k | Ordem da confirmação: tratamentos, documentos, depois riscos, gaps, impacto, ciclo e bases, depois o resto na ordem de chegada (terceiros, DPIA, LIA, histórico, como hoje). 30 itens por chamada e trava `gravando` como hoje | Riscos e ações precisam da atividade; a ação acha o risco gravado antes; a DPIA criada na mesma confirmação herda o teste de impacto e o ciclo |
| F6-l | Reconciliação: `GET .../importacoes/:id/reconciliacao` (JSON) e `.../reconciliacao/csv` (BOM, `;`, neutralização de fórmula de `exportacao.ts`). Por entidade: propostos, pendentes, aceitos, gravados, recusados, descartados, duplicatas, com aviso; motivos de recusa e avisos **genéricos** (texto entre aspas, ids, datas e e-mail/CPF/telefone trocados) agrupados com contagem. CSV com coluna "No legado (preencher)". Trilha `importacao.reconciliacao` só com contagens | Critério de aceite do roteiro de virada, sem dado pessoal |
| F6-m | Faixa `privacy`, só a equipe da consultoria (`ehEquipeNess`, já no router), fora do agente (POST/PUT/DELETE já em `FORA_DO_AGENTE`; GET cortado pelo papel) | Nada muda no corte de acesso |

## Tarefas

### F6.1: migration 0076 e schema
- [ ] `migrations/0076_importacao_legado.sql`, `test/migration-0076.test.ts` (banco da 0067 com itens de todas as entidades antigas: sobrevivem idênticos; entidades novas entram; fora da lista recusa; `aviso` nasce NULL; índices e cascata do lote), `schema.sql`, `migrations/README.md`.

### F6.2: esquemas e gravação
- [ ] `src/schemas/importacao.ts`: `riscoPropostoSchema`, `gapPropostoSchema`, `impactoPropostoSchema`, `cicloPropostoSchema`, `basesPropostasSchema`, campos novos do `avaliacaoPropostaSchema`; união do PUT de item.
- [ ] `src/services/importacao.ts`: entidades novas em `ESQUEMA`/`OBRIGATORIOS`/`NOME`/`SQL_EXISTENTES`; `gravarRisco`, `gravarGap`, `gravarImpacto`, `gravarCiclo`, `gravarBases`; RIPD/LIA estruturados; ordem; `aviso` gravado no item.
- [ ] `test/importacao-legado.test.ts`: grava cada entidade; atividade inexistente recusa; responsável/ativo inexistente vira aviso; duplicata descartada; reimportar não duplica nem sobrescreve; risco com nível e com prazo; aceite não importado; PII mascarado.

### F6.3: modelos de CSV
- [ ] `src/services/importacao-modelos.ts` (`MODELOS`, `modeloDoCabecalho`, `itensDoModelo`), chamado em `converter` antes da IA.
- [ ] `scripts/importacao-amostra.mjs` gera os modelos fictícios em `docs/modelos-importacao/`.
- [ ] Testes: CSV de modelo não chama a IA; linha inválida vira item recusado com a linha; `;` e `,`; BOM; aspas.

### F6.4: extração por IA
- [ ] `src/agents/importacao.ts`: prompt de avaliação com `risco`, `gap`, `impacto`, `ciclo` e os campos estruturados; classificação cita riscos, plano de ação, teste de impacto e ciclo de vida.
- [ ] Teste: item `risco` extraído de arquivo `avaliacao`; texto mascarado antes do modelo.

### F6.5: reconciliação
- [ ] `reconciliacao(db, projectId, loteId)` e CSV; rotas; teste (contagens, motivos genéricos sem nome nem e-mail, cliente 403, outro projeto 404, agente recusado).

### F6.6: tela
- [ ] `frontend/src/views/importacao.js`: abas "Riscos e ações" e "Impacto, ciclo e bases"; avaliações mostram os campos novos; botão "Reconciliação" com a tabela e "Exportar CSV"; texto dos modelos de CSV. Teste jsdom.

### F6.7: documentação e verificação
- [ ] `docs/runbook-migracao-legado.md` (checklist por cliente), `docs/README.md`, `AGENTS.md`, `CHANGELOG.md`, `migrations/README.md`.
- [ ] `npx tsc --noEmit`; `npx vitest run` completo; `cd frontend && npx vitest run`; `npm run build --prefix frontend`; `npm run openapi` sem diff.

## Pendências fora desta fase
- **Dono:** as exportações do legado (para conferir os nomes de coluna contra os modelos; até lá os modelos são o formato de chegada e a planilha do legado é ajustada a eles fora do repositório); validação jurídica do mapeamento de bases por texto.
- **Técnica:** homologações do legado (F5) e usuários não são importados (criação manual, com convite); incidentes e consentimentos seguem pela IA.
