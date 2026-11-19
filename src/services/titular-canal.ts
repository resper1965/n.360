import { logAudit } from '../helpers';
import { appUrl, APP_URL_PADRAO, ORIGENS_EXTRAS, HOSTS_LEGADOS } from '../config/url';
import { hojeEmSaoPaulo } from './hoje';
import { lerPortal } from './titular-pedidos';
import type { TitularCanalCorpo } from '../schemas';

/**
 * Canal do titular (migration 0117, spec 2026-11-19): por onde o titular fala com a empresa (e-mail, telefone, formulário) e a página
 * pública onde canal e encarregado aparecem. Uma linha por projeto. O meio existe quando o campo está preenchido; tirar é limpar.
 */
export const CAMPOS_CANAL = ['email', 'telefone', 'formulario_url', 'divulgacao_url', 'responsavel_parte_id'] as const;
type CampoCanal = (typeof CAMPOS_CANAL)[number];
export type LinhaCanal = {
  id: string; project_id: string; email: string | null; telefone: string | null; formulario_url: string | null; divulgacao_url: string | null;
  responsavel_parte_id: string | null; responsavel_nome: string | null; conferido_em: string | null; conferido_por: string | null;
  atualizado_por: string | null; updated_at: string;
};
export type ResumoDoCanal = { meios: ('email' | 'telefone' | 'formulario')[]; portal_ativo: boolean; divulgado: boolean; conferido_em: string | null };
type Falha = { ok: false; status: 400 | 422; error: string };

export const MSG_LINK_DO_PORTAL = 'Este é o link do portal do n.360 (é a chave de acesso do formulário): não o grave aqui. O portal ativo já conta como formulário.';

/** Nome de host comparável: minúsculo, sem porta e sem ponto final (`n360.ness.com.br.` é o mesmo servidor). */
const nomeDoHost = (u: URL): string => {
  let h = u.hostname.toLowerCase();
  while (h.endsWith('.')) h = h.slice(0, -1);
  return h;
};

/** Hosts que servem o app: o configurado, o padrão, os dos módulos e os legados. Endereço neles nunca é página do cliente. */
export const hostsDoApp = (env: { APP_URL?: string }): string[] =>
  [...new Set([appUrl(env), APP_URL_PADRAO, ...ORIGENS_EXTRAS, ...HOSTS_LEGADOS.map((h) => `https://${h}`)].map((u) => nomeDoHost(new URL(u))))];

/** Caminho sem barras no começo e sem %-codificação (até 3 camadas), em minúsculas: `//%53olicitacao` vira `solicitacao`. */
const caminhoLimpo = (pathname: string): string => {
  let p = pathname;
  for (let i = 0; i < 3; i++) {
    let d: string;
    try { d = decodeURIComponent(p); } catch { break; }
    if (d === p) break;
    p = d;
  }
  let ini = 0;
  while (ini < p.length && p[ini] === '/') ini++;
  return p.slice(ini).toLowerCase();
};

/** O link do portal (`<app>/solicitacao#<token>`) é credencial de portador: nem o host do app nem o caminho `/solicitacao` entram. */
export const urlDoApp = (url: string, hosts: readonly string[]): boolean => {
  const u = new URL(url);
  return hosts.includes(nomeDoHost(u)) || caminhoLimpo(u.pathname).startsWith('solicitacao');
};

export async function lerCanal(db: D1Database, projectId: string): Promise<{ canal: LinhaCanal | null; portal_ativo: boolean }> {
  const [canal, portal] = await Promise.all([
    db.prepare(`SELECT c.*, p.nome AS responsavel_nome FROM titular_canal c
                  LEFT JOIN partes p ON p.id = c.responsavel_parte_id AND p.project_id = c.project_id WHERE c.project_id = ?`)
      .bind(projectId).first<LinhaCanal>(),
    lerPortal(db, projectId),
  ]);
  return { canal: canal ?? null, portal_ativo: !!portal?.ativo };
}

