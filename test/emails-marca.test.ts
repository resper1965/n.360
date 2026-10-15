import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy, concederModulos } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { COR, dataBr, montarEmail, remetente } from '../src/services/email-layout';
import { emailAlertaSonda, emailProposta } from '../src/services/emails';
import { emailResumo } from '../src/services/avisos-prazo';

/**
 * Invólucro único de e-mail (src/services/email-layout.ts): cada e-mail que o n.360 envia diz quem
 * pede, o que fazer e até quando, leva o link em botão e em texto, tem rodapé e versão em texto puro,
 * escapa o dado interpolado e usa a marca do produto certo. Dados fictícios.
 */

// ── contraste WCAG 2.x ───────────────────────────────────────────────────────────────────────────
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe('invólucro', () => {
  it('cores com contraste AA: botão, texto, apoio e rodapé', () => {
    expect(contraste(COR.botaoTexto, COR.botao)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(COR.texto, COR.cartao)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(COR.apoio, COR.cartao)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(COR.apoio, COR.rodape)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(COR.texto, COR.fundo)).toBeGreaterThanOrEqual(4.5); // o código de verificação
    // o que havia antes e não pode voltar: branco sobre o acento
    expect(contraste('#ffffff', COR.ponto)).toBeLessThan(4.5);
  });

  it('escapa todo dado interpolado: nome, título, link e mensagem', () => {
    const ruim = '<script>alert("x")</script> \'aspas\'';
    const m = montarEmail({
      assunto: ruim, titulo: ruim, saudacao: ruim, paragrafos: [ruim], mensagem: ruim, acao: ruim, prazo: ruim,
      quemPede: { nome: ruim, email: 'a@b.lat', organizacao: ruim }, codigo: ruim, dados: [[ruim, ruim]], listas: [{ titulo: ruim, itens: [ruim] }],
      botao: { rotulo: ruim, url: 'https://x.lat/"><script>' }, notas: [ruim], motivo: ruim, contato: { nome: ruim, email: 'a@b.lat' },
    });
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('"x"');
    expect(m.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &#39;aspas&#39;');
    expect(m.text).toContain(ruim); // texto puro não é HTML: vai como está
  });

  it('marca do produto no cabeçalho e no rodapé, com o ponto na cor; texto puro com rodapé', () => {
    const m = montarEmail({ produto: 'n.privacy', assunto: 'A', titulo: 'T', motivo: 'sim.' });
    expect(m.html).toContain('n<span style="color:#00ade8;">.</span>privacy');
    expect(m.html).toContain('ness<span style="color:#00ade8;">.</span>');
    expect(m.html).toContain('Você recebeu este e-mail porque sim.');
    expect(m.html).toContain('Este endereço não recebe respostas.');
    expect(m.text).toMatch(/^n\.privacy \| ness\.\n/);
    expect(m.text).toContain('--\nVocê recebeu este e-mail porque sim.');
  });

  it('dataBr: data pura não muda de dia; datetime do SQLite (UTC) vira o dia de Brasília', () => {
    expect(dataBr('2026-10-27')).toBe('27/10/2026');
    expect(dataBr('2026-10-28 02:30:00')).toBe('27/10/2026');
    expect(dataBr('2026-10-28 03:30:00')).toBe('28/10/2026');
    expect(dataBr(null)).toBe('');
  });

  it('remetente: domínio verificado, nome sem <, > nem aspas', () => {
    expect(remetente()).toBe('n.360 | ness. <noreply@ness.com.br>');
    expect(remetente('n.privacy', 'Cliente "X" <a@b>\r\nBcc: y')).toBe('Cliente X a@b Bcc: y via n.privacy <noreply@ness.com.br>');
  });
});

// ── e-mails de verdade, pelas rotas, com o D1 real ──────────────────────────────────────────────
type Enviado = { to: string[]; from: string; subject: string; html: string; text: string; reply_to?: string };
let enviados: Enviado[] = [];
const ultimo = (to: string) => [...enviados].reverse().find((e) => e.to[0] === to)!;
const ENV = () => ({ ...workerEnv(), RESEND_API_KEY: 're_teste' });
let ip = 0;
const chamar = (h: Record<string, string>, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  app.fetch(new Request('http://localhost' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.9.0.${++ip % 250}`, ...h },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo ?? {}),
  }), { ...ENV(), ...extra } as any);

/** O que todo e-mail tem de ter, no HTML e no texto puro. */
function confere(e: Enviado, o: { produto: string; quem?: string[]; acao: string; prazo?: string; link?: string; resposta?: string }) {
  expect(e.text, 'texto puro').toBeTruthy();
  for (const corpo of [e.html, e.text]) {
    for (const q of o.quem ?? []) expect(corpo).toContain(q);
    expect(corpo).toContain(o.acao);
    if (o.prazo) expect(corpo).toContain(o.prazo);
    if (o.link) expect(corpo).toContain(o.link);
    expect(corpo).toContain('Você recebeu este e-mail porque');
  }
  expect(e.text).toContain('Quem pede:'.repeat(o.quem?.length ? 1 : 0));
  const [antes, depois] = o.produto.split('.');
  expect(e.html).toContain(`${antes}<span style="color:#00ade8;">.</span>${depois}`);
  expect(e.from).toMatch(/<noreply@ness\.com\.br>$/);
  if (o.produto === 'n.360') {
    expect(e.html + e.text + e.subject + e.from).not.toContain('n.iso');
    expect(e.html + e.text + e.subject + e.from).not.toContain('n.privacy');
  }
  if (o.link) expect(e.html).toContain(`background:${COR.botao};"><a href="${o.link.replace(/"/g, '&quot;')}`);
  expect(e.html).not.toContain('color: #ffffff; padding'); // o botão antigo, branco sobre #00ade8
  if (o.resposta) expect(e.reply_to).toBe(o.resposta);
}

const P = 'em-proj';
const POL = 'em-pol';
const CLIENTE = 'Metalúrgica <Exemplo> "Fictícia"';
const CLIENTE_ESC = 'Metalúrgica &lt;Exemplo&gt; &quot;Fictícia&quot;';
let consultor: Record<string, string>, admin: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  const h = await hashPassword('senha-forte-123');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, ?, 'ISO 27001', 'controller', 'Active', 'org_ness')`).bind(P, CLIENTE),
    env.DB.prepare(`INSERT INTO compliance_controls (id, project_id, standard, title, description) VALUES (?, ?, 'ISO 27001', 'Política <b>de</b> Segurança', 'Texto v1')`).bind(POL, P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('em-cons', 'ana@ness.lat', ?, 'Ana Fictícia', 'consultor', 'org_ness'),
      ('em-adm', 'adm@ness.lat', ?, 'Adm Fictício', 'platform_admin', 'org_ness')`).bind(h, h),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('em-g', ?, 'Ana Fictícia', 'ana@ness.lat', 'consultor', 'Consultor')`).bind(P),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('em-forn', ?, 'organizacao', 'Fornecedor <Fictício>', 'medio')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await concederModulos('em-cons', ['iso', 'privacy']);
  consultor = await sessionFor({ id: 'em-cons', email: 'ana@ness.lat', name: 'Ana Fictícia', role: 'consultor' });
  admin = await sessionFor({ id: 'em-adm', email: 'adm@ness.lat', name: 'Adm Fictício', role: 'platform_admin' });
}, 60_000);

beforeEach(() => {
  enviados = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((async (u: RequestInfo | URL, init?: RequestInit) => {
    if (!String(u).startsWith('https://api.resend.com/')) throw new Error(`fetch inesperado: ${u}`);
    enviados.push(JSON.parse(String(init?.body)));
    return new Response('{}', { status: 200 });
  }) as typeof fetch);
});
afterEach(() => vi.restoreAllMocks());

describe('cada e-mail', () => {
  it('ciência por link e o código: quem pede, o quê, até quando, link, resposta a quem pediu', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/pedidos/ciencia`, { tipo: 'politica', ref_id: POL, destinatarios: [{ email: 'leitor@cliente.lat', nome: 'Leitor <i>Fictício</i>' }] });
    expect(r.status, await r.clone().text()).toBe(201);
    const e = ultimo('leitor@cliente.lat');
    const link = /https:\/\/n360\.ness\.com\.br\/politicas#[0-9a-f]{64}/.exec(e.text)![0];
    confere(e, {
      produto: 'n.360', quem: ['Ana Fictícia (ana@ness.lat), da ness.'], acao: 'Abrir o link, ler o documento e confirmar',
      prazo: dataBr(new Date(Date.now() + 30 * 86_400_000)), link, resposta: 'ana@ness.lat',
    });
    expect(e.subject).toContain(CLIENTE);
    expect(e.html).toContain(CLIENTE_ESC);
    expect(e.html).toContain('Leitor &lt;i&gt;Fictício&lt;/i&gt;');
    expect(e.html).not.toContain('<i>');
    expect(e.from).toBe('Metalúrgica Exemplo Fictícia via n.360 <noreply@ness.com.br>');
    expect(e.text).not.toContain('deixou de valer'); // primeiro envio: não há link anterior

    const c = await app.fetch(new Request('http://localhost/api/v1/public/pedidos/codigo', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.1.1' }, body: JSON.stringify({ token: link.split('#')[1] }),
    }), ENV() as any);
    expect(c.status, await c.clone().text()).toBe(200);
    const cod = ultimo('leitor@cliente.lat');
    confere(cod, { produto: 'n.360', quem: ['Ana Fictícia (ana@ness.lat)'], acao: 'Digitar este código na página do documento', prazo: '15 minutos', resposta: 'ana@ness.lat' });
    expect(cod.text).toMatch(/Código: \d{6}/);
  });

  it('código do portal de políticas', async () => {
    const r = await chamar({}, 'POST', '/api/v1/public/policies/request-otp', { project_id: P, name: '<script>x</script>', email: 'func@cliente.lat' }, { ENVIRONMENT: 'test' });
    expect(r.status, await r.clone().text()).toBe(200);
    const e = ultimo('func@cliente.lat');
    confere(e, { produto: 'n.360', quem: [], acao: 'Digitar este código no portal de políticas', prazo: '15 minutos' });
    expect(e.html).toContain(`Quem pede</td>`);
    expect(e.html).toContain(CLIENTE_ESC);
    expect(e.html).not.toContain('<script>');
    expect(e.text).toContain(`Código: ${(await r.json<any>()).demo_otp}`);
  });

  it('redefinição de senha: n.360, código legível, sem n.iso', async () => {
    const r = await chamar({}, 'POST', '/api/v1/auth/forgot-password', { email: 'ana@ness.lat' }, { ENVIRONMENT: 'test' });
    expect(r.status).toBe(200);
    const e = ultimo('ana@ness.lat');
    confere(e, { produto: 'n.360', acao: 'Digitar este código na tela de redefinição de senha', prazo: '1 hora' });
    expect(e.text).toContain(`Código: ${(await r.json<any>()).reset_token}`);
    expect(e.html).toContain(`color:${COR.texto};"><strong>`); // o código em #0f172a, não em #00ade8
  });

  it('convite de conta: quem convida, a organização, n.360 e resposta a quem convidou', async () => {
    const r = await chamar(admin, 'POST', '/api/v1/users', { email: 'nova@cliente.lat', password: 'Senha-Temporaria-123', name: 'Nova <b>Pessoa</b>', role: 'org_user', client_project_id: P });
    expect(r.status, await r.clone().text()).toBe(201);
    const e = ultimo('nova@cliente.lat');
    confere(e, { produto: 'n.360', quem: ['Adm Fictício (adm@ness.lat), da ness.'], acao: 'Entrar com a senha temporária', link: 'https://n360.ness.com.br', resposta: 'adm@ness.lat' });
    expect(e.html).toContain('Nova &lt;b&gt;Pessoa&lt;/b&gt;');
    expect(e.subject).toBe('Seu acesso ao n.360 (ness.)');
  });

  it('homologação ao fornecedor: n.privacy, botão, data dd/mm/aaaa e resposta ao consultor', async () => {
    const r = await chamar(consultor, 'POST', `/api/v1/projects/${P}/homologacoes`, { parte_id: 'em-forn', dias: 10, email: 'contato@fornecedor.lat' });
    expect(r.status, await r.clone().text()).toBe(201);
    const d = await r.json<{ url: string; expira_em: string; email_enviado: boolean }>();
    expect(d.email_enviado).toBe(true);
    const e = ultimo('contato@fornecedor.lat');
    confere(e, {
      produto: 'n.privacy', quem: ['Ana Fictícia (ana@ness.lat), da ness.'], acao: 'Responder ao questionário em nome de',
      prazo: dataBr(d.expira_em), link: d.url, resposta: 'ana@ness.lat',
    });
    expect(dataBr(d.expira_em)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(e.html).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(e.html).toContain('Fornecedor &lt;Fictício&gt;');
    expect(e.from).toBe('Metalúrgica Exemplo Fictícia via n.privacy <noreply@ness.com.br>');
  });
});

