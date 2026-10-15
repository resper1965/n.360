# Painel de entrada do n.360, do n.iso e do n.privacy: estudo de design (14/10/2026)

Pedido do dono: "um dashboard na entrada, com dados do projeto, mas muito mais elegante que o do sistema antigo".
Este documento não muda código do app. Ele traz o diagnóstico das três entradas de hoje, os dados que a API já
entrega, duas direções com protótipo navegável, a recomendação e o plano de implementação. A decisão é do dono.

**Método.** Usei a skill Impeccable no modo Operate (tela de trabalho), com leitura executiva. O comando
`critique` rodou em duas avaliações isoladas: (A) revisão de design sobre o código e as capturas e (B) detector
mais varredura mecânica. Os gráficos seguem a skill `dataviz`: forma antes de cor, rampa validada por script, nada
dito só por cor, tabela equivalente em todo gráfico. Não há `PRODUCT.md` no repositório. O contexto veio de
`DESIGN.md`, `design.md`, `AGENTS.md` e do código, e o público foi inferido do pedido: consultor da ness., cliente
gestor e encarregado. Essas inferências estão marcadas como suposições na seção 5.

**Base.** `origin/main` em `7477ff1`. As capturas vêm do build local (`npm run build --prefix frontend`), servido em
`127.0.0.1:8787`, com a API simulada como em `frontend/e2e/n360.spec.js` e Chromium headless. Nenhum dado é real: a
empresa "Exemplo Logística Integrada S.A." e todos os nomes são fictícios.

Arquivos de apoio, em [`dashboard-entrada/`](dashboard-entrada/):

| Arquivo | O que é |
|---|---|
| [`prototipo-a-colunas.html`](dashboard-entrada/prototipo-a-colunas.html) | Direção A, navegável. A barra preta do topo troca papel, entrada (n.360, n.iso, n.privacy), estado (em andamento, projeto novo, módulo não habilitado, carregando), carteira e barra recolhida. |
| [`prototipo-b-mosaico.html`](dashboard-entrada/prototipo-b-mosaico.html) | Direção B, navegável. Só a entrada do n.privacy, para o consultor. |
| `prototipo-base.css`, `prototipo-dados.js`, `prototipo-graficos.js` | Tokens copiados do `:root` de `frontend/src/style.css`, os dados de exemplo e os quatro gráficos. Abrem por `file://`, sem servidor. |
| [`atual/`](dashboard-entrada/atual/) | Capturas de hoje: `n360-inicio`, `iso-entrada` e `privacy-entrada`, em 1440 e 1024. |
| [`capturas/`](dashboard-entrada/capturas/) | Capturas dos protótipos: `a-*` e `b-*`, por estado e largura. |

## 1. O legado, como anti-referência

Na entrada, o legado mostra:

- um mostrador semicircular grande ("Mapeamento 83% finalizado") e cinco menores;
- cinco blocos de barras empilhadas pendente/revisão/aprovado;
- prazos dos planos de ação em faixas (+150, 150, 90, 30 dias e vencidos), um gráfico vazio;
- três termômetros de risco;
- solicitações fechadas por mês.

O defeito não está nos dados, está na forma. Doze mostradores de pesos parecidos competem entre si e nenhum diz o
que fazer. Verde, laranja e vermelho aparecem em tudo, então a cor deixa de avisar. "83% finalizado" não diz se o
programa está em dia: um projeto com 83% do mapeamento feito e dois prazos legais vencidos está pior que um com 40%
e nenhum atraso.

O que o legado acerta, e a proposta guarda, é olhar o programa por **tema** (atividades, RIPD, gaps, LIA, riscos) e
por **prazo**.

## 2. O que existe hoje

| Entrada | Tela | Captura |
|---|---|---|
| n.360 (`/`) | `frontend/src/views/inicio.js`: um cartão por módulo e o "ponto de partida" | [`atual/n360-inicio-1440.png`](dashboard-entrada/atual/n360-inicio-1440.png) |
| n.iso (`/iso`) | `frontend/src/views/dashboard.js`: "Dashboard Executivo" | [`atual/iso-entrada-1440.png`](dashboard-entrada/atual/iso-entrada-1440.png) |
| n.privacy (`/privacy`) | `frontend/src/views/encarregado.js`: "Painel do encarregado" | [`atual/privacy-entrada-1440-inteira.png`](dashboard-entrada/atual/privacy-entrada-1440-inteira.png) |

### Diagnóstico curto

