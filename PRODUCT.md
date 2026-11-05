# Product

<!-- impeccable:product-schema 1 -->

Registro durável do que o n.360 é, para quem e por quê. Não traz cor, fonte nem componente: o
visual vive em [`DESIGN.md`](DESIGN.md) e nos tokens de `frontend/src/style.css`. Números e rotas
vivem no [`AGENTS.md`](AGENTS.md), com o comando que mede cada um.

## Platform

web

Aplicação web de uso em computador (SPA atrás de login). Responsividade fora de escopo até segunda
ordem (decisão registrada no `AGENTS.md`); as páginas públicas (`/politicas`, `/auditor`,
`/homologacao`, `/proposta`) são abertas por pessoas de fora, por link.

## Users

A experiência é desenhada **por papel**, sem um público que vença os outros: cada papel tem a sua
entrada, a sua casca e o seu próximo passo. Quando há conflito, decide o que serve ao papel daquela
tela.

- **Consultor da ness.** (`consultor`, `consultoria_admin`): conduz a adequação de vários clientes ao
  mesmo tempo. Entra todo dia, precisa saber em qual projeto agir e o que fazer nele, e trabalhar rápido.
- **Cliente** (`org_admin`, `org_user`, `client`; na prática o encarregado, o CISO ou o dono do
  programa na empresa): entra com menos frequência, precisa entender onde o programa está e o que
  esperam dele, sem jargão.
- **Aprovador** (`stakeholder`, papéis CISO/CEO nos pedidos): entra para aprovar ou dar ciência de
  algo específico; a experiência dele é o pedido.
- **Comercial** (`comercial`): leads, levantamentos e propostas; não alcança projeto.
- **Dono da plataforma** (`platform_admin`): organizações, contas, contratos de módulo.
- **De fora, por link**: auditor externo (somente leitura), fornecedor que responde a homologação,
  pessoa que confirma leitura de política, cliente que recebe a proposta.

## Product Purpose

O n.360 é a plataforma de governança, risco e conformidade da ness. Leva uma empresa à adequação e
à certificação na ISO 27001 e na ISO 27701 (módulo **n.iso**) e mantém o programa de privacidade sob a
LGPD e as resoluções da ANPD (módulo **n.privacy**), sobre **um cadastro só**. O módulo **n.ot** atende a
rotina ARCiber do ONS (RO-CB.BR.01) para ambientes de tecnologia operacional: inventário, coleta e
levantamento em campo, com IP e MAC protegidos.

Sucesso, nas palavras do dono:
- **O cliente age sozinho:** entra, entende o que falta e resolve sem precisar ligar para o consultor.
- **O consultor atende mais:** cuida de mais clientes no mesmo tempo, porque a plataforma diz onde agir.

## Positioning

**Consultoria e plataforma juntas.** A ness. opera o programa junto com o cliente, inclusive como
MSP, e o n.360 é o meio de trabalho da consultoria: o consultor e o cliente veem o mesmo programa, cada
um com o que é seu. Não é software de prateleira que o cliente configura sozinho, nem consultoria que
entrega planilha e vai embora.

## Operating Context

- Um projeto por cliente; o cliente pode ter um módulo, o outro ou os dois. A pessoa tem acesso por
  módulo, além do projeto.
- O consultor alterna entre a carteira (todos os seus projetos) e um projeto. O cliente vive dentro
  do projeto dele.
- O trabalho é guiado por prazos legais e normativos: pedidos do titular, comunicação de incidente à
  ANPD, revisão de documento, validade de evidência e de avaliação de terceiro, auditorias.
- Decisões formais (aprovação de tratamento, de documento, de RIPD, de exceção) passam por pedido de
  aprovação ou ciência, com o conteúdo congelado e a prova guardada.
- Parte do cadastro chega por importação de planilhas e documentos do cliente ou do sistema legado,
  sempre revisada por uma pessoa antes de gravar.
