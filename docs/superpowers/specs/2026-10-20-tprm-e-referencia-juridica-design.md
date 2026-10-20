# Fornecedores no nosso TPRM, Referência jurídica e Empresas (n.privacy)

Decisões do dono, 20/10/2026. Sem migration em nenhuma das duas frentes.

## Frente 1: Fornecedores pela rotina de TPRM (não só pelo legado)

A rotina é a da skill `agent-skills/avaliacao-terceiros/SKILL.md`: o **tipo** do terceiro define o **método** (grande provedor,
trust center; médio e pequeno, questionário; crítico, auditoria); a **avaliação** guarda resultado, validade e evidência; a
**situação** é derivada (pendente, vigente, vencida, reprovada); o **DPA** é um documento ligado. Critério de pronto da skill:
"todo terceiro ligado a tratamento tem tipo, avaliação vigente e DPA ligado". A criticidade (migration 0080) vem antes do tipo.

- **Pendências por fornecedor** (servidor, `src/services/terceiros.ts`): cada item de `GET /projects/:id/terceiros` e a ficha
  ganham `pendencias: string[]`, na ordem: `'Tipo'` (sem `terceiro_tipo`), `'Criticidade'` (sem nível), `'Avaliação'` (situação
  diferente de `vigente`), `'DPA'` (sem documento com papel `dpa`). Vazia = completo. Função pura, testada.
- **Lista de Fornecedores** (`views/terceiros.js`): coluna "Situação do TPRM" com "Completo" ou "Falta: Tipo, DPA"; filtro novo
  "Pendência" (Todas, Completos, com pendência, e uma por item). A ficha mostra a mesma linha no topo.
- **Avaliações** (tela nova `avaliacoes-terceiros`, `views/avaliacoes-terceiros.js`, item `nav-avaliacoes-terceiros` no grupo
  Fornecedores, só n.privacy): a FILA de reavaliação sobre a mesma lista, ordenada por urgência (críticos primeiro). Grupos com
  contagem: Vencidas, Vencem em 30 dias, Sem avaliação, Reprovadas, Em dia. Colunas: Fornecedor, Criticidade, Tipo, Método,
  Vale até, Dias. "Abrir" leva à ficha na aba Avaliações (`?tela=terceiro&parte=&aba=avaliacoes`). Sem fornecedor: vazio que
  explica o método por tipo (as quatro linhas da skill).
- Menu: o grupo Fornecedores passa a ter Fornecedores e Avaliações. Nada mais muda no menu.

## Frente 2: Referência jurídica e Empresas

- **Referência jurídica** (tela `referencia-juridica`, `views/referencia-juridica.js`, item `nav-referencia-juridica`, primeiro
  item de "Mais", só n.privacy): consulta aberta a todo usuário do módulo, só leitura. Abas LGPD (artigos e incisos; o art. 7 e
  o art. 11 destacados como "Bases legais" e agrupados), ANPD e GDPR (as seis bases, de `src/data/ropa-abas/gdpr.ts`, por um
  `GET /api/v1/requisitos/gdpr-bases` novo, só leitura). Cada linha: referência (art./inciso), título, e o selo "Validado
  juridicamente" quando o mapeamento com a ISO está validado. Busca por texto. Usa `GET /requisitos/fontes` e `GET /requisitos?fonte=`.
- **Validar o mapeamento** (só `platform_admin`; o dono é quem valida): botão na própria tela, "Validar mapeamentos propostos",
  mostra a contagem (propostos e validados), pede confirmação e chama `POST /api/v1/requisitos/mapeamentos/validar`
  (corpo opcional `{ fonte }`): muda `estado` de `proposto` para `validado_juridico` com `validado_por` = e-mail de quem está
  logado e `validado_em` = agora, numa transação, com `logAudit`. NUNCA valida em nome de outra pessoa; o agente MCP não chama
  (fora do agente). A tela mostra, depois, "Validado por <e-mail> em <data>".
- **Empresas** (`views/empresa.js` e a tela `empresas`): usar só os dados do cadastro (`empresas`: razão social, nome fantasia,
  CNPJ, setor, porte, local). A consulta de CNPJ (BrasilAPI) está fora do ar: falha nunca bloqueia salvar, a mensagem diz "A
  consulta de CNPJ está indisponível. Preencha os dados à mão." e o botão de consulta é opcional. Nenhum dado novo.
- **Usuários**: sem tela nova; continua em "Conta e acessos (n.360)", para não quebrar a ligação com o n.iso.

## Testes

- Servidor (D1 real): `pendencias` em cada combinação; fila sem vazamento entre projetos; `mapeamentos/validar` só platform_admin
  (403 para os outros), grava validado_por e validado_em, é idempotente, registra a trilha; `gdpr-bases` devolve as seis.
- Telas (jsdom): lista com a coluna e o filtro; fila com os grupos e a ordem; referência com busca, abas e o botão só para o
  platform_admin; Empresas com a consulta falhando e o salvar funcionando.
- E2E: lista de fornecedores → fila → abrir na aba Avaliações; referência jurídica → buscar "consentimento".
