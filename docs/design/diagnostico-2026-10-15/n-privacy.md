# Avaliação A (design review): módulo n.privacy

Base: worktree `C:\Users\resper\worktrees\design` (HEAD `84adef9`), 54 capturas de `capturas/privacy/` (consultor, cliente, vazio, erro, 1024, modais e fluxos) e leitura do código das telas. Não rodei o detector nem li outros revisores. Todas as capturas têm 1440x900 ou 1024x768: as "páginas inteiras" saíram iguais ao primeiro quadro, então o que fica abaixo da dobra eu tirei do código.

## 1. Veredito de especificidade

**É específico onde foi redesenhado recentemente, e genérico (ou herdado do n.iso) no resto.** O Painel (frase do estado com "Como esta frase é montada", fila "O que fazer agora" com data e motivo em texto, rampa de cobertura de um matiz só), a entrevista do RoPA (uma pergunta por tela, "Por que perguntamos", guarda do art. 11) e a faixa vermelha "Comunicar à ANPD até 17/10 (falta 1 dia útil)" foram feitos para este produto. Nenhum concorrente usaria essas telas sem mudar nada.

O resto é tabela, cartões de contagem e modal empilhado, e serve a qualquer GRC: RIPD, Terceiros, Documentos, Partes, Treinamento, Papéis e comitê, Importação. Pior que isso, várias telas ainda falam ISO dentro do n.privacy: "Líder SGSI" em toda assinatura, "Meta ISO 27001", "Avaliação SGSI", "Governança & Equipe", "Revogar aprovação do DPIA", "Under Review". A casca troca o menu, mas o conteúdo continua sendo o do n.iso.

## 2. Notas de Nielsen

| # | Heurística | Nota | Achado-chave |
|---|---|---|---|
| 1 | Visibilidade do status | 2 | Erro 500 vira estado vazio em RoPA, Pedidos do titular e Terceiros ("Nenhum pedido de titular registrado" com 10 pedidos no banco, e o selo do menu some). Os números não batem entre telas: o Painel diz "44 de 65 artigos" e "8 riscos"; Cobertura diz "8 cobertos, 4 parciais e 9 lacunas, de 21"; o Mapa diz "14 riscos". O cartão "Atividades ativas 0" aparece com 6 aprovadas (`privacy.js:78` conta só `Active`). |
| 2 | Correspondência com o mundo real | 2 | A entrevista fala a língua do encarregado, mas o resto não: "Líder SGSI", "DPIA" e "RIPD" na mesma tela, "(Under Review)", "Trust center", "iso27701:7.2.8", "lgpd · controlador", motivos do servidor sem acento ("sensiveis, legitimo interesse"), "Cole em qualquer visualizador de Mermaid", nomes de tabela na busca de dados do titular (`titular.js:190`). O teste de impacto copia o modelo da ANPD ("O projeto envolve..."). |
| 3 | Controle e liberdade | 2 | Bom: a entrevista retoma pelo `sessionStorage`, e editar atividade aprovada pede confirmação. Ruim: os modais de Titular, Terceiro e Ligações não têm botão de fechar, e o Esc global (`globals.js:2196`) fecha sem aviso, perdendo a LIA ou a resposta ao titular digitadas. "Cancelar homologação" e "Encerrar incidente" são links soltos com o mesmo peso de "Voltar". |
| 4 | Consistência e padrões | 1 | O rótulo do menu difere do título da tela em seis lugares: Cobertura da LGPD/Requisitos, Pedidos do titular/Titular e incidentes, Pessoas, áreas e sistemas/Partes e departamentos (sem sistemas), Papéis e comitê/Governança & Equipe, RIPD/RIPD (DPIA), Treinamento/Treinamento & Conscientização. Há três caminhos de aprovação (assinatura direta "Líder SGSI e Direção", "Pedir aprovação" nas Ligações, "Pedir aprovação a stakeholders" no RIPD), datas em `2025-08-31` e em `31/08/2025` na mesma janela, cinco definições de "quem edita" e duas linguagens visuais para o mesmo mapa de risco. |
| 5 | Prevenção de erro | 2 | Bom: a guarda do art. 11 e o aviso de duplicata. Ruim: "Concluir" a homologação vem com "Aprovado" pré-selecionado e a data em branco; "Novo RIPD" sem nome fecha em silêncio (`privacy.js:519`); na importação, "Aceitar" é oferecido para item marcado "Já existe". |
| 6 | Reconhecer em vez de lembrar | 2 | Riscos, ações, LIA e aprovação moram num modal que a linha do RoPA chama de "Ligações" ou de "Base legal e LIA", conforme a base. Teste de impacto e ciclo de vida só aparecem quando se volta por "Continuar entrevista". Os modelos de CSV do legado estão "no runbook". |
| 7 | Flexibilidade e eficiência | 2 | Há exportações CSV e Word, "Aceitar os de confiança alta" em lote e o copiloto. Faltam ordenar por prazo e filtrar nas listas (Pedidos sai por protocolo, e os atrasados ficam no meio), e o RoPA não tem busca. |
| 8 | Estética e minimalismo | 3 | O visual é quieto, quadrado e na marca. Pesam as paredes de botões: seis no cabeçalho do RoPA, três links por linha, seis botões no documento, "Convidar" e "Revogar" repetidos por pessoa. O modal de Ligações tem 11 seções empilhadas. |
| 9 | Reconhecer, diagnosticar e recuperar-se de erros | 1 | O 500 parece "vazio", o que é perigoso num produto guiado por prazo legal. O erro do Painel é genérico ("Tente de novo em instantes"), sem botão de tentar de novo. "Novo RIPD" falha em silêncio. |
| 10 | Ajuda e documentação | 3 | "Por que perguntamos", prazos legais com fonte e revisor, "Como esta frase é montada" e o Assistente. Falta ajuda onde mais importa: o que cada tipo de pedido do titular exige, e o que fazer numa lacuna da LGPD. |
| **Total** | | **20/40** | **Aceitável, no limite: o fluxo central quebra em pontos que importam** |

