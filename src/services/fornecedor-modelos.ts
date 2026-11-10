import { genId, logAudit, sha256Hex } from '../helpers';

/**
 * Modelos de avaliação de fornecedor da consultoria (migration 0106, spec 2026-11-09-ciclo-avaliacao-fornecedor-design, abordagem A).
 * Um modelo por tipo e organização: crítico, médio e pequeno são o questionário que vai ao fornecedor; o grande provedor é o roteiro de
 * conferência do trust center (não vai a ninguém). O projeto HERDA o modelo vivo: só desliga pergunta dele (`homologacao_ajustes`) e
 * acrescenta as próprias (`homologacao_perguntas`, `origem = 'projeto'`); o envio congela o que estava valendo.
 */

export const TIPOS_MODELO = ['critico', 'medio', 'pequeno', 'grande_provedor'] as const;
export type TipoModelo = (typeof TIPOS_MODELO)[number];
export const TIPOS_QUESTIONARIO = ['critico', 'medio', 'pequeno'] as const;
export type TipoQuestionario = (typeof TIPOS_QUESTIONARIO)[number];

/**
 * Modelo padrão, genérico, A VALIDAR PELA CONSULTORIA: não é texto jurídico nem modelo oficial. Semeado em cada modelo de questionário
 * da organização na primeira leitura; editar a pergunta a torna `origem = 'consultoria'`.
 */
export const PERGUNTAS_PADRAO: ReadonlyArray<{ tema: string; texto: string }> = [
  { tema: 'Segurança da informação', texto: 'A empresa mantém uma política de segurança da informação aprovada pela direção e comunicada aos colaboradores?' },
  { tema: 'Segurança da informação', texto: 'O acesso aos dados do cliente é restrito por perfil, com segundo fator de autenticação nos acessos administrativos e remotos?' },
  { tema: 'Segurança da informação', texto: 'Os dados do cliente são criptografados em trânsito e em repouso?' },
  { tema: 'Certificações', texto: 'A empresa tem certificação ou relatório de auditoria independente vigente (por exemplo, ISO/IEC 27001, ISO/IEC 27701 ou SOC 2)? Indique qual na justificativa.' },
  { tema: 'Contrato e DPA', texto: 'A empresa aceita firmar acordo de tratamento de dados (DPA) com as obrigações de operador?' },
  { tema: 'Subprocessadores', texto: 'A empresa mantém lista atualizada de subprocessadores e avisa o cliente antes de incluir ou trocar um?' },
  { tema: 'Incidentes', texto: 'Existe processo documentado de resposta a incidentes, com comunicação ao cliente em prazo acordado?' },
  { tema: 'Incidentes', texto: 'Nos últimos 24 meses, todo incidente que envolveu dados pessoais foi comunicado aos clientes afetados?' },
  { tema: 'Transferência internacional', texto: 'Os dados do cliente são armazenados ou acessados fora do Brasil? Se sim, indique os países na justificativa.' },
  { tema: 'Retenção e eliminação', texto: 'Ao fim do contrato, a empresa devolve ou elimina os dados do cliente e fornece comprovação?' },
  { tema: 'Encarregado', texto: 'A empresa indicou encarregado ou contato responsável por proteção de dados? Indique o canal institucional na justificativa.' },
  { tema: 'Direitos dos titulares', texto: 'A empresa apoia o cliente no atendimento aos pedidos dos titulares dentro dos prazos?' },
];

/** Roteiro mínimo de conferência do trust center (grande provedor), A VALIDAR: o que a equipe confere, não pergunta ao fornecedor. */
export const ROTEIRO_TRUST_CENTER: ReadonlyArray<{ tema: string; texto: string }> = [
  { tema: 'Certificações', texto: 'Conferir as certificações vigentes publicadas no trust center' },
  { tema: 'Contrato e DPA', texto: 'Conferir o acordo de tratamento de dados (DPA) padrão do provedor' },
  { tema: 'Subprocessadores', texto: 'Conferir a lista publicada de subprocessadores' },
  { tema: 'Localização', texto: 'Conferir as regiões onde os dados do cliente são armazenados' },
  { tema: 'Incidentes', texto: 'Conferir o histórico público de incidentes e o canal de comunicação' },
];

