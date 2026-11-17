import { ISO_27001_2022, ISO_27001_2022_STANDARD } from '../data/iso27001-2022';
import { ISO_27701_2025_CONTROLLER, ISO_27701_2025_PROCESSOR, ISO_27701_2025_SECURITY, ISO_27701_2025_STANDARD } from '../data/iso27701-2025';
import { LGPD, LGPD_VERSAO } from '../data/lgpd';
import { ANPD, ANPD_VERSAO } from '../data/anpd';
import { MAPEAMENTOS } from '../data/mapeamento-privacidade-iso';
import { hojeEmSaoPaulo } from './hoje';
import { SQL_ARQUIVO_VALE } from './terceiros';
import { sqlClasseControle, classeDoControle } from './classe-controle';
import { logAudit } from '../helpers';
import { FONTES_DO_OT, SQL_FONTES_DO_OT } from '../modulos';

/**
 * Catálogo de requisitos (fatia 2 do núcleo do n.privacy, spec 4.5). Global: sem project_id.
 * Depois do seed o BANCO é a fonte da verdade: título e mapeamento são dado editável pelo platform_admin,
 * e o seed é INSERT OR IGNORE nos requisitos, então nunca sobrescreve o que foi editado. As fontes são
 * upsert de `nome` e `versao`: a versão do texto consultado acompanha o código.
 */

type Fonte = { id: string; nome: string; versao: string | null; vigente_desde: string | null };
type Linha = { id: string; fonte_id: string; referencia: string; titulo: string; papel: string | null; pai_id?: string | null };

const F_27001 = 'iso27001:2022';
const F_27701 = 'iso27701:2025';

// Metadado de identificação das normas (nome e ano). Nada de texto normativo nem parágrafo de lei.
export const FONTES: readonly Fonte[] = [
  { id: F_27001, nome: 'ISO/IEC 27001:2022', versao: '2022', vigente_desde: null },
  { id: F_27701, nome: 'ISO/IEC 27701:2025', versao: '2025', vigente_desde: null },
  { id: 'lgpd', nome: 'Lei Geral de Proteção de Dados (Lei 13.709/2018)', versao: LGPD_VERSAO, vigente_desde: null },
  { id: 'gdpr', nome: 'Regulamento Geral sobre a Proteção de Dados (UE 2016/679)', versao: '2016', vigente_desde: null },
  { id: 'anpd', nome: 'Resoluções da ANPD', versao: ANPD_VERSAO, vigente_desde: null },
];

const FONTE_DA_NORMA: Record<string, string> = {
  [ISO_27001_2022_STANDARD]: F_27001,
  [ISO_27701_2025_STANDARD]: F_27701,
};

/** Fonte do catálogo que corresponde ao `compliance_controls.standard`; null para as normas fora do catálogo. */
export function fonteDaNorma(standard: string): string | null {
  return FONTE_DA_NORMA[standard] ?? null;
}

const idDe = (fonte: string, referencia: string) => `${fonte}:${referencia}`;

function linhasIso(): Linha[] {
  return [
    ...ISO_27001_2022.map((c) => ({ id: idDe(F_27001, c.code), fonte_id: F_27001, referencia: c.code, titulo: c.title, papel: null })),
    ...ISO_27701_2025_CONTROLLER.map((c) => ({ id: idDe(F_27701, c.code), fonte_id: F_27701, referencia: c.code, titulo: c.title, papel: 'controlador' })),
    ...ISO_27701_2025_PROCESSOR.map((c) => ({ id: idDe(F_27701, c.code), fonte_id: F_27701, referencia: c.code, titulo: c.title, papel: 'operador' })),
    // A.3 é de segurança e vale para os dois papéis: sem papel.
    ...ISO_27701_2025_SECURITY.map((c) => ({ id: idDe(F_27701, c.code), fonte_id: F_27701, referencia: c.code, titulo: c.title, papel: null })),
  ];
}

/** INSERT OR IGNORE de um lote de requisitos (JSON), para entrar num batch. */
export function stmtRequisitos(db: D1Database, linhas: readonly Linha[]): D1PreparedStatement {
  return db.prepare(
    `INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo, papel, pai_id)
     SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.fonte_id'), json_extract(j.value, '$.referencia'),
            json_extract(j.value, '$.titulo'), json_extract(j.value, '$.papel'), json_extract(j.value, '$.pai_id')
       FROM json_each(?1) j`
  ).bind(JSON.stringify(linhas));
}

/**
 * Semeia fontes, requisitos (ISO, LGPD e ANPD) e o mapeamento proposto. `requisitos` e `mapeamentos` contam os
 * criados; `fontes` conta as criadas ou as que tiveram `nome`/`versao` atualizados (uma fonte já igual ao código não conta).
 */
