# Saída do GitHub Actions (para poder tornar o repositório privado)

Data: 19/11/2026. Situação: **plano para aprovação do dono**. Motivo: o dono está sem crédito de Actions, deixou o repositório
**público** de propósito (Actions é gratuito em repositório público) e quer um caminho sem Actions para voltar a **privado**.

## Fatos conferidos (documentação da Cloudflare, 19/11/2026)

- **D1 Time Travel** está sempre ligado, sem custo adicional: restaura o banco a qualquer minuto dos últimos **30 dias** (plano Workers
  Paid) ou 7 dias (Free). É um backup nativo, independente do GitHub. Limite: 10 restaurações por 10 minutos por banco.
- **Workers Builds** (CI da Cloudflare): **3.000 minutos de build por mês** no plano Free, **6.000** no Paid (depois US$ 0,005 por minuto);
  1 build simultâneo no Free, 6 no Paid; timeout de 20 minutos.
- **Exportar o D1 para o R2 por agenda** é um exemplo oficial: um **Workflow** com `schedules` chama a API de exportação do D1 e grava o
  `.sql` no R2 (serve para guardar além dos 30 dias). Precisa de um token de API com permissão de exportar o banco.
- `wrangler d1 export <banco> --remote --output=...` exporta direto da máquina do dono.

## O que cada workflow faz hoje e o substituto

| Função | Hoje | Substituto sem Actions | Custo / esforço |
|---|---|---|---|
| Deploy ao mergear na `main` | `deploy.yml` (Actions) | **Workers Builds** (já descrito no `docs/runbook-publicacao.md`, seção 0); plano B local: `scripts/publicar.sh` | 3.000 min/mês grátis; confirmar que está conectado |
| Aplicar migration | `db-migrate.yml` (manual) | Local: `npm run db:backup` e `npx wrangler d1 migrations apply niso-db --remote` (`migrations/README.md`) | nenhum |
| Backup do D1 (diário) | `db-backup.yml` (**desativado hoje: sem backup automático além do Time Travel**) | Time Travel (já ligado) **mais** um Workflow agendado exportando para o R2 | PR de código pequeno; 1 token de API e 1 bucket |
| SLO a cada 6 h e Sonda externa | `slo.yml` desativado, `uptime.yml` só manual | Sonda interna do Worker (`src/services/sonda.ts`, cron de 15 min) mais um monitor externo gratuito (já previsto em `docs/runbook-incidente.md`) | nenhum |
| Drift de schema (semanal) | `schema-drift.yml` desativado | Rodar o script local uma vez por mês, ou dentro do gate | pequeno |
| CI e CodeQL | desativados; o gate local substitui o CI | Gate local mais `gitleaks` e `semgrep` no gate; alertas do Dependabot continuam grátis em repositório privado | pequeno |
| PRs de atualização do Dependabot | rodam em runners do Actions e gastam minutos em repositório privado | decidir: manter só os **alertas** (grátis) e atualizar dependências à mão, ou usar um serviço externo | decisão do dono |

## Ordem segura para tornar privado

1. **Confirmar o deploy sem Actions (canário).** Desativar o workflow Deploy e mergear o #595 (só documentação). Se o `/health` mostrar
   o novo commit, o Workers Builds está fazendo o deploy sozinho. Se não, o plano B é `scripts/publicar.sh` na máquina do dono.
2. **Backup alternativo no ar.** O Time Travel já cobre 30 dias. Para retenção maior, implementar o Workflow de exportação para o R2.
3. **Deixar tudo desativado no Actions** (inclusive `uptime.yml` e `slo.yml`: nada agenda).
4. **Tornar o repositório privado** (Settings, General, Danger Zone). Antes, lembrar que o histórico já foi público: o que foi exposto
   continua exposto em cópias e forks; revisar o inventário de segredos (nenhum segredo real foi achado) e trocar o que for sensível.
5. **Conferir depois:** o próximo merge faz deploy pelo Workers Builds; alertas do Dependabot aparecem; o Codex segue revisando PRs.

## Decisões do dono

1. O Workers Builds está conectado e faz deploy na `main` hoje? (O dono confirma no painel da Cloudflare, Workers, projeto, Builds.)
2. Implementar o backup para o R2 (token de API de exportação do D1, bucket `d1-backups` com retenção)? Recomendação: sim.
3. PRs do Dependabot: só alertas ou manter as atualizações? Recomendação: só alertas e uma rodada mensal manual.
4. Monitor externo gratuito: qual serviço? (O runbook já prevê um; só falta o dono confirmar qual está configurado.)

## Não conferido

Se o Workers Builds está de fato conectado a este repositório hoje; o saldo de créditos do Actions; quantos minutos o Dependabot gasta;
o estado real dos alertas do Dependabot (a leitura retornou 403).
