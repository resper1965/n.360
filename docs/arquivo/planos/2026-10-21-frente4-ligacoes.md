# Frente 4: ligações entre os módulos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fechar as quatro ligações do P2 entre n.iso e n.privacy: controle e medida, DPO e encarregado, Painel do n.iso, Áreas no n.iso.

**Architecture:** servidor Hono + D1 (rotas e serviços existentes, sem migration); frontend vanilla (views existentes). Cada tarefa é
independente e testável sozinha.

**Tech Stack:** Cloudflare Workers, Hono, D1, vitest (`@cloudflare/vitest-pool-workers`, D1 real), frontend vanilla com vitest/jsdom.

**Spec:** `docs/superpowers/specs/2026-10-21-frente4-ligacoes-design.md`

## Global Constraints

- Nenhuma migration; `schema.sql` não muda.
- Nenhuma mudança em `src/services/pedidos.ts` nem no conteúdo congelado dos pedidos.
- Texto de UI, comentário e erro em português; sem emoji, sem itálico.
- Rota nova de projeto precisa de faixa em `src/modulos.ts` (`test/modulos-produto.test.ts` reprova sem); fetch novo no frontend entra
  em `test/contrato-tela-api.test.ts` se o teste exigir.
- Toda consulta filtra por `project_id`.
- Sem `any` novo (`test/any-catraca.test.ts`).
- "Hoje" é o dia de São Paulo (`hojeEmSaoPaulo` em `src/services/hoje.ts`; `hojeSP` em `frontend/src/hoje.js`).
- Commits em português, com `--author="Ricardo Esper <44273656+resper1965@users.noreply.github.com>"`, sem rodapé de IA.
- Testes de backend que usam rota do n.privacy chamam `habilitarPrivacy(...)` de `test/helpers/d1.ts`.

---

### Task 1: controle e medida (4.1)

**Files:**
- Modify: `src/routes/controls.ts` (rota nova `GET /:id/atividades`)
- Modify: `frontend/src/views/compliance.js` (bloco "Usado em" no detalhe do controle e confirmação no `updateControlStatus`)
- Modify: `frontend/src/atividade/aba-medidas.js:15` (condição do aviso)
- Test: `test/controle-atividades.test.ts` (novo), `frontend/test/controle-atividades-view.test.js` (novo), teste existente da aba de medidas

**Interfaces:**
- Produces: `GET /api/v1/controls/:id/atividades` → `{ atividades: { ropa_id: string; atividade: string; medida: string }[] }`

- [ ] **Step 1: teste de backend que falha.** Em `test/controle-atividades.test.ts`, no estilo dos testes de controle existentes (procure
  um que crie projeto e controle, por exemplo `grep -l "compliance_controls" test/*.test.ts`): crie projeto com n.iso e n.privacy, um
  controle, duas atividades (`ropa_records`) com medida ligada (`tratamento_medidas.controle_id`), uma delas `status = 'Inactive'`, e uma
  atividade de OUTRO projeto. Espere: 200 com só a atividade ativa do projeto, ordenada por nome; 404 para controle inexistente; pessoa
  sem acesso ao projeto recebe o mesmo 403/404 das outras rotas de controle.
- [ ] **Step 2:** `npx vitest run test/controle-atividades.test.ts` → FAIL (404 na rota).
- [ ] **Step 3: rota.** Em `src/routes/controls.ts`, ao lado das outras rotas `/:id`, com o MESMO middleware/checagem de acesso que o
  `GET`/`PUT /:id` usam (leia como o arquivo confere o acesso e repita):

