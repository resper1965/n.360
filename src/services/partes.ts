import { logAudit } from '../helpers';
import { log, resumoErro } from '../observability';
import { ehDpo, membroDpoDaParte } from './encarregado-pessoa';
import { normalizarNome } from './nomes';

/** Nome comparável: sem caixa e sem espaço repetido. Não tira acento (a spec pede nome exato). */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Lotes de 50: ponytail, teto de statements por batch do D1; sobe se um projeto passar de milhares de linhas. */
async function emLotes(db: D1Database, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  const saida: D1Result[] = [];
  for (let i = 0; i < stmts.length; i += 50) saida.push(...(await db.batch(stmts.slice(i, i + 50))));
  return saida;
}

const mudancas = (rs: D1Result[]) => rs.reduce((s, r) => s + (r.meta.changes ?? 0), 0);

export type ResumoImportacao = { criadas: number; reaproveitadas: number; vinculos: number; avisos: string[] };

/**
 * Traz as pessoas que o projeto já tem para `partes`: governança (menos os `consultor`, que são da ness.),
 * e partes interessadas (fornecedor já é parte: a 0061 e o gatilho vendor_perfil_do_terceiro fazem a ponte). Repetível: reaproveita a parte do mesmo tipo e nome, e o vínculo é
 * `INSERT OR IGNORE` sobre a UNIQUE.
 */
