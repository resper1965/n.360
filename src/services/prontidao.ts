import { SQL_CLASSE_CONTROLE, SQL_ESCOPO_DEFINIDO, SQL_EVIDENCIA_RUIM } from './painel';
import { diaMes } from './encarregado';
import { hojeEmSaoPaulo } from './hoje';
import { escopoRopa } from './escopo-itens';
import { ISO_27001_2022_STANDARD } from '../data/iso27001-2022';
import { ISO_27701_2025_STANDARD } from '../data/iso27701-2025';

/**
 * Prontidão para a certificação ISO/IEC 27001:2022 (Onda 2 do diagnóstico de design de 15/10/2026): uma resposta, no
 * servidor, para "estou pronto para o estágio 1?". Só leitura.
 *
 * Cada critério é verificável a partir do cadastro do n.iso e cita a cláusula de onde vem. A fonte dos critérios e da
 * divisão entre estágios é a skill do consultor `agent-skills/prontidao-certificacao/` (SKILL.md, "Vereditos S1/S2";
 * references/clausulas-27001.md; references/armadilhas-certificadora.md): estágio 1 é documental (o documento existe e
 * está aprovado), estágio 2 é a operação com registro. Nada aqui é exigência nova: o que a norma pede e o cadastro não
 * mostra (ex.: imparcialidade do auditor interno, entradas da 9.3.2) fica para a pré-avaliação humana, que a ressalva
 * do veredito lembra. O sistema nunca diz "conforme": diz se o critério verificável está atendido.
 */

export type Situacao = 'atendido' | 'pendente' | 'nao_se_aplica';

/** As contagens do cadastro que os critérios leem. Um `db.batch` monta tudo (`contagensDoProjeto`). */
export type Contagens = {
  escopo: boolean; contexto: boolean; partes: number; papeis: number; politica_vigente: number; politica_a51_aprovada: number;
  controles: { feito: number; andamento: number; falta: number; na: number }; na_sem_justificativa: number; implementados_sem_evidencia: number;
  riscos: number; riscos_sem_tratamento: number; indicadores: number; indicadores_medidos: number; documentos_revisao_vencida: number;
  evidencias: number; evidencias_vencidas_ou_nao_conformes: number; treinamentos_concluidos: number; auditorias_internas: number;
  analises_criticas: number; nc_sem_acao_concluida: number; nc_total: number; acoes_vencidas: number; fases: { concluidas: number; total: number };
};

type Avaliacao = { situacao: Situacao; motivo: string; numero: string };
type Definicao = {
  id: string; estagio: 1 | 2; requisito: string; titulo: string; tela: string; filtro?: string; acao: string;
  /** Critérios que dependem deste: resolver este primeiro destrava aqueles. */
  destrava: string[];
  /** O que o cliente precisa decidir ou fornecer, quando a pendência depende dele. */
  cliente?: string;
  avaliar: (c: Contagens) => Avaliacao;
};

const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;
const ok = (motivo: string, numero = ''): Avaliacao => ({ situacao: 'atendido', motivo, numero });
const falta = (motivo: string, numero = ''): Avaliacao => ({ situacao: 'pendente', motivo, numero });
const aplicaveis = (c: Contagens) => c.controles.feito + c.controles.andamento + c.controles.falta;

