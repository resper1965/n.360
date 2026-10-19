# Avaliação de criticidade do fornecedor (n.privacy, terceiros)

Data: 2026-10-18. Escopo: a tela de terceiro do n.privacy ganha o bloco "Avaliação de criticidade", que substitui a escolha
manual do tipo por cinco respostas, da mesma forma que o legado. Base: fatia 6 (terceiros tipificados, migration 0057).

## Perguntas e respostas

| Bloco | Pergunta | Resposta (rótulo na tela) | Valor gravado | Nível |
|---|---|---|---|---|
| 1 | Impacto no Negócio | Alto (interrupção total ou significativa) | `alto` | Alto |
| 1 | Impacto no Negócio | Médio (impacto relevante, com soluções paliativas) | `medio` | Médio |
| 1 | Impacto no Negócio | Baixo (impacto mínimo ou inexistente) | `baixo` | Baixo |
| 2 | Exclusividade e Alternativas | Sem alternativas (fornecedor único ou substituição muito difícil) | `sem_alternativas` | Alto |
| 2 | Exclusividade e Alternativas | Poucas alternativas (existem, com dificuldades técnicas ou financeiras) | `poucas_alternativas` | Médio |
| 2 | Exclusividade e Alternativas | Várias alternativas (fácil de substituir) | `varias_alternativas` | Baixo |
| 3 | Risco Financeiro | Alto (histórico de instabilidade ou inadimplência) | `alto` | Alto |
| 3 | Risco Financeiro | Médio (algumas oscilações) | `medio` | Médio |
| 3 | Risco Financeiro | Baixo (financeiramente sólido) | `baixo` | Baixo |
| 4 | Conformidade | Está sujeito à Regulamentação Específica no setor de atuação | `regulamentado` | Alto |
| 4 | Conformidade | Não há Regulamentação Específica no setor de atuação | `sem_regulamentacao` | Baixo |
| 5 | Risco Reputacional | Alto (relação direta de reconhecimento da marca entre as empresas) | `alto` | Alto |
| 5 | Risco Reputacional | Médio (algum conhecimento da dependência) | `medio` | Médio |
| 5 | Risco Reputacional | Baixo (risco mínimo) | `baixo` | Baixo |

## Regras

**A. Nível geral = pior critério.** Qualquer bloco Alto torna o nível Alto; senão, qualquer Médio torna Médio; senão Baixo.
O nível é calculado pelo servidor (`nivelDaCriticidade`), nunca vem do corpo da requisição.

**B. O nível define o tipo.** Alto → `critico` (método auditoria); Médio → `medio` (questionário); Baixo → `pequeno`
(questionário). `grande_provedor` (trust center) NUNCA é trocado automaticamente: continua escolha manual. Refazer a avaliação
atualiza o tipo, salvo se ele for `grande_provedor`. O método continua vindo só do tipo (`METODO_DO_TIPO`).

**C. Histórico append-only.** Migration **0080** cria `criticidades_terceiro` (só `CREATE TABLE IF NOT EXISTS` e índice; nenhuma
tabela existente muda). Colunas: `id`, `project_id`, `parte_id`, as cinco respostas, `nivel` (derivado), `avaliado_por`,
`created_at`. A avaliação mais recente é a atual, como em `avaliacoes_terceiro`. Nada é semeado: sem avaliação, o fornecedor
mostra "Sem avaliação de criticidade" e o botão para responder.

**D. Escrita só pela pessoa.** O agente (MCP) só lê: `POST .../criticidades` entra em `FORA_DO_AGENTE` (a avaliação define o
tipo e, com ele, o método de due diligence).

## API

- `GET /api/v1/projects/:projectId/terceiros/:parteId/criticidades` → `{ atual, historico }`. `atual` é `null` sem avaliação.
- `POST /api/v1/projects/:projectId/terceiros/:parteId/criticidades`, corpo estrito com as cinco respostas (enum) → `201`
  `{ ok, id, nivel, tipo }`. Erros: 404 (parte fora do projeto), 400 (não é organização ou resposta inválida).
- Faixa: `privacy`, herdada do segmento `terceiros` (`src/modulos.ts` não muda).

## Interface

Bloco na ficha do terceiro (`frontend/src/views/`, tela de terceiros do n.privacy): cinco perguntas com as opções acima, um único
`.btn-primary` "Confirmar avaliação", o resultado em texto (Alto, Médio ou Baixo, nunca só cor), o tipo resultante e o histórico.
Sem estilo inline além do teto da catraca. Texto em português, sem jargão em inglês.

## Riscos

- **Tipo trocado sem perceber**: a regra B muda o método. Mitigação: o botão diz o tipo que vai ser definido, e o histórico guarda cada nível.
- **Histórico sem o tipo**: a tabela não guarda o tipo resultante (o lista no lugar da linha); o tipo atual vem de `partes.terceiro_tipo`.
- **Migração**: aditiva, sem carga. Aplicar só pelo `migrations apply` (ver `migrations/README.md`); não aplicada em lugar nenhum por esta entrega.
