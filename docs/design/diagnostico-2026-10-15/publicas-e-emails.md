# Assessment A: páginas públicas e e-mails

Escopo: `politicas.html`, `auditor.html`, `homologacao.html`, `proposta.html` (worktree `C:\Users\resper\worktrees\design`, HEAD 84adef9),
mais os 9 e-mails que a plataforma envia. Base: 38 capturas de `publicas/`, 7 de `login/` e a leitura do código. Não rodei o detector
nem li outras avaliações. Os e-mails foram reconstruídos a partir do HTML no código. Não gerei captura deles.

## Veredito de especificidade

**Dividido.** A `proposta` é específica: documento em papel branco dentro da moldura escura, número `NESS-2026-012 rev. 2`, validade no topo,
aceite com cargo, e-mail, "Tenho poderes para contratar" e o aviso do que fica registrado (IP, versão). É uma página de contrato,
não um formulário genérico. O `auditor` também tem coisa própria (SoA com hash SHA-256 por evidência, prova em JSON, pergunta à consultoria).
A `politicas` é um template de "OTP portal" de 2024: cartão de vidro centralizado, Title Case, botão-pílula, `n.iso` em 700. Daria para
trocar o logotipo e usar em qualquer SaaS. A `homologacao` é correta, mas genérica. **Os e-mails não têm identidade nenhuma.** São
`<p>` soltos em Arial, sem marca, sem remetente humano e sem rodapé. Eles são a porta de entrada das quatro páginas e
são a parte mais fraca do conjunto.

## Heurísticas de Nielsen (0–4)

| # | Heurística | Nota | Ponto principal |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | Validade do link no topo (auditor, homologação, proposta) e "Rascunho salvo." Mas a homologação mostra "44%" fixo, que não muda ao marcar, e a política não diz quantos documentos faltam. |
| 2 | Correspondência com o mundo real | 2 | "código OTP", "Ciência Eletrônica", "Versão (SHA-256)" para o funcionário. "SoA" sem expansão no auditor está ok. Para fornecedor e funcionário sobra jargão. |
| 3 | Controle e liberdade | 3 | A proposta tem "Voltar" na recusa e o rascunho da homologação é bom. Mas o envio da homologação é irreversível por `window.confirm`, e a política assinada não tem desfazer (aceitável). |
| 4 | Consistência e padrões | 1 | Quatro peles: a política tem raio de 6–16px, blur, Montserrat 700 e fundo #070b14. O auditor tem botão de 10px. Homologação e proposta são quadradas. Marca: `n.iso` em uma, `ness.` em outra, nada nas outras duas. Os e-mails dizem n.iso e n.360 no mesmo envio. |
| 5 | Prevenção de erro | 3 | A recusa da proposta pede confirmação explícita, e assinar exige a caixa marcada. Mas a homologação deixa enviar 44% sem destacar as que faltam. |
| 6 | Reconhecer em vez de lembrar | 3 | O selo "Assinado" / "Versão anterior (1)" na lista de políticas funciona. O fornecedor não vê, antes de enviar, quais perguntas ficaram em branco. |
| 7 | Flexibilidade e eficiência | n/a | Uso pontual, por link, uma vez. Atalho não se aplica. |
| 8 | Estética e minimalismo | 3 | O auditor, a homologação e a proposta são limpos. A política tem cartão dentro de cartão e um selo no header que só repete o título. |
| 9 | Recuperação de erro | 3 | Link inválido explica e diz a quem pedir em todas as páginas (o auditor sem `#` explica até o fragmento). Mas "quem enviou" nunca tem nome nem e-mail na página. |
| 10 | Ajuda e documentação | 2 | Nenhuma página nem e-mail tem contato. "Fale com quem enviou a proposta" pressupõe que a pessoa sabe quem foi. |
| **Total** | | **23/36** | **64%: Aceitável** (no limite do Bom) |

## Carga cognitiva e jornada emocional

