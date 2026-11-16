// Assessment da RO-CB.BR.01 (spec 2026-11-11 fluidez §5): os itens técnicos vêm do inventário (por site e pior caso da organização),
// os de política são autoavaliação do cliente, confirmada pelo Gestor ARCiber; o 5.1.1 (exceções) fica fora deste ciclo.
import { conformidadePorSite, ITENS_TECNICOS, prazoEm, type ItemTecnico } from './ot-conformidade';
import { hojeEmSaoPaulo, mesesMaisSP } from './hoje';
import { TETO_LEITURA_OT } from './ot-inventario';

const FRAMEWORK = 'ONS-RO-CB.BR.01';
const EXCECAO = '5.1.1';
// shortcut: só IP e MAC saem por regex; nome de ativo citado em texto livre não tem padrão (a tela pede para não citar). Se aparecer
// caso real, cruzar com os nomes do inventário do projeto.
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const MAC = /\b[0-9a-f]{2}(?:[:-][0-9a-f]{2}){5}\b/gi;
/** Tira IP e MAC do texto livre que vai ao relatório e à tela; código de item (4.5.1.1) tem a forma de IP e fica. */
const semRede = (t: string | null, codigos: Set<string>) => t && t.replace(IPV4, (m) => (codigos.has(m) ? m : '[omitido]')).replace(MAC, '[omitido]');
type Ator = { id: string };
type Falha = { ok: false; status: 400 | 403 | 404 | 409; error: string };
type Resultado = { ok: true } | Falha;
// milissegundos: o updated_at é a versão que o Gestor confirma, e duas gravações no mesmo segundo não podem empatar
const AGORA_MS = `strftime('%Y-%m-%d %H:%M:%f', 'now')`;
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });
const tecnico = (codigo: string) => (ITENS_TECNICOS as readonly string[]).includes(codigo);

export interface DadosAvaliacao { situacao: 'atende' | 'parcial' | 'nao_atende' | 'nao_se_aplica'; justificativa?: string | null; responsavel_id?: string | null; proxima_revisao?: string | null }

// Da pior para a melhor; só sites que contam entram (levantamento e base ainda não aprovada não definem a organização).
const PIOR = ['nao_atende', 'sem_evidencia', 'evidencia_no_inventario'] as const;
const CONTAM = ['em_operacao', 'em_obra', 'base_em_aprovacao'];

type LinhaAvaliacao = { requisito_id: string; situacao: DadosAvaliacao['situacao']; justificativa: string | null; responsavel_id: string | null; responsavel_nome: string | null;
  proxima_revisao: string | null; confirmado_por: string | null; confirmado_por_nome: string | null; confirmado_em: string | null; updated_at: string };

