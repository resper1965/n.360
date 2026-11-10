# F5: homologação de fornecedor com questionário: plano

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam caixas `- [ ]`.

**Objetivo:** fechar a lacuna 7 do plano mestre (`docs/arquivo/planos/2026-10-14-legado-privacidade.md`): o questionário de homologação do fornecedor (perguntas do projeto, envio por link público com prazo, respostas com rascunho, % respondido) cujo resultado, decidido por uma pessoa da consultoria, vira uma linha de `avaliacoes_terceiro` com método `questionario`.

**Arquitetura:** migration 0075 com duas tabelas aditivas (`homologacao_perguntas`, `homologacoes`) e um gatilho de imutabilidade. Serviço `src/services/homologacao.ts`; rotas da consultoria em `src/routes/homologacoes.ts` montadas em `/api/v1/projects/:projectId/homologacoes` (segmento novo `homologacoes` na faixa `privacy`); rotas públicas em `src/routes/public-homologacao.ts` montadas em `/api/v1/public/homologacao` antes do `authMiddleware`; página estática `frontend/public/homologacao.{html,js,css}` no molde do portal do auditor. A conclusão chama `registrarAvaliacao` de `src/services/terceiros.ts` (a regra de validade fica lá).

**Insumos:** plano mestre (restrições globais, lacuna 7, parágrafo F5); pesquisa de código (seção F, decisão D7); moldes: portal do auditor (`src/routes/public-auditor.ts`, `POST /projects/:id/auditor-token` em `src/routes/projects.ts`, `frontend/public/auditor.*`), terceiros (`src/services/terceiros.ts`), planos da F3 e F4 (forma).

## Decisões desta fase

| # | Decisão | Por quê |
|---|---|---|
| F5-a | Um questionário por projeto: `homologacao_perguntas` (tema, texto, ordem, ativa, origem `padrao`/`projeto`). O modelo padrão (12 perguntas genéricas de segurança e privacidade) é semeado no projeto na primeira leitura, por `INSERT OR IGNORE` com id determinístico; a tela e a API marcam o modelo como "a validar pelo consultor" | O legado tem um modelo; vários modelos por projeto não têm pedido. Teto: se um dia houver modelos por tipo de fornecedor, entra `modelo` como coluna aditiva. Texto jurídico não entra por código: as perguntas são genéricas e editáveis |
| F5-b | A pergunta não se apaga: o consultor cria, edita e desativa (`ativa = 0`). Sem rota DELETE | A homologação congela o texto; desativar basta e evita a trilha de exclusão |
| F5-c | `homologacoes`: um envio por terceiro, com `token_hash` (SHA-256, único), `expira_em`, `status` (`aberta`, `respondida`, `concluida`, `cancelada`), `perguntas_json` congelado na criação e `respostas_json` | Nova rodada = nova homologação. Uma tabela de respostas à parte só repetiria a chave; o % sai do JSON no servidor |
| F5-d | Gatilho `homologacao_imutavel`: recusa mudar perguntas, token, terceiro e projeto sempre, mudar respostas fora de `aberta` e voltar a `aberta` | A resposta enviada é imutável também em SQL direto |
| F5-e | Token por `genToken` (256 bits), só o hash no banco, link `appUrl/homologacao#<token>` mostrado uma vez; prazo de 1 a 60 dias (padrão 15) | Molde do link do auditor: fragmento não vai ao servidor nem ao Referer |
| F5-f | Rotas públicas `POST /api/v1/public/homologacao/{ver,salvar,enviar}` com o token no CORPO; token inexistente, vencido, já enviado ou cancelado: o mesmo 404 "Link inválido ou expirado"; limite por IP (120 em 600 s) antes de ler o corpo; teto de corpo do `bodyGuard` e esquema estrito (até 100 respostas, justificativa até 1000) | Sem oráculo; molde de `public-auditor.ts`. A página mostra só o nome do cliente, o do fornecedor, as perguntas congeladas e as próprias respostas |
| F5-g | Criar, concluir, cancelar e editar perguntas: só a equipe da consultoria (`ehEquipeNess`), como o link do auditor; leitura: quem tem o projeto e o n.privacy | O link é credencial emitida pela consultoria; a tela de terceiros já só mostra edição à equipe |
| F5-h | Só terceiro cujo tipo leva ao método `questionario` (médio e pequeno) é homologado; a conclusão confere de novo | Senão `registrarAvaliacao` gravaria `trust_center` ou `auditoria` |
| F5-i | Concluir (ato humano): só `respondida`; resultado `aprovado`, `com_ressalvas` (o "condicional" do legado) ou `reprovado`, `valido_ate` e observação; passa o status a `concluida` por UPDATE condicional e chama `registrarAvaliacao`; se ela recusar (data inválida ou no passado, tipo apagado), devolve o status | A regra de validade fica num lugar só; duas conclusões ao mesmo tempo não geram duas avaliações |
| F5-j | Agente MCP: `POST`, `PUT` e `DELETE` de `/projects/:id/homologacoes*` em `FORA_DO_AGENTE`; lê pelos GET | Concluir é ato humano e o link é credencial |
| F5-k | E-mail opcional: com `email` no corpo e `RESEND_API_KEY` configurada, `enviarEmail` manda o link; o endereço não é gravado nem vai à trilha. Sem a chave, a resposta diz `email_enviado: false` e a tela mostra o link para copiar | Padrão de `src/helpers.ts`; nada de dado pessoal novo no banco |
| F5-l | Trilha `homologacao.criada`, `.respondida`, `.enviada`, `.concluida`, `.cancelada`, `.perguntas` só com ids, status e contagens | Restrição global |
| F5-m | Portabilidade: `homologacoes.token_hash` sai em branco (`SEGREDOS_DE_INTEGRACAO`) | As respostas são do cliente; o hash do link não |
| F5-n | `/homologacao` entra em `PAGINAS_PUBLICAS` (`src/config/url.ts`): o domínio antigo serve a página sem redirecionar | Mesmo tratamento de `/auditor` e `/proposta` |

