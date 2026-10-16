# Bancada da trilha

Data: 15/10/2026. Redesenho da tela da jornada de implementação do n.iso (`renderProjectDetail`, hoje em
`frontend/src/views/project.js:128`, 1.488 linhas no arquivo). Decisões do dono do produto, fechadas em conversa; este texto
as traduz em modelo, contrato, entrega e riscos. Plano de execução em
[`docs/superpowers/plans/2026-10-15-bancada-trilha.md`](../plans/2026-10-15-bancada-trilha.md).

## 1. Problema

A crítica da tela deu 16 em 40: não é clara, não é óbvia, não é objetiva. Os números que a explicam:

- 6 etapas recolhidas (`JOURNEYS`, `project.js:197`), 41 fases e 132 caixas de marcar
  (`grep -cE "^\s+\{ id: 'p[0-9]+_[0-9]+'" src/constants.ts`: 132; 63 `document`, 40 `evidence`, 29 `task`).
- **Cinco lugares para escrever** sobre o mesmo trabalho: a anotação livre do item (`saveChecklistItemNotes`,
  `project.js:1444`), o assistente de documento (`openDocWizard`, `:519`, que grava JSON em `checklist_progress.notes`), o
  questionário da fase (`openPhaseQuestionnaire`, `:915`, que grava em `project_phase_answers`), as entrevistas por trilha
  (`openInterviewWizard`, `:684`, que grava em `project_interviews`) e o campo de notas da fase (`project_phases.notes`).
- Nenhum "próximo passo": a tela não diz onde continuar.
- A situação da fase é um `select` manual (`changePhaseStatus`, `:1261`) e o único critério de pronto é o "Definition of Done"
  do `globals.js:1759`, que lista caixas não marcadas e deixa "Concluir mesmo assim" como saída principal.
- Rascunhos de assistente e progresso das entrevistas vivem em `localStorage` (`project.js:586`, `:833`, `:855`): somem ao
  trocar de máquina e o consultor não vê o que o colega fez.
- A lista das 6 etapas existe duas vezes (`project.js:197` e `monitor.js:8`) e `openPhaseDetail` é um stub
  (`project.js:1333`, só um toast).

**Meta.** Um consultor da ness. senta diante da tela, muitas vezes com o cliente ao lado, e percorre a jornada passo a passo sem
nenhuma dúvida sobre o que fazer e o que escrever, com copiloto de IA, em nível enterprise.

## 2. Decisões do dono (não reabrir)

1. Público: consultor da ness., às vezes com o cliente olhando. **Tudo na tela é seguro para o cliente**: sem jargão em inglês
   (Gap Assessment, DoD, Readiness Review, Stage 1...). Computador primeiro; responsividade segue fora de escopo
   (`PRODUCT.md`, "Platform").
2. A estrutura não muda: 6 etapas, 41 fases, ids de item (`p3_3`) e progresso dos projetos. Sem migration estrutural; coluna ou
   tabela nova só com justificativa, com `schema.sql`, migration e nota de backup (`AGENTS.md`, regra do schema).
3. A unidade é o **Passo** (cada um dos 132 itens).
4. Layout de três colunas: trilha à esquerda, cartão do passo ao centro, copiloto à direita. Barra de topo com "Continuar de
   onde parou". Um único botão primário: "Salvar e ir ao próximo passo".
5. A situação da fase é **derivada** dos passos; o `select` manual sai. Bloqueio exige motivo e responsável. Passo só conclui
   quando o "concluído quando" passa, ou com exceção registrada, com motivo e trilha (`logAudit`).
6. Sai: modal do questionário da fase, campo de notas livres, rascunhos em `localStorage`, progresso das entrevistas só em
   `localStorage`, a lista duplicada de etapas, "Concluir mesmo assim" como ação principal.
7. Copiloto nos três modos; a IA **só propõe** (marca "proposta", Aceitar ou Descartar), nunca conclui nada, e o agente MCP não
   aceita proposta (`FORA_DO_AGENTE`, `src/middleware/agente.ts:82`).
8. O conteúdo dos 132 passos é nosso e entra no ar sem revisão separada; parte dos 132 assistentes regenerados em
   `frontend/src/data/wizards.js` e de `ISO_GUIDELINES`.
9. Entrega em três PRs (seção 11).

## 3. O Passo

### 3.1 Onde mora o conteúdo (uma fonte só, no `src/`)

O conteúdo é **dado tipado no Worker**, não arquivo do frontend: `src/data/passos/`. O Worker não lê disco (`AGENTS.md`, nota
sobre skills), mas importa módulo TypeScript, como já faz com `PHASE_CHECKLISTS` (`src/constants.ts:191`) e `PHASE_QUESTIONS`
(`src/phase-questions.ts:39`). O frontend recebe o catálogo pela API.

| Escolha | Decisão | Por quê |
|---|---|---|
| API (`GET /api/v1/passos/catalogo`) em vez de arquivo gerado | **API** | É o caminho que o repositório já usa para o mesmo tipo de dado (`/phases/config`, `src/routes/platform.ts:555`, e `/phase-questions`, `src/index.ts:391`). Arquivo gerado exigiria um `npm run ...:gerar` e um teste de "arquivo velho", como em `skills:gerar`; aqui não há motivo, o dado não é lido sem login. O servidor valida (`concluidoQuando`) contra o mesmo objeto que serve, então a tela e a regra nunca divergem. |
| Um arquivo por etapa | `etapa-1.ts` a `etapa-6.ts` | Seis redatores trabalham em paralelo sem conflito de merge; o agregador (`catalogo.ts`) não muda. |
| Validação | Esquema zod (`tipos.ts`) rodado num teste sobre o catálogo inteiro | Teste reprova passo faltando, passo duplicado, critério desconhecido, campo sem exemplo, termo em inglês fora da lista de exceções. |

O catálogo vai ao cliente com `Cache-Control: private, max-age=300` e um campo `versao` (hash do JSON) que a tela guarda em
memória (`S.passosCatalogo`). Nenhuma regra de conclusão vive no frontend.

