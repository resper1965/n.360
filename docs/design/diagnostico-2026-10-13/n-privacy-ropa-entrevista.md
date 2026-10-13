# n.privacy: diagnóstico tela a tela e desenho do RoPA como entrevista

Data: 2026-10-13. Branch `feat/privacy-ropa-entrevista`. Leitura do código em `origin/main`; nada foi executado em produção.
Referências `arquivo:linha` valem para este worktree.

## 1. Menu do n.privacy

Grupo Privacidade (`frontend/login.html:412-443`): Encarregado, Titular e pedidos, Incidentes, ROPA, DPIA / RIPD, Terceiros, Requisitos.
Grupo Implantação (`login.html:444`): Importar programa.
Cadastros compartilhados com o n.iso, visíveis no n.privacy: Partes (`nav-partes`, grupo Operacional), Documentos, Governança (`nav-monitor`), Assistente.

Achados de menu:
- O RoPA é a peça central do programa LGPD (art. 37) e está em quarto lugar, atrás de Encarregado, Titular e Incidentes. A ordem natural de implantação: encarregado, inventário (RoPA), bases e riscos (LIA, RIPD), terceiros, titular, incidentes.
- "Partes" (onde se cadastra responsável, operador, destinatário) fica fora do grupo Privacidade. "Terceiros" é uma visão das mesmas partes tipo organização (`terceiros.js:29` abre o formulário de Partes). Existe ainda "Fornecedores" no n.iso. Três portas para o mesmo cadastro.
- Rótulos misturados: o menu diz "ROPA" e "DPIA / RIPD"; a página diz "RoPA" (`privacy.js:61`) e "RIPD (DPIA)" (`privacy.js:316`). Escolher um padrão.

## 2. Diagnóstico por tela

Prioridade: P0 = erro de fato, perda de dado ou risco jurídico; P1 = atrito que impede o uso sem a consultoria ao lado; P2 = acabamento.