export async function semearCatalogo(db: D1Database): Promise<{ fontes: number; requisitos: number; mapeamentos: number }> {
  const r = await db.batch([
    db.prepare(
      `INSERT INTO requisito_fontes (id, nome, versao, vigente_desde)
       SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.nome'), json_extract(j.value, '$.versao'), json_extract(j.value, '$.vigente_desde')
         FROM json_each(?1) j WHERE true
       ON CONFLICT(id) DO UPDATE SET nome = excluded.nome, versao = excluded.versao
         WHERE requisito_fontes.nome IS NOT excluded.nome OR requisito_fontes.versao IS NOT excluded.versao`
    ).bind(JSON.stringify(FONTES)),
    stmtRequisitos(db, linhasIso()),
    stmtRequisitos(db, LGPD.map((r) => ({ ...r, fonte_id: 'lgpd', papel: null }))),
    stmtRequisitos(db, ANPD.map((r) => ({ ...r, fonte_id: 'anpd', papel: null }))),
    // Depois dos requisitos (FK). OR IGNORE: par já existente, inclusive validado ou editado, fica como está.
    db.prepare(
      `INSERT OR IGNORE INTO requisito_mapeamentos (de_id, para_id, tipo, estado)
       SELECT json_extract(j.value, '$.de'), json_extract(j.value, '$.para'), json_extract(j.value, '$.tipo'), 'proposto'
         FROM json_each(?1) j`
    ).bind(JSON.stringify(MAPEAMENTOS)),
  ]);
  return {
    fontes: r[0].meta.changes ?? 0,
    requisitos: r.slice(1, -1).reduce((n, x) => n + (x.meta.changes ?? 0), 0),
    mapeamentos: r[r.length - 1].meta.changes ?? 0,
  };
}

/**
 * Liga cada controle ao requisito da sua norma (norma + primeiro token do título, que é o código: o mesmo
 * critério do `stmtControles`). Só toca controle ainda sem `requisito_id`. Devolve quantos foram ligados.
 */
export async function ligarControles(db: D1Database, projectId?: string): Promise<number> {
  let total = 0;
  for (const [standard, fonte] of Object.entries(FONTE_DA_NORMA)) {
    const r = await db.prepare(
      `UPDATE compliance_controls SET requisito_id = (
         SELECT r.id FROM requisitos r WHERE r.fonte_id = ?1 AND r.referencia = substr(compliance_controls.title, 1, instr(compliance_controls.title || ' ', ' ') - 1))
       WHERE standard = ?2 AND requisito_id IS NULL AND (?3 IS NULL OR project_id = ?3)
         AND EXISTS (SELECT 1 FROM requisitos r WHERE r.fonte_id = ?1 AND r.referencia = substr(compliance_controls.title, 1, instr(compliance_controls.title || ' ', ' ') - 1))`
    ).bind(fonte, standard, projectId ?? null).run();
    total += r.meta.changes ?? 0;
  }
  return total;
}

// ─── Leitura, visibilidade e lacunas ─────────────────────────────────────────────────────────────────

/** Papéis que enxergam o mapeamento ainda `proposto`; qualquer outro só vê o `validado_juridico` (spec 4.5). */
const VE_PROPOSTO = new Set(['platform_admin', 'consultor', 'consultant', 'consultoria_admin']);
export const veMapeamentoProposto = (role: string | undefined) => VE_PROPOSTO.has(role ?? '');

export type Requisito = { id: string; fonte_id: string; referencia: string; titulo: string; pai_id: string | null; papel: string | null; texto: string | null; fonte_texto: string | null; categoria: string | null };

/** Texto normativo só onde a licença permite: ISO só com título próprio; LGPD/ANPD/ONS aceitam texto com origem. */
export const fonteAceitaTexto = (fonteId: string): boolean => !fonteId.startsWith('iso');
/** Projeção de leitura: o texto da ISO nunca sai, mesmo que um dia entre no banco. */
const COLS_TEXTO = (a: string) => `CASE WHEN ${a}fonte_id LIKE 'iso%' THEN NULL ELSE ${a}texto END AS texto, CASE WHEN ${a}fonte_id LIKE 'iso%' THEN NULL ELSE ${a}fonte_texto END AS fonte_texto, ${a}categoria AS categoria`;
export type MapeamentoLido = { de_id: string; para_id: string; tipo: string; estado: string; validado_por: string | null; validado_em: string | null; nota: string | null };

/** Fontes do n.ot (P0-2) só para quem as vê (`veFontesDoOt`); `col` é uma coluna nossa, `?N` o booleano. */
export const VISIVEL = (col: string, n: number, porRequisito = false) =>
  `(?${n} = 1 OR ${porRequisito ? `${col} NOT IN (SELECT id FROM requisitos WHERE fonte_id IN (${SQL_FONTES_DO_OT}))` : `${col} NOT IN (${SQL_FONTES_DO_OT})`})`;

