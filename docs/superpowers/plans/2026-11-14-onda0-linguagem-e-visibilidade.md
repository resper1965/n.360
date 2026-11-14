# Onda 0 (linguagem e visibilidade): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um rótulo por conceito nos três módulos, o n.ot visível no painel, na carteira e nos avisos de prazo, e o texto do convite corrigido.

**Architecture:** Só texto de tela muda na parte de rótulos (ids, rotas e tabelas ficam). O n.ot entra no painel como mais um bloco de `painelDoProjeto`, num arquivo próprio (`src/services/painel-ot.ts`), e na carteira como duas consultas a mais no mesmo `db.batch`. Os avisos ganham três entradas em `FONTES` com a faixa `ot`.

**Tech Stack:** Cloudflare Workers (Hono), D1, Vitest com `cloudflare:test` (D1 real), frontend Vanilla JS com Vitest em jsdom.

**Spec:** `docs/superpowers/specs/2026-11-14-onda0-linguagem-e-visibilidade-design.md` (aprovada pelo dono em 14/11/2026, com as três confirmações: "Papéis e comitê" nos dois módulos; "Pessoas e parceiros" no n.iso; avisos de aceite e de obra só para o Gestor ARCiber do cliente).

## Global Constraints

- Sem migration. `schema.sql` não muda.
- Nenhum id de menu, rota, tabela, coluna ou valor de banco muda. `terceiros` segue como nome interno.
- P0-1: ver o n.ot exige o módulo `ot` no projeto **e** na pessoa. P0-2: chave de API (`user.id` começa com `apikey:`) e agente MCP (`user.agente === true`) nunca recebem bloco, linha nem contagem do n.ot.
- Nada do n.ot que sai para o painel, a carteira ou o sino leva IP, MAC, nome de ativo, contagem de ativos ou de achados. Só contagem de pendência e nome de site.
- Técnico (`org_user`) só conta os sites de `sitesPermitidos` (`src/services/ot-inventario.ts`).
- Gestor ARCiber, na autorização, é `role === 'org_admin' && client_project_id === projectId` (a regra de `ehGestorArciber`, `src/routes/ot.ts`).
- "Hoje" é o dia de São Paulo (`hojeEmSaoPaulo`, `src/services/hoje.ts`).
- Texto de tela em português, sem itálico, sem emoji, sem travessão.
- Leitura nova do banco: teste de integração com o D1 real, nunca dublê do D1.
- Três PRs, nesta ordem: PR1 = Tasks 1 e 2; PR2 = Tasks 3 a 5; PR3 = Task 6. Cada PR passa por `bash scripts/ci/ship.sh <PR>`.
- Antes de cada commit: `npx tsc --noEmit` limpo.

---

## PR1: rótulos e texto do convite

### Task 1: "Fornecedor" nos textos do servidor

**Files:**
- Modify: `src/services/painel.ts` (linhas com `'Terceiros'`, `'terceiros vencidos'`, `'Cadastrar os terceiros'`, `'terceiro vencido'`)
- Modify: `src/services/encarregado.ts:162-177`
- Modify: `src/services/avisos-prazo.ts` (`FONTES.avaliacao_terceiro`, `ROTULO.avaliacao_terceiro`)
- Test: `test/painel.test.ts`, `test/avisos-prazo.test.ts` e os testes que afirmam os textos antigos

**Interfaces:**
- Consumes: nada.
- Produces: os textos novos, que as Tasks 4 e 6 não tocam.

- [ ] **Step 1: Listar os testes que afirmam o texto antigo**

Run: `git grep -n -i "terceiros vencidos\|terceiro vencido\|Cadastrar os terceiros\|Cadastrar terceiros\|Avaliação do terceiro\|Avaliação de terceiro\|terceiro com avaliação\|terceiros com avaliação\|terceiro nunca avaliado\|terceiros nunca avaliados\|Avaliar os terceiros\|Reavaliar os terceiros\|'Terceiros'" -- test frontend/test frontend/src`

Guarde a lista: cada ocorrência em `test/` e `frontend/test/` será trocada no Step 4, e cada uma em `frontend/src/` é texto de tela a trocar no Step 3.

- [ ] **Step 2: Escrever o teste que falha**

Em `test/painel.test.ts`, dentro do `describe` das funções puras, acrescente:

```ts
  it('carteira fala em fornecedor, não em terceiro', () => {
    const s = situacaoNaCarteira({ modulos: ['privacy'], pedidos_atrasados: 0, comunicacoes_atrasadas: 0, acoes_vencidas: 0, terceiros_vencidos: 2,
      vence_7_dias: 0, tratamentos: 1, controles: 0, proximo: null });
    expect(s.urgente).toBe('2 fornecedores vencidos');
  });
```

Run: `npx vitest run test/painel.test.ts -t "fornecedor"`
Expected: FAIL, recebido `2 terceiros vencidos`.

- [ ] **Step 3: Trocar os textos**

Substituições exatas (só o texto entre aspas; identificadores, `tela: 'terceiros'` e nomes de coluna ficam):

| Arquivo | De | Para |
|---|---|---|
| `src/services/painel.ts` | `'Terceiros'` em `TIPOS_PRIVACY`, no `SELECT 'Terceiros', p.nome` de `UNIAO_PRIVACY` e em `tema('Terceiros'` | `'Fornecedores'` nos três (o tipo da união e o de `TIPOS_PRIVACY` têm de ser iguais) |
| `src/services/painel.ts` | `'terceiros vencidos'` | `'fornecedores vencidos'` |
| `src/services/painel.ts` | `texto: 'Cadastrar os terceiros'` e `acao: 'Cadastrar terceiros'` | `texto: 'Cadastrar os fornecedores'` e `acao: 'Cadastrar fornecedores'` |
| `src/services/painel.ts` | `'terceiro vencido', 'terceiros vencidos'` (em `situacaoNaCarteira`) | `'fornecedor vencido', 'fornecedores vencidos'` |
| `src/services/encarregado.ts` | `'terceiro com avaliação vencida' : 'terceiros com avaliação vencida'` | `'fornecedor com avaliação vencida' : 'fornecedores com avaliação vencida'` |
| `src/services/encarregado.ts` | `'Reavaliar os terceiros'` | `'Reavaliar os fornecedores'` |
| `src/services/encarregado.ts` | `'terceiro nunca avaliado ou a reavaliar' : 'terceiros nunca avaliados ou a reavaliar'` | `'fornecedor nunca avaliado ou a reavaliar' : 'fornecedores nunca avaliados ou a reavaliar'` |
| `src/services/encarregado.ts` | `'Avaliar os terceiros'` | `'Avaliar os fornecedores'` |
| `src/services/avisos-prazo.ts` | `'Avaliação do terceiro ' \|\| pa.nome` | `'Avaliação do fornecedor ' \|\| pa.nome` |
| `src/services/avisos-prazo.ts` | `avaliacao_terceiro: 'Avaliação de terceiro'` | `avaliacao_terceiro: 'Avaliação de fornecedor'` |

Em `frontend/src/`, troque do mesmo jeito cada texto de tela que o Step 1 listou (palavra "terceiro(s)" visível ao usuário vira "fornecedor(es)", com a concordância). Não toque em `data-args`, ids, nomes de função nem em `'terceiros'` como valor de tela.

- [ ] **Step 4: Atualizar os testes que afirmavam o texto antigo**

