# Equalização n.iso x n.privacy (20/10/2026)

Os dois módulos usam o mesmo cadastro. A pergunta aqui é se **a mesma entidade segue a mesma regra e aparece do mesmo jeito**
nos dois.

**Método.** Cada entidade foi examinada em quatro camadas:

1. **dado:** mesma tabela ou cadastro paralelo;
2. **regra:** mesmo serviço ou cálculo duplicado;
3. **rota e faixa:** como `src/modulos.ts` separa o acesso;
4. **tela:** uma tela compartilhada, duas, ou nenhuma num dos lados.

Cada diferença recebeu uma de três classes:

- **decisão:** escrita no `AGENTS.md` ou numa spec; fica;
- **divergência:** mesma coisa com regra, rótulo ou comportamento diferente;
- **lacuna:** falta num dos lados.

Leitura de código na `main` em `528de3f` e no branch `claude/awesome-cray-r78x5a`. Nada foi executado. Os itens marcados **[conferido]**
foram verificados à mão no código, além do levantamento.

## Veredito

**Não estão equalizadas.** O cadastro é quase todo único, como a decisão de 09/10 pede. As divergências estão nas **regras** e nas
**telas**:

- o n.privacy evoluiu com a paridade com o legado;
- o n.iso ficou congelado por decisão ("O n.iso e o n.360 mantêm estrutura, rótulos e acordeão", `AGENTS.md`);
- vários cálculos foram escritos duas vezes.

O resultado é a mesma linha do banco tratada de dois jeitos, conforme a tela por onde se entra.

## P0: defeitos (perda de dado, prova ou segurança)

| # | Defeito | Evidência |
|---|---|---|
| 1 | **Excluir risco pelo n.iso apaga as ações ligadas** (e os anexos dos gaps), por `ON DELETE CASCADE`. A rota da atividade preserva a ação de propósito. **[conferido]** | `src/routes/risks.ts` (`DELETE FROM risks`), `schema.sql` (`corrective_actions.risk_id ... ON DELETE CASCADE`), `src/services/riscos-atividade.ts` (anula `risk_id` antes) |
| 2 | **Excluir ativo pelo n.iso é físico.** Desliga o ativo das atividades do RoPA (cascata em `tratamento_itens` e `tratamento_etapa_itens`) sem invalidar a aprovação. Já existe a rota de exclusão lógica (`DELETE /projects/:id/assets/:assetId`), que a tela não usa. **[conferido]** | `src/routes/platform.ts` (`DELETE FROM itens`), `frontend/src/views/monitor.js` (chama `/api/v1/assets/:id`) |
| 3 | **A CAPA do n.iso descarta "Causa raiz" e "Plano de ação".** A tela envia os dois e o servidor não os grava, sem erro. **[conferido]** | `frontend/src/views/grc.js` envia `root_cause`/`action_plan`; `src/routes/capa.ts` não os grava |
| 4 | **Decisão sobre evidência fora da trilha do projeto.** `evidence.evaluated`, `approved_ciso` e `approved_ceo` gravam sem `project_id` e sem o id do projeto no texto. Não aparecem na trilha, no audit-pack nem no CSV `audit-log`. Vale para os dois módulos. **[conferido]** | `src/routes/evidence.ts` (as três chamadas de `logAudit`); consulta em `src/routes/projects.ts` (`audit-trail`) |
| 5 | **O agente MCP consegue concluir gap.** `PUT /ropa/:rid/gaps/:id` com `Closed` não é recusado, e `PUT /capa/:id` também não. Só `/acoes` recusa. Contraria "concluir ação é ato humano". **[conferido]** | `src/routes/ropa-abas.ts` (`put('/gaps/:id')`), `src/routes/capa.ts` |
| 6 | **Token de sessão na URL** no relatório de política do n.iso. O n.privacy abre os relatórios com cabeçalho e blob. **[conferido]** | `frontend/src/views/compliance.js` (`policy/report?token=`) |
| 7 | **O aviso de prazo da ação não chega ao responsável.** A fonte `capa` lê `assigned_to` (texto), e gaps e ações das atividades só gravam `assigned_to_parte_id`. **[conferido]** | `src/services/avisos-prazo.ts` (fonte `capa`) |
| 8 | **A trilha do projeto devolve `SELECT *`:** IP, justificativa e e-mails. A guarda de papel no servidor ainda está a conferir; a aba Logs ROPA é minimizada. | `src/routes/projects.ts` (`audit-trail`), `src/services/ropa-abas/logs.ts` |

## P1: a mesma regra calculada de jeitos diferentes