/** Dos `ids`, os que são de fonte do n.ot que quem pede não vê: tratados como inexistentes (nunca confirma que existem). */
export async function requisitosOcultos(db: D1Database, ids: readonly string[], ve: boolean): Promise<string[]> {
  if (ve || !ids.length) return [];
  const { results } = await db.prepare(`SELECT id FROM requisitos WHERE id IN (SELECT value FROM json_each(?)) AND fonte_id IN (${SQL_FONTES_DO_OT})`)
    .bind(JSON.stringify(ids)).all<{ id: string }>();
  return results.map((r) => r.id);
}

export async function listarFontes(db: D1Database, ve: boolean) {
  const { results } = await db.prepare(
    `SELECT f.id, f.nome, f.versao, f.vigente_desde, (SELECT count(*) FROM requisitos r WHERE r.fonte_id = f.id) AS requisitos
       FROM requisito_fontes f WHERE ${VISIVEL('f.id', 1)} ORDER BY f.rowid`
  ).bind(ve ? 1 : 0).all<{ id: string; nome: string; versao: string | null; vigente_desde: string | null; requisitos: number }>();
  return results;
}

export async function listarRequisitos(db: D1Database, fonte: string | undefined, ve: boolean) {
  const { results } = await db.prepare(
    // `validado_*`: o mapeamento validado mais recente do requisito (só o validado, que todo papel pode ver).
    `SELECT r.id, r.fonte_id, r.referencia, r.titulo, r.pai_id, r.papel, ${COLS_TEXTO('r.')},
            (SELECT m.validado_por FROM requisito_mapeamentos m WHERE r.id IN (m.de_id, m.para_id) AND m.estado = 'validado_juridico' ORDER BY m.validado_em DESC LIMIT 1) AS validado_por,
            (SELECT max(m.validado_em) FROM requisito_mapeamentos m WHERE r.id IN (m.de_id, m.para_id) AND m.estado = 'validado_juridico') AS validado_em
       FROM requisitos r WHERE (?1 IS NULL OR r.fonte_id = ?1) AND ${VISIVEL('r.fonte_id', 2)} ORDER BY r.fonte_id, r.rowid`
  ).bind(fonte ?? null, ve ? 1 : 0).all<Requisito & { validado_por: string | null; validado_em: string | null }>();
  return results;
}

/** O requisito com os mapeamentos nos dois sentidos; quem não vê `proposto` recebe só os validados. */
export async function lerRequisito(db: D1Database, id: string, veProposto: boolean, ve: boolean) {
  const r = await db.prepare(`SELECT id, fonte_id, referencia, titulo, pai_id, papel, ${COLS_TEXTO('')} FROM requisitos WHERE id = ?`).bind(id).first<Requisito>();
  if (!r || (!ve && (FONTES_DO_OT as readonly string[]).includes(r.fonte_id))) return null;
  const { results } = await db.prepare(
    `SELECT de_id, para_id, tipo, estado, validado_por, validado_em, nota FROM requisito_mapeamentos
      WHERE (de_id = ?1 OR para_id = ?1) AND (?2 = 1 OR estado = 'validado_juridico')
        AND (?3 = 1 OR (SELECT count(*) FROM requisitos o WHERE o.id IN (de_id, para_id) AND o.fonte_id IN (${SQL_FONTES_DO_OT})) = 0) ORDER BY created_at, rowid`
  ).bind(id, veProposto ? 1 : 0, ve ? 1 : 0).all<MapeamentoLido>();
  return { ...r, mapeamentos: results };
}

/** `documento` = versionado (`documentos`); `arquivo` = documento em arquivo (`documentos_arquivo`, 0086). Nome de tabela só desta lista. */
export type OrigemDocumentoReq = 'documento' | 'arquivo';
const DOC_REQ: Record<OrigemDocumentoReq, { pai: string; ligacao: string; coluna: string }> = {
  documento: { pai: 'documentos', ligacao: 'documento_requisitos', coluna: 'documento_id' },
  arquivo: { pai: 'documentos_arquivo', ligacao: 'documentos_arquivo_requisitos', coluna: 'documento_arquivo_id' },
};