Em cada ocorrência de `test/` e `frontend/test/` listada no Step 1, troque o texto esperado pelo novo, pela mesma tabela.

- [ ] **Step 5: Rodar**

Run: `npx tsc --noEmit && npx vitest run test/painel.test.ts test/avisos-prazo.test.ts test/emails-avisos.test.ts && (cd frontend && npx vitest run)`
Expected: PASS.

Run: `git grep -n -i "terceiros vencidos\|Avaliação do terceiro\|Cadastrar os terceiros" -- src frontend/src`
Expected: nada.

- [ ] **Step 6: Commit**

```bash
git add -A src/services/painel.ts src/services/encarregado.ts src/services/avisos-prazo.ts test frontend
git commit -m "fix(texto): fornecedor no lugar de terceiro no painel, na carteira e nos avisos"
```

### Task 2: rótulos do menu e texto do convite

**Files:**
- Modify: `frontend/login.html` (texto dos itens `nav-governance`, `nav-partes`, `nav-sistemas`, `nav-terceiros`, `nav-documentos-arquivo`, `nav-mapa-de-risco`)
- Modify: `frontend/src/produto.js:233-237` (`ROTULOS_PRIVACY`)
- Modify: `frontend/src/views/organizacoes.js:232`
- Test: `frontend/test/casca-menu.test.js:61,63,193`

**Interfaces:**
- Consumes: nada.
- Produces: `ROTULOS_PRIVACY` só com o que difere por módulo.

- [ ] **Step 1: Atualizar o teste da casca para os rótulos novos (falha primeiro)**

Em `frontend/test/casca-menu.test.js`:
- linha 61: `nav-governance=Governança` vira `nav-governance=Papéis e comitê`;
- linha 63: `nav-partes=Partes` vira `nav-partes=Pessoas e parceiros`;
- linha 193: a lista `['Governança', 'Partes', ...]` vira `['Papéis e comitê', 'Pessoas e parceiros', ...]` (os demais itens ficam);
- o `it('Partes e Governança com ícones diferentes'` só muda de nome para `'Pessoas e parceiros e Papéis e comitê com ícones diferentes'`.

Acrescente, no `describe` do menu do n.privacy:

```js
    it('n.privacy: políticas com o mesmo nome do n.iso, e Pessoas separado de Parceiros', () => {
        aplicarCasca('privacy', document);
        const rotulo = (id) => document.querySelector(`#${id} .sidebar-nav-text`).textContent;
        expect(rotulo('nav-documentos')).toBe('Políticas e normas');
        expect(rotulo('nav-governance')).toBe('Papéis e comitê');
        expect(rotulo('nav-partes')).toBe('Pessoas');
        expect(rotulo('nav-terceiros')).toBe('Fornecedores');
        expect(rotulo('nav-sistemas')).toBe('Ativos');
    });
```

(Se o arquivo monta o documento por um auxiliar próprio em vez de `aplicarCasca('privacy', document)`, use o mesmo auxiliar que os testes vizinhos do n.privacy usam; o que importa são as cinco afirmações.)

Run: `cd frontend && npx vitest run test/casca-menu.test.js`
Expected: FAIL nos rótulos novos.

- [ ] **Step 2: Trocar o texto no `login.html`**

No `<span class="sidebar-nav-text">` de cada item:

| Item | De | Para |
|---|---|---|
| `nav-governance` | Governança | Papéis e comitê |
| `nav-partes` | Partes | Pessoas e parceiros |
| `nav-sistemas` | Sistemas | Ativos |
| `nav-terceiros` | Terceiros | Fornecedores |
| `nav-documentos-arquivo` | Documentos | Arquivos |
| `nav-mapa-de-risco` | Mapa de risco | Riscos |

- [ ] **Step 3: Enxugar `ROTULOS_PRIVACY`**

```js
export const ROTULOS_PRIVACY = {
    'nav-encarregado': 'Painel', 'nav-ropa': 'Atividades', 'nav-partes': 'Pessoas', 'nav-requisitos': 'Cobertura da LGPD',
    'nav-titular': 'Solicitações', 'nav-avaliacoes-terceiros': 'Avaliações', 'nav-questionarios-fornecedor': 'Questionários',
};
```

Saem `nav-governance`, `nav-dpia`, `nav-terceiros`, `nav-mapa-de-risco`, `nav-sistemas`, `nav-documentos-arquivo` e `nav-documentos`: o HTML já traz o rótulo certo. Antes de tirar `nav-dpia`, confira que o HTML diz "RIPD": `grep -n 'id="nav-dpia"' -A3 frontend/login.html`. Se não disser, mantenha a entrada.

- [ ] **Step 4: Corrigir o texto do convite**

Em `frontend/src/views/organizacoes.js:232`, a frase

`O administrador recebe por e-mail o convite com a senha provisória, que ele troca no primeiro acesso; a senha não aparece aqui.`

vira

`O administrador recebe por e-mail o link para criar a senha; nenhuma senha aparece aqui.`

- [ ] **Step 5: Rodar**

Run: `cd frontend && npx vitest run && npm run build`
Expected: PASS e build limpo.

Run: `git grep -n "senha provisória" -- frontend/src`
Expected: nada.

- [ ] **Step 6: Commit e PR**

```bash
git add frontend
git commit -m "fix(menu): um rótulo por conceito nos módulos e texto do convite sem senha provisória"
```

Abra o PR1 (rascunho) com as Tasks 1 e 2.

---

## PR2: n.ot no painel e na carteira

### Task 3: bloco do n.ot (`src/services/painel-ot.ts`)

**Files:**
- Create: `src/services/painel-ot.ts`
- Modify: `src/services/ot-sensor.ts` (exportar o tipo `Cred`)
- Test: `test/painel-ot.test.ts`

**Interfaces:**
- Consumes: `sitesPermitidos(db, u, projectId): Promise<string>` (JSON de ids) e `TETO_LEITURA_OT` de `src/services/ot-inventario.ts`; `situacaoSensor(referencia, credenciais, agora)` de `src/services/ot-sensor.ts`; os tipos `ItemFazer`, `Passo`, `Proximo` de `src/services/painel.ts`.
- Produces:

```ts
export type AtorPainelOt = { id: string; role: string; client_project_id?: string | null };
export async function blocoOt(db: D1Database, projectId: string, ator: AtorPainelOt, dia: string, agora: Date): Promise<{
  comecando: boolean; itens: ItemFazer[]; numeros: [string, string][]; proximo: Proximo;
  cobertura: never[]; vencimentos: never[]; riscos: never[]; passos: Passo[];
}>;
```

- [ ] **Step 1: Escrever o teste que falha**

`test/painel-ot.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, seedTwoProjects, habilitarOt } from './helpers/d1';
import { blocoOt } from '../src/services/painel-ot';

