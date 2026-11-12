# Política de Segurança

O n.360 (e os módulos n.iso, n.privacy e n.ot) processa dados de conformidade e **dados pessoais
sob a LGPD** (RoPA, DPIA, pedidos de titulares, incidentes, consentimentos, evidências de
auditoria). Uma falha aqui não afeta só o sistema — afeta
os titulares de dados dos nossos clientes. Trate relatos de segurança com essa
gravidade.

## Reportar uma vulnerabilidade

**Não abra issue pública para vulnerabilidade.** Use um destes canais:

1. **GitHub Security Advisory** (preferencial) — aba *Security* → *Report a vulnerability*.
   Cria um canal privado com os mantenedores.
2. **E-mail** — `security@ness.lat`, com "n.360" no assunto.

Inclua, se possível: passos para reproduzir, impacto observado, versão/commit
afetado e se há exploração ativa.

**Retorno esperado:** confirmação de recebimento em até 3 dias úteis; avaliação
inicial de severidade em até 10 dias úteis.

## Escopo

Interessa especialmente (foi onde já encontramos problemas reais):

- **Isolamento entre clientes (multi-tenant)** — qualquer caminho que exponha dados
  de um projeto a usuário de outro
- **Autenticação e sessão** — bypass, escalonamento de privilégio, força bruta
- **Chaves de API e tokens** — previsibilidade, vazamento, escopo excessivo
- **Injeção** — SQL, XSS (inclusive stored, nos relatórios HTML), SSRF via webhooks
- **Trilha de auditoria** — qualquer forma de adulterar ou apagar `audit_logs`
- **Exposição de PII** — ROPA/DPIA acessíveis fora do projeto dono
- **Agente de IA (MCP remoto)** — qualquer caminho em que o agente alcance outro
  projeto, aja sobre a conta do consultor, amplie o próprio acesso ou execute ação
  destrutiva sem confirmação (modelo de ameaça em
  [`docs/agente/seguranca.md`](docs/agente/seguranca.md))

## Fora de escopo

- Ausência de rate limit em endpoints puramente de leitura
- Relatos gerados só por scanner automático, sem impacto demonstrado
- Engenharia social, ataque físico, DoS por volume
- Vulnerabilidades em dependências **sem** caminho de exploração no produto
  (reporte via issue normal, com a label `dependencies`)

## Compromissos deste repositório

Invariantes de segurança que o código mantém e que **não devem regredir**:

