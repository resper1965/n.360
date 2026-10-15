# Assessment A: n.360 (início, Conta e acessos, conta, sino, aprovações, login)

Avaliação isolada: não rodei o detector nem li relatórios de outros revisores. A base são 46 capturas
(`capturas/n360/*` e `capturas/login/*`) e a leitura de `painel.js`, `aprovacao-lote.js`, `meus-pedidos.js`,
`project.js`, `empresa.js`, `admin.js`, `organizacoes.js`, `seguranca-projeto.js`, `conectar-agente.js`
e `globals.js`. As capturas "página inteira" saíram do mesmo tamanho do viewport (1440x900), então o que
fica abaixo da dobra eu avaliei pelo código.

## Veredito de especificidade

**Dividido.** O **Início** (carteira e painel do projeto) é autoral e deste produto. A frase-veredito por papel
("3 projetos. Um precisa de você hoje.", "3 pedidos esperam a sua decisão.") tem selo de estado escrito, não só cor,
e um "Como esta frase é montada" que expõe a regra. A lista "O que fazer agora" vem ordenada por prazo legal,
"O que um módulo já adianta para o outro" existe, e o ponto em accent aparece em n.iso e n.privacy. Nenhum outro
GRC traz isso pronto.

Fora do Início, "Conta e acessos" é **admin genérico intercambiável**:
- **Usuários** abre com três "hero metrics" centralizados (TOTAL DE USUÁRIOS 13), o template SaaS clássico.
- As tabelas têm cabeçalho mono em caixa alta espaçada.
- Os modais são formulários longos, cada um desenhado de um jeito.
- **Agentes** é uma parede de texto.
- **Segurança do projeto** é um formulário cru de OIDC.

Trocando o logo, isso serve a qualquer produto. A identidade aparece na entrada e some assim que a pessoa vai
administrar.

## Notas Nielsen

| # | Heurística | Nota | Achado-chave |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | O painel diz a situação em texto, com a hora do cálculo e esqueleto no carregamento. Mas o sino mostra o selo "2" com 3 itens (`n360-consultor-sino-notificacoes-quadro`), e no resultado do lote os 3 pedidos continuam "Aguardando você" ao fundo. |
| 2 | Correspondência com o mundo real | 2 | Rótulos de sistema e anglicismos: "TENANT" no menu de conta (`globals.js:771`), "Papel (Role)" (`admin.js:173,434`), "Issuer / Client ID / Client secret" (`seguranca-projeto.js:54-57`), códigos `MFA.VERIFY`, `PASSWORD.FAILED`, `LEGAL.ACCEPT`, `EVIDENCE.SIGNED`, "Login com senha", "org_ness" na coluna Organização do consultor, SHA-256 no pedido do cliente e "DPIA REQUERIDO" num produto que diz RIPD. Em Agentes, "Conectar o seu cliente" quer dizer cliente MCP, num produto em que "cliente" é a empresa. |
| 3 | Controle e liberdade | 2 | O erro do painel não tem botão de tentar de novo (`painel.js:282,288,317`). "Produtos do projeto" e "Padronizar nomes" abrem sem × e sem Cancelar. O resultado do lote manda "abra de novo" sem link para o pedido. |
| 4 | Consistência e padrões | 1 | Quatro padrões de modal: × pequeno em accent, "Fechar" em texto no topo, "Fechar" em botão embaixo e sem fechamento. Três estilos de cabeçalho de tabela (carteira em Inter normal, Projetos/Usuários/Chaves em mono caixa alta, pedido em caixa alta). "Novo Usuário" em Title Case ao lado de "Novo projeto". Datas em `2026-10-15 10:15:00` (sino, chaves, trilha) e em `15/10/2026`. Em Projetos, o nome do cliente é link numa linha e texto na outra (`project.js:77-83`). |
| 5 | Prevenção de erro | 2 | Há confirmação para revogar chave e excluir conta, e o lote exige abrir o pedido antes. Mas "Excluir definitivamente" fica em vermelho em toda linha, no mesmo peso de "Editar". O assistente pergunta Normas (ISO 27701, LGPD) **e** Módulos (n.iso, n.privacy) separados, e aceita LGPD desmarcada com n.privacy marcado. O "Dados da empresa" do cliente é somente leitura, mas parece editável. |
| 6 | Reconhecer em vez de lembrar | 2 | O lote pede a senha para "3 itens" sem listar quais. A caixa de seleção vem cinza e desabilitada, e o motivo ("Abra o pedido para poder marcá-lo") só aparece no `title` (`meus-pedidos.js:61`). No menu de conta os projetos aparecem como "Progr…", "Certifi…", "Adeq…". |
| 7 | Flexibilidade e eficiência | 2 | Aprovação em lote, carteira ordenada e atalho Ctrl+Q para sair. Faltam busca e filtro em Usuários, Projetos e na trilha. O projeto se troca em quatro lugares diferentes, e nenhum é rápido. |
| 8 | Estética e minimalismo | 2 | O painel é limpo. Em contraste: o painel do projeto do consultor tem 6 botões primários preenchidos no primeiro quadro, Usuários tem stat cards decorativos e Agentes dedica 3 colunas de texto a explicar ao admin uma coisa que ele não pode fazer. |
| 9 | Recuperação de erro | 1 | "Não foi possível montar o painel. Tente de novo em instantes." é beco sem saída. No login com senha errada a borda vermelha vai para o **e-mail** e a mensagem fica embaixo do botão SSO, longe dos dois campos (`login-anonimo-login-erro-quadro`). O resultado do lote diz o motivo, mas não oferece ação. |
| 10 | Ajuda e documentação | 3 | O "Como esta frase é montada" é ajuda contextual exemplar. Os modais trazem textos de apoio úteis ("Desligar um produto não apaga dado"). Perde ponto porque o painel vazio do cliente promete "Os primeiros passos estão abaixo" e não mostra passo nenhum. |
| **Total** | | **20/40** | **Abaixo do aceitável.** O Início puxa a nota para cima e "Conta e acessos" puxa para baixo. |

