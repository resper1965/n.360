# Onda 0: uma língua nos três módulos e o n.ot à vista

Data: 14/11/2026. Situação: **construída (#589)**; aprovada pelo dono em 14/11/2026. Primeira onda da spec guarda-chuva
`2026-11-14-n360-posicionamento-e-fluxo-design.md` (aprovada pelo dono em 14/11/2026). Sem migration.

## Problema

1. **A mesma coisa tem nomes diferentes conforme o módulo.** O fornecedor é "Fornecedores" no menu dos dois módulos, mas "terceiros" no
   painel, na carteira e nos avisos de prazo. O documento versionado é "Políticas e normas" no n.iso e "Políticas" no n.privacy. A
   governança é "Governança" num e "Papéis e comitê" no outro. O `login.html` ainda carrega rótulos que ninguém vê (Sistemas, Terceiros,
   Documentos, Mapa de risco, Encarregado), sobrescritos por `ROTULOS_PRIVACY` (`frontend/src/produto.js`).
2. **O n.ot é invisível fora dele.** O painel do n.360 só monta os blocos `iso` e `privacy` (`src/services/painel.ts`: "o n.ot ainda não
   tem bloco no painel"), a carteira só conta pendência dos outros dois (`situacaoNaCarteira`) e os avisos de prazo não têm fonte do n.ot
   (`Fonte` e `FAIXA_DA_FONTE` em `src/services/avisos-prazo.ts`). Quem cuida de um projeto só com n.ot vê "Começando" para sempre.
3. **Texto errado no modal de nova consultoria**: "convite com a senha provisória" (`frontend/src/views/organizacoes.js`). Desde a
   migration 0077 o convite leva o link de criar a senha, nunca senha.

## O que muda

### A. Um rótulo por conceito

Só texto de tela. Nenhum id de menu, rota, tabela ou valor de banco muda.

| Conceito | Hoje | Passa a ser | Onde |
|---|---|---|---|
| Fornecedor | "terceiros" no painel, na carteira e no aviso ("Avaliação de terceiro"); "Fornecedores" nos menus | **Fornecedor(es)** em todo texto de tela, e-mail e CSV | `src/services/painel.ts`, `src/services/avisos-prazo.ts`, textos de `frontend/src/views/terceiros.js` |
| Documento versionado | "Políticas e normas" (n.iso), "Políticas" (n.privacy) | **Políticas e normas** nos dois | `ROTULOS_PRIVACY` |
| Governança | "Governança" (n.iso), "Papéis e comitê" (n.privacy) | **Papéis e comitê** nos dois | `frontend/login.html`, `ROTULOS_PRIVACY` |
| Cadastro de partes | "Partes" (n.iso, tudo junto); "Pessoas" e "Parceiros" (n.privacy) | n.iso: **Pessoas e parceiros** (uma tela, como hoje); n.privacy não muda | `frontend/login.html` |
| Inventário | "Ativos" nos dois; no n.ot, ativos dentro de Sites | não muda; no texto que cruza módulos, o do n.ot é **ativo de OT** | — |
| Riscos, Incidentes, Evidências, Áreas, Ações corretivas | iguais | não mudam | — |
| "Consultorias" | menu de Conta e acessos | não muda agora; vira "Organizações" na onda 1 | — |

Limpeza junto: o `login.html` passa a trazer o rótulo que a tela mostra (Ativos, Fornecedores, Arquivos, Riscos) e `ROTULOS_PRIVACY`
fica só com o que de fato difere por módulo (o "Painel" do n.privacy, "Atividades", "Solicitações", "Cobertura da LGPD", "Avaliações",
"Questionários"). O título de cada tela continua saindo do rótulo do menu (`tituloDaTela`).

Fica como está o nome interno: `terceiros` em rota, tabela, arquivo e código não muda.

### B. O n.ot no painel e na carteira

**Painel** (`GET /api/v1/projects/:id/painel`): entra o bloco `ot`, no mesmo formato dos outros (`saude`, `numeros`, `comecando`,
`fazer`), para quem tem o módulo `ot` no projeto e na pessoa. A recusa de módulo da rota já vale; o `?modulo=ot` passa a ser aceito.

- `comecando`: nenhum site ativo.
- `fazer` (a lista "O que fazer"), só com o que a tela inicial do n.ot já mostra (`frontend/src/views/ot-inicio.js`), limitado aos
  sites da pessoa (`sitesPermitidos`, `src/services/ot-inventario.ts`):
  - lote aguardando revisão;
  - desvios abertos;
  - base aguardando aprovação e obra a vencer;
  - sonda parada;
  - item do assessment com revisão vencida;
  - aceite de desvio a vencer, só para o Gestor ARCiber, como na tela do módulo.
- `numeros`: sites em operação de sites ativos; desvios abertos.
- Cada item leva só contagem, nome do site e a ação ("Abrir"), que navega para o n.ot na tela certa. **Nunca** IP, MAC, nome de ativo,
  nem contagem de ativos ou de achados (seria oráculo do inventário, a mesma regra do `POST /ot-sensor/resumo`).
- Visão do cliente: só a frase e os números, como nos outros módulos.
- `estadoDoPrograma` passa a considerar o n.ot: projeto com site ativo deixa de ser "Começando".
- Tela (`frontend/src/views/painel.js`): a linha "n.ot" entra com os demais módulos; "Abrir" vai a `/ot`.

**Carteira** (`GET /api/v1/carteira`): o lote de consultas ganha uma, agrupada por projeto, com desvios abertos, lotes em revisão e
sondas paradas, só para projeto com `ot` e pessoa com `ot`. `situacaoNaCarteira` ganha o ramo do n.ot depois dos prazos legais do
n.privacy: sonda parada e desvio aberto contam como atenção ("N desvios abertos", "N sondas paradas"), com `modulo_urgente = 'ot'`.
Continua uma consulta por lote (`db.batch`), nunca projeto a projeto.

### C. Avisos de prazo do n.ot

Três fontes novas em `src/services/avisos-prazo.ts`, com a faixa `ot` (o tipo `Faixa` já a aceita; `avisos_prazo.fonte` não tem CHECK,
então não há migration):

| Fonte | Vence em | Quem recebe | Marcos |
|---|---|---|---|
| `ot_aceite` | `ot_desvios.aceito_ate` de desvio `aceito` | o Gestor ARCiber do projeto | D-7 e D0 |
| `ot_obra` | `ot_sites.obra_ate` de site em obra | o Gestor ARCiber do projeto | D-7 e D0 |
| `ot_revisao` | `ot_avaliacoes.proxima_revisao` | quem tem o módulo `ot` e alcança o projeto | D-7, D0 e atraso |

- Título sem dado sensível: "Aceite de desvio vence em 7 dias", "Obra do site <nome> vence hoje", "Revisão do requisito <código> vencida".
- O clique abre `/projects/:id/ot` (o sino já trata esse caminho).
- Não repete o que já existe: depois do vencimento, `reabrirVencidos` e `encerrarObrasVencidas` continuam avisando como hoje. As fontes
  `ot_aceite` e `ot_obra` não têm marco de atraso.
- E-mail-resumo: os itens do n.ot entram no mesmo resumo, só para quem tem o módulo.

### D. Texto do convite

O modal "Nova consultoria" passa a dizer que o administrador recebe por e-mail o link para criar a senha.

## O que não muda (e não pode regredir)

- **P0-1**: o `ot` nunca é concedido automaticamente. Ver o n.ot no painel exige o módulo no projeto e na pessoa.
- **P0-2**: chave de API e agente MCP continuam sem n.ot. O bloco `ot` do painel e a consulta da carteira não saem para `apikey:` nem
  para `agente`.
- Técnico (`org_user`) só vê contagem dos sites concedidos.
- A exportação de portabilidade segue sem tabela `ot_*`.
- O indicador de progresso do n.iso e a cobertura da LGPD não são tocados.

## Testes

- Backend, com o D1 real: bloco `ot` do painel (projeto sem site, com site, técnico com um site só, pessoa sem o módulo, chave de API e
  agente recusados); carteira com projeto só de n.ot; as três fontes de aviso (D-7, D0, idempotência, quem recebe).
- Um teste que varre o corpo do bloco `ot` e da linha da carteira e reprova IP, MAC e nome de ativo.
- Frontend: `frontend/test/casca-menu.test.js` atualizado para os rótulos novos; `frontend/test/painel-view.test.js` com a linha do n.ot.
- `frontend/test/rotulos-csv.test.js` segue passando (o CSV usa os mesmos rótulos).

## Entrega

Três PRs pequenos, nesta ordem: (1) rótulos e texto do convite; (2) n.ot no painel e na carteira; (3) avisos de prazo do n.ot. Nenhum
depende de migration; cada um passa pelo portão local (`scripts/ci/ship.sh`).

## A confirmar com o dono

1. "Papéis e comitê" nos dois módulos (a alternativa é "Governança" nos dois).
2. "Pessoas e parceiros" como rótulo do cadastro de partes no n.iso.
3. Se a consultoria deve receber os avisos `ot_aceite` e `ot_obra`, ou só o Gestor ARCiber do cliente.

## Não conferido

- Como a equipe da consultoria é limitada por site no n.ot além do `org_user`: li só `sitesPermitidos`.
- Se o e-mail-resumo dos avisos tem texto por fonte que precise de ajuste além do rótulo.
- Os textos de "terceiro" fora de `painel.ts` e `avisos-prazo.ts` não foram contados; o plano lista um a um com
  `git grep -n -i "terceiro" -- frontend/src src/services` e separa texto de tela de nome interno.
