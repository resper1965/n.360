# Pedido do titular: conferência de identidade e encaminhamento a ponto focal (n.privacy)

Data: 06/11/2026. Situação: **aprovada pelo dono em 06/11/2026** e construída (migration 0104; plano `docs/superpowers/plans/2026-11-06-titular-identidade-encaminhamento.md`).
Base: `2026-11-03-portal-solicitacoes-titular-design.md`, que deixou os dois itens "de fora (follow-up)". Hoje os dois existem só
como tratativa em texto livre (`titular_pedido_tratativas`, tipos `encaminhamento` e `nota`).

## Decisões do dono (06/11/2026)

1. **Ponto focal = Pessoa do cadastro com e-mail.** Recebe e-mail, responde por fora; o DPO registra o retorno no pedido. Sem página
   pública nova e sem conta no sistema para o ponto focal.
2. **Identidade = só registro.** A tela avisa "Identidade não conferida" ao responder, mas não trava. Nada no servidor exige a
   conferência para responder, negar ou arquivar.
3. A consulta pública pelo protocolo fica fora.

## 1. Conferência de identidade

**Dado.** Quatro colunas novas em `titular_pedidos` (migration 0104, `ALTER TABLE ADD COLUMN`):

| Coluna | Regra |
|---|---|
| `identidade_metodo` | Lista fechada (CHECK): `documento_foto`, `dados_cadastrais`, `canal_autenticado`, `presencial`, `outro`. |
| `identidade_obs` | Opcional, até 500 caracteres. Recusa CPF, e-mail, telefone (o detector de `mascararPii`) e sequência de 7 ou mais dígitos (com ponto, hífen ou espaço no meio): não é lugar de número de documento. |
| `identidade_por` | E-mail de quem registrou, carimbado pela sessão. Nunca vem do corpo. |
| `identidade_em` | Data e hora do registro, carimbada pelo servidor. |

**Rota.** `PUT /projects/:id/titular-pedidos/:pid/identidade` com `{ metodo, observacao? }` (esquema estrito). Regravar substitui (a
pessoa pode corrigir o método); `metodo: null` limpa as quatro colunas. Quem grava: os mesmos que respondem o pedido (equipe e o
`org_admin` do próprio projeto; `org_user` e `client` recebem 403 pelo allow-list de só leitura). **Fora do agente MCP**
(`FORA_DO_AGENTE`): é passo humano do DPO. Trilha `titular_pedido.identidade` com o protocolo e o método, nunca a observação.

**Leitura.** `GET .../titular-pedidos` e `GET .../titular-pedidos/:pid` devolvem as quatro colunas e o nome de quem conferiu.

**Tela.** No pedido, bloco "Identidade do titular": método, observação, "Conferida por <nome> em <data>" e "Registrar conferência"
(ou "Alterar"). Ao salvar o pedido com status `respondido` sem conferência, a tela mostra o aviso "Identidade não conferida. Responder
mesmo assim?" com confirmação; o servidor não recusa. A lista mostra um selo "Identidade não conferida" nos pedidos abertos sem conferência.

## 2. Encaminhamento a ponto focal

**Dado.** Tabela nova `titular_pedido_encaminhamentos` (migration 0104), gatilho de projeto como as outras filhas:

| Coluna | Regra |
|---|---|
| `id`, `pedido_id`, `project_id` | `pedido_id` com `ON DELETE CASCADE`; gatilho recusa pedido de outro projeto. |
| `parte_id` | Pessoa do cadastro (`partes.tipo = 'pessoa'`, ativa, do mesmo projeto, com e-mail), conferida no serviço; o gatilho de projeto também recusa parte de outro projeto. `REFERENCES partes(id)` simples: a parte não se apaga, só desativa. |
| `prazo` | Data (AAAA-MM-DD), hoje ou depois (dia de São Paulo, `hojeEmSaoPaulo`). |
| `mensagem` | Texto do DPO, 1 a 2000 caracteres. É o que vai no e-mail. |
| `status` | `aguardando`, `respondido`, `cancelado` (CHECK). |
| `retorno` | O que o ponto focal respondeu, registrado pelo DPO, até 5000 caracteres; obrigatório para `respondido`. |
| `enviado_por`, `enviado_em`, `retorno_por`, `retorno_em`, `created_at` | Carimbados pelo servidor. |

