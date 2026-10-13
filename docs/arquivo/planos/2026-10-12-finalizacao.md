# Finalização do n.360 (n.iso + n.privacy) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fechar tudo o que ficou aberto nas entregas de 09–12/10/2026 — pendências operacionais, lacunas de contas e
acesso, SSO na tela, a área "Conta e acessos" do n.360, os agentes do n.privacy e as fatias 2 a 4 da importação —
cada fase em produção, com evidência.

**Architecture:** um Worker (Hono) + D1 + R2 + Workers AI; frontend Vanilla JS por caminho (`/` n.360, `/iso`,
`/privacy`); acesso = projeto tem o módulo **e** a pessoa tem o módulo (`usuario_modulos`, 0066). Cada fase é um PR
próprio, revisado, mergeado com CI verde e publicado; migration (quando houver) aplicada pelo workflow `db-migrate.yml`
logo depois do merge.

**Tech Stack:** TypeScript (Workers), Hono, D1 (SQLite), R2, Workers AI/AI Gateway (`BaseAgent.runModel`), vitest com
`cloudflare:test` (D1 real), jsdom, Playwright.

**Specs de referência (autoridade de cada área):**
- `docs/superpowers/specs/2026-10-11-n360-casca-design.md` (n.360, fatia 1)
- `docs/superpowers/specs/2026-10-12-n360-modulos-por-pessoa-design.md` (fatia 3)
- `docs/superpowers/specs/2026-10-11-importacao-privacy-design.md` (importação, fatia 1 e a lista das fatias 2–4)
- `docs/superpowers/specs/2026-10-10-integracao-produtos-design.md` (integração dos produtos)

## Global Constraints

- Ler `AGENTS.md`, `CONTRIBUTING.md`, `migrations/README.md` antes de tocar no que eles regem.
- Código em inglês ou no padrão do arquivo; comentários, mensagens, UI e commits em PT-BR. Marca: `n.360`, `n.iso`, `n.privacy`, `ness.` (minúsculo, com ponto). Sem emoji/ícone em conteúdo; sem itálico.
- Commits: `git -c user.name="Ricardo Esper" -c user.email="44273656+resper1965@users.noreply.github.com" commit`; conventional commits; **sem** `Co-Authored-By`, "Generated with" ou menção a ferramenta — em commit, PR, issue e doc.
- Branch por fase a partir de `origin/main` (nunca da main local): `git worktree add -b <branch> C:\Users\resper\worktrees\<nome> origin/main`, depois `npm ci` e `cd frontend && npm ci --include=dev`.
- Schema muda em `schema.sql` **e** numa migration nova (próxima: `0067`, depois `0068`…); índice depois da tabela.
- Toda rota nova de projeto entra em `FAIXA_DO_SEGMENTO` (`src/modulos.ts`); `test/modulos-produto.test.ts` reprova a que não estiver.
- Testes de backend com D1 real (`test/helpers/d1.ts`: `applySchema`, `sessionFor`, `workerEnv`, `habilitarPrivacy`, `concederModulos`); IA sempre simulada no CI.
- Frontend: sem handler/script inline; ações por `data-action`/`data-args`; todo texto vindo da API passa por `escapeHTML`; chamadas da tela com caminho literal `/api/v1/...` (o `test/contrato-tela-api.test.ts` confere).
- Não subir a contagem de `any` (`test/any-catraca.test.ts`); todo número escrito em AGENTS/README leva o comando que o mede.
- Verificação mínima de cada fase antes do PR: `npx tsc --noEmit`; `npx vitest run --exclude "nISO/**"` (falhas só-de-carga desta máquina: conferir o arquivo isolado); `cd frontend && npx vitest run && npm run build && npx playwright test --workers=1`; `npx vitest run test/sem-dado-de-cliente.test.ts`.
- Fluxo de cada fase: implementador → revisão da tarefa → correções → revisão final da fase → PR → CI verde → `gh pr merge <n> --squash` → (migration) `gh workflow run db-migrate.yml --ref main -f confirmar=APLICAR` → deploy automático → `curl -s https://niso.ness.com.br/health` com o SHA do merge.

## Review Focus

