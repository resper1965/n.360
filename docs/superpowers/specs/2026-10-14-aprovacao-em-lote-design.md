# Aprovação em lote

Data: 14/10/2026. Abordagem A aprovada em conversa com o dono do produto: laço no servidor sobre as regras que já
existem, sem migration. Escopo: pedidos (documento, política, DPIA, tratamento), evidências e itens da importação de programa.

## Princípio

O lote **não cria um caminho novo de aprovação**: cada item passa pela mesma função da aprovação individual (autoridade,
segregação de funções, hash do conteúdo). Quem não podia aprovar um item sozinho não passa a poder em lote. A prova é a de
sempre, uma linha de decisão por item; o lote só junta a senha e os cliques.

## Pedidos e evidências: `POST /api/v1/pedidos/lote`

Fica sob `/api/v1/pedidos` (o destinatário já é dono desse prefixo e o papel `stakeholder` só alcança ele). Corpo:

```json
{ "senha": "...", "itens": [ { "tipo": "pedido", "id": "...", "hash_visto": "..." },
                              { "tipo": "evidencia", "id": "...", "hash_visto": "..." } ] }
```

- 1 a 50 itens; `tipo` é `pedido` ou `evidencia`; `hash_visto` é o hash que a pessoa viu (o `hash` do pedido, o `file_hash`
  da evidência). Corpo estrito (campo a mais é 400).
- A senha é conferida **uma vez**. Errada: 401 e nada é feito.
- Cada item vira uma decisão pela função da aprovação individual, extraída da rota atual sem mudar o comportamento dela:
  `decidirPedido` (de `decidir` em `src/routes/pedidos.ts`) e `assinarEvidencia` (de `handleApprove` em
  `src/routes/evidence.ts`). As duas recebem o `hash_visto`: diferente do hash atual, o item é ignorado, nunca aprovado.
- A resposta é sempre 200 com o resultado por item:
  `{ ok: true, aprovados: n, resultados: [ { tipo, id, resultado: "aprovado" | "ignorado", motivo? } ] }`. Falha de um item
  (sem autoridade, já decidido, conteúdo mudou, quem enviou a evidência, pedido substituído) não derruba os outros.
- Só aprova (nunca recusa em lote: recusa pede motivo por item).
- Trilha: as ações de sempre, uma por item, e uma `aprovacao.lote` com o resumo (quantos pediram, quantos aprovados).
- Fora do agente MCP (`FORA_DO_AGENTE`): é ato humano.

## Itens da importação: `POST /projects/:id/importacoes/:lote/itens/decidir`

Corpo `{ ids: string[] (1 a 200), decisao: "aceito" | "descartado" }`. Aplica o mesmo efeito do `PUT .../itens/:iid` a cada
item, sem senha (aceitar é só marcar para gravar; a gravação continua exigindo "confirmar"). Item que não está pendente é
ignorado, com o motivo. Mesma regra de papel da importação (equipe da consultoria); lote em `gravando`/`processando` é 409.

## Tela

"Minhas aprovações": caixa de seleção em cada linha, **liberada só depois de a pessoa abrir o item** (a abertura guarda o
`hash_visto` na linha); botão "Aprovar selecionados" abre um modal com a contagem e a senha; ao final, resumo do resultado
com os motivos dos ignorados. Importação: "Aceitar selecionados" e "Descartar selecionados" na tela de revisão.

## Limites declarados

- Liberar a caixa só depois de abrir é regra de **tela**; o servidor garante o que consegue garantir (autoridade,
  segregação, hash igual ao que a pessoa trouxe). Quem quiser clicar sem ler ainda consegue: é risco de processo.
- Sem marca "li" gravada na prova (seria a abordagem B, descartada: exige migration e mexe na prova imutável).

## Teste

Lote misto (aprovado, hash que mudou, sem autoridade, já decidido, evidência do próprio autor), senha errada (401, nada
muda), acima de 50 (400), tipo desconhecido (400), alcance de projeto (evidência de outro projeto é ignorada), e a
aprovação individual continuando igual (testes existentes de `pedidos` e `evidence`).
