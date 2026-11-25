import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { Bindings, Variables } from '../index';
import {
  logAudit, verifyPassword, recusaSenhaDeOutro, erro500, requireProjectAccess, projetosVisiveis, ehConsultor,
  type PapelAssinatura,
  sendEmail, genToken, sha256Hex, registraErro,
} from '../helpers';
import { validateBody, aprovacaoLoteSchema, pedidoCriarSchema, pedidoDecisaoSchema, pedidoCienciaLoteSchema, pedidoReenvioSchema, pedidoCancelarSchema } from '../schemas';
import { appUrl } from '../config/url';
import { remetente } from '../services/email-layout';
import { emailCiencia, emailPedidoAprovacao, type QuemPede } from '../services/emails';
import { log } from '../observability';
import { assinarEvidencia } from './evidence';
import { alcadasDoProjeto, type NivelRisco } from '../services/aceite-risco';
import {
  criarPedido, recusaDeDestinatarios, conferirVigencia, registrarDecisao, podePedir, autoridadeNoPedido, DIAS_LINK, type PedidoRow,
  substituirPedidosDoDocumento, type TipoPedido, type Vigencia,
} from '../services/pedidos';

/**
 * Pedidos de aprovação/ciência (acesso de stakeholders, fatia 2). Ver `services/pedidos.ts`.
 *
 * - `POST /api/v1/projects/:projectId/pedidos` — a consultoria (consultor designado,
 *   `consultoria_admin`) ou o `org_admin` do projeto pede. O `projectAccessMiddleware` já cortou o
 *   projeto; aqui só o papel. Stakeholder nem chega (allow-list de caminhos).
 * - `/api/v1/pedidos*` — o lado do DESTINATÁRIO: "Meus pedidos", abrir, aprovar, recusar. Só vê o
 *   pedido quem é destinatário (por `user_id`, ou pelo e-mail enquanto não há conta ligada) E
 *   alcança o projeto dele. Pedido alheio é 404, não 403: não confirma que existe.
 *
 * Quem pede: `podePedir`; quem aprova: `autoridadeNoPedido` (ambas em `services/pedidos.ts`, fatia 4).
 */
type Ctx = { Bindings: Bindings; Variables: Variables };
type Usuario = Variables['user'];

/**
 * Documento gravado (política no controle, DPIA): confere na hora os pedidos abertos dele, para o
 * substituto aparecer sem esperar alguém abrir o antigo. Não derruba a escrita que já aconteceu: se
 * falhar, só registra; a conferência se repete ao abrir e ao decidir.
 */
export async function conferirPedidosDoDocumento(c: any, tipo: TipoPedido, refIds: string | string[], projectId?: string): Promise<void> {
  try {
    for (const { antigo, vig } of await substituirPedidosDoDocumento(c.env.DB, tipo, refIds, projectId)) {
      await avisarSubstituicao(c, antigo, vig);
    }
  } catch (e) {
    registraErro(c, e);
  }
}

/** `conferirVigencia` + aviso aos destinatários por link, se esta conferência substituiu o pedido. */
export async function conferirEAvisar(c: any, p: PedidoRow): Promise<Vigencia> {
  const vig = await conferirVigencia(c.env.DB, p);
  await avisarSubstituicao(c, p, vig);
  return vig;
}

/**
 * Pedido de ciência por link acabou de ser substituído (por ESTA chamada): o substituto nasce sem
 * token, então quem recebeu link no antigo ficaria sem caminho. Emite link novo a esses pendentes e
 * manda o e-mail. Sem envio configurado, nada é emitido e o painel mostra quantos estão sem link
 * (`sem_link`). Falha aqui não desfaz a substituição: fica registrada e o "Reenviar" cobre.
 */
async function avisarSubstituicao(c: any, antigo: PedidoRow, vig: Vigencia): Promise<void> {
  if (vig.vigente || !vig.criado || !vig.substituido_por || antigo.papel_exigido !== 'ciente') return;
  try {
    const db: D1Database = c.env.DB;
    const { results } = await db.prepare('SELECT email FROM pedido_destinatarios WHERE pedido_id = ? AND token_hash IS NOT NULL')
      .bind(antigo.id).all<{ email: string }>();
    if (!results.length || !c.env.RESEND_API_KEY) return;
    const links = await emitirLinks(db, vig.substituido_por, new Set(results.map((r) => r.email)));
    const titulo = (await db.prepare('SELECT titulo FROM pedidos WHERE id = ?').bind(vig.substituido_por).first<{ titulo: string }>())?.titulo ?? antigo.titulo;
    const falhas = await enviarLinks(c, vig.substituido_por, titulo, links, true);
    await logAudit(db, 'pedido.ciencia_substituida', 'sistema',
      `Pedido ${antigo.id} substituído por ${vig.substituido_por} (documento alterado): link novo a ${links.length} pendente(s), ${falhas.length} falha(s) de envio`,
      '', '', antigo.project_id);
  } catch (e) {
    registraErro(c, e);
  }
}

// Pedido novo de política por controle não nasce mais (aprovação nem ciência); os que existem seguem legíveis e decidíveis.
const POLITICA_E_DOCUMENTO = { error: 'A política agora é um documento: peça a aprovação pela página da política.' };

