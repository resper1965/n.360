# Modelos de avaliação de fornecedor (fatia 1) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a consultoria mantém um modelo de questionário por tipo de fornecedor; cada projeto herda o modelo vivo, desliga perguntas dele e
acrescenta as próprias; o envio congela o questionário montado para o tipo do fornecedor.

**Architecture:** migration 0106 com as tabelas e colunas da spec inteira (as fatias 2 a 4 só passam a usá-las). Serviço novo
`src/services/fornecedor-modelos.ts` (semeio por organização, leitura, edição, montagem do questionário do projeto). Rotas da
organização em `src/routes/fornecedor-modelos.ts` (`/api/v1/fornecedor-modelos`, com `exigirOrg`) e as de projeto em
`src/routes/homologacoes.ts`. Duas telas: `views/modelos-fornecedor.js` (Conta e acessos) e `views/questionarios-fornecedor.js`
(n.privacy, Fornecedores); o botão e a janela antigos de `views/terceiros.js` saem.

**Tech Stack:** Hono + D1 + zod; vitest com D1 real; frontend vanilla com jsdom.

**Spec:** `docs/superpowers/specs/2026-11-09-ciclo-avaliacao-fornecedor-design.md` (seções 1, 2, 6 e 7; fatia 1 da seção 8)

## Global Constraints

- Abordagem A (herança viva): o projeto guarda só ajustes (`homologacao_ajustes`) e perguntas próprias; não edita o texto do modelo.
- Um modelo por tipo: `critico`, `medio`, `pequeno` (questionário) e `grande_provedor` (roteiro de conferência; não vai ao fornecedor).
- Quem edita modelo: `consultoria_admin` da própria organização e `platform_admin` (`podeAdministrarOrg`); o consultor só lê.
- Ajuste e pergunta própria do projeto: só a equipe (`ehEquipeNess`); o `org_admin` lê.
- Semeio "a validar": as 12 perguntas de `PERGUNTAS_PADRAO`; prazos provisórios crítico 12, médio 24, pequeno 36, grande provedor 12.
- Sem texto normativo inventado; sem texto livre de pergunta na trilha.
- Envio feito não muda (o `perguntas_json` congela, como hoje).
- Migration só em produção com backup e o "sim" do dono; conferir antes `SELECT origem, ativa, count(*) FROM homologacao_perguntas GROUP BY origem, ativa`.

---

### Task 1: migration 0106

**Files:** Create `migrations/0106_fornecedor_modelos.sql`; Modify `schema.sql` (tabelas novas depois de `homologacoes`; colunas em
`avaliacoes_terceiro`, `homologacoes`, `homologacao_perguntas`); Test `test/migration-0106.test.ts`.

**Produces:** tabelas `fornecedor_modelos`, `fornecedor_modelo_perguntas`, `homologacao_ajustes`; colunas `homologacao_perguntas.tipo`,
`avaliacoes_terceiro.tipo_avaliado`, `homologacoes.tipo`, `homologacoes.email_destino`, `homologacoes.lembrete_em`; gatilho
`homologacao_email_some` (apaga `email_destino` quando a homologação sai de `aberta`).

- [ ] **Step 1: teste** — aplica a migration sem os `ALTER` sobre o schema (o padrão de `test/migration-0104.test.ts`) e confere:
  as três tabelas e o índice único (`org_id`, `tipo`); CHECK de `tipo` e de `prazo_meses` (1 a 60); o gatilho apaga `email_destino`
  quando o status vai a `respondida`; os `UPDATE` de dados preenchem `tipo_avaliado` e `homologacoes.tipo` com o tipo atual da parte; o
  `DELETE` tira só as perguntas de projeto `origem = 'padrao'`.
- [ ] **Step 2:** `npx vitest run test/migration-0106.test.ts` → FAIL.
- [ ] **Step 3: migration**