### 3.2 Forma do Passo

```ts
type TipoCampo = 'texto' | 'texto_longo' | 'escolha' | 'multipla' | 'data';

interface Campo {
  id: string;            // snake_case; único dentro do passo. Reaproveita o id do campo do assistente (wizards.js) quando existe.
  rotulo: string;        // pergunta em português, voz do consultor
  tipo: TipoCampo;
  obrigatorio: boolean;
  exemplo: string;       // sempre presente; vira o placeholder ("Ex.: ...")
  ajuda?: string;        // uma frase, só se o rótulo não bastar
  opcoes?: string[];     // escolha | multipla
  pergunta?: string;     // chave de PHASE_QUESTIONS que este campo substitui (ex.: 'p3_q1')
  semIA?: boolean;       // o copiloto nunca propõe (nome de pessoa, dado sensível, decisão da direção)
}

interface OndeVive { tela: TelaDoRouter; rotulo: string }   // 'soa' | 'risks' | 'assets' | 'documentos' | 'ropa' | ...

type Criterio =
  | { tipo: 'campos_preenchidos'; rotulo: string; campos?: string[] }                     // padrão: todos os obrigatórios
  | { tipo: 'evidencia_anexada'; rotulo: string }                                         // checklist_progress.evidence_id
  | { tipo: 'registro_vinculado'; rotulo: string; entidade: Entidade; minimo: number }    // contagem no projeto (lista fechada)
  | { tipo: 'pedido_de_aprovacao'; rotulo: string; pedidoTipo: PedidoTipo; situacao: 'aberto' | 'aprovado' | 'qualquer' }
  | { tipo: 'entrevistas_concluidas'; rotulo: string; trilhas: Trilha[] }                 // project_interviews
  | { tipo: 'responsavel_e_prazo'; rotulo: string };                                      // assigned_to e due_date preenchidos

interface Passo {
  id: string;            // 'p3_3' (o id de PHASE_CHECKLISTS; teste: exatamente um passo por item)
  fase: number;          // 0..40
  ordem: number;         // 1..n dentro da fase (a ordem de PHASE_CHECKLISTS)
  titulo: string;        // seguro para o cliente; verbo no infinitivo ("Justificar as exclusões de controles")
  clausula: string;      // "Cl 6.1.3" ou "A.5.9" (o isoRef do assistente)
  porQue: string;        // "O que o auditor vai pedir": 1 a 3 frases, vem de auditorTip
  campos: Campo[];       // 1 a 8
  prova: { descricao: string; obrigatoria: boolean; aceita: 'arquivo' | 'documento_gerado' | 'ambos' };
  ondeVive: OndeVive[];  // 0 a 3 atalhos para o registro que a tela de origem guarda
  concluidoQuando: Criterio[];  // 1 a 5; o primeiro é sempre campos_preenchidos
  gera?: 'documento';    // item `document` com texto gerável: botão "Gerar o documento" no cartão (substitui o assistente em modal)
}
```

Etapas e fases saem do mesmo catálogo (acaba a lista duplicada):

```ts
interface EtapaDoCatalogo { id: 1..6; nome: string; resumo: string; fases: number[] }
interface FaseDoCatalogo  { numero: number; etapa: number; titulo: string; clausula: string; objetivo: string }
interface Catalogo { versao: string; etapas: EtapaDoCatalogo[]; fases: FaseDoCatalogo[]; passos: Passo[] }
```

`fases[].titulo` é a versão em português claro (o `PHASE_TITLES` de `constants.ts:142` tem "Gap Assessment", "Readiness Review",
"Preparação Stage 1"). O banco guarda o título antigo (`project_phases.title`) e **não é reescrito**; a Bancada e o Monitor
leem o título do catálogo.

### 3.3 Critérios: o que o servidor sabe medir

Seis tipos fechados. Critério desconhecido reprova o teste do catálogo e, em tempo de execução, conta como não cumprido
(falha fechada). Cada critério devolve `{ ok, rotulo, detalhe? }`; a tela mostra o `rotulo` com marca de feito ou pendente e o
`detalhe` em texto ("faltam 2 de 5 campos", "nenhum risco cadastrado").

- `campos_preenchidos`: cada campo obrigatório com valor não vazio (escolha e múltipla dentro do domínio).
- `evidencia_anexada`: `checklist_progress.evidence_id` não nulo e a evidência é do projeto.
- `registro_vinculado`: `COUNT(*) >= minimo` numa consulta de uma **lista fechada** (`riscos`, `ativos`, `controles_implementados`,
  `documentos_vigentes`, `atividades_ropa`, `ripd`, `fornecedores`, `treinamentos`, `auditorias`, `analises_criticas`,
  `acoes_corretivas`, `partes_interessadas`, `governanca`, `incidentes`, `metricas`). Nada de nome de tabela vindo do dado.
- `pedido_de_aprovacao`: existe pedido (`pedidos.tipo`, `migrations/0055`: `dpia | politica | documento | excecao | tratamento |
  avaliacao_terceiro`) no projeto na situação pedida. É um indicador do projeto, não do passo (limite declarado, seção 12).
- `entrevistas_concluidas`: toda trilha da lista tem ao menos uma resposta em `project_interviews`. Substitui o `localStorage`
  `niso_interviewProgress` e o `disabled` do `p2_1` (`project.js:397`).
- `responsavel_e_prazo`: usado nos passos de tarefa pura.

A avaliação é uma **função pura** (`avaliarPasso(passo, contexto)`), alimentada por um carregador que faz ~20 consultas por
projeto, uma vez (`carregarContexto`), e não 132 vezes.

### 3.4 Onde ficam as respostas (decisão e justificativa)

**Uma tabela só, a que já existe: `project_phase_answers`** (`schema.sql:164`, `UNIQUE(project_id, phase_number, question_key)`).

- Campo que **substitui uma pergunta do questionário** (`Campo.pergunta` preenchido): grava na `question_key` original
  (`p3_q1`), sem mover dado. Os 115 `question_key` de `PHASE_QUESTIONS` ficam e o agente de interpretação segue lendo
  (`src/routes/phase-questionnaire.ts:140`, `:157`). Teste: cada chave de `PHASE_QUESTIONS` aparece em exatamente um campo de um
  passo da mesma fase.