**n.360, Início.** A tela não responde "como estou". Os dois cartões repetem o slogan do módulo e um botão "Abrir".
O único dado é o painel "O que um módulo já adianta para o outro", que é útil, mas é assunto secundário. 60% da
tela fica vazia. O vazio é bem resolvido: projeto sem nada registrado ganha uma linha só, e não um painel de zeros
(`ponto-de-partida.js:26-29`).

**n.iso, Dashboard Executivo.** É o caso mais grave, porque **mostra dados da carteira como se fossem do projeto**:

- `renderDashboard` lê `GET /api/v1/controls` (`dashboard.js:76-81`). Para consultor e administrador, essa rota
  devolve os controles de **todos** os projetos visíveis (`src/routes/controls.ts:50-54`). Os "33%" e os "31 de 93"
  são da carteira, e aparecem com "Selecione um projeto" no seletor (`atual/iso-entrada-1440.png`).
- Projeto sem `progress` herda a taxa global (`dashboard.js:123`), então todo projeto da lista mostra o mesmo número.
- Sem controles, o total vira 93 por *fallback* (`dashboard.js:87`), o que inventa um denominador.
- O botão principal é "+ Novo Lead" para qualquer papel (`dashboard.js:13`), embora o cartão de leads só apareça
  para o comercial.
- Levantamentos, projetos e controles têm o mesmo peso. Nada diz o que fazer depois.

**n.privacy, Painel do encarregado.** É a melhor das três e a semente da proposta. A tabela "O que fazer" prioriza
e leva à tela de cada pendência. As contas são do servidor (`src/services/encarregado.ts`), e o zero fica neutro.
Os problemas são de forma:

- A cobertura LGPD aparece três vezes: no topo, na lista e num sexto cartão laranja que fica sozinho, com a
  largura inteira.
- Os cinco cartões abaixo repetem os números da lista.
- "9" pedidos aparecem em vermelho quando só 2 estão atrasados (`encarregado.js:35`).
- Os seis botões "Abrir" têm o mesmo nome acessível e levam à lista inteira, sem filtro.
- Falta a identidade da empresa.

### Crítica (Impeccable `critique`, avaliações A e B isoladas)

**Heurísticas de Nielsen, avaliação A:** 21 de 36 (58%, "aceitável"), com dois n/a.

| Heurística | Nota | Motivo principal |
|---|---|---|
| Visibilidade do estado | 2 | 33% sem dizer de onde vem o número |
| Linguagem do usuário | 3 | "Total do SGSI" e "Gaps" são jargão de consultor |
| Controle e liberdade | 3 | Menu claro e "Abrir" que leva à tela |
| Consistência | 1 | Três layouts e três posições para o ponto de partida; o n.360 escolhe o projeto sozinho e o n.iso não |
| Reconhecer em vez de lembrar | 2 | "Abrir" sem filtro obriga a guardar o item na cabeça |
| Flexibilidade | 2 | Não há carteira para quem cuida de vários projetos |
| Estética e minimalismo | 2 | Repetição no n.privacy e vazio no n.360 |
| Ajuda | 2 | Os vazios explicam, mas não orientam o primeiro passo |

**Por persona:**

- Consultor com carteira: confunde o número da carteira com o número do projeto.
- Cliente que precisa aprovar: nenhuma entrada diz "N pedidos esperam a sua decisão". Isso fica em "Meus pedidos".
- Encarregado: está bem servido, mas perde tempo com a repetição.
- Leitor de tela: os cartões são `div` sem rótulo e valor, "41/65" é lido como data e não há landmarks.

**Detector e varredura, avaliação B:**

- `impeccable detect` acusa 7 `overused-font` nas views: são as fontes da marca escritas como literal, como
  `'Montserrat'` inline em `dashboard.js`, em vez de `var(--font-head)`. A fonte não muda; o que muda é usar o token.
- O detector também aponta `side-tab` em `style.css:294` (a borda de 3px do item ativo do menu) e quatro
  `layout-transition`.
- `dashboard.js` tem 44 atributos `style=`, 12 `rgba(` literais, 3 *kickers* em caixa alta com accent em texto não
  interativo ("Fase 1/2/3") e um título em Montserrat 700.
- Nenhuma das três telas tem `<main>`, `<section>` nem título próprio. Só o dashboard tem estado de carregamento, e
  é um *spinner*. Nenhuma tem esqueleto.
- Chamadas por entrada: o Início faz 1, o encarregado 2 e o dashboard até 5. O dashboard repete 4 chamadas que o
  `loadAll` do boot já fez (`globals.js:1319`). `loadDashboardStats` é definida duas vezes.

## 3. Dados que a API já entrega

O custo está em consultas ao D1 por chamada. "Lista" quer dizer que a rota devolve todas as linhas do projeto e a
conta seria feita no navegador.