export const pedidosApp = new Hono<Ctx>();
export const projectPedidosApp = new Hono<Ctx>();

/**
 * `criado_por` do pedido: o e-mail de quem pede. O agente pede como o consultor que o concedeu (`agente_conta`): assim a
 * segregação ("quem pediu não decide") vale para o consultor e o e-mail sai com o reply-to dele. A trilha guarda o rótulo
 * "agente de <consultor>" (`user.email`).
 */
const quemPede = (user: { email: string; agente_conta?: string }) => user.agente_conta ?? user.email;

/** 403 com o motivo, se o usuário não pede neste projeto; `null` se pode. */
async function recusaPedir(c: any): Promise<Response | null> {
  const motivo = await podePedir(c.env.DB, c.get('user'), c.req.param('projectId') ?? '');
  return motivo ? c.json({ error: motivo }, 403) : null;
}

projectPedidosApp.post('/', async (c) => {
  try {
    const valid = await validateBody(c, pedidoCriarSchema);
    if (!valid.success) return valid.response;
    const b = valid.data;
    // Pedido novo de política por controle não nasce mais, para ninguém; os que existem seguem legíveis e decidíveis.
    if (b.tipo === 'politica') return c.json(POLITICA_E_DOCUMENTO, 400);
    const recusa = await recusaPedir(c);
    if (recusa) return recusa;
    const user = c.get('user');
    const projectId = c.req.param('projectId') ?? '';
    // Pedido de aceite de risco é só pela interface: o agente pede aprovação e ciência, não aceite de risco (decisão do dono, 25/11).
    if (b.tipo === 'risco' && user?.agente) return c.json({ error: 'Pedir o aceite do risco residual é pela interface, não pelo agente.' }, 403);
    if ((b.tipo === 'documento' || b.tipo === 'excecao' || b.tipo === 'tratamento') && b.papel_exigido === 'ciente') {
      return c.json({ error: 'Ciência de política ou documento é pelo envio por link ("Nova ciência por link"). Este pedido é de aprovação: escolha Líder SGSI ou Direção.' }, 400);
    }
    const refId = b.ref_id;
    // Pedido de aceite de risco: um risco por pedido, residual avaliado, ainda não aceito; o papel é a alçada do nível residual.
    if (b.tipo === 'risco') {
      const risco = await c.env.DB.prepare('SELECT status, residual_level FROM risks WHERE id = ? AND project_id = ?').bind(refId, projectId)
        .first<{ status: string | null; residual_level: NivelRisco | null }>();
      if (!risco) return c.json({ error: 'Risco não encontrado neste projeto' }, 404);
      if (risco.status === 'Accepted' || risco.status === 'Closed') return c.json({ error: 'Este risco já está aceito ou encerrado.' }, 409);
      if (!risco.residual_level) return c.json({ error: 'Avalie o risco residual (impacto e probabilidade residuais) antes de pedir o aceite.' }, 400);
      const alcada = (await alcadasDoProjeto(c.env.DB, projectId))[risco.residual_level] ?? 'ceo';
      // Um destinatário: o primeiro "aprovar" é o aceite e fecha o risco; um segundo destinatário ficaria pendente para sempre.
      if (new Set(b.destinatarios.map((d) => d.email.trim().toLowerCase())).size !== 1) {
        return c.json({ error: 'O pedido de aceite de risco vai a uma pessoa só: quem tem a alçada e vai aceitar.' }, 400);
      }
      if (b.papel_exigido !== alcada) {
        return c.json({ error: `O aceite de risco residual ${risco.residual_level} é da ${alcada === 'ceo' ? 'Direção (CEO)' : 'Liderança do SGSI'}: peça com esse papel.`, alcada }, 400);
      }
    }

    const projeto = await c.env.DB.prepare('SELECT org_id FROM projects WHERE id = ?').bind(projectId).first<{ org_id: string }>();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);

    const semAutoridade = await recusaDeDestinatarios(c.env.DB, projectId, b.papel_exigido, b.destinatarios);
    if (semAutoridade) return c.json({ error: semAutoridade }, 400);

    const criado = await criarPedido(c.env.DB, {
      projectId, tipo: b.tipo, refId, papel: b.papel_exigido,
      destinatarios: b.destinatarios, criadoPor: quemPede(user),
    });
    if (!criado) return c.json({ error: 'Documento não encontrado neste projeto' }, 404);
    await logAudit(c.env.DB, 'pedido.criado', user.email,
      `Pedido ${criado.id} (${b.tipo} ${refId}, papel ${b.papel_exigido}) para ${b.destinatarios.length} destinatário(s); hash ${criado.hash}`,
      '', c.req.header('CF-Connecting-IP') ?? '', projectId);
    if (b.papel_exigido !== 'ciente') await avisarAprovacao(c, criado.id);
    return c.json({ ok: true, ...criado }, 201);
  } catch (e: any) {
    return erro500(c, 'Erro ao criar pedido', e);
  }
});

/**
 * E-mail a cada destinatário de um pedido de APROVAÇÃO, uma vez, na criação (o pedido novo é outro id: não há reenvio aqui).
 * Falha de envio não desfaz o pedido, que já está gravado: vai ao log estruturado, sem o endereço.
 */