| Tela | Objetivo | O que o usuário faz | O que falta ou atrapalha | Melhoria de maior valor | Pri |
|---|---|---|---|---|---|
| RoPA, lista (`privacy.js:60-126`) | Inventário de tratamentos, art. 37 | Vê cartões e tabela, abre Detalhes ou Ligações, importa CSV, exporta PDF | Tabela com 7 colunas, sem sensíveis, crianças, transferência nem responsável. Dois botões por linha com papéis confusos: "Detalhes" e "Ligações" / "Base legal e LIA" (`:112`). Cartão "Atividades ativas" conta `!r.status` como ativo (`:89`), misturando rascunho. Sem filtro nem busca. | Coluna "O que falta" por registro (sem base, sem LIA, sem responsável, sem salvaguarda), botão único "Abrir" para uma ficha, e "Nova atividade" abrindo a entrevista | P1 |
| RoPA, criar (`privacy.js:215-257`) | Registrar atividade | Preenche 12 campos num modal | (a) O seletor Status oferece Ativo/Inativo (`:232`), mas o servidor ignora e grava sempre `Draft` (`ropa.ts:97`): a tela promete o que a API não faz. (b) Validação é `if (!purpose) return` em silêncio (`:254`). (c) Sem tratamento de falha da chamada. (d) Titulares, categorias, destinatários e retenção são texto de uma linha, sem opções. (e) Responsável aparece duas vezes: parte do cadastro e texto livre (`:227-229`). (f) "Exige RIPD", "Dados sensíveis (art. 11)" e "Crianças (art. 14)" são caixas sem explicação, e nada impede incoerência (base do art. 7 com sensível marcado, ou o inverso). (g) Transferência pede só texto de salvaguarda; país e mecanismo ficam em outra tela. | Entrevista (seção 4). Antes dela, retirar o seletor de Status da criação | P0 (a), P1 (demais) |
| RoPA, editar (`privacy.js:259-308`) | Corrigir registro | Mesmo formulário preenchido | Envia sempre os 4 booleanos e todos os textos (`:288-302`). Qualquer edição dispara a substituição dos pedidos de aprovação (`ropa.ts:47`) sem aviso. Registro `Approved` pode ter o conteúdo editado (só o status é bloqueado, `ropa.ts:35`), e a pessoa não é avisada de que a aprovação perde validade. "Excluir" fica ao lado de "Salvar". | Editar por bloco (as mesmas perguntas da entrevista), enviar só o que mudou e avisar antes de gravar sobre registro aprovado | P0 |
| RoPA, detalhe (`privacy.js:128-213`) | Ler e assinar | Lê 8 campos, assina como Líder SGSI e Direção, revoga | Não mostra sensíveis, crianças, base do catálogo, LIA, RIPD, partes nem transferências: o resumo real está em outro modal. Dois mecanismos de aprovação convivem: assinatura direta (`approveROPA`, `:602`) e "Pedir aprovação" nas Ligações (`tratamento-ligacoes.js:92`); o usuário não sabe qual vale. O PDF abre com `?token=${S.token}` na URL (`:551`), expondo o token de sessão em histórico e logs. Muito estilo inline e `rgba` fora dos tokens. | Ficha única com resumo legível (a "revisão" da entrevista) e abas Ligações e Aprovação. Um só caminho de aprovação (o dos pedidos, por hash). Download autenticado no lugar do token na URL | P0 (token), P1 (resto) |
| RoPA, ligações (`tratamento-ligacoes.js`) | Ligar itens, departamentos, partes, transferências, base do catálogo, LIA, RIPD, diagrama | Modal com 9 seções empilhadas e um Salvar por seção | Duas bases legais para o mesmo fato: o select de texto no formulário (`privacy.js:29-42`) e o do catálogo aqui (`:101`); nada as sincroniza. A "Sugestão da IA" (`:106`) só existe depois de o registro estar criado. A LIA são 5 caixas de texto sem exemplo (`:43-58`). "País" da transferência é texto livre (`:133`). Sem indicação do que está feito ou faltando. Seletores de itens, departamentos e partes só aparecem para a equipe (`:70-74`). | Cada seção vira um passo da entrevista; o modal fica para ajuste posterior. Gravar `legal_basis` e `base_legal_id` juntos | P0 (dupla base), P1 |
| RIPD / DPIA (`privacy.js:314-548`) | Relatório de impacto, art. 38 | Cria avulso ou a partir de um tratamento, assina | "Novo RIPD" abre 8 campos longos sem ligação a um tratamento (`:460-476`); o caminho bom (`criarDpiaDoTratamento`, `tratamento-ligacoes.js:147`) só existe nas Ligações. Rótulos sem `for`. O estado vazio já aponta o RoPA (`:364`), bom. | Fim da entrevista oferece criar o RIPD do tratamento; "Novo RIPD" avulso vira ação secundária | P1 |
| Titular e pedidos (`titular.js`) | Pedidos art. 18, incidentes, consentimentos, prazos | Abas, registra, responde, localiza e elimina dados | Dois itens de menu abrem abas da mesma tela; Consentimentos e Prazos legais só se descobrem dentro. Prazo legal depende do administrador da plataforma (`:104`); sem ele o pedido nasce "prazo não calculado" e o cliente não tem como resolver. Tipos de pedido sem explicação do direito (`:10`). | Aviso de prazo ausente com ação clara (a quem pedir) e uma linha por tipo de pedido ("o que o titular pode exigir") | P1 |
| Encarregado (`encarregado.js`) | Painel do que está atrasado | Lê cartões e "O que fazer", indica o encarregado | Desenho bom (alerta do art. 41 primeiro, `:51`). A prioridade de tratamento abre a lista (`:45`), não o registro. Cartão "Tratamentos com pendência" soma três coisas (`:32`) e esconde `sem_responsavel` e `com_terceiro_vencido`, que o servidor já calcula (`src/services/encarregado.ts`). | Prioridade com deep link ao registro e ao passo da entrevista que resolve a pendência | P1 |
| Terceiros (`terceiros.js`) | Avaliação de operadores e fornecedores | Classifica tipo, avalia, liga DPA | "Grande provedor", "Crítico", "trust center" sem explicação (`:8-9`). Coluna "Tratamentos" é número sem link (`:47`). Para cadastrar, vai a Partes. | Na entrevista, mostrar a situação da avaliação do terceiro ao lado do passo "com quem compartilha" | P1 |
| Partes (`partes.js`) | Pessoas, organizações e vínculos | Lista, cadastra, importa, concilia | Rótulos sem `for` (`:87-88`, `:112-114`). Cadastro fecha em silêncio com nome vazio (`:95`). "Conciliar responsáveis" é jargão interno. Papéis (operador, cocontrolador, suboperador) sem explicação. Edição só para `platform_admin` e consultor (`:19`). | Criar parte dentro da entrevista, com uma linha explicando cada papel | P1 |
| Importar programa (`importacao.js`) | Subir arquivos, IA extrai, revisão e confirmação | Lote, envio, processamento, revisão em 5 abas | Bem estruturada e protegida. Mas tratamento importado entra com sensíveis, crianças e transferência em zero quando a planilha não traz a coluna (`tratamentos-importar.ts:40-61`): inventário com risco "não" por omissão. | Selo "importado, não revisado" e fila para a entrevista de revisão, que pergunta só o que falta | P0 |
| Documentos (`documentos.js`) | Políticas, normas, procedimentos | Árvore, versões, aprovação | Lista LGPD recomendada é ótima (`:55-60`). Falta ligar documento ao tratamento que o exige. | No passo de retenção, citar a política de retenção vigente | P2 |
| Requisitos (`requisitos.js`) | Catálogo LGPD, GDPR, ISO e cobertura | Escolhe a fonte | Só o administrador da plataforma carrega o catálogo (`:35`). Sem catálogo o select do RoPA fica vazio (`tratamento-ligacoes.js:105`). | A entrevista deve funcionar sem catálogo, gravando só `legal_basis` | P1 |
| Governança (`monitor.js:550-623`) | Quem responde pela privacidade | Matriz de papéis | A autoridade de assinatura do RoPA vem daqui (`ropa.ts:279`). Sem a matriz a assinatura é recusada e a mensagem não diz o caminho. | Mensagem de recusa com link para Governança | P2 |
| Início e ponto de partida (`inicio.js`, `ponto-de-partida.js`) | Entrada e o que o outro módulo entregou | Cartões de módulo | Mostra "Já no cadastro: N tratamentos" (`ponto-de-partida.js:16`) sem convidar a completar. | Cartão "Continuar a entrevista" quando houver rascunho | P2 |

Transversais:
- Acessibilidade: o fechar do modal é `&times;` sem `aria-label` (`privacy.js:136`, `partes.js:84` e outros); `form-label` sem `for` em RIPD, Partes e Encarregado (`encarregado.js:66`); o modal tem `role="dialog" aria-modal` (`login.html:516`) sem `aria-labelledby`. A entrevista precisa de foco programático e região viva.
- Estilo: modais com `font-family`, tamanhos e `rgba` inline em vez de tokens de `frontend/src/style.css`.
- Papéis: "quem edita" tem quatro definições (`privacy.js:69`, `tratamento-ligacoes.js:14`, `partes.js:19`, `documentos.js:14`). A entrevista precisa de uma regra só.
- Erros: `createROPA` e `updateROPA` não tratam falha (`privacy.js:255`, `:306`).

## 3. RoPA hoje: campos, ligações e regras

