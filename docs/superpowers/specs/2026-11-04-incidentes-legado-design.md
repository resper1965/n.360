# Incidentes no molde do legado — desenho

Data: 04/11/2026. Situação: **aprovado pelo dono em 04/11/2026 com as recomendações** (seção 6). A fatia 1 está em produção (#553, migration 0098, 05/11/2026) a fatia 2 está em produção (#557, migration 0099), a fatia 4 também (#558, migration 0100) a fatia 3 também (#559, migrations 0101 e 0102; os anexos da análise ficaram de fora: o incidente já tem evidências) e a fatia 5 foi construída (migration 0103, as 14 perguntas com o texto exato das capturas); falta a fatia 7, e a 6 não será construída.

Base: as 40 telas da gestão de incidentes do sistema legado (capturas de 23/10/2026) comparadas com o n.360 de hoje
(`incidentes` da migration 0058, `src/services/incidentes.ts`, `src/routes/titular.ts`, aba Incidentes em
`frontend/src/views/titular.js`). As capturas não abrem as listas de opções do legado; onde a lista é proposta minha,
está marcado **proposta**.

## 1. Onde estamos

O n.360 já tem a parte legal mais forte que o legado: prazos de comunicação à ANPD e ao titular contados da ciência e
congelados (`parametros_legais`), avisos D-7, D0 e atraso, trava de encerramento no banco (risco avaliado e, se
relevante, ANPD comunicada), rascunho de IA da comunicação e importação do histórico do legado.

O que falta é o **registro de trabalho** do incidente: o legado é uma ficha com abas onde a equipe descreve, analisa,
corrige e aprende. O n.360 é um cartão com título, descrição, risco e duas datas de comunicação.

## 2. O que o legado tem e o n.360 não

| Área | No legado | No n.360 hoje |
|---|---|---|
| Registro | Origem do alerta, severidade, tipo de incidente, áreas afetadas, comprometimento (C/I/D), "há dados pessoais?", quantidade de titulares, titulares × dados afetados, critérios do risco, evidências (anexos), data e hora de início e fim | Título, descrição, ocorrência, ciência, responsável (só pela API) |
| Responsável | Usuário responsável pelas tratativas, escolhido na tela; responsável da abertura automático | `responsavel_parte_id` (parte), sem campo na tela |
| Análise | Várias análises, cada uma com autor, data, texto e anexos (só o autor altera) | Um campo `avaliacao_texto` junto do risco |
| Ações corretivas | Aba no incidente, protocolo `-PA01`, tratamento (Contenção, Aperfeiçoamento), prazo, responsável, status, anexos | `corrective_actions.incidente_id` existe; "Abrir CAPA" só no n.iso; o incidente não lista as ações |
| Comunicação ANPD | Nº do protocolo ANPD, protocolo interno, data de envio, canal, status, justificativa, "titulares notificados?" | Só a data (`comunicacao_anpd_em`) |
| Fluxo | Rascunho → Aberto → Em análise → Resolvido → Encerrado, com aceite, reatribuição, revisor e "retornar para análise" | aberto → avaliado → comunicado → encerrado, derivado das ações |
| Post mortem | 14 perguntas de causa raiz, abre após o encerramento | Não existe |
| Histórico | Aba com campo, valor antigo e novo, autor e data; exportar | Trilha geral (`logAudit`) sem `entity_type` |
| Impressão | Imprimir o incidente | Não existe |

## 3. O que NÃO copiar (regra do n.360)

- **Revisor externo por link que encerra o incidente.** Encerrar é ato da equipe da consultoria, no servidor
  (`ehEquipeNess` em `POST .../encerrar`; decisão do dono de 15/10). Se o dono quiser a ciência do cliente sobre o
  encerramento, o caminho é um pedido de ciência (`pedidos`, prova imutável), sem poder de encerrar.
- **IP e geolocalização do revisor no histórico.** IP e navegador só aparecem para a equipe (`semIpENavegador`), e
  geolocalização não existe no produto.
- **Excluir incidente.** Registro de prova não se apaga no n.360 (consentimento revogado fica, conta se desativa).
  Proposta: sem exclusão; um incidente aberto por engano é encerrado como "sem risco" com a justificativa.
- **Encerrar sem as travas.** O CHECK da 0058 continua: encerrar exige risco avaliado e, se relevante, a ANPD comunicada.

## 4. Proposta em fatias

Cada fatia é um PR com portão próprio, na ordem de valor para o dia a dia. As fatias 1 e 2 cobrem o que mais aparece
na rotina; as demais podem esperar.

### Fatia 1 — Registro completo (migration 0098)

Colunas novas em `incidentes` (`ALTER TABLE ADD COLUMN`, aditiva, sem refazer a tabela, preservando o CHECK):

| Coluna | Tipo | Regra |
|---|---|---|
| `origem_alerta` | texto ≤ 500 | opcional |
| `severidade` | texto, lista fechada | **proposta:** `baixa`, `media`, `alta`, `critica` |
| `tipo` | texto, lista fechada | **proposta, a validar pelo dono:** acesso indevido, vazamento ou exposição, perda ou extravio, indisponibilidade, alteração indevida, incidente em terceiro (fornecedor ou operador), malware ou ransomware, engenharia social, outro |
| `comprometimento` | JSON de chaves fechadas | `confidencialidade`, `integridade`, `disponibilidade` (uma ou mais) |
| `titulares_estimados` | inteiro ≥ 0 | opcional; passa a alimentar o rascunho de IA da comunicação |
| `criterios_risco` | JSON de chaves fechadas | sensíveis; crianças, adolescentes ou idosos; financeiros; autenticação; sigilo legal, judicial ou profissional; larga escala; "nenhum dos critérios" (exclusivo) |
| `fim_em` | instante | opcional; não pode ser anterior à ocorrência |

Tabelas de ligação (no molde de `tratamento_departamentos`, com `project_id` e gatilho de projeto):
- `incidente_departamentos (incidente_id, departamento_id)` — áreas afetadas, do cadastro de Áreas.
- `incidente_dados (incidente_id, titular_item_id, dado_item_id)` — titulares × dados afetados, do catálogo do projeto
  (`catalogo_itens`, o mesmo do RoPA).

Anexos do incidente: `incidente_anexos`, no molde de `acao_anexos` (PDF/DOC/DOCX até 5 MB, tipo conferido pelo
conteúdo, R2 em `incidentes/<project_id>/<id>/<arquivo>`).

Tela: o incidente deixa de ser um modal e vira **página com abas** (como RIPD e LIA): Registro, Análise, Ações
corretivas, Comunicação, Post mortem, Histórico. Esta fatia entrega a página e a aba Registro; a ciência continua sem
edição (os prazos contam dela). O responsável aparece na tela, escolhido entre as pessoas do cadastro de Partes.

Critério "Há dados pessoais?": no n.privacy o incidente é sempre de dado pessoal (LGPD, art. 48). **Decisão do dono:**
o n.iso precisa registrar incidente sem dado pessoal? Se sim, entra a coluna `dados_pessoais` (sim/não), e com "não"
os prazos de comunicação não se aplicam.

### Fatia 2 — Comunicação à ANPD completa (migration 0099 ou junto da 0098)

Uma comunicação à ANPD por incidente, então cabem colunas em `incidentes`: `anpd_protocolo` (texto),
`anpd_canal` (**proposta:** peticionamento eletrônico SEI, formulário da ANPD, e-mail, outro), `anpd_justificativa`
(texto). A data já existe (`comunicacao_anpd_em`) e agora é escolhida na tela (feito no #551). Protocolo interno
`<protocolo>-COM01` derivado, sem coluna. "Titulares notificados?" já é a comunicação ao titular.

Comunicação parcial e complementar (a Resolução CD/ANPD 15/2024 prevê comunicação complementar): **decisão do dono** se
entra agora. Se sim, vira tabela `incidente_comunicacoes` (várias por incidente) em vez de colunas.

### Fatia 3 — Análises e histórico (migration nova)

- `incidente_analises (id, incidente_id, project_id, autor, texto, created_at)` + anexos no molde de `acao_anexos`.
  Só o autor altera a própria análise, como no legado; a equipe lê todas. O risco continua sendo a avaliação formal
  (`risco_titular`); a análise é o registro do trabalho.
- Histórico: sem migration. Gravar `audit_logs.entity_type = 'incidente'` (8º parâmetro do `logAudit`, como RIPD e LIA)
  com o campo alterado; aba Histórico lê só esses eventos, sem texto livre (o padrão da aba Logs do RIPD) e exporta em CSV.

### Fatia 4 — Ações corretivas dentro do incidente

Sem migration para listar e criar: a aba lista `corrective_actions` com `incidente_id` e cria por ali, nos dois
módulos (hoje "Abrir CAPA" só aparece no n.iso). Anexos pela `acao_anexos` existente.
Com migration (coluna em `corrective_actions`): `tratamento` (**proposta:** contenção, correção, aperfeiçoamento).
O legado desliga o prazo quando o tratamento é "Contenção"; **proposta:** manter o prazo opcional em vez de desligar.
Protocolo `<protocolo>-PA01`: derivado pela ordem de criação, sem coluna.
O legado cria uma ação "Pendente" sozinho na abertura; **proposta:** não criar nada sozinho (a regra do n.360 é nada
automático), e a aba mostra "Nenhuma ação" com o botão de criar.

### Fatia 5 — Post mortem (migration nova)

`incidente_respostas (incidente_id, pergunta, resposta)`, no molde de `lia_respostas`, perguntas em
`src/data/incidente-postmortem.ts` com o texto exato das 14 perguntas do legado. Abre depois do encerramento, como no
legado, e responder não reabre o incidente. **Decisão do dono:** a aba abre só depois do encerramento (como o legado)
ou desde a análise?

### Fatia 6 — Fluxo de status (decidir antes de construir)

O legado tem Rascunho → Aberto → Em análise → Resolvido → Encerrado, com aceite da análise, reatribuição, revisor e
"retornar para análise". Mudar o CHECK de `status` exige refazer a tabela `incidentes` (SQLite), com cuidado com as FKs
de `corrective_actions`. **Proposta:** não refazer. O status do n.360 continua derivado das ações (avaliado,
comunicado, encerrado) e a página mostra a etapa do trabalho como no legado, derivada do que está preenchido
(registro, análise, ações, comunicação). A reatribuição é trocar o responsável (a rota de edição do #551 já aceita; o campo entra na tela na fatia 1).
**Decisão do dono:** precisa do "Resolvido, aguardando revisão" como etapa formal com revisor interno?

### Fatia 7 — Impressão

Word do incidente em `src/services/documento-word.ts`, no molde do RIPD: registro, análises, ações, comunicações,
post mortem e o histórico resumido. Sem migration. Fora do agente (`FORA_DO_AGENTE`), como os outros Word.

## 5. Regras que não mudam

- Encerrar só a equipe da consultoria; o agente MCP só por `niso_encerrar_incidente` com confirmação e motivo.
- O CHECK da 0058 continua valendo para SQL direto.
- Prazos legais só de `parametros_legais`, congelados na criação; a ciência não se edita.
- Texto livre do incidente não vai à trilha; a trilha leva o nome do campo.
- Faixa: incidente segue no núcleo (`incidentes`), as rotas novas de rascunho seguem `privacy` como hoje.
- Importação do legado (`importarIncidente`): as colunas novas entram como opcionais no modelo de CSV, sem quebrar
  arquivo antigo. **Entra na fatia 2** (a fatia 1 grava pela tela e pela API; a importação continua com os campos de antes).

## 6. Decisões do dono (04/11/2026)

1. Severidade e tipo: as listas propostas na fatia 1 valem como estão.
2. O n.iso não registra incidente sem dado pessoal: sem a coluna `dados_pessoais`.
3. Comunicação complementar à ANPD fica para depois: na fatia 2 entram colunas, não tabela.
4. Post mortem abre só depois do encerramento.
5. Sem fluxo formal com revisor: a etapa do trabalho é derivada do que está preenchido.
6. Ordem: 1 → 2 → 4 → 3 → 5 → 7.

Ajuste de construção: a página com abas entra na fatia 3 (quando houver análises, ações e histórico); na fatia 1 o registro
completo cabe na janela do incidente que já existe, com o formulário "Editar registro".

## 7. Como verificar cada fatia

Teste de integração no D1 real para cada rota e gatilho (isolamento por projeto, lista fechada, campo extra 400,
encerrado não muda), contratos (openapi, isolamento, faixas), teste de tela em jsdom para a página e as abas, e um E2E
do incidente vazio, como o das etapas da atividade. Migration com backup antes, conferida por `PRAGMA table_info`.
