// Regras de acesso do inventário do n.ot num lugar só (spec §5; modelo de ameaças P0-2, P0-4, P0-6). As rotas não decidem papel
// nem site por conta própria: perguntam aqui.
import { PROJETOS_DO_CONSULTOR_SQL, ehConsultor } from '../helpers';
import { aadOt, decifrarOt, mascararMac, type ChavesOt } from './ot-cifra';
import { adminDireto } from './organizacao';

/** LIMIT explícito das leituras que decidem (acesso, deduplicação, confronto, zonas): sem ele o query-cap corta em 500 em silêncio.
 *  shortcut: um site (ou projeto) com mais de 20.000 linhas fica cortado aqui; ao chegar perto disso, paginar ou indexar no banco. */
export const TETO_LEITURA_OT = 20000;

export interface AtorOt { id: string; email: string; role: string; agente?: boolean; org_id?: string | null }

/** Cargo do Gestor ARCiber em `project_governance` (spec §3): a mesma regra no 4.2.1 e no aviso do step-up (ot-stepup.ts). */
export const CARGO_GESTOR_ARCIBER = `lower(trim(job_title)) = 'gestor arciber'`;

/** Gestor ARCiber da organização direta: o admin direto que também consta no cargo (titular ou suplente), pelo e-mail. */
export async function gestorArciberDireto(db: D1Database, u: AtorOt, projectId: string): Promise<boolean> {
  if (!await adminDireto(db, u, projectId)) return false;
  if (!u.email?.trim()) return false;
  return !!await db.prepare(`SELECT 1 FROM project_governance WHERE project_id = ? AND ${CARGO_GESTOR_ARCIBER} AND coalesce(trim(email), '') <> '' AND lower(email) = lower(?)`)
    .bind(projectId, u.email).first();
}

const naoEhPessoa = (u: AtorOt) => u.agente === true || u.id.startsWith('apikey:');

/** Quem cadastra e altera o inventário: Gestor ARCiber (org_admin) e a equipe. Técnico (org_user) e client, não (P1-2: o técnico cria lote, na N3). */
export const podeEditarOt = (u: AtorOt) => !naoEhPessoa(u) && ['org_admin', 'consultor', 'consultant', 'consultoria_admin', 'platform_admin'].includes(u.role);

/**
 * Lista fechada das escritas do técnico (org_user), relativas a `/ot` (E3): abrir levantamento, registrar e enviar achados, trazer dados
 * pelo de-para e o lote manual. Cada rota confere o site concedido (`daLista`/`lerLevantamento`, P0-4). Fora daqui o técnico só lê:
 * site, zona, ativo, fluxo, decisão de lote e base seguem de quem edita. Usada pelo middleware de ot.ts e pelo allow-list de auth.ts.
 */
export const ESCRITAS_DO_TECNICO = new RegExp('^(/levantamentos(/[^/]+(?:/enviar|/achados|/achados/[^/]+|/depara/(planilha/(proposta|aplicar)|texto))?)?'
  + '|/sites/[^/]+/enviar|/lotes/manual)$');

/** Escrita do técnico: o POST/PUT da lista fechada acima, só nos sites vinculados (a rota confere). */
export const podeCriarLote = (u: AtorOt) => podeEditarOt(u) || (!naoEhPessoa(u) && u.role === 'org_user');

/**
 * IP/MAC em claro (P0-6, §12.1 pergunta 1 e 2): Gestor ARCiber (org_admin), consultor designado e consultoria_admin SÓ no projeto
 * em que também está designado. platform_admin vê mascarado e revela por ação registrada. Decide pelo `role` do principal, nunca
 * por `ehEquipeNess` (o agente com decisão passaria). O consultor só chega aqui designado (requireProjectAccess).
 */
export async function podeVerCompleto(db: D1Database, u: AtorOt, projectId: string): Promise<boolean> {
  if (naoEhPessoa(u)) return false;
  if (u.role === 'org_admin' || ehConsultor(u)) return true;
  if (u.role !== 'consultoria_admin') return false;
  return !!await db.prepare(`SELECT 1 FROM projects WHERE id = ? AND id IN (${PROJETOS_DO_CONSULTOR_SQL})`).bind(projectId, u.email).first();
}