export async function montarAssessment(db: D1Database, projectId: string, sites: string[]) {
  const hoje = hojeEmSaoPaulo();
  const lista = JSON.stringify(sites);
  const [reqs, sitesR, avs, evs, perg, levs, total] = await db.batch([
    db.prepare(`SELECT id, codigo, titulo, categoria, prazo_meses FROM ot_requisitos WHERE framework = ? LIMIT ${TETO_LEITURA_OT}`).bind(FRAMEWORK),
    db.prepare(`SELECT id, nome, fase FROM ot_sites WHERE project_id = ? AND id IN (SELECT value FROM json_each(?)) ORDER BY nome LIMIT ${TETO_LEITURA_OT}`).bind(projectId, lista),
    db.prepare(`SELECT a.requisito_id, a.situacao, a.justificativa, a.responsavel_id, r.name AS responsavel_nome, a.proxima_revisao, a.confirmado_por,
        c.name AS confirmado_por_nome, a.confirmado_em, a.updated_at FROM ot_avaliacoes a LEFT JOIN users r ON r.id = a.responsavel_id LEFT JOIN users c ON c.id = a.confirmado_por
      WHERE a.project_id = ? LIMIT ${TETO_LEITURA_OT}`).bind(projectId),
    db.prepare(`SELECT l.requisito_id, e.id, e.file_name, e.valido_ate FROM ot_requisito_evidencias l JOIN evidence e ON e.id = l.evidencia_id AND e.project_id = l.project_id
      WHERE l.project_id = ? ORDER BY e.file_name LIMIT ${TETO_LEITURA_OT}`).bind(projectId),
    db.prepare(`SELECT id, texto, item_norma FROM ot_roteiro_perguntas ORDER BY ordem LIMIT ${TETO_LEITURA_OT}`),
    db.prepare(`SELECT l.id, l.site_id, s.nome AS site_nome, l.realizado_em, l.roteiro FROM ot_levantamentos l JOIN ot_sites s ON s.id = l.site_id AND s.project_id = l.project_id
      WHERE l.project_id = ? AND l.status = 'ativo' AND l.site_id IN (SELECT value FROM json_each(?)) ORDER BY l.realizado_em DESC LIMIT ${TETO_LEITURA_OT}`).bind(projectId, lista),
    db.prepare(`SELECT count(*) AS n FROM ot_sites WHERE project_id = ? AND status = 'ativo'`).bind(projectId),
  ]);
  const porSite = await conformidadePorSite(db, projectId, sites);
  const siteRows = sitesR.results as { id: string; nome: string; fase: string }[];
  const codigos = new Set((reqs.results as { codigo: string }[]).map((r) => r.codigo));
  const aval = new Map((avs.results as LinhaAvaliacao[]).map((a) => [a.requisito_id, a]));

  const evid = new Map<string, any[]>();
  for (const e of evs.results as { requisito_id: string; id: string; file_name: string | null; valido_ate: string | null }[]) {
    (evid.get(e.requisito_id) ?? evid.set(e.requisito_id, []).get(e.requisito_id)!).push({ id: e.id, file_name: semRede(e.file_name, codigos), valido_ate: e.valido_ate, vencida: !!e.valido_ate && e.valido_ate < hoje });
  }
  // item_norma é uma lista ("4.1.3, 4.5.1.5"); a resposta mora no JSON `roteiro` do levantamento, por id da pergunta.
  const subsidio = new Map<string, any[]>();
  for (const l of levs.results as { id: string; site_id: string; site_nome: string; realizado_em: string; roteiro: string }[]) {
    const roteiro = JSON.parse(l.roteiro) as Record<string, { resposta: string }>;
    for (const p of perg.results as { id: string; texto: string; item_norma: string }[]) {
      const r = roteiro[p.id]?.resposta;
      if (!r || r === 'nao_perguntado') continue;
      for (const cod of p.item_norma.split(',').map((x) => x.trim())) {
        const q = subsidio.get(cod) ?? subsidio.set(cod, []).get(cod)!;
        q.push({ levantamento_id: l.id, site_id: l.site_id, site_nome: l.site_nome, pergunta: p.texto, resposta: r, realizado_em: l.realizado_em });
      }
    }
  }

  const itens = (reqs.results as { id: string; codigo: string; titulo: string; categoria: string | null; prazo_meses: number | null }[])
    .sort((x, y) => x.codigo.localeCompare(y.codigo, undefined, { numeric: true }))
    .map((r) => {
      const base = { codigo: r.codigo, titulo: r.titulo, categoria: r.categoria, prazo: r.prazo_meses ? prazoEm(r.prazo_meses) : null };
      if (tecnico(r.codigo)) {
        const por_site = siteRows.map((s) => ({ site_id: s.id, site_nome: s.nome, fase: s.fase, ...(porSite[s.id][r.codigo] as ItemTecnico) }));
        const contam = por_site.filter((s) => CONTAM.includes(s.fase));
        const situacao_org = contam.length ? PIOR.find((p) => contam.some((s) => s.situacao === p))! : 'nao_avaliado';
        return { ...base, tipo: 'tecnico' as const, por_site, situacao_org };
      }
      if (r.codigo === EXCECAO) return { ...base, tipo: 'excecao' as const, situacao: 'nao_avaliado', evidencia: 'Não avaliado neste ciclo' };
      const a = aval.get(r.id);
      const evidencias = evid.get(r.id) ?? [];
      return {
        ...base, tipo: 'politica' as const,
        avaliacao: a ? { situacao: a.situacao as DadosAvaliacao['situacao'], justificativa: a.justificativa as string | null, responsavel_id: a.responsavel_id as string | null,
          responsavel_nome: a.responsavel_nome as string | null, proxima_revisao: a.proxima_revisao as string | null, confirmado: !!a.confirmado_em,
          confirmado_por_nome: a.confirmado_por_nome as string | null, confirmado_em: a.confirmado_em as string | null, updated_at: a.updated_at as string } : null,
        evidencias,
        subsidio: (subsidio.get(r.codigo) ?? []).slice(0, 10),
        revisar: evidencias.some((e) => e.vencida) || (!!a?.proxima_revisao && a.proxima_revisao < hoje),
      };
    });

  const resumo = { atende: 0, parcial: 0, nao_atende: 0, nao_se_aplica: 0, nao_avaliado: 0, revisar: 0, a_confirmar: 0 };
  for (const i of itens) {
    if (i.tipo === 'tecnico') resumo[i.situacao_org === 'nao_atende' ? 'nao_atende' : 'nao_avaliado']++; // o inventário nunca afirma "atende"
    else if (i.tipo === 'excecao') resumo.nao_avaliado++;
    else {
      resumo[i.avaliacao?.situacao ?? 'nao_avaliado']++;
      if (i.revisar) resumo.revisar++;
      if (i.avaliacao && !i.avaliacao.confirmado) resumo.a_confirmar++;
    }
  }
  // restrito: a pessoa vê menos sites que o projeto tem (técnico), e a "situação na organização" é só a dos sites dela
  return { itens, resumo, restrito: sites.length < ((total.results[0] as { n: number })?.n ?? 0) };
}

