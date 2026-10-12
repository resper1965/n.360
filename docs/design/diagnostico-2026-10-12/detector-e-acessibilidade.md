# Assessment B — Detector + Browser Evidence (PT-BR)

Alvo:  (frontend/login.html, frontend/src, frontend/public). Resultado bruto: critique\detect.json, critique\detect-browser.json, screenshots critique\detect-*.png.

## 1. Detector CLI
Comando: `sh .../impeccable detect --json frontend/login.html frontend/src frontend/public` -> exit 2, **155 achados**, todos severity `warning`.

| Regra | Qtde | Categoria | Arquivos principais / exemplos |
|---|---|---|---|
| overused-font | 111 | slop | style.css 24, views/monitor.js 19, views/grc.js 16, globals.js 11, compliance.js 10, dashboard.js 7. Ex.: login.html (Inter, Montserrat), globals.js:71 `font-family: 'Inter` |
| layout-transition | 14 | quality | login.html 8 (`max-height` x7, `width, padding`), style.css:217 (max-height), :287 (width, padding), :358 e :1064 (width), monitor.js:160 e :238 (width) |
| undersized-ui-text | 14 | quality | login.html 14 (10px: "privacidade", "termos", "n.iso 1.8.0"; piso de 11px) |
| side-tab | 7 | slop | style.css:277; compliance.js:69; project.js:329, :335, :381, :990; proposta.css:64 (`border-left: 2-3px solid`) |
| clipped-overflow-container | 3 | quality | login.html: body, nav.sidebar, main.main |
| cramped-padding | 2 | quality | login.html: `.sidebar-logo` (border-bottom sem inset), `.tenant-face` |
| tiny-text | 1 | quality | login.html (10px body text) |
| dark-glow | 1 | slop | login.html (box-shadow colorido #00ade8) |
| broken-image | 1 | quality | views/config-comercial.js:258 `<img id="cfg-logo-previa" alt="...">` sem src |
| nested-cards | 1 | slop | public/politicas.html (div card dentro de card) |

Nota: o detector reporta `line: 0` para login.html (analisa o DOM/CSS resolvido, não a linha). Nenhuma regra de contraste, falta de alt ou rótulo disparou na varredura estática.

## 2. Overlay ao vivo (detect.js)
- `impeccable live-server --background` subiu em http://localhost:8400 (a chamada ficou presa no `| head`, mas o servidor subiu; /detect.js respondeu 200). Parado com `live-server stop --keep-inject` (porta 8400 -> 000 depois). Spec temporário `zz-detect.spec.js` apagado; `git status` do worktree só mostra o `zz-impeccable.spec.js` que já existia.
- Injeção: **OK por `<script src>` só na 1ª página** (n360). Nas outras 4 (`/privacy`, `/iso`, servidas via `servirShell` por `page.route` fulfill) `addScriptTag({url})` falhou ("Failed to load script", e `fetch` de dentro da página também falhou: `Failed to fetch`; sem meta CSP -> provável bloqueio de rede/Private Network Access ao sair de 127.0.0.1:8787 para localhost:8400 depois da primeira navegação). Fallback: baixei o detect.js por Node e injetei com `addScriptTag({content})` — o detector rodou em todas as 5 páginas. Overlay visível em Chromium headless (sem aba [Human]), então **não há overlay visível ao usuário humano**; só o console e os screenshots.
- Console `[impeccable] N anti-patterns found` (a mensagem só traz a contagem): n360-entrada 58; privacy-encarregado 58; privacy-ropa 59; privacy-titular 58; iso-dashboard 68.
- Detalhe via `window.impeccableScan()`: 32 dos 58 achados em cada página vêm de **#login-overlay**, que está montado e invisível (ver 3.5). Achados nos elementos do app:
  - n360-entrada (26): layout-transition 9, ai-color-palette 5 (cyan neon text), undersized-ui-text 8 (9px: `.sidebar-label` "Conta e acessos"), clipped-overflow-container 4 (nav.sidebar), line-length 2, flat-type-hierarchy 1, skipped-heading 1, overused-font 1.
  - privacy-encarregado (26): idem + ai-color-palette 6, undersized 7; privacy-ropa (27): ai-color-palette 9, sem line-length; privacy-titular (26): ai-color-palette 8.
  - iso-dashboard (36): ai-color-palette 14 (inclui `svg/rect/path` de gráficos), layout-transition 11, undersized 8, cramped-padding 1, skipped-heading 1.
  - undersized-ui-text no app: `.sidebar-label` (Governança, Conta e acessos…) a 9px, em todas as telas.

## 3. Medições no navegador (1440x900, API mockada, platform_admin)
Páginas: n360-entrada (/login.html logado), /privacy encarregado, ropa, titular, /iso dashboard.

### 3.1 Contraste (WCAG, cor computada vs. fundo efetivo)
- Varredura de todos os nós de texto visíveis: **0 falhas** em 75, 90, 81, 72 e 116 nós (limiar 4.5; 3 para texto grande).
- Tokens (style.css :root) sobre --bg / --surface / --surface-2:
  - --text #f1f5f9: 16.88 / 14.24 / 12.35
  - --text-dim e --muted #94a3b8: 7.21 / 6.08 / 5.28
  - --text-faint #8fa0b6: 6.93 / 5.85 / 5.07
  - --accent #00ade8: 7.17 / 6.05 / 5.25
  - --success #10b981: 7.29 / 6.15 / 5.33; --warning #f59e0b: 8.61 / 7.26 / 6.30
  - **--danger #ef4444: 4.92 / 4.14 / 3.59** — falha AA para texto normal em --surface (4.14) e --surface-2 (3.59). Só passa em --bg. (Nenhum nó real falhou nas telas mockadas porque os estados de erro não foram renderizados; risco real em cartões com erro/severidade crítica.)
- Observação: o --text-faint (#8fa0b6) é praticamente igual ao --text-dim (#94a3b8): a hierarquia de 3 níveis de texto secundário na prática colapsa em dois.

### 3.2 Foco visível (Tab nos 10 primeiros focáveis)
- Todo elemento focado mostra outline sólido 2px #00ade8 (login-link, links, botões) -> **foco visível presente**. Algumas ocorrências com outline 3px em #f1f5f9 / 3px preto (padrão do navegador, inputs `.form-input`, "Entrar", SSO) — visível, mas inconsistente com o 2px accent.
- **Problema real**: o primeiro Tab cai em controles do login ocultos (ver 3.5), não em conteúdo do app. Em n360 o 1º foco é "Entrar com SSO da microsoft" -> "Esqueceu sua senha?" -> "privacidade/termos" (4 stops invisíveis) antes de chegar à sidebar. Nas telas /privacy e /iso o 1º foco é o skip-link ("Pular para o conteúdo", ok) e em seguida os 2 inputs do login, "Entrar", SSO, "Esqueceu a senha?", links (8 stops invisíveis).

### 3.3 Sidebar e ações primárias por teclado
- **Itens de navegação da sidebar são `<div class="sidebar-nav">` sem tabindex/role: 0 de 18 (n360/privacy) e 0 de 14 (iso) focáveis.** Também os cabeçalhos de grupo `div.sidebar-label` (role=button, sem tabindex). A navegação principal não é operável por teclado nem anunciada como link/botão (aria-current está em 1 item; sem role).
- Elementos com `data-action` clicáveis e não focáveis (div/span sem tabindex): n360 26 de 33; privacy 25 de 31-35; iso 19 de 27 (todos na sidebar nos exemplos coletados).
- Nos 70 Tab seguintes, os stops que caem em `nav.sidebar` são só: toggle "Recolher navegação", select "Projeto ativo", cartão de usuário e links do rodapé (11-24 stops contando os ocultos), nunca os itens de menu.
- Botões primários do conteúdo (`button.btn`, "+ Nova Atividade") são `<button>` nativos: ok.

### 3.4 Nome acessível, alt, rótulos, headings, landmarks
- Botões/links/inputs sem nome acessível: **0** nas 5 páginas; inputs sem label: 0; placeholder-only: 0.
- Imagens: 0 `<img>` no DOM nas 5 páginas (config-comercial.js:258 não foi visitada com dados; tem alt, mas sem src -> achado "broken-image" do detector é falso positivo parcial, pois o src é setado em runtime — não verifiquei).
- Headings: **h1 duplicado (2 h1 visíveis por tela)** em todas as páginas; sequências: n360 `1133` (h1->h3), encarregado `113`, ropa/titular `11`, iso-dashboard `1233323333133` (h1->h2->h3 ok, mas começa com h1 e ainda há outro h1; um salto h1->h3).
- Landmarks: main e nav presentes, `lang="pt-BR"`, skip-link presente.
- Texto < 12px: 20-24 elementos por tela (9px x6-8, 10px x6-7, 11.2px x4-9, 8.8px x1) — rótulos de sidebar, selos "n.privacy", etc.

### 3.5 Login overlay montado e focável
`#login-overlay` no app logado: `class="hidden"`, **display:block, visibility:visible, opacity:0, pointer-events:none, z-index:9999**, cobre 1440x900, sem `inert`/`aria-hidden`. Consequências: (a) Tab entra em campos invisíveis; (b) leitores de tela leem o formulário de login por cima do app; (c) o detector/overlay conta 32 achados falsos nele. Correção sugerida: `display:none`, `visibility:hidden` ou `inert` quando oculto.

## 4. Falsos positivos / ressalvas
- 32 dos 58-68 achados do overlay vivo estão no #login-overlay oculto (ruído, mas ele próprio é um bug de a11y).
- `ai-color-palette` "Cyan neon text on dark background": o accent #00ade8 é a cor oficial da marca ness. e passa contraste 7.17:1; o achado é estilístico (slop), não erro. Em `svg/rect/path` de gráficos é decorativo.
- `overused-font` (111): Inter/Montserrat são exigidos pela marca (AGENTS.md); 111 ocorrências são principalmente declarações repetidas de `font-family` em template strings, não 111 problemas. Tratar como 1 decisão de design.
- `side-tab` (7): `border-left` 2-3px de severidade/estado em cartões (compliance.js:69, project.js:990) é código de severidade — o padrão é arriscado, mas intencional.
- `layout-transition` em `sidebar-group max-height`/`width` de barras de progresso: reais, impacto de performance pequeno.
- `broken-image` config-comercial.js:258: `<img>` de pré-visualização sem src até o upload; provável falso positivo.
- `line: 0` em login.html: o detector avalia o DOM computado; não localiza linha-fonte.
- Contraste "0 falhas" mede só estados renderizados com API mockada vazia (listas vazias, sem badges de erro); não cobre `--danger` em texto.
- Contagem de nós de texto: o cálculo considera opacidade só do próprio elemento (texto do login oculto entra na conta; não alterou o resultado).

## 5. Passos pulados ou com limitação
- Aba [Human] / overlay visível ao usuário: não disponível (Chromium headless via Playwright, sem browser MCP aberto). Só console + `impeccableScan()` + screenshots.
- Injeção por URL falhou nas páginas 2-5 (motivo em 2); resolvido por injeção de conteúdo.
- Telas medidas com API mockada (listas vazias); estados de erro, modais e tabelas cheias não foram medidos. Views não visitadas: as demais ~43 do zz-impeccable.spec.js.
- `.impeccable/` já existia como untracked no repositório principal antes do trabalho; nenhum arquivo rastreado foi alterado.