| Rota | O que traz para o painel | Custo | Uso no painel |
|---|---|---|---|
| `GET /projects/:id/empresa` (migration 0071) | `razao_social`, `nome_fantasia`, `cnpj`, `porte`, `cnae_codigo`, `cnae_descricao`, `setor`, `funcionarios`, `municipio`, `uf`, `situacao_cadastral`, `representante_*`; `pode_editar` | 1 SELECT por chave primária | Identidade |
| `GET /projects/:id/encarregado` | `prioridades[]` (`nivel`, `texto`, `tela`), `encarregados[]` e blocos com contagens prontas: `pedidos_titular`, `incidentes`, `tratamentos`, `terceiros`, `documentos`, `evidencias`, `lgpd`, `prazos_legais` | Cerca de 12 consultas: 3 listas, tratamentos com 2 EXISTS, 5 contagens e as lacunas LGPD quando o catálogo existe | Frase de saúde, "O que fazer" e cobertura do n.privacy |
| `GET /projects/:id/ponto-de-partida` | `cadastro` (9 contagens), `cobertura` LGPD e ANPD, `iso_ajudados` | 1 lote de 9 contagens, 2 cálculos de lacunas e 1 consulta de mapeamentos | "O que um módulo adianta para o outro" |
| `GET /projects/:id/requisitos/lacunas?fonte=lgpd` | Situação por artigo (coberto, parcial, lacuna, com origens) | Pesado: é o mesmo cálculo de lacunas | Detalhe da cobertura, fora da entrada |
| `GET /projects/:id/ropa`, `/dpia`, `/titular-pedidos`, `/incidentes`, `/terceiros`, `/evidence`, `/consentimentos` | Linhas completas: status, `prazo_em`, `situacao_prazo`, `valido_ate`, situação do terceiro | Lista: 1 consulta cada, e cresce com o projeto | Vencimentos e barras. Para a entrada, convém agregar no servidor |
| `GET /api/v1/risks` do projeto (`/projects/:id/risks`) | `impact`, `probability`, `risk_score`, `risk_level`, `treatment`, `status` e controle ligado | Lista: 1 consulta | Mapa de risco do n.iso. O nível segue `riskLevel` (`src/routes/risks.ts:8-13`) |
| `GET /projects/:id/risk-matrix` | `by_level`, `by_treatment`, `average_score` | 1 consulta | Não serve ao mapa: não traz probabilidade por impacto |
| `GET /projects/:id/capa` | Ações com `due_date`, `status`, `risk_id`, `incidente_id` | Lista | Vencimentos e "ações vencidas" |
| `GET /projects/:id/audits` | `audit_schedule` ordenado por `scheduled_date` | Lista | Próxima auditoria |
| `GET /projects/:id/controls` | Controles do projeto (status e aplicabilidade, de onde sai a SoA) | Lista (93 a mais de 100 linhas) | Cobertura por tema do Anexo A. **Usar esta rota, não `/api/v1/controls`** |
| `GET /api/v1/pedidos` | Pedidos em que a pessoa é destinatária: `tipo`, `titulo`, `papel_exigido`, `meu_status`, `criado_em` | 1 consulta, até 200 linhas | "Esperando a sua decisão", na visão do cliente |
| `GET /projects/:id/pedidos` | Painel de pedidos do projeto: pendentes e não abriram | 1 consulta agrupada | Lado do consultor: aprovações paradas |
| `GET /platform/portfolio` | Projetos visíveis, sem nenhuma contagem | 1 consulta | Lista da carteira, sem saúde |
| `GET /platform/dashboard` | 5 contagens da carteira inteira | 5 consultas | Nada: é número da plataforma |
| `GET /platform/notifications` | As últimas 50 notificações da pessoa, incluindo os avisos de prazo da rotina diária | 1 consulta | Não é calendário. Os vencimentos precisam de um agregador |

Conclusão: a **identidade** e o **n.privacy** cabem hoje com o que existe (empresa, encarregado e ponto de partida).
Faltam três coisas: (1) as prioridades e a cobertura do **n.iso** calculadas no servidor; (2) um **agregador de
vencimentos** por projeto; (3) a **carteira** com saúde por projeto. O mapa de risco por atividade no n.privacy
depende da fase F2 do plano do legado (`docs/superpowers/plans/2026-10-14-legado-privacidade.md`, branch
`docs/plano-legado-privacidade`).

## 4. Princípios da proposta

1. **A empresa é o título.** O painel abre com a razão social, o CNPJ, o setor, o porte, o encarregado e o estado do
   programa. O usuário sabe em um segundo de qual cliente se trata.
