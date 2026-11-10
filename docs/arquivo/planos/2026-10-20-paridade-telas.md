# Paridade com o legado: defeitos e lacunas de tela — plano de implementação

> **Para quem executa (agente):** sub-skill obrigatória: superpowers:subagent-driven-development (recomendado) ou
> superpowers:executing-plans, tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** corrigir os dois defeitos achados na comparação com o legado e fechar as lacunas de tela em que o dado já
existe no n.privacy, sem mudar schema, conteúdo congelado de aprovação nem regra de negócio.

**Arquitetura:** a maior parte das mudanças é no frontend vanilla (`frontend/src/views/*.js`, `frontend/src/atividade/*.js`),
no padrão `co-controles` (busca e selects que filtram na tela a lista já carregada) que `views/gaps.js` usa. No servidor, só
um campo calculado novo (`area`) em três listas e a conta do Painel. Nenhuma migration.

**Tecnologia:** Cloudflare Workers + Hono + D1 (testes com `@cloudflare/vitest-pool-workers` e D1 real), frontend vanilla JS
com testes jsdom (`frontend/test`, `api()` dublado por `vi.mock` ou o fetch por `servir-api.js`).

**Spec:** `docs/arquivo/paridade-legado-2026-10-20.md` (seções "Defeito encontrado" e "Lacunas de tela", itens 5, 7 e o rótulo GDPR).

## Restrições globais

- Texto de tela em português, sem emoji nem itálico; valor do banco por rótulo; data por `formatarData`.
- Todo texto vindo do servidor passa por `escapeHTML`. Nenhum `onclick=` nem `<script>` inline (CSP).
- Uma ação principal por tela; nada de `btn-primary` em linha de tabela.
- Estilo inline só para valor calculado; usar as classes existentes (`co-controles`, `co-campo`, `co-campo-rotulo`, `form-input`, `form-select`).
- Nenhuma mudança em `src/services/pedidos.ts`, em migrations nem em `schema.sql`.
- Toda consulta nova filtra por `project_id`.
- Commits em português, autor `Ricardo Esper <44273656+resper1965@users.noreply.github.com>`, sem `Co-Authored-By` nem rodapé de IA
  (regra de `docs/arquivo/estado-2026-10-20.md`).
- Comandos de teste: backend `npx vitest run test/<arquivo>` na raiz; frontend `cd frontend && npx vitest run test/<arquivo>`.

## Fora deste plano (e por quê)

- Perguntas do RIPD e da LIA, logs com antes e depois, mesclar, CNPJ e responsável do fornecedor: dependem de decisão do dono.
- Plano de ação, aprovações e assunção de risco de fornecedor: escopo do n.tprm.
- Exportar solicitações em CSV: põe o nome do titular num arquivo; é decisão do dono.
- Paginação: muda `renderDataTable`, usado por todas as telas; merece plano próprio.
- Polaridade do teste de impacto: muda o significado das respostas gravadas.

## Mapa de arquivos

| Arquivo | Muda o quê |
|---|---|
| `src/services/painel.ts` | conta "Atividades (RoPA)" pela situação derivada |
| `src/services/riscos-atividade.ts` | exporta `sqlAreaDaAtividade` (o `AREA` de hoje, generalizado) |
| `src/routes/ropa.ts` | `GET /ropa` devolve `area` |
| `src/routes/projects.ts` | `GET /:id/dpia` devolve `area` e `responsavel` |
| `src/services/lia.ts` | `liasDoProjeto` devolve `area` |
| `frontend/src/views/privacy.js` | RoPA: colunas Área e Responsável, busca, filtros; RIPD: colunas, busca, filtro Área |
| `frontend/src/views/lia.js` | coluna Área, busca, filtro Área, botão Word |
| `frontend/src/views/tratamento-ligacoes.js` | botão "Baixar Word" na LIA |
| `frontend/src/views/mapa-de-risco.js` | coluna Estratégia |
| `frontend/src/atividade/aba-riscos.js` | exporta `tratado` |
| `frontend/src/views/gaps.js` | filtro Área; importa `emAtraso` de `aba-gaps.js` |
| `frontend/src/atividade/aba-gaps.js` | prazo e "Em atraso" na lista da ficha; `emAtraso` mora aqui |
| `frontend/src/views/titular.js` | coluna Titular e busca nos pedidos |
| `frontend/src/views/areas.js`, `sistemas.js` | busca |
| `frontend/src/views/documentos-arquivo.js` | coluna Responsável |
| `frontend/src/atividade/aba-medidas.js` | editar medida (modal reaproveitado, `PUT`) |
| `frontend/src/atividade/aba-base.js` | rótulo "+ Base Legal" no GDPR |
| `docs/arquivo/paridade-legado-2026-10-20.md`, `CHANGELOG.md` | registrar o que fechou |

---

### Tarefa 1: Painel conta a aprovação derivada das atividades