export async function requisitosDoDocumento(db: D1Database, projectId: string, documentoId: string, origem: OrigemDocumentoReq = 'documento', ve = false) {
  const t = DOC_REQ[origem];
  const { results } = await db.prepare(
    `SELECT r.id, r.fonte_id, r.referencia, r.titulo FROM ${t.ligacao} dr JOIN requisitos r ON r.id = dr.requisito_id
      WHERE dr.project_id = ?1 AND dr.${t.coluna} = ?2 AND ${VISIVEL('r.fonte_id', 3)} ORDER BY r.fonte_id, r.rowid`
  ).bind(projectId, documentoId, ve ? 1 : 0).all<{ id: string; fonte_id: string; referencia: string; titulo: string }>();
  return results;
}

/** Troca o conjunto de requisitos do documento. null = documento não é do projeto; `desconhecidos` = ids que não existem. */
export async function definirRequisitosDoDocumento(db: D1Database, projectId: string, documentoId: string, ids: string[], origem: OrigemDocumentoReq = 'documento', ve = false) {
  const t = DOC_REQ[origem];
  const doc = await db.prepare(`SELECT id FROM ${t.pai} WHERE id = ? AND project_id = ?`).bind(documentoId, projectId).first();
  if (!doc) return null;
  const unicos = [...new Set(ids)];
  // id de fonte oculta conta como inexistente, na MESMA lista `desconhecidos` (não revela que existe)
  const { results } = await db.prepare(`SELECT id FROM requisitos WHERE id IN (SELECT value FROM json_each(?1)) AND ${VISIVEL('fonte_id', 2)}`).bind(JSON.stringify(unicos), ve ? 1 : 0).all<{ id: string }>();
  const existentes = new Set(results.map((x) => x.id));
  const desconhecidos = unicos.filter((x) => !existentes.has(x));
  if (desconhecidos.length) return { ok: false as const, desconhecidos };
  await db.batch([
    // quem não vê a fonte do n.ot não apaga as ligações dela (feitas por quem vê)
    db.prepare(`DELETE FROM ${t.ligacao} WHERE ${t.coluna} = ?1 AND project_id = ?2 AND ${VISIVEL('requisito_id', 3, true)}`).bind(documentoId, projectId, ve ? 1 : 0),
    db.prepare(`INSERT INTO ${t.ligacao} (${t.coluna}, requisito_id, project_id) SELECT ?1, value, ?2 FROM json_each(?3)`)
      .bind(documentoId, projectId, JSON.stringify(unicos)),
  ]);
  return { ok: true as const, total: unicos.length };
}

/** Requisitos a que a evidência do projeto serve. */
export async function requisitosDaEvidencia(db: D1Database, projectId: string, evidenciaId: string, ve = false) {
  const { results } = await db.prepare(
    `SELECT r.id, r.fonte_id, r.referencia, r.titulo FROM evidencia_requisitos er JOIN requisitos r ON r.id = er.requisito_id
      WHERE er.project_id = ?1 AND er.evidencia_id = ?2 AND ${VISIVEL('r.fonte_id', 3)} ORDER BY r.fonte_id, r.rowid`
  ).bind(projectId, evidenciaId, ve ? 1 : 0).all<{ id: string; fonte_id: string; referencia: string; titulo: string }>();
  return results;
}

/** Troca o conjunto de requisitos da evidência. null = evidência não é do projeto; `desconhecidos` = ids que não existem no catálogo. */
export async function definirRequisitosDaEvidencia(db: D1Database, projectId: string, evidenciaId: string, ids: string[], ve = false) {
  if (!(await db.prepare('SELECT 1 FROM evidence WHERE id = ? AND project_id = ?').bind(evidenciaId, projectId).first())) return null;
  const unicos = [...new Set(ids)];
  // id de fonte oculta conta como inexistente, na MESMA lista `desconhecidos` (não revela que existe)
  const { results } = await db.prepare(`SELECT id FROM requisitos WHERE id IN (SELECT value FROM json_each(?1)) AND ${VISIVEL('fonte_id', 2)}`).bind(JSON.stringify(unicos), ve ? 1 : 0).all<{ id: string }>();
  const existentes = new Set(results.map((x) => x.id));
  const desconhecidos = unicos.filter((x) => !existentes.has(x));
  if (desconhecidos.length) return { ok: false as const, desconhecidos };
  await db.batch([
    db.prepare(`DELETE FROM evidencia_requisitos WHERE evidencia_id = ?1 AND project_id = ?2 AND ${VISIVEL('requisito_id', 3, true)}`).bind(evidenciaId, projectId, ve ? 1 : 0),
    db.prepare(`INSERT INTO evidencia_requisitos (evidencia_id, requisito_id, project_id) SELECT ?1, value, ?2 FROM json_each(?3)`).bind(evidenciaId, projectId, JSON.stringify(unicos)),
  ]);
  return { ok: true as const, total: unicos.length };
}

