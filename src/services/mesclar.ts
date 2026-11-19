import { logAudit } from '../helpers';
import { recalcularIndice } from './terceiros';

/**
 * Mesclar duplicata de parte ou de item (decisão D5 de 26/10/2026; antes "Padronizar nomes" só listava e mandava unir à mão).
 * Move para o cadastro que fica (`manter`) tudo o que aponta para o duplicado (`remover`), inativa o duplicado e deixa trilha.
 * Sem migration: o duplicado vira `inativa` (parte) ou `removido` (item), como qualquer baixa. Uma transação (`db.batch`).
 * Nome de tabela e de coluna vem SÓ das listas abaixo, nunca da requisição; ids vão por bind.
 */
export const TABELAS_MESCLA = ['partes', 'itens'] as const;
export type TabelaMescla = (typeof TABELAS_MESCLA)[number];

type Efeito = { rotulo: string; n: number };
type Falha = { status: 404 | 409; error: string };
export type Previa = { ok: true; manter: { id: string; nome: string }; remover: { id: string; nome: string }; efeitos: Efeito[]; avisos: string[]; tratamentos: string[] };

/** Colunas que apontam para o cadastro e simplesmente mudam de dono (nada a colidir). */
const TROCAR: Record<TabelaMescla, { rotulo: string; tabela: string; coluna: string }[]> = {
  partes: [
    { rotulo: 'Responsável de controle', tabela: 'compliance_controls', coluna: 'owner_parte_id' },
    { rotulo: 'Responsável de risco', tabela: 'risks', coluna: 'owner_parte_id' },
    { rotulo: 'Responsável de atividade (RoPA)', tabela: 'ropa_records', coluna: 'owner_parte_id' },
    { rotulo: 'Responsável de ação corretiva', tabela: 'corrective_actions', coluna: 'assigned_to_parte_id' },
    { rotulo: 'Responsável de item da trilha', tabela: 'checklist_progress', coluna: 'assigned_to_parte_id' },
    { rotulo: 'Dono de documento', tabela: 'documentos', coluna: 'dono_parte_id' },
    { rotulo: 'Destinatário de transferência', tabela: 'tratamento_transferencias', coluna: 'destinatario_parte_id' },
    { rotulo: 'Responsável de documento em arquivo', tabela: 'documentos_arquivo', coluna: 'responsavel_parte_id' },
    { rotulo: 'Responsável de pedido do titular', tabela: 'titular_pedidos', coluna: 'responsavel_parte_id' },
    { rotulo: 'Responsável de incidente', tabela: 'incidentes', coluna: 'responsavel_parte_id' },
    { rotulo: 'Responsável do canal do titular', tabela: 'titular_canal', coluna: 'responsavel_parte_id' },
    { rotulo: 'Avaliação de terceiro', tabela: 'avaliacoes_terceiro', coluna: 'parte_id' },
    { rotulo: 'Criticidade de terceiro', tabela: 'criticidades_terceiro', coluna: 'parte_id' },
  ],
  itens: [
    { rotulo: 'Ativo de risco', tabela: 'risks', coluna: 'asset_id' },
    { rotulo: 'Item do ciclo de vida', tabela: 'tratamento_ciclo', coluna: 'item_id' },
  ],
};

