# Legado de privacidade para o n.privacy, sobre o cadastro compartilhado com o n.iso: plano

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam caixas `- [ ]`.

**Objetivo:** trazer ao n.privacy o que o sistema legado (DPO as a Service) faz e o n.privacy não faz (teste de impacto, riscos e ações por atividade com mapa de risco, ciclo de vida do dado, várias bases legais e GDPR, painel e exportação, homologação de fornecedor), sem criar um segundo cadastro, e migrar os clientes do legado para o n.360 para desligá-lo.

**Arquitetura:** cada coisa nova liga à **atividade de tratamento** (`ropa_records`) um registro que o n.iso já tem (`risks`, `corrective_actions`, `itens`, `partes`, `vendors`) ou uma tabela nova de privacidade (impacto, ciclo de vida, bases). O n.privacy enxerga os registros do n.iso por **sub-rotas da atividade** em `SUBROTAS_PRIVACY` (visão filtrada, decisão D1b da pesquisa), sem alargar o acesso ao módulo n.iso. Nada novo entra no conteúdo congelado das aprovações existentes.

**Stack:** Cloudflare Workers (Hono), D1, KV, Workers AI; frontend vanilla JS; vitest com D1 real (`cloudflare:test`) e jsdom; Playwright para o e2e.

**Spec e insumos:**
- Estudo do gap (página): https://claude.ai/artifact/BjWXd6CSR3BiM7nG3bWBhk
- Pesquisa de código, com evidência arquivo:linha: `docs/superpowers/plans/2026-10-14-legado-pesquisa-de-codigo.md`
- Decisões do dono em 14/10/2026: (1) riscos e ações no cadastro comum, com o **mapa de risco no n.privacy**; (2) **todas** as fases, aos poucos; (3) os clientes do legado **migram para o n.360 e o legado é desligado**; (4) as planilhas de exportação do legado serão fornecidas.

## Restrições globais

Valem para toda tarefa abaixo. Fonte: `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`.

- Textos de interface, mensagens de erro, comentários e commits em **português**; identificadores de código em inglês quando já forem assim no arquivo. Sem emoji, sem itálico, sistema visual quadrado (`--radius: 0`), tokens de `frontend/src/style.css`.
- **Schema muda em dois lugares:** `schema.sql` e uma migration numerada. Em `schema.sql`, `CREATE INDEX` depois da `CREATE TABLE`. Migration só **aditiva** (`CREATE TABLE`, `ALTER TABLE ... ADD COLUMN` com NULL ou DEFAULT). Nada que reconstrua `ropa_records`, `dpia_assessments`, `pedidos` ou `risks`.
- **Aprovações existentes não podem cair.** O hash do conteúdo congelado do tratamento e da DPIA vem de `src/services/pedidos.ts` (`DOCUMENTOS.tratamento.colunas`, `COLUNAS_DPIA`). Nenhuma coluna nova entra nessas listas fora do mecanismo `soSeMarcado`, e nenhuma lista existente muda de SQL. Todo PR que toca o assunto leva o teste de não regressão da tarefa F1.4.
- **Faixas:** rota de projeto nova precisa de faixa em `src/modulos.ts` (`test/modulos-produto.test.ts` reprova). Sub-rota de atividade do n.privacy entra em `SUBROTAS_PRIVACY`.
- **Contratos que reprovam:** `test/contrato-isolamento-org.test.ts` (rota POST/PUT sem parâmetro classificada), `test/trilha-exclusao.test.ts` (todo DELETE classificado), `test/colunas-catraca.test.ts` (coluna escrita existe no `schema.sql`), `test/openapi.test.ts` (rota que valida corpo no contrato; rode `npm run openapi`), `test/contrato-mcp.test.ts` (39 ferramentas; ferramenta nova muda o número), `test/any-catraca.test.ts` (`TETO = 532`: **proibido** subir; tipe o que tocar).
- Rota de IA ou externa fica em `FORA_DO_AGENTE` (`src/middleware/agente.ts`). O agente propõe e rascunha; **não** conclui teste de impacto, não aceita risco e não aprova homologação.
- Dado pessoal: nunca em fixture, teste ou documento. Use dados fictícios. A trilha leva nomes de campo, não valores pessoais.
- **Ordem de publicação de migration:** `npm run db:backup`, merge, workflow *Apply DB migrations* (`confirmar=APLICAR`), `PRAGMA table_info` da coluna nova, workflow *Deploy*, sonda em `/health` com o SHA esperado. O deploy recusa migration pendente.
- Antes de cada PR: `npx tsc --noEmit`, `npx vitest run` **completo** na raiz, `cd frontend && npx vitest run`, `npm run build --prefix frontend`, `npm run openapi` sem diff. Commits em português, autor `resper1965` com o e-mail noreply, **sem** trailer de coautoria nem menção a IA.
- **Numeração de migration:** a 0071 (`empresas`) está no PR #395. As migrations deste plano usam os números seguintes na ordem de merge; confira `ls migrations | tail -1` antes de criar e renumere se outro PR entrou antes.

## Princípio de pré-preenchimento (pedido do dono)

Os fluxos de RoPA, LIA, RIPD, entrevista, relatórios e agentes **carregam o que já foi informado e nunca pedem de novo**. Cada campo tem **uma origem única**; os demais só leem e herdam. Se a origem muda depois, o derivado mostra o aviso "mudou na origem" sem apagar nem invalidar aprovação.

| Campo | Origem única | Onde se preenche | Quem só lê |
|---|---|---|---|
| Controlador, CNPJ, endereço, representante | `empresas` (0071) | Dados da empresa | relatórios do RoPA, RIPD e LIA, comunicação de incidente, copiloto, agente |
| Encarregado | `parte_vinculos` tipo `encarregado` | Partes e governança | idem |
| Finalidade, titulares, categorias, sensíveis, crianças, retenção | `ropa_records` | entrevista do RoPA | RIPD, LIA, relatório, agente |
| Base legal principal, bases adicionais, GDPR | `ropa_records.base_legal_id` e ligação nova | entrevista | LIA exigida, painel do encarregado, relatório |
| Sistemas, áreas, partes, transferências | ligações do tratamento (0054) | entrevista e Ligações | fluxo do RIPD, diagrama, relatório |
| Ciclo de vida por etapa | tabela nova ligada ao tratamento | entrevista (blocos E e G) | RIPD, relatório |
| Teste de impacto e recomendação | tabela nova, cálculo no servidor | entrevista (bloco H) | `dpia_required` sugerido, RIPD, painel |
| Riscos da atividade | `risks` com `ropa_id` | tela da atividade (n.privacy) e matriz (n.iso) | RIPD, LIA, painel, mapa de risco |
| Ações (gaps) da atividade | `corrective_actions` com `ropa_id` | tela da atividade e CAPA (n.iso) | painel, avisos de prazo |
| Necessidade, parecer, conclusão do RIPD | `dpia_assessments` | tela do RIPD | relatório |
| Interesse, balanceamento, conclusão da LIA | `lia_assessments` | entrevista (bloco D) e Ligações | relatório da LIA |

Hoje a DPIA criada a partir do tratamento herda só finalidade, titulares, categorias e fluxo (`src/services/lia.ts:74-96`), o "Novo RIPD" manual (`frontend/src/views/privacy.js:451-485`) não liga à atividade e pergunta tudo de novo, e a entrevista nunca grava cinco respostas (volume, decisão automática, origem, eliminação, impacto). A tarefa F1.4 e a fase F3 fecham isso.

## Análise de lacunas e ajustes ao cruzar para dados compartilhados

| # | Lacuna do legado | No n.360 hoje | Ajuste ao cruzar com o n.iso | Fase |
|---|---|---|---|---|
| 1 | Teste de impacto com 11 perguntas que gera o RIPD | entrevista recomenda RIPD no frontend, sem guardar respostas | tabela nova fora do hash; `dpia_required` continua decisão humana | F1 |
| 2 | Riscos por atividade com estratégia, risco residual e prazo | `risks` do n.iso, sem ligação à atividade nem residual | `risks.ropa_id` e residual; sub-rotas da atividade; **mapa de risco no n.privacy** sobre o mesmo registro; corrigir `coherence` R1 | F2 |
| 3 | Gaps por atividade | `corrective_actions` do n.iso | `corrective_actions.ropa_id`; mesmos avisos de prazo, com a tela certa por módulo | F2 |
| 4 | Ciclo de vida do dado por etapa | inexistente | tabela nova que aponta para `itens`; fora do hash | F3 |
| 5 | Várias bases legais e GDPR | uma base por tratamento | `base_legal_id` vira a principal; tabela de bases adicionais; fora do hash | F3 |
| 6 | Painel com faixas de prazo, Excel, impressão do RIPD e da LIA | painel do encarregado e relatório do RoPA | CSV com BOM (abre no Excel), RIPD e LIA em Word com a biblioteca `docx` já instalada | F4 |
| 7 | Homologação de fornecedor com questionário e % respondido | terceiros tipificados sem questionário | questionário com link público por token (molde da pré-venda); resultado vira `avaliacoes_terceiro` | F5 |
| 8 | Dados dos clientes do legado | importação de 8 entidades | ampliar o CHECK de `importacao_itens.entidade` e criar esquemas estritos | F6 |

