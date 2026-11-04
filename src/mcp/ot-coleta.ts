import { createMcpHandler } from 'agents/mcp/server';
import { Server, type CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { logAudit } from '../helpers';
import { autenticarChaveColeta, criarSessaoDocumental, encerrarSessao, lerDepara, registrarAchados, RecusaColeta, TETO_ACHADOS_CHAMADA, type ChaveColeta, type EnvColeta } from '../services/ot-agente';
import { hostsPermitidosMcp } from './servidor';

/**
 * MCP do agente externo de coleta do n.ot (L5). Só a chave `ot_coleta`, só estas 4 ferramentas; o projeto vem da chave, nunca do
 * argumento (esquema estrito: `projectId` no argumento é recusado). O agente não lê inventário nem sessão alheia (ot-agente.ts).
 */
const id = z.string().trim().min(1).max(100);
const ESQUEMAS = {
  ler_depara: z.object({}).strict(),
  criar_sessao_documental: z.object({
    site_id: id,
    documento_titulo: z.string().min(1).max(200),
    documento_data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).strict(),
  registrar_achados: z.object({
    levantamento_id: id,
    achados: z.array(z.object({ dados: z.record(z.string(), z.unknown()), evidencia: z.string().max(2000) }).strict()).min(1).max(TETO_ACHADOS_CHAMADA),
  }).strict(),
  encerrar_sessao: z.object({ levantamento_id: id }).strict(),
};
type Nome = keyof typeof ESQUEMAS;

const DESCRICOES: Record<Nome, string> = {
  ler_depara: 'Comece por aqui. Traz os campos do ativo, os vocabulários, o roteiro, os sites do projeto (id e nome), os limites e as regras.',
  criar_sessao_documental: 'Abre uma sessão de levantamento documental num site do projeto, para um documento. Devolve levantamento_id.',
  registrar_achados: `Registra de 1 a ${TETO_ACHADOS_CHAMADA} achados de ativo na sessão (dados com os campos de ler_depara, evidencia = trecho do documento). Ficam em rascunho.`,
  encerrar_sessao: 'Encerra a sessão ao terminar o documento.',
};
const FERRAMENTAS = (Object.keys(ESQUEMAS) as Nome[]).map((name) => {
  const { $schema: _s, ...esquema } = z.toJSONSchema(ESQUEMAS[name]) as Record<string, unknown>;
  return { name, description: DESCRICOES[name], inputSchema: { ...esquema, type: 'object' as const } };
});

const INSTRUCOES = `Agente de coleta do n.ot: você lê documentos técnicos de OT e registra os ativos citados como achados em rascunho.
Comece por ler_depara. Depois, por documento: criar_sessao_documental, registrar_achados (um achado por equipamento, evidência = trecho
do documento, sem IP, MAC, CPF, e-mail nem telefone na evidência) e encerrar_sessao. Você não lê o inventário nem envia ao inventário:
quem revisa e envia é o consultor, pela interface.`;

type Args = { [K in Nome]: z.infer<(typeof ESQUEMAS)[K]> };
/** Executa a operação e devolve o resultado e a linha da trilha (só ids e contagens). */
async function executar(env: EnvColeta, chave: ChaveColeta, nome: Nome, dados: unknown): Promise<{ res: unknown; detalhe: string }> {
  if (nome === 'ler_depara') {
    const res = await lerDepara(env.DB, chave.projectId);
    return { res, detalhe: `Leitura do de-para: ${res.sites.length} site(s)` };
  }
  if (nome === 'criar_sessao_documental') {
    const a = dados as Args['criar_sessao_documental'];
    const res = await criarSessaoDocumental(env.DB, chave, a);
    return { res, detalhe: `Sessão documental ${res.levantamento_id} criada no site ${a.site_id}` };
  }
  if (nome === 'registrar_achados') {
    const a = dados as Args['registrar_achados'];
    const res = await registrarAchados(env, chave, a);
    return { res, detalhe: `${res.criados} achados na sessão ${a.levantamento_id}; ${res.recusados.length} recusados; ${res.com_aviso} com aviso` };
  }
  const a = dados as Args['encerrar_sessao'];
  return { res: await encerrarSessao(env.DB, chave, a), detalhe: `Sessão ${a.levantamento_id} encerrada` };
}

export async function handlerOtColeta(req: Request, env: EnvColeta & { APP_URL?: string; ENVIRONMENT?: string }, ctx: ExecutionContext): Promise<Response> {
  const auth = await autenticarChaveColeta(env, req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json', ...(auth.status === 401 && { 'WWW-Authenticate': 'Bearer' }) },
    });
  }
  const { chave } = auth;
  const trilha = (nome: Nome, detalhe: string) => logAudit(env.DB, `ot.agente.${nome}`, chave.ator, detalhe, '', req.headers.get('CF-Connecting-IP') ?? '', chave.projectId);

  const criar = () => {
    const server = new Server({ name: 'n.ot-coleta', version: '1.0.0' }, { capabilities: { tools: {} }, instructions: INSTRUCOES });
    server.setRequestHandler('tools/list', async () => ({ tools: FERRAMENTAS }));
    server.setRequestHandler('tools/call', async (r): Promise<CallToolResult> => {
      const falha = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] });
      const { name, arguments: args } = r.params;
      if (!Object.hasOwn(ESQUEMAS, name)) return falha('Ferramenta indisponível');
      const nome = name as Nome;
      const v = ESQUEMAS[nome].safeParse(args ?? {});
      if (!v.success) {
        const i = v.error.issues[0];
        return falha(`Argumento inválido: ${i.path.join('.') || '(raiz)'}: ${i.message}`);
      }
      try {
        const { res, detalhe } = await executar(env, chave, nome, v.data);
        await trilha(nome, detalhe);
        return { content: [{ type: 'text', text: JSON.stringify(res) }] };
      } catch (e) {
        if (!(e instanceof RecusaColeta)) { console.error('ot-coleta', nome, e); return falha('Falha interna'); }
        await trilha(nome, `Recusada: ${e.message}`);
        return falha(e.message);
      }
    });
    return server;
  };

  return createMcpHandler(criar, { route: '/ot-coleta/mcp', responseMode: 'json', allowedHostnames: hostsPermitidosMcp(env) })(req, env, ctx);
}