## 3. Carga cognitiva

Falham 5 dos 8 itens: carga alta.

- **Foco único.** O modal de Ligações empilha Aprovação, Avaliações, Riscos, Ações, Base legal, Sugestão da IA, Sistemas, Departamentos, Partes, Transferências e Diagrama, cada um com o seu Salvar.
- **Divisão em blocos.** O teste de impacto põe 13 perguntas Sim/Não/Não sei numa página só, com a etiqueta "Pergunta 1 de 1". Quebra o princípio da própria entrevista.
- **Poucas escolhas.** O cabeçalho do RoPA tem 6 botões (Importar planilha, Exportar RoPA (PDF), Exportar CSV, Exportar LIAs (CSV), Edição avançada, Nova atividade). O documento aberto tem 6 ações de mesmo peso. Cada linha do RoPA tem 3 links.
- **Memória de trabalho.** A pessoa precisa lembrar de reabrir a atividade para fazer o teste de impacto e o ciclo, e de que "Ligações" é onde ficam os riscos. Também precisa conciliar três contagens diferentes da LGPD.
- **Revelação progressiva.** A entrevista acerta. As telas antigas despejam tudo: o Novo RIPD tem 8 campos longos, o Terceiro tem 6 seções.

Passam: a hierarquia do Painel, o agrupamento do menu (quatro seções fixas, já resolvido em relação ao estudo de 14/10) e "uma coisa por vez" na entrevista.

## 4. Jornada emocional por papel

- **Consultor.** Começa bem: o Painel diz o que está atrasado e leva à lista filtrada. A entrevista dá confiança. O vale vem depois de salvar: a tela final sugere "Voltar ao inventário" e o fluxo morre, sem teste de impacto, sem RIPD herdado (o "Novo RIPD" pede tudo de novo), com o risco escondido no modal e a aprovação em três lugares. O fim deixa a sensação de "terminei?", e a regra do pico-fim pesa contra.
- **Cliente (encarregado, org_admin ou client).** O Painel mostra 3 decisões com "Ler e aprovar", e esse é o ponto alto. Depois vem o vale mais fundo do módulo: ele abre um pedido do titular atrasado e só pode ler, sem botão, sem saber quem está cuidando e sem como registrar um pedido novo (`titular.js:21`, `podeEditar` exclui org_admin). O org_admin pode pedir "Rascunho" da resposta (`titular.js:26`), mas não tem campo onde usá-lo. É ansiedade sem saída, em cima de prazo legal.
- **Aprovador.** Não avaliei a fundo: está em Meus pedidos, fora deste módulo. A entrada pelo Painel do cliente funciona.

## 5. Forças