## Próximo passo por tela (uma linha cada)

- **Login**: claro: entrar. Falha no erro (borda vermelha no campo errado, mensagem longe dos campos) e no texto do botão primário, alinhado à esquerda, em 12px.
- **Esqueci a senha**: claro: pedir o código. Falha porque não diz o que acontece se o e-mail não existir nem quanto tempo o código vale.
- **Início, carteira (consultor e platform_admin)**: claro: abrir a Metalúrgica. Falha porque os três "Abrir" têm o mesmo peso (`painel.js:219`) e o mais urgente não se destaca. Para o platform_admin a carteira não responde ao trabalho dele (organizações, contratos, contas).
- **Início, projeto (consultor)**: claro: "Responder os pedidos". Falha porque os 4 itens atrasados e os 2 "Abrir o n.x" são todos primários, então seis botões disputam o mesmo lugar.
- **Início, cliente com pedidos**: claro: decidir os 3 pedidos. Falha porque "Ler e aprovar" é secundário (`painel.js:117`) e "Abrir o n.iso" e "Abrir o n.privacy" são primários (`painel.js:135`). A mesma frase "3 pedidos esperam a sua decisão" se repete nas duas linhas de módulo, e não dá para saber se são 3 ou 6.
- **Início, cliente vazio**: **não**. A frase diz "Os primeiros passos estão abaixo", mas a visão do cliente não desenha passos (`painel.js:179`). Sobram "0 de 0", "nenhuma próxima auditoria" e "Nada espera a sua decisão". O único caminho real, "Completar o cadastro", é botão secundário no canto.
- **Início, erro**: **não**. O painel fica sem botão e sem dizer a quem recorrer.
- **Meus pedidos (cliente)**: parcial: abrir um pedido. Falha porque não diz que é preciso abrir antes de marcar, e não separa "Aguardando você" do histórico. Os selos de status são todos brancos e iguais.
- **Pedido aberto (tratamento)**: claro: ler e decidir. Falha porque o foco vai direto para a senha antes da leitura, o SHA-256 aparece para o CEO, o solicitante aparece como e-mail e não como nome, e os botões de decisão ficam abaixo da dobra.
- **Aprovar selecionados**: arriscado. Pede a senha sem listar os itens e chama de "Aprovar" um lote que inclui ciência.
- **Resultado do lote**: não. Mostra "2 de 3 aprovado(s)" e "abra de novo", sem link e sem destaque no item que sobrou.
- **Projetos**: parcial: abrir num módulo. Falha porque o projeto de um módulo só não tem botão, só o nome em accent (`project.js:75-78`). O setor aparece como "Geral" mesmo quando o cadastro diz "Indústria metalúrgica" (`project.js:80`).
- **Novo projeto, passo 1**: claro: buscar o CNPJ. Falha porque são mais de 20 campos e o "Continuar" fica abaixo da dobra. Os campos que vieram da Receita não ficam marcados um a um como proposta.
- **Novo projeto, passo 2**: confuso. Normas e Módulos perguntam a mesma coisa, e "Papel na LGPD" aparece mesmo com a LGPD desmarcada.
- **Módulos… (Produtos do projeto)**: claro: habilitar o n.privacy. Falha porque o modal não tem como fechar e a tipografia é outra.
- **Usuários**: claro: "Novo usuário". Falha porque o seletor de organização aparece duas vezes (cabeçalho e filtro) e a ação destrutiva vem repetida em toda linha. Para o consultor, o card "Administradores & consultores: 0" é falso: ele só não os vê.
- **Novo e Editar usuário**: parcial. "Importar da Governança" fica em cima de tudo, o admin define a senha da outra pessoa, o texto de ajuda sobre conta de equipe aparece com "Colaborador do Cliente" selecionado, tem "ness.." com dois pontos e os botões ficam abaixo da dobra.
- **Organizações**: claro: "Nova organização". Falha nas ações que quebram em duas linhas ("Reenviar convite" e "Suspender"). O "Transferir projeto" no cabeçalho aparece em texto accent, sem contexto.
- **Nova organização**: claro. É o melhor modal da área: tem seções, ajuda abaixo de cada campo e Cancelar/Criar no fim.
- **Chaves de API**: claro: "Nova chave". Falha no parágrafo de abertura cheio de jargão ("MCP", "texto puro", "hash") e nas datas ISO.
- **Agentes (consultor)**: parcial: copiar o comando. Falha porque o título "Conectar o seu cliente" é ambíguo, a aba "C" fica cortada e o passo a passo cita "Needs authentication" e "irm … | iex".
- **Agentes (admin)**: **não**. A página diz "Esta conta não conecta agente" e mesmo assim mostra todo o passo a passo.
- **Segurança do projeto**: claro para quem sabe OIDC, opaco para o resto. O título quebra em duas linhas no header de 64px (admin), e o texto de ajuda do segredo sai maior que os rótulos.
- **Menu de conta**: parcial. "TENANT" com nomes truncados e ilegíveis, e "Encerrar ses…" cortado.
- **Sino**: parcial. Os itens não dizem de qual projeto são (o consultor tem 3), o selo não bate com a contagem e não há "ver tudo" nem "marcar como lido".
- **Trilha da minha sessão e MFA**: informativo. "Desativar" o MFA tem o mesmo estilo de "Fechar": ação destrutiva sem distinção visual.
- **Acompanhamento de ciência**: claro: "Reenviar aos pendentes". Falha porque não traz o resumo "X de Y" no topo e a mensagem vermelha "2 pendente(s) sem link válido" não diz quais.
- **Padronizar nomes**: claro: aplicar. Falha porque não tem como fechar e "Possíveis duplicatas (una à mão)" não leva a lugar nenhum.