- Campo **novo** (vindo do assistente de documento): `question_key = '<id do passo>.<id do campo>'` (`p3_3.justificativas`).
- Escolha e múltipla guardam o mesmo texto de hoje (múltipla unida por `||`).

Por que não `checklist_progress.notes` (onde o assistente grava JSON hoje): o campo `notes` tem teto de 5.000 caracteres para
todos os campos juntos (`src/schemas/resources.ts:41`), a gravação reescreve o JSON inteiro (dois campos editados por pessoas
diferentes se atropelam) e o servidor não consegue consultar "campo X preenchido" sem decodificar texto. Por que não tabela nova:
`project_phase_answers` já tem a forma certa (uma linha por campo, `updated_at`). Ganha só uma coluna, `updated_by`.

`checklist_progress` continua sendo o registro do passo: `is_checked`, `checked_by/at`, `evidence_id`, `assigned_to`,
`due_date`. `notes` deixa de ser escrito (fica só como leitura, ver seção 6).

## 4. Estado derivado

### 4.1 Passo

Cinco estados, calculados no servidor a cada leitura:

| Estado | Regra (a primeira que valer) |
|---|---|
| `bloqueado` | `bloqueio_motivo` e `bloqueio_responsavel` preenchidos |
| `concluido` | `is_checked = 1` |
| `em_andamento` | algum campo do passo preenchido, ou `evidence_id`, ou `assigned_to` |
| `nao_iniciado` | nenhuma das anteriores |

(Quatro linhas; "concluído com exceção" não é estado, é uma marca em `concluido`: `excecao_motivo` preenchido.)

Concluir é um ato (`POST .../concluir`), nunca efeito colateral. Hoje o upload de arquivo e o aceite do documento gerado marcam o
item sozinhos (`marcarItemComEvidencia`, `src/services/checklist-evidencia.ts:32`, chamado de `projects.ts:738` e de
`policies.ts:150`): passam a **só ligar a evidência**. Quem conclui é o botão, quando o "concluído quando" passa.

### 4.2 Fase

Calculada dos passos, gravada em `project_phases.status` a cada mudança (o campo vira cache, o que mantém o Monitor, a carteira
e o dossiê funcionando sem mudar uma linha de SQL deles):

1. algum passo `bloqueado`: `blocked`;
2. todos `concluido`: `completed` (e `completed_at`);
3. algum passo `concluido` ou `em_andamento`: `in_progress`;
4. senão: `pending`.

