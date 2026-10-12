# Assessment A - Design Review - n.iso (/iso)

Escopo: 29 telas do shell /iso (screenshots 1440x900, dados mockados e quase vazios). Vistas diretamente: entrada, dashboard, projects, project-detail, controls, soa, risks, evidence, audits, certification, metrics, monitor, leads, config-comercial, ai-chat. As demais seguem o mesmo molde (header + faixa de stat cards + caixa vazia) e foram inferidas. Modo: Operate. Detector nao executado.
Codigo:  (views/*.js, style.css).

## Veredito de especificidade

Meio-termo. A casca (sidebar escura, marca n.iso, tokens ness., Montserrat/Inter, eyebrows mono) tem identidade e e coerente. O conteudo das telas e de template: faixa de 3-5 stat cards centralizados, depois caixa tracejada "Nenhum X cadastrado". Trocando os rotulos serve a qualquer SaaS B2B. So Riscos (matriz 5x5) e Jornada (fases ISO com progresso) parecem feitas para GRC. Nada nas telas usa a estrutura da propria norma (clausulas 4-10, 93 controles do Anexo A, prazo de certificacao, proxima auditoria) como ancora visual. Oportunidade clara.

## Nielsen (0-4)

| # | Heuristica | Nota | Problema principal |
|---|---|---|---|
| 1 | Status do sistema | 2 | Erro JS cru em Leads ("Cannot read properties of undefined (reading 'de')"); config-comercial quebra e a tela fica com o conteudo de Propostas; SoA vazia sem estado nenhum |
| 2 | Correspondencia com o mundo real | 3 | Linguagem ISO correta. Mistura de ingles: "Statement of Applicability", "AI Compliance Assistant", "Upload Evidencia", "Burnup de Gaps", "Leads", "Assessments", "tracker" |
| 3 | Controle e liberdade | 3 | "Voltar" no project-detail. "X" solto no canto superior direito de todas as telas, sem rotulo |
| 4 | Consistencia e padroes | 2 | 4 padroes de estado vazio; dashboard usa blur/gradiente/raio 12-6-4 num sistema declarado quadrado e sem blur; rodape da sidebar com links nao estilizados |
| 5 | Prevencao de erro | 3 | Validacao 1-365 dias no link do auditor. Select de organizacao vazio no header |
| 6 | Reconhecimento | 3 | Menu agrupado, projeto atual visivel. Nome do projeto truncado "Adequacao ..." na sidebar |
| 7 | Flexibilidade | 3 | SoA tem atalhos j/k/x/a/enter/esc (raro e bom); ausentes nas demais listas |
| 8 | Estetica e minimalismo | 2 | Stat cards de zero ocupam 120px para dizer "0"; cor semantica em contagem neutra; banner do dashboard grande demais |
| 9 | Recuperacao de erro | 1 | Mensagem de excecao crua como texto de erro; sem "tentar de novo"; crash derruba a tela |
| 10 | Ajuda e documentacao | 2 | Controles, Certificacao e Metricas explicam o proximo passo; Monitor, Evidencias, Auditorias e SoA nao |
| **Total** | | **24/40** | **Aceitavel: precisa de correcoes antes de cliente ver** |

## Carga cognitiva

3 falhas de 8 (moderada).
- Hierarquia visual (falha): no dashboard banner, KPIs, cartao de conformidade e listas pesam igual.
- Escolhas minimas (falha leve): SoA tem busca + 5 filtros + 2 botoes de topo + linha de atalhos; dashboard tem 4 CTAs no header (Novo Lead, Monitor, organizacao, sino).
- Memoria de trabalho (falha): o grupo "Comercial" abre por padrao com 5 itens e empurra Implementacao/Operacional para fora do foco; o consultor de implementacao precisa abrir cada grupo para achar seu trabalho.
- Divulgacao progressiva: boa (grupos recolhiveis, `<details>` de custos em config comercial).

## Pontos fortes

1. Matriz de riscos 5x5 (iso-risks.png): ancora visual do dominio, legenda por faixa de score, cores com significado.
2. Cartao "Acesso do auditor externo" (iso-audits.png): diz o que o link da, a quem, por quanto tempo e como revogar. E o padrao de copy que todo estado vazio deveria seguir.
3. Shell consistente: header de 64px, badge do projeto, eyebrows mono, barra de accent no item ativo. Reconhecivel como ness.

## Tabela por tela

Screenshots: iso-<tela>.png em ...\scratchpad\shots.

| Tela | Problema | Evidencia | Correcao concreta | Sev. |
|---|---|---|---|---|
| config-comercial | Crash: `cfg.preco` chega undefined e `trio('diaria', ..., p.diaria)` estoura em `obj[n]`. A tela mostra o conteudo de Propostas ("Nenhuma proposta ainda") sob o titulo errado, sem aviso | iso-config-comercial.png; views/config-comercial.js:75 (`const p = cfg.preco`), :113 | `const p = cfg.preco ?? PRECO_PADRAO` (idem `cfg.textos`). No catch de quem chama, limpar `c.innerHTML` e mostrar bloco de erro com "Tentar novamente"; nunca deixar HTML da view anterior sobreviver a uma falha | P0 |
| leads | Erro tecnico cru em vermelho no cartao Funil: "Cannot read properties of undefined (reading 'de')". Resposta sem `periodo` quebra | iso-leads.png; views/commercial.js:78 (`f.periodo.de`), :100 (`erro.textContent = e.message`) | `f.periodo?.de ?? ''`; trocar `e.message` por "Nao foi possivel carregar o funil." + botao "Tentar novamente". Detalhe tecnico so no console | P0 |
| todas | "X" solto no canto superior direito acima do sino, sem rotulo nem funcao aparente | todos iso-*.png, ~x1427,y19 | Identificar a origem (botao fechar do shell/embed). Se sai do modulo: rotulo e aria-label ("Voltar ao n.360"). Se sobra: remover | P1 |
| todas (header) | Select "ORGANIZACAO" vazio: caixa escura com so a seta | todos iso-*.png, ~x1330,y32 | Mostrar o nome da organizacao; se so ha uma, texto estatico; se vazio, `disabled` com "Sem organizacao" | P1 |
| todas (sidebar) | Rodape: "n.360", "Conta e acessos (n.360)", "Abrir este projeto no n.privacy" como link padrao do navegador (azul sublinhado), fora do sistema; o ultimo quebra em 2 linhas | iso-dashboard.png y~770-880 | Usar a mesma classe dos itens do menu, sem sublinhado, sob um eyebrow "PLATAFORMA"; "Abrir no n.privacy" em uma linha | P1 |
| dashboard | Cartao "Burnup de Gaps" viola o sistema: `backdrop-filter: blur(24px)`, `linear-gradient(90deg, accent, #34c759)` na barra, raio 12/6/4, rgba fixo, badge com fundo accent a 15%. AGENTS.md: sem blur, sem gradiente, quadrado, accent nao e fundo de area. O nome promete serie temporal e a tela entrega uma barra unica | iso-dashboard.png; views/dashboard.js:142-148 | Usar `.card` padrao (sem style inline), barra `background: var(--accent)`, badge via `renderStatusBadge('info', ...)`. Renomear "Progresso de implementacao dos controles"; so chamar de burnup quando houver historico | P1 |
| dashboard | Banner de aviso grande (corpo ~18px azul) "Nenhum controle ISO adiantado pela privacidade ainda..." pesa mais que os KPIs e fala de cruzamento com privacidade que o usuario do n.iso nao pediu | iso-dashboard.png y~96-157 | Nota de uma linha, 14px `--text-2`, dentro do cartao de conformidade, com acao "Carregar catalogo de controles" | P2 |
| dashboard, projects, evidence | Stat cards com cor semantica fixa mesmo sem sinal: "Levantamentos 0" amarelo, "Projetos em andamento 1" verde, "Concluidos 0" amarelo, "Avaliadas 0" amarelo. Cor sem significado ensina a ignorar cor | iso-dashboard.png, iso-projects.png, iso-evidence.png | Numero em `--text`; cor so quando cruza limiar (vencido, falha, bloqueio) | P2 |
| entrada | Sem projeto selecionado ("Selecione um projeto" na sidebar) cai direto no Dashboard Executivo; nada diz qual e o primeiro passo | iso-01-entrada.png | Com projeto nao selecionado, destacar "Projetos Ativos" no topo com acao "Abrir" e ocultar KPIs que dependem de projeto | P2 |
| controls | Estado vazio: botao "Carregar catalogo" colado na frase (sem margem), conteudo flutuando no topo, resto da tela vazio. "Diagnostico de prontidao" no header compete com o CTA real | iso-controls.png; views/compliance.js | Estado vazio padrao (linha abaixo): titulo, 1 frase, botao 16-24px abaixo, em bloco com padding. Ocultar "Diagnostico de prontidao" ate haver controles | P1 |
| estados vazios (controls, metrics, certification, monitor, ai-chat, soa, evidence, audits, leads, dashboard) | Quatro padroes: (a) titulo + frase sem botao no corpo (metrics, certification); (b) caixa tracejada com uma frase sem CTA (evidence, audits, leads, dashboard); (c) so um titulo, sem explicacao (monitor); (d) nenhum estado (soa). Evidencias mostra "Arquivos no repositorio R2" (detalhe de infra no rotulo) | iso-metrics, iso-monitor, iso-evidence, iso-soa.png | `renderEmptyState({titulo, texto, cta})` em ui.js e usar em todas. Texto no formato do cartao do auditor: o que e, por que importa, proximo passo. Trocar "repositorio R2" por "Arquivos enviados" | P1 |
| soa | Area abaixo dos filtros totalmente vazia; card "0 / 1 Justificativas de exclusao - Conforme" (verde) sem haver controles, contraditorio; linha de atalhos em mono ~10px sem contraste | iso-soa.png; views/compliance.js:643 | Estado vazio com "Carregar catalogo" e ocultar busca/filtros/atalhos; "Conforme" so quando ha exclusoes; atalhos 12px `--text-dim` atras de um "?" | P1 |
| project-detail | Botao com emoji "📖 Gerar Dossie da Jornada" (proibido) e style inline (`font-weight:600`, borda accent) fora de `.btn`. "0 de 0 Fases Concluidas" e "0/0 Fases" repetido em todas as jornadas, filtros sobre lista vazia | iso-project-detail.png; views/project.js:468 | Remover emoji, usar `.btn`. Com 0 fases, trocar os contadores por "Fases ainda nao carregadas" + acao; ocultar filtros | P1 |
| project-detail | Titulo "Jornada" sem cliente (so o badge "Adequacao 2026"). "Notas do Auditor" e "Voltar" com o mesmo peso de botao | iso-project-detail.png | Titulo "Jornada - <cliente>"; "Voltar" como link ao lado do titulo | P2 |
| monitor | Estado vazio "Nenhum projeto ativo para monitorar." enquanto o dashboard mostra 1 projeto ativo: contradiz outra tela e nao explica o criterio | iso-monitor.png vs iso-dashboard.png | Conferir o filtro; se correto, explicar: "Projetos com ao menos uma fase iniciada aparecem aqui" | P1 |
| projects | Linha da tabela com 3 acoes em 3 estilos (primario cheio, secundario cheio, link azul); "Produtos (n.iso, n.privacy)" ambiguo. A tela nao tem item de menu visivel | iso-projects.png | 1 acao primaria "Abrir jornada"; demais como links do mesmo estilo. Renomear para "Ver produtos contratados". Incluir "Projetos" no menu | P2 |
| risks | Matriz otima, mas com 0 riscos mostra "Exportar Riscos" e "Score medio 0.0" em 36px; celulas com contorno de baixo contraste | iso-risks.png | Ocultar exportar quando total=0; score "-" quando vazio; contorno de celula mais claro | P2 |
| audits, audit-execution, audit-trail | Dois assuntos numa tela (calendario e acesso do auditor externo); titulo "Calendario" sem calendario; KPI "Total de achados - Gaps mapeados" mistura achado e gap | iso-audits.png | "Auditorias" como titulo; separar "Acesso do auditor externo" em secao com eyebrow proprio; KPI "Achados abertos" | P2 |
| certification | "Iniciar Tracker" no header repete a instrucao do estado vazio apontando para cima; "tracker" e anglicismo | iso-certification.png | CTA no centro do vazio: "Iniciar acompanhamento de certificacao"; sair do header ate existir um | P2 |
| ai-chat | Titulo em ingles, texto vazio fraco e misto ("audit preparation"), sem exemplos nem aviso de rascunho de IA | iso-ai-chat.png; views/ai.js:7 | "Assistente de conformidade"; 3 perguntas sugeridas clicaveis; nota "Resposta gerada por IA: revise antes de usar" | P2 |
| leads, assessments, proposals, catalogo | Vocabulario inconsistente: "Leads", "Assessments" no menu vs "Levantamentos" no dashboard e "Oportunidades" no KPI. KPI "Total de oportunidades" quebra em 2 linhas e desalinha os 5 cards | iso-leads.png, iso-dashboard.png | Um termo por conceito (Oportunidades, Levantamentos, Propostas); labels de KPI de uma linha | P2 |
| metrics, training, context, stakeholders, acknowledgments, capa, management-review, documentos, policies-dashboard, assets | Mesmo molde generico, sem conteudo da norma: management-review deveria listar as entradas de 9.3, context as partes interessadas de 4.2, metrics os criterios de 9.1. Vazio sem proximo passo (inferido do molde; amostra iso-metrics.png) | iso-metrics.png | Trocar o vazio por checklist da clausula correspondente com acao "Registrar": o vazio vira guia de implementacao | P2 |
| todas (CSS) | Estilo vive no JS: contagem de `style="` em views: grc 315, monitor 288, compliance 248, project 182, privacy 96. E a causa de dashboard e project-detail divergirem do sistema | views/*.js | Extrair `.card`, `.kpi`, `.btn-inline-action`, `.empty` e substituir; sem isso a correcao visual regride | P2 |

## Observacoes menores
- Badge "Adequacao 2026" repetido em todo header, enquanto a sidebar ja mostra o projeto.
- Eyebrows mono de ~10px (cabecalhos de tabela, grupos de menu): legibilidade no limite; conferir contraste.
- Vazio com borda tracejada vs caixa cheia com borda solida (config-comercial): dois idiomas para a mesma coisa.

## Perguntas
- O que o consultor precisa ver ao abrir o n.iso numa segunda de manha? Hoje e uma fila de zeros.
- A Jornada (fases ISO) nao e a verdadeira home, no lugar do Dashboard Executivo?
- Se cada clausula 4-10 fosse um bloco de navegacao com estado proprio, os 6 grupos do menu ainda seriam necessarios?