## Carga cognitiva

Falhas no checklist (4 de 8, carga **alta** fora do Início): foco único, escolhas mínimas, memória de trabalho e
divulgação progressiva.

Pontos de decisão com mais de 4 opções visíveis:
- **Painel do projeto (consultor)**: 6 primários + "Dados da empresa" + Projeto/Carteira + sino.
- **Usuários**: 8 colunas; por linha, Editar, Desativar e Excluir definitivamente; mais 2 seletores de organização, "Mostrar desativadas" e "Novo usuário".
- **Projetos**: até 4 ações por linha (Empresa…, Módulos…, Abrir no n.iso, Abrir no n.privacy) em 3 estilos diferentes.
- **Troca de projeto**: 4 controles para a mesma coisa (seletor da sidebar, chip no header, "TENANT" no menu de conta, carteira/Projetos). O platform_admin tem ainda um quinto contexto, o seletor "ORGANIZAÇÃO".
- **Novo projeto, passo 1**: mais de 20 campos numa tela só, quando a pessoa precisa decidir 3 coisas (CNPJ, nome, módulos).
- **Agentes**: 5 abas de cliente, 3 passos, 4 cartões de "o que faz" e 2 abas de papel.

## Jornada emocional

- **Consultor**: o pico é a carteira ("Um precisa de você hoje."), que tranquiliza e orienta. Ao abrir o projeto vem uma queda: seis botões azuis disputam o lugar, e na coluna direita o texto em azul accent parece link sem ser. Em Conta e acessos a experiência vira planilha de admin. O fim é neutro: a pessoa sai do Início para o módulo.
- **Cliente (encarregado, CEO)**: o pico é "3 pedidos esperam a sua decisão" seguido de "A consultoria cuida do resto do programa", a frase mais tranquilizadora da área. O vale está no momento mais sério: a aprovação pede senha com foco no campo antes da leitura, exibe um hash e, no lote, assina 3 coisas sem mostrar quais. Se algo sai do lote, o fim é "2 de 3 aprovado(s)… abra de novo", sem caminho: a pessoa sai insegura sobre o que assinou. O cliente vazio vive um vale do começo ao fim, com zeros e uma promessa de passos que não aparecem.
- **platform_admin**: entra numa carteira que não é o trabalho dele. Organizações e Nova organização são bons e o fazem sentir no controle. Em Usuários, com o vermelho de "Excluir definitivamente" em toda linha, a sensação é de risco. Em Agentes, frustração: a página explica o que ele não pode fazer.