export type OrigemCobertura =
  | { tipo: 'documento'; id: string; titulo: string; arquivo?: true } // arquivo: documento em arquivo (0086), não o versionado
  | { tipo: 'evidencia'; id: string; titulo: string; status: string }
  | { tipo: 'controle'; id: string; titulo: string; status: string; mapeamento: 'equivalente' | 'parcial' };
export type Exclusao = { justificativa: string; decidido_por: string; decidido_em: string; herdada_de?: string };
export type Lacuna = {
  requisito_id: string; referencia: string; titulo: string; pai_id: string | null;
  situacao: 'coberto' | 'parcial' | 'lacuna' | 'nao_aplicavel'; origens: OrigemCobertura[]; exclusao?: Exclusao;
};

/**
 * Resumo de uma lista de lacunas: a mesma conta em GET /requisitos/lacunas, no ponto de partida e no painel do encarregado. O `total`
 * conta só os aplicáveis: excluir não pode subir a porcentagem de cobertura.
 */
export function resumoDeLacunas(itens: Lacuna[]) {
  const total = (s: Lacuna['situacao']) => itens.filter((i) => i.situacao === s).length;
  const [cobertos, parciais, lacunas] = [total('coberto'), total('parcial'), total('lacuna')];
  return { total: cobertos + parciais + lacunas, cobertos, parciais, lacunas, nao_aplicaveis: total('nao_aplicavel') };
}

/**
 * Cobertura de uma fonte no projeto (spec 4.9, escopo da fatia 2). Um requisito está **coberto** se há documento
 * VIGENTE ligado a ele, ou controle IMPLEMENTADO (classe `feito` de classe-controle.ts) ligado por mapeamento `validado_juridico` do tipo
 * `equivalente`; **parcial** se só há controle implementado com mapeamento `parcial`, ou controle `Partial`/`In Progress`
 * (com `equivalente` ou `parcial`; nunca coberto); senão é **lacuna**. `Planned`, `Missing`, `Not Applicable` e sem status não contam.
 * Mapeamento `relacionado` e `proposto` nunca cobrem. Evidência (fatia 8) ligada ao requisito cobre se `conforming` e dentro da validade
 * (ou sem validade); `partial` dá cobertura parcial; vencida, pendente ou `non_conforming` não conta.
 * **Não aplicável** (migration 0107): o requisito excluído no projeto, ou com um ancestral excluído (`herdada_de`), vence a cobertura e
 * mantém as `origens` (a tela mostra a contradição).
 */