async function requisito(db: D1Database, codigo: string) {
  return db.prepare('SELECT id FROM ot_requisitos WHERE framework = ? AND codigo = ?').bind(FRAMEWORK, codigo).first<{ id: string }>();
}

/** Responsável: conta ativa do projeto (cliente do projeto ou consultor na governança). */
const RESPONSAVEL_VALIDO = `SELECT 1 FROM users WHERE id = ? AND COALESCE(ativo, 1) <> 0 AND (client_project_id = ?
  OR (role = 'consultor' AND lower(email) IN (SELECT lower(email) FROM project_governance WHERE project_id = ? AND role_category = 'consultor')))`;

export async function salvarAvaliacao(db: D1Database, ator: Ator, projectId: string, codigo: string, d: DadosAvaliacao): Promise<Resultado> {
  const rq = await requisito(db, codigo);
  if (!rq) return falha(404, 'Requisito não encontrado');
  if (tecnico(codigo) || codigo === EXCECAO) return falha(400, 'Este item não tem autoavaliação: o técnico vem do inventário e o 5.1.1 fica fora deste ciclo');
  if (d.situacao !== 'atende' && (d.justificativa ?? '').trim().length < 3) return falha(400, 'Justificativa obrigatória quando o item não atende por inteiro');
  if (d.responsavel_id && !await db.prepare(RESPONSAVEL_VALIDO).bind(d.responsavel_id, projectId, projectId).first()) return falha(400, 'Referência inválida: responsavel_id');
  await db.prepare(`INSERT INTO ot_avaliacoes (id, project_id, requisito_id, situacao, justificativa, responsavel_id, proxima_revisao, atualizado_por, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${AGORA_MS}) ON CONFLICT (project_id, requisito_id) DO UPDATE SET situacao = excluded.situacao, justificativa = excluded.justificativa,
    responsavel_id = excluded.responsavel_id, proxima_revisao = excluded.proxima_revisao, confirmado_por = NULL, confirmado_em = NULL,
    atualizado_por = excluded.atualizado_por, updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID(), projectId, rq.id, d.situacao, d.justificativa ?? null, d.responsavel_id ?? null, d.proxima_revisao ?? null, ator.id).run();
  return { ok: true };
}

export async function confirmarAvaliacao(db: D1Database, ator: Ator, projectId: string, codigo: string, visto: string): Promise<Resultado> {
  const rq = await requisito(db, codigo);
  if (!rq) return falha(404, 'Requisito não encontrado');
  const r = await db.prepare(`UPDATE ot_avaliacoes SET confirmado_por = ?, confirmado_em = CURRENT_TIMESTAMP, proxima_revisao = coalesce(proxima_revisao, ?)
    WHERE project_id = ? AND requisito_id = ? AND confirmado_em IS NULL AND updated_at = ? AND atualizado_por IS NOT ?`).bind(ator.id, mesesMaisSP(12), projectId, rq.id, visto, ator.id).run();
  if (r.meta.changes) return { ok: true };
  const a = await db.prepare('SELECT confirmado_em, atualizado_por FROM ot_avaliacoes WHERE project_id = ? AND requisito_id = ?').bind(projectId, rq.id).first<{ confirmado_em: string | null; atualizado_por: string | null }>();
  if (!a) return falha(404, 'Avaliação não encontrada');
  if (!a.confirmado_em && a.atualizado_por === ator.id) return falha(403, 'Quem avaliou o item não o confirma. Peça a outra pessoa.');
  return falha(409, a.confirmado_em ? 'A avaliação já está confirmada' : 'A avaliação mudou depois que você abriu o item. Recarregue, revise e confirme de novo');
}

export async function ligarEvidencia(db: D1Database, projectId: string, codigo: string, evidenciaId: string): Promise<Resultado> {
  const rq = await requisito(db, codigo);
  if (!rq) return falha(404, 'Requisito não encontrado');
  if (tecnico(codigo) || codigo === EXCECAO) return falha(400, 'Este item não recebe evidência anexada');
  if (!await db.prepare('SELECT 1 FROM evidence WHERE id = ? AND project_id = ?').bind(evidenciaId, projectId).first()) return falha(404, 'Evidência não encontrada');
  await db.prepare('INSERT OR IGNORE INTO ot_requisito_evidencias (evidencia_id, requisito_id, project_id) VALUES (?, ?, ?)').bind(evidenciaId, rq.id, projectId).run();
  return { ok: true };
}

export async function desligarEvidencia(db: D1Database, projectId: string, codigo: string, evidenciaId: string): Promise<Resultado> {
  const rq = await requisito(db, codigo);
  if (!rq) return falha(404, 'Requisito não encontrado');
  // a confirmação valia para o conjunto de evidências que o Gestor viu; o UPDATE só roda se o DELETE apagou a ligação (mesmo batch, atômico)
  const [r] = await db.batch([
    db.prepare('DELETE FROM ot_requisito_evidencias WHERE evidencia_id = ? AND requisito_id = ? AND project_id = ?').bind(evidenciaId, rq.id, projectId),
    db.prepare(`UPDATE ot_avaliacoes SET confirmado_por = NULL, confirmado_em = NULL, updated_at = ${AGORA_MS} WHERE project_id = ? AND requisito_id = ? AND changes() > 0`).bind(projectId, rq.id),
  ]);
  return r.meta.changes ? { ok: true } : falha(404, 'Evidência não ligada a este item');
}

/**
 * Relatório de conformidade (spec fluidez §5): o assessment em forma de relatório, para imprimir. Nunca leva IP, MAC nem nome de ativo:
 * do item técnico saem só a situação e o texto de contagens; o subsídio (perguntas e respostas do levantamento) e os ids ficam de fora.
 */
export async function relatorioConformidade(db: D1Database, ator: Ator, projectId: string, sites: string[]) {
  const [{ itens }, sitesR, proj, quem] = await Promise.all([
    montarAssessment(db, projectId, sites),
    db.prepare(`SELECT nome, fase, base_aprovada_em FROM ot_sites WHERE project_id = ? AND id IN (SELECT value FROM json_each(?)) ORDER BY nome LIMIT ${TETO_LEITURA_OT}`)
      .bind(projectId, JSON.stringify(sites)).all<{ nome: string; fase: string; base_aprovada_em: string | null }>(),
    db.prepare('SELECT coalesce(project_name, client_name) AS nome FROM projects WHERE id = ?').bind(projectId).first<{ nome: string }>(),
    db.prepare('SELECT coalesce(name, email) AS nome FROM users WHERE id = ?').bind(ator.id).first<{ nome: string }>(),
  ]);
  const codigos = new Set(itens.map((i) => i.codigo));
  return {
    projeto: proj?.nome ?? null, gerado_em: new Date().toISOString(), gerado_por: quem?.nome ?? null, sites: sitesR.results,
    itens: itens.map((i) => {
      const base = { codigo: i.codigo, titulo: i.titulo, categoria: i.categoria, prazo: i.prazo, tipo: i.tipo };
      if (i.tipo === 'tecnico') return { ...base, situacao: i.situacao_org, por_site: i.por_site.map((s) => ({ site_nome: s.site_nome, situacao: s.situacao, evidencia: s.evidencia })) };
      if (i.tipo === 'excecao') return { ...base, situacao: i.situacao, justificativa: i.evidencia };
      const a = i.avaliacao;
      return { ...base, situacao: a?.situacao ?? 'nao_avaliado', justificativa: semRede(a?.justificativa ?? null, codigos), responsavel_nome: a?.responsavel_nome ?? null,
        proxima_revisao: a?.proxima_revisao ?? null, confirmado_por_nome: a?.confirmado_por_nome ?? null, confirmado_em: a?.confirmado_em ?? null,
        evidencias: i.evidencias.map((e) => ({ file_name: e.file_name, valido_ate: e.valido_ate, vencida: e.vencida })) };
    }),
  };
}
