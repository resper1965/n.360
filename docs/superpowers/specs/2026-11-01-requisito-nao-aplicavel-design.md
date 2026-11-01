# Requisito "não aplicável" com justificativa (n.privacy)

Data: 01/11/2026 · Estado: proposta, aguardando revisão

## Problema

A cobertura de requisitos (`lacunasDaFonte`, em `src/services/requisitos.ts`) tem três estados: `coberto`, `parcial`
e `lacuna`. Um requisito que não vale para o projeto não tem como sair de `lacuna`. Na TWYN, cerca de 30 requisitos
caem nesse caso. Três exemplos:

- A Res. CD/ANPD 2/2022 inteira, porque a TWYN não é agente de pequeno porte e faz tratamento de alto risco.
- Bases legais que a empresa não usa, como LGPD art. 7, III, IV e VIII, e art. 11, II, b, c e f.
- O art. 23, que trata do poder público.

O número de lacunas fica inflado. Com ele, o painel do encarregado, o ponto de partida e a leitura do agente apontam
como pendência o que não é pendência. A saída que existe hoje, ligar um documento qualquer ao requisito para ele
contar como coberto, é pior: registra uma cobertura falsa.

O n.iso já resolve o caso equivalente: um controle pode ser marcado `Not Applicable`, com justificativa obrigatória
(`src/routes/controls.ts`), e isso vai para a SoA. O desenho abaixo copia essa regra para os requisitos.

## Decisão

Um quarto estado de cobertura, `nao_aplicavel`, que só existe com uma justificativa registrada, com quem decidiu e
quando, por projeto.

### Dados (migration nova, aditiva, e o mesmo bloco em `schema.sql`)

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

- **Sem histórico próprio.** Marcar e desmarcar gravam no `audit_logs`, como as demais decisões. Desmarcar apaga a
  linha.
- **O mínimo de 20 caracteres** barra o "não se aplica" genérico, que é armadilha conhecida de certificação (exclusão
  sem motivo, `references/armadilhas-certificadora.md`, item 9).

### Cálculo

Em `lacunasDaFonte`, quarta consulta no mesmo `db.batch`: as exclusões do projeto para a fonte.

- **Exclusão herdada.** Um requisito excluído, ou com um ancestral excluído (pelo `pai_id`), sai como `nao_aplicavel`,
  com `exclusao: { justificativa, decidido_por, decidido_em, herdada_de? }`. Assim, excluir a Res. 2/2022 inteira é
  uma linha só, no requisito-raiz.
- **A exclusão vence a cobertura.** Um requisito excluído que também tenha origem de cobertura sai `nao_aplicavel`,
  mas mantém `origens`, para a tela mostrar a contradição. Não há bloqueio, porque o documento pode ter sido ligado
  antes da exclusão.
- **`resumoDeLacunas`** ganha `nao_aplicaveis`. O `total` passa a contar só os aplicáveis
  (`cobertos + parciais + lacunas`), para que a porcentagem de cobertura não suba só por excluir.
- **Consumidores.** O resumo novo chega sem mudança ao painel do encarregado (`services/encarregado.ts` filtra
  `situacao === 'lacuna'`) e ao ponto de partida (`services/ponto-de-partida.ts`).

### Quem decide

- **Quem pode.** Excluir um requisito é decisão de escopo, da equipe da ness (`ehEquipeNess`), como editar o catálogo.
  O cliente vê a exclusão e a justificativa, mas não as grava.
- **Rotas.**
  - `PUT /api/v1/projects/:projectId/requisitos/:requisitoId/exclusao` com `{ justificativa }`. Cria ou atualiza.
  - `DELETE` na mesma rota. Volta a ser aplicável.
- **Agente.** Nova entrada em `DECISOES`, numa ferramenta nova, `niso_excluir_requisito`, com as ações `excluir` e
  `reincluir`. Vale o padrão das decisões: o "sim" do consultor no chat, `confirmado_pelo_usuario` e um motivo.
  A justificativa é o corpo; o motivo vai para a trilha.
- **Revisão periódica.** Não há revisão automática. A exclusão aparece na tela de requisitos com data e autor, e o
  auditor a lê ali.

### Tela (`frontend/src/views/requisitos.js`)

- Quinto cartão no resumo, "Não aplicáveis", e o filtro `nao_aplicavel` em `FILTROS`.
- Selo cinza no item, com a justificativa visível e o autor e a data.
- Para a equipe da ness: o botão "Marcar como não aplicável", que abre um campo de justificativa, e "Voltar a
  aplicar" no item excluído.
- Item com exclusão herdada: mostra "herdada de <referência>" e não oferece o botão. A decisão é no pai.

### MCP

- `src/mcp/contexto.ts`: a linha de cobertura passa a citar o estado novo e a ferramenta.
- Skill `correcao-e-ajustes`, seção 4: incluir a armadilha "requisito não aplicável exige justificativa e não deve
  ser usado para limpar lacuna".

## Fora do escopo

- **Exclusão em lote por tela.** A herança pelo `pai_id` cobre o caso real, que é uma resolução inteira.
- **Exclusão no catálogo global.** A aplicabilidade é sempre por projeto.
- **Aprovação do cliente sobre a exclusão.** Hoje, a exclusão de controle no n.iso também não pede essa aprovação.
  Se for necessária, ela entra pelo fluxo de pedidos (`/pedidos`) num segundo passo.

## Testes

1. `lacunasDaFonte`: um requisito excluído sai `nao_aplicavel`; um filho de requisito excluído sai `nao_aplicavel`
   com `herdada_de`; um excluído com documento vigente sai `nao_aplicavel` e mantém `origens`.
2. `resumoDeLacunas`: `total` não conta os não aplicáveis.
3. A rota responde 400 com justificativa curta, 403 para o cliente e 200 para a equipe. `DELETE` volta a `lacuna`.
4. Agente: sem a decisão responde 403; com a decisão responde 200 e grava o `audit_logs` com o motivo.
5. `test/schema-contract.test.ts`: a tabela nova.
6. Front: o filtro e o cartão novos; o botão aparece só para a equipe.

## Ações após o merge

- Aplicar a migration em produção, com `npm run db:backup` antes.
- Na TWYN, marcar os cerca de 30 requisitos, um por um, com a justificativa e o "sim" do consultor. A lista está no
  levantamento de 31/10/2026.