async function avisarAprovacao(c: Context<Ctx>, pedidoId: string): Promise<void> {
  try {
    const db = c.env.DB;
    const p = await db.prepare('SELECT tipo, titulo, papel_exigido FROM pedidos WHERE id = ?').bind(pedidoId).first<{ tipo: string; titulo: string; papel_exigido: string }>();
    if (!p) return;
    const { results } = await db.prepare('SELECT email, nome FROM pedido_destinatarios WHERE pedido_id = ?').bind(pedidoId).all<{ email: string; nome: string | null }>();
    const q = await quemPedeCiencia(db, pedidoId);
    const opcoes = { from: remetente('n.360', q.cliente), ...(q.pessoa?.email ? { replyTo: q.pessoa.email } : {}) };
    const link = `${appUrl(c.env)}/?tela=meus-pedidos`;
    let falhas = 0;
    for (const d of results) {
      const m = emailPedidoAprovacao({ tipo: p.tipo, titulo: p.titulo, papel: p.papel_exigido, nome: d.nome, link, quem: q });
      if (!(await sendEmail(c, d.email, m.assunto, m, opcoes))) falhas++;
    }
    if (falhas) log('error', { msg: 'pedido_aprovacao_email_falhou', pedido_id: pedidoId, falhas });
  } catch (e) {
    log('error', { msg: 'pedido_aprovacao_email_falhou', pedido_id: pedidoId, erro: e instanceof Error ? e.message : String(e) });
  }
}

/** O usuário alcança o projeto do pedido? Stakeholder: só o próprio `client_project_id`. */
async function alcancaProjeto(db: D1Database, user: Usuario, projectId: string): Promise<boolean> {
  if (user.role === 'stakeholder') return !!user.client_project_id && user.client_project_id === projectId;
  return requireProjectAccess(db, user, projectId).then(() => true, () => false);
}

type Meu = { pedido: PedidoRow; dest: { id: string; status: string; nome: string | null; email: string; decidido_em: string | null } };

/** O pedido, se o usuário é destinatário dele e alcança o projeto; senão `null` (vira 404). */
async function meuPedido(db: D1Database, user: Usuario, id: string): Promise<Meu | null> {
  const row = await db.prepare(
    `SELECT p.*, d.id AS d_id, d.status AS d_status, d.nome AS d_nome, d.email AS d_email, d.decidido_em AS d_decidido_em
       FROM pedidos p JOIN pedido_destinatarios d ON d.pedido_id = p.id
      WHERE p.id = ? AND (d.user_id = ? OR (d.user_id IS NULL AND d.email = lower(?)))
      LIMIT 1`
  ).bind(id, user.id ?? '', user.email ?? '').first<any>();
  if (!row || !(await alcancaProjeto(db, user, row.project_id))) return null;
  const { d_id, d_status, d_nome, d_email, d_decidido_em, ...pedido } = row;
  return { pedido, dest: { id: d_id, status: d_status, nome: d_nome, email: d_email, decidido_em: d_decidido_em } };
}

pedidosApp.get('/', async (c) => {
  try {
    const user = c.get('user');
    // Mesmo corte de projeto das listagens (stakeholder: o próprio projeto), além de ser destinatário.
    const vis = user.role === 'stakeholder'
      ? { sql: 'SELECT ?', bind: user.client_project_id ?? '' }
      : projetosVisiveis(user);
    const { results } = await c.env.DB.prepare(
      `SELECT p.id, p.project_id, p.tipo, p.titulo, p.papel_exigido, p.status, p.hash, p.criado_em,
              d.status AS meu_status, d.decidido_em
         FROM pedidos p JOIN pedido_destinatarios d ON d.pedido_id = p.id
        WHERE (d.user_id = ? OR (d.user_id IS NULL AND d.email = lower(?)))
          AND p.status NOT IN ('substituido', 'cancelado')
          AND lower(p.criado_por) <> lower(?) -- quem pediu não decide (o painel usa a mesma regra)
          ${vis ? `AND p.project_id IN (${vis.sql})` : ''}
        ORDER BY p.criado_em DESC LIMIT 200`
    ).bind(user.id ?? '', user.email ?? '', user.email ?? '', ...(vis ? [vis.bind] : [])).all();
    return c.json({ pedidos: results });
  } catch (e: any) {
    return erro500(c, 'Erro ao listar pedidos', e);
  }
});

pedidosApp.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const meu = await meuPedido(c.env.DB, user, c.req.param('id'));
    if (!meu) return c.json({ error: 'Pedido não encontrado' }, 404);
    let { pedido } = meu;
    // Abrir já confere se o documento mudou: a pessoa não lê uma versão que não vale mais.
    const vig = await conferirEAvisar(c, pedido);
    if (!vig.vigente) pedido = { ...pedido, status: vig.status, substituido_por: vig.substituido_por ?? pedido.substituido_por };
    const { conteudo_json, ...resto } = pedido;
    return c.json({ pedido: { ...resto, conteudo: JSON.parse(conteudo_json) }, destinatario: meu.dest });
  } catch (e: any) {
    return erro500(c, 'Erro ao abrir pedido', e);
  }
});

/**
 * Aprovar (ou dar ciência) e recusar: mesma sequência, mesma prova. Pedido fora do ar é 409 (com o
 * id do substituto, se houver); senha errada é 401; sem autoridade para o papel, 403. A prova, a
 * assinatura do documento e o novo status do pedido vão num único `batch`.
 */