```sql
-- 0106_fornecedor_modelos.sql — modelos de avaliação de fornecedor da consultoria (spec 2026-11-09-ciclo-avaliacao-fornecedor-design).
-- Os ALTER rodam uma vez pelo runner; tabelas, índices e gatilho são repetíveis; os UPDATE/DELETE de dados rodam uma vez com o runner.
-- Verificar: SELECT name FROM sqlite_master WHERE name IN ('fornecedor_modelos','fornecedor_modelo_perguntas','homologacao_ajustes','homologacao_email_some'); -- 4
--            SELECT name FROM pragma_table_info('homologacoes') WHERE name IN ('tipo','email_destino','lembrete_em'); -- 3
ALTER TABLE homologacao_perguntas ADD COLUMN tipo TEXT CHECK (tipo IS NULL OR tipo IN ('critico', 'medio', 'pequeno'));
ALTER TABLE avaliacoes_terceiro ADD COLUMN tipo_avaliado TEXT;
ALTER TABLE homologacoes ADD COLUMN tipo TEXT;
ALTER TABLE homologacoes ADD COLUMN email_destino TEXT;
ALTER TABLE homologacoes ADD COLUMN lembrete_em DATETIME;
CREATE TABLE IF NOT EXISTS fornecedor_modelos (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('critico', 'medio', 'pequeno', 'grande_provedor')),
    prazo_meses INTEGER NOT NULL CHECK (prazo_meses BETWEEN 1 AND 60),
    origem TEXT NOT NULL DEFAULT 'padrao' CHECK (origem IN ('padrao', 'consultoria')),
    atualizado_por TEXT,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (org_id, tipo)
);
CREATE TABLE IF NOT EXISTS fornecedor_modelo_perguntas (
    id TEXT PRIMARY KEY,
    modelo_id TEXT NOT NULL REFERENCES fornecedor_modelos(id) ON DELETE CASCADE,
    tema TEXT NOT NULL CHECK (length(tema) BETWEEN 1 AND 80),
    texto TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 500),
    ordem INTEGER NOT NULL DEFAULT 0,
    ativa INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
    origem TEXT NOT NULL DEFAULT 'consultoria' CHECK (origem IN ('padrao', 'consultoria')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fornecedor_modelo_perguntas ON fornecedor_modelo_perguntas(modelo_id, ordem);
CREATE TABLE IF NOT EXISTS homologacao_ajustes (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    modelo_pergunta_id TEXT NOT NULL REFERENCES fornecedor_modelo_perguntas(id) ON DELETE CASCADE,
    ativa INTEGER NOT NULL DEFAULT 0 CHECK (ativa IN (0, 1)),
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, modelo_pergunta_id)
);
CREATE TRIGGER IF NOT EXISTS homologacao_email_some
AFTER UPDATE OF status ON homologacoes
WHEN NEW.status <> 'aberta' AND NEW.email_destino IS NOT NULL
BEGIN
    UPDATE homologacoes SET email_destino = NULL WHERE id = NEW.id;
END;
UPDATE avaliacoes_terceiro SET tipo_avaliado = (SELECT p.terceiro_tipo FROM partes p WHERE p.id = avaliacoes_terceiro.parte_id) WHERE tipo_avaliado IS NULL;
UPDATE homologacoes SET tipo = (SELECT p.terceiro_tipo FROM partes p WHERE p.id = homologacoes.parte_id) WHERE tipo IS NULL;
DELETE FROM homologacao_perguntas WHERE origem = 'padrao';
```

`schema.sql`: as mesmas tabelas, índice e gatilho depois de `homologacao_imutavel`, e as colunas nas definições das três tabelas.

- [ ] **Step 4:** `npx vitest run test/migration-0106.test.ts test/migrations-consistencia.test.ts test/schema-contract.test.ts test/migration-0075.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(privacy): migration 0106, modelos de avaliação de fornecedor`.

### Task 2: serviço dos modelos e montagem do questionário

**Files:** Create `src/services/fornecedor-modelos.ts`; Modify `src/services/homologacao.ts` (`listarPerguntas`, `criarPergunta`,
`atualizarPergunta`, `criarHomologacao`, sai `semearPerguntas`); Test `test/fornecedor-modelos.test.ts`.

**Produces:**

