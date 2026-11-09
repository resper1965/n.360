# Migrations

Companheiro de [`backups/README.md`](../backups/README.md) (backup e restauração). O runbook do
incidente de agosto de 2026, quando a `d1_migrations` de produção divergia do repositório, foi
arquivado em [`docs/arquivo/reconciliacao-migrations-2026-08.md`](../docs/arquivo/reconciliacao-migrations-2026-08.md).

## Estado

- Última migration no repositório: **0106** (`ls migrations/*.sql | tail -1`). São 107 arquivos
  `.sql` (`ls migrations/*.sql | wc -l`): não existe 0001, há três 0002 de antes da numeração
  estável, **não existem 0031 a 0033** (eram da camada MSP, que entrou por engano no #204 e
  saiu no #206) e há **duas 0096** (`0096_ot_agente_coleta.sql` e `0096_titular_portal.sql`)
  e **duas 0097** (`0097_orgaos_publicos.sql` e `0097_ot_sensor_rede.sql`), de PRs paralelos. O runner controla pelo NOME do arquivo (`d1_migrations.name`), então as duas
  valem e já estão aplicadas em produção (conferido em 05/11/2026: `npx wrangler d1 migrations list niso-db --remote` só listava a 0098
  como pendente); não renomeie (renomear faria o runner aplicar de novo).
  Antes de numerar a próxima, confira a `main` atual (`git ls-tree --name-only origin/main migrations/`).
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

**Migration que refaz tabela (DROP + RENAME) recria também os gatilhos e índices dela.** O `DROP TABLE` apaga os objetos da tabela; a 0087 perdeu assim o gatilho de isolamento de `tratamento_etapa_itens` até a 0088. O teste `test/migrations-consistencia.test.ts` reprova isso (R1: o que o `schema.sql` define sobre a tabela precisa ser recriado por uma migration de número igual ou maior) e confere que toda coluna de `ADD COLUMN` existe no `schema.sql` (R2; exceção só com motivo escrito em `EXCECOES_R2`). Aplicar a sequência inteira num banco vazio **não** é possível (42 das 86 falham: não existe a 0001), por isso a conferência é estática.

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

---

## 0072 — teste de impacto do tratamento (2026-10-14)

Tabela nova `tratamento_impacto` (`ropa_id`, `project_id`, `pergunta`, `resposta` com CHECK `sim|nao|nao_sei`, `atualizado_por`,
`atualizado_em`; chave `(ropa_id, pergunta)`; some com o tratamento por `ON DELETE CASCADE`). Colunas novas, todas NULL:
`ropa_records.impacto_finalizado_em`, `dpia_assessments.origem_hash` e `lia_assessments.origem_hash` (hash do conteúdo do tratamento
quando a DPIA ou a LIA nasce dele). Nenhuma delas entra no conteúdo congelado das aprovações (`COLUNAS_DPIA` e
`DOCUMENTOS.tratamento.colunas` não mudam): aprovação existente continua valendo. `test/migration-0072.test.ts` prova sobre as três
tabelas antigas com linha: as linhas ficam, as colunas entram vazias, o CHECK e a chave valem. **NÃO é idempotente** (`ADD COLUMN`
aborta com "duplicate column"): aplicar uma vez. Conferência depois: `PRAGMA table_info(tratamento_impacto)`, `PRAGMA
table_info(ropa_records)` com `impacto_finalizado_em` e `PRAGMA table_info(dpia_assessments)` com `origem_hash`. Para desfazer:
`DROP TABLE tratamento_impacto` (as colunas NULL podem ficar; o código anterior não as lê). **Esta RODA em produção ANTES do código
novo:** o código lê e grava as colunas e a tabela (teste de impacto, DPIA e LIA criadas do tratamento); o deploy do merge recusa
enquanto ela estiver pendente.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

---

## 0073 — risco e ação da atividade de tratamento (2026-10-14)

Colunas novas, todas NULL: `risks.ropa_id` e `corrective_actions.ropa_id` (FK para `ropa_records`, `ON DELETE SET NULL`: apagar a
atividade solta o vínculo e mantém o risco e a ação), `risks.residual_impact` e `risks.residual_probability` (CHECK 1..5) e
`risks.residual_level` (calculado no servidor, como `risk_level`). Índices `idx_risks_ropa` e `idx_capa_ropa`. Os riscos e ações que já
existem ficam com `ropa_id` vazio (sem backfill: não há como saber a que atividade um risco ISO pertence). Nada entra no conteúdo
congelado das aprovações. `test/migration-0073.test.ts` prova sobre as tabelas antigas com linha: as linhas ficam, as colunas entram
vazias, o CHECK do residual vale e o SET NULL solta o vínculo. **NÃO é idempotente** (`ADD COLUMN` aborta com "duplicate column"):
aplicar uma vez. Conferência depois: `PRAGMA table_info(risks)` com `ropa_id` e os três `residual_*`, `PRAGMA
table_info(corrective_actions)` com `ropa_id`, e `SELECT COUNT(*)` de `risks` e `corrective_actions` igual ao de antes. Para desfazer:
nada a fazer no banco (as colunas NULL podem ficar; o código anterior não as lê). **Esta RODA em produção ANTES do código novo:** as
sub-rotas de riscos e ações da atividade, o mapa de risco e o `PUT /api/v1/risks/:id` leem e gravam as colunas; o deploy do merge
recusa enquanto ela estiver pendente.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

---

## 0074 — ciclo de vida do dado e bases legais adicionais (2026-10-15)

Tabelas novas: `tratamento_ciclo` (uma linha por etapa da atividade: `coleta`, `uso`, `compartilhamento_interno`,
`compartilhamento_externo`, `armazenamento`, `eliminacao`; `situacao` `registrada` ou `nao_aplicavel`; `item_id` opcional para `itens`
com `ON DELETE SET NULL`; `descricao` até 1000; chave `(ropa_id, etapa)`; `nao_aplicavel` sem item por CHECK) com os gatilhos
`tratamento_ciclo_do_projeto_ins` e `_upd` (tratamento e item têm de ser do projeto da linha), e `tratamento_bases` (bases legais
adicionais do catálogo de requisitos, chave `(ropa_id, requisito_id)`, `observacao` até 500). As duas somem com o tratamento
(`ON DELETE CASCADE`). Coluna nova NULL: `ropa_records.base_gdpr` (texto livre). `base_legal_id` continua a base principal, sem cópia
para a tabela nova. Nada entra no conteúdo congelado das aprovações (`DOCUMENTOS.tratamento.colunas` e `COLUNAS_DPIA` não mudam).
`test/migration-0074.test.ts` prova sobre o banco de antes: o registro fica, a coluna entra vazia, os CHECK e os gatilhos valem.
**NÃO é idempotente** (`ADD COLUMN` aborta com "duplicate column"): aplicar uma vez. Conferência depois: `PRAGMA
table_info(tratamento_ciclo)`, `PRAGMA table_info(tratamento_bases)`, `PRAGMA table_info(ropa_records)` com `base_gdpr` e `SELECT
COUNT(*) FROM ropa_records` igual ao de antes. Para desfazer: `DROP TABLE tratamento_ciclo; DROP TABLE tratamento_bases` (a coluna
NULL pode ficar; o código anterior não a lê). **Esta RODA em produção ANTES do código novo:** as sub-rotas de ciclo e bases, as
ligações, o painel do encarregado, o relatório e a DPIA criada do tratamento leem as tabelas; o deploy do merge recusa enquanto ela
estiver pendente.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

---

## 0075 — homologação de fornecedor por questionário (2026-10-15)

Tabelas novas: `homologacao_perguntas` (o questionário do projeto: `tema` até 80, `texto` até 500, `ordem`, `ativa` 0/1, `origem`
`padrao` ou `projeto`; o código semeia o modelo padrão na primeira leitura com `INSERT OR IGNORE`) e `homologacoes` (um envio por
terceiro: `parte_id` para `partes` com `ON DELETE CASCADE`, `token_hash` único, `expira_em`, `status` `aberta`, `respondida`,
`concluida` ou `cancelada`, `perguntas_json` congelado, `respostas_json`, `resultado` e `avaliacao_id` para `avaliacoes_terceiro` com
`ON DELETE SET NULL`). Gatilho `homologacao_imutavel`: recusa mudar perguntas, token, terceiro e projeto, mudar respostas fora de
`aberta` e voltar a `aberta`. Nada existente muda. `test/migration-0075.test.ts` prova sobre o banco de antes: a linha existente fica,
as tabelas e o gatilho entram, os CHECK valem. **Idempotente** (`IF NOT EXISTS` em tudo), mas aplicar pelo `migrations apply`.
Conferência depois: `PRAGMA table_info(homologacao_perguntas)`, `PRAGMA table_info(homologacoes)` e `SELECT name FROM sqlite_master
WHERE name = 'homologacao_imutavel'`. Para desfazer: `DROP TABLE homologacoes; DROP TABLE homologacao_perguntas` (o código anterior não
as lê). **Esta RODA em produção ANTES do código novo:** as rotas de homologação e a página do fornecedor leem as tabelas; o deploy do
merge recusa enquanto ela estiver pendente.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

## 0076 — importação do legado (F6, 2026-10-15)

Rebuild de `importacao_itens`, no molde exato da 0067 (CHECK só muda por rebuild no SQLite): `entidade` passa a aceitar `risco`, `gap`,
`impacto`, `ciclo` e `bases`, e a tabela ganha `aviso` (texto, nulo nas linhas existentes: o aviso da gravação, que antes só voltava na
resposta da confirmação, para o relatório de reconciliação contar). Só esta tabela muda; nenhuma tabela aponta para ela, então o `DROP`
não cascateia; as FKs dela para lote, arquivo e projeto e os três índices seguem iguais. A cópia vai para `importacao_itens_new` ANTES do
`DROP`: se parar no meio, a original fica inteira. `test/migration-0076.test.ts` prova sobre o banco da 0067 com itens de todas as entidades
antigas: as linhas ficam idênticas, `aviso` nasce nulo, as cinco entidades novas entram, entidade fora da lista é recusada, a cascata do
lote continua e `importacao_itens_new` não sobra. **NÃO é idempotente** (`CREATE TABLE importacao_itens_new` sem `IF NOT EXISTS`); aplicar
só uma vez, pelo `migrations apply`. Conferência antes: `SELECT COUNT(*) FROM importacao_itens`; depois: a mesma contagem,
`PRAGMA table_info(importacao_itens)` com `aviso` e `SELECT sql FROM sqlite_master WHERE name = 'importacao_itens'` com `'bases'` no CHECK.
Para desfazer: não precisa (o código anterior não lê `aviso` e não grava as entidades novas). **Esta RODA em produção ANTES do código novo:**
o código grava `aviso` e as entidades novas; o deploy do merge recusa enquanto ela estiver pendente.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

## 0077 — convite com link para criar a senha (2026-10-15)

Tabela nova `convites_senha`: uma linha por conta com convite pendente (`user_id` chave primária, FK para `users` com `ON DELETE CASCADE`),
`token_hash` único (SHA-256 do token CSPRNG; o token só existe no e-mail), `expira_em` (72 h), `criado_por` e `created_at`. Reenviar o
convite substitui a linha (o link anterior deixa de valer); usar o link apaga a linha no mesmo statement que a confere (uso único).
Nada existente muda. **Idempotente** (`IF NOT EXISTS`), mas aplicar pelo `migrations apply`. Conferência depois:
`PRAGMA table_info(convites_senha)`. Para desfazer: `DROP TABLE convites_senha` (o código anterior não a lê). **Esta RODA em produção
ANTES do código novo:** criar conta grava o convite nela; o deploy do merge recusa enquanto ela estiver pendente.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

## 0078 — Bancada da trilha (2026-10-15)

Aditiva, só `ALTER TABLE ... ADD COLUMN` (spec `docs/superpowers/specs/2026-10-15-bancada-trilha-design.md`). `checklist_progress` ganha o bloqueio do passo
(`bloqueio_motivo`, `bloqueio_responsavel`, `bloqueado_em`) e a conclusão com exceção (`excecao_motivo`, `excecao_por`, `excecao_em`);
`project_phase_answers` ganha `updated_by` (quem gravou); `project_phases` ganha `legado_status`, que congela a situação que o select manual
mostrava (`completed`, `blocked`, `skipped`) até a Bancada assumir a fase. O `UPDATE` final só copia `status` para `legado_status`.
**Não é idempotente** (SQLite não tem `ADD COLUMN IF NOT EXISTS`): aplicar só pelo `migrations apply`. Conferência depois:
`PRAGMA table_info(checklist_progress)` mostra `bloqueio_motivo`; `SELECT count(*) FROM project_phases WHERE legado_status IS NOT NULL`.
Para desfazer: não precisa (o código anterior ignora as colunas). **Esta RODA em produção ANTES do código novo.**
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

## 0079 — RoPA em abas (2026-10-16)

Aditiva (spec `docs/superpowers/specs/2026-10-16-ropa-abas-design.md`). `ropa_records` ganha 12 colunas nulas (cabeçalho, escopo, agentes, base jurídica,
gaps, `etapas_materializadas_em`, `reaberta_em`); `tratamento_ciclo`, `tratamento_bases`, `corrective_actions` e `risks` ganham colunas (em `risks`, `idr` e
`treatment_due_date`); nascem `catalogo_itens`, `tratamento_etapa_itens`, `tratamento_interno_areas`, `tratamento_externo_parceiros`, `tratamento_etapa_titulares`,
`tratamento_etapa_dados`, `tratamento_medidas`, `tratamento_bases_gdpr` e `acao_anexos`, com gatilhos de tenant. **Nenhuma tabela nova é semeada**: os catálogos
nascem vazios. Nada entra no conteúdo congelado da aprovação do tratamento: a aprovação de antes continua valendo. A única escrita em linha existente é o
`UPDATE` do `idr` dos riscos que já tinham atividade (sequencial por criação) e o índice único parcial `idx_risks_ropa_idr`.
**Não é idempotente** (SQLite não tem `ADD COLUMN IF NOT EXISTS`): aplicar só pelo `migrations apply`. Conferência depois:
`PRAGMA table_info(ropa_records)` mostra `volume_mensal`; `SELECT count(*) FROM risks WHERE ropa_id IS NOT NULL AND idr IS NULL` (esperado 0).
Para desfazer: não precisa (o código anterior ignora as colunas e as tabelas). **Esta RODA em produção ANTES do código novo; a 0079 inteira vai na PR1.**
**Não aplicada em lugar nenhum** até o líder do projeto aplicar.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

## 0080 — criticidade do fornecedor (2026-10-18)

Aditiva (spec `docs/superpowers/specs/2026-10-18-criticidade-fornecedor-design.md`). Cria `criticidades_terceiro` (`IF NOT EXISTS`, com
`project_id` e `parte_id`, histórico append-only: as cinco respostas, o `nivel` derivado no servidor e `avaliado_por`). Nenhuma tabela existente
muda e nenhuma linha é escrita: sem carga. Não é executada por nada além do `migrations apply`.
Conferência depois: `PRAGMA table_info(criticidades_terceiro)` e `SELECT count(*) FROM criticidades_terceiro` (esperado 0).
**Não aplicada em lugar nenhum** até o líder do projeto aplicar.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

## 0081 — paridade com o legado: descrição da área e documentos em arquivo (2026-10-19)

Aditiva (spec `docs/superpowers/specs/2026-10-19-paridade-legado-menu-design.md`, frente B). `departamentos` ganha `descricao` (texto, nula nas
linhas existentes) e nasce `documentos_arquivo` (`IF NOT EXISTS`, com `project_id`, CHECK de `tipo`, `status`, `arquivo_tipo` e de
`sem_vencimento` sem data, índice por projeto). Nenhuma linha é escrita: sem carga. **Não é idempotente** (`ADD COLUMN`): aplicar só pelo
`migrations apply`. Conferência depois: `PRAGMA table_info(departamentos)` mostra `descricao`; `SELECT count(*) FROM documentos_arquivo` (esperado 0).
Para desfazer: não precisa (o código anterior ignora a coluna e a tabela). **Esta RODA em produção ANTES do código novo.**
**Não aplicada em lugar nenhum** até o líder do projeto aplicar.
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

## 0082 — aceite de risco num modelo só (2026-10-20)

Spec `docs/superpowers/specs/2026-10-20-frente2-regras-unicas-design.md` (B2). `risks` ganha `aceite_manual INTEGER NOT NULL DEFAULT 0`, e o
`UPDATE` leva a `Accepted` (com `aceite_manual = 1`) o risco com tratamento `Accept`, nome digitado em `accepted_by` e status ainda aberto
(fora de `Accepted`, `Closed` e `Mitigated`); nome e data digitados ficam. **Escreve em linha existente**: antes, conferir quantas mudam com a
consulta do cabeçalho do arquivo. **Não é idempotente** (`ADD COLUMN`): aplicar só pelo `migrations apply`. Conferência depois:
`PRAGMA table_info(risks)` mostra `aceite_manual`; `SELECT count(*) FROM risks WHERE aceite_manual = 1` igual à contagem de antes.
**Produção só com o "sim" explícito do dono e `npm run db:backup` antes. Não aplicada em lugar nenhum.**
Ordem: merge → `npm run db:backup` → workflow *Apply DB migrations* (`db-migrate.yml`) → `npx wrangler d1 migrations list niso-db --remote`
(esperado: "No migrations to apply") → workflow *Deploy*.

## 0084 — respostas do questionário da LIA (2026-10-26)

Aditiva: cria `lia_respostas` (PK `ropa_id`+`pergunta`, índice por projeto, gatilho `lia_respostas_do_projeto_ins`), no molde da 0083. As colunas de `lia_assessments` não mudam. Idempotente (`IF NOT EXISTS`). Produção só com o "sim" do dono e `npm run db:backup` antes; mesma ordem da 0083.

## 0085 — CNPJ da organização em `partes` (2026-10-26)

Aditiva: `partes.cnpj` (nulo; CHECK: só `tipo = 'organizacao'`, 14 dígitos) e o índice único parcial `idx_partes_cnpj` (um CNPJ por projeto). Nenhuma linha existente muda. **Não é idempotente** (`ADD COLUMN`): aplicar só pelo `migrations apply`. Conferência depois: `PRAGMA table_info(partes)` mostra `cnpj`; `SELECT count(*) FROM partes WHERE cnpj IS NOT NULL` dá 0. Produção só com o "sim" do dono e `npm run db:backup` antes; mesma ordem da 0083.

## 0086 — documento em arquivo como DPA e cobertura (2026-10-27)

Aditiva: cria `documentos_arquivo_partes` (arquivo, parte, papel `dpa`/`contrato`/`outro`) e `documentos_arquivo_requisitos` (arquivo, requisito), com os índices por parte e por requisito; as duas nascem vazias e nada existente muda. Idempotente (`IF NOT EXISTS`). Conferência depois: `SELECT name FROM sqlite_master WHERE name LIKE 'documentos_arquivo_%'` lista as duas tabelas e `count(*)` dá 0 em ambas. Produção só com o "sim" do dono e `npm run db:backup` antes; mesma ordem da 0083.

## 0087 — Eliminação com ativos próprios (2026-10-27)

Refaz `tratamento_etapa_itens` (SQLite não altera CHECK) para aceitar a etapa `eliminacao`. Nenhuma tabela aponta para ela (é folha), então o DROP não cascateia. Copia as linhas como estão e, de continuidade, cada ativo do Armazenamento vira também ativo da Eliminação (a tela já os mostrava herdados); `tratamento_itens`, o hash da aprovação, já tem esses itens e não muda. Recria `idx_etapa_itens_item`. Conferência depois: `SELECT etapa, count(*) FROM tratamento_etapa_itens GROUP BY etapa` lista `eliminacao` com o mesmo total de `armazenamento`. Produção só com o "sim" do dono e `npm run db:backup` antes; repetir é inofensivo (a tabela nova é recriada e troca a antiga), mas aplique uma vez, pelo `migrations apply`.

## 0088 — gatilho de isolamento de `tratamento_etapa_itens` (2026-10-27)

A 0087 refez a tabela (DROP + RENAME) e o DROP apaga os gatilhos dela: o `etapa_itens_do_projeto_ins` (0079) ficou de fora. Achado da revisão de segurança de 27/10; não houve caminho explorável (o código confere o item com `foraDoProjeto`), mas SQL direto deixou de ser recusado. A 0088 recria o gatilho, igual ao da 0079 e do `schema.sql` (aditiva, `IF NOT EXISTS`). Conferência depois: `SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'tratamento_etapa_itens'` lista o gatilho. **Regra que isto deixa:** migration que refaz tabela (DROP + RENAME) recria também os gatilhos dela; confira com `sqlite_master` antes de aplicar. Produção só com o "sim" do dono e `npm run db:backup` antes.

## 0091 — inventário do n.ot (2026-10-30)

Cria `ot_sites`, `ot_zonas`, `ot_ativos`, `ot_fluxos` e `ot_site_acessos` (spec `2026-10-30-n-ot-modulo-n360-design`, §6). Aditiva e repetível (`IF NOT EXISTS`); não toca tabela existente. As referências entre tabelas `ot_*` são FK compostas com o `project_id`; o CHECK `ot_ativos_4_3_1` recusa ativo do ARCiber sem os campos do 4.3.1; IP/MAC só entram na forma `ot1:` (cifrados pelo servidor). Antes de as rotas servirem ativos em produção: `wrangler secret put OT_INVENTARIO_KEY` e `OT_INVENTARIO_HMAC_KEY` (sem eles, 503). Conferência depois: `SELECT name FROM sqlite_master WHERE name LIKE 'ot_%'`. Produção só com o "sim" do dono e `npm run db:backup` antes.

## 0092 — coleta do n.ot (2026-10-30)

Cria `ot_lotes` e `ot_lote_itens` (staging da coleta: planilha CSV/XLSX e entrada manual; spec §6/§7). Tabelas próprias, não `importacoes` (os CHECK de lá são do n.privacy). Aditiva e repetível (`IF NOT EXISTS`); não toca tabela existente. O CHECK de `ot_lote_itens.dados` recusa `ip`/`mac` em claro e cifra fora da forma `ot1:`; não há `r2_key`, porque o arquivo original nunca vai ao R2 (P0-3). Lote não concluído é apagado pela manutenção diária depois de 7 dias. Conferência depois: `SELECT name FROM sqlite_master WHERE name LIKE 'ot_lote%'`. Produção só com o "sim" do dono e `npm run db:backup` antes.

## 0093 — levantamento do n.ot (2026-11-01)

Cria `ot_levantamentos` (sessões de entrevista, visita e documento), `ot_achados` e `ot_roteiro_perguntas` (15 perguntas semeadas com `INSERT OR IGNORE`) e acrescenta `ot_lotes.levantamento_id` por `ALTER TABLE ADD COLUMN`, que roda uma vez pelo runner: `ot_lotes` não é refeita (gatilhos e RENAME no D1, ver 0089). O resto é repetível (`IF NOT EXISTS`). IP/MAC em `ot_achados.dados` só cifrados (`ot1:`), como na 0092. Conferência depois: `SELECT count(*) FROM ot_roteiro_perguntas` (15) e `PRAGMA table_info(ot_lotes)`. Produção só com o "sim" do dono e `npm run db:backup` antes.

## 0094 — achados da L2 do n.ot

Acrescenta `ot_achados.pergunta_id` (FK para `ot_roteiro_perguntas`, `ON DELETE SET NULL`) e `ot_achados.lote_item_id` (sem FK: o item some com o lote e o achado sobrevive) por `ALTER TABLE ADD COLUMN`, que roda uma vez pelo runner, e o índice `idx_ot_achados_lote_item`. Aditiva; nenhuma tabela é refeita. Conferência depois: `SELECT name FROM pragma_table_info('ot_achados') WHERE name IN ('pergunta_id','lote_item_id')` (2 linhas). Produção só com o "sim" do dono e `npm run db:backup` antes.

## 0095 — perfis de de-para do n.ot (2026-11-03)

Cria `ot_perfis_depara` (perfil da planilha: cabeçalho → campos do ativo, uma assinatura por projeto, `UNIQUE (project_id, assinatura)`). Aditiva e repetível (`IF NOT EXISTS`); não toca tabela existente. Conferência depois: `SELECT name FROM sqlite_master WHERE name='ot_perfis_depara'` (1 linha). Produção só com o "sim" do dono e `npm run db:backup` antes.

## 0096 — agente de coleta do n.ot (2026-11-04)

Acrescenta `projects.agente_coleta_ot INTEGER NOT NULL DEFAULT 0 CHECK (agente_coleta_ot IN (0, 1))` por `ALTER TABLE ADD COLUMN`, que roda uma vez pelo runner (interruptor do agente externo, desligado por padrão). Aditiva; nenhuma tabela é refeita. A chave do agente é `api_keys.permissions = 'ot_coleta'` (sem CHECK). Conferência depois: `SELECT name FROM pragma_table_info('projects') WHERE name = 'agente_coleta_ot'` (1 linha). Produção só com o "sim" do dono e `npm run db:backup` antes.

## 0097 — sensor de rede do n.ot (2026-11-04)

Acrescenta `ot_sites.faixas_internas` (JSON array de CIDR, default `'[]'`) por `ALTER TABLE ADD COLUMN`, que roda uma vez pelo runner, e cria `ot_fluxos_pendentes` (conexões do resumo do Zeek com ponta desconhecida; só hash de IP, `destino_ip_hash` nulo = externo). Aditiva; o resto é repetível. Mesma numeração da `0097_orgaos_publicos.sql` por PRs paralelos (o runner controla pelo nome). Conferência depois: `SELECT name FROM pragma_table_info('ot_sites') WHERE name = 'faixas_internas'` (1 linha) e `SELECT name FROM sqlite_master WHERE name = 'ot_fluxos_pendentes'` (1 linha). Produção só com o "sim" do dono e `npm run db:backup` antes.

## 0096 — portal de solicitações do titular (2026-11-03)

Cria `titular_portais` (um link por projeto, só o SHA-256 do token) e `titular_pedido_tratativas` (histórico do atendimento do pedido).
Aditiva e repetível (`IF NOT EXISTS`). Mesma numeração da `0096_ot_agente_coleta.sql` por PRs paralelos; ver "Estado". Conferência
depois: `SELECT name FROM sqlite_master WHERE name IN ('titular_portais','titular_pedido_tratativas')` (2 linhas).

## 0097 — órgãos públicos destinatários da atividade (2026-11-04)

Cria `tratamento_orgaos_publicos` (nome e obrigação legal, gatilho de projeto). Aditiva e repetível. Conferência depois:
`SELECT name FROM sqlite_master WHERE name = 'tratamento_orgaos_publicos'` (1 linha).

## 0106 — desvios do n.ot (2026-11-09)

Cria `ot_desvios` (fluxo ou ativo fora do esperado; situação, prazo de aceite, `UNIQUE (project_id, tipo, chave_sensor)`, mesmo CHECK de IP/MAC cifrado dos achados) e 2 índices. Aditiva e repetível. Conferência depois:
`SELECT name FROM sqlite_master WHERE name = 'ot_desvios'` (1 linha).

## 0105 — código de acompanhamento do pedido do titular (2026-11-06)

Coluna `titular_pedidos.acompanhamento_hash` por `ALTER TABLE ADD COLUMN` (roda uma vez pelo runner) e o índice único parcial
`idx_titular_pedidos_acompanhamento` (repetível). Guarda só o SHA-256 do código de acompanhamento que a abertura pelo portal gera; a
consulta pública acha o pedido por ele. Spec `2026-11-06-titular-consulta-protocolo-design`. Conferência depois:
`SELECT name FROM pragma_table_info('titular_pedidos') WHERE name = 'acompanhamento_hash'` (1 linha) e
`SELECT name FROM sqlite_master WHERE name = 'idx_titular_pedidos_acompanhamento'` (1 linha).
Aplicada em produção em 06/11/2026, com backup antes: as conferências deram 1 e 1 linha.

## 0104 — identidade e encaminhamento do pedido do titular (2026-11-06)

Quatro colunas em `titular_pedidos` por `ALTER TABLE ADD COLUMN` (rodam uma vez pelo runner): `identidade_metodo` (lista fechada),
`identidade_obs` (até 500), `identidade_por` e `identidade_em`. Tabela nova `titular_pedido_encaminhamentos` (pessoa, prazo, mensagem,
situação `aguardando`/`respondido`/`cancelado`, retorno), com dois índices e o gatilho `titular_encaminhamentos_do_projeto` (pedido e
pessoa do mesmo projeto). Spec `2026-11-06-titular-identidade-encaminhamento-design`. Conferência depois:
`SELECT name FROM pragma_table_info('titular_pedidos') WHERE name LIKE 'identidade_%'` (4 linhas) e
`SELECT name FROM sqlite_master WHERE name IN ('titular_pedido_encaminhamentos','titular_encaminhamentos_do_projeto')` (2 linhas).
Aplicada em produção em 06/11/2026, com backup antes: as conferências deram 4 e 2 linhas.

## 0103 — post mortem do incidente (2026-11-06)

Cria `incidente_postmortem` (uma resposta por pergunta das 14 do legado, `src/data/incidente-postmortem.ts`; até 5.000 caracteres) e os
gatilhos `incidente_postmortem_ins` e `incidente_postmortem_upd`, que só aceitam resposta de incidente ENCERRADO do mesmo projeto, também
por SQL direto. Aditiva e repetível. Fatia 5 da spec `2026-11-04-incidentes-legado-design`. Conferência depois:
`SELECT name FROM sqlite_master WHERE name IN ('incidente_postmortem','incidente_postmortem_ins','incidente_postmortem_upd')` (3 linhas).
Aplicada em produção em 06/11/2026, com backup antes: a conferência deu 3 linhas.

## 0102 — análise de incidente encerrado não muda por UPDATE (2026-11-06)

Gatilho `incidente_analises_encerrado_upd` (BEFORE UPDATE): a análise de incidente encerrado também não muda por SQL direto; a 0101 só
barrava a inclusão. Sem gatilho de DELETE (a exclusão do projeto ou do incidente cascateia). Aditiva e repetível. Conferência depois:
`SELECT name FROM sqlite_master WHERE name = 'incidente_analises_encerrado_upd'` (1 linha).
Aplicada em produção em 06/11/2026, com backup antes: a conferência deu 1 linha.

## 0101 — análises do incidente (2026-11-06)

Cria `incidente_analises` (autor, texto até 10.000, datas; índice por incidente) e os gatilhos `incidente_analises_do_projeto` (incidente
do mesmo projeto) e `incidente_analises_aberto` (encerrado não muda). Aditiva e repetível (`IF NOT EXISTS`). Fatia 3 da spec
`2026-11-04-incidentes-legado-design`. Conferência depois:
`SELECT name FROM sqlite_master WHERE name IN ('incidente_analises','incidente_analises_do_projeto','incidente_analises_aberto')` (3 linhas).
Aplicada em produção em 06/11/2026, com backup antes: a conferência deu 3 linhas.

## 0100 — tratamento da ação corretiva do incidente (2026-11-05)

`corrective_actions.tratamento` (`contencao`, `correcao`, `aperfeicoamento`) por `ALTER TABLE ADD COLUMN`. Fatia 4 da spec
`2026-11-04-incidentes-legado-design`. Conferência depois: `SELECT name FROM pragma_table_info('corrective_actions') WHERE name = 'tratamento'`
(1 linha). Aplicada em produção em 05/11/2026, com backup antes: a conferência deu 1 linha.

## 0099 — comunicação à ANPD completa (2026-11-05)

Colunas novas em `incidentes` por `ALTER TABLE ADD COLUMN` (rodam uma vez pelo runner; o CHECK da 0058 não muda): `anpd_protocolo`
(até 100), `anpd_canal` (`sei`, `formulario_anpd`, `email`, `outro`) e `anpd_justificativa` (até 5000). Fatia 2 da spec
`2026-11-04-incidentes-legado-design`. Conferência depois:
`SELECT name FROM pragma_table_info('incidentes') WHERE name IN ('anpd_protocolo','anpd_canal','anpd_justificativa')` (3 linhas).
Aplicada em produção em 05/11/2026, com backup antes: a conferência deu 3 linhas.

## 0098 — registro completo do incidente (2026-11-04)

Colunas novas em `incidentes` por `ALTER TABLE ADD COLUMN` (rodam uma vez pelo runner; o CHECK da 0058 não muda): `origem_alerta`,
`severidade`, `tipo`, `comprometimento`, `titulares_estimados`, `criterios_risco`, `fim_em`. Tabelas novas `incidente_departamentos`,
`incidente_dados` e `incidente_anexos`, com gatilho de projeto. Conferência depois:
`SELECT name FROM pragma_table_info('incidentes') WHERE name IN ('origem_alerta','severidade','tipo','comprometimento','titulares_estimados','criterios_risco','fim_em')`
(7 linhas) e `SELECT name FROM sqlite_master WHERE name IN ('incidente_departamentos','incidente_dados','incidente_anexos')` (3 linhas).
Aplicada em produção em 05/11/2026, com backup antes: as duas conferências deram 7 e 3 linhas, mais os 6 gatilhos.

## 0101 — sondas do n.ot com envio automático (2026-11-05)

Colunas `chave_sensor` em `ot_achados` e `ot_fluxos_pendentes` por `ALTER TABLE ADD COLUMN` (rodam uma vez pelo runner) e tabelas novas `ot_sensores`, `ot_sensor_credenciais` e `ot_sensor_envios`. Conferência depois:
`SELECT name FROM sqlite_master WHERE name IN ('ot_sensores','ot_sensor_credenciais','ot_sensor_envios')` (3 linhas) e `SELECT name FROM pragma_table_info('ot_achados') WHERE name = 'chave_sensor'` (1 linha).