export type Resultado = { status: number; corpo: Record<string, unknown> };
export type DbUser = { password_hash: string; name: string | null; totp_enabled: number | null };

/**
 * A decisão de UM pedido, sem resposta HTTP: serve à rota individual (que confere a senha aqui) e ao lote (que a conferiu
 * uma vez e passa `dbUser`, com `senha: null`). `hashVisto`, quando vem, tem de ser o hash do pedido: senão o item não é
 * decidido (o conteúdo mudou desde que a pessoa o viu).
 */
export async function decidirPedido(
  c: Context<Ctx>, user: Usuario, pedidoId: string, decisao: 'aprovar' | 'recusar',
  a: { senha: string | null; dbUser?: DbUser; motivo?: string | null; hashVisto?: string; emLote?: boolean },
): Promise<Resultado> {
  const db: D1Database = c.env.DB;
  const meu = await meuPedido(db, user, pedidoId);
  if (!meu) return { status: 404, corpo: { error: 'Pedido não encontrado' } };
  const { pedido, dest } = meu;
  // Aceite de risco é um ato por risco: nunca em lote.
  if (a.emLote && pedido.tipo === 'risco') return { status: 409, corpo: { error: 'Aceite de risco é um por vez: abra o pedido e decida.' } };
  // A alçada pode ter mudado depois do pedido: aprovar com o papel antigo seria aceitar sem a alçada de agora.
  if (pedido.tipo === 'risco' && decisao === 'aprovar') {
    const r = await db.prepare('SELECT residual_level FROM risks WHERE id = ? AND project_id = ?').bind(pedido.ref_id, pedido.project_id).first<{ residual_level: NivelRisco | null }>();
    const alcada = r?.residual_level ? (await alcadasDoProjeto(db, pedido.project_id))[r.residual_level] ?? 'ceo' : null;
    if (alcada && alcada !== pedido.papel_exigido) {
      return { status: 409, corpo: { error: 'A alçada de aceite deste nível de risco mudou depois do pedido. Peça o aceite de novo, a quem tem a alçada agora.' } };
    }
  }
  // Segregação de funções (spec onda 1): quem pediu não decide o que pediu. `criado_por` é o e-mail de quem criou.
  if (pedido.criado_por.toLowerCase() === (user.email ?? '').toLowerCase()) {
    return { status: 403, corpo: { error: 'Quem pediu a aprovação não a decide. Peça a outra pessoa.' } };
  }

  const vig = await conferirEAvisar(c, pedido);
  if (!vig.vigente) {
    const msg = vig.status === 'substituido'
      ? 'O documento mudou depois deste pedido. Abra o pedido novo, com o texto atual.'
      : 'Este pedido não está mais aberto.';
    return { status: 409, corpo: { error: msg, status: vig.status, substituido_por: vig.substituido_por ?? null } };
  }
  if (dest.status !== 'pendente') return { status: 409, corpo: { error: 'Você já decidiu este pedido.', status: dest.status } };
  if (a.hashVisto !== undefined && a.hashVisto !== pedido.hash) {
    return { status: 409, corpo: { error: 'O conteúdo mudou desde que você abriu; recarregue e revise de novo' } };
  }

  const dbUser = a.dbUser ?? await db.prepare('SELECT password_hash, name, totp_enabled FROM users WHERE id = ?').bind(user.id ?? '')
    .first<DbUser>();
  if (!dbUser) return { status: 401, corpo: { error: 'Senha incorreta' } };
  if (a.senha !== null && !(await verifyPassword(a.senha, dbUser.password_hash))) return { status: 401, corpo: { error: 'Senha incorreta' } };

  const autoridade = await autoridadeNoPedido(db, pedido, user);
  const recusa = autoridade.recusa ?? await recusaSenhaDeOutro(db, user.id);
  if (recusa) return { status: 403, corpo: { error: recusa } };
  const nome = autoridade.nome || dest.nome || dbUser.name || user.email;
  const assinar: { papel: PapelAssinatura } | undefined =
    decisao === 'aprovar' && pedido.papel_exigido !== 'ciente' ? { papel: pedido.papel_exigido } : undefined;

  const novoStatus = decisao === 'recusar' ? 'recusado' : pedido.papel_exigido === 'ciente' ? 'ciente' : 'aprovado';
  const ip = c.req.header('CF-Connecting-IP') || null;
  const ua = c.req.header('User-Agent') || null;
  const motivo = decisao === 'recusar' ? a.motivo ?? null : null;
  const pegou = await registrarDecisao(db, {
    pedido, destId: dest.id, status: novoStatus, ip, ua, mfa: dbUser.totp_enabled === 1, nome, motivo, assinar, email: user.email, userId: user.id,
  });
  if (!pegou) {
    // Algo mudou entre a conferência e a gravação (documento, pedido ou outra decisão): nada foi
    // gravado. Confere de novo para devolver o motivo e, se for o caso, abrir o pedido substituto.
    const atual = await db.prepare('SELECT * FROM pedidos WHERE id = ?').bind(pedido.id).first<PedidoRow>();
    const vig2 = atual ? await conferirEAvisar(c, atual) : null;
    if (vig2 && !vig2.vigente) {
      return { status: 409, corpo: { error: 'O pedido mudou enquanto você decidia. Abra-o de novo.', status: vig2.status, substituido_por: vig2.substituido_por ?? null } };
    }
    return { status: 409, corpo: { error: 'Você já decidiu este pedido.' } };
  }

  if (pedido.tipo === 'risco' && novoStatus === 'aprovado') {
    await logAudit(db, 'risk.aceite_residual', user.email,
      `Risco ${pedido.ref_id}: risco residual aceito por ${nome} pelo pedido ${pedido.id}; estado ${pedido.hash}`, '', ip ?? '', pedido.project_id);
  }
  await logAudit(db, decisao === 'recusar' ? 'pedido.recusado' : 'pedido.aprovado', user.email,
    `Pedido ${pedido.id} (${pedido.tipo} ${pedido.ref_id}, papel ${pedido.papel_exigido}): ${novoStatus} por ${nome}; hash lido ${pedido.hash}`,
    decisao === 'recusar' ? a.motivo ?? '' : '', ip ?? '', pedido.project_id);
  return { status: 200, corpo: { ok: true, status: novoStatus, hash_lido: pedido.hash } };
}

