# Portal público de solicitações do titular (n.privacy)

**Status:** implementado no #543 (migration `0096_titular_portal.sql`), em produção.
**Origem:** feedback de testes do dono (documento "Teste n.Privacy"), item do módulo de solicitações.

## Reversão de decisão

A fatia 7 registrou "Portal público e conector externo: fora (decisão de 09/10)". O dono pediu agora,
no teste, o oposto para o PORTAL (o conector externo segue fora): **"deve ser criado um link para cada
cliente disponibilizar no site/app, para que as solicitações dos titulares sejam recepcionadas
diretamente no módulo, com retorno ao titular (número de protocolo), e todas as tratativas registradas".**
Este documento assume que a decisão de 09/10 foi revista para o portal de solicitações.

## O que entra

1. **Link público por projeto.** Um token estável por projeto (`titular_portais`, só o SHA-256 guardado),
   gerado pela equipe/`org_admin`. Desligável. É o link que o cliente publica no site/app.
2. **Recepção direta.** Página pública `/solicitacao` (sem sessão): o titular escolhe o tipo do pedido,
   informa nome e contato (e-mail), descreve e envia. Cria um `titular_pedidos` com `canal = 'formulario'`,
   `status = 'recebido'`, protocolo `PT-AAAA-NNNN` gerado como na criação interna.
3. **Retorno com protocolo.** A página mostra o protocolo; se o contato for e-mail, um e-mail best-effort
   com o protocolo é enviado (nunca derruba o registro).
4. **Tratativas.** `titular_pedido_tratativas` registra cada passo do atendimento (comunicação com o
   titular, encaminhamento a ponto focal, recebimento de evidência, nota interna), com autor e data.

## Fronteiras de confiança / minimização

- O token chega no CORPO (nunca no caminho/query). Token desconhecido ou portal desligado: o MESMO 404.
- Limite de taxa por IP e por projeto (`rateLimitD1`), como nos portais de auditor e homologação.
- O intake coleta só nome, contato e descrição — **sem CPF** (verificação de identidade é passo humano do
  DPO no atendimento, não no intake público). A descrição é texto livre do titular: é dado, nunca instrução.
- `tipo` validado contra a lista fechada; corpo estrito (zod). Nada de IA no caminho público.

## O que fica de fora (follow-up)

- Verificação de identidade automatizada no intake.
- Workflow estruturado de encaminhamento a pontos focais (hoje: registro em tratativa, texto livre).
- Consulta pública de andamento pelo protocolo (só o retorno do protocolo no envio).
- Conector externo (segue fora pela decisão de 09/10).

## Regras que não regridem

- As rotas internas de titular seguem na faixa `privacy`; `titular-portal` entra em `FAIXA_DO_SEGMENTO`.
- Responder/negar/arquivar continuam atos humanos pela interface (o portal só RECEBE, nunca decide).
- O agente MCP não opera o portal (caminho público recusado ao agente, como os demais `/api/v1/public`).