1. **O Painel do encarregado é o melhor artefato do módulo.** A frase única do estado ("2 pedidos do titular atrasados.") vem com a base legal e o "Como esta frase é montada". A fila "Atrasado / Nesta semana / Para planejar" traz data, motivo em texto e verbo de ação ("Responder os pedidos", "Registrar a comunicação"). O estado vazio troca números zerados por "Primeiros passos" numerados. Cumpre os princípios 1 e 5 do PRODUCT.md.
2. **A entrevista do RoPA e o copiloto.** Cada tela é uma pergunta em português de consultor, com "Por que perguntamos", exemplos clicáveis, "Não sei agora" que vira pendência, guarda do art. 11 com explicação e proposta da IA marcada até a pessoa conferir. É o padrão que o resto do módulo deveria seguir.
3. **Prazo legal tratado como dado.** Há a aba Prazos legais com fonte e revisor, a faixa do incidente em dias úteis e o aviso antecipado "novos pedidos ficarão sem prazo". Isso passa confiança jurídica e é diferencial.

## 6. Problemas prioritários

**[P0] O cliente não consegue agir sobre o pedido do titular nem sobre o incidente.**
- Por que importa: a persona central do n.privacy é o encarregado do cliente, e o PRODUCT.md diz "o cliente age sozinho". Hoje org_admin e client só leem pedido, incidente, terceiro vencido e RoPA. O org_admin pode gerar "Rascunho" de resposta, mas não tem onde gravá-lo. O pedido atrasado fica num modal sem nenhuma ação.
- Correção: decidir o papel. A recomendação é que org_admin registre o pedido, responda, marque a comunicação à ANPD e use o rascunho. Unifique `podeEditar` num helper por recurso (hoje são 5 definições). Quando for só leitura, mostre a linha "Quem cuida: Ana Ribeiro (ness.). Prazo: 06/10, atrasado 9 dias" e o botão "Pedir prioridade à consultoria".
- Comando: `/impeccable harden`, depois `/impeccable clarify`.
- Onde: `frontend/src/views/titular.js:21-26,153-172`; `terceiros.js:15`; `tratamento-ligacoes.js:16`; `privacy.js:121`.

**[P0] "Novo RIPD" não mostra a atividade e cai no formulário manual: a herança da F1 está morta.**
- Por que importa: `api()` já desembrulha `{records}` numa lista (`api.js`, linha que devolve `data[chaves[0]]`), e `openNewDPIAModal` lê `r?.records` (`privacy.js:467`), então `atividades` fica sempre vazio. O consultor redigita finalidade, titulares e categorias. Isso quebra o princípio 3 e o RIPD nasce desligado do RoPA (sem `ropa_id`, sem o selo "RoPA mudou"). Confirmado no código e na captura `privacy-consultor-dpia-novo`.
- Correção: `atividades = Array.isArray(r) ? r : lista(r?.records)`, com teste jsdom em `novo-ripd.test.js` que simule a resposta desembrulhada. Pré-selecionar a primeira atividade marcada "Exige RIPD" sem RIPD. Trocar o `if (!body.system_name) return` por mensagem no campo.
- Comando: `/impeccable harden`.
- Onde: `frontend/src/views/privacy.js:463-522`.

**[P1] Erro de carga aparece como "vazio".**
- Por que importa: com 500, RoPA diz "O inventário está vazio", Pedidos diz "Nenhum pedido de titular registrado" e o selo do menu some. O encarregado conclui que não há prazo correndo, ou recadastra atividades em duplicidade. É o pior erro possível num produto movido a prazo legal.
- Correção: separar "falhou" de "vazio" em `renderDataTable`, com o estado "Não foi possível carregar os pedidos. Os prazos continuam correndo." e o botão "Tentar de novo". Esconder os cartões de contagem quando a carga falhar.
- Comando: `/impeccable harden`.
- Onde: `privacy.js:61`, `titular.js:56`, `terceiros.js` (lista), `painel.js:317`.

**[P1] O encadeamento atividade, impacto, RIPD/LIA, riscos/ações e aprovação não é um fluxo.**
- Por que importa: hoje são cinco portas.
  - Na atividade nova, a entrevista vai de "Bloco 1 de 8" até "Atividade salva", e o primário é "Voltar ao inventário".
  - O teste de impacto e o ciclo de vida só existem com o registro gravado (`ropa-entrevista.js:215,252`). Só aparecem em "Continuar entrevista", que vira "Bloco 9 de 9" mesmo em atividade aprovada.
  - Riscos e ações ficam no 3º e 4º bloco do modal Ligações.
  - A aprovação aparece em três lugares, e a de "Detalhes" ainda é "Líder SGSI e Direção Executiva".