export const CRITERIOS: Definicao[] = [
  // ─── Estágio 1: a informação documentada existe e está aprovada ───
  { id: 'escopo', estagio: 1, requisito: '4.3', titulo: 'Escopo do SGSI definido', tela: 'context', acao: 'Definir o escopo',
    destrava: ['riscos', 'soa', 'auditoria_interna'], cliente: 'Confirmar os limites do escopo do SGSI',
    avaliar: (c) => (c.escopo ? ok('O escopo está registrado no projeto.') : falta('O escopo não está registrado no projeto nem no Contexto.')) },
  { id: 'contexto', estagio: 1, requisito: '4.1', titulo: 'Questões internas e externas registradas', tela: 'context', acao: 'Registrar o contexto',
    destrava: ['riscos'],
    avaliar: (c) => (c.contexto ? ok('A análise de contexto tem questões internas ou externas registradas.') : falta('A análise de contexto está vazia.')) },
  { id: 'partes', estagio: 1, requisito: '4.2', titulo: 'Partes interessadas e seus requisitos', tela: 'stakeholders', acao: 'Registrar as partes interessadas',
    destrava: ['riscos'],
    avaliar: (c) => (c.partes > 0 ? ok('Há partes interessadas registradas.', plural(c.partes, 'registrada', 'registradas'))
      : falta('Nenhuma parte interessada registrada.', '0 registradas')) },
  { id: 'papeis', estagio: 1, requisito: '5.3', titulo: 'Papéis e responsabilidades atribuídos', tela: 'governance', acao: 'Atribuir os papéis',
    destrava: ['politica', 'tratamento', 'analise_critica'], cliente: 'Indicar quem responde pelo SGSI (CISO, direção)',
    avaliar: (c) => (c.papeis > 0 ? ok('A governança do cliente tem papéis atribuídos.', plural(c.papeis, 'pessoa', 'pessoas'))
      : falta('Nenhum papel do cliente na governança; a consultoria não conta.', '0 pessoas')) },
  { id: 'politica', estagio: 1, requisito: '5.2', titulo: 'Política de segurança da informação publicada', tela: 'documentos', acao: 'Publicar a política',
    destrava: ['conscientizacao'], cliente: 'Aprovar a política de segurança da informação',
    avaliar: (c) => (c.politica_vigente > 0 ? ok('Há política vigente em Documentos.', plural(c.politica_vigente, 'vigente', 'vigentes'))
      : c.politica_a51_aprovada > 0 ? ok('A política do controle A.5.1 está aprovada.')
        : falta('Nenhuma política vigente em Documentos, e a do controle A.5.1 não está aprovada.')) },
  { id: 'riscos', estagio: 1, requisito: '6.1.2', titulo: 'Avaliação de riscos realizada', tela: 'risks', acao: 'Avaliar os riscos',
    destrava: ['tratamento', 'soa'],
    avaliar: (c) => (c.riscos > 0 ? ok('Há riscos avaliados no registro.', plural(c.riscos, 'risco', 'riscos'))
      : falta('Nenhum risco registrado no n.iso.', '0 riscos')) },
  { id: 'tratamento', estagio: 1, requisito: '6.1.3', titulo: 'Todo risco com tratamento definido', tela: 'risks', acao: 'Definir o tratamento',
    destrava: [], cliente: 'Aprovar o plano de tratamento e o risco residual (dono do risco)',
    avaliar: (c) => (c.riscos === 0 ? falta('Sem riscos avaliados, não há plano de tratamento.')
      : c.riscos_sem_tratamento > 0 ? falta('Há riscos abertos sem plano de tratamento.', `${c.riscos_sem_tratamento} de ${c.riscos} sem tratamento`)
        : ok('Todo risco aberto tem plano de tratamento.', `${c.riscos} com tratamento`)) },
  { id: 'soa', estagio: 1, requisito: '6.1.3', titulo: 'SoA com toda exclusão justificada', tela: 'soa', acao: 'Justificar as exclusões',
    destrava: ['controles'],
    avaliar: (c) => (aplicaveis(c) + c.controles.na === 0 ? falta('A SoA não tem controles: carregue o catálogo do Anexo A.')
      : c.na_sem_justificativa > 0 ? falta('Há controles fora da SoA (não aplicáveis) sem justificativa.', `${c.na_sem_justificativa} sem justificativa`)
        : ok('Toda exclusão da SoA tem justificativa.', plural(c.controles.na, 'exclusão', 'exclusões'))) },
  { id: 'objetivos', estagio: 1, requisito: '6.2', titulo: 'Objetivos de segurança com indicador', tela: 'metrics', acao: 'Definir os objetivos',
    destrava: ['medicao'], cliente: 'Aprovar os objetivos de segurança da informação',
    avaliar: (c) => (c.indicadores > 0 ? ok('Há objetivos com indicador definido.', plural(c.indicadores, 'indicador', 'indicadores'))
      : falta('Nenhum indicador de objetivo registrado.', '0 indicadores')) },
  { id: 'documentos_revisao', estagio: 1, requisito: '7.5.2', titulo: 'Documentos vigentes dentro do prazo de revisão', tela: 'documentos', acao: 'Revisar os documentos',
    destrava: [],
    avaliar: (c) => (c.documentos_revisao_vencida > 0 ? falta('Há documentos vigentes com a revisão vencida.', plural(c.documentos_revisao_vencida, 'vencido', 'vencidos'))
      : ok('Nenhum documento vigente com a revisão vencida.')) },

  // ─── Estágio 2: a operação tem registro ───
  { id: 'controles', estagio: 2, requisito: '8.1', titulo: 'Controles aplicáveis implementados', tela: 'soa', acao: 'Implementar os controles',
    destrava: ['controles_evidencia'],
    avaliar: (c) => {
      const t = aplicaveis(c);
      const numero = `${c.controles.feito} de ${t}`;
      return t === 0 ? falta('Não há controle aplicável na SoA.', numero)
        : c.controles.feito < t ? falta(`${plural(t - c.controles.feito, 'controle aplicável ainda não está implementado', 'controles aplicáveis ainda não estão implementados')}.`, numero)
          : ok('Todos os controles aplicáveis estão implementados.', numero);
    } },
  { id: 'controles_evidencia', estagio: 2, requisito: '8.1', titulo: 'Controle implementado com evidência', tela: 'evidence', acao: 'Anexar as evidências',
    destrava: [], cliente: 'Fornecer as evidências dos controles implementados',
    avaliar: (c) => (c.implementados_sem_evidencia > 0 ? falta('Há controles implementados sem nenhuma evidência anexada.', plural(c.implementados_sem_evidencia, 'sem evidência', 'sem evidência'))
      : c.controles.feito === 0 ? falta('Nenhum controle implementado ainda.') : ok('Todo controle implementado tem evidência anexada.')) },
  { id: 'evidencias_validas', estagio: 2, requisito: '7.5.3', titulo: 'Evidências válidas e conformes', tela: 'evidence', filtro: 'vencidas_ou_nao_conformes', acao: 'Renovar as evidências',
    destrava: [], cliente: 'Enviar as evidências vencidas ou recusadas de novo',
    avaliar: (c) => (c.evidencias_vencidas_ou_nao_conformes > 0
      ? falta('Há evidências vencidas ou avaliadas como não conformes.', `${c.evidencias_vencidas_ou_nao_conformes} de ${c.evidencias}`)
      : c.evidencias === 0 ? falta('Nenhuma evidência enviada.', '0 evidências') : ok('Nenhuma evidência vencida nem não conforme.', plural(c.evidencias, 'evidência', 'evidências'))) },
  { id: 'conscientizacao', estagio: 2, requisito: '7.2 e 7.3', titulo: 'Conscientização registrada', tela: 'training', acao: 'Registrar a conscientização',
    destrava: [], cliente: 'Garantir que as pessoas concluam a conscientização',
    avaliar: (c) => (c.treinamentos_concluidos > 0 ? ok('Há treinamentos concluídos registrados.', plural(c.treinamentos_concluidos, 'concluído', 'concluídos'))
      : falta('Nenhum treinamento concluído registrado.', '0 concluídos')) },
  { id: 'medicao', estagio: 2, requisito: '9.1', titulo: 'Indicadores medidos', tela: 'metrics', acao: 'Registrar as medições',
    destrava: ['analise_critica'],
    avaliar: (c) => (c.indicadores_medidos > 0 ? ok('Há indicadores com medição registrada.', `${c.indicadores_medidos} de ${c.indicadores}`)
      : falta('Nenhum indicador tem medição registrada.', `0 de ${c.indicadores}`)) },
  { id: 'auditoria_interna', estagio: 2, requisito: '9.2', titulo: 'Auditoria interna concluída', tela: 'audits', acao: 'Realizar a auditoria interna',
    destrava: ['nc_tratadas', 'analise_critica'], cliente: 'Indicar um auditor interno que não tenha implementado o que vai auditar',
    avaliar: (c) => (c.auditorias_internas > 0 ? ok('Há auditoria interna concluída.', plural(c.auditorias_internas, 'concluída', 'concluídas'))
      : falta('Nenhuma auditoria interna concluída.', '0 concluídas')) },
  { id: 'analise_critica', estagio: 2, requisito: '9.3', titulo: 'Análise crítica pela direção realizada', tela: 'management-review', acao: 'Realizar a análise crítica',
    destrava: [], cliente: 'Reunir a direção para a análise crítica do SGSI',
    avaliar: (c) => (c.analises_criticas > 0 ? ok('Há análise crítica concluída; as entradas da 9.3.2 se conferem na ata.', plural(c.analises_criticas, 'concluída', 'concluídas'))
      : falta('Nenhuma análise crítica concluída.', '0 concluídas')) },
  { id: 'nc_tratadas', estagio: 2, requisito: '10.2', titulo: 'Não conformidades com ação corretiva concluída', tela: 'capa', acao: 'Concluir as ações das não conformidades',
    destrava: [],
    avaliar: (c) => (c.nc_total === 0
      ? (c.auditorias_internas === 0 ? { situacao: 'nao_se_aplica', motivo: 'Sem auditoria interna concluída, não há não conformidade a tratar ainda.', numero: '' }
        : ok('A auditoria não registrou não conformidade.', '0 não conformidades'))
      : c.nc_sem_acao_concluida > 0 ? falta('Há não conformidades cuja ação corretiva não foi concluída.', `${c.nc_sem_acao_concluida} de ${c.nc_total}`)
        : ok('Toda não conformidade tem a ação corretiva concluída.', `${c.nc_total} de ${c.nc_total}`)) },
  { id: 'acoes_vencidas', estagio: 2, requisito: '10.2', titulo: 'Nenhuma ação corretiva vencida', tela: 'capa', filtro: 'vencidas', acao: 'Ver as ações vencidas',
    destrava: [], cliente: 'Concluir as ações corretivas atrasadas',
    avaliar: (c) => (c.acoes_vencidas > 0 ? falta('Há ações corretivas abertas com o prazo vencido.', plural(c.acoes_vencidas, 'vencida', 'vencidas'))
      : ok('Nenhuma ação corretiva vencida.')) },
];

