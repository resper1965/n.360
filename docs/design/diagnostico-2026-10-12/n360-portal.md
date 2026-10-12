# Assessment A — n.360 (portal e "Conta e acessos")

Escopo: login, Início, Projetos, Usuários, Organizações, Chaves de API, Conectar agente, Segurança do projeto, Configurações, Meus pedidos, e a casca (sidebar, header, seletor de projeto, rodapé). Evidência: `shots/n360-*.png` (1440x900, API mockada, quase tudo vazio), `log.json`, fonte em ``.

## Veredito de especificidade

**Parcialmente autoral.** A camada de tokens é da ness. de verdade: geometria quadrada (`--radius: 0`), rótulos mono em caixa alta, o ponto em accent na marca, tinta medida para contraste. Isso não sai de template. Mas a **composição** do n.360 é intercambiável: Projetos e Usuários abrem com a faixa de três KPIs (`renderStatCards`) que qualquer admin genérico tem, e o Início — que deveria ser a tela que justifica existir uma "plataforma-mãe" — são dois cartões "Abrir" e um bloco de contagens. Nada no portal diz "aqui você governa o cliente inteiro, os dois módulos sobre o mesmo cadastro"; ele diz "escolha um app". A exceção é **Conectar agente**, que é específica, honesta e só poderia ser deste produto.

O problema estrutural maior: **o n.360 não sabe se é um hub ou um terceiro módulo.** A casca do portal mostra Conta e acessos *e* cinco grupos recolhidos de conteúdo de módulo (Governança, Cadastro, Privacidade, Inteligência, Sistema) — `produto.js:150` só esconde `SO_ISO` e `SO_PRIVACY` no n360, então tudo que é compartilhado (ativos, evidências, documentos, ROPA, DPIA, treinamento, IA, trilha) aparece no portal. `log.json` confirma: `n360:ropa menu:true`, `n360:dpia menu:true`, `n360:assets menu:true` etc. E por URL o portal renderiza até o Dashboard Executivo do n.iso (`n360-dashboard.png`).

## Heurísticas de Nielsen (0–4)

| # | Heurística | Nota | Por quê |
|---|---|---|---|
| 1 | Visibilidade do estado | 2 | Item ativo e projeto ativo bem marcados; mas Configurações mostra exceção crua, Segurança do projeto titula com o id (`p1`), seletor de Organização aparece vazio. |
| 2 | Correspondência com o mundo real | 2 | "Gestão de Usuários & RBAC", "API Keys (MCP / Integrações)", "issuer", "catálogo ainda não carregado", papéis em inglês (`consultant`, `read`, `write/admin (legado)`); coluna "Fase / Escopo" diz ISO 27001:2022 para projeto só n.privacy. |
| 3 | Controle e liberdade | 3 | Grupos recolhíveis, sidebar recolhível, confirmação inline em Organizações. Perde ponto porque o portal deixa entrar em telas de módulo sem dizer onde se está. |
| 4 | Consistência e padrões | 1 | Menu "Chaves de API" vs título "API Keys"; três estilos de cabeçalho de tabela (mono caixa alta em Projetos, Inter negrito em Chaves de API, linha arredondada em Organizações); sistema quadrado com tabela de Organizações arredondada; verde/amarelo hardcoded (`#34c759`, `#ffcc00`) fora dos semânticos; ação principal no header em Usuários/Organizações e dentro do card em Chaves de API; links de rodapé dos módulos sublinhados e soltos. |
| 5 | Prevenção de erro | 2 | Bom: "o token aparece uma vez", "gerar invalida o anterior", segredo nunca mostrado. Ruim: "Transferir projeto" (ação de impacto) tem o mesmo peso e vizinhança do botão primário. |
| 6 | Reconhecer em vez de lembrar | 2 | Cinco rótulos de grupo mono 9px recolhidos escondem a navegação; nome do projeto truncado em "Adequaç..." porque as etiquetas de módulo comem a largura. |
| 7 | Flexibilidade e eficiência | 2 | Sidebar recolhível; sem busca/atalho, sem filtro na lista de projetos/usuários. |
| 8 | Estética e minimalismo | 2 | Marca "n.360" duas vezes (sidebar e título do header no Início); o projeto ativo aparece três vezes no Início (seletor, badge do header, "Projeto: Adequação 2026"); três botões cheios por linha em Projetos. |
| 9 | Reconhecer, diagnosticar e recuperar de erros | 1 | `Erro ao carregar configuracoes: Cannot read properties of undefined (reading '1')` em vermelho, sem acento, sem ação. |
| 10 | Ajuda e documentação | 3 | Conectar agente é ajuda exemplar (passos, verificação, o que faz/não faz); Meus pedidos ensina no vazio; Chaves de API explica o hash. |
| | **Total** | **20/40** | |

