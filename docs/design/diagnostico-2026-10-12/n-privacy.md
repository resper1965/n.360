# Avaliação A: revisão de design do n.privacy (/privacy)

Escopo: casca do n.privacy (sidebar, header, rodapé) e as telas entrada/encarregado, ropa, dpia, titular, terceiros, vendors, partes, requisitos, importacao, documentos, governance e ai-chat.
Evidência: capturas `shots/privacy-*.png` (1440x900, API mockada quase vazia) e código-fonte em ``. Os caminhos de arquivo abaixo são relativos a `frontend/`.
Modo: Operate. Nenhum detector foi rodado.

---

## 1. Veredito de especificidade

**É meio a meio.** Metade parece ferramenta de encarregado e metade é o painel GRC genérico com outro rótulo.

O que é específico de LGPD:
- O modelo de dados e a cópia de `titular.js`: protocolo, prazo congelado, "Ciência em (de onde contam os prazos)", situação ANPD e titular separadas, rascunho da comunicação com "O incidente tem / Falta" (Res. CD/ANPD 15/2024), eliminação com justificativa e confirmação.
- A LIA ligada à base legal (`tratamento-ligacoes.js`).
- A importação com proposta de IA e revisão item a item (`importacao.js`).
- As prioridades do encarregado, que citam o art. 41.

Isso não existe num admin genérico.

O que contradiz:
- A camada visual dessas telas é a mesma faixa de 4 stat cards e a mesma caixa tracejada com uma frase. A tela de ROPA ficaria idêntica num CRM se trocassem os rótulos.
- Pior, o ISO e o produto antigo vazam para dentro do módulo:
  - Governança fala de "SGSI" e "Líder SGSI" (`views/monitor.js:553,580`).
  - O assistente diz "Faca uma pergunta sobre ISO 27001, controles, audit preparation" (`views/ai.js:16`).
  - Fornecedores aparece como "KYV" / "Trust Score" (`views/grc.js:475,500`).
  - O menu lista "Ativos" e "Partes Interessadas".
  - O formulário do RoPA vem em inglês e sem acento: "Active/Inactive", "Execucao contratual", "Standard Contractual Clauses (SCCs)".

Para um DPO, esses detalhes são o sinal de que a ferramenta "não é daqui". O DPO lê base legal sem acento e incompleta como falta de rigor jurídico.

---

## 2. Heurísticas de Nielsen (0 a 4)