export type Criterio = Omit<Definicao, 'avaliar'> & Avaliacao & { destrava_pendentes: number };

const RESSALVA = 'Pré-avaliação pelos dados do n.iso. Não substitui a auditoria interna nem a decisão do organismo certificador.';

/** Os critérios avaliados, o que falta em ordem, o veredito e o indicador único de progresso. Função pura. */
export function avaliarProntidao(c: Contagens) {
  const avaliados = CRITERIOS.map(({ avaliar, ...d }) => ({ ...d, ...avaliar(c) }));
  const pendentes = new Set(avaliados.filter((x) => x.situacao === 'pendente').map((x) => x.id));
  const criterios: Criterio[] = avaliados.map((x) => ({ ...x, destrava_pendentes: x.destrava.filter((d) => pendentes.has(d)).length }));
  // O que falta: estágio 1 antes do 2; dentro do estágio, o que destrava mais pendências primeiro; empate, a ordem da norma.
  const faltam = criterios.filter((x) => x.situacao === 'pendente')
    .sort((a, b) => a.estagio - b.estagio || b.destrava_pendentes - a.destrava_pendentes || CRITERIOS.findIndex((d) => d.id === a.id) - CRITERIOS.findIndex((d) => d.id === b.id));
  const conta = (e: 1 | 2) => faltam.filter((x) => x.estagio === e).length;
  const [f1, f2] = [conta(1), conta(2)];
  const faltam_ = (q: number, e: number) => `${q === 1 ? 'Falta 1 item' : `Faltam ${q} itens`} para o estágio ${e}.`;
  const frase = f1 > 0 ? faltam_(f1, 1) : f2 > 0 ? `Pronto para o estágio 1. ${faltam_(f2, 2)}` : 'Pronto para os estágios 1 e 2.';
  // O tom é o vocabulário de estado do Painel (`pn-estado`): o rótulo vai escrito, a cor só acompanha.
  const [tom, rotulo] = f1 > 0 ? ['semana', 'Estágio 1 pendente'] : f2 > 0 ? ['semana', 'Estágio 2 pendente'] : ['ok', 'Critérios atendidos'];
  const t = aplicaveis(c);
  return {
    veredito: { tom, rotulo, frase, apoio: RESSALVA },
    estagios: [{ estagio: 1, pronto: f1 === 0, faltam: f1 }, { estagio: 2, pronto: f1 + f2 === 0, faltam: f2 }],
    indicador: { implementados: c.controles.feito, aplicaveis: t, texto: `${c.controles.feito} de ${t} controles aplicáveis implementados` },
    criterios, faltam,
    do_cliente: faltam.filter((x) => !!x.cliente),
  };
}

