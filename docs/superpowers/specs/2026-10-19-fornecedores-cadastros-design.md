# Fornecedores e menu Cadastros (n.privacy)

Etapa 3 do plano `docs/superpowers/plans/2026-10-18-versao-final.md`. Aprovado pelo dono em 19/10/2026. Sem capturas do legado:
a tela é montada só com campos que já existem e já são gravados. Sem migration.

## Menu do n.privacy

`SECOES_PRIVACY` (`frontend/src/produto.js`) ganha a seção **Cadastros**, entre Mapear e Avaliar:

- Mapear: Tratamentos (RoPA), Importar programa.
- Cadastros: Pessoas, áreas e sistemas (`nav-partes`), Fornecedores (`nav-terceiros`, rótulo novo em `ROTULOS_PRIVACY`),
  Titulares e dados pessoais (`nav-catalogos`, item novo em `login.html`, só no n.privacy: entra em `SO_PRIVACY`).

O n.iso e o n.360 não mudam (`frontend/test/casca-menu.test.js` fixa isso).

## Fornecedores: lista

Tela `terceiros` (mesma rota, mesmo item). Título "Fornecedores".

Colunas: Fornecedor, Criticidade (nível atual, ou "Não avaliada"), Tipo, Avaliação (situação), Vale até, DPA (Sim/Não),
Atividades (número). Filtros na própria tela (sem servidor): criticidade e situação. O que existe hoje continua: o aviso de
avaliações vencidas, o filtro vindo do painel, "Adicionar parte existente", "Cadastrar terceiro" (rótulo: "Cadastrar
fornecedor"), "Perguntas do questionário".

Servidor (`GET /projects/:id/terceiros`, `src/services/terceiros.ts`), campos novos em cada item:
- `nivel`: `nivel` da linha mais recente de `criticidades_terceiro`, ou `null`.
- `dpa`: existe `documento_partes` com `papel = 'dpa'` para a parte.
- `atividades`: número de tratamentos DISTINTOS, unindo `parte_vinculos` (`alvo_tipo = 'tratamento'`) e
  `tratamento_externo_parceiros`. O campo antigo `tratamentos` passa a ter esse mesmo valor (uma contagem só).

## Fornecedores: ficha

Página própria (`tela=terceiro`, `?parte=<id>&aba=<aba>`), no lugar do modal `abrirTerceiro`. Abas, na ordem:

1. **Cadastro**: nome, e-mail (de `partes`), tipo (select de hoje, `PUT .../tipo`). Nome e e-mail só leitura aqui; editar é em
   Pessoas, áreas e sistemas (link).
2. **Criticidade**: o formulário de hoje (`secaoCriticidade`) e o histórico com as 5 respostas de cada linha.
3. **Avaliações**: nova avaliação, histórico com a observação, homologação (quando o método é questionário).
4. **Segurança**: o perfil de `vendors` da parte (certificações ISO 27001/27701/SOC 2, MFA, criptografia, backup, plano de
   incidente, pentest, DPA assinado, links do trust center e do DPA, certificações anexas, observações), editável pelo
   `PUT /api/v1/vendors/:id` que já existe. Sem perfil (parte sem vínculo `terceiro`): "Sem perfil de segurança" e nada mais.
5. **Documentos**: DPA e contratos ligados, com a situação de cada documento; ligar e desligar como hoje.
6. **Atividades de tratamento**: a lista unida (as duas origens), cada uma com a origem ("Vínculo" ou "Compartilhamento
   externo") e link para a atividade.
7. **Suboperadores**: como hoje.

Servidor (`GET /projects/:id/terceiros/:parteId`), campos novos:
- `email` da parte.
- `seguranca`: a linha de `vendors` com `parte_id` igual, ou `null` (mesmas colunas que `GET .../vendors` devolve).
- `tratamentos_afetados`: a lista unida, cada item `{ id, finalidade, origem: 'vinculo' | 'compartilhamento_externo' }`
  (o mesmo tratamento pelas duas origens aparece uma vez, com `origem: 'vinculo'`).
- `GET .../criticidades` já devolve o histórico; cada linha passa a trazer as 5 respostas.

Regras que não mudam: o tipo define o método; a situação é derivada; o agente não confirma criticidade; isolamento por projeto.

## Titulares e dados pessoais

Tela nova `catalogos` (`frontend/src/views/catalogos.js`), sobre `/projects/:id/catalogos/:tipo` (já existe). Duas abas:
Titulares e Dados pessoais. Cada uma: lista (nome; no dado, o selo "Sensível"), busca, "Mostrar inativos", criar, renomear,
marcar sensível (só dado), inativar e reativar. 409 de nome repetido mostra o nome existente. Sistema vazio: estado vazio que
diz que os itens também nascem pelo "+" dentro da atividade.

## Testes

- Servidor (D1 real): lista com `nivel`, `dpa` e `atividades` sem duplicar o tratamento presente nas duas origens; ficha com
  `email`, `seguranca` (com e sem perfil) e a lista unida com a origem; histórico de criticidade com as respostas; outro
  projeto não vê nada (isolamento).
- Telas (jsdom): menu do n.privacy com a seção Cadastros e os três itens; lista com as colunas e os dois filtros; ficha com
  as 7 abas e a aba no endereço; Segurança salva pelo PUT; catálogos criar, renomear, inativar e o 409.
- E2E: lista → abrir fornecedor → aba Criticidade → confirmar → o nível aparece na lista.
