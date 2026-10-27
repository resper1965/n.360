# SLO de produção medido dentro do Worker — Plano

> **Para quem executa:** teste antes do código, uma tarefa por vez, commits pequenos.

**Meta:** o Worker mede 5xx e p95 do Analytics Engine a cada 6 horas e avisa por e-mail, sem depender do GitHub Actions.

**Arquitetura:** `src/services/slo.ts` (avaliação pura, consulta HTTP ao Analytics Engine, estado no KV, e-mail pelo caminho da sonda), um cron novo e o despacho em `scheduled`.

**Spec:** `docs/superpowers/specs/2026-10-27-slo-no-worker-design.md`

## Restrições globais
- Um segredo novo, só leitura: `CF_ANALYTICS_TOKEN`. Conta por `env.CF_ACCOUNT_ID || CF_ACCOUNT_ID_DEFAULT`.
- Tetos idênticos aos de `scripts/slo.mjs`. Sem dado pessoal em log ou e-mail. Sem migration.
- Uma tarefa pesada por vez.

## Foco de revisão
1. API do Analytics Engine responde erro de SQL como texto com status 200: tem de virar `sem_medida`, não "sem dados".
2. Falha de medição também alerta (vigilância calada não pode virar prova de saúde).
3. Um e-mail por transição, não um a cada 6 horas.
4. Sem token: nenhum e-mail e nenhuma exceção.
5. Tetos do Worker e do script iguais.

---

### Tarefa 1: avaliação pura e paridade dos tetos
**Arquivos:** criar `src/services/slo.ts`, `test/slo.test.ts`.
**Interfaces:** produz `TETOS`, `avaliarSlo(m): string[]`, `type MedidaSlo`.
- [ ] Teste que falha: `avaliarSlo` alerta com 5xx > 1% e ao menos 1 erro; não alerta com 0 erro; alerta p95 > 800 com 20+ requisições; ignora p95 com menos de 20; `TETOS` igual às constantes de `scripts/slo.mjs` (lidas com `?raw`).
- [ ] Rodar e ver falhar. Implementar. Rodar e ver passar.
- [ ] Commit.

### Tarefa 2: medição, estado e e-mail
**Arquivos:** modificar `src/services/slo.ts`, `test/slo.test.ts`; modificar `src/index.ts` (campo `CF_ANALYTICS_TOKEN?: string` em `Bindings`).
**Interfaces:** consome `enviarEmail`, `emailAlertaSonda`, `appUrl`, `log`. Produz `CRON_SLO = '15 */6 * * *'`, `verificarSlo(env): Promise<{ estado: 'ok'|'violado'|'sem_medida'|'sem_token'; alerta: 'entrada'|'volta'|null }>`.
- [ ] Testes que falham (fetch simulado por URL: Analytics Engine devolve JSON; Resend devolve `{}`): sem token; violação com um e-mail, segunda rodada sem novo e-mail, volta com um e-mail; resposta não-JSON vira `sem_medida` com um e-mail; a consulta usa `Authorization: Bearer <token>` e a conta certa; `slo:ultimo` gravado.
- [ ] Rodar e ver falhar. Implementar `medir`, `verificarSlo`. Rodar e ver passar.
- [ ] Commit.

### Tarefa 3: cron e despacho
**Arquivos:** modificar `wrangler.jsonc` (crons), `src/index.ts` (`scheduled`), `test/slo.test.ts`, `test/sonda.test.ts` ou `test/avisos-prazo.test.ts` se fixarem a lista de crons.
- [ ] Teste que falha: `wrangler.jsonc` contém `CRON_SLO` e `worker.scheduled({ cron: CRON_SLO })` chama `verificarSlo`.
- [ ] Implementar. Rodar `npx tsc --noEmit` e as suítes `slo`, `sonda`, `avisos-prazo`.
- [ ] Commit.

### Tarefa 4: documentação e fechamento
**Arquivos:** `docs/runbook-incidente.md` (SLO agora no Worker; como criar o token e o `wrangler secret put CF_ANALYTICS_TOKEN`), `AGENTS.md` (lista de crons e o segredo), `docs/prontidao-primeiro-cliente.md` (Operação), `CHANGELOG.md`.
- [ ] Atualizar os quatro arquivos; rodar `npx vitest run` das suítes tocadas e `tsc`.
- [ ] Commit, push, PR, portão (`bash scripts/ci/ship.sh <PR>`), conferir o SHA em `/health`.
- [ ] Depois do segredo criado pelo dono: conferir `slo:ultimo` no KV e fechar a #369 com o número medido.

## Autoverificação
Cobertura da spec: tetos (T1), estados e e-mail (T2), sem token (T2), cron (T3), documentos (T4). Nomes: `TETOS`, `avaliarSlo`, `verificarSlo`, `CRON_SLO`, `MedidaSlo`.