export async function lacunasDaFonte(db: D1Database, projectId: string, fonte: string, opcoes?: { simular?: { de: string; para: string } }): Promise<Lacuna[]> {
  // `simular` (prévia da validação por par de fontes): os `proposto` entre as duas fontes contam como validados, sem gravar nada.
  const sim = opcoes?.simular;
  const validado = `(m.estado = 'validado_juridico' OR (?3 = 1 AND m.estado = 'proposto' AND ${parDeFontes('?4', '?5')}))`;
  const [reqs, docs, ctrls, evids, excl] = await db.batch([
    db.prepare('SELECT id, referencia, titulo, pai_id FROM requisitos WHERE fonte_id = ? ORDER BY rowid').bind(fonte),
    db.prepare(
      `SELECT dr.requisito_id AS requisito_id, d.id AS id, d.titulo AS titulo, 0 AS arquivo
         FROM documento_requisitos dr JOIN documentos d ON d.id = dr.documento_id
        WHERE dr.project_id = ?1 AND d.status = 'vigente' AND dr.requisito_id IN (SELECT id FROM requisitos WHERE fonte_id = ?2)
        UNION ALL
       SELECT dr.requisito_id, a.id, a.nome, 1
         FROM documentos_arquivo_requisitos dr JOIN documentos_arquivo a ON a.id = dr.documento_arquivo_id
        WHERE dr.project_id = ?1 AND ${SQL_ARQUIVO_VALE} AND dr.requisito_id IN (SELECT id FROM requisitos WHERE fonte_id = ?2)`
    ).bind(projectId, fonte),
    db.prepare(
      `SELECT m.para_id AS requisito_id, c.id AS id, c.title AS titulo, c.status AS status, m.tipo AS tipo
         FROM requisito_mapeamentos m JOIN compliance_controls c ON c.requisito_id = m.de_id
        WHERE c.project_id = ?1 AND ${validado} AND m.tipo IN ('equivalente', 'parcial')
          AND ((${sqlClasseControle('c.status')}) = 'feito' OR c.status IN ('Partial', 'In Progress'))
          AND m.para_id IN (SELECT id FROM requisitos WHERE fonte_id = ?2)
        UNION ALL
       SELECT m.de_id, c.id, c.title, c.status, m.tipo
         FROM requisito_mapeamentos m JOIN compliance_controls c ON c.requisito_id = m.para_id
        WHERE c.project_id = ?1 AND ${validado} AND m.tipo IN ('equivalente', 'parcial')
          AND ((${sqlClasseControle('c.status')}) = 'feito' OR c.status IN ('Partial', 'In Progress'))
          AND m.de_id IN (SELECT id FROM requisitos WHERE fonte_id = ?2)`
    ).bind(projectId, fonte, sim ? 1 : 0, sim?.de ?? null, sim?.para ?? null),
    db.prepare(
      `SELECT er.requisito_id AS requisito_id, e.id AS id, e.file_name AS titulo, e.evaluation_status AS status
         FROM evidencia_requisitos er JOIN evidence e ON e.id = er.evidencia_id
        WHERE er.project_id = ?1 AND e.project_id = ?1 AND e.evaluation_status IN ('conforming', 'partial')
          AND (e.valido_ate IS NULL OR substr(e.valido_ate, 1, 10) >= ?3) AND er.requisito_id IN (SELECT id FROM requisitos WHERE fonte_id = ?2)`
    ).bind(projectId, fonte, hojeEmSaoPaulo()),
    db.prepare(`SELECT requisito_id, justificativa, decidido_por, decidido_em FROM requisito_exclusoes
       WHERE project_id = ?1 AND requisito_id IN (SELECT id FROM requisitos WHERE fonte_id = ?2)`).bind(projectId, fonte),
  ]);
  const exclusoes = new Map((excl.results as (Exclusao & { requisito_id: string })[]).map(({ requisito_id, ...e }) => [requisito_id, e]));
  const origens = new Map<string, OrigemCobertura[]>();
  const somar = (rid: string, o: OrigemCobertura) => origens.set(rid, [...(origens.get(rid) ?? []), o]);
  for (const d of docs.results as { requisito_id: string; id: string; titulo: string; arquivo: number }[]) somar(d.requisito_id, { tipo: 'documento', id: d.id, titulo: d.titulo, ...(d.arquivo ? { arquivo: true as const } : {}) });
  for (const e of evids.results as { requisito_id: string; id: string; titulo: string; status: string }[]) somar(e.requisito_id, { tipo: 'evidencia', id: e.id, titulo: e.titulo, status: e.status });
  for (const c of ctrls.results as { requisito_id: string; id: string; titulo: string; status: string; tipo: 'equivalente' | 'parcial' }[]) {
    somar(c.requisito_id, { tipo: 'controle', id: c.id, titulo: c.titulo, status: c.status, mapeamento: c.tipo });
  }
  type Req = { id: string; referencia: string; titulo: string; pai_id: string | null };
  const lista = reqs.results as Req[];
  const porId = new Map(lista.map((r) => [r.id, r]));
  return lista.map((r) => {
    const o = origens.get(r.id) ?? [];
    const exclusao = exclusaoDe(r, porId, exclusoes);
    if (exclusao) return { requisito_id: r.id, referencia: r.referencia, titulo: r.titulo, pai_id: r.pai_id, situacao: 'nao_aplicavel' as const, origens: o, exclusao };
    const cobre = o.some((x) => x.tipo === 'documento' || (x.tipo === 'evidencia' && x.status === 'conforming') || (x.tipo === 'controle' && x.mapeamento === 'equivalente' && classeDoControle(x.status) === 'feito'));
    return { requisito_id: r.id, referencia: r.referencia, titulo: r.titulo, pai_id: r.pai_id, situacao: cobre ? 'coberto' : o.length ? 'parcial' : 'lacuna', origens: o };
  });
}

/** A exclusão do próprio requisito ou a do primeiro ancestral excluído (`herdada_de` = a referência dele). Ciclo no catálogo não trava. */
function exclusaoDe(r: { id: string; pai_id: string | null }, porId: Map<string, { id: string; referencia: string; pai_id: string | null }>, exclusoes: Map<string, Exclusao>): Exclusao | null {
  const propria = exclusoes.get(r.id);
  if (propria) return propria;
  const vistos = new Set([r.id]);
  for (let pai = r.pai_id ? porId.get(r.pai_id) : undefined; pai && !vistos.has(pai.id); pai = pai.pai_id ? porId.get(pai.pai_id) : undefined) {
    vistos.add(pai.id);
    const e = exclusoes.get(pai.id);
    if (e) return { ...e, herdada_de: pai.referencia };
  }
  return null;
}

type FalhaReq = { ok: false; status: 404 | 409; error: string };

