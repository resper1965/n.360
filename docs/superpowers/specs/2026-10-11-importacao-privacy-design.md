# Importação de programa de privacidade — fatia 1 (área de importação + inventário de tratamentos)

Data: 2026-10-11. Decisões do dono: o cliente entrega um pacote **misturado** (planilhas, documentos, exports de outras
ferramentas); tudo passa por **proposta revisada antes de gravar** (nada entra sem o "sim" de uma pessoa); o alcance
final cobre inventário de tratamentos, terceiros, documentos e avaliações, e histórico operacional; abordagem A (tudo
dentro do n.privacy, agente no Worker).

## Fatias

1. **Área de importação, revisão e gravação + inventário de tratamentos** (esta spec).
2. Terceiros (com avaliação e DPA ligado).
3. Documentos e avaliações (políticas, avisos, DPIA, LIA; arquivo vira documento/evidência).
4. Histórico operacional (pedidos do titular, incidentes, consentimentos; datas e protocolos originais preservados).

Arquivos de tipos das fatias 2–4 são classificados já na fatia 1 e ficam "aguardando" — nada se perde.

## Dados (migration nova)

- `importacoes`: `id`, `project_id` (FK cascade), `criado_por`, `status` (`recebendo|processando|em_revisao|concluida|cancelada`), `created_at`, `updated_at`.
- `importacao_arquivos`: `id`, `importacao_id` (FK cascade), `project_id`, `nome`, `mime`, `tamanho`, `r2_key`,
  `tipo` (`inventario|terceiros|documento|avaliacao|historico|desconhecido`, nulo antes de classificar),
  `status` (`pendente|processado|aguardando|erro`), `erro`, `modelo`, `created_at`.
- `importacao_itens`: `id`, `importacao_id` (FK cascade), `arquivo_id` (FK cascade), `project_id`, `entidade`
  (`tratamento` nesta fatia), `dados` (JSON validado), `origem` (trecho, ≤ 500 caracteres), `confianca`
  (`alta|media|baixa`), `faltando` (JSON: campos obrigatórios vazios), `duplicata_de` (id de `ropa_records`),
  `decisao` (`pendente|aceito|descartado|gravado|recusado`), `motivo` (da recusa), `registro_id`, `created_at`, `updated_at`.
- Arquivos no R2 `STORAGE`, chave `importacoes/<project_id>/<importacao_id>/<arquivo_id>`.

## Fluxo e rotas (faixa `privacy`; segmento `importacoes`)

Base `/api/v1/projects/:projectId/importacoes`. Só equipe da consultoria com acesso ao projeto (platform_admin,
consultoria_admin, consultor designado) — mesmas checagens das outras rotas de projeto.

| Rota | Faz |
|---|---|
| `POST /` | cria o lote |
| `GET /` | lista os lotes do projeto |
| `GET /:id` | lote + arquivos + itens |
| `POST /:id/arquivos` | envio multipart de um arquivo; tipos aceitos: pdf, docx, xlsx, xls, ods, csv, json, html, xml; ≤ 20 MB; ≤ 50 arquivos por lote |
| `POST /:id/arquivos/:aid/processar` | converte (JSON e CSV lidos direto; o resto por `env.AI.toMarkdown`), classifica, e se for `inventario` extrai tratamentos; um arquivo por chamada (a tela chama em sequência); reprocessar substitui os itens daquele arquivo ainda não gravados |
| `PUT /:id/itens/:iid` | corrige `dados` (revalidado) e/ou muda a `decisao` (`aceito|descartado|pendente`) |
| `POST /:id/confirmar` | grava os itens `aceito`; resultado por item (`gravado` com `registro_id`, ou `recusado` com motivo); idempotente |
| `DELETE /:id` | cancela: apaga arquivos do R2, arquivos e itens; não toca registros já gravados |

## O agente