- Correção: a tela final da entrevista vira uma lista de próximos passos com estado: "1. Teste de impacto (13 perguntas, 5 já respondidas)", "2. RIPD recomendado: criar a partir desta atividade", "3. LIA: rascunho", "4. Riscos: 0 registrados", "5. Pedir aprovação (habilita quando 1 a 4 estiverem resolvidos)".
  - Na lista do RoPA, troque os três links por "Abrir" (uma ficha com abas Resumo, Avaliações, Riscos e ações, Aprovação) mais uma coluna "Próximo passo".
  - Aposente a assinatura direta no modal Detalhes (decisão 4 pendente do estudo de 13/10, ainda aberta).
- Comando: `/impeccable shape`, depois `/impeccable distill`.
- Onde: `ropa-entrevista.js:827-838`, `privacy.js:89-110,118-200`, `tratamento-ligacoes.js:165-219`.

**[P1] O teste de impacto pergunta de novo o que a entrevista já sabe.**
- Por que importa: das 13 perguntas, 5 repetem respostas dos blocos B, C, D e H (sensíveis, larga escala, transferência, decisão automatizada, legítimo interesse; `src/services/impacto.ts:13-25` não deriva nada do registro). O resumo mostra então duas recomendações de RIPD de motores diferentes ("Recomendação de RIPD (DPIA): há dado sensível." e "Teste de impacto: RIPD recomendado: afeta direitos, sensiveis..."), que podem divergir.
- Correção: o servidor pré-responde a partir do RoPA e marca "da entrevista: confira". A tela mostra só as 8 restantes, uma por vez ou em grupos de até 4. Fica uma única recomendação, a do servidor, com motivos em português ("há dado sensível; há monitoramento"). E reescrever "O projeto envolve..." como "A atividade...".
- Comando: `/impeccable clarify`.
- Onde: `src/services/impacto.ts`, `ropa-entrevista.js:251-254,816-825`, e o resumo (`re-recomendacao` mais `re-impacto`).

**[P1] Modal sem fechar visível nem foco, e com Esc destrutivo.**
- Por que importa: `openModal` (`ui.js:8`) não move o foco nem dá nome ao diálogo. Titular, Incidente, Terceiro e Ligações não têm botão de fechar. Um Esc descarta LIA, resposta ao titular ou avaliação de risco digitadas, sem perguntar. Falha WCAG 2.4.3 e 4.1.2, e é perda de dado.
- Correção: no `openModal`, injetar o botão "Fechar" com `aria-label`, focar o título, prender o Tab, devolver o foco ao gatilho e perguntar "Descartar o que foi digitado?" quando houver campo alterado.
- Comando: `/impeccable harden`.
- Onde: `frontend/src/ui.js:8-30`, `globals.js:2196`.

**[P2] Vocabulário ISO e inglês dentro do n.privacy.**
- Por que importa: o encarregado não tem "Líder SGSI".
  - Telas: Detalhes do RoPA, RIPD, Documentos ("Aprovado: Só Líder SGSI"), Treinamento ("Meta ISO 27001", "Avaliação SGSI", "EXPIRED"), Papéis ("LÍDER DO SGSI") e Ligações ("DPIA ... (Under Review)", "Abrir a tela de DPIA", "Criar DPIA a partir do tratamento").
- Correção: os rótulos de papel vêm do módulo: no n.privacy, "Encarregado" e "Direção". Use "RIPD" sempre, sem "(DPIA)" fora da ajuda, e passe todo status por `traduzStatus`. Iguale título da tela e rótulo do menu.
- Comando: `/impeccable clarify`.
- Onde: `privacy.js:176-200,427-444`, `tratamento-ligacoes.js:171-173`, `produto.js:195`, `partes.js:25`, `titular.js:44`, `requisitos.js` (título).

**[P2] Accent como cor semântica, e defeitos visuais pontuais.**
- O que acontece:
  - `--info` é o mesmo `#00ade8` do accent, e pinta "Médio" no mapa (`mapa-de-risco.js:13`) e os selos "Rascunho", "Em revisão" e "Inativa". Isso fere "accent só em interativo".
  - O cartão do módulo no Painel do cliente sobrepõe o texto ("3 pedidos esperam a sua decisão" sobre "7 de 12"; captura `privacy-cliente-encarregado-quadro`).
  - O título "Registro de tratamentos (RoPA)" quebra em 3 linhas e é cortado no topo do cabeçalho de 64px, e o seletor de projeto vira "P...".
  - Em 1440x900, o item "Assistente" do consultor fica atrás do rodapé da barra.
