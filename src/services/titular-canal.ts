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

/** Decodifica (até 3 camadas de %): `%252F`, `%2Fsolicitacao` e links dentro de `?redirect=` viram texto puro para as buscas abaixo. */
const decodificado = (t: string): string => {
  let p = t;
  for (let i = 0; i < 3; i++) {
    let d: string;
    try { d = decodeURIComponent(p); } catch { break; }
    if (d === p) break;
    p = d;
  }
  return p.toLowerCase();
};

/** Host que serve o app: os listados, subdomínio deles (`www.`) e a prévia `*niso*`/`*n360*` em workers.dev. */
const hostDoApp = (h: string, hosts: readonly string[]): boolean =>
  hosts.some((x) => h === x || h.endsWith(`.${x}`)) || (h.endsWith('.workers.dev') && /niso|n360/.test(h));

/**
 * O link do portal (`<app>/solicitacao#<token>`, token = 64 hex) é credencial de portador. Recusa o endereço inteiro, decodificado,
 * se: o host é do app; aparece `solicitacao` em qualquer ponto (caminho, `;`, `..%2F`, query de redirecionamento, fragmento); aparece um
 * host do app em qualquer ponto; ou há uma sequência de 64 hex (o token) onde quer que esteja. 40 ou 32 hex (sha de git, md5) passam.
 */
export const urlDoApp = (url: string, hosts: readonly string[]): boolean => {
  const u = new URL(url);
  const t = `${decodificado(url)} ${decodificado(u.href)}`;
  return hostDoApp(nomeDoHost(u), hosts) || t.includes('solicitacao') || /[0-9a-f]{64}/.test(t) || hosts.some((h) => t.includes(h));
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
  const { canal: atual } = await lerCanal(db, projectId);
  // Só confere o responsável quando ele muda: o que já estava gravado não bloqueia a edição de outro campo (a parte pode ter sido inativada).
  const trocaResp = d.responsavel_parte_id && d.responsavel_parte_id !== atual?.responsavel_parte_id ? d.responsavel_parte_id : null;
  const MSG_RESP = 'responsavel_parte_id inexistente, inativo ou de outro projeto';
  if (trocaResp && !(await db.prepare(`SELECT 1 FROM partes WHERE id = ? AND project_id = ? AND status = 'ativa'`).bind(trocaResp, projectId).first())) {
    return { ok: false, status: 400, error: MSG_RESP };
  }
  const novo = Object.fromEntries(CAMPOS_CANAL.map((k) => [k, d[k] !== undefined ? d[k] : (atual?.[k] ?? null)])) as Record<CampoCanal, string | null>;
  const mudaram: string[] = CAMPOS_CANAL.filter((k) => (atual?.[k] ?? null) !== novo[k]);
  if (d.conferir && !novo.divulgacao_url) return { ok: false, status: 422, error: 'Registre a página de divulgação antes de conferir' };
  // A conferência é da página: trocar a página apaga a anterior.
  const trocouPagina = mudaram.includes('divulgacao_url');
  const conferidoEm = d.conferir ? hojeEmSaoPaulo() : trocouPagina ? null : (atual?.conferido_em ?? null);
  const conferidoPor = d.conferir ? ator : trocouPagina ? null : (atual?.conferido_por ?? null);
  // O PUT troca a linha inteira (o último a gravar vence, como nas outras configurações do projeto). O responsável é conferido de novo
  // dentro do próprio INSERT (WHERE EXISTS): sem janela entre a checagem e a gravação, e `partes` não tem UNIQUE(id, project_id).
  const r = await db.prepare(
    `INSERT INTO titular_canal (id, project_id, email, telefone, formulario_url, divulgacao_url, responsavel_parte_id, conferido_em, conferido_por, atualizado_por)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ?11 IS NULL OR EXISTS (SELECT 1 FROM partes WHERE id = ?11 AND project_id = ?2 AND status = 'ativa')
     ON CONFLICT(project_id) DO UPDATE SET email = excluded.email, telefone = excluded.telefone, formulario_url = excluded.formulario_url,
       divulgacao_url = excluded.divulgacao_url, responsavel_parte_id = excluded.responsavel_parte_id, conferido_em = excluded.conferido_em,
       conferido_por = excluded.conferido_por, atualizado_por = excluded.atualizado_por, updated_at = CURRENT_TIMESTAMP`,
  ).bind(crypto.randomUUID(), projectId, novo.email, novo.telefone, novo.formulario_url, novo.divulgacao_url, novo.responsavel_parte_id, conferidoEm, conferidoPor, ator, trocaResp).run();
  if (!r.meta.changes) return { ok: false, status: 400, error: MSG_RESP };
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