1. Pessoa sem o módulo, em projeto que tem o módulo, recebe 403 em toda rota nova de módulo (não só nas antigas).
2. Conta desativada não entra por nenhum caminho (senha, SSO, chave de API do próprio usuário, sessão já aberta).
3. Texto vindo de arquivo do cliente ou de modelo de IA nunca é interpretado (só esquema validado, sempre escapado).
4. Ação que apaga ou muda acesso registra na trilha com o projeto (aparece em `/projects/:id/audit-trail`).
5. Link de e-mail e callback de SSO continuam funcionando no domínio antigo e no novo.

---

## Fase 0 — Operação (sem código novo)

### Task 0.1: Mergear e rodar a conferência de dados (#343)

- [ ] `gh pr checks 343` → todos `pass`; senão, corrigir no branch `ci/conferencia-dados`.
- [ ] `gh pr merge 343 --squash`.
- [ ] `gh workflow run conferencia-dados.yml --ref main`; esperar; ler o passo "Contagens" do log.
- [ ] Resultado esperado (anotar o real no PR da Fase 1 e no CHANGELOG da Fase 1, em "Operação"):
  - `papel platform_admin 1`, `papel consultor 5`, `papel org_admin 8`, nenhum `papel admin` nem `papel consultant`;
  - `usuario_modulos iso 13`, `usuario_modulos privacy 5` (18 no total);
  - `requisitos lgpd 72`, `requisitos anpd 49`, `requisitos iso27001:2022 93`, `requisitos iso27701:2025 49`; `mapeamentos proposto 179`;
  - `contrato org_ness ["iso","privacy"]`.
- [ ] Se divergir: abrir issue com a saída e parar a Fase 0 (não seguir sem entender a divergência).

### Task 0.2: Dependências do Dependabot (#308–#311)

- [ ] Para cada PR: `gh pr checks <n>`; se `test` e `e2e` passam, `gh pr merge <n> --squash`; se falham, comentar a falha e fechar (o Dependabot reabre na próxima versão). Um por vez, esperando o deploy anterior (`gh run list --branch main --workflow Deploy --limit 1`).

### Task 0.3: Etapa 2 do n.360 (#340) — portão do dono

- [ ] Sondar o Turnstile no n360 (script descartável, `frontend/` como diretório de trabalho, `playwright-core`): renderizar o widget com a chave `0x4AAAAAAE0CsIG61nlQBahR` em `https://n360.ness.com.br/login.html`; erro `110200` = ainda bloqueado.
- [ ] Bloqueado → registrar no relatório final como pendência do dono e seguir para a Fase 1. Liberado → `gh pr ready 340`, CI, merge, e conferir: `curl -sI https://niso.ness.com.br/` → `308` para `https://n360.ness.com.br/iso`; `curl -s https://niso.ness.com.br/health` → 200 no lugar; `curl -s https://n360.ness.com.br/health` → `"app_url":"https://n360.ness.com.br"`.

---

## Fase 1 — Pendências pequenas (um PR: `fix/pendencias-revisoes`)

### Task 1.1: Correções de dados e acesso

**Files:** `src/routes/scim.ts`, `src/routes/agentes.ts`, `src/routes/vendors.ts`, `src/routes/governance.ts`,
`src/services/encarregado-pessoa.ts`, `src/modulos.ts` (comentário), `README.md`, `mcp-server-niso/src/index.ts`.
**Tests:** `test/scim.test.ts`, `test/agentes.test.ts` (ou o arquivo que testa `/agentes`: `git grep -l "/agentes" -- test`),
`test/fornecedor-terceiro.test.ts`, `test/dpo-encarregado.test.ts`.