```ts
controlsApp.get('/:id/atividades', async (c) => {
  try {
    const ctrl = await c.env.DB.prepare('SELECT id, project_id FROM compliance_controls WHERE id = ?').bind(c.req.param('id')).first<{ id: string; project_id: string }>();
    if (!ctrl) return c.json({ error: 'Controle não encontrado' }, 404);
    const { results } = await c.env.DB.prepare(
      `SELECT r.id AS ropa_id, COALESCE(NULLIF(trim(r.nome), ''), r.finalidade) AS atividade, m.medida
         FROM tratamento_medidas m JOIN ropa_records r ON r.id = m.ropa_id AND r.project_id = m.project_id
        WHERE m.controle_id = ? AND m.project_id = ? AND COALESCE(r.status, '') <> 'Inactive'
        ORDER BY atividade, m.medida`
    ).bind(ctrl.id, ctrl.project_id).all<{ ropa_id: string; atividade: string; medida: string }>();
    return c.json({ atividades: results });
  } catch (e) { return erro500(c, 'Falha ao listar as atividades do controle', e); }
});
```

  Confira o nome real da coluna de nome da atividade em `ropa_records` (`grep -n "CREATE TABLE IF NOT EXISTS ropa_records" -A30 schema.sql`)
  e ajuste o `COALESCE`. Se as rotas por id do controle conferem acesso por `requireResourceAccess`, a rota nova herda pelo prefixo; confirme
  no teste de acesso.
- [ ] **Step 4:** teste passa.
- [ ] **Step 5: aviso da medida.** Em `frontend/src/atividade/aba-medidas.js:15` troque `!m.controle && m.controle_deixou_de_estar_implementado`
  por `m.controle_deixou_de_estar_implementado`. Teste jsdom (no arquivo de teste existente da aba, `grep -l aba-medidas frontend/test`)
  que monta a aba com uma medida `{ controle: { id, titulo, implementado: false }, controle_deixou_de_estar_implementado: true }` e espera
  o texto "O controle deixou de estar implementado".
- [ ] **Step 6: bloco "Usado em".** No detalhe do controle (`compliance.js`, perto do select `controle-status`, linha ~145), depois de
  desenhar, busque `GET /api/v1/controls/${id}/atividades` e preencha um contêiner `#controle-atividades`: sem atividade, vazio; com, o
  título "Usado em N atividades do n.privacy" (`N atividade` no singular) e uma lista "Atividade: medida". Nome da atividade como botão
  `data-action="abrirAtividadeDoControle"` (delegação, sem `onclick`) que chama `window.abrirAtividade(projectId, ropaId, 'medidas')`
  SÓ se `modulosVisiveis` (`frontend/src/produto.js`) inclui `privacy`; senão, texto. Confira o identificador da aba de medidas em
  `frontend/src/views/atividade.js`. Falha da chamada: o bloco não aparece (não quebra o detalhe).
- [ ] **Step 7: confirmação.** Em `updateControlStatus` (`compliance.js`): se o status atual é implementado (`classeDoControle` de
  `frontend/src/classe-controle.js` dá `feito`), o novo não é, e a lista carregada tem atividades, peça confirmação (use o padrão de
  confirmação que o arquivo já usa) com o texto "Este controle é usado em N atividades do n.privacy: A, B, C, D, E e mais K. Elas vão
  mostrar o aviso para revisar a medida. Mudar o status?". Cancelou: devolve o select ao valor anterior e não chama a API.
- [ ] **Step 8: teste jsdom** `frontend/test/controle-atividades-view.test.js`: com `privacy` visível o nome vira botão; sem, texto; lista
  vazia não mostra o bloco; a confirmação aparece ao sair de implementado com atividades e, cancelada, não chama `PUT`. Siga o estilo dos
  testes de `compliance.js` existentes (`grep -l "views/compliance" frontend/test`).
- [ ] **Step 9:** `npx vitest run test/controle-atividades.test.ts` e, em `frontend/`, `npx vitest run test/controle-atividades-view.test.js`
  mais o teste da aba; `npx tsc --noEmit`. Atualize `test/contrato-tela-api.test.ts` se ele reprovar o fetch novo.
- [ ] **Step 10: commit** `feat: controle mostra as atividades que dependem dele e pede confirmação ao sair de implementado`.

### Task 2: DPO da governança e encarregado (4.2)

