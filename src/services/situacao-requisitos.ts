// Leitura única de situação por requisito (spec onda 2, decisão 1): função de serviço, NÃO tabela nem VIEW. Não grava nada;
// por isso a exportação de portabilidade (que lê as tabelas do banco) não muda.
import { FONTES_DO_OT, fonteVisivel, modulosDaPessoa, type PrincipalDeModulo } from '../modulos';
import { situacaoDoItemTecnico, situacaoUnica, type SituacaoUnica } from './situacao-unica';
import { montarAssessment } from './ot-avaliacao';
import { sitesPermitidos, type AtorOt } from './ot-inventario';

export type LinhaSituacao = { requisito_id: string; fonte_id: string; referencia: string; titulo: string; situacao: SituacaoUnica; origem: 'n.iso' | 'n.ot'; derivado?: string };
type Principal = AtorOt & PrincipalDeModulo;

export async function leituraUnica(db: D1Database, projectId: string, principal: Principal): Promise<LinhaSituacao[]> {
  // n.iso: uma consulta; controle sem requisito_id não entra.
  const { results: iso } = await db.prepare(
    `SELECT r.id AS requisito_id, r.fonte_id, r.referencia, r.titulo, c.status FROM compliance_controls c JOIN requisitos r ON r.id = c.requisito_id
      WHERE c.project_id = ? ORDER BY r.fonte_id, r.referencia, c.id`).bind(projectId).all<{ requisito_id: string; fonte_id: string; referencia: string; titulo: string; status: string | null }>();
  const linhas: LinhaSituacao[] = iso.map(({ status, ...r }) => ({ ...r, situacao: situacaoUnica(status), origem: 'n.iso' as const }));

  // P0-1/P0-2: n.ot só para a PESSOA com o módulo `ot`. O agente herda os módulos do consultor, então a decisão passa por fonteVisivel.
  if (!fonteVisivel(FONTES_DO_OT[0], await modulosDaPessoa(db, principal), principal)) return linhas;

  const [{ results: reqs }, a] = await Promise.all([
    db.prepare('SELECT id, fonte_id, referencia, titulo FROM requisitos WHERE fonte_id = ?').bind(FONTES_DO_OT[0]).all<{ id: string; fonte_id: string; referencia: string; titulo: string }>(),
    // mesma montagem (e mesmo corte por site do técnico) do assessment do n.ot: a derivação não é reimplementada aqui
    sitesPermitidos(db, principal, projectId).then((s) => montarAssessment(db, projectId, JSON.parse(s))),
  ]);
  const porCodigo = new Map(a.itens.map((i) => [i.codigo, i]));
  for (const r of reqs.sort((x, y) => x.referencia.localeCompare(y.referencia, undefined, { numeric: true }))) {
    const i = porCodigo.get(r.referencia);
    const base = { requisito_id: r.id, fonte_id: r.fonte_id, referencia: r.referencia, titulo: r.titulo, origem: 'n.ot' as const };
    if (i?.tipo === 'tecnico') {
      const t = situacaoDoItemTecnico(i.situacao_org === 'nao_avaliado' ? null : (i.situacao_org as Parameters<typeof situacaoDoItemTecnico>[0]));
      linhas.push({ ...base, situacao: t.situacao, ...(t.derivado ? { derivado: t.derivado } : {}) });
    } else linhas.push({ ...base, situacao: i?.tipo === 'politica' ? (i.avaliacao?.situacao ?? 'nao_avaliado') : 'nao_avaliado' });
  }
  return linhas;
}