## Carga cognitiva

Falhas do checklist (4 de 8 → **alta**):

- **Escolhas mínimas**: a sidebar do portal tem Início + 4 itens de conta + 5 grupos = 10 pontos de decisão no primeiro nível, num portal cujo trabalho é escolher módulo ou gerir acesso.
- **Hierarquia visual**: em Projetos cada linha tem até 3 ações (2 botões primários cheios "Abrir no n.iso"/"Abrir no n.privacy" + link "Produtos (n.iso, n.privacy)"); com 20 projetos são 40 blocos ciano competindo.
- **Agrupamento**: "Configurações" (tabela de preço, tributos, margem da ness.) mora em "Sistema" junto da Trilha de Logs e da Segurança do projeto; "Segurança do projeto" (SSO/SCIM, é acesso) não está em Conta e acessos.
- **Memória de trabalho**: Segurança do projeto titula "p1" — o usuário tem de lembrar qual projeto é p1 antes de mexer em SSO.

Pontos de decisão com >4 opções: sidebar do portal (10); cabeçalho de Usuários (seletor de org + "Mostrar desativadas" + "Novo Usuário" + sino, ok) — apenas a sidebar estoura.

## Jornada emocional

- **Pico — login**: calmo, confiável, copy direta ("Segurança da informação e privacidade, num só lugar."). Boa primeira impressão.
- **Vale — Início**: depois do login promissor, dois cartões e um bloco que fala "catálogo ainda não carregado" e "Nenhum controle ISO adiantado pela privacidade" — estado interno do sistema, não progresso do cliente. Sensação de produto vazio ou quebrado.
- **Momentos de alto risco bem tratados**: SSO ("Quem controla o issuer controla quem entra"), SCIM ("Gerar um token novo invalida o anterior"), chave de API ("aparece uma única vez"). Tranquiliza.
- **Final ruim possível — Configurações**: quem termina a sessão aqui vê uma exceção JavaScript em vermelho. Pela regra pico-fim, é isso que fica.

## Pontos fortes

1. **Conectar agente** (`n360-conectar-agente.png`): selos "VERIFICADO" vs "A CONFIRMAR" dizem a verdade sobre o que foi testado; "O que o agente faz / Pede o seu sim / Não faz" é o melhor bloco de expectativa do produto, com o destaque no item de consentimento.
2. **Login** (`n360-00-login.png`): tela dividida conforme a regra, restrita, sem decoração, SSO como alternativa secundária correta.
3. **Copy de segurança e vazios ensinam**: Meus pedidos ("Quando a consultoria ou a sua empresa pedir sua ciência ou aprovação de um documento, ele aparece aqui."), Segurança do projeto (avisos de token e segredo).

## Problemas por tela