// Bloco do n.ot no painel (onda 0). D1 real, linhas semeadas direto.
const DIA = '2026-11-14';
const AGORA = new Date('2026-11-14T15:00:00Z');
const gestor = { id: 'u-g', role: 'org_admin', client_project_id: 'proj-a' };
const tecnico = { id: 'u-t', role: 'org_user', client_project_id: 'proj-a' };
const consultor = { id: 'u-c', role: 'consultor' };

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a', 'proj-b');
  const req = await env.DB.prepare('SELECT id FROM ot_requisitos LIMIT 1').first<{ id: string }>();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-t', 't@cliente.teste', 'x', 'Técnico', 'org_user', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES
      ('s1', 'proj-a', 'SE Norte', 'em_operacao', NULL), ('s2', 'proj-a', 'SE Sul', 'base_em_aprovacao', NULL),
      ('s3', 'proj-a', 'SE Leste', 'em_obra', '2026-11-18T02:59:59Z')`),
    env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's1', 'proj-a', 'x')`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez, situacao, aceito_ate) VALUES
      ('d1', 'proj-a', 's1', 'fluxo', 'k1', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aberto', NULL),
      ('d2', 'proj-a', 's2', 'fluxo', 'k2', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aberto', NULL),
      ('d3', 'proj-a', 's1', 'fluxo', 'k3', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aceito', '2026-11-17T12:00:00Z')`),
    env.DB.prepare(`INSERT INTO ot_lotes (id, project_id, site_id, fonte, status, criado_por) VALUES ('l1', 'proj-a', 's2', 'manual', 'em_revisao', 'u-t')`),
    env.DB.prepare(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, proxima_revisao, atualizado_por) VALUES ('a1', 'proj-a', ?, 'atende', '2026-11-01', 'u-c')`).bind(req!.id),
    env.DB.prepare(`INSERT INTO ot_sensores (id, project_id, site_id, nome, faixa_origem, criado_por, created_at) VALUES ('sn1', 'proj-a', 's1', 'Sonda 1', '10.0.0.0/8', 'u-c', '2026-11-01 00:00:00')`),
  ]);
});

describe('blocoOt', () => {
  it('projeto sem site está começando e não tem item', async () => {
    const b = await blocoOt(env.DB, 'proj-b', consultor, DIA, AGORA);
    expect(b.comecando).toBe(true);
    expect(b.itens).toEqual([]);
    expect(b.passos[0]).toMatchObject({ feito: false, tela: 'ot' });
  });

  it('equipe vê todas as pendências, sem o aceite a vencer (é do Gestor)', async () => {
    const b = await blocoOt(env.DB, 'proj-a', consultor, DIA, AGORA);
    const textos = b.itens.map((i) => i.texto);
    expect(textos).toEqual(expect.arrayContaining(['1 sonda parada', '1 requisito com revisão vencida', '2 desvios abertos', '1 lote aguardando revisão',
      '1 base aguardando aprovação', '1 obra vence em até 7 dias']));
    expect(textos.join(' ')).not.toContain('aceite');
    expect(b.itens.every((i) => i.modulo === 'ot' && i.tela === 'ot')).toBe(true);
    expect(b.numeros).toEqual([['1 de 3', 'sites em operação'], ['2', 'desvios abertos']]);
  });

  it('Gestor ARCiber vê também o aceite a vencer', async () => {
    const b = await blocoOt(env.DB, 'proj-a', gestor, DIA, AGORA);
    expect(b.itens.map((i) => i.texto)).toContain('1 aceite de desvio vence em até 7 dias');
  });

  it('técnico só conta os sites concedidos', async () => {
    const b = await blocoOt(env.DB, 'proj-a', tecnico, DIA, AGORA);
    const textos = b.itens.map((i) => i.texto);
    expect(textos).toContain('1 desvio aberto');
    expect(textos.join(' ')).not.toContain('lote');
    expect(textos.join(' ')).not.toContain('base');
    expect(b.numeros[0]).toEqual(['1 de 1', 'sites em operação']);
  });

  it('nada do bloco leva endereço nem faixa de rede', async () => {
    const corpo = JSON.stringify(await blocoOt(env.DB, 'proj-a', gestor, DIA, AGORA));
    expect(corpo).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(corpo).not.toMatch(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i);
    expect(corpo).not.toContain('Sonda 1');
  });
});
```

Run: `npx vitest run test/painel-ot.test.ts`
Expected: FAIL, `Cannot find module '../src/services/painel-ot'`.

- [ ] **Step 2: Exportar o tipo da credencial**

Em `src/services/ot-sensor.ts`, `type Cred = {...}` vira `export type Cred = {...}`.

- [ ] **Step 3: Implementar**

`src/services/painel-ot.ts`:

```ts
import { sitesPermitidos, TETO_LEITURA_OT } from './ot-inventario';
import { situacaoSensor, type Cred } from './ot-sensor';
import type { ItemFazer, Passo, Proximo } from './painel';

/**
 * Bloco do n.ot no painel de entrada (onda 0, spec 2026-11-14-onda0). Só contagem de pendência e nome de site: nunca IP, MAC,
 * nome de ativo ou de sonda, nem contagem de ativos ou achados (seria oráculo do inventário). Limitado aos sites da pessoa.
 */
export type AtorPainelOt = { id: string; role: string; client_project_id?: string | null };

const DIA_MS = 86_400_000;
const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;
const exemplos = (nomes: string[]) => nomes.slice(0, 3).join(', ') + (nomes.length > 3 ? ` e mais ${nomes.length - 3}` : '');

export async function blocoOt(db: D1Database, projectId: string, ator: AtorPainelOt, dia: string, agora: Date) {
  const sites = await sitesPermitidos(db, ator, projectId);
  const em7 = new Date(Date.parse(dia) + 7 * DIA_MS).toISOString().slice(0, 10);
  const gestor = ator.role === 'org_admin' && ator.client_project_id === projectId;
  const NO_SITE = 'site_id IN (SELECT value FROM json_each(?2))';
  const [sts, cont, sondas, creds] = await db.batch([
    db.prepare(`SELECT id, nome, fase, substr(obra_ate, 1, 10) AS obra_ate FROM ot_sites
      WHERE project_id = ?1 AND status = 'ativo' AND id IN (SELECT value FROM json_each(?2)) ORDER BY nome LIMIT ${TETO_LEITURA_OT}`).bind(projectId, sites),
    db.prepare(`SELECT
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aberto') AS desvios,
        (SELECT count(*) FROM ot_lotes WHERE project_id = ?1 AND ${NO_SITE} AND status = 'em_revisao') AS lotes,
        (SELECT count(*) FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aceito' AND substr(aceito_ate, 1, 10) <= ?3) AS aceites,
        (SELECT count(*) FROM ot_avaliacoes WHERE project_id = ?1 AND proxima_revisao IS NOT NULL AND proxima_revisao < ?4) AS revisoes`)
      .bind(projectId, sites, em7, dia),
    db.prepare(`SELECT s.id, s.site_id, s.created_at,
        (SELECT created_at FROM ot_sensor_envios e WHERE e.sensor_id = s.id AND e.situacao = 'concluido' ORDER BY e.created_at DESC LIMIT 1) AS ultimo_envio
      FROM ot_sensores s WHERE s.project_id = ?1 AND s.situacao = 'ativa' AND s.${NO_SITE} LIMIT ${TETO_LEITURA_OT}`).bind(projectId, sites),
    db.prepare(`SELECT sensor_id, expira_em, situacao FROM ot_sensor_credenciais WHERE project_id = ?1 AND situacao = 'ativa' AND expira_em > ?2 LIMIT ${TETO_LEITURA_OT}`)
      .bind(projectId, agora.toISOString()),
  ]);
  const lista = sts.results as { id: string; nome: string; fase: string; obra_ate: string | null }[];
  const c = cont.results[0] as { desvios: number; lotes: number; aceites: number; revisoes: number };
  const cs = creds.results as (Cred & { sensor_id: string })[];
  const paradas = (sondas.results as { id: string; site_id: string; created_at: string; ultimo_envio: string | null }[])
    .filter((s) => situacaoSensor(s.ultimo_envio ?? s.created_at, cs.filter((k) => k.sensor_id === s.id), agora) === 'parada');
  const nome = (id: string) => lista.find((s) => s.id === id)?.nome ?? '';
  const emAprovacao = lista.filter((s) => s.fase === 'base_em_aprovacao');
  const obras = lista.filter((s) => s.fase === 'em_obra' && s.obra_ate && s.obra_ate <= em7);

  const item = (grupo: ItemFazer['grupo'], q: number, um: string, varios: string, contexto: string, acao: string, aba: string): ItemFazer[] =>
    q > 0 ? [{ grupo, quando: grupo === 'atraso' ? 'Agora' : 'Nesta semana', texto: plural(q, um, varios), contexto, acao, tela: 'ot', aba, modulo: 'ot' }] : [];
  const itens: ItemFazer[] = [
    ...item('atraso', paradas.length, 'sonda parada', 'sondas paradas', exemplos([...new Set(paradas.map((s) => nome(s.site_id)))]), 'Ver as sondas', 'acessos'),
    ...item('atraso', c.revisoes, 'requisito com revisão vencida', 'requisitos com revisão vencida', 'Assessment da RO-CB.BR.01', 'Abrir o assessment', 'assessment'),
    ...item('semana', c.desvios, 'desvio aberto', 'desvios abertos', 'O sensor viu o que não está na base aprovada', 'Ver os desvios', 'sites'),
    ...item('semana', c.lotes, 'lote aguardando revisão', 'lotes aguardando revisão', 'Coleta enviada, esperando quem aprova', 'Revisar os lotes', 'sites'),
    ...item('semana', emAprovacao.length, 'base aguardando aprovação', 'bases aguardando aprovação', exemplos(emAprovacao.map((s) => s.nome)), 'Abrir os sites', 'sites'),
    ...item('semana', obras.length, 'obra vence em até 7 dias', 'obras vencem em até 7 dias', exemplos(obras.map((s) => s.nome)), 'Abrir os sites', 'sites'),
    ...(gestor ? item('semana', c.aceites, 'aceite de desvio vence em até 7 dias', 'aceites de desvio vencem em até 7 dias', 'Depois do prazo, o desvio reabre', 'Ver os desvios', 'sites') : []),
  ];
  const comecando = lista.length === 0;
  return {
    comecando, itens, proximo: null as Proximo,
    numeros: [[`${lista.filter((s) => s.fase === 'em_operacao').length} de ${lista.length}`, 'sites em operação'], [String(c.desvios), 'desvios abertos']] as [string, string][],
    cobertura: [] as never[], vencimentos: [] as never[], riscos: [] as never[],
    passos: [{ texto: 'Cadastrar o primeiro site', contexto: 'O inventário do n.ot começa pelo site', feito: !comecando, acao: 'Abrir o n.ot', tela: 'ot' }] as Passo[],
  };
}
```

Notas para quem implementa:
- `sitesPermitidos` recebe o tipo `AtorOt` daquele arquivo; se `AtorPainelOt` não for atribuível, importe e use `AtorOt` no lugar (não crie conversão).
- `ItemFazer['modulo']` é `Modulo`, que já inclui `'ot'`.
- Se o `Grupo` de `painel.ts` não for exportado, o tipo `ItemFazer['grupo']` já basta.

- [ ] **Step 4: Rodar**

Run: `npx tsc --noEmit && npx vitest run test/painel-ot.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/services/painel-ot.ts src/services/ot-sensor.ts test/painel-ot.test.ts
git commit -m "feat(painel): bloco do n.ot com pendências por site, sem dado sensível"
```

### Task 4: n.ot em `painelDoProjeto`, na rota e na carteira

**Files:**
- Modify: `src/services/painel.ts` (`QuemPede`, `painelDoProjeto`, `situacaoNaCarteira`, `carteira`)
- Modify: `src/routes/painel.ts`
- Test: `test/painel-ot-rota.test.ts`

**Interfaces:**
- Consumes: `blocoOt` e `AtorPainelOt` da Task 3.
- Produces:
  - `QuemPede = { id?: string; email?: string; cliente: boolean; role?: string; client_project_id?: string | null }`
  - `GET /api/v1/projects/:id/painel` aceita `?modulo=ot` e devolve `modulos.ot = { saude, numeros, comecando, fazer?, cobertura?, vencimentos?, riscos?, passos? }`
  - `carteira(db, visiveis, modulosDaPessoa, agora?: Date)`; `situacaoNaCarteira` aceita `desvios_abertos`, `lotes_revisao` e `sondas_paradas` (opcionais, padrão 0) e `sites` (opcional, padrão 0).

- [ ] **Step 1: Escrever o teste que falha**

`test/painel-ot-rota.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, seedTwoProjects, habilitarOt, concederModulos, designarConsultor, sessionFor, workerEnv } from './helpers/d1';
import { situacaoNaCarteira } from '../src/services/painel';

// n.ot no painel e na carteira (onda 0): rota contra o D1 real.
type H = Record<string, string>;
const chamar = (h: H, caminho: string) => app.fetch(new Request('http://localhost' + caminho, { headers: h }), workerEnv() as any);
let gestor: H, semOt: H, cons: H;

beforeAll(async () => {
  await applySchema(); await seedTwoProjects(); await habilitarOt('proj-a');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'proj-a'), ('u-s', 's@cliente.teste', 'x', 'Sem OT', 'org_admin', 'proj-a')`),
    env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome, fase) VALUES ('s1', 'proj-a', 'SE Norte', 'em_operacao')`),
    env.DB.prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez) VALUES
      ('d1', 'proj-a', 's1', 'fluxo', 'k1', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')`),
  ]);
  await concederModulos(['u-g'], ['iso', 'ot']);
  await concederModulos(['u-s'], ['iso']);
  await designarConsultor('c@ness.lat', 'proj-a');
  const c = await env.DB.prepare(`SELECT id FROM users WHERE email = 'c@ness.lat'`).first<{ id: string }>();
  await concederModulos([c!.id], ['iso', 'ot']);
  gestor = await sessionFor({ id: 'u-g', email: 'g@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  semOt = await sessionFor({ id: 'u-s', email: 's@cliente.teste', role: 'org_admin', client_project_id: 'proj-a' });
  cons = await sessionFor({ id: c!.id, email: 'c@ness.lat', role: 'consultor' });
});

