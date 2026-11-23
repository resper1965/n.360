# n.360: posicionamento, fluxo de uso e normalização (spec guarda-chuva)

Data: 14/11/2026. Situação: **aprovada pelo dono em 14/11/2026; ondas 0 a 4 construídas (#589 a #593)**. As decisões da seção 3 foram tomadas pelo dono na conversa de
14/11/2026; o resto é desenho a aprovar. Esta spec não tem plano próprio: ela fixa o posicionamento, as decisões e a ordem das ondas.
Cada onda ganha a sua spec e o seu plano.

## 1. O que o n.360 é

Um grupo de plataformas de GRC sobre um cadastro só, para duas formas de uso:

- **consultoria** que atende vários clientes (o que existe hoje);
- **organização** que usa a plataforma diretamente, sem consultoria (não existe hoje).

Hoje "módulo" mistura duas coisas. A partir desta spec elas se separam:

| Conceito | O que é | Exemplos |
|---|---|---|
| **Módulo** | Domínio de trabalho, com casca, menu e telas próprias | n.iso (sistemas de gestão ISO), n.privacy (privacidade), n.ot (rede operativa do setor elétrico) |
| **Framework** | Catálogo de requisitos avaliado no projeto; entra como dado | ISO 27001, ISO 27701, LGPD, ANPD, RO-CB.BR.01; a entrar: ISO 42001, CIS Controls v8.1 |
| **Núcleo** | Cadastro e processos que todos os módulos usam | partes, terceiros, itens, documentos, evidências, riscos, ações corretivas, incidentes, pedidos |

Consequência para o que o dono quer trazer:

- **ISO 42001** é sistema de gestão, da mesma família da 27001: entra no n.iso como mais uma norma. O que ela pede de novo
  (inventário de sistemas de IA e avaliação de impacto) será desenhado na spec da onda 2, reaproveitando itens e a avaliação de impacto
  que já existem.
- **CIS Controls v8.1** não é certificável: é postura, medida e reavaliada. Entra como framework com avaliação periódica, sem copiar a
  trilha de certificação do n.iso. Em que casca ele aparece é decisão da spec da onda 2.

## 2. O que existe hoje (levantado em 14/11/2026, por leitura do código)

Cada item traz onde está. Número só com o comando que o mede.

1. **Cliente é um projeto, sempre de uma consultoria.** `organizations` é a consultoria; `projects.org_id` é obrigatório; `empresas` é
   1:1 com `projects` (a chave é `project_id`). Não há organização cliente nem nada acima do projeto. O usuário de cliente alcança um
   projeto só (`users.client_project_id`; `PAPEIS_CLIENTE` em `src/helpers.ts`).
2. **Uso direto não existe.** Só o `platform_admin` cria organização (`src/routes/organizacoes.ts`). Há atos que só a equipe da
   consultoria faz: 52 ocorrências de `ehEquipeNess` em `src/routes`, imports incluídos
   (`git grep -c ehEquipeNess -- src/routes | awk -F: '{s+=$2} END {print s}'`). Entre eles: criar projeto, habilitar módulo, encerrar
   incidente, questionário de fornecedor, importar programa, organizar políticas, requisito não aplicável, mesclar cadastros, link do auditor.
3. **O n.ot não usa o núcleo.** `ot_ativos`, `ot_requisitos` e `ot_avaliacoes` não têm ligação com `itens`, `risks`, `partes`,
   `corrective_actions` nem `incidentes`. `ot_desvios` tem ciclo próprio e não gera ação. O painel do n.360 só monta blocos `iso` e
   `privacy` (`src/services/painel.ts`), a carteira mostra do n.ot só o nome e `FAIXA_DA_FONTE` (`src/services/avisos-prazo.ts`) não tem `ot`.
4. **Três catálogos de requisitos.** O global (`requisito_fontes`, `requisitos`, `requisito_mapeamentos`; fontes em `FONTES`,
   `src/services/requisitos.ts`: `iso27001:2022`, `iso27701:2025`, `lgpd`, `gdpr`, `anpd`), o `compliance_controls` do n.iso (por
   projeto, com `standard` em texto e `requisito_id` opcional) e o `ot_requisitos`. Cada um com o seu vocabulário de situação:
   `compliance_controls.status` em texto livre (reduzido por `src/services/classe-controle.ts`), `ot_avaliacoes.situacao`
   (`atende`, `parcial`, `nao_atende`, `nao_se_aplica`) e o derivado de `lacunasDaFonte` (`coberto`, `parcial`, `lacuna`, `nao_aplicavel`).
5. **Framework novo esbarra na trilha do n.iso.** `stmtControles` é genérico, mas `catalogosDoProjeto` decide por `/27001/` e `/27701/`
   (`src/services/project-setup.ts`); `CRITERIOS` da prontidão, `PHASE_CHECKLISTS` e os passos de `src/data/passos/` são escritos para a
   27001; `SQL_CLASSE_CONTROLE` não filtra `standard`, então o indicador de progresso soma todas as normas do projeto.
6. **Não há jornada comum.** O n.iso tem quatro telas de progresso (Painel, Jornada, Prontidão, Monitor). O n.privacy não tem trilha de
   implantação na tela: a ordem existe só em `agent-skills/implantacao-privacy/`. O n.ot tem régua por site (`frontend/src/views/ot-base.js`).
   O único conceito comum é `estadoDoPrograma` (`src/services/painel.ts`), calculado sem o n.ot.
7. **Mesma coisa, nomes diferentes.** Partes, Pessoas e Parceiros; Fornecedores e Terceiros; Políticas e normas, Políticas, Arquivos e
   Documentos; Governança e Papéis e comitê (`frontend/login.html`, `ROTULOS_PRIVACY` em `frontend/src/produto.js`). Status antigos em
   inglês sem CHECK (`Open`, `Draft`, `Active`), novos em português com CHECK. Responsável ora em texto, ora em `partes`, ora em `users`.
   "Gestor ARCiber" tem duas definições: o cargo na governança (`src/services/ot-conformidade.ts`) e o `org_admin` do projeto
   (`ehGestorArciber`, `src/routes/ot.ts`).
8. **Cinco guardas de arquivo**: `evidence`, `documentos_arquivo`, `acao_anexos`, `incidente_anexos`, `importacao_arquivos`.
9. **Onboarding sem encadeamento.** Nova consultoria, contrato de módulos, novo projeto (o único com assistente), módulos do projeto,
   novo usuário, módulos da pessoa. O modal de consultoria ainda diz "convite com a senha provisória" (`frontend/src/views/organizacoes.js`).
10. **OT2net** (`resper1965/OT2net`) é o antecessor do n.ot, protótipo sem cliente. Tem o que o n.ot não tem: risco de OT ligado a ativo e
    site, plano diretor de iniciativas, levantamento de processos. Previa CIS v8.1, ANEEL 964, IEC 62443 e NIST 800-82 só com dados de exemplo.

## 3. Decisões do dono (14/11/2026)

- **D1. Módulo é domínio; framework é catálogo.** A ISO 42001 entra no n.iso; o CIS Controls v8.1 entra como framework de postura.
- **D2. O ativo de OT não vai para o inventário comum.** Ele nasce de sonda e levantamento, passa por lote e aprovação, tem zona, fluxos
  e IP/MAC mascarados. O núcleo aponta para ele; não o copia.
- **D3. Organização do tipo "direta".** A tabela de organizações ganha um tipo. Na direta, a própria organização opera a plataforma, e
  um grupo de empresas é uma organização com vários projetos.
- **D4. Ordem das ondas**: a da seção 4 (o dono pediu a sugestão; é a recomendada).

## 4. As ondas

Cada uma é independente o bastante para ter spec, plano e PRs próprios. Nenhuma começa sem a spec aprovada.

### Onda 0: linguagem e visibilidade (pequena, sem migration)

- Um rótulo por conceito nos três módulos (a tabela sai na spec da onda; a fonte única continua `rotuloDe` e os rótulos de menu).
- n.ot no painel do n.360 e na carteira: uma linha com a situação e o mais urgente, só para quem tem o módulo `ot`, sem IP, MAC nem
  contagem que sirva de oráculo do inventário.
- Avisos de prazo do n.ot (aceite de desvio a vencer, obra a vencer, revisão do assessment) no mesmo mecanismo, com a faixa `ot`.
- Corrigir o texto da senha provisória.

### Entrada do n.360 (média, sem migration)

Pedido do dono em 14/11/2026: ver a situação dos projetos sem entrar em nenhum. O Início vira a lista dos projetos, sem projeto
escolhido, com a situação de cada um aberta no lugar e a entrada no módulo como ato explícito. Spec:
`2026-11-14-entrada-n360-design.md`. Vem logo depois da onda 0.

### Onda 1: organização direta (média)

- `organizations` ganha o tipo (`consultoria` ou `direta`).
- Na direta, as pessoas usam os papéis de equipe (`consultoria_admin`, `consultor`): já alcançam todos os projetos da organização, a
  carteira, criar projeto e os atos de "só equipe".
- As travas de "só o `org_admin` do projeto" passam a aceitar o administrador de uma organização direta, só nela. Conhecidas:
  `ehGestorArciber` (`src/routes/ot.ts`) e `podeMexerEmAssinatura` (`src/helpers.ts`). A spec classifica uma a uma as 67 linhas com
  `org_admin` (`git grep -n "org_admin" -- src/routes src/services src/middleware ':!*.test.ts' | wc -l`).
- **Segregação continua entre pessoas.** Quem pede não aprova o próprio pedido; quem cria o lote não o aprova; aceite de risco e
  assinatura seguem carimbados pela sessão. A spec lista onde isso já é garantido por pessoa e onde hoje depende do papel.
- Criar a organização direta continua ato do `platform_admin` (autoatendimento fica fora).
- Vocabulário da tela: "Consultorias" vira "Organizações".

### Onda 2: catálogo único de requisitos (grande)

- `requisitos` passa a ser o catálogo de todos os frameworks. `ot_requisitos` e os controles do n.iso apontam para ele (o
  `compliance_controls.requisito_id` já existe).
- Uma avaliação por projeto e requisito, com um vocabulário só de situação. O item técnico do assessment do n.ot continua derivado do
  inventário de OT (D2).
- `requisito_mapeamentos` vale entre quaisquer frameworks: o que foi avaliado numa norma aparece como cobertura proposta na outra, e só
  conta depois de validado por uma pessoa (a regra de hoje).
- ISO 42001 e CIS Controls v8.1 entram como fontes. O texto normativo vem de material revisado, não de memória de modelo.
- O indicador de progresso passa a ser por framework.
- Fica fora: reescrever a trilha de 132 passos para outras normas. A jornada é a onda 4.

### Onda 3: n.ot apontando para o núcleo (média)

- Risco, ação corretiva e incidente ganham referência opcional a ativo ou site de OT, legível só por quem tem o módulo `ot`.
- Desvio vira ação corretiva por decisão de uma pessoa, nunca sozinho.
- Fornecedor de OT (integrador, fabricante, acesso remoto) usa o cadastro de terceiros e a mesma avaliação.
- Não regridem: P0-1 (o `ot` nunca é concedido automaticamente), P0-2 (sem chave de API nem agente), máscara e step-up, e a exportação
  de portabilidade sem tabela `ot_*`.

### Onda 4: jornada comum (grande)

- Um modelo de programa com as mesmas etapas em todo módulo (proposta: Começar, Levantar, Avaliar, Tratar, Operar), cada módulo com os
  seus passos.
- A trilha de implantação do n.privacy sai da skill do agente e vai para a tela.
- O n.iso reduz as quatro telas de progresso.
- Onboarding encadeado: organização, projeto, módulos, pessoas, primeiro passo de cada módulo.
- O que o OT2net tinha e vale trazer (plano diretor de iniciativas, risco de OT) é avaliado aqui e na onda 3.

## 5. Fora de escopo, de propósito

- Traduzir no banco os status em inglês: é caro e a tela já traduz por `rotuloDe`. Só o vocabulário de situação de requisito se unifica (onda 2).
- Unificar as cinco guardas de arquivo. Reavaliar depois da onda 2.
- Organização cliente como entidade abaixo da consultoria (grupo de empresas atendido por consultoria). Reabrir se aparecer cliente assim.
- Migrar código ou dado do OT2net.
- Autoatendimento, cobrança e planos.

## 6. Riscos

- A onda 1 muda quem pode o quê: cada trava aberta precisa de teste de integração nos dois tipos de organização.
- A onda 2 toca o indicador único do n.iso e a cobertura da LGPD; os números mostrados ao cliente não podem mudar sem explicação.
- A onda 3 cruza a fronteira do modelo de ameaças do n.ot; a spec dela começa pela revisão desse modelo.

## 7. Não conferido

- Os fatos da seção 2 vêm de leitura do código em 14/11/2026, não de sonda em produção.
- A classificação das 67 linhas com `org_admin` não foi feita.
- Número de itens e texto da ISO 42001 e do CIS Controls v8.1 não foram conferidos contra a publicação oficial.
- Se os recursos de nuvem do OT2net (Worker, D1, Cloud Run) ainda existem.
