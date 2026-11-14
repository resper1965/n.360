# Entrada do n.360: ver os projetos sem entrar em nenhum

Data: 14/11/2026. Situação: **proposta, aguardando a revisão do dono**. Onda própria da spec guarda-chuva
`2026-11-14-n360-posicionamento-e-fluxo-design.md`, logo depois da onda 0 (a carteira já terá o n.ot). Sem migration.

## O pedido do dono

"Gostaria de ver o status do meu projeto sem ter um projeto escolhido; não entrar conectado a um projeto." A tela depois do login é
a que confunde.

## Problema

Hoje o Início do n.360 (`frontend/src/views/painel.js`, `telaDoN360`) tenta ser três coisas:

1. **Entra preso a um projeto que ninguém escolheu.** `projetoDaEntrada` pega o primeiro da lista quando não há projeto ativo, e o
   estado guarda o último usado (`niso_activeProject`, `frontend/src/state.js`). A tela mostra os dados dele sem dizer isso.
2. **Repete o painel dos módulos.** Frase de saúde, uma linha por módulo, a lista "O que fazer agora" e o ponto de partida: o Painel
   do n.iso e o do n.privacy já mostram o mesmo, para o mesmo projeto.
3. **Tem dois modos com o mesmo nome.** A equipe com mais de um projeto abre na carteira e alterna para "projeto"
   (`vistaDoN360`, escolha gravada em `n360_vista`).

E o destino muda sem aviso (`frontend/src/globals.js`, boot): equipe sem projeto é levada a `/iso`; quem tem um módulo só é levado
direto para ele. Conta e acessos divide o menu com o trabalho.

## O que muda

### 1. O Início é a lista dos projetos, sem projeto escolhido

- O Início do n.360 passa a ser **uma tela só**: os projetos que a pessoa alcança, com a situação de cada um. Não há projeto ativo no
  Início; o seletor da barra lateral mostra "Nenhum projeto escolhido" enquanto a pessoa estiver nele.
- Entrar no n.360 **não escolhe projeto**. O último projeto usado continua lembrado só para o seletor oferecê-lo primeiro; ele não é
  aplicado sozinho no Início. `projetoDaEntrada` deixa de valer para a entrada `n360` (segue valendo dentro dos módulos, que precisam de
  um projeto).
- A alternância Projeto/Carteira sai, com `n360_vista`. A visão de projeto do Início (`telaDoN360`) sai: o painel de cada módulo já a
  entrega.

### 2. Ver a situação de um projeto sem entrar nele

Cada projeto é uma linha: empresa, módulos, situação, o mais urgente, último movimento (o que `GET /api/v1/carteira` já devolve).

- **Abrir a linha no lugar** (botão "Ver situação", com `aria-expanded`): mostra, por módulo que a pessoa tem, a frase de saúde, os
  números e o item mais urgente. Vem de `GET /api/v1/projects/:id/painel` (sem `?modulo`), pedido só quando a linha abre e guardado
  pelos mesmos 60 s do painel. **Isso não muda o projeto ativo.**
- **Entrar é um ato explícito**: um botão por módulo ("Abrir no n.iso", "Abrir no n.privacy", "Abrir no n.ot"). Só aí o projeto vira o
  ativo e a pessoa vai para o módulo (`painelAbrirProjeto`, que já faz isso).
- Uma ação primária na tela: o "Abrir" do módulo com a pendência mais urgente do primeiro projeto da lista. Os demais são secundários.
- A lista usa `montarLista` (busca sem acento, "N de M", 25 por vez), como as outras listas.

### 3. Uma tela por tipo de pessoa, a mesma estrutura

| Quem | O que vê |
|---|---|
| Equipe com projetos | A lista, ordenada por urgência (a ordem de hoje da carteira) |
| Cliente (um projeto) | O projeto dele já aberto no lugar, com "Esperando a sua decisão" acima; os botões dos módulos que ele tem. Não há lista de um item só fechada |
| Quem pode criar projeto, sem nenhum | "Nenhum projeto ainda" e "Novo projeto" (o assistente que já existe) |
| Quem não pode criar, sem nenhum | A tela "sem acesso" de hoje |
| Stakeholder | Não muda: "Minhas aprovações" |

