# Paridade entre migrations e schema, e dois acertos da mescla — Plano

> **Para quem executa:** implemente tarefa a tarefa, teste antes do código. Passos com caixa de seleção.

**Meta:** impedir que uma migration que refaz tabela perca gatilho ou índice sem que a suíte acuse, e fechar dois acertos de integridade da mescla de partes.

**Arquitetura:** regras puras em `test/helpers/migrations-lint.ts` (texto das migrations e do schema), um teste de repositório que as aplica, e dois ajustes em `src/services/mesclar.ts`.

**Stack:** Vitest com D1 real (`cloudflare:test`), `import.meta.glob(..., { query: '?raw' })`.

**Spec:** `docs/superpowers/specs/2026-10-27-paridade-migrations-e-mescla-design.md`

## Restrições globais
- Sem migration e sem tela. Nenhum dado de cliente em teste (nomes genéricos).
- Arquivos novos em LF. Comentários e mensagens em português, código em inglês onde já for o padrão do arquivo.
- Uma tarefa pesada por vez (suíte inteira só no portão).

## Foco de revisão
1. Migration que refaz tabela por `DROP` e `RENAME` e perde gatilho (a 0087 original): a regra tem de falhar.
2. Gatilho recriado por migration posterior (a 0088): a regra tem de passar.
3. Tabela renomeada em definitivo (`assets` para `itens`, 0048): exceção explícita com motivo.
4. Encarregado que fica na mescla e não tem e-mail: e-mail do duplicado não pode ser copiado.
5. Índice de confiança do fornecedor depois de receber DPA por mescla.

---

### Tarefa 1: regras puras de consistência

**Arquivos**
- Criar: `test/helpers/migrations-lint.ts`
- Criar: `test/migrations-consistencia.test.ts`

**Interfaces**
- Produz: `tabelasRefeitas(migracoes)`, `objetosDoSchema(schema)`, `perdasPorReconstrucao(migracoes, schema)`, `colunasAdicionadas(migracoes)`, `EXCECOES_R2` (lista com motivo).
- `type Migracao = { nome: string; sql: string }`; `type Objeto = { nome: string; tabela: string; tipo: 'indice' | 'gatilho' }`.

- [ ] **Passo 1: teste que falha (casos sintéticos).** Em `test/migrations-consistencia.test.ts`: (a) schema com a tabela `t` e o gatilho `t_trg`; migração `0001` que refaz `t` (cria `t_nova`, copia, `DROP TABLE t`, `ALTER TABLE t_nova RENAME TO t`) sem recriar o gatilho: `perdasPorReconstrucao` devolve uma perda que cita `0001`, `t` e `t_trg`. (b) mesma situação com uma migração `0002` que recria `t_trg`: devolve vazio. (c) migração que só cria índice novo, sem refazer tabela: vazio.
- [ ] **Passo 2: rodar e ver falhar** (`npx vitest run migrations-consistencia`): falha por módulo inexistente.
- [ ] **Passo 3: implementar** as funções. Tirar comentários (`--`) antes de analisar. `tabelasRefeitas`: nomes em `RENAME TO x` que a mesma migração também `DROP TABLE x`. `objetosDoSchema`: `CREATE [UNIQUE] INDEX [IF NOT EXISTS] n ON t` e `CREATE TRIGGER [IF NOT EXISTS] n (BEFORE|AFTER|INSTEAD OF) (INSERT|DELETE|UPDATE [OF cols]) ON t`. Perda: para cada tabela refeita em migração de nome N e cada objeto do schema sobre ela, nenhuma migração de nome >= N contém `CREATE [UNIQUE] (INDEX|TRIGGER) [IF NOT EXISTS] <objeto>`.
- [ ] **Passo 4: rodar e ver passar.**
- [ ] **Passo 5: commit** (`test: regra R1, tabela refeita por migration recria gatilho e índice`).

### Tarefa 2: R1 e R2 sobre o repositório

**Arquivos**
- Modificar: `test/migrations-consistencia.test.ts`

**Interfaces**
- Consome: as funções da Tarefa 1; `applySchema` de `test/helpers/d1`.

