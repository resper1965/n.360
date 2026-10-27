# Prontidão para o uso real do primeiro cliente

Levantamento de 2026-10-27, só leitura. Meta: o primeiro cliente operar o n.360 com dado real. As metas "aceitar novos clientes" e "desligar o legado" ainda não foram levantadas.
Regra do projeto: nada aqui vale sem a saída do comando ao lado. Refaça o comando antes de repetir uma afirmação. Sem prova, a frente fica amarela.

Legenda: verde = provado agora; amarelo = parcial ou sem prova; vermelho = bloqueia o uso real.

## Painel

| Frente | Situação | Prova (2026-10-27) |
|---|---|---|
| Correção | verde | Portão local verde em cada merge; `/health` devolve o SHA do último merge |
| Segurança de código | verde | `npm audit` com 0 em raiz, `frontend` e `mcp-server-niso`; 0 alertas do Dependabot; `test/isolamento-rotas-novas.test.ts` (35 casos) sem vazamento |
| Segredo exposto | vermelho | Issue #317: 1 projeto com o token do repositório em texto claro no banco (o código já não o devolve, o valor não foi revogado) |
| Dados | verde, com ressalva | Backup restaurado num SQLite local: 118 tabelas, `integrity_check` ok, 24 gatilhos. Ressalva: não foi um import real no D1 |
| Operação | vermelho | O GitHub Actions está bloqueado por cobrança (a execução de 27/10 não iniciou o job: "pagamentos recentes da conta falharam ou o limite de gastos precisa ser aumentado"), então `slo.yml`, `uptime.yml` e CodeQL não rodam; a sonda interna a cada 15 min existe, mas a queda nunca teve o e-mail provado. A medição do SLO foi movida para o Worker (`src/services/slo.ts`), que só vigia depois que o segredo `CF_ANALYTICS_TOKEN` existir; a issue #369 (p95 de 1672 ms, de 13/10) segue sem reconfirmação |
| Uso real | amarelo | O projeto tem dados (tratamentos, controles, riscos, documentos, evidências), mas o `docs/roteiro-aceite.md` (43 itens) nunca foi rodado em produção |
| Conformidade | amarelo | 179 mapeamentos ISO e LGPD validados em 21/10 (`validado_juridico`); `parametros_legais` com 0 linhas: prazos de pedido do titular e de incidente saem "não calculado" |
| Autenticação | amarelo | 0 dos 17 usuários ativos com segundo fator (o MFA é opcional) |

## O que falta, em ordem

1. Revogar o token exposto no GitHub e regravá-lo cifrado (#317, `docs/runbook-incidente.md`). Bloqueia o uso real.
2. Cadastrar os prazos em `parametros_legais` (tela do `platform_admin`, com a fonte e a revisão de cada um).
3. Ligar o segundo fator nas contas que operam o cliente (consultor e administrador do cliente).
4. Rodar o `docs/roteiro-aceite.md` no projeto do cliente e registrar o resultado.
5. Regularizar a cobrança do GitHub (Settings, Billing & plans) e criar o segredo `CF_ANALYTICS_TOKEN` (só leitura de Analytics) para a medição do SLO no Worker passar a valer; depois conferir `slo:ultimo` no KV e investigar o p95 da #369.
6. Provar a queda: derrubar de propósito a sonda num ambiente de teste e conferir que o e-mail chega.

## Não medido

Acessibilidade das telas, desempenho por rota e carga, restauração real no D1, e o disparo do e-mail de queda.

## Como refazer cada prova

```
# Correção e disponibilidade
curl -s https://n360.ness.com.br/health
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" https://n360.ness.com.br/login

# Segurança de código
npm audit            # raiz; repetir em frontend/ e mcp-server-niso/
curl -sI https://n360.ness.com.br/login        # HSTS, CSP, nosniff, X-Frame-Options, Referrer-Policy
curl -s -o /dev/null -w "%{http_code}\n" https://n360.ness.com.br/api/v1/projects   # 401 sem login
npx vitest run isolamento-rotas-novas

# Segredo exposto (só o prefixo, nunca o valor)
npx wrangler d1 execute niso-db --remote --command "SELECT CASE WHEN repository_token IS NULL OR repository_token='' THEN 'vazio' WHEN substr(repository_token,1,3)='v1:' THEN 'cifrado' ELSE 'EM CLARO' END estado, count(*) n FROM projects GROUP BY 1"

# Dados: backup e restauração local
npm run db:backup
python -c "import sqlite3;d=sqlite3.connect(':memory:');d.executescript(open('backups/niso-backup.sql',encoding='utf-8').read());print(d.execute('pragma integrity_check').fetchone())"

# Operação
gh workflow list --all | grep -i slo
npx wrangler secret list                       # só os nomes
gh issue list --state open

# Conformidade e autenticação
npx wrangler d1 execute niso-db --remote --command "SELECT count(*) FROM parametros_legais"
npx wrangler d1 execute niso-db --remote --command "SELECT estado, count(*) FROM requisito_mapeamentos GROUP BY estado"
npx wrangler d1 execute niso-db --remote --command "SELECT sum(totp_enabled), count(*) FROM users WHERE ativo = 1"
```

Atualize a tabela e a data a cada release que mexa em segurança, dados ou operação.