**Files:**
- Modify: `src/services/encarregado-pessoa.ts` (exporta `casarParte`, funções novas)
- Modify: `src/routes/governance.ts` (POST com DPO mudado; rota `GET /projects/:id/governance/encarregados-fora`)
- Modify: `src/routes/nucleo.ts:205` (`PUT /partes/:id`)
- Modify: `frontend/src/views/monitor.js` (tela de governança, ~linha 379)
- Test: `test/governanca-encarregado-sync.test.ts` (novo), `frontend/test/governanca-encarregados-fora.test.js` (novo)

**Interfaces:**
- Produces (em `encarregado-pessoa.ts`):
  - `atualizarEncarregado(db: D1Database, projectId: string, antes: Pessoa, depois: Pessoa): Promise<string | null>` — devolve o id da
    parte atualizada, ou null quando não atualizou (sem parte que case `antes`, ou e-mail novo já é de outra parte).
  - `sincronizarDpoDaParte(db: D1Database, projectId: string, antes: Pessoa, depois: Pessoa): Promise<string | null>` — devolve o id do
    membro DPO atualizado, ou null.
  - `encarregadosFora(db: D1Database, projectId: string): Promise<{ parte_id: string; nome: string; email: string | null }[]>`
- Produces: `GET /api/v1/projects/:id/governance/encarregados-fora` → o array acima.

- [ ] **Step 1: testes de backend que falham** (`test/governanca-encarregado-sync.test.ts`, D1 real; veja um teste de governança
  existente para criar projeto e chamar `POST /projects/:id/governance`, `grep -l "governance" test/*.test.ts`):
  1. Membro DPO "Ana Silva" `ana@x.com` cria a parte encarregada. POST do mesmo membro com "Ana Souza" `ana.souza@x.com`: continua UMA
     parte pessoa com vínculo `encarregado`, agora com nome "Ana Souza" e e-mail novo; nenhuma parte nova.
  2. Já existe outra parte pessoa com `ana.souza@x.com`: a parte antiga NÃO muda, o vínculo passa para a outra (comportamento de hoje).
  3. `PUT /projects/:id/partes/:parteId` da parte encarregada com nome e e-mail novos: o membro DPO passa a ter os novos.
  4. Parte encarregada sem membro DPO que case: aparece em `GET .../governance/encarregados-fora`; depois de criar o membro DPO, some.
  5. Parte de outro projeto nunca aparece.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3: serviço.** Em `encarregado-pessoa.ts`, mantendo `casa` e `norm`:

```ts
/** Leva o nome e o e-mail novos do DPO à parte que casava os antigos. Não mexe se o e-mail novo já é de outra parte. */
export async function atualizarEncarregado(db: D1Database, projectId: string, antes: Pessoa, depois: Pessoa): Promise<string | null> {
  const { results } = await db.prepare(`SELECT id, nome, email FROM partes WHERE project_id = ? AND tipo = 'pessoa' ORDER BY rowid`).bind(projectId).all<Parte>();
  const parte = casa(results, antes);
  if (!parte) return null;
  const email = depois.email?.trim().toLowerCase() || null;
  if (email && results.some((p) => p.id !== parte.id && p.email?.trim().toLowerCase() === email)) return null;
  await db.prepare('UPDATE partes SET nome = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?')
    .bind(normalizarNome(depois.nome), email, parte.id, projectId).run();
  return parte.id;
}

/** Leva o nome e o e-mail novos da parte encarregada ao membro DPO da governança que casava os antigos. */
export async function sincronizarDpoDaParte(db: D1Database, projectId: string, antes: Pessoa, depois: Pessoa): Promise<string | null> {
  const { results } = await db.prepare('SELECT id, name, email, role_category, job_title FROM project_governance WHERE project_id = ?').bind(projectId)
    .all<{ id: string; name: string; email: string | null; role_category: string | null; job_title: string | null }>();
  const dpos = results.filter(ehDpo).map((m) => ({ id: m.id, nome: m.name, email: m.email }));
  const membro = casa(dpos, antes);
  if (!membro) return null;
  await db.prepare('UPDATE project_governance SET name = ?, email = ? WHERE id = ? AND project_id = ?')
    .bind(depois.nome, depois.email, membro.id, projectId).run();
  return membro.id;
}

/** Partes ativas com vínculo `encarregado` que nenhum membro DPO da governança casa. */
export async function encarregadosFora(db: D1Database, projectId: string) {
  const [enc, gov] = await db.batch([
    db.prepare(`SELECT p.id, p.nome, p.email FROM partes p JOIN parte_vinculos v ON v.parte_id = p.id AND v.project_id = p.project_id
       WHERE p.project_id = ? AND p.status = 'ativa' AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto' ORDER BY p.nome`).bind(projectId),
    db.prepare('SELECT name, email, role_category, job_title FROM project_governance WHERE project_id = ?').bind(projectId),
  ]);
  const dpos = (gov.results as { name: string; email: string | null; role_category: string | null; job_title: string | null }[]).filter(ehDpo);
  return (enc.results as Parte[])
    .filter((p) => !dpos.some((m) => casa([p], { nome: m.name, email: m.email })))
    .map((p) => ({ parte_id: p.id, nome: p.nome, email: p.email }));
}
```

  (`casa` recebe `{ id, nome, email }[]`; ajuste o tipo `Parte` se o TypeScript reclamar, sem `any`.)
- [ ] **Step 4: governança.** No `POST /projects/:id/governance` (`governance.ts`, ~linha 203), no ramo `ehDpo({ role_category, job_title })`:
  se `antesDpo` existe e nome ou e-mail mudou, chame primeiro `atualizarEncarregado(db, projectId, antesDpo, { nome: name, email: email || null })`
  e, se devolveu id, `logAudit(..., 'governanca.encarregado.sincronizado', ..., \`Parte ${id} atualizada pelo membro ${memberId}\`, ...)`;
  quando devolveu null e havia parte casando o antigo com e-mail novo de outra parte, chame `desfazerEncarregado(db, projectId, antesDpo, outrosDpo)`
  (os demais DPO do projeto, como em `tirarEncarregado`). Depois siga com `garantirEncarregado` como hoje. Tudo dentro do `try` que já
  registra erro sem 500.
- [ ] **Step 5: rota nova** em `governance.ts`: `governanceApp.get('/projects/:id/governance/encarregados-fora', ...)` devolvendo
  `c.json(await encarregadosFora(c.env.DB, projectId))`. A faixa é a de `governance` (`nucleo`); confira em `src/modulos.ts` que o segmento
  cobre a sub-rota.
- [ ] **Step 6: parte.** No `PUT /partes/:id` (`nucleo.ts:205`): depois do UPDATE, se nome ou e-mail mudou e a parte tem vínculo
  `encarregado` (`SELECT 1 FROM parte_vinculos WHERE parte_id = ? AND project_id = ? AND papel = 'encarregado'`), chame
  `sincronizarDpoDaParte(db, projectId, { nome: atual.nome, email: atual.email }, { nome: novoNome, email })` em `try/catch` com
  `registraErro(c, e)` (importe de onde `governance.ts` importa), e se devolveu id, `logAudit(..., 'parte.dpo_sincronizado', ...)` só com ids.
- [ ] **Step 7:** testes do Step 1 passam; `npx tsc --noEmit`.
- [ ] **Step 8: tela.** Na tela de governança (`monitor.js`, onde carrega `GET .../governance`, ~linha 388), busque também
  `GET .../governance/encarregados-fora` (falha: nada a mostrar). Para cada item, uma linha "Encarregado indicado no n.privacy: Nome (e-mail)"
  com o botão secundário "Adicionar ao comitê" (`data-action`, delegação) que abre o formulário de membro que a tela já usa, preenchido com
  nome, e-mail e o papel DPO (veja os valores de `role_category`/`job_title` que o formulário oferece e use o do DPO). Só para quem pode
  editar a governança (o mesmo corte dos outros botões da tela).
- [ ] **Step 9: teste jsdom** `frontend/test/governanca-encarregados-fora.test.js`: a linha aparece com o nome; o botão abre o formulário com
  nome e e-mail preenchidos; sem itens, nada aparece. Siga o estilo de um teste existente de `monitor.js` (`grep -l "views/monitor" frontend/test`).
- [ ] **Step 10:** rodar os testes novos e `test/contrato-tela-api.test.ts`, `test/modulos-produto.test.ts`; commit
  `feat: DPO da governança e encarregado se sincronizam nos dois sentidos`.

### Task 3: Painel do n.iso (4.3)

**Files:**
- Modify: `src/services/painel.ts` (itens novos e `selos` no ramo do n.iso, ~linhas 270-345 e o retorno ~438)
- Modify: `src/routes/vendors.ts:95` (`situacao` na lista)
- Modify: `frontend/src/filtro-painel.js` (`vendors::vencidos`)
- Modify: `frontend/src/views/grc.js` (lista de fornecedores aceita o filtro do painel, se ainda não passa `filtroPainel`)
- Modify: `frontend/src/selos-menu.js`, `frontend/login.html` (spans de selo nos itens do n.iso), chamada de `aplicarSelos` no painel do n.iso
- Test: `test/painel-iso-ligacoes.test.ts` (novo), `frontend/test/selos-menu-iso.test.js` (novo), teste de `filtro-painel` existente

**Interfaces:**
- Consumes: `listarTerceiros(db, projectId)` de `src/services/terceiros.ts` (cada item tem `id` = parte e `situacao`).
- Produces: `GET .../painel?modulo=iso` → objeto do módulo iso ganha
  `selos: { capa: { abertas: number; vencidas: number }; evidencias: { em_analise: number; ruins: number }; fornecedores: { pendentes: number; vencidos: number }; pedidos: { abertos: number } }`
  (no mesmo nível em que o n.privacy devolve `selos`); `GET /projects/:id/vendors` → cada vendor ganha `situacao: 'pendente'|'vigente'|'vencida'|'reprovada'`.

- [ ] **Step 1: testes de backend que falham** (`test/painel-iso-ligacoes.test.ts`, no estilo dos testes do painel existentes,
  `grep -l "painel" test/*.test.ts`): projeto só com n.iso; um fornecedor com avaliação vencida (`avaliacoes_terceiro.valido_ate` ontem em SP,
  `diaMaisSP(-1)`); um pedido aberto com destinatário pendente. Esperar no `GET .../painel?modulo=iso` da EQUIPE: item `tela: 'vendors'`,
  `filtro: 'vencidos'`, grupo `atraso`; item `tela: 'meus-pedidos'`, grupo `semana`; `selos.fornecedores.vencidos === 1`,
  `selos.pedidos.abertos === 1`. Para o CLIENTE, o item de pedidos não aparece. `GET .../vendors` traz `situacao: 'vencida'` nesse fornecedor.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3: lista de fornecedores.** Em `projectVendorsApp.get('/')`: `const sit = new Map((await listarTerceiros(db, projectId)).map((t) => [t.id, t.situacao]))`
  e no `map`, `situacao: sit.get(v.parte_id) ?? 'pendente'` (confira o nome do campo da parte na linha do vendor em `SQL_VENDORS_VISIVEIS`).
- [ ] **Step 4: painel.** No ramo do n.iso de `painel.ts`: some às consultas do `db.batch` existente (não abra outra ida ao banco por item):
  - pedidos abertos aguardando decisão: `SELECT count(DISTINCT p.id) AS n FROM pedidos p JOIN pedido_destinatarios d ON d.pedido_id = p.id
    WHERE p.project_id = ?1 AND p.status = 'aberto' AND d.status = 'pendente'`;
  - CAPA abertas (sem `ropa_id`, status <> 'Closed') — a vencida já existe (`capaVencidas`);
  - evidências: os números de `SQL_EVIDENCIAS` que já existem (`ev.andamento`, `ev.falta`).
  Fornecedores: `listarTerceiros(db, projectId)` em paralelo (`Promise.all` com o batch), contando `situacao === 'vencida'` (vencidos) e
  `'pendente'` (pendentes). Itens:

```ts
  add(fornVencidos, { grupo: 'atraso', quando: 'Vencida', texto: plural(fornVencidos, 'fornecedor com avaliação vencida', 'fornecedores com avaliação vencida'),
    contexto: exemplos(nomesVencidos), acao: 'Ver os fornecedores', tela: 'vendors', filtro: 'vencidos' });
  if (equipe) add(pedidosAbertos, { grupo: 'semana', quando: 'Aguardando', texto: plural(pedidosAbertos, 'pedido esperando decisão', 'pedidos esperando decisão'),
    contexto: 'Aprovação ou ciência pendente', acao: 'Ver os pedidos', tela: 'meus-pedidos' });
```

  `equipe` = a visão não é a do cliente (veja como `painel.ts` já distingue a visão do cliente para `decisoes`; passe o booleano para a
  função do n.iso se ela não o recebe). Confira que `exemplos` e `plural` já existem no arquivo. Devolva `selos` no objeto do n.iso com a
  forma da seção Interfaces.
- [ ] **Step 5:** testes do Step 1 passam; `npx tsc --noEmit`; rodar os testes de painel existentes (`npx vitest run test/painel*.test.ts`).
- [ ] **Step 6: filtro.** Em `FILTROS` (`filtro-painel.js`): `'vendors::vencidos': ['avaliação vencida', (v) => v.situacao === 'vencida'],`.
  Na lista de fornecedores do n.iso (`grc.js`), passe `filtroPainel` ao `montarLista` como as outras listas do n.iso já fazem (CAPA,
  evidências; `grep -n filtroPainel frontend/src/views/*.js`). Teste no arquivo de teste do `filtro-painel` existente.
- [ ] **Step 7: selos do n.iso.** Em `login.html`, nos itens `nav-dashboard`, `nav-capa`, `nav-evidence` e `nav-vendors`, acrescente o
  span de selo no mesmo formato dos do n.privacy (`grep -n 'selo-titular' frontend/login.html`), com ids `selo-iso-painel`, `selo-iso-capa`,
  `selo-iso-evidencias`, `selo-iso-fornecedores`. Em `selos-menu.js`, crie `SELOS_ISO(s)`:

```js
const SELOS_ISO = (s) => {
    const ca = s.capa || {}, ev = s.evidencias || {}, fo = s.fornecedores || {};
    const fila = [
        ['selo-iso-capa', inteiro(ca.abertas), inteiro(ca.vencidas),
            (q, r) => `${plural(q, 'ação corretiva aberta', 'ações corretivas abertas')}${r ? `, ${plural(r, 'vencida', 'vencidas')}` : ''}`],
        ['selo-iso-evidencias', inteiro(ev.em_analise) + inteiro(ev.ruins), inteiro(ev.ruins),
            (q, r) => `${plural(q, 'evidência a tratar', 'evidências a tratar')}${r ? `, ${r} vencidas ou não conformes` : ''}`],
        ['selo-iso-fornecedores', inteiro(fo.pendentes) + inteiro(fo.vencidos), inteiro(fo.vencidos),
            (q, r) => `${plural(q, 'fornecedor sem avaliação em dia', 'fornecedores sem avaliação em dia')}${r ? `, ${r} com avaliação vencida` : ''}`],
    ];
    const atrasados = fila.reduce((t, [, , r]) => t + r, 0);
    return [['selo-iso-painel', atrasados, atrasados, (q) => plural(q, 'item atrasado', 'itens atrasados')], ...fila];
};
```

  `aplicarSelos(v)`: no n.privacy segue como está; no n.iso usa `SELOS_ISO(v)`. `atualizarSelos`: no n.iso, com projeto que tem o módulo e
  papel que não é `stakeholder`/`comercial`, busca `GET /api/v1/projects/${p.id}/painel?modulo=iso` e aplica `SELOS_ISO(r.selos)` (leia a
  forma exata da resposta do painel por módulo e ajuste o caminho até `selos`); na tela `dashboard` do n.iso não busca (o painel aplica).
  No painel do n.iso (`frontend/src/views/painel.js`), chame `aplicarSelos` com os `selos` do módulo iso, como o n.privacy já faz.
  Fora do n.iso e do n.privacy, limpa os dois conjuntos.
- [ ] **Step 8: teste jsdom** `frontend/test/selos-menu-iso.test.js`: com `produtoAtual() === 'iso'`, `aplicarSelos({ capa: { abertas: 3, vencidas: 1 }, ... })`
  mostra "3" em `selo-iso-capa` com `is-danger`; zero esconde; o selo do Painel soma os atrasados. Veja o teste de selos do n.privacy
  existente para o estilo (`grep -l "selos-menu" frontend/test`).
- [ ] **Step 9:** rodar os testes do frontend tocados e `npm run build` em `frontend/`; commit
  `feat: painel do n.iso mostra fornecedor vencido, pedidos e selos no menu`.

### Task 4: Áreas no n.iso (4.4)

**Files:**
- Modify: `frontend/src/produto.js` (tirar `nav-areas` de `SO_PRIVACY`; a estrutura do menu do n.iso)
- Modify: `frontend/login.html` (o item `nav-areas` no grupo de Partes do n.iso, se o lugar não serve aos dois)
- Modify: `frontend/src/views/partes.js` (sem bloco de departamentos no n.iso; link "Áreas")
- Test: `frontend/test/casca-menu.test.js`, teste de `partes.js` existente

- [ ] **Step 1: testes que falham.** Em `casca-menu.test.js`: no n.iso, `nav-areas` visível, no mesmo grupo de `nav-partes`, logo depois
  dele. No teste de `partes.js` (`grep -l "views/partes" frontend/test`): no n.iso não há lista de departamentos e há um link/botão
  "Áreas" que navega para `areas`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** tirar `'nav-areas'` de `SO_PRIVACY`; no n.iso o item fica no grupo de Partes (veja em `login.html` em que grupo está
  `nav-partes` e onde está `nav-areas`; o n.privacy organiza o seu menu por `SECOES_PRIVACY` e não muda). Confira que `views/areas.js` não
  depende de algo só do n.privacy (rótulos de `ROTULOS_PRIVACY`, chamadas a rotas de faixa `privacy`); se depender, ajuste para valer nos dois.
- [ ] **Step 4:** em `partes.js`, remova a carga e a renderização de departamentos do n.iso (`departamentos = lista(await api(... /departamentos))`,
  ~linha 53, e o bloco que a desenha) e ponha um botão secundário "Áreas" (`data-action="navigate"`, `data-args='["areas"]'`) no
  cabeçalho da tela. Se `renderMaisAcoes` passar de três secundárias, use-o.
- [ ] **Step 5:** testes passam; rodar a suíte do frontend (`cd frontend && npx vitest run`) porque a casca é compartilhada.
- [ ] **Step 6:** commit `feat: n.iso usa a tela Áreas do núcleo`.

### Task 5: documentação e verificação final

**Files:**
- Modify: `AGENTS.md` (uma linha em cada tema tocado: controle e medida, governança e encarregado, painel do n.iso, Áreas), `CHANGELOG.md`
- Modify: `docs/agente/seguranca.md` só se alguma rota nova precisar entrar em `FORA_DO_AGENTE` (nenhuma escreve; as três novas são leitura)

- [ ] **Step 1:** `npx tsc --noEmit`; `npm test` (backend inteiro); em `frontend/`, `npx vitest run` e `npm run build`. Se `test/any-catraca`,
  `test/contrato-tela-api` ou `test/modulos-produto` reprovarem, corrigir na causa.
- [ ] **Step 2:** atualizar `AGENTS.md` e `CHANGELOG.md` com o que existe agora (sem narrativa de sprint no AGENTS.md).
- [ ] **Step 3:** commit `docs: frente 4 no AGENTS.md e no CHANGELOG`.