async function decidir(c: Context<Ctx>, decisao: 'aprovar' | 'recusar', corpo: { senha: string; motivo?: string | null }) {
  try {
    const r = await decidirPedido(c, c.get('user'), c.req.param('id') ?? '', decisao, { senha: corpo.senha, motivo: corpo.motivo });
    return c.json(r.corpo, r.status as ContentfulStatusCode);
  } catch (e: any) {
    return erro500(c, 'Erro ao registrar a decisão do pedido', e);
  }
}

// A validação fica em cada rota (e não dentro de `decidir`): é assim que test/openapi.test.ts liga o
// schema à rota lendo o fonte.
pedidosApp.post('/:id/aprovar', async (c) => {
  const valid = await validateBody(c, pedidoDecisaoSchema);
  if (!valid.success) return valid.response;
  return decidir(c, 'aprovar', valid.data);
});
pedidosApp.post('/:id/recusar', async (c) => {
  const valid = await validateBody(c, pedidoDecisaoSchema);
  if (!valid.success) return valid.response;
  return decidir(c, 'recusar', valid.data);
});

// Aprovação em lote (spec 2026-10-14): NÃO é caminho novo. Cada item passa pela função da aprovação individual
// (`decidirPedido`, `assinarEvidencia`: autoridade, segregação de funções, hash); o lote só confere a senha uma vez.
// Item que falha vira `ignorado` com o motivo e não derruba os outros. Só aprova: recusar pede motivo por item.
pedidosApp.post('/lote', async (c) => {
  try {
    const valid = await validateBody(c, aprovacaoLoteSchema);
    if (!valid.success) return valid.response;
    const user = c.get('user');
    const db = c.env.DB;
    const dbUser = await db.prepare('SELECT password_hash, name, totp_enabled FROM users WHERE id = ? OR email = ?')
      .bind(user.id ?? '', user.email ?? '').first<DbUser>();
    if (!dbUser || !(await verifyPassword(valid.data.senha, dbUser.password_hash))) return c.json({ error: 'Senha incorreta' }, 401);
    const senhaDeOutro = await recusaSenhaDeOutro(db, user.id);
    if (senhaDeOutro) return c.json({ error: senhaDeOutro }, 403);

    const resultados: { tipo: string; id: string; resultado: 'aprovado' | 'ignorado'; motivo?: string }[] = [];
    for (const it of valid.data.itens) {
      let r: Resultado;
      try {
        r = it.tipo === 'pedido'
          ? await decidirPedido(c, user, it.id, 'aprovar', { senha: null, dbUser, hashVisto: it.hash_visto, emLote: true })
          : await assinarEvidencia(c, user, it.id, { password: null, dbUser, fileHash: it.hash_visto });
      } catch (e) {
        registraErro(c, e);
        r = (e as { name?: string })?.name === 'ForbiddenError'
          ? { status: 404, corpo: {} }
          : { status: 500, corpo: { error: 'Não foi possível processar este item' } };
      }
      // Inexistente e de outra organização têm a MESMA resposta: o lote não confirma que o recurso alheio existe.
      const motivo = r.status === 404 ? 'Item não encontrado ou sem acesso' : String(r.corpo.error ?? 'Não foi possível aprovar');
      resultados.push(r.status === 200
        ? { tipo: it.tipo, id: it.id, resultado: 'aprovado' }
        : { tipo: it.tipo, id: it.id, resultado: 'ignorado', motivo });
    }
    const aprovados = resultados.filter((x) => x.resultado === 'aprovado').length;
    await logAudit(db, 'aprovacao.lote', user.email, `Lote de aprovação: ${resultados.length} itens, ${aprovados} aprovados`,
      '', c.req.header('CF-Connecting-IP') || '', '');
    return c.json({ ok: true, aprovados, resultados });
  } catch (e) { return erro500(c, 'Erro ao processar o lote de aprovação', e); }
});

// ─── Ciência em massa por link com código (fatia 3) ──────────────────────────────────────────────
// Quem pede (`podePedir`) manda um documento a até 200 e-mails, sem conta.
// Cada pessoa recebe um link pessoal: token CSPRNG só no FRAGMENTO da URL (o servidor nunca o recebe
// no caminho nem na query), só o SHA-256 no banco. O lado público está em `routes/public-pedidos.ts`.

