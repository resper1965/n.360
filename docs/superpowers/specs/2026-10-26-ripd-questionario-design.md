# RIPD com o questionário do legado, fora do hash (D1)

Decisão do dono, 26/10/2026: as respostas do questionário novo do RIPD **não entram no hash da aprovação**; ficam em tabela própria,
e as aprovações que já existem continuam válidas. Fonte do legado: `docs/arquivo/paridade-legado-2026-10-20.md`, seção 1 (guias gravados no
legado; as capturas têm dado real de cliente e NÃO entram no repositório).

## O que o legado tem (quatro abas)

- **Teste de Impacto:** Resultado esperado; Benefícios; "Existem terceiros (operadores) por parte das etapas de tratamento?";
  "Existem documentos que definem o escopo de atuação desses agentes?".
- **Conformidade** (cerca de 8): problema anterior ou incidente registrado; o que muda depois do projeto; por que os dados são
  coletados; quantos titulares são afetados; quem aprova mudanças; se as partes interessadas foram envolvidas; auditorias de
  acesso; disponibilidade.
- **Armazenamento:** onde os dados ficam; se ficam em território nacional; se há backup fora do país; se há armazenamento físico;
  os mecanismos de segurança.
- **Logs:** linha do tempo de reaberturas.

**O texto exato das perguntas de Conformidade está cortado nas capturas.** Usar as redações acima como ponto de partida, tudo num só
arquivo de dados (`src/data/ripd-perguntas.ts`) com o comentário `// texto a confirmar com o dono` nas que forem aproximadas (substituído em 27/10 pelos textos reais do legado: ver `2026-10-27-guia-legado-ripd-lia-perguntas.md`). Trocar o
texto depois é editar esse arquivo.

## Dado (migration 0083, aditiva)

Tabela `dpia_respostas`: `dpia_id` (FK `dpia_assessments` ON DELETE CASCADE), `project_id` (FK projects CASCADE), `pergunta` (id
estável da lista de dados, até 60), `resposta` (texto até 2000, ou `'sim'|'nao'|'nao_sei'` nas perguntas de escolha), `updated_by`,
`updated_at`; PK `(dpia_id, pergunta)`; trigger que recusa `dpia_id` de outro projeto (molde dos triggers de `lia_assessments` e
`tratamento_bases_gdpr`). **Fora de `COLUNAS_DPIA` e do hash**: `src/services/pedidos.ts` não muda; um teste prova que gravar resposta não
muda o hash nem a situação de uma aprovação existente.

Nunca aplicar em produção: a migration só entra com o "sim" do dono (backup antes). Sem `wrangler ... --remote`.

## Serviço e rotas (faixa `nucleo`, como `/dpia`)

- `src/data/ripd-perguntas.ts`: `ABAS_RIPD` (teste_impacto, conformidade, armazenamento) e `PERGUNTAS_RIPD` (id, aba, texto, tipo
  `texto` ou `escolha`, ordem).
- `GET /projects/:id/dpia/:dpiaId/questionario`: perguntas por aba com a resposta e, quando existir, a **sugestão da atividade**
  (`da_atividade`, só leitura, nunca gravada): operadores (aba Agentes), local de armazenamento (etapa Armazenamento), volume mensal
  (Escopo). Molde: o teste de impacto da atividade (`src/services/impacto.ts`, "A atividade já indica").
- `PUT /projects/:id/dpia/:dpiaId/questionario` com `{ respostas: { <pergunta>: <texto|escolha>|null } }` (estrito, máx. 40; pergunta
  desconhecida é 400; null apaga). Mesmo alcance do `PUT /dpia/:id` (o agente grava só rascunho).
- Logs do RIPD: leitura da trilha filtrada por RIPD (`entity_type`), sem texto livre. Hoje os eventos do RIPD vão a `audit_logs` sem
  `entity_type`: passar a gravar `entity_type = 'dpia'` e `entity_id`.
- Novas rotas: classificar em `test/contrato-isolamento-org.test.ts` e `contrato-isolamento-topo.test.ts` (VALOR_FIXO da nova tabela),
  `src/openapi.ts` e `npm run openapi`.

## Tela: o RIPD vira página com abas (não mais modal)

`frontend/src/views/privacy.js` (modal `openDPIADetailsModal`) → página própria `ripd-ficha` (`views/ripd-ficha.js`), no molde da ficha
do fornecedor (`?tela=ripd-ficha&dpia=<id>&aba=<aba>`, `limparFichaDoEndereco` no router). Abas, na ordem: **Dados** (o formulário atual),
**Teste de Impacto**, **Conformidade**, **Armazenamento**, **Logs**. Em Dados passam a poder ser editados `technical_measures`,
`residual_risk_level`, `dpo_recommendations` e `data_category_risk` (hoje só pela API, no PDF e no Word); editar campo que está no hash de RIPD
assinado derruba a aprovação, como já é hoje, e a tela avisa antes de salvar (decisão 2B de 20/10). O título da página usa a finalidade da
atividade quando `system_name` está vazio (`src/services/lia.ts:169`). A lista de RIPD (`renderDPIA`) abre a página. As abas de perguntas
salvam por campo (autosave como as abas da atividade) e mostram "A atividade já indica: ..." sem gravar.

## Testes

- Servidor (D1 real): GET/PUT do questionário; pergunta desconhecida 400; resposta de outro projeto 403/404; sugestão da atividade;
  **hash e situação de RIPD aprovado inalterados depois de gravar respostas**; trigger de projeto; logs do RIPD com `entity_type`.
- Migration: `test/migration-0083.test.ts` (sobre o formato anterior; CHECKs; cascata); ajustar os testes que contam tabelas ou colunas.
- Telas (jsdom): as cinco abas; autosave; sugestão sem gravar; aviso ao editar campo do hash; título pela finalidade.
- E2E: lista de RIPD → página → aba Conformidade → responder → recarregar e a resposta continua.
- Fora do repositório: nenhum nome, empresa ou pessoa das capturas.
