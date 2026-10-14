# Migrations

Companheiro de [`backups/README.md`](../backups/README.md) (backup e restauração). O runbook do
incidente de agosto de 2026, quando a `d1_migrations` de produção divergia do repositório, foi
arquivado em [`docs/arquivo/reconciliacao-migrations-2026-08.md`](../docs/arquivo/reconciliacao-migrations-2026-08.md).

## Estado

- Última migration no repositório: **0071** (`ls migrations/*.sql | tail -1`). São 69 arquivos
  `.sql` (`ls migrations/*.sql | wc -l`): não existe 0001, há três 0002 de antes da numeração
  estável, e **não existem 0031 a 0033** (eram da camada MSP, que entrou por engano no #204 e
  saiu no #206).
- Produção sem migration pendente é condição de deploy: `.github/workflows/deploy.yml` roda
  `wrangler d1 migrations list niso-db --remote` e recusa publicar se a resposta não for
  "No migrations to apply". Confira você mesmo antes de afirmar o estado de produção.
- `ops/` guarda os dois SQL da reconciliação de 2026-08 (`reconcile-2026-08.sql` e
  `reconcile-2026-08-registro.sql`). Já foram executados; ficam como registro do que foi
  feito à mão no banco.

## Migration nova

1. Schema muda em **dois** lugares: `schema.sql` (índice depois da tabela) e a migration
   numerada. `*.sql` é sempre LF (`.gitattributes`).
2. Backup: `npm run db:backup` (ver `backups/README.md`).
3. Aplicar: `npx wrangler d1 migrations apply niso-db --remote` (antes do merge) ou, depois do
   merge, o workflow manual `db-migrate.yml`. O workflow só roda na `main` (o ambiente `production`
   não aceita outra branch), onde a migration nova só existe depois do merge; o deploy do merge
   recusa de propósito, então rode *Deploy* em seguida.
4. Conferir: `npx wrangler d1 migrations list niso-db --remote` responde "No migrations to
   apply" e `PRAGMA table_info(<tabela>)` mostra a coluna.
5. Só então o merge: o deploy recusa migration pendente.

**Registrar sem executar.** Quando produção já tem o objeto (coluna criada à mão, por
exemplo) e o `ADD COLUMN` abortaria com "duplicate column", a migration não é executada: só se
registra o nome em `d1_migrations` (`INSERT OR IGNORE INTO d1_migrations (name) VALUES (...)`),
antes do merge. É o caso da 0035, abaixo.

A 0011 já foi aplicada e teve o conteúdo trocado por `SELECT 1;` em 2026-10-06: semeava dado de
cliente. O arquivo fica porque `d1_migrations` guarda o nome.

---

## 0035 — assinaturas da análise crítica (F10, 2026-10-01)

`management_reviews` em produção já tem `ciso_signed_by/at/ip` e
`ceo_signed_by/at/ip` (confirmado por `pragma_table_info` em 2026-10-01); nem o
`schema.sql` nem as migrations as declaravam. O `schema.sql` agora as traz, e a
`0035_management_reviews_assinaturas.sql` leva o mesmo DDL a bancos antigos.

**Em produção a 0035 NÃO é executada** (`ADD COLUMN` não é idempotente: abortaria
com "duplicate column"). Só se registra, e o deploy deixa de ver migration pendente:

```powershell
npx wrangler d1 execute niso-db --remote --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0035_management_reviews_assinaturas.sql');"
npx wrangler d1 migrations list niso-db --remote   # esperado: "No migrations to apply"
```

Ordem: registrar **antes** do merge, porque `deploy.yml` recusa migration pendente.

---

## 0036 — organização comercial (propostas, fatia 1, 2026-10-02)

Adiciona a `organizations` as colunas `cnpj`, `cor_destaque`, `selo_niso`,
`prefixo_proposta`, `proximo_numero`, `config_preco`, `textos` e
`secoes_desligadas`; `org_id` (default `org_ness`) a `leads`, `assessments`,
`proposals` e `contracts`; e semeia a linha `org_ness`. Conferido em produção em
2026-10-02 por `pragma_table_info`: nenhuma dessas colunas existia e
`organizations` estava vazia.

**Diferente da 0035, esta RODA em produção** (as colunas ainda não existem).
`org_id` não tem `REFERENCES`: o SQLite não aceita `ADD COLUMN` com FK e default
não nulo, e `schema.sql` e migration precisam do mesmo DDL.

Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db --remote`
→ `npx wrangler d1 migrations list niso-db --remote` (esperado: "No migrations to
apply") → merge, porque `deploy.yml` recusa migration pendente. Entre aplicar a 0045 e publicar o código novo,
as rotas do auditor do código antigo respondem 500 (a coluna `token` não existe mais); sem efeito com 0
tokens em produção, mas aplique e publique em seguida.

---

## 0038 — tabelas da proposta (propostas, fatia 3, 2026-10-02)

Cria `propostas` e `proposta_itens` (tabelas novas, com índices) e preenche
`organizations.textos` da `org_ness` com os textos iniciais (sobre, como
trabalhamos, premissas, termos, pagamento) só nas chaves ausentes ou vazias:
`json_patch` com o que já existe vencendo, então nada que a consultoria já
escreveu é sobrescrito e `termos` sempre fica preenchido. Conferido em produção em 2026-10-02, só por leitura: as duas tabelas
não existiam e `textos` da `org_ness` era `NULL`.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0039 — envio, aceite e contrato da proposta (fatia 4, 2026-10-02)

`ALTER TABLE ... ADD COLUMN` em três tabelas existentes: `propostas` (token_hash,
envio, visualização, aceite, recusa, ajuste, `contrato_id`, `projeto_id`),
`contracts` (`proposta_id`, `documento_hash`, valores, `servicos`, `projeto_id`)
e `projects` (`proposta_id`), mais os índices únicos parciais `idx_propostas_token`
e `idx_contracts_proposta` (este último é a última defesa contra dois contratos
da mesma proposta). Conferido em produção em 2026-10-02, só por leitura
(`pragma_table_info`): nenhuma das colunas novas existia nas três tabelas.
`ALTER ADD COLUMN` com `CHECK` (`aceite_origem`) é aceito pelo SQLite do D1.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0040 — multiconsultoria (fatia 5, 2026-10-02)

`ALTER TABLE ... ADD COLUMN`: `users.org_id` e `projects.org_id`, ambos
`TEXT NOT NULL DEFAULT 'org_ness'` e sem `REFERENCES` (como nas tabelas
comerciais: `ALTER` não aceita FK com default). O DEFAULT é o backfill: toda
conta e todo projeto existentes passam a ser da ness. `organizations` ganha
`termo_aceito_em`, `termo_versao` e `logo_chave`. Índices `idx_users_org` e
`idx_projects_org`, e o índice ÚNICO parcial `idx_organizations_prefixo`
(`prefixo_proposta`, `WHERE prefixo_proposta IS NOT NULL`): violação vira 409
na criação de organização e em `PUT /org/config`. Conferido em produção em
2026-10-02, só por leitura (`pragma_table_info`): nenhuma das cinco colunas
existia; e nenhum prefixo repetido entre organizações (`GROUP BY
prefixo_proposta HAVING COUNT(*) > 1` vazio), senão o índice falharia.

Depois de aplicar, a conferência é `SELECT COUNT(*) FROM users WHERE org_id <>
'org_ness'` e o mesmo em `projects`: as duas têm de dar 0.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0041 — pedidos de aprovação e ciência (acesso de stakeholders, fatia 2, 2026-10-04)

Cria duas tabelas novas, com índices: `pedidos` (um por documento/ação, com
`org_id` e `project_id`, o conteúdo congelado em `conteudo_json` e o SHA-256
dele em `hash`; `status` em `aberto|aprovado|recusado|substituido|cancelado`,
`substituido_por` aponta o pedido que nasceu quando o documento mudou) e
`pedido_destinatarios` (uma linha por pessoa, com a prova da decisão:
`decidido_em`, `canal`, `ip`, `user_agent`, `hash_lido`, `mfa_usado`, `motivo`;
`token_hash` fica para a fatia 3, com índice único parcial). `tipo` aceita só
`dpia` por enquanto (CHECK): tipo novo exige migration. Só `CREATE ... IF NOT
EXISTS`, nenhuma tabela existente é alterada.

Conferência depois de aplicar: `PRAGMA table_info(pedidos)` e
`PRAGMA table_info(pedido_destinatarios)` mostram as colunas acima.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0042 — ciência por link com código (acesso de stakeholders, fatia 3, 2026-10-04)

Rebuild de `pedidos` e `pedido_destinatarios` (exige a 0041 aplicada antes).
`pedidos.tipo` passa a aceitar `politica` (ref_id = `compliance_controls.id`):
CHECK só muda por rebuild no SQLite. `pedido_destinatarios` ganha `aberto_em`
(painel: "não abriu") e `token_expira_em` (o link pessoal vence em 30 dias;
reenviar emite outro). Trigger `pedido_dest_prova_imutavel`: linha com
`status <> 'pendente'` não aceita UPDATE (DELETE não é bloqueado: apagar o
projeto apaga os pedidos em cascata).

Ordem do rebuild, para não perder linha: com FK ativa, `DROP TABLE pedidos`
faz DELETE implícito e o `ON DELETE CASCADE` apagaria os destinatários. Por
isso as tabelas novas nascem ligadas entre si (`pedido_destinatarios_new` ->
`pedidos_new`), a filha antiga cai primeiro, depois a mãe, e o `RENAME`
reescreve a FK da filha para `pedidos`. `test/migration-0042.test.ts` prova
sobre o banco da 0041 com linhas: nada some e a FK aponta para `pedidos`.

Conferência depois de aplicar:
`SELECT COUNT(*) FROM pedido_destinatarios` igual ao de antes,
`PRAGMA table_info(pedido_destinatarios)` com `aberto_em` e `token_expira_em`,
`PRAGMA foreign_key_list(pedido_destinatarios)` apontando para `pedidos`.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0043 — pedido imutável (acesso de stakeholders, fatia 5, 2026-10-05)

Só cria o trigger `pedido_prova_imutavel` (`BEFORE UPDATE ON pedidos`); nenhuma
tabela ou linha muda. O trigger recusa mudar `hash`, `conteudo_json`, `tipo`,
`ref_id` e `papel_exigido` em qualquer pedido, e `status`/`substituido_por` em
pedido fechado (`status <> 'aberto'`). Continua permitido: o pedido aberto
virar `substituido` (com `substituido_por`), `cancelado`, `aprovado` ou
`recusado`, e mudar `org_id` (transferência de projeto). DELETE não é
bloqueado: apagar o projeto apaga os pedidos em cascata.
`test/migration-0043.test.ts` aplica 0041, 0042 e 0043 sobre linhas e confere
as regras, também contra o `schema.sql`.

Conferência depois de aplicar:
`SELECT name FROM sqlite_master WHERE type='trigger' AND name='pedido_prova_imutavel'`
devolve uma linha.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1
migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db
--remote` (esperado: "No migrations to apply") → merge, porque `deploy.yml`
recusa migration pendente.

## 0044 — IP e user agent das aprovações (fatia 0, 2026-10)

As 12 colunas `*_approved_ip/ua` de `compliance_controls`, `evidence` e `ropa_records` existem
em produção e no `schema.sql`, mas nenhuma migration as criava. A 0044 leva o DDL a banco novo.
Produção (`niso-db`) tem as 12 colunas (conferido por `pragma_table_info` em 2026-10-07).

**Em produção a 0044 NÃO é executada** (abortaria com "duplicate column"). Só se registra, antes
do merge:

    npx wrangler d1 execute niso-db --remote --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0044_aprovacao_ip_ua.sql');"
    npx wrangler d1 migrations list niso-db --remote   # esperado: "No migrations to apply"

## 0045 — token do auditor em hash e revogável (fatia de jornada, P5, 2026-10)

`auditor_tokens.token` vira `token_hash` (SHA-256 do token do link; o índice `idx_auditor_tokens`
acompanha o RENAME) e ganha `revoked_at` e `revoked_by`. As notas (`auditor_notes.auditor_token`)
passam a guardar o id do token, não o token. Os tokens existentes são apagados: SQLite não calcula
SHA-256, então token em claro não migra. Em 2026-10-07 a tabela tinha 0 linhas em produção.

Conferência antes de aplicar: `SELECT COUNT(*) FROM auditor_tokens` (se não for 0, avise a
consultoria: esses links deixam de abrir). Depois: `PRAGMA table_info(auditor_tokens)` mostra
`token_hash`, `revoked_at` e `revoked_by`, e não mostra `token`.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db
--remote` → `npx wrangler d1 migrations list niso-db --remote` (esperado: "No migrations to apply")
→ merge, porque `deploy.yml` recusa migration pendente.

---

## 0046 — avisos de prazo (2026-10)

Cria `avisos_prazo` (uma linha por fonte, item, marco, pessoa e vencimento; `UNIQUE(fonte, item_id,
marco, user_id, vence_em)`) e o índice `idx_avisos_prazo_email`. Só `CREATE ... IF NOT EXISTS`,
nenhuma tabela existente muda.

Conferência depois de aplicar: `PRAGMA table_info(avisos_prazo)` mostra `id, project_id, fonte,
item_id, marco, user_id, vence_em, titulo, criado_em, email_enviado_em`.

**Esta RODA em produção.** Hoje a produção está na 0044: a 0045 ainda não foi aplicada, então
`migrations apply` aplicará a 0045 e a 0046 juntas. Ordem: `npm run db:backup` (antes) → `npx wrangler
d1 migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` (esperado:
"No migrations to apply") → merge, porque `deploy.yml` recusa migration pendente. O cron novo (`0 11 * * *`) entra com o deploy;
sem a tabela, a rotina registraria falha em todo item.

---

## 0047 — núcleo do n.privacy, fatia 1.1 (2026-10)

Cria `projeto_modulos`, `departamentos`, `partes` e `parte_vinculos`, acrescenta
`organizations.modulos_contratados` (padrão `["iso"]`) e o gatilho `projeto_modulo_iso_padrao`. Os
projetos que já existem recebem o módulo `iso`. Só `CREATE ... IF NOT EXISTS` e um `ALTER ... ADD COLUMN`
(não idempotente: aplicar duas vezes falha com "duplicate column"). Nenhuma tabela existente perde dado.

Conferência depois de aplicar: `PRAGMA table_info(partes)` mostra `id, project_id, tipo, nome, email,
user_id, status, created_at, updated_at`; `SELECT modulo, count(*) FROM projeto_modulos GROUP BY modulo`
mostra `iso` com a contagem de `projects`; `PRAGMA table_info(organizations)` lista `modulos_contratados`.

**Esta RODA em produção.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db
--remote` → `npx wrangler d1 migrations list niso-db --remote` (esperado: "No migrations to apply") →
merge, porque `deploy.yml` recusa migration pendente.

## 0049 — responsável aponta para a parte, fatia 1.3 (2026-10)

Cinco `ALTER TABLE ... ADD COLUMN ... REFERENCES partes(id) ON DELETE SET NULL`: `risks.owner_parte_id`,
`compliance_controls.owner_parte_id`, `ropa_records.owner_parte_id`, `corrective_actions.assigned_to_parte_id`
e `checklist_progress.assigned_to_parte_id`. O texto do responsável fica onde está. Sem carga: quem liga
texto a parte é `POST /api/v1/projects/:projectId/partes/importar` e `.../partes/conciliar`, por projeto.
ADD COLUMN não é idempotente: aplicar duas vezes falha com "duplicate column". Nenhuma linha muda.

Conferência depois de aplicar: `PRAGMA table_info(risks)` lista `owner_parte_id` (e igual nas outras quatro).

**Esta RODA em produção, aditiva, sem janela.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations
apply niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` → merge.

## 0050 — documentos e versões, fatia 3.1 (2026-10)

Cria `documentos` e `documento_versoes` (duas tabelas e quatro índices, todos `IF NOT EXISTS`). Sem carga e sem
`ALTER`: nenhuma tabela existente muda e nenhuma linha é copiada. As políticas que já existem entram por
`POST /api/v1/projects/:projectId/documentos/importar`, por projeto e repetível, porque o hash SHA-256 não se
calcula em SQLite. Os índices parciais `idx_doc_versao_vigente` e `idx_doc_versao_rascunho` garantem uma versão
vigente e um rascunho, no máximo, por documento.

Conferência depois de aplicar: `PRAGMA table_info(documentos)` e `PRAGMA table_info(documento_versoes)` listam as
colunas; `SELECT count(*) FROM documentos` devolve 0 até a importação. Depois do `importar`, o esperado em produção é
**um documento por controle que já tenha versão de política** (medido em 09/10/2026: 4 controles, 9 versões).

**Esta RODA em produção, aditiva, sem janela.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply
niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` → merge.

## 0051 — pedidos aceitam `documento` e canal `portal`, fatia 3.3 (2026-10)

**Reconstrói `pedidos` e `pedido_destinatarios`**, que são PROVA (ciência e aprovação com hash, IP e user-agent), para
ampliar dois CHECKs: `pedidos.tipo` ganha `documento` e `pedido_destinatarios.canal` ganha `portal`. Mesmo molde da 0042:
as duas tabelas novas nascem ligadas entre si, a filha antiga cai primeiro, o `RENAME` reescreve a FK, e os **dois
triggers** de prova (0042 e 0043, que o `DROP TABLE` leva junto) e os índices são recriados no fim. Acrescenta o índice
único parcial `idx_pedidos_portal_aberto` (um pedido "em pé" aberto do portal por documento).

**Antes de aplicar em produção** (a 0042 já avisava de deriva): conferir `PRAGMA table_info(pedidos)` e
`PRAGMA table_info(pedido_destinatarios)` contra o `schema.sql` (16 colunas na filha), anotar `SELECT count(*)` de cada
tabela e de `pedido_destinatarios WHERE status <> 'pendente'`, e rodar `npm run db:backup`. **Depois:** as contagens iguais,
`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('pedidos','pedido_destinatarios')` devolvendo os
dois triggers e `PRAGMA foreign_key_list(pedido_destinatarios)` apontando para `pedidos`.

**Ordem de rollout:** 0050 → `POST /projects/:id/documentos/importar` em cada projeto → 0051 → merge/deploy. Sem o
`importar`, o portal `/politicas` fica vazio (ele só lista documento com versão vigente). Hoje, em produção, `pedidos` não tem
pedido de política e `policy_acknowledgments` não tem linha (medido em 09/10/2026), então não há prova de política a perder.

## 0052 — exceções a documentos, fatia 3.5 (2026-10)

Cria `documento_excecoes` (uma tabela e dois índices, `IF NOT EXISTS`). Sem carga e sem `ALTER`: nenhuma tabela existente muda.
A aprovação da exceção não tem coluna: é um pedido `tipo = 'excecao'`, valor que a 0051 já aceita no CHECK de `pedidos.tipo`
(por isso a 0052 **depende da 0051**; sem ela o pedido de aprovação de exceção falha no CHECK).

Conferência depois de aplicar: `PRAGMA table_info(documento_excecoes)` lista as 12 colunas e `SELECT count(*) FROM documento_excecoes`
devolve 0. **Esta RODA em produção, aditiva, sem janela.** Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db
--remote` → `npx wrangler d1 migrations list niso-db --remote` → merge. Rollout completo da fase 3: 0050 → `documentos/importar` →
0051 → 0052 → merge/deploy.

## 0053 — catálogo de requisitos, fatia 2 (2026-10)

Cria `requisito_fontes`, `requisitos`, `requisito_mapeamentos` e `documento_requisitos` (todas `IF NOT EXISTS`, sem carga) e
acrescenta `compliance_controls.requisito_id` (anulável, `ON DELETE SET NULL`). O catálogo é global, sem `project_id`. O seed
(ISO 27001:2022, ISO 27701:2025, depois LGPD e GDPR) é feito por `POST /api/v1/requisitos/semear`, idempotente e que nunca
sobrescreve o que um administrador editou. O `ALTER ... ADD COLUMN` não é idempotente: aplicar duas vezes falha com "duplicate column".

Conferência depois de aplicar: `PRAGMA table_info` das quatro tabelas e de `compliance_controls` (a coluna `requisito_id`), e
`SELECT count(*)` das quatro tabelas, que devolve 0 até o seed. **Esta RODA em produção, aditiva, sem janela.** Ordem:
`npm run db:backup` → `npx wrangler d1 migrations apply niso-db --remote` → `migrations list` → seed → merge.

## 0054 — ligações do tratamento, fatia 4 (2026-10)

Acrescenta `ropa_records.base_legal_id` (anulável, `ON DELETE SET NULL`, aponta para `requisitos`) e cria `tratamento_itens`,
`tratamento_departamentos` e `tratamento_transferencias` (`IF NOT EXISTS`, todas com `project_id`). Sem carga: nenhuma linha existente
muda. As partes do tratamento NÃO têm tabela: usam `parte_vinculos` (`alvo_tipo = 'tratamento'`, que a 0047 já aceita). O `ALTER ... ADD
COLUMN` não é idempotente. Conferência: `PRAGMA table_info` das três tabelas e de `ropa_records`, e `SELECT count(*)` das três (0).
Depende da 0053 (a FK de `base_legal_id`).

## 0055 — pedidos aceitam `tratamento`, fatia 4 (2026-10)

Reconstrói `pedidos` e `pedido_destinatarios` (PROVA) no molde da 0051 para o CHECK de `pedidos.tipo` aceitar `tratamento` e, de uma
vez, `avaliacao_terceiro` (fatia 6; reconstruir a tabela de prova de novo só por um valor seria risco sem ganho). Preserva todas as
linhas, recria os 2 triggers de prova e os 5 índices. **Antes de aplicar:** `npm run db:backup`, `PRAGMA table_info(pedidos)` e
`(pedido_destinatarios)` iguais ao `schema.sql`, e as contagens das duas tabelas; **depois:** as mesmas contagens, os triggers
(`pedido_prova_imutavel`, `pedido_dest_prova_imutavel`) e os índices em `sqlite_master`. **Esta RODA em produção.** Depende da 0051.

## 0056 — DPIA ligada ao tratamento e LIA, fatia 5 (2026-10)

Cria `lia_assessments` e três triggers que dão a `dpia_assessments.ropa_id` o efeito de uma FK `ON DELETE SET NULL` **que confere o
projeto** (a tabela não é reconstruída: tem assinatura e deriva histórica, ver 0013). Antes, um `UPDATE` zera `ropa_id` que aponta para
registro inexistente (só esse caso). **Antes de aplicar:** `npm run db:backup` e conferir
`SELECT count(*) FROM dpia_assessments WHERE ropa_id IS NOT NULL AND ropa_id NOT IN (SELECT id FROM ropa_records)` (referência morta que
a migration vai zerar) e
`SELECT count(*) FROM dpia_assessments d JOIN ropa_records r ON r.id = d.ropa_id WHERE r.project_id IS NOT d.project_id` (de OUTRO
projeto: a migration não toca, trate à mão). **Depois:** os 3 triggers em `sqlite_master`, `PRAGMA table_info(lia_assessments)` e
as contagens iguais. **Esta RODA em produção.** Depende da 0054 (a DPIA aponta para o registro do RoPA).

## 0057 — terceiros tipificados, fatia 6 (2026-10)

Acrescenta `partes.terceiro_tipo` (anulável, com CHECK) e cria `avaliacoes_terceiro` e `documento_partes` (`IF NOT EXISTS`, todas com
`project_id`). Sem carga e sem tocar linha existente. O `ALTER ... ADD COLUMN` não é idempotente. Conferência: `PRAGMA table_info` das
duas tabelas e de `partes` (a coluna `terceiro_tipo`), e `SELECT count(*)` das duas tabelas (0). Depende da 0050 (`documentos`) e da 0047
(`partes`). **Esta RODA em produção, aditiva, sem janela.**

## 0058 — titular, incidente e consentimento, fatia 7 (2026-10)

Cria `parametros_legais` (global), `titular_pedidos`, `incidentes` e `consentimentos` (`IF NOT EXISTS`). **Sem carga: nenhum valor de prazo
legal é semeado** — o administrador da plataforma cadastra cada prazo, com fonte e data de revisão, pela tela Prazos legais. Enquanto não
houver valor, o prazo do pedido e do incidente fica nulo ("não calculado") e os avisos dessas fontes não disparam. Conferência:
`PRAGMA table_info` das quatro tabelas e `SELECT count(*)` de cada (0, inclusive `parametros_legais`). Depende da 0054 (`ropa_records` já
existe) e da 0047 (`partes`). **Esta RODA em produção, aditiva, sem janela.**

## 0059 — evidência com validade e requisito, fatia 8 (2026-10)

Acrescenta `evidence.valido_ate` (anulável) e cria `evidencia_requisitos` (`IF NOT EXISTS`, com `project_id`). Sem carga e sem tocar linha
existente: toda evidência de hoje fica sem validade, então a rotina diária não muda nenhuma. O `ALTER ... ADD COLUMN` não é idempotente.
Conferência: `PRAGMA table_info(evidence)` (coluna `valido_ate`), `PRAGMA table_info(evidencia_requisitos)`, `SELECT count(*)` da tabela nova (0)
e `SELECT count(*) FROM evidence WHERE valido_ate IS NOT NULL` (0). Depende da 0053 (`requisitos`). **Esta RODA em produção, aditiva, sem janela.**

## 0060 — módulo inicial pelo contrato da organização (2026-10)

Troca o gatilho `projeto_modulo_iso_padrao` (0047, sempre `iso`) por `projeto_modulos_do_contrato`: o projeto NOVO nasce com o que a
organização contratou (`organizations.modulos_contratados`); contrato vazio ou JSON inválido cai em `iso`. Nenhum projeto existente
muda. Conferência: `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'projeto_modulo%'` (só o novo) e a contagem de
`projeto_modulos` por módulo igual à de antes. **Esta RODA em produção, sem janela.** Depende da 0047.

## 0061 — fornecedor e terceiro são a mesma parte (2026-10)

Acrescenta `vendors.parte_id` (FK para `partes`, `ON DELETE CASCADE`) e o índice único `idx_vendors_parte`. Carga: cada vendor ganha a
parte organização do projeto de mesmo nome (`lower(trim())`; espaço interno repetido não é colapsado) ou uma parte nova, e o vínculo
`terceiro` no projeto. Vendor repetido no projeto (mesmo nome normalizado): o mais antigo fica com a parte, cada repetido ganha parte
própria (`id = 'vendor-' || vendors.id`), senão o índice único abortaria. Gatilhos: `vendor_perfil_do_terceiro` (vínculo `terceiro` no
projeto cria o perfil em `vendors`) e `vendor_nome_da_parte` (renomear a parte renomeia o perfil). O `ALTER ... ADD COLUMN` não é
idempotente. Conferência: `PRAGMA table_info(vendors)` (coluna `parte_id`), `SELECT count(*) FROM vendors WHERE parte_id IS NULL AND
project_id IS NOT NULL` (0) e os dois gatilhos em `sqlite_master`. Antes de aplicar, vale olhar os repetidos:
`SELECT project_id, lower(trim(name)), count(*) FROM vendors GROUP BY 1, 2 HAVING count(*) > 1`, e os órfãos (vendor de projeto que
não existe mais fica fora da carga, com `parte_id` NULL):
`SELECT id, project_id FROM vendors v WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = v.project_id)`. Organização já tipada
como terceiro (`partes.terceiro_tipo` não nulo) ganha o vínculo `terceiro` e o perfil em `vendors`. A conferência de nulos passa a ser
`SELECT count(*) FROM vendors v WHERE parte_id IS NULL AND EXISTS (SELECT 1 FROM projects p WHERE p.id = v.project_id)` (0).
**Esta RODA em produção, sem janela.**
Depende da 0047 (`partes`).

## 0062 — o DPO da governança é o encarregado (2026-10)

Só dados, sem DDL. Para cada membro de `project_governance` que é DPO (`role_category = 'dpo'` ou cargo com "dpo"/"encarregad"), acha a parte pessoa do
projeto por e-mail ou nome (`lower(trim())`) ou cria uma, e grava o vínculo `encarregado` no projeto (`INSERT OR IGNORE` sobre a UNIQUE, `NOT EXISTS`
na parte: aplicar duas vezes não duplica). O `LIKE '%dpo%'` é mais largo que o regex do código (`EH_DPO`): casa "dpo" dentro de outra palavra, o que
não existe em cargo hoje. Daqui em diante `POST /projects/:id/governance` faz o mesmo no momento da gravação. Conferência antes:
`SELECT project_id, name, job_title FROM project_governance WHERE role_category = 'dpo' OR lower(job_title) LIKE '%dpo%' OR lower(job_title) LIKE '%encarregad%'`;
órfãos (governança de projeto que não existe mais fica fora da carga, senão a FK de `partes` abortaria): `SELECT g.id, g.project_id FROM project_governance g WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = g.project_id)`. Membros DPO repetidos no projeto (mesmo e-mail ou nome) viram uma parte só; havendo e-mail, o vínculo vai para a parte do e-mail, e o nome só vale sem e-mail ou sem parte com aquele e-mail. Conferência depois: `SELECT count(*) FROM parte_vinculos WHERE papel = 'encarregado' AND alvo_tipo = 'projeto'` deve ser igual ou maior que o número de projetos
com DPO. **Esta RODA em produção, sem janela.** Depende da 0047 (`partes`).

## 0063 — CAPA nasce do incidente (2026-10)

Acrescenta `corrective_actions.incidente_id` (anulável, FK para `incidentes`, `ON DELETE SET NULL`) e o índice `idx_capa_incidente`. Sem carga e sem
tocar linha existente. O `ALTER ... ADD COLUMN` não é idempotente: aplicar duas vezes falha com "duplicate column". Conferência depois de aplicar:
`PRAGMA table_info(corrective_actions)` lista `incidente_id`. Depende da 0058 (`incidentes`). **Esta RODA em produção, aditiva, sem janela.**
Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` → merge.