export async function salvarCanal(db: D1Database, projectId: string, ator: string, d: TitularCanalCorpo, hosts: readonly string[]): Promise<Falha | { ok: true; campos: string[] }> {
  for (const k of ['formulario_url', 'divulgacao_url'] as const) {
    const v = d[k];
    if (v && urlDoApp(v, hosts)) return { ok: false, status: 422, error: MSG_LINK_DO_PORTAL };
  }
  if (d.responsavel_parte_id && !(await db.prepare('SELECT 1 FROM partes WHERE id = ? AND project_id = ?').bind(d.responsavel_parte_id, projectId).first())) {
    return { ok: false, status: 400, error: 'responsavel_parte_id inexistente ou de outro projeto' };
  }
  const { canal: atual } = await lerCanal(db, projectId);
  const novo = Object.fromEntries(CAMPOS_CANAL.map((k) => [k, d[k] !== undefined ? d[k] : (atual?.[k] ?? null)])) as Record<CampoCanal, string | null>;
  const mudaram: string[] = CAMPOS_CANAL.filter((k) => (atual?.[k] ?? null) !== novo[k]);
  if (d.conferir && !novo.divulgacao_url) return { ok: false, status: 422, error: 'Registre a página de divulgação antes de conferir' };
  // A conferência é da página: trocar a página apaga a anterior.
  const trocouPagina = mudaram.includes('divulgacao_url');
  const conferidoEm = d.conferir ? hojeEmSaoPaulo() : trocouPagina ? null : (atual?.conferido_em ?? null);
  const conferidoPor = d.conferir ? ator : trocouPagina ? null : (atual?.conferido_por ?? null);
  await db.prepare(
    `INSERT INTO titular_canal (id, project_id, email, telefone, formulario_url, divulgacao_url, responsavel_parte_id, conferido_em, conferido_por, atualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET email = excluded.email, telefone = excluded.telefone, formulario_url = excluded.formulario_url,
       divulgacao_url = excluded.divulgacao_url, responsavel_parte_id = excluded.responsavel_parte_id, conferido_em = excluded.conferido_em,
       conferido_por = excluded.conferido_por, atualizado_por = excluded.atualizado_por, updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), projectId, novo.email, novo.telefone, novo.formulario_url, novo.divulgacao_url, novo.responsavel_parte_id, conferidoEm, conferidoPor, ator).run();
  const campos = [...mudaram, ...(d.conferir ? ['conferencia'] : [])];
  // Só os NOMES dos campos: o endereço do canal (e-mail do encarregado, às vezes) não vai para a trilha.
  await logAudit(db, 'titular.canal', ator, `Canal do titular atualizado: ${campos.join(', ') || 'nada mudou'}`, '', '', projectId);
  return { ok: true, campos };
}

const MEIOS = [['email', 'email'], ['telefone', 'telefone'], ['formulario_url', 'formulario']] as const;

/** O que o painel e a trilha leem. Tabela ausente (produção antes da 0117): canal vazio e um aviso no log, nunca erro no painel. */
export async function resumoDoCanal(db: D1Database, projectId: string): Promise<ResumoDoCanal> {
  const portal_ativo = !!(await lerPortal(db, projectId))?.ativo;
  let c: Pick<LinhaCanal, 'email' | 'telefone' | 'formulario_url' | 'divulgacao_url' | 'conferido_em'> | null;
  try {
    c = await db.prepare('SELECT email, telefone, formulario_url, divulgacao_url, conferido_em FROM titular_canal WHERE project_id = ?')
      .bind(projectId).first();
  } catch (e) {
    if (!/no such table: titular_canal/i.test(String((e as Error)?.message ?? e))) throw e;
    console.log(JSON.stringify({ nivel: 'warn', msg: 'titular_canal_ausente', projeto: projectId }));
    c = null;
  }
  return c
    ? { meios: MEIOS.filter(([k]) => !!c![k]).map(([, m]) => m), portal_ativo, divulgado: !!c.divulgacao_url, conferido_em: c.conferido_em }
    : { meios: [], portal_ativo, divulgado: false, conferido_em: null };
}
