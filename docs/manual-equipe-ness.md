# Manual da equipe ness. (consultoria MSP no n.360)

Para quem opera clientes pelo n.360: administradores da consultoria, consultores e comercial. Cada passo diz
onde clicar e o que o sistema faz. O que não está aqui, não existe na tela: pergunte antes de prometer ao cliente.

Endereço: https://n360.ness.com.br. O n.iso abre em `/iso` e o n.privacy em `/privacy`; quem tem um módulo só
entra direto nele.

## 1. Quem é quem

| Papel | O que faz | Onde vê |
|---|---|---|
| **Platform Admin** | Opera a plataforma: cria organizações, define módulos contratados, transfere projetos, gerencia chaves de API. Não é papel de atendimento. | Tudo, de todas as organizações |
| **Administrador da consultoria** (`consultoria_admin`) | Gerencia a equipe e os projetos da própria consultoria; designa consultores nos projetos; conecta agente de IA. | Todos os projetos da organização |
| **Consultor** (`consultor`) | Atende os clientes em que está designado na Governança do projeto. | Só os projetos em que está designado |
| **Comercial** (`comercial`) | Propostas e contratos. | Telas comerciais |

Regras que valem sempre:
- **Uma pessoa pertence a uma organização só.** Quem atua em duas precisa de duas contas (e-mails diferentes).
- **Acesso a módulo é duplo:** o projeto tem o módulo (n.iso, n.privacy) **e** a pessoa tem o módulo. Faltando um
  dos dois, o sistema responde "Você não tem acesso ao n.X".
- **Conta não se apaga, se desativa.** Ver a seção 8.

## 2. Primeiro acesso de uma conta nova

1. A pessoa recebe um e-mail com a senha provisória.
2. Entra em https://n360.ness.com.br e o sistema obriga a trocar a senha.
3. Recomendado: ativar o segundo fator no cartão de perfil, no rodapé da barra lateral.
4. Esqueceu a senha: "Esqueci a senha" na tela de login. Quem perdeu o autenticador e os códigos de recuperação
   precisa de ajuda do Platform Admin (`docs/runbook-incidente.md`).

A senha nunca aparece na tela de quem cria a conta; só vai por e-mail. Se o e-mail não chegar, confira o endereço
digitado e fale com o Platform Admin (para o administrador de uma organização nova existe Organizações › Reenviar convite).

## 3. Criar a conta de um colega

Quem pode: Platform Admin e administrador da consultoria. Caminho: **Conta e acessos › Usuários › Novo usuário**.

1. Nome, e-mail e papel (`consultor`, `consultoria_admin` ou `comercial`).
2. Marque os módulos que a pessoa terá (n.iso, n.privacy). Vale até o teto contratado pela organização.
3. Salve. O convite sai por e-mail.
4. Para o consultor enxergar um cliente, designe-o na Governança do projeto (seção 4, passo 5).

Trocar o e-mail de uma conta existente: **Usuários › Editar** (só o Platform Admin edita o e-mail). A conta mantém
o histórico. Atenção: designações na Governança valem pelo e-mail; depois da troca, edite a designação para o e-mail novo.

## 4. Começar um cliente novo

1. **Projetos › Novo projeto** (confira o limite de projetos do plano da organização).
2. Em **Produtos** do projeto, habilite o módulo que o cliente contratou. Ligar o n.privacy num projeto que já
   tem n.iso importa sozinho partes, responsáveis e políticas do cadastro, e avisa se alguma importação falhar.
3. Crie o administrador do cliente (`org_admin`) em **Usuários**, escolhendo o projeto dele. Ele recebe o convite.
4. Conceda a ele os módulos do projeto (o padrão já é o dos módulos do projeto).
5. **Governança do projeto**: cadastre as pessoas-chave do cliente e designe os consultores da ness.
   (categoria Consultor). Sem designação, o consultor não vê o projeto.

## 5. Trazer um cliente que já tem programa (migração)