export async function importarPartes(db: D1Database, projectId: string, ator: string): Promise<ResumoImportacao> {
  const [gov, stk, existentes] = await Promise.all([
    db.prepare(`SELECT name, email, role_category, job_title FROM project_governance WHERE project_id = ? AND role_category != 'consultor' ORDER BY rowid`)
      .bind(projectId).all<{ name: string; email: string | null; role_category: string; job_title: string | null }>(),
    db.prepare('SELECT name FROM stakeholders WHERE project_id = ? ORDER BY rowid').bind(projectId).all<{ name: string }>(),
    db.prepare('SELECT id, nome, tipo FROM partes WHERE project_id = ?').bind(projectId).all<{ id: string; nome: string; tipo: string }>(),
  ]);

  const ids = new Map<string, string>();
  for (const p of existentes.results) if (!ids.has(`${p.tipo}|${norm(p.nome)}`)) ids.set(`${p.tipo}|${norm(p.nome)}`, p.id);

  const partes: D1PreparedStatement[] = [];
  const vinculos: D1PreparedStatement[] = [];
  let criadas = 0;
  let reaproveitadas = 0;

  const garantir = (tipo: 'pessoa' | 'organizacao', nome: string, email: string | null): string => {
    const chave = `${tipo}|${norm(nome)}`;
    const achou = ids.get(chave);
    if (achou) { reaproveitadas++; return achou; }
    const id = crypto.randomUUID();
    ids.set(chave, id);
    criadas++;
    partes.push(db.prepare('INSERT INTO partes (id, project_id, tipo, nome, email) VALUES (?, ?, ?, ?, ?)')
      .bind(id, projectId, tipo, normalizarNome(nome), email ? email.trim().toLowerCase() : null));
    return id;
  };
  const vincular = (parteId: string, papel: string) => vinculos.push(
    db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, ?, 'projeto', ?)`)
      .bind(crypto.randomUUID(), projectId, parteId, papel, projectId));

  for (const g of gov.results) vincular(garantir('pessoa', g.name, g.email), ehDpo(g) ? 'encarregado' : 'responsavel');
  for (const s of stk.results) vincular(garantir('organizacao', s.name, null), 'parte_interessada');

  // Lote que falha no meio deixa os anteriores gravados: aí a contagem sai do banco, não do plano, e a trilha sai do mesmo jeito.
  const avisos: string[] = [];
  let novos = 0;
  try {
    await emLotes(db, partes); // as partes primeiro: o vínculo tem FK para elas
    novos = mudancas(await emLotes(db, vinculos));
  } catch (e) {
    log('error', { msg: 'partes_importar', projeto: projectId, erro: resumoErro(e) });
    avisos.push('A importação de partes parou no meio; importe de novo para completar.');
    const n = await db.prepare('SELECT COUNT(*) AS n FROM partes WHERE project_id = ?').bind(projectId).first<{ n: number }>();
    criadas = Math.max(0, (n?.n ?? 0) - existentes.results.length);
  }
  await logAudit(db, 'partes.importadas', ator, `Importação de partes: ${criadas} criadas, ${reaproveitadas} reaproveitadas, ${novos} vínculos`, '', '', projectId);
  return { criadas, reaproveitadas, vinculos: novos, avisos };
}

/** Tabela e colunas que entram em SQL vêm só daqui, nunca da requisição. */
const FONTES = [
  { tabela: 'risks', coluna: 'owner', parte: 'owner_parte_id' },
  { tabela: 'compliance_controls', coluna: 'owner', parte: 'owner_parte_id' },
  { tabela: 'ropa_records', coluna: 'owner', parte: 'owner_parte_id' },
  { tabela: 'corrective_actions', coluna: 'assigned_to', parte: 'assigned_to_parte_id' },
  { tabela: 'checklist_progress', coluna: 'assigned_to', parte: 'assigned_to_parte_id' },
] as const;

export type Pendencia = { tabela: string; coluna: string; texto: string; n: number };
export type RelatorioConciliacao = { casados: Record<string, number>; sem_correspondencia: Pendencia[]; ambiguos: Pendencia[] };

/**
 * Liga o responsável em texto à parte de mesmo nome (exato, sem caixa e sem espaço repetido), por projeto.
 * Nome que bate com mais de uma parte é ambíguo e não é ligado. Só considera linha ainda sem parte; o texto
 * nunca é alterado. O dono do ativo vira vínculo `responsavel` do item. Repetível.
 */
export async function conciliarResponsaveis(db: D1Database, projectId: string, ator: string): Promise<RelatorioConciliacao> {
  const partes = await db.prepare('SELECT id, nome FROM partes WHERE project_id = ?').bind(projectId).all<{ id: string; nome: string }>();
  const porNome = new Map<string, string[]>();
  for (const p of partes.results) porNome.set(norm(p.nome), [...(porNome.get(norm(p.nome)) ?? []), p.id]);

  const casados: Record<string, number> = {};
  const sem = new Map<string, Pendencia>();
  const amb = new Map<string, Pendencia>();
  const anotar = (mapa: Map<string, Pendencia>, tabela: string, coluna: string, texto: string) => {
    const k = `${tabela}|${norm(texto)}`;
    const atual = mapa.get(k);
    if (atual) atual.n++; else mapa.set(k, { tabela, coluna, texto: texto.trim(), n: 1 });
  };
  /** A parte única de um nome, ou null (e anota por quê). */
  const resolver = (tabela: string, coluna: string, texto: string): string | null => {
    const achadas = porNome.get(norm(texto));
    if (!achadas) { anotar(sem, tabela, coluna, texto); return null; }
    if (achadas.length > 1) { anotar(amb, tabela, coluna, texto); return null; }
    return achadas[0];
  };

  for (const f of FONTES) {
    const linhas = await db.prepare(
      `SELECT id, ${f.coluna} AS texto FROM ${f.tabela} WHERE project_id = ? AND ${f.parte} IS NULL AND trim(COALESCE(${f.coluna}, '')) != ''`
    ).bind(projectId).all<{ id: string; texto: string }>();
    const stmts: D1PreparedStatement[] = [];
    for (const l of linhas.results) {
      const parte = resolver(f.tabela, f.coluna, l.texto);
      if (parte) stmts.push(db.prepare(`UPDATE ${f.tabela} SET ${f.parte} = ? WHERE id = ? AND project_id = ? AND ${f.parte} IS NULL`).bind(parte, l.id, projectId));
    }
    casados[f.tabela] = mudancas(await emLotes(db, stmts));
  }

  const itens = await db.prepare(
    `SELECT id, responsavel_texto AS texto FROM itens WHERE project_id = ? AND tipo = 'ativo' AND status = 'ativo' AND trim(COALESCE(responsavel_texto, '')) != ''`
  ).bind(projectId).all<{ id: string; texto: string }>();
  const vinculos: D1PreparedStatement[] = [];
  for (const i of itens.results) {
    const parte = resolver('itens', 'responsavel_texto', i.texto);
    if (parte) vinculos.push(db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, 'responsavel', 'item', ?)`)
      .bind(crypto.randomUUID(), projectId, parte, i.id));
  }
  casados.itens = mudancas(await emLotes(db, vinculos));

  const ordenar = (m: Map<string, Pendencia>) => [...m.values()].sort((a, b) => a.tabela.localeCompare(b.tabela) || a.texto.localeCompare(b.texto));
  const relatorio = { casados, sem_correspondencia: ordenar(sem), ambiguos: ordenar(amb) };
  await logAudit(db, 'partes.conciliadas', ator,
    `Conciliação de responsáveis: ${Object.values(casados).reduce((a, b) => a + b, 0)} ligados, ${relatorio.sem_correspondencia.length} sem correspondência, ${relatorio.ambiguos.length} ambíguos`, '', '', projectId);
  return relatorio;
}