const SEM_EMAIL = { error: 'Envio de e-mail não configurado' };
type Link = { email: string; nome: string | null; token: string };

/** Quem pede a ciência: o cliente do projeto e quem criou o pedido (nome, e-mail e a organização dele). */
export async function quemPedeCiencia(db: D1Database, pedidoId: string): Promise<QuemPede> {
  const r = await db.prepare(
    `SELECT pr.client_name AS cliente, p.criado_por AS email, u.name AS nome, o.name AS organizacao
       FROM pedidos p JOIN projects pr ON pr.id = p.project_id
       LEFT JOIN users u ON lower(u.email) = lower(p.criado_por)
       LEFT JOIN organizations o ON o.id = pr.org_id
      WHERE p.id = ?`
  ).bind(pedidoId).first<{ cliente: string; email: string; nome: string | null; organizacao: string | null }>();
  const email = r?.email?.includes('@') ? r.email : null;
  return { cliente: r?.cliente ?? '', pessoa: email ? { nome: r?.nome ?? null, email, organizacao: r?.organizacao ?? null } : null };
}

/** Token novo aos pendentes do pedido (todos, ou só os de `so`); devolve os links em claro, para o e-mail. */
async function emitirLinks(db: D1Database, pedidoId: string, so: Set<string> | null): Promise<Link[]> {
  const { results: pend } = await db.prepare(`SELECT id, email, nome FROM pedido_destinatarios WHERE pedido_id = ? AND status = 'pendente'`)
    .bind(pedidoId).all<{ id: string; email: string; nome: string | null }>();
  const links: Link[] = [];
  for (const d of pend) {
    if (so && !so.has(d.email)) continue;
    const token = genToken();
    const r = await db.prepare(`UPDATE pedido_destinatarios SET token_hash = ?, token_expira_em = datetime('now', '+${DIAS_LINK} days')
      WHERE id = ? AND status = 'pendente'`).bind(await sha256Hex(token), d.id).run();
    if (r.meta?.changes) links.push({ email: d.email, nome: d.nome, token });
  }
  return links;
}

/** Manda os links; devolve os e-mails cujo envio falhou (ficam pendentes, para reenviar). */
// ponytail: 5 envios por vez e uma nova tentativa após pausa curta. Lote de 200 cabe na requisição;
// teto de taxa do provedor mais baixo que isso pede fila (Queues), não laço maior aqui.
const ENVIOS_SIMULTANEOS = 5;
const PAUSA_RETENTATIVA_MS = 300;
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function enviarLinks(c: any, pedidoId: string, titulo: string, links: Link[], reenvio: boolean): Promise<string[]> {
  if (!links.length) return [];
  const q = await quemPedeCiencia(c.env.DB, pedidoId);
  const opcoes = { from: remetente('n.360', q.cliente), ...(q.pessoa?.email ? { replyTo: q.pessoa.email } : {}) };
  const enviar = (l: Link) => {
    const m = emailCiencia({ titulo, nome: l.nome, link: `${appUrl(c.env)}/politicas#${l.token}`, quem: q, reenvio, validoAte: new Date(Date.now() + DIAS_LINK * 86_400_000) });
    return sendEmail(c, l.email, m.assunto, m, opcoes);
  };
  const falhas: string[] = [];
  for (let i = 0; i < links.length; i += ENVIOS_SIMULTANEOS) {
    const grupo = links.slice(i, i + ENVIOS_SIMULTANEOS);
    const ok = await Promise.all(grupo.map(enviar));
    const falhou = grupo.filter((_, k) => !ok[k]);
    if (!falhou.length) continue;
    await pausa(PAUSA_RETENTATIVA_MS);
    const ok2 = await Promise.all(falhou.map(enviar));
    falhas.push(...falhou.filter((_, k) => !ok2[k]).map((l) => l.email));
  }
  return falhas;
}


projectPedidosApp.post('/ciencia', async (c) => {
  try {
    const valid = await validateBody(c, pedidoCienciaLoteSchema);
    if (!valid.success) return valid.response;
    if (valid.data.tipo === 'politica') return c.json(POLITICA_E_DOCUMENTO, 400);
    const recusa = await recusaPedir(c);
    if (recusa) return recusa;
    const user = c.get('user');
    const projectId = c.req.param('projectId') ?? '';
    // Sem a chave o sendEmail só simula: criar links que ninguém recebeu engana quem pediu.
    if (!c.env.RESEND_API_KEY) return c.json(SEM_EMAIL, 503);
    const b = valid.data;
    const projeto = await c.env.DB.prepare('SELECT org_id FROM projects WHERE id = ?').bind(projectId).first<{ org_id: string }>();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);

    const criado = await criarPedido(c.env.DB, {
      projectId, tipo: b.tipo, refId: b.ref_id, papel: 'ciente',
      destinatarios: b.destinatarios, criadoPor: quemPede(user), comLink: true,
    });
    if (!criado) return c.json({ error: 'Documento não encontrado neste projeto' }, 404);
    const p = await c.env.DB.prepare('SELECT titulo FROM pedidos WHERE id = ?').bind(criado.id).first<{ titulo: string }>();
    const falhas = await enviarLinks(c, criado.id, p?.titulo ?? '', criado.links, false);
    await logAudit(c.env.DB, 'pedido.ciencia_lote', user.email,
      `Pedido ${criado.id} (${b.tipo} ${b.ref_id}, ciência por link) para ${criado.links.length} destinatário(s), ${falhas.length} falha(s) de envio; hash ${criado.hash}`,
      '', c.req.header('CF-Connecting-IP') ?? '', projectId);
    // Sem `ok: true` por histórico: o api.js desembrulhava a primeira lista. Hoje desembrulha só `{ ok, <uma lista> }`.
    return c.json({ id: criado.id, hash: criado.hash, enviados: criado.links.length - falhas.length, falhas }, 201);
  } catch (e: any) {
    return erro500(c, 'Erro ao criar o pedido de ciência', e);
  }
});