/**
 * Aprovar ou rejeitar lote: quem revisa o inventário em claro (Gestor ARCiber, consultor designado, consultoria_admin designado),
 * para ver a duplicata que vai mesclar. platform_admin, técnico e client não. Quem criou o lote não decide (a rota confere; §12.1, 6).
 */
export const podeAprovar = podeVerCompleto;

/**
 * Os sites que a pessoa enxerga no projeto (P0-4): o ÚNICO filtro de site, usado por toda consulta `ot_*`. Técnico (org_user): só os
 * vinculados em `ot_site_acessos`; sem vínculo, nenhum. Os demais papéis que alcançam o projeto (o middleware já cortou quem não
 * alcança): todos os sites ativos. Devolve JSON, para `site_id IN (SELECT value FROM json_each(?))`.
 */
export async function sitesPermitidos(db: D1Database, u: AtorOt, projectId: string): Promise<string> {
  const { results } = u.role === 'org_user'
    ? await db.prepare(`SELECT s.id FROM ot_sites s JOIN ot_site_acessos a ON a.site_id = s.id AND a.user_id = ?
        WHERE s.project_id = ? AND s.status = 'ativo' LIMIT ${TETO_LEITURA_OT}`).bind(u.id, projectId).all<{ id: string }>()
    : await db.prepare(`SELECT id FROM ot_sites WHERE project_id = ? AND status = 'ativo' LIMIT ${TETO_LEITURA_OT}`).bind(projectId).all<{ id: string }>();
  return JSON.stringify(results.map((r) => r.id));
}

/** P0-4: fluxo só aparece se o site dele E cada ponta (ativo ou zona) estão em site permitido; ponta removida esconde o fluxo. */
export const FLUXO_VISIVEL = `f.project_id = ? AND f.status = 'ativo' AND f.site_id IN (SELECT value FROM json_each(?))
  AND NOT EXISTS (SELECT 1 FROM ot_ativos a WHERE a.id IN (f.origem_ativo_id, f.destino_ativo_id)
    AND (a.status <> 'ativo' OR a.site_id NOT IN (SELECT value FROM json_each(?))))
  AND NOT EXISTS (SELECT 1 FROM ot_zonas z WHERE z.id IN (f.origem_zona_id, f.destino_zona_id)
    AND (z.status <> 'ativo' OR z.site_id NOT IN (SELECT value FROM json_each(?))))`;

export interface LinhaAtivo {
  id: string; project_id: string; ip_cifrado: string | null; mac_cifrado: string | null; ip_hash: string | null; mac_hash: string | null;
  protocolos_portas: string; no_arciber: number; firmware_nao_aplicavel: number; [campo: string]: unknown;
}

/**
 * O serializador ÚNICO do ativo (P0-6): toda saída do inventário passa por aqui. Cifra e hash nunca saem. Mascarado: IPv4/IPv6
 * total (`•••`, §12.1 pergunta 1); MAC com o OUI e o resto oculto. Firmware, modelo e portas em claro (§12.1 pergunta 3).
 */
export async function serializarAtivo(linha: LinhaAtivo, completo: boolean, chaves: ChavesOt, tabela = 'ot_ativos') {
  const { ip_cifrado, mac_cifrado, ip_hash: _ih, mac_hash: _mh, protocolos_portas, ...resto } = linha;
  const aad = (campo: string) => aadOt(linha.project_id, tabela, linha.id, campo);
  const mac = mac_cifrado ? await decifrarOt(mac_cifrado, chaves, aad('mac')) : null;
  return {
    ...resto,
    no_arciber: linha.no_arciber === 1,
    firmware_nao_aplicavel: linha.firmware_nao_aplicavel === 1,
    protocolos_portas: JSON.parse(protocolos_portas) as unknown[],
    ip: ip_cifrado ? (completo ? await decifrarOt(ip_cifrado, chaves, aad('ip')) : '•••') : null,
    mac: mac && (completo ? mac : mascararMac(mac)),
    mascarado: !completo,
  };
}