**Por quê:** `src/services/painel.ts:162` conta `ropa_records.status = 'Approved'`, mas a aprovação por pedido não grava essa
coluna (`pedidos.ts` só muda o status do RIPD). A situação "Aprovada" vem de `situacaoDaAtividade` (`src/services/ropa-abas/situacao.ts`).

**Arquivos:**
- Modificar: `src/services/painel.ts` (consulta das atividades em `blocoPrivacy` e o `tema('Atividades (RoPA)', …)`)
- Teste: `test/painel.test.ts`

**Interfaces:**
- Consome: `aprovacoesDoProjeto(db, projectId, undefined, 'tratamento')` de `src/services/documentos.ts` e
  `situacaoDaAtividade` de `src/services/ropa-abas/situacao.ts`; no teste, `aprovarTratamentoDeTeste(db, projeto)` de `test/helpers/ropa-abas.ts`.
- Produz: nada novo; o tema `Atividades (RoPA)` mantém `{ feito, andamento, falta }`.

- [ ] **Passo 1: teste que falha.** Em `test/painel.test.ts`, dentro de `describe('GET /projects/:id/painel', …)`, acrescentar:

```ts
  it('atividade aprovada por pedido (sem status Approved gravado) conta como aprovada', async () => {
    await semear();
    const rid = await aprovarTratamentoDeTeste(db(), 'pa'); // status fica nulo; a aprovação vem do pedido com o hash atual
    const m = (await painel(consultor, 'pa', 'privacy')).corpo.modulos.privacy;
    const t = m.cobertura!.find((x) => x.tema === 'Atividades (RoPA)');
    expect(rid).toBe('pa-r');
    expect(t).toMatchObject({ feito: 2, andamento: 1, falta: 1 });
  });
```

e importar o helper no topo: `import { aprovarTratamentoDeTeste } from './helpers/ropa-abas';`.

- [ ] **Passo 2: rodar e ver falhar.** `npx vitest run test/painel.test.ts -t "aprovada por pedido"`.
  Esperado: FAIL, `feito: 1` e `andamento: 2`.

- [ ] **Passo 3: implementar.** Em `blocoPrivacy`, trocar a consulta das atividades por uma que devolve as linhas (sem somar no SQL):

```ts
    // Atividades: a aprovação é DERIVADA dos pedidos (situacaoDaAtividade), não a coluna status; a conta é feita no Worker.
    db.prepare(`SELECT r.id, r.status, r.reaberta_em, (r.base_legal_id IS NULL AND trim(COALESCE(r.legal_basis, '')) = '' AND trim(COALESCE(r.base_gdpr, '')) = ''
              AND NOT EXISTS (SELECT 1 FROM tratamento_bases b WHERE b.ropa_id = r.id AND b.project_id = r.project_id)) AS sem_base
              FROM ropa_records r WHERE r.project_id = ?1 AND COALESCE(r.status, '') <> 'Inactive'`).bind(projectId),
```

Depois do `db.batch`, antes de montar `cobertura`:

```ts
  const aprovacoes = await aprovacoesDoProjeto(db, projectId, undefined, 'tratamento');
  const linhasAtiv = ativ.results as { id: string; status: string | null; reaberta_em: string | null; sem_base: number }[];
  const contaAtiv = { feito: 0, andamento: 0, falta: 0 };
  for (const r of linhasAtiv) {
    const s = situacaoDaAtividade({ status: r.status, reaberta_em: r.reaberta_em, aprovacao: aprovacoes.get(r.id) ?? null, aprovacao_anterior: null });
    if (s.codigo === 'aprovada') contaAtiv.feito++;
    else if (r.status === 'Draft' || r.sem_base) contaAtiv.falta++;
    else contaAtiv.andamento++;
  }
```

e trocar `tema('Atividades (RoPA)', um(ativ), …)` por `tema('Atividades (RoPA)', contaAtiv, …)`. Importar
`aprovacoesDoProjeto` de `./documentos` e `situacaoDaAtividade` de `./ropa-abas/situacao` (conferir se já há import e se não cria
ciclo; se `situacao.ts` importar `painel.ts`, mover nada e importar só a função).

- [ ] **Passo 4: rodar o arquivo inteiro.** `npx vitest run test/painel.test.ts`. Esperado: 19 passam, inclusive
  "cobertura por status" (`feito: 1, andamento: 1, falta: 1`) e o de 500 atividades abaixo de 300 ms.

- [ ] **Passo 5: commit.** `git add src/services/painel.ts test/painel.test.ts && git commit -m "fix(painel): atividades aprovadas contam pela aprovação derivada dos pedidos"`

---

### Tarefa 2: Word da LIA ao alcance (ficha e lista)

**Por quê:** `window.baixarWordLia` existe em `frontend/src/views/tratamento-ligacoes.js` mas nenhum botão o chama.

