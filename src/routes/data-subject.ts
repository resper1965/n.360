import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, semIpENavegador, linhaDeAssinatura, podeMexerEmAssinatura, RECUSA_LINHA_DE_ASSINATURA } from '../helpers';
import { validateBody, identificadorSchema } from '../schemas';
import { localizarTitular, anonimizarTitular, ropaVencidos } from '../services/data-subject';

/**
 * Requisições de titular (LGPD art. 18) e vencimento de retenção (art. 16).
 *
 * Montado sob /api/v1/projects/:projectId/*, então herda o isolamento de tenant
 * do projectAccessMiddleware — uma requisição de titular nunca cruza projeto.
 *
 * Toda operação entra em audit_logs. Atender ao titular sem registrar não vale:
 * o art. 6º, X exige que o controlador demonstre a conformidade, e a trilha é
 * a demonstração.
 */
export const dataSubjectApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const PAPEIS_AUTORIZADOS = ['platform_admin', 'consultor', 'org_admin'];

/** Requisição de titular expõe PII: papel read-only não pode executar. O agente
 *  tem paridade de consultor, preso ao projeto pelo projectAccessMiddleware. */
function autorizado(c: any): boolean {
  const u = c.get('user');
  return PAPEIS_AUTORIZADOS.includes(u?.role) || u?.agente === true;
}

/**
 * Confirmação da existência + acesso (art. 18, I e II) e portabilidade (V).
 * A saída é JSON estruturado justamente para servir de portabilidade.
 */
dataSubjectApp.get('/', async (c) => {
  if (!autorizado(c)) return c.json({ error: 'Papel não autorizado a consultar dados de titular' }, 403);

  const projectId = c.req.param('projectId')!;
  const identificador = c.req.query('identificador');
  if (!identificador) return c.json({ error: 'Parâmetro `identificador` é obrigatório' }, 400);

  const todas = await localizarTitular(c.env.DB, projectId, identificador);
  // IP e navegador de quem leu a política saem só para principal não humano (agente, chave de API); o controlador atende o titular com eles.
  const u = c.get('user');
  const naoHumano = u?.agente === true || String(u?.id ?? '').startsWith('apikey:');
  const ocorrencias = todas.map((o) => ({ ...o, registros: naoHumano ? semIpENavegador(u, o.registros) : o.registros }));
  const total = ocorrencias.reduce((s, o) => s + o.registros.length, 0);

  // A consulta em si é tratamento de dado pessoal e precisa constar da trilha.
  await logAudit(
    c.env.DB, 'lgpd.titular.consulta', c.get('user')?.email ?? 'system',
    `Consulta de dados do titular (${total} registro(s) em ${ocorrencias.length} tabela(s))`,
    '', '', projectId
  );

  return c.json({
    ok: true,
    projeto: projectId,
    identificador,
    encontrado: total > 0,
    total_registros: total,
    ocorrencias,
    emitido_em: new Date().toISOString(),
  });
});

/**
 * Eliminação (art. 18, VI) — por anonimização.
 *
 * Apagar a linha destruiria a evidência de conformidade do cliente (um registro
 * de treinamento prova que o controle A.6.3 foi cumprido). Anonimizar remove o
 * dado pessoal e preserva o fato, que é o que o art. 16, IV permite.
 */
dataSubjectApp.post('/erase', async (c) => {
  if (!autorizado(c)) return c.json({ error: 'Papel não autorizado a eliminar dados de titular' }, 403);

  const projectId = c.req.param('projectId')!;
  const valid = await validateBody(c, identificadorSchema);
  if (!valid.success) return valid.response;
  const { identificador, justificativa, pedido_id } = valid.data;

  // O pedido tem de ser deste projeto e do MESMO titular: o protocolo vai para a trilha como a origem da eliminação, então
  // eliminar outra pessoa citando o pedido deixaria a trilha mentindo.
  let origem = '';
  if (pedido_id) {
    const ped = await c.env.DB.prepare('SELECT protocolo, titular_contato FROM titular_pedidos WHERE id = ? AND project_id = ?').bind(pedido_id, projectId).first<{ protocolo: string; titular_contato: string | null }>();
    if (!ped) return c.json({ error: 'pedido_id inexistente ou de outro projeto' }, 400);
    if ((ped.titular_contato ?? '').trim().toLowerCase() !== identificador.trim().toLowerCase()) return c.json({ error: 'identificador não corresponde ao contato do pedido' }, 400);
    origem = ` (pedido ${ped.protocolo})`;
  }

  const antes = await localizarTitular(c.env.DB, projectId, identificador);
  if (!antes.length) return c.json({ error: 'Nenhum registro encontrado para este titular neste projeto' }, 404);

  // Linha de quem assina ou de consultor na governança não se anonimiza por aqui: seria mexer na matriz por um atalho. A pessoa sai
  // da governança pela tela dela (a linha de assinatura, só o administrador do cliente) e depois o pedido é atendido.
  const { results: linhas } = await c.env.DB.prepare(
    'SELECT job_title, role_category FROM project_governance WHERE project_id = ? AND (lower(trim(email)) = lower(trim(?)) OR name = ?)'
  ).bind(projectId, identificador, identificador).all<{ job_title: string | null; role_category: string | null }>();
  if (linhas.some((g) => g.role_category === 'consultor')) {
    return c.json({ error: 'A pessoa é consultora na governança do projeto: retire-a da governança antes de atender o pedido.' }, 409);
  }
  if (linhas.some(linhaDeAssinatura) && !podeMexerEmAssinatura(c.get('user'), projectId)) {
    return c.json(RECUSA_LINHA_DE_ASSINATURA, 409);
  }

  const afetados = await anonimizarTitular(c.env.DB, projectId, identificador);
  const total = Object.values(afetados).reduce((s, n) => s + n, 0);

  await logAudit(
    c.env.DB, 'lgpd.titular.eliminacao', c.get('user')?.email ?? 'system',
    `Anonimização de ${total} registro(s): ${JSON.stringify(afetados)}${origem}`,
    justificativa, '', projectId
  );

  return c.json({
    ok: true,
    metodo: 'anonimizacao',
    registros_afetados: afetados,
    total: total,
    // Diz explicitamente o que NÃO foi apagado, para não induzir a erro.
    observacao: 'Os registros foram preservados sem o dado pessoal, para manter a evidência de conformidade (LGPD art. 16, IV).',
  });
});

/**
 * Retenção vencida (art. 16). Só relata — não apaga.
 * Eliminar automaticamente com base num campo de texto livre é como se apaga a
 * coisa errada; a decisão é do DPO e precisa ficar registrada.
 */
dataSubjectApp.get('/retencao', async (c) => {
  if (!autorizado(c)) return c.json({ error: 'Papel não autorizado' }, 403);

  const projectId = c.req.param('projectId')!;
  const vencidos = await ropaVencidos(c.env.DB, projectId);
  return c.json({
    ok: true,
    total: vencidos.length,
    vencidos,
    observacao: 'Relatório apenas. A eliminação exige decisão do DPO e é registrada na trilha de auditoria.',
  });
});
