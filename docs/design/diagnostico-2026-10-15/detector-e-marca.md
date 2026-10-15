# Avaliação B (evidência mecânica) — n.360 frontend

Worktree: C:\Users\resper\worktrees\design (HEAD 93f9bb1, origin/main). Nada alterado. Contagens são de ocorrências (linhas/matches), não de elementos renderizados; a maior parte do HTML vem de template string em JS.
Scripts reproduzíveis: scan.cjs, scan2.cjs, contrast.cjs, sum.cjs (mesma pasta); saídas: detector.json, detector-css.json, scan.json, scan2.json.

## 1. Detector Impeccable
Alvos: login.html, src/views, src/*.js, public/*.html|js (sem marked.min.js). O wrapper .cmd devolve exit 0 mesmo com achados; o JSON tem 103 achados. Rodei também src/style.css à parte (28 achados, todos de fonte/transição/side-tab).

| Regra | Qtd | Onde | Avaliação |
|---|---|---|---|
| overused-font | 77 (+23 no CSS) | Montserrat/Inter em 17 arquivos | FALSO POSITIVO: fontes são exigência da marca |
| layout-transition | 12 (+4 CSS) | login.html (max-height; width,padding), monitor.js:168, style.css:234,314,387 | Real, P3 (sidebar recolhe com width/padding; progress-fill com width) |
| side-tab | 5 (+1 CSS) | compliance.js:74, mapa-de-risco.js:30, project.js:340,386,1001, style.css:304 | Real mas atenuado: faixa de severidade em card; project.js:340 usa accent. P2 |
| clipped-overflow-container | 3 | login.html body/nav.sidebar/main | Provável FP: shell de app com overflow hidden por desenho (body `overflow:hidden`, style.css:90) |
| cramped-padding | 2 | login.html sidebar-logo, context-panel | Provável FP: detector não resolve o padding vindo do CSS externo (`.sidebar-logo` tem `padding: 0 20px`, style.css:189) |
| undersized-ui-text | 1 | login.html:496 "Administrador" 9px | Real, P2 (`.sidebar-user-role` 9px, style.css:253). No total há ~55 declarações de font-size < 11px |
| dark-glow | 1 | login.html (CSS em style.css:737 `.matrix-cell.selected` 0 0 14px accent-glow; 456 `.journey-card:hover` 0 8px 32px accent) | Real, P3; conflita com "sem glow" do produto |
| broken-image | 1 | config-comercial.js:269 | FALSO POSITIVO: `<img>` sem src é preenchida por JS ao escolher arquivo, dentro de `hidden` |
| nested-cards | 1 | public/politicas.html | Real, P3 (não verifiquei se o card interno é intencional) |

Por arquivo (total 103): monitor.js 21, login.html 19, grc.js 16, compliance.js 11, globals.js 11, privacy.js 6, project.js 4, politicas.html 3, demais 1-2. Sem findings de gradiente/glassmorphism/ícones; não há `linear-gradient` em lugar nenhum.

## 2. Conformidade de marca (guia ness-branding x repo)

| # | Verificação | Resultado (contagem) | Sev. | Observação |
|---|---|---|---|---|
| 1 | "Ness"/"NESS" em texto | 0 (git grep em frontend/ — login.html, src, public) | ok | |
| 2 | Produtos fora do padrão (N.iso, nIso, N360, n360 visível) | 0 visíveis. "n360" só como identificador (produto.js:11, ai.js:10 etc.) | ok | |
| 3 | Ponto da marca em accent | Wrapper existe no app: `.login-sign-house span`, `.account-sign-house span`, `.entry-mark span`/`.entry-dot` (style.css:107,144,281). Cobertura OK em login.html (8 usos de "ness<span>.</span>"), globals.js:789, documento-proposta.ts:351/415 | ok | Gaps: a) `<title>` e texto corrido de produtos (n.iso/n.privacy/n.360 em frases, ex. produto.js:266, globals.js:790 `account-sign-ver` sem ponto accent) não colorem o ponto — só o `.entry-mark` sim; b) politicas.html:8 título "n.iso / ness." |
| 4 | E-mails transacionais (src/routes/auth.ts:366, users.ts:185, pedidos.ts:329, services/avisos-prazo.ts:366) | 0 de 4 usam a marca com ponto accent; usam `#00ade8` como cor de TÍTULO e de fundo de botão com texto `#fff` (contraste 2,58:1) e `border-radius:5px/8px`. Textos ainda dizem "n.iso" (auth.ts:366/368, users.ts:185 "Bem-vindo ao n.iso!") enquanto o botão diz "n.360" (users.ts:195) | P1 | Texto branco sobre #00ade8 reprova AA; o próprio style.css documenta isso (`--accent-ink`). Inconsistência de nome de produto |
| 5 | Famílias de fonte (declaradas, 215 ocorrências) | Montserrat 74, Inter 25, var(--font-head) 31, var(--font-body) 12, var(--font-mono) 30, `inherit` 21, `monospace` 14, "Courier New" 1 (style.css:857), "Segoe UI" 1 (project.js:1091, janela de impressão) | P2 | Famílias estranhas: 3 ocorrências (Courier New, Segoe UI/Arial, monospace genérico x14) |
| 6 | JetBrains Mono carregada? | NÃO. Declarada em `--font-mono` (style.css:53) e usada 30 vezes (`.sidebar-user-role`, hashes, código), mas nenhum `<link>` de login.html nem das 4 páginas públicas a carrega, nem @font-face | P1 | Cai em ui-monospace/Consolas: o guia exige JetBrains Mono para hash/código |
| 7 | Pesos | 500:168, 600:135, 700:61, 400:11, 300:2, bold:1. Montserrat 700 requisitado em login.html:13 e politicas.html:9; Inter 300 em login.html:13 e `body{font-weight:300}` (style.css:90); monitor.js:246 `font-weight:300` | P3 | 700 e 300 fogem de "500 marca / 600 títulos". Pesos 700: monitor.js 18, grc.js 14 |
| 8 | Itálico | 0 `font-style: italic`. `<i>` 2 (painel-graficos.js:20,71) são swatches de legenda, não texto | ok / FP | |
| 9 | Emoji em UI | 0 em texto visível. 1 em comentário CSS (style.css:993 ✕). Glifos tipográficos em UI: • 40, … 13, × 4, → 4, ✓ 1 (project.js:1142 "✓ Aplicado"), ● 1 | P3 | "✓" é ícone decorativo textual; regra do repo "sem ícones" |
| 10 | Accent como FUNDO de área | 17 matches de `background: var(--accent)`; não-interativos/decorativos: `.progress-fill` (387), `.step-dot.active` (406), swatches/barras 4–8px (globals.js:88,2010, compliance.js:786,1907). Botão `.btn-primary` e `.skip-link` são interativos (ok) | P3 | Nenhum bloco grande; usos são barras/pontos indicadores |
| 11 | border-radius ≠ 0 (CSS) | 28 decl. (style.css 25, auditor.css 3); a maior parte "código morto" sobreposto pelo bloco final (style.css ~1266). Vivos: `.wizard-step`, `.yesno-btn`, `.ness-select-*`, `.dropdown-menu` (10px), `.step-dot` 50% | P2 | Valores: 10px ×68, 50% ×4, 8px ×3, 12px ×2, 6px, 16px |
| 12 | border-radius ≠ 0 (inline) | 51: monitor.js 20, project.js 14, politicas.html 10, grc.js 4, compliance.js 3 | P2 | E-mails: 5px/8px (4 templates) |
| 13 | `style=` inline | 1872 ocorrências: grc.js 310, monitor.js 279, compliance.js 251, project.js 189, globals.js 109, privacy.js 102, login.html 65, tratamento-ligacoes.js 50 | P1 (manutenção) | Principal vetor de deriva visual |
| 14 | Cores literais fora de :root | 407: style.css 127, project.js 58, compliance.js 52, monitor.js 38, politicas.html 34, grc.js 32, globals.js 13, dashboard.js 12 (inclui rgba) | P2 | |
| 15 | Espaçamento fora da grade de 4 | 317 de 1225 valores px (26%): style.css 128, compliance.js 61, monitor.js 41, project.js 37. Valores: 6px ×97, 10px ×91, 14px ×31, 18px ×19, 2px ×39, 3px ×12. Mais 141 declarações em rem (0.7rem, 0.85rem etc.) não contadas | P2 | |
| 16 | Foco visível | `:focus-visible` global com accent 2px/offset 2px existe (style.css:1229); 24 regras no style.css + 1 em cada CSS público (auditor, homologacao, proposta). Páginas politicas.html não tem arquivo CSS próprio (1 `outline:none` inline, linha 112). | ok | |
| 17 | `outline: none` | 13: style.css 7 (350,352 `.form-input/.form-select`, 496, 1156, 1492, 1611, 1669), proposta.css 3, compliance.js 2 (770 `#soa-search`, 2021 textarea), politicas.html:112. Substituto `:focus-visible` global cobre `.form-input/select/textarea` (1244). Sem substituto verificado: compliance.js:770, 2021, politicas.html:112, style.css:496 | P2 | |
| 18 | prefers-reduced-motion | Presente (style.css:1258 global; 1857 skeleton). Páginas públicas: 0 | P2 | auditor/homologacao/proposta CSS não tratam |
| 19 | Transições | 33 sem easing (style.css 26, politicas.html 3, monitor.js 2, globals.js, project.js) ex.: `transition: 0.2s` (297,302); `transition: all` 16 (14 no style.css, `.card`, `.btn`) | P3 | |
| 20 | Animações > 400ms | 5 (style.css:441 spinner, 571, 824 pulse-highlight 3s, 983 skeleton 1400ms, 1848 1.4s) | P3 / FP parcial | loaders/pulso: guia admite exceção a loaders. 824 `pulse-highlight 3s` é o único não-loader |
| 21 | Favicon BlueDot | public/favicon.svg = círculo #00ade8 (correto) e referenciado nas 5 páginas. Não existem .ico/png 16/32/180/192/512, manifest | P3 | |
| 22 | theme-color | Só login.html e politicas.html (#00ade8). Faltam em auditor, homologacao, proposta | P3 | |
| 23 | Open Graph / Twitter | 0 nas 5 páginas de entrada | P3 | Páginas atrás de login/token: relevância baixa |
| 24 | `<html lang>` | pt-BR nas 5 | ok | |
| 25 | `<title>` com a marca | login.html "n.iso \| ness. Agentic GRC" (estático; produto.js:11 troca por "n.360 \| ness." em runtime — "Agentic GRC" não está no nome dos produtos); auditor "Portal do auditor", homologacao "Questionário de homologação de fornecedor", proposta "Proposta comercial": sem marca | P2 | politicas.html "n.iso / ness." desatualizado frente ao n.360 |
| 26 | Rodapé "n.iso 1.8.0" fixo em login.html (6×, linhas 70,94,121,146,169,206) | 6 | P3 | versão estática de um produto que virou módulo |

### 2.1 Contraste WCAG (tokens de :root; script contrast.cjs)
| Token | s/ --bg | s/ --surface | s/ --surface-2 |
|---|---|---|---|
| --text | 16.88 | 14.24 | 12.35 |
| --text-2 | 12.46 | 10.51 | 9.11 |
| --text-dim | 7.21 | 6.08 | 5.28 |
| --text-faint | 6.93 | 5.85 | 5.07 |
| --accent | 7.17 | 6.05 | 5.25 |
| --success / --warning | 7.29/8.61 | 6.15/7.26 | 5.33/6.30 |
| --danger | 4.92 | **4.14 (<4.5)** | **3.59 (<4.5)** |
| --accent-hover (texto) | 4.95 | **4.18** | **3.62** |
| --ord-falta (#475569, dataviz) | **2.44 (<3)** | **2.06** | **1.79** |
Outros: #fff sobre #00ade8 = 2.58 (reprova 4.5 e 3), #fff sobre accent-hover = 3.74; accent-ink #04121c sobre accent = 7.35; borda rgba(255,255,255,.1) sobre surface ≈ 1.31 (borda decorativa, ok); e-mail #00ade8 sobre branco = 2.58.
Comentário em style.css:30-33 diz `--text` 14.8:1 / `--text-2` 9.6 / `--text-dim` 6.1 / `--text-faint` 5.9 sobre surface: os medidos aqui são 14.24 / 10.51 / 6.08 / 5.85 (ordem de grandeza ok, números do comentário imprecisos para --text e --text-2).
Texto `--danger` (#ef4444) sobre surface/surface-2 reprova 4.5; o repositório tem `--danger-ink` (#fca5a5, 8.2:1) para isso — verificar quantas telas usam `color:var(--danger)` em texto pequeno (não medi). `--ord-falta` é a rampa ordinal, validada em dataviz com ponta escura a 2,06 (decisão documentada, não texto).
Cores `rgba(255,255,255,0.x)` inline: ~68 `color:` com `--text-faint/--muted` ou branco < .6 em views (project.js 30, compliance.js 26, monitor.js 22): não calculados.

### 2.2 Consistência de componentes
- Botões: 677 `<button` em templates JS, 666 com classe `btn` (98%): ok. Variantes: btn-primary 224, btn-ghost 182, btn-sm 163, btn-secondary 96, mais ~12 classes pontuais (btn-filter, btn-submit-gov, btn-sign-ack, btn-restore-version, btn-primario [duplica btn-primary], btn-link-confirmar, btn-link-codigo, btn-gen-policy). `.btn` tem 11.2px de fonte (0.7rem).
- Badge/selo: renderStatusBadge 56 usos; `.badge` 43, `.tag` 42, `.selo` 32, `.selos` 26, `.chip` 18, `.status-badge` 8 → ≥6 famílias de selo; 15 spans inline estilo-badge (monitor.js 6, grc.js 5, project.js 2, ui.js 1, privacy.js 1).
- Tabela: renderDataTable 45 chamadas; 32 `<table` à mão: `data-table` 15, `<table>` sem classe 4, 3 com style inline, e 4 classes próprias (prp-tabela, pn-tabela, org-tabela, pn-carteira). ≥7 implementações.
- Modal: 102 `class="modal*"` + 76 `modal-header/modal-title`; 158 menções a overlay/openModal; 13 sites de criação; variante própria `prp-modal`. Um padrão dominante com 1 variante.
- Estado vazio: `renderEmptyState` em ui.js (default "Nenhum registro encontrado.") mas 8 classes distintas (pn-vazio-tx 7, gov-empty-list 7, prp-vazio 4, org-vazio, empty-list, empty-hint, empty-action, cat-vazio); 170 textos distintos "Nenhum/Sem/Ainda não…" (scan2.json `empty`). 38 linhas de empty-state em views.

## 3. Microcopy mecânica
- Botões genéricos (texto-alvo exato do botão, scan2.json `gen`/`genEx`): "Fechar" 42, "Cancelar" 35, "Salvar" 27, "Excluir" 11, "Editar" 8, "Abrir" 8, "Voltar" 8, "Detalhes" 7, "Sim" 5, "Ver" 4, "Criar" 3, "Enviar" 2, "Aplicar" 2, "Continuar" 2, "Não" 2, "Adicionar" 2, "Remover" 2, "Mais" 1, "Gerar" 1 = 172 total. "OK" 0, "Clique aqui" 0. Genéricos sem objeto de maior ruído: "Salvar" 27, "Excluir" 11, "Abrir" 8, "Ver" 4, "Detalhes" 7, "Mais" 1 (P3; "Fechar/Cancelar" são padrão aceito).
- Erros técnicos expostos: 111 `showToast(... .message)`; 13 `showToast('Erro: ' + e.message)` sem contexto (admin.js:125, commercial.js:187/231/286, compliance.js:2410/2422...); 18 `textContent/innerHTML` com `Erro: ${e.message}` (ai.js:72, compliance.js:2556). api.js produz mensagens técnicas que chegam ao usuário: "Falha de rede ao chamar /api/v1/..." (api.js:36), "Resposta HTTP 502 não é JSON (/api/...)" (58), "Tempo esgotado ao chamar /api/... (30s)" (34), "Requisição cancelada (/api/...)" (35), "Unauthorized" (71), "API Error" (74). Strings em inglês: "Error saving checklist progress meta" (2). "Erro desconhecido" 4. Strings `'undefined'/'null'/'[object Object]'` literais: 6.
- Termos em inglês na UI (scan2.json `eng`, aprox.): Dashboard, Download ×3, Upload ×3, Status (≈19), Score, Trust Score, Trust Center / Security Portal, Gap Analysis, At Risk, Pending ×3, Workflow de Assinatura, Template, Owner ("Dono (Owner)" ×2), Token, Evidence, "Assessment Concluido!", "Erro: Assessment blocks not loaded.", "Acesso restrito ao Platform Admin.", "Selecione o Template Standard", "Regerar com IA / Template", "Login corporativo (SSO)".
- Português sem acento em texto de UI: 45 trechos (Informacao, Seguranca, Publicos, Padrao, Evidencia, Concluido, Nao...), exs.: "Assessment Concluido!", "Upload de Evidencia", "Canais Publicos (Trust Center / DPA Padrao)", login.html:34-ish skip-link "Pular para o conteudo". (a regra do repo aceita snake_case sem acento em identificadores, não em UI).

## 4. CONFLITOS guia ness-branding x decisões do produto (NÃO são defeitos)
| Guia | Decisão do produto (AGENTS.md / DESIGN.md / style.css) | Posição |
|---|---|---|
| Dark + light, `prefers-color-scheme` | Tema escuro único, sem alternância (`color-scheme: dark`) | CONFLITO; produto vence |
| Cards claros com sombras `--shadow-md/lg`, glow BlueDot em CTA | Sem blur, sem gradiente; elevação por cor de superfície; `--glass-blur: none`. Existem `--shadow-md/-lg`, mas pouco usados. Detector marcou 1 glow | CONFLITO; mas glow residual (style.css:737, 456) contraria os dois |
| Raio via componente, `translateY(-1px)` | `--radius: 0`, sistema quadrado | CONFLITO; desvios inline são defeito de implementação, não do guia |
| Touch 44px, mobile-first, breakpoints | Responsividade fora de escopo | CONFLITO; não avaliado |
| `theme-color`, manifest PWA, OG image 1200x630, ícones 7 tamanhos | Só favicon.svg e theme-color em 2 páginas | Lacuna do guia vs produto interno atrás de login; baixo valor |
| Montserrat "500 só" na marca; 600 títulos | Igual no repo (marca 500, títulos 600) | Alinhado; 700/300 são desvios (item 7) |
| `@import` Google Fonts | `<link>` + CSP `style-src fonts.googleapis.com` | Equivalente |
| Marca com `.ness-brand .dot` | Classes próprias (`login-sign-house span`, `entry-dot`) | Mesma regra, outra marcação; não existe marcação única para produtos `n.iso/n.privacy/n.360` |
| Produtos "nShield" camelCase sem ponto | Produtos do repo são `n.iso`, `n.privacy`, `n.360` (com ponto, ponto em accent) | CONFLITO de convenção; AGENTS.md define; usar o do repo |
| Skip link "Pular para o conteúdo" | Existe em login.html (sem acento em "conteudo") | Alinhado; erro ortográfico |

## 5. Achados priorizados (resumo)
1. P1 E-mails transacionais fora da marca/contraste: auth.ts:366, users.ts:185/195, pedidos.ts:329, avisos-prazo.ts:366 (#fff em #00ade8 = 2,58:1; "n.iso" vs "n.360"; sem ponto accent).
2. P1 JetBrains Mono nunca carregada (style.css:53; login.html:13; 4 páginas públicas).
3. P1 1872 `style=` inline (grc.js 310, monitor.js 279, compliance.js 251, project.js 189) e 407 cores literais.
4. P1 Toasts expõem erro técnico: api.js:34-36,58,71,74; 111 toasts com `.message` (globals.js:117, admin.js:125, commercial.js:187...).
5. P2 `--danger` texto sobre surface 4,14:1 / surface-2 3,59:1 (style.css:36): usar `--danger-ink`.
6. P2 Inglês e português sem acento na UI (45 trechos; "Assessment Concluido!", "Upload de Evidencia", "Trust Score", "Dono (Owner)").
7. P2 Raio ≠ 0 inline 51 (monitor.js 20, project.js 14, politicas.html 10) e 10px vivos no CSS (.wizard-step, .yesno-btn, .dropdown-menu, .ness-select-*: style.css:399,412,418,419,434).
8. P2 Texto < 11px: ~55 decl.; `.sidebar-user-role` 9px (style.css:253); `.btn` 11,2px (338).
9. P2 `prefers-reduced-motion` ausente nas 4 páginas públicas; `outline:none` sem substituto em compliance.js:770,2021, politicas.html:112, style.css:496.
10. P2 Espaçamento fora da grade de 4: 317/1225 (26%) — 6px ×97, 10px ×91, 14px ×31.
11. P2 Títulos de páginas públicas sem marca (auditor, homologacao, proposta); login.html:6 "Agentic GRC"; politicas.html:8 "n.iso / ness.".
12. P2 side-tab (borda lateral colorida) em cards: project.js:340,386,1001; compliance.js:74; mapa-de-risco.js:30.
13. P3 ≥7 implementações de tabela e ≥6 famílias de selo; 8 classes de estado vazio e 170 textos de vazio.
14. P3 Pesos 700/300 (login.html:13, politicas.html:9, style.css:90, monitor.js:246).
15. P3 Glow residual em acento: style.css:737 (`.matrix-cell.selected`), 456 (`.journey-card:hover`); `layout-transition`: style.css:234,314,387; `pulse-highlight 3s` style.css:824.
16. P3 "n.iso 1.8.0" hardcoded 6× em login.html (70..206); ausência de OG/manifest/favicon .ico.

## 6. Comandos usados
```
# detector (wrapper .cmd; JSON em detector.json)
impeccable.cmd detect --json login.html src/views src/*.js public/*.html public/*.js(sem marked)
impeccable.cmd detect --json src/style.css      # detector-css.json
node sum.cjs <scratch>                           # agrega por regra/arquivo
# marca
git grep -nIE "\b(Ness|NESS)\b\.?" -- frontend/login.html frontend/src frontend/public
git grep -nIE "\b(N\.iso|N\.privacy|N\.360|nIso|nPrivacy|N360|n360)\b" -- ...
git grep -nIE "ness<span|entry-dot|login-sign-house|account-sign-house" -- frontend src
git grep -nE "00ade8|00ADE8" src/routes/*.ts src/services/*.ts
# varredura mecânica (fontes, pesos, itálico, emoji, radius, style=, cores, espaçamento, outline, transição, animação, accent bg, componentes)
node scan.cjs <scratch>    # cria scan.json (contagens por arquivo + exemplos)
node scan2.cjs <scratch>   # símbolos, botões genéricos, erros, componentes, vazios, inglês
node contrast.cjs          # WCAG 2.x dos pares de tokens
# head/meta
grep -oE '<html[^>]*>|<title>...|<link rel="icon"...|<meta name="theme-color"...|og:|twitter:' login.html public/*.html
# microcopy
grep -rE "showToast\([^;]*\.message" src public --include=*.js | wc -l   # 111
grep -rE "'Erro: ' \+ [a-z]+\.message" src public --include=*.js | wc -l   # 13
```
Limites: contagens por linha/match (várias por linha ficam em 1 em alguns contadores); glifos • e … são em grande parte pontuação; "inglês" é lista heurística (scan2.json `eng`), pode conter falsos positivos como "Status"/"Token", que são correntes em PT-BR; a estimativa de espaçamento ignora `rem`/`em`; estados de componente (hover/active/disabled/loading) não foram medidos além de 50 regras `:hover` no style.css.