const n = (v: unknown) => Number(v ?? 0) || 0;

export type PorNorma = { standard: string; rotulo: string; implementados: number; aplicaveis: number; texto: string };
// Rótulo humano por norma conhecida; norma legada mostra o `standard` cru.
const ROTULO_NORMA: Record<string, string> = { [ISO_27001_2022_STANDARD]: 'ISO 27001:2022', [ISO_27701_2025_STANDARD]: 'ISO 27701:2025' };
/** Detalhe por norma, pela MESMA classe do número somado ('na' fora). A soma das normas é o `indicador` somado. */
export function porNorma(linhas: { standard: string; classe: string; n: number }[]): PorNorma[] {
  const m = new Map<string, { feito: number; ap: number }>();
  for (const l of linhas) {
    if (l.classe === 'na') continue;
    const x = m.get(l.standard) ?? { feito: 0, ap: 0 };
    x.ap += n(l.n); if (l.classe === 'feito') x.feito += n(l.n);
    m.set(l.standard, x);
  }
  return [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([standard, x]) => ({
    standard, rotulo: ROTULO_NORMA[standard] ?? standard, implementados: x.feito, aplicaveis: x.ap,
    texto: `${x.feito} de ${x.ap} controles aplicáveis implementados`,
  }));
}
const hoje = () => hojeEmSaoPaulo();