- O pico de ansiedade fica na **chegada**, não na ação: um e-mail sem marca, de `n.iso <noreply@ness.com.br>`, pedindo para clicar
  num link e depois digitar um código. Para uma área de segurança da informação, é exatamente o padrão que o próprio treinamento do cliente
  manda desconfiar ("Não abra anexos de remetentes desconhecidos", está na norma exibida na captura).
- O fim da jornada é fraco em três das quatro páginas. "Respostas enviadas. Obrigado. 44%..." celebra um envio incompleto. "Ciência registrada"
  não diz se falta outro documento. "Proposta aceita" é o melhor fim (data, nome, próximo passo), mas perde a marca e o número da
  proposta no topo.
- Decisões com mais de 4 opções visíveis: nenhuma. A homologação tem 4 rádios por pergunta, no limite, e está bem.

## Forças

1. **Proposta como documento de contrato.** Os três números grandes (investimento, mensalidade, prazo) vêm antes de tudo, o aceite registra cargo e
   poderes, e a página diz o que fica gravado. É a única responsiva (`proposta.css` explica o porquê: o diretor abre no celular), com alvos de 44px,
   campo de 16px e botão primário com `--accent-ink` (contraste correto). É o padrão para as outras.
2. **Estados de exceção escritos para leigo.** "O link venceu, já foi usado para enviar as respostas ou foi cancelado. Peça um novo link a quem o enviou."
   e "Abra o endereço completo que recebeu, incluindo a parte depois do #." Todas as páginas têm o estado de link inválido tratado, sem tela branca.
3. **Esqueleto comum em três páginas.** Auditor, homologação e proposta compartilham topo / estado / rodapé ("Link pessoal e com prazo. Não encaminhe."),
   tokens copiados do `:root` com teste que compara os valores (`auditor-publico.test.js`, `homologacao-publica.test.js`, `proposta-css.test.js`).
   A base para unificar já existe.

## Problemas prioritários

### [P0] Os e-mails não dizem quem pede e não têm identidade: parecem phishing
- **O quê.** Remetente padrão `n.iso <noreply@ness.com.br>` (`src/helpers.ts:729`) para tudo, inclusive o que é do n.360 e do n.privacy.
  O e-mail de ciência diz "**Pedimos** a sua ciência do documento X" sem dizer quem pede (`src/routes/pedidos.ts:326-331`). Não tem o nome da empresa
  nem do remetente, e não tem prazo além de "o link vale por N dias". Os de código (`src/routes/public.ts:86-91`, `src/routes/public-pedidos.ts:102-103`)
  são uma linha sem marca. O da homologação (`src/routes/homologacoes.ts:60-62`) não tem botão, tem a data em ISO (`2026-10-27`, `expira_em.slice(0, 10)`)
  e não diz quem na ness. ou no cliente responde por ele. Nenhum e-mail tem rodapé ("você recebeu porque..."), versão em texto puro (`text` ausente no payload
  do Resend) nem pré-cabeçalho.
- **Por que importa.** As quatro páginas só são abertas a partir desses e-mails. Fornecedor, funcionário e auditor são justamente quem foi treinado para
  não clicar em link de remetente desconhecido que pede código. A taxa de resposta e a credibilidade da ness. dependem disso, e o filtro antispam também
  (HTML sem texto puro e sem identificação pesa contra).
- **Correção.** Um só invólucro de e-mail (função única em `src/services/email-layout.ts`, usada pelos 9 envios), em tabela, fundo claro (o meio exige:
  o tema escuro quebra no Outlook e no modo claro do Gmail). Cabeçalho com `ness.`: Montserrat com fallback Arial, ponto em #00ade8. Primeira linha com
  **quem pede**: "Metalúrgica Exemplo Ltda pede a sua ciência...", "Ana Souza, da ness., enviou a proposta...". Linhas fixas "O que fazer" e
  "Até quando" (data por extenso). Botão com o texto da ação. Rodapé com a razão do envio, o endereço do produto e o contato de quem enviou.
  `from` com o nome de quem pede ("Metalúrgica Exemplo via n.360"), como a proposta já faz (`src/routes/propostas.ts:477`), e `reply_to` para a pessoa
  sempre que houver uma. Gerar o `text` a partir do mesmo conteúdo.
