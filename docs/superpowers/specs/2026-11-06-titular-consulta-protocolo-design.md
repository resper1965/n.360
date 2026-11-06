# Pedido do titular: consulta pública do andamento pelo protocolo (n.privacy)

Data: 06/11/2026. Situação: **desenho aprovado pelo dono em 06/11/2026** e construída (migration 0105; plano `docs/superpowers/plans/2026-11-06-titular-consulta-protocolo.md`).
Base: `2026-11-03-portal-solicitacoes-titular-design.md`, que deixou a consulta pelo protocolo "de fora (follow-up)", e
`2026-11-06-titular-identidade-encaminhamento-design.md`, que a manteve fora. Hoje o titular recebe só o protocolo, na tela e no
e-mail ("Guarde este número de protocolo para acompanhar o atendimento"), e não há onde acompanhar.

## Decisões do dono (06/11/2026)

1. **Prova = código de acompanhamento.** O protocolo (`PT-AAAA-NNNN`) é sequencial e se adivinha; a consulta pede protocolo **e**
   um código aleatório gerado na abertura pelo portal. Sem código por e-mail na hora (OTP).
2. **A consulta mostra situação e datas.** Nunca o texto da resposta, que segue por e-mail.

## 1. Dado (migration 0105)

`titular_pedidos.acompanhamento_hash TEXT` (`ALTER TABLE ADD COLUMN`, também no `schema.sql`), com índice único parcial
`idx_titular_pedidos_acompanhamento ON titular_pedidos(acompanhamento_hash) WHERE acompanhamento_hash IS NOT NULL`. Guarda só o
SHA-256 do código, nunca o código. Pedido registrado pelo DPO, importado ou aberto pelo portal antes da 0105 fica sem código e não
é consultável. Backup antes e o "sim" do dono para aplicar.

## 2. Código

- Gerado por CSPRNG (`crypto.getRandomValues`) no `abrirPedidoPortal`, gravado (o hash) no mesmo INSERT do pedido.
- 16 caracteres do alfabeto sem ambíguos `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (31 símbolos, cerca de 79 bits), em grupos de 4 com hífen
  (`K7QM-3XRP-9WTD-H2FN`). Sorteio sem viés de módulo.
- Na consulta, o código digitado é normalizado antes do hash: maiúsculas, sem espaço nem hífen; depois reagrupado. O hash é do
  formato canônico com hífens.
- Aparece uma vez: na resposta do `POST .../abrir` (`codigo`) e no e-mail do protocolo. Não há rota que o devolva depois. A resposta traz
  `email_enviado`; sem o e-mail, a confirmação pede para anotar o código em vez de prometer o envio.

## 3. Rota pública

`POST /api/v1/public/titular-pedidos/consultar`, corpo `{ protocolo, codigo }` (esquema estrito; protocolo no formato
`PT-AAAA-NNNN`, código até 40 caracteres). No `publicTitularApp`, atrás do limite por IP que o portal já tem (30 a cada 10 min).

- Procura o pedido pelo hash do código e confere o protocolo. Código desconhecido, protocolo que não confere, formato inválido do
  código: o **mesmo 404** `{ error: 'Protocolo ou código não conferem' }`. Esquema inválido (campo a mais, protocolo fora do formato):
  400 do `validateBody`, que não revela nada do banco.
- **Não depende do link do portal**: o código é a credencial. Desligar o portal para de receber pedidos, não de consultar.
- Resposta: `{ protocolo, tipo, status, recebido_em, prazo_em, respondido_em }`, as datas como o dia de São Paulo (AAAA-MM-DD;
  `respondido_em` é gravado como instante UTC). Nada de nome, contato, descrição, resposta,
  tratativas, encaminhamentos, identidade, projeto ou organização.
- Sem trilha por consulta (leitura pública sem efeito). O agente MCP já não alcança `/api/v1/public` (`caminhoSeguro`).

## 4. E-mail

`emailProtocoloTitular({ protocolo, codigo, link })`: o protocolo, o código e o botão "Acompanhar a solicitação" para
`appUrl/solicitacao#acompanhar=<protocolo>.<codigo>` (fragmento: não vai ao servidor nem ao Referer). Amostra em
`scripts/emails-amostra.mjs`.

## 5. Tela (`/solicitacao`)

- Área "Acompanhar uma solicitação" (protocolo e código), que abre **sem** o token do portal: pelo link "Acompanhar uma solicitação"
  no formulário e no estado de link inválido, e pelo fragmento `#acompanhar=` do e-mail, que preenche os campos, consulta e sai da
  barra (`history.replaceState`).
- Resultado: situação, tipo, aberto em, prazo e concluído em, em texto (dd/mm/aaaa). Erro: a mensagem do servidor.
- A confirmação da abertura passa a mostrar o protocolo **e** o código, com o aviso de guardar os dois.
- Script clássico, sem handler inline (CSP), como o resto da página.

## 6. Testes

- Integração no D1 real: a abertura devolve o código e grava só o hash (o código não aparece em coluna nenhuma); a consulta certa
  devolve só os campos permitidos; código errado, protocolo errado e o código de um pedido com o protocolo de outro projeto dão o
  mesmo 404; código digitado em minúsculas e sem hífen consulta; campo a mais dá 400; portal desligado ainda consulta; pedido sem
  código não é consultável; o limite por IP dá 429.
- E-mail: leva o código e o link com o fragmento; `emails-marca`.
- Tela (jsdom): código na confirmação; área de consulta sem token; fragmento `#acompanhar=` preenche e consulta.
- Contratos: openapi, migrations, contagem de colunas da 0058.

## 7. Fora

- Reemitir o código pelo DPO (quem perde o código fala com o DPO, que responde por e-mail).
- Consulta de pedido sem código (registrado pelo DPO, importado, ou aberto antes da 0105).
- Mostrar o texto da resposta ou as tratativas.
- Código por e-mail na hora (OTP).