| Tema | Divergência | Evidência |
|---|---|---|
| "Controle implementado" | Há seis regras. A única que segue o `SQL_CLASSE_CONTROLE` é a do Painel, da Prontidão e do Monitor. Gap-analysis, Bancada, filtros da SoA, coherence, medidas e cobertura LGPD usam outras listas de status. | `src/services/painel.ts`, `src/routes/projects.ts` (gap-analysis), `src/services/ropa-abas/medidas.ts`, `src/services/requisitos.ts`, `src/services/coherence.ts` |
| "Hoje" | Painel, Prontidão, encarregado e situação do pedido do titular usam UTC; os avisos usam São Paulo; o chip do painel usa o fuso do navegador. Entre 21h e 24h de Brasília, "vencido" muda de lado. Há efeito legal no prazo do titular e do incidente. | `src/services/painel.ts`, `encarregado.ts`, `titular-pedidos.ts`, `avisos-prazo.ts`, `frontend/src/filtro-painel.js`, `frontend/src/atividade/aba-gaps.js` |
| Aprovação | Há três modelos: política (gravada, zerada ao editar), RIPD (gravado, **não** invalidado ao editar, exige CISO e CEO) e atividade, documento e exceção (derivados por hash, basta um). | `src/services/pedidos.ts`, `src/routes/platform.ts`, `src/services/ropa-abas/situacao.ts` |
| Marco "Em operação desde" | Lê `ciso/ceo_approved_at` de `ropa_records`, que a aprovação por pedido não grava. Um programa só do n.privacy fica "Em implantação" para sempre. É a mesma família do defeito corrigido em `270dd59`. **[conferido]** | `src/services/painel.ts` (marco) |
| Quem é "fornecedor" | São quatro critérios: a lista do n.iso (vínculo `terceiro`), a do n.privacy (toda organização ativa), a Bancada (todo `vendors`) e o painel e ponto de partida (`terceiro_tipo` preenchido). Uma organização criada em Parceiros não aparece no n.iso. | `src/routes/vendors.ts`, `src/services/terceiros.ts`, `src/services/passos/contexto.ts`, `src/services/painel.ts` |
| DPA do fornecedor | Há duas fontes sem ponte: `vendors.dpa_signed`/`dpa_url` e `documento_partes` com papel `dpa`. A ficha do n.privacy mostra as duas. | `src/services/terceiros.ts`, `frontend/src/views/terceiros.js` |
| Aceite de risco | No n.iso é `treatment = Accept` com o nome digitado e sem status. No n.privacy é `status = Accepted` com carimbo no servidor, mas sem botão na tela. Um aceite feito num lado não aparece no outro. | `frontend/src/views/grc.js`, `src/services/riscos-atividade.ts`, `frontend/src/atividade/aba-riscos.js` |
| Riscos e ações contados | A matriz e a CAPA do n.iso listam os itens das atividades; Painel, Prontidão e coherence os excluem; a Bancada os inclui. A carteira conta todas as ações e, num projeto com os dois módulos, abre o n.iso. | `src/routes/risks.ts`, `src/routes/capa.ts`, `src/services/painel.ts`, `src/services/passos/contexto.ts` |
| Evidência vencida | No n.privacy, a cobertura conta "vencida ou não conforme" e o "O que fazer" conta só "vencida". | `src/services/painel.ts`, `src/services/encarregado.ts` |
| Ativo | Criado no n.privacy, nasce "Confidencial" (o servidor assume isso); no n.iso a tela envia "Interno". O select "Status" do n.iso é ignorado pelo servidor. **[conferido]** | `src/services/itens.ts`, `frontend/src/views/sistemas.js`, `frontend/src/views/monitor.js` |
| CSV | O n.iso usa vírgula, cabeçalho em inglês e não tem BOM: abre numa coluna só no Excel em português. O n.privacy usa `;`, BOM e rótulos. O download do n.iso não confere erro e salva o JSON de erro como `.csv`. | `src/routes/integrations.ts`, `src/services/exportacao.ts`, `frontend/src/views/monitor.js` |
| Validade da evidência | O n.iso usa a validade (Painel e vencimento diário), mas não consegue defini-la: a rota é da faixa `privacy`. | `src/modulos.ts`, `frontend/src/views/compliance.js` |
| Nome do fornecedor | `PUT /vendors/:id` não passa por `normalizarNome` (o `AGENTS.md` exige). | `src/routes/vendors.ts` |
| Validação da mesma coluna | `due_date` é livre na CAPA e AAAA-MM-DD no n.privacy. O responsável é opcional na CAPA e obrigatório no gap. O status do risco é livre no n.iso e uma lista fechada no n.privacy. | `src/schemas/resources.ts`, `src/schemas/nucleo.ts`, `src/routes/ropa-abas.ts` |

## P2: telas assimétricas sobre o mesmo dado

