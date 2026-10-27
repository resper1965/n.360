# Paridade entre migrations e schema, e dois acertos da mescla

Data: 2026-10-27. Origem: revisão de segurança das PRs #512 a #515 (achados 1, 2 e 3). Classificação: limitada (testes e uma correção de serviço, sem tela e sem migration).

## Problema

1. **A migration 0087 perdeu um gatilho de isolamento e nenhum teste percebeu.** Ela refez `tratamento_etapa_itens` (DROP + RENAME) e o DROP apagou o gatilho `etapa_itens_do_projeto_ins`. O `schema.sql` ainda tinha o gatilho, e a suíte monta o banco pelo `schema.sql` (`test/helpers/d1.ts`), então ficou verde enquanto a produção ficou sem a trava. Foi corrigida pela 0088 (#516), mas a classe de erro continua aberta: qualquer migration futura que refaça uma tabela pode repetir isso.
2. **Mesclar copia o e-mail do duplicado para o encarregado (DPO).** Quando o cadastro que fica é o encarregado e não tem e-mail, o `COALESCE(email, <e-mail do duplicado>)` grava nele o e-mail do duplicado. O `PUT /partes/:id` recusa essa troca (403, `RECUSA_LINHA_DE_ASSINATURA`); a mescla a faz sem a trava e sem sincronizar a governança.
3. **Mesclar não recalcula o índice de confiança do fornecedor.** A mescla move `documento_partes`, `documentos_arquivo_partes` e o perfil `vendors` para o cadastro que fica, mas não chama `recalcularIndice`. `trust_score` e `diligence_level` ficam velhos (por exemplo, "sem DPA" quando agora há DPA) até a próxima edição.

## Decisões e o que foi descartado

- **Não dá para aplicar todas as migrations num banco vazio e comparar com o `schema.sql`.** Medido em 2026-10-27: das 86 migrations, 42 falham num D1 vazio (não existe a 0001; a base anterior nunca foi versionada, e a 0002 em diante assume tabelas que existiam). Por isso a verificação é **estática**, sobre o texto das migrations, mais uma conferência de colunas num D1 montado pelo `schema.sql`.
- **Regra R1 (a que teria pegado a 0087):** toda tabela refeita por uma migration (`DROP TABLE t` e `RENAME TO t` na mesma migration) precisa ter cada índice e cada gatilho que o `schema.sql` define sobre `t` recriado por uma migration de número maior ou igual. Validada por mutação: sem a 0088, a regra acusa exatamente a 0087. No histórico atual (13 tabelas refeitas, 147 objetos), não acusa nada.
- **Regra R2:** toda coluna criada por `ALTER TABLE t ADD COLUMN c` numa migration existe no `schema.sql` (conferida por `PRAGMA table_info` num D1 real, não por leitura do texto do `CREATE TABLE`: o leitor de texto deu 165 falsos positivos). No histórico atual acusa 6 casos, todos na tabela `assets`, que a 0048 renomeou para `itens`: exceção explícita, com o motivo.
- **Mesclar e o e-mail do encarregado:** não bloqueia a mescla (o consultor continua podendo juntar os dois cadastros). Quando o cadastro que fica é o encarregado, o e-mail do duplicado **não é copiado**, e a prévia avisa. Mexer na linha de assinatura segue sendo ato da interface.
- **Fora de escopo, de propósito:** aplicar todas as migrations em sequência (inviável, acima); reescrever as migrations antigas; decidir se documento em arquivo vencido deixa de valer como DPA (é regra de negócio do dono).

## Comportamento

### Teste `test/migrations-consistencia.test.ts`
- As regras vivem em funções puras (`test/helpers/migrations-lint.ts`), que recebem o texto das migrations e do schema. Assim o teste prova que a regra **falha no caso ruim** (uma migration sintética que refaz a tabela sem recriar o gatilho) e **passa no caso bom**, além de rodar sobre o repositório de verdade.
- R1 sobre `migrations/*.sql` e `schema.sql`. R2 sobre `migrations/*.sql` e um D1 montado por `applySchema()`.
- Falha com mensagem que nomeia a migration, a tabela e o objeto perdido, e diz o que fazer ("recrie o gatilho na própria migration ou numa seguinte").
- Exceções vivem numa lista no próprio helper, cada uma com o motivo (`assets`: virou `itens` na 0048). Exceção nova exige motivo escrito.

### Mescla de partes (`src/services/mesclar.ts`)
- O e-mail do duplicado só passa para o cadastro que fica quando este **não é encarregado** (`parte_vinculos.papel = 'encarregado'`). Sendo encarregado, o e-mail dele fica como está e a prévia (e o resultado) traz o aviso: "O e-mail do duplicado não foi copiado: o cadastro que fica é o encarregado, e a linha de assinatura é alterada pela interface."
- Depois do `db.batch`, a mescla de partes chama `recalcularIndice(db, manterId)`. Sem perfil de fornecedor, a função já não faz nada.

## Testes
- Lint (puro): caso ruim falha com a mensagem esperada; caso bom passa; objeto recriado por migration posterior passa; exceção listada passa.
- Repositório real: R1 e R2 passam hoje; mutação manual (sem a 0088) acusa a 0087 (registrada no plano como verificação, não como teste permanente).
- Mescla: e-mail copiado quando o que fica não é encarregado (regressão do comportamento atual); não copiado quando é encarregado, com o aviso na prévia; `trust_score` do cadastro que fica sobe depois de receber o DPA do duplicado.

## Riscos
- A regra R1 é estática e pode errar por falsa negativa se uma migration refizer a tabela por outro padrão (por exemplo, `CREATE TABLE ... AS SELECT`). Aceito: cobre o padrão usado em todas as 13 reconstruções do histórico, e o README de migrations passa a registrar a regra.
- Uma migration futura legítima que remova de propósito um índice ou gatilho precisa atualizar o `schema.sql` na mesma PR (já é a regra "muda em dois lugares"); a R1 só olha o que o `schema.sql` ainda define.
