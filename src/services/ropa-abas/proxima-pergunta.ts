import { PERGUNTAS_IMPACTO } from '../impacto';
import type { EstadoEtapa } from './tipos';
import type { AbaId } from '../../schemas/ropa-abas';

export type ProximaPergunta = { aba: AbaId; campo: string };

/** Só o que a ordem das abas olha, já lido (a ficha lê uma vez e passa aqui). Função pura, sem consulta. */
export type EntradaProxima = {
  finalidade: string | null;
  responsavel: boolean;
  areas: number;
  coleta: { titulares: { dados: number }[]; solicitaConsentimento: boolean | null; descricao: string | null; ativos: number };
  etapas: EstadoEtapa[];
  papelRespondido: boolean;
  temBase: boolean;
  art11Na: boolean;
  medidas: number;
  impactoRespondidas: string[];
  impactoFinalizado: boolean;
};

/** Falta da situação da etapa (`situacaoDaEtapa`, texto) para o campo da aba. Teste cobre que nenhuma falta fica sem campo. */
export const FALTA_CAMPO: Record<string, string> = {
  'descrição': 'descricao',
  'ao menos um titular': 'titulares',
  'dados de cada titular': 'dados',
  'titulares da Coleta': 'titulares',
  'defina os titulares na Coleta': 'titulares',
  'ao menos um ativo': 'ativos',
  'ativos do Armazenamento': 'armazenamento.ativos',
  'ao menos uma área': 'areas',
  'ao menos um parceiro': 'parceiros',
  'local de armazenamento de cada ativo': 'locais',
  'prazo': 'prazo',
  'descarte': 'descarte',
};

const tratamento = (campo: string): ProximaPergunta => ({ aba: 'tratamento', campo });

/**
 * A próxima pergunta do modo guiado: a primeira lacuna na ordem das abas (spec 14). Gaps e riscos nunca entram: o guiado
 * os sugere por fora, quando faltam. `null`: tudo respondido. Mesma entrada, mesma saída.
 */
export function proximaPergunta(e: EntradaProxima): ProximaPergunta | null {
  if (!String(e.finalidade ?? '').trim()) return { aba: 'escopo', campo: 'finalidade' };
  if (!e.responsavel) return { aba: 'escopo', campo: 'responsavel' };
  if (!e.areas) return { aba: 'escopo', campo: 'areas' };
  const c = e.coleta;
  if (!c.titulares.length) return tratamento('coleta.titulares');
  if (c.titulares.some((t) => !t.dados)) return tratamento('coleta.dados');
  if (c.solicitaConsentimento === null) return tratamento('coleta.consentimento_e_criancas');
  if (!String(c.descricao ?? '').trim()) return tratamento('coleta.descricao');
  if (!c.ativos) return tratamento('coleta.ativos');
  for (const x of e.etapas) {
    if (x.situacao !== 'pendente' || !x.faltas.length) continue;
    return tratamento(`${x.etapa}.${FALTA_CAMPO[x.faltas[0]] ?? x.faltas[0]}`);
  }
  if (!e.papelRespondido) return { aba: 'agentes', campo: 'papel' };
  if (!e.temBase && !e.art11Na) return { aba: 'base_juridica', campo: 'base' };
  if (!e.medidas) return { aba: 'medidas', campo: 'medida' };
  const respondidas = new Set(e.impactoRespondidas);
  const sem = PERGUNTAS_IMPACTO.find((p) => !respondidas.has(p.id));
  if (sem) return { aba: 'impacto', campo: sem.id };
  if (!e.impactoFinalizado) return { aba: 'impacto', campo: 'finalizado' };
  return null;
}