## Forças

1. **Frase-veredito por papel com regra explicável** (`painel.js:88-97`). Ela responde "o que eu faço agora" antes dos números, que é exatamente o princípio 1 do PRODUCT.md, e o selo de estado é escrito (Atrasado, Sua vez, Começando), não só cor.
2. **A aprovação em lote é segura por construção** (`aprovacao-lote.js`): o item só é marcável depois de aberto, o hash visto viaja com o envio e o servidor exclui o que mudou. Falta a tela comunicar isso, mas a mecânica é correta e rara.
3. **Os textos de consequência nos modais de governança** ("Desligar um produto não apaga dado: ele volta ao religar", "O administrador recebe por e-mail o convite… a senha não aparece aqui"). A voz é direta e em português, e diz o efeito antes do clique.

## Problemas prioritários

1. **[P0] A aprovação em lote não mostra o que vai ser assinado**
   - *Por que importa*: o CEO assina com a senha "3 itens", sem ver os títulos, e chama de "Aprovar" o que inclui ciência. Num ato com prova imutável, isso enfraquece a validade da decisão e a confiança de quem assina. A caixa desabilitada sem explicação visível ainda faz a pessoa achar que o recurso está quebrado.
   - *Correção*: listar os itens no modal (título, tipo "Aprovação (CEO)" ou "Ciência", versão) e trocar o botão para "Registrar 3 decisões". Em "Meus pedidos", uma faixa visível: "Para aprovar vários de uma vez, abra cada pedido e marque-o". No resultado, um botão "Abrir de novo" no item excluído, e a lista atualizada atrás do modal. Trocar "aprovado(s)" por plural de verdade.
   - *Comando*: `/impeccable clarify` + `/impeccable harden`
   - *Onde*: `aprovacao-lote.js:47-93`, `meus-pedidos.js:61-68`; capturas `n360-cliente-modal-aprovacao-lote*`, `n360-cliente-meus*`.

2. **[P1] Estados de erro e vazio sem saída no Início**
   - *Por que importa*: o encarregado que entra uma vez por mês e cai no erro, ou num projeto vazio, não tem o que clicar. O vazio do cliente contradiz o próprio texto ("Os primeiros passos estão abaixo").
   - *Correção*: no erro, um botão "Tentar de novo" (refaz o `carregar`) e "Se persistir, fale com a consultoria". No cliente vazio, desenhar os passos do cliente: completar a empresa e indicar o encarregado, com "Completar o cadastro" como primário. Esconder os números zerados enquanto `comecando`, como o próprio `DEPOIS` (`painel.js:126`) já faz para a equipe.
   - *Comando*: `/impeccable onboard` + `/impeccable harden`
   - *Onde*: `painel.js:179, 282, 288, 317`; `n360-consultor-erro-inicio-quadro`, `n360-cliente-vazio-inicio`.

