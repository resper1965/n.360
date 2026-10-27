import type { z } from 'zod';
import { ETAPAS, type Etapa } from '../../schemas/ropa-abas';
import type { etapaCabecalhoSchema } from '../../schemas/ropa-abas';
import type { EstadoEtapa } from './tipos';
import { materializar } from './materializar';
import { derivarDaColeta, podarDaColeta, sincronizarItens } from './derivada';
import { exigirEditavel, falha, type Falha, type Gravado } from './comum';

export type EtapaCabecalhoCorpo = z.infer<typeof etapaCabecalhoSchema>;
export const ROTULOS: Record<Etapa, string> = {
  coleta: 'Coleta', uso: 'Uso ou Processamento', compartilhamento_interno: 'Compartilhamento Interno',
  compartilhamento_externo: 'Compartilhamento Externo', armazenamento: 'Armazenamento', eliminacao: 'Eliminação',
};

export type DadosDaEtapa = {
  etapa: Etapa; naoAplicavel: boolean; descricao: string | null;
  ativos: { local_armazenamento: string | null }[]; areas: number; parceiros: number;
  titularesDaColeta: { titular_id: string; dados: number }[];
  titularesDaEtapa: { titular_id: string; situacao: 'definido' | 'nao_usa'; dados: number }[];
  prazo: string | null; descarte: string | null;
  armazenamento: { naoAplicavel: boolean; ativos: number };
};
const cheio = (t: string | null) => !!String(t ?? '').trim();

/** Situação da etapa, DERIVADA: nunca gravada (spec 5). `faltas` em texto para a tela e para a conferência. */
export function situacaoDaEtapa(d: DadosDaEtapa): EstadoEtapa {
  if (d.naoAplicavel) return { etapa: d.etapa, situacao: 'nao_aplicavel', faltas: [] };
  const faltas: string[] = [];
  if (!cheio(d.descricao)) faltas.push('descrição');
  if (d.etapa === 'coleta') {
    if (!d.titularesDaColeta.length) faltas.push('ao menos um titular');
    else if (d.titularesDaColeta.some((t) => !t.dados)) faltas.push('dados de cada titular');
  } else if (!d.titularesDaColeta.length) {
    faltas.push('defina os titulares na Coleta');
  } else {
    const feitos = new Map(d.titularesDaEtapa.map((t) => [t.titular_id, t]));
    if (d.titularesDaColeta.some((t) => { const x = feitos.get(t.titular_id); return !x || (x.situacao === 'definido' && !x.dados); })) faltas.push('titulares da Coleta');
  }
  // Armazenamento Não Aplicável: nada é guardado, então não há ativo a eliminar (a Eliminação concluída assim continua concluída).
  if (!d.ativos.length && !(d.etapa === 'eliminacao' && d.armazenamento.naoAplicavel)) faltas.push('ao menos um ativo');
  if (d.etapa === 'compartilhamento_interno' && !d.areas) faltas.push('ao menos uma área');
  if (d.etapa === 'compartilhamento_externo' && !d.parceiros) faltas.push('ao menos um parceiro');
  if (d.etapa === 'armazenamento' && d.ativos.some((a) => !cheio(a.local_armazenamento))) faltas.push('local de armazenamento de cada ativo');
  if (d.etapa === 'eliminacao') { if (!cheio(d.prazo)) faltas.push('prazo'); if (!cheio(d.descarte)) faltas.push('descarte'); }
  return { etapa: d.etapa, situacao: faltas.length ? 'pendente' : 'concluida', faltas };
}

export type AtivoDaEtapa = { item_id: string; nome: string; local_armazenamento: string | null };
export type DadoDoTitular = { id: string; nome: string; sensivel: boolean };
export type TitularDaEtapa = { titular_id: string; nome: string; situacao: 'definido' | 'nao_usa'; dados: DadoDoTitular[] };
export type EtapaDetalhe = {
  etapa: Etapa; rotulo: string; situacao: EstadoEtapa['situacao']; faltas: string[]; nao_aplicavel: boolean; descricao: string | null;
  origem: string[]; solicita_consentimento: boolean | null; criancas_adolescentes: boolean; ativos: AtivoDaEtapa[];
  areas: { id: string; nome: string }[]; parceiros: { id: string; nome: string }[]; titulares: TitularDaEtapa[];
  prazo: string | null; descarte: string | null; migrado: boolean; bloqueada: boolean;
};