```ts
export const TIPOS_MODELO = ['critico', 'medio', 'pequeno', 'grande_provedor'] as const;
export type TipoModelo = (typeof TIPOS_MODELO)[number];
export type PerguntaModelo = { id: string; tema: string; texto: string; ordem: number; ativa: number; origem: 'padrao' | 'consultoria' };
export type Modelo = { tipo: TipoModelo; prazo_meses: number; origem: 'padrao' | 'consultoria'; a_validar: boolean; perguntas: PerguntaModelo[] };
export async function semearModelos(db: D1Database, orgId: string): Promise<void>;          // idempotente, INSERT OR IGNORE, ids determinísticos
export async function lerModelos(db: D1Database, orgId: string): Promise<Modelo[]>;        // semeia e lê os 4, na ordem de TIPOS_MODELO
export async function salvarPrazo(db: D1Database, orgId: string, tipo: TipoModelo, prazo: number, ator: string): Promise<void>;
export async function criarPerguntaModelo(db: D1Database, orgId: string, tipo: TipoModelo, ator: string, d: { tema: string; texto: string }): Promise<{ id: string }>;
export async function atualizarPerguntaModelo(db: D1Database, orgId: string, id: string, ator: string, d: { tema?: string; texto?: string; ordem?: number; ativa?: boolean }): Promise<boolean>;
export type PerguntaDoProjeto = { id: string; tema: string; texto: string; ordem: number; ativa: number; fonte: 'modelo' | 'projeto'; usada: boolean; tipo: string | null };
export async function perguntasDoProjeto(db: D1Database, projectId: string, tipo: 'critico' | 'medio' | 'pequeno'): Promise<{ prazo_meses: number; a_validar: boolean; perguntas: PerguntaDoProjeto[] }>;
export async function perguntasDoEnvio(db: D1Database, projectId: string, tipo: 'critico' | 'medio' | 'pequeno'): Promise<{ id: string; tema: string; texto: string }[]>;
export async function ajustarPerguntaDoModelo(db: D1Database, projectId: string, modeloPerguntaId: string, ativa: boolean, ator: string): Promise<boolean>; // false = não é do modelo da org do projeto
```

Regras:
- Organização do projeto: `SELECT org_id FROM projects WHERE id = ?`.
- Semeio: id do modelo `fm-<sha256(org:tipo)[0..24]>`; da pergunta `fp-<sha256(org:tipo:i)[0..24]>`. Crítico, médio e pequeno recebem
  `PERGUNTAS_PADRAO`; o grande provedor recebe o roteiro mínimo (`ROTEIRO_TRUST_CENTER`, `origem = 'padrao'`):
  "Conferir as certificações vigentes publicadas no trust center", "Conferir o acordo de tratamento de dados (DPA) padrão do provedor",
  "Conferir a lista publicada de subprocessadores", "Conferir as regiões onde os dados do cliente são armazenados",
  "Conferir o histórico público de incidentes e o canal de comunicação". Prazos `{ critico: 12, medio: 24, pequeno: 36, grande_provedor: 12 }`.
- `a_validar`: alguma pergunta ativa com `origem = 'padrao'` ou modelo com `origem = 'padrao'`. Editar texto/tema da pergunta a torna
  `consultoria`; salvar o prazo torna o modelo `consultoria`.
- Escrita de pergunta do modelo confere que a pergunta é de um modelo da `orgId` (JOIN), senão `false` (a rota dá 404).
- `perguntasDoProjeto`: perguntas do modelo do tipo (todas, com `usada` = ativa no modelo E sem ajuste `ativa = 0`), depois as próprias
  do projeto `origem = 'projeto'` com `tipo IS NULL OR tipo = ?` (as `padrao` antigas são ignoradas: a migration as apaga, e o código velho
  entre a migration e o deploy pode ressemeá-las). `perguntasDoEnvio`: só as `usada`/ativas, `{ id, tema, texto }`.
- Trilha: `fornecedor_modelo.prazo`, `fornecedor_modelo.pergunta` (só ids e tipo), `homologacao.ajuste`.