### 3.1 Tabela `ropa_records` (`schema.sql:570-601`) e validação (`src/schemas/domain.ts:45-76`)

| Campo | Tipo | Obrigatório | Vocabulário hoje | Observação |
|---|---|---|---|---|
| `processing_purpose` | texto | Sim (único, `domain.ts:49`) | Livre | Chave de duplicidade na importação (normalizada, `tratamentos-importar.ts:118`) |
| `data_categories` | texto | Não | Livre | Alimenta RIPD e sugestão de IA |
| `data_subjects` | texto | Não | Livre | Alimenta RIPD, diagrama e IA |
| `legal_basis` | texto | Não | 10 hipóteses do art. 7 e 8 do art. 11 com sufixo " (art. 11)" (`privacy.js:11-16`); legado mapeado (`:19-26`) | É texto, não código. LIA, PDF e pedidos de aprovação leem este campo |
| `base_legal_id` | FK `requisitos` | Não; `null` desliga | Catálogo `lgpd:art7:*` e `lgpd:art11:*` | Validado contra o catálogo (`ropa.ts:17-18`, `:33`, `:92`) |
| `retention_period` | texto | Não | Livre | |
| `recipients` | texto | Não | Livre | Texto; as partes ligadas são outra coisa (3.2) |
| `international_transfers` | 0/1 | Não | Caixa de marcar | |
| `transfer_safeguards` | texto | Não | Livre, placeholder cita Res. CD/ANPD 19/2024 | Escondido sem transferência (`privacy.js:55-58`) |
| `consent_details` | texto longo | Não | Sem campo na tela | Existe no schema, sem uso no frontend |
| `data_subject_rights_details` | texto longo | Não | Sem campo na tela | Idem |
| `dpia_required` | 0/1 | Não | Caixa "Exige RIPD" | |
| `dados_sensiveis` | 0/1 | Não | Caixa art. 11 (migration 0069) | |
| `criancas_adolescentes` | 0/1 | Não | Caixa art. 14 (0069) | |
| `owner` | texto | Não | Livre | |
| `owner_parte_id` | FK `partes` | Não; `null` desliga | Select do cadastro de partes | Conferido contra o projeto (`ropa.ts:31`) |
| `status` | texto | Não | `Draft`, `Under Review`, `Active`, `Inactive`; `Approved` só pelo fluxo de aprovação (`domain.ts:73-75`) | POST grava sempre `Draft` (`ropa.ts:97`) |
| `ciso_approved_*`, `ceo_approved_*` | texto, data, ip, ua | Não | Fluxo legado de assinatura | Escritas só por `/approve` |

`project_id` vem da rota, nunca do corpo. Só `processing_purpose` é exigido pelo servidor.

### 3.2 Ligações (rotas em `ropa.ts:158-226`)

| Ligação | Tabela | Rota | Regra |
|---|---|---|---|
| Sistemas, bases, processos | `tratamento_itens` | `PUT /projects/:id/ropa/:rid/itens` `{itens:[id]}` | Troca o conjunto inteiro; id de outro projeto dá 400 (`tratamentos.ts:23-34`). Itens vêm de `GET /projects/:id/assets` (tipos sistema, ativo, base, processo) |
| Departamentos | `tratamento_departamentos` | `PUT .../departamentos` `{departamentos:[id]}` | Idem. Listar e criar em `/projects/:id/departamentos` |
| Partes (operador, cocontrolador, suboperador, destinatário, responsável) | `parte_vinculos` com `alvo_tipo='tratamento'` | `POST /projects/:id/partes/:parteId/vinculos {papel, alvo_tipo:'tratamento', alvo_id}`; `DELETE .../vinculos/:vid` | Papéis em `tratamento-ligacoes.js:9`. Avaliação vencida aparece em `terceiros_com_avaliacao_vencida` |
| Transferências internacionais | `tratamento_transferencias` | `POST .../transferencias {pais, destinatario_parte_id?, mecanismo?, observacao?}`; `DELETE .../:tid` | `pais` obrigatório (até 100), mecanismo até 300 (`nucleo.ts:47-52`); destinatário deve ser parte do projeto |
| Base legal do catálogo | `ropa_records.base_legal_id` | `PUT /api/v1/ropa/:id` | Ver 3.1 |
| LIA | `lia_assessments` (uma por tratamento) | `GET/PUT/DELETE .../lia` | Rascunho parcial. Concluir exige finalidade legítima, necessidade, balanceamento e conclusão (`prevalece` ou `nao_prevalece`). Concluída só muda se reaberta (`lia.ts:33-65`). Exigida quando a base é legítimo interesse, mas não bloqueia (`lia.ts:5`) |
| RIPD do tratamento | `dpia_assessments.ropa_id` | `POST .../ropa/:rid/dpia` | Cria `Draft` pré-preenchido; 409 com o id se já existe (`lia.ts:73-96`) |
| Diagrama | derivado | `GET .../diagrama` | Mermaid refeito do cadastro (`tratamentos.ts:138-161`) |
| Leitura única | | `GET .../ligacoes` | Base, itens, departamentos, partes, transferências, LIA exigida e existente, RIPDs, `dpia_pendente`, terceiros vencidos, aprovação vigente |

### 3.3 Sugestão por IA que já existe (`rascunhos-privacy.ts:49-62`, `agents/privacidade.ts:17-52`)

- `POST /projects/:id/ropa/:rid/sugestao` exige o registro já criado. O modelo recebe finalidade, categorias, titulares, destinatários e transferência (sim ou não), com `mascararPii` (CPF, e-mail, telefone).
- Saída estrita `{base_legal (id do catálogo), retencao, dpia_requerido, justificativa}`. Nada é gravado; aplicar é o `PUT /ropa/:id` (`tratamento-ligacoes.js:187`).
- Quem pede: equipe e `org_admin` (`podePedirRascunho`). Aviso fixo "Rascunho gerado por IA — revise antes de usar".
- Limite: não sugere categorias, titulares, sensíveis, crianças nem salvaguarda, e só funciona com finalidade, categorias e titulares já gravados. Serve de ajuda nos passos de base legal e retenção, não de motor da entrevista.