- Correção: crie um token neutro de "médio" (ex. `--ord-andamento`) e um `--info` próprio fora do ciano. Dê largura mínima à coluna direita do Painel, ou empilhe. Ponha as exportações num "Exportar" único, como o Painel já faz, para o título caber. Deixe a lista da barra rolar acima do rodapé.
- Comando: `/impeccable polish`, depois `/impeccable layout`.
- Onde: `style.css` (`:root`), `mapa-de-risco.js:13`, `painel.js:155`, `privacy.js:65-68`.

## 7. Próximo passo por tela

| Tela | O próximo passo está claro para o papel? Qual é? Onde falha? |
|---|---|
| Painel (consultor) | Sim: "Responder os pedidos" no topo, por prazo. Falha: três botões preenchidos competem, e as faixas de prazo das ações ficam atrás de um "Ações por prazo" fantasma no cartão de vencimentos, abaixo da dobra. |
| Painel (cliente) | Sim: "Ler e aprovar". Falha: o cartão do módulo à direita tem texto sobreposto, e não há nada sobre pedidos atrasados, que são o assunto do encarregado. |
| Painel vazio | Sim: "1. Indicar o encarregado". Bom exemplo. |
| Painel erro | Não. "Tente de novo em instantes" sem botão e sem dizer o que continua valendo. |
| Tratamentos (RoPA) | Em parte: "Nova atividade (entrevista)" é o primário. Falha: não diz qual atividade precisa de quê ("Exige RIPD: Sim" sem dizer se o RIPD existe), mostra "Atividades ativas 0" e três links por linha com rótulo variável. |
| Entrevista (nova) | Sim, pergunta a pergunta. Falha no fim: "Voltar ao inventário" corta o fluxo, sem teste de impacto, riscos ou aprovação. |
| Entrevista (revisar/resumo) | Em parte: "O que ficou para depois (1)" é ótimo, mas a pendência não tem botão "Resolver", e duas recomendações de RIPD disputam a atenção. |
| Teste de impacto | Não. 13 perguntas numa página, cinco repetidas, linguagem de formulário da ANPD. |
| Ligações / Base legal e LIA | Não. 11 seções sem ordem de trabalho, a aprovação vem primeiro e o "Diagrama" pede para colar Mermaid. |
| Detalhes da atividade | Não. "Assinar como Líder SGSI" ao lado de "Continuar entrevista" e "Edição avançada": três saídas, nenhuma é a próxima. |
| RIPD (lista) | Em parte: "Novo RIPD". Falha: o selo "RoPA mudou depois deste RIPD: revise" não traz "Revisar" ao lado, e a coluna "Sistema ou operação" não é "Atividade". |
| Novo RIPD | Não. Deveria ser "escolha a atividade", e está quebrado (P0). |
| Detalhe do RIPD | Não. Três formas de aprovar mais "Editar". Falta "Parecer do encarregado" como próximo passo explícito. |
| Mapa de risco | Em parte: clicar a célula. Falha: o risco crítico não é destacado como "trate primeiro", e "Abrir a atividade" abre o modal de 11 seções, não a ação do risco. |
| Cobertura da LGPD | Não. A lacuna não tem ação ("ligar documento", "registrar evidência"). O art. 37 (o próprio RoPA) mostra equivalências ISO em código. Os números não batem com o Painel. |
| Terceiros | Em parte: o texto vermelho "2 com avaliação vencida" não é clicável e a lista não é ordenada por vencimento. O menu diz 4. |
| Terceiro (consultor) | Em parte: há dois caminhos para o mesmo resultado (Nova avaliação manual e Homologação). "Homologar" na verdade gera um link. |
| Terceiro (cliente) | Não. Vê "Vencida" e não pode fazer nada nem pedir nada. |
| Homologação (revisar) | Em parte: "Concluir", mas "Aprovado" já vem marcado e a data está em branco. Ao lado está "Cancelar homologação" como link. |
| Pedidos do titular (consultor) | Em parte: os atrasados estão no meio da lista, sem "dias restantes" e sem ordenação por prazo. |
| Pedido aberto (consultor) | Em parte: Salvar e Rascunho, mas sem roteiro do direito ("oposição: o que verificar, o que responder"). "Localizar dados" devolve nomes de tabela. |
| Pedido aberto (cliente) | Não. Beco sem saída (P0). |
| Registrar pedido | Em parte: "Recebido em" não vem com hoje, os tipos não têm explicação e o prazo calculado só aparece depois de salvar, num toast. |
| Incidente aberto | Sim. A faixa "Comunicar à ANPD até 17/10" e os botões de comunicação são o melhor momento de alto risco do módulo. Falha: "Encerrar incidente" é link solto, e o selo "No prazo" fica ao lado de "falta 1 dia útil". |
| Registrar incidente | Em parte: "Ciência em (de onde contam os prazos)" é ótimo, mas não vem com hoje. |
| Consentimentos | Em parte: "Revogar" por linha. Não liga ao pedido "Revogação do consentimento" (PT-2026-0040). |
| Prazos legais | Sim para o administrador. Para os outros é informativo. Bom. |
| Pessoas, áreas e sistemas | Não. O título é "Partes e departamentos", não há sistemas, e "Mais" esconde "Padronizar nomes". |
| Documentos | Em parte: "Costuma existir... Política de retenção" sem botão "Criar". A aprovação é "Líder SGSI". |
| Documento aberto | Não. Seis botões de mesmo peso mais dois Salvar, e "Marcar como revisado" ao lado de "Aposentar". |
| Evidências / Treinamento | Herdados do n.iso: "Meta ISO 27001", "Não conforme" em vermelho grande, "EXPIRED". Não dizem o que fazer no programa LGPD. |
| Papéis e comitê | Em parte: "Indicar o encarregado" está no Painel, não aqui. A tela é organograma ISO com "Convidar" e "Revogar" repetidos. |
| Importar programa (lista) | Sim: "Nova importação". Falha: os modelos CSV do legado estão "no runbook", sem link. |
| Lote (envio) | Em parte: "Enviar arquivos" e depois "Processar" são dois passos sem numeração, e o input nativo aparece sem estilo. |
| Lote (revisão) | Sim: Aceitar e Descartar com "Faltando". Falha: "Aceitar" fica disponível em item "Já existe". |
| Reconciliação | Em parte: o aviso laranja manda resolver, mas os números não são clicáveis para abrir os pendentes. |
| Assistente | Sim: perguntas de exemplo. Em 900px de altura, o item de menu do consultor some atrás do rodapé. |