describe('painel com o n.ot', () => {
  it('?modulo=ot devolve o bloco para quem tem o módulo', async () => {
    const r = await chamar(cons, '/api/v1/projects/proj-a/painel?modulo=ot');
    expect(r.status).toBe(200);
    const d = await r.json() as any;
    expect(d.modulos.ot.comecando).toBe(false);
    expect(d.modulos.ot.fazer.map((i: any) => i.texto)).toContain('1 desvio aberto');
    expect(d.programa.estado).not.toBe('comecando');
  });

  it('cliente recebe só a frase e os números', async () => {
    const d = await (await chamar(gestor, '/api/v1/projects/proj-a/painel?modulo=ot')).json() as any;
    expect(d.modulos.ot.numeros).toEqual([['1 de 1', 'sites em operação'], ['1', 'desvios abertos']]);
    expect(d.modulos.ot.fazer).toBeUndefined();
  });

  it('pessoa sem o módulo: 403 no pedido direto e nada do n.ot no painel geral', async () => {
    expect((await chamar(semOt, '/api/v1/projects/proj-a/painel?modulo=ot')).status).toBe(403);
    const d = await (await chamar(semOt, '/api/v1/projects/proj-a/painel')).json() as any;
    expect(d.modulos.ot).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain('desvio');
  });

  it('projeto sem o n.ot: 403', async () => {
    expect((await chamar(cons, '/api/v1/projects/proj-b/painel?modulo=ot')).status).toBe(403);
  });

  it('chave de API nunca recebe o n.ot (P0-2)', async () => {
    const chave = await sessionFor({ id: 'apikey:k1', email: 'k@x', role: 'client', client_project_id: 'proj-a' });
    expect((await chamar(chave, '/api/v1/projects/proj-a/painel?modulo=ot')).status).toBe(403);
  });
});