- **Padrão de lista:** busca, filtros e exportação (`co-controles`) só existem no n.privacy. No n.iso, CAPA, matriz de riscos, Ativos, Fornecedores, Evidências, Documentos, Auditorias, Treinamento e Partes não buscam nem filtram. A SoA é a única lista paginada.
- **Mesma tabela, duas telas:**
  - CAPA (n.iso) e Gestão de GAPs (n.privacy);
  - Ativos (n.iso, com classificação) e Ativos (n.privacy, com descrição);
  - Fornecedores (n.iso, com índice de confiança) e Fornecedores (n.privacy, TPRM).

  Em cada par os campos e as ações são diferentes.
- **Risco no n.iso:** sem risco residual, sem prazo de tratamento e sem status na tela. O servidor já aceita residual.
- **Medida e controle:** a ligação só vai num sentido. O controle do n.iso não mostra que atividades dependem dele. Mudar o status do controle ou apagá-lo não avisa ninguém, e a medida perde a ligação sem aviso.
- **Áreas:** o n.iso só lê e cria, dentro de Partes; não edita, não inativa e não tem descrição.
- **Partes interessadas e governança:** o n.privacy não tem tela de partes interessadas. O DPO da governança vira parte uma vez só; mudar o nome ou o e-mail depois não propaga. O encarregado indicado no n.privacy não aparece em "Papéis e comitê".
- **Painel do n.iso:** não mostra fornecedor vencido nem pedidos aguardando decisão, e não tem selos no menu.
- **Documento:** o n.privacy não tem gerador de política nem tela de ciência. Documento versionado não tem Word nem relatório em nenhum dos dois módulos. Documento em arquivo não entra no Painel, na cobertura LGPD nem no vínculo do DPA.

## Vocabulário

| Mesmo valor | Rótulos diferentes |
|---|---|
| Status de ação (`Open`, `In Progress`, `Closed`) | n.iso: Aberto, Em andamento e Fechado; o cartão diz "Concluídas". n.privacy: Pendente, Em andamento e Concluído. CSV: Aberto, Em andamento e Concluído. |
| Documento | "Documentos" é o versionado no n.iso e o em arquivo no n.privacy. No n.privacy o versionado se chama "Políticas", mas a tela tem o título "Documentos". |
| Situação de documento | Versionado: "Vigente". Em arquivo: "Publicado". |
| Trilha | O menu diz "Trilha de logs" e a tela diz "Trilha de auditoria". |
| Pedidos | O menu diz "Minhas aprovações" e a tela diz "Meus pedidos". |
| Papéis no n.privacy | Aparecem "Líder SGSI" e "CEO" na assinatura de evidência e nos pedidos. |

## O que está certo e fica

Estas diferenças são escolhas registradas, não defeitos:

- um cadastro só (partes, itens, documentos, RoPA, evidência);
- `vendors` como perfil de segurança da parte;
- a partição dos riscos e ações por `ropa_id` no Painel;
- `riskLevel` e `residualLevel` únicos no servidor;
- `registrarDecisao` único para todos os pedidos;
- a faixa de cada rota;
- o lote de aprovações que reaproveita a decisão individual;
- trust score e avaliação de terceiro como métodos distintos (spec de integração de 10/10).

## Recomendação

1. **Um PR só de defeitos (P0, itens 1 a 7).** São mudanças pequenas e locais, cada uma com o seu teste:
   - exclusão lógica no risco e no ativo;
   - gravar causa raiz e plano;
   - `project_id` nos eventos de evidência;
   - recusar ao agente o fechamento de gap e de CAPA;
   - abrir o relatório da política sem token na URL;
   - aviso de prazo ao responsável pela parte.

   O item 8 precisa ser conferido antes.
2. **Uma regra só para cada conceito (P1).** Cada conceito ganha uma função no serviço compartilhado, usada pelos dois módulos:
   - o "hoje" de São Paulo;
   - "controle implementado" pelo `SQL_CLASSE_CONTROLE`;
   - o marco do programa pela aprovação derivada;
   - quem é fornecedor;
   - evidência vencida;
   - a classificação padrão do ativo.

   Não muda tela; muda número. É o que tira o desacordo entre telas.
3. **Decisões do dono antes de mexer:**
   - RIPD aprovado deve ser invalidado quando o texto muda (como atividade e documento)?
   - Aceite de risco único: o carimbo do servidor nos dois módulos?
   - DPA numa fonte só: o documento ligado, com `dpa_signed` derivado?
   - O n.iso deixa de ser "congelado" nas telas de lista? Sem isso, o P2 não fecha.
4. **Depois das decisões:** um componente de lista compartilhado (busca, filtros, exportação e paginação) aplicado aos dois módulos. Junto, o vocabulário único de status pelo `rotuloDe`.

Também está desatualizado no `AGENTS.md`: a seção de riscos cita `blocoRiscos` e `blocoAcoes` de `tratamento-ligacoes.js`, que não existem mais.