/** Prazos provisórios, a validar pelo dono (spec, seção 1): a validade da avaliação não passa disso. */
export const PRAZO_PADRAO: Record<TipoModelo, number> = { critico: 12, medio: 24, pequeno: 36, grande_provedor: 12 };

export type PerguntaModelo = { id: string; tema: string; texto: string; ordem: number; ativa: number; origem: 'padrao' | 'consultoria' };
export type Modelo = { tipo: TipoModelo; prazo_meses: number; origem: 'padrao' | 'consultoria'; a_validar: boolean; perguntas: PerguntaModelo[] };

const hash24 = async (s: string) => (await sha256Hex(s)).slice(0, 24);
const idModelo = (orgId: string, tipo: TipoModelo) => hash24(`${orgId}:fornecedor-modelo:${tipo}`).then((h) => `fm-${h}`);

/** Idempotente: cria os quatro modelos da organização que faltam, com o conteúdo padrão (ids determinísticos, INSERT OR IGNORE). */
export async function semearModelos(db: D1Database, orgId: string): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const tipo of TIPOS_MODELO) {
    const mid = await idModelo(orgId, tipo);
    stmts.push(db.prepare(`INSERT OR IGNORE INTO fornecedor_modelos (id, org_id, tipo, prazo_meses, origem) VALUES (?, ?, ?, ?, 'padrao')`).bind(mid, orgId, tipo, PRAZO_PADRAO[tipo]));
    const conteudo = tipo === 'grande_provedor' ? ROTEIRO_TRUST_CENTER : PERGUNTAS_PADRAO;
    for (const [i, p] of conteudo.entries()) {
      stmts.push(db.prepare(`INSERT OR IGNORE INTO fornecedor_modelo_perguntas (id, modelo_id, tema, texto, ordem, origem) VALUES (?, ?, ?, ?, ?, 'padrao')`)
        .bind(`fp-${await hash24(`${orgId}:${tipo}:${i + 1}`)}`, mid, p.tema, p.texto, (i + 1) * 10));
    }
  }
  await db.batch(stmts);
}

const aValidar = (origem: string, perguntas: PerguntaModelo[]) => origem === 'padrao' || perguntas.some((p) => p.ativa && p.origem === 'padrao');

export async function lerModelos(db: D1Database, orgId: string): Promise<Modelo[]> {
  await semearModelos(db, orgId);
  const [mods, pergs] = await db.batch([
    db.prepare(`SELECT id, tipo, prazo_meses, origem FROM fornecedor_modelos WHERE org_id = ?`).bind(orgId),
    db.prepare(`SELECT p.id, p.modelo_id, p.tema, p.texto, p.ordem, p.ativa, p.origem FROM fornecedor_modelo_perguntas p JOIN fornecedor_modelos m ON m.id = p.modelo_id
      WHERE m.org_id = ? ORDER BY p.ordem, p.created_at, p.id`).bind(orgId),
  ]);
  const porModelo = new Map<string, PerguntaModelo[]>();
  for (const p of pergs.results as (PerguntaModelo & { modelo_id: string })[]) {
    const { modelo_id, ...resto } = p;
    porModelo.set(modelo_id, [...(porModelo.get(modelo_id) ?? []), resto]);
  }
  const lista = (mods.results as { id: string; tipo: TipoModelo; prazo_meses: number; origem: 'padrao' | 'consultoria' }[]).map((m) => {
    const perguntas = porModelo.get(m.id) ?? [];
    return { tipo: m.tipo, prazo_meses: m.prazo_meses, origem: m.origem, a_validar: aValidar(m.origem, perguntas), perguntas };
  });
  return TIPOS_MODELO.map((t) => lista.find((m) => m.tipo === t)!).filter(Boolean);
}