projectPedidosApp.get('/', async (c) => {
  try {
    const recusa = await recusaPedir(c);
    if (recusa) return recusa;
    const { results } = await c.env.DB.prepare(
      `SELECT p.id, p.tipo, p.ref_id, p.titulo, p.papel_exigido, p.status, p.hash, p.substituido_por, p.criado_por, p.criado_em,
              COUNT(d.id) AS total,
              COALESCE(SUM(d.status IN ('ciente', 'aprovado')), 0) AS cientes,
              COALESCE(SUM(d.status = 'pendente'), 0) AS pendentes,
              COALESCE(SUM(d.status = 'pendente' AND d.aberto_em IS NULL), 0) AS nao_abriram
         FROM pedidos p LEFT JOIN pedido_destinatarios d ON d.pedido_id = p.id
        WHERE p.project_id = ?
        GROUP BY p.id ORDER BY p.criado_em DESC LIMIT 200`
    ).bind(c.req.param('projectId') ?? '').all();
    return c.json({ pedidos: results });
  } catch (e: any) {
    return erro500(c, 'Erro ao listar os pedidos do projeto', e);
  }
});

/** Pedido do projeto da rota (o `projectAccessMiddleware` já cortou o projeto), ou `null`. */
const pedidoDoProjeto = (db: D1Database, projectId: string, id: string) =>
  db.prepare('SELECT * FROM pedidos WHERE id = ? AND project_id = ?').bind(id, projectId).first<PedidoRow>();

/**
 * Painel de acompanhamento: por destinatário, ciente / pendente (abriu) / não abriu, a ciência de
 * uma VERSÃO ANTERIOR do mesmo documento (pedido substituído) e a linha do portal antigo
 * (`policy_acknowledgments`, sem hash: "versão não registrada"). Nada de token, IP ou user-agent.
 */
projectPedidosApp.get('/:id', async (c) => {
  try {
    const recusa = await recusaPedir(c);
    if (recusa) return recusa;
    const db = c.env.DB;
    let p = await pedidoDoProjeto(db, c.req.param('projectId') ?? '', c.req.param('id'));
    if (!p) return c.json({ error: 'Pedido não encontrado' }, 404);
    const vig = await conferirEAvisar(c, p);
    if (!vig.vigente) p = { ...p, status: vig.status, substituido_por: vig.substituido_por ?? p.substituido_por };

    const { results: dests } = await db.prepare(
      `SELECT email, nome, status, decidido_em, aberto_em, canal, hash_lido, motivo FROM pedido_destinatarios WHERE pedido_id = ? ORDER BY email`
    ).bind(p.id).all<any>();
    const { results: anteriores } = await db.prepare(
      `SELECT d.email, d.decidido_em, d.hash_lido FROM pedido_destinatarios d JOIN pedidos q ON q.id = d.pedido_id
        WHERE q.project_id = ? AND q.tipo = ? AND q.ref_id = ? AND q.id <> ? AND q.status = 'substituido' AND d.status = 'ciente'
        ORDER BY d.decidido_em DESC`
    ).bind(p.project_id, p.tipo, p.ref_id, p.id).all<any>();
    const anterior = new Map<string, unknown>();
    for (const a of anteriores) if (!anterior.has(a.email)) anterior.set(a.email, { decidido_em: a.decidido_em, hash_lido: a.hash_lido });

    // Portal antigo: a ciência era pelo título (ou id) do controle, sem versão.
    const antigo = new Map<string, unknown>();
    if (p.tipo === 'politica') {
      const titulo = String(JSON.parse(p.conteudo_json).title ?? '');
      const { results } = await db.prepare(
        `SELECT lower(user_email) AS email, user_name, acknowledged_at FROM policy_acknowledgments
          WHERE project_id = ? AND policy_type IN (?, ?) ORDER BY acknowledged_at DESC`
      ).bind(p.project_id, titulo, p.ref_id).all<any>();
      for (const r of results) if (!antigo.has(r.email)) antigo.set(r.email, { user_name: r.user_name, acknowledged_at: r.acknowledged_at, hash: null });
    }

    // Pendente de ciência sem link e sem conta não tem como responder (substituto sem envio configurado,
    // ou envio que falhou): o painel avisa para usar "Reenviar".
    const semLink = p.papel_exigido === 'ciente' && p.status === 'aberto'
      ? (await db.prepare(`SELECT COUNT(*) AS n FROM pedido_destinatarios WHERE pedido_id = ? AND status = 'pendente' AND token_hash IS NULL AND user_id IS NULL`)
        .bind(p.id).first<{ n: number }>())?.n ?? 0
      : 0;

    const { conteudo_json: _conteudo, ...pedido } = p;
    return c.json({
      pedido,
      sem_link: semLink,
      pode_cancelar: p.status === 'aberto' && !(await recusaCancelar(c, p)),
      destinatarios: dests.map((d) => ({
        ...d,
        situacao: d.status === 'pendente' ? (d.aberto_em ? 'pendente' : 'nao_abriu') : d.status,
        versao_anterior: anterior.get(d.email) ?? null,
        portal_antigo: antigo.get(d.email) ?? null,
      })),
    });
  } catch (e: any) {
    return erro500(c, 'Erro ao abrir o acompanhamento do pedido', e);
  }
});

