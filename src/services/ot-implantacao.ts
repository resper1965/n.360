import { CARGO_GESTOR_ARCIBER } from './ot-inventario';
import { SQL_EH_FORNECEDOR } from './terceiros';

export type PassoImplantacao = {
  id: 'modulo' | 'gestor' | 'tecnicos' | 'site' | 'sonda' | 'agente' | 'fornecedores' | 'assessment' | 'base';
  texto: string; estado: 'feito' | 'falta' | 'opcional'; detalhe: string; link: { tela: string; site?: string; aba?: string };
};
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Spec 2026-11-26 §3: nove passos do projeto, um db.batch, só contagens (P0-6: nada de nome, IP ou MAC). */
export async function listaDeVerificacao(db: D1Database, projectId: string): Promise<{ passos: PassoImplantacao[] }> {
  const [[c], [primeiro]] = (await db.batch([
    db.prepare(`SELECT
      (SELECT count(*) FROM users u JOIN usuario_modulos m ON m.user_id = u.id AND m.modulo = 'ot' WHERE u.client_project_id = ?1 AND u.ativo <> 0) AS pessoas,
      (SELECT count(*) FROM project_governance WHERE project_id = ?1 AND ${CARGO_GESTOR_ARCIBER} AND coalesce(trim(email), '') <> '') AS gestor,
      (SELECT count(*) FROM ot_site_acessos a JOIN ot_sites s ON s.id = a.site_id AND s.project_id = a.project_id WHERE a.project_id = ?1 AND s.status = 'ativo') AS tecnicos,
      (SELECT count(*) FROM ot_sites WHERE project_id = ?1 AND status = 'ativo') AS sites,
      (SELECT count(*) FROM ot_sensores WHERE project_id = ?1 AND situacao = 'ativa') AS sondas,
      (SELECT count(DISTINCT c.sensor_id) FROM ot_sensor_credenciais c JOIN ot_sensores s ON s.id = c.sensor_id AND s.project_id = c.project_id
        WHERE c.project_id = ?1 AND s.situacao = 'ativa' AND c.situacao = 'ativa' AND c.expira_em > ?2) AS instaladas,
      (SELECT count(DISTINCT e.sensor_id) FROM ot_sensor_envios e JOIN ot_sensores s ON s.id = e.sensor_id AND s.project_id = e.project_id
        WHERE e.project_id = ?1 AND s.situacao = 'ativa' AND e.situacao = 'concluido') AS com_envio,
      (SELECT agente_coleta_ot FROM projects WHERE id = ?1) AS agente,
      (SELECT count(*) FROM ot_fornecedores o
        JOIN partes p ON p.id = o.parte_id AND p.project_id = o.project_id AND ${SQL_EH_FORNECEDOR}
        LEFT JOIN ot_sites s ON s.id = o.ot_site_id AND s.project_id = o.project_id AND s.status = 'ativo'
        LEFT JOIN ot_fluxos f ON f.id = o.ot_fluxo_id AND f.status = 'ativo' AND f.site_id IN (SELECT id FROM ot_sites WHERE project_id = ?1 AND status = 'ativo')
        WHERE o.project_id = ?1 AND (s.id IS NOT NULL OR f.id IS NOT NULL)) AS fornecedores,
      (SELECT count(*) FROM ot_avaliacoes WHERE project_id = ?1) AS avaliacoes,
      (SELECT count(*) FROM ot_sites WHERE project_id = ?1 AND status = 'ativo' AND base_aprovada_em IS NOT NULL) AS bases`).bind(projectId, new Date().toISOString()),
    db.prepare(`SELECT id FROM ot_sites WHERE project_id = ? AND status = 'ativo' AND fase <> 'em_operacao' ORDER BY created_at, id LIMIT 1`).bind(projectId),
  ])).map((r) => r.results as Record<string, number | string>[]);
  const n = (k: string) => Number(c?.[k] ?? 0);
  const p = (id: PassoImplantacao['id'], feito: boolean, texto: string, detalhe: string, link: PassoImplantacao['link'], opcional = false): PassoImplantacao =>
    ({ id, texto, estado: feito ? 'feito' : opcional ? 'opcional' : 'falta', detalhe, link });
  return { passos: [
    p('modulo', n('pessoas') > 0, 'Dar o n.ot às pessoas do cliente', plural(n('pessoas'), 'pessoa com o n.ot', 'pessoas com o n.ot'), { tela: 'n360-usuarios' }),
    p('gestor', n('gestor') > 0, 'Definir o Gestor ARCiber', n('gestor') ? 'Definido' : 'Sem Gestor ARCiber no comitê', { tela: 'n360-governanca' }),
    p('tecnicos', n('tecnicos') > 0, 'Dar acesso aos técnicos', plural(n('tecnicos'), 'acesso concedido', 'acessos concedidos'), { tela: 'acessos' }),
    p('site', n('sites') > 0, 'Cadastrar o primeiro site', plural(n('sites'), 'site', 'sites'), { tela: 'implantacao', aba: 'novo-site' }),
    p('sonda', n('com_envio') > 0, 'Instalar a sonda e receber o primeiro envio',
      `${plural(n('sondas'), 'sonda', 'sondas')}; ${plural(n('instaladas'), 'instalada', 'instaladas')}; ${n('com_envio')} com primeiro envio`, { tela: 'sondas' }),
    p('agente', n('agente') === 1, 'Ligar o agente de coleta', n('agente') === 1 ? 'Ligado' : 'Opcional', { tela: 'agente' }, true),
    p('fornecedores', n('fornecedores') > 0, 'Ligar os fornecedores de OT', plural(n('fornecedores'), 'fornecedor', 'fornecedores'), { tela: 'fornecedores' }),
    p('assessment', n('avaliacoes') > 0, 'Fazer a primeira avaliação do Assessment', plural(n('avaliacoes'), 'item avaliado', 'itens avaliados'), { tela: 'assessment' }),
    p('base', n('bases') > 0, 'Aprovar a primeira base', plural(n('bases'), 'base aprovada', 'bases aprovadas'),
      primeiro ? { tela: 'site', site: String(primeiro.id) } : { tela: 'implantacao' }),
  ] };
}
