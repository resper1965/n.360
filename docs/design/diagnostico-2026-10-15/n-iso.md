# Assessment A — módulo n.iso (avaliação isolada, sem detector)

Base: PRODUCT.md, DESIGN.md, tokens de `frontend/src/style.css`, guia `ness-branding`, método `critique.md`.
Capturas vistas: 56 PNG de `capturas/iso/` (consultor, cliente, platform_admin, comercial; vazio e erro), mais leitura de
`grc.js`, `compliance.js`, `monitor.js`, `project.js`, `commercial.js`, `painel.js`, `router.js`, `globals.js`, `login.html`.
Caminhos de código relativos a `C:\Users\resper\worktrees\design\frontend\`.

## Veredito de especificidade

**Dividido: o Painel é do n.iso, o resto é um painel GRC qualquer.** O Painel (`painel.js`) é a única tela que só pode ser
deste produto: uma frase de situação ("3 ações corretivas passaram do prazo"), a lista "O que fazer agora" agrupada por prazo,
cobertura por tema do Anexo A com escala única e "Como esta frase é montada". As outras ~25 telas seguem um único molde
genérico: faixa de 4 stat cards em caixa alta, tabela com selos monoespaçados e coluna "Ações" com links. Sem o logotipo,
daria para usar esse molde em qualquer SaaS de compliance. Pior: as telas falam três dialetos. O Painel fala PT-BR claro;
SoA, Auditorias, Métricas e Ativos misturam inglês do banco ("Implemented", "Missing", "AT RISK", "CONFIDENTIAL", "Internal",
"EXPIRED", "CONVERTED"); e algumas telas perderam os acentos ("Detalhes da Acao", "Assinar Ciencia Eletronica").

## Notas Nielsen (0–4)

| # | Heurística | Nota | Achado-chave |
|---|---|---|---|
| 1 | Visibilidade do estado | 2 | Falha de carga vira estado vazio: `grc.js:29` (`catch(e) {}`) mostra "Nenhum risco registrado" com 500; o mesmo vale para Ativos e Evidências (capturas `iso-consultor-erro-risks/assets/evidence`). O progresso tem quatro números que não batem: Jornada 27%, Monitor "Score Geral GRC" 27%, Certificação "43% completude", Painel por tema. |
| 2 | Correspondência com o mundo real | 1 | Status do banco em inglês na tela (Auditorias: "Internal/Certification", execução: "IMPLEMENTED/PARTIAL/MISSING", CAPA: "Critical/In Progress", Métricas: "WEEKLY/AT RISK", Treinamento: "EXPIRED", Ativos: "CONFIDENTIAL", Leads: "PROPOSAL/WON"). "Jornada 1…6" nomeia as etapas e "41 fases" as subetapas, numeradas de 0 a 40. A coluna "Controle" do risco mostra "ISO 27001:2022", não o controle. |
| 3 | Controle e liberdade | 2 | "Gerenciar Fases" e "Notas do Auditor" estão sempre à vista, mas Jornada vazia → "Voltar aos projetos" e Monitor vazio → "Abrir o projeto" formam um laço sem saída (`monitor.js:36`, `project.js:471`). |
| 4 | Consistência e padrões | 1 | Seis nomes para um mesmo status (Implementado/Implemented/IMPLEMENTED/Conforme/Compliant/Aprovado). As políticas aparecem em três telas (Documentos, Gestão de Políticas, Ciência de Políticas). O ID aparece como "A.5.1" ou "ctrl-a51". As ações por linha variam entre links soltos, botões fantasma e botões primários. |
| 5 | Prevenção de erro | 1 | O modal do controle mostra "Ausente" num controle Implementado: o `<select>` só tem Missing/Partial/Compliant (`compliance.js:124-127`) e o valor "Implemented" não casa com nenhum. Quem salvar a partir dali grava a regressão. "Executar" fica ao lado de auditorias de certificação estágio 1/2, que são externas. |
| 6 | Reconhecer em vez de lembrar | 2 | O grupo OPERACIONAL tem 18 itens. Certificação, Métricas e Controles não estão no menu: só se chega por links e é preciso lembrar onde eles ficam. |
| 7 | Flexibilidade e eficiência | 3 | A SoA tem atalhos (j/k, x, a, ⌘K), lote, filtros e diagnóstico de prontidão; o Painel tem atalhos de navegação filtrada. O Alex é bem servido. |
| 8 | Estética e minimalismo | 2 | Cada tela abre com 4 stat cards que repetem a tabela abaixo. Leads tem 6 cards e uma linha órfã de largura total. Evidências tem até 5 ações por linha. Levantamentos tem 5 botões primários ciano empilhados. |
| 9 | Reconhecer e recuperar de erros | 2 | A SoA tem o modelo certo: "Tentar de novo", código da requisição e "nada foi gravado" (`compliance.js:949`). O Painel diz "Tente de novo em instantes" sem botão (`painel.js:282/288/317`). Riscos, Ativos e Evidências mentem com o estado vazio. |
| 10 | Ajuda e documentação | 3 | Os estados vazios citam a cláusula (6.1.2, 7.5, 6.1.3 d) e dizem por que a tela importa. "Diretriz do consultor" em cada fase. É bom. |

**Total: 19/40.** Fica acima do piso por causa do Painel e da SoA, e abaixo do aceitável no resto.

## Carga cognitiva

Checklist: falham 5 de 8 itens (foco único, agrupamento, escolhas mínimas, revelação progressiva e memória). **Carga alta.**

Decisões com mais de 4 opções à vista:
- **Menu do n.iso (consultor):** 6 grupos; OPERACIONAL aberto tem 18 itens, entre eles "Partes" e "Partes Interessadas" lado a lado e
  "Documentos", "Ciência de Políticas" e "Gestão de Políticas" em sequência (`login.html:354-410`).
- **SoA, por linha:** checkbox, Sim/Não, selo, 2 a 4 chips de rastreabilidade, campo livre e CMM: 7 controles por linha × 93 linhas.
  Acima disso: 5 filtros e 2 ações de cabeçalho.
- **Evidências, por linha:** um select de controle editável dentro da tabela e até 5 ações (Download, Revisar, Assinar CEO, IA,
  Requisitos e validade).
- **Propostas, por linha:** até 4 botões (Abrir, Enviar ao cliente, Nova revisão, Ver documento) que quebram em duas linhas de forma irregular.
- **Leads:** 6 cards de funil e mais o gráfico "Funil" abaixo: o mesmo dado mostrado duas vezes.
- **Certificação:** 7 chips de estágio, mais um select livre "Mudar estágio para" e "Atualizar".

## Jornada emocional por papel

- **Consultor:** começa bem. O Painel diz o que está atrasado e dá um botão por item: é o ponto alto. Depois vem o vale. "Ver os
  controles" leva a uma lista sem filtro, e o detalhe do controle diz "Ausente" num controle Implementado e mostra markdown cru
  ("## 1. Objetivo **Código:**"). A confiança cai. O fim, o dossiê da jornada, sai com "Papel: Controller · Status: Active".
- **Cliente (CISO/encarregado):** o pior começo. `router.js:9-11` desvia o cliente do Painel para a Jornada, e `globals.js:923-929`
  esconde o item Painel. Ele entra numa lista de "Jornada 1…6" com 41 fases, "Impedimentos / Bloqueios: 1" em vermelho e
  nenhuma pista do que é dele. O painel já tem a vista "Esperando a sua decisão" (`painel.js:179`), mas o cliente do n.iso
  nunca a vê. Em Treinamento ele dá com "Status global: Não conforme" em vermelho grande; em Análise Crítica, com "Conforme"
  em verde grande. É um alarme e um falso conforto, e nenhum dos dois é verdadeiro.
- **platform_admin:** vê o Painel do consultor, mais um seletor de organização e os grupos comercial e sistema, num menu com 7 grupos.
  Funciona, mas sem foco.
- **Comercial:** entra em "Comercial" com 3 cards e "Nenhum projeto ativo" com o botão "Ver projetos", a que ele não tem acesso por
  regra. O cabeçalho mostra o chip do projeto "Programa ISO 27001 e LGPD" mesmo que o papel "não alcance projeto". A proposta
  (wizard de 5 passos) é o ponto alto, e "Nova proposta" está bem resolvida.

## Forças

1. **Painel "O que fazer agora"** (`views/painel.js`): situação numa frase, agrupamento Atrasado / Nesta semana / Para planejar,
   um botão por item que leva à tela já filtrada, "Como esta frase é montada" e "Ver como tabela". É exatamente o princípio
   1 do PRODUCT.md. Esse molde deveria ser exportado para o resto do módulo.
2. **Estados vazios ensinam a norma:** cada vazio diz a cláusula e por que a tela importa, com a ação certa (Riscos, Evidências,
   SoA "Carregar catálogo", Ativos). O vazio do Painel ("Primeiros passos" 1-2-3 e "Nada aparece zerado de propósito") é exemplar.
3. **A máquina propõe, a pessoa aplica:** a adequação de controles da Jornada mostra "atual → sugerido", tem "Aplicar ao controle"
   item a item e avisa "Nada muda até você aplicar". O diagnóstico de prontidão diz "não substitui a auditoria". O tom é certo
   para a certificação.

## Problemas prioritários

### P0 — Falha de carga aparece como "nenhum registro"
- **O quê:** Riscos, Ativos e Evidências engolem o erro e mostram o vazio com o botão "Novo risco", "Novo ativo" ou "Enviar evidência".
- **Por que importa:** o consultor ou o CISO acredita que o registro sumiu, cadastra de novo e duplica. Às vésperas da
  auditoria, "Nenhuma evidência enviada" é a pior mentira possível. Viola o princípio de visibilidade e a regra "nunca afirmar sem evidência".
- **Correção:** separar falha de vazio. Usar o componente de erro da SoA (`compliance.js:949`: título, "nada foi gravado",
  "Tentar de novo", código) num utilitário compartilhado de `ui.js` e aplicá-lo a todo `try { … } catch(e) {}` de carga de tela.
  O Painel também ganha o botão "Tentar de novo".
- **Comando:** `/impeccable harden`
- **Onde:** `views/grc.js:29` (riscos), `:265 :353 :483 :828-829` (fornecedores, treinamento…), `views/monitor.js:1739` e o
  bloco de ativos perto de `:1743`, evidências em `views/compliance.js` (carga antes de `:1550`), `views/painel.js:282/288/317`.

### P0 — O detalhe do controle mostra o status errado
- **O quê:** num controle Implementado, o modal "ctrl-a51: A.5.1" mostra "Status do controle: Ausente", porque o `<select>`
  não tem a opção `Implemented` (só Missing/Partial/Compliant). O histórico abaixo diz "Partial → Implemented". A descrição
  mostra markdown cru.
- **Por que importa:** é a tela que o CISO abre para conferir um controle antes do auditor. A contradição destrói a confiança
  no dado, e qualquer gravação a partir dali regride o controle.
- **Correção:** alinhar o vocabulário de status a um único dicionário (Pendente / Parcial / Implementado / N/A) com uma opção
  para cada valor do banco. Título com o ID de exibição (A.5.1, nunca `ctrl-a51`). Renderizar a descrição como documento ou
  como um resumo de uma linha com "Abrir política". Histórico com rótulo em português (status, maturidade, descrição).
- **Comando:** `/impeccable harden` e depois `/impeccable clarify`
- **Onde:** `views/compliance.js:113` (título), `:116` (descrição), `:124-127` (select); o mesmo modal é aberto por Controles e pela SoA.

### P1 — O cliente não tem "próximo passo" no n.iso
- **O quê:** o cliente é desviado do Painel para a Jornada (`router.js:9-11`) e o item Painel fica escondido (`globals.js:923-929`).
  A Jornada é uma lista de 6 "Jornadas" e 41 fases, com status em inglês ("Completed", "In Progress") e botões de operador
  ("Gerenciar Fases", "Migrar 27701", "Exportar Riscos", atalhos j/k).
- **Por que importa:** contraria a meta "o cliente age sozinho" e o princípio 1. O painel já sabe montar a vista do cliente
  ("Esperando a sua decisão", `painel.js:153/179`).
- **Correção:** o cliente entra no Painel com a vista cliente: o que espera a decisão dele, o que vence, onde o programa está
  em uma frase. A Jornada passa a ser leitura. Esconder do cliente as ações de operador (`compliance.js:719-721`,
  `monitor.js:128-129`) e a linha de atalhos (`compliance.js:765`).
- **Comando:** `/impeccable onboard` e depois `/impeccable distill`
- **Onde:** `router.js:9-11`, `globals.js:923-929`, `views/painel.js`, `views/project.js:226-227 :324-325`.

### P1 — Terminologia: inglês do banco, acentos perdidos e "jornada" usada para duas coisas
- **O quê:** veja a heurística 2. Também: "Proprietário (Owner)", "Causa Raiz (Root Cause)", "Forças (Strengths)", "Trust Score",
  "KYV", "Copiar Link do Portal Explicito (OTP)", "Detalhes da Acao Corretiva", "Politica de Seguranca da Informacao",
  "Informacao" na categoria de ativo, "Porte DEMAIS", "Mitigate" no detalhe do risco.
- **Por que importa:** o cliente da ISO lê "Missing" e "Controller" no dossiê que vai mostrar ao auditor. A voz da marca é
  "português claro, sem anglicismo". O termo da norma deve ser mantido (SoA, NC menor, observação), mas o status do sistema não é termo da norma.
- **Correção:** passar todo valor de status, tipo e classificação por `traduzStatus` (`ui.js:245`) ou por um dicionário por
  domínio. Uma única palavra por conceito: "Jornada" é o todo e "Etapa 1…6" / "Fase N" as partes, ou "Etapa" e "Atividade".
  Os IDs internos saem da tela. Restaurar os acentos.
- **Comando:** `/impeccable clarify`
- **Onde:** `views/grc.js:468 :494 :500 :1206 :1272 :1344 :1546 :1578`, `views/compliance.js:1693` (execução da auditoria),
  `:2236 :2293`, `views/monitor.js:401 :1016 :1101 :1756 :1766 :1804 :1843`, `views/project.js:226-227 :324-325`, dossiê da jornada, Métricas, Leads.

### P1 — Selos de conformidade que o sistema não pode afirmar
- **O quê:** "Conformidade Cl. 9.3: Conforme" quando existe uma análise crítica qualquer (`monitor.js:1434`). "Maturidade
  Cláusula 4.3: 100% CONFORME" (`monitor.js:1016`). "ISO 27001 CONFORME" no "Selo de Homologação Digital" da política
  (`compliance.js:1908-1910`). "Status global: Não conforme" em Treinamento (`grc.js:842`).
- **Por que importa:** conformidade é decisão do auditor. O CISO pode levar o "Conforme" para a reunião e ser desmentido no
  estágio 1. É risco de reputação para a ness. e contraria "a máquina propõe".
- **Correção:** trocar por fatos verificáveis ("1 análise registrada em 18/05; próxima em 14/11"; "Texto íntegro: SHA-256…")
  e dar um nome honesto ao selo ("Integridade da versão"). Nenhum veredito de conformidade sai da tela.
- **Comando:** `/impeccable clarify`
- **Onde:** citados acima.

### P2 — Números de progresso e contagens que se contradizem
- **O quê:** Painel "Mapa de risco 18 riscos" × Riscos "Total 12" × Monitor "Riscos mapeados 0, Evidências coletadas 0"
  (lê `p.risk_count` e `p.evidence_count`, que não vêm em `/projects`, `monitor.js:64/69`). Levantamentos "Em andamento 3",
  mas só uma linha diz "Em andamento". Progresso em 27% (fases), 43% (estágio de certificação) e por tema.
- **Por que importa:** o consultor não consegue responder "quanto falta para a certificação?". Cada número desmente o outro.
- **Correção:** uma fonte por métrica (o mesmo serviço do Painel). Uma única medida de prontidão para a certificação, explicada
  como a frase do Painel. O Monitor deixa de mostrar contadores que não carrega, ou se funde à Jornada (ver P2 abaixo).
- **Comando:** `/impeccable harden`
- **Onde:** `views/monitor.js:44-72`, `views/monitor.js:209+` (certificação), `views/commercial.js` (stats de levantamentos).

### P2 — Jornada, Monitor e Certificação disputam o fio condutor
- **O quê:** três telas contam a mesma história (fases e estágio), com visual diferente: lista sanfonada, grade de chips coloridos
  sem legenda (verde, âmbar e vermelho só por cor) e chips de estágio com select livre. A Certificação nem está no menu. A
  Jornada vazia e o Monitor vazio mandam um para o outro.
- **Por que importa:** a jornada deveria ser o fio que liga Painel → fase → controle/risco/evidência → auditoria → certificação.
  Hoje ela é uma checklist ao lado do trabalho, não o caminho.
- **Correção:** uma tela só, "Jornada": linha do tempo de 6 etapas até a certificação, com a etapa atual aberta, o que falta nela
  (links para as telas filtradas, como no Painel) e a data-meta do estágio 1/2 no topo. O Monitor vira a vista da carteira e
  a Certificação vira o cabeçalho da Jornada. O vazio da Jornada oferece "Carregar fases", não "Voltar aos projetos".
- **Comando:** `/impeccable shape` e depois `/impeccable distill`
- **Onde:** `views/project.js`, `views/monitor.js:10-200`, `views/monitor.js:209-300`, `login.html:334-346`.

### P3 — Molde de tela repetido e densidade nas telas grandes
- **O quê:** 4 stat cards em caixa alta em quase toda tela. A coluna "Ações" tem formatos diferentes: links (CAPA, Ativos),
  botão primário ciano por linha (Levantamentos `commercial.js:262`, Auditorias "Executar") e 5 links (Evidências). A aba
  "Matriz SWOT" é preenchida com accent, e accent como fundo de área viola a marca. O chip do projeto no cabeçalho em accent
  aparece até para o comercial.
- **Correção:** um padrão de linha: a linha inteira abre o detalhe, há uma ação primária contextual no máximo e o resto vai
  para um menu "Mais". Os stat cards só aparecem quando respondem a uma pergunta. Fora isso, a frase de situação do Painel
  faz o papel deles. Botão primário só para a ação principal da tela.
- **Comando:** `/impeccable layout` e depois `/impeccable polish`
- **Onde:** `views/compliance.js` (SoA e Evidências), `views/grc.js`, `views/monitor.js`, `views/commercial.js:262`, `monitor.js:1021`.

## Cada tela: o próximo passo está claro?

| Tela | Papel | Claro? | Próximo passo / onde falha |
|---|---|---|---|
| Painel | consultor, admin | Sim | "Ver as ações" das CAPA vencidas. O melhor do módulo. |
| Painel vazio | consultor | Sim | "Definir o escopo". Mas o passo 2, "Abrir a jornada", cai num vazio sem saída. |
| Painel erro | consultor | Não | Sem botão de tentar de novo. |
| Jornada | consultor | Parcial | Abrir a fase com bloqueio, mas o "1 impedimento" não diz qual fase é nem leva a ela. |
| Jornada | cliente | Não | Não há "o que é meu". 41 fases e ações de operador. |
| Jornada vazia | consultor | Não | "Voltar aos projetos": beco sem saída, não oferece carregar as fases. |
| Monitor | consultor, cliente | Não | "Gerenciar Fases" volta para a Jornada. Contadores zerados, falsos. Chips só por cor. |
| SoA | consultor | Sim | "Ver controles" na faixa de bloqueio (N/A sem justificativa). Bom. |
| SoA | cliente | Parcial | Mesma tela do consultor, com campos editáveis, atalhos e "Migrar 27701". |
| Detalhe de controle | consultor | Não | Status errado, markdown cru, sem "anexar evidência" no lugar. |
| Controles (lista) | consultor | Não | Vem de "Ver os controles" do Painel, mas não mostra o filtro "+60 dias". Lista crua. |
| Diagnóstico de prontidão | consultor | Parcial | "Analisar com IA"; os itens não são links para o controle. Título "Documentos faltando" para controles. |
| Riscos | consultor | Parcial | "+ Novo Risco"; os 2 riscos altos sem tratamento (do Painel) não aparecem destacados aqui. |
| Detalhe de risco | consultor | Parcial | "Editar Risco"; o controle vinculado mostra "ISO 27001:2022". |
| CAPA | consultor | Parcial | "Detalhes" por linha. As vencidas não ficam marcadas fora do filtro do Painel. |
| Detalhe da CAPA | consultor | Parcial | "Editar Acao"; não há "Registrar resolução", que é o próximo passo real. |
| Auditorias | consultor | Parcial | "Executar" no ciclo 2; o mesmo botão em certificação externa confunde. |
| Execução da auditoria | consultor | Parcial | Registrar achado; a coluna "Auditar 0" e o ID "ISO 27001:2022" não dizem nada. |
| Evidências | consultor | Não | 5 ações por linha; não se vê qual evidência é a próxima a revisar. |
| Evidências | cliente | Não | Mesma tela; o cliente vê "Revisar (Líder SGSI)"/"Assinar CEO" sem saber se é com ele. |
| Gestão de Políticas | consultor | Não | "93 políticas, 86 rascunho": confunde controle com política. "Visualizar / Gerar" repetido 93 vezes. |
| Documentos | consultor | Sim | As revisões vencidas têm selo; "Abrir". Tabela clara, hierarquia por recuo. |
| Ciência de Políticas | consultor | Parcial | O formulário de autoassinatura do consultor no topo; o acompanhamento dos pedidos, que é o que importa, fica abaixo da dobra. |
| Ativos | consultor | Parcial | "+ Novo Ativo"; a classificação em inglês e o "Ativo" em todas as linhas não ajudam a decidir. |
| Fornecedores | consultor | Parcial | O "Trust score" vermelho chama a atenção, mas falta uma ação por fornecedor crítico. |
| Treinamento | consultor | Parcial | O "Não conforme" vermelho assusta sem dizer o que fazer ("cobrar 5 pessoas"). |
| Governança | consultor | Sim | "Convidar para o n.360"; 24 botões repetidos, mas o organograma é claro. |
| Contexto | consultor | Parcial | "Salvar Alterações"; o "100% CONFORME" encerra a conversa antes da hora. |
| Análise Crítica | consultor | Parcial | "Abrir Pauta" da reunião planejada; o selo "Conforme" é falso. |
| Métricas | consultor | Parcial | O "Crítico" não diz o que fazer; tudo em inglês. |
| Incidentes | consultor | Sim | "1 atrasado" no título da aba; o selo "Atrasado" está na linha. |
| Certificação | consultor | Parcial | O estágio é trocado num select livre; não diz o que falta para o estágio 1 em 02/12. |
| Meus pedidos | cliente | Sim | Três "Aguardando você" com caixa de lote; é a melhor tela do cliente, e está escondida atrás da Jornada. |
| Comercial (início) | comercial | Não | Sem próximo passo; "Ver projetos" fora do papel. |
| Leads | comercial | Parcial | "Ver Detalhes"; os status em inglês e o CNPJ sem máscara atrapalham. |
| Levantamentos | consultor, comercial | Parcial | 5 botões ciano iguais; nada destaca o levantamento concluído e pronto para proposta. |
| Propostas | comercial | Parcial | Ações diferentes por linha; "Aguardando aprovação" (desconto) não diz de quem. |
| Nova proposta | comercial | Sim | Wizard de 5 passos claro, "Avançar". |
| Catálogo | admin | Sim | A coluna "Preço" mostra "90 dias na faixa Standard". |

## Red flags por persona

- **Jordan (primeiro acesso, cliente):** cai na Jornada e não no Painel. "Impedimentos / Bloqueios 1" em vermelho, sem dizer
  qual. "Completed/In Progress". "Gerenciar Fases" leva de volta à mesma tela. "Migrar 27701" parece um botão perigoso. A linha
  "j/k navega · x seleciona" é ruído. Não encontra "Meus pedidos" como tarefa principal.
- **Alex (consultor avançado):** a SoA tem atalho, mas o Painel → "Ver os controles" perde o filtro. Evidências exigem 5 cliques
  diferentes por linha. Não há ação em lote em CAPA nem em Riscos. Fica alternando entre Jornada, Monitor e Certificação
  para saber o estado. O "Ausente" falso o obriga a abrir o histórico para confiar.
- **Sam (acessibilidade):** a matriz de risco e os chips de fase do Monitor transmitem estado só por cor (sem legenda no Monitor).
  A cor dos números do fornecedor (vermelho/âmbar/verde) não tem texto. Os selos monoespaçados de 9-10px em caixa alta
  ("EM ANDAMENTO", "OK (FERNANDA ROCHA)") ficam no limite de leitura. O "×" de fechar dos modais é minúsculo e ciano
  (`compliance.js:114`). As células da matriz são `div` com `data-action` e não está claro se recebem foco
  (`grc.js:80`). O botão de colapso "«" não tem rótulo visível.
- **CISO do cliente preparando a auditoria de certificação:** precisa de quatro respostas e não encontra nenhuma em um lugar
  só: (1) A SoA está pronta para assinar? A faixa diz que não, o que é bom. (2) Quais controles aplicáveis não têm evidência
  válida? Isso está no diagnóstico, mas sem link. (3) As NC da auditoria interna têm CAPA fechada? Está no detalhe da CAPA,
  com a resolução vazia. (4) A análise crítica cobre as entradas da 9.3? O selo diz "Conforme", o que é falso. Leva para o
  auditor um dossiê com "Status: Active / Papel: Controller" e "ISO 27001 CONFORME" na política. Esse é o maior risco de
  vergonha diante do organismo certificador.

## Conformidade de marca observada

- **Cumpre:** tema escuro único com os tokens certos (`--bg #0b1326`, `--surface #162244`); geometria quadrada nos cards,
  botões, tabelas e selos; sem gradiente nem blur; sem emoji nem itálico; "n.iso" na casca com o ponto em accent; Montserrat
  nos títulos e Inter no corpo; foco e accent em botões e links.