### 3.4 Regras de negócio que a entrevista não pode quebrar

1. Só `processing_purpose` é obrigatório no servidor. Exigir mais é decisão de UX; não pode virar 400 para importação, agente MCP nem para o caminho antigo.
2. `POST /ropa` grava sempre `Draft` e ignora `status`. `Approved` nunca vem do corpo. A entrevista termina em `Draft` ou `Under Review` (via PUT).
3. Aprovação: `Approved` só por `/approve` (assinatura Líder SGSI e Direção; a autoridade sai da matriz de Governança, `ropa.ts:279`) e pelos pedidos de aprovação (conteúdo congelado com SHA-256). O PUT não muda status de registro `Approved` (`ropa.ts:35`). Revogar exige `platform_admin` ou `org_admin` e motivo de 5 ou mais caracteres (`ropa.ts:235`, `privacy.js:556-566`).
4. Todo PUT de conteúdo, e toda mudança de itens, departamentos e transferências, chama `conferirPedidosDoDocumento`, que substitui o pedido de aprovação vigente (`ropa.ts:47`, `:187`, `:201`, `:214`). Reentrevistar um registro aprovado tem custo: avisar antes e gravar em lote no fim.
5. `legal_basis` é texto e é o que a LIA, o PDF e os pedidos leem; `base_legal_id` é o catálogo. A entrevista grava os dois a partir de uma escolha. Para o id, usar a regra `casarBaseLegal` (`src/services/importacao.ts:517-522`): legítimo interesse vira `lgpd:art7:ix`, as demais casam por título normalizado. Sem catálogo carregado, gravar só o texto.
6. Legítimo interesse (texto ou título do catálogo contendo "legitimo interesse" ou "interesse legitimo", sem acento) torna a LIA exigida (`lia.ts:11`) e conta em `lia_pendente` no painel do encarregado. A entrevista abre a LIA e permite "fazer depois", como hoje.
7. Dados sensíveis (art. 11): a base deve ser do art. 11 (sufixo " (art. 11)"); a entrevista filtra as hipóteses. Crianças e adolescentes (art. 14): quando a base é consentimento, perguntar o consentimento de um dos pais ou responsável e gravar em `consent_details` (campo que existe e a tela não usa).
8. `dpia_required` é decisão da pessoa, mas sensíveis, crianças, larga escala, monitoramento e decisão automatizada tendem a exigir RIPD (o prompt do agente já usa esses critérios, `privacidade.ts:35`). A entrevista recomenda, a pessoa confirma. Marcado sem RIPD, o painel mostra `dpia_pendente`.
9. Transferência: `international_transfers` e `transfer_safeguards` ficam no registro; país e mecanismo em `tratamento_transferencias`. Manter coerência: se há linha de transferência, a caixa vira 1.
10. Importação: CSV cria `Draft`, chave é a finalidade normalizada, limite de 500 linhas, e não preenche sensíveis nem crianças sem a coluna correspondente. Ao criar pela entrevista, checar a finalidade na lista e avisar duplicata.
11. Isolamento de projeto: ids de itens, departamentos e partes são conferidos contra o projeto do registro. A entrevista oferece só os do projeto ativo.
12. Sem dado real de cliente em exemplo ou fixture: os exemplos da entrevista são genéricos.

## 4. Desenho da entrevista

### 4.1 Princípios

- Uma pergunta por tela, em português de consultor. Cada pergunta tem título (a pergunta), uma frase "por que perguntamos" e exemplos clicáveis. Artigo de lei vai na ajuda, não no título.
- Salvamento progressivo. O registro nasce ao fim do bloco A (`POST /ropa` só com a finalidade), em `Draft`. Cada bloco seguinte faz `PUT /api/v1/ropa/:id` com os campos do bloco. Sair e voltar retoma no primeiro bloco incompleto. O registro `Draft` é o rascunho; não há tabela nova.
- Só a finalidade bloqueia. Toda outra pergunta aceita "Não sei agora", que registra pendência e segue. O resumo lista as pendências com atalho de volta.
- Visual do sistema: quadrado (`--radius:0`), sem emoji, sem itálico, tokens de `style.css`. Opções como botões selecionáveis (`aria-pressed`) quando houver até 8; acima disso, lista com busca.
- Ajuda e exemplos ficam numa constante do frontend, não no servidor.

### 4.2 Sequência

Legenda: ES escolha única, EM escolha múltipla, TC texto curto, TL texto longo, SN sim ou não, AC autocompletar com criação inline.

**Bloco A. O que é a atividade**