/** Ligações com chave composta: mover o que não colide e apagar o que sobrou (já existia no que fica). */
const LIGAR: Record<TabelaMescla, { rotulo: string; tabela: string; coluna: string; extra?: string; oculto?: boolean }[]> = {
  partes: [
    { rotulo: 'Papéis (vínculos)', tabela: 'parte_vinculos', coluna: 'parte_id' },
    { rotulo: 'Papéis sobre ela (vínculos)', tabela: 'parte_vinculos', coluna: 'alvo_id', extra: `alvo_tipo = 'parte'` },
    { rotulo: 'Documento ligado (DPA, contrato)', tabela: 'documento_partes', coluna: 'parte_id' },
    { rotulo: 'Documento em arquivo ligado (DPA, contrato)', tabela: 'documentos_arquivo_partes', coluna: 'parte_id' },
    { rotulo: 'Parceiro do compartilhamento externo', tabela: 'tratamento_externo_parceiros', coluna: 'parte_id' },
    // oculto: a prévia (e a trilha, que a repete) é de quem não tem `ot`; o n.ot não aparece nela nem pela contagem. Os vínculos passam do mesmo jeito.
    { rotulo: 'Fornecedor de OT', tabela: 'ot_fornecedores', coluna: 'parte_id', oculto: true },
  ],
  itens: [
    { rotulo: 'Item da atividade (RoPA)', tabela: 'tratamento_itens', coluna: 'item_id' },
    { rotulo: 'Item da etapa do ciclo', tabela: 'tratamento_etapa_itens', coluna: 'item_id' },
    { rotulo: 'Papéis sobre o item (vínculos)', tabela: 'parte_vinculos', coluna: 'alvo_id', extra: `alvo_tipo = 'item'` },
  ],
};

/** Atividades (RoPA) que o duplicado toca: o conteúdo congelado da aprovação muda, então o pedido aberto é conferido depois. */
const ATIVIDADES: Record<TabelaMescla, string[]> = {
  partes: [
    `SELECT alvo_id AS id FROM parte_vinculos WHERE parte_id = ?1 AND project_id = ?2 AND alvo_tipo = 'tratamento'`,
    `SELECT ropa_id AS id FROM tratamento_externo_parceiros WHERE parte_id = ?1 AND project_id = ?2`,
    `SELECT ropa_id AS id FROM tratamento_transferencias WHERE destinatario_parte_id = ?1 AND project_id = ?2`,
    `SELECT id FROM ropa_records WHERE owner_parte_id = ?1 AND project_id = ?2`,
  ],
  itens: [
    `SELECT ropa_id AS id FROM tratamento_itens WHERE item_id = ?1 AND project_id = ?2`,
    `SELECT ropa_id AS id FROM tratamento_etapa_itens WHERE item_id = ?1 AND project_id = ?2`,
    `SELECT ropa_id AS id FROM tratamento_ciclo WHERE item_id = ?1 AND project_id = ?2`,
  ],
};

type Cadastro = { id: string; nome: string; tipo?: string; status: string; user_id?: string | null; email?: string | null; cnpj?: string | null; terceiro_tipo?: string | null };

async function ler(db: D1Database, tabela: TabelaMescla, projectId: string, id: string): Promise<Cadastro | null> {
  const sql = tabela === 'partes'
    ? `SELECT id, nome, tipo, status, user_id, email, cnpj, terceiro_tipo FROM partes WHERE id = ? AND project_id = ?`
    : `SELECT id, nome, tipo, status FROM itens WHERE id = ? AND project_id = ?`;
  return db.prepare(sql).bind(id, projectId).first<Cadastro>();
}