- **Desvia:**
  - Accent como fundo de área: a aba ativa "Matriz SWOT" (`monitor.js:1021`), os botões primários repetidos por linha em
    Levantamentos e Auditorias e "Gerenciar Fases" pintado à mão com accent (`monitor.js:129`).
  - Montserrat 700 inline (`grc.js:1653`, `compliance.js:1908-1910`), quando o padrão é 600.
  - Títulos de modal em accent grande ("ERP Industrial… — Ransomware…", "Realizar a análise crítica…"): o accent vira decoração.
  - A cor da matriz de risco usa rgba fora dos tokens (`grc.js:60-66`); o vermelho e o laranja não vêm de `--danger`/`--warning`.
  - Mistura de tipos nos selos: o monoespaçado em caixa alta convive com selos em Inter de caixa mista ("Rascunho pendente", "Alto").
  - O cabeçalho do comercial mostra o projeto, mas o papel não tem projeto.
  - A voz da marca (português claro) é quebrada pelo inglês do banco em todo o módulo.

## Fluxo: becos, repetições e onde a pessoa se perde

- **Becos sem saída:**
  - Jornada vazia → "Voltar aos projetos" (`project.js:471`). Monitor vazio → "Abrir o projeto" → a mesma Jornada vazia.
  - Painel vazio, passo 2, "Abrir a jornada", cai nesse vazio.
  - Painel com erro não tem saída.
  - No Comercial, "Ver projetos" fica fora do papel.