/** As contagens do projeto, num batch. Controles e evidências pelas MESMAS expressões do Painel (`painel.ts`). */
export async function contagensDoProjeto(db: D1Database, projectId: string): Promise<{ contagens: Contagens; certificacao: Record<string, string | null> | null; por_norma: PorNorma[] }> {
  const dia = hoje();
  const [proj, ctrl, a51, riscos, docs, evid, outros, cert, normas] = await db.batch([
    db.prepare(`SELECT ${SQL_ESCOPO_DEFINIDO} AS escopo,
        (trim(COALESCE(x.internal_strengths, '') || COALESCE(x.internal_weaknesses, '') || COALESCE(x.external_opportunities, '') || COALESCE(x.external_threats, '')) <> '') AS contexto
      FROM projects p LEFT JOIN context_analysis x ON x.project_id = p.id WHERE p.id = ?1`).bind(projectId),
    db.prepare(`SELECT classe, count(*) AS n, sum(CASE WHEN classe = 'na' AND trim(COALESCE(description, '')) = '' THEN 1 ELSE 0 END) AS sem_just,
        sum(CASE WHEN classe = 'feito' AND NOT EXISTS (SELECT 1 FROM evidencia_controles ec WHERE ec.control_id = k.id) THEN 1 ELSE 0 END) AS sem_evid
      FROM (SELECT id, description, ${SQL_CLASSE_CONTROLE} AS classe FROM compliance_controls WHERE project_id = ?1) k GROUP BY classe`).bind(projectId),
    db.prepare(`SELECT count(*) AS n FROM compliance_controls WHERE project_id = ?1 AND substr(title, 1, instr(title || ' ', ' ') - 1) = 'A.5.1'
      AND (ciso_approved_by IS NOT NULL OR ceo_approved_by IS NOT NULL)`).bind(projectId),
    // Riscos do n.iso: o mesmo recorte do Painel (sem atividade de tratamento do n.privacy).
    db.prepare(`SELECT count(*) AS total, sum(CASE WHEN COALESCE(status, 'Open') NOT IN ('Mitigated', 'Accepted', 'Closed') AND trim(COALESCE(treatment_plan, '')) = '' THEN 1 ELSE 0 END) AS sem
      FROM risks WHERE project_id = ?1${escopoRopa('programa')}`).bind(projectId),
    db.prepare(`SELECT sum(CASE WHEN tipo = 'politica' AND status = 'vigente' THEN 1 ELSE 0 END) AS politicas,
        sum(CASE WHEN status = 'vigente' AND revisar_ate IS NOT NULL AND substr(revisar_ate, 1, 10) < ?2 THEN 1 ELSE 0 END) AS vencidos
      FROM documentos WHERE project_id = ?1`).bind(projectId, dia),
    db.prepare(`SELECT count(*) AS total, sum(CASE WHEN ${SQL_EVIDENCIA_RUIM} THEN 1 ELSE 0 END) AS ruins FROM evidence WHERE project_id = ?1`).bind(projectId, dia),
    db.prepare(`SELECT
        (SELECT count(*) FROM stakeholders WHERE project_id = ?1) AS partes,
        (SELECT count(*) FROM project_governance WHERE project_id = ?1 AND COALESCE(role_category, '') <> 'consultor') AS papeis,
        (SELECT count(*) FROM performance_metrics WHERE project_id = ?1) AS indicadores,
        (SELECT count(*) FROM performance_metrics WHERE project_id = ?1 AND last_measured_at IS NOT NULL) AS medidos,
        (SELECT count(*) FROM training_records WHERE project_id = ?1 AND status = 'Completed') AS treinamentos,
        (SELECT count(*) FROM audit_schedule WHERE project_id = ?1 AND lower(audit_type) IN ('internal', 'interna') AND status = 'Completed') AS auditorias,
        (SELECT count(*) FROM management_reviews WHERE project_id = ?1 AND status IN ('Completed', 'concluido')) AS analises,
        (SELECT count(*) FROM audit_findings WHERE project_id = ?1 AND finding_type IN ('minor_nc', 'major_nc')) AS nc,
        (SELECT count(*) FROM audit_findings f WHERE f.project_id = ?1 AND f.finding_type IN ('minor_nc', 'major_nc')
           AND NOT EXISTS (SELECT 1 FROM corrective_actions a WHERE a.id = f.capa_id AND a.status = 'Closed')) AS nc_abertas,
        (SELECT count(*) FROM corrective_actions WHERE project_id = ?1${escopoRopa('programa')} AND COALESCE(status, 'Open') <> 'Closed' AND substr(due_date, 1, 10) < ?2) AS acoes,
        (SELECT count(*) FROM project_phases WHERE project_id = ?1) AS fases,
        (SELECT count(*) FROM project_phases WHERE project_id = ?1 AND status = 'completed') AS fases_ok`).bind(projectId, dia),
    db.prepare(`SELECT id, stage1_date, stage1_status, stage2_date, stage2_status, registrar, target_date FROM certification_tracking WHERE project_id = ?1`).bind(projectId),
    db.prepare(`SELECT standard, classe, count(*) AS n
      FROM (SELECT standard, ${SQL_CLASSE_CONTROLE} AS classe FROM compliance_controls WHERE project_id = ?1) GROUP BY standard, classe`).bind(projectId),
  ]);
  const p = (proj.results[0] ?? {}) as Record<string, unknown>;
  const classes = ctrl.results as { classe: string; n: number; sem_just: number; sem_evid: number }[];
  const daClasse = (k: string) => n(classes.find((x) => x.classe === k)?.n);
  const o = (outros.results[0] ?? {}) as Record<string, unknown>;
  const r = (riscos.results[0] ?? {}) as Record<string, unknown>;
  const d = (docs.results[0] ?? {}) as Record<string, unknown>;
  const e = (evid.results[0] ?? {}) as Record<string, unknown>;
  return {
    contagens: {
      escopo: !!n(p.escopo), contexto: !!n(p.contexto), partes: n(o.partes), papeis: n(o.papeis),
      politica_vigente: n(d.politicas), politica_a51_aprovada: n((a51.results[0] as { n?: number } | undefined)?.n),
      controles: { feito: daClasse('feito'), andamento: daClasse('andamento'), falta: daClasse('falta'), na: daClasse('na') },
      na_sem_justificativa: classes.reduce((t, x) => t + n(x.sem_just), 0), implementados_sem_evidencia: classes.reduce((t, x) => t + n(x.sem_evid), 0),
      riscos: n(r.total), riscos_sem_tratamento: n(r.sem), indicadores: n(o.indicadores), indicadores_medidos: n(o.medidos),
      documentos_revisao_vencida: n(d.vencidos), evidencias: n(e.total), evidencias_vencidas_ou_nao_conformes: n(e.ruins),
      treinamentos_concluidos: n(o.treinamentos), auditorias_internas: n(o.auditorias), analises_criticas: n(o.analises),
      nc_total: n(o.nc), nc_sem_acao_concluida: n(o.nc_abertas), acoes_vencidas: n(o.acoes), fases: { concluidas: n(o.fases_ok), total: n(o.fases) },
    },
    certificacao: (cert.results[0] as Record<string, string | null> | undefined) ?? null,
    por_norma: porNorma(normas.results as { standard: string; classe: string; n: number }[]),
  };
}