/**
 * Lembrete só aos PENDENTES de um pedido de ciência aberto. Como só o hash fica no banco, lembrar é
 * emitir token novo: o link anterior da pessoa deixa de valer. Ciência gravada não é tocada (o
 * UPDATE exige `pendente`, e o trigger `pedido_dest_prova_imutavel` recusa de qualquer jeito).
 */
projectPedidosApp.post('/:id/reenviar', async (c) => {
  try {
    const recusa = await recusaPedir(c);
    if (recusa) return recusa;
    const db = c.env.DB;
    const user = c.get('user');
    const p = await pedidoDoProjeto(db, c.req.param('projectId') ?? '', c.req.param('id'));
    if (!p) return c.json({ error: 'Pedido não encontrado' }, 404);
    if (!c.env.RESEND_API_KEY) return c.json(SEM_EMAIL, 503);
    if (p.papel_exigido !== 'ciente') return c.json({ error: 'Só pedido de ciência tem link por e-mail' }, 400);
    const valid = await validateBody(c, pedidoReenvioSchema);
    if (!valid.success) return valid.response;
    // Com `emails` (ex.: as `falhas` do envio), só esses ganham link novo: quem já recebeu mantém o seu.
    const so = valid.data.emails ? new Set(valid.data.emails.map((e) => e.trim().toLowerCase())) : null;
    const vig = await conferirEAvisar(c, p);
    if (!vig.vigente) {
      return c.json({ error: 'Este pedido não está mais aberto.', status: vig.status, substituido_por: vig.substituido_por ?? null }, 409);
    }
    const links = await emitirLinks(db, p.id, so);
    const falhas = await enviarLinks(c, p.id, p.titulo, links, true);
    await logAudit(db, 'pedido.lembrete', user.email,
      `Pedido ${p.id}: lembrete a ${links.length} pendente(s), ${falhas.length} falha(s) de envio`, '', c.req.header('CF-Connecting-IP') ?? '', p.project_id);
    return c.json({ enviados: links.length - falhas.length, falhas }); // sem `ok: true`: ver POST /ciencia
  } catch (e: any) {
    return erro500(c, 'Erro ao reenviar o pedido de ciência', e);
  }
});

/**
 * Quem cancela um pedido: o autor (`criado_por`; para o agente, o consultor que o concedeu) ou o consultor designado no projeto
 * (a designação de `podePedir`; o agente do consultor conta como ele). Agente auditor nunca. Devolve a recusa, ou `null`.
 */
async function recusaCancelar(c: Context<Ctx>, p: PedidoRow): Promise<string | null> {
  const user = c.get('user');
  if (user.agente === true && user.agente_papel !== 'consultor') return 'O agente auditor não cancela pedido.';
  if (p.criado_por.toLowerCase() === quemPede(user).toLowerCase()) return null;
  const consultor = ehConsultor(user) || user.agente === true;
  if (consultor && !(await podePedir(c.env.DB, user, p.project_id))) return null;
  return 'Só quem pediu ou o consultor designado no projeto cancela o pedido.';
}

/** Cancela um pedido ABERTO, com motivo: os destinatários pendentes não decidem mais e ele sai de "Minhas aprovações". */
projectPedidosApp.post('/:id/cancelar', async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get('user');
    const p = await pedidoDoProjeto(db, c.req.param('projectId') ?? '', c.req.param('id'));
    if (!p) return c.json({ error: 'Pedido não encontrado' }, 404);
    const recusa = await recusaCancelar(c, p);
    if (recusa) return c.json({ error: recusa }, 403);
    const valid = await validateBody(c, pedidoCancelarSchema);
    if (!valid.success) return valid.response;
    // Só o aberto: a guarda no UPDATE também cobre a corrida com uma decisão ou uma substituição.
    const r = await db.prepare(`UPDATE pedidos SET status = 'cancelado' WHERE id = ? AND status = 'aberto'`).bind(p.id).run();
    if (!r.meta?.changes) return c.json({ error: 'Só pedido aberto é cancelado.', status: p.status }, 409);
    await logAudit(db, 'pedido.cancelado', user.email,
      `Pedido ${p.id} (${p.tipo} ${p.ref_id}, papel ${p.papel_exigido}) cancelado por ${user.email}`,
      valid.data.motivo, c.req.header('CF-Connecting-IP') ?? '', p.project_id);
    return c.json({ ok: true, status: 'cancelado' });
  } catch (e: any) {
    return erro500(c, 'Erro ao cancelar o pedido', e);
  }
});