No n.privacy, grupo **Implantação**:
- **Importar programa**: envie planilhas e documentos (até 50 arquivos por lote). O sistema converte, classifica e
  **propõe** itens (tratamentos, terceiros, documentos, DPIA, LIA, pedidos, incidentes, consentimentos). Nada vira
  registro sem você revisar e confirmar. O que a IA lê tem e-mail, CPF e telefone mascarados.
- **Entrevista do RoPA** (ROPA › Nova atividade): uma pergunta por vez. Dá para descrever a atividade com suas
  palavras e o copiloto preenche uma **proposta**, marcada "Proposta do assistente: confira". Ele nunca decide dado
  sensível, crianças, transferência internacional nem salvaguarda: essas respostas são suas.
- Falta uma pessoa, área ou sistema? **Cadastrar agora**, na própria pergunta. A tela avisa se já existe algo parecido
  ("folha de pagamento" e "payroll system" contam como parecidos); prefira usar o existente.

Terminou? A atividade fica em **rascunho** até o encarregado revisar e a aprovação seguir o fluxo de pedidos.

## 6. Cliente que vem de outra consultoria (ou vai para ela)

Só o Platform Admin. **Organizações › Nova organização** (nome, identificador, prefixo de proposta, administrador
com e-mail **ainda não cadastrado**), depois **Editar** para marcar os módulos contratados e, por fim,
**Transferir projeto** (origem, projeto, destino, motivo).

A transferência é séria:
- **Sai**: consultores da organização de origem na Governança, concessões de agente, chaves de API (revogadas),
  webhooks (desativados), SSO e token SCIM. O administrador do destino reconfigura o que precisar.
- **Fica**: usuários do cliente, propostas, contratos e a trilha.
- Confirme antes de transferir quem continuará atendendo e reabra a designação no destino.

## 7. Agentes de IA (Claude Code, Codex, Cursor, Antigravity, ChatGPT)

Menu **Agentes** (receitas por cliente, com o passo a passo de cada ferramenta). Resumo:
- Conecta quem é consultor ou administrador da consultoria; o Platform Admin e o comercial só leem o painel.
- No login você escolhe **um projeto** e **um papel**: **Consultor** (ajuda a implementar; grava só rascunhos e
  pede aprovação humana) ou **Auditor** (só lê e registra achado e nota de auditoria).
- **Quem implementa não audita:** a mesma conta não pode ter os dois papéis ativos no mesmo projeto. Para trocar,
  revogue um acesso antes de conectar o outro.
- O administrador do cliente vê e revoga qualquer agente conectado ao projeto dele.

## 8. Desativar, excluir, trocar de pessoa

- **Desativar** (Usuários › Desativar): a pessoa deixa de entrar por senha, SSO e agente; sessões abertas caem.
  Reversível. Use ao desligar alguém.
- **Excluir definitivamente** (Platform Admin): se a conta tem histórico (marcações de checklist, aceites de termo),
  ela é **anonimizada**: fica sem nome, e-mail e acesso, e o histórico mantém o autor. O e-mail volta a ficar livre.
- Ninguém desativa nem exclui a própria conta, nem o último administrador da organização.

## 9. Rotina diária no n.privacy

Abra **Encarregado**: a lista "o que fazer" já vem priorizada. No menu, **Direitos do titular (DSAR)**,
**Terceiros (risco de fornecedores)** e **Incidentes** mostram um selo quando há algo vencido ou perto do prazo.
Prazos legais são parâmetros (`parametros_legais`) com fonte e revisão; se o prazo aparece como "não calculado",
peça ao Platform Admin para cadastrar o parâmetro antes de prometer data ao titular.

## 10. Quando algo dá errado

| Situação | Onde olhar |
|---|---|
| "Você não tem acesso ao n.X" | O projeto tem o módulo? A pessoa tem o módulo (Usuários › Editar)? |
| Consultor não vê o cliente | Está designado na Governança do projeto? (administrador da consultoria vê tudo da organização) |
| Convite não chegou | Conferir o e-mail digitado; falar com o Platform Admin |
| Sistema fora do ar, deploy ruim, acesso indevido | `docs/runbook-incidente.md` |
| Publicar uma correção | `docs/runbook-publicacao.md` |
| Agente conectou e não responde | Menu Agentes; revogue e conecte de novo |