/** A resposta da rota: avaliação, os números comuns às telas (Monitor, Jornada, Prontidão) e as datas da certificação. */
export async function prontidaoDoProjeto(db: D1Database, projectId: string, quem: { cliente: boolean }) {
  const { contagens: c, certificacao, por_norma } = await contagensDoProjeto(db, projectId);
  const a = avaliarProntidao(c);
  const data = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${diaMes(v)}/${v.slice(0, 4)}` : null);
  return {
    gerado_em: new Date().toISOString(),
    visao: quem.cliente ? 'cliente' : 'equipe',
    ...a,
    indicador_por_norma: por_norma,   // irmão de `indicador`, que fica {implementados, aplicaveis, texto}
    numeros: {
      controles: { implementados: a.indicador.implementados, aplicaveis: a.indicador.aplicaveis },
      riscos: c.riscos, evidencias: c.evidencias, fases: c.fases,
    },
    certificacao: certificacao && {
      id: certificacao.id, data_estagio1: certificacao.stage1_date, data_estagio2: certificacao.stage2_date,
      estagio1: data(certificacao.stage1_date), estagio1_aprovado: certificacao.stage1_status === 'Passed',
      estagio2: data(certificacao.stage2_date), estagio2_aprovado: certificacao.stage2_status === 'Passed',
      organismo: certificacao.registrar || null,
    },
  };
}