## 0064 — importação de programa de privacidade (2026-10)

Cria `importacoes`, `importacao_arquivos` e `importacao_itens` (com seus índices). Aditiva: só `CREATE ... IF NOT EXISTS`, nenhum dado existente
muda, nada para carregar. Conferência depois de aplicar: `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'importacao%'` devolve as
três, `PRAGMA table_info(importacao_itens)` lista as colunas do item (`dados`, `decisao`, `registro_id`) e `PRAGMA table_info(importacao_arquivos)`
traz as do processamento em passos (`blocos_total`, `bloco_atual`, `blocos_falhos`). Para desfazer: nada a reverter nos dados
existentes; as tabelas novas podem ficar vazias. **Esta RODA em produção, aditiva, sem janela.**
Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` → merge.

## 0065 — a ness. contrata o n.privacy (2026-10-11)

Só dados, sem DDL e sem mudança no `schema.sql`. O dono da plataforma aprovou em 2026-10-11 a contratação do n.privacy pela organização ness.:
`UPDATE organizations SET modulos_contratados = '["iso","privacy"]' WHERE id = 'org_ness' AND modulos_contratados = '["iso"]'`. Idempotente: só
troca o valor padrão `["iso"]`; outro valor (ajustado à mão) fica como está, e aplicar de novo não muda nada. Projetos já existentes não ganham o
módulo sozinhos (o teto sobe; habilitar continua sendo da tela de módulos), mas projeto NOVO da ness. passa a nascer com `iso` e `privacy` (gatilho da 0060). Conferência depois de aplicar:
`SELECT modulos_contratados FROM organizations WHERE id = 'org_ness'` devolve `["iso","privacy"]`. Para desfazer: o mesmo `UPDATE` com os valores
trocados. **Esta RODA em produção, sem janela.**
Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` → merge.

