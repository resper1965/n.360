# F4: painel, exportação e impressão: plano

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam caixas `- [ ]`.

**Objetivo:** fechar a lacuna 6 do plano mestre (`docs/arquivo/planos/2026-10-14-legado-privacidade.md`): CSV que abre no Excel das listas do n.privacy (atividades, riscos e ações das atividades, RIPD e LIA), RIPD e LIA em Word, e o painel do encarregado com as faixas de prazo das ações das atividades.

**Arquitetura:** sem migration. Serviço `src/services/exportacao.ts` (CSV: BOM, `;`, CRLF, aspas, fórmula neutralizada, teto de linhas; as consultas de cada lista), serviço `src/services/documento-word.ts` (RIPD e LIA em `.docx`, com os auxiliares de `src/services/documento-docx.ts`), rotas num arquivo novo `src/routes/exportacao.ts` montado em `/api/v1/projects/:projectId`. A faixa de prazo da ação (`faixaDePrazo`) mora em `src/services/riscos-atividade.ts` e serve ao painel e ao CSV.

**Insumos:** plano mestre (restrições globais, pré-preenchimento, lacuna 6, parágrafo F4); pesquisa de código; molde de forma: plano da F3. Exportações existentes: `src/routes/integrations.ts` (`/export/*`, sem trilha, sem teto salvo o `audit-log`, fora de `FORA_DO_AGENTE`); Word existente: `src/services/documento-docx.ts` e `GET /propostas/:id/docx`.

## Decisões desta fase

| # | Decisão | Por quê |
|---|---|---|
| F4-a | Rotas `GET .../export/{atividades,ripd}` no núcleo (segmento `export`) e `GET .../export/{riscos-atividade,acoes-atividade,lia}` na faixa privacy (`SUBROTAS_PRIVACY`) | Atividade e RIPD são do cadastro comum; riscos e ações vistos pela atividade, e a LIA, são do n.privacy. `export/risks` do n.iso (F0.2) não muda. Prefixo `export/` evita colidir com `ropa/:recordId/riscos` |
| F4-b | Word: `GET .../dpia/:dpiaId/docx` (núcleo) e `GET .../ropa/:recordId/lia/docx` (privacy) | Mesma faixa do recurso |
| F4-c | CSV: BOM UTF-8, separador `;`, fim de linha CRLF, toda célula entre aspas com `"` dobrada, número não inteiro com vírgula; célula que começa com `= + - @ \t \r` ganha `'` na frente | Abre no Excel em pt-BR e não executa fórmula (OWASP CSV injection) |
| F4-d | Filtro da tela: riscos aceitam `probabilidade` e `impacto` (a célula do mapa); ações aceitam `faixa` (a faixa do painel). Atividades, RIPD e LIA não têm filtro na tela hoje | "Com o filtro da tela, quando houver" |
| F4-e | Teto de 5.000 linhas por exportação; acima disso, corta e responde `X-Exportacao-Truncada: 1` | O padrão do repositório é o teto do `audit-log`; não há rate-limit nas exportações atuais |
| F4-f | Trilha `exportacao.csv` e `exportacao.docx` só com o tipo, a contagem e o id do registro, nunca valores | Restrição global (trilha sem dado pessoal) |
| F4-g | As rotas novas entram em `FORA_DO_AGENTE` | Arquivo binário/planilha não serve ao agente, que já lê tudo por JSON (`niso_ler`). As exportações antigas (`/export/*` do n.iso) não estão lá; não mudam nesta fase |
| F4-h | O Word lê ao vivo: empresa (`lerEmpresa`), encarregado (`parte_vinculos`), atividade, bases (`lerBases`), ciclo (`lerCiclo`), teste de impacto (`lerImpacto`) e, no RIPD, a aprovação derivada dos pedidos (`aprovacoesDoProjeto(..., 'dpia')`) e a assinatura direta. Nada é copiado | Princípio de pré-preenchimento: origem única |
| F4-i | "Versão" = o que está gravado agora: o RIPD leva os 8 primeiros caracteres do hash do conteúdo (o mesmo dos pedidos); a LIA leva a data da última gravação. Rascunho (`Draft`, `Under Review`, LIA `rascunho`) sai com "RASCUNHO" no cabeçalho de toda página | Não há coluna de versão em `dpia_assessments` nem em `lia_assessments`, e a F4 não tem migration |
| F4-j | Marca: o nome da organização da consultoria do projeto (`ness.` quando é a ness.), como na capa da proposta sem logo | Sem inventar identidade; o logo exige ler o R2 e fica para depois |
| F4-k | Painel: `riscos.acoes_por_prazo` com seis faixas (vencidas, até 30, 31 a 90, 91 a 150, mais de 150 dias, sem prazo) sobre as ações abertas com `ropa_id`, cada uma com a contagem e até 50 itens; `acoes_vencidas` continua | Sem tabela nova; a tela abre a lista da faixa num modal |