**Defeitos que a pesquisa achou e que precisam sair antes (fase F0):**
- `PUT /api/v1/risks/:id` **substitui o registro inteiro** (`src/routes/risks.ts:98-116`) e a tela do n.iso (`frontend/src/views/grc.js:401-413`) não envia todos os campos. Editar um risco pela tela apaga `asset_id` e `treatment_plan`, zera o aceite e volta o status para `Open`. Qualquer coluna nova (`ropa_id`, residual) seria apagada do mesmo modo.
- `GET /projects/:id/export/risks` cai no segmento `export`, que é do núcleo (`src/modulos.ts:23`): um projeto só n.privacy baixa o CSV de riscos do n.iso.

## Adequações para um projeto existente

O que **muda no projeto que já está em produção** quando este plano for entregue, e o que fazer em cada cenário.

**Ordem comum:** backup, migration aditiva, deploy, conferência de coluna e de `/health`. Os gatilhos `projeto_modulos_do_contrato` (0060) e `usuario_modulos_padrao` (0066) **não** precisam ser reaplicados, porque nenhum módulo novo é criado.

| Cenário | O que acontece | O que o dono precisa fazer |
|---|---|---|
| **A. Projeto só com n.iso (riscos, ações e ativos)** que liga o n.privacy depois | Ao ligar, o sistema importa partes, responsáveis e documentos (`src/routes/nucleo.ts:64-75`). Riscos e ações existentes ficam com `ropa_id` **vazio**: não há como saber a que atividade um risco ISO pertence | Ligar cada risco à atividade pela tela (a tela sugere candidatos pelo ativo: `risks.asset_id` em `tratamento_itens`). Conferir a regra R1 do `coherence` |
| **B. Projeto com RoPA e RIPD já aprovados** | As aprovações continuam valendo: nada novo entra no conteúdo congelado. RIPD e LIA antigos não têm `origem_hash` e aparecem sem o selo "RoPA mudou" até a primeira atualização a partir do RoPA | Responder **uma vez** as cinco perguntas que a entrevista nunca gravou (volume, decisão automática, origem, eliminação, impacto) e as 11 do teste de impacto, ao revisar cada atividade. Depois nunca mais |
| **C. Projeto vindo do legado** | Importado pela "Importar programa" com as entidades novas (F6) | Seguir o roteiro de virada da seção seguinte |
| **D. Todos** | Bases legais: o `base_legal_id` atual vira a principal, sem cópia; adicionais só por ação humana ou importação | Nada, salvo revisar atividades com mais de uma hipótese |

**Verificações obrigatórias de cada migration em produção** (rodar e colar a saída): `PRAGMA table_info(<tabela>)` mostrando a coluna; contagem de linhas antes e depois (`SELECT COUNT(*)` de `ropa_records`, `risks`, `corrective_actions`, `dpia_assessments` e `pedidos`); `aprovacoesDoProjeto` de um tratamento aprovado antes da migration devolvendo CISO e CEO depois dela.

## Migração do legado e desligamento

O dono decidiu migrar todos os clientes e desligar o legado. Por isso a migração é **completa e conferida**, não oportunista. O sistema legado foi feito em plataforma low-code e não tem API conhecida. As fontes de dados, em ordem de preferência:

1. **Exportação geral de dados do aplicativo legado**, pelo painel de administração da plataforma (traz tudo, com identificadores). O dono confirma se existe.
2. As exportações para Excel das listas Gaps, Riscos, RIPD e LIA (existem na tela) e as demais listas por leitura da tela, em modo somente leitura.

**Mapeamento do que cada tela do legado vira:**

| Legado | Vira no n.360 | Como entra |
|---|---|---|
| Empresas | `projects` mais `empresas` (0071) | Novo projeto com cadastro da empresa |
| Áreas | `departamentos` | importação do inventário |
| Ativos | `itens` | importação (cria o item por nome normalizado) |
| Titulares e Dados do titular | categorias de titular e de dado do tratamento | campos do tratamento |
| Parceiros e fornecedores | `partes` tipo organização com `terceiro_tipo` | importação de terceiros |
| Registro de Atividade | `ropa_records` | importação do inventário |
| Medidas de segurança | medidas do tratamento | campo do tratamento |
| Controle de GAPS | `corrective_actions` com `ropa_id` | entidade `gap` (F6) |
| Riscos | `risks` com `ropa_id` | entidade `risco` (F6) |
| Teste de impacto | `tratamento_impacto` | entidade `impacto` (F6) |
| RIPD e LIA | `dpia_assessments` e `lia_assessments` | `avaliacao` com estrutura (F6) |
| Documentos | `documentos` | importação de documento |
| Solicitações | `titular_pedidos` | `historico` (F6) |
| Usuários | `users` com módulos por pessoa | criação manual, com convite |

**Roteiro de virada (por cliente):**
1. **Inventário:** ler cada tela do legado do cliente e contar os registros por entidade (atividades, ativos, parceiros, riscos, ações, RIPD, LIA, solicitações, documentos, usuários). Guardar a contagem.
2. **Cópia de homologação:** criar o projeto do cliente no n.360 (assistente Novo projeto), importar, e **conferir**: contagem por entidade igual à do inventário, mais uma amostra por entidade comparada campo a campo por uma pessoa.
3. **Relatório de reconciliação** por cliente: registros no legado, importados, recusados (com o motivo) e ajustados à mão. Só segue se zero recusa sem decisão.
4. **Congelamento do legado:** a partir de uma data combinada o legado fica somente leitura (ninguém edita), e uma última importação traz o delta.
5. **Corte:** o cliente passa a usar o n.360. O legado fica ligado, só leitura, por um período de segurança.
6. **Desligamento:** depois da aceitação do cliente, exportar uma cópia final do legado (guardada fora do repositório), e só então desligar.
7. **Volta atrás:** até o passo 6 o legado permanece íntegro; o n.360 pode ser refeito a partir da cópia de homologação. Depois do passo 6, a cópia final é a fonte.

**Dados pessoais:** as planilhas do legado contêm dados de titulares. Nunca entram no repositório, em issue ou em documento. Ficam em área controlada, e a trilha da importação leva só contagens.

## Estrutura de arquivos por fase

| Fase | Cria | Modifica |
|---|---|---|
| F0 | `test/risco-put-parcial.test.ts`, `test/export-risks-faixa.test.ts` | `src/routes/risks.ts`, `src/modulos.ts` ou a rota de exportação |
| F1 | `migrations/0072_tratamento_impacto.sql`, `src/services/impacto.ts`, `test/impacto.test.ts`, `test/migration-0072.test.ts` | `schema.sql`, `src/routes/ropa.ts`, `src/modulos.ts`, `src/schemas/nucleo.ts`, `src/services/lia.ts`, `src/openapi.ts`, `frontend/src/views/ropa-entrevista.js` |
| F2 | `migrations/0073_risco_acao_da_atividade.sql`, `src/services/riscos-atividade.ts`, `frontend/src/views/mapa-de-risco.js`, testes | `schema.sql`, `src/routes/risks.ts`, `src/routes/capa.ts`, `src/routes/ropa.ts`, `src/modulos.ts`, `src/services/coherence.ts`, `src/services/avisos-prazo.ts`, `mcp-server-niso/src/ferramentas.ts` |
| F3 | `migrations/0074_*`, `src/services/ciclo.ts`, `src/services/bases.ts` | entrevista, relatórios, `src/services/pedidos.ts` (somente `soSeMarcado`) |
| F4 | `src/services/exportacao.ts`, `src/services/documento-word.ts` | `src/services/encarregado.ts`, telas |
| F5 | `migrations/0075_*`, serviço e rotas públicas do questionário | `src/services/terceiros.ts` |
| F6 | `migration` do CHECK de `importacao_itens.entidade` | `src/schemas/importacao.ts`, `src/services/importacao.ts`, `src/agents/importacao.ts` |