describe('e-mails montados direto (a rota já tem teste próprio)', () => {
  it('proposta: quem envia, validade, link e mensagem escapada', () => {
    const m = emailProposta({ organizacao: 'ness.', numero: 'NESS-0001', revisao: 2, validaAte: '2099-12-31', link: 'https://n360.ness.com.br/proposta#abc',
      quem: { nome: 'Comercial Fictício', email: 'com@ness.lat', organizacao: 'ness.' }, mensagem: '<b>Oi</b>' });
    confere({ ...m, to: [], from: remetente('n.360', 'ness.'), subject: m.assunto }, {
      produto: 'n.360', quem: ['Comercial Fictício (com@ness.lat), da ness.'], acao: 'Abrir a proposta e responder', prazo: '31/12/2099', link: 'https://n360.ness.com.br/proposta#abc',
    });
    expect(m.html).toContain('&lt;b&gt;Oi&lt;/b&gt;');
  });

  it('resumo de prazos: lista por projeto, prazo mais próximo e n.360', () => {
    const m = emailResumo([
      { id: '1', user_id: 'u', email: 'a@b.lat', nome: 'Ana', projeto: 'Projeto <X>', fonte: 'capa', marco: 'D0', vence_em: '2026-10-20', titulo: 'Trocar <b>senhas</b>' },
      { id: '2', user_id: 'u', email: 'a@b.lat', nome: 'Ana', projeto: 'Projeto <X>', fonte: 'capa', marco: 'atraso', vence_em: '2026-10-10', titulo: 'Outra' },
    ] as any, 'https://n360.ness.com.br');
    confere({ ...m, to: [], from: remetente(), subject: 'n.360: 2 prazos para acompanhar' }, { produto: 'n.360', acao: 'Abrir o n.360 e tratar cada item', prazo: '10/10/2026', link: 'https://n360.ness.com.br' });
    expect(m.html).toContain('Projeto &lt;X&gt;');
    expect(m.html).toContain('Trocar &lt;b&gt;senhas&lt;/b&gt;');
  });

  it('alerta da sonda: invólucro, sem botão', () => {
    const m = emailAlertaSonda('n.360: dependência de produção sem resposta', ['D1 DB: <erro>']);
    expect(m.html).toContain('D1 DB: &lt;erro&gt;');
    expect(m.text).toContain('ALERTA_EMAIL');
    expect(m.html).not.toContain('n.iso');
  });
});