- **Comando.** `/impeccable harden` (e-mail) + `/impeccable clarify` (texto).

### [P1] Texto branco sobre #00ade8 nos botões de e-mail: 2,6:1
- **O quê.** `color: #ffffff` / `white` sobre `#00ade8` em `src/routes/pedidos.ts:329`, `src/routes/propostas.ts:446`, `src/services/avisos-prazo.ts:366` e
  `src/routes/users.ts:195`. O próprio `style.css` registra no token `--accent-ink`: "#fff dá 2.6:1". O código de recuperação vem em #00ade8 sobre #f4f4f7
  (`src/routes/auth.ts:353`), cerca de 2,4:1. Esse é o dado que a pessoa precisa copiar.
- **Por que importa.** Abaixo do AA, que o PRODUCT.md assume como compromisso. A ação principal de cada e-mail é o que se lê pior.
- **Correção.** Botão #00ade8 com tinta `#04121c`, ou botão #0b1326 com texto branco e o acento só numa borda ou no ponto da marca. Código de
  verificação em #0f172a, mono, com espaçamento.
- **Comando.** `/impeccable audit` → `/impeccable colorize`.

### [P1] `politicas.html` é a versão antiga da marca e a mais vista pelos funcionários do cliente
- **O quê.** CSS próprio inline com o tema de antes da revisão: `--bg: #070b14`, `backdrop-filter: blur(24px)`, Montserrat 700, raios de 6/8/10/12/16px,
  `--success #22c55e` e `--text-dim` com alfa 0,5, cerca de 3:1 (`frontend/public/politicas.html:11-21, 40, 44, 55, 67, 80, 104...`). Marca `n.iso` no topo
  (`:247`), embora a ciência agora seja do núcleo do n.360 e sirva também ao n.privacy (Política de Privacidade aparece na lista). Title Case nos rótulos
  ("Seu Nome Completo", "Validar Código e Acessar", "Assinar Ciência Eletrônica", `:261`, `:348`). Erro de texto: "**Digitamos** o código OTP de 6 dígitos enviado
  para..." (`:275`). O correto é "Enviamos um código de 6 dígitos para". Checkbox nativa azul do sistema. O texto do documento herda indentação
  (a primeira linha "1. Uso dos equipamentos" sai recuada nas capturas de leitura). "Versão anterior (1)" em verde, a mesma cor de "Assinado", diz o
  oposto do que significa: a ciência está desatualizada.
- **Por que importa.** É a página com maior público (todo funcionário do cliente) e contradiz o DESIGN.md em cinco regras. Ao lado do login e da proposta, parece
  outro fornecedor.
- **Correção.** Reescrever no esqueleto das outras três (`politicas.css` com os tokens copiados e o teste de comparação). Quadrada. Marca `n.360` ou, melhor,
  o nome do cliente no topo com "por ness." no rodapé. Selo de versão antiga em âmbar com texto "Nova versão para ler". Rótulos em caixa de frase. Checkbox
  com `accent-color: var(--accent)`.
- **Comando.** `/impeccable polish` + `/impeccable typeset`.

### [P1] A primeira tela da política pede e-mail corporativo sem dizer de que empresa
- **O quê.** Em `/politicas?project=...` o topo diz só "Portal de Ciência de Políticas". O nome do cliente só aparece **depois** do código
  (`frontend/public/politicas.js:241`). O link pessoal mostra o título do documento, mas também não mostra a empresa.
- **Por que importa.** Uma página com marca desconhecida (`n.iso`) pedindo nome e e-mail corporativo é o formato de uma página de coleta de credencial.
  O funcionário que passou pelo treinamento hesita, com razão.
