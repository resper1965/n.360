import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { genId, logAudit, erro500, rateLimitD1, invalidateUserSessions } from '../helpers';
import { validateBody, criarOrgSchema, atualizarOrgSchema, orgModulosSchema, MODULOS, parseModulos } from '../schemas';
import { ORG_NESS, SQL_EQUIPE } from '../services/organizacao';
import { enviarBoasVindas } from './users';
import { SEM_SENHA } from '../services/convite';

/**
 * Organizações (consultorias), fatia 5: só o `platform_admin`. Montado em `/api/v1/platform/orgs`,
 * que o agente MCP não alcança (`FORA_DO_AGENTE`). O `consultoria_admin` administra a PRÓPRIA
 * organização por `/api/v1/org/*`, nunca por aqui.
 */
export const organizacoesApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

organizacoesApp.use('*', async (c, next) => {
  if (c.get('user')?.role !== 'platform_admin') return c.json({ error: 'Forbidden: só o administrador da plataforma gere consultorias' }, 403);
  await next();
});

const unico = (e: unknown) => String((e as any)?.message ?? e).includes('UNIQUE');

/*
 * Cria a organização e o administrador dela num batch só (com a trilha): ou nasce tudo, ou nada.
 * O id é `org_<slug>`: legível na trilha e no X-Org-Id, e único porque o slug é. O administrador
 * entra pelo fluxo de primeiro acesso de `POST /users`: conta sem senha (`SEM_SENHA`),
 * `requires_password_change = 1` e o mesmo convite com link para criar a senha. O token nunca volta na
 * resposta nem vai para log; se o e-mail falhar, a organização fica e a resposta diz `emailEnviado: false`
 * (o administrador entra por "esqueci a senha", ou o platform_admin reenvia o convite).
 */