**Arquivos:**
- Modificar: `frontend/src/views/tratamento-ligacoes.js` (`formularioLia`), `frontend/src/views/lia.js` (`desenhar`)
- Teste: `frontend/test/atividade-base.test.js`, `frontend/test/lia-view.test.js`

**Interfaces:**
- Consome: `window.baixarWordLia(projectId, ropaId)` (já existe), `GET /api/v1/projects/:id/ropa/:rid/lia/docx`.
- Produz: botão `data-action="baixarWordLia"` com `data-args='[projectId, ropaId]'`.

- [ ] **Passo 1: testes que falham.** Em `frontend/test/atividade-base.test.js`, ao lado de "LIA aparece no fim quando exigida":

```js
    it('LIA gravada mostra "Baixar Word" com o projeto e a atividade', async () => {
        const li = { ...SEM_PENDENCIA(), lia_exigida: true };
        const { painel } = await abrir(li, { extra: { [`GET ${P}/lia`]: { lia: { status: 'rascunho', finalidade_legitima: 'x' } } } });
        const b = painel.querySelector('[data-action="baixarWordLia"]');
        expect(b).not.toBeNull();
        expect(b.textContent).toBe('Baixar Word');
    });
    it('sem LIA gravada não há botão de Word', async () => {
        const { painel } = await abrir({ ...SEM_PENDENCIA(), lia_exigida: true }, { extra: { [`GET ${P}/lia`]: { lia: null } } });
        expect(painel.querySelector('[data-action="baixarWordLia"]')).toBeNull();
    });
```

Em `frontend/test/lia-view.test.js`, um caso: lista com `{ ropa_id: 'r1', atividade: 'A', status: 'concluida' }` e
`{ ropa_id: 'r2', atividade: 'B', status: 'faltando' }`; esperar um `[data-action="baixarWordLia"]` só na linha de `r1`
(`JSON.parse(b.dataset.args)` igual a `['p1', 'r1']`, ajustando o id do projeto ao do arquivo).

- [ ] **Passo 2: rodar e ver falhar.** `cd frontend && npx vitest run test/atividade-base.test.js test/lia-view.test.js`.

- [ ] **Passo 3: implementar.** Em `formularioLia`, no bloco de botões, depois do Reabrir/Concluir:

```js
            ${lia ? `<button class="btn btn-sm" data-action="baixarWordLia" data-args='${args(projectId, ropaId)}'>Baixar Word</button>` : ''}
```

Em `lia.js`, na coluna Ações:

```js
        `<button class="btn btn-ghost btn-sm" data-action="abrirAtividade" data-args='${args(daLista.projeto, l.ropa_id, 'base_juridica')}' aria-label="Abrir a atividade: ${escapeHTML(l.atividade)}">Abrir</button>`
            + (l.status !== 'faltando' ? ` <button class="btn btn-ghost btn-sm" data-action="baixarWordLia" data-args='${args(daLista.projeto, l.ropa_id)}' aria-label="Baixar o Word da LIA: ${escapeHTML(l.atividade)}">Word</button>` : ''),
```

e garantir que `lia.js` carregue o handler: `import './tratamento-ligacoes.js';` só se o teste mostrar que `window.baixarWordLia`
não existe na tela LIA (o `main.js` já importa as duas; conferir em `frontend/src/main.js` antes de importar de novo).

- [ ] **Passo 4: rodar e ver passar** (mesmo comando).
- [ ] **Passo 5: commit.** `fix(lia): botão de Word da LIA na ficha e na lista`

---

### Tarefa 3: área da atividade nas listas (servidor)

**Por quê:** RoPA, RIPD e LIA não devolvem a área, que o legado mostra e filtra. O fragmento já existe como `AREA` em
`src/services/riscos-atividade.ts`.

**Arquivos:**
- Modificar: `src/services/riscos-atividade.ts`, `src/routes/ropa.ts` (`projectRopaApp.get('/')`), `src/routes/projects.ts`
  (`projectsApp.get('/:id/dpia')`), `src/services/lia.ts` (`liasDoProjeto` e o tipo `LiaDaLista`)
- Teste: criar `test/listas-area.test.ts`

**Interfaces:**
- Produz: `export const sqlAreaDaAtividade = (ropaId: string, projectId: string) => string` — fragmento SQL que devolve
  `group_concat` dos nomes de `departamentos` ligados por `tratamento_departamentos`, em ordem de nome, separados por `', '`, ou `null`.
  Campos novos nas respostas: `records[].area` (RoPA), `assessments[].area` e `assessments[].responsavel` (RIPD, responsável da
  atividade ligada), `lias[].area` (LIA). Todos `string | null`.