## 0066 — módulos por pessoa (2026-10-12)

n.360, fatia 3. Cria `usuario_modulos` (PK `user_id, modulo`; `modulo` só `iso` ou `privacy`), o gatilho `usuario_modulos_padrao` (conta nova recebe o
padrão: cliente, os módulos do projeto; equipe, o contrato da organização) e **normaliza os papéis legados** em `users`: `admin`→`platform_admin`,
`consultant`→`consultor`, `client_admin`→`client`, `user`/`employee`→`org_user`. A carga inicial dá a cada conta o que ela já usa: cliente
(`org_admin`, `org_user`, `client`) os módulos do projeto; equipe (`consultor`, `consultoria_admin`, `comercial`) o contrato da organização (vazio ou
ilegível, `iso`). `platform_admin` e `stakeholder` não ganham linha. **Repetível:** `CREATE ... IF NOT EXISTS`, `UPDATE` e `INSERT OR IGNORE`
idempotentes; rodar de novo **restaura os padrões** das contas sem linha (o que alguém revogou volta se o padrão o incluir). **Precisa rodar DEPOIS
da 0065** (a equipe da ness. herda `["iso","privacy"]` do contrato; antes dela, só `iso`). Conferência depois de aplicar:
`SELECT role, count(*) FROM users GROUP BY role` não lista `admin`, `consultant`, `client_admin`, `user` nem `employee`, e
`SELECT count(*) FROM usuario_modulos` devolve **18 em produção** (5 consultores × 2 módulos + 8 `org_admin` × 1). Para desfazer: nada a reverter nos
papéis (o mapa de `src/middleware/auth.ts` aceita os dois nomes); a tabela pode ficar. **Esta RODA em produção, sem janela:** o código novo exige o
módulo da pessoa, então a migration vai ANTES do deploy.
Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` → merge.

## 0067 — importação de terceiros (2026-10-12)

Importação de programa, fatia 2. Rebuild de `importacao_itens` (CHECK só muda por rebuild no SQLite): `entidade` passa a aceitar `terceiro` e, de
uma vez, as entidades das fatias 3 e 4 (`documento`, `dpia`, `lia`, `titular_pedido`, `incidente`, `consentimento`; o código ainda só grava
`tratamento` e `terceiro`), para as próximas fatias não reconstruírem a tabela de novo; e
`duplicata_de` e `registro_id` perdem a FK para `ropa_records` (num item `terceiro` apontam para `partes`; a coluna guarda o id do registro conforme a
entidade, como `parte_vinculos.alvo_id`). Nenhuma tabela aponta para `importacao_itens`, então o `DROP` não cascateia; as FKs dela para lote,
arquivo e projeto seguem iguais e os três índices são recriados. `test/migration-0067.test.ts` prova sobre o banco da 0064 com linhas: nada some,
as oito entidades entram, entidade fora da lista é recusada, a cascata do lote continua. **Precisa da 0064 aplicada. NÃO é idempotente**
(rebuild: `CREATE TABLE importacao_itens_new` sem `IF NOT EXISTS`); aplicar só uma vez, pelo `migrations apply`. Conferência antes: `SELECT COUNT(*)
FROM importacao_itens`; depois: a mesma contagem, `SELECT sql FROM sqlite_master WHERE name = 'importacao_itens'` com `'terceiro'` no CHECK e
`PRAGMA foreign_key_list(importacao_itens)` só com `importacoes`, `importacao_arquivos` e `projects`. Para desfazer: não precisa (o código anterior
só grava `tratamento`, que a tabela nova aceita). **Esta RODA em produção, sem janela:** o código novo grava `entidade = 'terceiro'`, então a
migration vai ANTES do deploy.
Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` → merge.

