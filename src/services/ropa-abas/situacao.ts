import { logAudit, PODE_REVOGAR_APROVACAO, ehEquipeNess, genId } from '../../helpers';
import { aprovacoesDoProjeto } from '../documentos';
import { podePedir } from '../pedidos';
import { atividadeDoProjeto, falha, type Falha } from './comum';
import { registrarSecao } from './logs';
import type { AcaoDoMenu, AcaoId, CodigoSituacao, Situacao } from './tipos';
import type { z } from 'zod';
import type { situacaoSchema } from '../../schemas/ropa-abas';

export const ROTULO_SITUACAO: Record<CodigoSituacao, string> = { rascunho: 'Rascunho', em_revisao: 'Em Revisão', aprovada: 'Aprovada', cancelada: 'Cancelada' };
type Carimbo = { por: string; em: string } | null;
export type EntradaSituacao = { status: string | null; reaberta_em: string | null; aprovacao: { ciso: Carimbo; ceo: Carimbo } | null; aprovacao_anterior: unknown | null };

/**
 * A situação que o cabeçalho mostra. Pura: a aprovação é DERIVADA dos pedidos (nunca gravada aqui) e a reabertura é o carimbo
 * `reaberta_em`. Só conta como aprovação a posterior à reabertura.
 */
export function situacaoDaAtividade(e: EntradaSituacao): Situacao {
  const emAprovacao = [e.aprovacao?.ciso?.em, e.aprovacao?.ceo?.em].filter((x): x is string => !!x).sort().pop() ?? null;
  const reaberta = !!emAprovacao && !!e.reaberta_em && e.reaberta_em >= emAprovacao;
  const desatualizada = !emAprovacao && !!e.aprovacao_anterior;
  const mk = (codigo: CodigoSituacao, nova = false): Situacao => ({ codigo, rotulo: ROTULO_SITUACAO[codigo], aprovacao_desatualizada: desatualizada, em_nova_revisao: nova });
  if (e.status === 'Inactive') return mk('cancelada');
  if (e.status === 'Approved') return mk('aprovada');
  if (emAprovacao && !reaberta) return mk('aprovada');
  if (e.status === 'Under Review' || reaberta) return mk('em_revisao', reaberta);
  return mk('rascunho');
}

export type Papel = { equipe: boolean; orgAdmin: boolean; podeRevogar: boolean; podePedir: boolean; bloqueios: number };
const nao = (motivo: string): AcaoDoMenu => ({ habilitada: false, motivo });
const sim: AcaoDoMenu = { habilitada: true, motivo: null };

/** Habilitação do menu "Ações" (spec 6). O servidor devolve o motivo do bloqueio em texto; a tela só mostra. */
export function acoesDoMenu(s: Situacao, p: Papel): Record<AcaoId, AcaoDoMenu> {
  const c = s.codigo;
  return {
    conferir_aprovar: c !== 'em_revisao' ? nao('Só uma atividade em revisão vai para aprovação.')
      : !p.podePedir ? nao('Pedir aprovação é de quem tem esse papel no projeto.')
      : p.bloqueios ? nao(`Há ${p.bloqueios} ${p.bloqueios === 1 ? 'pendência' : 'pendências'} a resolver antes de pedir a aprovação.`) : sim,
    alterar_para_em_revisao: c !== 'rascunho' ? nao(c === 'em_revisao' ? 'A atividade já está em revisão.' : 'Só um rascunho passa para revisão.') : (p.equipe || p.orgAdmin) ? sim : nao('Sem permissão para esta ação.'),
    imprimir: sim,
    reabrir: c !== 'aprovada' ? nao('A atividade não está aprovada.') : p.podeRevogar ? sim : nao('Reabrir uma atividade aprovada é do administrador do cliente ou da plataforma.'),
    reativar: c !== 'cancelada' ? nao('A atividade não está cancelada.') : (p.equipe || p.orgAdmin) ? sim : nao('Sem permissão para esta ação.'),
    cancelar: c === 'cancelada' ? nao('A atividade já está cancelada.') : (p.equipe || p.orgAdmin) ? sim : nao('Sem permissão para esta ação.'),
    excluir: c === 'aprovada' ? nao('A atividade aprovada não se apaga: cancele pela situação.') : p.equipe ? sim : nao('Excluir é da equipe da consultoria.'),
  };
}

export const papelDe = (user: { role?: string } | undefined | null, podePedirAprovacao: boolean, bloqueios: number): Papel => ({
  equipe: ehEquipeNess(user), orgAdmin: user?.role === 'org_admin', podeRevogar: PODE_REVOGAR_APROVACAO.has(user?.role ?? ''), podePedir: podePedirAprovacao, bloqueios,
});

/** Papel com todas as permissões: separa "a situação não permite" (409) de "você não pode" (403). */
const TUDO: Papel = { equipe: true, orgAdmin: true, podeRevogar: true, podePedir: true, bloqueios: 0 };