- [ ] **Passo 1: teste que falha.** Criar `test/listas-area.test.ts` no molde de `test/painel.test.ts` (projeto `pa` com
  privacy, consultor com sessão). Semear: `departamentos` `d1` "Gestão" e `d2` "Comercial" em `pa`, `d9` "Outro" em `pb`;
  `ropa_records` `r1` com `legal_basis = 'Legítimo interesse'` e `owner_parte_id = 'pe1'` (parte pessoa "Pessoa Exemplo");
  `tratamento_departamentos` (r1,d2) e (r1,d1); `ropa_records` `r2` sem área; `dpia_assessments` `x1` com `ropa_id = 'r1'`.
  Asserções:

```ts
    const ropa = await (await chamar(consultor, '/api/v1/projects/pa/ropa')).json() as any;
    expect(ropa.records.find((r: any) => r.id === 'r1').area).toBe('Comercial, Gestão');
    expect(ropa.records.find((r: any) => r.id === 'r2').area).toBeNull();
    const dpia = await (await chamar(consultor, '/api/v1/projects/pa/dpia')).json() as any;
    expect(dpia.assessments[0]).toMatchObject({ area: 'Comercial, Gestão', responsavel: 'Pessoa Exemplo' });
    const lias = await (await chamar(consultor, '/api/v1/projects/pa/ropa/lias')).json() as any;
    expect(lias.lias.find((l: any) => l.ropa_id === 'r1').area).toBe('Comercial, Gestão');
```

  E um caso de isolamento: ligar `r1` a `d9` (departamento de outro projeto) direto no banco e conferir que "Outro" não aparece.

- [ ] **Passo 2: rodar e ver falhar.** `npx vitest run test/listas-area.test.ts`.

- [ ] **Passo 3: implementar.**

Em `src/services/riscos-atividade.ts`, trocar o `AREA` por:

```ts
/** As áreas (escopo) da atividade, em ordem de nome e separadas por vírgula; null sem área. Listas do n.privacy filtram por ela. */
export const sqlAreaDaAtividade = (ropaId: string, projectId: string) => `(SELECT group_concat(d.nome, ', ' ORDER BY d.nome) FROM tratamento_departamentos td
  JOIN departamentos d ON d.id = td.departamento_id AND d.project_id = td.project_id WHERE td.ropa_id = ${ropaId} AND td.project_id = ${projectId})`;
const AREA = (t: string) => `${sqlAreaDaAtividade(`${t}.ropa_id`, `${t}.project_id`)} AS area`;
```

Em `ropa.ts`, no `SELECT r.*, pa.nome AS owner_parte_nome, …`, acrescentar `${sqlAreaDaAtividade('r.id', 'r.project_id')} AS area`.

Em `projects.ts` (`GET /:id/dpia`):

```ts
    `SELECT d.*, rr.processing_purpose AS atividade, pr.nome AS responsavel, ${sqlAreaDaAtividade('rr.id', 'rr.project_id')} AS area
       FROM dpia_assessments d
       LEFT JOIN ropa_records rr ON rr.id = d.ropa_id AND rr.project_id = d.project_id
       LEFT JOIN partes pr ON pr.id = rr.owner_parte_id AND pr.project_id = rr.project_id
      WHERE d.project_id = ? ORDER BY d.created_at DESC`
```

Em `lia.ts`, acrescentar `${sqlAreaDaAtividade('r.id', 'r.project_id')} AS area` ao SELECT de `liasDoProjeto`, `area: string | null`
no tipo da linha e `area: r.area ?? null` no `map` (e no tipo `LiaDaLista`).

- [ ] **Passo 4: rodar** `npx vitest run test/listas-area.test.ts test/lia-dpia.test.ts test/ropa-abas-gaps.test.ts test/mapa-de-risco*.test.ts` e
  `npx tsc --noEmit`. Esperado: tudo passa (o `AREA` dos riscos e gaps continua igual).
- [ ] **Passo 5: conferir o contrato de isolamento** `npx vitest run test/contrato-isolamento-org.test.ts` (rota nenhuma é nova; deve passar).
- [ ] **Passo 6: commit.** `feat(listas): área da atividade nas listas de RoPA, RIPD e LIA`

---

### Tarefa 4: lista do RoPA com Área, Responsável, busca e filtros

**Arquivos:**
- Modificar: `frontend/src/views/privacy.js` (`renderROPA`)
- Teste: `frontend/test/privacy-ropa-view.test.js`

**Interfaces:**
- Consome: `records[].area` (Tarefa 3), `records[].owner_parte_nome`, `records[].situacao.{codigo,rotulo}`.
- Produz: `window.filtrarRopa()`; ids `ropa-busca`, `ropa-filtro-area`, `ropa-filtro-situacao`, `ropa-lista`.

- [ ] **Passo 1: testes que falham** (em `privacy-ropa-view.test.js`, com `S.activeProject.modulos = ['privacy']`):