- Agentes de IA (MCP, copiloto da entrevista, importação) trabalham ao lado do consultor.

## Capabilities and Constraints

- **n.iso:** controles do Anexo A, SoA, riscos, ações corretivas, auditorias, jornada por fases,
  políticas e evidências.
- **n.privacy:** RoPA (entrevista guiada), teste de impacto e RIPD, LIA, ciclo de vida do dado e bases
  legais, riscos e ações por atividade com mapa de risco, terceiros e homologação por questionário,
  pedidos do titular, incidentes, consentimentos, painel do encarregado, importação do programa e do
  legado.
- **Núcleo comum:** partes, itens (ativos), documentos com versões, evidências, pedidos de aprovação e
  ciência, painel de entrada, carteira, exportação CSV e Word.
- **A IA rascunha, uma pessoa aprova.** Aprovar, concluir, encerrar e revogar são atos humanos, com
  assinatura e trilha imutável.
- PT-BR em todo texto visível; sem i18n (decisão tomada).
- Prazos legais não moram no código: são parâmetros com fonte e revisão; sem o valor, o prazo aparece
  como "não calculado".
- Terminologia do domínio a respeitar: tratamento ou atividade de tratamento (RoPA), RIPD, LIA,
  titular, encarregado, controlador, operador, SoA, evidência, ação corretiva.

## Brand Commitments

- Marca `ness.`, sempre minúscula e com ponto; o ponto na cor de destaque da marca. Plataforma
  `n.360`, módulos `n.iso` e `n.privacy`, com o ponto da mesma cor. `n360` só no endereço.
- Guia de identidade da ness. (skill `ness-branding`) é a referência de marca; onde ele diverge de
  decisões já tomadas no produto, a decisão do produto vale e fica registrada em `DESIGN.md`.
- Decisões tomadas, não reabrir: um tema escuro só, sem alternância; sem itálico, sem emoji, sem
  ícone decorativo; sem framework no frontend.
- Voz: direta, em português claro, sem jargão de software e sem anglicismo quando há palavra
  portuguesa; o termo técnico da norma ou da lei é mantido.

## Evidence on Hand

- Normas e lei como fonte: catálogo da LGPD e da ANPD em `src/data/`, 93 controles do Anexo A da ISO
  27001:2022 em `src/services/soa-logic.ts`.
- Estudos e diagnósticos de design em `docs/design/` (12/10, 13/10 e 14/10/2026), com capturas.
- **Não existem** depoimentos, cases publicados, números de clientes nem métricas de uso coletadas;
  nada disso pode ser inventado em tela, landing ou documento.
- Validação jurídica pendente (registrada nos planos): regra de recomendação do RIPD, perguntas da
  homologação de fornecedor, catálogo do GDPR, textos das etapas do ciclo de vida.

## Product Principles

1. **O próximo passo sempre à vista.** Toda entrada responde, para aquele papel, "o que eu faço agora"
   antes de mostrar números.
2. **Cada papel vê o que é seu.** O cliente vê o que espera a decisão dele; o consultor vê onde agir em
   cada projeto. A visão por papel sai do servidor, não da tela.
3. **Nunca perguntar duas vezes.** O que já foi informado é herdado por todo fluxo seguinte; cada campo
   tem uma origem única.
4. **A máquina propõe, a pessoa decide.** Sugestão de IA e importação são marcadas como proposta até
   uma pessoa aceitar.
5. **Prazo é o que move o trabalho.** O que vence ou está vencido aparece primeiro, sempre com o
   motivo em texto, nunca só por cor.

## Accessibility & Inclusion

WCAG 2.1 AA, compromisso do guia de identidade da ness.: contraste de 4,5:1 para texto, foco visível em
todo elemento interativo, estado nunca transmitido só por cor, gráfico sempre com tabela equivalente,
navegação completa por teclado e respeito a `prefers-reduced-motion`.