describe('carteira com o n.ot', () => {
  it('função pura: desvio aberto e sonda parada pedem atenção e apontam para o n.ot', () => {
    const base = { modulos: ['ot'] as any, pedidos_atrasados: 0, comunicacoes_atrasadas: 0, acoes_vencidas: 0, terceiros_vencidos: 0, vence_7_dias: 0,
      tratamentos: 0, controles: 0, proximo: null };
    expect(situacaoNaCarteira({ ...base, sites: 1, desvios_abertos: 2, sondas_paradas: 1 }))
      .toMatchObject({ tom: 'atraso', modulo: 'ot', situacao: '1 sonda parada', urgente: '1 sonda parada e 2 desvios abertos' });
    expect(situacaoNaCarteira({ ...base, sites: 1, desvios_abertos: 2 })).toMatchObject({ tom: 'semana', modulo: 'ot', situacao: '2 desvios abertos' });
    expect(situacaoNaCarteira({ ...base, sites: 1 })).toMatchObject({ tom: 'ok', situacao: 'Em dia' });
    expect(situacaoNaCarteira({ ...base, sites: 0 })).toMatchObject({ situacao: 'Começando' });
  });

  it('rota: o consultor com o módulo vê o desvio; quem não tem o módulo não vê', async () => {
    const d = await (await chamar(cons, '/api/v1/carteira')).json() as any;
    expect(d.projetos.find((p: any) => p.id === 'proj-a')).toMatchObject({ situacao: '1 desvio aberto', modulo_urgente: 'ot' });
    const s = await (await chamar(semOt, '/api/v1/carteira')).json() as any;
    expect(JSON.stringify(s)).not.toContain('desvio');
  });
});
```

Se `sessionFor` com `id: 'apikey:k1'` não reproduzir o principal de chave de API deste repositório, use no lugar o mesmo arranjo de chave de `test/ot-modulo.test.ts` (o teste que já prova o 403 do `otApp` a `apikey:`).

Run: `npx vitest run test/painel-ot-rota.test.ts`
Expected: FAIL (400 "Módulo desconhecido" no primeiro; `sites` não existe no tipo).

- [ ] **Step 2: Rota**

Em `src/routes/painel.ts`, dentro do handler do painel:

```ts
    if (pedido !== undefined && !ehModulo(pedido)) return c.json({ error: 'Módulo desconhecido: use iso, privacy ou ot' }, 400);
    const doProjeto = await modulosDoProjeto(c.env.DB, projectId);
    if (!doProjeto.length) return c.json({ error: 'Projeto não encontrado' }, 404);
    // P0-2 do n.ot: chave de API e agente MCP nunca leem nada do n.ot, nem resumo.
    const semOt = user?.agente === true || !!user?.id?.startsWith('apikey:');
    const daPessoa = (await modulosDaPessoa(c.env.DB, user)).filter((m) => !(semOt && m === 'ot'));
```

e a chamada final passa o papel:

```ts
    return c.json(await painelDoProjeto(c.env.DB, projectId, modulos, { id: user?.id, email: user?.email, cliente, role: user?.role, client_project_id: user?.client_project_id }));
```

Na carteira, a mesma trava:

```ts
    const semOt = user?.agente === true || !!user?.id?.startsWith('apikey:');
    const projetos = await carteira(c.env.DB, projetosVisiveis(user), (await modulosDaPessoa(c.env.DB, user)).filter((m) => !(semOt && m === 'ot')));
```

O comentário do topo do arquivo passa a dizer `?modulo=iso|privacy|ot`.

- [ ] **Step 3: `painelDoProjeto`**

Em `src/services/painel.ts`:

```ts
import { blocoOt } from './painel-ot';
export type QuemPede = { id?: string; email?: string; cliente: boolean; role?: string; client_project_id?: string | null };
```

Depois das linhas que montam `iso` e `privacy`:

```ts
  const ot = modulos.includes('ot') && quem.id
    ? await blocoOt(db, projectId, { id: quem.id, role: quem.role ?? '', client_project_id: quem.client_project_id }, dia, new Date()) : null;
```

`programa` passa a considerar o n.ot:

```ts
  const programa = estadoDoPrograma((marco.results[0] as { d: string | null } | undefined)?.d ?? null, c.tratamentos > 0 || c.controles > 0 || (!!ot && !ot.comecando));
```

`blocos` ganha o n.ot (o comentário "Partial: o n.ot ainda não tem bloco" sai):

```ts
  const blocos = { ...(privacy ? { privacy } : {}), ...(iso ? { iso } : {}), ...(ot ? { ot } : {}) } as Partial<Record<Modulo, NonNullable<typeof iso> | NonNullable<typeof privacy> | NonNullable<typeof ot>>>;
