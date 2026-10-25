# O agente consultor do n.iso

Um consultor conecta o **Claude Code, o Codex, o Cursor, o Antigravity, o ChatGPT ou o Claude
(navegador e desktop)** ao n.360, entra com a própria conta e escolhe um cliente. O agente passa a trabalhar
**dentro daquele projeto**, lendo o SGSI inteiro e gravando adequação, com o
alcance que o consultor tem na interface e nenhum a mais.

Sem chave de API, sem instalar nada, sem compilar nada.

| Você é... | Comece por |
|---|---|
| **Consultor** que vai usar o agente | [Conectar](#conectar) e [Como trabalhar com ele](#como-trabalhar-com-ele) |
| **Administrador do cliente** (quer saber quem tem acesso) | [O que o cliente vê e controla](#o-que-o-cliente-vê-e-controla) |
| **Quem desenvolve o n.iso** | [`arquitetura.md`](arquitetura.md) e [`seguranca.md`](seguranca.md) |

---

## Conectar

O endereço oficial é `https://niso.ness.com.br/mcp`. Ele não funciona em outro
domínio, e continua o mesmo com o n.360 como entrada da plataforma: `niso.ness.com.br`
segue servindo `/mcp` e `/oauth`. O agente trabalha com os módulos do projeto (n.iso,
n.privacy) que o consultor que concedeu o acesso também tem (`modulosDaPessoa`, `src/modulos.ts`); rota de
módulo fora disso responde 403. A importação de programa o agente opera pela ferramenta `niso_importar_programa`, com o seu "sim" e um motivo. Os rascunhos de IA do n.privacy
(`ropa/:id/sugestao`, `titular-pedidos/:id/rascunho`, `incidentes/:id/rascunho-comunicacao`) são da tela, para a
equipe e o administrador do cliente: o agente MCP recebe 403 neles (`FORA_DO_AGENTE`, "use a interface").

| Cliente | Como |
|---|---|
| **Claude Code** | `claude mcp add --transport http niso https://niso.ness.com.br/mcp` |
| **Codex** | `codex mcp add niso --url https://niso.ness.com.br/mcp`, depois `codex mcp login niso`. Confira com `codex mcp list`. |
| **Cursor** | em `.cursor/mcp.json` (ou `~/.cursor/mcp.json`, para todos os projetos): `{ "mcpServers": { "niso": { "url": "https://niso.ness.com.br/mcp" } } }`. Entre por Cursor Settings > MCP. |
| **Antigravity** | em `~/.gemini/config/mcp_config.json` (antes da 2.0: `~/.gemini/antigravity/mcp_config.json`): `{ "mcpServers": { "niso": { "serverUrl": "https://niso.ness.com.br/mcp" } } }`. Entre pelo botão Authenticate do painel MCP; editor e linha de comando têm login separado. |
| **ChatGPT** | Configurações > Conectores > Avançado > Modo desenvolvedor: crie um conector com a URL `https://niso.ness.com.br/mcp` e autenticação OAuth. |
| **Claude (navegador e desktop)** | Configurações > Conectores > adicionar conector personalizado, com a URL `https://niso.ness.com.br/mcp`. |

Na primeira chamada o cliente abre o navegador. Você:

1. entra com seu e-mail e senha do n.iso (e o código do segundo fator, se tiver);
2. escolhe **um** cliente: o consultor, entre os projetos em que está designado; o administrador da consultoria (`consultoria_admin`), entre os projetos da própria organização;
3. escolhe o **papel** do agente: **Consultor** (implementa e decide com o seu "sim") ou **Auditor** (só lê e audita), ver [Dois papéis](#dois-papéis-consultor-e-auditor);
4. volta ao cliente MCP, que já está conectado.

> **Estado dos clientes.** O Claude Code foi exercitado contra a produção em
> 30/09/2026 (conexão, leitura e escrita). Codex, Cursor, Antigravity, ChatGPT e Claude
> no navegador têm a configuração acima, mas o login OAuth deles **ainda não foi confirmado**.
> Se algum falhar, registre qual e em que etapa. Um ponto a vigiar: o provider recusa, já no registro,
> callback de esquema próprio (`myapp:/cb`; erro `invalid_client_metadata`, "Redirect URI must use https,
> or http on a loopback host"). Cliente de desktop que registre um callback desse tipo não consegue conectar.

**Um cliente por conexão.** Cliente com dois projetos tem duas conexões, e o
agente de uma não enxerga a outra. Para trocar de projeto, conecte de novo e
escolha o outro.

**Não é você?** O agente age como você: a trilha registra
`agente de <seu e-mail> (<cliente> / <projeto>)`, ou `agente auditor de <seu e-mail> (...)` no papel Auditor.

### Dois papéis: Consultor e Auditor

O endereço é o mesmo (`/mcp`); o papel é escolhido na tela de login, junto com o cliente, e fica gravado na
concessão (`agente_concessoes.papel`, migration 0070). O servidor relê o papel do banco **a cada chamada**: o
token só o confere.

| | Consultor | Auditor |
|---|---|---|
| Lê | Tudo o que o consultor lê no projeto | O projeto da conexão, nos dois módulos: n.iso (controles, SoA, riscos, evidências, políticas, auditorias) e n.privacy (RoPA, DPIA, requisitos e lacunas, pedidos do titular, incidentes, terceiros, documentos) |
| Grava | Adequação, como na interface; destrutivo com o seu "sim" | **Só** achado de auditoria (`niso_create_audit_finding`) e nota de auditor (`niso_create_auditor_note`) |
| Não faz | Achado e nota de auditor (quem implementa não audita) | Nenhuma escrita de implementação: não grava, não corrige, não apaga, não gera política, não responde nota |
| Ferramentas | 50: leitura, `niso_ler`, `niso_executar`, as de escrita do consultor, inclusive as 8 de escrita do n.privacy (só rascunho), e as 10 ferramentas de decisão; mais as 5 `niso_comercial_*` (leitura e rascunho da área comercial) se quem concedeu é do comercial | 22: leitura (inclusive as 8 do n.privacy), `niso_ler` (só GET) e as duas de auditoria; sem `niso_executar` |
| Roteiros (`niso_contexto`) | Os onze abaixo | Auditoria interna ISO 27001 (9.2), cláusulas 4 a 10, prontidão; no n.privacy: RoPA e bases legais, DPIA, prazos de pedidos do titular, terceiros, incidentes e comunicação à ANPD, cobertura. Sempre: ler, comparar com o requisito, registrar o achado citando a evidência |

**Separação de funções.** A mesma conta não pode ter, no mesmo projeto, um agente Consultor **e** um Auditor ativos.
Ao conectar o segundo papel com o primeiro ativo, a tela de login recusa e pede para revogar o outro acesso antes
(painel Agentes ou Governança). Quem conecta como auditor é sempre a conta de equipe logada (consultor ou
`consultoria_admin`); `platform_admin` e `comercial` não conectam agente em nenhum papel.

A nota do auditor remoto entra por `POST /api/v1/projects/:id/auditor-notes`, que só aceita o principal do agente
auditor; o auditor externo continua gravando pelo portal, com o token do link.

### Quem conecta, e o painel Agentes

A tela **Agentes** (menu Conta e acessos) é do n.360 e aparece para `platform_admin`,
`consultoria_admin`, `consultor` e `comercial`. Só **conecta** quem pode ser identidade de agente:
o `consultor` e o `consultoria_admin`, este **só nos projetos da própria organização**
(`projetosDoAgente` em `src/helpers.ts`; a concessão exige `p.org_id = u.org_id`, e o consultor
segue exigindo a designação na governança). O agente do `consultoria_admin` tem o mesmo alcance do
consultor. `platform_admin` e `comercial` veem o painel como informação e a nota "Esta conta não
conecta agente; use uma conta de consultor", sem botão de copiar. `platform_admin` e
`consultoria_admin` também veem **Quem está conectado**: o mesmo cartão da Governança (agentes ativos do
projeto escolhido, com Revogar), sem rota nova.

### Outros clientes MCP (possíveis, não suportados)

Qualquer cliente que fale MCP por HTTP com OAuth (registro dinâmico, PKCE, callback `https` ou
`http` em loopback) conecta. A ness. só dá suporte aos seis acima.

**OpenClaw: não use com dado de cliente.** Ele conecta (`openclaw mcp add`, depois
`openclaw mcp login niso`), mas é um agente de longa duração que recebe mensagem por WhatsApp,
Telegram, Slack e outros canais. Qualquer mensagem nesses canais pode virar instrução para um
agente que grava e apaga no projeto do cliente com o seu alcance. Se mesmo assim for usar: nenhum
canal aberto a terceiros, um projeto por conexão (já é a regra) e revogue a concessão em
Governança quando terminar.

---

## Como trabalhar com ele

O agente começa sempre por **`niso_contexto`**: ela diz o cliente, o `projectId`,
os módulos do projeto, o mapa da app (cadastro compartilhado, n.iso e n.privacy) e os
roteiros. Depois ele escolhe o roteiro.

| Roteiro | Para quê | Escreve? |
|---|---|---|
| **1. Diagnóstico** | `niso_get_project`, `niso_gap_analysis`, `niso_traceability`: onde estamos e o que falta. Para numa lista de lacunas priorizada. | Não |
| **2. Fechar lacuna** | Escolhe um controle, rascunha evidência ou política, **espera a sua aprovação**, grava. Para quando o controle tem evidência vinculada. | Sim, depois do seu ok |
| **3. Responder auditoria** | Lê as notas do auditor, rascunha a resposta, espera a sua aprovação. | Sim, depois do seu ok |
| **4. Pré-avaliação de prontidão** | Avalia se o SGSI está pronto para o Stage 1 e o Stage 2 da certificadora (ISO 27001:2022 + 27701:2025). Usa a skill `prontidao-certificacao`. | **Não**: só lê (concluir passo é decisão: `niso_decidir_passo`) |
| **5. Inventário** (n.privacy) | Um tratamento por vez, pelos 8 blocos da entrevista de RoPA (A atividade, B titulares, C dados, D base legal, E sistemas, F compartilhamento, G retenção, H transferência e RIPD). Propõe o registro em `Draft`, as ligações, a LIA em rascunho e a DPIA em `Draft`, espera a sua aprovação. | Rascunho, depois do seu ok |
| **6. Pedido do titular ou incidente** (n.privacy) | Lê os prazos, rascunha a resposta ou a comunicação no chat e registra o pedido ou o incidente. Usa a skill `atendimento-titular`. Responder, encerrar e mudar prazo ficam com você. | Registro, depois do seu ok |
| **7. Cobertura LGPD** (n.privacy) | Lê as lacunas de requisitos, propõe o documento ou a evidência que fecha cada uma e liga o documento ao requisito. | Sim, depois do seu ok |
| **8. Maturidade LGPD** (n.privacy) | Tabela de achados com fonte e próxima ação sobre RoPA, terceiros, titular, incidentes, encarregado e lacunas. Usa a skill `maturidade-lgpd`. Não é parecer jurídico. | **Não**: só lê |
| **9. Implantação em cliente novo** (n.privacy) | Ordem de trabalho, o que pedir ao cliente e critério de pronto de cada etapa. Usa a skill `implantacao-privacy`. | Rascunho, depois do seu ok |
| **10. Migração de programa existente** (n.privacy) | Escolhe entre `niso_importar_programa`, a planilha CSV do RoPA e o cadastro à mão, e confere o que entrou. Usa a skill `migracao-programa`. | Rascunho, depois do seu ok |
| **11. Terceiros** (n.privacy) | Tipo, método, evidência, validade e DPA de cada terceiro. Usa a skill `avaliacao-terceiros`. | Sim, depois do seu ok |

As skills dos roteiros 4, 6, 8, 9, 10 e 11 chegam pelo próprio MCP (`niso_skill`): `prontidao-certificacao`,
`atendimento-titular`, `maturidade-lgpd`, `implantacao-privacy`, `migracao-programa` e `avaliacao-terceiros`. A do 4 traz
referências e um validador de achados; as do n.privacy trazem referências (a entrevista de RoPA, o que pedir ao cliente, as
colunas da planilha do RoPA, o questionário base de terceiro, a verificação de identidade do titular). Não há nada para instalar.

### Ferramentas do n.privacy

| | Consultor | Auditor |
|---|---|---|
| Leitura | `niso_privacy_ropa` (todos os tratamentos, com `nao_informado` e ligações resumidas), `niso_privacy_ropa_detalhe` (um tratamento com ligações, LIA, DPIAs, ciclo de vida, bases adicionais e teste de impacto), `niso_privacy_requisitos_lacunas` (LGPD e ANPD), `niso_privacy_titular_pedidos` (com `situacao_prazo`), `niso_privacy_incidentes` (com `situacao_anpd` e `situacao_titular`), `niso_privacy_terceiros` (com a situação da avaliação), `niso_privacy_encarregado` (o painel e as prioridades), `niso_privacy_ponto_de_partida` | As mesmas 8 |
| Escrita (rascunho) | `niso_privacy_propor_tratamento` (`Draft`), `niso_privacy_atualizar_tratamento` (sem status), `niso_privacy_ligar_tratamento` (soma itens e departamentos; base do catálogo), `niso_privacy_criar_dpia_do_tratamento` (`Draft`), `niso_privacy_rascunhar_lia` (nunca conclui), `niso_privacy_registrar_pedido_titular`, `niso_privacy_registrar_incidente` (com avaliação de risco opcional), `niso_privacy_ligar_documento_requisito` (soma) | Nenhuma |

Cada uma é fina sobre uma rota que o consultor já usa na interface; nenhuma rota nova. Exigem o módulo n.privacy no projeto e na
sua conta (senão 403), e o projeto da conexão. O que fica com uma pessoa, pela interface: aprovar tratamento e DPIA, concluir a
LIA, responder, negar e arquivar pedido do titular e mudar prazo legal. Publicar documento, encerrar incidente e revogar
consentimento são decisões do consultor, que o agente toma com o "sim" dele e um motivo.

### O que ele lê

Tudo o que você lê na interface, naquele projeto: controles e SoA, riscos,
ativos, evidências (o **texto** delas), políticas e versões, entrevistas por
trilha, respostas das fases, dossiê da jornada, ROPA, DPIA, fornecedores,
treinamento, auditorias, CAPA, governança, certificação, mudanças de escopo.
`niso_contexto` traz o mapa de caminhos.

Arquivo **binário** (PDF, planilha, imagem) ele não lê: recebe só o tamanho e o
tipo. Para o conteúdo, suba pela interface.

### O que ele grava

Com `niso_executar` ou com as ferramentas específicas (política, SoA, evidência
em texto, controle, ativo, risco, treinamento, entrevistas e o resto
que você grava na interface). Governança ele só lê; o comitê é mantido pela interface. Evidência pelo agente é **só texto**: transcrever
um PDF não substitui o documento.

**n.privacy é rascunho.** As ferramentas `niso_privacy_*` gravam tratamento em `Draft`, LIA em rascunho, DPIA em `Draft`, e
registram pedido do titular e incidente. Nenhuma aprova nem conclui. Encerrar incidente (`niso_encerrar_incidente`) e revogar consentimento (`niso_registrar_revogacao`) são ferramentas de decisão à parte, com o seu "sim" e um motivo.

**Política é diferente.** `niso_criar_politica` e `niso_gerar_secao` gravam um **rascunho** do documento da política. O agente só publica, descarta ou revisa pela ferramenta `niso_publicar_documento` (ou `niso_revisar_documento`), com o seu "sim" na conversa e um motivo; sem isso o servidor recusa.

### O que pede o seu "sim"

Três ações. O agente deve **mostrar o que vai fazer** (nome e id) e esperar:

- apagar um registro;
- eliminar dados de um titular (LGPD);
- revogar aprovações de controle (a de ROPA e DPIA e a exclusão de análise crítica são só da interface).

O servidor recusa se o agente tentar sem a confirmação. E o seu cliente MCP ainda
pergunta antes de executar a chamada. **Não libere `niso_executar` de forma
permanente.**

### O que ele não faz

Usuários, SSO, política de segurança, chaves de API, webhooks, painel global,
área comercial, token de auditor, sua conta pessoal (login, termos,
notificações), criar projeto e **registrar achado de auditoria** (ISO 27001, 9.2:
quem implementa não audita). Para isso, use a interface.

---

## Uma pasta de trabalho por cliente

Crie uma pasta por cliente e coloque um `CLAUDE.md` nela. O agente o lê ao
começar. Este é um ponto de partida; troque os dados entre `<>`:

```markdown
# <Cliente> — adequação ISO conduzida pela ness.

Cliente: **<Cliente>** — projeto "<nome do projeto>" no n.iso
(`projectId` `<id>`). Eu sou o consultor designado (`<seu e-mail>`).
O servidor MCP `niso` é a fonte da verdade do SGSI.

## Como responder
- Direto. Resposta curta primeiro; detalhe só se eu pedir.
- Seja crítico: aponte lacuna, evidência fraca e premissa errada, inclusive minha.
- Não invente fato do cliente. O que não estiver no n.iso ou nesta pasta é
  "não sei — precisa confirmar com o cliente".
- Cite o controle (ex.: A.5.15) e a origem de cada afirmação.

## Proporcionalidade (o menor que atende o controle)
Antes de propor um documento: precisa existir? já existe? cabe em outro? o modelo
do n.iso resolve? Só então escreva, curto. Documento que ninguém lê é passivo de
auditoria.

## Como trabalhar no n.iso
1. Comece por `niso_contexto`.
2. Leitura antes de escrita (gap, rastreabilidade, audit pack).
3. Tudo que você gera é **rascunho**: mostre e espere meu "ok" antes de gravar.
4. Evidência pelo agente é só texto; binário sobe pela interface.
5. Apagar, eliminar titular, revogar aprovação: mostre o que será
   feito e espere meu "sim" antes de enviar com `confirmado_pelo_usuario: true`.
6. Para ler qualquer área use `niso_ler`; o mapa está em `niso_contexto`.
7. Pré-avaliação de prontidão: `niso_skill nome=prontidao-certificacao`.
8. Maturidade LGPD (n.privacy): `niso_skill nome=maturidade-lgpd`.
9. Implantação, migração, terceiros e titular (n.privacy): `niso_skill` com
   `implantacao-privacy`, `migracao-programa`, `avaliacao-terceiros` ou `atendimento-titular`.

## Arquivos
- `rascunhos/` — minutas antes de irem ao n.iso.
- `entregas/` — o que vai ao cliente. Nome: `AAAA-MM-DD-assunto.ext`.
- Dados do cliente ficam nesta pasta; nada vai para repositório público nem
  para outro cliente.
```

---

## O que o cliente vê e controla

Na tela de **Governança** do projeto, o cartão **Agentes com acesso** lista cada
agente conectado: de quem é (o consultor), o **papel** (Consultor ou Auditor), qual cliente MCP, desde quando, **último
uso** e até quando vale. O administrador do cliente, o `platform_admin`, o `consultoria_admin` da organização e o próprio
consultor dono do acesso podem **Revogar**; o acesso cai **na próxima chamada** do
agente.

O acesso também termina sozinho quando:

- a concessão chega a 30 dias;
- o consultor é **tirado da governança** do projeto;
- o consultor **troca a senha** (todas as concessões dele caem);
- a conta é desativada.

Quem vê o cartão: administrador do cliente, `platform_admin`, `consultoria_admin` (da própria organização) e consultores. O mesmo cartão aparece na tela Agentes, para `platform_admin` e `consultoria_admin`. Um usuário comum do cliente não vê.

---

## Solução de problemas

| Sintoma | Causa provável e o que fazer |
|---|---|
| A ferramenta nova não aparece, ou `/mcp` não carregou | Reconecte: rode `/mcp` no Claude Code e reconecte o `niso`. O cliente guarda a lista de ferramentas da conexão anterior. |
| "refaça o login" / 401 | A concessão foi revogada, expirou (30 dias), você saiu da governança do projeto ou trocou a senha. Conecte de novo. |
| "Separação de funções" ao conectar | Você já tem um agente do outro papel ativo neste cliente. Revogue-o (painel Agentes ou Governança) e conecte de novo. |
| O agente auditor recebe 403 ao gravar | Correto: o auditor só grava achado e nota. Corrigir é da equipe, pela ação corretiva. |
| O "último uso" na tela parece parado | A tela mostra o momento em que foi carregada. Recarregue a página. |
| O agente leu, mas não há nada na trilha | A trilha registra **escrita**. Leitura não é registrada; o único sinal é o "último uso". |
| Não consigo editar ou excluir uma linha de consultor na Governança | É de propósito: designar consultor é do `platform_admin` ou do administrador do cliente, porque essa linha decide quem pode conectar um agente ao projeto. |
| Bloqueio ao conectar | 5 senhas erradas bloqueiam a conta por 15 minutos, no n.iso e na tela de conexão. Aguarde. |
| O agente diz que não leu um PDF | Binário não é lido. Suba pela interface. |
| Resposta "cortada em 100.000 caracteres" | Peça por item, ou por um caminho mais específico. |
| A pré-avaliação não grava nada | Correto: o roteiro 4 só lê. Os achados saem em arquivos CSV na sua pasta. |

---

## Para ir mais fundo

- [`arquitetura.md`](arquitetura.md): fluxo da conexão e de cada chamada, mapa de
  arquivos, dados, prazos, como estender.
- [`seguranca.md`](seguranca.md): contra quem o agente é desenhado, os invariantes
  e o que checar antes de um PR.
- [`../../mcp-server-niso/README.md`](../../mcp-server-niso/README.md): o servidor
  local (chave de API), para integrações e para o papel de auditor.
- [`../superpowers/specs/2026-09-30-agente-paridade-consultor-design.md`](../superpowers/specs/2026-09-30-agente-paridade-consultor-design.md):
  a decisão de dar ao agente o alcance do consultor, preso a um projeto.