## 8. Lacunas do legado: estão claras para quem usa?

| Função | Encontrável? | Próximo passo claro? | Herda dados? | Problema e correção |
|---|---|---|---|---|
| 1. Teste de impacto (bloco I) que recomenda o RIPD, e "Novo RIPD" | **Mal.** Só existe em atividade já gravada, por "Continuar entrevista". Na atividade nova nunca aparece (Bloco 1 de **8**). | Não. São 13 perguntas numa página, a recomendação aparece duas vezes, e "Abrir o RIPD" só aparece no resumo. | **Não.** Repete 5 respostas, e o "Novo RIPD" está quebrado (`privacy.js:467`). | Corrigir o P0. Derivar as 5 respostas do RoPA. Tornar o bloco I o passo seguinte obrigatório da tela final da atividade nova. Deixar uma recomendação só, em português. |
| 2. Riscos e ações por atividade, e mapa de risco | O mapa, sim (menu Avaliar). Riscos e ações, **não**: estão no 3º e 4º bloco de um modal chamado "Ligações" ou "Base legal e LIA". | Em parte. O mapa leva à atividade, não ao risco. O Painel leva às ações vencidas por modal. | Sim. O formulário traz o sistema e o responsável da atividade (`tratamento-ligacoes.js:75`). | Aba "Riscos e ações" na ficha da atividade. "Abrir a atividade" no mapa deve abrir o risco. O mapa do Painel e o da tela devem usar o mesmo desenho e o mesmo total. |
| 3. Ciclo de vida por etapa, bases adicionais e GDPR | **Não**, na atividade nova (só aparece com registro gravado, `ropa-entrevista.js:215`). Bases adicionais e GDPR estão no bloco D, que é encontrável. | Em parte. A ajuda é boa, mas nada indica que o ciclo ficou pendente. | Sim. Origem e eliminação viram etapas, e nada é perguntado de novo (`ropa-entrevista.js:301-305`). | Mostrar o ciclo logo depois do primeiro salvamento, na mesma sessão. Pôr o ciclo no resumo como pendência quando vazio. O GDPR em texto livre precisa de exemplo (já tem) e de um "Não se aplica" explícito. |
| 4. Faixas de prazo das ações no Painel, CSV e Word do RIPD/LIA | Faixas: **mal**, atrás de um botão fantasma "Ações por prazo" no cartão "Próximos vencimentos, 90 dias", abaixo da dobra (o cartão diz 90 dias, e as faixas vão a +150). CSV: sim ("Exportar" no Painel). Word do RIPD: sim, na linha. Word da LIA: **mal**, no meio do modal de Ligações. | Sim, para baixar. As faixas abrem uma lista sem ação por item. | Sim. O Word usa os dados da empresa. | Faixas como linha própria em "O que fazer agora" ("3 ações vencem em 30 dias"). Word da LIA também no "Exportar" do Painel e na ficha. O cliente não vê as faixas. |
| 5. Homologação de fornecedor por questionário | Em parte: dentro do modal do terceiro, 4ª seção. A lista não mostra "% respondido" nem "aguardando resposta". | Em parte. "Homologar" gera link (deveria dizer isso). O link "não aparece de novo" e surge no pé de um modal longo. "Concluir" vem com "Aprovado" marcado. | Sim. O resultado vira avaliação do método questionário. | Coluna "Questionário" na lista (Aguardando, 88%, Respondido). Trocar o rótulo para "Gerar link do questionário". Pôr o link num diálogo próprio com "Copiar". Resultado sem pré-seleção. O cliente não vê e não pode responder por si. |
| 6. Importação do legado com modelos CSV e reconciliação | Importação, sim. **Os modelos, não** ("estão no runbook", `importacao.js:139`). Reconciliação: sim, como link no topo do lote. | Em parte. A reconciliação diz "resolva antes da virada", mas os números não abrem os itens. | Sim. Casa finalidade e parte, e marca "Já existe". | Botão "Baixar modelos (CSV)" com os 10 cabeçalhos. Contagens clicáveis que filtram a aba. Bloquear "Aceitar" em duplicata, oferecendo "Mesclar" ou "Descartar". Mostrar a data no formato BR. |