organizacoesApp.post('/', async (c) => {
  try {
    const v = await validateBody(c, criarOrgSchema);
    if (!v.success) return v.response;
    const b = v.data;
    const db = c.env.DB;
    const id = `org_${b.slug}`;
    const conflito = await db.prepare(`SELECT
        EXISTS (SELECT 1 FROM organizations WHERE slug = ? OR id = ?) AS slug,
        EXISTS (SELECT 1 FROM organizations WHERE upper(prefixo_proposta) = ?) AS prefixo,
        EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(?)) AS email`)
      .bind(b.slug, id, b.prefixoProposta ?? null, b.adminEmail).first<{ slug: number; prefixo: number; email: number }>();
    if (conflito?.slug) return c.json({ error: 'Slug já usado por outra consultoria' }, 409);
    if (conflito?.prefixo) return c.json({ error: 'Prefixo de proposta já usado por outra consultoria' }, 409);
    // Qualquer organização: o e-mail é a identidade de login, global.
    if (conflito?.email) return c.json({ error: 'E-mail do administrador já cadastrado' }, 409);

    const ator = c.get('user').email;
    const adminId = genId();
    try {
      await db.batch([
        db.prepare(`INSERT INTO organizations (id, name, slug, plan, max_projects, max_users, owner_id, status, cnpj, prefixo_proposta,
          proximo_numero, termo_aceito_em, termo_versao, tipo, modulos_contratados) VALUES (?, ?, ?, 'consultoria', ?, ?, ?, 'Active', ?, ?, 1, datetime('now'), ?, ?, ?)`)
          // Sem prefixo grava NULL: o índice único parcial deixa várias organizações sem prefixo.
          .bind(id, b.nome, b.slug, b.maxProjetos, b.maxUsuarios, adminId, b.cnpj ?? null, b.prefixoProposta ?? null, b.termoVersao, b.tipo,
            JSON.stringify(b.modulos ?? ['iso'])),
        db.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id, requires_password_change)
          VALUES (?, ?, ?, ?, 'consultoria_admin', NULL, ?, 1)`).bind(adminId, b.adminEmail, SEM_SENHA, b.adminNome, id),
        db.prepare(`INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id, created_at)
          VALUES (?, 'org.criada', ?, ?, '', ?, NULL, datetime('now'))`)
          .bind(genId(), ator, `Organização ${id} (${b.slug}) criada por ${ator}; administrador ${b.adminEmail}; tipo ${b.tipo}; módulos ${(b.modulos ?? ['iso']).join(',')}; termo de uso ${b.termoVersao}`,
            c.req.header('CF-Connecting-IP') ?? ''),
      ]);
    } catch (e) {
      // corrida entre a conferência acima e o batch: o UNIQUE do banco decide
      if (unico(e)) return c.json({ error: 'Slug, prefixo de proposta ou e-mail já cadastrado' }, 409);
      throw e;
    }
    const emailEnviado = await enviarBoasVindas(c, { id: adminId, email: b.adminEmail, name: b.adminNome, role: 'consultoria_admin' }, b.nome).catch(() => false);
    return c.json({ id, slug: b.slug, adminId, adminEmail: b.adminEmail, emailEnviado }, 201);
  } catch (e) { return erro500(c, 'Erro ao criar a consultoria', e); }
});

/** Administrador da organização `o` que ainda não entrou (senha provisória pendente), ativo. */
const ADMIN_PENDENTE = `org_id = o.id AND role = 'consultoria_admin' AND requires_password_change = 1 AND COALESCE(ativo, 1) <> 0`;

/**
 * Lista com contagens (projetos, usuários da EQUIPE — o que o `max_users` limita —, propostas por
 * status) e `adminPendente` (o administrador ainda não entrou: a tela oferece "Reenviar convite").
 * Nunca conteúdo.
 */
organizacoesApp.get('/', async (c) => {
  try {
    const db = c.env.DB;
    const [orgs, props] = await db.batch<any>([
      db.prepare(`SELECT o.id, o.name, o.slug, o.plan, o.status, o.max_projects, o.max_users, o.termo_aceito_em, o.termo_versao, o.created_at, o.modulos_contratados, o.tipo,
        (SELECT COUNT(*) FROM projects p WHERE p.org_id = o.id) AS projetos,
        (SELECT COUNT(*) FROM users WHERE org_id = o.id AND ${SQL_EQUIPE}) AS usuarios,
        EXISTS (SELECT 1 FROM users WHERE ${ADMIN_PENDENTE}) AS admin_pendente
        FROM organizations o ORDER BY o.created_at, o.id`),
      db.prepare('SELECT org_id, status, COUNT(*) AS n FROM propostas GROUP BY org_id, status'),
    ]);
    const porOrg: Record<string, Record<string, number>> = {};
    for (const r of props.results) (porOrg[r.org_id] ??= {})[r.status] = r.n;
    return c.json(orgs.results.map((o) => ({
      id: o.id, nome: o.name, slug: o.slug, plano: o.plan, status: o.status,
      maxProjetos: o.max_projects, maxUsuarios: o.max_users, termoAceitoEm: o.termo_aceito_em, termoVersao: o.termo_versao,
      criadaEm: o.created_at, projetos: o.projetos, usuarios: o.usuarios, propostas: porOrg[o.id] ?? {},
      adminPendente: !!o.admin_pendente, modulosContratados: parseModulos(o.modulos_contratados), tipo: o.tipo,
    })));
  } catch (e) { return erro500(c, 'Erro ao listar as consultorias', e); }
});

/** Limites, nome e status. `Suspended` bloqueia a equipe da organização (login e sessão aberta). */
organizacoesApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const v = await validateBody(c, atualizarOrgSchema);
    if (!v.success) return v.response;
    const b = v.data;
    const db = c.env.DB;
    if (!(await db.prepare('SELECT 1 FROM organizations WHERE id = ?').bind(id).first())) return c.json({ error: 'Consultoria não encontrada' }, 404);
    // A ness. opera a plataforma: suspendê-la trancaria a própria equipe que desfaria a suspensão.
    if (id === ORG_NESS && b.status === 'Suspended') return c.json({ error: 'A ness. não pode ser suspensa' }, 409);
    await db.prepare(`UPDATE organizations SET name = COALESCE(?, name), max_projects = COALESCE(?, max_projects),
      max_users = COALESCE(?, max_users), status = COALESCE(?, status) WHERE id = ?`)
      .bind(b.nome ?? null, b.maxProjetos ?? null, b.maxUsuarios ?? null, b.status ?? null, id).run();
    await logAudit(db, 'org.atualizada', c.get('user').email, `Organização ${id} atualizada: ${JSON.stringify(b)}`);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Erro ao atualizar a consultoria', e); }
});

/** Módulos que a consultoria contratou: o teto do que cada projeto dela pode habilitar. */
organizacoesApp.put('/:id/modulos', async (c) => {
  try {
    const id = c.req.param('id');
    const v = await validateBody(c, orgModulosSchema);
    if (!v.success) return v.response;
    const db = c.env.DB;
    if (!(await db.prepare('SELECT 1 FROM organizations WHERE id = ?').bind(id).first())) return c.json({ error: 'Consultoria não encontrada' }, 404);
    const modulos = MODULOS.filter((m) => v.data.modulos.includes(m));
    for (const m of MODULOS.filter((x) => !modulos.includes(x))) {
      const em = await db.prepare(
        `SELECT count(*) AS n FROM projeto_modulos pm JOIN projects p ON p.id = pm.project_id WHERE p.org_id = ? AND pm.modulo = ?`
      ).bind(id, m).first<{ n: number }>();
      if (em && em.n > 0) return c.json({ error: `O módulo ${m} está habilitado em ${em.n} projeto(s) da consultoria` }, 409);
    }
    await db.prepare('UPDATE organizations SET modulos_contratados = ? WHERE id = ?').bind(JSON.stringify(modulos), id).run();
    await logAudit(db, 'org.modulos', c.get('user').email, `Organização ${id}: módulos contratados ${JSON.stringify(modulos)}`);
    return c.json({ ok: true, modulos });
  } catch (e) { return erro500(c, 'Erro ao atualizar os módulos', e); }
});

/*
 * Reenvia o convite do administrador que ainda não entrou (o e-mail de boas-vindas falhou ou se
 * perdeu): convite novo (o link anterior deixa de valer), `requires_password_change = 1`, sessões dele
 * derrubadas e o mesmo e-mail. Quem já entrou usa "Esqueci a senha" (409). O token nunca vai para a
 * resposta, o log ou a trilha. 5 por hora por organização.
 */
organizacoesApp.post('/:id/reenviar-convite', async (c) => {
  try {
    const id = c.req.param('id');
    const db = c.env.DB;
    const org = await db.prepare('SELECT name FROM organizations WHERE id = ?').bind(id).first<{ name: string }>();
    if (!org) return c.json({ error: 'Consultoria não encontrada' }, 404);
    if (!(await rateLimitD1(db, `reenviar_convite:${id}`, 5, 3600))) return c.json({ error: 'Muitos reenvios para esta consultoria; tente mais tarde' }, 429);
    // O dono (quem a criação convidou) primeiro; senão o administrador pendente mais antigo.
    const admin = await db.prepare(`SELECT u.id, u.email, u.name FROM organizations o JOIN users u ON u.org_id = o.id
        WHERE o.id = ? AND u.role = 'consultoria_admin' AND u.requires_password_change = 1 AND COALESCE(u.ativo, 1) <> 0
        ORDER BY (u.id = o.owner_id) DESC, u.created_at LIMIT 1`).bind(id).first<{ id: string; email: string; name: string }>();
    if (!admin) return c.json({ error: 'O administrador já entrou: para recuperar o acesso, use "Esqueci a senha"' }, 409);
    // Convite novo (o link anterior e a senha provisória de antes do convite por link deixam de valer).
    await db.prepare('UPDATE users SET password_hash = ?, requires_password_change = 1 WHERE id = ?').bind(SEM_SENHA, admin.id).run();
    await invalidateUserSessions(c.env.SESSIONS, admin.id);
    await logAudit(db, 'org.convite_reenviado', c.get('user').email, `Convite do administrador ${admin.email} da organização ${id} reenviado`);
    const emailEnviado = await enviarBoasVindas(c, { ...admin, role: 'consultoria_admin' }, org.name).catch(() => false);
    return c.json({ emailEnviado });
  } catch (e) { return erro500(c, 'Erro ao reenviar o convite', e); }
});