/** O requisito e o ancestral excluído mais próximo (o pai, o avô...), de qualquer fonte; null se não existe. */
async function requisitoComAncestral(db: D1Database, projectId: string, requisitoId: string) {
  const req = await db.prepare('SELECT id, referencia, pai_id FROM requisitos WHERE id = ?').bind(requisitoId).first<{ id: string; referencia: string; pai_id: string | null }>();
  if (!req) return null;
  const { results } = await db.prepare(`WITH RECURSIVE acima(id, pai_id, nivel) AS (
       SELECT id, pai_id, 0 FROM requisitos WHERE id = ?1
       UNION ALL SELECT r.id, r.pai_id, a.nivel + 1 FROM requisitos r JOIN acima a ON r.id = a.pai_id WHERE a.nivel < 20)
     SELECT r.referencia FROM acima a JOIN requisito_exclusoes e ON e.requisito_id = a.id AND e.project_id = ?2 JOIN requisitos r ON r.id = a.id
      WHERE a.nivel > 0 ORDER BY a.nivel LIMIT 1`).bind(requisitoId, projectId).all<{ referencia: string }>();
  return { req, excluidoAcima: results[0]?.referencia ?? null };
}

/** Marca o requisito como não aplicável no projeto (cria ou troca a justificativa). A trilha não leva o texto. */
export async function excluirRequisito(db: D1Database, projectId: string, requisitoId: string, justificativa: string, ator: string): Promise<FalhaReq | { ok: true }> {
  const r = await requisitoComAncestral(db, projectId, requisitoId);
  if (!r) return { ok: false, status: 404, error: 'Requisito não encontrado' };
  if (r.excluidoAcima) return { ok: false, status: 409, error: `Este requisito já não se aplica pela exclusão de ${r.excluidoAcima}: a decisão é lá` };
  await db.prepare(`INSERT INTO requisito_exclusoes (project_id, requisito_id, justificativa, decidido_por, decidido_em) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (project_id, requisito_id) DO UPDATE SET justificativa = excluded.justificativa, decidido_por = excluded.decidido_por, decidido_em = CURRENT_TIMESTAMP`)
    .bind(projectId, requisitoId, justificativa.trim(), ator).run();
  await logAudit(db, 'requisito.excluido', ator, `Requisito ${r.req.referencia} marcado como não aplicável`, '', '', projectId);
  return { ok: true };
}

/** Volta o requisito a ser aplicável (apaga a exclusão). */
export async function reincluirRequisito(db: D1Database, projectId: string, requisitoId: string, ator: string): Promise<FalhaReq | { ok: true }> {
  const req = await db.prepare('SELECT referencia FROM requisitos WHERE id = ?').bind(requisitoId).first<string>('referencia');
  if (!req) return { ok: false, status: 404, error: 'Requisito não encontrado' };
  const d = await db.prepare('DELETE FROM requisito_exclusoes WHERE project_id = ? AND requisito_id = ?').bind(projectId, requisitoId).run();
  if (!d.meta.changes) return { ok: false, status: 404, error: 'Este requisito não está marcado como não aplicável' };
  await logAudit(db, 'requisito.reincluido', ator, `Requisito ${req} volta a se aplicar`, '', '', projectId);
  return { ok: true };
}

// ─── Referência jurídica: contagem e validação dos mapeamentos ───────────────────────────────────────

/** O mapeamento `m` liga um requisito da fonte `a` a um da fonte `b`, em qualquer sentido. `a`/`b` são placeholders fixos do código. */
function parDeFontes(a: string, b: string) {
  return `EXISTS (SELECT 1 FROM requisitos rd, requisitos rp WHERE rd.id = m.de_id AND rp.id = m.para_id
    AND ((rd.fonte_id = ${a} AND rp.fonte_id = ${b}) OR (rd.fonte_id = ${b} AND rp.fonte_id = ${a})))`;
}

const DA_FONTE = `(?1 IS NULL OR EXISTS (SELECT 1 FROM requisitos r WHERE r.id IN (m.de_id, m.para_id) AND r.fonte_id = ?1))`;

/** Quantos mapeamentos estão propostos e quantos validados (de uma fonte, ou de todas). */
export async function resumoDeMapeamentos(db: D1Database, fonte?: string) {
  const r = await db.prepare(
    `SELECT coalesce(sum(m.estado = 'proposto'), 0) AS propostos, coalesce(sum(m.estado = 'validado_juridico'), 0) AS validados
       FROM requisito_mapeamentos m WHERE ${DA_FONTE}`
  ).bind(fonte ?? null).first<{ propostos: number; validados: number }>();
  return { propostos: r?.propostos ?? 0, validados: r?.validados ?? 0 };
}

/**
 * Valida os mapeamentos `proposto` ENTRE as duas fontes (nos dois sentidos de `de_id`/`para_id`), em nome de QUEM ESTÁ LOGADO:
 * `validadoPor` vem da sessão, nunca do corpo. Só toca `proposto`, então repetir não muda nada (idempotente). Devolve quantos foram validados.
 */
