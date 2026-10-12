# n.360 — fatia 1: casca e roteamento

Data: 2026-10-11. Decisões do dono nesta data: o n.360 vira a plataforma-mãe; n.iso e n.privacy (e futuros) são
módulos dele; usuários, organizações, contratos, projetos e cadastro compartilhado ficam no n.360; tudo em
`n360.ness.com.br`, com os módulos em caminhos; a entrada mostra o início do n.360 com os módulos; `niso` e `nprivacy`
redirecionam. Um Worker, um banco, um deploy (como desde a 0060).

O n.360 antigo (Cloud Run atrás do Worker `n360-proxy`) foi desligado pelo dono em 11/10/2026; `n360.ness.com.br`
responde 530 (registro na Cloudflare, sem origem).

## Fatias

1. **Casca e roteamento** (esta spec).
2. **Conta e acessos no n.360**: usuários, organizações, produtos do projeto, chaves de API saem de dentro dos módulos.
3. **Permissão de módulo por pessoa.**
4. **Desativar no lugar de apagar, e trilha de acessos.**

Cada fatia tem spec, plano e PR próprios. A 2 a 4 não são desenhadas aqui.

## Endereços

| Caminho em `n360.ness.com.br` | O que é |
|---|---|
| `/` | login; depois dele, o início do n.360 |
| `/iso`, `/iso/...` | módulo n.iso |
| `/privacy`, `/privacy/...` | módulo n.privacy |
| `/api/v1/*`, `/mcp`, `/oauth/*`, `/.well-known/*`, `/politicas`, `/auditor`, `/health` | sem mudança |

O app continua um só (`frontend/login.html`, SPA). O módulo passa a vir do **caminho**, não do domínio:
`produtoAtual()` em `frontend/src/produto.js` lê `location.pathname` (`/iso…` → `iso`, `/privacy…` → `privacy`, o resto →
`n360`, a casca do início). O `?produto=` de localhost deixa de existir: o caminho já resolve em localhost. A tela
interna continua no estado do app (`S.view`), como hoje; o caminho só diz o módulo.

O Worker entrega o mesmo `login.html` para `/`, `/iso*` e `/privacy*` (o catch-all de `src/index.ts` já entrega `/login`
para rota desconhecida; os dois prefixos entram explicitamente, antes do catch-all, e o catch-all continua o último).

## Domínios antigos

`niso.ness.com.br` e `nprivacy.ness.com.br` entram na lógica de host legado de `src/index.ts`, com uma diferença em
relação a `HOSTS_LEGADOS` (que hoje redireciona tudo):

- **Página de navegador** (qualquer caminho fora das exceções): 308 para `n360.ness.com.br/iso<caminho>` (de `niso`) ou
  `/privacy<caminho>` (de `nprivacy`), com a query e sem o fragmento (o navegador o mantém).
- **Exceções, servidas no próprio domínio, sem redirecionar**: `/api/*`, `/mcp`, `/oauth/*`, `/.well-known/*`,
  `/politicas*`, `/auditor*`, `/health`. Integrações já configuradas (chaves de API, conectores MCP dos consultores,
  SCIM, webhooks, links do portal do auditor e de políticas) seguem funcionando sem depender de cliente que siga 308.
- Os legados de hoje (`n-iso.ness.com.br`, `niso.ness.workers.dev`) passam a redirecionar para `n360…/iso`.

## URL canônica

- `APP_URL` passa a `https://n360.ness.com.br` (`src/config/url.ts`, `wrangler.jsonc`): links de e-mail, callback de SSO,
  base do SCIM e CORS saem dali. CORS aceita também `niso` e `nprivacy` (as exceções acima respondem lá).
- Links de e-mail que apontam para uma tela de módulo levam o prefixo do módulo (`/iso/...`, `/privacy/...`);
  `src/services/avisos-prazo.ts` (`TELA`) e os demais montadores de link são conferidos um a um.
- **SSO**: o callback continua aceito no endereço antigo (o IdP do cliente já cadastrou) e no novo. Ao terminar, o
  redirecionamento final vai para `${appUrl}/#sso_token=…` (hoje é relativo, `/#sso_token=…`, o que deixaria a sessão no
  domínio antigo).
- **MCP**: o recurso OAuth continua `https://niso.ness.com.br/mcp` (`resourceMetadata` em `src/index.ts`), porque
  tokens e conectores já emitidos estão presos a ele. Mudar o recurso fica para depois, com período de convivência.

## Início do n.360

- Casca `n360`: marca "n.360", título "n.360 | ness.", texto de entrada da plataforma (o que é, os módulos), login.
- Depois do login: projeto ativo (seletor de sempre) e **um cartão por módulo habilitado no projeto**, com nome, uma
  linha do que faz e "Abrir" (vai para `/iso` ou `/privacy`). Abaixo, o painel de ponto de partida
  (`frontend/src/views/ponto-de-partida.js`) do projeto ativo.
- **Quem tem um módulo só** (nenhum projeto seu tem o outro) entra direto nele: `/` leva a `/iso` ou `/privacy`.
- Sem nenhum módulo: a tela "sem acesso" de hoje, com o texto do n.360.
- Menu lateral no início: cadastro compartilhado (partes, documentos, evidências, RoPA, DPIA, governança) e Sistema
  (usuários etc., como hoje). Dentro de um módulo: o menu do módulo (as listas `SO_ISO`/`SO_PRIVACY` de hoje) mais o
  cadastro, e um link "n.360" de volta ao início. O link cruzado "Abrir este projeto no n.privacy/n.iso" vira link de
  caminho, sem trocar de domínio.

## Transição

- Quem estava logado em `niso`/`nprivacy` faz login uma vez no n.360 (a sessão fica por origem no navegador).
- Domínio: `n360.ness.com.br` entra em `routes` do `wrangler.jsonc` (`custom_domain`). Se o registro DNS antigo do n.360
  impedir, o dono o remove; o deploy diz se travou.
- Volta atrás: tirar o redirecionamento dos domínios antigos e voltar `APP_URL`; nada de dado ou migration envolvido.

## Testes

- Worker: cada domínio × caminho → destino (308 e alvo exatos); exceções não redirecionam; legados antigos → `/iso`;
  `/iso*` e `/privacy*` entregam o app; `appUrl` novo nos links de e-mail, no callback e no redirecionamento final do
  SSO; recurso do MCP inalterado; CORS das três origens.
- Frontend (jsdom): produto pelo caminho; início com os cartões dos módulos habilitados; um módulo só → direto nele;
  link cruzado por caminho; sem módulo → sem acesso.
- E2E (Chromium, mock de API como os specs atuais): login em `/`, cartão leva a `/iso` e `/privacy`, casca certa em cada um.

## Fora do escopo

Mover telas de gestão para o n.360 (fatia 2), permissão por pessoa (3), desativar e trilha (4), mudar o recurso do MCP,
identidade visual além de marca, título e textos.
