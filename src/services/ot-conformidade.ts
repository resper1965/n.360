// Conformidade por item da RO-CB.BR.01 calculada do inventário do n.ot (plano N2, item 6). Princípio I da CONSTITUTION ("nada se
// afirma sem evidência"): o inventário só prova a FALTA de algo que ele mesmo registra (fluxo externo sem VPN, site sem as zonas,
// verificação vencida). Ausência de violação no cadastro não prova o item; e nada aqui diz "atende": no máximo, "o inventário
// registra o que o item pede". Item que o inventário não cobre fica `sem_evidencia`. Tudo filtrado pelos sites permitidos (P0-4).
import { sitesComZonas411 } from './ot-fase';
import { FLUXO_VISIVEL } from './ot-inventario';

/** Cargo do Gestor ARCiber em `project_governance` (spec §3): a mesma regra no 4.2.1 e no aviso do step-up (ot-stepup.ts). */
export const CARGO_GESTOR_ARCIBER = `lower(trim(job_title)) = 'gestor arciber'`;
export type Situacao = 'nao_atende' | 'evidencia_no_inventario' | 'sem_evidencia';
const VIGENCIA = '2021-07-09'; // RO-CB.BR.01 Rev.00
const NO_SITE = 'site_id IN (SELECT value FROM json_each(?))';