/**
 * Por que a parte não pode mudar de tipo, ou null. Pessoa -> organização: conta ligada, encarregado, responsável ou linha do DPO na
 * governança (o papel é de gente). Organização -> pessoa: CNPJ ou qualquer marca de fornecedor (tipo, criticidade, avaliação,
 * questionário, perfil, papel de agente, parceiro da atividade, responsável apontando para ela, vínculo de outro módulo).
 * A mensagem da organização é genérica de propósito: não revela módulo que o usuário pode não ter.
 */
export async function recusaDeMudarTipo(db: D1Database, projectId: string,
  p: { id: string; tipo: string; nome: string; email: string | null; user_id: string | null }, cnpj: string | null): Promise<string | null> {
  if (p.tipo === 'pessoa') {
    const papel = await db.prepare(`SELECT 1 FROM parte_vinculos WHERE parte_id = ? AND project_id = ? AND papel IN ('encarregado', 'responsavel') LIMIT 1`)
      .bind(p.id, projectId).first();
    return p.user_id || papel || (await membroDpoDaParte(db, projectId, p))
      ? 'Esta pessoa tem conta, é encarregada, responsável ou está na governança do projeto: o tipo não muda. Cadastre a organização à parte.'
      : null;
  }
  const preso = await db.prepare(`SELECT 1 WHERE EXISTS (SELECT 1 FROM partes WHERE id = ?1 AND terceiro_tipo IS NOT NULL)
      OR EXISTS (SELECT 1 FROM avaliacoes_terceiro WHERE parte_id = ?1) OR EXISTS (SELECT 1 FROM criticidades_terceiro WHERE parte_id = ?1)
      OR EXISTS (SELECT 1 FROM homologacoes WHERE parte_id = ?1) OR EXISTS (SELECT 1 FROM vendors WHERE parte_id = ?1)
      OR EXISTS (SELECT 1 FROM ot_fornecedores WHERE parte_id = ?1) OR EXISTS (SELECT 1 FROM tratamento_externo_parceiros WHERE parte_id = ?1)
      OR EXISTS (SELECT 1 FROM parte_vinculos WHERE parte_id = ?1 AND papel IN ('operador', 'cocontrolador', 'suboperador', 'terceiro'))
      OR EXISTS (SELECT 1 FROM parte_vinculos WHERE project_id = ?2 AND alvo_tipo = 'parte' AND alvo_id = ?1)`).bind(p.id, projectId).first();
  return cnpj || preso
    ? 'A organização tem vínculos que dependem do tipo (CNPJ, dados de fornecedor ou papéis de organização): o tipo não muda.'
    : null;
}
