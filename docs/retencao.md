# Política de retenção

> Item 4.5 do [`enterprise-grade-plan.md`](arquivo/enterprise-grade-plan.md). O que é apagado, quando, e — mais
> importante para uma auditoria — **o que não é, e por quê**.

A política não vive só aqui. O que o cron de fato executa está em `manutencaoDiaria` (`src/manutencao.ts`), em três
lugares: a tabela `RETENCAO` (`notifications` e `avisos_prazo`), as constantes `PURGA_RATE_LIMIT_SEG` e `MAIOR_JANELA_SEG`
(`rate_limits`) e `CARENCIA_TOKEN_AUDITOR_DIAS` (`auditor_tokens`), e o prazo escrito na própria consulta (as purgas do
n.ot, abaixo). Este documento explica cada prazo. Nada no código o compara com este texto: quem muda um prazo lá muda a
linha aqui, e vice-versa.

## O que é apagado automaticamente

| Tabela | Prazo | Por quê |
| :--- | ---: | :--- |
| `notifications` | 180 dias | Aviso de interface. Perde utilidade em dias; guardar por anos é acúmulo sem uso. |
| `avisos_prazo` | 400 dias | Registro de idempotência dos avisos de prazo (quem já foi avisado de quê). Depois de um ciclo anual não evita mais nada: o atraso é por semana e o vencimento faz parte da chave. |
| `rate_limits` | 7 dias após a janela fechar | Contador operacional. A margem existe para a purga **nunca** alcançar janela aberta: apagar a linha de quem está sendo limitado zeraria o contador, transformando limpeza em bypass. |
| `auditor_tokens` vencidos | 90 dias após o vencimento | Credencial de acesso externo a dado de cliente. Token vencido já não autentica nada; some por retenção, não por segurança. A carência cobre o ciclo de uma auditoria — investigar um acesso do mês passado exige que a linha ainda exista. |

### n.ot (modelo de ameaças P0-3)

Estas purgas estão em `manutencaoDiaria` (`src/manutencao.ts`), com o prazo escrito na própria consulta, **fora** da
tabela `RETENCAO`. Quem mudar um prazo aqui muda a consulta lá, e vice-versa.

| Tabela | Prazo | Por quê |
| :--- | ---: | :--- |
| `ot_lotes` não concluído (e os itens, pela FK) | 7 dias | Lote de coleta carrega IP/MAC cifrados; o que não foi aprovado não fica. |
| `ot_achados` descartado | 30 dias (90 com `chave_sensor`) | O filtro de novidade da sonda depende do achado descartado por 90 dias. |
| `ot_achados` rascunho de levantamento encerrado | 30 dias após o encerramento | Rascunho de levantamento aberto não expira: é trabalho em andamento. |
| `ot_achados` `enviado` sem lote válido | volta a rascunho em 1 dia | Envio interrompido ou lote rejeitado/apagado: sem isto o achado ficaria órfão para sempre; depois segue a regra de 30 dias. |
| `ot_achados` `enviado` de item recusado ou descartado no lote | volta a rascunho na manutenção seguinte | Rede de segurança: a recusa já devolve o achado na hora (`devolverRecusados`); a manutenção pega o que escapou, como lote vencido. |
| `ot_sensor_envios` | 400 dias | Registro dos envios do sensor de rede. |
| `ot_fluxos_pendentes` | 90 dias | Fluxo do sensor cuja ponta interna não apareceu no inventário (só hash), descartado para não ficar para sempre. |

## O que NÃO é apagado, e por quê

Esta metade é a que importa numa auditoria de fornecedor.

**Registro de GRC — evidência, risco, controle, ROPA, auditoria, CAPA,
constatação, revisão de direção — nunca entra em purga automática.** São a razão
de o produto existir; o prazo deles é decisão do cliente e frequentemente da
norma (certificação exige o histórico dos ciclos anteriores); e apagá-los por
rotina de plataforma seria destruir o trabalho pelo qual o cliente paga. Há
teste que insere um risco e uma evidência com 3000 dias e exige que sobrevivam
ao cron.

**`partes`, `parte_vinculos`, `departamentos`, `projeto_modulos`, `itens`, `item_seguranca`, `documentos` e `documento_versoes` também não.** A ciência de documento (pedidos `tipo = 'documento'` e as linhas de `pedido_destinatarios`, inclusive as do canal `portal`) é prova e não é purgada: correção é pedido novo. São o cadastro que o
cliente mantém: quem é o encarregado, quem responde por quê. O prazo é decisão dele. Nome e e-mail em
`partes` são dado pessoal, e por isso a busca e a eliminação do titular (`FONTES_PII`) as alcançam: a
pessoa é anonimizada, o vínculo e o fato ficam.

**A importação de programa do n.privacy também não** (`importacoes`, `importacao_arquivos`,
`importacao_itens` e os arquivos no R2 `STORAGE`, prefixo `importacoes/<project_id>/`). É o registro de
onde veio cada tratamento, terceiro, documento ou avaliação gravado. O ciclo é humano: **cancelar o
lote** apaga os arquivos do R2 e as linhas de `importacao_arquivos` e `importacao_itens` do lote; o lote fica
marcado `cancelada` (`cancelarLote` em `src/services/importacao.ts`).
O histórico de titulares chega pseudonimizado (`tit-<16 hex>`, sem nome, CPF, e-mail ou telefone), e o
documento importado guarda o arquivo original como evidência (`evidence.documento_id`). Não existe rota
de exclusão de projeto; se um dia existir, precisa limpar esse prefixo do R2, que o cascade do D1 não
alcança.

**Conta de usuário também não.** Conta se desativa (`users.ativo = 0`); apagar de verdade é ato do
`platform_admin` (`DELETE /api/v1/users/:id?definitivo=1`), porque a trilha referencia o e-mail.

**`audit_logs` também não**, por dois motivos que se somam:

1. os triggers da migration `0018_data_hardening.sql` recusam `DELETE` no nível
   do banco — a trilha é o último lugar onde apagar por conveniência faz
   sentido;
2. o crescimento dela é contido pelo **arquivamento**, não por purga: o cron
   copia o dia fechado para o bucket `niso-trilha` (`src/trilha.ts`), encadeado
   por hash.

> **Consequência assumida:** a tabela `audit_logs` no D1 cresce sem limite. Hoje
> são ~1.000 linhas; o problema só existe em outra ordem de grandeza. Quando
> chegar lá, a saída é podar o que já está arquivado — o que exige **derrubar o
> trigger de propósito, com registro**, e não uma rotina que o faça sozinha.
> Automatizar isso seria dar à plataforma o poder que a trilha existe para
> negar.

## Direito ao apagamento (LGPD art. 18, VI)

A retenção acima é rotina de plataforma. Pedido de titular é outro caminho, e
tem rota própria: `POST /api/v1/projects/:projectId/data-subject/erase`, que
exige identificador e **justificativa**, e registra o pedido na trilha.

## Como conferir o que o cron fez

O resultado de cada execução sai no log estruturado:

```bash
npx wrangler tail --format json | grep manutencao_diaria
```

```json
{"msg":"manutencao_diaria","rate_limits_removidos":0,"tokens_auditor_removidos":0,
 "trilha_arquivada":"2026-09-05","retencao":{"notifications":3,"avisos_prazo":0},
 "falhas":[]}
```

Cada tarefa é independente: uma que estoura não impede as outras, e o que falhou
vai em `falhas` em vez de derrubar o cron inteiro. Perder a limpeza de um dia é
aceitável; perder o registro do porquê não é.