| # | Pergunta | Alimenta | Controle | Opções e exemplos | Por que perguntamos | Validação | Pula quando |
|---|---|---|---|---|---|---|---|
| A1 | "Qual atividade da empresa usa dados de pessoas?" | `processing_purpose` | TC, 3 a 200 caracteres | Atalhos: Folha de pagamento; Recrutamento e seleção; Cadastro e atendimento de clientes; Cobrança; Controle de acesso e câmeras; Marketing e newsletter; Canal de denúncias; Gestão de fornecedores | Cada atividade vira uma linha do inventário que a ANPD pode pedir (art. 37) | Obrigatória. Compara com o RoPA carregado e avisa duplicata, oferecendo abrir a existente | Nunca |
| A2 | "Em uma frase, para que essa atividade serve?" | Complemento da finalidade (concatena em `processing_purpose`: "Folha de pagamento: pagar salários e recolher encargos") | TC | Exemplo do atalho escolhido | A finalidade precisa ser específica; "RH" não basta | Opcional | A1 com mais de 40 caracteres |
| A3 | "Quem responde por essa atividade na empresa?" | `owner_parte_id` e `owner` (nome, para o PDF legado) | AC sobre `GET /projects/:id/partes?tipo=pessoa&status=ativa`, com "Cadastrar agora" (`POST /partes`) | Pessoas ativas do projeto | Quem explica o fluxo se a ANPD ou o titular perguntar | Se criar parte, nome obrigatório | "Não sei": fica vazio e conta em `sem_responsavel` |
| A4 | "Qual área executa?" | `tratamento_departamentos` (PUT) | EM sobre `GET /departamentos`, com "Cadastrar área" | Departamentos do projeto | Delimita quem acessa e quem recebe treinamento | Opcional | Projeto sem departamento: criar ou pular |

**Bloco B. De quem são os dados**

| # | Pergunta | Alimenta | Controle | Opções e exemplos | Por que perguntamos | Validação | Pula quando |
|---|---|---|---|---|---|---|---|
| B1 | "De quem são os dados que a atividade usa?" | `data_subjects` (nomes unidos por ", ") | EM | Colaboradores; Candidatos; Ex-colaboradores; Dependentes de colaboradores; Clientes pessoa física; Representantes de clientes empresariais; Visitantes; Fornecedores pessoa física; Usuários do site ou aplicativo; Outro (texto) | Direitos e prazos mudam conforme o titular (art. 18) | Ao menos um, ou "Não sei" | Nunca |
| B2 | "Há crianças ou adolescentes (menores de 18 anos) entre eles?" | `criancas_adolescentes` | ES: Sim, Não, Não sei | "Dependentes em plano de saúde, alunos, menores aprendizes" | Menores têm proteção reforçada: o tratamento deve atender ao melhor interesse da criança (art. 14) | "Sim" abre B2a | Sempre perguntada; resposta rápida |
| B2a | Só se Sim: "O responsável legal sabe e concordou?" | `consent_details` | ES (Sim, Não, Não se aplica) mais TC para justificar | | Consentimento de menor deve ser específico e dado por um dos pais ou responsável (art. 14, §1º), salvo exceções | "Não" mostra aviso para avaliar outra base; não bloqueia | B2 diferente de Sim |
| B3 | "Mais ou menos quantas pessoas?" | Sem coluna (ver 4.5); insumo de H3 e do resumo | ES: até 100; 100 a 10 mil; 10 mil a 100 mil; mais de 100 mil | | Larga escala é critério para o relatório de impacto | Opcional | Pulável |

**Bloco C. Quais dados**

| # | Pergunta | Alimenta | Controle | Opções e exemplos | Por que perguntamos | Validação | Pula quando |
|---|---|---|---|---|---|---|---|
| C1 | "Que tipos de dado a atividade usa?" | `data_categories` (nomes unidos por ", ") | EM em grupos | Identificação (nome, CPF, RG, nascimento); Contato (e-mail, telefone, endereço); Financeiro (conta, salário, cartão); Profissional (cargo, currículo, avaliações); Acesso e uso (login, IP, cookies, logs); Imagem e voz (foto, vídeo, gravação); Localização; Outro (texto) | É o coração do inventário; sem categorias não há análise de risco | Ao menos uma, ou "Não sei" | Nunca |
| C2 | "Algum desses dados é sensível?" | `dados_sensiveis` (e a lista entra também em `data_categories`) | EM com atalho "Nenhum" | Saúde (atestados, exames); Biometria (digital, face); Origem racial ou étnica; Religião; Opinião política; Filiação sindical; Vida sexual; Dado genético | Dado sensível exige base legal mais restrita e quase sempre relatório de impacto (art. 11) | Qualquer item liga `dados_sensiveis=1`, filtra D2 pelo art. 11 e recomenda RIPD em H3 | Sempre perguntada; escolhas de C1 como "biometria" ou "saúde" pré-marcam e pedem confirmação |
| C3 | "A atividade toma decisão automática sobre pessoas?" | Sem coluna; insumo de H3 e do resumo | SN | "Pontuação de crédito, triagem automática de candidatos" | O titular pode pedir revisão (art. 20) e a decisão automática é critério de alto risco | Opcional | Pulável |

**Bloco D. Por quê (finalidade e base legal)**

| # | Pergunta | Alimenta | Controle | Opções e exemplos | Por que perguntamos | Validação | Pula quando |
|---|---|---|---|---|---|---|---|
| D1 | "Qual destes motivos descreve melhor por que a empresa usa esses dados?" | Pré-seleciona a base em D2; não grava | ES com 7 cartões em linguagem leiga | A lei manda (obrigação legal); Há contrato com a pessoa (execução de contrato); A pessoa autorizou (consentimento); Defender direitos em processo (exercício regular de direitos); Proteger a saúde (tutela da saúde); A empresa tem um interesse legítimo e a pessoa espera isso (legítimo interesse); Outro ou não sei | A base legal responde "com que direito a empresa trata esse dado?" (arts. 7 e 11) | "Não sei" libera e deixa pendência | Nunca |
| D2 | "Confirme a hipótese legal" | `legal_basis` (texto de `privacy.js:11-16`) e `base_legal_id` (`casarBaseLegal`) | ES filtrada, com botão "Sugerir" (ver 4.4) | Se C2 marcou sensível, só as 8 do art. 11; senão as 10 do art. 7. Uma linha em cada: "quando vale" e "cuidado" | É o texto que vai para o relatório e para os pedidos de aprovação | Sensível com base do art. 7 não avança: trocar a base ou rever C2 | Nunca |
| D3 | Só se a base for Consentimento: "Como o consentimento é pedido e guardado?" | `consent_details` | TL com exemplos | "Caixa marcada no formulário, com data e versão do aviso"; "Termo assinado" | Consentimento só vale se livre, informado e comprovável (art. 8) | Obrigatório nesse caso | Base diferente de consentimento |
| D4 | Só se a base for Legítimo interesse: "Vamos fazer o teste de legítimo interesse (LIA) agora?" | `lia_assessments` por `PUT .../lia` | Subfluxo de 4 perguntas em TL curto: (1) Qual é o interesse da empresa? (2) Dá para atingir o objetivo sem esses dados? (3) O que a pessoa espera e que impacto sofre? (4) Que medidas reduzem o impacto? Conclusão ES: "O interesse da empresa prevalece" ou "Os direitos da pessoa prevalecem" | Dois exemplos neutros por pergunta | A LIA é a prova de que o interesse foi pesado contra os direitos; sem ela o painel marca pendência | Salva como `rascunho` a cada resposta; "Concluir" só com finalidade, necessidade, balanceamento e conclusão (regra do servidor) | "Fazer depois" deixa em aberto, sem bloquear |