| Tela | Problema | Evidência | Correção concreta | Sev. |
|---|---|---|---|---|
| Configurações | Exceção JS crua na tela, sem acento, sem saída | `n360-settings.png`; `views/admin.js:92` | Trocar o `catch` por `<div class="empty-state"><h3>Não foi possível carregar a tabela de preços</h3><p>Tente de novo; se persistir, avise o suporte.</p><button class="btn btn-secondary" data-action="navigate" data-args='["settings"]'>Tentar de novo</button></div>`; logar `e.message` no console, não na tela. Proteger `cfg.taxaVendaPD?.[1]` etc. com padrão quando a config vem incompleta. | P0 |
| Configurações | Tela é tabela de preços/tributos da ness., rotulada "Configurações" em "Sistema" do portal; textos sem acento ("Parametros", "Comissao", "salario", "beneficios", "referencia", "preco") | `views/admin.js:48-86`; `login.html:463` | Renomear item e título para "Preços e margens"; mover para o grupo Comercial (n.iso) ou um grupo "ness." do n.360; acentuar todos os rótulos. | P1 |
| Casca n.360 | Portal mostra 5 grupos de conteúdo de módulo (Governança, Cadastro, Privacidade, Inteligência, Sistema) e renderiza telas de módulo por URL | `n360-01-entrada.png`, `n360-dashboard.png`, `log.json` (`n360:ropa/dpia/assets menu:true`); `produto.js:150` | No ramo n360 de `aplicarCasca`, esconder tudo exceto `nav-inicio`, `nav-meus`, `SO_N360`, `nav-seguranca-projeto` e `nav-audit-trail` (ou decidir a lista, mas explícita). No router, tela que não pertence ao n360 redireciona para o módulo dono (`destinoDoAviso` já faz esse cálculo). | P1 |
| Casca (todas) | `id="nav-seguranca-projeto"` duplicado | `login.html:455` e `login.html:459` | Apagar o bloco das linhas 459–462. `getElementById` só controla o primeiro; o segundo fica órfão. | P1 |
| Casca (todas) | "X" minúsculo solto no canto superior direito, sem relação com nada visível | todos os prints (canto 1427,20); `login.html:504` (`.toggle-context` "x") | Com `#context-panel.collapsed`, esconder o botão (`.context-panel.collapsed .toggle-context{display:none}`); quando aberto, usar o rótulo "Fechar" ou ícone de fechar do conjunto, não a letra "x". | P1 |
| Casca (header) | Seletor "Organização" renderiza vazio (caixa com só a seta) | todos os `n360-*.png`; `views/organizacoes.js:71-75` | Se `orgs.length <= 1`, não desenhar o seletor (`caixa.hidden = true`). Rótulo mono 9px "ORGANIZAÇÃO" passa a mostrar o nome atual dentro do select. | P2 |
| Casca (sidebar) | Nome do projeto truncado ("Adequaç...") porque as etiquetas "n.iso · n.privacy" ficam na mesma linha | `n360-01-entrada.png`; `.tenant-norm` em `style.css:190` | Pôr `.tenant-norm` em linha própria abaixo do nome (flex-direction column no `.tenant-face`) ou mostrar só os módulos no n360 em tooltip; o nome do cliente tem prioridade. | P1 |
| Casca (sidebar) | Rótulos de grupo em mono 9px, `--text-faint`, caixa alta espaçada: ilegíveis e são a navegação principal | `style.css:213` | Subir para 11px, `letter-spacing: 0.08em`, cor `--text-dim`. | P2 |
| Casca (módulos) | Links de volta ao n.360 no rodapé dos módulos são `<a>` sublinhados com estilo inline, desalinhados dos itens de menu | `iso-01-entrada.png`, `privacy-01-entrada.png`; `produto.js:178-189` | Dar a eles a mesma anatomia de `.sidebar-nav` (ícone + `.sidebar-nav-text`, sem sublinhado) e agrupar sob um rótulo "n.360" acima do cartão do usuário; remover o `style.cssText` inline. | P2 |
| Início | Marca duplicada: "n.360" na sidebar e como título do header; projeto ativo três vezes | `n360-01-entrada.png`; `views/inicio.js:15,32` | `h.textContent = 'Início'`; remover o parágrafo "Projeto: …" (o seletor e o badge já dizem). | P2 |
| Início | Bloco "ponto de partida" fala em estado interno ("catálogo ainda não carregado", "Nenhum controle ISO adiantado pela privacidade ainda") e lista contagens zeradas | `n360-01-entrada.png`; `views/ponto-de-partida.js:12-19` | No n360, quando tudo é zero, mostrar uma linha só: "Ainda não há trabalho registrado neste projeto. Comece pelo n.iso ou pelo n.privacy." Quando houver dados, título "O que um módulo já adianta para o outro" e "Cobertura LGPD: X de Y requisitos". Esconder "catálogo não carregado" do cliente (é problema da ness., não dele). | P1 |
| Início | Botão "Abrir" desalinhado entre os cartões (alturas de texto diferentes) | `n360-01-entrada.png`; `views/inicio.js:27` | No wrapper do botão: `style="margin-top:auto"`. Trocar "Abrir" por "Abrir o n.iso" / "Abrir o n.privacy" (nome acessível distinto). | P2 |
| Projetos | "Fase / Escopo" mostra "ISO 27001:2022" para projeto só n.privacy (padrão do fallback) | `n360-projects.png` (Beta Saúde); `views/project.js:74` | Derivar do módulo: `p.standard || (modulosDe(p).includes('iso') ? 'ISO 27001:2022' : 'LGPD')`; renomear a coluna para "Escopo". | P1 |
| Projetos | Até 3 ações por linha, duas como botão primário cheio; "Produtos (n.iso, n.privacy)" parece link de navegação mas abre modal de configuração | `n360-projects.png`; `views/project.js:76` | Nome do cliente vira o link para abrir (módulo único) e "Abrir no n.iso"/"Abrir no n.privacy" passam a `btn-secondary btn-sm`; "Produtos (…)" vira "Módulos…" como `btn-ghost` só para equipe ness., e a coluna "Módulos" mostra as etiquetas. | P1 |
| Projetos | KPI "Concluídos" em amarelo `#ffcc00` (lê como alerta) e verde `#34c759` fora dos tokens; o subtexto "Prontos para auditoria" é ISO-específico no portal | `n360-projects.png`; `views/project.js:63-67` | Usar `var(--success)` para concluídos e `var(--text)` para total/andamento; subtexto neutro "Encerrados". Ou remover a faixa: 3 contagens de uma lista visível logo abaixo não informam nada. | P2 |
| Usuários | Título "Gestão de Usuários & RBAC" (jargão; menu diz "Usuários") | `n360-users.png`; `views/admin.js:132` | `h.textContent = 'Usuários'`. | P2 |
| Usuários | Mesmo padrão de cores hardcoded e faixa de KPIs genérica | `views/admin.js:157-158` | Igual a Projetos: tokens semânticos ou remover a faixa. | P2 |
| Usuários | Vazio "Nenhum usuário cadastrado." não ensina; a pessoa logada não aparece nem na contagem | `n360-users.png`; `views/admin.js:184` | Vazio: "Ninguém além de você ainda. Convide a equipe da ness. ou o administrador do cliente." + botão "Novo usuário" (já existe no header; repetir aqui). Contar o próprio usuário. | P2 |
| Organizações | Lista vazia renderiza só o cabeçalho da tabela, sem mensagem; tabela com cantos arredondados no sistema quadrado | `n360-organizacoes.png`; `views/organizacoes.js:136` | Com `orgs.length === 0`, usar `renderDataTable(..., {emptyState:'Nenhuma organização. A ness. aparece aqui depois do primeiro acesso.'})`; remover `border-radius` de `.org-tabela-caixa`. | P2 |
| Organizações | "Transferir projeto" (ação de impacto) colado ao primário e com peso de botão secundário cheio | `n360-organizacoes.png`; `views/organizacoes.js:86` | Mover "Transferir projeto" para o menu de ação da linha da organização de origem, ou `btn-ghost` separado à esquerda. | P2 |
| Chaves de API | Título "API Keys (MCP / Integrações)" vs menu "Chaves de API"; papéis em inglês; "write/admin (legado)" oferecido ao lado dos atuais | `n360-api-keys.png`; `views/admin.js:509,546,579-580` | Título "Chaves de API"; papéis rotulados "Consultor", "Auditor", "Somente leitura"; remover `write`/`admin` das opções de criação (manter só para exibir chaves antigas). | P1 |
| Chaves de API | Ação primária dentro do card ao lado do select de projeto (outras telas põem no header); cabeçalho da tabela em Inter negrito, diferente do padrão mono das outras | `n360-api-keys.png`; `views/admin.js:530-560` | Mover "Nova chave" para `a.innerHTML` (header); usar `renderDataTable` para a lista. Sinal "+" fora do rótulo ("Nova chave"). | P2 |
| Conectar agente | Abas quebram em duas linhas ("Antigravity" sozinho embaixo) a 1440px | `n360-conectar-agente.png` | Reduzir o gap das abas ou mostrar os 4 clientes num `select`/segmentado de uma linha; selo "A CONFIRMAR" pode ir para o painel da aba, não no rótulo. | P2 |
| Conectar agente | No portal n.360 a copy manda "entre no n.iso pelo navegador" e o item some do menu para platform_admin | `n360-conectar-agente.png`, `log.json` (`n360:conectar-agente menu:false`); `globals.js:922-923` | Trocar "n.iso" por "n.360" no passo 2; decidir se platform_admin vê o item (hoje só `consultor`). | P2 |
| Segurança do projeto | Título mostra o id ("Segurança do projeto: p1") porque lê `proj.name`, campo que não existe | `n360-seguranca-projeto.png`; `views/seguranca-projeto.js:32` | `proj.project_name || proj.client_name || proj.id`. | P1 |
| Segurança do projeto | Texto de apoio em `.text-muted`, classe inexistente: sai do tamanho e cor do corpo, competindo com o título | `n360-seguranca-projeto.png`; `views/seguranca-projeto.js:47,52`; nenhum `.text-muted` em `style.css` | Trocar por `class="form-hint"` (ou criar `.text-muted{color:var(--text-dim);font-size:13px}` uma vez em `style.css`). | P1 |
| Segurança do projeto | Tela de acesso (SSO/SCIM) mora em "Sistema", fora de "Conta e acessos" | `login.html:455` | Mover `nav-seguranca-projeto` para `#group-conta`, depois de "Organizações". | P2 |
| Login | Rodapé "privacidade · termos" aponta para `/politicas.html`, que é o portal de ciência de políticas do cliente, não aviso de privacidade nem termos da ness.; "n.360" ali não é versão | `n360-00-login.png`; `login.html:70`; `produto.js:139` | Apontar para os documentos públicos de privacidade e termos da ness. (ou remover até existirem); trocar o `replace` por a versão real do app ou nada. | P1 |
| Login | Rodapé do cartão em mono 10px, `--text-dim`, quase ilegível | `style.css:135` | 12px, igual a `.entry-foot .login-sign-links`. | P2 |
| Meus pedidos | Bom vazio; único ajuste: está fora do menu para o admin, e o título do header repete o badge do projeto que não se aplica (pedidos são da pessoa) | `n360-meus-pedidos.png`, `log.json` (`menu:false`) | Esconder `#header-project-badge` nesta view. | P2 |

## Perguntas provocativas

- Se o n.360 é a plataforma-mãe, por que o Início dele mostra menos do cliente do que o dashboard de qualquer módulo? O que um consultor precisa ver ao abrir o dia, entre todos os clientes?
- O portal precisa de navegação de módulo? Se Cadastro e Sistema são compartilhados, eles deveriam morar no n.360 e sair dos módulos — não aparecer nos três.
- A faixa de três KPIs em Projetos e Usuários ajuda alguma decisão, ou só ocupa o primeiro terço da tela?