/** A situação gravada + derivada de uma atividade do projeto (3 consultas). null: atividade não é do projeto. */
export async function situacaoGravada(db: D1Database, projectId: string, ropaId: string) {
  const at = await atividadeDoProjeto(db, projectId, ropaId);
  if (!at) return null;
  const extra = await db.prepare('SELECT reaberta_em FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first<{ reaberta_em: string | null }>();
  const ap = (await aprovacoesDoProjeto(db, projectId, ropaId, 'tratamento')).get(ropaId) ?? null;
  return { at, situacao: situacaoDaAtividade({ status: at.status, reaberta_em: extra?.reaberta_em ?? null, aprovacao: ap, aprovacao_anterior: null }) };
}

type Corpo = z.infer<typeof situacaoSchema>;
const PARA: Record<Corpo['acao'], string> = { enviar_revisao: 'Under Review', reativar: 'Under Review', reabrir: 'Under Review', cancelar: 'Inactive' };
const EVENTO: Record<Corpo['acao'], string> = { enviar_revisao: 'Enviada para revisão', reativar: 'Reativada', reabrir: 'Reaberta', cancelar: 'Cancelada' };
const ID_DO_MENU: Record<Corpo['acao'], AcaoId> = { enviar_revisao: 'alterar_para_em_revisao', reativar: 'reativar', reabrir: 'reabrir', cancelar: 'cancelar' };

/**
 * Aplica a transição. Quem pode e de que situação: `acoesDoMenu` (a mesma regra da tela). Aprovar NÃO é uma transição: é o pedido de
 * aprovação (src/services/pedidos.ts), que esta função não toca, exceto cancelar o pedido ABERTO ao cancelar a atividade. Nada aqui
 * grava assinatura (`ciso_approved_*`) para aprovar; reabrir só LIMPA a assinatura direta antiga, como a revogação de `ropa.ts`.
 */
export async function transicionar(db: D1Database, projectId: string, ropaId: string, user: { email?: string; role?: string }, corpo: Corpo, ip = ''):
  Promise<Falha | { ok: true; de: string | null; para: string }> {
  const lido = await situacaoGravada(db, projectId, ropaId);
  if (!lido) return falha(404, 'Registro do RoPA não encontrado');
  const { at, situacao } = lido;
  const id = ID_DO_MENU[corpo.acao];
  if (!acoesDoMenu(situacao, TUDO)[id].habilitada) return falha(409, 'Ação indisponível para a situação atual');
  const menu = acoesDoMenu(situacao, papelDe(user, true, 0))[id];
  if (!menu.habilitada) return falha(403, String(menu.motivo));

  const stmts: D1PreparedStatement[] = [];
  const motivo = 'motivo' in corpo ? corpo.motivo : '';
  if (corpo.acao === 'reabrir') {
    // A prova do pedido é imutável: não se apaga. Só a assinatura DIRETA antiga é limpa (mesmo efeito da revogação, ropa.ts:426).
    stmts.push(db.prepare(`UPDATE ropa_records SET status = 'Under Review', reaberta_em = datetime('now'), updated_at = datetime('now'),
      ciso_approved_by = NULL, ciso_approved_at = NULL, ciso_approved_ip = NULL, ciso_approved_ua = NULL,
      ceo_approved_by = NULL, ceo_approved_at = NULL, ceo_approved_ip = NULL, ceo_approved_ua = NULL WHERE id = ? AND project_id = ?`).bind(ropaId, projectId));
  } else {
    stmts.push(db.prepare(`UPDATE ropa_records SET status = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?`).bind(PARA[corpo.acao], ropaId, projectId));
  }
  if (corpo.acao === 'cancelar') {
    // Só o pedido ABERTO; o formato (`AND status = 'aberto'` na própria WHERE) é o que test/pedidos-prova.test.ts exige de todo UPDATE pedidos.
    stmts.push(db.prepare(`UPDATE pedidos SET status = 'cancelado' WHERE project_id = ? AND tipo = 'tratamento' AND ref_id = ? AND status = 'aberto'`).bind(projectId, ropaId));
  }
  await db.batch(stmts);
  const ator = user.email || 'system';
  await registrarSecao(db, ator, projectId, ropaId, 'Situação', EVENTO[corpo.acao]);
  await logAudit(db, 'ropa.situacao', ator, `ROPA ${ropaId}: ${at.status ?? 'sem status'} -> ${PARA[corpo.acao]} (${corpo.acao})`, motivo, ip, projectId);
  return { ok: true, de: at.status, para: PARA[corpo.acao] };
}

/** Quem pode pedir aprovação neste projeto (a regra de `podePedir`, só como booleano para o menu). */
export const podePedirAprovacao = async (db: D1Database, user: Parameters<typeof podePedir>[1], projectId: string) => (await podePedir(db, user, projectId)) === null;