| # | Heurística | Nota | Justificativa |
|---|---|---|---|
| 1 | Visibilidade do status | 2 | Grupos da sidebar nascem recolhidos e o item ativo fica invisível (todas as capturas). O prazo do incidente e do pedido aparece só num toast efêmero depois de salvar (`titular.js:125,220`). Selos de prazo na tabela são bons. |
| 2 | Correspondência com o mundo real | 2 | O vocabulário LGPD em titular e importação é bom. Por outro lado: SGSI, KYV, Trust Score, "audit preparation", status em inglês (`privacy.js:175-176,227-228,450-452`), acentos ausentes e a lista de bases legais incompleta (`privacy.js:159-164`). |
| 3 | Controle e liberdade | 2 | Modais têm ×. "Encerrar incidente" é o botão primário e não pede confirmação (`titular.js:241,283`). A conversa do assistente some ao navegar, sem aviso. |
| 4 | Consistência e padrões | 1 | "ROPA" convive com "RoPA". Abas existem em duas implementações: `titular.js:54` sem role e `importacao.js:145` com `role=tablist`. A ação primária ora fica no header, ora no corpo (`importacao.js:98`). Há 4 hex fora dos tokens (#34c759, #ffcc00, #ff3b30, #feca57). Raios de 0, 6, 8, 10, 12, 16 e 20 px. Terceiros convive com Fornecedores, e Partes com Partes Interessadas. |
| 5 | Prevenção de erros | 2 | Prazos legais parametrizados e a regra da LIA são bons. Mas "DPIA requerido" é um checkbox manual de 0,7rem, encerrar não pede confirmação e a lista de bases legais está incompleta. |
| 6 | Reconhecer em vez de lembrar | 1 | A navegação fica escondida. A LIA está atrás de um botão "Ligações" por linha do RoPA. Terceiros manda o usuário "importar na tela Partes", sem link. |
| 7 | Flexibilidade e eficiência | 2 | Tem importação por planilha e "Aceitar todos de confiança alta". Nas listas de RoPA, DPIA, pedidos e incidentes não há filtro por prazo nem busca. |
| 8 | Estética e minimalismo | 2 | É limpo, mas os estados vazios são ocos e as faixas de zeros se repetem em toda tela. Os números coloridos não carregam significado. |
| 9 | Recuperação de erros | 2 | Os toasts trazem a mensagem do servidor. A falha da visão do encarregado diz só "Tente de novo em instantes" (`encarregado.js:26`). |
| 10 | Ajuda e documentação | 2 | Há texto explicativo bom em Prazos legais (`titular.js:85`) e na Importação. Em RoPA, DPIA e Terceiros não há nada, e nenhum campo legal cita o artigo. |

**Total: 18/40.** É utilizável por quem já conhece o produto, mas não transmite confiança a um DPO na primeira sessão.

---

## 3. Carga cognitiva

Falhas no checklist: **5 de 8, carga alta.**

- **Hierarquia visual.** A entrada (`privacy-01-entrada.png`) dá o mesmo peso a um banner de cobertura, uma linha "Encarregado", 5 cards, um tile LGPD e só então "O que fazer". A lista de ação, que é a razão da tela, está no fim.
- **Escolhas mínimas.**
  - O header de Partes tem 5 controles em fila: seletor de organização, Importar do projeto, Conciliar responsáveis, + Departamento e + Nova parte (`privacy-partes.png`).
  - O modal de incidente tem até 6 botões no mesmo nível: Salvar avaliação, Registrei ANPD, Registrei titular, Encerrar, Rascunho ANPD e Rascunho titular (`titular.js:235-246`).
- **Memória de trabalho e troca de contexto.**
  - Terceiros depende de Partes.
  - Consentimento exige um RoPA prévio, e o aviso só aparece num toast depois do clique (`titular.js:288`).
  - A DPIA importada exige um RoPA "com a mesma finalidade" (`importacao.js:196`).
- **Revelação progressiva às avessas.** Os grupos do menu ficam recolhidos e os campos jurídicos críticos ficam no fim do formulário, em 0,7rem (`privacy.js:178-181`).
- **Navegação escondida.** São 5 rótulos mono de 9px em caixa alta (`style.css:213`) e nenhum item visível. "GOVERNANCA" chega a perder a cedilha nessa escala (capturas).

Pontos de decisão com mais de 4 opções:
- Header de Partes: 5.
- Modal de incidente: 6.
- Cadastro + Privacidade abertos juntos: 12 itens.

---

## 4. Jornada emocional do encarregado

1. **Entrada.** Ele abre o módulo e vê 5 zeros em verde e "Nada atrasado ou faltando. Os prazos legais e o catálogo de requisitos estão em dia." O mesmo quadro diz, dois blocos acima, "catálogo ainda não carregado" e "Encarregado: não indicado". **É o pior momento do produto: falsa tranquilidade numa ferramenta de prazo legal.** Um DPO experiente perde a confiança aqui. Um DPO inexperiente acredita, e isso é pior.
2. **Primeiro trabalho, o RoPA.** O formulário em inglês e sem acento passa a mensagem de que "isso não foi feito para mim". Transferência internacional e "DPIA requerido" são os dois campos com consequência legal real e estão no rodapé, em 0,7rem cinza.
3. **Pico de estresse, o incidente.** Ele precisa achar Incidentes como segunda aba de "Titular e incidentes", no grupo Privacidade recolhido. Ao registrar, não vê o prazo da ANPD antes de salvar: o prazo aparece num toast que some. No detalhe, o botão mais forte é "Encerrar incidente", não "Registrei a comunicação à ANPD". O momento de maior risco recebe o menor apoio.
4. **Fim.** Não há fechamento. Depois de comunicar, ele não vê "comunicado em DD/MM, dentro do prazo" como confirmação permanente no topo, só um selo dentro de um parágrafo do modal.

**Pela regra do pico e do fim:** o pico é o incidente, e hoje ele é morno e arriscado. O fim é inexistente. A reafirmação precisa estar no pico, com o prazo grande, em contagem e com a próxima ação.

---

## 5. O que funciona

1. **O domínio está certo no servidor e na cópia de titular e incidentes.** Prazo congelado, prazos legais parametrizados com fonte e data de revisão jurídica, "Falta (complete antes de enviar)" no rascunho para a ANPD, eliminação com justificativa e "A ação não se desfaz" (`titular.js:85,175,262-270`). Isso é diferencial real e deve ditar o tom do resto.
2. **A importação com revisão humana é bem desenhada.** Abas com `role=tablist`, coluna de Confiança, coluna "Faltando", situação ligada à tela de destino e "Confirmar importação (N)" desabilitado até haver aceitos (`importacao.js:145-264`). É a tela mais Operate do módulo.
3. **A casca respeita a marca.** `n.privacy` com o ponto em accent, header de 64px, tema escuro único, sem itálico e sem emoji. O seletor de projeto com a etiqueta `n.privacy` deixa claro em qual módulo o usuário está.

---

## 6. Problemas prioritários, os 5 maiores

1. **P0: a entrada declara "tudo em dia" num projeto vazio.**
   - A cópia vazia está em `encarregado.js:45`.
   - O verde nos zeros vem de `encarregado.js:14`, onde `cor()` devolve #34c759 quando q = 0.
   - O servidor não prioriza RoPA vazio nem catálogo não carregado (`src/services/encarregado.ts:93-112`).
2. **P0: a base legal no RoPA está incompleta e sem acento.**
   - São 6 das 10 hipóteses do art. 7 e nenhuma do art. 11, todas sem acento (`privacy.js:159-164,216`).
   - Para um DPO é erro de conteúdo jurídico, não polimento.
3. **P0: o detalhe do incidente destaca "Encerrar".**
   - `btn-primary` fica na mesma linha das comunicações e não há confirmação (`titular.js:241,283`).
   - O prazo da ANPD só aparece num toast depois de salvar (`titular.js:220`).
4. **P1: o ISO vaza para dentro do n.privacy.**
   - Governança fala de SGSI (`monitor.js:553,580`).
   - O assistente fala de "ISO 27001 ... audit preparation" (`ai.js:7,16,19`).
   - O menu mostra "Ativos" e "Partes Interessadas".
   - `vendors` (KYV/Trust Score) é alcançável sem guarda de produto (`router.js`).
5. **P1: a navegação está escondida e a IA do menu está quebrada.**
   - Os grupos nascem recolhidos e o grupo "Governança" tem um único item, também chamado "Governança".
   - "Inteligência" tem um único item, "AI Assistant".
   - A LIA não tem entrada própria.
   - Terceiros convive com Fornecedores, e Partes com Partes Interessadas.

---

## 7. Tabela por tela

Legenda de severidade: **P0** quebrado ou enganoso · **P1** prejudica a tarefa · **P2** polimento.

| Tela | Problema | Evidência | Correção concreta | Sev. |
|---|---|---|---|---|
| Casca: sidebar | Todos os grupos nascem recolhidos, o item ativo fica invisível e o DPO vê só 5 rótulos de 9px. | Todas as capturas `privacy-*.png`; `login.html:409` (`aria-expanded="false" class="sidebar-label collapsed"`); `style.css:213` (`font-size: 9px`) | Em `aplicarCasca` (`produto.js:~128`), para `produto==='privacy'`, expandir `#group-privacy` e o grupo que contém o item ativo (remover `collapsed`, `aria-expanded="true"`, `.expanded` no grupo). Subir `.sidebar-label` para 11px com `letter-spacing: 0.08em`: em 9px o "Ç" de GOVERNANÇA se perde. | P1 |
| Casca: sidebar | O grupo "Governança" tem um único item, também chamado "Governança", e "Inteligência" tem um único item, "AI Assistant". Rótulo igual ao item é ruído. | `produto.js:134-135` (renomeia `group-impl` para "Governança"; Jornada, Monitor e SoA saem por `SO_ISO`); `login.html:441-445` | No n.privacy, achatar os dois: mover `#nav-governance` para o fim do grupo Privacidade e `#nav-ai` para Sistema, ou para o topo como "Assistente", e esconder os rótulos `group-impl` e `group-intel` quando ficarem com 1 item. Trocar "AI Assistant" por "Assistente" em `login.html:445`. | P1 |
| Casca: sidebar | Em Cadastro aparecem "Partes Interessadas" e "Partes" lado a lado, além de "Ativos", que é conceito ISO. O DPO não sabe onde cadastrar o operador. | `login.html:347-369`; `produto.js:17-18` (`SO_ISO` não inclui `nav-stakeholders` nem `nav-assets`) | Incluir `nav-stakeholders` e `nav-assets` em `SO_ISO`. No n.privacy, Partes passa a ser o único cadastro de pessoas e organizações. | P1 |
| Casca: sidebar | A ordem do grupo Privacidade não segue o trabalho: Requisitos está entre DPIA e Terceiros, e Incidentes não tem item próprio. | `login.html:411-437` | Ordem: Encarregado · Titular e pedidos · Incidentes · RoPA · Bases legais e LIA · DPIA/RIPD · Terceiros · Requisitos · Importar programa. Criar `#nav-incidentes-privacy`, que abre `titular` com `S.titularAba='incidentes'`, no mesmo padrão de `abrirIncidentesIso`. | P1 |
| Casca: rodapé | Os links "n.360", "Conta e acessos (n.360)" e "Abrir este projeto no n.iso" aparecem sublinhados, com ~48px entre eles e com cara de link padrão do navegador. | Capturas, rodapé; `produto.js:163-164` (`el.className='sidebar-nav'` + `style.cssText` inline) | Criar a classe `.sidebar-crosslink` (13px, `color: var(--text-dim)`, sem sublinhado, `padding: 6px 20px`, hover `var(--text)`) e agrupar os links num `<div class="sidebar-crosslinks">` com `border-top: 1px solid var(--border)`. Remover o `style.cssText`. | P2 |
| Casca: header | Um "x" solto no canto superior direito, sobre o header, em todas as telas. É o fechar do painel de contexto colapsado. | Todas as capturas (x=1427, y=20); `login.html:505`; `style.css:287-289` (`.toggle-context` absoluto e `.context-panel` sem `position: relative`) | Adicionar `position: relative` a `.context-panel` e `.context-panel.collapsed .toggle-context { display: none; }`. | P1 |
| Casca: header | O selo do projeto tem 0,55rem (~9px) e `border-radius: 6px`. O seletor "ORGANIZAÇÃO" aparece vazio, só com o chevron. | `login.html:486`; capturas | Mover o selo para a classe `.header-project-badge` com 12px e `border-radius: 0` (o sistema é quadrado). Esconder `#org-seletor` quando há só uma organização ou nenhuma, em vez de mostrar um select vazio. | P2 |
| Casca: geral | Cores fora dos tokens para estado: #34c759, #ffcc00, #ff3b30, #feca57. | `encarregado.js:14,34,36,38`; `privacy.js:33-35,290-291,321`; `grc.js:500` | Trocar por `var(--success)`, `var(--warning)` e `var(--danger)`. Acrescentar ao `test/any-catraca`, ou a um teste irmão, uma catraca que reprove hex de cor em `views/*.js`. | P2 |
| Entrada (Encarregado) | O estado vazio diz "Nada atrasado ou faltando. Os prazos legais e o catálogo de requisitos estão em dia." enquanto a mesma tela mostra "catálogo ainda não carregado" e RoPA = 0. É falsa conformidade. | `privacy-01-entrada.png`; `encarregado.js:45`; `src/services/encarregado.ts:93-112` (não há prioridade para RoPA vazio nem para catálogo não carregado) | No servidor, adicionar `p('alta', tr.total ? 0 : 1, () => 'Nenhum tratamento no RoPA (LGPD, art. 37)', 'ropa')` e `p('media', secao.lgpd.carregada ? 0 : 1, () => 'Catálogo de requisitos LGPD não carregado', 'requisitos')`. No cliente, trocar o `emptyState` por "Nenhuma pendência calculada a partir do que está cadastrado." | P0 |
| Entrada (Encarregado) | Os zeros saem verdes (sucesso) num projeto sem dado. O verde afirma algo que o sistema não sabe. | `privacy-01-entrada.png`; `encarregado.js:14` (`cor()` devolve #34c759 com q = 0) | Com valor 0, usar `var(--text)`. Reservar `--danger` e `--warning` para q > 0 e não pintar o "bom" de verde. Nos stat cards de RoPA e DPIA, o mesmo: número em `var(--text)`, cor só quando há alerta. | P0 |
| Entrada (Encarregado) | A hierarquia está invertida: "O que fazer", a lista acionável, vem por último, abaixo de banner, linha, 5 cards e tile. O tile "LGPD —" repete o banner. | `privacy-01-entrada.png`; `encarregado.js:49` | Ordem nova: (1) a linha do encarregado como alerta quando não houver indicado; (2) a tabela "O que fazer"; (3) os cards. Remover o tile LGPD quando `!lg.carregada`, porque o banner do ponto de partida já diz isso. No banner, transformar "catálogo ainda não carregado" em link para `requisitos`. | P1 |
| Entrada (Encarregado) | O título "Encarregado" é ambíguo: é a tela sobre o encarregado ou do encarregado? "Encarregado: não indicado" aparece como texto corrido, com um link pequeno. | `encarregado.js:17,48` | Título "Painel do encarregado". Sem encarregado, renderizar um `.card` com borda esquerda `var(--danger)`: "Nenhum encarregado indicado. A LGPD exige a indicação (art. 41)." e o botão `btn btn-primary` "Indicar encarregado". | P1 |
| Entrada (Encarregado) | A subtext "0 atrasados · 0 vencem em 7 dias" quebra em duas linhas e o "dias" fica sozinho. "de 0 no RoPA" é críptico. | `privacy-01-entrada.png`; `encarregado.js:32,34` | Subtext curta: "0 atrasados, 0 em 7 dias". Trocar "de 0 no RoPA" por "de 0 tratamentos". | P2 |
| RoPA | A lista de bases legais tem 6 das 10 hipóteses do art. 7, nenhuma do art. 11 (dados sensíveis) e nenhuma com acento. | `privacy.js:159-164,216` | Lista completa com acento, agrupada em `<optgroup label="Art. 7 (dados pessoais)">` e `<optgroup label="Art. 11 (dados sensíveis)">`. Incluir as que faltam no art. 7: estudos por órgão de pesquisa, exercício regular de direitos, proteção do crédito e execução de políticas públicas. Gravar um código estável (`art7_ix`) e não o rótulo. | P0 |
| RoPA | Status em inglês: "Active/Inactive" na criação; "Draft/Under Review/Approved (reabrir: Revogar aprovação)" na edição. "Inactive" não está no `STATUS_DICT` e aparece cru na tabela. | `privacy.js:175-176,227-228`; `ui.js:134-170` | `<option value="Active">Ativo</option>` etc. (valor em inglês, rótulo em PT). Acrescentar `'inactive': 'Inativo'` ao `STATUS_DICT`. | P1 |
| RoPA | Faltam acentos em todo o formulário: "Retencao", "Destinatarios", "Transferencia Internacional". | `privacy.js:168,171,179`; `privacy.js:72-76` (DPIA: "sao", "nao", "Cartao") | Corrigir a cópia. Acrescentar ao teste de cópia uma lista de palavras proibidas sem acento (`Retencao`, `Execucao`, `Obrigacao`, `Protecao`, `Transferencia`, `Faca `). | P1 |
| RoPA | Transferência internacional e "DPIA requerido" ficam em checkboxes de 0,7rem cinza no rodapé do formulário. São os campos de maior consequência legal. Também não há marcação de dado sensível nem de criança/adolescente (art. 14). | `privacy.js:178-181` | Criar a seção "Riscos do tratamento" logo abaixo da base legal, com `.form-label` normal e 4 opções: "Dados sensíveis (art. 11)", "Crianças e adolescentes (art. 14)", "Transferência internacional (arts. 33-36)" e "Exige RIPD". A "Salvaguarda de transferência" só aparece quando a transferência estiver marcada. O placeholder "SCCs" vira "Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)". | P1 |
| RoPA | Transferência internacional > 0 fica vermelha (#ff3b30), como se fosse violação. | `privacy.js:35` | Usar `var(--text)` ou `--warning` só quando houver transferência sem salvaguarda. Trocar o rótulo "Transferências Int." por "Com transferência internacional". | P1 |
| RoPA | Há um botão "PDF" por linha que gera o relatório do projeto inteiro (`openROPAReport(proj.id)`). Não é da linha. | `privacy.js:50` | Remover da linha e deixar um único "Exportar RoPA (PDF)" no header, ao lado de "Importar planilha". | P2 |
| RoPA | O estado vazio "Nenhum registro ROPA cadastrado neste projeto." não ensina nada. A grafia oscila entre "ROPA" e "RoPA". O rótulo "Total de Processamentos" diverge de "tratamentos" no resto. | `privacy-ropa.png`; `privacy.js:9,32,54`; `login.html:417` | Padronizar "RoPA". Cópia do estado vazio: "O inventário de tratamentos (art. 37) está vazio. Registre a primeira atividade ou importe a planilha que o cliente já tem." com os dois botões. Card: "Tratamentos". | P1 |
| RoPA, LIA | A LIA só existe atrás do botão "Ligações" em cada linha. Não há contagem nem entrada no menu, embora "LIA pendente" seja prioridade alta. | `privacy.js:49`; `tratamento-ligacoes.js:42,97` | Acrescentar o card "Legítimo interesse sem LIA" à faixa do RoPA. Renomear "Ligações" para "Base legal e LIA" quando `legal_basis` for legítimo interesse. Avaliar um item de menu "Bases legais e LIA" que filtre o RoPA por base. | P1 |
| DPIA/RIPD | O título "DPIA / RIPD — Relatório de Impacto à Proteção de Dados" toma o header. O botão "+ Novo Relatório (DPIA)" usa Title Case e o termo estrangeiro. | `privacy-dpia.png`; `privacy.js:267,281` | Título "RIPD (DPIA)". Botão "Novo RIPD". O termo legal brasileiro vem primeiro (art. 5º, XVII). | P2 |
| DPIA/RIPD | Status em inglês nos selects ("Draft", "Under Review", "Approved (reabrir: ...)"). A subtext "Aguardando DPO / CISO" mistura vocabulário ISO. | `privacy.js:291,450-452` | Rótulos PT com valor EN. Subtext: "Aguardando o encarregado". | P1 |
| DPIA/RIPD | O título do modal de detalhe está em Montserrat 700 e accent. Accent em texto não interativo e peso fora do padrão. | `privacy.js:328-329`, também `:335` (h4 accent) | `font-weight: 600; color: var(--text)`; h4 em `var(--text-dim)`. | P2 |
| DPIA/RIPD | O estado vazio não diz quando o RIPD é exigido nem aponta os tratamentos que exigem e não têm. | `privacy-dpia.png`; `privacy.js:308` | "Nenhum RIPD. N tratamentos do RoPA estão marcados como 'Exige RIPD'." com link para o RoPA filtrado. Sem marcação: "Marque no RoPA os tratamentos de alto risco para saber onde o RIPD é exigido." | P1 |
| Titular e incidentes | Incidente, o fluxo de maior risco, fica escondido como 2ª aba de "Titular e incidentes" e sem contador. As abas não indicam atraso. | `privacy-titular.png`; `titular.js:18,54-55` | Mostrar a contagem nas abas: "Incidentes (2 · 1 atrasado)", com o número atrasado em `--danger`. Dar entrada própria no menu (ver sidebar). | P1 |
| Titular e incidentes | A aba ativa é `btn-primary` (fundo accent) e compete com o CTA "+ Registrar pedido", também accent cheio. As abas não usam `role="tab"`, ao contrário da importação. | `privacy-titular.png`; `titular.js:54-55` vs `importacao.js:145` | Extrair `renderAbas(abas, ativa, action)` para `ui.js`, com `role=tablist/tab` e `aria-selected`, aba ativa com sublinhado de 2px `var(--accent)` e texto `var(--text)`, sem preenchimento. Usar nas duas telas. | P1 |
| Titular e incidentes | Ao registrar o incidente, o prazo da ANPD não aparece antes de salvar. Depois de salvar, aparece num toast que some. A tela não volta para o incidente criado. | `titular.js:205-222` | Depois do POST, abrir direto `abrirIncidente(projectId, r.id)` em vez de `forceCloseModal()`. No topo do modal, uma faixa fixa: "Comunicar à ANPD até DD/MM (faltam N dias úteis)" em `--warning` ou `--danger`. | P0 |
| Titular e incidentes | No detalhe do incidente, "Encerrar incidente" é o único `btn-primary` e fica na fila das comunicações. Encerrar não pede confirmação e não bloqueia quando falta comunicar. | `titular.js:236-241,283` | "Encerrar" vira `btn btn-ghost` e vai para o fim do modal, com o painel de confirmação na própria janela (o padrão de `eliminarDadosDoTitular`, `titular.js:171-177`): "A ANPD ainda não foi comunicada. Encerrar mesmo assim?" quando `!comunicacao_anpd_em`. O primário passa a ser a próxima ação devida: "Registrei a comunicação à ANPD". | P0 |
| Titular e incidentes | O estado vazio de pedidos não avisa quando os prazos legais não estão cadastrados. Nesse caso, todo pedido novo nasce "Prazo não calculado". | `privacy-titular.png`; `titular.js:68,85` | Se houver prazo não definido, mostrar acima da tabela: "Prazos legais não cadastrados: novos pedidos ficarão sem prazo. Fale com o administrador." e um link para a aba Prazos legais. | P1 |
| Titular: consentimentos | "+ Registrar consentimento" sem tratamento no RoPA dá erro só no clique (toast). | `titular.js:286-288` | Desabilitar o botão com `title`, ou mostrar no estado vazio: "Consentimento é ligado a um tratamento. Cadastre o tratamento no RoPA primeiro." e um link. | P2 |
| Terceiros | O estado vazio manda o usuário para outra tela ("Importe os fornecedores na tela Partes") sem link, e o header não tem ação. É uma ponte de memória. | `privacy-terceiros.png`; `terceiros.js:53` | Botão no header "Cadastrar terceiro", que abre o modal de nova parte de Partes com `tipo=organizacao` já preenchido. No estado vazio, o link "Abrir Partes". | P1 |
| Fornecedores (vendors) | É uma tela ISO (KYV, Trust Score) alcançável dentro de /privacy. "0/100" em vermelho sem nenhum fornecedor afirma uma postura ruim que não existe. Duplica Terceiros com outro modelo de dados. | `privacy-vendors.png`; `grc.js:475,500`; `router.js:51` (sem guarda de produto); `produto.js:17` (`nav-vendors` em `SO_ISO`, só no menu) | No router, quando `produtoAtual()==='privacy'` e `S.view==='vendors'`, redirecionar para `terceiros`. Na própria tela, sem fornecedor, o card mostra "—" em `var(--text-dim)`. | P0 |
| Partes | O header tem 5 controles em fila e 3 deles são secundários com o mesmo peso. | `privacy-partes.png`; `partes.js:31` | Manter "+ Nova parte" (primário) e um menu "Mais" com Importar do projeto, Conciliar responsáveis e + Departamento. O "+ Departamento" pode ir para o cabeçalho da seção Departamentos. | P1 |
| Partes | O estado vazio diz "Importar do projeto ... governança e partes interessadas", vocabulário ISO no módulo LGPD. | `privacy-partes.png` | "Nenhuma pessoa ou organização. Cadastre o encarregado, os operadores e os fornecedores que tratam dados, ou traga quem já está no projeto." | P2 |
| Requisitos | Um select "Fonte" vazio aparece acima do estado vazio. "Carregar catálogo" é botão secundário mesmo sendo a única ação, e só o admin o vê. Para o consultor, a tela é um beco sem saída. | `privacy-requisitos.png`; `requisitos.js:28-36` | Sem fontes, não renderizar o `seletor`. Para o admin, botão `btn-primary` "Carregar catálogo LGPD/ANPD". Para os demais: "O catálogo é carregado pelo administrador da plataforma. Peça a ele para habilitar os requisitos da LGPD e da ANPD." | P1 |
| Importar programa | A ação primária "Novo lote" fica no corpo, não no header como nas outras telas. "Lote" é jargão. | `privacy-importacao.png`; `importacao.js:65,98` | `a.innerHTML` com `btn-primary` "Nova importação". Na lista: coluna "Importação" em vez de "lote". O parágrafo explicativo fica, porque é bom. | P2 |
| Importar programa | "Aceitar todos de confiança alta" tem o mesmo peso dos botões de linha e contradiz a promessa de "você revisa e confirma". | `importacao.js:150-152` | Manter, mas com a cópia "Aceitar os N de confiança alta (revise antes de confirmar)" e mostrar a contagem aceita em `Confirmar importação (N)` como resumo por aba. | P2 |
| Documentos | O estado vazio é aceitável, mas não diferencia o que a LGPD pede: política de privacidade, aviso, procedimento de atendimento ao titular, plano de resposta a incidente. | `privacy-documentos.png`; `documentos.js:56-63` | No n.privacy, o estado vazio lista os 4 documentos esperados como checklist (texto, não ícones), cada um com "Criar" ou "Importar". | P2 |
| Governança | Inteira em vocabulário ISO: "Quem responde pelo SGSI", "Líder do SGSI não designado", "Líder SGSI, CISO ou DPO". Os cards têm cantos arredondados, sendo o sistema quadrado (`--radius: 0`). | `privacy-governance.png`; `monitor.js:553,580`; `style.css:297` (`.card border-radius: 16px`) | Com `produtoAtual()==='privacy'`: intro "Quem responde pela privacidade deste cliente, por área." e âncora "Encarregado (DPO) não designado", com o botão para Indicar encarregado. Em `.card`, `.modal` e `.phase-item`, usar `border-radius: var(--radius)`. | P1 |
| Assistente (ai-chat) | Título e cópia em inglês e orientados a ISO: "AI Compliance Assistant", "Faca uma pergunta sobre ISO 27001, ... audit preparation", placeholder "controles ISO, audit...". Falta a cedilha. As bolhas têm 12px de raio. Não avisa que a conversa se perde ao sair nem que a resposta é rascunho. | `privacy-ai-chat.png`; `ai.js:7,16,19,34-35` | Título "Assistente". Com `produtoAtual()==='privacy'`: "Pergunte sobre LGPD, bases legais, prazos do titular ou comunicação de incidente." Abaixo do input, em `--text-dim` 12px: "A resposta é sugestão, não parecer jurídico. A conversa não fica salva." Bolhas com `border-radius: 0`. | P1 |
| Todas as listas | Os estados vazios usam o mesmo cartão tracejado com uma frase, sem ação e sem explicar a obrigação legal. | `ui.js:215-218`; todas as capturas | Estender `renderDataTable` com `options.emptyAction` (html do botão) e `options.emptyHint` (1 linha em `--text-dim`). Preencher com o artigo da LGPD correspondente em cada tela. | P1 |

---

## 7. Sinais de alerta por persona

- **DPO do cliente**:
  - Desconfia ao ver a base legal sem acento e incompleta.
  - Perde o prazo da ANPD porque o prazo só aparece num toast.
  - Acredita em "tudo em dia" com o projeto vazio.
- **Consultor de privacidade**:
  - Alterna entre Partes, Terceiros e Fornecedores sem saber qual é o canônico.
  - Procura a LIA e não acha.
  - Não carrega o catálogo de Requisitos e não sabe a quem pedir.

## 8. Perguntas provocativas

- Se o produto é para quem responde a prazo legal, por que a primeira tela não começa com a próxima data-limite?
- Incidente merece uma tela própria, com contagem regressiva, em vez de ser a 2ª aba de outra tela?
- O módulo precisa de "Ativos", "Governança/SGSI" e "Fornecedores" ou eles são herança do n.iso que ninguém tirou?
