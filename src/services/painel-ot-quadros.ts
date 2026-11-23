// Quadros do Painel do n.ot (spec 2026-11-19-paineis-do-n-ot, PR3): Conformidade RO-CB, Desvios e exposição, Vencimentos de 90 dias.
// Só no `?modulo=ot` (o Início do n.360 não paga nem recebe). Orçamento de D1: UM db.batch de consultas agrupadas + o de
// `conformidadePorSite`; nenhuma consulta por site. Tudo sobre `sites` (= sitesPermitidos, P0-4). Nunca IP, MAC, nome de ativo ou de
// sonda (P0-6): rótulo de vencimento é nome de site ou código de requisito; o título da ação (texto livre) não sai.
import { conformidadePorSite, ITENS_TECNICOS } from './ot-conformidade';
import { resumoDoAssessment, situacaoNaOrganizacao, type ItemDoResumo } from './ot-avaliacao';
import { SQL_COMPLETO_4_3_1 } from './ot-indicadores';
import { TETO_LEITURA_OT } from './ot-inventario';
import { mesesAtras } from './hoje';
import type { LinhaVencimento, Proximo, Tema } from './painel';

const DIA_MS = 86_400_000;
const NO_SITE = 'site_id IN (SELECT value FROM json_each(?2))';
const EXCECAO = '5.1.1';
const TETO_VENCIMENTOS = 200;
const CONTA_RO_CB = 'Concluído: atende. Em andamento: parcial, ou o inventário registra o que o item pede (o inventário nunca afirma "atende"). Falta: não atende, sem evidência ou não avaliado. "Não se aplica" fica fora.';
const somarDias = (dia: string, n: number) => new Date(Date.parse(dia) + n * DIA_MS).toISOString().slice(0, 10);

type Datada = { tipo: string; rotulo: string; data: string };

/** Vencimentos de 90 dias a partir de itens datados (pura): a forma de `lerVencimentos` do painel (vencidos por tipo, itens no período, teto). */
export function vencimentosDe(tipos: string[], itens: Datada[], dia: string): { linhas: LinhaVencimento[]; proximo: Proximo } {
  const ate = somarDias(dia, 90);
  const dias = (d: string) => Math.round((Date.parse(d) - Date.parse(dia)) / DIA_MS);
  const no = itens.filter((i) => i.data >= dia && i.data <= ate)
    .sort((a, b) => a.data.localeCompare(b.data) || a.tipo.localeCompare(b.tipo) || a.rotulo.localeCompare(b.rotulo)).slice(0, TETO_VENCIMENTOS);
  const linhas = tipos.map((tipo) => ({ tipo, vencidos: itens.filter((i) => i.tipo === tipo && i.data < dia).length,
    itens: no.filter((i) => i.tipo === tipo).map((i) => ({ dias: dias(i.data), rotulo: i.rotulo })) }));
  const p = no[0];
  return { linhas, proximo: p ? { dias: dias(p.data), rotulo: p.rotulo, tipo: p.tipo } : null };
}

export type EntradaQuadros = {
  /** JSON de `sitesPermitidos` (P0-4). */
  sites: string;
  /** Os sites que o `blocoOt` já leu, sobre o mesmo JSON. */
  lista: { id: string; nome: string; fase: string; obra_ate: string | null }[];
  revalidar: Map<string, string | null>;
  /** A credencial válida que vence por último, por sonda dos sites permitidos. */
  credenciais: { site_id: string; expira_em: string }[];
  gestor: boolean; veSondas: boolean;
};

type LinhaPolitica = { codigo: string; categoria: string; situacao: 'atende' | 'parcial' | 'nao_atende' | 'nao_se_aplica' | null; confirmado_em: string | null;
  proxima_revisao: string | null; evidencia_vencida: number };

