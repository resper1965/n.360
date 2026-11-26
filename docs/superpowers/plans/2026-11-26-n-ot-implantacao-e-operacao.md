# n.ot: Implantação e Operação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar no n.ot a Implantação (site em 4 etapas, por assistente) da Operação (desvios, saúde, inventário só leitura, Mudanças, Revalidação), com vocabulário único, papéis decididos pelo servidor, tudo por lote, o Painel como tela inicial e links que levam ao site e à aba exatos.

**Architecture:** Doze PRs pequenos (1a, 1b, 2, 3a, 3b, 3c, 4 a 9), na ordem do risco. A fase do banco (`ot_sites.fase`) fica; o servidor ganha funções puras de área e etapa (`areaEEtapa`, `faltaParaAvancar` em `src/services/ot-fase.ts`), duas rotas de leitura (`GET /ot/permissoes`, `GET /ot/implantacao`), alteração e remoção por lote (`alvo_id`, `remover`), trava de zona fora da Implantação e da Obra, e perde as seis rotas de escrita direta de ativo e fluxo. A tela para de recalcular papel (lê `/ot/permissoes`), o Início some (o Painel do servidor absorve "Espera por você") e o menu vira três grupos. **Nenhuma migration.**

**Tech Stack:** Cloudflare Worker (Hono) + D1, vitest (`@cloudflare/vitest-plugin` no backend, jsdom no frontend), SPA vanilla JS (Vite).

