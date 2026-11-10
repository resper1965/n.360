# Runbook de incidente — n.360 (n.iso e n.privacy)

> Para quando o sistema está quebrado, não para leitura de fim de semana.
> Cada passo tem comando; nenhum diz "investigue".
>
> `SECURITY.md` cobre **relato de vulnerabilidade**. Este documento cobre
> **indisponibilidade, deploy ruim e perda de dado** — que não estavam cobertos
> em lugar nenhum.

## 0. Primeiro minuto

```bash
# O worker responde, e com qual versão? `version` é o SHA do commit publicado
# ("dev" = deploy feito fora do workflow). Compare com o SHA que você espera.
curl -s https://n360.ness.com.br/health

# O comportamento é o do código atual? (prova comportamento, não só o rótulo)
curl -s -X POST -H "Content-Type: application/json" -d '{}' \
  https://n360.ness.com.br/api/v1/auth/login
```

Os domínios antigos (`niso.ness.com.br`, `nprivacy.ness.com.br`) servem `/health` e `/api/*` no lugar. O monitor externo vigia os dois,
`n360` e `niso`, e o alerta diz qual falhou (a sonda manual `.github/workflows/uptime.yml` também bate nos dois). Se só um cai, o
problema é de rota ou de domínio (Custom Domain, certificado, DNS), não do Worker: repita os dois `curl` acima com o
outro domínio para confirmar.

O login com corpo vazio deve devolver `{"error":"Payload inválido","details":[…]}`
com `path` e `message` por campo. Resposta diferente disso significa **código
antigo ou quebrado no ar** — vá para a seção 2.

Depois: `wrangler tail` mostra o log estruturado ao vivo. Toda requisição sai
como uma linha JSON com `request_id`, `rota`, `status` e `duracao_ms`.

```bash
npx wrangler tail --format json | grep '"nivel":"error"'
```

## 1. Quem aciona o quê

O n.iso não tem plantão formal. Isto é o que existe de fato:

| Sinal | Quem vê | Onde |
| :--- | :--- | :--- |
| Deploy falhou | o build da `main` no Workers Builds falha e o `/health` não muda de SHA | painel da Cloudflare (Workers Builds); o `ship.sh` espera o SHA e avisa |
| Backup | não há backup diário automático (o `db-backup.yml` está desligado) | Time Travel do D1 e o `npm run db:backup` manual antes de migration |
| Produção fora do ar (Worker, domínio, certificado) | e-mail do monitor externo | serviço de uptime gratuito, a cada 5 min (passo a passo abaixo) |
| D1, KV ou R2 sem resposta com o Worker no ar | e-mail para `ALERTA_EMAIL` (um na queda, um na volta) | sonda interna do Worker, cron de 15 min (`src/services/sonda.ts`) |
| Publicada pela metade (sob pedido) | issue, label `uptime` | `uptime.yml`, só manual desde 13/10/2026 |
| Taxa de erro alta com o site NO ar | e-mail para `ALERTA_EMAIL` (um na entrada, um na volta; também quando não consegue medir) | o próprio Worker, a cada 6h sobre o Analytics Engine (`src/services/slo.ts`); o `slo.yml` ficou como alternativa manual |
| Cliente reclama | quem atende | — |

**Por que três sondas.** A do `uptime.yml` rodava no Actions a cada 15 minutos; com o repositório privado, cada
execução cobra 1 minuto arredondado (~2.900 min/mês), mais que todo o CI. Ela virou manual, e a vigilância contínua
se dividiu:

- **Monitor externo** (de fora da Cloudflare): pega o Worker fora do ar, o domínio que caiu, o certificado vencido.
  É o único que enxerga a queda do próprio Worker.
- **Sonda interna** (`src/services/sonda.ts`, cron `*/15 * * * *` no `wrangler.jsonc`): o Worker confere D1
  (`SELECT 1`), os KV `SESSIONS` e `OAUTH_KV` (leitura) e os R2 `STORAGE` e `TRILHA` (`head`). Falha grava
  `{"msg":"sonda_interna",...}` no log e manda **um** e-mail para `ALERTA_EMAIL`; a volta manda outro. O estado fica
  nos dois KV. **Limite:** com o Worker fora do ar o cron não roda e a sonda fica calada — por isso o monitor externo.
  `ALERTA_EMAIL` está em `vars` do `wrangler.jsonc` (desde 16/10/2026); sem ele, a sonda só grava log.
- **`uptime.yml` manual** (aba Actions, *Run workflow*): as duas verificações da seção 0 (`/health` e o envelope do
  login) nos dois domínios, três tentativas cada, com issue (label `uptime`). Use para confirmar uma suspeita ou
  depois de um deploy feito fora do Actions.

### Ligar o monitor externo (ação do dono, uma vez)

Qualquer serviço gratuito com checagem HTTP a cada 5 minutos e alerta por e-mail serve (UptimeRobot e Better Stack
têm plano gratuito com isso). No UptimeRobot:

1. Criar conta com o e-mail de operação e confirmar o endereço (é para ele que vai o alerta).
2. *Add New Monitor* → tipo **HTTP(s) - Keyword**.
3. URL `https://n360.ness.com.br/health`, intervalo **5 minutos**, palavra-chave `"status":"ok"`, alerta quando a
   palavra **não existir**. Timeout de 30 s.
4. Em *Alert Contacts*, marcar o e-mail de operação. Salvar.
5. Repetir para `https://niso.ness.com.br/health` (os dois domínios caem separados quando o problema é de rota).
6. Testar: trocar a palavra-chave de um monitor por uma que não existe, esperar o e-mail de "Down" (até 10
   minutos), desfazer e esperar o de "Up". Alerta que nunca foi visto chegar não é alerta.

O monitor externo confere só o `/health`. O envelope de validação do login (código publicado pela metade) fica
com o `uptime.yml` manual e com a conferência do SHA depois de cada deploy.

O monitor externo e a sonda interna pegam o sistema fora do ar; o `slo.yml` pega o caso em
que ele responde mal. Desde 27/10/2026 essa medição roda DENTRO do Worker (`src/services/slo.ts`, cron `15 */6 * * *`), porque o GitHub Actions pode ficar parado por cobrança (aconteceu: o job nem iniciava) e a vigilância não pode depender disso. O `slo.yml` fica desligado, como alternativa manual. Exige o segredo `CF_ANALYTICS_TOKEN` (token da Cloudflare só de leitura de Analytics, `Account Analytics: Read`, separado do token de deploy): crie em Cloudflare, My Profile, API Tokens, e grave com `npx wrangler secret put CF_ANALYTICS_TOKEN`. Sem ele a medição só registra `slo_sem_token` no log. A última medição fica no KV: `npx wrangler kv key get slo:ultimo --binding SESSIONS --remote`.

São coisas diferentes de propósito: se 30% das requisições
devolverem 500 e a sonda cair nos 70% que respondem, ela passa verde — e é o SLO
que acusa.

Tetos em vigor (24h, `scripts/slo.mjs`): **5xx acima de 1%** do total, e **p95
acima de 800 ms** fora das rotas de IA. A IA fica de fora porque leva segundos
por desenho — misturá-la faria o p95 subir com a ADOÇÃO do produto, e alerta que
dispara quando o produto é mais usado é alerta que se aprende a ignorar.

> **O que continua valendo como limite.** A queda chega em ~5 minutos pelo monitor
> externo e a dependência caída em até 15 pela sonda interna, mas schedule do
> GitHub Actions atrasa por fila (o `db-backup.yml` sai rotineiramente horas
> depois do pedido), e a janela do SLO é de 24h: conte horas para uma degradação. Isso é melhor que "ninguém vê" e pior
> que monitoramento com plantão; quando o produto precisar de minutos, o caminho
> é serviço de observabilidade de verdade, não apertar estes crons.

## 2. Deploy ruim — reverter

O deploy é automático a cada merge na `main`. Reverter o código é reverter o
commit; o worker republica sozinho.

```bash
git fetch origin main
git checkout -B reverte-<sha-curto> origin/main
git revert --no-edit <sha-do-merge>     # commit de squash: um SHA só
git push -u origin reverte-<sha-curto>
```

Abra o PR e mergeie. O `deploy.yml` republica a versão anterior. Se o Actions não
estiver rodando, publique a `main` revertida com `scripts/publicar.sh`
([`runbook-publicacao.md`](runbook-publicacao.md), seção 3).

**Reverter direto pelo wrangler** só se o repositório estiver inacessível e a
urgência não permitir esperar o CI:

```bash
npx wrangler deployments list          # lista as versões publicadas
npx wrangler rollback --message "motivo"
```

> `wrangler rollback` volta o **código**, não o banco. Se o deploy ruim aplicou
> migration, ler a seção 3 ANTES — código antigo contra schema novo pode
> quebrar diferente do problema original.

## 3. Restaurar o banco (D1)

**Antes de qualquer coisa, exporte o estado atual.** Mesmo corrompido: é a única
cópia do que existe agora, e a restauração vai sobrescrevê-lo.

```bash
npx wrangler d1 export niso-db --remote --output backups/pre-restauracao-$(date +%Y%m%d-%H%M%S).sql
```

Pegue o backup bom no artifact da execução do `Backup do D1 (diário)`
(aba Actions → workflow → run → artifact `d1-backup-<run_id>`), ou gere um novo.

```bash
npx wrangler d1 execute niso-db --remote --file=backups/<arquivo>.sql
```

Confira que voltou:

```bash
npx wrangler d1 execute niso-db --remote --command \
  "SELECT (SELECT count(*) FROM users) AS usuarios,
          (SELECT count(*) FROM projects) AS projetos,
          (SELECT count(*) FROM evidence) AS evidencias;"
```

O caminho de restauração é exercitado por teste (`test/backup-restore.test.ts`):
o dump é reaplicado num banco do zero. O modo de falha típico não é o dump vir
corrompido — é ele não **aplicar**, por causa de trigger, constraint ou ordem de
statement.