```js
describe('lista do RoPA no n.privacy', () => {
    const LISTA = [
        { id: 'r1', nome: 'Admissão', processing_purpose: 'Admissão', area: 'Gestão', owner_parte_nome: 'Pessoa A', situacao: { codigo: 'aprovada', rotulo: 'Aprovada' } },
        { id: 'r2', nome: 'Câmeras', processing_purpose: 'Câmeras', area: 'Comercial, Gestão', owner_parte_nome: null, situacao: { codigo: 'rascunho', rotulo: 'Rascunho' } },
    ];
    it('colunas Atividade, Área, Responsável, Base legal, Situação, Ações', async () => {
        rotas['/ropa'] = LISTA;
        await window.renderROPA(el('c'), el('h'), el('a'));
        expect([...el('c').querySelectorAll('th')].map((t) => t.textContent.trim())).toEqual(['Atividade', 'Área', 'Responsável', 'Base legal', 'Situação', 'Ações']);
        expect(el('c').textContent).toContain('Pessoa A');
    });
    it('busca sem acento e filtros de área e situação', async () => {
        rotas['/ropa'] = LISTA;
        await window.renderROPA(el('c'), el('h'), el('a'));
        el('ropa-busca').value = 'camera'; window.filtrarRopa();
        expect(el('ropa-lista').textContent).toContain('Câmeras');
        expect(el('ropa-lista').textContent).not.toContain('Admissão');
        el('ropa-busca').value = ''; el('ropa-filtro-area').value = 'Comercial'; window.filtrarRopa();
        expect(el('ropa-lista').textContent).not.toContain('Admissão');
        el('ropa-filtro-area').value = ''; el('ropa-filtro-situacao').value = 'aprovada'; window.filtrarRopa();
        expect(el('ropa-lista').textContent).toContain('Admissão');
        expect(el('ropa-lista').textContent).not.toContain('Câmeras');
    });
});
```

  (Se o `api()` dublado do arquivo devolver `records` em outro formato, seguir o formato que os testes existentes do arquivo usam.)

- [ ] **Passo 2: rodar e ver falhar.** `cd frontend && npx vitest run test/privacy-ropa-view.test.js`.

- [ ] **Passo 3: implementar.** Em `privacy.js`, perto do topo do módulo, o estado e as funções:

```js
    const chaveBusca = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const areasDe = (r) => String(r.area || '').split(', ').filter(Boolean);
    let listaRopa = null; // { proj, records, comPrivacy, entrevista, vazio }
```

  Em `renderROPA`, no ramo `comPrivacy`, as colunas passam a `['Atividade', 'Área', 'Responsável', 'Base legal', 'Situação', 'Ações']`
  (nenhuma coluna sai: os testes atuais leem a base legal na lista). As células novas, depois da Atividade:
  `escapeHTML(r.area || '—')` e `escapeHTML(r.owner_parte_nome || '—')`. Extrair o `renderDataTable` para `tabelaRopa(filtrar)`,
  que lê `ropa-busca` (nome ou finalidade), `ropa-filtro-area` (`areasDe(r).includes(area)`) e `ropa-filtro-situacao`
  (`r.situacao.codigo`), e devolve a tabela; com filtro ativo e nada achado, `emptyState: 'Nenhuma atividade com estes filtros.'`.
  Antes da tabela, só com `comPrivacy && records.length`:

```js
        const opcoesArea = [...new Set(records.flatMap(areasDe))].sort((x, y) => x.localeCompare(y, 'pt-BR'))
            .map((n) => `<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
        const controles = `<div class="co-controles">
            <label class="co-campo"><span class="co-campo-rotulo">Buscar</span><input class="form-input" type="search" id="ropa-busca" maxlength="120" placeholder="Atividade" data-action-input="filtrarRopa"></label>
            <label class="co-campo"><span class="co-campo-rotulo">Área</span><select class="form-select" id="ropa-filtro-area" data-action-change="filtrarRopa"><option value="">Todas</option>${opcoesArea}</select></label>
            <label class="co-campo"><span class="co-campo-rotulo">Situação</span><select class="form-select" id="ropa-filtro-situacao" data-action-change="filtrarRopa"><option value="">Todas</option>
                <option value="rascunho">Rascunho</option><option value="em_revisao">Em Revisão</option><option value="aprovada">Aprovada</option><option value="cancelada">Cancelada</option></select></label></div>`;