## Tarefas

### F4.1: CSV

- [ ] `test/exportacao.test.ts`: `celulaCsv` (aspas, fórmula, decimal), `montarCsv` (BOM, `;`, CRLF); cada rota devolve só o projeto pedido, com cabeçalho em português; filtro de riscos e de ações; projeto só n.iso recebe 403 nas rotas privacy; agente recebe 403; trilha só com contagem; teto.
- [ ] `src/services/exportacao.ts`, `src/routes/exportacao.ts`, montagem em `src/index.ts`, faixas em `src/modulos.ts`, `FORA_DO_AGENTE`.

### F4.2: Word do RIPD e da LIA

- [ ] `test/documento-word.test.ts`: abre o ZIP e lê `word/document.xml` e o cabeçalho; controlador, CNPJ, encarregado, finalidade, bases, ciclo e teste de impacto aparecem; "RASCUNHO" no rascunho e não no aprovado; texto com `<` e `&` sai escapado; nada de outro projeto; `Content-Disposition` com nome sanitizado; 404 para RIPD/LIA de outro projeto.
- [ ] `src/services/documento-word.ts`; exportar os auxiliares de `src/services/documento-docx.ts` e `RESULTADO_IMPACTO` de `src/services/lia.ts`.

### F4.3: painel do encarregado

- [ ] `test/encarregado.test.ts` (ou arquivo novo): ações em cada faixa, fechadas e sem `ropa_id` fora, `acoes_vencidas` igual.
- [ ] `faixaDePrazo` em `src/services/riscos-atividade.ts`; `src/services/encarregado.ts`.

### F4.4: telas

- [ ] `frontend/src/api.js`: `baixarArquivo(caminho)` autenticado (fetch com `cabecalhosAuth`, blob, nome do `Content-Disposition`).
- [ ] RoPA: "Exportar CSV" e "Exportar LIAs (CSV)"; RIPD: "Exportar CSV" na lista e "Baixar Word" na linha e no detalhe; Ligações (LIA): "Baixar Word"; Mapa de risco: "Exportar CSV" (com a célula escolhida); Painel do encarregado: faixas clicáveis, lista da faixa em modal com "Exportar CSV".
- [ ] Testes jsdom onde as telas já têm teste.

### F4.5: documentação e verificação

- [ ] `AGENTS.md` (nota curta, contagens medidas), `CHANGELOG.md` (Não publicado).
- [ ] `npx tsc --noEmit`; `npx vitest run` completo; `cd frontend && npx vitest run`; `npm run build --prefix frontend`; `npm run openapi` sem diff.

## Pendências fora desta fase

- Logo da consultoria no Word (ler do R2 como a proposta).
- Rate-limit específico de exportação: nenhuma exportação do repositório tem; se vier, vale para todas.
- `/export/*` antigas fora de `FORA_DO_AGENTE` e sem trilha: alinhar num PR à parte.