2. **Uma frase de saúde no lugar de mostradores.** A frase diz se o programa está em dia, o que está atrasado e
   quanto há a decidir na semana. O estado sempre vem escrito ("Atrasado", "Sua vez", "Em dia", "Começando") ao lado
   do quadrado de cor, nunca só pela cor.
3. **Todo número leva a uma ação.** "O que fazer agora" é a peça principal. Os itens vêm agrupados por prazo
   (atrasado, nesta semana, para planejar) e cada um traz o botão do próximo passo, com nome único.
4. **Uma visualização para a cobertura.** Todos os temas usam a mesma barra 100% com concluído, em andamento e falta,
   na mesma escala, para dar para comparar. A cor é uma rampa ordinal de um matiz só (cinza-azulado). O accent fica
   para o que se clica, e a cor de status fica para o que está atrasado.
5. **Gráfico só onde muda a decisão.** O mapa de risco mostra onde está o risco. A linha do tempo de 90 dias mostra o
   que vence e quando. Há uma *sparkline* só, a dos pedidos do titular, porque o volume de pedidos muda a carga do
   encarregado.
6. **Vazio que ensina.** Projeto novo não mostra zeros: mostra os primeiros passos. Módulo não habilitado diz o que o
   módulo traz e quem habilita.
7. **Rápido como o legado não é.** Uma chamada, esqueleto no lugar certo e nada de *spinner* no meio da tela.

**Suposições** (não houve entrevista; confirmar na seção 9):

- o consultor abre o painel várias vezes por dia e precisa da carteira;
- o cliente gestor abre uma vez por semana e quer saber o que depende dele;
- o encarregado do cliente usa a mesma visão do consultor, no n.privacy.

## 5. Duas direções

### Direção A: leitura em colunas (recomendada)

Capturas: [`a-privacy-consultor-1440`](dashboard-entrada/capturas/a-privacy-consultor-1440.png),
[`a-privacy-consultor-1024`](dashboard-entrada/capturas/a-privacy-consultor-1024.png),
[`a-iso-consultor-1440`](dashboard-entrada/capturas/a-iso-consultor-1440.png),
[`a-privacy-cliente-1440`](dashboard-entrada/capturas/a-privacy-cliente-1440.png),
[`a-n360-consultor-1440`](dashboard-entrada/capturas/a-n360-consultor-1440.png),
[`a-n360-carteira-1440`](dashboard-entrada/capturas/a-n360-carteira-1440.png),
[`a-n360-cliente-sem-modulo-1440`](dashboard-entrada/capturas/a-n360-cliente-sem-modulo-1440.png),
[`a-privacy-novo-1440`](dashboard-entrada/capturas/a-privacy-novo-1440.png),
[`a-privacy-carregando-1440`](dashboard-entrada/capturas/a-privacy-carregando-1440.png),
[`a-privacy-recolhida-1024`](dashboard-entrada/capturas/a-privacy-recolhida-1024.png).

A tela se lê de cima para baixo, como um relatório de uma página:

1. **Identidade**, sem cartão: a empresa é o título e os dados cadastrais vêm numa linha de rótulo e valor.
2. **Saúde**: o estado e uma frase em Montserrat 600, com uma linha de apoio e "calculado às 14:32".
3. **Duas colunas.** À esquerda, a ação: "O que fazer agora" e os vencimentos. À direita, o contexto: cobertura, mapa
   de risco e pedidos por semana.

Abaixo de 860 px de área útil (1024 com a barra aberta), as colunas viram uma, na ordem de importância. Com a barra
recolhida, 1024 volta a ter duas.

- **Forte:** a hierarquia é inequívoca, porque a frase e a lista vêm antes de qualquer gráfico. A mesma gramática
  serve ao n.360, ao n.iso e ao n.privacy, e muda só o conteúdo. Não tem nenhum número solto.
- **Fraco:** quem quer "ver tudo" rola a tela. O mapa de risco e a cobertura ficam abaixo da dobra em 1024.

### Direção B: faixa de saúde e mosaico

Capturas: [`b-privacy-consultor-1440`](dashboard-entrada/capturas/b-privacy-consultor-1440.png) e
[`b-privacy-recolhida-1024`](dashboard-entrada/capturas/b-privacy-recolhida-1024.png).

Uma faixa só junta a identidade (à esquerda), a frase (à direita) e quatro números clicáveis embaixo, cada um com o
estado escrito. Abaixo vem um mosaico de 12 colunas: a lista e os vencimentos com 7 colunas, e a cobertura, o mapa e
a *sparkline* com 5.