---

## 0068 — evidência ligada a documento (2026-10-12)

Importação de programa, fatia 3. `evidence.documento_id` (FK para `documentos`, `ON DELETE SET NULL`) e o índice `idx_evidence_documento`:
o arquivo original de um documento importado fica guardado como evidência ligada a ele. Coluna nova e nula, nada muda nas linhas que
existem. `test/migration-0068.test.ts` prova sobre a `evidence` antiga com linha: a linha fica, a coluna e o índice entram, apagar o
documento só solta a ligação. **NÃO é idempotente** (`ADD COLUMN` aborta com "duplicate column"): aplicar uma vez, pelo
`migrations apply`. Conferência depois: `PRAGMA table_info(evidence)` com `documento_id`. Para desfazer: não precisa (o código anterior
não lê a coluna). **Esta RODA em produção, sem janela:** o código novo grava `documento_id`, então a migration vai ANTES do deploy.
Ordem: `npm run db:backup` → `npx wrangler d1 migrations apply niso-db --remote` → `npx wrangler d1 migrations list niso-db --remote` → merge.

---

## 0069 — riscos do tratamento no RoPA (2026-10-12)

`ropa_records.dados_sensiveis` e `ropa_records.criancas_adolescentes` (`INTEGER NOT NULL DEFAULT 0`): os riscos de LGPD art. 11 (dados
sensíveis) e art. 14 (crianças e adolescentes), marcados na seção "Riscos do tratamento" do formulário, no relatório do RoPA e na
importação (planilha e programa). Colunas novas com default 0, nada muda nas linhas que existem. `test/migration-0069.test.ts` prova sobre a
`ropa_records` antiga com linha: a linha fica, as duas colunas entram com 0. **NÃO é idempotente** (`ADD COLUMN` aborta com "duplicate
column"): aplicar uma vez. Conferência depois: `PRAGMA table_info(ropa_records)` com as duas colunas. Para desfazer: não precisa (o código
anterior não lê as colunas, e o default cobre o INSERT dele). **Esta RODA em produção**, e pode rodar depois do merge: o código anterior
convive com as colunas novas, e o deploy do merge recusa enquanto ela estiver pendente.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

