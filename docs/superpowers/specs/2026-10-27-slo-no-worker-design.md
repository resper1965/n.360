# SLO de produção medido dentro do Worker

Data: 2026-10-27. Origem: o `slo.yml` (GitHub Actions) não roda desde 15/10; a execução manual de 27/10 nem iniciou o job ("pagamentos recentes da conta falharam ou o limite de gastos precisa ser aumentado"). Classificação: limitada (um serviço novo, um cron, um segredo; sem tela e sem migration).

## Problema
- A única medição do que o usuário sente com o sistema NO ar (taxa de 5xx e p95 de latência) mora num workflow do GitHub. Sem Actions, ninguém lê o Analytics Engine, e a issue #369 (p95 de 1672 ms, de 13/10) nunca foi reconfirmada nem fechada.
- A sonda interna (`sonda.ts`) prova que D1, KV e R2 respondem, mas não mede latência nem erro de requisição real.
- Vigilância que depende de uma conta de cobrança é ponto único de falha: quando o pagamento falha, a vigilância some e ninguém é avisado.

## Decisão
O Worker passa a medir o SLO no próprio cron, com a mesma consulta e os mesmos tetos do `scripts/slo.mjs`, e avisa por e-mail (`ALERTA_EMAIL`) pelo mesmo caminho da sonda. O `slo.yml` e o `slo.mjs` ficam como estão (desligado, e como referência dos tetos); um teste prova que os tetos do Worker e do script são os mesmos.

- **Por que o Worker precisa de um segredo:** o binding `ANALYTICS` só escreve. Ler o dataset exige a API SQL do Analytics Engine, com um token da Cloudflare. Um token **só de leitura de Analytics da conta** (`Account Analytics: Read`), separado do token de deploy. O token de deploy continua fora do Worker (regra do AGENTS.md).
- **Conta:** `env.CF_ACCOUNT_ID` (já existe, com padrão em `src/agents/types.ts`). Nenhum id novo.
- **Frequência:** a cada 6 horas (`15 */6 * * *`), como o workflow. A janela de medição é de 24 h; medir mais seguido repetiria o mesmo número.

## Comportamento (`src/services/slo.ts`)
- **Tetos** (iguais aos do script): 5xx acima de 1% do total (e ao menos 1 erro 5xx) e p95 acima de 800 ms fora das rotas de IA (`/chat`, `/generate`, `/evaluate`, `/ingest`), só avaliado com 20 requisições ou mais.
- **Estados** guardados no KV, nos dois namespaces como a sonda: `ok` (sem chave), `violado`, `sem_medida`.
  - `violado`: mediu e passou do teto.
  - `sem_medida`: não conseguiu medir (token ausente ou recusado, API fora, resposta que não é JSON, nenhuma linha). Vigilância calada não pode virar prova de saúde, então isto também alerta.
  - Um e-mail por transição: ao entrar em `violado` ou `sem_medida`, e um ao voltar a `ok`. Sem repetição a cada 6 horas.
- **Sem `CF_ANALYTICS_TOKEN`:** estado `sem_token`: só o log estruturado `slo_sem_token`, e nenhum e-mail (o segredo ainda não foi criado; o aviso de vigilância cega fica no painel de prontidão e no log).
- **Observabilidade:** a última medição (24 h, p95, p99, 5xx, total, violações, hora) vai para o KV `slo:ultimo` e para o log `slo_medido`, para conferir sem abrir o painel da Cloudflare.
- **Sem dado pessoal:** só números e nomes de rota; e-mail e log não levam usuário nem corpo de requisição.

## Fora de escopo
Abrir issue no GitHub (a issue era do workflow; o e-mail passa a ser o canal), investigar a causa do p95 (primeiro precisa da medição de hoje), e remover o `slo.yml`.

## Testes
- Avaliação pura: 5xx acima do teto alerta; zero erro nunca alerta; p95 acima do teto alerta com volume suficiente e é ignorado com pouco volume.
- Paridade: os tetos do Worker e de `scripts/slo.mjs` são iguais (leitura do arquivo).
- Fluxo: sem token (log, sem e-mail); violação (um e-mail; segunda rodada igual, nenhum novo; volta ao normal, um e-mail); resposta não-JSON da API vira `sem_medida` com um e-mail; consulta ao Analytics Engine usa a conta e o token certos.
- Fiação: `CRON_SLO` está em `triggers.crons` do `wrangler.jsonc` e o `scheduled` o despacha.

## Riscos
- O token novo é um segredo a mais; por isso só leitura de Analytics e sem escopo de escrita.
- Se o Worker estiver fora do ar, o cron também fica calado (mesmo limite da sonda): o monitor externo gratuito continua necessário para disponibilidade.