- **Forte:** mais coisa acima da dobra em 1440. Os quatro números dão o "placar" que o executivo procura.
- **Fraco:** os quatro números repetem a lista logo abaixo, que é o mesmo defeito do painel de hoje, só que mais
  bonito. É o "template de métrica herói" que a skill recusa por padrão. O mosaico desalinha as alturas e, em 1024,
  vira uma coluna longa sem a ordem de leitura da A. A identidade comprimida perde o porte e o local.

### Recomendação: A

A direção A responde ao pedido do dono ("dados do projeto, muito mais elegante") com a decisão que o legado não toma:
**dizer o que fazer antes de mostrar números**. A elegância vem da hierarquia e da contenção: uma frase, uma lista,
quatro visualizações de forma única, cor só para avisar. Não vem de mais mostradores. A B fica como alternativa se o
dono quiser um placar numérico no topo. Nesse caso, o meio-termo é pôr na A, sob a frase, uma linha de até três
números clicáveis, nunca cartões.

## 6. As peças, uma a uma

**Identidade.** Vem de `GET /projects/:id/empresa`:

- Campos: razão social, nome fantasia, CNPJ com máscara, setor e CNAE, porte e pessoas, município e UF.
- O encarregado vem de `encarregados[]` do painel e o estado do programa vem da regra abaixo.
- Campo vazio aparece como "Não informado", e o botão muda de "Dados da empresa" para "Completar o cadastro".
- **Estado do programa** (proposta): "Começando" (sem atividades ou sem controles avaliados), "Em implantação" (há
  cadastro, sem ciclo fechado) e "Em operação desde <mês>" (primeira aprovação de RoPA ou SoA). Decisão do dono.

**Frase de saúde.** É montada no servidor, a partir das prioridades, para que a frase e a lista nunca discordem. O
link "Como esta frase é montada" abre a regra.

- "Atrasado": há prazo legal ou de ação vencido (pedido do titular, comunicação de incidente, ação corretiva,
  avaliação de terceiro). A frase nomeia o mais grave.
- "Atenção": nada vencido, mas algo vence em até 7 dias ou há pendência alta (DPIA exigida, encarregado ausente).
- "Em dia": nenhuma das duas. A frase diz o próximo prazo.
- "Começando": projeto sem cadastro mínimo, que não pode ser chamado de "em dia" (mesma regra de
  `encarregado.ts:105-106`).
- "Sua vez", só para o cliente: há pedido de aprovação ou ciência para a pessoa.

**O que fazer agora.** No n.privacy, usa as `prioridades` de hoje com três acréscimos no servidor: `prazo` (data ou
"exigido"), `contexto` (até dois exemplos, como os protocolos dos pedidos) e `tela` com filtro (por exemplo,
`titular?situacao=atrasado`), para o "Abrir" não cair na lista inteira. O agrupamento atrasado, semana e planejar
substitui "alta" e "média". O n.iso ganha o equivalente: ações corretivas vencidas, auditoria em até 30 dias, riscos
altos sem tratamento, controles parados há mais de 60 dias e exclusões da SoA sem justificativa. O cliente vê
"Esperando a sua decisão", que vem de `GET /api/v1/pedidos` filtrado por `meu_status = 'pendente'`.

**Cobertura do programa.** Cada tema é uma barra 100%. Os temas do n.privacy são atividades, RIPD exigidos, LIA
exigidas, terceiros, pedidos (90 dias), incidentes (12 meses) e evidências. Os do n.iso são os quatro temas do Anexo
A, riscos, ações e evidências.

- A rampa ordinal, `#e2e8f0` (concluído), `#94a3b8` (em andamento) e `#475569` (falta), passou no validador da skill
  `dataviz` contra a superfície `#162244`: `node validate_palette.js "#e2e8f0,#94a3b8,#475569" --mode dark --surface
  "#162244" --ordinal` deu "ALL CHECKS PASS", com a ponta escura a 2,06:1.
- As partes da barra ficam separadas por um vão de 2 px e o rótulo direto à direita diz "29 de 38". A legenda aparece
  uma vez. A coluna "como se conta" da tabela equivalente explica o que é cada parte em cada tema.

**Mapa de risco.** Uma grade 5 por 5, probabilidade por impacto, com a contagem na célula.

- O fundo da célula marca a faixa de nível de `riskLevel` (baixo sem fundo, médio, alto e crítico). Cada célula tem
  nome acessível ("Probabilidade 4, impacto 5, nível Alto: 1 risco"), e a legenda traz os nomes e as contagens.
- No n.iso, sai de `/projects/:id/risks`. No n.privacy, só depois da F2 do plano do legado (riscos por atividade);
  até lá o quadro não aparece.