3. **[P1] A hierarquia de ação inverte o próximo passo**
   - *Por que importa*: no Início do cliente, o primário é "Abrir o n.iso" e não a decisão que espera por ele. Na carteira, nada é primário. No projeto do consultor, tudo é. O olho não acha a ação.
   - *Correção*: um único primário por tela, decidido pelo papel. Cliente: o primeiro "Ler e aprovar". Carteira: o "Abrir" da linha de tom `atraso`. Projeto: só o primeiro item atrasado. "Abrir o n.x" vira secundário.
   - *Comando*: `/impeccable layout`
   - *Onde*: `painel.js:108, 117, 135, 219`.

4. **[P1] O contexto do projeto se espalha por 4 a 5 controles, todos truncados**
   - *Por que importa*: "em qual projeto eu estou?" é a pergunta-base do consultor (PRODUCT.md). Sidebar "Programa ISO 27001 e LG…", chip do header "Programa ISO 27001 e LGPD …", menu de conta "TENANT / Progr…", carteira, Projetos e, no admin, ainda "ORGANIZAÇÃO". Em Usuários, Chaves e Segurança não fica claro se a tela é do projeto ou da organização.
   - *Correção*: um seletor só (o da sidebar), que mostre o nome da **empresa** e não o nome do programa. Tirar o chip do header nas telas que não são do projeto e remover o grupo "Tenant" do menu de conta. Telas de projeto (Segurança, Chaves) dizem "da Metalúrgica Exemplo" no subtítulo.
   - *Comando*: `/impeccable distill`
   - *Onde*: `globals.js:751-771`, header de `login.html`, `seguranca-projeto.js:32`; `n360-consultor-menu-conta-aberto-quadro`.

5. **[P2] "Conta e acessos" fala a língua do sistema, não a do usuário**
   - *Por que importa*: o cliente e o consultor novo esbarram em Tenant, Role, Issuer, Client secret, `MFA.VERIFY`, `org_ness`, SHA-256 e "Login". O PRODUCT.md exige "sem jargão de software e sem anglicismo".
   - *Correção*: Projetos (no lugar de Tenant), "Papel", "Endereço do provedor (issuer)", "Identificador do aplicativo", "Segredo do aplicativo", eventos em frase ("Entrou com senha", "Confirmou o segundo fator"), o nome da organização em vez do slug, o hash recolhido em "Prova de integridade", "RIPD exigido", "Conectar o seu assistente de IA". Corrigir também "Trilha de Auditoria & Logs Imutáveis" para "Trilha de auditoria".
   - *Comando*: `/impeccable clarify`
   - *Onde*: `admin.js:173, 217, 416, 434`; `seguranca-projeto.js:54-57`; `conectar-agente.js:128`; `globals.js:771`.

6. **[P2] Modais e tabelas sem sistema**
   - *Por que importa*: cada tela ensina outro jeito de fechar, confirmar e ler. A pessoa reaprende em cada uma (heurística 4 com nota 1).
   - *Correção*: um componente de modal com cabeçalho (título Montserrat 600 e × com rótulo), corpo e rodapé (Cancelar secundário à esquerda do primário). Aplicar em Produtos do projeto, Padronizar nomes, Trilha, MFA, lote e Nova chave (tirar o "Fechar" do topo). Um único estilo de cabeçalho de tabela, uma única formatação de data (dd/mm/aaaa hh:mm), "Novo usuário" em caixa de frase. Destrutivo ("Desativar MFA", "Excluir definitivamente") sempre com o mesmo tratamento de perigo, e "Excluir definitivamente" dentro de "Editar" ou num menu "Mais", não na linha.
   - *Comando*: `/impeccable polish`
   - *Onde*: `aprovacao-lote.js:50-61` (estilo inline), `admin.js:193, 416`, `globals.js:819`; capturas dos modais.