- **Correção.** Expor o nome do cliente (dado não sensível) no endpoint público anterior ao código e mostrá-lo no título: "Metalúrgica Exemplo Ltda: políticas
  para ler e confirmar". Dizer quantos documentos esperam a pessoa e o prazo, quando houver.
- **Comando.** `/impeccable clarify`.

### [P1] Auditor e homologação não têm marca nenhuma
- **O quê.** `auditor.html:8` `<title>Portal do auditor</title>` e `homologacao.html:8` `<title>Questionário de homologação de fornecedor</title>`. O topo mostra
  só o nome do projeto ("Programa ISO 27001 e LGPD 2026") ou do cliente. Não há `ness.` nem `n.360` em lugar nenhum da página, nem no rodapé. "Pergunta à consultoria"
  não diz qual consultoria.
- **Por que importa.** O auditor externo é quem certifica o cliente. A página é a vitrine da ness. diante do certificador, e ela é anônima. O fornecedor não
  sabe que a ness. opera o questionário, então não sabe a quem perguntar.
- **Correção.** Mesmo topo nas quatro páginas: à esquerda, o nome de quem pede (cliente). No rodapé, `n.360 · ness.` com o ponto em accent (marcação canônica
  `ness<span class="dot">.</span>`) e "Dúvidas: nome, e-mail do consultor". `<title>` no padrão "Ação · Cliente · n.360", por exemplo
  "Questionário de homologação · Metalúrgica Exemplo · n.360".
- **Comando.** `/impeccable polish`.

### [P2] Homologação: a ação final não é primária e o fim celebra o incompleto
- **O quê.** "Enviar respostas" (`.hq-btn-primario`, `homologacao.css:59`) é contorno em fundo `--surface-2`, quase igual a "Salvar rascunho". O envio usa `window.confirm`
  (`homologacao.js:138`, diálogo nativo sem marca). O sucesso diz "Obrigado. 44% do questionário foi respondido e enviado a quem o pediu." (`:149`).
  O "Respondido 44%" do cabeçalho não acompanha a marcação e não fica visível perto do botão. Não há tela de "o que acontece agora" (quem avalia, em quanto tempo,
  se haverá retorno) nem cópia das respostas.
- **Por que importa.** O fornecedor envia sem ver que deixou 5 em branco e depois não pode mais editar. O cliente recebe uma homologação inútil e o ciclo recomeça
  com um link novo.
- **Correção.** Botão de envio preenchido (accent com `--accent-ink`). Antes de enviar, em linha e não em `confirm`: "Faltam 5 perguntas: 5, 6, 7, 8, 9", com links
  para cada uma, e "Enviar assim mesmo" ou "Continuar respondendo". Contador ao vivo junto do botão. Na tela final: "Suas respostas foram enviadas à Metalúrgica
  Exemplo em 15/10/2026. Se precisarem de algo, o contato é ...", com opção de baixar ou imprimir o que foi enviado.
- **Comando.** `/impeccable harden` + `/impeccable clarify`.

### [P2] Nome do produto trocado nos e-mails de conta
- **O quê.** O convite tem assunto "Seu acesso ao n.360", título "Bem-vindo ao n.iso!" e botão "Entrar no n.360" (`src/routes/users.ts:185-199`). A recuperação diz
  "Recuperação de senha · n.iso" e "portal do **n.iso**" (`src/routes/auth.ts:350-376`), mas o login é `n.360`. A cor do aviso é #ff3b30 (vermelho iOS, fora da
  paleta), com asterisco. O título tem ponto de exclamação. O convite manda a senha provisória no corpo do e-mail.
- **Por que importa.** Quem recebe vê três marcas em dois e-mails e chega a uma tela de login que diz uma quarta coisa (`n.360` + `ness.`). A senha em claro também
  pesa na confiança: um cliente de segurança da informação nota.
- **Correção.** `n.360` em todo e-mail de conta. Trocar a senha provisória por um link de definição de senha de uso único (com o mesmo invólucro do P0). Usar o
  `--danger` da marca e só onde houver de fato um erro.