- [ ] **Passo 1: teste R1 do repositório.** Lê `migrations/*.sql` e `schema.sql` (`?raw`), espera `perdasPorReconstrucao(...)` igual a `[]` e uma mensagem que explica a correção (recriar na própria migration ou numa seguinte).
- [ ] **Passo 2: teste R2 do repositório.** `applySchema()`; para cada `ALTER TABLE t ADD COLUMN c` de `colunasAdicionadas`, `PRAGMA table_info(t)` tem `c`; `EXCECOES_R2` = `{ assets: 'virou itens na 0048' }` (a tabela inexistente só passa se listada).
- [ ] **Passo 3: rodar** (`npx vitest run migrations-consistencia`): devem passar hoje.
- [ ] **Passo 4: verificação por mutação (manual, não permanece).** Mover temporariamente `migrations/0088_gatilho_etapa_itens.sql` para fora de `migrations/`, rodar o teste e conferir que acusa a `0087` e o gatilho `etapa_itens_do_projeto_ins`; devolver o arquivo. Registrar o resultado na mensagem de commit.
- [ ] **Passo 5: commit** (`test: R1 e R2 sobre as migrations do repositório`).

### Tarefa 3: mescla não copia o e-mail para o encarregado

**Arquivos**
- Modificar: `src/services/mesclar.ts` (prévia e execução de partes)
- Modificar: `test/mesclar.test.ts`

- [ ] **Passo 1: testes que falham.** (a) Parte A (fica, sem e-mail) é encarregada do projeto (vínculo `encarregado`); parte B (some) tem e-mail: depois de mesclar, o e-mail de A continua nulo e a prévia traz o aviso. (b) Regressão: A não é encarregada: o e-mail de B passa para A (comportamento atual). 
- [ ] **Passo 2: rodar e ver o (a) falhar.**
- [ ] **Passo 3: implementar.** Em `previaDaMescla` (partes): contar `parte_vinculos` com `papel = 'encarregado'` para `manterId`; se houver e o duplicado tiver e-mail, acrescentar o aviso da spec. Em `mesclar`: o `UPDATE partes SET email = ...` só aplica o `COALESCE` quando o cadastro que fica não é encarregado (parâmetro `?5` 0/1 num `CASE WHEN`).
- [ ] **Passo 4: rodar** (`npx vitest run mesclar`) e ver passar.
- [ ] **Passo 5: commit** (`fix(mesclar): não copia o e-mail do duplicado para o encarregado`).

### Tarefa 4: mescla recalcula o índice do fornecedor

**Arquivos**
- Modificar: `src/services/mesclar.ts`
- Modificar: `test/mesclar.test.ts`

- [ ] **Passo 1: teste que falha.** Duas partes de organização; o duplicado tem um documento ligado como DPA (`documento_partes`) e a parte que fica tem perfil `vendors` com `trust_score` calculado sem DPA. Depois de mesclar, `vendors.trust_score` da parte que fica é maior que antes (reflete o DPA).
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementar.** `import { recalcularIndice } from './terceiros'`; depois do `db.batch(stmts)` e antes da trilha, `if (tabela === 'partes') await recalcularIndice(db, manterId);`.
- [ ] **Passo 4: rodar** (`npx vitest run mesclar`) e ver passar.
- [ ] **Passo 5: commit** (`fix(mesclar): recalcula o índice de confiança do fornecedor depois de mesclar`).

### Tarefa 5: documentação e fechamento

**Arquivos**
- Modificar: `migrations/README.md`, `AGENTS.md` (se citar a regra), `CHANGELOG.md`

- [ ] **Passo 1:** `migrations/README.md`: na seção "Migration nova", acrescentar a regra "migration que refaz tabela recria gatilhos e índices; o teste `migrations-consistencia` reprova" e a observação de que aplicar a sequência num banco vazio não é possível (42 de 86 falham, sem a 0001).
- [ ] **Passo 2:** `CHANGELOG.md`, entrada nova em "Não publicado".
- [ ] **Passo 3:** rodar `npx tsc --noEmit` e as suítes `mesclar`, `migrations-consistencia`, `migration-` e `schema-contract`.
- [ ] **Passo 4: commit, push, PR, portão** (`bash scripts/ci/ship.sh <PR>`) e conferir o SHA em `/health`.

## Autoverificação do plano
- Cobertura da spec: R1 (T1, T2), R2 (T2), exceção `assets` (T2), e-mail do encarregado (T3), índice do fornecedor (T4), documentação (T5). Nada de migration, nenhuma tela.
- Nomes consistentes: `perdasPorReconstrucao`, `tabelasRefeitas`, `objetosDoSchema`, `colunasAdicionadas`, `EXCECOES_R2`, `Migracao`, `Objeto`.
