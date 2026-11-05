# Prontidão para o uso real do primeiro cliente

Levantamento de 2026-10-27, refeito em 2026-11-05, só leitura. Meta: o primeiro cliente operar o n.360 com dado real. As metas "aceitar novos clientes" e "desligar o legado" ainda não foram levantadas.
Regra do projeto: nada aqui vale sem a saída do comando ao lado. Refaça o comando antes de repetir uma afirmação. Sem prova, a frente fica amarela.

Legenda: verde = provado agora; amarelo = parcial ou sem prova; vermelho = bloqueia o uso real.

## Painel

| Frente | Situação | Prova (2026-11-05) |
|---|---|---|
| Correção | verde | Portão local verde em cada merge; `/health` devolve `913e7d3`, o SHA do último merge (#553) |
| Segurança de código | verde | `npm audit` com 0 em raiz, `frontend` e `mcp-server-niso` (o aviso moderado do `@hono/node-server` foi corrigido em 05/11); cabeçalhos HSTS, CSP, nosniff, X-Frame-Options e Referrer-Policy presentes; `/api/v1/projects` sem login dá 401. Alertas do Dependabot: a API devolve 403 para esta sessão, conferir na tela do GitHub |
| Segredo exposto | vermelho | Issue #317 aberta: 1 projeto com o token do repositório EM CLARO no banco (a mesma consulta de 27/10 dá o mesmo resultado) |
| Dados | verde, por decisão | Política do dono (05/11): o Time Travel do D1 é o backup até haver volume de dados; o `db-backup.yml` segue desligado. Antes de cada migration, o `npm run db:backup` manual (feito na 0098) |
| Operação | amarelo | Os workflows do Actions estão desligados, salvo a sonda externa e o Dependabot. O SLO medido no Worker FUNCIONA (o `CF_ANALYTICS_TOKEN` existe) e acusa violação: `slo:ultimo` de 05/11 18:15 UTC dá p95 de 965 ms e p99 de 1.590 ms (teto 800 ms), 0 erros 5xx em 923 requisições. Issue #369 segue aberta. O e-mail de queda da sonda nunca foi provado |
| Uso real | amarelo | 5 projetos (iso 5, privacy 4, ot 1), 21 atividades no RoPA, 1 incidente, 0 pedidos do titular. O `docs/roteiro-aceite.md` nunca foi rodado inteiro em produção |
| Conformidade | verde | 179 mapeamentos ISO e LGPD `validado_juridico`, 0 propostos; `parametros_legais` com 3 prazos (titular 15 dias corridos; incidente à ANPD e ao titular 3 dias úteis) |
| Autenticação | vermelho | 0 dos 17 usuários ativos com segundo fator, inclusive o único `platform_admin`. O step-up do n.ot exige TOTP, então revelar e exportar do n.ot não funcionam para ninguém até alguém ligar o MFA |

## O que falta, em ordem

1. Revogar o token exposto no GitHub e regravá-lo cifrado (#317, `docs/runbook-incidente.md`). Bloqueia o uso real.
2. Ligar o segundo fator no `platform_admin` e nas contas que operam o cliente (cartão de perfil, no rodapé da barra lateral).
3. Investigar o p95 de 965 ms (#369): quais rotas, no Analytics Engine; o SLO no Worker já mede e avisa.
4. Rodar o `docs/roteiro-aceite.md` no projeto do cliente e registrar o resultado.
5. Provar a queda: derrubar de propósito a sonda num ambiente de teste e conferir que o e-mail chega.

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