### 4. Ninguém é redirecionado em silêncio

- Sai o redirecionamento da equipe sem projeto para `/iso` e o de "um módulo só, entra direto nele". Quem abre `/` vê o Início.
- Continuam: `/iso`, `/privacy` e `/ot` abrem o módulo; `?tela=` do n.360; o pedido vindo de um módulo (`pedidoDoHub`).
- Com a área comercial desligada (`COMERCIAL_ATIVO`), o motivo do redirecionamento a `/iso` não existe mais: "Novo projeto" está na
  tela Projetos e passa a estar no Início vazio. Com ela ligada, o funil continua no n.iso, alcançado pelo menu.

### 5. Menu do n.360

- Itens de trabalho: **Início** e **Minhas aprovações**.
- **n.ot** sai do menu do n.360 como item solto: passa a ser um botão de módulo na linha do projeto, como os outros dois.
- **Conta e acessos** (Projetos, Usuários, Consultorias, Identidade, Segurança do projeto, Modelos de fornecedor, Chaves de API,
  Agentes) fica num grupo à parte, abaixo, com o título de sempre. O papel continua decidindo cada item.
- Dentro de um módulo nada muda: o seletor de projeto, o rodapé "n.360" e "Abrir este projeto no n.<outro>".

## Servidor

Nada novo. `GET /api/v1/carteira` e `GET /api/v1/projects/:id/painel` já existem e já fazem o corte de acesso, de módulo por pessoa e
da visão do cliente. Depois da onda 0, os dois trazem o n.ot para quem tem o módulo.

## O que não muda (e não pode regredir)

- O cliente continua preso ao `client_project_id`; a lista dele nunca mostra outro projeto.
- P0-1 e P0-2 do n.ot: o botão "Abrir no n.ot" e a situação do n.ot só aparecem quando o servidor mandou o módulo.
- O filtro do painel (`n360_filtro` no `sessionStorage`) e o clique do sino continuam levando à tela certa do módulo.
- Uma ação primária por tela; nenhum estado só por cor; sem estilo inline novo.

## Testes

- Frontend (jsdom, `frontend/test/painel-view.test.js` e `frontend/test/boot-*.test.js`): entrar em `/` sem projeto ativo não pede
  `/painel` de nenhum projeto e não grava `niso_activeProject`; abrir a linha pede o painel daquele projeto e não muda `S.activeProject`;
  "Abrir no n.x" muda o projeto ativo e vai ao módulo; cliente vê o projeto dele aberto; equipe sem projeto vê "Novo projeto" e não é
  levada a `/iso`; um módulo só não redireciona.
- E2E (`frontend/e2e/n360.spec.js`): o roteiro de entrada atualizado.
- `frontend/test/casca-menu.test.js`: menu do n.360 sem o item solto do n.ot.

## Entrega

Dois PRs: (1) o Início como lista, com a linha que abre no lugar e os botões de módulo; (2) o boot sem redirecionamento e o menu.

## A confirmar com o dono

1. A linha abre no lugar (recomendado) ou num painel lateral.
2. O cliente com um projeto só vê a situação já aberta (recomendado) ou a mesma lista fechada.
3. Se "Minhas aprovações" deve aparecer também como quadro no topo do Início da equipe, quando houver pedido esperando a pessoa.

## Não conferido

- Quais telas do n.360 ainda dependem de `S.activeProject` existir (Segurança do projeto, Chaves de API): o plano lista com
  `git grep -n "S.activeProject" -- frontend/src/views` e trata cada uma (pedir o projeto na própria tela).
- O comportamento com a área comercial ligada não foi exercitado.
- A tela não foi vista em execução; a leitura é do código.