Comportamento exigido (cada item: teste primeiro, vê falhar, implementa):
- [ ] **SCIM grava a organização do projeto.** No INSERT de `src/routes/scim.ts` (~232), gravar `org_id` = `projects.org_id` do projeto do token. Teste: conta criada por SCIM num projeto de `org_b` tem `org_id = 'org_b'`.
- [ ] **consultoria_admin vê e revoga agentes da própria organização.** `podeVer` em `src/routes/agentes.ts` inclui `consultoria_admin`, limitado a projetos da organização dele (`podeAdministrarOrg` de `src/helpers.ts`). Teste: consultoria_admin da org do projeto → 200; de outra org → 403/404 como as demais rotas.
- [ ] **Fornecedor sem vínculo terceiro some da lista.** `GET /projects/:id/vendors` só lista perfis cuja parte tem vínculo `terceiro` no projeto (JOIN em `parte_vinculos`). Teste: remover o vínculo pela rota de partes → o perfil não aparece; recriar o vínculo → reaparece com os dados de antes.
- [ ] **Perfil de parte inativa já tipada some da lista** (mesma regra acima + `partes.status='ativa'`, já existente). Teste com parte inativa tipada.
- [ ] **Trocar o cargo do DPO tira o vínculo de encarregado que a governança criou.** No `POST /governance` com `id` (edição): se o membro era DPO (`ehDpo`) e deixa de ser, remover o vínculo `encarregado` da parte casada (mesma regra de casamento de `garantirEncarregado`), **só se** nenhum outro membro DPO do projeto casa com a mesma parte. Trilha `governanca.encarregado.removido`. Teste: DPO → CISO remove o vínculo; com outro DPO casando a mesma parte, mantém.
- [ ] **Docs pequenas:** `README.md` — contagem de testes do frontend com o comando ao lado (`ls frontend/test/*.test.js | wc -l`); comentário do topo de `src/modulos.ts` cita `test/modulos-produto.test.ts` (o real); `mcp-server-niso/src/index.ts` — texto "agente CONSULTOR do n.iso" vira o texto de `INSTRUCOES` de `src/mcp/contexto.ts` (importar se o pacote permitir; senão copiar e apontar a origem num comentário).
- [ ] Verificação mínima; commit `fix: pendências das revisões (SCIM, agentes, fornecedores, encarregado, docs)`; PR; merge; deploy; health.

---

## Fase 2 — Contas: desativar no lugar de apagar e trilha de acessos (PR `feat/contas-ativo-trilha`)

### Task 2.1: Backend

**Files:** `src/routes/users.ts`, `src/routes/auth.ts`, `src/middleware/auth.ts`, `src/helpers.ts` (`logAudit` se
precisar de campos), migration `0067_trilha_acesso.sql` **só se** faltar coluna (as colunas `old_value`/`new_value` de
`audit_logs` já existem — conferir `schema.sql`; se existirem, sem migration).
**Tests:** `test/contas-ativo.test.ts` (novo), `test/session-revocation.test.ts`.

- [ ] `PUT /users/:id/ativo` `{ ativo: boolean }` — quem pode é quem já gere a conta (mesmas guardas de `PUT /users/:id`); desativar invalida sessões (`invalidateUserSessions`) e revoga agentes (`revogarAgentesPorTrocaDeSenha` ou equivalente); trava de último administrador vale (não desativa o último `platform_admin` ativo nem o último `consultoria_admin` ativo da org); trilha `user.desativado`/`user.reativado` com `project_id` = `client_project_id` da conta.
- [ ] `DELETE /users/:id` passa a **desativar** (mesmo efeito do PUT acima) e devolve `{ ok: true, desativado: true }`; apagar de fato fica só para `platform_admin` com `?definitivo=1` (e continua com as travas atuais). Teste dos dois caminhos.
- [ ] Middleware: sessão de conta com `ativo = 0` é recusada (401) na próxima requisição (ler `ativo` junto da checagem que o middleware já faz no banco; se ele não consulta o banco por requisição, usar o marco de revogação de sessão que o desativar já grava). Teste: sessão aberta + desativar → próxima chamada 401.
- [ ] Login por senha bem-sucedido grava `auth.login` (ator = e-mail, `project_id` = `client_project_id`); falha **não** grava e-mail inexistente (evita enumeração na trilha). Teste.
- [ ] `user.updated` grava `old_value`/`new_value` só para `role`, `client_project_id`, `name`, `email` (nunca senha) e `project_id` = projeto da conta (antes era NULL). Teste: aparece em `GET /projects/:id/audit-trail`.
- [ ] `GET /users` devolve `ativo`. Teste.

### Task 2.2: Frontend

