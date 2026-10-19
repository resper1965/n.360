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
 * As lacunas do modo guiado, na ordem das abas (spec 14): a tela pula as que a pessoa adiou com "Não sei agora" e, quando só
 * restam adiadas, lista-as como pendências. Gaps e riscos nunca entram. Vazia: tudo respondido. Mesma entrada, mesma saída.
 */
export function lacunas(e: EntradaProxima): ProximaPergunta[] {
  const l: ProximaPergunta[] = [];
  if (!String(e.finalidade ?? '').trim()) l.push({ aba: 'escopo', campo: 'finalidade' });
  if (!e.responsavel) l.push({ aba: 'escopo', campo: 'responsavel' });
  if (!e.areas) l.push({ aba: 'escopo', campo: 'areas' });
  const c = e.coleta;
  if (!c.titulares.length) l.push(tratamento('coleta.titulares'));
  if (c.titulares.some((t) => !t.dados)) l.push(tratamento('coleta.dados'));
  if (c.solicitaConsentimento === null) l.push(tratamento('coleta.consentimento_e_criancas'));
  if (!String(c.descricao ?? '').trim()) l.push(tratamento('coleta.descricao'));
  if (!c.ativos) l.push(tratamento('coleta.ativos'));
  for (const x of e.etapas) {
    if (x.situacao !== 'pendente' || !x.faltas.length) continue;
    l.push(tratamento(`${x.etapa}.${FALTA_CAMPO[x.faltas[0]] ?? x.faltas[0]}`));
  }
  if (!e.papelRespondido) l.push({ aba: 'agentes', campo: 'papel' });
  if (!e.temBase && !e.art11Na) l.push({ aba: 'base_juridica', campo: 'base' });
  if (!e.medidas) l.push({ aba: 'medidas', campo: 'medida' });
  const respondidas = new Set(e.impactoRespondidas);
  for (const p of PERGUNTAS_IMPACTO) if (!respondidas.has(p.id)) l.push({ aba: 'impacto', campo: p.id });
  if (!e.impactoFinalizado) l.push({ aba: 'impacto', campo: 'finalizado' });
  return l;
}

/** A primeira lacuna; `null`: tudo respondido. */
export const proximaPergunta = (e: EntradaProxima): ProximaPergunta | null => lacunas(e)[0] ?? null;