## 4. Migration que deu errado

O `deploy.yml` recusa publicar com migration pendente, então o estado
"código à frente do banco" não deveria acontecer por deploy. Se acontecer:

```bash
npx wrangler d1 migrations list niso-db --remote     # o que falta
```

D1 não tem rollback de migration. As opções, em ordem de preferência:

1. **Corrigir para frente** — nova migration que conserta. Preferível quase sempre.
2. **Restaurar o backup** (seção 3) e reaplicar a partir dele.

`migrations/README.md` tem o histórico da reconciliação de 2026-08 e o que fazer
quando a tabela `d1_migrations` diverge do banco real.

## 5. Alguém perdeu o segundo fator

Acesso ao D1 sempre vence o MFA — em qualquer sistema. É por isso que esse
acesso é o que precisa ser protegido.

```bash
npx wrangler d1 execute niso-db --remote --command \
  "UPDATE users SET totp_enabled=0, totp_secret=NULL, totp_recovery_hashes=NULL, \
   totp_last_window=NULL WHERE email='alguem@exemplo.com';"
```

## 6. Suspeita de acesso indevido

1. **Revogar a sessão** — as sessões vivem no KV com TTL; apagar a chave encerra.
   ```bash
   npx wrangler kv key list --binding SESSIONS | grep session_
   npx wrangler kv key delete --binding SESSIONS "session_<id>"
   ```
2. **Revogar chaves de API do projeto** — `PUT status = 'Revoked'` em `api_keys`,
   ou pela interface (Platform Admin).
3. **Revogar token de auditor** — `POST /api/v1/projects/:id/auditor-token/:tokenId/revogar`
   (equipe da consultoria; `GET /api/v1/projects/:id/auditor-token` lista os ids válidos).
   Revogar marca `revoked_at`/`revoked_by` e derruba o acesso na hora; **não apague a linha** de
   `auditor_tokens`, ela é a prova de quem revogou. O caminho `/api/v1/public/auditor/*` é público
   e o token (no corpo) é o único fator.
4. **Ler a trilha**:
   ```bash
   npx wrangler d1 execute niso-db --remote --command \
     "SELECT created_at, action, actor, details FROM audit_logs
      WHERE actor='alguem@exemplo.com' ORDER BY created_at DESC LIMIT 50;"
   ```

> **O que dá e o que não dá para afirmar sobre a trilha.**
>
> `audit_logs` é append-only no banco: a migration `0018_data_hardening.sql` cria
> `audit_logs_no_update` e `audit_logs_no_delete`, e os dois **estão** em
> produção — conferido em 2026-09-06:
>
> ```
> SELECT name, type FROM sqlite_master WHERE type='trigger';
> → audit_logs_no_update | trigger
> → audit_logs_no_delete | trigger
> ```
>
> (Uma versão anterior deste runbook dizia o contrário. Estava errada.)
>
> Os triggers não param quem administra o banco: `DROP TRIGGER` é uma linha. Por
> isso o cron diário arquiva o dia FECHADO num objeto JSONL no bucket
> `niso-trilha`, e cada dia carrega o SHA-256 do anterior. Alterar um dia já
> arquivado quebra o encadeamento de todos os posteriores.
>
> ```bash
> # Durante um incidente ou uma auditoria, a pergunta é esta:
> curl -H "Authorization: Bearer <sessao-platform-admin>" \
>   https://n360.ness.com.br/api/v1/admin/trilha/verificar
> # 200 = cadeia íntegra · 409 = quebra, com o dia e o motivo no corpo
> ```
>
> **O limite que continua valendo, e que é o que se declara num relato:** a
> cadeia protege contra quem tem acesso ao D1. Ela **não** protege contra quem
> tem escrita no bucket E no banco ao mesmo tempo, nem cobre o DIA CORRENTE, que
> ainda só existe no D1. Fechar isso exige destino que o próprio produto não
> possa reescrever — bucket com retenção/object-lock, ou terceiro depositário.

## 7. Comunicar

Não há template corporativo. O mínimo honesto, na ordem:

1. **O que aconteceu** — em uma frase, sem jargão.
2. **Quem foi afetado** — quais clientes, quais telas, desde quando.
3. **O que já foi feito** — e o que está em curso.
4. **O que ainda não se sabe.** Dizer "não sabemos ainda" é melhor que estimar.

Se houver suspeita de **dado pessoal exposto**, o prazo e o conteúdo da
comunicação deixam de ser escolha de engenharia: LGPD art. 48 exige comunicação
à ANPD e aos titulares em prazo razoável. Envolva quem responde por privacidade
antes de comunicar.

## 8. Depois

Incidente que não vira mudança de sistema acontece de novo.

- Se faltou um teste, escreva o teste — e o faça **falhar** antes de corrigir.
- Se a documentação mentiu, corrija a documentação no mesmo PR.
- Se a detecção dependeu de sorte, o item que faltava está no
  `enterprise-grade-plan.md`: nomeie qual e por que subiu de prioridade.