type LinhaRegistro = {
  retention_period: string | null; criancas_adolescentes: number | null; etapas_materializadas_em: string | null;
  etapa: Etapa | null; situacao: string | null; descricao: string | null; origem: string | null;
  solicita_consentimento: number | null; descarte: string | null; migrado: number | null;
};

/** As seis etapas com tudo o que está gravado, a situação derivada e as faltas. Materializa na primeira leitura. null = não é do projeto. */
export async function lerEtapas(db: D1Database, projectId: string, ropaId: string): Promise<EtapaDetalhe[] | null> {
  // Uma consulta traz o registro e o cabeçalho de cada etapa (LEFT JOIN): a leitura comum gasta só as consultas de detalhe.
  const lerRegistro = () => db.prepare(`SELECT r.retention_period, r.criancas_adolescentes, r.etapas_materializadas_em, c.etapa, c.situacao,
      COALESCE(c.descricao_etapa, c.descricao) AS descricao, c.origem, c.solicita_consentimento, c.descarte, c.migrado
    FROM ropa_records r LEFT JOIN tratamento_ciclo c ON c.ropa_id = r.id AND c.project_id = r.project_id
    WHERE r.id = ? AND r.project_id = ?`).bind(ropaId, projectId).all<LinhaRegistro>();
  let linhas = (await lerRegistro()).results;
  if (!linhas.length) return null;
  if (!linhas[0].etapas_materializadas_em && (await materializar(db, projectId, ropaId))) {
    linhas = (await lerRegistro()).results;
  }
  const reg = linhas[0];
  const cabPor = new Map(linhas.filter((l) => l.etapa).map((l) => [l.etapa as Etapa, l]));
  const [ativos, outros, titulares] = await Promise.all([
    db.prepare(`SELECT e.etapa, e.item_id, e.local_armazenamento, i.nome FROM tratamento_etapa_itens e JOIN itens i ON i.id = e.item_id
      WHERE e.ropa_id = ? AND e.project_id = ? ORDER BY e.rowid`).bind(ropaId, projectId).all<{ etapa: Etapa; item_id: string; local_armazenamento: string | null; nome: string }>(),
    // Áreas (interno) e parceiros (externo) numa consulta só: a etapa só lê a sua.
    db.prepare(`SELECT 'area' AS tipo, a.departamento_id AS id, d.nome FROM tratamento_interno_areas a JOIN departamentos d ON d.id = a.departamento_id
      WHERE a.ropa_id = ? AND a.project_id = ?
      UNION ALL SELECT 'parceiro', p.parte_id, pa.nome FROM tratamento_externo_parceiros p JOIN partes pa ON pa.id = p.parte_id
      WHERE p.ropa_id = ? AND p.project_id = ?`).bind(ropaId, projectId, ropaId, projectId).all<{ tipo: string; id: string; nome: string }>(),
    // Titular com os seus dados numa só consulta (LEFT JOIN: titular sem dado aparece com `dado_id` nulo).
    db.prepare(`SELECT t.etapa, t.titular_id, t.situacao, c.nome, d.dado_id, dc.nome AS dado_nome, dc.sensivel
      FROM tratamento_etapa_titulares t JOIN catalogo_itens c ON c.id = t.titular_id
      LEFT JOIN tratamento_etapa_dados d ON d.ropa_id = t.ropa_id AND d.etapa = t.etapa AND d.titular_id = t.titular_id
      LEFT JOIN catalogo_itens dc ON dc.id = d.dado_id
      WHERE t.ropa_id = ? AND t.project_id = ? ORDER BY c.nome COLLATE NOCASE, dc.nome COLLATE NOCASE`).bind(ropaId, projectId)
      .all<{ etapa: Etapa; titular_id: string; situacao: 'definido' | 'nao_usa'; nome: string; dado_id: string | null; dado_nome: string | null; sensivel: number | null }>(),
  ]);
  const porNome = (tipo: string) => outros.results.filter((x) => x.tipo === tipo)
    .map((x) => ({ id: x.id, nome: x.nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const areas = porNome('area');
  const parceiros = porNome('parceiro');
  const titularesDe = (etapa: Etapa): TitularDaEtapa[] => {
    const mapa = new Map<string, TitularDaEtapa>();
    for (const r of titulares.results) {
      if (r.etapa !== etapa) continue;
      let t = mapa.get(r.titular_id);
      if (!t) { t = { titular_id: r.titular_id, nome: r.nome, situacao: r.situacao, dados: [] }; mapa.set(r.titular_id, t); }
      if (r.dado_id) t.dados.push({ id: r.dado_id, nome: r.dado_nome ?? '', sensivel: !!r.sensivel });
    }
    return [...mapa.values()];
  };
  const ativosDe = (etapa: Etapa): AtivoDaEtapa[] => ativos.results.filter((a) => a.etapa === etapa)
    .map((a) => ({ item_id: a.item_id, nome: a.nome, local_armazenamento: a.local_armazenamento }));
  const naoAplicavelDe = (etapa: Etapa) => cabPor.get(etapa)?.situacao === 'nao_aplicavel';
  const titularesColeta = titularesDe('coleta');
  const dadosDaEtapa = (etapa: Etapa): DadosDaEtapa => {
    const h = cabPor.get(etapa);
    const naoAplicavel = naoAplicavelDe(etapa);
    return {
      etapa, naoAplicavel,
      descricao: naoAplicavel ? null : h?.descricao ?? null,
      ativos: naoAplicavel ? [] : ativosDe(etapa),
      areas: etapa === 'compartilhamento_interno' ? areas.length : 0,
      parceiros: etapa === 'compartilhamento_externo' ? parceiros.length : 0,
      titularesDaColeta: titularesColeta.map((t) => ({ titular_id: t.titular_id, dados: t.dados.length })),
      titularesDaEtapa: titularesDe(etapa).map((t) => ({ titular_id: t.titular_id, situacao: t.situacao, dados: t.dados.length })),
      prazo: etapa === 'eliminacao' ? reg.retention_period : null,
      descarte: naoAplicavel ? null : h?.descarte ?? null,
      armazenamento: { naoAplicavel: naoAplicavelDe('armazenamento'), ativos: ativosDe('armazenamento').length },
    };
  };
  const situacoes = ETAPAS.map((e) => situacaoDaEtapa(dadosDaEtapa(e)));
  const colet = situacoes[0];
  return ETAPAS.map((etapa, i) => {
    const h = cabPor.get(etapa);
    const naoAplicavel = naoAplicavelDe(etapa);
    const s = situacoes[i];
    return {
      etapa, rotulo: ROTULOS[etapa], situacao: s.situacao, faltas: s.faltas, nao_aplicavel: naoAplicavel,
      descricao: naoAplicavel ? null : h?.descricao ?? null,
      origem: h?.origem ? (JSON.parse(h.origem) as string[]) : [],
      solicita_consentimento: h?.solicita_consentimento == null ? null : !!h.solicita_consentimento,
      criancas_adolescentes: etapa === 'coleta' ? !!reg.criancas_adolescentes : false,
      ativos: naoAplicavel ? [] : ativosDe(etapa),
      areas: etapa === 'compartilhamento_interno' ? areas : [],
      parceiros: etapa === 'compartilhamento_externo' ? parceiros : [],
      titulares: etapa === 'coleta' || naoAplicavel ? (etapa === 'coleta' ? titularesColeta : []) : titularesDe(etapa),
      prazo: etapa === 'eliminacao' ? reg.retention_period : null,
      descarte: naoAplicavel ? null : h?.descarte ?? null,
      migrado: etapa === 'coleta' && !!h?.migrado,
      bloqueada: etapa !== 'coleta' && colet.situacao === 'pendente',
    };
  });
}

// ─── escritas ───
type Etapas = EtapaDetalhe[];
const de = (etapas: Etapas, etapa: Etapa) => etapas.find((x) => x.etapa === etapa)!;
const sem = (ids: string[]) => JSON.stringify(ids);

/** Pronto para escrever: a atividade é do projeto, não está cancelada e a leitura (com a materialização) funcionou. */
async function preparar(db: D1Database, projectId: string, ropaId: string): Promise<Falha | { ok: true; etapas: Etapas }> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  const etapas = await lerEtapas(db, projectId, ropaId);
  if (!etapas) return falha(404, 'Registro do RoPA não encontrado');
  return { ok: true, etapas };
}

/** Etapa 2 a 6 só depois da Coleta; a Coleta em si nunca é bloqueada. Não Aplicável também bloqueia escrita de conteúdo. */
function podeEscrever(etapas: Etapas, etapa: Etapa): Falha | null {
  const alvo = de(etapas, etapa);
  if (etapa !== 'coleta' && alvo.bloqueada) return falha(409, 'Conclua a Coleta antes');
  if (alvo.nao_aplicavel) return falha(409, 'Etapa marcada como Não Aplicável: desmarque para editar');
  return null;
}

/** Garante a linha de cabeçalho da etapa (situação `registrada`), sem mexer no item nem na descrição já gravados. */
const garantirCabecalho = (db: D1Database, projectId: string, ropaId: string, etapa: Etapa, ator: string) =>
  db.prepare(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, atualizado_por) VALUES (?, ?, ?, 'registrada', ?)
    ON CONFLICT(ropa_id, etapa) DO UPDATE SET atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`)
    .bind(ropaId, projectId, etapa, ator);

/** Itens da etapa; o item de cabeçalho da F3 (`tratamento_ciclo.item_id`) acompanha o primeiro ativo. */
const espelharPrimeiroItem = (db: D1Database, projectId: string, ropaId: string, etapa: Etapa, ativos: string[]) =>
  db.prepare('UPDATE tratamento_ciclo SET item_id = ? WHERE ropa_id = ? AND project_id = ? AND etapa = ?').bind(ativos[0] ?? null, ropaId, projectId, etapa);

/** Ids que não são do projeto. A tabela vem de lista fixa (nunca da requisição): só `itens`, `departamentos` ou `partes`. */
async function foraDoProjeto(db: D1Database, projectId: string, tabela: 'itens' | 'departamentos' | 'partes', ids: string[]): Promise<string[]> {
  const { results } = await db.prepare(`SELECT id FROM ${tabela} WHERE project_id = ? AND id IN (SELECT value FROM json_each(?))`)
    .bind(projectId, sem(ids)).all<{ id: string }>();
  const validos = new Set(results.map((r) => r.id));
  return [...new Set(ids)].filter((i) => !validos.has(i));
}
/** Titulares e dados vivem em catalogo_itens: o tipo entra como parâmetro, nunca no nome da tabela. */
async function foraDoCatalogo(db: D1Database, projectId: string, tipo: 'titular' | 'dado', ids: string[]): Promise<string[]> {
  const { results } = await db.prepare(`SELECT id FROM catalogo_itens WHERE project_id = ? AND tipo = ? AND id IN (SELECT value FROM json_each(?))`)
    .bind(projectId, tipo, sem(ids)).all<{ id: string }>();
  const validos = new Set(results.map((r) => r.id));
  return [...new Set(ids)].filter((i) => !validos.has(i));
}

/** Cabeçalho da etapa: descrição, origem, Não Aplicável e (Coleta/Eliminação) os campos que mexem no hash. */
export async function salvarCabecalhoDaEtapa(db: D1Database, projectId: string, ropaId: string, etapa: Etapa, ator: string, corpo: EtapaCabecalhoCorpo): Promise<Falha | Gravado> {
  const p = await preparar(db, projectId, ropaId);
  if (!p.ok) return p;
  const { etapas } = p;
  const alvo = de(etapas, etapa);
  if (etapa !== 'coleta' && alvo.bloqueada) return falha(409, 'Conclua a Coleta antes');
  // Não Aplicável só se desmarca: a etapa marcada não aceita edição de conteúdo (o `false` volta a registrada).
  if (alvo.nao_aplicavel && corpo.nao_aplicavel === undefined) return falha(409, 'Etapa marcada como Não Aplicável: desmarque para editar');
  if (etapa !== 'coleta' && (corpo.solicita_consentimento !== undefined || corpo.criancas_adolescentes !== undefined)) return falha(400, 'Esse campo existe só na etapa Coleta');
  if (etapa !== 'eliminacao' && (corpo.prazo !== undefined || corpo.descarte !== undefined)) return falha(400, 'Prazo e Descarte existem só na Eliminação');

  const stmts: D1PreparedStatement[] = [];
  let mudouHash = false;
  const antesItens = alvo.ativos.map((a) => a.item_id);
  const naoAp = corpo.nao_aplicavel === true;

  if (naoAp) {
    stmts.push(db.prepare('DELETE FROM tratamento_etapa_itens WHERE ropa_id = ? AND project_id = ? AND etapa = ?').bind(ropaId, projectId, etapa));
    stmts.push(db.prepare('DELETE FROM tratamento_etapa_titulares WHERE ropa_id = ? AND project_id = ? AND etapa = ?').bind(ropaId, projectId, etapa));
    if (etapa === 'compartilhamento_interno') stmts.push(db.prepare('DELETE FROM tratamento_interno_areas WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId));
    if (etapa === 'compartilhamento_externo') stmts.push(db.prepare('DELETE FROM tratamento_externo_parceiros WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId));
    stmts.push(db.prepare(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, item_id, descricao_etapa, atualizado_por) VALUES (?, ?, ?, 'nao_aplicavel', NULL, NULL, ?)
      ON CONFLICT(ropa_id, etapa) DO UPDATE SET situacao = 'nao_aplicavel', item_id = NULL, descricao_etapa = NULL, origem = NULL, solicita_consentimento = NULL, descarte = NULL, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`)
      .bind(ropaId, projectId, etapa, ator));
  } else {
    const descricao = corpo.descricao !== undefined ? corpo.descricao : alvo.descricao;
    const origem = corpo.origem !== undefined ? JSON.stringify(corpo.origem) : alvo.origem.length ? JSON.stringify(alvo.origem) : null;
    const consentimento = etapa === 'coleta' && corpo.solicita_consentimento !== undefined ? corpo.solicita_consentimento : alvo.solicita_consentimento === null ? null : alvo.solicita_consentimento ? 1 : 0;
    const descarte = etapa === 'eliminacao' && corpo.descarte !== undefined ? corpo.descarte : alvo.descarte;
    stmts.push(db.prepare(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, descricao_etapa, origem, solicita_consentimento, descarte, atualizado_por)
      VALUES (?, ?, ?, 'registrada', ?, ?, ?, ?, ?)
      ON CONFLICT(ropa_id, etapa) DO UPDATE SET situacao = 'registrada', descricao_etapa = excluded.descricao_etapa, origem = excluded.origem,
        solicita_consentimento = excluded.solicita_consentimento, descarte = excluded.descarte, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`)
      .bind(ropaId, projectId, etapa, descricao ?? null, origem, consentimento, descarte ?? null, ator));
  }
  // Campos do conteúdo congelado (spec 4.4): só quando a pessoa mexe neles.
  if (etapa === 'coleta' && corpo.criancas_adolescentes !== undefined && !naoAp) {
    const v = corpo.criancas_adolescentes ? 1 : 0;
    if (v !== (de(etapas, 'coleta').criancas_adolescentes ? 1 : 0)) mudouHash = true;
    stmts.push(db.prepare('UPDATE ropa_records SET criancas_adolescentes = ?, updated_at = ? WHERE id = ? AND project_id = ?').bind(v, new Date().toISOString(), ropaId, projectId));
  }
  if (etapa === 'eliminacao' && corpo.prazo !== undefined && !naoAp) {
    const v = corpo.prazo ?? null;
    if (v !== alvo.prazo) mudouHash = true;
    stmts.push(db.prepare('UPDATE ropa_records SET retention_period = ?, updated_at = ? WHERE id = ? AND project_id = ?').bind(v, new Date().toISOString(), ropaId, projectId));
  }
  await db.batch(stmts);

  if (naoAp) {
    if (etapa === 'coleta') {
      // Coleta sem titulares: a Coleta registra nada, o texto congelado acompanha e as outras etapas perdem os titulares.
      await podarDaColeta(db, projectId, ropaId);
      if (alvo.titulares.length) mudouHash = true;
    }
    if (antesItens.length) mudouHash = (await sincronizarItens(db, projectId, ropaId, antesItens)).mudouHash || mudouHash;
    if (etapa === 'coleta') mudouHash = (await derivarDaColeta(db, projectId, ropaId)).mudouHash || mudouHash;
  }
  return { ok: true, mudouHash };
}

/** Ativos da etapa: substitui a lista; `tratamento_itens` (hash) é sincronizado. A Eliminação escolhe os seus (0087). */
export async function salvarAtivos(db: D1Database, projectId: string, ropaId: string, etapa: Etapa, ator: string,
  ativos: { item_id: string; local_armazenamento?: string | null }[]): Promise<Falha | Gravado> {
  if (etapa !== 'armazenamento' && ativos.some((a) => a.local_armazenamento)) return falha(400, 'Local de armazenamento só existe no Armazenamento');
  const p = await preparar(db, projectId, ropaId);
  if (!p.ok) return p;
  const bloqueio = podeEscrever(p.etapas, etapa);
  if (bloqueio) return bloqueio;
  const invalidos = await foraDoProjeto(db, projectId, 'itens', ativos.map((a) => a.item_id));
  if (invalidos.length) return falha(400, 'Item inexistente ou de outro projeto', invalidos);
  const antes = de(p.etapas, etapa).ativos.map((a) => a.item_id);
  const ids = ativos.map((a) => a.item_id);
  await db.batch([
    db.prepare('DELETE FROM tratamento_etapa_itens WHERE ropa_id = ? AND project_id = ? AND etapa = ?').bind(ropaId, projectId, etapa),
    ...ativos.map((a) => db.prepare('INSERT INTO tratamento_etapa_itens (ropa_id, etapa, item_id, local_armazenamento, project_id) VALUES (?, ?, ?, ?, ?)')
      .bind(ropaId, etapa, a.item_id, etapa === 'armazenamento' ? a.local_armazenamento ?? null : null, projectId)),
    garantirCabecalho(db, projectId, ropaId, etapa, ator),
    espelharPrimeiroItem(db, projectId, ropaId, etapa, ids),
  ]);
  const r = await sincronizarItens(db, projectId, ropaId, antes);
  return { ok: true, mudouHash: r.mudouHash };
}

/** Compartilhamento Interno: áreas da organização, menos as que a própria atividade já tem (`tratamento_departamentos`). Fora do hash. */
export async function salvarAreas(db: D1Database, projectId: string, ropaId: string, ator: string, departamentosIds: string[]): Promise<Falha | Gravado> {
  const p = await preparar(db, projectId, ropaId);
  if (!p.ok) return p;
  const bloqueio = podeEscrever(p.etapas, 'compartilhamento_interno');
  if (bloqueio) return bloqueio;
  const invalidos = await foraDoProjeto(db, projectId, 'departamentos', departamentosIds);
  if (invalidos.length) return falha(400, 'Área inexistente ou de outro projeto', invalidos);
  const daAtividade = new Set((await db.prepare('SELECT departamento_id AS id FROM tratamento_departamentos WHERE ropa_id = ? AND project_id = ?')
    .bind(ropaId, projectId).all<{ id: string }>()).results.map((r) => r.id));
  const repetidas = departamentosIds.filter((i) => daAtividade.has(i));
  if (repetidas.length) return falha(400, 'Área já é da própria atividade (cabeçalho)', repetidas);
  await db.batch([
    db.prepare('DELETE FROM tratamento_interno_areas WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId),
    ...[...new Set(departamentosIds)].map((i) => db.prepare('INSERT INTO tratamento_interno_areas (ropa_id, departamento_id, project_id) VALUES (?, ?, ?)').bind(ropaId, i, projectId)),
    garantirCabecalho(db, projectId, ropaId, 'compartilhamento_interno', ator),
  ]);
  return { ok: true, mudouHash: false };
}

/** Compartilhamento Externo: parceiros (partes do projeto). Fora do hash: a parte da atividade continua em parte_vinculos. */
export async function salvarParceiros(db: D1Database, projectId: string, ropaId: string, ator: string, partesIds: string[]): Promise<Falha | Gravado> {
  const p = await preparar(db, projectId, ropaId);
  if (!p.ok) return p;
  const bloqueio = podeEscrever(p.etapas, 'compartilhamento_externo');
  if (bloqueio) return bloqueio;
  const invalidos = await foraDoProjeto(db, projectId, 'partes', partesIds);
  if (invalidos.length) return falha(400, 'Parceiro inexistente ou de outro projeto', invalidos);
  await db.batch([
    db.prepare('DELETE FROM tratamento_externo_parceiros WHERE ropa_id = ? AND project_id = ?').bind(ropaId, projectId),
    ...[...new Set(partesIds)].map((i) => db.prepare('INSERT INTO tratamento_externo_parceiros (ropa_id, parte_id, project_id) VALUES (?, ?, ?)').bind(ropaId, i, projectId)),
    garantirCabecalho(db, projectId, ropaId, 'compartilhamento_externo', ator),
  ]);
  return { ok: true, mudouHash: false };
}

/** Titulares da Coleta com os dados de cada um. Substitui a lista; o texto congelado (titulares, categorias, sensível) é derivado. */
export async function salvarTitularesDaColeta(db: D1Database, projectId: string, ropaId: string, ator: string,
  titulares: { titular_id: string; dados_ids: string[] }[]): Promise<Falha | Gravado> {
  const p = await preparar(db, projectId, ropaId);
  if (!p.ok) return p;
  const invalidosT = await foraDoCatalogo(db, projectId, 'titular', titulares.map((t) => t.titular_id));
  if (invalidosT.length) return falha(400, 'Titular inexistente ou de outro projeto', invalidosT);
  const dadosTodos = titulares.flatMap((t) => t.dados_ids);
  const invalidosD = await foraDoCatalogo(db, projectId, 'dado', dadosTodos);
  if (invalidosD.length) return falha(400, 'Dado inexistente ou de outro projeto', invalidosD);
  const bloqueio = podeEscrever(p.etapas, 'coleta');
  if (bloqueio) return bloqueio;

  await db.batch([
    db.prepare(`DELETE FROM tratamento_etapa_titulares WHERE ropa_id = ? AND project_id = ? AND etapa = 'coleta'`).bind(ropaId, projectId),
    ...titulares.flatMap((t) => [
      db.prepare(`INSERT INTO tratamento_etapa_titulares (ropa_id, etapa, titular_id, situacao, atualizado_por, project_id) VALUES (?, 'coleta', ?, 'definido', ?, ?)`)
        .bind(ropaId, t.titular_id, ator, projectId),
      ...[...new Set(t.dados_ids)].map((d) => db.prepare(`INSERT INTO tratamento_etapa_dados (ropa_id, etapa, titular_id, dado_id, project_id) VALUES (?, 'coleta', ?, ?, ?)`)
        .bind(ropaId, t.titular_id, d, projectId)),
    ]),
    db.prepare(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, migrado, atualizado_por) VALUES (?, ?, 'coleta', 'registrada', 0, ?)
      ON CONFLICT(ropa_id, etapa) DO UPDATE SET migrado = 0, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`).bind(ropaId, projectId, ator),
  ]);
  await podarDaColeta(db, projectId, ropaId);
  return derivarDaColeta(db, projectId, ropaId);
}

