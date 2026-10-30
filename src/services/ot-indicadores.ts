// Indicadores do n.ot por projeto (spec §8; plano N4, item 4), derivados SÓ do inventário e filtrados pelos sites permitidos (P0-4).
// A linguagem é a de `ot-conformidade.ts` (princípio I, "nada se afirma sem evidência"): o inventário prova a falta do que ele
// mesmo registra; ausência no cadastro não prova o item, e nada aqui diz "atende". Sem IP, MAC nem nome de ativo na saída.
import { FLUXO_VISIVEL } from './ot-inventario';
import { conformidadeOt, type Situacao } from './ot-conformidade';
import { hojeEmSaoPaulo } from './hoje';

const NO_SITE = 'a.site_id IN (SELECT value FROM json_each(?))';

/** Os 6 campos do 4.3.1 da RO-CB.BR.01, na mesma regra do CHECK `ot_ativos_4_3_1` (que só vale para ativo do ARCiber). */
export const SQL_COMPLETO_4_3_1 = `(trim(coalesce(a.tipo_dispositivo, '')) <> '' AND trim(coalesce(a.fabricante, '')) <> '' AND trim(coalesce(a.funcao, '')) <> ''
  AND (a.ip_cifrado IS NOT NULL OR a.mac_cifrado IS NOT NULL) AND json_array_length(a.protocolos_portas) > 0
  AND (trim(coalesce(a.firmware_so_versao, '')) <> '' OR a.firmware_nao_aplicavel = 1))`;

const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

export async function indicadoresOt(db: D1Database, projectId: string, sites: string) {
  const [ativos, zonas, fluxos] = await db.batch([
    db.prepare(`SELECT count(*) AS total, coalesce(sum(${SQL_COMPLETO_4_3_1}), 0) AS completos, coalesce(sum(a.no_arciber = 1), 0) AS arciber,
        coalesce(sum(a.no_arciber = 1 AND ${SQL_COMPLETO_4_3_1}), 0) AS arciber_completos,
        coalesce(sum(NOT EXISTS (SELECT 1 FROM ot_zonas z WHERE z.id = a.zona_id AND z.status = 'ativo')), 0) AS sem_zona
      FROM ot_ativos a WHERE a.project_id = ? AND a.status = 'ativo' AND ${NO_SITE}`).bind(projectId, sites),
    db.prepare(`SELECT z.id AS zona_id, z.site_id, z.nome, z.nivel_purdue, count(a.id) AS ativos FROM ot_zonas z
      LEFT JOIN ot_ativos a ON a.zona_id = z.id AND a.project_id = z.project_id AND a.status = 'ativo'
      WHERE z.project_id = ? AND z.status = 'ativo' AND z.site_id IN (SELECT value FROM json_each(?))
      GROUP BY z.id ORDER BY z.nivel_purdue, z.nome`).bind(projectId, sites),
    db.prepare(`SELECT count(*) AS externos, coalesce(sum(f.via_vpn = 0), 0) AS sem_vpn FROM ot_fluxos f WHERE ${FLUXO_VISIVEL} AND f.externo = 1`)
      .bind(projectId, sites, sites, sites),
  ]);
  const a = ativos.results[0] as { total: number; completos: number; arciber: number; arciber_completos: number; sem_zona: number };
  const porZona = zonas.results as { zona_id: string; site_id: string; nome: string; nivel_purdue: number; ativos: number }[];
  const f = fluxos.results[0] as { externos: number; sem_vpn: number };

  // Ativo incompleto fora do ARCiber não viola o 4.3.1 (o item é dos ativos do ARCiber): falta evidência, não "não atende".
  const completude: { situacao: Situacao; evidencia: string } = !a.total ? { situacao: 'sem_evidencia', evidencia: 'Nenhum ativo no inventário' }
    : !a.arciber ? { situacao: 'sem_evidencia', evidencia: 'Nenhum ativo do ARCiber no inventário: o 4.3.1 é dos ativos do ARCiber' }
    : a.completos === a.total ? { situacao: 'evidencia_no_inventario', evidencia: `Os ${a.total} ativo(s) têm os 6 campos do 4.3.1 registrados` }
      : { situacao: 'sem_evidencia', evidencia: `${a.total - a.completos} de ${a.total} ativo(s) sem os 6 campos do 4.3.1` };
  const externos: { situacao: Situacao } = { situacao: f.sem_vpn ? 'nao_atende' : f.externos ? 'evidencia_no_inventario' : 'sem_evidencia' };

  // Prazo de cada item: o mesmo que a conformidade calcula (vigência da RO-CB.BR.01 + 18 ou 27 meses); item sem prazo fica de fora.
  const hoje = hojeEmSaoPaulo();
  const prazos = (await conformidadeOt(db, projectId, sites)).itens.filter((i) => i.prazo_em).map((i) => {
    const restantes = dias(hoje, i.prazo_em!);
    return { codigo: i.codigo, titulo: i.titulo, prazo_meses: i.prazo_meses, prazo_em: i.prazo_em, dias_restantes: restantes, vencido: restantes < 0, situacao: i.situacao, evidencia: i.evidencia };
  });

  return {
    completude: {
      total: a.total, completos: a.completos, percentual: a.total ? Math.round((a.completos * 1000) / a.total) / 10 : null, ...completude,
      arciber: { total: a.arciber, completos: a.arciber_completos },
    },
    por_zona: porZona,
    por_nivel: Object.fromEntries([...new Set(porZona.map((z) => z.nivel_purdue))].map((n) => [n, porZona.filter((z) => z.nivel_purdue === n).reduce((s, z) => s + z.ativos, 0)])),
    sem_zona: a.sem_zona,
    fluxos_externos: { externos: f.externos, sem_vpn: f.sem_vpn, ...externos },
    prazos,
  };
}
