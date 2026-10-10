# n.iso e n.privacy: produtos distintos, cadastro só um — design

Data: 2026-10-10. Base: branch `feat/nprivacy-casca` (#332, casca por domínio e trava por produto).

## Problema

Para o usuário são dois produtos (`niso.ness.com.br`, `nprivacy.ness.com.br`). A operação, porém, usa os dados dos
dois lados: quem já fez o n.iso deveria abrir o n.privacy "meio implantado" e vice-versa. Hoje isso só é verdade
para o que já é núcleo (itens, RoPA, DPIA, documentos, evidências, partes, departamentos). O resto falha:

| Conceito | Hoje | Consequência |
|---|---|---|
| Controle ISO → requisito LGPD | catálogo LGPD vazio, nenhum mapeamento | trabalho da ISO cobre 0% da LGPD |
| Fornecedor × terceiro | `vendors` e `partes` separados; importação copia só o nome | cadastro em dobro |
| DPO × encarregado | DPO é `job_title` livre; a importação procura `role_category='dpo'`, que a tela nunca grava | o DPO nunca vira encarregado |
| Incidente | só no n.privacy; o n.iso não tem gestão de incidente (A.5.24–5.28) | n.iso sem incidente, CAPA sem origem |
| Titular | `data-subject` (busca/eliminação, sem tela) e `titular_pedidos` (protocolo e prazo) sem ligação | duas trilhas |
| Prontidão | readiness e gap-analysis só olham controles; o painel do encarregado só olha privacidade | ninguém vê o que o outro produto já entregou |
| UI | botões Ligações/Importar do RoPA, requisitos do documento: rota `privacy` exibida no n.iso → 403 | erro em projeto só n.iso |

Treinamento já aparece nos dois menus (`nav-training` não está em `SO_ISO` nem em `SO_PRIVACY`); entra só no painel.

## Decisões do dono (10/10/2026)

1. "Meio implantado" = **um cadastro só, mais um painel de ponto de partida**. Nada é copiado entre produtos.
2. Catálogo: **LGPD e resoluções da ANPD juntas**, geradas a partir do texto oficial. O mapeamento requisito ↔
   controle ISO é gerado como **`proposto`**; o cálculo de cobertura só conta `validado_juridico`, então a palavra
   final continua humana (tela de validação para `platform_admin`).
3. Abordagem 1: o núcleo absorve o conceito duplicado; cada produto mostra sua visão.

## Desenho

### A. Correções de UI (o que dá 403 hoje)
- `views/privacy.js`: "Importar planilha" e "Ligações" só quando `temProduto(proj, 'privacy')`.
- `views/documentos.js`: seção "Requisitos" do documento só quando o projeto tem `privacy`.
- `views/compliance.js`: no upload, "Controle ISO" só quando o projeto tem `iso`; nova janela "Requisitos e
  validade" da evidência (rotas já existem: GET/PUT `evidence/:id/requisitos`, PUT `evidence/:id/validade`), botão por
  linha quando o projeto tem `privacy`.
- Aviso do sino: se a tela de destino é exclusiva do outro produto (`SO_ISO`/`SO_PRIVACY`), leva ao domínio dele.
- `views/requisitos.js`: origem `evidencia` rotulada certo; tira o texto "Evidência ainda não entra na conta".

### B. Catálogo LGPD + ANPD com mapeamento proposto
- `src/data/lgpd.ts`: artigos da Lei 13.709/2018 que impõem dever ao agente de tratamento (arts. 6–51, exceto os que
  só tratam da ANPD/sanções). Ids no padrão já usado pelo código e pelos testes: `lgpd:art7`, filho `lgpd:art7:ix`,
  referência `art. 7, IX`. Filhos para os incisos dos arts. 7, 11 e 18 (bases legais e direitos).
  Títulos em palavras próprias (texto de lei é domínio público, mas título curto é rótulo de trabalho).
  Fonte e data da versão compilada registradas em `requisito_fontes.versao`.
- `src/data/anpd.ts`: nova fonte `anpd`, resoluções CD/ANPD vigentes com dever ao agente: 2/2022 (pequeno porte),
  15/2024 (comunicação de incidente), 18/2024 (encarregado), 19/2024 (transferência internacional). Ids
  `anpd:res15-2024` (pai) e `anpd:res15-2024:art6`.
- `src/data/mapeamento-privacidade-iso.ts`: pares `{ de: requisito ISO, para: requisito LGPD/ANPD, tipo }`, gravados
  com `INSERT OR IGNORE` e `estado='proposto'`. Ressemear nunca rebaixa um mapeamento já validado.
- `semearCatalogo` passa a semear as três coisas. O botão do admin vira "Carregar catálogo".
- Tela de validação: na janela "Abrir" do requisito, o `platform_admin` vê cada mapeamento com "Validar" (PUT
  `/requisitos/mapeamentos`, `estado='validado_juridico'`, `validado_por` = nome do usuário, `validado_em` = hoje) e
  "Recusar" (DELETE). Filtro "Só com mapeamento a validar" na lista.

### C. Fornecedor = terceiro
- `vendors` vira o **perfil de segurança** (due diligence ISO) de uma parte organização: coluna `parte_id`
  (`UNIQUE`, `ON DELETE CASCADE`). Migration 0061 cria a parte que falta (por nome normalizado), liga a
  `vendors.parte_id` e grava o vínculo `terceiro` no projeto.
- Gatilho `vendor_perfil_do_terceiro`: vínculo `terceiro` no projeto cria o perfil se não houver. Gatilho
  `vendor_nome_da_parte`: renomear a parte renomeia o perfil.
- `POST /vendors` cria (ou reaproveita) a parte e o vínculo; o perfil nasce pelo gatilho e recebe os campos.
  `PUT /vendors/:id` renomeia a parte. `DELETE /vendors/:id` apaga o perfil e o vínculo `terceiro`, sem apagar a
  parte (ela pode ter tratamento, avaliação, DPA).
- n.privacy: `definirTipo` (classificar terceiro) grava o vínculo `terceiro` → o terceiro aparece em Fornecedores.
- `importarPartes` deixa de ler `vendors` (a migration e o gatilho já fazem a ponte).

### D. DPO = encarregado
- Fonte única: vínculo `encarregado` no projeto. Regra de reconhecimento do DPO no n.iso: `job_title` casa
  `/\b(dpo|encarregad[oa])\b/i` ou `role_category='dpo'`.
- `POST /governance` com DPO → garante a parte pessoa (por e-mail, senão nome) e o vínculo `encarregado`.
  Migration 0062 faz o mesmo para os membros já cadastrados.
- `importarPartes` usa a mesma regra.
- Visão do encarregado devolve `encarregados: [{ id, nome, email }]` e prioridade alta "Nenhum encarregado
  indicado" (LGPD art. 41) quando vazio. Tela ganha "Indicar encarregado" (parte pessoa → `POST
  /partes/:id/vinculos`).

### E. Incidente no núcleo
- Faixa de `incidentes` passa de `privacy` para `nucleo`: o fato é um só; a comunicação à ANPD vale por lei seja qual
  for o produto contratado.
- n.iso ganha o item de menu "Incidentes" (`nav-incidentes`, só n.iso), que mostra a mesma seção de incidentes de
  `views/titular.js` sem a parte de pedidos.
- `corrective_actions.incidente_id` (migration 0063, `ON DELETE SET NULL`); `refForaDoProjeto` aceita o campo; botão
  "Abrir CAPA" no incidente quando o projeto tem `iso`.

### F. Titular numa trilha só
- `POST /data-subject/erase` aceita `pedido_id` opcional (do mesmo projeto); a trilha registra o protocolo.
- Na janela do pedido do titular: "Localizar dados" (GET `data-subject?identificador=` com o contato) e, para pedido de
  eliminação, "Eliminar dados" com justificativa pré-preenchida com o protocolo.

### G. Painel "ponto de partida"
- `GET /projects/:id/ponto-de-partida` (faixa `nucleo`) devolve:
  - `cadastro`: contagens do que é compartilhado (tratamentos, DPIAs, documentos vigentes, evidências válidas, itens,
    terceiros, encarregado indicado, incidentes, treinamentos concluídos);
  - `cobertura`: resumo de `lacunasDaFonte` para `lgpd` e `anpd`;
  - `iso_ajudados`: requisitos ISO com mapeamento validado para um requisito LGPD/ANPD já coberto por documento ou
    evidência (o que a privacidade já adianta para a ISO).
- Cartão no topo do Dashboard (n.iso) e da tela Encarregado (n.privacy). No n.iso destaca `iso_ajudados`; no n.privacy,
  a cobertura LGPD/ANPD.

## Fora do escopo
Login único entre domínios; unificar trust_score com avaliação de terceiro (continuam métodos diferentes sobre a mesma
parte); portal público do titular; texto normativo da ISO (licenciado).

## Testes
Cada parte com teste de backend contra o D1 real e, quando há tela, teste jsdom. Migrations com teste de dados
legados (vendor sem parte, DPO cadastrado antes). Toda rota nova classificada em faixa (`modulos-produto.test.ts`).