`PUT /projects/:id/phases/:num` (`projects.ts:657`) passa a recusar `status` (409, "A situação da fase é calculada pelos
passos"); `notes` segue aceito.

### 4.3 "Continuar de onde parou"

Calculado no servidor (`continuar: { fase, passo }`): o passo não concluído e não bloqueado com **atividade mais recente**
(`MAX(updated_at das respostas, checked_at)`), se houver; senão o primeiro passo não concluído e não bloqueado na ordem da
trilha. Projeto novo: Fase 0, Passo 1. Tudo concluído: `null` (a tela mostra "Jornada concluída" e o atalho para a
prontidão). Bloqueados não entram, mas a barra mostra "N passos bloqueados".

## 5. API

Prefixos novos: `/api/v1/passos` (catálogo, global) e `/api/v1/projects/:projectId/{bancada,passos}` (faixa `iso` em
`src/modulos.ts:19`, teste `test/modulos-produto.test.ts` reprova sem isso). Corpo estrito (campo a mais é 400).

| Método e rota | Faz | Quem |
|---|---|---|
| `GET /api/v1/passos/catalogo` | `Catalogo` | qualquer sessão |
| `GET /projects/:p/bancada` | estado do projeto (seção 5.1) | quem lê o projeto |
| `GET /projects/:p/passos/:id` | o passo com valores, avaliação e legado | idem |
| `PUT /projects/:p/passos/:id/campos` | autosave: `{ campos: {id: valor}, vistos?: {id: updated_at} }`; devolve `{ ok, salvo_em, gravados, avaliacao, fase }` (`gravados`: todo campo escrito, inclusive herdados promovidos) | escrita do projeto, inclusive `org_user` e `client` (hoje já marcam item) |
| `PATCH /projects/:p/passos/:id` | `{ assigned_to?, due_date? }` (responsável e prazo, que saem do "Editar") | escrita |
| `POST /projects/:p/passos/:id/concluir` | conclui se a avaliação passa; senão 409 com `faltam`. `{ excecao: { motivo } }` conclui mesmo assim | `excecao` só equipe da ness. |
| `POST /projects/:p/passos/:id/reabrir` | `is_checked = 0`; trilha | escrita |
| `POST /projects/:p/passos/:id/bloquear` | `{ motivo (>= 5), responsavel (obrigatório) }` | equipe e `org_admin` |
| `POST /projects/:p/passos/:id/desbloquear` | limpa o bloqueio | idem |
| `DELETE /projects/:p/passos/:id/anotacao-anterior` | zera o texto livre antigo (`notes`) quando ele não é o JSON do assistente; trilha `passo.anotacao_descartada` | equipe |
| `DELETE /projects/:p/bancada/fases/:n/situacao-antiga` | encerra a marca de bloqueio anterior à Bancada (seção 6) | equipe |
| `POST /projects/:p/passos/:id/copiloto/rascunhar-campo` | modo 1 (seção 8) | `podePedirRascunho` (equipe e `org_admin`, `rascunhos-privacy.ts:20`) |
| `POST /projects/:p/passos/:id/copiloto/da-conversa` | modo 2 (PR2) | idem |
| `POST /projects/:p/passos/:id/copiloto/revisao` | modo 3 (PR2) | idem |

Recusado ao agente MCP (`FORA_DO_AGENTE`): `concluir`, `reabrir`, `bloquear`, `desbloquear`, `anotacao-anterior`, `situacao-antiga` e `copiloto/*`.
O agente continua lendo e gravando campos (`PUT .../campos`): é o mesmo papel do consultor que o concedeu, e o texto é rascunho
até a pessoa concluir. A rota legada `PUT /checklist-progress` passa a passar `is_checked: true` pelo mesmo avaliador (sem
critério cumprido, 409 por item) e o agente não marca nada por ela (403).

### 5.1 `GET /projects/:p/bancada`

```jsonc
{
  "ok": true,
  "projeto": { "id": "p1", "nome": "Adequação ACME" },
  "catalogo_versao": "9f2c...",
  "tem_fases": true,                                  // false: o projeto não carregou as fases (a tela mostra o vazio de sempre)
  "continuar": { "fase": 3, "passo": "p3_3" },          // ou null
  "totais": { "passos": 132, "concluidos": 14, "bloqueados": 1 },
  "fases": [ { "numero": 3, "situacao": "in_progress", "situacao_antiga": null,
               "concluidos": 2, "total": 4, "bloqueados": 0,
               "bloqueio": null } ],                                           // 41; `bloqueio` = o do primeiro passo bloqueado: { motivo, responsavel, em }
  "passos": [ { "id": "p3_3", "fase": 3, "estado": "em_andamento", "concluido_por_excecao": false,
                "responsavel": "Maria Souza", "prazo": "2026-11-05", "atividade_em": "2026-10-15 14:02:11",
                "bloqueio": null, "avaliacao_ok": false, "faltam": 2 } ]   // 132, sem os valores
}
```

### 5.2 `GET /projects/:p/passos/:id`

```jsonc
{
  "ok": true,
  "passo": { "id": "p3_3", "estado": "em_andamento" },
  "valores": { "justificativas": { "valor": "...", "atualizado_em": "2026-10-15 14:02:11", "por": "resper", "herdado": false } },
  "avaliacao": { "ok": false, "criterios": [ { "tipo": "campos_preenchidos", "rotulo": "Campos obrigatórios preenchidos", "ok": false, "detalhe": "faltam 1 de 3" } ] },
  "prova": { "evidence_id": null, "arquivo": null, "avaliacao": null },
  "responsavel": "Maria Souza", "prazo": "2026-11-05",
  "bloqueio": null,
  "excecao": null,                         // { "motivo": "...", "por": "...", "em": "..." } só para a equipe
  "anotacao_anterior": null                // texto livre antigo de notes, quando houver (seção 6)
}
```

## 6. Dados, migration e compatibilidade

Migration **0078** (aditiva; nada existente é reescrito). Justificativa por coluna:

| Tabela | Coluna | Para quê |
|---|---|---|
| `checklist_progress` | `bloqueio_motivo`, `bloqueio_responsavel`, `bloqueado_em` | bloqueio com motivo e responsável (decisão 5) |
| `checklist_progress` | `excecao_motivo`, `excecao_por`, `excecao_em` | conclusão com exceção, com prova (decisão 5) |
| `project_phase_answers` | `updated_by` | "Salvo às 14:02 por ..." e a trilha por campo |
| `project_phases` | `legado_status` | congela o que o `select` manual dizia, até a Bancada assumir a fase |

Backup antes: `npm run db:backup` (`backups/README.md`). `schema.sql` recebe as mesmas colunas, no `CREATE TABLE` de cada uma.

**Projetos existentes.** A promessa é que o progresso não anda para trás.

- Item já marcado (`is_checked = 1`) continua `concluido`. Passo concluído **não** é reavaliado para desfazer; se um critério
  regride depois, a tela avisa ("desde a conclusão, algo mudou: ...") sem reabrir sozinha.
- Fase que estava `completed` ou `skipped` no `select` manual: a migration grava `legado_status`. Na primeira leitura da Bancada
  (`materializarLegado`, idempotente), cada passo ainda não marcado dessa fase recebe `is_checked = 1` com
  `excecao_motivo = 'Fase concluída antes da Bancada (situação manual)'` (ou "dispensada", para `skipped`), `checked_by` nulo; o
  `legado_status` vira nulo. A fase continua concluída, agora com prova por passo. "Dispensada" deixa de existir como situação:
  conta como concluída com a marca de exceção (limite declarado).
- Fase `blocked` no manual: `legado_status = 'blocked'` até alguém registrar o bloqueio no passo certo ou tocar em "Liberar
  fase" (`DELETE .../situacao-antiga`); a Bancada mostra "Bloqueada antes da Bancada, sem motivo registrado".
- Fase `in_progress` manual **sem nenhum dado** volta a `pending`: é o único caso em que a situação exibida muda sem ação de
  ninguém, e é o intencional.
- **Notas e respostas antigas aparecem nos campos novos.** O assistente gravava JSON em `notes` com os ids dos campos do
  `wizards.js`. Como os campos novos reaproveitam esses ids, `GET /passos/:id` devolve cada valor do JSON antigo como valor do
  campo, com `herdado: true`, quando não há linha em `project_phase_answers`; o primeiro autosave do passo grava todos como linhas
  e a marca some. `notes` que **não** é JSON vira `anotacao_anterior`, em bloco apenas de leitura no cartão, com "Copiar para o
  campo ..." e "Já usei" (zera `notes`, trilha `passo.anotacao_descartada`). Respostas do questionário já estão nas chaves certas.
- `assigned_to` e `due_date` seguem onde estão; a tela só muda o lugar de editar (cabeçalho do passo).
- `project_interviews` não muda; o progresso das trilhas passa a ser lido dele (`entrevistas_concluidas`).

`avisos-prazo` (`src/services/avisos-prazo.ts:93`) lê `checklist_progress` com `is_checked = 0`; segue valendo, e o título do aviso
passa a levar o título do passo e o link para a Bancada.

## 7. Tela

### 7.1 Estrutura

```
┌ topo ─ h1 Projeto ───────────────────────────────  [Continuar de onde parou → Fase 3, Passo 3]  [Mais ações] ┐
├ trilha (nav) ─────┬ cartão do passo ─────────────────────────────────┬ copiloto ───────────────────────────┤
│ Etapa 1  4/7      │ h2 Fase 3 · Definição do escopo                  │ Assistente                          │
│  > Fase 0 ✓       │ h3 Passo 3 de 4 · Cl 6.1.3 · Justificar exclusões│ [Rascunhar este campo]              │
│  Fase 3 (aberta)  │ Responsável [..]  Prazo [..]       Salvo às 14:02│ [Escrever a partir da conversa] (PR2)│
│    ● passo 3      │ O que o auditor vai pedir  ...                   │ [Revisão de auditor] (PR2)          │
│ Etapa 2           │ Escreva                                          │                                     │
│  ...              │   [campo 1: textarea alto]                       │ proposta: ...  [Aceitar] [Descartar]│
│                   │ Prova esperada   [Enviar arquivo]                │                                     │
│                   │ Onde isto vive   [Abrir SoA]                     │                                     │
│                   │ Concluído quando  ☑ ... ☐ ...  (ao vivo)         │                                     │
│                   │ [ Salvar e ir ao próximo passo ]  Bloquear ...   │                                     │
└───────────────────┴──────────────────────────────────────────────────┴─────────────────────────────────────┘
```

- **Hierarquia de títulos:** `h1` projeto (o `#header-title`, que já é o `h1` da página, `frontend/login.html:543`), `h2` fase, `h3` passo. Nada mais na Bancada usa `h1` a `h3`.
- **Trilha (esquerda):** `nav` com `aria-label="Trilha da jornada"`; etapas são `button` com `aria-expanded` (uma aberta por vez,
  a da fase atual), fases e passos são `button`, o atual leva `aria-current="step"`. Estado em texto ("concluído", "em andamento",
  "bloqueado: motivo curto"), nunca só cor (`PRODUCT.md`, acessibilidade). Fase bloqueada mostra o motivo logo abaixo do nome.
  Teclado: Tab percorre, Enter ativa; setas cima e baixo andam entre passos visíveis; Home e End vão ao primeiro e ao último.
- **Cartão do passo (centro), nesta ordem:** cabeçalho ("Fase 3 · Passo 3 de 4 · Cl 6.1.3 · título"); responsável, prazo e
  "Salvo às HH:MM" (`aria-live="polite"`); **O que o auditor vai pedir**; **Escreva** (campos); **Prova esperada**; **Onde isto
  vive**; **Concluído quando** (lista viva, `role="list"`, cada item com "feito" ou "falta" em texto); o botão primário e, ao lado,
  os secundários em texto: "Pular para o próximo sem concluir", "Bloquear este passo", e, só para a equipe, "Concluir com
  exceção...".
- **Campos:** `textarea` com altura mínima para digitar ao vivo (8 linhas em `texto_longo`, 3 em `texto`), rótulo `label`
  associado, exemplo como `placeholder` e repetido em `aria-describedby`, obrigatório marcado no texto ("obrigatório"). Foco visível.
- **Primário:** "Salvar e ir ao próximo passo". Salva o que estiver pendente; se o "concluído quando" passa, conclui e navega; se
  não passa, **não navega**: foca o primeiro item que falta e o destaca. O próximo passo cruza fase e etapa; no último passo da
  trilha vira "Ver a prontidão". Um só `.btn-primary` por tela (`design.md`, "Uma ação principal por tela").
- **Autosave no servidor:** `input` com 800 ms de debounce e `blur`; `PUT .../campos`; "Salvo às HH:MM" (`formatarData` com
  hora). Falha: "Não foi possível salvar. Tentando de novo..." com repetição (3 vezes, 2 s) e botão "Tentar agora". 409 por
  `vistos` (outra pessoa mudou o campo): mostra "Fulano alterou este campo às HH:MM" com "Manter o meu" e "Usar o dele".
- **Rascunho fora do navegador:** nenhum. Fechar a aba não perde nada além dos últimos 800 ms.
- **Bloqueio:** diálogo (o `openModal` único, `design.md`) com motivo e responsável obrigatórios. Passo bloqueado mostra, no
  cartão e na trilha, "Bloqueado por Fulano: motivo". O Monitor mostra o mesmo (seção 9).
- **Barra de topo:** "Continuar de onde parou → Fase N, Passo X" (botão secundário) e o resumo, que **mantém o indicador único de
  progresso** (`frontend/test/jornada-prontidao.test.js`, Onda 2 do diagnóstico de 15/10): "31 de 90 controles aplicáveis
  implementados" (de `GET /prontidao`) e, rotulado como plano de trabalho, "14 de 132 passos concluídos (andamento do plano de
  trabalho, não da conformidade) · 1 bloqueado". Ações do projeto que já existiam ("Dados da empresa", "Notas do auditor", "Dossiê da jornada", "Ver a prontidão") vão
  para "Mais ações" (`renderMaisAcoes`). "Interpretar a fase" e "Adequar controles" ficam no cabeçalho da fase, também em "Mais
  ações".

### 7.2 Endereço (deep link)

`/iso?tela=project-detail&fase=3&passo=p3_3` (o servidor entrega o mesmo `login.html`; a casca decide pelo caminho,
`frontend/src/produto.js`). O boot lê `fase` e `passo` (`alvoDaBancada`), grava em `S.bancadaAlvo`; a Bancada o valida contra o
catálogo (`passo` existe; divergência com `fase`: vale o `passo`; só a fase: o primeiro passo aberto dela) e o consome uma vez. A
Bancada mantém o endereço em dia a cada passo (`history.replaceState`), então recarregar a página ou copiar o link volta ao mesmo
passo. Sem alvo: "Continuar de onde parou". Quem usa:

- Monitor (`monitor.js:83`): cada nó da trilha abre `fase=N` (primeiro passo não concluído da fase); fase bloqueada mostra o motivo.
- Notificações e avisos de prazo (`globals.js:1138`, `abrirAviso`): o aviso de item do checklist abre o passo.
- Substitui o stub `openPhaseDetail` (`project.js:1333`), que sai.

A tela segue sendo `project-detail` (menu, `produto.js:35`, `produto.js:113` e o global `renderProjectDetail` que o router chama);
só a função por trás muda (`renderBancada`).

### 7.3 Linguagem e visual

- Títulos de passo e de fase são do catálogo e passam por um teste de **termos proibidos** (lista em
  `test/passos-catalogo.test.ts`: "gap assessment", "dod", "definition of done", "readiness", "stage 1/2", "kick-off", "sponsor",
  "quick win", "deliverable", "checklist"; exceções nominais e justificadas por linha). Termo que é nome próprio da norma ("Privacy
  by Design" como título de princípio da 27701) entra na exceção com a justificativa.
- Estilo só por classes de `frontend/src/style.css` (bloco novo "Bancada", ao fim do arquivo) e tokens; **nenhum `style=`** nos
  arquivos novos (teto 0 em `catracas-visuais.test.js:97`), sem raio, sem itálico, sem emoji, sem peso 300/700, nada abaixo de
  11 px. Accent só em interativo e foco.

## 8. Copiloto

Painel à direita, três modos. **A IA só propõe.** Toda saída chega marcada "Proposta do assistente", por campo, com Aceitar e
Descartar; aceitar copia para o campo (e o autosave grava como qualquer digitação); nada é concluído, assinado ou anexado pela IA.
Molde: `src/services/copiloto-ropa.ts` (chamada direta de `env.AI.run` com `reasoningModel(env)` e `response_format: json_schema`,
saída por esquema zod estrito que descarta o que não bate, `indisponivel: true` quando o modelo falta ou responde fora do
formato, trilha `agente.rascunho` sem o texto, log só com contagens). O `BaseAgent.runModel` (usado pela interpretação,
`src/agents/phase-interpretation.ts:50`) é a segunda via; o serviço novo segue o molde do RoPA por já ter JSON mode e contrato
estrito, e o `runModel` fica para o caso de rota GPT compat que a interpretação usa. (O pedido citava os dois; na prática o
copiloto do RoPA não passa por `BaseAgent`.)

Regras comuns, testadas:

1. **Contexto sai do banco, do projeto da rota**, nunca do corpo: respostas já dadas no passo e na fase, "Dados da empresa"
   (`lerEmpresa`, `src/services/empresas.ts`), entrevistas por trilha (**sem** o nome do entrevistado; só trilha, pergunta, resposta,
   lacuna).
2. **PII fora do modelo:** todo texto livre que vai (conversa, respostas, entrevistas) passa por `mascararPii`
   (`src/services/rascunhos-privacy.ts:31`: CPF, e-mail, telefone). Nome de pessoa não é detectável; o prompt proíbe devolver nome e
   o campo com `semIA: true` nunca é proposto.
3. A mensagem do usuário é **dado**, não instrução; o prompt diz isso.
4. Saída validada campo a campo contra a definição do passo: `escolha` fora das opções some; `multipla` só com opções válidas;
   `data` inválida some; texto cortado ao teto do tipo (300 em `texto`, 4.000 em `texto_longo`).
5. Papel: `podePedirRascunho` (equipe e `org_admin`). Agente MCP: 403.
6. Falha do modelo: `{ indisponivel: true }`, 200, sem trilha de proposta e com mensagem simples na tela.

**Modo 1, "Rascunhar este campo"** (PR1). Entrada `{ campo, instrucao? }` (`instrucao` até 500 caracteres, ex.: "mais curto").
Saída `{ proposta: { campo, valor, fontes: [{ id, rotulo }] }, avisos }`. As fontes são os itens de contexto que o servidor
numerou (`r1`, `e2`, `emp`); a IA devolve os ids que usou, o servidor descarta os que não existem e mostra "Com base em: resposta
de 'Escopo', Dados da empresa". Proposta sem fonte válida sai com o aviso "Sem base nos dados do projeto: revise com atenção".

**Modo 2, "Escrever a partir da conversa"** (PR2). Entrada `{ conversa }` (20 a 8.000 caracteres): o que o cliente disse. Saída
`{ propostas: { <campo>: valor }, nao_encontrado: [campo], avisos }`: propõe **todos** os campos que a conversa sustenta, omite o
resto (e o lista em `nao_encontrado`). Campo `semIA` nunca entra. Campo que já tem texto mostra "substitui o texto atual" e o
diff curto; "Aceitar todas" existe, "Descartar todas" também.

**Modo 3, "Revisão de auditor"** (PR2), antes de concluir. Sem corpo. Saída `{ resumo, pontos: [{ severidade, alvo, o_que_o_auditor_questionaria,
por_que }], rotulo }` com `alvo = { tipo: 'campo' | 'prova' | 'criterio', id }`. Regras herdadas da interpretação de fase
(`phase-interpretation.ts:12-27`): **todo ponto cita o campo** (ou a prova, ou o critério) que o sustenta, e o servidor descarta o
ponto cujo alvo não existe; interpreta só o que está escrito; **nunca emite parecer de certificação** (o esquema não tem campo de
veredito e o `rotulo` fixo diz "Revisão assistida; não é parecer de certificação"). Cada ponto na tela é um botão que leva o foco
ao campo.

O agente de interpretação da fase (`GET /phase-answers/:fase/interpret`) segue como está, com um ajuste: o resumo e o hash das
respostas consideram só as chaves de `PHASE_QUESTIONS`, para que editar um campo novo (`p3_3.xxx`) não marque a interpretação como
desatualizada (`phase-questionnaire.ts:157`, `:180`).

## 9. O que sai e o que muda de lugar

| Sai (PR1) | Fica no lugar de |
|---|---|
| `renderProjectDetail` e seus filtros, `togglePhase`, `toggleJourney`, `JOURNEYS` (`project.js:128-492`, `:1238-1259`) | Bancada |
| `changePhaseStatus` e o `select` `.phase-status-select` (`:1261`) | situação derivada |
| DoD drawer (`openDoDDrawer`, `refreshDoDDrawer`, `globals.js:1759-1880`) e a chamada em `ui.js:58` | lista "Concluído quando" |
| `openPhaseQuestionnaire`, `savePhaseQuestionnaire` (`:915-977`) | campos dos passos |
| `openDocWizard`, `wizCollectFields`, `wizSaveProgress`, `wizGenerate`, `wizBackToForm`, `wizApprove` (`:519-682`) | campos + "Gerar o documento" no cartão |
| anotação livre, "Editar", `saveChecklistItemNotes/Assigned/DueDate/Metadata` (`:1398-1463`) | responsável e prazo no cabeçalho do passo |
| `localStorage` `niso_phaseChecks*`, `niso_interviewProgress` (`:191-194`, `:586`, `:833`, `:855`, `:1295`, `:1447-1461`) | servidor |
| `ETAPAS` do Monitor (`monitor.js:8`) e `JOURNEYS` | `catalogo.etapas` |
| `openPhaseDetail` (stub, `:1333`) | deep link |
| "Concluir mesmo assim" como saída principal | "Concluir com exceção..." (equipe, secundário, com motivo) |

Fica, e é re-hospedado: `interpretPhaseAnswers` e `suggestControlAdequacao` (cabeçalho da fase), `generateJourneyDossier`,
`openInternalDocumentEditor` (abre a evidência gerada), `wsUploadEvidence`/`doDocUpload` (envio de prova, agora dentro do cartão) e o
modal de entrevistas (o `p2_1` o abre; o progresso vem do servidor). PR3 retira `wizards.js`, `PHASE_PLAYBOOKS` e o estado
`S.phaseChecks*`.

**Monitor** (`frontend/src/views/monitor.js`): lê as etapas do catálogo, o título da fase do catálogo, e mostra para fase
bloqueada "Bloqueada: motivo, responsável" (do `GET /bancada`); cada nó abre a Bancada na fase.

## 10. Testes

- **Backend, D1 real** (padrão `test/checklist-progress.test.ts`, `applySchema`, `workerEnv`, `sessionFor`): catálogo (um passo por
  item, critérios conhecidos, termos proibidos, chaves de `PHASE_QUESTIONS` cobertas uma vez, campo com exemplo, `registro_vinculado`
  só na lista fechada, ids de campo únicos); avaliador (puro); carregador de contexto (cada entidade contra o schema real);
  autosave (validação por tipo, `vistos`, limite); concluir/exceção/bloquear (papéis, trilha `logAudit`); estado da fase;
  `materializarLegado`; migração 0078 sobre dados de antes (molde `test/migration-0067.test.ts`); agente MCP recusado;
  `org_user` escreve campos; isolamento entre projetos; copiloto com modelo falso (saída fora do formato, id inventado, `semIA`,
  PII mascarada).
- **Frontend, jsdom** (`frontend/test/`, `vi.mock('../src/api.js')` como em `jornada-prontidao.test.js`): trilha (estados em texto,
  `aria-current`, teclado), cartão (campos por tipo, lista viva), autosave (debounce, erro, 409), "próximo passo" (conclui ou
  foca o que falta, atravessa fase), deep link, bloqueio exige motivo e responsável, copiloto (proposta, aceitar, descartar, não
  grava sozinho).
- **E2E (Playwright)**: `frontend/e2e/phase-questionnaire.spec.js` (modal do questionário) **sai**; entra `frontend/e2e/bancada.spec.js`
  (abre pelo deep link, escreve, vê "Salvo às", falha de critério mantém no passo, conclui e vai ao próximo, bloqueia com motivo,
  Monitor leva à fase). O servidor do Playwright usa `servirShell` (`frontend/e2e/shell.js`).
- **Catracas visuais** (`frontend/test/catracas-visuais.test.js`): arquivos novos entram com teto de `style=` igual a 0, sem raio
  nem peso fora da marca, sem `empty-state` à mão; `project.js` desce o teto (era 50). **A11y básica** (`bancada-a11y.test.js`):
  um `h1`, um `h2`, um `h3`; todo campo com `label`; todo botão com nome; `aria-current`; um só `.btn-primary`.
- Verificação do `AGENTS.md`: antes de afirmar "mergeado", `git cat-file -e origin/main:<arquivo>`; "aplicado", `PRAGMA
  table_info(checklist_progress)` mostrando `bloqueio_motivo`; "em produção", `/health` com o SHA esperado e uma sonda em
  `GET /api/v1/passos/catalogo`.

## 11. Entrega em três PRs

**PR1: a Bancada.** Tudo o que faz a tela nova funcionar de ponta a ponta, **com os 132 passos** (conteúdo primeira versão
completa, vindo dos assistentes e do questionário) e copiloto modo 1.

- Contrato e migration 0078 (`schema.sql`, `migrations/0078_bancada_trilha.sql`, `migrations/README.md`).
- Backend: catálogo, avaliador, carregador de contexto, estado do passo e da fase, rotas `passos` e `bancada`, `materializarLegado`,
  portões na rota legada, `marcarItemComEvidencia` sem marcar, RBAC (`auth.ts`), faixa (`modulos.ts`), `FORA_DO_AGENTE`, avisos
  de prazo, texto do MCP.
- Frontend: Bancada, trilha, cartão, autosave, bloqueio, exceção, próximo passo, deep link, Monitor, remoções da seção 9.
- Copiloto modo 1 (rota, serviço, painel).
- Testes e E2E da seção 10.

**PR2: copiloto modos 2 e 3.** `da-conversa` e `revisao` (serviço, rotas, painel), com os mesmos limites e testes; "Aceitar todas".
Sem migration. Pode sair em paralelo a PR3.

**PR3: endurecimento do conteúdo e limpezas.** Revisão passo a passo contra a norma (skills `iso27001` e `iso27701`, com a ressalva
do `AGENTS.md`: material de terceiro não é texto normativo), troca dos critérios provisórios por `registro_vinculado` mais
específicos, fases com título em português claro em todo lugar, dossiê da jornada incluindo os campos dos passos, remoção de
`wizards.js` (`frontend/test/wizards.test.js`, `wizard-flow.test.js`, `trilha-mapa.test.js` viram testes do catálogo),
`PHASE_PLAYBOOKS`, estado `S.phaseChecks*` e a rota `PUT /phases/:n` de `status`; atualização do `AGENTS.md`.

### Pacotes paralelos dentro do PR1

Cinco pacotes, cada um num worktree próprio, **depois do pacote 0** (contrato). Donos de arquivo no plano.

| Pacote | Dono de | Depende de |
|---|---|---|
| **0, contrato** (sequencial, pequeno) | `src/data/passos/tipos.ts`, `etapas.ts`, `catalogo.ts`, `etapa-1..6.ts` (vazios e válidos), `migrations/0078`, `schema.sql`, `contracts/bancada/*.json`, rotas montadas vazias, `frontend/src/bancada/copiloto.js` (esqueleto) | nada |
| **A, backend** | `src/services/passos/*`, `src/routes/passos.ts`, edições em `projects.ts`, `checklist-evidencia.ts`, `phase-questionnaire.ts`, `auth.ts`, `modulos.ts`, `agente.ts`, `avisos-prazo.ts`, `mcp/contexto.ts`, `openapi.ts` | 0 |
| **B, conteúdo** (2 a 6 redatores) | `src/data/passos/etapa-N.ts`, um por redator | 0 |
| **C, frontend** | `frontend/src/views/bancada.js`, `frontend/src/bancada/{estado,trilha,cartao,autosave}.js`, `style.css`, `router.js`, `produto.js`, `monitor.js`, `globals.js`, `ui.js`, `project.js` (remoções) | 0 (usa `contracts/`) |
| **D, copiloto** | `src/services/copiloto-passo.ts`, `src/routes/passos-copiloto.ts`, `frontend/src/bancada/copiloto.js` | 0 |
| **E, testes de ponta** | `frontend/e2e/bancada.spec.js`, `frontend/test/bancada-a11y.test.js`, `frontend/test/catracas-visuais.test.js` | 0 (e C para rodar) |

A interface entre eles é o pacote 0: tipos (`tipos.ts`), os JSONs de exemplo de cada resposta (`contracts/bancada/*.json`) que o
backend compara com a saída real e o frontend usa como dublê, e a assinatura do painel (`montarCopiloto`).

## 12. Riscos, lançamento e cortes

**Riscos.**

1. *Conteúdo escrito às pressas, no ar sem revisão separada.* Critérios fracos fazem o passo concluir fácil demais; critérios
   rígidos travam o consultor. Mitigação: exceção com motivo (equipe) como válvula; PR3 endurece; teste de catálogo barra o óbvio.
2. *Fase "mudar de situação sozinha" em projeto vivo.* Mitigação: `legado_status` e `materializarLegado`; ensaio sobre cópia do
   banco antes do deploy (plano, tarefa de lançamento) comparando situação antiga e nova de cada fase.
3. *Cliente vê o texto errado.* Mitigação: teste de termos proibidos; motivo de exceção visível só à equipe; `anotacao_anterior` é
   texto do consultor e pode ter jargão (a tela o mostra só à equipe).
4. *Autosave com duas pessoas no mesmo campo.* Mitigação: `vistos` (409), última gravação de **cada campo** vence; sem fusão de texto.
5. *Perda de funções escondidas no código antigo* (por exemplo, upload que marca o item). Mitigação: tarefa de varredura de chamadores
   (`marcarItemComEvidencia`, `PUT /phases`, `PUT /checklist-progress`) com teste por chamador.
6. *Modelo fora do ar ou lento.* Mitigação: `indisponivel`, a tela segue digitável; nenhum caminho depende da IA.
7. *Cliente `org_user`/`client` conclui passo.* Hoje já marcam item; paridade mantida, mas só quando o critério passa; exceção é da equipe.

**Lançamento.** Sem feature flag: a tela antiga e a nova não convivem (duas regras de situação da fase seriam piores que o
risco). Ordem do `AGENTS.md`: `npm run db:backup`, aplicar a 0078 (`wrangler d1 migrations apply niso-db --remote`) **antes** do
merge (ela é aditiva, o código antigo ignora as colunas), mergear (o deploy automático roda), conferir `/health` com o SHA,
`PRAGMA table_info`, a sonda do catálogo e, no projeto de homologação, abrir uma fase pelo deep link. Quem estiver com a aba antiga
aberta vê erro ao mudar a situação da fase (409) e ao marcar item sem critério (409), com a mensagem pedindo para recarregar.
Volta atrás: reverter o PR (as colunas novas ficam e não atrapalham); o `select` manual volta e a situação passa a ser a última
gravada no cache `project_phases.status`.

**Cortes** (decididos, não esquecidos): responsividade; revisão jurídica separada do conteúdo (decisão do dono); "Dispensar fase"
como situação; múltiplos responsáveis por passo; comentários por campo; histórico de versões de campo (a trilha de auditoria
registra que houve gravação, no máximo uma linha por pessoa e passo a cada 10 minutos, e não o texto, como `project.phase_answers.saved`); fusão de edição simultânea; critério por regra de negócio
específica de cada passo (PR3 refina); notificação de passo atribuído; exportar a bancada em documento; o fluxo de pedido de
aprovação por passo (o critério lê o projeto, não cria o pedido); dossiê da jornada com campos novos (PR3); métricas de uso da
tela (não existem coletas, `PRODUCT.md`).

## 13. Decisões que precisam do dono

1. **"Dispensada" vira "concluída com exceção"** para as fases hoje em `skipped` (seção 6). Aceitar, ou preservar como situação?
2. **Motivo de exceção visível só à equipe**, o cliente vê "concluído com justificativa registrada". Confirmar.
3. **`org_user` e `client` concluem passo** (paridade com marcar item hoje) ou só equipe e `org_admin`?
4. **`pedido_de_aprovacao` é indicador do projeto**, não do passo (não há tabela de pedido por item). Aceitável no PR1, ou o dono
   quer o pedido criado a partir do passo no PR2?
5. **Fase `in_progress` manual sem dado volta a "não iniciada".** Aceitar a mudança visível em projetos existentes.
