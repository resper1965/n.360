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
| Geometria | `--radius: 0` — o sistema é quadrado (ver Regras) |
| Shell | `--hdr-h` (altura do header e da banda da marca), `--side-w`, `--side-w-rail` |

Para ver os valores: `sed -n '/^:root/,/^}/p' frontend/src/style.css`.

## Regras

- Um tema só, o escuro. Sem alternância de tema.
- Tipografia: Inter no corpo; Montserrat 500 na marca e 600 em títulos.
- Accent só em elemento interativo e foco; nunca como fundo de área.
- Sem itálico, sem emoji, sem ícone decorativo.
- Sem blur e sem gradiente na elevação (`--glass-blur: none`).
- Geometria: **o sistema é quadrado** (`--radius: 0`). A regra antiga "inputs e botões com 10px"
  está superada. Como a cascata fica hoje (`frontend/src/style.css`):
  - O bloco "Correções de superfície herdadas", no fim do arquivo, põe `border-radius: var(--radius)`
    em `.sidebar-nav`, `.btn`, `.btn-primary`, `.btn-secondary`, `.chip`, `.form-input`, `.form-select`,
    `.stat-card`, `.card`, `.table-container`, `.toast`, `.badge` e `.modal`. Mesma especificidade, vem
    depois: vence. Os `border-radius: 10px` dessas classes perto do topo do arquivo são **código morto**.
    O CSS do build confirma a ordem (`npm run build --prefix frontend`; em `dist/assets/login-*.css` o
    `.btn{...}` vem antes da regra de sobreposição).
  - Ainda renderizam com 10px: `.wizard-step`, `.yesno-btn`, `.ness-select-trigger`,
    `.ness-select-options` e `.dropdown-menu`, que ficaram fora da sobreposição (usados em
    `commercial.js`, `compliance.js`, `monitor.js` e `globals.js`), e os estilos inline das telas
    (`git grep -c "border-radius:\s*10px" -- 'frontend/src/views/*.js'`: 41 em 4 arquivos em 2026-10-12).
    Regra de CSS não vence atributo `style`; eles vão a 0 conforme cada tela é revisitada.
  - `frontend/test/catracas-visuais.test.js` só aceita `0` ou `10px` inline: o 10px é tolerado até a
    limpeza, não é o padrão. Componente novo nasce quadrado.
- Login: tela dividida, marca à esquerda e cartão à direita; empilha abaixo de 900px.

## Utilitários de tela (`frontend/src/ui.js`)

Toda tela usa os mesmos quatro, expostos em `window`:

- `renderPageHeader(title, subtitle, actionsHtml)` — cabeçalho da tela.
- `renderStatCards(statsArray)` — faixa de indicadores.
- `renderStatusBadge(type, text)` — selo de status (`success`, `warning`, `danger`, `info`, `neutral`).
- `renderDataTable(columns, rows, options)` — tabela com estado vazio (`emptyMessage`).

Eventos por `data-action` (delegação); nada de handler inline nem `<script>` inline, que o CSP
(`script-src 'self'`) recusa.
