# Constituição do n.360

A única constituição do projeto. A cópia-modelo do Spec Kit em `.specify/memory/` foi
removida em 2026-10-06: tinha só os marcadores do template e competia com esta.

O que muda com frequência (números, rotas, bindings) vive no [`AGENTS.md`](AGENTS.md), com o
comando que mede cada número. Aqui ficam os princípios, que não envelhecem a cada PR.

## Princípios

### I. Nada se afirma sem evidência
"Mergeado", "aplicado" e "em produção" só valem com a saída colada do comando que prova. Todo
número em documento leva ao lado o comando que o mede. Regra completa no `AGENTS.md`.

### II. Stack da Cloudflare
Hono no Cloudflare Workers, D1, KV, R2 e Workers AI. Frontend SPA em JavaScript sem framework,
empacotado pelo Vite. Sem framework é decisão, não dívida.

### III. Foco nas normas e na lei
O n.iso segue a ISO 27001:2022 e a ISO 27701; o n.privacy, a LGPD e as resoluções da ANPD; o n.ot, a
rotina operacional RO-CB.BR.01 do ONS (ARCiber). Toda
funcionalidade, política, avaliação e controle segue a referência do seu módulo. A IA produz rascunho; quem
aprova é uma pessoa, e cada aprovação deixa assinatura e trilha.

### IV. Segurança por padrão
Isolamento de tenant provado por teste, validação de corpo por Zod, parâmetros vinculados no
D1, RBAC no middleware, segredo só em `wrangler secret`, trilha de auditoria imutável. Os
invariantes que não podem regredir estão no [`SECURITY.md`](SECURITY.md).

### V. Teste contra o banco real
Teste de caminho de banco roda contra o D1 real do pool `workerd`, não contra mock. Mudança de
schema entra em dois lugares: `schema.sql` e uma migration numerada.

### VI. Identidade da ness.
PT-BR em todo texto visível. Marca `ness.` (minúsculo, com ponto), plataforma `n.360` e módulos
`n.iso`, `n.privacy` e `n.ot`. Um tema
escuro só, sem itálico, sem emoji. Tokens visuais com fonte única em `frontend/src/style.css`
(`:root`); ver [`design.md`](design.md).

## Fluxo de trabalho

1. Mudança de arquitetura ou de comportamento começa por especificação e plano
   (`docs/superpowers/specs/` e `docs/superpowers/plans/`); plano executado vai para
   `docs/arquivo/`.
2. Teste antes do código (vermelho provado, depois verde).
3. Um PR por problema, a partir de `origin/main`; merge só com o CI verde.

## Governança

Esta constituição prevalece sobre decisões avulsas. Emenda é PR que altera este arquivo e diz por
quê.

**Versão**: 2.0.0 | **Ratificada**: 2026-07-02 | **Última emenda**: 2026-10-06