## 9. Red flags por persona

**Jordan (primeiro acesso, consultor novo):**
- Abre o RoPA e vê seis botões no cabeçalho e três links por linha. Não sabe se "Detalhes", "Continuar entrevista" ou "Ligações" é onde está o trabalho.
- Termina a entrevista e clica em "Voltar ao inventário" achando que acabou. Nunca vê o teste de impacto nem o ciclo de vida.
- Abre "Novo RIPD", encontra 8 campos vazios e redigita tudo.
- Lê "Líder SGSI" num programa LGPD e "DPIA" e "RIPD" na mesma janela.

**Alex (usuário avançado, consultor com 12 clientes):**
- Em Pedidos não há ordenação por prazo nem filtro "atrasados" (só vindo do Painel).
- Cada risco custa abrir o modal de 11 seções e rolar até o 3º bloco. No mapa, "Abrir a atividade" leva ao mesmo modal.
- Na Ligações, cada seção tem o seu Salvar, e não existe "Salvar tudo".
- Não há atalho entre o pedido "Revogação do consentimento" e a aba Consentimentos.
- Os itens do menu não são links de verdade (estudo de 14/10), então não abrem em nova aba.

**Sam (acessibilidade, teclado e leitor de tela):**
- O modal abre sem mover o foco e sem nome acessível, e vários não têm botão de fechar. O Esc descarta texto sem aviso.
- Os selos de nível de risco dependem da borda colorida, mas também trazem o nível por texto, o que está correto. Já o "Médio" em ciano repete a cor do foco.
- Na entrevista, o "Bloco 9 de 9" anuncia "Pergunta 1 de 1" para 13 grupos de rádio.
- Em 1440x900 o item "Assistente" fica escondido atrás do rodapé da barra.

**Encarregado de uma empresa média que recebeu um pedido do titular hoje (cliente, org_admin):**
- Entra pelo Painel, que fala das decisões dele e não do pedido novo.
- Vai a "Pedidos do titular" e **não há "Registrar pedido"** para o papel dele.
- Abre um pedido parecido e só pode ler, sem saber quem cuida e quanto falta.
- Não acha onde ver o que a lei exige para aquele tipo de pedido.
- O prazo de 15 dias só aparece como data. Não existe "faltam 15 dias".
- Se o servidor falhar, a tela diz que não há pedidos. Ele liga para o consultor, o que contradiz o "o cliente age sozinho".

## 10. Conformidade de marca

