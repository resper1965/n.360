import { logAudit } from '../helpers';
import { chaveNome, normalizarNome } from './nomes';

/**
 * Saneamento de nomes já gravados (spec 2026-10-14-normalizacao-de-nomes). O servidor recalcula o nome novo na hora;
 * o cliente só diz QUAL linha e qual era o nome (`antes`) que ele viu. Nome de tabela só vem desta constante.
 */
export const TABELAS_NOMES = ['partes', 'departamentos', 'itens'] as const;
export type TabelaNome = (typeof TABELAS_NOMES)[number];

export type Proposta = { tabela: TabelaNome; id: string; antes: string; depois: string; conflito: boolean };
/** `registros` (id e nome) só em partes e itens: a tela de mesclar precisa dos ids. */
export type Duplicata = { tabela: TabelaNome; nomes: string[]; registros?: { id: string; nome: string }[] };
export type Ignorado = { tabela: TabelaNome; id: string; motivo: string };

type Linha = { id: string; nome: string; status?: string };

/** `itens` guarda também sistemas e outros; os removidos ficam de fora. */
const SELECT: Record<TabelaNome, string> = {
  partes: `SELECT id, nome, status FROM partes WHERE project_id = ?`,
  departamentos: `SELECT id, nome FROM departamentos WHERE project_id = ?`,
  itens: `SELECT id, nome FROM itens WHERE project_id = ? AND status != 'removido'`,
};

async function linhas(db: D1Database, projectId: string, t: TabelaNome): Promise<Linha[]> {
  return (await db.prepare(SELECT[t]).bind(projectId).all<Linha>()).results;
}

export async function propostasDeNomes(db: D1Database, projectId: string): Promise<{ propostas: Proposta[]; duplicatas: Duplicata[] }> {
  const propostas: Proposta[] = [];
  const duplicatas: Duplicata[] = [];
  for (const t of TABELAS_NOMES) {
    const ls = await linhas(db, projectId, t);
    const exatos = new Set(ls.map((l) => l.nome));
    for (const l of ls) {
      const depois = normalizarNome(l.nome);
      if (depois && depois !== l.nome) propostas.push({ tabela: t, id: l.id, antes: l.nome, depois, conflito: exatos.has(depois) });
    }
    const grupos = new Map<string, Linha[]>();
    // parte inativa (inclusive a que sobrou de uma mesclagem) não é duplicata de ninguém
    for (const l of ls) if (l.status !== 'inativa') grupos.set(chaveNome(l.nome), [...(grupos.get(chaveNome(l.nome)) ?? []), l]);
    for (const g of grupos.values()) {
      if (g.length < 2) continue;
      const nomes = g.map((l) => l.nome).sort();
      duplicatas.push(t === 'departamentos' ? { tabela: t, nomes } : { tabela: t, nomes, registros: g.map(({ id, nome }) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)) });
    }
  }
  return { propostas, duplicatas };
}

export async function aplicarNomes(
  db: D1Database, projectId: string, ator: string, itens: { tabela: TabelaNome; id: string; antes: string }[],
): Promise<{ aplicados: number; ignorados: Ignorado[] }> {
  const ignorados: Ignorado[] = [];
  let aplicados = 0;
  const cache = new Map<TabelaNome, Linha[]>();
  for (const it of itens) {
    const ignorar = (motivo: string) => ignorados.push({ tabela: it.tabela, id: it.id, motivo });
    if (!cache.has(it.tabela)) cache.set(it.tabela, await linhas(db, projectId, it.tabela));
    const todas = cache.get(it.tabela)!;
    const atual = todas.find((l) => l.id === it.id);
    if (!atual) { ignorar('Linha não encontrada neste projeto'); continue; }
    if (atual.nome !== it.antes) { ignorar('O nome mudou depois da lista'); continue; }
    const depois = normalizarNome(atual.nome);
    if (!depois || depois === atual.nome) { ignorar('Já está no padrão'); continue; }
    if (todas.some((l) => l.nome === depois)) { ignorar('Já existe uma linha com o nome padronizado: una à mão'); continue; }
    const r = await db.prepare(`UPDATE ${it.tabela} SET nome = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ? AND nome = ?`)
      .bind(depois, it.id, projectId, atual.nome).run().catch(() => null);
    if (!r?.meta.changes) { ignorar('O nome mudou durante a gravação ou já existe igual'); continue; }
    atual.nome = depois;
    aplicados++;
    await logAudit(db, 'nome.padronizado', ator, `${it.tabela} ${it.id}: "${it.antes}" → "${depois}"`, '', '', projectId);
  }
  return { aplicados, ignorados };
}
