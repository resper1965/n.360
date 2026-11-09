# Requisito "não aplicável" com justificativa (n.privacy)

Data: 09/11/2026. Situação: **aprovada pelo dono em 09/11/2026** e construída (migration 0107; plano `docs/arquivo/planos/2026-11-09-requisito-nao-aplicavel.md`).
Substitui a proposta de 01/11/2026 (PR #537), com as correções da revisão: migration 0107 (a 0106 já foi usada), o painel do
encarregado pelo mesmo resumo e exemplos genéricos (nenhum dado de cliente no repositório).

## Problema

A cobertura de requisitos (`lacunasDaFonte`, `src/services/requisitos.ts`) tem três estados: `coberto`, `parcial` e `lacuna`. Um
requisito que não vale para o projeto não tem como sair de `lacuna`. Casos típicos:

- uma resolução inteira da ANPD que não se aplica ao agente (por exemplo, a de agentes de pequeno porte, para quem não é);
- bases legais que a empresa não usa (incisos do art. 7 e do art. 11 da LGPD);
- artigos dirigidos ao poder público, para uma empresa privada.

O número de lacunas fica inflado, e o painel do encarregado, o ponto de partida e a leitura do agente apontam como pendência o que
não é. A saída que existe hoje, ligar um documento qualquer ao requisito para ele contar como coberto, é pior: registra uma cobertura
falsa.

O n.iso já resolve o caso equivalente: um controle pode ser marcado `Not Applicable`, com justificativa obrigatória
(`src/routes/controls.ts`), e isso vai para a SoA. Este desenho leva a mesma regra aos requisitos.

## Decisão

Um quarto estado de cobertura, `nao_aplicavel`, que só existe com uma justificativa registrada, com quem decidiu e quando, por projeto.

### Dados (migration 0107, aditiva, e o mesmo bloco em `schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS requisito_exclusoes (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    requisito_id TEXT NOT NULL REFERENCES requisitos(id) ON DELETE CASCADE,
    justificativa TEXT NOT NULL CHECK (length(trim(justificativa)) >= 20 AND length(justificativa) <= 2000),
    decidido_por TEXT NOT NULL,
    decidido_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, requisito_id)
);
```

- **Sem histórico próprio.** Marcar, alterar e desmarcar gravam na trilha (`audit_logs`, `requisito.excluido` e `requisito.reincluido`,
  sem a justificativa no `details`). "Voltar a aplicar" apaga a linha.
- **`decidido_por` e `decidido_em` são do servidor** (o e-mail da sessão e a hora), nunca do corpo.
- **O mínimo de 20 caracteres** barra o "não se aplica" genérico, armadilha conhecida de certificação (exclusão sem motivo).

### Cálculo

Em `lacunasDaFonte`, uma quarta consulta no mesmo `db.batch`: as exclusões do projeto para a fonte.

- **Exclusão herdada.** Um requisito excluído, ou com um ancestral excluído (pelo `pai_id`), sai `nao_aplicavel`, com
  `exclusao: { justificativa, decidido_por, decidido_em, herdada_de? }`. Excluir uma resolução inteira é uma linha só, no requisito-raiz.
- **A exclusão vence a cobertura.** O requisito excluído que também tem origem de cobertura sai `nao_aplicavel`, mas mantém `origens`,
  para a tela mostrar a contradição. Não há bloqueio: o documento pode ter sido ligado antes.
- **`resumoDeLacunas`** ganha `nao_aplicaveis`. O `total` passa a contar só os aplicáveis (`cobertos + parciais + lacunas`), para que a
  porcentagem de cobertura não suba só por excluir.
- **Consumidores.** O painel do encarregado (`src/services/encarregado.ts`) hoje conta a cobertura da LGPD por conta própria e
  incluiria os não aplicáveis no total: passa a usar o mesmo `resumoDeLacunas`. O ponto de partida (`src/services/ponto-de-partida.ts`)
  e a rota `GET .../requisitos/lacunas` já usam o resumo e recebem o campo novo sem mudança.

### Quem decide

- **Só a equipe da ness** (`ehEquipeNess`; decisão do dono de 09/11/2026): excluir um requisito é decisão de escopo. O cliente vê a
  exclusão, a justificativa, quem marcou e quando, mas não grava.
- **Rotas** (faixa `privacy`, como a cobertura por projeto):
  - `PUT /api/v1/projects/:projectId/requisitos/:requisitoId/exclusao` com `{ justificativa }`: cria ou atualiza.
  - `DELETE` na mesma rota: volta a ser aplicável.
  - Requisito inexistente: 404. Requisito com ancestral já excluído: 409 (a decisão é no pai).
- **Agente.** Ferramenta de decisão nova, `niso_excluir_requisito`, com as ações `excluir` (PUT) e `reincluir` (DELETE), no catálogo
  `DECISOES`. Vale o padrão das decisões: o "sim" do consultor no chat, `confirmado_pelo_usuario` e um motivo. A justificativa é o
  corpo; o motivo vai para a trilha `agente.decisao`.
- **Revisão periódica.** Não há revisão automática. A exclusão aparece na tela de Requisitos com data e autor, e o auditor a lê ali.

### Tela (`frontend/src/views/requisitos.js`)

- Cartão "Não aplicáveis" no resumo e o filtro `nao_aplicavel`.
- Selo neutro no item, com a justificativa visível, o autor e a data.
- Para a equipe da ness: "Marcar como não aplicável" (pede a justificativa, `pedirTexto`) e "Voltar a aplicar" no item excluído.
- Item com exclusão herdada: mostra "herdada de <referência>" e não oferece botão.
- Item excluído que também tem cobertura: mostra as origens, marcadas como "ligada antes da exclusão".

### MCP

- `src/mcp/contexto.ts`: a linha de cobertura cita o estado novo e a ferramenta.
- Skill `correcao-e-ajustes`: a armadilha "requisito não aplicável exige justificativa e não serve para limpar lacuna".

## Fora do escopo

- **Exclusão em lote pela tela.** A herança pelo `pai_id` cobre o caso real, que é uma resolução inteira.
- **Exclusão no catálogo global.** A aplicabilidade é sempre por projeto.
- **Aprovação do cliente sobre a exclusão.** A exclusão de controle no n.iso também não pede aprovação. Se for necessária, entra pelo
  fluxo de pedidos num segundo passo.

## Testes

1. `lacunasDaFonte`: excluído sai `nao_aplicavel`; filho de excluído sai `nao_aplicavel` com `herdada_de`; excluído com documento
   vigente sai `nao_aplicavel` e mantém `origens`.
2. `resumoDeLacunas`: `total` não conta os não aplicáveis; o painel do encarregado mostra os mesmos números.
3. Rotas: 400 com justificativa curta, 403 para o cliente (`org_admin`) e para a chave de API, 200 para a equipe, 404 para requisito
   inexistente, 409 para filho de excluído; `DELETE` volta a `lacuna`; a trilha não leva a justificativa.
4. Agente: sem a decisão, 403; com a decisão, 200 e a trilha com o motivo.
5. Contratos: faixas, openapi, agente (`DECISOES`), schema e migration.
6. Tela (jsdom): cartão e filtro novos; botões só para a equipe; herdado sem botão.

## Ações depois do merge

- Aplicar a migration 0107 em produção, com o backup antes e o "sim" do dono.
- No projeto da cliente, a equipe marca os requisitos que não se aplicam, um por um, com a justificativa (pela tela ou pelo agente,
  com o "sim" do consultor). A lista está no levantamento de 31/10/2026, fora do repositório.
- Fechar o PR #537 como superado, com o OK do dono.