```

  e `c.innerHTML = statsHtml + controles + '<div id="ropa-lista">' + tabelaRopa(false) + '</div>'`, com
  `window.filtrarRopa = () => { if (listaRopa && el('ropa-lista')) el('ropa-lista').innerHTML = tabelaRopa(); };`.
  O ramo n.iso (sem privacy) fica exatamente como está.

- [ ] **Passo 4: rodar** o arquivo e `npx vitest run test/catracas-visuais.test.js test/contrato-tela-api.test.js` (frontend).
- [ ] **Passo 5: commit.** `feat(ropa): lista com área, responsável, busca e filtros`

---

### Tarefa 5: lista do RIPD com Área, Responsável, busca e filtro de Área

**Arquivos:** modificar `frontend/src/views/privacy.js` (`tabelaRipd`, `renderDPIA`); teste `frontend/test/privacy-ropa-view.test.js`
(o bloco do RIPD) ou `frontend/test/novo-ripd.test.js`, o que já renderiza `renderDPIA`.

**Interfaces:** consome `assessments[].area` e `.responsavel` (Tarefa 3); produz ids `ripd-busca`, `ripd-filtro-area`.

- [ ] **Passo 1: teste que falha.** Duas linhas (`atividade: 'Admissão', area: 'Gestão', responsavel: 'Pessoa A'` e
  `atividade: 'Câmeras', area: 'Comercial'`): o cabeçalho tem "Área" e "Responsável" logo depois de "Atividade";
  `ripd-busca = 'camera'` deixa só Câmeras; `ripd-filtro-area = 'Gestão'` deixa só Admissão; o filtro de status continua.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.** Colunas: `['Atividade', 'Área', 'Responsável', 'Sistema ou operação', 'Titulares', 'Categorias de dados', 'Risco residual', 'Status', 'Ações']`
  (nenhuma coluna sai; tirar coluna é decisão de desenho fora deste plano). Em `tabelaRipd`, além
  de `st`, ler `ripd-busca` (atividade ou sistema, sem acento) e `ripd-filtro-area`. Em `renderDPIA`, o `filtroRipd` ganha os dois
  controles antes do Status, no mesmo HTML do Passo 3 da Tarefa 4 (ids `ripd-busca`, `ripd-filtro-area`, `data-action-*="filtrarRipd"`).
- [ ] **Passo 4: rodar** o arquivo de teste. **Passo 5: commit.** `feat(ripd): lista com área, responsável e busca`

---

### Tarefa 6: lista da LIA com Área, busca e filtro de Área

**Arquivos:** modificar `frontend/src/views/lia.js`; teste `frontend/test/lia-view.test.js`.

- [ ] **Passo 1: teste que falha.** Cabeçalho `['Atividade', 'Área', 'Situação', 'Conclusão', 'Concluída em', 'Ações']`; busca
  `lia-busca` e select `lia-filtro-area` filtram (mesmo molde da Tarefa 4).
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar** em `renderLia` os controles (busca, Área, a Situação de hoje) e em `desenhar` o filtro:

```js
    const busca = chave(el('lia-busca').value.trim());
    const area = el('lia-filtro-area').value;
    const itens = daLista.lias.filter((l) => (!sit || l.status === sit) && (!busca || chave(l.atividade).includes(busca))
        && (!area || String(l.area || '').split(', ').includes(area)));
```

  com `const chave = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();` no topo do arquivo, e a célula
  `escapeHTML(l.area || '—')` depois da Atividade.
- [ ] **Passo 4: rodar.** **Passo 5: commit.** `feat(lia): lista com área e busca`

---

### Tarefa 7: Riscos com a coluna Estratégia; Gaps com filtro de Área

**Arquivos:** modificar `frontend/src/atividade/aba-riscos.js` (exportar `tratado`), `frontend/src/views/mapa-de-risco.js`
(`desenharLista`), `frontend/src/views/gaps.js` (`renderGaps`, `desenhar`); testes `frontend/test/mapa-de-risco.test.js`,
`frontend/test/gaps-view.test.js`.

**Interfaces:** `export const tratado = (r) => boolean` em `aba-riscos.js` (hoje `const`); a linha do mapa traz `treatment`,
`prazo` (= `treatment_due_date`), `residual_level`.

- [ ] **Passo 1: testes que falham.**
  - Mapa (vista lista): risco com `treatment: 'Accept', prazo: '2026-12-01'` mostra "Aceitar" na coluna Estratégia; risco com
    `treatment: 'Mitigate'` e sem prazo nem residual mostra "—". Cabeçalho:
    `['Atividade', 'Motivo', 'Risco', 'Estratégia', 'Responsável', 'Prazo', 'Status', 'Ações']`.
  - Gaps: com `area: 'Gestão'` e `area: 'Comercial, Gestão'`, o select `gp-filtro-area` tem "Comercial" e "Gestão"; escolher
    "Comercial" deixa só a segunda linha.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.**
  - `aba-riscos.js`: `export const tratado = …` (só a palavra `export`).
  - `mapa-de-risco.js`: importar `ESTRATEGIA_ROTULO, tratado` de `../atividade/aba-riscos.js` e, depois de `rotuloNivel(r.risk_level)`:
    `tratado({ ...r, treatment_due_date: r.prazo }) ? escapeHTML(ESTRATEGIA_ROTULO[r.treatment] || r.treatment || '—') : '—'`.
  - `gaps.js`: um select `gp-filtro-area` entre Buscar e Status, com as áreas distintas (`String(g.area || '').split(', ')`),
    e em `desenhar` a condição `(!area || String(g.area || '').split(', ').includes(area))`.
- [ ] **Passo 4: rodar** os dois testes e `test/atividade-riscos.test.js`. **Passo 5: commit.** `feat(diagnostico): estratégia na lista de riscos e filtro de área nos gaps`

---

### Tarefa 8: Controle de GAPs na ficha com Prazo e "Em atraso"

**Arquivos:** modificar `frontend/src/atividade/aba-gaps.js` (`desenhar`) e `frontend/src/views/gaps.js` (passa a importar
`emAtraso`); teste `frontend/test/atividade-gaps.test.js`.

**Interfaces:** `export const emAtraso = (g) => boolean` passa a morar em `aba-gaps.js` (mesma regra de hoje: status diferente de
`Closed`, `g.prazo` antes de hoje). `gaps.js` troca a definição local por `import { STATUS, abrirGapDaAtividade, emAtraso } from '../atividade/aba-gaps.js'`
e reexporta (`export { emAtraso }`) se algum teste importar de `views/gaps.js` (conferir com `grep -rn "emAtraso" frontend`).

- [ ] **Passo 1: teste que falha.** Na ficha, um gap com `prazo` de ontem e `status: 'Open'` mostra "Prazo: dd/mm/aaaa" e o selo
  "Em atraso"; outro com `status: 'Closed'` e prazo passado mostra "Concluído" e nenhum "Em atraso".
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.** Na linha do gap em `desenhar`, depois do Responsável:

```js
                <span><span class="t-dim">Prazo:</span> ${escapeHTML(g.prazo ? formatarData(g.prazo) : 'sem prazo')}</span>
                <span><span class="t-dim">Status:</span> ${emAtraso(g) ? window.renderStatusBadge('Em atraso', 'danger') : escapeHTML(ROTULO_STATUS[g.status] || g.status)}</span>