**Files:** `frontend/src/views/admin.js`. **Tests:** `frontend/test/admin-*.test.js` (o que já testa a tela de usuários; `ls frontend/test | grep -i admin`).
- [ ] Lista: coluna "Situação" (Ativa/Desativada) e o título deixa de dizer "Contas ativas"; filtro "Mostrar desativadas" (padrão: escondidas).
- [ ] Ação "Desativar"/"Reativar" por linha (confirmação na própria janela); "Excluir definitivamente" só para `platform_admin`, com confirmação na janela e texto explicando que apaga a conta.
- [ ] Testes: desativar envia `PUT /users/:id/ativo {ativo:false}`; desativada aparece com o filtro; botão definitivo ausente para não-platform_admin.
- [ ] Verificação mínima; docs (AGENTS: regra de desativar; CHANGELOG); commit; PR; merge; (migration se houver); deploy; health.

---

## Fase 3 — SSO na tela e configuração de SSO/SCIM/política (PR `feat/sso-tela`)

### Task 3.1: Login por SSO no frontend

**Files:** `frontend/src/globals.js` (fluxo de login, `doLogin`), `frontend/login.html` (botão), `frontend/src/api.js`
se preciso. **Tests:** `frontend/test/sso-login.test.js` (novo).
Fatos: `POST /api/v1/public/sso/iniciar` `{ email }` → `{ sso: true, autorizacao: <url> }` quando o domínio do e-mail tem SSO, senão `{ sso: false }` (conferir a forma exata em `src/routes/public.ts:289-304`); o callback devolve o navegador para `${appUrl}/#sso_token=<t>` ou `/#sso_erro=<motivo>` (`public.ts`).
- [ ] No login: depois de digitar o e-mail e ao clicar "Entrar", se o campo de senha estiver vazio, chamar `sso/iniciar`; `sso:true` → `location.assign(autorizacao)`; `sso:false` → pedir a senha como hoje. Botão secundário "Entrar com SSO da minha empresa" faz o mesmo explicitamente.
- [ ] No boot (antes de `initApp` decidir a tela): `#sso_token=` → gravar como o token de sessão (`S.token`, mesmo armazenamento do login por senha), limpar o hash com `history.replaceState`, seguir o fluxo normal; `#sso_erro=` → mostrar a mensagem (escapada) no cartão de login e limpar o hash.
- [ ] Testes: e-mail com SSO redireciona; sem SSO pede senha; `#sso_token` vira sessão e some da URL; `#sso_erro` aparece escapado.

### Task 3.2: Telas de SSO, SCIM e política de segurança do projeto

**Files:** `frontend/src/views/` (nova `seguranca-projeto.js` ou dentro de `project.js`, seguindo o padrão), menu do
módulo (aba do projeto). Rotas existentes: `PUT/GET /projects/:id/sso` (`somenteNess`), `POST /projects/:id/scim-token`
(`somenteNess`), `GET/PUT /projects/:id/security-policy` (`somenteNess`) — conferir em `src/routes/projects.ts` a forma
dos corpos. **Tests:** `frontend/test/seguranca-projeto.test.js`.
- [ ] Cartão "Login corporativo (SSO)": issuer, client_id, client_secret (só escrita; nunca exibido), domínios, papel padrão (org_admin/org_user/client), ativo; salvar.
- [ ] Cartão "Provisionamento (SCIM)": gerar token (mostrado uma vez, com aviso), URL base (`appUrl/scim/v2`) para copiar.
- [ ] Cartão "Política de segurança": MFA obrigatório para usuários do cliente, lista de IPs (o que a rota aceitar).
- [ ] Visível só para a equipe da consultoria (`ehEquipeNess` do frontend). Testes: campos, corpo enviado, segredo nunca renderizado de volta, ocultação para cliente.
- [ ] Verificação mínima; docs; commit; PR; merge; deploy; health.

---

## Fase 4 — n.360 fatia 2: "Conta e acessos" no início (PR `feat/n360-conta-acessos`)

### Task 4.1