---

## Fase F0: pré-requisitos (defeitos que bloqueiam o resto)

### Tarefa F0.1: `PUT /api/v1/risks/:id` passa a ser parcial

**Arquivos:**
- Modificar: `src/routes/risks.ts` (o handler `PUT /:id`, linhas 85-125)
- Criar: `test/risco-put-parcial.test.ts`

**Interfaces:**
- Consome: `setParcial(body, mapa)` de `src/helpers.ts`, o mesmo padrão do `PUT /api/v1/ropa/:id` (`src/routes/ropa.ts`), em que campo **ausente preserva** o valor gravado.
- Produz: o PUT do risco aceita corpo parcial. Contrato de campos: ausente = mantém; `null` = limpa (onde a coluna aceita NULL).

- [ ] **Passo 1: escrever o teste que falha**

```ts
// test/risco-put-parcial.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, designarConsultor } from './helpers/d1';

const P = 'rp-proj';
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo, headers: { 'Content-Type': 'application/json', ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), workerEnv());

let consultor: Record<string, string>;
beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'ISO 27001', 'Controller', 'Active', 'org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO itens (id, project_id, nome, tipo) VALUES ('rp-it', ?, 'ERP', 'sistema')`).bind(P),
    env.DB.prepare(`INSERT INTO risks (id, project_id, asset_id, asset, threat, impact, probability, risk_level, treatment, treatment_plan, status, accepted_by, accepted_at)
      VALUES ('rp-r1', ?, 'rp-it', 'ERP', 'Acesso indevido', 4, 3, 'High', 'Accept', 'Plano de aceite', 'Accepted', 'Diretoria', '2026-10-01')`).bind(P),
  ]);
  await designarConsultor('cons@ness.lat', P);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});

