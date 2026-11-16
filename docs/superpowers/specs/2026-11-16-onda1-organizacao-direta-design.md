# Onda 1: organização direta

Data: 16/11/2026. Situação: **rascunho para aprovação do dono**. Onda 1 da spec guarda-chuva
`2026-11-14-n360-posicionamento-e-fluxo-design.md`. Base: levantamento somente leitura sobre o HEAD `7c62670`.

## O pedido

Uma empresa usa o n.360 por conta própria, sem consultoria no meio ("organização do tipo direta"). A mesma equipe pede, executa e
aprova. O n.360 hoje assume que quem presta o serviço (equipe) e quem o recebe (cliente) são pessoas diferentes.

## Decisões do dono

| # | Decisão | Resposta |
|---|---|---|
| 1 | Admin da organização direta | `consultoria_admin` (papel existente), com as travas passando a aceitá-lo só em organização do tipo direta |
| 3 | Gestor ARCiber (n.ot) | `consultoria_admin` da organização direta que também conste no cargo Gestor ARCiber (titular ou suplente) na governança |
| 4 | Colega aprova o que outro criou | Sim; só a mesma pessoa é barrada |
| 5 | Criador diferente de decisor | Em **toda** organização (uma regra só) |

### A rever (recomendação minha, ainda não respondida)

| # | Tema | Recomendação |
|---|---|---|
| 2 | `consultor` da direta | Alcança só os projetos em que está designado na governança (regra única, já testada) |
| 6 | Pessoa diferente ao encerrar incidente, abrir exceção de passo, marcar requisito não aplicável | Exigir só no incidente |
| 7 | Achado de auditoria interna | Liberar o admin direto, registrado como decisão. Hoje a equipe nunca registra (auth.ts:380) |
| 8 | Contas de cliente na direta | Só equipe |
| 9 | SSO/SCIM | Fora da onda 1 (só criam cliente) |
| 10 | Módulos e limites | Módulos definidos na criação; `max_users` segue contando toda a equipe |
| 11 | Área comercial e prefixo de proposta | Recusar na direta (`ehComercial` falso) |
| 12 | Termo de uso | Texto próprio da direta |
| 13 | `data-subject` (rota antiga) | Aceitar só o admin direto, por ora |
| 14 | Tipo depois de criado | Imutável |

## Modelo

- `organizations` ganha `tipo` (`consultoria` | `direta`), `DEFAULT 'consultoria'`, sem backfill. Migration `0113` (conferir a main antes) e
  `schema.sql` juntos; `test/migrations-consistencia.test.ts` cobra os dois.
- **Não reaproveitar `plan`**: ele já recebe o literal `'consultoria'` na criação.
- Criar organização continua `platform_admin` (`POST /api/v1/platform/orgs`). `criarOrgSchema` ganha `tipo` e `modulos`.
- O tipo é lido **do banco**, pela organização da sessão e igual a `projects.org_id`; nunca do `X-Org-Id`.
- O gatilho `usuario_modulos_padrao` e P0-1/P0-2 do n.ot não mudam: a equipe direta só recebe `ot` por concessão explícita.

## As sete travas que passam a aceitar o admin direto

Cada uma aceita `consultoria_admin` **somente** quando a organização da sessão é `direta` e é a dona do projeto. Agente e chave de API
(`role: 'client'`) continuam recusados; nada é derivado de `ehEquipeNess`, que aceita `agente_decisao`.

1. `ehGestorArciber` (ot.ts:814): com a decisão 3. Passa a consultar o banco (hoje é síncrona).
2. `podeMexerEmAssinatura` (helpers.ts:498): linha de quem assina na governança.
3. `PODE_REVOGAR_APROVACAO` (helpers.ts:24): vira função, usada em governance, platform, ropa e ropa-abas/situacao.
4. `data-subject.ts:19`: só o admin direto (decisão 13).
5. `podeVerCompleto`/`podeAprovar` (ot-inventario.ts:35): IP/MAC e aprovar lote.
6. `painel-ot.ts:19,23`: pendências "gestor" e "aprova".
7. `avisos-prazo.ts:324` (`SO_GESTOR`): avisos de aceite e obra.

Nenhum dos 34 guards `ehEquipeNess` muda.

## Regra "quem criou não decide"

Hoje ela existe só em lote do n.ot e evidência. Passa a existir também em:
- pedido (`routes/pedidos.ts` decisão, compara `criado_por`);
- base do site do n.ot (`aprovarBase`, compara `base_pedida_por`);
- avaliação do n.ot (confirmar compara com quem avaliou; conferir `confirmarAvaliacao` inteira no plano).

Vale em toda organização. Mensagem de recusa em português, sem revelar quem criou.

## Textos e telas

- "Consultorias" vira "Organizações" (login, organizacoes.js, produto.js, admin.js). Frases voltadas ao cliente que dizem
  "consultoria" ficam, com ajuste só onde a organização direta as vê.
- `organizacoes.js`: tipo e módulos na criação; tipo na lista.
- "Esperando a sua decisão": o painel passa a mandar `decisoes` também ao destinatário que é equipe; "Minhas aprovações" já existe.
- Não conferido: telas `ot-*.js` (49 linhas com `org_admin`).

## Testes

- Terceira organização `direta` no contrato de isolamento (`test/contrato-isolamento-org.test.ts`), nos dois sentidos.
- Cada trava: o admin direto passa na própria organização, é recusado em outra, e o `consultoria_admin` de consultoria segue recusado.
- Agente e chave de API da direta recusados nas travas e no n.ot; equipe da direta sem `ot` por padrão.
- Criador ≠ decisor: pedido, base, avaliação.
- Criação com tipo e valor padrão nas organizações existentes.

## Entrega

Três PRs: (1) migration, tipo e criação; (2) as sete travas e a regra de pessoa diferente, com os testes de isolamento;
(3) textos e telas. Migration segue o procedimento de `migrations/README.md` (backup, apply remoto, conferir, só então merge).

## Não conferido

Texto do termo de uso, SCIM, assinatura da análise crítica, `confirmarAvaliacao` completa, telas `ot-*.js`, estado das migrations em
produção (o README dizia 0109; a última no disco é 0113, ainda não aplicada).

## Rulings da execução

- O `platform_admin` pode criar conta de cliente em projeto de organização direta (break-glass); `POST /users` e a troca de papel equipe→cliente só recusam os demais criadores.
- A direta fica sem tela de identidade na onda 1: `GET /org/config` é comercial-only e devolve custo e margem; liberar exige mudar a autorização no servidor.
- A regra criador ≠ decisor vale em toda organização, inclusive no encerramento de incidente. O agente é resolvido para quem o concedeu (`agente_conta`).
- SSO/SCIM e convite de stakeholder ficam fora da onda 1 (não checam o tipo da organização).
- O pedido criado pela própria pessoa nunca aparece em "Minhas aprovações" nem em `decisoes`.
