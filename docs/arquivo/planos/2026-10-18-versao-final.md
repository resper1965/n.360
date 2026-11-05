# Versão final do n.360 (n.iso e n.privacy): plano de entrega

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`. Passos usam `- [ ]`.

**Objetivo (o inicial, sem mudar):** trocar o sistema legado (DPO as a Service) pelo n.privacy com o menor impacto possível para os clientes, clonando as telas e a lógica do legado e mantendo o que o n.360 faz melhor: entrevista guiada, pré-preenchimento, aprovação com hash e cadastro compartilhado com o n.iso.

**"Versão final" significa:** o cliente usa o n.privacy no lugar do legado, o legado está desligado e o n.iso continua íntegro. Cada etapa abaixo já entrega algo utilizável em produção.

**Arquitetura:** uma etapa vira um ou mais PRs pequenos, sempre a partir de `origin/main`. Cada PR passa pelo portão local (`scripts/ci/gate.sh`) e é publicado com `scripts/ci/ship.sh <PR>`. A entrega só conta com o SHA em `/health`. Uma tela nova do legado começa por uma spec curta escrita a partir das capturas, depois vem o PR.

**Stack:** Cloudflare Workers (Hono), D1, R2, SPA em JS puro (Vite), vitest (D1 real e jsdom) e Playwright.

## Restrições globais

- Os commits e PRs não levam atribuição de IA: autor `resper1965` com e-mail noreply, sem `Co-Authored-By` e sem rodapé "Generated with".
- Nenhum dado real de cliente no repositório. `test/sem-dado-de-cliente.test.ts` tem de passar.
- Sempre partir do sistema vazio: catálogos começam vazios e nada é semeado. A importação é a Etapa 6, separada das demais.
- Uma migration só vai para produção com o "sim" do dono e o `wrangler d1 export` feito antes. A conferência é por `PRAGMA table_info`.
- "Em produção" só depois de `curl -s https://n360.ness.com.br/health` devolver o SHA do merge.
- O MCP nunca aprova nada. Rota nova de escrita que exige decisão humana entra em `FORA_DO_AGENTE`.
- Sem junção de diretório nos worktrees. O portão roda sozinho, sem outra suíte pesada ao mesmo tempo.

## Decisões pendentes do dono (cada uma destrava uma etapa)

| # | Decisão | Recomendação | Destrava |
|---|---|---|---|
| D1 | Entrada: descrição por módulo e seletor fixo no topo | Sim | Etapa 1 |
| D2 | "Não sei agora" no modo guiado | Pular a pergunta e reapresentá-la no fim, como pendência | Etapa 2 |
| D3 | Quem revisa os textos (agentes, medidas, descrição da Coleta, 132 passos da trilha) | Um consultor sênior da ness. | Etapa 4 |
| D4 | Capturas das telas que faltam do legado | Mandar uma tela por vez, na ordem da Etapa 3 | Etapa 3 |
| D5 | Exportação do legado (Gaps, Riscos, RIPD, LIA, titulares) | Não existe: construir no legado (18/10) | Etapa 6 |
| D6 | Chave `RESEND_API_KEY` no `n-sentinela` | O dono roda `npx wrangler secret put RESEND_API_KEY --name n-sentinela` | Etapa 0 |

---

### Etapa 0: fechar o que está em andamento

