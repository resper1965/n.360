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
| Tipografia | `--font-head` (Montserrat), `--font-body` (Inter), `--font-mono` (JetBrains Mono); escala `--fs-xs` a `--fs-2xl` |
| Tinta de estado | `--danger-ink`, `--warning-ink`, `--success-ink` (texto do estado sobre `--surface`) |
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
  - Desde a onda 3 (15/10/2026) nenhum raio em px sobra em `style.css` nem inline
    (`git grep -nE "border-radius:\s*[1-9][0-9.]*(px|rem)" -- frontend/src` não imprime nada); só os círculos
    de 50% (pontos, avatar, spinner). `frontend/test/catracas-visuais.test.js` só aceita `0` inline.
    Componente novo nasce quadrado.
- **Tipografia**: escala em tokens no `:root` (`--fs-xs` 11px, o piso; `--fs-sm` 12px, botão e selo; `--fs-md`
  13px, corpo de tabela; `--fs-base` 14px; `--fs-lg`, `--fs-xl`, `--fs-2xl`). Nada abaixo de 11px. Pesos: Inter
  400/500/600, Montserrat 500 (marca) e 600 (títulos); nada de 300 nem 700. A JetBrains Mono (`--font-mono`, para
  hash, código e rótulo técnico) é carregada no `login.html` junto da Inter e da Montserrat.
- **Cor como texto**: vermelho de texto é `--danger-ink` (e `--warning-ink`, `--success-ink`), nunca `--danger`, que
  fica abaixo de 4,5:1 sobre `--surface`. O ciano não é cor de estado: `--info` é neutro claro.
- **Língua**: a tela é PT-BR mesmo quando o banco grava em inglês. Valor de banco passa por `rotuloDe(dominio,
  valor)` (`frontend/src/rotulos.js`; `traduzStatus` é o mapa geral) e data por `formatarData` (`ui.js`,
  dd/mm/aaaa e hh:mm). O valor gravado nunca muda. O título da tela é o rótulo do item de menu (`tituloDaTela`).
- **Estilo inline**: só para valor calculado em tempo de execução (cor de nível, largura de barra). O resto usa as
  classes de `style.css`: componentes (`.rotulo-campo`, `.valor-campo`, `.bloco`, `.cabecalho-secao`,
  `.acoes-rodape`, `.opcao-check`) e utilitários sobre tokens no fim do arquivo (`.t-sm`, `.t-dim`, `.mb-4`,
  `.d-flex`, `.gap-2`...). A catraca guarda o teto de `style=` por arquivo; ele só desce.
- Login: tela dividida, marca à esquerda e cartão à direita; empilha abaixo de 900px.
- **Uma ação principal por tela.** No máximo um `.btn-primary` visível por tela (cabeçalho e conteúdo
  somados; um modal aberto conta como tela). O primário é o próximo passo do papel (PRODUCT.md): o item
  mais urgente de "O que fazer", o "Abrir" do projeto mais urgente na carteira, a decisão do cliente, o
  pedido atrasado a responder. Abrir um módulo, exportar, importar e editar são secundários.
- **Acima de três ações secundárias, elas vão para o "Mais ações"** (`renderMaisAcoes` em `ui.js`).
  Na linha de tabela: uma ação à vista, com nome único (a ação e o registro, no `aria-label`), e o resto no
  "Mais ações" da linha; nenhum primário por linha. Destrutivo ("Excluir definitivamente", "Aposentar")
  nunca é primário nem fica ao lado do primário: vai por último no menu, depois do separador, com a
  confirmação de sempre.
- **O projeto ativo mora num lugar só**: o seletor do topo da barra lateral. Nome em até duas linhas, corte
  só visual (o nome inteiro no `title` e no rótulo do select). Sem selo de projeto no cabeçalho e sem lista
  de projetos no menu de conta; trocar de projeto é por ele ou pela carteira. "Tenant" não aparece na tela.