---

## 0070 — papel do agente remoto (2026-10-13)

`agente_concessoes.papel` (`TEXT NOT NULL DEFAULT 'consultor' CHECK (papel IN ('consultor', 'auditor'))`): o papel escolhido no
consentimento OAuth do MCP remoto. O auditor só lê o projeto e registra achado e nota de auditoria; o servidor relê o papel daqui a cada
chamada (`concessaoValida`). Default `consultor`: toda concessão existente fica como era. `test/migration-0070.test.ts` prova sobre a
`agente_concessoes` antiga com linha: a linha fica e vira `consultor`, o CHECK recusa papel desconhecido. **NÃO é idempotente** (`ADD
COLUMN` aborta com "duplicate column"): aplicar uma vez. Conferência depois: `PRAGMA table_info(agente_concessoes)` com `papel`. Para
desfazer: não precisa (o código anterior não lê a coluna, e o default cobre o INSERT dele). **Esta RODA em produção, ANTES do código
novo:** o código novo lê `ac.papel` em toda chamada de agente, então publicá-lo sem a coluna derruba todos os agentes conectados (401). O
deploy do merge recusa enquanto ela estiver pendente, e é isso que protege.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

---

## 0071 — cadastro da empresa do projeto (2026-10-14)

Tabela nova `empresas`, 1:1 com `projects` (`project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE`): CNPJ (14 dígitos,
CHECK de formato), documento alternativo, identificação, CNAE, endereço (UF com CHECK de 2 letras maiúsculas), contato e representante
legal (nome e cargo; sem CPF). `pais` NOT NULL DEFAULT 'BR'; `funcionarios` com CHECK >= 0; `data_abertura` no formato AAAA-MM-DD.
Backfill na própria migration: uma linha por projeto, com `cnpj` (máscara tirada; o que não fecha 14 dígitos vai inteiro para
`documento_alternativo`), `client_name` como razão social, `sector` e `employee_count`. As colunas antigas de `projects` não mudam.
**É idempotente** (`CREATE TABLE/INDEX IF NOT EXISTS` e `INSERT OR IGNORE`). `test/migration-0071.test.ts` prova sobre projetos com CNPJ
mascarado, CNPJ curto e nome em branco: nenhum dado perdido, `projects` intacta, CHECKs valendo. Conferência depois:
`PRAGMA table_info(empresas)` e `SELECT count(*) FROM empresas` igual a `SELECT count(*) FROM projects`. Para desfazer: `DROP TABLE empresas`
(o código anterior não a lê). **Esta RODA em produção ANTES do código novo:** o código lê e grava `empresas` (cadastro, criação de projeto
com empresa, relatório do RoPA, company-profile); o deploy do merge recusa enquanto ela estiver pendente.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.