export async function salvarPrazo(db: D1Database, orgId: string, tipo: TipoModelo, prazo: number, ator: string): Promise<void> {
  await semearModelos(db, orgId);
  await db.prepare(`UPDATE fornecedor_modelos SET prazo_meses = ?, origem = 'consultoria', atualizado_por = ?, updated_at = CURRENT_TIMESTAMP WHERE org_id = ? AND tipo = ?`)
    .bind(prazo, ator, orgId, tipo).run();
  await logAudit(db, 'fornecedor_modelo.prazo', ator, `Modelo de fornecedor ${tipo} da organização ${orgId}: prazo ${prazo} meses`, '', '');
}

export async function criarPerguntaModelo(db: D1Database, orgId: string, tipo: TipoModelo, ator: string, d: { tema: string; texto: string }): Promise<{ id: string }> {
  await semearModelos(db, orgId);
  const mid = await idModelo(orgId, tipo);
  const id = genId();
  const ordem = (await db.prepare('SELECT COALESCE(MAX(ordem), 0) + 10 AS o FROM fornecedor_modelo_perguntas WHERE modelo_id = ?').bind(mid).first<number>('o')) ?? 10;
  await db.prepare(`INSERT INTO fornecedor_modelo_perguntas (id, modelo_id, tema, texto, ordem) VALUES (?, ?, ?, ?, ?)`).bind(id, mid, d.tema, d.texto, ordem).run();
  await logAudit(db, 'fornecedor_modelo.pergunta', ator, `Pergunta ${id} criada no modelo ${tipo} da organização ${orgId}`, '', '');
  return { id };
}

/** false = a pergunta não é de um modelo desta organização (a rota dá 404). Texto ou tema editado deixa de ser o padrão. */
export async function atualizarPerguntaModelo(db: D1Database, orgId: string, id: string, ator: string,
  d: { tema?: string; texto?: string; ordem?: number; ativa?: boolean }): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (d.tema !== undefined) { sets.push('tema = ?'); vals.push(d.tema); }
  if (d.texto !== undefined) { sets.push('texto = ?'); vals.push(d.texto); }
  if (d.ordem !== undefined) { sets.push('ordem = ?'); vals.push(d.ordem); }
  if (d.ativa !== undefined) { sets.push('ativa = ?'); vals.push(d.ativa ? 1 : 0); }
  if (d.tema !== undefined || d.texto !== undefined) sets.push(`origem = 'consultoria'`);
  const r = await db.prepare(`UPDATE fornecedor_modelo_perguntas SET ${[...sets, 'updated_at = CURRENT_TIMESTAMP'].join(', ')}
     WHERE id = ? AND modelo_id IN (SELECT id FROM fornecedor_modelos WHERE org_id = ?)`).bind(...vals, id, orgId).run();
  if (!r.meta.changes) return false;
  await logAudit(db, 'fornecedor_modelo.pergunta', ator, `Pergunta ${id} alterada no modelo da organização ${orgId} (${Object.keys(d).join(', ')})`, '', '');
  return true;
}

export type PerguntaDoProjeto = { id: string; tema: string; texto: string; ordem: number; ativa: number; fonte: 'modelo' | 'projeto'; usada: boolean; tipo: string | null; origem: string };

const orgDoProjeto = (db: D1Database, projectId: string) => db.prepare('SELECT org_id FROM projects WHERE id = ?').bind(projectId).first<string>('org_id');

/**
 * O questionário do projeto para um tipo: as perguntas do modelo vivo (todas, `usada` = ativa no modelo e não desligada no projeto) e as
 * próprias do projeto (`origem = 'projeto'`, do tipo ou de todos; o grande provedor só tem o roteiro do modelo). As `padrao` antigas de `homologacao_perguntas` são ignoradas: a 0106
 * as apaga, e o código anterior pode ressemeá-las entre a migration e o deploy.
 */