**Próximos vencimentos (90 dias).** Uma linha por tipo, com um ponto por item no eixo de 0 a 90 dias.

- A faixa clara marca os próximos 7 dias, e os pontos dentro dela ficam em âmbar. O que já venceu não cabe no eixo e
  vira número com rótulo ("2 venc.").
- Substitui as faixas +150, 150, 90, 30 e vencidos do legado, que mostram contagem sem dizer qual item vence. A F4 do
  plano do legado pede essas faixas; a proposta é atendê-las com esta linha e com a tabela equivalente.

**Pedidos do titular por semana.** Uma *sparkline* de 12 semanas com a linha da média, o número desta semana e a
média escritos ao lado. Aparece só no n.privacy e só para quem responde os pedidos.

**Acessibilidade em todas as peças:**

- landmarks (`main`, `section` com `aria-labelledby`), um `h2` por quadro;
- `role="img"` com resumo em texto em cada barra;
- "Ver como tabela" (`<details>`) com a tabela equivalente;
- dica que aparece também no foco do teclado e é montada por `textContent`;
- botões de ação com nome único (`aria-label="Responder os pedidos: 2 pedidos do titular..."`);
- `prefers-reduced-motion` respeitado no esqueleto.

## 7. Papéis, módulos e estados

| | n.360 (`/`) | n.iso (`/iso`) | n.privacy (`/privacy`) |
|---|---|---|---|
| Consultor ou encarregado | Identidade, frase dos dois módulos, uma linha por módulo (estado, frase, três números, "Abrir") e "O que fazer" dos dois, marcados por módulo. Alterna para a **Carteira**: projetos por urgência, com situação, o mais urgente, o último movimento e "Abrir". | Identidade, frase ISO, "O que fazer" ISO, vencimentos, cobertura do Anexo A e mapa de risco | Identidade, frase LGPD, "O que fazer", vencimentos, cobertura por tema, mapa de risco (F2) e pedidos por semana |
| Cliente (gestor) | Identidade, "Sua vez", "Esperando a sua decisão" dos dois módulos e as linhas dos módulos | Identidade, "Sua vez", decisões, cobertura e mapa | Idem, sem vencimentos e sem *sparkline* (são assunto da consultoria) |
| Projeto novo | Primeiros passos dos módulos habilitados | Primeiros passos ISO: escopo, diagnóstico, ativos | Primeiros passos LGPD: encarregado, importar o programa, terceiros |
| Módulo não habilitado | A linha do módulo diz o que ele traz e quem habilita: "Habilitar no projeto" para a equipe, "Falar com a ness." para o cliente | Tela de acesso, com o caminho de volta | Idem |
| Carregando | Esqueleto com o mesmo desenho da tela final, sem *spinner* | Idem | Idem |

A barra recolhida (72 px) é testada nos protótipos. A área útil cresce e, em 1024, a direção A volta a ter duas
colunas.

## 8. Plano de implementação em fases

### Fase 0, hoje e pequena: correções sem desenho novo (cerca de meio dia)

- O dashboard do n.iso passa a ler `GET /projects/:id/controls` do projeto ativo e escolhe o projeto sozinho, como
  `inicio.js:16-20`. Saem o *fallback* 93 e a herança de `complianceRate` em `progress`.
- "+ Novo Lead" só aparece para `ehComercial()`.
- A view lê `S.*` em vez de repetir as chamadas do `loadAll`.
- Arquivos: `frontend/src/views/dashboard.js`, `frontend/test/` (um teste jsdom: o projeto A não conta controles do
  B).

### Fase 1, hoje, com os dados que já existem: o painel do n.privacy na direção A (3 a 4 dias)

- **Servidor:** `GET /projects/:id/painel` (faixa `privacy`). Numa chamada, devolve a empresa (`lerEmpresa`), a visão
  do encarregado (`visaoDoEncarregado`), a frase montada (`saudeDoProjeto`, função pura testável), a cobertura por
  tema (um `db.batch` de contagens por status de `ropa_records`, `dpia_assessments`, `lia_assessments`, terceiros,
  `titular_pedidos`, `incidentes` e `evidence`) e os vencimentos de 90 dias (um `UNION ALL` de datas, com teto de 200
  itens).
- Precisa de faixa em `src/modulos.ts`, contrato em `src/openapi.ts` e teste de isolamento por organização. As
  `prioridades` ganham `prazo`, `contexto` e `tela` com filtro, sem quebrar quem já as lê: o menu usa
  `exigem_atencao` e `com_pendencia`.
