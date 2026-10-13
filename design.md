# Design do n.360 — identidade ness. aplicada à plataforma e aos módulos

Princípios visuais do produto. **Valores de cor, fonte e métrica não ficam aqui**: a fonte única
é o bloco `:root` de [`frontend/src/style.css`](frontend/src/style.css). A versão anterior deste
arquivo copiava os valores (`#070b14`, glassmorphism, "nunca peso 600") e envelheceu sem
ninguém ver; a landing antiga seguiu a cópia e saiu da marca.

O pacote de handoff visual (protótipos navegáveis) está em
[`docs/design/handoff-ness-v1/`](docs/design/handoff-ness-v1/); o diagnóstico de design de 12/10/2026,
por casca, em [`docs/design/diagnostico-2026-10-12/`](docs/design/diagnostico-2026-10-12/README.md).

## Nome

- Marca: `ness.` — sempre minúsculo, com ponto. Nunca "Ness", "NESS" ou "Ness.".
- Produtos: `n.360` (a plataforma), `n.iso` e `n.privacy` (os módulos), com o ponto em accent, como a
  marca. `n360` só no endereço.
- Identificadores de código (`niso`, `NISO_*`, o cabeçalho `X-nISO-Signature`) não são texto
  visível e não mudam.

## Tokens (em `frontend/src/style.css`, `:root`)

| Grupo | Tokens |
|---|---|
| Marca | `--accent`, `--accent-hover`, `--accent-active`, `--accent-dim`, `--accent-ink` |
| Superfícies | `--bg` (fundo da página e do header), `--surface` (sidebar, cards), `--surface-2`, `--border` |
| Tinta | `--text`, `--text-2`, `--text-dim`, `--text-faint` (contraste medido no comentário de cada um) |
| Semânticos | `--success`, `--warning`, `--danger`, `--info` |
| Tipografia | `--font-head` (Montserrat), `--font-body` (Inter), `--font-mono` |
| Geometria | `--radius: 0` — as superfícies são quadradas (ver Regras) |
| Shell | `--hdr-h` (altura do header e da banda da marca), `--side-w`, `--side-w-rail` |

Para ver os valores: `sed -n '/^:root/,/^}/p' frontend/src/style.css`.

## Regras

- Um tema só, o escuro. Sem alternância de tema.
- Tipografia: Inter no corpo; Montserrat 500 na marca e 600 em títulos.
- Accent só em elemento interativo e foco; nunca como fundo de área.
- Sem itálico, sem emoji, sem ícone decorativo.
- Sem blur e sem gradiente na elevação (`--glass-blur: none`).
- Geometria: **superfícies quadradas, controles com 10px.** Card, modal, badge, chip, item de lista,
  barra de progresso e tabela usam `border-radius: var(--radius)` (= 0). Botões e controles de
  formulário (`.btn`, `.btn-primary`, `.btn-secondary`, `.form-input`, `.form-select`,
  `.ness-select-*`, `.dropdown-menu`, `.wizard-step`, `.yesno-btn`) têm `10px` literal em `style.css`.
  Estilo inline nas telas só aceita `0` ou `10px` (`frontend/test/catracas-visuais.test.js`); o
  inline de 10px ainda existe em controles de algumas telas
  (`git grep -c "border-radius:\s*10px" -- 'frontend/src/views/*.js'`), e o diagnóstico de 12/10
  (`docs/design/diagnostico-2026-10-12/`) tirou os raios fora da regra (6px, 12px, 16px).
- Login: tela dividida, marca à esquerda e cartão à direita; empilha abaixo de 900px.

## Utilitários de tela (`frontend/src/ui.js`)

Toda tela usa os mesmos quatro, expostos em `window`:

- `renderPageHeader(title, subtitle, actionsHtml)` — cabeçalho da tela.
- `renderStatCards(statsArray)` — faixa de indicadores.
- `renderStatusBadge(type, text)` — selo de status (`success`, `warning`, `danger`, `info`, `neutral`).
- `renderDataTable(columns, rows, options)` — tabela com estado vazio (`emptyMessage`).

Eventos por `data-action` (delegação); nada de handler inline nem `<script>` inline, que o CSP
(`script-src 'self'`) recusa.