```

O laço que monta `modulosResp` não muda: o bloco do n.ot tem `itens`, `comecando`, `proximo`, `numeros`, `cobertura`, `vencimentos`, `riscos` e `passos`.

- [ ] **Step 4: Carteira**

`situacaoNaCarteira` ganha os campos opcionais e o ramo do n.ot. Assinatura:

```ts
export function situacaoNaCarteira(x: {
  modulos: Modulo[]; pedidos_atrasados: number; comunicacoes_atrasadas: number; acoes_vencidas: number; terceiros_vencidos: number;
  vence_7_dias: number; tratamentos: number; controles: number; proximo: { data: string; rotulo: string } | null;
  sites?: number; desvios_abertos?: number; lotes_revisao?: number; sondas_paradas?: number;
}): { tom: Tom; situacao: string; urgente: string; modulo: Modulo } {
```

Logo depois do `if (outros > 0) {...}` e antes do "Começando":

```ts
  const temOt = x.modulos.includes('ot');
  const sondas = temOt ? x.sondas_paradas ?? 0 : 0;
  const desvios = temOt ? x.desvios_abertos ?? 0 : 0;
  const lotes = temOt ? x.lotes_revisao ?? 0 : 0;
  const doOt = [sondas ? plural(sondas, 'sonda parada', 'sondas paradas') : '', desvios ? plural(desvios, 'desvio aberto', 'desvios abertos') : '',
    lotes ? plural(lotes, 'lote aguardando revisão', 'lotes aguardando revisão') : ''].filter(Boolean);
  if (sondas > 0) return { tom: 'atraso', situacao: doOt[0], urgente: doOt.join(' e '), modulo: 'ot' };
  if (doOt.length) return { tom: 'semana', situacao: doOt[0], urgente: doOt.join(' e '), modulo: 'ot' };
```

e a linha do "Começando" passa a considerar os sites:

```ts
  if (x.tratamentos === 0 && x.controles === 0 && !(temOt && (x.sites ?? 0) > 0)) return { tom: 'plano', situacao: 'Começando', urgente: 'Nada cadastrado ainda', modulo: primeiro };
```

Em `carteira`, a assinatura ganha `agora = new Date()` e o `db.batch` ganha três consultas no fim (só quando a pessoa tem `ot`; senão `db.prepare('SELECT 1 WHERE 0')` nas três posições):

```ts
    b(`SELECT s.project_id,
         count(*) AS sites,
         (SELECT count(*) FROM ot_desvios d WHERE d.project_id = s.project_id AND d.situacao = 'aberto') AS desvios_abertos,
         (SELECT count(*) FROM ot_lotes l WHERE l.project_id = s.project_id AND l.status = 'em_revisao') AS lotes_revisao
       FROM ot_sites s WHERE s.project_id ${escopo} AND s.status = 'ativo' GROUP BY s.project_id`),
    b(`SELECT s.id, s.project_id, s.created_at,
         (SELECT created_at FROM ot_sensor_envios e WHERE e.sensor_id = s.id AND e.situacao = 'concluido' ORDER BY e.created_at DESC LIMIT 1) AS ultimo_envio
       FROM ot_sensores s WHERE s.project_id ${escopo} AND s.situacao = 'ativa' LIMIT ${TETO_LEITURA_OT}`),
    b(`SELECT sensor_id, project_id, expira_em, situacao FROM ot_sensor_credenciais WHERE project_id ${escopo} AND situacao = 'ativa' LIMIT ${TETO_LEITURA_OT}`),
```

(importe `TETO_LEITURA_OT` de `./ot-inventario` e `situacaoSensor`, `type Cred` de `./ot-sensor`). Depois do batch:

```ts
  const oo = porProjeto<{ project_id: string; sites: number; desvios_abertos: number; lotes_revisao: number }>(otContas);
  const sondasPor = porProjeto<{ project_id: string; id: string; created_at: string; ultimo_envio: string | null }>(otSondas);
  const credsOt = otCreds.results as (Cred & { sensor_id: string })[];
  const paradas = (id: string) => (sondasPor.get(id) ?? [])
    .filter((s) => situacaoSensor(s.ultimo_envio ?? s.created_at, credsOt.filter((k) => k.sensor_id === s.id), agora) === 'parada').length;
```

e a chamada de `situacaoNaCarteira` recebe, só quando `modulos.includes('ot')`:

```ts
      sites: oo.get(p.id)?.[0]?.sites ?? 0, desvios_abertos: oo.get(p.id)?.[0]?.desvios_abertos ?? 0,
      lotes_revisao: oo.get(p.id)?.[0]?.lotes_revisao ?? 0, sondas_paradas: paradas(p.id),
```

`situacaoSensor` já descarta credencial vencida; por isso a consulta de credenciais não filtra `expira_em`.

Limite conhecido, registrado no código com um comentário de uma linha: a carteira conta todos os sites do projeto; o técnico (`org_user`) alcança um projeto só e vê a contagem por site no painel do projeto.

```ts
  // shortcut: a carteira conta o projeto inteiro, sem o corte por site do técnico; quando org_user tiver carteira de vários projetos, aplicar sitesPermitidos.
```

- [ ] **Step 5: Rodar**

Run: `npx tsc --noEmit && npx vitest run test/painel-ot-rota.test.ts test/painel-ot.test.ts test/painel.test.ts test/painel-iso-ligacoes.test.ts test/auth-idas-ao-banco.test.ts test/ot-modulo.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/painel.ts src/routes/painel.ts test/painel-ot-rota.test.ts
git commit -m "feat(painel): n.ot no painel do projeto e na carteira, só para quem tem o módulo"
```

### Task 5: linha do n.ot na tela do painel

**Files:**
- Modify: `frontend/src/views/painel.js` (`MODULOS`, `marca`, `TELAS_DO_PAINEL`, `painelAbrir`, a linha 215, `abrirModulo`)
- Test: `frontend/test/painel-view.test.js` (o `it` da linha 229 muda; um novo entra)

**Interfaces:**
- Consumes: `modulos.ot` do painel (Task 4), com `fazer[].tela === 'ot'` e `fazer[].aba` em `'sites' | 'assessment' | 'acessos'`.
- Produces: nada para outras tarefas.

- [ ] **Step 1: Trocar o teste antigo e escrever o novo**

O `it('projeto com o n.ot: o painel o ignora (sem linha nem bloco) e não quebra'` vira:

```js
    it('projeto com o n.ot: a linha aparece só quando o servidor mandou o bloco', async () => {
        S.user = { id: 'u1', role: 'consultor', modulos: ['iso', 'privacy', 'ot'] };
        S.activeProject = { id: 'p9', modulos: ['iso', 'privacy', 'ot'] }; S.projects = [S.activeProject];
        const ot = { saude: { tom: 'semana', rotulo: 'Atenção', frase: '2 desvios abertos.', apoio: '' }, numeros: [['1 de 3', 'sites em operação'], ['2', 'desvios abertos']],
            comecando: false, cobertura: [], vencimentos: [], riscos: [], passos: [],
            fazer: [{ grupo: 'semana', quando: 'Nesta semana', texto: '2 desvios abertos', contexto: '', acao: 'Ver os desvios', tela: 'ot', aba: 'sites', modulo: 'ot' }] };
        servir({ 'GET /api/v1/projects/p9/painel': PAINEL({ modulos: { iso: BLOCO(), privacy: BLOCO(), ot } }), 'GET /api/v1/projects/p9/ponto-de-partida': { cadastro: {} } });
        await abrir('n360');
        expect([...el('c').querySelectorAll('.pn-m h3')].map((x) => x.textContent)).toEqual(['n.iso', 'n.privacy', 'n.ot']);
        expect([...el('c').querySelectorAll('[data-action="abrirModulo"]')].map((b) => b.textContent)).toContain('Abrir o n.ot');
        window.painelAbrir('ot', 'sites', null);
        expect(S.otTela).toBe('sites');
        window.abrirModulo('ot');
        expect(irPara).toHaveBeenCalledWith('/ot');
    });

    it('sem bloco do n.ot na resposta: nenhuma linha do n.ot, nem "não habilitado"', async () => {
        S.user = { id: 'u1', role: 'consultor', modulos: ['iso', 'privacy'] };
        S.activeProject = { id: 'p9', modulos: ['iso', 'privacy', 'ot'] }; S.projects = [S.activeProject];
        servir({ 'GET /api/v1/projects/p9/painel': PAINEL({ modulos: { iso: BLOCO(), privacy: BLOCO() } }), 'GET /api/v1/projects/p9/ponto-de-partida': { cadastro: {} } });
        await abrir('n360');
        expect([...el('c').querySelectorAll('.pn-m h3')].map((x) => x.textContent)).toEqual(['n.iso', 'n.privacy']);
        expect(el('c').textContent).not.toContain('n.ot');
    });
```

Run: `cd frontend && npx vitest run test/painel-view.test.js`
Expected: FAIL no primeiro (`['n.iso', 'n.privacy']`).

- [ ] **Step 2: Implementar**

Em `frontend/src/views/painel.js`:

```js
// O n.ot só ganha linha quando o servidor mandou o bloco (módulo no projeto E na pessoa): nunca "não habilitado" (P0-1).
const MODULOS = ['iso', 'privacy'];
const modulosDaTela = (d) => (d.modulos && d.modulos.ot ? [...MODULOS, 'ot'] : MODULOS);
const marca = (m) => `n<span class="pn-ponto">.</span>${m}`;
```

Na linha que desenha as linhas dos módulos (hoje `MODULOS.map((m) => linhaModulo(m, d, proj))`), troque `MODULOS` por `modulosDaTela(d)`.

`TELAS_DO_PAINEL` ganha `'ot'`.

Em `window.painelAbrir`, antes da linha do `filtroPainel`:

```js
    // Item do n.ot: a aba é a tela de dentro do módulo (views/ot.js lê S.otTela).
    if (tela === 'ot' && ['sites', 'assessment', 'acessos'].includes(aba)) S.otTela = aba;
```

`window.abrirModulo` passa a aceitar o n.ot:

```js
window.abrirModulo = function abrirModulo(m) {
    if (MODULOS.includes(m) || m === 'ot') irPara(enderecoDoProduto(m));
};
```

Confira que `enderecoDoProduto('ot')` devolve `/ot`: `grep -n "enderecoDoProduto" -A4 frontend/src/produto.js`. Se a descrição do módulo vem de `DESCRICAO_DO_MODULO` (`frontend/src/produto.js`) e não há entrada para `ot`, acrescente `ot: 'ARCiber: inventário, coleta e conformidade da rede operativa'`.

O comentário "O n.ot ainda não tem bloco no painel (N1)" sai.

- [ ] **Step 3: Rodar**

Run: `cd frontend && npx vitest run && npm run build`
Expected: PASS e build limpo.

- [ ] **Step 4: Conferir na aplicação**

Suba o app local (`npx wrangler dev`, com o build do frontend feito), entre com uma conta que tenha `ot` num projeto com site e desvio aberto, abra `/` e confira: a linha "n.ot" aparece, "Abrir o n.ot" leva a `/ot`, o item "N desvios abertos" abre a tela Sites. Com uma conta sem `ot`, a linha não aparece. Cole no PR o que viu.

- [ ] **Step 5: Commit e PR**

```bash
git add frontend/src/views/painel.js frontend/src/produto.js frontend/test/painel-view.test.js
git commit -m "feat(painel): linha do n.ot no início do n.360"
```

Abra o PR2 (rascunho) com as Tasks 3 a 5.

---

## PR3: avisos de prazo do n.ot

### Task 6: três fontes com a faixa `ot`

**Files:**
- Modify: `src/services/avisos-prazo.ts` (`Fonte`, `FONTES`, `ROTULO`, `TELA`, `FAIXA_DA_FONTE`, `tituloDoAviso`, `itensDoDia`, `avisosDePrazo`)
- Test: `test/avisos-prazo-ot.test.ts`

**Interfaces:**
- Consumes: `escolherDestinatarios`, `pessoasDoProjeto`, `Pessoa` do próprio arquivo.
- Produces: fontes `ot_aceite`, `ot_obra`, `ot_revisao`; `SO_GESTOR: Set<Fonte>`.

- [ ] **Step 1: Escrever o teste que falha**

`test/avisos-prazo-ot.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, resetData, workerEnv, habilitarOt, concederModulos, designarConsultor } from './helpers/d1';
import { itensDoDia, avisosDePrazo } from '../src/services/avisos-prazo';

// Avisos de prazo do n.ot (onda 0). D1 real; HOJE é simulado pelo parâmetro.
const HOJE = '2026-11-14';
const db = () => env.DB;
const sinos = async (user: string) => (await db().prepare('SELECT type, title, message, link FROM notifications WHERE user_id = ? ORDER BY type').bind(user)
  .all<{ type: string; title: string; message: string; link: string }>()).results;

beforeEach(async () => {
  await applySchema(); await resetData();
  await db().prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('p1', 'Cliente p1', 'ONS', 'Controller', 'Active', 'org_ness')`).run();
  await habilitarOt('p1');
  const req = await db().prepare('SELECT id, codigo FROM ot_requisitos ORDER BY codigo LIMIT 1').first<{ id: string; codigo: string }>();
  await db().batch([
    db().prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES
      ('u-g', 'g@cliente.teste', 'x', 'Gestor', 'org_admin', 'p1'), ('u-o', 'o@cliente.teste', 'x', 'Outro', 'org_admin', 'p1')`),
    db().prepare(`INSERT INTO ot_sites (id, project_id, nome, fase, obra_ate) VALUES ('s1', 'p1', 'SE Norte', 'em_operacao', NULL), ('s2', 'p1', 'SE Sul', 'em_obra', '2026-11-22T02:59:59Z')`),
    db().prepare(`INSERT INTO ot_desvios (id, project_id, site_id, tipo, chave_sensor, dados, primeira_vez, ultima_vez, situacao, aceito_ate) VALUES
      ('d1', 'p1', 's1', 'fluxo', 'k1', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aceito', '2026-11-21T15:00:00Z'),
      ('d2', 'p1', 's1', 'fluxo', 'k2', '{}', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z', 'aberto', NULL)`),
    db().prepare(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, proxima_revisao, atualizado_por) VALUES ('a1', 'p1', ?, 'atende', '2026-11-14', 'x')`).bind(req!.id),
  ]);
  await concederModulos(['u-g'], ['ot']);        // u-o é org_admin do projeto, mas não tem o módulo
  await designarConsultor('c@ness.lat', 'p1');
});

describe('fontes do n.ot', () => {
  it('aceite e obra em D-7, revisão em D0; desvio aberto não entra', async () => {
    const { itens, falhas } = await itensDoDia(db(), HOJE);
    expect(falhas).toEqual([]);
    const ot = itens.filter((i) => i.fonte.startsWith('ot_')).map((i) => [i.fonte, i.item_id, i.marco, i.vence_em]);
    expect(ot).toEqual(expect.arrayContaining([['ot_aceite', 'd1', 'D-7', '2026-11-21'], ['ot_obra', 's2', 'D-7', '2026-11-21'], ['ot_revisao', 'a1', 'D0', '2026-11-14']]));
    expect(ot).toHaveLength(3);
  });

  it('aceite e obra não têm marco de atraso', async () => {
    const { itens } = await itensDoDia(db(), '2026-11-25');
    expect(itens.filter((i) => i.fonte === 'ot_aceite' || i.fonte === 'ot_obra')).toEqual([]);
    expect(itens.find((i) => i.fonte === 'ot_revisao')?.marco).toMatch(/^atraso-/);
  });

  it('aceite e obra vão só ao Gestor ARCiber com o módulo; a revisão, a quem tem o n.ot', async () => {
    const c = await db().prepare(`SELECT id FROM users WHERE email = 'c@ness.lat'`).first<{ id: string }>();
    await concederModulos([c!.id], ['ot']);
    await avisosDePrazo(workerEnv(), HOJE);
    const g = await sinos('u-g');
    expect(g.map((s) => s.type)).toEqual(['prazo_ot_aceite', 'prazo_ot_obra']);
    expect(g.every((s) => s.link === '/projects/p1/ot')).toBe(true);
    expect(await sinos('u-o')).toEqual([]);
    expect((await sinos(c!.id)).map((s) => s.type)).toEqual(['prazo_ot_revisao']);
  });

  it('idempotente, e o texto não leva endereço nem nome de ativo', async () => {
    await avisosDePrazo(workerEnv(), HOJE);
    await avisosDePrazo(workerEnv(), HOJE);
    const g = await sinos('u-g');
    expect(g).toHaveLength(2);
    const texto = JSON.stringify(g);
    expect(texto).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(texto).toContain('SE Sul');
    expect(g.find((s) => s.type === 'prazo_ot_aceite')!.message).toBe('Aceite de desvio no site SE Norte (prazo 21/11/2026)');
  });
});
```

Run: `npx vitest run test/avisos-prazo-ot.test.ts`
Expected: FAIL (nenhum item `ot_*`).

- [ ] **Step 2: Fontes, rótulos, tela e faixa**

Em `src/services/avisos-prazo.ts`:

```ts
export type Fonte = 'capa' | 'checklist' | 'auditoria' | 'certificado' | 'link_auditor' | 'politica' | 'documento' | 'excecao' | 'avaliacao_terceiro' | 'titular_pedido' | 'incidente' | 'evidencia' | 'documento_arquivo' | 'encaminhamento_titular' | 'ot_aceite' | 'ot_obra' | 'ot_revisao';
```

Em `FONTES`, depois de `encaminhamento_titular`:

```ts
  // n.ot (onda 0): só D-7 e D0 para aceite e obra (depois do prazo, reabrirVencidos e encerrarObrasVencidas já agem e avisam).
  // O título leva só o nome do site ou o código do requisito: nunca ativo, IP ou MAC.
  ot_aceite: `SELECT d.id AS item_id, d.project_id, date(d.aceito_ate, '-3 hours') AS vence_em, 'Aceite de desvio no site ' || s.nome AS titulo, NULL AS responsavel
    FROM ot_desvios d JOIN ot_sites s ON s.id = d.site_id AND s.project_id = d.project_id JOIN projects p ON p.id = d.project_id
    WHERE d.situacao = 'aceito' AND d.aceito_ate IS NOT NULL`,
  ot_obra: `SELECT s.id AS item_id, s.project_id, date(s.obra_ate, '-3 hours') AS vence_em, 'Obra do site ' || s.nome AS titulo, NULL AS responsavel
    FROM ot_sites s JOIN projects p ON p.id = s.project_id
    WHERE s.status = 'ativo' AND s.fase = 'em_obra' AND s.obra_ate IS NOT NULL`,
  ot_revisao: `SELECT a.id AS item_id, a.project_id, date(substr(a.proxima_revisao, 1, 10)) AS vence_em, 'Revisão do requisito ' || r.codigo AS titulo, NULL AS responsavel
    FROM ot_avaliacoes a JOIN ot_requisitos r ON r.id = a.requisito_id JOIN projects p ON p.id = a.project_id
    WHERE a.proxima_revisao IS NOT NULL`,
```

Antes de escrever, confira o formato em que `aceito_ate` e `obra_ate` são gravados (`grep -n "aceito_ate\|obra_ate" src/services/ot-desvio.ts src/services/ot-fase.ts`): o `date(x, '-3 hours')` vale para instante em UTC, que é o que o teste semeia. Se o código grava o dia de São Paulo sem hora, use `date(substr(x, 1, 10))` e ajuste as datas semeadas no teste para o mesmo formato.

```ts
// em ROTULO
  ot_aceite: 'Aceite de desvio', ot_obra: 'Obra do site', ot_revisao: 'Revisão do assessment',
// em TELA
  ot_aceite: '/ot', ot_obra: '/ot', ot_revisao: '/ot',
// em FAIXA_DA_FONTE
  ot_aceite: 'ot', ot_obra: 'ot', ot_revisao: 'ot',
```

Logo abaixo de `FAIXA_DA_FONTE`:

```ts
/** Fontes do n.ot que só o Gestor ARCiber do cliente recebe (decisão do dono, 14/11/2026): o `org_admin` do próprio projeto. */
export const SO_GESTOR = new Set<Fonte>(['ot_aceite', 'ot_obra']);
```

- [ ] **Step 3: Sem atraso para aceite e obra**

Em `itensDoDia`, a linha que hoje descarta o D-7 do encaminhamento passa a descartar também o atraso das duas fontes:

```ts
        if (!marco || (fonte === 'encaminhamento_titular' && marco === 'D-7') || (SO_GESTOR.has(fonte) && marco.startsWith('atraso-'))) continue;
```

- [ ] **Step 4: Quem recebe**

Em `avisosDePrazo`, a linha `const destinos = escolherDestinatarios(comModulo, item.responsavel);` vira:

```ts
      // Aceite e obra do n.ot: só o Gestor ARCiber (org_admin do projeto). `pessoasDoProjeto` já prende o cliente ao client_project_id.
      const destinos = SO_GESTOR.has(item.fonte) ? comModulo.filter((p) => p.role === 'org_admin') : escolherDestinatarios(comModulo, item.responsavel);
```

- [ ] **Step 5: Título do sino**

Em `tituloDoAviso`, as três fontes entram na condição que já devolve `${ROTULO[item.fonte]} ${quando(item.marco)}`: acrescente `|| item.fonte === 'ot_aceite' || item.fonte === 'ot_obra' || item.fonte === 'ot_revisao'` àquela linha longa, se ela tiver um texto próprio; se a linha só cai no `return` final, não mexa (o `return` final já serve). Confira lendo a função.

- [ ] **Step 6: Rodar**

Run: `npx tsc --noEmit && npx vitest run test/avisos-prazo-ot.test.ts test/avisos-prazo.test.ts test/emails-avisos.test.ts`
Expected: PASS. Se `test/avisos-prazo.test.ts` tiver um teste que enumera todas as fontes (o mapa `SEMEAR`), acrescente as três com o mesmo `INSERT` do teste novo, para o teste de "toda fonte tem semeadura" continuar passando.

- [ ] **Step 7: Conferir o clique do sino**

Run: `grep -n "prazo_\|/ot" frontend/src/globals.js | sed -n 1,20p`

O `handleNotificationClick` já abre `/projects/:id/ot` no n.ot para o aviso de acesso sensível. Confira que o caminho genérico (`link` terminando em `/ot`) leva ao n.ot para `type` começando com `prazo_ot_`; se a função decide pelo `type`, acrescente `prazo_ot_aceite` e `prazo_ot_obra` abrindo a tela `sites` e `prazo_ot_revisao` abrindo `assessment`, com um teste em `frontend/test/` ao lado do que já cobre `ot_acesso_sensivel` (`git grep -l "ot_acesso_sensivel" -- frontend/test`).

- [ ] **Step 8: Commit e PR**

```bash
git add src/services/avisos-prazo.ts test/avisos-prazo-ot.test.ts test/avisos-prazo.test.ts frontend
git commit -m "feat(avisos): prazos do n.ot (aceite, obra e revisão do assessment) no sino e no resumo"
```

Abra o PR3 (rascunho).

---

## Depois dos três PRs

- [ ] Atualizar o `AGENTS.md`: no parágrafo do n.ot, a frase "o painel ainda não tem bloco do n.ot (`views/painel.js` o ignora)" sai e entra uma linha sobre `src/services/painel-ot.ts` e as três fontes de aviso; em "Rotinas agendadas", as fontes novas. Sem narrativa de entrega.
- [ ] `CHANGELOG.md`: uma entrada por PR.
- [ ] Depois do deploy de cada PR, colar no PR a saída de `curl -s https://n360.ness.com.br/health` com o SHA esperado.

## Fora deste plano

- Renomear "Consultorias" para "Organizações" (onda 1).
- Qualquer mudança de status no banco.
- Bloco do n.ot na visão do encarregado ou nos selos de menu.