7. **[P2] O "Novo projeto" pergunta duas vezes e pergunta demais**
   - *Por que importa*: Normas e Módulos são a mesma decisão. O passo 1 tem mais de 20 campos quando a Receita já preenche quase todos. Isso viola "nunca perguntar duas vezes", e "Setor: Geral" em Projetos mostra que o setor tem duas origens.
   - *Correção*: no passo 2 derivar as normas dos módulos (n.iso → 27001, opção 27701; n.privacy → LGPD) e mostrar "Papel na LGPD" só com n.privacy. No passo 1 mostrar CNPJ e o resumo trazido da Receita ("Fundição Serra Azul Ltda · Fundição de ferro e aço · Joinville"), com "Revisar campos" recolhido. A coluna Setor de Projetos lê `empresa.setor`.
   - *Comando*: `/impeccable distill`
   - *Onde*: `empresa.js:188-244`, `project.js:80`; `n360-admin-modal-novo-projeto*`.

8. **[P3] Login: erro mal posicionado e botão primário fraco**
   - *Por que importa*: é a primeira impressão da marca. "Entrar" fica alinhado à esquerda, em 12px, numa barra de 32px. Na senha errada a borda vermelha cai no e-mail e a mensagem fica longe dos campos.
   - *Correção*: o texto do primário centralizado e em 14-15px. Mensagem de erro logo abaixo da senha, sem marcar o e-mail. O placeholder "••••••••" sai, porque parece senha já preenchida.
   - *Comando*: `/impeccable polish`
   - *Onde*: `frontend/login.html` (cartão de login); `login-anonimo-login-erro-quadro-1440`.

## Sinais de alerta por persona

- **Jordan (primeiro acesso, cliente)**:
  - Cai no Início vazio, com zeros e "Os primeiros passos estão abaixo" sem passos.
  - "Completar o cadastro" está no canto, como secundário.
  - Em Meus pedidos, as caixas cinza não marcam e nada diz por quê.
  - Abre o pedido e o foco vai para a senha, com um hash de 64 caracteres na tela.
  - Abandona ou liga para o consultor, o oposto de "o cliente age sozinho".
- **Alex (usuário avançado, consultor)**:
  - Não há busca em Usuários nem em Projetos.
  - Trocar de projeto exige o seletor da sidebar com nomes truncados, ou passar pela carteira.
  - O sino não diz o projeto, então ele precisa adivinhar qual dos 3.
  - Seis primários no painel do projeto: precisa ler tudo para achar o atrasado mais antigo.
  - O único atalho visível é Ctrl+Q, para sair.
- **Sam (acessibilidade)**:
  - O motivo da caixa desabilitada está só no `title`, que não é anunciado de forma confiável e não aparece no teclado.
  - O × dos modais é um glifo de cerca de 10px em accent, com alvo pequeno.
  - Dois modais não têm como fechar além do Esc.
  - "Desativar" o MFA não se distingue de "Fechar".
  - A mensagem de erro do login não está associada ao campo (a borda vermelha cai no campo errado).
  - Nos selos "ATIVA" e "ATIVO", mono de 9-10px em verde sobre verde-escuro, o contraste parece no limite.
  - A favor: a carteira tem `aria-label` por linha e o estado é escrito.
- **Encarregado do cliente que entra uma vez por mês**:
  - Não lembra onde estava. O Início ajuda ("Sua vez"), mas os números "3 ações vencidas" e "2 pedidos atrasados" não dizem se são dele ou da consultoria.
  - O selo vermelho "2" do sino ele não sabe a que se refere.
  - O lote dá 2 de 3, e ele não sabe reabrir o que ficou.
  - O "Dados da empresa" parece editável, ele tenta corrigir e não consegue.
  - Um mês depois, a sessão por origem obriga novo login, sem explicação.

## Conformidade de marca observada

- **Marca e ponto**: `n.360` no topo da sidebar e no login, com o ponto em accent. `n.iso` e `n.privacy` nas linhas de módulo, com o ponto em accent (`painel.js:21`). `ness.` no rodapé do cartão de login, com ponto em accent. Desvios:
  - No menu de conta e nos chips de módulo da sidebar (`n.iso · n.privacy`), mono sem o ponto em accent.
  - Em Organizações, "ness." vira texto branco em negrito, sem accent.
  - No rodapé do cartão de login, "n.360" aparece em mono cinza, como se fosse um rótulo técnico.