- Classe no padrão de `src/agents/*` (estende `BaseAgent`, usa `runModel`: GPT-4.1 via AI Gateway, Llama 70B de reserva).
- **Classificar**: devolve um dos tipos acima a partir das primeiras ~4.000 palavras do texto.
- **Extrair tratamentos**: devolve JSON `{ tratamentos: [...] }` com, por tratamento: `finalidade` (obrigatória),
  `base_legal` (texto), `categorias_dados`, `titulares`, `retencao`, `destinatarios`, `transferencia_internacional`
  (bool), `salvaguardas`, `dpia_requerido` (bool), `responsavel`, `sistemas[]`, `areas[]`, `pessoas[]`, `origem`
  (trecho literal), `confianca`. Texto longo é dividido em blocos; resultados juntados.
- Validação no servidor (zod, `strict`, tetos de tamanho por campo); o que não passa vira item `recusado` com motivo.
  O texto do arquivo é dado: o prompt diz isso, e só os campos do esquema chegam ao banco.
- `faltando` = obrigatórios do RoPA vazios (`finalidade`, `base_legal`, `categorias_dados`, `titulares`, `retencao`).
- `duplicata_de`: mesma finalidade normalizada de um `ropa_records` do projeto (a regra de `tratamentos-importar.ts`);
  duplicata nasce `descartado`; demais nascem `pendente`.

## Gravação (confirmar)

- Cria o `ropa_records` (status `Draft`) com os mesmos campos e validações da importação por planilha
  (`src/services/tratamentos-importar.ts`), reaproveitando a função que já mapeia e valida.
- **Base legal**: o texto casa com os filhos de `lgpd:art7` / `lgpd:art11` pelo título (normalizado); casou → `base_legal_id`; senão só o texto (`legal_basis`).
- **Ligações**: `sistemas` → `itens` por nome normalizado; `areas` → `departamentos`; `pessoas` → `partes` (pessoa).
  O que não casa é criado (item/departamento/parte) — o revisor já viu a lista na tela. Usa `definirLigacao` de
  `src/services/tratamentos.ts` e os serviços de criação existentes.
- Cada gravação vai para a trilha (`logAudit`, ação `importacao.gravada`, com o lote).

## Tela (n.privacy, menu Privacidade → "Importar programa")

Lista de lotes; dentro do lote: envio (vários arquivos), botão "Processar" com andamento arquivo a arquivo (situação e
tipo detectado de cada um), e a revisão: tabela de tratamentos propostos com confiança, campos que faltam, origem
(trecho expandível), "já existe" com link, edição dos campos, aceitar/descartar por item e "aceitar todos de confiança
alta". "Confirmar importação" mostra o resultado por item. "Cancelar lote" com confirmação na própria janela.

## Segurança

Instruções escondidas nos documentos não executam nada (só esquema validado chega ao banco; revisão humana antes de
gravar). Arquivos com dado pessoal ficam no R2 presos ao lote; cancelar apaga. **Exclusão de projeto:** o sistema não tem
hoje rota que exclua projeto; as linhas das tabelas novas caem por FK (`ON DELETE CASCADE`), mas os objetos da importação
no R2 (como os de evidência) ficariam órfãos: se uma rota de exclusão de projeto for criada, ela precisa apagar
`importacoes/<project_id>/` do R2. A rota `DELETE` do lote entra na trilha central de exclusão como rota de projeto. Tipos e tamanhos limitados no envio. Isolamento por projeto.

## Testes

Backend (D1 real; `env.AI` simulado): lote e envio com tetos; processar com classificação e extração simuladas (válida,
inválida, com instrução escondida); duplicata; base legal ligada ao inciso; ligações casadas e criadas; confirmar
parcial e idempotente; cancelar apaga R2 e linhas; isolamento entre projetos e papéis; faixa `privacy`.
Frontend (jsdom): lote com andamento, revisão, aceitar/descartar/editar, resultado da confirmação.
Extração real (fora do CI): script com planilha e PDF fictícios contra o modelo verdadeiro.

## Fora do escopo

Fatias 2–4; importação pelo cliente; imagens; atualizar tratamento existente a partir da importação.