export async function quadrosOt(db: D1Database, projectId: string, dia: string, x: EntradaQuadros) {
  const [politica, desvSit, desvMes, ativos, niveis, aceites, acoes] = await db.batch([
    // Um por requisito do catálogo (25 linhas): a mesma leitura que montarAssessment faz para os itens de política.
    db.prepare(`SELECT r.codigo, coalesce(r.categoria, 'Outros') AS categoria, a.situacao, a.confirmado_em, a.proxima_revisao,
        EXISTS (SELECT 1 FROM ot_requisito_evidencias l JOIN evidence e ON e.id = l.evidencia_id AND e.project_id = l.project_id
          WHERE l.project_id = ?1 AND l.requisito_id = r.id AND e.valido_ate IS NOT NULL AND e.valido_ate < ?2) AS evidencia_vencida
      FROM ot_requisitos r LEFT JOIN ot_avaliacoes a ON a.requisito_id = r.id AND a.project_id = ?1
      WHERE r.framework = 'ONS-RO-CB.BR.01' LIMIT ${TETO_LEITURA_OT}`).bind(projectId, dia),
    db.prepare(`SELECT site_id, situacao, count(*) AS n FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} GROUP BY site_id, situacao`).bind(projectId, x.sites),
    db.prepare(`SELECT substr(primeira_vez, 1, 7) AS mes, count(*) AS n FROM ot_desvios WHERE project_id = ?1 AND ${NO_SITE} AND substr(primeira_vez, 1, 10) >= ?3
      GROUP BY mes`).bind(projectId, x.sites, `${mesesAtras(dia, 11)}-01`),
    db.prepare(`SELECT count(*) AS arciber, coalesce(sum(${SQL_COMPLETO_4_3_1}), 0) AS completos FROM ot_ativos a
      WHERE a.project_id = ?1 AND a.status = 'ativo' AND a.no_arciber = 1 AND a.${NO_SITE}`).bind(projectId, x.sites),
    db.prepare(`SELECT z.nivel_purdue AS nivel, count(a.id) AS ativos FROM ot_zonas z
      LEFT JOIN ot_ativos a ON a.zona_id = z.id AND a.project_id = z.project_id AND a.status = 'ativo'
      WHERE z.project_id = ?1 AND z.status = 'ativo' AND z.${NO_SITE} GROUP BY z.nivel_purdue ORDER BY z.nivel_purdue`).bind(projectId, x.sites),
    db.prepare(`SELECT site_id, substr(aceito_ate, 1, 10) AS data FROM ot_desvios
      WHERE project_id = ?1 AND ${NO_SITE} AND situacao = 'aceito' AND aceito_ate IS NOT NULL LIMIT ${TETO_LEITURA_OT}`).bind(projectId, x.sites),
    // A ação de um desvio é uma corrective_actions comum ligada por ot_referencias (0115, já usada por ot-desvio-acao.ts).
    db.prepare(`SELECT r.ot_site_id AS site_id, substr(c.due_date, 1, 10) AS data FROM ot_referencias r
        JOIN corrective_actions c ON c.id = r.acao_id AND c.project_id = r.project_id
      WHERE r.project_id = ?1 AND r.ot_desvio_id IS NOT NULL AND r.ot_site_id IN (SELECT value FROM json_each(?2))
        AND COALESCE(c.status, 'Open') <> 'Closed' AND c.due_date IS NOT NULL LIMIT ${TETO_LEITURA_OT}`).bind(projectId, x.sites),
  ]);
  const tecnicos = await conformidadePorSite(db, projectId, x.lista.map((s) => s.id));

  // Conformidade: o mesmo resumo de GET /ot/assessment (resumoDoAssessment) e as barras por categoria da norma.
  const linhas = (politica.results as LinhaPolitica[]).sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
  const itens = linhas.map((r): ItemDoResumo & { categoria: string } => {
    if ((ITENS_TECNICOS as readonly string[]).includes(r.codigo)) {
      return { tipo: 'tecnico', categoria: r.categoria,
        situacao_org: situacaoNaOrganizacao(x.lista.map((s) => ({ fase: s.fase, situacao: tecnicos[s.id]?.[r.codigo]?.situacao ?? 'sem_evidencia' }))) };
    }
    if (r.codigo === EXCECAO) return { tipo: 'excecao', categoria: r.categoria };
    return { tipo: 'politica', categoria: r.categoria, avaliacao: r.situacao ? { situacao: r.situacao, confirmado: !!r.confirmado_em } : null,
      revisar: !!r.evidencia_vencida || (!!r.proxima_revisao && r.proxima_revisao < dia) };
  });
  const parte = (i: ItemDoResumo): 'feito' | 'andamento' | 'falta' | null => i.tipo === 'politica'
    ? (i.avaliacao?.situacao === 'atende' ? 'feito' : i.avaliacao?.situacao === 'parcial' ? 'andamento' : i.avaliacao?.situacao === 'nao_se_aplica' ? null : 'falta')
    : i.tipo === 'tecnico' && i.situacao_org === 'evidencia_no_inventario' ? 'andamento' : 'falta';
  const categorias: Tema[] = [...new Set(itens.map((i) => i.categoria))].map((tema) => {
    const t: Tema = { tema, feito: 0, andamento: 0, falta: 0, conta: CONTA_RO_CB };
    for (const i of itens.filter((k) => k.categoria === tema)) { const p = parte(i); if (p) t[p]++; }
    return t;
  });
  const a = ativos.results[0] as { arciber: number; completos: number };

  // Desvios e exposição: estado de hoje por site, detectados por mês (decisão 7: mês da primeira detecção) e o 4.1.3 somado por site.
  const sit = desvSit.results as { site_id: string; situacao: string; n: number }[];
  const conta = (id: string, ...ss: string[]) => sit.filter((d) => d.site_id === id && ss.includes(d.situacao)).reduce((t, d) => t + Number(d.n), 0);
  const porSiteDesv: Tema[] = x.lista.filter((s) => sit.some((d) => d.site_id === s.id))
    .map((s) => ({ tema: s.nome, feito: conta(s.id, 'regularizado'), andamento: conta(s.id, 'tratado', 'aceito'), falta: conta(s.id, 'aberto'), conta: 'Regularizado / tratado ou aceito / aberto' }));
  const meses = Array.from({ length: 12 }, (_, i) => mesesAtras(dia, 11 - i));
  const porMes = new Map((desvMes.results as { mes: string; n: number }[]).map((r) => [r.mes, Number(r.n)]));
  const fluxos = Object.values(tecnicos).reduce((t, s) => {
    const n = (s['4.1.3']?.numeros ?? {}) as { externos?: number; sem_vpn?: number };
    return { externos: t.externos + Number(n.externos ?? 0), sem_vpn: t.sem_vpn + Number(n.sem_vpn ?? 0) };
  }, { externos: 0, sem_vpn: 0 });

  // Vencimentos de 90 dias: aceite só do Gestor (como o item de 7 dias), credencial só de quem abre a sonda (podeVerCompleto).
  const site = new Map(x.lista.map((s) => [s.id, s.nome]));
  const datadas: Datada[] = [
    ...x.lista.filter((s) => (s.fase === 'em_obra' || s.fase === 'base_em_aprovacao') && s.obra_ate).map((s) => ({ tipo: 'Obra', rotulo: s.nome, data: s.obra_ate! })),
    ...(x.gestor ? (aceites.results as { site_id: string; data: string }[]).map((r) => ({ tipo: 'Aceite de desvio', rotulo: site.get(r.site_id) ?? '', data: r.data })) : []),
    ...[...x.revalidar].filter(([, em]) => !!em).map(([id, em]) => ({ tipo: 'Revalidação dos ativos', rotulo: site.get(id) ?? '', data: em! })),
    ...linhas.filter((r) => r.proxima_revisao).map((r) => ({ tipo: 'Revisão do assessment', rotulo: `Item ${r.codigo}`, data: r.proxima_revisao!.slice(0, 10) })),
    ...(x.veSondas ? x.credenciais.map((k) => ({ tipo: 'Credencial de sonda', rotulo: site.get(k.site_id) ?? '', data: k.expira_em.slice(0, 10) })) : []),
    ...(acoes.results as { site_id: string; data: string }[]).map((r) => ({ tipo: 'Ação de desvio', rotulo: site.get(r.site_id) ?? '', data: r.data })),
  ];
  const tipos = ['Obra', ...(x.gestor ? ['Aceite de desvio'] : []), 'Revalidação dos ativos', 'Revisão do assessment', ...(x.veSondas ? ['Credencial de sonda'] : []), 'Ação de desvio'];
  const v = vencimentosDe(tipos, datadas, dia);

  return {
    proximo: v.proximo,
    conformidade: { resumo: resumoDoAssessment(itens), categorias,
      ativos: { arciber: Number(a.arciber), completos: Number(a.completos), por_nivel: niveis.results as { nivel: number; ativos: number }[] } },
    desvios: { por_site: porSiteDesv, por_mes: meses.map((m) => porMes.get(m) ?? 0), meses, fluxos_externos: fluxos },
    vencimentos: v.linhas,
  };
}
