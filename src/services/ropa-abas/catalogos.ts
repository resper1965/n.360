import { genId, logAudit } from '../../helpers';
import { chaveNome, normalizarNome } from '../nomes';
import { SENSIVEIS_CONHECIDOS } from '../../data/ropa-abas/sensiveis';
import { falha, type Falha } from './comum';

export type TipoCatalogo = 'titular' | 'dado' | 'medida' | 'motivo_risco';
/** Caminho da rota → tipo do banco. Lista fixa: nunca se monta SQL com o texto da URL. */
export const TIPO_DO_CAMINHO = { titulares: 'titular', dados: 'dado', medidas: 'medida', 'motivos-risco': 'motivo_risco' } as const satisfies Record<string, TipoCatalogo>;
export type ItemDoCatalogo = { id: string; nome: string; sensivel: boolean; descricao_padrao: string | null; descricao: string | null; status: 'ativo' | 'inativo' };
type Linha = { id: string; nome: string; sensivel: number; descricao_padrao: string | null; descricao: string | null; status: 'ativo' | 'inativo' };
const SQL_ITEM = 'SELECT id, nome, sensivel, descricao_padrao, descricao, status FROM catalogo_itens';
const paraItem = (r: Linha): ItemDoCatalogo => ({ id: r.id, nome: r.nome, sensivel: !!r.sensivel, descricao_padrao: r.descricao_padrao, descricao: r.descricao, status: r.status });

/** Lista do projeto. Vazia no projeto novo: nada é semeado (decisão do dono, 16/10/2026). Leitura não grava nada. */
export async function listarCatalogo(db: D1Database, projectId: string, tipo: TipoCatalogo, { q = '', inativos = false } = {}): Promise<ItemDoCatalogo[]> {
  const { results } = await db.prepare(`${SQL_ITEM} WHERE project_id = ? AND tipo = ? ${inativos ? '' : "AND status = 'ativo'"} ORDER BY nome COLLATE NOCASE`)
    .bind(projectId, tipo).all<Linha>();
  const k = chaveNome(q);
  return results.filter((r) => !k || chaveNome(r.nome).includes(k)).map(paraItem);
}

export async function criarNoCatalogo(db: D1Database, projectId: string, tipo: TipoCatalogo, corpo: { nome: string; sensivel?: boolean; descricao_padrao?: string | null; descricao?: string | null }):
  Promise<{ ok: true; item: ItemDoCatalogo } | (Falha & { existente?: { id: string; nome: string } })> {
  const nome = normalizarNome(corpo.nome);
  if (!nome) return falha(400, 'O nome é obrigatório');
  if (corpo.descricao_padrao && tipo !== 'motivo_risco') return falha(400, 'Só motivo de risco tem descrição padrão');
  if (corpo.descricao && tipo !== 'titular') return falha(400, 'Só o titular tem descrição');
  const todos = (await db.prepare('SELECT id, nome FROM catalogo_itens WHERE project_id = ? AND tipo = ?').bind(projectId, tipo).all<{ id: string; nome: string }>()).results;
  const igual = todos.find((r) => chaveNome(r.nome) === chaveNome(nome));
  if (igual) return { ...falha(409, 'Já existe um item com este nome'), existente: igual };
  // Dado da lista fixa nasce marcado (sugestão); a pessoa pode desmarcar depois.
  const sensivel = tipo === 'dado' && (corpo.sensivel ?? SENSIVEIS_CONHECIDOS.some((s) => chaveNome(s) === chaveNome(nome)));
  const id = genId();
  const descricao = tipo === 'motivo_risco' ? corpo.descricao_padrao ?? null : null;
  const descricaoTitular = tipo === 'titular' ? corpo.descricao || null : null;
  await db.prepare('INSERT INTO catalogo_itens (id, project_id, tipo, nome, sensivel, descricao_padrao, descricao) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, projectId, tipo, nome, sensivel ? 1 : 0, descricao, descricaoTitular).run();
  return { ok: true, item: { id, nome, sensivel: !!sensivel, descricao_padrao: descricao, descricao: descricaoTitular, status: 'ativo' } };
}

export type CorpoAtualizacao = { nome?: string; sensivel?: boolean; descricao_padrao?: string | null; descricao?: string | null; status?: 'ativo' | 'inativo' };
/** Edição parcial. `status: 'inativo'` só esconde da lista padrão; o que já foi usado em etapas continua gravado. */
export async function atualizarCatalogo(db: D1Database, projectId: string, tipo: TipoCatalogo, id: string, corpo: CorpoAtualizacao):
  Promise<{ ok: true; item: ItemDoCatalogo } | (Falha & { existente?: { id: string; nome: string } })> {
  const atual = await db.prepare(`${SQL_ITEM} WHERE id = ? AND project_id = ? AND tipo = ?`).bind(id, projectId, tipo).first<Linha>();
  if (!atual) return falha(404, 'Item do catálogo não encontrado');
  if (corpo.sensivel !== undefined && tipo !== 'dado') return falha(400, 'Só dado pessoal é marcado como sensível');
  if (corpo.descricao_padrao !== undefined && tipo !== 'motivo_risco') return falha(400, 'Só motivo de risco tem descrição padrão');
  if (corpo.descricao && tipo !== 'titular') return falha(400, 'Só o titular tem descrição');
  let nome = atual.nome;
  if (corpo.nome !== undefined) {
    nome = normalizarNome(corpo.nome);
    if (!nome) return falha(400, 'O nome é obrigatório');
    const todos = (await db.prepare('SELECT id, nome FROM catalogo_itens WHERE project_id = ? AND tipo = ? AND id <> ?').bind(projectId, tipo, id).all<{ id: string; nome: string }>()).results;
    const igual = todos.find((r) => chaveNome(r.nome) === chaveNome(nome));
    if (igual) return { ...falha(409, 'Já existe um item com este nome'), existente: igual };
  }
  const sensivel = corpo.sensivel !== undefined ? (corpo.sensivel ? 1 : 0) : atual.sensivel;
  const descricao = corpo.descricao_padrao !== undefined ? corpo.descricao_padrao : atual.descricao_padrao;
  const status = corpo.status ?? atual.status;
  const descricaoTitular = corpo.descricao !== undefined ? corpo.descricao || null : atual.descricao;
  await db.prepare('UPDATE catalogo_itens SET nome = ?, sensivel = ?, descricao_padrao = ?, descricao = ?, status = ? WHERE id = ? AND project_id = ?')
    .bind(nome, sensivel, descricao, descricaoTitular, status, id, projectId).run();
  return { ok: true, item: { id, nome, sensivel: !!sensivel, descricao_padrao: descricao, descricao: descricaoTitular, status } };
}

/** Trilha sem texto: o nome do item não vai para o log (spec 9). */
export const registrarCatalogo = (db: D1Database, ator: string, projectId: string, tipo: TipoCatalogo, acao: string) =>
  logAudit(db, `catalogo.${acao}`, ator, `catálogo ${tipo}`, '', '', projectId);