| Invariante | Onde é garantido |
|---|---|
| Isolamento de tenant em rotas de projeto | `src/middleware/project-access.ts` + teste cobrindo os 3 estilos de montagem |
| Consultor humano só alcança os projetos em que está designado como `consultor` na governança (rota de projeto, recurso por id e listagens entre projetos); só o `platform_admin` vê todos. Mesma regra do agente, falha fechada | `consultorDesignado` / `PROJETOS_DO_CONSULTOR_SQL` em `src/helpers.ts`, usados por `requireProjectAccess`, `requireResourceAccess`, `projetosVisiveis` e `concessaoValida` — `test/consultor-escopo.test.ts` |
| Escrita restrita para papéis read-only | `src/middleware/auth.ts` (allow-list por método+rota) |
| Segredos nunca no repositório | `SETUP_KEY` via `wrangler secret`; falha fechada se ausente |
| Tokens de segurança com CSPRNG | `genToken` / `genNumericCode` em `src/helpers.ts` — nunca `Math.random` |
| Trilha de auditoria imutável | Triggers `audit_logs_no_update` / `audit_logs_no_delete` |
| Código bate com o schema | `test/schema-contract.test.ts` roda contra D1 real |
| Webhook `ot.desvio` exige visão completa do inventário n.ot e nunca leva IP, MAC nem hash de IP (pontas por nome de ativo e zona); só vai a webhook que assina o evento literalmente, assinado, sem seguir redirect | `src/routes/integrations.ts` (cadastro), `projetarDesvios`/`corpoWebhook` em `src/services/ot-desvio.ts`, `src/services/webhook-entrega.ts` |
| Agente de IA preso a um projeto, sem alcançar conta pessoal, acesso, credencial nem área comercial | `resolverAgente` e `FORA_DO_AGENTE` em `src/middleware/agente.ts`; os 13 invariantes (I1 a I13: `grep -oE '^\| \*\*I[0-9]+' docs/agente/seguranca.md \| sort -u \| wc -l`) e o checklist de PR em [`docs/agente/seguranca.md`](docs/agente/seguranca.md) — `test/agente-paridade.test.ts` |
| Ação destrutiva do agente (apagar, lote, eliminar titular, revogar aprovações) exige confirmação **no servidor** e deixa trilha com o projeto | `acaoDestrutiva` + `X-Agente-Confirmado`; hook em `src/middleware/auth.ts` — `test/agente-paridade.test.ts` |
| Concessão do agente revalidada a cada chamada; troca de senha a revoga | `concessaoValida` — `test/mcp-remoto.test.ts`, `test/agente-principal.test.ts` |
| Segredo de integração não sai (listagem de webhooks, export de portabilidade) | `src/routes/integrations.ts`, `src/portabilidade.ts` — `test/webhooks-segredo.test.ts` |
| Rota de módulo só com o módulo no projeto **e** na pessoa; o núcleo vale com qualquer módulo | `src/modulos.ts` (faixas, `modulosDaPessoa`) no `projectAccessMiddleware` e no `requireResourceAccess` — `test/modulos-produto.test.ts`, `test/modulos-por-pessoa.test.ts` |
| n.ot (P0-1): o módulo `ot` nunca é concedido automaticamente, nem a cliente nem à equipe; só por concessão explícita com trilha | gatilho `usuario_modulos_padrao` da `migrations/0089_modulo_ot.sql` e `PUT /projects/:id/modulos/ot` sem concessão — `test/migration-0089.test.ts`, `test/ot-modulo.test.ts` |
| n.ot (P0-2): chave de API e agente MCP recebem 403 em toda rota `ot` | middleware de `otApp` (`src/routes/ot.ts`) e `FORA_DO_AGENTE` — `test/ot-modulo.test.ts`, `test/agente-paridade.test.ts` |
| n.ot (P0-3): a planilha da coleta é lida em memória e nunca vai ao R2 nem à IA (XLSX sem `toMarkdown`, sem DTD, com teto descomprimido); staging guarda IP/MAC só cifrados; lote não concluído expira em 7 dias | `POST /ot/levantamentos/:id/depara/planilha/*` em `src/routes/ot-depara.ts`, `src/services/ot-planilha.ts`, CHECK de `ot_lote_itens.dados` (`migrations/0092_ot_coleta.sql`), `src/manutencao.ts` — `test/ot-coleta.test.ts`, `test/ot-planilha.test.ts`, `test/migration-0092.test.ts` |
| n.ot (P0-5): dedupe da coleta não revela o alvo: procura só no site do lote, e quem não vê completo recebe só `possivel_duplicata`; tetos de 5.000 itens por lote e 20 lotes por dia por pessoa | `indice` e `serializarItem` em `src/services/ot-coleta.ts` — `test/ot-coleta.test.ts` |
| n.ot (P0-4): um só filtro de site para toda consulta `ot_*`; o técnico (`org_user`) vê só os sites concedidos em `ot_site_acessos`, sem vínculo nenhum | `sitesPermitidos` em `src/services/ot-inventario.ts` — `test/ot-inventario.test.ts` ("P0-4: filtro de site único"), `test/ot-saidas.test.ts` |
| n.ot (P0-6): máscara de IP/MAC num serializador só, pelo papel (completo para Gestor ARCiber, consultor designado e consultoria_admin designado); leitura sem máscara vai à trilha (`ot.inventario.ver_sensivel` em `GET /ativos`, `GET /lotes/:id` e `GET /levantamentos/:id`) | `serializarAtivo` e `podeVerCompleto` em `src/services/ot-inventario.ts` — `test/ot-inventario.test.ts` ("P0-6: máscara única por papel"), `test/ot-saidas.test.ts`, `test/ot-levantamento.test.ts` |
| n.ot (P0-7): a IA não recebe IP, MAC, hostname nem número de série; a saída só volta com o valor real em ip/mac/hostname, e token em campo livre recusa a resposta | `mascararParaIa`, `restaurarSaida` e `perguntarIa` em `src/services/ot-ia.ts` — `test/ot-ia.test.ts`, `test/ot-saidas.test.ts` |
| n.ot (P1-1): revelar e exportar exigem TOTP confirmado nos últimos 10 min (403 `totp_necessario`, mesmo com SSO), justificativa sem IP/MAC na trilha, teto por hora (429 `teto_por_hora`) e aviso ao Gestor ARCiber titular e suplente | `semStepUp`, `tetoEstourado` e `avisarGestorArciber` em `src/services/ot-stepup.ts` — `test/ot-stepup.test.ts` |
| n.ot (levantamento): texto livre (notas, achados) recusa IP, MAC, CPF, e-mail e telefone; operador identificado só por função e turno | `src/services/ot-levantamento.ts` — `test/ot-levantamento-esquemas.test.ts`, `test/ot-levantamento-servico.test.ts` |
| n.ot (levantamento): o confronto com o inventário só sai para quem vê completo (`podeVerCompleto`); os demais não aprendem se o alvo existe | `src/services/ot-levantamento.ts`, `src/routes/ot.ts` — `test/ot-levantamento.test.ts` |
| n.ot (L2, A1): o confronto do fluxo também só sai para quem vê completo; pontas só do site da sessão (sem oráculo); a entidade do item de lote nunca vem do corpo da requisição (`/lotes/manual` e planilha só criam ativo) | `src/services/ot-fluxo-achado.ts`, `src/routes/ot.ts` |
| n.ot (L4, de-para): arquivo lido em memória e descartado (nunca R2, nunca gravado; `toMarkdown` proibido); CPF, e-mail e telefone mascarados e depois IP, MAC e hostname (P0-7) antes da IA, sem chamada com endereço residual; campos com marcador da IA passam pela checagem de resíduo; evidência só aceita se existir no texto enviado e gravada sem endereço nem dado pessoal; teto por hora; trilha só com ids e contagens | `src/services/ot-ia.ts`, `src/services/ot-depara.ts`, `src/routes/ot-depara.ts` — `test/ot-depara.test.ts`, `test/ot-ia.test.ts` |
| n.ot (L5, agente de coleta): chave `ot_coleta` com validade (7 dias, máx. 30) vale só em `/ot-coleta/mcp` e é recusada em toda a `/api/v1` e em `/mcp` (falha fechada); 4 ferramentas, sem leitura de inventário nem oráculo, só ativo, sem zona, sem lote JSON-RPC; interruptor só do Gestor ARCiber, chaves só do Gestor ou da consultoria designada; teto de 120 chamadas/hora e 20 sessões/dia por chave, 200 achados por chamada e 2.000 por sessão; trilha só com ids e contagens; aviso: o arquivo passa pelo modelo do agente sem a máscara do n.ot | `src/middleware/auth.ts`, `src/services/ot-agente.ts`, `src/mcp/ot-coleta.ts` — `test/ot-agente-mcp.test.ts`, `test/ot-agente-chave.test.ts` |
| n.ot (L3, sensor de rede): resumo sem payload (só IP, MAC, portas, protocolo e horários) lido em memória e descartado (nunca R2, sem IA); validação estrita (zod) sem ecoar o valor recebido; só quem vê o inventário completo importa (A1, 403 aos demais); dados do achado cifrados; fluxo pendente guarda só hash (IP externo nunca guardado), vence em 90 dias; tetos de 2.000 pendências e 2.000 achados por sessão; trilha só com ids e contagens | `src/services/ot-rede.ts`, `src/routes/ot-depara.ts` — `test/ot-rede.test.ts`, `test/ot-rede-servico.test.ts`, `scripts/test_n_ot_resumo_zeek.py` |
| n.ot (sonda, envio automático): credencial da sonda (`ots_` + 64 hex, só o SHA-256 no banco, mostrada uma vez) por sonda e por site, validade 365 dias, no máximo 2 ativas; vale só em `POST /ot-sensor/resumo` (fora do `/api`) e é recusada em qualquer outra rota, e `ot_coleta` e chave comum são recusadas nela (falha fechada a cada envio); `faixa_origem` obrigatória e IP lido só de `CF-Connecting-IP` (403 sem faixa ou fora dela); corpo até 5 MB lido com teto e validado como na L3; resposta só `{ recebido, envio_id }` (sem contagem, sem oráculo do inventário); idempotente pela impressão do corpo, 30 envios aceitos (em processamento ou concluídos) por dia; criação da sessão, anotação, conclusão e liberação do envio guardadas pela marca do dono da linha (o `gravarPlano` não é: limite aceito, um pedido de mais de 10 min sobreposto a uma tomada pode gravar rascunhos duplicados, atenuados pelo filtro de novidade); a sonda só escreve rascunhos do próprio site, nada entra no inventário sem aprovação humana; trilha só com ids e contagens; script não segue redirecionamento (3xx para) e só lê conf https com modo 0600; sonda sem IP na placa de escuta, firewall fechado e usuário dedicado | `src/routes/ot-sensor.ts`, `src/services/ot-sensor.ts`, `scripts/n-ot-resumo-zeek.py`, `scripts/instalar-sonda.sh` — `test/ot-sensor*.test.ts`, `scripts/test_n_ot_resumo_zeek.py` |
| n.ot (levantamento): achado só entra no inventário por lote aprovado; retenção: descartado sai em 30 dias (90 se veio da sonda, com `chave_sensor`), rascunho de sessão encerrada há 30 dias sai (rascunho de sessão aberta não expira), `enviado` sem lote, de lote rejeitado ou de lote apagado volta a rascunho em 1 dia; leituras com `LIMIT` explícito (`TETO_LEITURA_OT`) | `src/services/ot-levantamento.ts`, `src/manutencao.ts`, `migrations/0093` — `test/ot-levantamento.test.ts`, `test/ot-levantamento-servico.test.ts`, `frontend/test/ot-ux.test.js` |
| Conta se desativa, não se apaga; desativada não entra por senha, SSO, agente nem sessão aberta. Apagar de verdade só `platform_admin`; ninguém desativa a própria conta | `PUT /api/v1/users/:id/ativo` e `DELETE ...?definitivo=1` em `src/routes/users.ts` — `test/contas-ativo.test.ts`, `test/contas-seguranca.test.ts` |
| Busca ao IdP do SSO só em host público e sem seguir redirecionamento (SSRF) | `exigirHostPublico` e `buscarNoIdp` (`redirect: 'manual'`) em `src/sso.ts` — `test/sso.test.ts` |
| Rascunho de IA do n.privacy não leva dado do titular ao modelo e não grava nada no registro | `mascararPii` e esquema estrito em `src/services/rascunhos-privacy.ts` — `test/agentes-privacy.test.ts` |
| Importação de histórico: e-mail, CPF e telefone viram pseudônimo por projeto antes da IA; sem a chave, nada vai ao modelo | `pseudonimizador` (HMAC com subchave da `TOKEN_ENC_KEY`) e `mascararPii` em `src/services/importacao.ts` — `test/importacao.test.ts` |
| Nenhum e-mail leva senha: conta nova nasce sem senha utilizável e o convite traz link de uso único (token CSPRNG no fragmento, só o SHA-256 no banco, 72 h, reenviar invalida o anterior); link inválido, vencido, usado ou de conta desativada dá a mesma resposta | `src/services/convite.ts`, `POST /api/v1/auth/criar-senha` em `src/routes/auth.ts` — `test/convite-senha.test.ts` |
| 500 não devolve o interior do banco | `erro500` em `src/helpers.ts`: detalhe do D1 vai ao log, cliente recebe `request_id` — `test/erro-sem-vazamento.test.ts` |

Ao alterar qualquer um destes pontos, o PR precisa explicar por quê.

## Operação

Antes de aplicar migrations em produção: **faça backup** (`npm run db:backup`,
runbook em `backups/README.md`). Migrations que reconstroem tabela com PII exigem
verificação `PRAGMA table_info` antes — está documentado no cabeçalho de cada uma.