**Bloco E. De onde vêm os dados e onde passam**

| # | Pergunta | Alimenta | Controle | Opções e exemplos | Por que perguntamos | Validação | Pula quando |
|---|---|---|---|---|---|---|---|
| E1 | "De onde vêm os dados?" | Sem coluna (ver 4.5); entra no resumo e na descrição do fluxo do RIPD | EM | A própria pessoa (formulário, aplicativo); Outro sistema da empresa; Parceiro ou fornecedor; Fonte pública; Base comprada | Dado coletado de terceiro exige checar a origem e informar o titular (art. 9) | Opcional | Pulável |
| E2 | "Em quais sistemas ou arquivos esses dados passam?" | `tratamento_itens` (`PUT .../itens`) | AC sobre `GET /projects/:id/assets`, com "Cadastrar sistema" | Itens do projeto (sistema, ativo, base, processo) | Mostra onde procurar o dado e onde aplicar segurança; alimenta o diagrama | Opcional | Projeto sem itens: cadastrar ou pular |

**Bloco F. Com quem compartilha**

| # | Pergunta | Alimenta | Controle | Opções e exemplos | Por que perguntamos | Validação | Pula quando |
|---|---|---|---|---|---|---|---|
| F1 | "A empresa envia esses dados para alguém de fora?" | Controla F2 e F3 | SN | | Compartilhar sem informar o titular é irregular (art. 9, V) | | "Não" pula F2 e F3 |
| F2 | "Para quem?" | `recipients` (texto) e `parte_vinculos` | AC sobre `GET /partes?tipo=organizacao`, com criar inline. Por parte, ES de papel: "Trata os dados em nome da empresa" (operador); "Decide junto com a empresa" (cocontrolador); "Subcontratado do operador" (suboperador); "Só recebe, por obrigação ou finalidade própria" (destinatário) | Órgãos públicos como Receita Federal ou INSS entram só como texto em `recipients` | Operador e controlador respondem de forma diferente (arts. 39 e 42) | Ao menos uma parte ou texto | F1 = Não |
| F3 | Por parte organização: "Existe contrato com cláusula de proteção de dados?" | Não grava; lê `GET /projects/:id/terceiros` | Leitura com atalho para Terceiros | Vigente, vencida ou nunca avaliada | Operador sem avaliação vigente é o risco mais comum | Nunca bloqueia | Sem parte organização |

**Bloco G. Quanto tempo ficam**

| # | Pergunta | Alimenta | Controle | Opções e exemplos | Por que perguntamos | Validação | Pula quando |
|---|---|---|---|---|---|---|---|
| G1 | "Por quanto tempo a empresa guarda esses dados?" | `retention_period` | ES em prazos mais TC para o critério, com botão "Sugerir" (ver 4.4) | Durante o contrato mais 5 anos (prazo prescricional civil); 5 anos (obrigação fiscal e contábil); Pelo tempo da vaga mais 6 meses; Até o titular pedir exclusão; Outro (texto) | Guardar além do necessário é infração; a lei pede eliminar quando a finalidade acaba (arts. 15 e 16) | Não vazio, ou "Não sei". Se há política de retenção vigente em Documentos, mostrar e oferecer citar | Pulável |
| G2 | "Como o dado é eliminado ao fim do prazo?" | Sem coluna (ver 4.5); resumo | ES: Exclusão do sistema; Anonimização; Descarte físico; Ainda não definimos | | O inventário deve mostrar que o prazo é cumprido | Opcional | Pulável |

**Bloco H. Transferência internacional e riscos**