```

  (substituindo o `<span>` de Status atual), importando `formatarData` de `../ui.js`.
- [ ] **Passo 4: rodar** `atividade-gaps.test.js` e `gaps-view.test.js`. **Passo 5: commit.** `feat(gaps): prazo e atraso na aba de gaps da atividade`

---

### Tarefa 9: Solicitações com a coluna Titular e busca

**Arquivos:** modificar `frontend/src/views/titular.js` (`tabelaPedidos` e a montagem dos filtros); teste `frontend/test/titular-view.test.js`.

**Interfaces:** consome `pedidos[].titular_nome` (a rota já devolve, `COLS` de `src/services/titular-pedidos.ts`). Produz o id `pt-busca`.

- [ ] **Passo 1: teste que falha.** Cabeçalho com "Titular" depois de "Protocolo"; `pt-busca` filtra por protocolo ou nome, sem acento.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.** Em `tabelaPedidos`, `const busca = filtrar && el('pt-busca') ? chave(el('pt-busca').value.trim()) : ''`
  e a condição `(!busca || [p.protocolo, p.titular_nome].some((t) => chave(t).includes(busca)))`; nova coluna
  `escapeHTML(p.titular_nome || '—')`, ficando `['Protocolo', 'Titular', 'Tipo', 'Canal', 'Recebido em', 'Prazo', 'Respondido em', 'Situação', 'Status', 'Ações']`
  (nenhuma coluna sai). O campo
  Buscar entra antes de Tipo nos `co-controles`, com `data-action-input="filtrarPedidosTitular"`. A busca é na tela: o nome não
  vai para a URL nem para o servidor.
- [ ] **Passo 4: rodar.** **Passo 5: commit.** `feat(titular): coluna do titular e busca na lista de pedidos`

---

### Tarefa 10: busca em Áreas e Ativos; Responsável em Documentos

**Arquivos:** modificar `frontend/src/views/areas.js`, `frontend/src/views/sistemas.js`, `frontend/src/views/documentos-arquivo.js`;
testes `frontend/test/areas-sistemas-view.test.js`, `frontend/test/documentos-arquivo-view.test.js`.

- [ ] **Passo 1: testes que falham.** Áreas: `ar-busca = 'gest'` deixa só "Gestão" (busca no nome e na descrição). Ativos:
  `si-busca` no nome e na descrição. Documentos: cabeçalho `['Nome', 'Tipo', 'Responsável', 'Vencimento', 'Status', 'Ações']`, com o
  `responsavel_nome` que a rota já devolve.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.** Em `areas.js` e `sistemas.js`, guardar a lista carregada num `let`, mover o `renderDataTable` para
  uma função `tabela()` e acrescentar, só com lista não vazia, o controle:

```js
`<div class="co-controles"><label class="co-campo"><span class="co-campo-rotulo">Buscar</span><input class="form-input" type="search" id="ar-busca" maxlength="120" placeholder="Área ou descrição" data-action-input="filtrarAreas"></label></div><div id="ar-lista"></div>`
```

  (em `sistemas.js`: `si-busca`, `si-lista`, `filtrarSistemas`, placeholder "Ativo ou descrição"), com a mesma `chave` sem acento.
  Em `documentos-arquivo.js`, a coluna `escapeHTML(d.responsavel_nome || '—')` depois de Tipo.
- [ ] **Passo 4: rodar.** **Passo 5: commit.** `feat(cadastros): busca em áreas e ativos e responsável na lista de documentos`

---

### Tarefa 11: editar a medida de segurança; rótulo do GDPR

**Arquivos:** modificar `frontend/src/atividade/aba-medidas.js` (`linha`, `montar`, `abrirModal`) e `frontend/src/atividade/aba-base.js`
(botão do GDPR); testes `frontend/test/atividade-medidas.test.js`, `frontend/test/atividade-base.test.js`.

**Interfaces:** consome `PUT /api/v1/projects/:id/ropa/:rid/medidas/:mid` com `medidaAtualizarSchema` (parcial de
`{ medida, status, descricao, controle_id }`, `src/schemas/ropa-abas.ts`). `abrirModal({ pid, rid, ficha, aoGravar, medida })`:
sem `medida` cria (POST, botão "Adicionar"), com `medida` edita (PUT, botão "Salvar", campos preenchidos).

- [ ] **Passo 1: testes que falham.**

```js
  it('editar abre o modal preenchido e grava por PUT só o que mudou', async () => {
    const f = await abrir(renderAtividade, base([M()], { [`PUT ${B}/medidas/m1`]: { ok: true } }));
    document.querySelector('[data-editar="m1"]').click();
    await esperar(() => expect(el('at-m-salvar')).not.toBeNull());
    expect(el('at-m-medida').value).toBe('Controle de acesso por perfil');
    expect(el('at-m-status').value).toBe('ativa');
    el('at-m-status').value = 'planejada';
    el('at-m-status').dispatchEvent(new Event('change'));
    el('at-m-salvar').click();
    await esperar(() => expect(chamadas(f)).toContain(`PUT ${B}/medidas/m1`));
    expect(corpoDe(f, `PUT ${B}/medidas/m1`)).toEqual({ medida: 'Controle de acesso por perfil', status: 'planejada', descricao: 'Cada pessoa vê só o seu setor.' });
  });