`homologacao.ts`: `listarPerguntas(db, projectId, tipo)` passa a ser `perguntasDoProjeto`; `criarPergunta` aceita `tipo` (NULL ou um dos
três); `atualizarPergunta` só toca `origem = 'projeto'` (as do modelo têm rota própria); `criarHomologacao` usa
`perguntasDoEnvio(db, projectId, parte.terceiro_tipo)` e grava `homologacoes.tipo`; `semearPerguntas` sai (e o import dela nos testes).

- [ ] **Step 1: teste** (D1 real, `test/fornecedor-modelos.test.ts`): duas organizações e dois projetos de cada; semeio idempotente e
  separado por organização; `lerModelos` traz os 4 tipos e `a_validar`; editar a pergunta do modelo muda `origem` e chega a
  `perguntasDoEnvio` dos dois projetos da organização e não aos da outra; ajuste desliga a pergunta só no projeto dele; pergunta própria
  com `tipo` 'critico' entra só no crítico, com `tipo` NULL em todos; `ajustarPerguntaDoModelo` com pergunta de outra organização dá
  `false`; homologação criada antes da edição mantém as perguntas congeladas.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run test/fornecedor-modelos.test.ts test/homologacao.test.ts` → PASS
  (ajustar em `homologacao.test.ts` o que lia as 12 perguntas do projeto: agora vêm do modelo do tipo, com `fonte`).
- [ ] **Step 5:** commit `feat(privacy): modelos da consultoria e questionário montado por tipo`.

### Task 3: rotas

**Files:** Create `src/routes/fornecedor-modelos.ts`; Modify `src/index.ts` (montar em `/api/v1/fornecedor-modelos`, depois do
`authMiddleware`), `src/routes/homologacoes.ts`, `src/schemas/nucleo.ts`, `src/openapi.ts` (+ `npm run openapi`),
`src/middleware/agente.ts` (`FORA_DO_AGENTE`: escrita em `/api/v1/fornecedor-modelos`), `src/middleware/decisoes-agente.ts` (o ajuste
`PUT .../homologacoes/perguntas/modelo/:id` na ferramenta `niso_avaliar_fornecedor`, ação `ajustar_questionario`), `test/contrato-isolamento-org.test.ts`
(classificação); Test `test/fornecedor-modelos-rotas.test.ts`.

Rotas:
- `GET /api/v1/fornecedor-modelos` → `lerModelos(orgId)`; quem: `ehEquipeNess` (403 aos demais).
- `PUT /api/v1/fornecedor-modelos/:tipo` `{ prazo_meses }`; `POST /:tipo/perguntas` `{ tema, texto }`; `PUT /:tipo/perguntas/:id`
  `{ tema?, texto?, ordem?, ativa? }` — quem: `podeAdministrarOrg(user, orgId)` (403); `:tipo` fora de `TIPOS_MODELO` dá 400.
- `GET /projects/:id/homologacoes/perguntas?tipo=critico|medio|pequeno` (padrão `medio`; outro valor 400).
- `PUT /projects/:id/homologacoes/perguntas/modelo/:perguntaId` `{ ativa }` — `ehEquipeNess`.
- `POST /projects/:id/homologacoes/perguntas` aceita `tipo` opcional.

Esquemas (estritos): `fornecedorModeloPrazoSchema` (`prazo_meses` inteiro 1..60), `fornecedorModeloPerguntaSchema` (tema 1..80,
texto 1..500), `fornecedorModeloPerguntaAtualizarSchema`, `homologacaoAjusteSchema` (`ativa` boolean); `homologacaoPerguntaCriarSchema`
ganha `tipo`.

- [ ] **Step 1: teste**: consultor lê e recebe 403 ao escrever; `consultoria_admin` escreve na própria e não em outra (com `X-Org-Id`
  ignorado para ele); `platform_admin` escreve na do `X-Org-Id`; `org_admin` do cliente recebe 403 no GET da organização e lê o do projeto;
  ajuste por consultor ok e por `org_admin` 403; pergunta de modelo de outra organização no ajuste dá 404; agente: escrita de modelo 403.
- [ ] **Step 2-4:** FAIL, implementar, `npx vitest run test/fornecedor-modelos-rotas.test.ts test/modulos-produto.test.ts test/contrato-isolamento-org.test.ts test/openapi.test.ts test/agente-decisoes.test.ts` → PASS.
- [ ] **Step 5:** commit `feat(privacy): rotas dos modelos de fornecedor e ajuste do questionário no projeto`.

### Task 4: telas

**Files:** Create `frontend/src/views/modelos-fornecedor.js`, `frontend/src/views/questionarios-fornecedor.js`; Modify
`frontend/login.html` (item `nav-modelos-fornecedor` em "Conta e acessos" e `nav-questionarios-fornecedor` em Fornecedores do
n.privacy), `frontend/src/produto.js` (`TELAS_DA_CONTA`, `SECOES_PRIVACY`, `SO_PRIVACY`, rótulos), `frontend/src/router.js`,
`frontend/src/main.js` (imports), `frontend/src/globals.js` (visibilidade do item da conta por papel: `platform_admin`,
`consultoria_admin`, `consultor`), `frontend/src/views/terceiros.js` (sai o botão "Perguntas do questionário" e a janela
`abrirPerguntasHomologacao`/`salvarPerguntaHomologacao`/`criarPerguntaHomologacao`); Test `frontend/test/modelos-fornecedor-view.test.js`,
`frontend/test/questionarios-fornecedor-view.test.js` (e o que `terceiros-view.test.js` testava da janela antiga sai).

- **Modelos (`renderModelosFornecedor`)**: abas Crítico, Médio, Pequeno, Grande provedor (roteiro). Em cada uma: prazo em meses
  (campo numérico 1..60 e Salvar), selo "A validar" quando `a_validar`, tabela tema/pergunta/ativa com Salvar por linha, "Nova
  pergunta". Só leitura (sem campos) para quem não administra a organização (`consultor`). `montarLista` não se aplica (lista curta,
  edição em linha, como a janela de hoje); modal só por `openModal` se houver; nenhum primário por linha.
- **Questionários (`renderQuestionariosFornecedor`)**: abas Crítico, Médio, Pequeno; aviso do grande provedor ("recebe o roteiro do
  trust center na ficha, não questionário"). Bloco "Do modelo da consultoria" (só leitura, com a caixa "Usar neste projeto" que chama o
  ajuste) e bloco "Deste projeto" (criar com tipo "Este tipo" ou "Todos os tipos", editar, desativar), e o prazo do modelo. A equipe
  edita; o `org_admin` vê sem os controles.
- [ ] **Step 1: testes jsdom**: abas e chamadas certas (`GET /api/v1/fornecedor-modelos`, `PUT .../:tipo`, `POST/PUT .../perguntas`;
  `GET .../homologacoes/perguntas?tipo=`, `PUT .../perguntas/modelo/:id`, `POST .../perguntas` com `tipo`); só leitura por papel;
  escape de tema e texto; o botão antigo não existe mais em Fornecedores; o item novo no menu do n.privacy e o da conta no n.360.
- [ ] **Step 2-4:** FAIL, implementar, `cd frontend && npx vitest run test/modelos-fornecedor-view.test.js test/questionarios-fornecedor-view.test.js test/terceiros-view.test.js test/casca-menu.test.js test/catracas-visuais.test.js` e o contrato tela↔API do backend → PASS.
- [ ] **Step 5:** commit `feat(privacy): telas dos modelos de fornecedor e dos questionários do projeto`.

### Task 5: documentação e gate

- [ ] `AGENTS.md` (parágrafo da homologação F5: modelos, herança, telas; última migration 0106), `CHANGELOG.md`, `migrations/README.md`
  (0106 pendente; última 0106; 107 arquivos), `docs/roteiro-aceite.md` (passo dos modelos e dos questionários), skill
  `agent-skills/avaliacao-terceiros` se citar o botão ou a forma antiga de `GET .../homologacoes/perguntas` (+ `npm run skills:gerar`).
- [ ] Gate local; PR em rascunho; Codex; backup + 0106 + merge só com o "sim" do dono.