export async function validarMapeamentosPropostos(db: D1Database, validadoPor: string, de: string, para: string): Promise<number> {
  const r = await db.prepare(
    `UPDATE requisito_mapeamentos AS m SET estado = 'validado_juridico', validado_por = ?3, validado_em = ?4
      WHERE m.estado = 'proposto' AND ${parDeFontes('?1', '?2')}`
  ).bind(de, para, validadoPor, hojeEmSaoPaulo()).run();
  return r.meta.changes ?? 0;
}

/** Fontes cuja cobertura `lacunasDaFonte` calcula a partir de controle mapeado (as telas de LGPD e ANPD). */
const ALVOS_DE_COBERTURA = ['lgpd', 'anpd'];

/** Máximo de projetos avaliados na prévia de validação (ver o orçamento do D1 em `previaDeValidacao`). */
export const LIMITE_PREVIA = 100;

/**
 * Prévia EXATA de validar o par: quantos `proposto` e de que tipo, e a soma, nos projetos, da mudança em
 * `resumoDeLacunas(lacunasDaFonte(projeto, alvo))` se o par fosse validado agora (a mesma conta, com `simular`).
 * O alvo é o lado LGPD/ANPD do par (`para` se ele for alvo); sem alvo, `cobertura_calculada: false` e efeito zero.
 */
export async function previaDeValidacao(db: D1Database, de: string, para: string) {
  const { results } = await db.prepare(
    `SELECT m.tipo AS tipo, count(*) AS n FROM requisito_mapeamentos m WHERE m.estado = 'proposto' AND ${parDeFontes('?1', '?2')} GROUP BY m.tipo`
  ).bind(de, para).all<{ tipo: 'equivalente' | 'parcial' | 'relacionado'; n: number }>();
  const por_tipo = { equivalente: 0, parcial: 0, relacionado: 0 };
  for (const r of results) por_tipo[r.tipo] = r.n;
  const propostos = por_tipo.equivalente + por_tipo.parcial + por_tipo.relacionado;
  const alvo = ALVOS_DE_COBERTURA.includes(para) ? para : ALVOS_DE_COBERTURA.includes(de) ? de : null;
  const efeito = { cobertos: 0, parciais: 0 };
  if (!alvo || !propostos) return { propostos, por_tipo, projetos_afetados: 0, efeito, truncado: false, cobertura_calculada: !!alvo };
  const origem = alvo === para ? de : para; // a cobertura chega pelo controle ligado ao requisito do OUTRO lado do par
  // Só pode mudar o resultado o projeto com controle ligado a uma ponta (do lado `origem`) de par `proposto` equivalente/parcial
  // entre as duas fontes: os demais dariam diferença zero, então ficam de fora sem perder a exatidão. Sem filtro de projects.status:
  // a cobertura real (GET /requisitos/lacunas, ponto de partida) também não filtra.
  // Orçamento do D1 (1.000 subrequisições por invocação do Worker, plano pago): cada projeto custa 2 db.batch de 5 consultas.
  // 100 projetos = 200 subrequisições se o batch conta uma vez, ou 100 × 2 × 5 = 1.000 se conta por consulta (mais as 2 consultas da
  // prévia e as da autenticação: no pior caso fica no limite, não abaixo; baixar para 90 se o D1 contar por consulta).
  // shortcut: 100 projetos, paginar se a base crescer
  const projetos = (await db.prepare(
    `SELECT DISTINCT c.project_id AS id FROM compliance_controls c
       JOIN requisitos r ON r.id = c.requisito_id AND r.fonte_id = ?3
       JOIN requisito_mapeamentos m ON c.requisito_id IN (m.de_id, m.para_id)
      WHERE m.estado = 'proposto' AND m.tipo IN ('equivalente', 'parcial') AND ${parDeFontes('?1', '?2')}
      LIMIT ?4`
  ).bind(de, para, origem, LIMITE_PREVIA + 1).all<{ id: string }>()).results;
  const truncado = projetos.length > LIMITE_PREVIA;
  let projetos_afetados = 0;
  for (const { id } of projetos.slice(0, LIMITE_PREVIA)) {
    const antes = resumoDeLacunas(await lacunasDaFonte(db, id, alvo));
    const depois = resumoDeLacunas(await lacunasDaFonte(db, id, alvo, { simular: { de, para } }));
    const [dc, dp] = [depois.cobertos - antes.cobertos, depois.parciais - antes.parciais];
    if (dc || dp) projetos_afetados++;
    efeito.cobertos += dc; efeito.parciais += dp;
  }
  return { propostos, por_tipo, projetos_afetados, efeito, truncado, cobertura_calculada: true };
}