| # | Pergunta | Alimenta | Controle | Opções e exemplos | Por que perguntamos | Validação | Pula quando |
|---|---|---|---|---|---|---|---|
| H1 | "Algum desses dados vai para fora do Brasil, ou fica em servidor no exterior?" | `international_transfers` | ES: Sim, Não, Não sei | "E-mail em nuvem de provedor estrangeiro", "sistema de RH hospedado fora", "suporte de fornecedor internacional" | Transferência exige mecanismo legal (arts. 33 a 36); quase todo provedor de nuvem entra aqui | Sim ou Não sei abre H1a | Nunca |
| H1a | "Para qual país e com qual proteção?" | `POST .../transferencias` (`pais`, `destinatario_parte_id` entre as partes de F2, `mecanismo`) e `transfer_safeguards` (resumo) | País: TC com sugestões (Estados Unidos, Irlanda, Países Baixos, Alemanha, Reino Unido, Singapura, Outro). Mecanismo: ES | País com nível adequado reconhecido pela ANPD; Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024); Normas corporativas globais; Consentimento específico e destacado; Ainda sem mecanismo definido | Transferência sem mecanismo registrado é irregular | País obrigatório para registrar. Mecanismo vazio ou "ainda sem" gera o alerta "sem salvaguarda" que o cartão do RoPA já mostra. Repete para mais de um país | H1 = Não |
| H2 | "Se os dados vazassem, o que aconteceria com as pessoas?" | Sem coluna; insumo de H3 | ES: Pouco ou nada; Constrangimento ou transtorno; Prejuízo financeiro, discriminação ou dano à imagem | | Mede o risco ao titular, que decide o relatório de impacto | Opcional | Pulável |
| H3 | "Esta atividade precisa de relatório de impacto (RIPD)?" | `dpia_required` | SN com recomendação | Recomenda Sim se: C2 sensível, B2 Sim, B3 acima de 10 mil, C3 Sim ou H2 no nível mais alto. Mostra o motivo ("recomendamos porque há dado de saúde e mais de 10 mil pessoas") | O relatório de impacto é exigido em tratamento de alto risco (art. 38) | A pessoa pode contrariar a recomendação; o resumo registra | Nunca |
| H3a | Se H3 = Sim: "Quer criar o RIPD agora a partir desta atividade?" | `POST .../ropa/:rid/dpia` | SN | | O servidor pré-preenche com o que a entrevista já registrou | 409 vira "já existe, abrir" | H3 = Não |

**Bloco I. Resumo e revisão**

| # | Tela | Alimenta | Controle |
|---|---|---|---|
| I1 | "Confira o que você nos contou": tabela legível com cada resposta, link "Alterar" que volta à pergunta e selos de pendência (sem base, sem responsável, sem salvaguarda, LIA em rascunho, RIPD pendente, terceiro sem avaliação vigente) | Nada novo | Leitura |
| I2 | "Como deseja salvar?" | `status`: `Draft` (padrão) ou `Under Review` ("Pedir revisão do encarregado") por `PUT /ropa/:id` | ES |
| I3 | "Próximos passos": Pedir aprovação (`abrirPedidoAprovacao(projectId,'tratamento',id)`), Criar RIPD, Cadastrar outra atividade, Voltar ao inventário | Atalhos | Botões |

### 4.3 Regras de salto

| Se... | então... |
|---|---|
| C2 marca algum dado sensível | Liga `dados_sensiveis`; D2 mostra só o art. 11; H3 recomenda RIPD |
| B2 = Sim | Liga `criancas_adolescentes`; abre B2a; com base consentimento, D3 menciona o responsável legal; H3 recomenda RIPD |
| Base de D2 é consentimento (art. 7 ou 11) | Abre D3 |
| Base de D2 é legítimo interesse | Abre D4 (LIA) |
| F1 = Não | Pula F2 e F3 |
| H1 = Não | Pula H1a; grava `international_transfers=0` |
| H1 = Sim e F2 tem organização | H1a pré-seleciona o destinatário entre as partes de F2 |
| H3 = Sim | Oferece H3a; sem RIPD o painel mostra `dpia_pendente` |
| Registro já `Approved` | Banner no topo: "salvar substitui o pedido de aprovação vigente"; as gravações vão no fim, em "Aplicar alterações", e não a cada pergunta |

### 4.4 Onde a IA entra

- Reaproveitar `POST .../sugestao` como botão "Sugerir" em D2 e G1. O registro já existe (criado em A1) e já tem finalidade, categorias e titulares (B1 e C1 gravados antes). A resposta `{base_legal, retencao, dpia_requerido, justificativa}` preenche os controles da entrevista; a pessoa vê, edita e confirma. Mesmo aviso fixo de rascunho de IA.
- Sem IA para sensíveis, crianças e transferência: são respostas do cliente e têm consequência jurídica.
- O servidor só atende equipe e `org_admin`; para os demais o botão não aparece. Sem catálogo carregado a sugestão não tem id válido: esconder o botão.
- Sem rota nova. A sugestão devolve id do catálogo; D2 converte para o texto de `legal_basis` pelo título do requisito.

### 4.5 Perguntas sem coluna no registro

Volume de titulares (B3), decisão automática (C3), origem (E1), eliminação (G2) e impacto de vazamento (H2) não têm onde ficar. Duas saídas sem migration:
1. Usá-las só como insumo da recomendação de RIPD (H3) e do resumo, gravando o resultado em `dpia_required`. O restante se perde ao fechar a entrevista.
2. Gravar "Notas da entrevista" em `data_subject_rights_details` (campo longo existente, sem uso na tela). Menor diff, mas mistura a semântica do campo.

Recomendação: opção 1 agora. Se o dono quiser guardar origem, volume e eliminação, abrir PR separado com migration (`schema.sql` e `migrations/`, conforme o AGENTS.md).

### 4.6 O que reaproveitar do código

| Peça | Onde | Uso |
|---|---|---|
| Listas de bases legais, `normaliza`, `rotuloBase`, `ehLegitimoInteresse`, `BASES_LEGADO` | `privacy.js:11-42` | Hoje são privadas do arquivo. Extrair para um módulo compartilhado: é a única refatoração prévia |
| Cadastro rápido de parte | `partes.js:82-102` (`criarParte`) | `POST /partes` inline |
| `opcoesDePartes` | `partes-opcoes.js` | Autocompletar do responsável |
| Seletores de itens e departamentos | `tratamento-ligacoes.js:80-83`, `:143` | Mesmos dados, apresentados como cartões |
| LIA (campos, rascunho, concluir) | `tratamento-ligacoes.js:39-58`, `:150-157` | Muda só a forma: uma pergunta por vez |
| Sugestão de IA e aplicação | `tratamento-ligacoes.js:173-193` | Botão em D2 e G1 |
| Transferências | `tratamento-ligacoes.js:127-136`, `:202-211` | País, destinatário, mecanismo |
| Pedido de aprovação | `tratamento-ligacoes.js:145` | Atalho no resumo |
| `renderStatCards`, `renderDataTable`, `renderStatusBadge`, `renderAbas`, `openModal` | `frontend/src/ui.js` | Resumo, pendências e modal grande |
| Teste jsdom da tela | `frontend/test/privacy-ropa-view.test.js` | Modelo para os testes do fluxo novo |

