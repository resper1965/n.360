# Agente externo de coleta do n.ot

Um agente de IA (Claude Code, Cursor) lê documentos técnicos de OT no computador do consultor e registra os ativos citados como **achados em rascunho** no n.ot. Quem revisa e envia ao inventário é o consultor, pela interface.

## Ligar (Gestor ARCiber)

Só o Gestor ARCiber liga ou desliga. Em **Acessos e sondas** do n.ot, no cartão **Agente de coleta**, ligue o interruptor. Desligado, todas as chaves do projeto deixam de valer. Desligar não revoga: ao religar, as chaves ainda não vencidas voltam a valer; revogue-as se não for essa a intenção.

## Emitir a chave

O Gestor ou a consultoria designada emite a chave no mesmo cartão (com o agente ligado). Informe o nome e a validade: **7 dias por padrão, no máximo 30**. O texto da chave (`otc_...`) aparece **uma única vez**; guarde-o. No banco fica só o hash.

## Conectar

Endpoint: `POST /ot-coleta/mcp` (o cartão mostra a URL completa), com `Authorization: Bearer <chave>`.

Claude Code:

```bash
claude mcp add --transport http n-ot-coleta <endpoint> --header "Authorization: Bearer <chave>"
```

Cursor (`mcp.json`):

```json
{
  "mcpServers": {
    "n-ot-coleta": {
      "url": "<endpoint>",
      "headers": { "Authorization": "Bearer <chave>" }
    }
  }
}
```

## O que o agente pode e não pode

Pode, com 4 ferramentas: `ler_depara` (campos, vocabulários, roteiro, sites e limites), `criar_sessao_documental`, `registrar_achados` e `encerrar_sessao`.

Não pode: ler o inventário nem sessões alheias; enviar ao inventário; enviar `zona`/`zona_id`; registrar outra coisa que não seja ativo; trocar de projeto (vem da chave). A chave é recusada em todas as rotas `/api/v1` e em `/mcp`. Lote JSON-RPC é recusado. Se o cliente tem allowlist de IP na política de segurança, ela vale também para o agente (403 fora dela); MFA e tempo de sessão não se aplicam, são regras de sessão humana.

## Limites

- 120 chamadas de ferramenta por chave por hora.
- 20 sessões por chave por dia.
- 200 achados por chamada e 2.000 por sessão.

## Revogar

No mesmo cartão, revogue a chave (Gestor ou consultoria designada). Vale na próxima requisição. Desligar o agente também bloqueia todas. Emissão, revogação e cada chamada de ferramenta executada ficam na trilha. Chamadas recusadas pelo limite por hora, de ferramenta desconhecida ou com argumentos inválidos não são registradas.

## Aviso de privacidade

Os arquivos passam pelo modelo do agente antes de chegar ao n.ot, **sem a máscara do n.ot**. Use só documentos que podem sair para esse modelo e prefira chaves curtas.