- **Frontend:** `frontend/src/views/painel.js` (novo), com as peças em `frontend/src/views/painel-graficos.js`
  (cobertura, vencimentos, *sparkline*), e o estilo em `frontend/src/style.css`, com tokens e sem `style=` inline.
  `encarregado.js` vira o "Painel" do n.privacy e mantém o modal de indicar encarregado. O "ponto de partida" sai do
  topo e fica só no n.360.
- **Desempenho:**
  - uma chamada por entrada;
  - esqueleto desenhado no primeiro quadro;
  - resposta guardada em `S.painel[projectId]` por 60 segundos, com a tela antiga mostrada em opacidade reduzida
    enquanto recarrega (sem piscar o esqueleto);
  - no servidor, `db.batch` em vez de consultas em série;
  - meta: p95 abaixo de 300 ms com 500 atividades, medido em teste com dados gerados.
- **Testes:**
  - servidor, com D1 real: frase por cenário (atrasado, atenção, em dia, começando), cobertura por status,
    vencimentos no limite de 90 dias, isolamento entre organizações e projeto sem módulo dando 403;
  - jsdom: todo item de "O que fazer" tem botão com nome único; nada de cor sem texto; "Ver como tabela" em cada
    gráfico; texto do servidor escapado;
  - e2e: o `n360.spec.js` estendido conta `page.on('request')` para `/painel` = 1 na entrada;
  - catracas visuais: `frontend/test/catracas-visuais.test.js` sem 10px novo.

### Fase 2: n.iso e n.360 (3 a 4 dias)

- **Servidor:** `prioridadesIso` (ações corretivas, auditorias, riscos sem tratamento, controles parados, SoA) e a
  cobertura do Anexo A por tema (o prefixo A.5 a A.8 do controle). O mesmo `GET /projects/:id/painel` responde pela
  faixa do módulo pedido (`?modulo=iso`); o n.360 pede os dois e junta.
- **Frontend:** `dashboard.js` passa a ser só o funil comercial (uma tela "Comercial", fora da entrada do
  consultor). A entrada do n.iso usa `painel.js`. `inicio.js` ganha as linhas por módulo e a lista unificada.
- **Mapa de risco:** no n.iso, já com `risks`.

### Fase 3: carteira do consultor (cerca de 2 dias)

- `GET /api/v1/carteira`: para os projetos de `projetosVisiveis`, 5 a 6 consultas agrupadas por `project_id`
  (pedidos atrasados, comunicações atrasadas, ações vencidas, terceiros vencidos, próximo prazo, último movimento na
  trilha). Não é uma chamada ao painel por projeto, que seria N vezes mais cara.
- A tela vive em `inicio.js` como alternância "Projeto | Carteira". Para o consultor com mais de um projeto, a
  carteira pode ser o padrão (decisão do dono).

### Fase 4: depende do plano do legado

- **F2** (riscos e ações por atividade): mapa de risco no n.privacy e "Ações das atividades" nos vencimentos (a
  linha marcada "F2" no protótipo).
- **F3** (ciclo de vida e bases legais): tema "Ciclo de vida documentado" na cobertura.
- **F4** (painel e exportação): as faixas de prazo pedidas ali são atendidas pela linha de vencimentos e pela
  tabela. A exportação CSV ganha um botão "Exportar" no cabeçalho do painel.
- **F6** (importação do legado): depois dela, comparar lado a lado os números do painel com os do legado para o
  mesmo cliente. É a prova de que a migração não perdeu dado.

### Riscos

| Risco | Mitigação |
|---|---|
| A frase diz "Em dia" para um projeto mal cadastrado | O estado "Começando" e a regra de `encarregado.ts` (projeto vazio não está em dia), com teste por cenário |
| `prioridades` muda de forma e quebra os selos do menu | Só campos novos; os selos leem contagens que não mudam (`test` do menu existente) |
| O painel fica lento em projeto grande | `db.batch`, teto de itens nos vencimentos e meta de p95 medida em teste |
| A cobertura "por tema" mistura unidades diferentes | A barra é 100% por tema e o rótulo direto dá o absoluto ("29 de 38"); a tabela diz como cada tema é contado |
| O cliente vê número que é da consultoria | As visões por papel saem do servidor (o mesmo `cliente` de `visaoDoEncarregado`) |

### Medida de sucesso, verificável

1. A entrada de cada módulo faz **1** chamada de dados de painel (e2e conta as requisições).
2. A frase de saúde aparece em menos de **1 s** com a API simulada em 300 ms (e2e com `route` atrasada).
3. **Nenhum** número da entrada vem de outro projeto: teste de servidor com dois projetos e organizações.
4. **Todo** item de "O que fazer" tem um botão com nome acessível único, e **todo** gráfico tem tabela equivalente
   (jsdom).