### 4.7 O que o backend precisa

Nada novo para a primeira entrega. Contratos usados, todos existentes:
- `POST /api/v1/projects/:id/ropa` (cria `Draft`) e `PUT /api/v1/ropa/:id` (parcial: ausente mantém, `null` desliga `owner_parte_id` e `base_legal_id`).
- `PUT .../ropa/:rid/itens`, `PUT .../departamentos`, `POST` e `DELETE .../transferencias`, `POST /partes/:id/vinculos`, `PUT .../lia`, `POST .../dpia`, `POST .../sugestao`, `GET .../ligacoes`.
- Leituras: `GET /projects/:id/ropa`, `/assets`, `/departamentos`, `/partes`, `/terceiros`, `GET /api/v1/requisitos?fonte=lgpd`.

Ajustes pequenos que valem, sem ser pré-requisito:
1. `POST /ropa` ignora `status` (`ropa.ts:97`). Ou o cliente deixa de oferecer o campo, ou o INSERT passa a aceitar `Draft`, `Under Review`, `Active` e `Inactive`.
2. A rota já aceita `legal_basis` e `base_legal_id` na mesma chamada (`domain.ts:52`, `:69`).
3. Pendências de campo vazio (sem categorias, sem retenção) o cliente calcula do registro; as de LIA, RIPD e terceiro vencido já vêm de `GET .../ligacoes`.
4. Não há transação entre várias chamadas. Manter o salvamento por bloco e a retomada pelo registro `Draft`, que é o desenho mais simples e seguro.

### 4.8 Entradas e retomada

- Botão primário da lista: "Nova atividade" abre a entrevista. "Adicionar manualmente" vira link secundário para o modal atual.
- Registro `Draft` com campos vazios mostra "Continuar entrevista" no lugar de "Abrir".
- Registro importado ganha "Revisar com a entrevista": abre pré-preenchida e pergunta só o que falta (sensíveis, crianças, transferências, responsável), fechando o buraco da regra 10.
- Painel do encarregado: cada prioridade de tratamento vira deep link ao passo (por exemplo, "Completar a base legal" abre D1 daquele registro).

### 4.9 Estado e implementação

- Estado em memória (`S.entrevistaRopa = {recordId, passo, respostas}`), persistido no registro por PUT a cada bloco. Em `localStorage`, no máximo um ponteiro "último registro em entrevista", dentro de `try/catch`.
- Eventos por `data-action`, `data-args` e `data-action-change`; nenhum handler inline. Todo texto de resposta passa por `escapeHTML` na renderização.
- Validação no cliente com mensagem na própria pergunta (`aria-live="polite"`). Erro do servidor aparece abaixo do controle, sem fechar a entrevista.
- Acessibilidade: cada pergunta é um `fieldset` com `legend`; opções são `button` com `aria-pressed` ou `input` checkbox e radio com `label for`; foco no título ao avançar; "Voltar" e "Próxima" sempre visíveis; progresso em texto ("Bloco 3 de 8").
- Testes no estilo de `frontend/test/privacy-ropa-view.test.js` (jsdom): salto por sensível, por consentimento, por legítimo interesse, filtro do art. 11, recomendação de RIPD, criação do registro ao fim do bloco A, edição de registro aprovado com aviso.

## 5. Ordem sugerida de entrega

1. P0 independentes da entrevista: retirar o seletor de Status da criação; mostrar erro quando a criação falha; avisar sobre aprovação ao editar registro `Approved`; trocar o token na URL do PDF por download autenticado; unificar o caminho de aprovação.
2. Fatia 1 da entrevista: blocos A a D e o resumo. Resolve a dupla base legal e a incoerência entre sensíveis e art. 11.
3. Fatia 2: blocos E a H (sistemas, compartilhamento, retenção, transferência, risco e RIPD).
4. Fatia 3: modo "revisar importados" e deep links do painel do encarregado.
5. Fatia 4: edição por bloco na ficha; aposentar o formulário monolítico se não houver uso.

## 6. Decisões que o dono precisa tomar

1. O cliente (`org_admin`) responde a entrevista, ou só a equipe da consultoria? Hoje a tela só deixa a equipe editar (`privacy.js:69`), enquanto rascunho de IA e revogação aceitam `org_admin`.
2. A entrevista substitui o formulário atual, ou os dois convivem?
3. Guardar origem, volume de titulares, decisão automática e forma de eliminação? Exige migration. Sem isso, essas respostas só alimentam a recomendação de RIPD.
4. Unificar a aprovação nos pedidos (conteúdo congelado com hash) e aposentar a assinatura direta do modal?
5. Registro nasce `Draft` e fica assim até aprovação ou revisão do encarregado, ou a entrevista pode terminar em `Active`? (A API hoje só cria `Draft`.)
6. IA só como "Sugerir" na base legal e na retenção (proposta), ou também em sensíveis, crianças e salvaguarda? Recomendação: não nesses três.
7. Vocabulário oficial na interface: "RoPA" e "RIPD" (DPIA entre parênteses só na primeira menção)?
8. Subir o RoPA para o topo do grupo Privacidade?
9. Exigir ao menos categorias e titulares para concluir, ou manter "Não sei agora" em tudo, como o servidor aceita hoje?