const prazoEm = (meses: number) => { const d = new Date(`${VIGENCIA}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + meses); return d.toISOString().slice(0, 10); };

export interface ItemTecnico { situacao: Situacao; evidencia: string; numeros?: Record<string, number> }
interface Contagens {
  nSites: number; z: number; f: { externos: number; sem_vpn: number };
  a: { arciber: number; sem_verificacao: number; vencidos: number; sem_zona: number }; g: { titular: number; suplente: number };
}
/** Os cinco itens técnicos do inventário: a regra única de `conformidadeOt` (projeto todo) e `conformidadePorSite` (nSites = 1). */
export const ITENS_TECNICOS = ['4.1.1', '4.1.2', '4.1.3', '4.2.1', '4.3.1'] as const;
function avaliarTecnicos({ nSites, z, f, a, g }: Contagens): Record<string, () => ItemTecnico> {
  return {
    '4.1.1': () => !nSites ? { situacao: 'sem_evidencia', evidencia: 'Nenhum site no inventário' }
      : z < nSites ? { situacao: 'nao_atende', evidencia: `${nSites - z} de ${nSites} site(s) sem zonas nos níveis 2, 3 e 4`, numeros: { sites: nSites, sites_com_3_zonas: z } }
        : { situacao: 'evidencia_no_inventario', evidencia: `Os ${nSites} site(s) têm zonas nos níveis 2, 3 e 4 registradas`, numeros: { sites: nSites, sites_com_3_zonas: z } },
    '4.1.2': () => f.sem_vpn ? { situacao: 'nao_atende', evidencia: `${f.sem_vpn} fluxo(s) externo(s) sem VPN`, numeros: { ...f } }
      : { situacao: 'sem_evidencia', evidencia: 'Nenhum fluxo externo sem VPN registrado; a ausência no inventário não prova que o ARCiber é inacessível pela internet', numeros: { ...f } },
    '4.1.3': () => f.sem_vpn ? { situacao: 'nao_atende', evidencia: `${f.sem_vpn} de ${f.externos} fluxo(s) externo(s) sem VPN`, numeros: { ...f } }
      : f.externos ? { situacao: 'evidencia_no_inventario', evidencia: `Os ${f.externos} fluxo(s) externo(s) registrados passam por VPN`, numeros: { ...f } }
        : { situacao: 'sem_evidencia', evidencia: 'Nenhum fluxo externo registrado', numeros: { ...f } },
    '4.2.1': () => g.titular && g.suplente ? { situacao: 'evidencia_no_inventario', evidencia: 'Titular e suplente com cargo "Gestor ARCiber" na governança do projeto', numeros: { ...g } }
      : { situacao: 'sem_evidencia', evidencia: `Falta ${[!g.titular && 'titular', !g.suplente && 'suplente'].filter(Boolean).join(' e ')} com cargo "Gestor ARCiber" na governança do projeto`, numeros: { ...g } },
    // Os campos do 4.3.1 o banco já garante (CHECK ot_ativos_4_3_1): o que falta provar é a verificação a cada 24 meses. Só conta a
    // verificação com quem a fez: a aprovação de lote da coleta grava as duas (`verificado_por` e `ultima_verificacao_em`); data sem
    // pessoa não é evidência.
    '4.3.1': () => !a.arciber ? { situacao: 'sem_evidencia', evidencia: 'Nenhum ativo do ARCiber no inventário', numeros: { ...a } }
      : a.vencidos ? { situacao: 'nao_atende', evidencia: `${a.vencidos} ativo(s) do ARCiber com verificação há mais de 24 meses`, numeros: { ...a } }
        : a.sem_verificacao ? { situacao: 'sem_evidencia', evidencia: `${a.sem_verificacao} de ${a.arciber} ativo(s) do ARCiber sem verificação registrada por aprovação de lote (campos do 4.3.1 completos)`, numeros: { ...a } }
          : { situacao: 'evidencia_no_inventario', evidencia: `Os ${a.arciber} ativo(s) do ARCiber têm os campos do 4.3.1 e verificação por aprovação de lote nos últimos 24 meses`, numeros: { ...a } },
  };
}

export async function conformidadeOt(db: D1Database, projectId: string, sites: string) {
  const nSites = (JSON.parse(sites) as string[]).length;
  const [requisitos, zonas, fluxos, ativos, gestor] = await db.batch([
    db.prepare(`SELECT codigo, titulo, prazo_meses FROM ot_requisitos WHERE framework = 'ONS-RO-CB.BR.01'`),
    db.prepare(`SELECT count(*) AS n FROM (${sitesComZonas411(NO_SITE)})`).bind(projectId, sites),
    db.prepare(`SELECT count(*) AS externos, coalesce(sum(f.via_vpn = 0), 0) AS sem_vpn FROM ot_fluxos f WHERE ${FLUXO_VISIVEL} AND f.externo = 1`).bind(projectId, sites, sites, sites),
    db.prepare(`SELECT count(*) AS arciber, coalesce(sum(ultima_verificacao_em IS NULL OR verificado_por IS NULL), 0) AS sem_verificacao,
        coalesce(sum(ultima_verificacao_em < datetime('now', '-24 months')), 0) AS vencidos, coalesce(sum(zona_id IS NULL), 0) AS sem_zona
      FROM ot_ativos WHERE project_id = ? AND status = 'ativo' AND no_arciber = 1 AND ${NO_SITE}`).bind(projectId, sites),
    // 4.2.1: gestor e suplente em project_governance, cargo "Gestor ARCiber" (spec §3): titular is_primary = 1, suplente 0.
    db.prepare(`SELECT coalesce(sum(is_primary = 1), 0) AS titular, coalesce(sum(coalesce(is_primary, 0) = 0), 0) AS suplente FROM project_governance
      WHERE project_id = ? AND ${CARGO_GESTOR_ARCIBER}`).bind(projectId),
  ]);
  const z = (zonas.results[0] as { n: number }).n;
  const f = fluxos.results[0] as { externos: number; sem_vpn: number };
  const a = ativos.results[0] as { arciber: number; sem_verificacao: number; vencidos: number; sem_zona: number };
  const g = gestor.results[0] as { titular: number; suplente: number };

  const avaliar = avaliarTecnicos({ nSites, z, f, a, g });

  const itens = (requisitos.results as { codigo: string; titulo: string; prazo_meses: number | null }[])
    .sort((x, y) => x.codigo.localeCompare(y.codigo, undefined, { numeric: true }))
    .map((r) => ({
      codigo: r.codigo, titulo: r.titulo, prazo_meses: r.prazo_meses, prazo_em: r.prazo_meses ? prazoEm(r.prazo_meses) : null,
      ...(avaliar[r.codigo]?.() ?? { situacao: 'sem_evidencia' as Situacao, evidencia: 'Fora do que o inventário registra' }),
    }));
  const resumo = Object.fromEntries((['nao_atende', 'evidencia_no_inventario', 'sem_evidencia'] as const).map((s) => [s, itens.filter((i) => i.situacao === s).length]));
  return { framework: 'ONS-RO-CB.BR.01', versao: 'Rev.00', vigencia: VIGENCIA, itens, resumo };
}

/** Itens técnicos por site (mesma regra de `conformidadeOt`, um site por vez). `siteIds` já vem filtrado pelos sites permitidos (P0-4). */
export async function conformidadePorSite(db: D1Database, projectId: string, siteIds: string[]): Promise<Record<string, Record<string, ItemTecnico>>> {
  if (!siteIds.length) return {};
  const sites = JSON.stringify(siteIds);
  const [zonas, fluxos, ativos, gestor] = await db.batch([
    db.prepare(sitesComZonas411(NO_SITE)).bind(projectId, sites),
    db.prepare(`SELECT f.site_id, count(*) AS externos, coalesce(sum(f.via_vpn = 0), 0) AS sem_vpn FROM ot_fluxos f WHERE ${FLUXO_VISIVEL} AND f.externo = 1 GROUP BY f.site_id`).bind(projectId, sites, sites, sites),
    db.prepare(`SELECT site_id, count(*) AS arciber, coalesce(sum(ultima_verificacao_em IS NULL OR verificado_por IS NULL), 0) AS sem_verificacao,
        coalesce(sum(ultima_verificacao_em < datetime('now', '-24 months')), 0) AS vencidos, coalesce(sum(zona_id IS NULL), 0) AS sem_zona
      FROM ot_ativos WHERE project_id = ? AND status = 'ativo' AND no_arciber = 1 AND ${NO_SITE} GROUP BY site_id`).bind(projectId, sites),
    db.prepare(`SELECT coalesce(sum(is_primary = 1), 0) AS titular, coalesce(sum(coalesce(is_primary, 0) = 0), 0) AS suplente FROM project_governance
      WHERE project_id = ? AND ${CARGO_GESTOR_ARCIBER}`).bind(projectId),
  ]);
  const comZonas = new Set((zonas.results as { site_id: string }[]).map((r) => r.site_id));
  const porSite = <T extends { site_id: string }>(r: D1Result) => new Map((r.results as unknown as T[]).map((x) => [x.site_id, x]));
  const f = porSite<{ site_id: string; externos: number; sem_vpn: number }>(fluxos);
  const a = porSite<{ site_id: string; arciber: number; sem_verificacao: number; vencidos: number; sem_zona: number }>(ativos);
  const g = gestor.results[0] as { titular: number; suplente: number };
  return Object.fromEntries(siteIds.map((id) => {
    const { site_id: _f, ...fs } = f.get(id) ?? { site_id: id, externos: 0, sem_vpn: 0 };
    const { site_id: _a, ...as } = a.get(id) ?? { site_id: id, arciber: 0, sem_verificacao: 0, vencidos: 0, sem_zona: 0 };
    const avaliar = avaliarTecnicos({ nSites: 1, z: comZonas.has(id) ? 1 : 0, f: fs, a: as, g });
    return [id, Object.fromEntries(ITENS_TECNICOS.map((c) => [c, avaliar[c]()]))];
  }));
}