**Rotas** (faixa `privacy`, como o resto de `titular-pedidos`):

- `GET .../titular-pedidos/:pid/encaminhamentos`: a lista, com o nome da pessoa e a situação do prazo (`no_prazo`, `vence_hoje`,
  `atrasado`, ou `encerrado` quando não está aguardando).
- `POST .../titular-pedidos/:pid/encaminhamentos` com `{ parte_id, prazo, mensagem }`: só com o pedido em aberto (`recebido` ou
  `em_andamento`; senão 409). Grava, manda o e-mail e acrescenta uma tratativa `encaminhamento` com o texto gerado
  "Encaminhado a <nome>, prazo <data>" (sem a mensagem).
- `PUT .../encaminhamentos/:eid` com `{ status: 'respondido', retorno }` ou `{ status: 'cancelado' }`: só de `aguardando`; depois
  disso não muda (409). Vale também com o pedido já encerrado (o retorno pode chegar depois).

Quem grava: equipe e o `org_admin` do projeto. **Fora do agente MCP** (manda e-mail a terceiro). Trilha
`titular_pedido.encaminhamento` com o protocolo, a ação e o id da parte; nunca a mensagem nem o retorno.

**E-mail** (`emailEncaminhamentoTitular` em `src/services/emails.ts`, pelo `montarEmail`, amostra em `scripts/emails-amostra.mjs`):
assunto com o protocolo; corpo com o tipo do pedido, o prazo interno ("Até quando") e a mensagem do DPO; `reply_to` de quem
encaminhou; remetente `remetente(...)`. **Não leva nome, contato, descrição nem resposta do titular**: o DPO escreve na mensagem o que
o ponto focal precisa saber. Sem `RESEND_API_KEY`, ou com falha de envio, o encaminhamento fica gravado, a falha vai ao log
(`titular_encaminhamento_email_falhou`) e a resposta traz `email_enviado: false` para a tela avisar.

**Avisos de prazo.** Fonte nova `encaminhamento_titular` em `src/services/avisos-prazo.ts`: encaminhamento `aguardando` com prazo,
D-0 e atraso (sem D-7: o prazo interno é curto), para os mesmos destinatários da fonte `titular_pedido`, faixa `privacy`, título
"Encaminhamento do pedido <protocolo> a <nome>".

**Tela.** No pedido, seção "Encaminhamentos": a lista (pessoa, prazo com selo da situação, status, retorno) e "Encaminhar", que abre
o formulário (Pessoa entre as pessoas ativas com e-mail, prazo, mensagem). Em cada linha aguardando: "Registrar retorno" e "Cancelar".

## 3. Migration 0104

Aditiva: as quatro colunas por `ALTER TABLE ADD COLUMN` (não se repete; a conferência é por `PRAGMA table_info`) e a tabela nova com
índice e gatilhos por `IF NOT EXISTS`. Também no `schema.sql`. Backup antes e o "sim" do dono para aplicar.

## 4. Testes

- Integração no D1 real: identidade grava e regrava, carimba quem e quando, recusa método fora da lista, campo extra e observação com
  CPF ou 7+ dígitos; `org_user` recebe 403; agente recebe 403 nas duas rotas novas.
- Encaminhamento: só pessoa ativa com e-mail do mesmo projeto; prazo no passado é 400; pedido encerrado é 409; o e-mail sai sem nome,
  contato nem descrição do titular (envio dublado); falha do e-mail não desfaz; retorno só de `aguardando`; tratativa criada sem a
  mensagem; gatilho recusa pedido de outro projeto; isolamento entre projetos; aviso de prazo D-0 e atraso.
- Contratos: faixas (`modulos-produto`), tela↔API, agente, openapi, contagem de colunas da 0058.
- Tela (jsdom): bloco de identidade, aviso ao responder sem conferência, selo na lista, seção de encaminhamentos com encaminhar,
  retorno e cancelar.

## 5. Fora

- Página ou link para o ponto focal responder no sistema.
- Exigir a identidade para responder.
- Consulta pública pelo protocolo.
- Anexo no encaminhamento (o pedido já tem as tratativas do tipo evidência).