/** Titular de uma etapa (não Coleta): `nao_usa` ou um subconjunto dos dados DA Coleta para aquele titular. Fora do hash. */
export async function salvarTitularDaEtapa(db: D1Database, projectId: string, ropaId: string, etapa: Etapa, ator: string,
  titularId: string, corpo: { dados_ids: string[]; nao_usa?: boolean }): Promise<Falha | Gravado> {
  if (etapa === 'coleta') return falha(400, 'Os titulares da Coleta são gravados na própria Coleta');
  const p = await preparar(db, projectId, ropaId);
  if (!p.ok) return p;
  const bloqueio = podeEscrever(p.etapas, etapa);
  if (bloqueio) return bloqueio;
  const titularColeta = de(p.etapas, 'coleta').titulares.find((t) => t.titular_id === titularId);
  if (!titularColeta) return falha(400, 'Titular não está na Coleta', [titularId]);
  const dadosColeta = new Set(titularColeta.dados.map((d) => d.id));
  const fora = corpo.dados_ids.filter((d) => !dadosColeta.has(d));
  if (fora.length) return falha(400, 'Dado que a Coleta não tem para este titular', fora);
  const stmts = [
    db.prepare('DELETE FROM tratamento_etapa_titulares WHERE ropa_id = ? AND project_id = ? AND etapa = ? AND titular_id = ?').bind(ropaId, projectId, etapa, titularId),
    db.prepare(`INSERT INTO tratamento_etapa_titulares (ropa_id, etapa, titular_id, situacao, atualizado_por, project_id) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(ropaId, etapa, titularId, corpo.nao_usa ? 'nao_usa' : 'definido', ator, projectId),
    ...(corpo.nao_usa ? [] : [...new Set(corpo.dados_ids)].map((d) => db.prepare(`INSERT INTO tratamento_etapa_dados (ropa_id, etapa, titular_id, dado_id, project_id) VALUES (?, ?, ?, ?, ?)`)
      .bind(ropaId, etapa, titularId, d, projectId))),
    garantirCabecalho(db, projectId, ropaId, etapa, ator),
  ];
  await db.batch(stmts);
  return { ok: true, mudouHash: false };
}
