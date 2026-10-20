# Paridade com o legado: menu, cadastros, diagnóstico e documentos (n.privacy)

Dono, 19/10/2026: capturas do legado de Documentos, Criticidade, Gestão de Riscos (Tratar Risco), Gestão de GAPs, Parceiros,
Dados do Titular, Titulares, Ativos, Áreas e o menu inteiro. As capturas têm dados reais de cliente: nada delas entra no
repositório (nomes, empresas, pessoas). Fixtures sempre fictícias.

## Menu do n.privacy (igual ao legado, na ordem)

`SECOES_PRIVACY` (`frontend/src/produto.js`), títulos de seção fixos como hoje:

1. Dashboard (`nav-encarregado`, rótulo "Dashboard").
2. Empresas (`nav-empresas`, novo): a tela dos dados da empresa do projeto (a mesma do botão "Dados da empresa" do painel).
3. Cadastros: Áreas (`nav-areas`), Ativos (`nav-sistemas`, rótulo "Ativos"), Titulares (`nav-titulares`, novo), Dados de titular
   (`nav-dados-titular`, novo), Parceiros (`nav-parceiros`, novo), Pessoas (`nav-partes`).
4. Mapeamento: Atividades (`nav-ropa`, rótulo "Atividades"), DPIA (`nav-dpia`, rótulo "DPIA"), LIA (`nav-lia`).
5. Diagnóstico: Gaps (`nav-gaps`), Riscos (`nav-mapa-de-risco`).
6. Fornecedores: Fornecedores (`nav-terceiros`).
7. Documentos (`nav-documentos`), Solicitações (`nav-titular`, rótulo "Solicitações").
8. Mais: Incidentes, Consentimentos, Cobertura da LGPD, Evidências, Treinamento, Papéis e comitê, Importar programa.
9. Assistente no fim, como hoje. Usuários continua em Conta e acessos (n.360).

O n.iso e o n.360 não mudam (`frontend/test/casca-menu.test.js` fixa).

## Frente A (sem migration)

- **Titulares** e **Dados de titular**: duas telas (a tela de catálogos atual vira duas, tipo fixo). Titular: lista (Titular,
  Empresa = nome da empresa do projeto), "Ver/Editar" com Titular e Descrição do titular. A descrição usa a coluna
  `catalogo_itens.descricao_padrao` (o serviço `src/services/ropa-abas/catalogos.ts` hoje só a aceita em motivo de risco:
  passa a aceitar também em titular). Dado de titular: lista com busca e filtro "Sensíveis", selo de sensível; modal "Alterar Dado
  Pessoal" com Dado Pessoal, "É um Dado Sensível?", o aviso "Esse dado pessoal também será atualizado no registro vinculado aos
  titulares na base de Atividades." e Excluir (inativa; o que já foi usado continua gravado).
- **Ativos** (a tela Sistemas): título e menu "Ativos"; colunas Ativo, Descrição, Empresa; modal com Ativo e Descrição do ativo
  (`description` do item já existe); os campos extras atuais ficam no modal, abaixo.
- **Parceiros**: lista das organizações do projeto (partes `tipo = 'organizacao'`, ativas), busca, ordenação por nome, editar
  (nome e e-mail), e um atalho "Avaliar como fornecedor" que abre a ficha em Fornecedores; "Novo parceiro" cria a organização.
  Excluir = inativar.
- **Gestão de GAPs** (`views/gaps.js`): colunas Gap, Atividade, Área, Responsável, Prazo, Status ("Em atraso" quando o prazo passou
  e não está concluído, derivado); busca, filtro Status, "Exportar" (CSV que já existe, `export/acoes-atividade`). Clique na linha
  abre o modal "Controle de GAPs" com abas Gap (Gap, Recomendação), Plano de Ação (Plano, Responsável, Prazo, Status) e Anexo
  (lista, envio e remoção), pelas rotas da atividade que já existem (`/ropa/:rid/gaps/:id`, `/anexos`). O servidor devolve a área
  da atividade em `GET .../ropa/gaps`.
- **Gestão de Riscos** (`views/mapa-de-risco.js`, vista Lista como padrão no n.privacy): filtros Motivo, Área, Risco (nível),
  Status; colunas Atividade, Motivo, Risco, Responsável, Prazo, Status. "Tratar Risco" (modal, também na aba Riscos da atividade)
  com abas Risco (Motivo, Descrição, Probabilidade, Impacto, só leitura), Tratamento (Estratégia*, Descrição*, Responsável*,
  Status* Pendente/Concluído, Data prevista para conclusão*) e Risco residual (Probabilidade, Impacto, Risco residual calculado,
  "Recalcular"). Tratamento grava `treatment`, `treatment_plan`, `owner_parte_id`, `status`, `treatment_due_date` pelo
  `PUT /ropa/:rid/riscos/:id` (estender o esquema se faltar campo). Status "Concluído" = `status` fechado do risco; confira os
  valores aceitos no CHECK de `risks.status` em `schema.sql`.
- **Criticidade**: cada critério com a linha de pergunta do legado (Impacto: "Qual o impacto da falha deste fornecedor nas
  operações da empresa?"; Exclusividade: "Quão fácil é substituir este fornecedor?"; Financeiro: "Qual o nível de risco
  financeiro deste fornecedor?"; Conformidade: "Quanto à conformidade regulatória:"; Reputacional: "Falhas deste fornecedor
  poderiam causar danos à imagem da empresa?").

## Frente B (migration 0081, aditiva)

- `departamentos.descricao TEXT` e a tela **Áreas** com Área e Descrição da área (lista Área, Empresa).
- **Documentos** como no legado: tabela nova `documentos_arquivo` (id, project_id, nome, tipo, status, vencimento DATE NULL,
  sem_vencimento INTEGER, responsavel_parte_id NULL, r2_key, arquivo_nome, arquivo_tipo, criado_por, created_at, updated_at;
  CHECK de tipo e status; índice por projeto). Tipos: Política, Norma, Procedimento, Termo, Contrato, Aditivo, Relatório, Outro.
  Status: Rascunho, Publicado, Obsoleto. Arquivo no R2 `STORAGE`, chave `documentos-arquivo/<project_id>/<id>/<nome>`, PDF/DOC/DOCX
  até 10 MB. Rotas `/projects/:id/documentos-arquivo` (listar com filtro, criar, editar, anexar/baixar/remover arquivo, excluir),
  faixa `nucleo`, escrita fora do agente MCP. Tela n.privacy "Documentos": busca, filtros Tipo e Status, colunas Nome, Tipo,
  Vencimento, Status; modal "Documento" (Nome*, Tipo*, Status*, Vencimento ou "Sem vencimento", Responsável, arquivo com ver,
  baixar e remover). Os documentos versionados (políticas) continuam no n.iso e no "Mais" do n.privacy como "Políticas".
- Vencimento: a fonte `documento_arquivo` entra nos avisos de prazo (D-7, D0, atraso), como as outras fontes.