```

  e em `atividade-base.test.js`: o botão do bloco GDPR diz "+ Base Legal" (o do art. 7 e o do art. 11 continuam "+ Adicionar Inciso").
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.**
  - `linha`: antes do Excluir, `<button type="button" class="btn btn-ghost btn-sm" data-editar="${escapeHTML(m.id)}" aria-label="Editar a medida ${escapeHTML(m.medida)}">Editar</button>`.
  - `montar`: `painel.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirModal({ pid, rid, ficha, aoGravar: () => montar(painel, ctx), medida: medidas.find((m) => m.id === b.dataset.editar) })));`
  - `abrirModal`: com `medida`, título "Editar medida", sem o select de controle (o controle não muda na edição), os campos
    preenchidos (`value` escapado), o botão com id `at-m-salvar` e rótulo "Salvar", e no clique
    `api('PUT', url(pid, rid, `/medidas/${medida.id}`), { medida, status, descricao: d || null })`; sem `medida`, o fluxo de hoje.
  - `aba-base.js`: no bloco GDPR, o rótulo do botão passa a `+ Base Legal`.
- [ ] **Passo 4: rodar** os dois testes. **Passo 5: commit.** `feat(atividade): editar medida de segurança e rótulo da base GDPR`

---

### Tarefa 12: documentação e verificação final

**Arquivos:** `docs/arquivo/paridade-legado-2026-10-20.md`, `CHANGELOG.md`.

- [ ] **Passo 1:** no documento de paridade, marcar como resolvidos (com o commit) o defeito do Painel, o Word da LIA, os itens da
  tabela 5 cobertos (RoPA, RIPD, LIA, Riscos, Gaps, Solicitações sem a exportação, Áreas, Ativos, Documentos) e os da seção 7
  (Medidas editar, GAPs na ficha) e o rótulo do GDPR. O que sobrou continua listado.
- [ ] **Passo 2:** entrada no topo do `CHANGELOG.md` no formato das anteriores, em português, sem números sem comando.
- [ ] **Passo 3: verificação completa.**
  `npx tsc --noEmit` (raiz), `npx vitest run` (raiz, a suíte inteira, uma vez) e `cd frontend && npx vitest run && npm run build`.
  Colar no PR o resumo de cada um. Falha que não é destas mudanças: rodar o teste sozinho antes de concluir.
- [ ] **Passo 4: commit e push.** `docs: paridade, o que fechou nas telas e no painel`; `git push origin claude/awesome-cray-r78x5a`.