## Tarefas

### F5.1: migration 0075 e schema

- [ ] `migrations/0075_homologacao_fornecedor.sql`, `test/migration-0075.test.ts`, `schema.sql` (tabelas e índices depois de `tratamento_bases`), `migrations/README.md`.
- [ ] Teste: colunas; CHECK de status, resultado e `ativa`; `token_hash` único; gatilho recusa mudar perguntas, respostas fora de `aberta` e voltar a `aberta`; apagar a parte apaga a homologação.

### F5.2: serviço

- [ ] `src/services/homologacao.ts`: `PERGUNTAS_PADRAO`, `semearPerguntas`, `listarPerguntas`, `criarPergunta`, `atualizarPergunta`, `percentual`, `criarHomologacao`, `listarHomologacoes`, `lerHomologacao`, `homologacaoDoToken`, `salvarRespostas`, `enviarRespostas`, `concluirHomologacao`, `cancelarHomologacao`.
- [ ] Testes em `test/homologacao.test.ts` (serviço e rotas).

### F5.3: rotas, esquemas, faixa, agente e contratos

- [ ] `src/routes/homologacoes.ts` e `src/routes/public-homologacao.ts`; montagem em `src/index.ts`; esquemas em `src/schemas/nucleo.ts`; `src/openapi.ts` e `npm run openapi`.
- [ ] `src/modulos.ts` (`homologacoes: 'privacy'`), `src/middleware/agente.ts` (`FORA_DO_AGENTE`), `src/config/url.ts` (`/homologacao`), `src/portabilidade.ts`.
- [ ] `test/contrato-isolamento-org.test.ts` (`SEM_RECURSO_ALHEIO` para as três públicas), `test/redirecionamento-legado.test.ts`, `test/landing-raiz.test.ts`.
- [ ] Testes: fluxo completo (criar, abrir, salvar rascunho, enviar, imutável, concluir grava `avaliacoes_terceiro` com `questionario`, a situação do terceiro e a fonte `avaliacao_terceiro` dos avisos mudam); 404 igual para token inexistente, vencido, enviado e cancelado; limite por IP; cliente não cria (403); pessoa sem o n.privacy recebe 403; o agente lê e não escreve; projeto alheio não alcança.

### F5.4: telas

- [ ] `frontend/public/homologacao.{html,js,css}`: token do fragmento, some da barra, só no corpo; perguntas por tema, resposta sim/não/parcial/não se aplica e justificativa; "Salvar rascunho" e "Enviar respostas" com confirmação; % respondido; sem script nem estilo inline; quadrado.
- [ ] `frontend/src/views/terceiros.js`: na ficha do terceiro de método questionário, a lista de homologações (status, % respondido, prazo) e o botão "Homologar" (prazo e e-mail opcional; o link aparece uma vez para copiar); revisão com as respostas e a conclusão; botão "Perguntas do questionário" (criar, editar, desativar).
- [ ] Testes jsdom: `frontend/test/homologacao-publica.test.js` e `frontend/test/terceiros-view.test.js`.

### F5.5: documentação e verificação

- [ ] `AGENTS.md` (nota curta, `fica` com `/homologacao`, contagens medidas), `CHANGELOG.md`, `migrations/README.md`.
- [ ] `npx tsc --noEmit`; `npx vitest run` completo; `cd frontend && npx vitest run`; `npm run build --prefix frontend` (com `dist/homologacao.html`); `npm run openapi` sem diff.

## Pendências fora desta fase

- **Jurídica:** o texto das 12 perguntas padrão é genérico e precisa da validação do consultor (e do jurídico, se o cliente pedir) antes de ser tratado como modelo oficial.
- **Técnica:** sugestão de resultado por IA (fora de escopo); importação de homologações do legado (F6); anexos do fornecedor (certificados) pela página pública; vários modelos por projeto.
- **Dono:** domínio de envio do Resend (`RESEND_API_KEY`) já usado pelos pedidos; sem ele o link é copiado à mão.