- **Comando.** `/impeccable clarify`.

### [P3] Proposta: a marca do topo perde o ponto em accent, e os estados finais perdem o contexto
- **O quê.** `pp-org` recebe o nome da organização por `textContent` (`frontend/public/proposta.js:84`), então o `ness.` do topo sai todo branco. Nas telas de proposta
  expirada ou inválida, o topo volta a "Proposta comercial", sem marca e sem número. "Dúvidas, fale com quem enviou a proposta" não traz o nome nem o e-mail
  do comercial, que o servidor já conhece (é o `replyTo`). "Ir para a resposta" é um botão com cara de link sublinhado.
- **Correção.** Quando a organização for a ness., renderizar com a marcação canônica (ponto em `--accent`). Manter número e marca nos estados finais. Nome e e-mail
  do comercial no rodapé e na tela de expirada ("Peça uma versão atualizada a Ana Souza, ana@...").
- **Comando.** `/impeccable polish`.

## Red flags por persona

**Fornecedor recebendo o questionário pela primeira vez.**
O e-mail vem de "n.iso", um nome que ele nunca viu, com assunto "Questionário de homologação de fornecedor - Metalúrgica Exemplo Ltda", um link em
texto ("Abrir o questionário") e data `2026-10-27`. Não há nome de pessoa a quem responder, e um *reply* cai no `noreply`. Na página não há marca, não diz quanto tempo
leva, quem vai ler nem para que serve ("homologação" pode significar perder o contrato), e a tela não funciona no celular. No fim, envia 44% sem
perceber e recebe "Obrigado". Risco de abandono alto no e-mail. Risco de envio incompleto alto no fim.

**Auditor externo.**
Ganha muito: SoA com hash, prova em JSON, perguntas com resposta e data. Os pontos fracos: a página é anônima (não diz que a consultoria é a ness.
nem quem é o consultor responsável), o "Baixar a prova... (JSON)" vem antes da SoA sem explicar o que é nem como verificar o hash, e a coluna Status mistura
"Parcial", "Pendente" e "Em andamento" sem legenda. As 8 linhas da captura cabem, mas 93 controles numa tabela sem filtro por status ou aplicabilidade
e sem busca vão cansar. Botão "Baixar" com raio de 10px, fora do sistema.

**Funcionário confirmando leitura de política.**
Recebe "Pedimos a sua ciência do documento X" sem saber quem pede, e um segundo e-mail, de uma linha, com o código. Abre uma página `n.iso` que
pede nome (que o sistema já sabe pelo link pessoal) e código. Lê "código OTP", "Ciência Eletrônica" e um SHA-256 de 64 caracteres logo abaixo do texto.
Depois de assinar, não fica claro se acabou: a lista mostra outros documentos sem dizer quais são obrigatórios. "Versão anterior (1)" em verde parece "ok".

**Diretor do cliente lendo a proposta.**
É a melhor experiência. Os riscos: o e-mail chega de "ness. via n.iso", e "n.iso" não é o que ele vai contratar se a proposta for do n.privacy. O topo da
página não tem o ponto azul. Os três botões de resposta têm o mesmo peso (defensável, mas "Aceitar" pode ser o primário sem forçar). Depois do
aceite, "o comercial vai entrar em contato" não diz quem nem quando.

## Conformidade de marca