export async function perguntasDoProjeto(db: D1Database, projectId: string, tipo: TipoModelo): Promise<{ prazo_meses: number; a_validar: boolean; perguntas: PerguntaDoProjeto[] }> {
  const orgId = (await orgDoProjeto(db, projectId)) ?? 'org_ness';
  const modelo = (await lerModelos(db, orgId)).find((m) => m.tipo === tipo)!;
  const [ajustes, proprias] = await db.batch([
    db.prepare('SELECT modelo_pergunta_id, ativa FROM homologacao_ajustes WHERE project_id = ?').bind(projectId),
    db.prepare(`SELECT id, tema, texto, ordem, ativa, tipo FROM homologacao_perguntas WHERE project_id = ? AND origem = 'projeto' AND (tipo IS NULL OR tipo = ?)
      ORDER BY ordem, created_at, id`).bind(projectId, tipo),
  ]);
  const desligadas = new Set((ajustes.results as { modelo_pergunta_id: string; ativa: number }[]).filter((a) => !a.ativa).map((a) => a.modelo_pergunta_id));
  const doModelo: PerguntaDoProjeto[] = modelo.perguntas.map((p) => ({ ...p, fonte: 'modelo', usada: !!p.ativa && !desligadas.has(p.id), tipo }));
  // o grande provedor tem só o roteiro do modelo: pergunta própria do projeto é de questionário
  const doProjeto: PerguntaDoProjeto[] = tipo === 'grande_provedor' ? [] : (proprias.results as { id: string; tema: string; texto: string; ordem: number; ativa: number; tipo: string | null }[])
    .map((p) => ({ ...p, fonte: 'projeto', usada: !!p.ativa, origem: 'projeto' }));
  return { prazo_meses: modelo.prazo_meses, a_validar: modelo.a_validar, perguntas: [...doModelo, ...doProjeto] };
}

/** O que o envio congela: só as perguntas usadas, na ordem do modelo e depois as do projeto. */
export async function perguntasDoEnvio(db: D1Database, projectId: string, tipo: TipoQuestionario): Promise<{ id: string; tema: string; texto: string }[]> {
  return (await perguntasDoProjeto(db, projectId, tipo)).perguntas.filter((p) => p.usada).map(({ id, tema, texto }) => ({ id, tema, texto }));
}

/** O projeto liga ou desliga uma pergunta do modelo da sua organização. false = não é pergunta de modelo dessa organização. */
export async function ajustarPerguntaDoModelo(db: D1Database, projectId: string, modeloPerguntaId: string, ativa: boolean, ator: string): Promise<boolean> {
  const daOrg = await db.prepare(`SELECT 1 FROM fornecedor_modelo_perguntas p JOIN fornecedor_modelos m ON m.id = p.modelo_id JOIN projects pr ON pr.org_id = m.org_id
    WHERE p.id = ? AND pr.id = ?`).bind(modeloPerguntaId, projectId).first();
  if (!daOrg) return false;
  await db.prepare(`INSERT INTO homologacao_ajustes (project_id, modelo_pergunta_id, ativa) VALUES (?, ?, ?)
    ON CONFLICT (project_id, modelo_pergunta_id) DO UPDATE SET ativa = excluded.ativa, updated_at = CURRENT_TIMESTAMP`).bind(projectId, modeloPerguntaId, ativa ? 1 : 0).run();
  await logAudit(db, 'homologacao.ajuste', ator, `Pergunta ${modeloPerguntaId} do modelo ${ativa ? 'ligada' : 'desligada'} no questionário do projeto`, '', '', projectId);
  return true;
}

/** Meses do modelo do tipo (da organização do projeto): o teto da validade da avaliação (fatia 2). */
export async function prazoDoTipo(db: D1Database, projectId: string, tipo: TipoModelo): Promise<number> {
  const orgId = (await orgDoProjeto(db, projectId)) ?? 'org_ness';
  await semearModelos(db, orgId);
  return (await db.prepare('SELECT prazo_meses FROM fornecedor_modelos WHERE org_id = ? AND tipo = ?').bind(orgId, tipo).first<number>('prazo_meses')) ?? PRAZO_PADRAO[tipo];
}

/** AAAA-MM-DD + n meses, no calendário UTC (31/01 + 1 mês vira 03/03, como o `date(..., '+1 months')` do SQLite). */
export function somarMeses(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