- **Páginas públicas** (`/politicas`, `/auditor`, `/homologacao`, `/proposta`): usam `frontend/public/publico.css`
  (tokens copiados do `:root`, conferidos por `frontend/test/publico-css.test.js`; topo com `n.360` e `ness.`, rodapé,
  botões, campos, avisos) e uma folha própria só com o que é da página. **São responsivas** (de 390 px ao desktop:
  alvos de 44 px, campos de 16 px), ao contrário do app: quem as abre é gente de fora, pelo link do e-mail, muitas
  vezes no celular. Sem `<style>`, `style=` nem diálogo nativo (`alert`/`confirm`); título da aba "Ação | n.360 · ness.".
- **Trilha de implementação do n.iso** (`frontend/src/views/bancada.js`, `frontend/src/bancada/*`; "Bancada" é só o
  codinome interno, nunca texto de tela). Três colunas: a trilha à esquerda (etapa, fase, passo), o cartão do passo no
  meio e o assistente à direita; a ordem do DOM é a do Tab. **Uma ação principal por passo**: "Salvar e ir ao próximo
  passo" (ou "Salvar e ver a prontidão" no último) é o único `.btn-primary`; pular, bloquear, concluir com exceção e
  reabrir são links secundários. Hierarquia de títulos: h1 é o projeto (`#header-title`), h2 a fase, h3 o passo e h3 o
  assistente (região `aria-labelledby`, sem h2 concorrente), h4 as seções do cartão. O que o servidor guarda é anunciado em
  `role="status"` ("Salvo às HH:MM", "Não foi possível salvar. Tentando de novo...", com `aria-busy` enquanto salva, para o
  leitor de tela só ouvir o resultado). O passo atual leva `aria-current="step"`; os botões do passo têm nome acessível
  "título, estado"; estado nunca só por cor. Os pontos da "Revisão de auditor" levam o foco ao campo, à prova ou ao
  critério ("Concluído quando"). Texto em português claro para o cliente, sem termo em inglês (guarda em
  `test/passos-catalogo.test.ts`) e sem prometer parecer de certificação.

## Utilitários de tela (`frontend/src/ui.js`)

Toda tela usa os mesmos, expostos em `window`:

- `renderPageHeader(title, subtitle, actionsHtml)` — cabeçalho da tela.
- `renderStatCards(statsArray)` — faixa de indicadores.
- `renderStatusBadge(type, text)` — o selo, família única (`success`, `warning`, `danger`, `info`, `neutral`); só
  classes (`.badge.selo-<tipo>`), o texto passa por `traduzStatus`.
- `renderDataTable(columns, rows, options)` — a tabela padrão, com estado vazio (`emptyMessage`).
- `renderEmptyState({ titulo, texto, acao, itens, compacto })` e `renderErrorState(mensagem, opções)` — o vazio (o
  que falta, o que fazer, a ação) e o erro de carga, nunca confundidos. `compacto` é o vazio de uma seção dentro de
  cartão, modal ou ficha.
- `openModal(html)` — o modal único: "Fechar" no topo, foco preso, Esc; com campo alterado, Esc, Fechar, Cancelar e
  o fundo perguntam "Descartar o que foi digitado?" na própria janela. Fechar depois de salvar é
  `forceCloseModal()` direto (não pergunta). Nada de `confirm()`: `confirmar`/`pedirTexto`.
- `formatarData(valor, { hora })`, `tituloDaTela(navId, padrão)` e `rotuloDe(dominio, valor)` (`rotulos.js`).
- `renderMaisAcoes(itens, { rotulo, nome })` — o menu "Mais ações" (botão de menu do WAI-ARIA: setas,
  Home/End, Esc devolve o foco, clique fora fecha); `itens` = `[{ rotulo, action, args, perigo }]`.

Eventos por `data-action` (delegação); nada de handler inline nem `<script>` inline, que o CSP
(`script-src 'self'`) recusa.