| Peça | Marca | Ponto accent | Tipografia | Geometria | Título da aba | Favicon | Nota |
|---|---|---|---|---|---|---|---|
| Login (referência) | `n.360` + `ness.` | sim | Montserrat 500/600, Inter | quadrado | — | BlueDot | conforme |
| `politicas.html` | `n.iso` | sim | **Montserrat 700** | **6–16px, blur** | "Portal de Ciência de Políticas - n.iso / ness." | BlueDot + theme-color | fora |
| `auditor.html` | **nenhuma** | — | conforme | **botões e notas com 10px** | "Portal do auditor" | BlueDot | parcial |
| `homologacao.html` | **nenhuma** | — | conforme | quadrado | "Questionário de homologação de fornecedor" | BlueDot | parcial |
| `proposta.html` | `ness.` no doc; topo em texto puro | **doc sim, topo não** | conforme | quadrado | "Proposta comercial" (sem número nem marca) | BlueDot | quase conforme |
| E-mail convite | n.iso **e** n.360 | não | sans-serif genérica | raio 10/8/5px | — | — | fora; botão 2,6:1 |
| E-mail recuperação | n.iso | não | sans-serif, código em accent sobre cinza | raio 10/8px | — | — | fora; código ~2,4:1 |
| E-mail ciência (link) | nenhuma | — | Arial | raio 5px | — | — | fora; sem "quem pede" |
| E-mail código (ciência / políticas) | nenhuma | — | padrão do cliente | — | — | — | fora; uma linha |
| E-mail homologação | nenhuma | — | padrão | — | — | — | fora; sem botão, data ISO |
| E-mail proposta | nome da org em h2, sem ponto accent | não | Arial | raio 5px | — | — | parcial; remetente e reply-to bons |
| E-mail aviso de prazo | "n.360" no texto | não | Arial | raio 5px | — | — | parcial; botão 2,6:1 |

O guia da ness. não proíbe fundo claro em e-mail. Nesse meio, o tema escuro do produto deve ceder: marca preta com o ponto #00ade8 sobre branco, e o accent só
em detalhe ou em botão com tinta escura.

## Observações menores

- `theme-color` só existe em `politicas.html`. As outras três não têm.
- `<html lang="pt-BR">`: confirmar nas quatro. `robots noindex` falta em `politicas.html`, e as outras três têm.
- Auditor: os hashes em mono a 11px quebram em três linhas por evidência e dominam a coluna. Mostrar 12 caracteres com "copiar o hash completo".
- Proposta: "faixa Standard" é anglicismo, mas vem do dado da faixa e não do template. "Implementação · 90 dias" ao lado de "Prazo estimado 28 semanas" confunde
  (dado de exemplo, mas o template deixa os dois números se contradizerem sem rótulo).
- Política: o selo do topo repete o título da página antes do login e repete o nome do cliente depois. O cartão grande tem outro cartão branco dentro.
- O e-mail de ciência avisa "Se você recebeu um link anterior, ele deixou de valer" sempre, mesmo no primeiro envio.
- Homologação: o `legend` da pergunta corta a borda do `fieldset` (padrão do navegador), o que dá um aspecto inacabado ao lado do resto quadrado.
- Comentário em `src/routes/public.ts:85` cita `noreply@ness.lat`, mas o remetente real é `@ness.com.br`. Conferir SPF/DKIM do domínio de envio.
- Não encontrei envio de e-mail na criação de pedido de **aprovação** (só a ciência por link, a homologação, a proposta, a conta e o resumo diário de prazos).
  O aprovador da diretoria só fica sabendo pelo sino ou pelo resumo do dia seguinte. Confirmar se é intencional.

## Perguntas provocativas

- Se o e-mail é a primeira tela de todas as quatro jornadas, por que ele é a única superfície sem design?
- A pessoa de fora deveria ver "n.iso", "n.360" ou "Metalúrgica Exemplo, com a ness."? Qual marca ela reconhece e em qual confia?
- E se a página da política abrisse já com o documento (o link pessoal já identifica a pessoa) e o código fosse pedido só no momento de assinar, como a
  variante por link já faz?
- O fornecedor deveria poder enviar 44%? Se sim, o cliente vê claramente "incompleto"? Se não, por que a tela permite?
- O auditor precisa de 93 controles numa tabela, ou de "o que mudou desde a última visita" mais as perguntas abertas no topo?
- Proposta, auditor e homologação já compartilham esqueleto e teste de tokens. Por que não uma única `publico.css`, de que `politicas` também dependa?
