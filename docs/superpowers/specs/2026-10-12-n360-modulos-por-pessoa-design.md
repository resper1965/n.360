# n.360 — fatia 3: módulos por pessoa

Data: 2026-10-12. Decisões do dono (11/10/2026): cada conta recebe, na migração, os módulos que já usa; concede quem já
gere a conta, com teto; o administrador da plataforma passa a ser gravado como `platform_admin` de fato. Pré-requisitos
no ar: fatia 1 do n.360 (#337), contas e travas (#336).

## Problema

Hoje o acesso a um módulo só depende do projeto (`projeto_modulos`). Não há como dar o n.privacy a uma pessoa e não a
outra do mesmo projeto, nem como a equipe ver só o que a organização contratou por pessoa. O papel legado `admin` (a
conta do dono) escapa de travas que procuram `platform_admin`. A tela de Organizações não edita o contrato
(`modulos_contratados`), que só muda pela API.

## Dados (migration nova)

- `usuario_modulos (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, modulo TEXT NOT NULL CHECK (modulo IN ('iso','privacy')), concedido_por TEXT, concedido_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, modulo))`.
- Papéis legados normalizados: `admin`→`platform_admin`, `consultant`→`consultor`, `client_admin`→`client`,
  `user`/`employee`→`org_user`. O mapeamento em `src/middleware/auth.ts` continua (sessões antigas).
- Carga inicial (pelo que cada conta já usa):
  - clientes (`org_admin`, `org_user`, `client` com `client_project_id`): os módulos do projeto deles;
  - equipe (`consultor`, `consultoria_admin`, `comercial`): os módulos contratados pela organização (`users.org_id`);
  - `platform_admin`: nenhuma linha (tem todos sempre); `stakeholder`: nenhuma (só pedidos, núcleo).

## Regra no servidor

`modulosDaPessoa(db, user)`: `platform_admin` → todos; chave de API → os do projeto da chave; agente MCP → os do
consultor que concedeu; resto → `usuario_modulos`. Uma rota de faixa `iso`/`privacy` passa só se o projeto tem o
módulo **e** a pessoa tem o módulo (403 "Você não tem acesso ao n.X"); faixa `nucleo` não exige módulo da pessoa.
Aplica em `projectAccessMiddleware` e `requireResourceAccess`. Consulta por requisição (mudança vale na hora).
`GET /auth/me` devolve `modulos` da pessoa.

## Conceder

`PUT /api/v1/users/:id/modulos` `{ modulos: ['iso','privacy'] }` — quem pode é quem já gere a conta (regras de
`src/routes/users.ts`), com teto: cliente → módulos do projeto dele; equipe → contratados da organização;
`platform_admin` concede qualquer um. Trilha `usuario.modulos` com antes e depois. Conta nova: `POST /users` aceita
`modulos` (no teto); sem o campo, recebe o padrão da carga inicial. Mudança de projeto de um cliente recalcula pelo
novo projeto (interseção com o que ele tinha; vazio → os do projeto novo).

## Contrato da organização

`PUT /api/v1/platform/orgs/:id/modulos` já existe (só `platform_admin`); a tela de Organizações ganha a edição
(caixas n.iso / n.privacy). Tirar um módulo do contrato não tira das pessoas nem dos projetos (só limita o que se
concede depois) — aviso na tela.

## Telas

- Usuários (modal): "Módulos" com caixas até o teto; lista mostra os módulos de cada conta.
- Início do n.360 e listas de projetos: módulos do projeto ∩ módulos da pessoa (`S.user.modulos`).
- Organizações: edição do contrato (platform_admin).

## Testes

Migration (normalização de papéis; carga inicial por tipo de conta; idempotente); regra (403 pessoa sem módulo em
projeto que tem; 200 com; núcleo livre; platform_admin, chave, agente); conceder (quem pode, teto, trilha, conta nova,
troca de projeto); `/auth/me`; telas (jsdom). Travas de último administrador continuam valendo para a conta
normalizada.

## Fora do escopo

Desativar no lugar de apagar e trilha geral de acessos (fatia 4); conta e acessos movidos para o início do n.360
(fatia 2).