**Files:** `frontend/src/produto.js` (casca `n360`), `frontend/login.html` (grupo "Conta e acessos"), `frontend/src/views/inicio.js`,
`frontend/src/views/project.js` (lista de projetos com o cartão Produtos acessível no n.360). **Tests:** `frontend/test/produto.test.js`, `frontend/test/inicio-view.test.js`.
- [ ] Na casca `n360`, o menu mostra o grupo "Conta e acessos": Projetos (com o cartão Produtos), Usuários, Organizações (platform_admin), Chaves de API (platform_admin), Conectar agente (consultor).
- [ ] Nos módulos (`/iso`, `/privacy`), esses itens somem do menu do módulo e o rodapé tem "Conta e acessos (n.360)" levando a `/` com a tela pedida (`/?tela=users` lido no boot, só valores de uma lista fechada).
- [ ] A lista de projetos (com "Produtos") passa a estar disponível no n.360 para platform_admin e consultoria_admin — resolve "habilitar n.privacy exige ir ao n.iso".
- [ ] Testes: itens por casca e por papel; link do módulo para `/?tela=…`; lista fechada de telas aceitas.
- [ ] Verificação mínima; docs (AGENTS, bloco do n.360); commit; PR; merge; deploy; health.

---

## Fase 5 — Agentes do n.privacy (PR `feat/agentes-privacy`)

### Task 5.1: Chat por módulo

**Files:** `src/routes/ai.ts` (`POST /projects/:id/chat`), `frontend/src/views/` (onde o chat chama a rota). **Tests:** `test/ai-chat.test.ts` (ou o existente: `git grep -l "/chat" -- test`).
- [ ] Corpo aceita `modulo` (`iso`|`privacy`, opcional; padrão `iso`); o servidor confere que o projeto e a pessoa têm o módulo (403 senão); com `privacy`, o prompt de sistema é de privacidade (LGPD, ANPD, RoPA, titular, incidente; responde em PT-BR; não inventa prazo legal — cita `parametros_legais` quando houver); com `iso`, o atual.
- [ ] O frontend manda `modulo: produtoAtual()` (no n.360, sem módulo → `iso`).
- [ ] Testes com IA simulada: prompt escolhido pelo módulo; 403 sem o módulo.

### Task 5.2: Skill de privacidade para o agente MCP

**Files:** `agent-skills/maturidade-lgpd/SKILL.md` (+ `references/` se precisar), `src/mcp/skills-gerado.ts` (via `npm run skills:gerar`), `src/mcp/contexto.ts` (roteiro aponta a skill). **Tests:** `test/agente-skills.test.ts`.
- [ ] Skill no molde de `agent-skills/prontidao-certificacao` (ler antes): método de avaliação de maturidade LGPD só leitura sobre as rotas do mapa (RoPA, terceiros, titular, incidentes, encarregado, `/requisitos/lacunas?fonte=lgpd|anpd`, `/ponto-de-partida`), saída em tabela com achado, fonte e próxima ação; não grava nada; não emite parecer jurídico.
- [ ] `npm run skills:gerar`; o teste falha se o gerado ficar velho.

### Task 5.3: Agentes de rascunho no n.privacy (aprovação humana)

**Files:** `src/agents/privacidade.ts` (novo, `extends BaseAgent`), rotas em `src/routes/` existentes do n.privacy (faixa `privacy`), telas correspondentes. **Tests:** `test/agentes-privacy.test.ts`, jsdom das telas.
- [ ] **Sugestão para tratamento**: `POST /projects/:id/ropa/:rid/sugestao` → `{ base_legal, retencao, dpia_requerido, justificativa }` a partir dos campos do tratamento; nada é gravado; a tela de ligações mostra "Sugerir" e "Aplicar" (aplicar = os PUT existentes). Esquema zod estrito na saída do modelo.
- [ ] **Rascunho de resposta ao titular**: `POST /projects/:id/titular-pedidos/:pid/rascunho` → `{ texto }` pelo tipo do pedido; a janela do pedido mostra o rascunho editável; enviar continua sendo o `PUT` atual.
- [ ] **Rascunho de comunicação de incidente**: `POST /projects/:id/incidentes/:iid/rascunho-comunicacao` `{ destino: anpd|titular }` → `{ texto }` com os campos da Res. CD/ANPD 15/2024 que o incidente tem e os que faltam listados; a janela do incidente mostra o rascunho.
- [ ] Equipe da consultoria e org_admin com o módulo podem pedir rascunho; trilha `agente.rascunho` (sem o texto). Testes com IA simulada: formato validado, 403 sem módulo, nada gravado no registro.
- [ ] Verificação mínima; docs (AGENTS, `docs/agente/`); commit; PR; merge; deploy; health.

---

## Fase 6 — Importação, fatias 2 a 4 (um PR por fatia)