describe('PUT /risks/:id parcial', () => {
  it('editar só o responsável não apaga ativo, plano, status nem aceite', async () => {
    const r = await chamar(consultor, 'PUT', '/api/v1/risks/rp-r1', { asset: 'ERP', threat: 'Acesso indevido', owner: 'Maria' });
    expect(r.status).toBe(200);
    const linha = await env.DB.prepare('SELECT asset_id, treatment, treatment_plan, status, accepted_by, accepted_at, owner FROM risks WHERE id = ?').bind('rp-r1').first<any>();
    expect(linha).toMatchObject({ asset_id: 'rp-it', treatment: 'Accept', treatment_plan: 'Plano de aceite', status: 'Accepted', accepted_by: 'Diretoria', accepted_at: '2026-10-01', owner: 'Maria' });
  });

  it('null limpa o campo; impacto e probabilidade recalculam o nível', async () => {
    const r = await chamar(consultor, 'PUT', '/api/v1/risks/rp-r1', { asset: 'ERP', threat: 'Acesso indevido', treatment_plan: null, impact: 1, probability: 1 });
    expect(r.status).toBe(200);
    const linha = await env.DB.prepare('SELECT treatment_plan, risk_level, impact, probability FROM risks WHERE id = ?').bind('rp-r1').first<any>();
    expect(linha.treatment_plan).toBeNull();
    expect(linha.impact).toBe(1);
    expect(linha.risk_level).toBe('Low');
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run test/risco-put-parcial.test.ts`
Esperado: FALHA no primeiro teste (`asset_id` volta `null`, `status` volta `Open`).

- [ ] **Passo 3: implementação mínima**

Em `src/routes/risks.ts`, no `PUT /:id`, ler a linha atual e montar o UPDATE só com os campos presentes. Trecho que substitui o `UPDATE risks SET asset_id=?, ...` inteiro:

```ts
const atual = await c.env.DB.prepare(
  'SELECT project_id, asset_id, asset, threat, vulnerability, impact, probability, treatment, treatment_plan, control_id, owner, owner_parte_id, status, accepted_by, accepted_at FROM risks WHERE id = ?'
).bind(id).first<any>();
if (!atual) return c.json({ error: 'Risco não encontrado' }, 404);
const tem = (k: string) => Object.hasOwn(body, k) && body[k] !== undefined;
const novo = (k: string, padrao: unknown) => (tem(k) ? body[k] : padrao);
const impact = novo('impact', atual.impact) as number;
const probability = novo('probability', atual.probability) as number;
const level = riskLevel(impact * probability);
await c.env.DB.prepare(
  `UPDATE risks SET asset_id=?, asset=?, threat=?, vulnerability=?, impact=?, probability=?, risk_level=?, treatment=?, treatment_plan=?,
     control_id=?, owner=?, owner_parte_id=?, status=?, accepted_by=?, accepted_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
).bind(
  tem('asset_id') ? (body.asset_id || null) : atual.asset_id,
  novo('asset', atual.asset), novo('threat', atual.threat),
  tem('vulnerability') ? (body.vulnerability ?? null) : atual.vulnerability,
  impact, probability, level,
  novo('treatment', atual.treatment),
  tem('treatment_plan') ? (body.treatment_plan ?? null) : atual.treatment_plan,
  tem('control_id') ? (body.control_id || null) : atual.control_id,
  tem('owner') ? (body.owner ?? null) : atual.owner,
  tem('owner_parte_id') ? (body.owner_parte_id || null) : atual.owner_parte_id,
  novo('status', atual.status),
  tem('accepted_by') ? (body.accepted_by ?? null) : atual.accepted_by,
  tem('accepted_at') ? (body.accepted_at ?? null) : atual.accepted_at,
  id
).run();
```

Manter a validação `refForaDoProjeto` e a gravação em `risk_history` como estão. Se o schema zod (`riscoAtualizarSchema`) exige `asset` e `threat`, torne-os opcionais no PUT (em `src/schemas/`), sem afrouxar o POST.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run test/risco-put-parcial.test.ts test/risco-responsavel.test.ts test/agente-gap-traceability.test.ts test/coherence.test.ts`
Esperado: tudo passa.

- [ ] **Passo 5: commit**

```bash
git add src/routes/risks.ts src/schemas test/risco-put-parcial.test.ts
git -c user.name=resper1965 -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(riscos): PUT do risco é parcial e não apaga ativo, plano, status nem aceite"
```

### Tarefa F0.2: a exportação de riscos respeita a faixa do n.iso

**Arquivos:**
- Modificar: `src/modulos.ts` (a classificação do segmento `export`) ou a rota `GET /projects/:id/export/risks` em `src/routes/integrations.ts`
- Criar: `test/export-risks-faixa.test.ts`

**Interfaces:**
- Consome: `faixaDoCaminho(caminho)` de `src/modulos.ts`.
- Produz: `GET /api/v1/projects/:p/export/risks` responde 403 ("Você não tem acesso ao n.iso") quando o projeto não tem o n.iso ou a pessoa não tem o módulo; as demais exportações continuam do núcleo.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// test/export-risks-faixa.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, designarConsultor, habilitarPrivacy } from './helpers/d1';

const SO_PRIVACY = 'ex-priv';
const chamar = (h: Record<string, string>, caminho: string) =>
  app.fetch(new Request('http://localhost' + caminho, { method: 'GET', headers: h }), workerEnv());
let consultor: Record<string, string>;
beforeAll(async () => {
  await applySchema();
  await env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(SO_PRIVACY).run();
  await env.DB.prepare(`DELETE FROM projeto_modulos WHERE project_id = ? AND modulo = 'iso'`).bind(SO_PRIVACY).run();
  await habilitarPrivacy(SO_PRIVACY);
  await designarConsultor('cons@ness.lat', SO_PRIVACY);
  consultor = await sessionFor({ id: 'cons:cons@ness.lat', email: 'cons@ness.lat', role: 'consultor' });
});
describe('exportação de riscos', () => {
  it('projeto só com n.privacy não baixa os riscos do n.iso', async () => {
    const r = await chamar(consultor, `/api/v1/projects/${SO_PRIVACY}/export/risks`);
    expect(r.status).toBe(403);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run test/export-risks-faixa.test.ts`
Esperado: FALHA (hoje responde 200 com o CSV).

- [ ] **Passo 3: implementação mínima**

Em `src/modulos.ts`, acrescente a sub-rota de exportação de riscos como faixa `iso`, no mesmo molde de `SUBROTAS_PRIVACY` (uma lista paralela consultada antes do segmento):

```ts
/** Sub-rotas de um segmento do núcleo que são do n.iso (a exportação de riscos lê a matriz ISO). */
const SUBROTAS_ISO: RegExp[] = [/^export\/risks$/];
```

e em `faixaDoCaminho`, logo antes da linha que consulta `SUBROTAS_PRIVACY`:

```ts
if (SUBROTAS_ISO.some((re) => re.test(resto))) return 'iso';
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run test/export-risks-faixa.test.ts test/modulos-produto.test.ts test/modulos-por-pessoa.test.ts`
Esperado: passa; se `modulos-produto.test.ts` classificar `export` como núcleo por segmento, acrescente a exceção no próprio teste, com o motivo em comentário.

- [ ] **Passo 5: commit**

```bash
git add src/modulos.ts test/export-risks-faixa.test.ts
git -c user.name=resper1965 -c user.email=44273656+resper1965@users.noreply.github.com commit -m "fix(modulos): exportação de riscos é do n.iso"
```

---

## Fase F1: teste de impacto que gera o RIPD

**Passo prévio de leitura (sem código):** o legado tem três blocos no teste: "A atividade pode gerar alto risco ao titular de dados?", "Critério Geral" e "Critério Específico". Foram vistas as **11 perguntas do Critério Específico**; os blocos de Critério Geral e da pergunta inicial estavam recolhidos. Antes de codar, abrir os dois blocos no legado (somente leitura) e registrar o texto exato deles em `src/services/impacto.ts` como `CRITERIOS_GERAIS`. Se o dono não os quiser, a tarefa F1.2 funciona só com as 11.

### Tarefa F1.1: migration e schema do teste de impacto

**Arquivos:**
- Criar: `migrations/0072_tratamento_impacto.sql`, `test/migration-0072.test.ts`
- Modificar: `schema.sql` (tabela depois de `ropa_records`; coluna nova de `ropa_records`)

**Interfaces:**
- Produz: tabela `tratamento_impacto(ropa_id, project_id, pergunta, resposta, atualizado_por, atualizado_em)` com chave `(ropa_id, pergunta)`, e a coluna `ropa_records.impacto_finalizado_em`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// test/migration-0072.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';

beforeAll(applySchema);
describe('0072 teste de impacto', () => {
  it('a tabela existe com a chave composta e aceita só sim, nao e nao_sei', async () => {
    const cols = (await env.DB.prepare(`SELECT name FROM pragma_table_info('tratamento_impacto')`).all<{ name: string }>()).results.map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['ropa_id', 'project_id', 'pergunta', 'resposta', 'atualizado_por', 'atualizado_em']));
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('mi-p', 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('mi-r', 'mi-p', 'Folha')`),
    ]);
    await env.DB.prepare(`INSERT INTO tratamento_impacto (ropa_id, project_id, pergunta, resposta) VALUES ('mi-r', 'mi-p', 'sensiveis', 'sim')`).run();
    await expect(env.DB.prepare(`INSERT INTO tratamento_impacto (ropa_id, project_id, pergunta, resposta) VALUES ('mi-r', 'mi-p', 'sensiveis', 'talvez')`).run()).rejects.toThrow();
  });
  it('a coluna impacto_finalizado_em nasce vazia nos registros existentes', async () => {
    const r = await env.DB.prepare(`SELECT impacto_finalizado_em FROM ropa_records WHERE id = 'mi-r'`).first<any>();
    expect(r.impacto_finalizado_em).toBeNull();
  });
  it('apagar o tratamento apaga as respostas', async () => {
    await env.DB.prepare(`DELETE FROM ropa_records WHERE id = 'mi-r'`).run();
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tratamento_impacto WHERE ropa_id = 'mi-r'`).first<{ n: number }>();
    expect(n?.n).toBe(0);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run test/migration-0072.test.ts`
Esperado: FALHA (`no such table: tratamento_impacto`).

- [ ] **Passo 3: implementação mínima**

`migrations/0072_tratamento_impacto.sql`:

```sql
-- 0072: respostas do teste de impacto (as 11 perguntas do critério específico do legado) por tratamento. A pergunta é texto
-- livre validado no código (o catálogo pode mudar sem migration). Fora do conteúdo congelado da aprovação do RoPA.
CREATE TABLE IF NOT EXISTS tratamento_impacto (
    ropa_id TEXT NOT NULL REFERENCES ropa_records(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pergunta TEXT NOT NULL,
    resposta TEXT NOT NULL CHECK (resposta IN ('sim', 'nao', 'nao_sei')),
    atualizado_por TEXT,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ropa_id, pergunta)
);
CREATE INDEX IF NOT EXISTS idx_tratamento_impacto_projeto ON tratamento_impacto(project_id);
ALTER TABLE ropa_records ADD COLUMN impacto_finalizado_em DATETIME;
```

Em `schema.sql`, a mesma tabela e o índice **depois** de `ropa_records`, e `impacto_finalizado_em DATETIME` na definição de `ropa_records`. Acrescente a migration em `migrations/README.md` com a ordem de aplicação.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run test/migration-0072.test.ts test/schema-contract.test.ts test/colunas-catraca.test.ts`
Esperado: passa.

- [ ] **Passo 5: commit**

```bash
git add migrations/0072_tratamento_impacto.sql migrations/README.md schema.sql test/migration-0072.test.ts
git -c user.name=resper1965 -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(impacto): migration 0072 com as respostas do teste de impacto do tratamento"
```

### Tarefa F1.2: catálogo e recomendação no servidor

**Arquivos:**
- Criar: `src/services/impacto.ts`, `test/impacto.test.ts`

**Interfaces:**
- Produz: `PERGUNTAS_IMPACTO: { id: string; texto: string }[]` (11 itens), `type RespostaImpacto = 'sim' | 'nao' | 'nao_sei'`, `recomendarRipd(respostas: Record<string, RespostaImpacto>): { resultado: 'recomendado' | 'dispensavel_a_confirmar' | 'incompleto'; motivos: string[] }`, `lerImpacto(db, projectId, ropaId)` e `salvarImpacto(db, projectId, ropaId, ator, corpo)`.

- [ ] **Passo 1: escrever o teste que falha**

```ts
// test/impacto.test.ts
import { describe, it, expect } from 'vitest';
import { PERGUNTAS_IMPACTO, recomendarRipd } from '../src/services/impacto';

describe('catálogo do teste de impacto', () => {
  it('tem as 11 perguntas do critério específico, com id estável e texto', () => {
    expect(PERGUNTAS_IMPACTO.map((p) => p.id)).toEqual([
      'sensiveis', 'vulneraveis', 'finalidade_distinta', 'compartilhamento_novo', 'monitoramento', 'perfilizacao',
      'combinacao', 'transferencia', 'tecnologia_inovadora', 'decisao_automatizada', 'legitimo_interesse',
    ]);
    expect(PERGUNTAS_IMPACTO.every((p) => p.texto.length > 20)).toBe(true);
  });
});
describe('recomendarRipd', () => {
  const todas = (v: 'sim' | 'nao' | 'nao_sei') => Object.fromEntries(PERGUNTAS_IMPACTO.map((p) => [p.id, v]));
  it('qualquer sim recomenda o RIPD e lista os motivos', () => {
    const r = recomendarRipd({ ...todas('nao'), sensiveis: 'sim', monitoramento: 'sim' });
    expect(r.resultado).toBe('recomendado');
    expect(r.motivos).toEqual(['sensiveis', 'monitoramento']);
  });
  it('tudo não deixa dispensável, mas a confirmação é humana', () => {
    expect(recomendarRipd(todas('nao')).resultado).toBe('dispensavel_a_confirmar');
  });
  it('pergunta sem resposta ou "não sei" deixa incompleto, salvo se já há um sim', () => {
    expect(recomendarRipd({ sensiveis: 'nao' }).resultado).toBe('incompleto');
    expect(recomendarRipd({ ...todas('nao_sei') }).resultado).toBe('incompleto');
    expect(recomendarRipd({ ...todas('nao_sei'), perfilizacao: 'sim' }).resultado).toBe('recomendado');
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run test/impacto.test.ts`
Esperado: FALHA (módulo inexistente).

- [ ] **Passo 3: implementação mínima**

```ts
// src/services/impacto.ts
export type RespostaImpacto = 'sim' | 'nao' | 'nao_sei';

/** Critério específico do teste de impacto do legado (11 perguntas). Texto fiel ao legado; revisão jurídica é do dono. */
export const PERGUNTAS_IMPACTO: { id: string; texto: string }[] = [
  { id: 'sensiveis', texto: 'Será realizado o tratamento de dados pessoais sensíveis dos titulares, ou seja, informações sobre origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico, quando vinculado a uma pessoa natural?' },
  { id: 'vulneraveis', texto: 'Será realizado o tratamento de dados pessoais sobre indivíduos vulneráveis?' },
  { id: 'finalidade_distinta', texto: 'O projeto envolve a utilização de dados pessoais para finalidade distinta daquela pela qual foi coletado?' },
  { id: 'compartilhamento_novo', texto: 'O projeto envolve o compartilhamento de dados pessoais com terceiros que não tinham acesso aos dados anteriormente?' },
  { id: 'monitoramento', texto: 'Será realizado o monitoramento sistemático de titulares de dados pessoais?' },
  { id: 'perfilizacao', texto: 'O projeto incluirá a avaliação (perfilização) ou pontuação (scoring) dos titulares de dados pessoais?' },
  { id: 'combinacao', texto: 'Conjuntos de dados pessoais serão combinados ou enriquecidos?' },
  { id: 'transferencia', texto: 'Existirá transferência de dados pessoais para fora do território nacional brasileiro?' },
  { id: 'tecnologia_inovadora', texto: 'Durante o tratamento de dados pessoais serão empregadas soluções tecnológicas ou organizacionais inovadoras?' },
  { id: 'decisao_automatizada', texto: 'O projeto incluirá o uso de dados pessoais para tomada de decisão automatizada com efeito legal ou significativamente similar?' },
  { id: 'legitimo_interesse', texto: 'O fundamento legal para o tratamento de dados é legítimo interesse?' },
];
const IDS = new Set(PERGUNTAS_IMPACTO.map((p) => p.id));
export const ehPerguntaDeImpacto = (id: string) => IDS.has(id);

/**
 * Regra: qualquer "sim" recomenda o RIPD. Sem nenhum "sim", só dispensa quando as 11 estão respondidas "não"; senão fica incompleto.
 * É sugestão: `dpia_required` continua sendo decisão humana.
 */
export function recomendarRipd(respostas: Record<string, RespostaImpacto | undefined>): {
  resultado: 'recomendado' | 'dispensavel_a_confirmar' | 'incompleto'; motivos: string[];
} {
  const motivos = PERGUNTAS_IMPACTO.filter((p) => respostas[p.id] === 'sim').map((p) => p.id);
  if (motivos.length) return { resultado: 'recomendado', motivos };
  const todasNao = PERGUNTAS_IMPACTO.every((p) => respostas[p.id] === 'nao');
  return { resultado: todasNao ? 'dispensavel_a_confirmar' : 'incompleto', motivos: [] };
}
```

Acrescente no mesmo arquivo `lerImpacto` e `salvarImpacto`:

```ts
export async function lerImpacto(db: D1Database, projectId: string, ropaId: string) {
  const rec = await db.prepare('SELECT impacto_finalizado_em FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first<{ impacto_finalizado_em: string | null }>();
  if (!rec) return null;
  const linhas = (await db.prepare('SELECT pergunta, resposta FROM tratamento_impacto WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId).all<{ pergunta: string; resposta: RespostaImpacto }>()).results;
  const respostas = Object.fromEntries(linhas.map((l) => [l.pergunta, l.resposta]));
  return {
    perguntas: PERGUNTAS_IMPACTO.map((p) => ({ id: p.id, texto: p.texto, resposta: respostas[p.id] ?? null })),
    recomendacao: recomendarRipd(respostas),
    finalizado_em: rec.impacto_finalizado_em,
  };
}

export async function salvarImpacto(
  db: D1Database, projectId: string, ropaId: string, ator: string,
  corpo: { respostas: Record<string, RespostaImpacto>; finalizar?: boolean },
): Promise<{ ok: true } | { ok: false; status: 400 | 404; error: string }> {
  const rec = await db.prepare('SELECT 1 FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first();
  if (!rec) return { ok: false, status: 404, error: 'Registro do RoPA não encontrado' };
  const ids = Object.keys(corpo.respostas);
  const desconhecida = ids.find((id) => !ehPerguntaDeImpacto(id));
  if (desconhecida) return { ok: false, status: 400, error: `Pergunta desconhecida: ${desconhecida}` };
  const stmts = ids.map((id) => db.prepare(
    `INSERT INTO tratamento_impacto (ropa_id, project_id, pergunta, resposta, atualizado_por) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ropa_id, pergunta) DO UPDATE SET resposta = excluded.resposta, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`
  ).bind(ropaId, projectId, id, corpo.respostas[id], ator));
  if (corpo.finalizar !== undefined) {
    stmts.push(db.prepare('UPDATE ropa_records SET impacto_finalizado_em = ? WHERE id = ? AND project_id = ?')
      .bind(corpo.finalizar ? new Date().toISOString() : null, ropaId, projectId));
  }
  if (stmts.length) await db.batch(stmts);
  return { ok: true };
}
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run test/impacto.test.ts`
Esperado: passa.

- [ ] **Passo 5: commit**

```bash
git add src/services/impacto.ts test/impacto.test.ts
git -c user.name=resper1965 -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(impacto): catálogo de 11 perguntas e recomendação de RIPD no servidor"
```

### Tarefa F1.3: rotas `GET` e `PUT /projects/:id/ropa/:rid/impacto`

**Arquivos:**
- Modificar: `src/routes/ropa.ts`, `src/modulos.ts` (`SUBROTAS_PRIVACY`), `src/schemas/nucleo.ts`, `src/openapi.ts`
- Criar: casos em `test/impacto.test.ts` (bloco de rota)

**Interfaces:**
- Consome: `lerImpacto`, `salvarImpacto` (F1.2), `validateBody`, `erro500`, `logAudit`.
- Produz: `GET .../ropa/:recordId/impacto` e `PUT .../ropa/:recordId/impacto` com corpo `{ respostas: { [pergunta]: 'sim'|'nao'|'nao_sei' }, finalizar?: boolean }`. Faixa `privacy`.

- [ ] **Passo 1: escrever o teste que falha** (acrescentar ao fim de `test/impacto.test.ts`, com o mesmo molde de `test/tratamento-ligacoes.test.ts`: `applySchema`, projeto `im-proj`, consultor designado, `habilitarPrivacy`, helper `chamar`)

```ts
describe('rota do teste de impacto', () => {
  it('grava as respostas, recomenda o RIPD e finaliza', async () => {
    const rid = await novoRegistro('Folha de pagamento');
    const put = await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { sensiveis: 'sim', monitoramento: 'nao' }, finalizar: false });
    expect(put.status).toBe(200);
    const get = await json<any>(await chamar(consultor, 'GET', `${base(rid)}/impacto`));
    expect(get.recomendacao).toEqual({ resultado: 'recomendado', motivos: ['sensiveis'] });
    expect(get.perguntas.find((p: any) => p.id === 'sensiveis').resposta).toBe('sim');
    expect(get.finalizado_em).toBeNull();
    await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: {}, finalizar: true });
    expect((await json<any>(await chamar(consultor, 'GET', `${base(rid)}/impacto`))).finalizado_em).not.toBeNull();
  });
  it('recusa pergunta desconhecida, resposta inválida e registro de outro projeto', async () => {
    const rid = await novoRegistro('Outra');
    expect((await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { inventada: 'sim' } })).status).toBe(400);
    expect((await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { sensiveis: 'talvez' } })).status).toBe(400);
    expect((await chamar(consultor, 'GET', `/api/v1/projects/${OUTRO}/ropa/${rid}/impacto`)).status).toBeGreaterThanOrEqual(400);
  });
  it('responder o teste não mexe no hash da aprovação do tratamento', async () => {
    const rid = await novoRegistro('Com aprovação');
    const antes = await hashDoTratamento(rid);          // helper do teste: chama documentoAtual(db, 'tratamento', ...) de src/services/pedidos.ts
    await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { sensiveis: 'sim' }, finalizar: true });
    expect(await hashDoTratamento(rid)).toBe(antes);
  });
  it('o cliente sem permissão de escrita não grava', async () => {
    const rid = await novoRegistro('Cliente');
    expect((await chamar(cliente, 'PUT', `${base(rid)}/impacto`, { respostas: { sensiveis: 'sim' } })).status).toBe(403);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run test/impacto.test.ts`
Esperado: FALHA (404 na rota).

- [ ] **Passo 3: implementação mínima**

`src/schemas/nucleo.ts`:

```ts
export const tratamentoImpactoSchema = z.object({
  respostas: z.record(z.string().max(60), z.enum(['sim', 'nao', 'nao_sei'])).refine((r) => Object.keys(r).length <= 40, 'respostas demais'),
  finalizar: z.boolean().optional(),
}).strict();
```

`src/routes/ropa.ts` (junto das demais sub-rotas do `:recordId`; importar `lerImpacto`, `salvarImpacto` e `tratamentoImpactoSchema`):

```ts
projectRopaApp.get('/:recordId/impacto', async (c) => {
  const r = await lerImpacto(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'));
  return r ? c.json(r) : c.json({ error: 'Registro do RoPA não encontrado' }, 404);
});

projectRopaApp.put('/:recordId/impacto', async (c) => {
  try {
    const v = await validateBody(c, tratamentoImpactoSchema);
    if (!v.success) return v.response;
    // O agente (MCP) propõe; finalizar o teste é ato de uma pessoa.
    if (c.get('user')?.agente === true && v.data.finalizar !== undefined) {
      return c.json({ error: 'Forbidden: finalizar o teste de impacto é ato humano, pela interface' }, 403);
    }
    const projectId = c.req.param('projectId')!;
    const r = await salvarImpacto(c.env.DB, projectId, c.req.param('recordId'), c.get('user')?.email || 'system', v.data);
    if (!r.ok) return c.json({ error: r.error }, r.status);
    await logAudit(c.env.DB, 'ropa.impacto', c.get('user')?.email || 'system', `ROPA ${c.req.param('recordId')}: teste de impacto atualizado`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao gravar o teste de impacto', e); }
});
```

`src/modulos.ts`, na regex de `SUBROTAS_PRIVACY`: `ligacoes|itens|departamentos|transferencias|diagrama|dpia|lia|sugestao|impacto`.

Não chame `conferirPedidosDoDocumento` nesta rota: o teste de impacto não entra no conteúdo congelado, então não substitui pedido nenhum. Rode `npm run openapi`.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run test/impacto.test.ts test/modulos-produto.test.ts test/openapi.test.ts test/contrato-isolamento-org.test.ts`
Esperado: passa (classifique a rota nova em `test/contrato-isolamento-org.test.ts` se a varredura pedir).

- [ ] **Passo 5: commit**

```bash
git add src/routes/ropa.ts src/modulos.ts src/schemas/nucleo.ts src/openapi.ts docs/openapi.json mcp-server-niso/src/contrato-gerado.ts test/impacto.test.ts
git -c user.name=resper1965 -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(impacto): rotas do teste de impacto do tratamento, fora do hash da aprovação"
```

### Tarefa F1.4: o RIPD nasce herdando tudo o que já foi informado, e o teste de não regressão das aprovações

**Arquivos:**
- Modificar: `src/services/lia.ts` (`criarDpiaDoTratamento`, linhas 74-96), `schema.sql` e migration 0072 (coluna `origem_hash`)
- Criar/estender: `test/lia-dpia.test.ts`, `test/tratamento-aprovacao.test.ts`

**Interfaces:**
- Consome: `lerImpacto` (F1.2), `documentoAtual(db, 'tratamento', ropaId)` e `hashConteudo` de `src/services/pedidos.ts`.
- Produz: o RIPD herda, além do que já herda, a base legal, sensíveis, crianças, retenção, destinatários, a recomendação e as respostas do teste de impacto, o controlador e o encarregado da empresa; `dpia_assessments.origem_hash` e `lia_assessments.origem_hash` (coluna NULL) guardam o hash do tratamento no momento da criação.

- [ ] **Passo 1: escrever os testes que falham**

```ts
// em test/lia-dpia.test.ts
it('o RIPD criado do tratamento herda base legal, sensíveis, retenção, destinatários e o resultado do teste de impacto', async () => {
  const rid = await novoRegistro('Folha', { data_categories: 'Identificação, Financeiro', data_subjects: 'Colaboradores', retention_period: '5 anos', recipients: 'Banco', dados_sensiveis: 1 });
  await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { sensiveis: 'sim' } });
  const r = await chamar(consultor, 'POST', `${base(rid)}/dpia`, {});
  expect(r.status).toBe(201);
  const dpia = await env.DB.prepare('SELECT * FROM dpia_assessments WHERE ropa_id = ?').bind(rid).first<any>();
  expect(dpia.mitigation_measures ?? '').toBeDefined();
  expect(dpia.necessity_proportionality).toContain('5 anos');           // retenção herdada
  expect(dpia.risks_identified).toContain('sensiveis');                 // motivo do teste de impacto
  expect(dpia.origem_hash).toMatch(/^[0-9a-f]{64}$/);
});
// em test/tratamento-aprovacao.test.ts
it('aprovação do tratamento criada antes da migration 0072 continua valendo depois dela', async () => {
  const rid = await tratamentoAprovado();              // helper do arquivo: cria o RoPA e aprova CISO e CEO
  await chamar(consultor, 'PUT', `${base(rid)}/impacto`, { respostas: { sensiveis: 'sim' }, finalizar: true });
  const aprov = await aprovacoesDoProjeto(env.DB, P, 'tratamento');
  expect(aprov.get(rid)).toMatchObject({ ciso: expect.anything(), ceo: expect.anything() });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `npx vitest run test/lia-dpia.test.ts test/tratamento-aprovacao.test.ts`
Esperado: FALHA nos campos herdados e em `origem_hash`.

- [ ] **Passo 3: implementação mínima**

1. Migration 0072 (mesmo arquivo da F1.1, antes de aplicar em produção) e `schema.sql`: `ALTER TABLE dpia_assessments ADD COLUMN origem_hash TEXT;` e `ALTER TABLE lia_assessments ADD COLUMN origem_hash TEXT;`.
2. Em `criarDpiaDoTratamento`, ampliar o `SELECT` do tratamento para `processing_purpose, data_subjects, data_categories, retention_period, recipients, dados_sensiveis, criancas_adolescentes, legal_basis, base_legal_id`, ler `lerImpacto(...)` e montar `necessity_proportionality` com a base legal e a retenção, `risks_identified` com os motivos do teste de impacto (`recomendacao.motivos`), e gravar `origem_hash = await hashConteudo(await documentoAtual(db, 'tratamento', ropaId))`. Os campos que o RIPD já herda continuam como estão. **Não** alterar `COLUNAS_DPIA` nem `DOCUMENTOS.tratamento.colunas`.
3. O texto montado cita só dados do próprio projeto (sem dado pessoal), no formato "Base legal: X. Retenção: Y. Motivos do teste de impacto: Z."

- [ ] **Passo 4: rodar e ver passar**

Rodar: `npx vitest run test/lia-dpia.test.ts test/tratamento-aprovacao.test.ts test/dpia-aprovacao.test.ts test/pedidos-prova.test.ts test/pedidos.test.ts test/ropa-riscos-lgpd.test.ts`
Esperado: passa, inclusive o teste de não regressão das aprovações.

- [ ] **Passo 5: commit**

```bash
git add src/services/lia.ts schema.sql migrations/0072_tratamento_impacto.sql test/lia-dpia.test.ts test/tratamento-aprovacao.test.ts
git -c user.name=resper1965 -c user.email=44273656+resper1965@users.noreply.github.com commit -m "feat(ripd): o RIPD nasce herdando base legal, retenção, destinatários e o teste de impacto"
```

### Tarefa F1.5: o teste de impacto na entrevista e no "Novo RIPD"

**Arquivos:**
- Modificar: `frontend/src/views/ropa-entrevista.js` (novo bloco "I. Teste de impacto" depois do bloco H; `ctx` carrega `GET .../impacto`), `frontend/src/views/privacy.js` (`openNewDPIA`, linhas 451-485: passa a escolher a atividade e pré-preencher), `src/services/copiloto-ropa.ts` (o copiloto lê as respostas já gravadas)
- Estender: `frontend/test/ropa-entrevista.test.js`, criar `frontend/test/novo-ripd.test.js`

**Interfaces:**
- Consome: `GET/PUT /api/v1/projects/:id/ropa/:rid/impacto` (F1.3), com **um literal `/api/v1`** por chamada (`test/contrato-tela-api.test.ts`).
- Produz: a entrevista mostra as 11 perguntas com as respostas **já gravadas** (nunca pergunta de novo), calcula na tela o selo "RIPD recomendado" **vindo do servidor**, e o botão "Abrir o RIPD" chama `POST .../ropa/:rid/dpia`. "Novo RIPD" pede a atividade primeiro e cria pelo mesmo caminho, sem repetir finalidade, titulares e categorias.

- [ ] **Passo 1: escrever os testes que falham.** Casos concretos, no estilo de `ropa-entrevista.test.js`: (a) com `GET impacto` devolvendo `sensiveis: 'sim'`, a pergunta aparece marcada e o resumo mostra "RIPD recomendado: sensiveis"; (b) responder grava com `PUT` e um único literal de rota; (c) "Não sei agora" grava `nao_sei` e deixa o resultado "incompleto"; (d) "Novo RIPD" com atividade escolhida chama `POST .../dpia` e **não** mostra os campos de finalidade; (e) o texto do servidor é escapado.
- [ ] **Passo 2: rodar e ver falhar.** `cd frontend && npx vitest run test/ropa-entrevista.test.js test/novo-ripd.test.js`
- [ ] **Passo 3: implementar** seguindo os padrões do arquivo (delegação por `data-action`, `escapeHTML`, foco gerenciado, quadrado, tokens). Em `ropa-entrevista.js`, o catálogo de perguntas **vem do servidor** (`perguntas[].texto`), não é copiado no frontend.
- [ ] **Passo 4: rodar e ver passar**, e `npx vitest run test/contrato-tela-api.test.ts` na raiz.
- [ ] **Passo 5: commit** `feat(impacto): teste de impacto na entrevista e Novo RIPD que herda da atividade`.

**Entrega da F1:** PR único com F1.1 a F1.5, migration 0072, ordem de publicação da seção "Restrições globais".

---

## Fase F2: riscos e ações por atividade no cadastro comum, com mapa de risco no n.privacy

**Decisão que sustenta a fase (D1b da pesquisa):** `risks` e `corrective_actions` continuam com faixa `iso` nas rotas por id. O n.privacy os enxerga por **sub-rotas da atividade** em `SUBROTAS_PRIVACY`, que só alcançam linhas com `ropa_id` daquele tratamento. Isso atende o pedido do dono (um cadastro, mapa de risco no n.privacy, o n.iso vê os mesmos riscos) sem dar a quem teve o n.iso negado acesso à matriz ISO inteira (`test/modulos-por-pessoa.test.ts:103-132` e `test/modulos-produto.test.ts` quebrariam com a mudança de faixa).

### Tarefa F2.1: migration 0073 (`ropa_id` e risco residual)

**Arquivos:**
- Criar: `migrations/0073_risco_acao_da_atividade.sql`, `test/migration-0073.test.ts`
- Modificar: `schema.sql`, `migrations/README.md`

**Interfaces:**
- Produz: `risks.ropa_id`, `risks.residual_impact`, `risks.residual_probability`, `risks.residual_level`, `corrective_actions.ropa_id`, com índices.

- [ ] **Passo 1: teste que falha**

```ts
// test/migration-0073.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
beforeAll(applySchema);
const colunas = async (t: string) => (await env.DB.prepare(`SELECT name FROM pragma_table_info('${t}')`).all<{ name: string }>()).results.map((c) => c.name);
describe('0073', () => {
  it('risks e corrective_actions ganham ropa_id; risks ganha o residual', async () => {
    expect(await colunas('risks')).toEqual(expect.arrayContaining(['ropa_id', 'residual_impact', 'residual_probability', 'residual_level']));
    expect(await colunas('corrective_actions')).toContain('ropa_id');
  });
  it('apagar o tratamento solta o vínculo e mantém o risco e a ação (SET NULL)', async () => {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('m3-p', 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`),
      env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('m3-r', 'm3-p', 'Folha')`),
      env.DB.prepare(`INSERT INTO risks (id, project_id, asset, threat, ropa_id) VALUES ('m3-k', 'm3-p', 'ERP', 'Acesso indevido', 'm3-r')`),
      env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, title, ropa_id) VALUES ('m3-a', 'm3-p', 'Ajustar retenção', 'm3-r')`),
    ]);
    await env.DB.prepare(`DELETE FROM ropa_records WHERE id = 'm3-r'`).run();
    expect((await env.DB.prepare(`SELECT ropa_id FROM risks WHERE id = 'm3-k'`).first<any>()).ropa_id).toBeNull();
    expect((await env.DB.prepare(`SELECT ropa_id FROM corrective_actions WHERE id = 'm3-a'`).first<any>()).ropa_id).toBeNull();
  });
});
```

- [ ] **Passo 2: ver falhar.** `npx vitest run test/migration-0073.test.ts` (colunas inexistentes).
- [ ] **Passo 3: implementar.** `migrations/0073_risco_acao_da_atividade.sql`:

```sql
-- 0073: a atividade de tratamento passa a ter riscos e ações no MESMO cadastro do n.iso. ropa_id fica NULL nos registros existentes
-- (não há como saber a que atividade um risco ISO pertence). SET NULL: apagar a atividade não apaga o risco nem a ação.
ALTER TABLE risks ADD COLUMN ropa_id TEXT REFERENCES ropa_records(id) ON DELETE SET NULL;
ALTER TABLE risks ADD COLUMN residual_impact INTEGER CHECK (residual_impact IS NULL OR residual_impact BETWEEN 1 AND 5);
ALTER TABLE risks ADD COLUMN residual_probability INTEGER CHECK (residual_probability IS NULL OR residual_probability BETWEEN 1 AND 5);
ALTER TABLE risks ADD COLUMN residual_level TEXT;
ALTER TABLE corrective_actions ADD COLUMN ropa_id TEXT REFERENCES ropa_records(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_risks_ropa ON risks(ropa_id);
CREATE INDEX IF NOT EXISTS idx_capa_ropa ON corrective_actions(ropa_id);
```

e o mesmo em `schema.sql` (índices depois das tabelas).
- [ ] **Passo 4: ver passar.** `npx vitest run test/migration-0073.test.ts test/schema-contract.test.ts test/colunas-catraca.test.ts test/portabilidade.test.ts`.
- [ ] **Passo 5: commit** `feat(riscos): migration 0073 liga risco e ação à atividade e acrescenta o risco residual`.

### Tarefa F2.2: serviço e sub-rotas da atividade para riscos e ações

**Arquivos:**
- Criar: `src/services/riscos-atividade.ts`, `test/riscos-atividade.test.ts`
- Modificar: `src/routes/ropa.ts`, `src/modulos.ts` (`SUBROTAS_PRIVACY`: `ropa/[^/]+/(riscos|acoes)(/[^/]+)?`), `src/schemas/nucleo.ts`, `src/openapi.ts`, `src/trilha-exclusao.ts` (classificar o DELETE)

**Interfaces:**
- Produz: `GET/POST /projects/:p/ropa/:rid/riscos`, `PUT/DELETE /projects/:p/ropa/:rid/riscos/:id`, `GET/POST /projects/:p/ropa/:rid/acoes`, `PUT/DELETE /projects/:p/ropa/:rid/acoes/:id`. Risco: `{ threat, vulnerability?, impact, probability, treatment ('Mitigate'|'Accept'|'Avoid'|'Transfer'), treatment_plan?, residual_impact?, residual_probability?, owner_parte_id?, control_id?, status? }`. Ação: `{ title, description?, due_date?, assigned_to_parte_id?, status?, risk_id? }`. Toda consulta filtra `ropa_id = :rid AND project_id = :p`.
- Regras: o nível é calculado pelo servidor (`riskLevel(impact*probability)` de `src/routes/risks.ts`, extraído para o serviço); `residual_level` idem; ação com `risk_id` só aceita risco do mesmo `ropa_id`; DELETE grava `registro.excluido` na trilha e é classificado em `src/trilha-exclusao.ts`.

- [ ] **Passos 1-5 (TDD)**, com os testes (no molde de `test/tratamento-ligacoes.test.ts`):
  1. cria risco da atividade e ele aparece em `GET /api/v1/projects/:p/risks` (a visão do n.iso) com `ropa_id` preenchido; 
  2. editar pela sub-rota **não** mexe em riscos de outra atividade nem de outro projeto (id de outra atividade devolve 404);
  3. nível e residual calculados no servidor; `impact` fora de 1..5 devolve 400;
  4. ação ligada a `risk_id` de outra atividade devolve 400;
  5. quem não tem o n.privacy (pessoa sem `usuario_modulos privacy`) recebe 403 nas sub-rotas; quem só tem o n.privacy **não** acessa `GET /api/v1/projects/:p/risks` (continua 403 por faixa);
  6. o n.iso, ao editar o risco pelo `PUT /api/v1/risks/:id` parcial (F0.1), **preserva** `ropa_id` e o residual;
  7. DELETE do risco da atividade grava trilha e a ação ligada fica sem `risk_id` (`ON DELETE CASCADE` de `corrective_actions.risk_id` apaga a ação: **decidir e testar**; padrão proposto: a ação sobrevive, então a rota anula `risk_id` antes de apagar o risco).
  Implementação: serviço com `listarRiscos`, `criarRisco`, `atualizarRisco`, `apagarRisco` e as quatro funções equivalentes para ações; as rotas só validam corpo (`validateBody`), chamam o serviço e registram `logAudit` (`ropa.risco`, `ropa.acao`).
  Commit: `feat(riscos): riscos e ações da atividade, no cadastro comum, pelas sub-rotas do n.privacy`.

### Tarefa F2.3: ajustes ao cruzar com o n.iso (coerência, avisos, agente, portabilidade)

**Arquivos:**
- Modificar: `src/services/coherence.ts` (R1, linhas 40-49), `src/services/avisos-prazo.ts` (`TELA` da fonte `capa`, linhas 89 e 217), `mcp-server-niso/src/ferramentas.ts:752` (`niso_update_risk` reenvia lista fixa de campos), `src/portabilidade.ts` (nada novo: as colunas pertencem a tabelas já exportadas; conferir), `src/middleware/agente.ts` (`FORA_DO_AGENTE`: aceitar risco continua humano)
- Estender: `test/coherence.test.ts`, `test/avisos-prazo.test.ts`, `test/agente-gap-traceability.test.ts`, `test/portabilidade.test.ts`

- [ ] **Passo 1: testes que falham.** (a) R1 do `coherence`: risco de privacidade (`ropa_id` preenchido) com tratamento `Mitigate` e sem `control_id` **não** é erro; risco ISO continua sendo; (b) aviso de prazo da ação com `ropa_id` aponta para a tela da atividade quando o projeto não tem o n.iso, e para a CAPA quando tem; (c) `niso_update_risk` reenvia `ropa_id` e os campos residuais; (d) exportar e apagar o projeto leva as colunas novas.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.** R1: `WHERE ... AND ropa_id IS NULL` na consulta de risco sem controle. Avisos: `TELA` por módulo do projeto. Ferramenta MCP: acrescentar `ropa_id`, `residual_impact`, `residual_probability` à lista fixa de `niso_update_risk`. Regenerar `npm run openapi`.
- [ ] **Passo 4: ver passar** (`npx vitest run test/coherence.test.ts test/avisos-prazo.test.ts test/agente-gap-traceability.test.ts test/portabilidade.test.ts test/contrato-mcp.test.ts`).
- [ ] **Passo 5: commit** `fix(riscos): coerência, avisos de prazo e agente reconhecem o risco e a ação da atividade`.

### Tarefa F2.4: telas da atividade e o mapa de risco no n.privacy

**Arquivos:**
- Criar: `frontend/src/views/mapa-de-risco.js` (matriz de calor probabilidade por impacto, com contagem por célula e lista da célula escolhida), `frontend/test/mapa-de-risco.test.js`
- Modificar: `frontend/src/views/tratamento-ligacoes.js` (abas "Riscos" e "Ações" da atividade, no padrão do bloco de ligações), `frontend/src/views/ropa-entrevista.js` (bloco de riscos: lê o que já existe, nunca pergunta de novo), `frontend/login.html` e `frontend/src/produto.js` (item "Mapa de risco" na seção **Avaliar** do menu do n.privacy), `frontend/src/router.js`
- Modificar: `src/services/encarregado.ts` (contagem de riscos altos e ações vencidas no painel)

**Interfaces:**
- Consome: as sub-rotas da F2.2; um novo `GET /projects/:p/ropa/riscos-mapa` (faixa `privacy`, lista **todos** os riscos do projeto com `ropa_id`, com `probability`, `impact`, `risk_level`, `residual_level`, nome da atividade). Um literal `/api/v1` por chamada.
- Regra do mapa: as mesmas cores e faixas de nível do mapa do n.iso (`riskLevel`), para os dois módulos mostrarem a mesma coisa. Célula acessível (nome e contagem por texto, não só cor).

- [ ] **Passos 1-5 (TDD).** Testes jsdom: (a) a matriz soma os riscos por célula e mostra o nível por texto; (b) clicar na célula lista os riscos e abre a atividade; (c) risco sem `ropa_id` **não** aparece no mapa do n.privacy (é do n.iso); (d) o texto vindo do servidor é escapado; (e) a aba "Riscos" da atividade lista o que existe e o formulário já vem com o ativo da atividade escolhido pelo vínculo (pré-preenchimento); (f) em projeto só n.privacy, o n.iso não aparece em nenhum link. Teste do servidor para `riscos-mapa` (isolamento por organização e faixa). Commit: `feat(riscos): mapa de risco e abas de riscos e ações na atividade, no n.privacy`.

**Entrega da F2:** F0 primeiro (PR próprio), depois F2.1 a F2.4 em **dois** PRs (backend e migration; telas), porque a migration precisa estar em produção antes do código que a lê.

---

## Fases F3 a F6: escopo fechado, plano próprio depois da F2

Cada fase abaixo vira um plano próprio (`docs/superpowers/plans/AAAA-MM-DD-<fase>.md`) quando a anterior estiver em produção, com as lições dela. Aqui ficam o escopo, os arquivos e os riscos, para dimensionar.

**F3: ciclo de vida do dado e bases legais.** Tabela `tratamento_ciclo(ropa_id, etapa, situacao, item_id, descricao)` com as etapas coleta, uso, compartilhamento interno, compartilhamento externo, armazenamento e eliminação, cada uma `registrada` ou `nao_aplicavel`, apontando para `itens` (decisão D6: tabela nova, não `etapa` em `tratamento_itens`, que refaria a chave e o hash da lista de itens). Tabela `tratamento_bases(ropa_id, requisito_id, tipo)` para bases adicionais (art. 7, art. 11) e campo `base_gdpr` em `ropa_records`; `base_legal_id` continua a principal (decisão D5: migrar tudo mudaria o hash de todo tratamento aprovado). Entrevista: os blocos E e G passam a gravar o que hoje é "sem coluna". Riscos: `pedidos.ts` só muda por `soSeMarcado`; teste de não regressão obrigatório.

**F4: painel, exportação e impressão.** CSV com BOM (abre no Excel) das listas de atividades, riscos, ações, RIPD e LIA, com o filtro da tela; RIPD e LIA em Word com a biblioteca `docx` já instalada; painel do encarregado com as faixas de prazo (+150, 150, 90, 30 dias, vencidos) sobre as ações. Risco: a exportação de riscos respeita a faixa (F0.2) e o relatório da LIA (que hoje não existe) usa os dados da empresa.

**F5: homologação de fornecedor.** Questionário próprio (modelo, envio por link público com token, respostas, % respondido) no molde do link da pré-venda (`src/routes/assessments.ts:87-106`); o resultado vira `avaliacoes_terceiro` com método `questionario`. Rotas públicas entram nas listas de `EXCECOES` de isolamento, e o DELETE na trilha de exclusão. O agente não aprova homologação.

**F6: importação do legado.** Ampliar o CHECK de `importacao_itens.entidade` (reconstrução de uma tabela sem prova imutável) com `risco`, `gap`, `impacto`, `ciclo` e RIPD e LIA com estrutura; esquemas estritos em `src/schemas/importacao.ts`; `gravarRisco`, `gravarGap`, `gravarImpacto` e `gravarCiclo` em `src/services/importacao.ts`, casando a atividade por finalidade normalizada e o responsável por nome de parte; ordem da confirmação: tratamentos, ativos, depois o resto. Cada entidade gera o relatório de reconciliação da seção "Migração do legado".

## Autoavaliação do plano

- **Cobertura:** as 7 lacunas e a migração têm fase; os dois defeitos achados têm tarefa (F0.1, F0.2); o pré-preenchimento tem tarefa (F1.4, F1.5, F2.4) e matriz; as adequações de projeto existente têm seção própria e teste de não regressão (F1.4).
- **Sem marcadores pendentes:** as fases F3 a F6 estão deliberadamente delimitadas e não detalhadas passo a passo; isso é escopo, não lacuna, e cada uma vira plano com a mesma forma depois da F2.
- **Consistência de nomes:** `tratamento_impacto`, `impacto_finalizado_em`, `origem_hash`, `ropa_id`, `residual_*`, `lerImpacto`, `salvarImpacto`, `recomendarRipd` aparecem com a mesma grafia em todas as tarefas.
- **Pontos que dependem de decisão do dono (registrados, não escondidos):** (1) texto do Critério Geral do legado (passo prévio da F1); (2) regra de recomendação ("qualquer sim" é proposta, a revisão jurídica é do dono); (3) o que fazer com a ação quando o risco é apagado (F2.2, padrão proposto: a ação sobrevive).
