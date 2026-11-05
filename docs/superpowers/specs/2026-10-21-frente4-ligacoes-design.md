# Frente 4 da equalização: ligações entre os módulos (21/10/2026)

O que sobrou do P2 de `docs/arquivo/equalizacao-modulos-2026-10-20.md` depois das Frentes 1 a 3. Decisões do dono de 21/10/2026:
4.1 opção (a), 4.2 opção (a) sem migration, 4.3 e 4.4 como abaixo. Fora desta frente: Word e relatório do documento versionado e o
documento em arquivo no Painel/LGPD/DPA (4.5, rodada própria) e as telas duplicadas sobre a mesma tabela (CAPA x GAPs, Ativos,
Fornecedores).

Nenhuma migration. Nenhuma mudança no conteúdo congelado dos pedidos.

## 4.1 Controle e medida

Hoje a medida do RoPA (`tratamento_medidas.controle_id`) aponta para o controle, mas o controle não sabe disso. Controle não se apaga
(não há rota de exclusão), então o risco é a mudança de status.

1. **Servidor.** `GET /api/v1/controls/:id/atividades` devolve as atividades que têm medida ligada ao controle:
   `[{ ropa_id, atividade, medida }]`, ordenado por atividade. Mesmo acesso das outras rotas por id do controle (`requireResourceAccess`,
   faixa `iso` pela tabela). Consulta com `project_id` dos dois lados. Atividade cancelada (`status = 'Inactive'`) fica fora.
2. **Tela do controle (n.iso, `compliance.js`).** Bloco "Usado em N atividades do n.privacy", com o nome de cada atividade e da medida. Cada
   nome é link para a atividade (`abrirAtividade`, aba Medidas de Segurança) só se a pessoa tem o n.privacy (`modulosVisiveis`); senão é
   texto. Sem atividade, o bloco não aparece.
3. **Confirmação ao mudar o status.** Se o status sai de implementado (`classeDoControle` deixa de ser `feito`) e há atividades ligadas,
   a tela pede confirmação citando até 5 atividades ("e mais N"). Cancelar volta o select ao valor anterior.
4. **Aviso na medida (defeito).** `frontend/src/atividade/aba-medidas.js` testa `!m.controle && m.controle_deixou_de_estar_implementado`, que
   nunca é verdadeiro (o servidor só marca o aviso quando o controle existe). A condição passa a ser só
   `m.controle_deixou_de_estar_implementado`.

Sem aviso no sino.

## 4.2 DPO da governança e encarregado

O encarregado é a parte com vínculo `encarregado` (`parte_vinculos`), lida por painel, encarregado, Word e rascunhos. O DPO de "Papéis e
comitê" é uma linha de `project_governance`. A ponte (`garantirEncarregado`, `src/services/encarregado-pessoa.ts`) casa por e-mail,
senão por nome, e só roda ao gravar o membro: mudar nome e e-mail juntos cria uma parte nova; mudar a parte no n.privacy não chega à
governança.

1. **Governança para parte.** `POST /projects/:id/governance` de membro que era DPO e continua DPO, com nome ou e-mail mudado: a parte que
   casava os valores ANTIGOS (a mesma regra `casa`) recebe o nome novo (`normalizarNome`) e o e-mail novo, e o vínculo é garantido. Se o
   e-mail novo já é de outra parte pessoa do projeto, a parte antiga não muda: vale o `garantirEncarregado` de hoje (liga a outra) e o
   vínculo da antiga sai pelo `desfazerEncarregado`. Função nova `atualizarEncarregado(db, projectId, antes, depois)` em
   `encarregado-pessoa.ts`.
2. **Parte para governança.** `PUT /projects/:id/partes/:id` (`src/routes/nucleo.ts`) de parte com vínculo `encarregado`, com nome ou e-mail
   mudado: o membro DPO da governança que casava os valores antigos recebe os novos. Falha aqui é registrada (`registraErro`) e não
   derruba a gravação da parte.