Base: `src/services/importacao.ts`, `src/agents/importacao.ts`, `src/schemas/importacao.ts`, `frontend/src/views/importacao.js`.
Padrão de cada fatia: `entidade` nova em `importacao_itens` (CHECK na migration — conferir; se `entidade` tiver CHECK só com `tratamento`, migration `00NN` amplia), extração por tipo de arquivo já classificado (`aguardando` passa a ser processado), esquema zod estrito, revisão na mesma tela (aba por entidade), gravação pelos serviços existentes, duplicata contra o cadastro, trilha `importacao.gravada`.

### Task 6.1: Terceiros (PR `feat/importacao-terceiros`)
- [ ] Extrai `{ nome, tipo (grande_provedor|medio|pequeno|critico|null), cnpj?, contato?, ultima_avaliacao?: { resultado, valido_ate, metodo }, dpa? (nome do documento) , tratamentos[] (finalidades) }`.
- [ ] Gravação: parte organização (casando por nome normalizado), `definirTipo`, `registrarAvaliacao` se houver avaliação válida (validade no futuro), vínculo com tratamentos já existentes por finalidade normalizada. Duplicata = parte organização com o mesmo nome.
- [ ] Testes: extração simulada válida/inválida; gravação cria parte + tipo + avaliação + vínculo; duplicata; reimportar não duplica.

### Task 6.2: Documentos e avaliações (PR `feat/importacao-documentos`)
- [ ] Classificados `documento` (política, aviso, norma) → item `documento` `{ titulo, tipo (politica|norma|procedimento), resumo }`; ao gravar, cria o documento como rascunho (`src/services/documentos.ts`) com o texto convertido como versão em rascunho e o arquivo original guardado como evidência ligada.
- [ ] Classificados `avaliacao` (DPIA, LIA) → item `dpia` ou `lia` `{ tratamento (finalidade), conclusao, riscos[] }`; ao gravar, cria a DPIA/LIA ligada ao tratamento casado (`src/services/lia.ts`, rota de DPIA a partir do tratamento); sem tratamento casado → recusado com motivo.
- [ ] Testes equivalentes aos da 6.1.

### Task 6.3: Histórico operacional (PR `feat/importacao-historico`)
- [ ] Classificados `historico`: pedidos do titular `{ tipo, recebido_em, status, respondido_em?, canal? }` (sem nome/CPF: `titular_ref` pseudonimizado se houver), incidentes `{ titulo, ciencia_em, risco_titular?, comunicacao_anpd_em?, comunicacao_titular_em?, status }`, consentimentos `{ tratamento, titular_ref, finalidade, obtido_em, revogado_em? }`.
- [ ] Datas e protocolos originais preservados (protocolo original vai na descrição; o protocolo do sistema é gerado como hoje); prazos não recalculados para registros já encerrados.
- [ ] Gravação pelos serviços existentes (`titular-pedidos.ts`, `incidentes.ts`, `consentimentos.ts`) com uma função de "importar histórico" que aceita datas passadas e status final sem disparar avisos de prazo.
- [ ] Testes: datas preservadas; nada de aviso de prazo para encerrados; dado pessoal não entra além do permitido pelo esquema.

Cada fatia: verificação mínima; docs (AGENTS, CHANGELOG, migrations se houver); commit; PR; merge; (migration); deploy; health.

---

## Fase 7 — Fechamento

- [ ] Rodar `conferencia-dados.yml` de novo e colar a saída no CHANGELOG ("Operação").
- [ ] `AGENTS.md`/`README.md`: contagens finais com comando; remover do AGENTS qualquer frase que diga "não foi feito" sobre o que estas fases fizeram.
- [ ] Relatório final ao dono: o que entrou (PR → SHA → health), o que depende dele (Turnstile/#340 se ainda bloqueado; validação jurídica dos 179 pares; MFA obrigatório para a equipe — decisão dele).

## Fora deste plano (decisão do dono)

- MFA obrigatório para a equipe da consultoria (bloquearia quem não tem autenticador; precisa de decisão e aviso).
- Validação jurídica dos mapeamentos e dos títulos do catálogo (trabalho humano, na tela de requisitos).
- Mudar o recurso OAuth do MCP de `niso` para `n360` (exige convivência com conectores já emitidos).