- **Tipografia**: Montserrat 600 em títulos e frases-veredito está correto e dá caráter. Desvios:
  - Rótulos de checkbox em ~18px (Normas, Módulos, "Empresa sem CNPJ"), maiores que os rótulos de campo de 12px.
  - Ajuda do segredo SSO em 16px abaixo de rótulo de 12px: hierarquia invertida.
  - Cabeçalhos de tabela em mono caixa alta de ~9px, pequenos demais e fora da escala do guia (Microcopy 11-12px).
  - O título do modal "Produtos do projeto" parece Inter bold, não Montserrat.
- **Cor e accent**: accent aparece como texto não interativo (referências LGPD em "O que um módulo já adianta", rótulo "Importar da Governança do Projeto", nome do projeto em Projetos que é link numa linha e não na outra). Isso desobedece "accent só em elemento interativo". Os primários em profusão gastam o accent.
- **Geometria**: o seletor "ORGANIZAÇÃO" do header tem cantos arredondados visíveis (`n360-admin-*`), e o bloco de comando em Agentes também. Os dois quebram `--radius: 0`.
- **Densidade**: Usuários e Projetos estão bem; Agentes e o passo 1 do Novo projeto estão densos demais. Meus pedidos usa ~820px de 1180 disponíveis e deixa um terço da tela vazio sem motivo.

## Fluxo: onde a pessoa fica sem saber o que fazer

- **Becos sem saída**:
  - Erro do painel.
  - Início do cliente vazio.
  - Resultado do lote ("abra de novo").
  - Agentes para o admin.
  - "Possíveis duplicatas (una à mão)" sem link.
  - Mensagem "2 pendente(s) sem link válido" sem nomes.
  - "Dados da empresa" somente leitura sem dizer a quem pedir a correção, além de "a equipe da consultoria".
- **Passos repetidos**:
  - Normas e Módulos no Novo projeto.
  - Escolher a organização no header e de novo no filtro de Usuários.
  - Escolher o projeto no seletor da sidebar e de novo no seletor de projeto dentro de Chaves de API.
  - Abrir cada pedido para poder marcá-lo e depois confirmar o lote (é necessário, mas sem explicação parece retrabalho).
- **Ambiguidade de destino**:
  - "Abrir" na carteira escolhe o módulo sozinho (`modulo_urgente`) e não avisa para onde vai.
  - Em Projetos, o projeto de um módulo só se abre clicando no nome. Não há botão.

## Observações menores

- "Metalúrgica Exemplo Ltda **Metalúrgica Exemplo**": o nome fantasia repete a razão social quase igual. Mostrar só quando difere de verdade (hoje basta qualquer diferença).
- "Programa: Em operação desde maio de 2026" quebra para uma segunda linha sozinho no 1440.
- "a ness.. Para outra" (ponto duplo) no texto de ajuda de papel (`admin.js`).
- "1 desativada(s)", "aprovado(s)", "pendente(s)": plural com parênteses em três lugares.
- No sino, as datas aparecem em ISO; na carteira, relativas ("há 2 dias"). Escolher uma regra.
- Organizações: "3 de / 200" quebra em duas linhas, com coluna estreita.
- Pedido aberto: "pedido por ana.ribeiro@consultoria.exemplo"; usar o nome.
- No admin, o título do header "Segurança do projeto: Programa ISO 27001 e LGPD 2026" quebra em duas linhas dentro de 64px.
- Aba "C" cortada no fim da fila de clientes em Agentes (overflow sem indicação).
- O selo "REVOGADO" usa accent-dim como se fosse estado informativo; revogado é estado final e merece o neutro.

## Perguntas provocativas

- E se o Início do cliente tivesse **uma** frase e **um** botão, a próxima decisão, e todo o resto ficasse a um clique?
- O platform_admin precisa da carteira de projetos como entrada, ou a entrada dele deveria ser "organizações com contrato vencendo, convites não aceitos, contas suspensas"?
- Por que "Conta e acessos" não tem a mesma frase-veredito do Início ("2 pessoas sem segundo fator, 1 chave sem uso há 90 dias, SSO ligado")? É a mesma ideia aplicada à segurança da conta, que é o assunto do produto.
- A aprovação em lote deveria existir para ciência, ou ciência em lote e aprovação uma a uma é a regra que protege o CEO?
- O que sobra se removermos o chip de projeto do header, o grupo Tenant e o seletor de organização do cabeçalho? A tela fica pior ou só mais calma?