/** `titular_canal` é da 0117: com o código publicado antes da migration, a mescla segue sem ela (só o que falta, nada mais é engolido). */
const tabelasDaMescla = async (db: D1Database, tabela: TabelaMescla) => {
  const tem = !!(await db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'titular_canal'`).first());
  if (!tem) console.log(JSON.stringify({ nivel: 'warn', msg: 'titular_canal_ausente', onde: 'mesclar' }));
  return TROCAR[tabela].filter((t) => tem || t.tabela !== 'titular_canal');
};
const quantos = async (db: D1Database, sql: string, ...b: string[]) => (await db.prepare(sql).bind(...b).first<{ n: number }>())?.n ?? 0;

/** O encarregado (DPO) do projeto: a linha de assinatura da governança só se altera pela interface. */
const ehEncarregado = async (db: D1Database, parteId: string, projectId: string) =>
  (await quantos(db, `SELECT count(*) AS n FROM parte_vinculos WHERE parte_id = ? AND project_id = ? AND papel = 'encarregado'`, parteId, projectId)) > 0;
/** O e-mail do duplicado só passa para o que fica se este não for o encarregado. */
const copiaEmail = async (db: D1Database, manter: Cadastro, projectId: string) => !(await ehEncarregado(db, manter.id, projectId));

/** Confere os dois cadastros e devolve o que a mesclagem faria. Não grava nada. */
export async function previaDaMescla(db: D1Database, tabela: TabelaMescla, projectId: string, manterId: string, removerId: string): Promise<Previa | Falha> {
  if (manterId === removerId) return { status: 409, error: 'Escolha dois cadastros diferentes' };
  const [manter, remover] = await Promise.all([ler(db, tabela, projectId, manterId), ler(db, tabela, projectId, removerId)]);
  if (!manter || !remover) return { status: 404, error: 'Cadastro não encontrado neste projeto' };
  const fora = tabela === 'partes' ? 'inativa' : 'removido';
  if (manter.status === fora || remover.status === fora) return { status: 409, error: 'Só se mesclam cadastros ativos' };
  if (manter.tipo !== remover.tipo) return { status: 409, error: 'Os dois cadastros precisam ser do mesmo tipo' };

  const avisos: string[] = [];
  if (tabela === 'partes') {
    if (remover.user_id) return { status: 409, error: 'O cadastro a remover é de uma conta de acesso; desative a conta pela interface antes' };
    const dpo = await quantos(db, `SELECT count(*) AS n FROM parte_vinculos WHERE parte_id = ? AND project_id = ? AND papel = 'encarregado'`, removerId, projectId);
    if (dpo) return { status: 409, error: 'O cadastro a remover é o encarregado (DPO): a linha de assinatura da governança é alterada pela interface' };
    if (remover.email && !manter.email && !(await copiaEmail(db, manter, projectId))) {
      avisos.push('O e-mail do duplicado não será copiado: o cadastro que fica é o encarregado (DPO), e a linha de assinatura é alterada pela interface.');
    }
    if (remover.cnpj && manter.cnpj && remover.cnpj !== manter.cnpj) return { status: 409, error: 'Os dois têm CNPJ diferente: não são a mesma organização' };
    if (await quantos(db, `SELECT count(*) AS n FROM homologacoes WHERE parte_id = ? AND project_id = ?`, removerId, projectId)) {
      avisos.push('As homologações do duplicado ficam registradas nele (são imutáveis) e não passam para o cadastro que fica.');
    }
    const [vm, vr] = await Promise.all([
      quantos(db, `SELECT count(*) AS n FROM vendors WHERE parte_id = ? AND project_id = ?`, manterId, projectId),
      quantos(db, `SELECT count(*) AS n FROM vendors WHERE parte_id = ? AND project_id = ?`, removerId, projectId),
    ]);
    if (vm && vr) avisos.push('Os dois têm perfil de segurança de fornecedor: fica o do cadastro que permanece; o do duplicado continua nele.');
  }

  const efeitos: Efeito[] = [];
  for (const t of await tabelasDaMescla(db, tabela)) {
    const n = await quantos(db, `SELECT count(*) AS n FROM ${t.tabela} WHERE ${t.coluna} = ? AND project_id = ?`, removerId, projectId);
    if (n) efeitos.push({ rotulo: t.rotulo, n });
  }
  for (const t of LIGAR[tabela].filter((x) => !x.oculto)) {
    const n = await quantos(db, `SELECT count(*) AS n FROM ${t.tabela} WHERE ${t.coluna} = ? AND project_id = ?${t.extra ? ` AND ${t.extra}` : ''}`, removerId, projectId);
    if (n) efeitos.push({ rotulo: t.rotulo, n });
  }
  if (tabela === 'itens') {
    const n = await quantos(db, `SELECT count(*) AS n FROM item_seguranca WHERE item_id = ? AND project_id = ?`, removerId, projectId);
    if (n) efeitos.push({ rotulo: 'Perfil de segurança do item (só passa se o que fica não tiver)', n });
  }
  const tratamentos = new Set<string>();
  for (const sql of ATIVIDADES[tabela]) for (const r of (await db.prepare(sql).bind(removerId, projectId).all<{ id: string }>()).results) tratamentos.add(r.id);
  return { ok: true, manter: { id: manter.id, nome: manter.nome }, remover: { id: remover.id, nome: remover.nome }, efeitos, avisos, tratamentos: [...tratamentos] };
}

/** Executa a mesclagem numa transação. Chame depois de `previaDaMescla`; devolve a mesma prévia (o que foi feito). */
export async function mesclar(db: D1Database, tabela: TabelaMescla, projectId: string, ator: string, manterId: string, removerId: string): Promise<Previa | Falha> {
  const previa = await previaDaMescla(db, tabela, projectId, manterId, removerId);
  if (!('ok' in previa)) return previa;
  const [k, d, p] = [manterId, removerId, projectId];
  const stmts: D1PreparedStatement[] = [];
  const email = tabela === 'partes' && (await copiaEmail(db, { id: k, nome: '', status: '' }, p)) ? 1 : 0;

  for (const t of await tabelasDaMescla(db, tabela)) {
    stmts.push(db.prepare(`UPDATE ${t.tabela} SET ${t.coluna} = ? WHERE ${t.coluna} = ? AND project_id = ?`).bind(k, d, p));
  }
  for (const t of LIGAR[tabela]) {
    const extra = t.extra ? ` AND ${t.extra}` : '';
    stmts.push(db.prepare(`UPDATE OR IGNORE ${t.tabela} SET ${t.coluna} = ? WHERE ${t.coluna} = ? AND project_id = ?${extra}`).bind(k, d, p));
    stmts.push(db.prepare(`DELETE FROM ${t.tabela} WHERE ${t.coluna} = ? AND project_id = ?${extra}`).bind(d, p)); // o que sobrou já existia no que fica
  }

  if (tabela === 'partes') {
    stmts.push(
      // pessoa que responde por si mesma depois da junção não é vínculo
      db.prepare(`DELETE FROM parte_vinculos WHERE project_id = ? AND alvo_tipo = 'parte' AND parte_id = alvo_id`).bind(p),
      db.prepare(`UPDATE vendors SET parte_id = ? WHERE parte_id = ? AND project_id = ? AND NOT EXISTS (SELECT 1 FROM vendors v2 WHERE v2.parte_id = ?)`).bind(k, d, p, k),
      db.prepare(`UPDATE partes SET cnpj = NULL WHERE id = ? AND project_id = ?`).bind(d, p), // libera o índice único antes de passar o CNPJ
      db.prepare(`UPDATE partes SET email = CASE WHEN ?5 = 1 THEN COALESCE(email, (SELECT email FROM partes WHERE id = ?1)) ELSE email END, cnpj = COALESCE(cnpj, ?2),
                    terceiro_tipo = COALESCE(terceiro_tipo, (SELECT terceiro_tipo FROM partes WHERE id = ?1)), updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?3 AND project_id = ?4`).bind(d, (await ler(db, 'partes', p, d))?.cnpj ?? null, k, p, email),
      db.prepare(`UPDATE partes SET status = 'inativa', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`).bind(d, p),
    );
  } else {
    stmts.push(
      db.prepare(`UPDATE item_seguranca SET item_id = ? WHERE item_id = ? AND project_id = ? AND NOT EXISTS (SELECT 1 FROM item_seguranca s2 WHERE s2.item_id = ?)`).bind(k, d, p, k),
      db.prepare(`UPDATE itens SET descricao = COALESCE(descricao, (SELECT descricao FROM itens WHERE id = ?1)),
                    responsavel_texto = COALESCE(responsavel_texto, (SELECT responsavel_texto FROM itens WHERE id = ?1)), updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?2 AND project_id = ?3`).bind(d, k, p),
      db.prepare(`UPDATE itens SET status = 'removido', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`).bind(d, p),
    );
  }
  await db.batch(stmts);
  // O DPA e o perfil do duplicado passaram para o que fica: o índice de confiança dele acompanha (sem perfil de fornecedor, não faz nada).
  if (tabela === 'partes') await recalcularIndice(db, manterId);
  // Ids e contagens, nunca nome: parte pode ser pessoa.
  await logAudit(db, 'cadastro.mesclado', ator, `${tabela}: ${d} mesclado em ${k} (${previa.efeitos.map((e) => `${e.rotulo}: ${e.n}`).join('; ') || 'nada a mover'})`, '', '', projectId);
  return previa;
}