- **Passos repetidos:**
  - Política: escrever (Gestão de Políticas, por controle), publicar (Documentos), pedir ciência (Ciência de Políticas), aprovar
    (Meus pedidos). São quatro telas para um objeto, com dois modelos (`compliance_controls.description` e `documentos`) visíveis ao usuário.
  - Progresso: Jornada, Monitor e Certificação.
  - "Partes" e "Partes Interessadas" lado a lado.
- **Onde se perde:**
  - Painel → "Ver os controles" abre a lista sem o recorte prometido.
  - Painel → "Tratar os riscos" chega à matriz sem destacar os 2 riscos citados.
  - A execução de auditoria mostra "ctrl-a515" nos achados, que não dá para clicar até o controle.
  - Certificação, Métricas e Controles fora do menu: quem chegou uma vez por link não acha de novo.

## Observações menores

- Datas em ISO cru (`2026-10-03`) em CAPA, Auditorias, Treinamento, Levantamentos e Métricas, enquanto Documentos e Incidentes usam `03/10/2026`.
- O CNPJ sem máscara em Leads; "---" para o vazio, quando o resto do produto usa "—".
- Na SoA, a coluna "Justificativa / Notas" mostra o markdown da política ("# Política…**Código:**").
- Os chips de rastreabilidade "R: 0 / E: 0" só se leem com legenda; "DPO"/"CEO" em accent parecem links.
- No Treinamento, "Importar JSON" é uma ação de desenvolvedor na tela do cliente.
- "Score médio 10.2" usa ponto decimal; em PT-BR é vírgula.
- "Dados da empresa" aparece no cabeçalho da Jornada e no do Painel, com formas diferentes.
- O botão "+ Novo Ativo" ou "+ Novo Risco" usa "+" textual, e os estados vazios usam "Novo risco" sem "+": falta padrão.
- Os títulos de tela variam de "Riscos" a "Pipeline de Leads & Oportunidades" e "Contexto & Escopo do SGSI (Cláusula 4.1 / 4.3)": falta padrão de comprimento e de "&".

## Perguntas provocativas

1. Se o Painel já sabe dizer ao cliente "o que espera a sua decisão", por que o cliente do n.iso nunca o vê?
2. Quantas telas o CISO precisa abrir para responder "estou pronto para o estágio 1 em 02/12?". Não deveria ser uma só, e
   não deveria ser a Jornada?
3. Gestão de Políticas, Documentos e Ciência de Políticas: qual delas sobrevive quando a fatia 3.3 terminar, e por que o usuário
   ainda vê as três?
4. Um selo "Conforme" gerado porque existe uma linha numa tabela: o que acontece com a ness. quando o auditor discordar
   na frente do cliente?
5. Por que a tela mais densa do produto (SoA, 7 controles por linha × 93) é a mesma para o consultor que a opera e para o
   cliente que só deveria lê-la?
6. Se uma falha de rede pode dizer "Nenhuma evidência enviada", quantas evidências já foram reenviadas em duplicata sem ninguém perceber?