3. **Encarregado visível no comitê.** `GET /projects/:id/governance` continua devolvendo a lista (a tela e o MCP a leem assim). Rota nova
   `GET /projects/:id/governance/encarregados-fora` (faixa `nucleo`, como a governança): as partes ativas com vínculo `encarregado` que nenhum membro DPO casa
   (`[{ parte_id, nome, email }]`). A tela "Papéis e comitê" (`monitor.js`) mostra cada uma numa linha "Encarregado indicado no
   n.privacy", com o botão "Adicionar ao comitê", que abre o formulário de membro preenchido (nome, e-mail, papel DPO).
4. Trilha: `governanca.encarregado.sincronizado` (governança para parte) e `parte.dpo_sincronizado` (parte para governança), só com ids.

## 4.3 Painel do n.iso

1. **"O que fazer" do n.iso (`src/services/painel.ts`)** ganha:
   - **fornecedor com avaliação vencida:** fornecedores (`SQL_EH_FORNECEDOR`) cuja avaliação mais recente está vencida (`situacaoDe`
     = `vencida`). Grupo `atraso`, ação "Ver os fornecedores", tela `vendors`, filtro `vencidos`;
   - **pedido esperando decisão:** pedidos abertos do projeto com destinatário pendente. Grupo `semana`, ação "Ver os pedidos", tela
     `meus-pedidos` (a equipe vê ali os pedidos do projeto). Só na visão da equipe; o cliente já recebe `decisoes` e o item não se repete.
2. **Lista de fornecedores do n.iso.** `GET /api/v1/projects/:id/vendors` passa a trazer `situacao` (a de `situacaoDe` da avaliação mais
   recente). `FILTROS` (`frontend/src/filtro-painel.js`) ganha `vendors::vencidos`, e a lista do n.iso aceita o filtro do painel
   (`montarLista` já aceita `filtroPainel`).
3. **Selos do menu do n.iso.** `GET .../painel?modulo=iso` passa a devolver `selos` (`capa`: abertas e vencidas; `evidencias`: em análise e
   vencidas ou não conformes; `fornecedores`: pendentes e vencidos; `pedidos`: abertos). `aplicarSelos` (`frontend/src/selos-menu.js`) deixa
   de sair quando o produto não é o n.privacy e aplica os selos do n.iso em `nav-capa`, `nav-evidence`, `nav-vendors` e `nav-dashboard`
   (este só com atraso), com a mesma regra visual: número = total a tratar, contorno âmbar = pendente, fundo vermelho = atraso.

## 4.4 Áreas no n.iso

1. `nav-areas` sai de `SO_PRIVACY` (`frontend/src/produto.js`) e entra no menu do n.iso, no grupo onde está Partes. A tela é a mesma
   (`views/areas.js`): criar, editar, descrição, inativar. As rotas `/departamentos` já são faixa `nucleo`.
2. Partes do n.iso (`views/partes.js`) deixa de listar os departamentos e mostra o link "Áreas" para a tela nova.
3. `frontend/test/casca-menu.test.js` fixa a estrutura nova do menu do n.iso.

## Testes

- Backend (D1 real): rota de atividades do controle (isolamento por projeto, atividade cancelada fora, faixa), sincronização nos dois
  sentidos (nome e e-mail, e-mail que já é de outra parte, membro que deixou de ser DPO), `encarregados-fora`, itens novos do painel e
  `selos` do n.iso, `situacao` na lista de fornecedores.
- Frontend (jsdom): bloco "Usado em" com e sem n.privacy, confirmação ao sair de implementado, aviso da medida, linha do encarregado e
  "Adicionar ao comitê", filtro `vendors::vencidos`, selos do n.iso, Áreas no menu do n.iso.
- `contrato-tela-api` e `modulos-produto` atualizados com as rotas novas.

## Fora

- Aviso no sino ao mudar o controle.
- Ligação gravada (`parte_id`) entre governança e parte.
- Item 4.5 (documento) e as telas duplicadas.
