import { SQL_TITULOS_ADICIONAIS } from './bases';
import { cicloEmTexto, etapasDe, type EtapaLida } from './ciclo';
import { aprovacoesDoProjeto } from './documentos';
import { situacaoDaAtividade } from './ropa-abas/situacao';
import { acoesDasAtividades, faixaDePrazo, FAIXAS_PRAZO, type FaixaPrazo } from './riscos-atividade';

/**
 * Exportação CSV do n.privacy (F4): listas de atividades, riscos e ações das atividades, RIPD e LIA, num arquivo que abre no Excel em
 * pt-BR (BOM UTF-8, separador `;`, fim de linha CRLF). Toda célula vai entre aspas; a que começa com `= + - @ \t \r` ganha `'` na frente,
 * para o Excel não a executar como fórmula. Só leitura; toda consulta filtra o projeto.
 */

/** Teto de linhas por arquivo (o mesmo espírito do `audit-log`, que corta em 500): acima dele o arquivo sai cortado e a resposta avisa. */
export const TETO_LINHAS = 5000;

export function celulaCsv(v: unknown): string {
  let s = typeof v === 'number' && !Number.isInteger(v) ? String(v).replace('.', ',') : String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const montarCsv = (cabecalho: string[], linhas: unknown[][]) =>
  '﻿' + [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(';') + '\r\n').join('');

export const STATUS: Record<string, string> = {
  Active: 'Ativo', Inactive: 'Inativo', Draft: 'Rascunho', 'Under Review': 'Em revisão', Approved: 'Aprovado',
  Open: 'Aberto', Closed: 'Concluído', Accepted: 'Aceito', 'In Progress': 'Em andamento', rascunho: 'Rascunho', concluida: 'Concluída',
};
export const NIVEL: Record<string, string> = { Low: 'Baixo', Medium: 'Médio', High: 'Alto', Critical: 'Crítico' };
export const ESTRATEGIA: Record<string, string> = { Mitigate: 'Mitigar', Accept: 'Aceitar', Transfer: 'Transferir', Avoid: 'Evitar' };
export const traduz = (mapa: Record<string, string>, v: unknown) => (v == null || v === '' ? '' : mapa[String(v)] ?? String(v));
const simNao = (v: unknown) => (v ? 'Sim' : 'Não');
const ROTULO_FAIXA = Object.fromEntries(FAIXAS_PRAZO.map((f) => [f.id, f.rotulo])) as Record<FaixaPrazo, string>;

export type FiltroExportacao = { probabilidade?: number; impacto?: number; faixa?: FaixaPrazo };
type Tabela = { cabecalho: string[]; linhas: unknown[][] };
type Linha = Record<string, unknown>;

const todas = async (db: D1Database, sql: string, ...binds: unknown[]) => (await db.prepare(sql).bind(...binds).all<Linha>()).results;
const hoje = () => new Date().toISOString().slice(0, 10);

async function atividades(db: D1Database, projectId: string): Promise<Tabela> {
  const aprovacoes = await aprovacoesDoProjeto(db, projectId, undefined, 'tratamento');
  const [regs, ciclos] = await Promise.all([
    todas(db, `SELECT r.*, q.referencia AS base_ref, q.titulo AS base_titulo, ${SQL_TITULOS_ADICIONAIS} AS adicionais, pa.nome AS responsavel
                 FROM ropa_records r LEFT JOIN requisitos q ON q.id = r.base_legal_id
                 LEFT JOIN partes pa ON pa.id = r.owner_parte_id AND pa.project_id = r.project_id
                WHERE r.project_id = ? AND COALESCE(r.status, '') <> 'Inactive' ORDER BY r.created_at, r.id LIMIT ?`, projectId, TETO_LINHAS + 1),
    todas(db, `SELECT c.ropa_id, c.etapa, c.situacao, c.item_id, i.nome AS item_nome, c.descricao FROM tratamento_ciclo c
                 LEFT JOIN itens i ON i.id = c.item_id WHERE c.project_id = ?`, projectId),
  ]);
  const cicloDe = (id: unknown) => cicloEmTexto(etapasDe(ciclos.filter((c) => c.ropa_id === id) as unknown as Omit<EtapaLida, 'rotulo'>[])).join(' | ');
  return {
    cabecalho: ['Finalidade', 'Base legal principal', 'Bases adicionais', 'Base GDPR', 'Titulares', 'Categorias de dados', 'Dados sensíveis',
      'Crianças e adolescentes', 'Transferência internacional', 'Salvaguarda da transferência', 'Destinatários', 'Retenção', 'Ciclo de vida',
      'Responsável', 'Exige RIPD', 'Situação', 'Criado em', 'Atualizado em', 'Nome', 'Situação da atividade'],
    linhas: regs.map((r) => [
      r.processing_purpose, r.base_ref ? `${r.base_ref} - ${r.base_titulo}` : r.legal_basis, r.adicionais, r.base_gdpr, r.data_subjects,
      r.data_categories, simNao(r.dados_sensiveis), simNao(r.criancas_adolescentes), simNao(r.international_transfers), r.transfer_safeguards,
      r.recipients, r.retention_period, cicloDe(r.id), r.responsavel || r.owner, simNao(r.dpia_required), traduz(STATUS, r.status || 'Active'),
      r.created_at, r.updated_at, r.nome,
      situacaoDaAtividade({ status: r.status as string | null, reaberta_em: r.reaberta_em as string | null, aprovacao: aprovacoes.get(String(r.id)) ?? null, aprovacao_anterior: null }).rotulo,
    ]),
  };
}

async function riscos(db: D1Database, projectId: string, f: FiltroExportacao): Promise<Tabela> {
  const regs = await todas(db,
    `SELECT r.*, rr.processing_purpose AS atividade, pa.nome AS responsavel FROM risks r
       JOIN ropa_records rr ON rr.id = r.ropa_id AND rr.project_id = r.project_id
       LEFT JOIN partes pa ON pa.id = r.owner_parte_id AND pa.project_id = r.project_id
      WHERE r.project_id = ?1 AND (?2 IS NULL OR r.probability = ?2) AND (?3 IS NULL OR r.impact = ?3)
      ORDER BY r.impact * r.probability DESC, rr.processing_purpose, r.created_at LIMIT ?4`,
    projectId, f.probabilidade ?? null, f.impacto ?? null, TETO_LINHAS + 1);
  return {
    cabecalho: ['Atividade', 'Ameaça', 'Vulnerabilidade', 'Ativo', 'Impacto', 'Probabilidade', 'Nível', 'Estratégia', 'Plano de tratamento',
      'Impacto residual', 'Probabilidade residual', 'Nível residual', 'Responsável', 'Situação', 'Criado em'],
    linhas: regs.map((r) => [
      r.atividade, r.threat, r.vulnerability, r.asset, r.impact, r.probability, traduz(NIVEL, r.risk_level), traduz(ESTRATEGIA, r.treatment),
      r.treatment_plan, r.residual_impact, r.residual_probability, traduz(NIVEL, r.residual_level), r.responsavel, traduz(STATUS, r.status || 'Open'),
      r.created_at,
    ]),
  };
}

async function acoes(db: D1Database, projectId: string, f: FiltroExportacao): Promise<Tabela> {
  const dia = hoje();
  const aberta = (s: unknown) => (s || 'Open') !== 'Closed';
  // ponytail: a faixa é conta em JS sobre as ações do projeto (poucas centenas); filtrar em SQL exigiria repetir as datas da faixa.
  const regs = (await acoesDasAtividades(db, projectId, { soAbertas: !!f.faixa, limite: f.faixa ? 100_000 : TETO_LINHAS + 1 }))
    .filter((a) => !f.faixa || faixaDePrazo(a.due_date, dia) === f.faixa);
  return {
    cabecalho: ['Atividade', 'Ação', 'Descrição', 'Prazo', 'Faixa de prazo', 'Responsável', 'Risco ligado', 'Situação', 'Criada em', 'Concluída em'],
    linhas: regs.map((a) => [
      a.atividade, a.title, a.description, a.due_date, aberta(a.status) ? ROTULO_FAIXA[faixaDePrazo(a.due_date, dia)] : '', a.responsavel, a.risco,
      traduz(STATUS, a.status || 'Open'), a.created_at, a.completed_at,
    ]),
  };
}

async function ripd(db: D1Database, projectId: string): Promise<Tabela> {
  const regs = await todas(db,
    `SELECT d.*, rr.processing_purpose AS atividade FROM dpia_assessments d
       LEFT JOIN ropa_records rr ON rr.id = d.ropa_id AND rr.project_id = d.project_id
      WHERE d.project_id = ? ORDER BY d.created_at, d.id LIMIT ?`, projectId, TETO_LINHAS + 1);
  return {
    cabecalho: ['Atividade do RoPA', 'Tratamento ou sistema', 'Titulares', 'Categorias de dados', 'Fluxo de dados', 'Necessidade e proporcionalidade',
      'Riscos identificados', 'Medidas técnicas', 'Medidas de mitigação', 'Risco residual', 'Parecer do encarregado', 'Situação', 'Aprovado por',
      'Aprovado em', 'Criado em'],
    linhas: regs.map((d) => [
      d.atividade, d.processing_name || d.system_name, d.data_subjects_types, d.personal_data_categories, d.data_flow_description,
      d.necessity_proportionality, d.risks_identified || d.data_category_risk, d.technical_measures, d.mitigation_measures, d.residual_risk_level,
      d.dpo_recommendations || d.dpo_opinion, traduz(STATUS, d.status || 'Draft'), d.dpo_approved_by, d.dpo_approved_at, d.created_at,
    ]),
  };
}

async function lia(db: D1Database, projectId: string): Promise<Tabela> {
  const regs = await todas(db,
    `SELECT l.*, rr.processing_purpose AS atividade FROM lia_assessments l JOIN ropa_records rr ON rr.id = l.ropa_id AND rr.project_id = l.project_id
      WHERE l.project_id = ? ORDER BY rr.processing_purpose, l.id LIMIT ?`, projectId, TETO_LINHAS + 1);
  const CONCLUSAO: Record<string, string> = { prevalece: 'O legítimo interesse prevalece', nao_prevalece: 'O legítimo interesse não prevalece' };
  return {
    cabecalho: ['Atividade', 'Finalidade legítima', 'Necessidade', 'Balanceamento', 'Salvaguardas', 'Conclusão', 'Situação', 'Concluída por',
      'Concluída em', 'Atualizada em'],
    linhas: regs.map((l) => [
      l.atividade, l.finalidade_legitima, l.necessidade, l.balanceamento, l.salvaguardas, traduz(CONCLUSAO, l.conclusao), traduz(STATUS, l.status),
      l.concluida_por, l.concluida_em, l.updated_at,
    ]),
  };
}

/** Tipos exportáveis → arquivo e montagem. As rotas saem desta lista (`src/routes/exportacao.ts`). */
export const EXPORTACOES = {
  atividades: { rotulo: 'atividades', montar: atividades },
  ripd: { rotulo: 'RIPD', montar: ripd },
  'riscos-atividade': { rotulo: 'riscos das atividades', montar: riscos },
  'acoes-atividade': { rotulo: 'ações das atividades', montar: acoes },
  lia: { rotulo: 'LIA', montar: lia },
} satisfies Record<string, { rotulo: string; montar: (db: D1Database, projectId: string, f: FiltroExportacao) => Promise<Tabela> }>;
export type TipoExportacao = keyof typeof EXPORTACOES;

/** O CSV pronto, com o teto aplicado. */
export async function exportarCsv(db: D1Database, projectId: string, tipo: TipoExportacao, filtro: FiltroExportacao = {}) {
  const t = await EXPORTACOES[tipo].montar(db, projectId, filtro);
  const truncado = t.linhas.length > TETO_LINHAS;
  const linhas = truncado ? t.linhas.slice(0, TETO_LINHAS) : t.linhas;
  return { csv: montarCsv(t.cabecalho, linhas), total: linhas.length, truncado };
}