**Entrega:** a criticidade do fornecedor (PR #449) em produção e o alerta do sentinela enviando e-mail.

- [ ] O `ship.sh 449` termina com `ship=0`.
- [ ] `/health` devolve o SHA do squash do #449.
- [ ] O dono cumpre a D6. Teste: derrubar a sonda de propósito num ambiente de teste e confirmar que o e-mail chega.

**Aceite:** os dois itens acima confirmados, com a saída colada.

### Etapa 1: entrada clara por módulo (D1)

**Entrega:** quem abre `/` entende em 5 segundos onde está o n.iso e onde está o n.privacy, e troca de módulo sem voltar ao início.

**Arquivos:** `frontend/src/views/painel.js` (`linhaModulo`, `telaDoN360`), `frontend/src/produto.js` (`NOME` e uma frase por módulo), `frontend/login.html` (seletor no cabeçalho), `frontend/src/style.css`.
**Testes:** `frontend/test/n360-entrada.test.js`, `frontend/test/produto.test.js`, `frontend/e2e/n360.spec.js`.

- [ ] Teste que falha: no início do n.360, cada cartão de módulo mostra o nome e uma frase. A frase do n.iso é "ISO 27001 e 27701: controles, riscos e auditoria". A do n.privacy é "LGPD: tratamentos, titulares, incidentes e terceiros". O botão é "Abrir o n.X".
- [ ] Teste que falha: dentro de `/iso` e de `/privacy`, o seletor do cabeçalho lista só os módulos visíveis para a pessoa (`modulosVisiveis`) e marca o atual com `aria-current="page"`. Quem tem um módulo só não vê o seletor.
- [ ] Implementar, rodar `cd frontend && npx vitest run` e depois `npm run build`.
- [ ] E2E: login, início com dois cartões, seletor leva de `/iso` a `/privacy`.
- [ ] PR, portão, ship, `/health`.

**Aceite:** a E2E passa e o dono confirma na tela de produção.

### Etapa 2: modo guiado sem beco sem saída (D2)

**Entrega:** "Não sei agora" pula a pergunta. Ela volta numa lista de pendências no fim do guiado e aparece como lacuna na aba correspondente.

**Arquivos:** `src/services/ropa-abas/proxima-pergunta.ts`, `frontend/src/atividade/guiado.js`. **Teste:** o teste de `proxima-pergunta` em `test/`.

- [ ] Teste que falha: com a pergunta P marcada como "não sei", `proximaPergunta` devolve a lacuna seguinte. Quando só resta P, devolve P com `pendente: true`.
- [ ] Implementar como função pura, sem gravar nada no hash da aprovação.
- [ ] Teste de tela: "Não sei agora" avança e o fim do guiado lista as pendências.
- [ ] PR, portão, ship.

**Aceite:** uma atividade nova, preenchida pelo guiado com duas respostas "não sei", termina com duas pendências visíveis.

### Etapa 3: paridade com o legado, uma tela por vez (D4)

**Ordem** (pelo uso diário do cliente): Fornecedores (lista, com a criticidade da Etapa 0), listas de Gaps e de Riscos, Solicitações (pedido do titular), RIPD/DPIA, LIA e, por fim, Dashboard.

**Ciclo de cada tela:**
- [ ] Ler as capturas e anotar em `scratchpad/legado-<tela>.md` os campos, os estados, as ações e as regras.
- [ ] Spec curta em `docs/superpowers/specs/AAAA-MM-DD-<tela>-design.md`: o que clona, o que reaproveita do núcleo e o que fica de fora. O dono aprova.
- [ ] Plano da tela (`writing-plans`), com testes de serviço sobre o D1 real, testes de tela em jsdom e uma E2E do caminho principal.
- [ ] Migration, só se for necessária: aditiva, com o "sim" do dono e backup antes.
- [ ] PR, portão, ship, `/health`.

**Aceite de cada tela:** o mesmo caso feito no legado e no n.privacy chega ao mesmo resultado, conferido pelo dono com a captura ao lado.

### Etapa 4: textos revisados (D3)

**Entrega:** todos os textos de orientação revisados por um consultor sênior.

- [ ] Gerar `docs/revisao-textos.md`: uma tabela com texto atual, arquivo e linha, para o revisor marcar.
- [ ] Aplicar as correções num PR só de texto. Os testes que fixam texto (skills e trilha) são atualizados no mesmo PR.

**Aceite:** a tabela fica toda marcada e o PR está em produção.

### Etapa 5: teste do dono em produção

**Entrega:** um roteiro de 30 minutos em `docs/roteiro-aceite.md`. O dono roda logado, num projeto de teste vazio: entrada, RoPA nas abas e no guiado, Cobertura, Consentimentos, trilha (Bancada), cada tela da Etapa 3 e o n.iso (controles, SoA, riscos e uma aprovação).

- [ ] Escrever o roteiro com o resultado esperado em cada passo.
- [ ] O dono executa. Cada falha vira um item corrigido em PR próprio.

**Aceite:** o roteiro passa inteiro, sem nenhuma falha aberta.

### Etapa 6: importação do legado (D5)

**Entrega:** os dados do legado entram pelo "Importar programa" que já existe (`src/services/importacao.ts`), sempre com revisão humana.

- [ ] Construir a exportação no legado (decisão de 18/10: ela não existe), um CSV por entidade com o cabeçalho exato dos modelos de `docs/modelos-importacao/` (tratamentos, terceiros, riscos, gaps, impacto, ciclo, bases, ripd, lia, pedidos). Passo a passo em `docs/runbook-migracao-legado.md`.
- [ ] Para cada planilha: um teste com uma amostra fictícia (`scripts/importacao-amostra.mjs`) que entra como proposta e grava só depois do aceite.
- [ ] Ajustar o extrator só onde a planilha real tiver uma coluna que não cabe.
- [ ] Relatório de reconciliação por lote: lidos, aceitos, recusados (com o motivo) e duplicados.

**Aceite:** uma amostra fictícia de cada planilha reconcilia sem diferença.

### Etapa 7: virada da cliente em produção e desligamento do legado

- [ ] Backup do D1 antes da carga.
- [ ] Importar a base da cliente, lote a lote, e guardar o relatório de reconciliação de cada lote, fora do repositório.
- [ ] O dono confere uma amostra contra o legado e dá o "sim" da virada.
- [ ] Desligar o legado. A decisão e a data são do dono.

**Aceite:** a cliente opera só no n.privacy por uma semana sem precisar voltar ao legado.

---

## Ordem e paralelismo

Etapas 0 e 1, depois 2. A Etapa 3 começa assim que chega a primeira captura e corre em paralelo com a 4. Depois vêm a 5, a 6 e a 7, nessa ordem, sem pular. As Etapas 4, 6 e 7 dependem de material do dono (D3, D5).
