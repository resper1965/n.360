# Avaliação por IA em campo separado — design

**Data:** 2026-11-19 · **Estado:** aguardando aprovação do dono
**Escopo:** evidências (n.iso). Item 3 da consulta do TWYN.

## 1. Por que

A avaliação por IA de evidência sobrescreve a nota humana. Fatos em `origin/main`:

- `src/routes/evidence.ts`, rota `POST /evidence/:id/evaluate`: grava `evaluation_notes = result.content` (o markdown da IA) junto com `evaluation_score`. A nota que a pessoa escreveu some.
- No TWYN isso apagou a nota da triagem da evidência `mvliqq…`; foi preciso restaurá-la à mão. Reincide a cada reavaliação.
- `PATCH /projects/:id/evidence/:id` (PR #594) grava `evaluation_notes` como nota **humana** — mesmo campo que a IA atropela.

Ou seja: um único campo (`evaluation_notes`) carrega dois donos (humano e IA), e o último a escrever vence.

## 2. Decisão

Separar os dois. `evaluation_notes` passa a ser **só da pessoa**; a saída da IA vai para uma coluna nova `avaliacao_ia`.

- `POST /evidence/:id/evaluate` deixa de tocar `evaluation_notes`. Grava `avaliacao_ia` (markdown do veredito) e `evaluation_score`, e segue decidindo `evaluation_status` como hoje (a IA nunca grava `conforming`; evidência já assinada mantém o status).
- `PATCH …/evidence/:id` continua gravando `evaluation_notes` (humano) e `evaluation_status` (sem `conforming`, PR #594).
- Leitura (`GET /evidence`, detalhe, traceability) devolve os dois campos à parte.

Descartado: "não sobrescrever se já houver nota" — mistura texto de IA e humano no mesmo campo, e a próxima reavaliação não tem onde escrever.

## 3. Schema

Migration nova (aditiva, sem rebuild):

```sql
ALTER TABLE evidence ADD COLUMN avaliacao_ia TEXT;
```

`schema.sql` ganha a mesma coluna (depois de `evaluation_notes`, antes das colunas de assinatura — posição não importa, é aditiva). `test/schema-contract.test.ts` cobre a coluna nova. Sem índice.

## 4. Migração de dados

Nenhuma automática. As notas que a IA já gravou em `evaluation_notes` ficam onde estão — não dá para distinguir com segurança, por linha, o que é IA do que é humano (ambas são markdown livre). Quem quiser mover caso a caso usa o `PATCH` (humano) e uma reavaliação (regrava `avaliacao_ia`). A spec **não** tenta adivinhar.

## 5. Contrato MCP

- `niso_evaluate_evidence`: **muda o efeito** — não escreve mais em `evaluation_notes`; o veredito passa a `avaliacao_ia`. A resposta da ferramenta pode continuar devolvendo o markdown (campo `evaluation_markdown` que ela já retorna), então o contrato de **entrada** não muda; muda o que persiste.
- `niso_traceability` e a leitura de evidência: expõem `avaliacao_ia` separada de `evaluation_notes`.
- `niso_create_evidence`, `niso_update_control`: **sem mudança**.

## 6. Testes

- `evaluate` grava `avaliacao_ia` e **não** altera `evaluation_notes` (nota humana preexistente sobrevive).
- `evaluate` ainda deriva `evaluation_status` como antes (inclui "CONFORME da IA fica pending" e "assinada mantém status").
- `GET /evidence` devolve `avaliacao_ia`.
- `schema-contract`: coluna presente.

## 7. Esforço

P: 1 migration + ajuste na rota `evaluate` + leitura + testes. Sem impacto em cobertura, aprovação ou isolamento de tenant.