**Spec:** `docs/superpowers/specs/2026-11-26-n-ot-implantacao-e-operacao-design.md` (decisões do dono 1 a 5 e desenho 1 a 7). Decisões do dono sobre as quatro perguntas da spec (26/11, "sim às 4"): (1) relatório do leitor mantém a tabela de sites; (2) pedir a base exige ao menos um ativo (Task 3a.4); (3) zona fica fora do lote e só muda na Implantação ou em Obra, com trava no servidor (Task 3a.5); (4) platform_admin vê a lista de verificação. Toda referência arquivo:linha foi conferida em `origin/main` `e734f7a` e reconferida depois da revisão sobre `4b65a0e` (o merge de #630 não toca o n.ot).

## Global Constraints

- **P0-1/P0-2:** o n.ot só existe para quem tem `ot` na pessoa **e** no projeto (`podeVerOt`, `src/services/ot-visibilidade.ts:4-12`); agente MCP e chave de API recebem 403 em todo `/ot` (`src/routes/ot.ts:37-43`). Rota nova fica **dentro** do `otApp` (herda o 403). Quem não tem `ot` não aprende que o n.ot existe: nenhuma chave, contagem, texto ou consulta `ot_*` (`test/programa-rota.test.ts`, `frontend/test/painel-regua.test.js`).
- **P0-4:** todo número e toda lista saem de `sitesPermitidos` (`src/services/ot-inventario.ts:76-82`); o técnico não recebe total do projeto.
- **P0-6 / P1-7:** nunca IP, MAC, nome de ativo ou de sonda em Painel, lista de verificação, aviso, trilha ou mensagem de erro.
- **Quem criou não decide** (lote, base, avaliação); só a aprovação de lote carimba a verificação do 4.3.1.
- **`test/onda2-numeros.test.ts` NUNCA é editado**: `git diff --stat origin/main -- test/onda2-numeros.test.ts` vazio em todo commit; roda verde em todo task que toca `src/services/painel*.ts`.
- **Catraca do `any`** (`test/any-catraca.test.ts`, TETO 493): nenhum `any` novo em `src/`; se um task baixar o número, baixe o TETO no mesmo commit.
- **Mediana do painel < 300 ms** (`test/painel.test.ts`) segue verde em todo task que toca o painel.
- **Portão:** `bash scripts/ci/gate.sh` verde (na nuvem ou na máquina do dono) e o status `gate/local` gravado **pelo dono** (`bash scripts/ci/ship.sh <PR>`); sem bypass (o ruleset 25554528 não tem `bypass_actors`); nunca `gh pr merge --admin`.
- **No máximo 2 PRs deste plano abertos ao mesmo tempo.** O PR N começa da `origin/main` com os PRs de que depende já mergeados (tabela "Ordem").
- **E2E do n.ot no portão:** `frontend/e2e/ot.spec.js` roda em `scripts/ci/gate.sh:103` e trava textos e navegação do n.ot (Início, "Modo operação", "+ Novo ativo", "Acessos e sondas": `ot.spec.js:43-47,120,335,362,408,425,434,484-521,627-665`). Todo PR que muda texto, menu ou aba do n.ot atualiza o E2E no mesmo PR e roda `cd frontend && npx playwright test e2e/ot.spec.js` antes de abrir.
- **Suíte inteira do frontend por PR:** `cd frontend && npx vitest run` verde antes de abrir o PR; no backend, só os arquivos do passo (a suíte inteira é do portão) e `npx tsc --noEmit`.
- **Contrato:** rota nova ou que some atualiza `npm run openapi` (regenera `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts`), `test/contrato-tela-api.test.ts` e `test/contrato-isolamento-org.test.ts`; um literal de caminho por chamada `api(...)` na tela (a varredura é estática).
- **TDD:** teste que falha primeiro. **Mutação** em todo task marcado **[P0]**: quebre a regra, veja o teste falhar, desfaça (`git diff` volta ao de antes).
- **[revisor opus]** nos tasks marcados [P0].
- **Frontend:** `data-action` (delegação), nada de handler nem estilo inline (CSP), `escapeHTML` em todo dado do servidor, vazio com texto e nunca zero falso, um só `.btn-primary` por tela.
- **Sem nomes reais** (use "SE Norte Exemplo", `@cliente.teste`, `@ness.lat`). **AGENTS.md sem acentos** (só no PR9); CHANGELOG, spec, plano e telas com acentos.
- **`git add` só dos caminhos do task**; `git diff --cached --stat` antes de cada commit; nunca `git add -A`.
- **Migrations: nenhuma.** Se um task descobrir que precisa, pare e pergunte ao dono (o spec diz por que não precisa).
- Comandos: backend `npx vitest run <arquivos>`; frontend `cd frontend && npx vitest run [arquivos]`; build `cd frontend && npm run build`; tipos `npx tsc --noEmit`; contrato `npm run openapi`.

## Preflight (antes de cada PR e ao retomar)

- [ ] `git fetch origin && git status --short && git log --oneline -1 origin/main`: árvore limpa; `git merge-base --is-ancestor e734f7a origin/main` responde 0.
- [ ] `gh pr list --search "head:claude/ot-io-" --state open --json number --jq length` responde 0 ou 1 (no máximo 2 abertos depois de abrir este).
- [ ] Branch: `git switch -c claude/ot-io-<N> origin/main` (N = 1a, 1b, 2, 3a, 3b, 3c, 4 a 9). Os PRs de que este depende (tabela "Ordem") estão na `origin/main`: `git log origin/main --oneline --grep "(PR<M> implantação e operação)"` acha cada um.
- [ ] **Retomar:** `git log --oneline origin/main..HEAD` lista os tasks feitos pelo assunto do commit; comece pelo primeiro que falta.
- [ ] Ambiente: `ls node_modules/.bin/vitest frontend/node_modules/.bin/vitest` (se faltar: `npm ci` e `cd frontend && npm ci`).
- [ ] Reconfira as linhas citadas no task (`sed -n 'A,Bp' <arquivo>`): a `main` anda; se mudou, ajuste o Edit, não a regra.
- [ ] PR com tela: `grep -n "<texto que o PR muda>" frontend/e2e/ot.spec.js` e, no fim, `cd frontend && npx playwright install chromium && npx playwright test e2e/ot.spec.js` verde.

## Ordem

| PR | Assunto | Depende de | Migration |
|---|---|---|---|
| 1a | Vocabulário e links profundos no servidor e no sino (Tasks 1.1 a 1.3) | — | não |
| 1b | Vocabulário e links profundos na tela (Task 1.4) | 1a | não |
| 2 | Papéis tela × servidor (`/ot/permissoes`, leitor, Gestor direto) | 1b | não |
| 3a | Tudo por lote no servidor: `alvo_id`/`remover`, nome do alvo, base exige ativo, trava de zona | 2 | não |
| 3b | Tela: ativo e fluxo viram achado | 3a | não |
| 3c | Somem as seis rotas de escrita direta | 3b | não |
| 4 | Painel como início (Meu trabalho; some o Início) | 2 | não |
| 5 | Menu Operação / Implantação / Configuração; Acessos dividido; Desvios de todos os sites | 4 | não |
| 6 | Lista de verificação do projeto | 5 | não |
| 7 | Assistente do site em Implantação | 3c, 5 | não |
| 8 | Site em Operação (abas, Mudanças, Revalidação) | 7 | não |
| 9 | Documentação | 8 | não |

PR1a e PR2 tocam arquivos diferentes do servidor, mas o PR2 mexe nas telas do PR1b: vá em ordem. Com dois abertos no máximo, o PR4 pode correr junto do 3a/3b/3c.

## File Structure

- `src/services/ot-fase.ts`: `areaEEtapa`, `faltaParaAvancar` (puras), `SituacaoSite` ganha `area`, `etapa`, `falta`, `ativos`.
- `src/services/programa.ts`: `TEXTO_OT` no vocabulário novo; `SiteNoPrograma` ganha `id`; `proximo` do n.ot leva `site`.
- `src/services/painel-ot.ts`: `LinhaSiteOt` com `area`/`etapa`; itens com `site`/`aba`; `meuTrabalho` do técnico; itens do assessment.
- `src/services/painel.ts`: `ItemFazer` com `site?`.
- `src/services/avisos-prazo.ts`: link de obra e de aceite com o site/desvio.
- `src/services/ot-permissoes.ts` (novo): `permissoesOt(db, user, projectId)`.
- `src/services/ot-implantacao.ts` (novo): `listaDeVerificacao(db, projectId)`.
- `src/routes/ot.ts`: `GET /permissoes`, `GET /implantacao`, middleware do leitor, saem as escritas diretas de ativo e fluxo.
- `src/services/ot-coleta.ts`, `src/services/ot-fluxo-achado.ts`, `src/services/ot-levantamento.ts`: `alvo_id` e `remover` no item; `src/services/ot-agente.ts`: o agente os recusa.
- `src/routes/ot.ts`: `nomes_alvos` em `GET /lotes/:id`; trava de zona.
- `src/routes/ot-saidas.ts`, `src/services/ot-avaliacao.ts` (rota `/assessment`): sem `por_zona` e sem `subsidio` para o leitor.
- `frontend/e2e/ot.spec.js`: atualizado em cada PR que muda texto ou navegação do n.ot.
- `frontend/src/ot-navegacao.js`: `aba` no endereço; telas novas; aliases.
- `frontend/src/ot-comum.js`: `AREA`, `ETAPAS_IMPLANTACAO`, `permissoes` (cache por projeto) no lugar de `ehGestor`/`podeAprovarOt`.
- `frontend/src/views/ot-site.js` (reescrito em PR7/PR8), `ot-base.js` (cabeçalho de 4 etapas), `ot.js` (menu, inventário só leitura), `ot-implantacao.js` (novo), `ot-configuracao.js` (novo, divide `montarAcessos`).
- Some: `frontend/src/views/ot-inicio.js` e `frontend/test/ot-inicio.test.js` (PR4).
- Testes novos: `test/ot-area-etapa.test.ts`, `test/ot-permissoes.test.ts`, `test/ot-leitor.test.ts`, `test/ot-tudo-por-lote.test.ts`, `test/ot-zona-trava.test.ts`, `test/ot-implantacao.test.ts`, `test/helpers/ot.ts`, `frontend/test/ot-implantacao.test.js`, `frontend/test/ot-site-operacao.test.js`, `frontend/test/ot-menu.test.js`.

---

## PR1a — Vocabulário e links profundos no servidor e no sino (Tasks 1.1 a 1.3)

**Objetivo:** um nome só (Implantação · etapa N, Operação, Obra) do servidor à tela, e todo link do Painel, da régua e do sino levando ao site e à aba exatos. **Sem migration.** **Contrato:** `GET /sites/:id/situacao` ganha `area`, `etapa`, `falta`, `ativos`; `GET /painel?modulo=ot` ganha `por_site[].area/etapa` e `fazer[].site/aba`. OpenAPI não muda (só GET). **P0:** o `site` novo nos itens e na régua sai só dentro do bloco `ot` (quem não tem `ot` não recebe o bloco); é id de site permitido. **Pronto quando (PR1a + PR1b):** nenhuma tela do n.ot diz "Modo projeto", "Modo operação", "Em levantamento" ou "Base aprovada" como régua; o "Abrir" de um item de um só site abre esse site na aba certa; recarregar mantém a aba. **Riscos:** testes que travam os rótulos antigos (`frontend/test/ot-base.test.js`, `ot-site.test.js`, `ot-inicio.test.js`, `painel-ot.test.js`, `frontend/e2e/ot.spec.js`) mudam por decisão, não por regressão. As abas do Painel já saem com os nomes finais (`revisar`, `desvios`, `base`, `saude`); até o PR7 a tela do site traduz `revisar` para a aba de hoje (`aprovacao`, `ot-site.js:15`).

### Task 1.1: Área e etapa do site no servidor **[P0] [revisor opus]**

**Files:**
- Modify: `src/services/ot-fase.ts:8-14` (tipo), `:34-42` (ao lado de `proximoPassoDe`), `:44-68` (`situacaoDoSite`)
- Create: `test/ot-area-etapa.test.ts`
- Modify: `test/ot-fase-rotas.test.ts` (a resposta de `/situacao` ganha os campos)

**Interfaces:**
- Produces: `type Area = 'implantacao' | 'operacao' | 'obra'`; `areaEEtapa(x: EntradaEtapa): { area: Area; etapa: 1 | 2 | 3 | 4 | null }`; `faltaParaAvancar(x: EntradaEtapa): string[]`; `EntradaEtapa = { fase: Fase; obra_ate: string | null; ativos: number; zonas_4_1_1: boolean; rascunhos_bloqueiam: number; lotes_em_revisao: number }`; `SituacaoSite` ganha `area`, `etapa`, `falta: string[]`, `ativos: number`.

- [ ] **Step 1: Teste puro que falha** — `test/ot-area-etapa.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { areaEEtapa, faltaParaAvancar } from '../src/services/ot-fase';

// Spec 2026-11-26 §1: a fase do banco fica; área e etapa saem de um mapa puro.
const x = (o: Partial<Parameters<typeof areaEEtapa>[0]> = {}) => ({ fase: 'em_levantamento' as const, obra_ate: null, ativos: 0,
  zonas_4_1_1: false, rascunhos_bloqueiam: 0, lotes_em_revisao: 0, ...o });

describe('areaEEtapa', () => {
  it('sem zonas dos níveis 2, 3 e 4: Implantação, etapa 1 (Cadastrar)', () => {
    expect(areaEEtapa(x())).toEqual({ area: 'implantacao', etapa: 1 });
    expect(areaEEtapa(x({ ativos: 3 }))).toEqual({ area: 'implantacao', etapa: 1 });
  });
  it('zonas ok e nenhum ativo nem rascunho: etapa 2 (Levantar)', () => {
    expect(areaEEtapa(x({ zonas_4_1_1: true }))).toEqual({ area: 'implantacao', etapa: 2 });
  });
  it('rascunho fora da sonda ou lote em revisão: etapa 3 (Revisar), mesmo sem zonas', () => {
    expect(areaEEtapa(x({ zonas_4_1_1: true, ativos: 1, rascunhos_bloqueiam: 2 })).etapa).toBe(3);
    expect(areaEEtapa(x({ zonas_4_1_1: true, ativos: 1, lotes_em_revisao: 1 })).etapa).toBe(3);
  });
  it('tudo pronto ou base pedida: etapa 4 (Aprovar a base)', () => {
    expect(areaEEtapa(x({ zonas_4_1_1: true, ativos: 1 })).etapa).toBe(4);
    expect(areaEEtapa(x({ fase: 'base_em_aprovacao', zonas_4_1_1: true, ativos: 1 }))).toEqual({ area: 'implantacao', etapa: 4 });
  });
  it('em operação: Operação, sem etapa; em obra (ou base pedida com obra): Obra, com a etapa', () => {
    expect(areaEEtapa(x({ fase: 'em_operacao' }))).toEqual({ area: 'operacao', etapa: null });
    expect(areaEEtapa(x({ fase: 'em_obra', obra_ate: '2026-12-20', zonas_4_1_1: true, ativos: 1 }))).toEqual({ area: 'obra', etapa: 4 });
    expect(areaEEtapa(x({ fase: 'base_em_aprovacao', obra_ate: '2026-12-20', zonas_4_1_1: true, ativos: 1 })).area).toBe('obra');
  });
});

describe('faltaParaAvancar', () => {
  it('lista TODAS as condições que faltam, não só a primeira', () => {
    // a ordem é a de `faltaParaBase` hoje (ot-fase.ts:71-76) com o ativo por último: o 409 dos casos atuais não muda (Task 3a.4)
    expect(faltaParaAvancar(x({ rascunhos_bloqueiam: 2, lotes_em_revisao: 1 }))).toEqual([
      'Há 2 achado(s) em rascunho para revisar', 'Há 1 lote(s) de aprovação em revisão',
      'Faltam zonas nos níveis Purdue 2, 3 e 4', 'Nenhum ativo no inventário do site']);
  });
  it('pronto para pedir a base: lista vazia; em operação: lista vazia', () => {
    expect(faltaParaAvancar(x({ zonas_4_1_1: true, ativos: 1 }))).toEqual([]);
    expect(faltaParaAvancar(x({ fase: 'em_operacao' }))).toEqual([]);
  });
  it('nenhum texto leva nome, IP ou MAC (só contagem)', () => {
    for (const t of faltaParaAvancar(x({ rascunhos_bloqueiam: 1, lotes_em_revisao: 1 }))) expect(t).not.toMatch(/\d+\.\d+\.\d+\.\d+|[0-9a-f]{2}:[0-9a-f]{2}/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/ot-area-etapa.test.ts` → FAIL (`areaEEtapa is not a function`).

- [ ] **Step 3: Implementar** — em `src/services/ot-fase.ts`, depois de `proximoPassoDe` (linha 42):

```ts
export type Area = 'implantacao' | 'operacao' | 'obra';
export type EntradaEtapa = { fase: Fase; obra_ate: string | null; ativos: number; zonas_4_1_1: boolean; rascunhos_bloqueiam: number; lotes_em_revisao: number };

/** Spec 2026-11-26 §1: todas as condições que faltam para a próxima etapa da Implantação (ou da Obra). Só contagens. */
export function faltaParaAvancar(x: EntradaEtapa): string[] {
  if (x.fase === 'em_operacao') return [];
  return [
    x.rascunhos_bloqueiam > 0 && `Há ${x.rascunhos_bloqueiam} achado(s) em rascunho para revisar`,
    x.lotes_em_revisao > 0 && `Há ${x.lotes_em_revisao} lote(s) de aprovação em revisão`,
    !x.zonas_4_1_1 && 'Faltam zonas nos níveis Purdue 2, 3 e 4',
    x.ativos === 0 && 'Nenhum ativo no inventário do site',
  ].filter((t): t is string => !!t);
}

/** Área e etapa (1 Cadastrar, 2 Levantar, 3 Revisar, 4 Aprovar a base). A fase do banco fica; isto é só o nome. */
export function areaEEtapa(x: EntradaEtapa): { area: Area; etapa: 1 | 2 | 3 | 4 | null } {
  if (x.fase === 'em_operacao') return { area: 'operacao', etapa: null };
  const area: Area = x.fase === 'em_obra' || (x.fase === 'base_em_aprovacao' && x.obra_ate) ? 'obra' : 'implantacao';
  if (x.fase === 'base_em_aprovacao') return { area, etapa: 4 };
  const etapa = x.rascunhos_bloqueiam > 0 || x.lotes_em_revisao > 0 ? 3 : !x.zonas_4_1_1 ? 1 : x.ativos === 0 ? 2 : 4;
  return { area, etapa };
}
```

  Em `situacaoDoSite` (`ot-fase.ts:50-60`), troque a consulta `conteudo` por uma que devolva também a contagem de ativos (o `tem_conteudo` segue):

```ts
    db.prepare(`SELECT (SELECT 1 FROM ot_levantamentos WHERE project_id = ? AND site_id = ? AND status = 'ativo' LIMIT 1) AS lev,
      (SELECT count(*) FROM ot_ativos WHERE project_id = ? AND site_id = ? AND status = 'ativo') AS ativos`).bind(projectId, siteId, projectId, siteId).first<{ lev: number | null; ativos: number }>(),
```

  e, no retorno (`ot-fase.ts:63-67`): `const ativos = conteudo?.ativos ?? 0; const tem_conteudo = !!conteudo?.lev || ativos > 0;` e
  `const e = { fase: site.fase, obra_ate: row.obra_ate, ativos, zonas_4_1_1, rascunhos_bloqueiam, lotes_em_revisao };` com
  `...areaEEtapa(e), falta: faltaParaAvancar(e), ativos` no objeto devolvido. Acrescente `area: Area; etapa: 1 | 2 | 3 | 4 | null; falta: string[]; ativos: number` em `SituacaoSite`.

- [ ] **Step 4: Rodar** — `npx vitest run test/ot-area-etapa.test.ts test/ot-fase.test.ts test/ot-fase-rotas.test.ts` → PASS. Em `test/ot-fase-rotas.test.ts`, no teste que lê `GET …/situacao`, acrescente `expect(corpo).toMatchObject({ area: 'implantacao', etapa: 1, falta: expect.any(Array) })`.

- [ ] **Step 5: Mutação** — troque `!x.zonas_4_1_1 ? 1` por `!x.zonas_4_1_1 ? 2`; `npx vitest run test/ot-area-etapa.test.ts` falha; desfaça.

- [ ] **Step 6: Commit**

```bash
git add src/services/ot-fase.ts test/ot-area-etapa.test.ts test/ot-fase-rotas.test.ts
git diff --cached --stat
git commit -m "feat(ot): área e etapa do site (Implantação 1 a 4, Operação, Obra) e tudo o que falta para avançar (PR1a implantação e operação)"
```

### Task 1.2: Painel e jornada no vocabulário novo, com site e aba **[P0] [revisor opus]**

**Files:**
- Modify: `src/services/programa.ts:47-51,57-70`; `src/services/painel.ts:32` (`ItemFazer`), `:477` (régua do leitor); `src/services/painel-ot.ts:20,41-66,77-105`
- Modify: `test/programa.test.ts`, `test/painel-ot-papeis.test.ts`

**Interfaces:**
- Consumes: `areaEEtapa` (Task 1.1).
- Produces: `ItemFazer.site?: string`; `ItemFazer.aba` do n.ot ∈ `'desvios' | 'revisar' | 'base' | 'saude' | 'assessment' | 'sondas'`; `LinhaSiteOt` ganha `area` e `etapa`; `SiteNoPrograma` ganha `id`; `etapasDoOt(...).proximo` ganha `site`.

- [ ] **Step 1: Testes que falham** — em `test/programa.test.ts` (e o caso do leitor em `test/painel-ot-papeis.test.ts`, abaixo):

```ts
it('n.ot: o próximo passo diz a área e leva ao site mais atrasado (spec 2026-11-26 §1 e §7)', () => {
  const p = etapasDoOt([{ id: 's1', proximo_passo: 'em_operacao', desvios_abertos: 0 }, { id: 's2', proximo_passo: 'revisar', desvios_abertos: 0 }]);
  expect(p.proximo).toEqual({ texto: 'Implantação: revisar os achados', tela: 'ot', site: 's2' });
  expect(TEXTO_OT.em_operacao).toBe('Operação: acompanhar');
});
```

  Em `test/painel-ot-papeis.test.ts` (o arquivo já monta Gestor, equipe e técnico), acrescente:

```ts
it('por_site traz área e etapa; o item de um só site leva o site e a aba', async () => {
  const b = await painelOt(equipe); // ajudante do arquivo: GET /painel?modulo=ot
  expect(b.modulos.ot.por_site[0]).toMatchObject({ area: 'implantacao', etapa: expect.any(Number) });
  const lote = b.modulos.ot.fazer.find((i: { texto: string }) => /lote/.test(i.texto));
  expect(lote).toMatchObject({ tela: 'ot', aba: 'revisar', site: expect.any(String) });
});
it('leitor (client): a régua não leva site, nem no n.360 nem no ?modulo=ot', async () => {
  for (const url of ['/api/v1/projects/proj-a/painel', '/api/v1/projects/proj-a/painel?modulo=ot']) {
    const r = await (await chamar(cli, 'GET', url)).json<{ programa: { etapas: { ot?: { proximo?: Record<string, unknown> } } } }>();
    expect(r.programa.etapas.ot?.proximo).not.toHaveProperty('site');
  }
});
```

- [ ] **Step 2: Rodar** — `npx vitest run test/programa.test.ts test/painel-ot-papeis.test.ts` → FAIL.

- [ ] **Step 3: Implementar.**
  - `src/services/programa.ts:47-50`:

```ts
export const TEXTO_OT: Record<ProximoPasso, string> = {
  comecar: 'Implantação: cadastrar o site', revisar: 'Implantação: revisar os achados', aguardar_lote: 'Implantação: decidir o lote',
  pedir_base: 'Implantação: pedir a aprovação da base', aguardar_base: 'Implantação: aprovar a base', em_operacao: 'Operação: acompanhar', revalidar: 'Operação: revalidar os ativos',
};
export type SiteNoPrograma = { id: string; proximo_passo: ProximoPasso; desvios_abertos: number };
```

    e em `etapasDoOt` (`:66,69`): sem site, `proximo: { texto: 'Implantação: cadastrar o primeiro site', tela: 'ot', aba: 'implantacao' }`; com site, `proximo: { texto: doSite[i] === 'tratar' ? 'Operação: tratar os desvios abertos' : TEXTO_OT[sites[i].proximo_passo], tela: 'ot', site: sites[i].id }` (sem `aba`: a tela do site abre na aba da etapa). `ProximoDoPrograma` (`:14`) ganha `site?: string`.
  - `src/services/painel.ts:32`: `ItemFazer` ganha `site?: string`.
  - `src/services/painel-ot.ts`: o `item(...)` (`:77-78`) recebe `site?: string` e o devolve; os itens passam a usar as abas finais (a tela do site as traduz até o PR7) e o site quando o grupo tem um só site: sondas → `aba: 'sondas'`; revisões → `'assessment'`; desvios → `'desvios'` (site quando todos os desvios abertos fora de obra são de um site: some `mDesv`); lotes → `'revisar'` (site quando `mLotes.size === 1`); bases → `'base'` (site quando `emAprovacao.length === 1`); obras → sem aba, com o site quando há um só; aceites → `'desvios'`, com o site quando há um só. `sitesPrograma` (`:93`) leva `id: s.id`. `porSite` (`:100-105`) ganha `...areaEEtapa({ fase: s.fase as Fase, obra_ate: s.obra_ate, ativos: Number(mAtivos.get(s.id)?.n ?? 0), zonas_4_1_1: mZonas.has(s.id), rascunhos_bloqueiam: Number(mRasc.get(s.id)?.n ?? 0), lotes_em_revisao: Number(mLotes.get(s.id)?.n ?? 0) })`, com `mAtivos` de uma consulta **a mais no mesmo batch** (a `conteudo`, `:61-62`, fica como está): `SELECT site_id, count(*) AS n FROM ot_ativos WHERE project_id = ?1 AND status = 'ativo' AND ${NO_SITE} GROUP BY site_id`. Uma consulta agrupada a mais, constante (não cresce com os sites).
  - Leitor sem `site` na jornada: em `src/services/painel.ts:477`, o `otSites` passado a `etapasDoPrograma` vai sem `id` quando `ot.papel === 'leitor'` (`ot.sitesPrograma.map(({ id: _id, ...r }) => r)`), e `etapasDoOt` só põe `site` no `proximo` quando o site tem `id`. Vale no Início do n.360 e no `?modulo=ot` (o leitor também lê a régua).

- [ ] **Step 4: Rodar** — `npx vitest run test/programa.test.ts test/programa-rota.test.ts test/painel-ot-papeis.test.ts test/painel-ot-rota.test.ts test/painel-ot.test.ts test/painel.test.ts test/onda2-numeros.test.ts` → PASS (o de 150 sites em `programa-rota.test.ts` segue com o mesmo número de consultas).

- [ ] **Step 5: Mutação P0** — em `painel.ts:477`, passe `ot.sitesPrograma` com `id` também ao leitor; o teste "leitor (client): a régua não leva site" falha; desfaça.

- [ ] **Step 6: Commit** — `git add src/services/programa.ts src/services/painel.ts src/services/painel-ot.ts test/programa.test.ts test/painel-ot-papeis.test.ts` e `git commit -m "feat(ot): jornada e Painel no vocabulário Implantação/Operação, com site e aba nos itens (PR1a implantação e operação)"`.

### Task 1.3: Aviso do sino com o site e o desvio **[P0]**

**Files:**
- Modify: `src/services/avisos-prazo.ts:259,355`; `frontend/src/globals.js:1240-1245`
- Modify: `test/avisos-prazo-ot.test.ts`; `frontend/test/aviso-clique.test.js`

- [ ] **Step 1: Testes que falham** — em `test/avisos-prazo-ot.test.ts`, no teste "aceite e obra vão só ao Gestor…":

```ts
const links = (await env.DB.prepare(`SELECT type, link FROM notifications WHERE type LIKE 'prazo_ot_%'`).all<{ type: string; link: string }>()).results;
expect(links.find((n) => n.type === 'prazo_ot_obra')?.link).toMatch(/^\/projects\/proj-a\/ot\?site=[A-Za-z0-9_-]+$/);
expect(links.find((n) => n.type === 'prazo_ot_aceite')?.link).toMatch(/^\/projects\/proj-a\/ot\?desvio=[A-Za-z0-9_-]+$/);
expect(links.find((n) => n.type === 'prazo_ot_revisao')?.link).toBe('/projects/proj-a/ot?ot=assessment');
```

  Em `frontend/test/aviso-clique.test.js`: clicar um aviso com link `/projects/p9/ot?site=s1` deixa `S.otPedido` igual a `{ tela: 'site', site: 's1' }`; com `?desvio=d1`, `{ desvio: 'd1' }`.

- [ ] **Step 2: Rodar** — `npx vitest run test/avisos-prazo-ot.test.ts` e `cd frontend && npx vitest run test/aviso-clique.test.js` → FAIL.

- [ ] **Step 3: Implementar** — em `avisos-prazo.ts`, troque o `TELA` fixo do n.ot por uma função do item (o `item_id` já é o id do site na obra e do desvio no aceite, `:159-166`):

```ts
const telaOt = (i: { fonte: Fonte; item_id: string }) => i.fonte === 'ot_obra' ? `/ot?site=${encodeURIComponent(i.item_id)}`
  : i.fonte === 'ot_aceite' ? `/ot?desvio=${encodeURIComponent(i.item_id)}` : '/ot?ot=assessment';
```

  e, em `:324`, `let tela = item.fonte.startsWith('ot_') ? telaOt(item) : TELA[item.fonte];`. Em `globals.js:1243`, leia a consulta do link:

```js
const q = new URLSearchParams(link.split('?')[1] || '');
S.otPedido = q.get('site') ? { tela: 'site', site: q.get('site') } : q.get('desvio') ? { desvio: q.get('desvio') }
    : { tela: q.get('ot') === 'assessment' || n.type === 'prazo_ot_revisao' ? 'assessment' : /\bexportou\b/.test(message) ? 'relatorios' : 'sites' };
```

  e em `frontend/src/views/ot.js:49` o pedido passa a aceitar `site` e `desvio` (o desvio segue o caminho que já resolve `/ot/desvios/<id>`, `ot.js:55-68`).

- [ ] **Step 4: Rodar** os dois arquivos → PASS. **Mutação P0:** troque o `site=` pelo nome do site (`s.nome`) na consulta e veja o teste do formato do link falhar (nome de site no link seria texto do n.ot no sino); desfaça.

- [ ] **Step 5: Commit e entrega do PR1a** — `git commit -m "feat(ot): aviso de obra e de aceite abre o site e o desvio certos (PR1a implantação e operação)"` com os quatro arquivos; `npx vitest run` dos arquivos dos Tasks 1.1 a 1.3 e `npx tsc --noEmit`; `cd frontend && npx vitest run` (o Task 1.3 toca `globals.js`); push `claude/ot-io-1a`; PR "n.ot: área e etapa do site, links profundos no servidor e no sino (PR1a)".

---

## PR1b — Vocabulário e links profundos na tela (Task 1.4)

Mesmo objetivo, contrato e "Pronto quando" do PR1a; só tela, relatório e E2E.

### Task 1.4: Tela — aba no endereço, régua de 4 etapas, rótulos

**Files:**
- Modify: `frontend/src/ot-navegacao.js:3-25`; `frontend/src/ot-comum.js:140`; `frontend/src/views/ot-relatorio.js:3,37` (importa `FASE`); `frontend/src/views/ot-base.js:10-11,40-51`; `frontend/src/views/ot-site.js:15-17,72-83`; `frontend/src/views/ot.js:33,72,78`; `frontend/src/views/painel.js:204-216,624-635`; `frontend/src/views/ot-sensores.js:7` (rótulo); `frontend/login.html:323`
- Modify: `frontend/test/ot-navegacao.test.js`, `frontend/test/ot-base.test.js`, `frontend/test/ot-site.test.js`, `frontend/test/painel-ot.test.js`, `frontend/test/ot-relatorio.test.js`; `frontend/e2e/ot.spec.js:43-47,119,124,205,434,501,521,552,604,627,665,741` (aba "Modo operação" → "Operação", "Modo projeto" → "Implantação", "Revisão e aprovação" segue como aba até o PR7, botão "Abrir Base" segue); `CHANGELOG.md` (Não publicado)

**Interfaces:**
- Consumes: `situacao.area`, `situacao.etapa`, `situacao.falta` (Task 1.1); `fazer[].site/aba`, `proximo.site` (Task 1.2).
- Produces: `lerEndereco()` devolve `{ tela, site, aba, desvio }` (sem `modo`); `escreverEndereco({ tela, site, aba })`; `AREA` e `ETAPAS_IMPLANTACAO` em `ot-comum.js`; `window.otTela(tela, site, aba, extra)`.

- [ ] **Step 1: Testes que falham** — `frontend/test/ot-navegacao.test.js` (substitui os casos de `modo`):

```js
it('lê e escreve a aba do site; aba desconhecida fica nula (a tela escolhe a primeira da área)', () => {
    expect(lerEndereco(loc('/ot', '?ot=site&site=s1&aba=desvios'))).toEqual({ tela: 'site', site: 's1', aba: 'desvios', desvio: null });
    expect(lerEndereco(loc('/ot', '?ot=site&site=s1&aba=<x>')).aba).toBeNull();
    const spy = vi.spyOn(history, 'replaceState');
    escreverEndereco({ tela: 'site', site: 's1', aba: 'revisar' }, loc('/ot'));
    expect(spy.mock.calls.at(-1)[2]).toBe('/ot?ot=site&site=s1&aba=revisar');
});
it('o endereço antigo com modo= ainda abre o site (modo é ignorado)', () => {
    expect(lerEndereco(loc('/ot', '?ot=site&site=s1&modo=operacao'))).toMatchObject({ tela: 'site', site: 's1', aba: null });
});
```

  `frontend/test/ot-base.test.js`: com `sit = { area: 'implantacao', etapa: 3, falta: ['Há 2 achado(s) em rascunho para revisar'], proximo_passo: 'revisar' }`, a régua tem 4 itens (`1. Cadastrar` … `4. Aprovar a base`), o item 3 tem `aria-current="step"` e o cartão "Para avançar" lista o texto de `falta`; com `area: 'operacao'` não há régua e o cabeçalho diz "Operação"; com `area: 'obra'` diz "Obra até dd/mm". Nenhum texto "Levantar → Revisar e aprovar → Base aprovada", "Modo projeto" nem "Modo operação" no DOM.
  `frontend/test/painel-ot.test.js`: clicar "Abrir" de um item `{ tela: 'ot', aba: 'revisar', site: 's1' }` chama `irPara('/ot?ot=site&site=s1&aba=revisar')`; sem `site`, `aba: 'desvios'` vai a `/ot?ot=sites`.

- [ ] **Step 2: Rodar** — `cd frontend && npx vitest run test/ot-navegacao.test.js test/ot-base.test.js test/ot-site.test.js test/painel-ot.test.js` → FAIL.

- [ ] **Step 3: Implementar.**
  - `ot-navegacao.js`:

```js
export const TELAS_OT = ['inicio', 'painel', 'sites', 'site', 'assessment', 'relatorios', 'fornecedores', 'acessos'];
const ABA = /^[a-z]{1,20}$/;
export function lerEndereco(loc = window.location) {
    const q = new URLSearchParams(loc.search || '');
    const m = /^\/ot\/desvios\/([^/]+)\/?$/.exec(loc.pathname || '');
    const desvio = m && ID.test(m[1]) ? m[1] : null;
    const site = ID.test(q.get('site') || '') ? q.get('site') : null;
    let tela = TELAS_OT.includes(q.get('ot')) ? q.get('ot') : 'inicio';
    if (tela === 'site' && !site) tela = 'sites';
    const aba = tela === 'site' && ABA.test(q.get('aba') || '') ? q.get('aba') : null;
    return { tela, site: tela === 'site' ? site : null, aba, desvio };
}
export function escreverEndereco({ tela, site = null, aba = null }, loc = window.location) {
    const q = new URLSearchParams(loc.search || '');
    ['ot', 'site', 'modo', 'aba'].forEach((k) => q.delete(k));
    if (tela && tela !== 'inicio') q.set('ot', tela);
    if (tela === 'site' && site) { q.set('site', site); if (aba) q.set('aba', aba); }
    const resto = q.toString();
    history.replaceState(history.state, '', `/ot${resto ? `?${resto}` : ''}`);
}
```

  - `ot-comum.js:140`: `export const AREA = { implantacao: 'Implantação', operacao: 'Operação', obra: 'Obra' };`, `export const ETAPAS_IMPLANTACAO = ['Cadastrar', 'Levantar', 'Revisar', 'Aprovar a base'];` e `export const areaDaFase = (f) => (f === 'em_operacao' ? 'operacao' : f === 'em_obra' ? 'obra' : 'implantacao');` (`FASE` sai; quem o importa — `ot-inicio.js:4`, `painel.js`, `ot-relatorio.js:3` — passa a usar `AREA[l.area]` mais ` · ${etapa}. ${ETAPAS_IMPLANTACAO[etapa-1]}` quando há etapa). O Relatório de conformidade (`ot-relatorio.js:37`) mostra a coluna "Área" com `AREA[areaDaFase(s.fase)]` (o servidor do relatório devolve só a `fase`): o documento formal usa o vocabulário novo; `frontend/test/ot-relatorio.test.js` cobra "Operação" no lugar de "Em operação".
  - `ot-base.js`: `cabecalhoDoSite` desenha a régua de `ETAPAS_IMPLANTACAO` com `sit.etapa` quando `sit.area !== 'operacao'` (`aria-label="Etapas da implantação"`), o cartão "Para avançar" com `sit.falta` (`<ul>` de textos escapados; vazio → o texto do `proximoPasso`) e, em operação, só "Operação desde dd/mm/aaaa". Os rótulos dos botões de `proximoPasso` trocam "Abrir Revisão e aprovação" por "Revisar" e "Abrir Modo operação" por "Abrir a operação".
  - `ot-site.js`: nesta etapa só os nomes: `MODOS` vira `[['projeto', 'Implantação'], ['operacao', 'Operação']]` e a sub-aba ativa vai para o endereço (`escreverEndereco({ tela: 'site', site, aba: sub })` no fim de `montarSite`); a chave `modo` sai do endereço (o modo é derivado da aba: aba de `SUBS.operacao` = operação). As abas que o Painel manda e que ainda não existem com esse nome são traduzidas: `const ALIAS_ABA = { revisar: 'aprovacao' };` (sai no PR7). PR7/PR8 reescrevem a tela inteira.
  - `ot.js`: `TITULOS.fornecedores = 'Fornecedores de OT'`; `escreverEndereco` com `aba: S.otSub`; `window.otTela = async (tela, site = null, aba = null, extra = {})` (os chamadores que passavam `modo` passam a aba: `'projeto'` → `null`, `'operacao'` → `'desvios'`).
  - `painel.js:634`: `if (tela === 'ot') { const SEM_SITE = { assessment: 'assessment', sondas: 'acessos', acessos: 'acessos' }; irPara(site ? `${enderecoDoProduto('ot')}?ot=site&site=${encodeURIComponent(site)}${aba ? `&aba=${encodeURIComponent(aba)}` : ''}` : `${enderecoDoProduto('ot')}?ot=${SEM_SITE[aba] || 'sites'}`); return; }` (sem site, `desvios`, `revisar`, `base` e `implantacao` vão à lista Sites até o PR5, que troca o mapa pelas telas novas) e os botões de `listaFazer` (`:112`) e `regua` (`:137`) passam `i.site || null` como quarto argumento (`painelAbrir(tela, aba, filtro, site)`). `quadroPorSite` (`:212-213`) mostra a coluna "Área" com `AREA[l.area]` e a etapa.
  - `login.html:323` e `ot-sensores.js:7`: "Fornecedores de OT"; o rótulo da origem da sonda na tela passa a "Sonda de rede" (a constante que compara a evidência gravada não muda).

- [ ] **Step 4: Rodar a suíte inteira do frontend, o build e o E2E** — `cd frontend && npx vitest run && npm run build && npx playwright test e2e/ot.spec.js` → verde e `✓ built in`.

- [ ] **Step 5: CHANGELOG** — em "Não publicado": "n.ot: o site está em Implantação (1 Cadastrar, 2 Levantar, 3 Revisar, 4 Aprovar a base), Operação ou Obra; a aba do site fica no endereço; os itens do Painel, a jornada e os avisos de obra e de aceite abrem o site e a aba exatos."

- [ ] **Step 6: Commit e entrega** — `git add` dos arquivos do task; `git commit -m "feat(ot): régua de 4 etapas, aba no endereço e links profundos na tela (PR1b implantação e operação)"`; `git push -u origin claude/ot-io-1b`; `gh pr create --title "n.ot: vocabulário Implantação/Operação e links profundos na tela (PR1b)"` com o resumo, os testes rodados e as linhas de atribuição. O dono roda `bash scripts/ci/ship.sh <PR>`.

---

## PR2 — Papéis coerentes tela × servidor

**Objetivo:** a tela lê do servidor o que a pessoa pode (`GET /ot/permissoes`); o Gestor ARCiber da organização direta vê os botões dele; o cliente leitor só lê Painel, Assessment e Relatórios, no servidor e na tela. **Sem migration.** **Contrato:** rota nova `GET /ot/permissoes` (sem corpo: OpenAPI sem diff; `contrato-tela-api` passa a ver o literal); leitor recebe 403 em toda rota do n.ot fora de `ROTAS_DO_LEITOR`. **P0:** a rota fica dentro do `otApp` (agente e chave de API: 403); só booleanos, nenhum id. **Pronto quando:** nenhum arquivo da tela do n.ot decide papel por `S.user.role` (só `ot-comum.js` lendo `permissoes`); o `client` com `ot` recebe 403 em `/ot/sites`, `/ot/desvios`, `/ot/ativos` e 200 em `/ot/assessment`, `/ot/indicadores`, `/ot/relatorio/conformidade`. **Riscos:** um `client` que hoje abre Sites perde a tela (decisão 4); a primeira tela depois do login passa a esperar uma chamada a mais (um GET pequeno, em paralelo com o primeiro desenho).

### Task 2.1: `GET /ot/permissoes` **[P0] [revisor opus]**

**Files:**
- Create: `src/services/ot-permissoes.ts`; `test/ot-permissoes.test.ts`
- Modify: `src/routes/ot.ts` (rota nova antes de `// ─── sites`, `:131`; `ehGestorArciber` sobe de `:820-824` para o topo, junto de `contexto`)

**Interfaces:**
- Produces: `permissoesOt(db, user, projectId): Promise<Permissoes>`; `type Permissoes = { editar: boolean; criar_lote: boolean; aprovar_lote: boolean; ver_sondas: boolean; gestor: boolean; leitor: boolean; tecnico: boolean; acao_corretiva: boolean; tela_inicial: 'painel' | 'implantacao' }`.

- [ ] **Step 1: Teste que falha** — `test/ot-permissoes.test.ts` (no molde de `test/ot-tecnico.test.ts:25-42`: `seedTwoProjects`, `habilitarOt('proj-a')`, contas `org_admin`, `org_user`, `client`, consultor designado e um `consultoria_admin` de organização direta com o cargo Gestor ARCiber em `project_governance`, todos com `ot`):

```ts
const permissoes = async (h: H) => { const r = await chamar(h, 'GET', `${P}/permissoes`); expect(r.status).toBe(200); return r.json<Record<string, unknown>>(); };

it('Gestor (org_admin): decide; consultor: edita e aprova lote, não é Gestor', async () => {
  expect(await permissoes(gestor)).toMatchObject({ gestor: true, editar: true, aprovar_lote: true, leitor: false, tecnico: false });
  expect(await permissoes(cons)).toMatchObject({ gestor: false, editar: true, aprovar_lote: true, ver_sondas: true });
});
it('admin direto no cargo de Gestor ARCiber: gestor true (a tela hoje esconde os botões dele)', async () => {
  expect(await permissoes(direto)).toMatchObject({ gestor: true, editar: true });
});
it('técnico e leitor', async () => {
  expect(await permissoes(tec)).toMatchObject({ tecnico: true, editar: false, criar_lote: true, aprovar_lote: false, tela_inicial: 'painel' });
  expect(await permissoes(cli)).toMatchObject({ leitor: true, editar: false, criar_lote: false, tela_inicial: 'painel' });
});
it('tela inicial: Implantação enquanto nenhum site opera; Painel depois', async () => {
  expect((await permissoes(cons)).tela_inicial).toBe('implantacao');
  await env.DB.prepare(`UPDATE ot_sites SET fase = 'em_operacao' WHERE id = ?`).bind(ids.s1).run();
  expect((await permissoes(cons)).tela_inicial).toBe('painel');
});
it('leitor alinhado com o Painel: org_admin de OUTRO projeto (papel de cliente, não Gestor deste) é leitor', async () => {
  expect(ehLeitorOt({ role: 'org_admin', client_project_id: 'proj-b' }, 'proj-a')).toBe(true);
  expect(ehLeitorOt({ role: 'org_admin', client_project_id: 'proj-a' }, 'proj-a')).toBe(false);
  expect(ehLeitorOt({ role: 'org_user', client_project_id: 'proj-a' }, 'proj-a')).toBe(false);
});
it('acao_corretiva só com o n.iso no projeto', async () => { expect((await permissoes(cons)).acao_corretiva).toBe(false); });
it('P0-2: agente e chave de API, 403; sem ot na pessoa, 403', async () => {
  for (const h of [agenteH, apiKeyH, semOtH]) expect((await chamar(h, 'GET', `${P}/permissoes`)).status).toBe(403);
});
it('só booleanos e a tela inicial: nenhum id, e-mail ou nome', async () => {
  const { tela_inicial, ...resto } = await permissoes(gestor);
  expect(typeof tela_inicial).toBe('string');
  for (const [k, v] of Object.entries(resto)) expect(typeof v, k).toBe('boolean');
});
```

- [ ] **Step 2: Rodar** — `npx vitest run test/ot-permissoes.test.ts` → FAIL (404).

- [ ] **Step 3: Implementar** — `src/services/ot-permissoes.ts`:

```ts
import { ehPapelCliente } from '../helpers';
import { modulosDoProjeto } from '../modulos';
import { gestorArciberDireto, podeCriarLote, podeEditarOt, podeVerCompleto, sitesPermitidos, type AtorOt } from './ot-inventario';

/** O leitor do n.ot (spec 2026-11-26 §6): a mesma regra do Painel (`painel-ot.ts:38`): papel de cliente (`PAPEIS_CLIENTE`, helpers.ts:205)
 *  que não é o Gestor ARCiber do projeto (org_admin dele) nem o técnico. Síncrona: serve também o middleware. */
export const ehLeitorOt = (u: { role: string; client_project_id?: string | null }, projectId: string) =>
  ehPapelCliente(u) && u.role !== 'org_user' && !(u.role === 'org_admin' && u.client_project_id === projectId);

export type Permissoes = { editar: boolean; criar_lote: boolean; aprovar_lote: boolean; ver_sondas: boolean; gestor: boolean; leitor: boolean;
  tecnico: boolean; acao_corretiva: boolean; tela_inicial: 'painel' | 'implantacao' };

/** Spec 2026-11-26 §6: a tela não recalcula papel; lê isto. Mesmas funções das rotas (ehGestorArciber = org_admin do projeto ou admin direto no cargo). */
export async function permissoesOt(db: D1Database, u: AtorOt & { client_project_id?: string | null }, projectId: string): Promise<Permissoes> {
  const editar = podeEditarOt(u);
  const sites = await sitesPermitidos(db, u, projectId);
  const [completo, direto, mods, opera] = await Promise.all([
    podeVerCompleto(db, u, projectId), gestorArciberDireto(db, u, projectId), modulosDoProjeto(db, projectId),
    db.prepare(`SELECT 1 AS x FROM ot_sites WHERE project_id = ? AND status = 'ativo' AND fase = 'em_operacao' AND id IN (SELECT value FROM json_each(?)) LIMIT 1`).bind(projectId, sites).first(),
  ]);
  const gestor = (u.role === 'org_admin' && u.client_project_id === projectId) || direto;
  return { editar, criar_lote: podeCriarLote(u), aprovar_lote: completo, ver_sondas: completo, gestor, leitor: ehLeitorOt(u, projectId), tecnico: u.role === 'org_user',
    acao_corretiva: editar && mods.includes('iso'), tela_inicial: editar && !opera ? 'implantacao' : 'painel' };
}
```

  Em `src/routes/ot.ts`, antes de `// ─── sites`: `otApp.get('/permissoes', async (c) => { try { const { db, user, projectId } = await contexto(c); return c.json(await permissoesOt(db, user, projectId)); } catch (e) { return erro500(c, 'Falha ao ler as permissões do n.ot', e); } });`. `ehGestorArciber` passa a chamar a mesma regra (`(await permissoesOt(...)).gestor` não: mantenha a função atual, só a mova para cima; o teste cobra que as duas concordam).

- [ ] **Step 4: Rodar** — `npx vitest run test/ot-permissoes.test.ts test/ot-modulo.test.ts test/contrato-tela-api.test.ts test/contrato-isolamento-org.test.ts` → PASS; `npx tsc --noEmit` limpo.

- [ ] **Step 5: Mutação P0** — em `permissoesOt`, troque `podeVerCompleto` por `async () => true` em `aprovar_lote`; o teste do técnico falha; desfaça.

- [ ] **Step 6: Commit** — `git commit -m "feat(ot): GET /ot/permissoes, o que a pessoa pode no n.ot pela regra do servidor (PR2 implantação e operação)"`.

### Task 2.2: Leitor só lê Painel, Assessment e Relatórios **[P0] [revisor opus]**

**Files:**
- Modify: `src/routes/ot.ts:44-53` (middleware novo logo depois do guarda de escrita), `:755-760` (`GET /assessment` sem `subsidio` para o leitor); `src/routes/ot-saidas.ts:31-36` (`GET /indicadores` sem `por_zona` para o leitor); `src/services/painel-ot.ts:38` (o papel `leitor` passa a usar `ehLeitorOt`)
- Create: `test/ot-leitor.test.ts`

**Interfaces:**
- Produces: `ROTAS_DO_LEITOR` (regex, exportada de `src/services/ot-inventario.ts`, ao lado de `ESCRITAS_DO_TECNICO`).

- [ ] **Step 1: Teste que falha** — `test/ot-leitor.test.ts` (mesmas contas do Task 2.1, um site com ativo e um desvio criados por SQL):

```ts
const LE = ['/requisitos', '/assessment', '/conformidade', '/indicadores', '/relatorio/conformidade', '/permissoes'];
const NAO = ['/sites', '/zonas', '/ativos', '/fluxos', '/desvios', '/desvios?contagem=1', '/lotes', '/levantamentos', '/achados?site_id=s1', '/acessos',
  '/referencias', '/fornecedores', '/sensores/pontos', '/sites/s1/situacao', '/sites/s1/sensores', '/agente', '/roteiro'];
it('leitor (client com ot): 200 no que é dele', async () => { for (const p of LE) expect((await chamar(cli, 'GET', P + p)).status, p).toBe(200); });
it('leitor: 403 em todo o resto, sem nome de site no corpo', async () => {
  for (const p of NAO) { const r = await chamar(cli, 'GET', P + p); expect(r.status, p).toBe(403); expect(await r.text()).not.toContain('SE Norte'); }
});
it('leitor: nada de inventário nas rotas que lê (por_zona tem nome e id de zona e site; subsidio, respostas de levantamento por site)', async () => {
  const ind = await (await chamar(cli, 'GET', `${P}/indicadores`)).json<Record<string, unknown>>();
  expect(ind).not.toHaveProperty('por_zona');
  expect(ind).toHaveProperty('por_nivel');
  const ass = await (await chamar(cli, 'GET', `${P}/assessment`)).json<{ itens: Record<string, unknown>[] }>();
  for (const i of ass.itens) expect(i).not.toHaveProperty('subsidio');
  expect(JSON.stringify(ass)).not.toContain('SE Norte');
});
it('Gestor, consultor e técnico seguem como antes', async () => {
  for (const h of [gestor, cons, tec]) expect((await chamar(h, 'GET', `${P}/sites`)).status).toBe(200);
});
```

- [ ] **Step 2: Rodar** — `npx vitest run test/ot-leitor.test.ts` → FAIL (200 em `/sites`).

- [ ] **Step 3: Implementar** — em `src/services/ot-inventario.ts`, depois de `ESCRITAS_DO_TECNICO` (`:34-35`):

```ts
/** Spec 2026-11-26, decisão 4: o cliente leitor (`client`) lê só o resumo da organização; site, desvio e inventário ficam fora. */
export const ROTAS_DO_LEITOR = /^\/(requisitos|assessment|conformidade|indicadores|relatorio\/conformidade|permissoes)$/;
```

  e em `src/routes/ot.ts`, depois do guarda de escrita (`:53`):

```ts
otApp.use('*', async (c, next) => {
  if (ehLeitorOt(c.get('user'), c.req.param('projectId')!) && !(c.req.method === 'GET' && ROTAS_DO_LEITOR.test(c.req.path.replace(/^.*?\/ot(?=\/)/, '')))) {
    return c.json({ error: 'Forbidden: o seu papel lê o Painel, o Assessment e os Relatórios do n.ot' }, 403);
  }
  await next();
});
```

  (O middleware do `otApp` vale também para `otSaidasApp` e `otDeparaApp`, montados no mesmo prefixo em `src/index.ts:500-504`; o teste cobra `/indicadores`, que é do `otSaidasApp`.) Nas rotas que o leitor lê, corte o que é inventário: em `/indicadores`, `const { por_zona: _z, ...r } = await indicadoresOt(...)` para o leitor (fica `por_nivel`); em `/assessment`, `itens.map(({ subsidio: _s, ...i }) => i)` para o leitor. `painel-ot.ts:38` passa a `ehLeitorOt(ator, projectId) ? 'leitor'` (mesmo resultado de hoje, uma regra só).

- [ ] **Step 4: Rodar** — `npx vitest run test/ot-leitor.test.ts test/ot-tecnico.test.ts test/ot-inventario.test.ts test/ot-desvio-rotas.test.ts test/ot-saidas.test.ts test/ot-avaliacao.test.ts` → PASS. Se algum teste existente lê `/ot/sites` com `client`, ele travava o comportamento antigo: troque a expectativa para 403 e cite a decisão 4 no comentário.

- [ ] **Step 5: Mutação P0** — troque `c.req.method === 'GET' && ROTAS_DO_LEITOR.test(...)` por `c.req.method === 'GET'` (o leitor passa em qualquer GET); o teste de `/desvios` falha; desfaça.

- [ ] **Step 6: Commit** — `git commit -m "feat(ot): o cliente leitor lê só Painel, Assessment e Relatórios do n.ot (PR2 implantação e operação)"`.

### Task 2.3: Tela lê as permissões do servidor

**Files:**
- Modify: `frontend/src/ot-comum.js:13-27`; `frontend/src/views/ot.js:37-82`; `frontend/src/views/ot-desvios.js:18,56-60`; `frontend/src/views/ot-integracao.js:22`; `frontend/src/views/ot-assessment.js:24,100`; `frontend/src/views/ot-base.js:40`; `frontend/src/views/ot-site.js:83`; `frontend/src/views/ot-inicio.js:98`; `frontend/src/produto.js:464-469`
- Modify: `frontend/src/views/ot-saidas.js:20-26` (o leitor não pede `/ot/sites`)
- Modify: `frontend/test/ot-modulo.test.js`, `ot-desvios.test.js`, `ot-assessment.test.js`, `ot-integracao.test.js`, `ot-base.test.js`, `ot-site.test.js`, `ot-inicio.test.js`, `produto.test.js`, `ot-relatorio.test.js` (ou o teste das saídas)

**Interfaces:**
- Consumes: `GET /api/v1/projects/:id/ot/permissoes` (Task 2.1).
- Produces: em `ot-comum.js`: `carregarPermissoes(projectId): Promise<Permissoes>` (guarda em `S.otPermissoes = { projeto, ...p }`; falha fechada: tudo `false`, `leitor: true`, `tela_inicial: 'painel'`), `pode(chave): boolean`; `podeEditarOt`, `podeCriarLote`, `podeAprovarOt`, `ehGestor` passam a ler `pode('editar')`, `pode('criar_lote')`, `pode('aprovar_lote')`, `pode('gestor')`.

- [ ] **Step 1: Testes que falham** — `frontend/test/ot-desvios.test.js`: com `/ot/permissoes` respondendo `{ gestor: true, editar: true, aprovar_lote: true, acao_corretiva: false, … }` e `S.user.role = 'consultoria_admin'`, a linha do desvio aberto tem "Aceitar temporariamente" e **não** tem "Criar ação corretiva". `frontend/test/ot-modulo.test.js`: com `leitor: true`, o menu esconde Sites e Acessos (`#nav-ot-sites`, `#nav-ot-acessos` com `hidden`) e nenhuma chamada a `/ot/sites` é feita (o mock de `api` lança se a URL tiver `/ot/sites`). Com a leitura de permissões falhando (500), nenhum botão de escrita aparece. **Leitor:** abrir `/ot` (sem `?ot=`) ou `/ot?ot=inicio` ou `/ot?ot=sites` desenha o Painel, sem chamar `/ot/lotes`, `/ot/desvios` nem `/ot/sites` (o Início de hoje os chama, `ot-inicio.js:75-79`, e eles viram 403 neste PR); Relatórios desenha com `/indicadores` e `/conformidade` sem pedir `/ot/sites` (`ot-saidas.js:24`).

- [ ] **Step 2: Rodar** — `cd frontend && npx vitest run test/ot-desvios.test.js test/ot-modulo.test.js` → FAIL.

- [ ] **Step 3: Implementar** — `ot-comum.js`:

```js
const NADA = { editar: false, criar_lote: false, aprovar_lote: false, ver_sondas: false, gestor: false, leitor: true, tecnico: false, acao_corretiva: false, tela_inicial: 'painel' };
/** Spec 2026-11-26 §6: o que a pessoa pode vem do servidor (GET /ot/permissoes); a tela não recalcula papel. Falha fechada. */
export async function carregarPermissoes(projectId) {
    if (S.otPermissoes?.projeto === projectId) return S.otPermissoes;
    let p = NADA;
    try { p = { ...NADA, ...(await api('GET', `/api/v1/projects/${projectId}/ot/permissoes`)) }; } catch { /* falha fechada */ }
    S.otPermissoes = { projeto: projectId, ...p };
    return S.otPermissoes;
}
export const pode = (chave) => !!(S.otPermissoes && S.otPermissoes[chave]);
export const ehGestor = () => pode('gestor');
export const podeEditarOt = () => pode('editar');
export const podeCriarLote = () => pode('criar_lote');
export const podeAprovarOt = () => pode('aprovar_lote');
```

  `podeRevelar` fica (é por `platform_admin` + `mascarado`, que a API decide). Em `renderOt` (`ot.js:37`), `await carregarPermissoes(proj().id)` antes de escolher a tela, e `S.otPermissoes = null` na troca de projeto (`ot.js:45`). `ot-desvios.js:18` sai (usa `ehGestor`); "Criar ação corretiva" só com `pode('acao_corretiva')`. `ot-inicio.js:98` passa `podeAprovar: podeAprovarOt()` (o recorte do `consultoria_admin` some: vale o servidor). `atualizarItemOt` (`produto.js:464-469`) esconde Início, Sites e Fornecedores com `pode('leitor')`. Em `renderOt`, depois de carregar as permissões: `if (pode('leitor') && !['painel', 'assessment', 'relatorios'].includes(S.otTela)) S.otTela = 'painel';` (cobre o padrão `inicio` de `ot-navegacao.js:12` e o de `ot.js:50,67,70`). `montarSaidas` não pede `/ot/sites` quando `pode('leitor')` (`sites = []`; a coluna de site das saídas some para ele).

- [ ] **Step 4: Rodar a suíte inteira do frontend, o build e o E2E** — `cd frontend && npx vitest run && npm run build && npx playwright test e2e/ot.spec.js`.

- [ ] **Step 5: Commit e entrega** — CHANGELOG ("n.ot: a tela mostra a cada pessoa o que o servidor permite; o Gestor ARCiber da organização direta passa a ver aprovar base, obra e aceite; o cliente leitor vê Painel, Assessment e Relatórios."); `git commit -m "feat(ot): a tela do n.ot lê as permissões do servidor (PR2 implantação e operação)"`; push `claude/ot-io-2`; PR "n.ot: papéis coerentes entre tela e servidor (PR2)".

---

## PR3a — Tudo por lote no servidor (sem tirar rotas)

**Objetivo:** o servidor passa a alterar e remover ativo e fluxo por lote (`alvo_id`, `remover`), a mostrar o nome do alvo no lote, a exigir ativo para a base (decisão 2) e a travar zona fora da Implantação e da Obra (decisão 3). As rotas de escrita direta **ainda existem** (saem no PR3c, depois de a tela parar de usá-las no PR3b). **Sem migration** (`alvo_id` e `remover` vão no JSON do item; o CHECK de `ot_lote_itens.dados`, `migrations/0092_ot_coleta.sql:37`, só exige objeto JSON e IP/MAC cifrados). **Contrato:** o achado aceita `alvo_id` e `remover`; `GET /lotes/:id` ganha `nomes_alvos`; `POST /sites/:id/base/pedir` dá 409 sem ativo; rotas de zona dão 409 em operação e com a base em aprovação. OpenAPI: só muda se o esquema do achado mudar de forma (rode `npm run openapi` e commite o que mudar). **P0:** `alvo_id` só vale para ativo/fluxo do **site do lote** (P0-4/P0-5: id de outro site dá o mesmo desfecho de id inexistente); o agente de coleta não manda `alvo_id`/`remover`; `nomes_alvos` só do site do lote; remoção não carimba verificação; trilha só com ids. **Pronto quando:** `test/ot-tudo-por-lote.test.ts`, `test/ot-zona-trava.test.ts` e os testes de fase verdes; os 9 arquivos de teste que preparavam inventário pela rota direta usam o ajudante. **Riscos:** largura do Task 3a.1 (fixtures); números do 4.3.1 em `test/ot-saidas.test.ts` mudam porque o lote carimba a verificação.

### Task 3a.1: Ajudante de teste que cria inventário por lote

**Files:**
- Create: `test/helpers/ot.ts`
- Modify (só as preparações): `test/ot-agente-mcp.test.ts`, `test/ot-coleta.test.ts`, `test/ot-inventario.test.ts`, `test/ot-levantamento.test.ts`, `test/ot-levantamento-l2.test.ts`, `test/ot-rede.test.ts`, `test/ot-saidas.test.ts`, `test/ot-stepup.test.ts` (os 8 que hoje chamam `criar(…, 'ativos'|'fluxos', …)`; os testes da própria rota direta ficam para o PR3c)

**Interfaces:**
- Produces: `inventarioPorLote(chamar, { autor, decisor, site, itens, projeto? }): Promise<string[]>` (ids gravados, na ordem de `itens`); `itens: { entidade?: 'ativo' | 'fluxo'; dados: Record<string, unknown> }[]`.

- [ ] **Step 1: Escrever o ajudante** — `test/helpers/ot.ts`:

```ts
import { expect } from 'vitest';
type H = Record<string, string>;
type Chamar = (h: H, metodo: string, caminho: string, corpo?: unknown) => Promise<Response>;
type Item = { entidade?: 'ativo' | 'fluxo'; dados: Record<string, unknown> };

/**
 * Spec 2026-11-26, decisão 3: inventário só entra por lote decidido por outra pessoa. Vai pelo achado, como a tela (o lote manual não
 * aceita fluxo: a entidade só vem do achado, `criarLote`, `src/services/ot-coleta.ts:187-191`).
 * - UM lote por chamada (teto de 20 lotes por dia por pessoa, `ot-coleta.ts:17,196`): junte os ativos de uma preparação numa chamada;
 *   fluxo cujas pontas são ativos novos vai numa segunda chamada (a ponta precisa existir quando o achado é registrado).
 * - `dados` sem `site_id` (o site é o do levantamento; `site_id` no item é "campo não aceito").
 * - O `decisor` precisa ver completo e não ser o autor (Gestor do projeto ou outro consultor designado; platform_admin não decide).
 * - Item completo no 4.3.1 sai VERIFICADO (a aprovação carimba): diferente da rota direta, que deixava "não verificado".
 */
export async function inventarioPorLote(chamar: Chamar, o: { autor: H; decisor: H; site: string; itens: Item[]; projeto?: string }) {
  const P = `/api/v1/projects/${o.projeto ?? 'proj-a'}/ot`;
  const ok = async (r: Promise<Response>, status: number) => { const x = await r; expect(x.status, await x.clone().text()).toBe(status); return x.json<Record<string, unknown>>(); };
  const lev = await ok(chamar(o.autor, 'POST', `${P}/levantamentos`, { site_id: o.site, tipo: 'visita', realizado_em: '2026-11-26' }), 201);
  const achados: string[] = [];
  for (const i of o.itens) achados.push(String((await ok(chamar(o.autor, 'POST', `${P}/levantamentos/${lev.id}/achados`,
    { entidade: i.entidade ?? 'ativo', dados: i.dados, evidencia: 'preparação do teste' }), 201)).id));
  const lote = await ok(chamar(o.autor, 'POST', `${P}/levantamentos/${lev.id}/enviar`, { achados }), 201);
  await ok(chamar(o.decisor, 'POST', `${P}/lotes/${lote.id}/aprovar`), 200);
  const lido = await ok(chamar(o.decisor, 'GET', `${P}/lotes/${lote.id}`), 200) as { itens: { linha: number; registro_id: string; decisao: string }[] };
  expect(lido.itens.every((x) => x.decisao === 'gravado'), JSON.stringify(lido.itens)).toBe(true);
  return [...lido.itens].sort((a, b) => a.linha - b.linha).map((x) => x.registro_id);
}
```

- [ ] **Step 2: Trocar as preparações** — em cada arquivo, os `criar(h, 'ativos', {...})` seguidos viram uma chamada `inventarioPorLote(chamar, { autor, decisor, site, itens })` (tire `site_id` de `dados`), e os `criar(h, 'fluxos', {...})`, uma segunda. Casos especiais:
  - `test/ot-saidas.test.ts:65-74`: o projeto B é preparado pelo `platform_admin` (`:70,74`), que não decide lote. Crie no `beforeAll` um `org_admin` de `proj-b` com `ot` (`concederModulos`) e use-o como decisor com `projeto: 'proj-b'`. Os números do 4.3.1 (completos, verificados) passam a contar a verificação carimbada: ajuste as expectativas e cite esta linha no comentário.
  - Ativo de teste que precisa ficar "não verificado": crie-o incompleto (`no_arciber: false`) ou zere a verificação por SQL no teste, dizendo por quê.
- [ ] **Step 3: Rodar os 9 arquivos** — verdes **com as rotas antigas ainda no lugar** (o ajudante não depende delas).
- [ ] **Step 4: Commit** — `git commit -m "test(ot): ajudante que cria inventário por achado e lote nos testes (PR3a implantação e operação)"`.

### Task 3a.2: `alvo_id` e `remover` no achado e no lote **[P0] [revisor opus]**

**Files:**
- Modify: `src/services/ot-coleta.ts` (`CAMPOS_ITEM`/`FORMA` e `prepararItem` `:118-148`, em especial o "nome obrigatório" de `:133`; `criarLote` `:190-226`, o `duplicata_de` de `:213-219`; `aprovarLote` `:266-383`, a trava P1-4 de `:320`); `src/services/ot-fluxo-achado.ts:42-64` (`prepararFluxo`, a exigência de pontas de `:61-62`); `src/services/ot-levantamento.ts:80-103` (`enviarAoLote` leva `alvo_id`/`remover` ao bruto); `src/services/ot-agente.ts:142` (recusa); `src/routes/ot.ts:483-484` (trilha)
- Create: `test/ot-tudo-por-lote.test.ts`; Modify: `test/ot-agente-mcp.test.ts`

**Interfaces:**
- Produces: item de achado/lote com `alvo_id?: string` (ativo ou fluxo ativo do site do lote) e `remover?: true` (exige `alvo_id`); `aprovarLote` devolve também `removidos: number`.

- [ ] **Step 1: Testes que falham** — `test/ot-tudo-por-lote.test.ts` (contas como em `test/ot-tecnico.test.ts:25-42`; `lote(h, site, itens)` cria levantamento, achados e envia, como o ajudante, e devolve o id do lote; `aprovar` e `item0` sobre `POST /lotes/:id/aprovar` e `GET /lotes/:id`):

```ts
const ATIVO_431 = { no_arciber: true, categoria_arciber: 'centro_operacao', tipo_dispositivo: 'RTU', fabricante: 'F', funcao: 'telecontrole',
  ip: '10.9.0.1', protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }], firmware_so_versao: '1.0' };

it('alterar por alvo_id: renomear ativo sem IP nem MAC atualiza o MESMO ativo (o índice por nome não casaria; P1-4 não devolve "alvo mudou")', async () => {
  const [id] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'RTU 1', fabricante: 'F', modelo: 'M' } }] });
  const l = await lote(cons, ids.s1, [{ dados: { alvo_id: id, nome: 'RTU 1 renomeada' } }]);
  expect((await item0(gestor, l)).duplicata_de).toBe(id);
  await aprovar(gestor, l);
  expect((await (await chamar(cons, 'GET', `${P}/ativos/${id}`)).json<{ nome: string }>()).nome).toBe('RTU 1 renomeada');
});
it('alterar por alvo_id sem nome: não é erro (o nome é o do alvo)', async () => {
  const [id] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'IED 2' } }] });
  expect((await item0(gestor, await lote(cons, ids.s1, [{ dados: { alvo_id: id, funcao: 'proteção' } }]))).erros).toEqual([]);
});
it('4.3.1: alteração que toca campo do 4.3.1 sem recoletar zera a verificação; com todos os campos recoletados, carimba', async () => {
  const [id] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'RTU V', ...ATIVO_431 } }] });
  const verificado = async () => (await env.DB.prepare('SELECT verificado_por FROM ot_ativos WHERE id = ?').bind(id).first<{ verificado_por: string | null }>())!.verificado_por;
  expect(await verificado()).not.toBeNull();
  await aprovar(gestor, await lote(cons, ids.s1, [{ dados: { alvo_id: id, firmware_so_versao: '2.0' } }]));
  expect(await verificado()).toBeNull();
  await aprovar(gestor, await lote(cons, ids.s1, [{ dados: { alvo_id: id, ...ATIVO_431, firmware_so_versao: '2.0' } }]));
  expect(await verificado()).not.toBeNull();
});
it('remover: o ativo sai das listas só depois do lote aprovado por outra pessoa', async () => {
  const [id] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'Switch velho' } }] });
  const l = await lote(cons, ids.s1, [{ dados: { alvo_id: id, remover: true } }]);
  expect((await chamar(cons, 'GET', `${P}/ativos/${id}`)).status).toBe(200);
  expect((await chamar(cons, 'POST', `${P}/lotes/${l}/aprovar`)).status).toBe(403);
  expect((await aprovar(gestor, l)).removidos).toBe(1);
  expect((await chamar(cons, 'GET', `${P}/ativos/${id}`)).status).toBe(404);
});
it('P0-4: alvo_id de ativo de OUTRO site tem o mesmo desfecho de id inexistente', async () => {
  const [outro] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s2, itens: [{ dados: { nome: 'Do outro site' } }] });
  const [r1, r2] = [await lote(cons, ids.s1, [{ dados: { alvo_id: outro, remover: true } }]), await lote(cons, ids.s1, [{ dados: { alvo_id: 'nao-existe', remover: true } }])];
  const [i1, i2] = [await item0(gestor, r1), await item0(gestor, r2)];
  expect([i1.erros, i1.duplicata_de]).toEqual([i2.erros, i2.duplicata_de]);
  expect((await aprovar(gestor, r1)).removidos).toBe(0);
  expect((await chamar(cons, 'GET', `${P}/ativos/${outro}`)).status).toBe(200);
});
it('remover sem alvo_id é erro do item', async () => {
  expect((await item0(gestor, await lote(cons, ids.s1, [{ dados: { remover: true } }]))).erros[0]).toMatchObject({ campo: 'alvo_id' });
});
it('fluxo: alterar por alvo_id sem repetir as pontas; remover por alvo_id', async () => {
  const [a1, a2] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ dados: { nome: 'A' } }, { dados: { nome: 'B' } }] });
  const [f] = await inventarioPorLote(chamar, { autor: cons, decisor: gestor, site: ids.s1, itens: [{ entidade: 'fluxo', dados: { origem_ativo_id: a1, destino_ativo_id: a2, protocolo: 'Modbus' } }] });
  await aprovar(gestor, await lote(cons, ids.s1, [{ entidade: 'fluxo', dados: { alvo_id: f, porta: 502 } }]));
  await aprovar(gestor, await lote(cons, ids.s1, [{ entidade: 'fluxo', dados: { alvo_id: f, remover: true } }]));
  expect((await (await chamar(cons, 'GET', `${P}/fluxos`)).json<{ fluxos: { id: string }[] }>()).fluxos.map((x) => x.id)).not.toContain(f);
});
```

  Em `test/ot-agente-mcp.test.ts`: `registrar_achados` com `dados: { alvo_id: 'x', nome: 'Y' }` e com `dados: { remover: true }` volta em `recusados` com `motivo: 'campo não aceito pelo agente'`, a mesma resposta de `zona` (o caso de `zona` já existe no arquivo: siga o molde).

- [ ] **Step 2: Rodar** — `npx vitest run test/ot-tudo-por-lote.test.ts test/ot-agente-mcp.test.ts` → FAIL (`campo não aceito: alvo_id`).

- [ ] **Step 3: Implementar.**
  - `prepararItem`: aceite `alvo_id` (`z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)`) e `remover` (`z.literal(true)`). Com `alvo_id`, o "nome obrigatório" (`:133`) não vale. Com `remover`: exige `alvo_id` (senão `{ campo: 'alvo_id', motivo: 'obrigatório para remover' }`), não checa o 4.3.1, e `dados = { alvo_id, remover: 1 }` (nada mais).
  - `prepararFluxo`: o mesmo par; com `alvo_id`, a exigência de pontas (`:61-62`) não vale (o UPDATE nunca grava pontas).
  - `criarLote` (`:213`): `const dup = dados.alvo_id ? (entidade === 'fluxo' ? (fluxos ?? []).find((f) => f.id === dados.alvo_id) : ativos.results.find((a) => a.id === dados.alvo_id)) : entidade === 'fluxo' ? idxF.achar(dados) : idx.achar(dados);` — o alvo de outro site não está em `ativos`/`fluxos` (lidos só do site), então `duplicata_de` fica nulo, como para id inexistente. Com `alvo_id` que não achou, acrescente o erro `{ campo: 'alvo_id', motivo: 'registro não encontrado neste site' }` (mesma mensagem nos dois casos). `fluxos` precisa ser lido também quando há item de fluxo com `alvo_id` (já é: `entidades.includes('fluxo')`).
  - `aprovarLote`: alvo do ativo = `d.alvo_id ? ativos.results.find((a) => a.id === d.alvo_id) : idx.achar(d)` (a trava P1-4 de `:320` segue igual: `alvo.id === i.duplicata_de` e o `updated_at`); o mesmo para fluxo com `fluxos`. **Alvo que sumiu entre a criação do lote e a aprovação:** fluxo com `alvo_id` sem alvo ativo no site → `recusar(i, FLUXO_SUMIU)` ("O fluxo foi removido depois do envio; registre de novo se ainda vale"), nunca o ramo do `INSERT` (o CHECK de `ot_fluxos` recusaria as pontas vazias e o lote ficaria preso em `gravando`); ativo com `alvo_id` sem alvo ativo → `recusar(i, ALVO_INEXISTENTE)` em vez de voltar a pendente com "alvo mudou" para sempre. Testes: "fluxo com alvo_id removido antes da aprovação: item recusado, lote conclui" e o mesmo para ativo. Remoção, logo depois do `if (erros) recusar`:

```ts
    if (d.remover) {
      const tabela = i.entidade === 'fluxo' ? 'ot_fluxos' : 'ot_ativos';
      // P0-4: só do site do lote; outro site ou inexistente dá o mesmo desfecho. Não carimba verificação.
      stmts.push([db.prepare(`UPDATE ${tabela} SET status = 'removido', updated_at = ${AGORA_MS} WHERE id = ? AND project_id = ? AND site_id = ? AND status = 'ativo'`)
        .bind(d.alvo_id, projectId, lote.site_id),
      db.prepare(`UPDATE ot_lote_itens SET decisao = CASE WHEN changes() > 0 THEN 'gravado' ELSE 'recusado' END, registro_id = CASE WHEN changes() > 0 THEN ? END,
        motivo = CASE WHEN changes() > 0 THEN NULL ELSE ? END, updated_at = ${AGORA_MS} WHERE id = ?`).bind(d.alvo_id, ALVO_INEXISTENTE, i.id)]);
      continue;
    }
```

    com `const ALVO_INEXISTENTE = 'O registro não existe neste site'`; `removidos` é contado depois do batch, lendo os itens `gravado` com `"remover":1` no `dados` (o código já relê itens para `pendentes`).
  - `enviarAoLote`: `alvo_id` e `remover` entram em `PARA_BRUTO`.
  - `registrarAchados` (`ot-agente.ts:142`): `if (['zona', 'zona_id', 'alvo_id', 'remover'].some((k) => k in it.dados)) { recusados.push({ indice, motivo: 'campo não aceito pelo agente' }); continue; }`.
  - Trilha da aprovação (`src/routes/ot.ts:483-484`): `, ${n.removidos} removido(s)`.

- [ ] **Step 4: Rodar** — `npx vitest run test/ot-tudo-por-lote.test.ts test/ot-agente-mcp.test.ts test/ot-coleta.test.ts test/ot-lote-item.test.ts test/ot-levantamento-l2.test.ts test/ot-fluxo-achado.test.ts` → PASS.
- [ ] **Step 5: Mutações P0** — (a) tire `AND site_id = ?` do UPDATE de remoção: o teste de outro site falha; (b) tire `'alvo_id'` da recusa do agente: o teste do agente falha. Desfaça as duas.
- [ ] **Step 6: Commit** — `git commit -m "feat(ot): achado e lote alteram por alvo_id e removem ativo ou fluxo; o agente não usa (PR3a implantação e operação)"`.

### Task 3a.3: Nome do alvo no lote **[P0]**

**Files:**
- Modify: `src/routes/ot.ts:438-452` (`GET /lotes/:id`); `src/services/ot-fluxo-achado.ts:32-40` (`nomesDasPontas`, reaproveitada)
- Test: `test/ot-tudo-por-lote.test.ts`

- [ ] **Step 1: Teste que falha** — `GET /lotes/:id` de um lote com `{ alvo_id: a, remover: true }` e `{ alvo_id: f }` (fluxo) traz `nomes_alvos: { [a]: 'Switch velho', [f]: 'A → B' }`; um `alvo_id` de outro site **não** aparece em `nomes_alvos` (P0-4).
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — na rota, depois de `nomes_pontas`: ids de `alvo_id` dos itens; uma consulta `SELECT id, nome FROM ot_ativos WHERE project_id = ? AND site_id = ? AND id IN (SELECT value FROM json_each(?))` e, para fluxo, as pontas por `nomesDasPontas` e o texto "origem → destino"; tudo preso a `lote.site_id`. Nome de ativo já sai nesta rota hoje (`nomes_pontas`): não é exposição nova.
- [ ] **Step 4: Rodar** → PASS. **Mutação P0:** tire `AND site_id = ?`; o teste de outro site falha; desfaça.
- [ ] **Step 5: Commit** — `git commit -m "feat(ot): o lote diz o nome do que vai alterar ou remover (PR3a implantação e operação)"`.

### Task 3a.4: Pedir e aprovar a base exigem ativo **[P0] [revisor opus]**

(Na primeira versão do plano era o primeiro task do PR7; veio para o PR3a para a regra valer antes da tela do assistente.)

**Files:**
- Modify: `src/services/ot-fase.ts:71-76` (`faltaParaBase`), `:99-107` (`aprovarBase`)
- Modify: `test/ot-fase.test.ts`, `test/ot-fase-rotas.test.ts`, `test/ot-obra.test.ts`

- [ ] **Step 1: Teste que falha** — `test/ot-fase.test.ts`:

```ts
it('pedir a base sem nenhum ativo: 409 "Nenhum ativo no inventário do site"', async () => {
  await zona('z2', 2); await zona('z3', 3); await zona('z4', 4);
  expect(await pedirBase(env.DB, ator, P, S)).toEqual({ ok: false, status: 409, error: 'Nenhum ativo no inventário do site' });
});
it('aprovar: o ativo removido depois do pedido barra a aprovação (WHERE atômico)', async () => {
  // zonas + um ativo por SQL; pedir; UPDATE ot_ativos SET status = 'removido'; aprovarBase(aprov) → 409 'As condições da base mudaram desde o pedido'
});
```

  Nos testes que pedem ou aprovam base só com zonas (`ot-fase.test.ts`, `ot-fase-rotas.test.ts`, `ot-obra.test.ts`), insira um ativo por SQL na preparação. As mensagens de hoje não mudam: `faltaParaAvancar` (Task 1.1) lista rascunho, lote, zonas e só então o ativo, e `faltaParaBase` devolve o primeiro.
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — `faltaParaBase(s)` passa a `faltaParaAvancar(s)[0] ?? null` (com `obra_ate` e `ativos` vindos de `situacaoDoSite`, Task 1.1); em `aprovarBase`, `AND EXISTS (SELECT 1 FROM ot_ativos WHERE project_id = ? AND site_id = ? AND status = 'ativo')` com os binds.
- [ ] **Step 4: Rodar** — `npx vitest run test/ot-fase.test.ts test/ot-fase-rotas.test.ts test/ot-obra.test.ts test/ot-area-etapa.test.ts` → PASS.
- [ ] **Step 5: Mutação P0** — tire o `EXISTS` do `aprovarBase`; o teste atômico falha; desfaça.
- [ ] **Step 6: Commit** — `git commit -m "feat(ot): a base só é pedida e aprovada com ao menos um ativo (PR3a implantação e operação)"`.

### Task 3a.5: Zona só na Implantação e na Obra **[P0] [revisor opus]**

**Files:**
- Modify: `src/routes/ot.ts:178-203` (`POST`/`PUT /zonas`), `:375-386` (o DELETE de zona no laço)
- Create: `test/ot-zona-trava.test.ts`

- [ ] **Step 1: Teste que falha** — `test/ot-zona-trava.test.ts`: com o site em `em_levantamento` e em `em_obra`, criar, editar e remover zona dão 201/200; com o site em `em_operacao` e em `base_em_aprovacao` (fase posta por SQL), os três dão 409 `{ error: 'Zona só muda com o site em implantação ou em obra' }` e a zona não muda no banco.
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — uma função na rota: `const zonaTravada = async (db: D1Database, projectId: string, siteId: string) => !!await db.prepare(`SELECT 1 FROM ot_sites WHERE id = ? AND project_id = ? AND fase IN ('em_operacao', 'base_em_aprovacao')`).bind(siteId, projectId).first();`. No POST, com `v.data.site_id`; no PUT e no DELETE, com o `site_id` da zona (`SELECT site_id FROM ot_zonas WHERE id = ? AND project_id = ? AND ${NO_SITE}`; zona de site sem acesso segue 404). No laço de DELETE, o ramo `zonas` chama a trava antes de `atualizar`.
- [ ] **Step 4: Rodar** — `npx vitest run test/ot-zona-trava.test.ts test/ot-inventario.test.ts test/ot-fase.test.ts` → PASS.
- [ ] **Step 5: Mutação P0** — tire `'base_em_aprovacao'` da lista: o caso da base em aprovação falha (zona mudada depois do pedido mudaria a base que o Gestor vai aprovar); desfaça.
- [ ] **Step 6: Commit e entrega** — CHANGELOG ("n.ot: ativo e fluxo podem ser alterados e removidos por lote; a base exige ao menos um ativo; zona só muda na implantação ou em obra."); `git commit -m "feat(ot): zona só muda com o site em implantação ou em obra (PR3a implantação e operação)"`; push `claude/ot-io-3a`; PR "n.ot: tudo por lote no servidor (PR3a)".

---

## PR3b — Tela: ativo e fluxo viram achado

**Objetivo:** a tela para de chamar as rotas de escrita direta; incluir, alterar e remover viram achado; o lote mostra "Remover: X" e "Alterar: X". **Sem migration.** **Contrato:** nenhum no servidor. **P0:** nenhuma regra de servidor muda; a tela só desenha o que a API devolve. **Pronto quando:** `grep -nE "'(POST|PUT|DELETE)', \`/api/v1/projects/\\$\{[^}]+\}/ot/(ativos|fluxos)" frontend/src` vazio (o "Revelar", `POST …/ativos/:id/revelar`, fica e não casa); o E2E do n.ot verde. **Riscos:** o "Rascunho por IA" e o "Aplicar zona" mudam de destino; o E2E trava "+ Novo ativo" (`frontend/e2e/ot.spec.js:120`).

### Task 3b.1: "+ Ativo", "+ Fluxo", "Editar", "Remover" e a IA viram achado

**Files:**
- Modify: `frontend/src/views/ot.js:129-131,146-150,220-244,247-261,302-307,335-341,350,365-399`; `frontend/src/views/ot-levantamento.js:319-361` (`otNovoAchado` aceita dados pré-preenchidos e `alvo_id`); `frontend/src/views/ot-coleta.js:140-150` (linha do item com `nomes_alvos`)
- Modify: `frontend/test/ot-ux.test.js`, `frontend/test/ot-modulo.test.js`, `frontend/test/ot-levantamento.test.js`, `frontend/test/ot-lote-decisao.test.js`; Create: `frontend/test/ot-achado-manual.test.js`
- Modify: `frontend/e2e/ot.spec.js:120` ("+ Novo ativo" → "Registrar ativo") e os fluxos do E2E que cadastram ativo pela tela

**Interfaces:**
- Consumes: `POST /levantamentos`, `POST /levantamentos/:id/achados` (com `alvo_id`/`remover`, Task 3a.2); `GET /lotes/:id` `nomes_alvos` (Task 3a.3).
- Produces: `window.otRegistrarAchado(siteId, { entidade, dados, alvo_id, remover })`: usa o levantamento aberto do site (o mais recente com `situacao: 'aberto'`) ou cria um de visita com `realizado_em` = hoje (`hojeSP()`), e abre o formulário de achado preenchido; ao salvar, "Achado registrado: envie para revisão em Revisar". `montarInventario(..., { somenteLeitura })` e `montarFluxos(..., { somenteLeitura })` (usados no PR7 e no PR8).

- [ ] **Step 1: Teste que falha** — `frontend/test/ot-achado-manual.test.js`: com o inventário do site carregado, (a) não existe `[data-action="otNovoAtivo"]`, `otSalvarAtivo`, `otNovoFluxo`, `otSalvarFluxo`, `otAplicarZona`; (b) "Registrar ativo" chama `GET …/levantamentos?site_id=s1` e, sem levantamento aberto, `POST …/levantamentos` com `{ site_id: 's1', tipo: 'visita' }` e depois `POST …/levantamentos/<id>/achados`; (c) "Propor remoção" pede confirmação e manda `{ dados: { alvo_id: 'a1', remover: true }, evidencia }`; (d) nenhuma chamada a `POST/PUT/DELETE …/ot/ativos` ou `…/ot/fluxos` (o mock lança se a URL casar; `…/ativos/a1/revelar` passa). `frontend/test/ot-lote-decisao.test.js`: o item `{ dados: { alvo_id: 'a1', remover: 1 } }` com `nomes_alvos: { a1: 'Switch velho' }` aparece como "Remover: Switch velho"; `{ alvo_id: 'a1', nome: 'X' }`, como "Alterar: Switch velho".
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — `montarInventario` troca os botões: "+ Novo ativo" → "Registrar ativo" (`otRegistrarAchado`), "Editar" → "Propor alteração" (achado com `alvo_id` e só os campos que a pessoa mudou: IP e MAC mascarados (`•••`) nunca vão no corpo), "Remover" → "Propor remoção", "Sugerir zona (IA)" → o modal mostra a sugestão e "Propor esta zona" (achado com `alvo_id` e `zona_id`), "Rascunho por IA" → formulário de achado. Fluxos: "+ Novo fluxo" → "Registrar fluxo" (achado de fluxo, `ot-levantamento.js:313-318`). Com `somenteLeitura`, nenhum desses botões. Remova `formAtivo`, `otSalvarAtivo`, `otNovoFluxo`, `otSalvarFluxo`, `otAplicarZona` e os ramos `ativos`/`fluxos` de `otRemover` (`NOMES` fica com `sites` e `zonas`). Em `ot-coleta.js`, a coluna do item usa `nomes_alvos[d.alvo_id]` quando há `alvo_id`.
- [ ] **Step 4: Suíte inteira do frontend, build e E2E** — `cd frontend && npx vitest run && npm run build && npx playwright test e2e/ot.spec.js`.
- [ ] **Step 5: Commit e entrega** — CHANGELOG ("n.ot: na tela, ativo e fluxo passam sempre por achado e lote decidido por outra pessoa."); `git commit -m "feat(ot): na tela, ativo e fluxo viram achado (PR3b implantação e operação)"`; push `claude/ot-io-3b`; PR.

---

## PR3c — Somem as escritas diretas de ativo e fluxo

**Objetivo:** tirar do servidor as seis rotas que a tela já não usa. **Sem migration.** **Contrato:** somem `POST /ot/ativos`, `PUT /ot/ativos/:id`, `DELETE /ot/ativos/:id`, `POST /ot/fluxos`, `PUT /ot/fluxos/:id`, `DELETE /ot/fluxos/:id`; `npm run openapi` regenera. **P0:** só tira caminho de escrita. **Pronto quando:** `grep -nE "otApp\.(post|put)\('/(ativos|fluxos)(/:id)?'" src/routes/ot.ts` vazio (o `'/ativos/:id/revelar'` não casa) e o laço de DELETE (`ot.ts:375-386`) só tem `sites` e `zonas`. **Riscos:** algum script externo que chame a rota (não conferido; o spec lista em "Não conferido").

### Task 3c.1: Tirar as rotas **[P0] [revisor opus]**

**Files:**
- Modify: `src/routes/ot.ts:267-319` (`POST`/`PUT /ativos`), `:333-374` (`POST`/`PUT /fluxos`), `:375-386` (laço de DELETE); imports sem uso (`otAtivoCriarSchema`, `otAtivoAtualizarSchema`, `otFluxoCriarSchema`, `otFluxoAtualizarSchema`, `enderecos` se só era usado aqui)
- Modify: `docs/openapi.json`, `mcp-server-niso/src/contrato-gerado.ts` (por `npm run openapi`); `test/ot-inventario.test.ts` (os testes das rotas que somem saem; os de 4.3.1 e `toca431` já estão cobertos por `test/ot-tudo-por-lote.test.ts`); `test/contrato-tela-api.test.ts`, `test/contrato-isolamento-org.test.ts` se listarem as rotas
- Test: `test/ot-tudo-por-lote.test.ts`

- [ ] **Step 1: Teste que falha** — em `test/ot-tudo-por-lote.test.ts`:

```ts
it('não há mais gravação direta de ativo nem de fluxo (decisão 3), para nenhum papel', async () => {
  for (const h of [gestor, cons]) {
    expect((await chamar(h, 'POST', `${P}/ativos`, { site_id: ids.s1, nome: 'Direto' })).status).toBe(404);
    expect((await chamar(h, 'PUT', `${P}/ativos/x`, { nome: 'Direto' })).status).toBe(404);
    expect((await chamar(h, 'DELETE', `${P}/ativos/x`)).status).toBe(404);
    expect((await chamar(h, 'POST', `${P}/fluxos`, { site_id: ids.s1 })).status).toBe(404);
    expect((await chamar(h, 'PUT', `${P}/fluxos/x`, {})).status).toBe(404);
    expect((await chamar(h, 'DELETE', `${P}/fluxos/x`)).status).toBe(404);
  }
});
```

- [ ] **Step 2: Rodar** → FAIL (201/200/404 misturados).
- [ ] **Step 3: Remover** os handlers e as entradas `ativos` e `fluxos` do laço. `npm run openapi`. `npx tsc --noEmit`.
- [ ] **Step 4: Rodar** — `npx vitest run test/ot-tudo-por-lote.test.ts test/ot-inventario.test.ts test/contrato-tela-api.test.ts test/contrato-isolamento-org.test.ts test/openapi.test.ts test/any-catraca.test.ts` → PASS (se o número de `any` cair, baixe o TETO no mesmo commit); `cd frontend && npx vitest run && npx playwright test e2e/ot.spec.js`.
- [ ] **Step 5: Commit e entrega** — CHANGELOG ("n.ot: saem as rotas de gravação direta de ativo e fluxo."); `git commit -m "feat(ot)!: ativo e fluxo só entram, mudam ou saem por lote (PR3c implantação e operação)"`; push `claude/ot-io-3c`; PR.

---

## PR4 — Painel como tela inicial

**Objetivo:** o Painel do servidor responde tudo o que o "Espera por você" respondia, para cada papel; o Início some e, com ele, as 3 chamadas por site. **Sem migration.** **Contrato:** `GET /painel?modulo=ot` ganha `meu_trabalho` (técnico) e itens novos em `fazer` (assessment para confirmar e sem preencher; rascunhos de quem edita). **P0:** consultas novas no mesmo `db.batch` de `blocoOt`, todas com `NO_SITE`; o técnico só vê o que é dele (`criado_por = ator.id`); nada no Início do n.360 (só no `?modulo=ot`). **Pronto quando:** `frontend/src/views/ot-inicio.js` não existe; `?ot=inicio` abre o Painel; o teste de 150 sites conta as mesmas consultas de antes mais as novas, constantes. **Riscos:** o "Espera por você" dava o prazo do lote ("decidir até dd/mm", `ot-inicio.js:22-24`): o item do servidor leva a data no `contexto`.

### Task 4.1: "Meu trabalho" do técnico e itens que faltavam no servidor **[P0] [revisor opus]**

**Files:**
- Modify: `src/services/painel-ot.ts:40-66` (batch), `:77-88` (itens), `:130-137` (`respostaDoOt`)
- Modify: `test/painel-ot-papeis.test.ts`, `test/programa-rota.test.ts` (o teste de 150 sites)

**Interfaces:**
- Produces: `respostaDoOt` do técnico ganha `meu_trabalho: ItemFazer[]`; `fazer` da equipe ganha "N achados em rascunho" (por site; com `site` quando um só), "N itens do assessment sem preencher"; o do Gestor, "N itens do assessment para confirmar" (sem os que ele avaliou).

- [ ] **Step 1: Testes que falham** — em `test/painel-ot-papeis.test.ts`:

```ts
it('técnico: meu_trabalho tem os achados em rascunho DELE e o lote DELE recusado (7 dias), só dos sites dele', async () => {
  // achado do técnico em s1, achado do consultor em s1, lote do técnico rejeitado em s1, lote do técnico rejeitado há 8 dias (por SQL)
  // 7 dias: depois disso a retenção apaga o lote não concluído (src/manutencao.ts:155); a recusa fica na trilha (ot.lote.rejeitado)
  const b = (await painelOt(tec)).modulos.ot;
  expect(b.meu_trabalho.map((i: { texto: string }) => i.texto)).toEqual(['1 achado seu em rascunho', '1 lote seu recusado']);
  expect(b.meu_trabalho[0]).toMatchObject({ tela: 'ot', site: ids.s1, aba: 'revisar' });
  expect(b.fazer).toBeUndefined();
});
it('Gestor: itens do assessment para confirmar, sem os que ele mesmo avaliou', async () => { /* duas avaliações, uma dele */ });
it('equipe: itens de política sem preencher', async () => { /* catálogo carregado, uma avaliação */ });
it('nada disso no Início do n.360 (sem ?modulo)', async () => {
  const r = await (await chamar(tec, 'GET', '/api/v1/projects/proj-a/painel')).json<{ modulos: { ot?: Record<string, unknown> } }>();
  expect(r.modulos.ot).not.toHaveProperty('meu_trabalho');
});
```

- [ ] **Step 2: Rodar** — `npx vitest run test/painel-ot-papeis.test.ts` → FAIL.
- [ ] **Step 3: Implementar** — no batch de `blocoOt` (`painel-ot.ts:40`), três consultas a mais, agrupadas, nenhuma por site:

```ts
    db.prepare(`SELECT l.site_id, count(*) AS n FROM ot_achados a JOIN ot_levantamentos l ON l.id = a.levantamento_id AND l.project_id = a.project_id
      WHERE a.project_id = ?1 AND l.status = 'ativo' AND a.situacao = 'rascunho' AND a.chave_sensor IS NULL AND a.criado_por = ?3 AND l.${NO_SITE} GROUP BY l.site_id`).bind(projectId, sites, ator.id),
    db.prepare(`SELECT site_id, count(*) AS n FROM ot_lotes WHERE project_id = ?1 AND ${NO_SITE} AND status = 'rejeitado' AND criado_por = ?3
      AND decidido_em >= datetime('now', '-7 days') GROUP BY site_id`).bind(projectId, sites, ator.id),
    db.prepare(`SELECT
        (SELECT count(*) FROM ot_requisitos r WHERE r.framework = 'ONS-RO-CB.BR.01' AND r.codigo NOT IN (SELECT value FROM json_each(?3))
          AND NOT EXISTS (SELECT 1 FROM ot_avaliacoes v WHERE v.project_id = ?1 AND v.requisito_id = r.id)) AS sem_preencher,
        (SELECT count(*) FROM ot_avaliacoes WHERE project_id = ?1 AND confirmado_em IS NULL AND atualizado_por IS NOT ?2) AS a_confirmar`).bind(projectId, ator.id, JSON.stringify([...ITENS_TECNICOS, EXCECAO])),
```

  (`ot_requisitos` não tem coluna de tipo: "política" é todo código fora de `ITENS_TECNICOS`, `src/services/ot-conformidade.ts:21`, e do 5.1.1 (`EXCECAO`, `src/services/ot-avaliacao.ts:8`, hoje não exportada: exporte). "A confirmar" é avaliação sem `confirmado_em`, e quem gravou (`atualizado_por`) não conta para si, como `eu_avaliei` em `ot-avaliacao.ts:111`. O `framework` do catálogo é `'ONS-RO-CB.BR.01'`, `migrations/0090_ot_requisitos.sql:27`.) `respostaDoOt` do técnico: `{ ...base, meu_trabalho }`, com `meu_trabalho` montado de `mMeusRasc` e `mMeusRecusados` (um item por grupo; `site` quando um site só, `aba: 'revisar'`).
- [ ] **Step 4: Rodar** — `npx vitest run test/painel-ot-papeis.test.ts test/painel-ot-rota.test.ts test/painel-ot.test.ts test/programa-rota.test.ts test/painel.test.ts test/onda2-numeros.test.ts` → PASS.
- [ ] **Step 5: Mutação P0** — tire `AND a.criado_por = ?3`; o teste do técnico falha (conta o achado do consultor); desfaça.
- [ ] **Step 6: Commit** — `git commit -m "feat(ot): Painel com o trabalho do técnico e os itens do assessment (PR4 implantação e operação)"`.

### Task 4.2: Some o Início; o Painel é a tela inicial

**Files:**
- Delete: `frontend/src/views/ot-inicio.js`, `frontend/test/ot-inicio.test.js`
- Modify: `frontend/src/ot-navegacao.js:3,12` (`inicio` vira alias de `painel`); `frontend/src/views/ot.js:14,33,35,50,67,70,73`; `frontend/login.html:300-303` (sai `nav-ot-inicio`); `frontend/src/produto.js:33,466`; `frontend/src/views/painel.js:273-286` (quadro "Meu trabalho")
- Modify: `frontend/test/ot-navegacao.test.js`, `ot-modulo.test.js`, `produto.test.js`, `painel-ot.test.js`; `frontend/e2e/ot.spec.js:43,59,484-501` (o teste "Fluidez E1: o Início mostra o que espera pela pessoa" passa a abrir o lote pelo quadro "O que fazer" do Painel)

- [ ] **Step 1: Testes que falham** — `ot-navegacao.test.js`: `lerEndereco(loc('/ot')).tela === 'painel'` e `?ot=inicio` → `'painel'`. `painel-ot.test.js`: com `meu_trabalho` na resposta, o quadro `#pn-ot-meu` "Meu trabalho" lista os itens com "Abrir" para o site; sem a chave, o quadro não existe. `ot-modulo.test.js`: abrir `/ot` faz **uma** chamada ao painel e nenhuma a `/ot/sites/<id>/sensores`, `/ot/achados?…contagem=1` ou `/ot/sites/<id>/situacao`.
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — `TELAS_OT` sem `inicio`; `lerEndereco`: `const pedida = q.get('ot') === 'inicio' ? 'painel' : q.get('ot'); let tela = TELAS_OT.includes(pedida) ? pedida : 'painel';`. Em `ot.js`, os fallbacks `'inicio'` viram `'painel'`; sai o import de `montarInicio` e `window.otIrParaLote` passa a `window.otTela('site', site, 'revisar', { otLote: lote })`. `telaDoOt` ganha `const meu = Array.isArray(b.meu_trabalho) ? [quadro('pn-ot-meu', 'Meu trabalho', listaFazer(b.meu_trabalho, false))] : [];` à esquerda, antes de "Por site" (que para o técnico se chama "Meus sites": título do quadro por `b.meu_trabalho ? 'Meus sites' : 'Por site'`).
- [ ] **Step 4: Suíte inteira do frontend, build e E2E** — `cd frontend && npx vitest run && npm run build && npx playwright test e2e/ot.spec.js`.
- [ ] **Step 5: Commit e entrega** — CHANGELOG ("n.ot: o Painel é a tela inicial; o Início saiu, e o que ele mostrava está no Painel, calculado no servidor."); `git commit -m "feat(ot): o Painel é a tela inicial do n.ot; sai o Início (PR4 implantação e operação)"`; push `claude/ot-io-4`; PR.

---

## PR5 — Menu em Operação, Implantação e Configuração

**Objetivo:** três grupos no menu, Acessos dividido em quatro telas de Configuração, Desvios de todos os sites, e a tela inicial pela regra do servidor. **Sem migration.** **Contrato:** nenhum no servidor (a tela usa rotas que existem: `/ot/desvios` sem `site_id`, `/ot/acessos`, `/ot/agente*`, `/ot/sites/:sid/sensores`). **P0:** itens do menu continuam presos a `atualizarItemOt` (projeto com `ot` **e** pessoa com `ot`); Configuração só com `pode('editar')`, Sondas com `pode('ver_sondas')`. **Pronto quando:** `?ot=acessos` abre "Acessos de técnicos"; sem `?ot=`, quem edita num projeto sem site em operação cai em Implantação (a tela de Implantação do PR6 ainda não existe: até lá, `implantacao` mostra "Sites em implantação", a lista de `por_site` com área diferente de Operação). **Riscos:** listas fechadas do menu travadas em testes (`frontend/test/ot-modulo.test.js`, `produto.test.js`, `ot-navegacao.test.js`).

### Task 5.1: Telas e endereços novos

**Files:**
- Modify: `frontend/src/ot-navegacao.js:3`; `frontend/src/views/ot.js:33-35,70-73,401-420`; `frontend/src/views/painel.js:634` (o mapa `SEM_SITE` do PR1b passa a `{ assessment: 'assessment', sondas: 'sondas', acessos: 'acessos', desvios: 'desvios', revisar: 'implantacao', base: 'implantacao', implantacao: 'implantacao' }`); Create: `frontend/src/views/ot-configuracao.js`
- Modify: `frontend/e2e/ot.spec.js:310-425` (`#nav-ot-acessos` do agente e das sondas passa a `#nav-ot-agente` e `#nav-ot-sondas`; `#nav-ot-acessos` fica para acessos de técnicos), `frontend/test/painel-ot.test.js` (item sem site com `aba: 'sondas'` vai a `?ot=sondas`; `desvios`, a `?ot=desvios`)
- Modify: `frontend/test/ot-navegacao.test.js`; Create: `frontend/test/ot-menu.test.js`

**Interfaces:**
- Produces: `TELAS_OT = ['painel', 'sites', 'site', 'desvios', 'assessment', 'relatorios', 'implantacao', 'acessos', 'sondas', 'agente', 'integracao', 'fornecedores']`; `montarAcessosTecnicos`, `montarSondas`, `montarAgente`, `montarIntegracao` em `ot-configuracao.js` (cada uma é o pedaço de `montarAcessos`, `ot.js:403-420`, que já existe: tabela de acessos, `areaSondas`, `cartaoAgente`, `cartaoIntegracao`).

- [ ] **Step 1: Teste que falha** — `frontend/test/ot-menu.test.js`:

```js
it('três grupos, na ordem, com os itens certos para quem edita', async () => {
    await abrirOt({ editar: true, ver_sondas: true }); // ajudante: permissões + painel servidos
    const grupos = [...document.querySelectorAll('.sidebar-secao:not([hidden])')].map((n) => n.textContent.trim());
    expect(grupos).toEqual(['Operação', 'Implantação', 'Configuração']);
    const itens = [...document.querySelectorAll('[id^="nav-ot-"]:not([hidden])')].map((n) => n.id);
    expect(itens).toEqual(['nav-ot-painel', 'nav-ot-sites', 'nav-ot-desvios', 'nav-ot-assessment', 'nav-ot-relatorios',
        'nav-ot-implantacao', 'nav-ot-acessos', 'nav-ot-sondas', 'nav-ot-agente', 'nav-ot-integracao', 'nav-ot-fornecedores']);
});
it('leitor: só Painel, Assessment e Relatórios; nenhum grupo Implantação ou Configuração', async () => { /* leitor: true */ });
it('técnico: Operação (Painel, Sites, Desvios, Assessment, Relatórios) e Implantação (Sites em implantação), sem Configuração', async () => {});
it('sem ?ot=: tela_inicial do servidor decide', async () => { /* tela_inicial: 'implantacao' → título "Implantação" */ });
it('?ot=acessos abre Acessos de técnicos; Sondas sem ver_sondas cai no Painel', async () => {});
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — `login.html:300-334`: seções `secao-ot-operacao` ("Operação"), `secao-ot-implantacao` ("Implantação"), `secao-ot-configuracao` ("Configuração") e os itens `nav-ot-desvios` ("Desvios"), `nav-ot-implantacao` ("Implantação"), `nav-ot-sondas`, `nav-ot-agente`, `nav-ot-integracao` (o `nav-ot-acessos` vira "Acessos de técnicos"; `nav-ot-fornecedores` desce para Configuração). `SO_OT` e `atualizarItemOt` (`produto.js:33,464-469`) acompanham, cada item com a sua permissão. Em `ot.js`, `TITULOS`/`MONTAR` com as telas novas (`desvios: (c, a, p) => montarDesvios(c, a, p, {})`, que já aceita sem site, `ot-desvios.js:44`), sem endereço: `tela = S.otPermissoes.tela_inicial`. A "Cadastrar sonda" do desvio sem sonda (`ot-desvios.js:46`) passa a `otTela('sondas')`.
- [ ] **Step 4: Suíte inteira do frontend, build e E2E** — `cd frontend && npx vitest run && npm run build && npx playwright test e2e/ot.spec.js`.
- [ ] **Step 5: Commit e entrega** — CHANGELOG; `git commit -m "feat(ot): menu em Operação, Implantação e Configuração; Acessos dividido; Desvios de todos os sites (PR5 implantação e operação)"`; push `claude/ot-io-5`; PR.

---

## PR6 — Lista de verificação do projeto

**Objetivo:** a tela Implantação abre com a lista de verificação calculada no servidor (cada passo com estado e link exato) e, abaixo, os sites em implantação. **Sem migration.** **Contrato:** rota nova `GET /ot/implantacao` (sem corpo). **P0:** só `podeEditarOt` (técnico, leitor, agente, chave: 403); um `db.batch`; só contagens. **Pronto quando:** os nove passos do spec §3 aparecem com o estado certo num projeto vazio e num projeto implantado; cada "Abrir" leva à tela certa. **Riscos:** o passo `modulo` conta pessoas do cliente com `ot` (`client_project_id`); consultor não conta (ele recebe o `ot` pela consultoria).

### Task 6.1: `GET /ot/implantacao` **[P0] [revisor opus]**

**Files:**
- Create: `src/services/ot-implantacao.ts`; `test/ot-implantacao.test.ts`
- Modify: `src/routes/ot.ts` (rota ao lado de `/permissoes`)

**Interfaces:**
- Produces: `listaDeVerificacao(db, projectId): Promise<{ passos: PassoImplantacao[] }>`; `type PassoImplantacao = { id: 'modulo' | 'gestor' | 'tecnicos' | 'site' | 'sonda' | 'agente' | 'fornecedores' | 'assessment' | 'base'; texto: string; estado: 'feito' | 'falta' | 'opcional'; detalhe: string; link: { tela: string; site?: string; aba?: string } }`.

- [ ] **Step 1: Teste que falha** — `test/ot-implantacao.test.ts`:

```ts
it('projeto novo: tudo falta, agente é opcional, na ordem do spec', async () => {
  const r = await (await chamar(cons, 'GET', `${P}/implantacao`)).json<{ passos: { id: string; estado: string }[] }>();
  expect(r.passos.map((p) => [p.id, p.estado])).toEqual([['modulo', 'falta'], ['gestor', 'falta'], ['tecnicos', 'falta'], ['site', 'falta'],
    ['sonda', 'falta'], ['agente', 'opcional'], ['fornecedores', 'falta'], ['assessment', 'falta'], ['base', 'falta']]);
});
it('sonda: detalhe diz criada, instalada (credencial ativa) e primeiro envio', async () => {
  // uma sonda sem credencial, outra com credencial e um envio concluído
  const s = (await lista(cons)).find((p) => p.id === 'sonda');
  expect(s).toMatchObject({ estado: 'feito', detalhe: '2 sondas; 1 instalada; 1 com primeiro envio' });
});
it('base: link leva ao primeiro site em implantação, na etapa dele', async () => {
  const b = (await lista(cons)).find((p) => p.id === 'base');
  expect(b.link).toEqual({ tela: 'site', site: ids.s1 });
});
it('P0: técnico, leitor, agente e chave de API: 403', async () => { for (const h of [tec, cli, agenteH, apiKeyH]) expect((await chamar(h, 'GET', `${P}/implantacao`)).status).toBe(403); });
it('P0-6: nenhum nome de pessoa, sonda ou ativo, nenhum IP/MAC no corpo', async () => {
  const t = await (await chamar(cons, 'GET', `${P}/implantacao`)).text();
  expect(t).not.toMatch(/@|\d+\.\d+\.\d+\.\d+|Sonda Norte|RTU/);
});
it('um db.batch: o número de consultas não cresce com 50 sites', async () => { /* molde de test/programa-rota.test.ts:109 */ });
```

- [ ] **Step 2: Rodar** → FAIL (404).
- [ ] **Step 3: Implementar** — `src/services/ot-implantacao.ts`, um `db.batch` com uma consulta de contagens:

```ts
import { CARGO_GESTOR_ARCIBER } from './ot-inventario';
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export async function listaDeVerificacao(db: D1Database, projectId: string) {
  const [[c], [primeiro]] = (await db.batch([
    db.prepare(`SELECT
      (SELECT count(*) FROM users u JOIN usuario_modulos m ON m.user_id = u.id AND m.modulo = 'ot' WHERE u.client_project_id = ?1) AS pessoas,
      (SELECT count(*) FROM project_governance WHERE project_id = ?1 AND ${CARGO_GESTOR_ARCIBER} AND coalesce(trim(email), '') <> '') AS gestor,
      (SELECT count(*) FROM ot_site_acessos a JOIN ot_sites s ON s.id = a.site_id WHERE s.project_id = ?1 AND s.status = 'ativo') AS tecnicos,
      (SELECT count(*) FROM ot_sites WHERE project_id = ?1 AND status = 'ativo') AS sites,
      (SELECT count(*) FROM ot_sensores WHERE project_id = ?1 AND situacao = 'ativa') AS sondas,
      (SELECT count(DISTINCT sensor_id) FROM ot_sensor_credenciais WHERE project_id = ?1 AND situacao = 'ativa' AND expira_em > datetime('now')) AS instaladas,
      (SELECT count(DISTINCT sensor_id) FROM ot_sensor_envios WHERE project_id = ?1 AND situacao = 'concluido') AS com_envio,
      (SELECT agente_coleta_ot FROM projects WHERE id = ?1) AS agente,
      (SELECT count(*) FROM ot_fornecedores WHERE project_id = ?1) AS fornecedores,
      (SELECT count(*) FROM ot_avaliacoes WHERE project_id = ?1) AS avaliacoes,
      (SELECT count(*) FROM ot_sites WHERE project_id = ?1 AND status = 'ativo' AND base_aprovada_em IS NOT NULL) AS bases`).bind(projectId),
    db.prepare(`SELECT id FROM ot_sites WHERE project_id = ? AND status = 'ativo' AND fase <> 'em_operacao' ORDER BY created_at LIMIT 1`).bind(projectId),
  ])).map((r) => r.results as Record<string, number | string>[]);
  const n = (k: string) => Number(c[k] ?? 0);
  const p = (id: string, feito: boolean, texto: string, detalhe: string, link: Record<string, string>, opcional = false) =>
    ({ id, texto, estado: feito ? 'feito' : opcional ? 'opcional' : 'falta', detalhe, link });
  return { passos: [
    p('modulo', n('pessoas') > 0, 'Dar o n.ot às pessoas do cliente', plural(n('pessoas'), 'pessoa com o n.ot', 'pessoas com o n.ot'), { tela: 'n360-usuarios' }),
    p('gestor', n('gestor') > 0, 'Definir o Gestor ARCiber', n('gestor') ? 'Definido' : 'Sem Gestor ARCiber no comitê', { tela: 'n360-governanca' }),
    p('tecnicos', n('tecnicos') > 0, 'Dar acesso aos técnicos', plural(n('tecnicos'), 'acesso concedido', 'acessos concedidos'), { tela: 'acessos' }),
    p('site', n('sites') > 0, 'Cadastrar o primeiro site', plural(n('sites'), 'site', 'sites'), { tela: 'implantacao', aba: 'novo-site' }),
    p('sonda', n('com_envio') > 0, 'Instalar a sonda e receber o primeiro envio',
      `${plural(n('sondas'), 'sonda', 'sondas')}; ${n('instaladas')} ${n('instaladas') === 1 ? 'instalada' : 'instaladas'}; ${n('com_envio')} com primeiro envio`, { tela: 'sondas' }),
    p('agente', n('agente') === 1, 'Ligar o agente de coleta', n('agente') === 1 ? 'Ligado' : 'Opcional', { tela: 'agente' }, true),
    p('fornecedores', n('fornecedores') > 0, 'Ligar os fornecedores de OT', plural(n('fornecedores'), 'fornecedor', 'fornecedores'), { tela: 'fornecedores' }),
    p('assessment', n('avaliacoes') > 0, 'Fazer a primeira avaliação do Assessment', plural(n('avaliacoes'), 'item avaliado', 'itens avaliados'), { tela: 'assessment' }),
    p('base', n('bases') > 0, 'Aprovar a primeira base', plural(n('bases'), 'base aprovada', 'bases aprovadas'),
      primeiro ? { tela: 'site', site: String(primeiro.id) } : { tela: 'implantacao' }),
  ] };
}
```

  (`ot_sensores`, `ot_sensor_credenciais` e `ot_sensor_envios` têm `project_id` e `situacao`, `migrations/0101_ot_sensores.sql:9-46`; `ot_fornecedores` não tem status, `migrations/0116_ot_fornecedores.sql:3-14`: todo vínculo conta.) Rota: `otApp.get('/implantacao', …)` com `if (!podeEditarOt(user)) return c.json({ error: 'Forbidden: a lista de verificação é de quem implanta' }, 403);`.
- [ ] **Step 4: Rodar** — `npx vitest run test/ot-implantacao.test.ts test/contrato-tela-api.test.ts test/contrato-isolamento-org.test.ts` → PASS.
- [ ] **Step 5: Mutação P0** — troque `podeEditarOt(user)` por `true`; o teste do técnico falha; desfaça.
- [ ] **Step 6: Commit** — `git commit -m "feat(ot): GET /ot/implantacao, lista de verificação do projeto (PR6 implantação e operação)"`.

### Task 6.2: Tela Implantação

**Files:**
- Create: `frontend/src/views/ot-implantacao.js`; `frontend/test/ot-implantacao.test.js`
- Modify: `frontend/src/views/ot.js` (`MONTAR.implantacao`), `frontend/src/views/ot.js:186-195` (`otSalvarSite`: depois de criar, `window.otTela('site', r.id, null)`)

- [ ] **Step 1: Teste que falha** — `frontend/test/ot-implantacao.test.js`: com `/ot/implantacao` servido, a lista é um `<ol aria-label="Lista de verificação do projeto">` com nove itens, cada um com o estado em texto ("Feito", "Falta", "Opcional") e um botão "Abrir" com `data-action="otIrPasso"` e os `data-args` do link; o primeiro passo que falta tem o único `.btn-primary`. Abaixo, "Sites em implantação" com os sites de `por_site` cuja área não é Operação (uma chamada ao painel, a mesma do cache `S.painel`). Criar site: o `POST /ot/sites` devolve `{ id: 's9' }` e a tela chama `otTela('site', 's9', null)`. Com `/ot/implantacao` em 403 (técnico), a lista não aparece e só "Sites em implantação" fica.
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — `montarImplantacao(c, a, p)`; `window.otIrPasso(link)`: `n360-usuarios` → `irPara(`${enderecoDoProduto('n360')}?tela=users`)`, `n360-governanca` → `?tela=governance`, `site` → `otTela('site', link.site, link.aba ?? null)`, `aba: 'novo-site'` → `otNovoSite()`, o resto → `otTela(link.tela)`.
- [ ] **Step 4: Suíte inteira do frontend, build e E2E** — `cd frontend && npx vitest run && npm run build && npx playwright test e2e/ot.spec.js`.
- [ ] **Step 5: Commit e entrega** — CHANGELOG; `git commit -m "feat(ot): tela Implantação com a lista de verificação; criar site abre o site (PR6 implantação e operação)"`; push `claude/ot-io-6`; PR.

---

## PR7 — Assistente do site em Implantação

**Objetivo:** o site em Implantação (ou em Obra) é um assistente de 4 etapas, uma por vez, com "Para avançar" do servidor e entrada única "Revisar". **Sem migration.** **Contrato:** nenhum no servidor (a regra da base com ativo e a trava de zona já vieram no PR3a). **P0:** nenhuma regra de servidor muda. **Pronto quando:** num site novo, as etapas 1→4 andam só pelo que o servidor diz; nenhuma etapa grava inventário fora de achado; `ALIAS_ABA` (PR1b) saiu de `ot-site.js`. **Riscos:** o E2E percorre o site pelas abas de hoje (`frontend/e2e/ot.spec.js:43-48,124,205,434,501,552,604,741`): todas mudam de nome neste PR.

### Task 7.1: Tela do site em Implantação

**Files:**
- Modify: `frontend/src/views/ot-site.js` (inteiro: `SUBS`/`MODOS` saem; `montarSite` escolhe pela `area`); `frontend/src/views/ot-base.js` (`cabecalhoDoSite` com o botão único por etapa); `frontend/src/views/ot-revisao.js` (título "Revisar")
- Modify: `frontend/test/ot-site.test.js`, `frontend/test/ot-base.test.js`, `frontend/test/ot-revisao.test.js`; `frontend/e2e/ot.spec.js` (o ajudante `noSite`, `:44-50`, passa a receber a aba da implantação: "1. Cadastrar", "2. Levantar", "3. Revisar", "4. Aprovar a base")

**Interfaces:**
- Consumes: `situacao.area/etapa/falta` (PR1a), `montarInventario(..., { somenteLeitura })` e `montarFluxos(..., { somenteLeitura })` (PR3b), `montarLevantamento`, `montarRevisao`.
- Produces: abas da Implantação `['cadastrar', 'levantar', 'revisar', 'base']` (a do endereço, ou a da etapa atual); `window.otSiteAba(aba)`.

- [ ] **Step 1: Teste que falha** — `frontend/test/ot-site.test.js`: com `situacao = { area: 'implantacao', etapa: 2, falta: ['Nenhum ativo no inventário do site'] }`, a tela abre na aba "2. Levantar" (o `montarLevantamento` é chamado), as etapas 3 e 4 aparecem como "ainda não" (botão desabilitado com `aria-disabled="true"`), a 1 como "feita" (abre para leitura); só um `.btn-primary`. Com `etapa: 4`, a aba "4. Aprovar a base" mostra inventário e fluxos **sem** "Registrar ativo" nem "Propor", e "Pedir aprovação da base" para quem edita; com `pode('gestor')` e `eu_pedi_a_base: false`, "Aprovar a base" e "Devolver". Com `area: 'obra'`, a faixa "Obra até dd/mm" e as abas 2 a 4. Nenhum "Modo projeto" no DOM.
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — `montarSite`: lê sites e situação (como hoje, `ot-site.js:61-69`); `sit.area === 'operacao'` → `montarSiteOperacao` (PR8; até lá, a tela de operação de hoje); senão, as abas da implantação: `cadastrar` → formulário do site e zonas (o `formSite` e a tabela de zonas de `montarInventario`, que já existem), `levantar` → `montarLevantamento`, `revisar` → `montarRevisao`, `base` → `montarInventario(…, { somenteLeitura: true })` + `montarFluxos(…, { somenteLeitura: true })` + botões da base (`proximoPasso` de `ot-base.js`). Aba sem pedido no endereço = `['cadastrar', 'levantar', 'revisar', 'base'][sit.etapa - 1]`. `ALIAS_ABA` (PR1b) sai: `revisar` é aba de verdade agora.
- [ ] **Step 4: Suíte inteira do frontend, build e E2E** — `cd frontend && npx vitest run && npm run build && npx playwright test e2e/ot.spec.js`.
- [ ] **Step 5: Commit e entrega** — CHANGELOG ("n.ot: o site em implantação é um assistente de quatro etapas, com o que falta para avançar dito pelo servidor."); `git commit -m "feat(ot): site em Implantação como assistente de 4 etapas (PR7 implantação e operação)"`; push `claude/ot-io-7`; PR.

---

## PR8 — Site em Operação

**Objetivo:** o site em Operação tem as abas Desvios, Saúde da coleta, Inventário (só leitura, com fluxos), Mudanças e Revalidação; mudar o inventário em operação é só por Mudança. **Sem migration** (Mudanças = lotes do site com `created_at >= base_aprovada_em`; Revalidação lê `revalidar_em` e os ativos que já vêm de `GET /ot/ativos`). **Contrato:** nenhum no servidor (`GET /ot/lotes` já lista os lotes dos sites permitidos, `ot.ts:427-436`). **P0:** nada novo no servidor; a tela só desenha o que a API já devolve à pessoa. **Pronto quando:** em operação não existe botão que altere o inventário fora de "Registrar mudança" e "Regularizar"; "Abrir obra" (Gestor) leva o site à Obra. **Riscos:** `GET /ot/lotes` lista todos os lotes dos sites permitidos (sem filtro de site): a tela filtra; com muitos lotes, peça `?site_id=` num PR à parte (fica fora). O lote não concluído some em 7 dias pela retenção (P0-3, `src/manutencao.ts:155`): Mudança recusada antiga só existe na trilha. O E2E abre o site em operação (`frontend/e2e/ot.spec.js:506-521,627-665`): as abas mudam.

### Task 8.1: Abas da Operação

**Files:**
- Modify: `frontend/src/views/ot-site.js` (`montarSiteOperacao`); `frontend/src/views/ot.js` (`montarFluxos` com `somenteLeitura`)
- Create: `frontend/test/ot-site-operacao.test.js`
- Modify: `frontend/e2e/ot.spec.js:506-521,627-665` (o site em operação abre na aba Desvios; "Modo operação" não existe mais)

- [ ] **Step 1: Teste que falha** — `frontend/test/ot-site-operacao.test.js`:

```js
it('em operação: cinco abas, Desvios primeiro; a aba do endereço vale', async () => {
    await abrirSite({ area: 'operacao', base_aprovada_em: '2026-10-01 12:00:00' }); // ajudante: situação, sites, permissões
    expect([...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim())).toEqual(['Desvios', 'Saúde da coleta', 'Inventário', 'Mudanças', 'Revalidação']);
});
it('Inventário só leitura: ativos e fluxos, sem Registrar, Propor nem Remover', async () => {});
it('Mudanças: abertas (em revisão) e concluídas, só do site e depois da base; "Registrar mudança" abre o levantamento de visita', async () => {
    // /ot/lotes devolve de s1: um antes da base, um em_revisao e um concluido depois, um rejeitado depois; e um de s2
    // → "Abertas": o em_revisao; "Concluídas": o concluido; o rejeitado aparece em "Recusadas nos últimos 7 dias" (a retenção apaga
    //   o lote não concluído em 7 dias, src/manutencao.ts:155; a recusa fica na trilha, ot.lote.rejeitado); o de s2 e o anterior não aparecem
});
it('Revalidação: "Revalidar até dd/mm/aaaa" e os ativos do ARCiber vencidos ou a vencer em 60 dias; "Nova visita de revalidação"', async () => {});
it('Gestor vê "Abrir obra"; os demais, não', async () => {});
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — `montarSiteOperacao(c, a, p, { site, aba, sit })`: `desvios` → `montarDesvios(…, { siteFixo })`; `saude` → o que `ot-site.js:92-93` já faz; `inventario` → `montarInventario(…, { somenteLeitura: true })` + `montarFluxos(…, { somenteLeitura: true })`; `mudancas` → `GET /ot/lotes`, filtro `l.site_id === site && l.created_at >= sit.base_aprovada_em`, em três blocos: **Abertas** (`em_revisao`), **Concluídas** (`concluido`) e **Recusadas nos últimos 7 dias** (`rejeitado`, com a nota "a recusa fica registrada na trilha; o lote sai daqui em 7 dias"), cada um com Criado em, Itens e Abrir → `otTela('site', site, 'mudancas', { otLote: l.id })` (abre `montarColeta` no lote), botão "Registrar mudança" → `otRegistrarAchado(site, {})` (PR3b); `revalidacao` → `sit.revalidar_em` e a lista de `GET /ot/ativos?site_id=` com `no_arciber` e `ultima_verificacao_em` + 24 meses ≤ hoje + 60 dias, botão "Nova visita de revalidação" → `otNovoLevantamentoDoSite`. O cabeçalho em operação: "Operação desde dd/mm/aaaa" e, para `pode('gestor')`, "Abrir obra" (`ot-base.js:46-47`).
- [ ] **Step 4: Suíte inteira do frontend, build e E2E** — `cd frontend && npx vitest run && npm run build && npx playwright test e2e/ot.spec.js`.
- [ ] **Step 5: Commit e entrega** — CHANGELOG ("n.ot: o site em operação tem Desvios, Saúde da coleta, Inventário só leitura, Mudanças e Revalidação."); `git commit -m "feat(ot): site em Operação com Mudanças e Revalidação (PR8 implantação e operação)"`; push `claude/ot-io-8`; PR.

---

## PR9 — Documentação

**Objetivo:** a documentação diz o que o código faz depois dos PRs 1a a 8. **Sem migration, sem código.** **Pronto quando:** `grep -n "Modo projeto\|Modo operacao\|Modo operação\|Inicio (\`views/ot-inicio.js\`)\|o n.ot nao tem Painel\|Acessos e sondas" AGENTS.md README.md docs/n-ot-*.md docs/roteiro-aceite.md` vazio; o INDEX dá a spec como construída com os PRs.

### Task 9.1: AGENTS.md, guias, INDEX e CHANGELOG

**Files:**
- Modify: `AGENTS.md:83-146` (bullet do n.ot: telas, menu, papéis por `/ot/permissoes`, leitor, tudo por lote, rotas que saíram, `/ot/implantacao`), `AGENTS.md:655-670` (jornada: o n.ot **tem** Painel, que é a tela inicial; corrigir a linha 668), **sem acentos**
- Modify: `docs/n-ot-agente.md`, `docs/n-ot-assessment.md`, `docs/n-ot-sensor-rede.md` (nomes das telas: Configuração › Sondas e Agente de coleta; "Sonda de rede")
- Modify: `README.md:95-97` (as subtelas do n.ot: Painel, Sites, Desvios, Assessment, Relatórios; Implantação; Configuração) e `docs/roteiro-aceite.md` (seção 11, o n.ot: os passos pelo menu novo, o assistente do site, Mudança por lote)
- Modify: `docs/superpowers/INDEX.md` (spec 2026-11-26 "construída" com os doze PRs; o plano vai para `docs/arquivo/planos/` com `git mv`, consertando os links)
- Modify: `CHANGELOG.md` (juntar as entradas dos PRs 1a a 8 num bloco "n.ot: Implantação e Operação")

- [ ] **Step 1:** Escreva as mudanças; confira cada nome de tela e rota no código (`grep -n` de cada um).
- [ ] **Step 2:** `npx vitest run test/agente-skills.test.ts test/docs-*.test.ts 2>/dev/null; cd frontend && npx vitest run` (algum teste lê o AGENTS.md ou os guias; rode o que existir: `grep -ln "AGENTS.md\|docs/n-ot" test/*.ts frontend/test/*.js`).
- [ ] **Step 3: Commit e entrega** — `git commit -m "docs(ot): AGENTS, guias, INDEX e CHANGELOG da Implantação e Operação (PR9 implantação e operação)"`; push `claude/ot-io-9`; PR.

---

## Self-Review

**1. Cobertura do spec**

| Requisito do spec | Onde |
|---|---|
| §1 vocabulário (área, 4 etapas, de-para, sem migration) | Tasks 1.1, 1.2 (PR1a), 1.4 (PR1b; inclui o Relatório de conformidade) |
| §1 "o que falta" com todas as condições, na ordem das mensagens de hoje | Task 1.1 (`faltaParaAvancar`), 3a.4 (409), 7.1 (tela) |
| §2 menu em três grupos, tela inicial do servidor, aliases | Task 5.1 (`tela_inicial` no Task 2.1; alias `inicio` no 4.2; leitor no Painel desde o 2.3) |
| §3 lista de verificação (9 passos, um batch, só contagens) | Tasks 6.1, 6.2 |
| §4 assistente da Implantação; criar site abre o passo 1 | Tasks 7.1, 6.2 |
| §5 Operação: abas, Mudanças (abertas, concluídas, recusadas em 7 dias), Revalidação, Obra | Task 8.1 (Obra na 7.1) |
| §6 papéis pelo servidor, Gestor direto, leitor = regra do Painel (`ehLeitorOt`) | Tasks 2.1, 2.2, 2.3 |
| §6 leitor sem `por_zona`, sem `subsidio`, sem `/ot/sites` nos Relatórios, sem `site` na régua | Tasks 2.2, 2.3, 1.2 |
| §6 técnico "Meus sites" e "Meu trabalho" (recusa em 7 dias) | Tasks 4.1, 4.2 |
| §7 links profundos (endereço, Painel, régua, sino) | Tasks 1.2, 1.3 (PR1a), 1.4 (PR1b), 5.1 (telas novas no `painelAbrir`) |
| Decisão 3: tudo por lote, remoção, fim da gravação direta | Tasks 3a.1, 3a.2, 3a.3, 3b.1, 3c.1 |
| Alteração por `alvo_id` (duplicata, nome, pontas, 4.3.1); agente sem `alvo_id`/`remover`; nome do alvo no lote | Tasks 3a.2, 3a.3, 3b.1 |
| Decisão 2 do dono: base exige ativo | Task 3a.4 |
| Decisão 3 do dono: zona só na Implantação e na Obra | Task 3a.5 |
| Decisão 5: Início some, sem chamadas por site | Tasks 4.1, 4.2 |
| "Criar ação corretiva" só com o n.iso | Tasks 2.1 (`acao_corretiva`), 2.3 |
| Desvio vazio leva a Sondas, não a Acessos | Task 5.1 |
| "Fornecedores de OT", "Sonda de rede" | Task 1.4 |
| E2E do n.ot em todo PR de tela | Global Constraints, Preflight; Tasks 1.4, 2.3, 3b.1, 3c.1, 4.2, 5.1, 7.1, 8.1 |
| AGENTS.md:668, README, roteiro de aceite, INDEX, guias, CHANGELOG | Task 9.1 (o INDEX dos painéis foi corrigido no PR deste plano) |
| Fora: PR5 dos painéis, migração de dados, convite de técnico, cadastro de parte | nenhum task, de propósito |

**2. Placeholders:** os passos de teste da tela descrevem o DOM esperado com seletores e textos exatos; os corpos de `gh pr create` são texto do executor. Nenhum ponto depende de conferência de esquema: colunas e caminhos usados foram lidos nas migrations e rotas citadas.

**3. Consistência de nomes:** `areaEEtapa`/`faltaParaAvancar`/`Area` (1.1) são os usados em 1.2, 3a.4, 7.1; `Permissoes`/`permissoesOt`/`ehLeitorOt` (2.1) em 2.2 e no `painel-ot.ts`; `carregarPermissoes`/`pode` (2.3) em 4.x, 5.1, 6.2, 7.1, 8.1; `inventarioPorLote` (3a.1) em 3a.2, 3c.1; `nomes_alvos` (3a.3) em 3b.1; `otRegistrarAchado` e `somenteLeitura` (3b.1) em 7.1 e 8.1; `ALIAS_ABA` (1.4) sai no 7.1; `listaDeVerificacao`/`PassoImplantacao` (6.1) em 6.2; abas da Implantação `cadastrar|levantar|revisar|base` e da Operação `desvios|saude|inventario|mudancas|revalidacao`; abas dos itens do Painel `desvios|revisar|base|saude|assessment|sondas|site`.