5. O `impeccable detect` sobre as views novas sai sem achado além das fontes da marca, e as catracas visuais passam.
6. Teste de 5 segundos com o dono e dois consultores, sobre o protótipo e depois sobre a tela real: perguntados "o que
   você faria agora?", os três apontam o primeiro item atrasado.

## 9. Decisões do dono

1. **Direção:** A (recomendada) ou B. Se for A, pôr ou não a linha de até três números sob a frase.
2. **Estado do programa:** aceitar os três estados (Começando, Em implantação, Em operação desde <mês>) e o marco que
   inicia a operação (primeira aprovação de RoPA ou SoA).
3. **Regra da frase de saúde:** aceitar "Atrasado / Atenção / Em dia / Começando / Sua vez" e o que conta como prazo
   vencido.
4. **Entrada do consultor no n.360:** a carteira como padrão quando houver mais de um projeto, ou o projeto ativo.
5. **"Dashboard Executivo" do n.iso:** separar o funil comercial numa tela "Comercial" própria, fora da entrada.
6. **O cliente vê ou não** a cobertura e o mapa de risco, ou só "Esperando a sua decisão" e as linhas dos módulos.
7. **Fase 0 já:** autorizar a correção do número da carteira no dashboard do n.iso antes do resto. É defeito, não
   desenho.
8. **Ordem:** fazer as fases 1 e 2 antes da F2 do legado (o painel não depende dela) ou depois (o mapa de risco do
   n.privacy já entra junto).

## 10. Decisões adotadas (15/10/2026)

O dono autorizou a Fase 0, a ordem "antes da F2" e a direção A. As demais não foram respondidas: valeu a recomendação deste
estudo, implementada nas Fases 1 a 4, e cada uma se reverte no lugar indicado.

| # | Decisão | O que foi feito | Onde reverter |
|---|---|---|---|
| 1 | Direção A, sem a linha de números sob a frase | Só a frase e a linha de apoio; os três números ficam nas linhas dos módulos do n.360 | `frontend/src/views/painel.js` (`saude`) |
| 2 | Estados do programa | "Começando" (sem atividade nem controle avaliado), "Em implantação", "Em operação desde <mês>" (primeira aprovação de RoPA ou de controle da SoA) | `estadoDoPrograma` em `src/services/painel.ts` |
| 3 | Regra da frase | Sua vez (só cliente com pedido para ele), Começando, Atrasado (pedido do titular, comunicação de incidente, ação, avaliação de terceiro), Atenção (até 7 dias ou pendência exigida), Em dia; projeto vazio nunca "Em dia" | `saudeDoProjeto` em `src/services/painel.ts` |
| 4 | Consultor no n.360 | "Projeto \| Carteira"; a carteira é o padrão com mais de um projeto visível; a escolha fica no `localStorage` (`n360_vista`), lida e gravada em try/catch | `vistaDoN360` em `painel.js` |
| 5 | Funil comercial | Saiu da entrada do n.iso para a tela "Comercial" (grupo Comercial, só para quem é do comercial); o papel comercial entra nela | `frontend/src/views/dashboard.js` (`renderComercial`) |
| 6 | O que o cliente vê | "Esperando a sua decisão" e as linhas dos módulos; sem cobertura, mapa, vencimentos nem a lista da consultoria. A visão sai do servidor | `painelDoProjeto` (`quem.cliente`) |
| 7 e 8 | Fase 0 e ordem | Já decididas | — |

Desvios do estudo, com o motivo:

- **Uma rota, faixa `nucleo`.** A faixa depende do `?modulo=`, que o middleware não lê; a rota faz a mesma recusa (projeto, depois
  pessoa) e devolve o mesmo 403.
- **Filtro nas telas de destino.** "Abrir" leva à tela e à aba certas (pedidos ou incidentes), mas as listas de destino não têm
  filtro por situação; criar esse filtro em cada lista ficou para depois.
- **Vencimentos.** O D1 recusa SELECT composto com mais de 5 termos, então a união vai em blocos de 4. A linha "Ações das
  atividades" sai das faixas de prazo da F4 (`acoes_por_prazo`), e o modal das seis faixas continua a um clique ("Ações por prazo").
- **Cliente no n.iso.** A entrada do cliente no n.iso continua sendo a Jornada (o roteador já o levava para lá e o item Painel é
  escondido para cliente); o "Sua vez" aparece no n.360 e no n.privacy.
- **Ponto de partida.** Ficou só no início do n.360, na coluna da direita, como o estudo pede; as entradas dos módulos não o chamam.