- **Conforme.**
  - Tema escuro único, tokens `#0b1326` e `#162244`, geometria quadrada na maioria das telas e Montserrat 600 nos títulos.
  - `n.privacy` com o ponto em accent na barra e no Painel, sem itálico e sem emoji.
  - Foco com anel ciano nas opções da entrevista, estado escrito ao lado da cor (Painel, mapa) e rampa ordinal validada.
- **Desvios.**
  - `--info` igual ao accent, usado como cor de estado (Médio, Rascunho, Inativa, Em revisão). O guia e o DESIGN.md dizem que o accent só vale em elemento interativo e foco.
  - Três botões ciano preenchidos empilhados no Painel. O primário deveria ser um por bloco.
  - Muitos estilos inline com `rgba` fora dos tokens e `font-family` repetida (`privacy.js:128-200,386-458`).
  - Cabeçalhos de tabela em mono caixa-alta a 9 ou 10px com tracking largo. O guia aceita caixa alta em microcopy de 11 a 12px, mas abaixo disso a leitura cai.
  - Datas ISO (`2025-08-31`, `2026-10-14 17:15:00`) misturadas com o formato BR.
  - "&" em títulos ("Governança & Equipe", "Treinamento & Conscientização") destoa da voz em português claro.
- **Grade de 8px.** Respeitada nos componentes novos, irregular nos modais antigos.

## 11. Fluxo: becos sem saída e passos repetidos

**Becos sem saída**
- O cliente no pedido do titular atrasado, no terceiro vencido e no RoPA (só "Detalhes").
- O detalhe do requisito da LGPD (só equivalências, nenhuma ação).
- A tela final da entrevista (nenhum próximo passo do programa).
- O Painel em erro (sem "tentar de novo").
- A reconciliação (números não clicáveis).
- O selo "RoPA mudou depois deste RIPD" (sem "Revisar").

**Passos repetidos**
- Teste de impacto contra os blocos B, C, D e H.
- "Novo RIPD" contra o RoPA (quebrado).
- Base legal no bloco D e de novo em "Base legal" nas Ligações (já apontado em 13/10 e ainda presente).
- A aprovação em três lugares.
- Avaliação de terceiro manual contra a homologação por questionário.

**Já resolvido desde os estudos anteriores** (não repito)
- O menu em 4 seções fixas, com o RoPA no topo de Mapear.
- O seletor de Status na criação, que sumiu: a entrevista substitui.
- O aviso ao editar atividade aprovada.
- O estado vazio do RIPD apontando o RoPA.
- O deep link do Painel com filtro.

## 12. Observações menores

- "Exigido" na coluna de data do Painel (LIA) não é data. Use "Sem prazo legal".
- O selo "No prazo" aparece ao lado de "falta 1 dia útil" no incidente. Use "Vence em 1 dia útil" em âmbar.
- O teto de 2000 caracteres do copiloto é exibido antes de qualquer digitação. Mostre-o só perto do limite.
- O seletor de projeto aparece truncado em todas as telas ("Programa ISO 27001 e LGPD ...").
- Consentimentos: as referências `tit-3f9a...` são ilegíveis. Mostre o pedido de origem quando houver.
- "Padronizar nomes" fica escondido em "Mais", e a partir de "carlos eduardo lima" a lista já mostra a necessidade.
- Os documentos ISO (Mesa limpa, Backup) aparecem no n.privacy sem filtro por módulo. Com o núcleo compartilhado isso é aceitável, mas vale filtrar "relevantes para LGPD".
- O texto da aba Prazos legais ("O prazo legal não vem do código...") é linguagem de desenvolvedor.
- O input de arquivo nativo aparece em inglês no Chromium sem locale ("Choose Files"). Envolva num rótulo próprio.

## 13. Perguntas provocativas

1. Se a atividade é a unidade do programa, por que ela não tem uma página própria com uma barra "Mapeada, Avaliada, Riscos tratados, Aprovada"? Hoje são um modal de detalhes, um de ligações e uma entrevista.
2. O encarregado do cliente é usuário ou espectador? Enquanto o produto não decidir, o n.privacy tem dois públicos e serve bem a um só.
3. Precisa existir "Edição avançada", se a entrevista revisa por bloco?
4. Por que o servidor calcula a recomendação de RIPD e a tela calcula outra? Qual delas o auditor vai ler?
5. O que o Painel do cliente mostraria se a pergunta fosse "o que a ANPD me cobraria hoje?" em vez de "o que espera a sua decisão?"?
6. Se três números diferentes descrevem a cobertura da LGPD (44/65, 51/65, 8/21), qual deles o dono mostra ao cliente na reunião?
