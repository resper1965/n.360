import type { AbaId, Etapa } from '../../schemas/ropa-abas';

export type EstadoAba = 'feito' | 'pendente' | 'na' | 'vazio';
export type CodigoSituacao = 'rascunho' | 'em_revisao' | 'aprovada' | 'cancelada';
export type AcaoId = 'conferir_aprovar' | 'alterar_para_em_revisao' | 'imprimir' | 'reabrir' | 'reativar' | 'cancelar' | 'excluir';
export type AcaoDoMenu = { habilitada: boolean; motivo: string | null };
export type Situacao = { codigo: CodigoSituacao; rotulo: string; aprovacao_desatualizada: boolean; em_nova_revisao: boolean };
export type EstadoEtapa = { etapa: Etapa; situacao: 'pendente' | 'concluida' | 'nao_aplicavel'; faltas: string[] };
export type ItemConferencia = { id: string; aba: AbaId; texto: string };
export type Conferencia = { pronta: boolean; bloqueios: ItemConferencia[]; avisos: ItemConferencia[] };
export type Ficha = {
  ok: true;
  registro: { id: string; nome: string; finalidade: string; descricao_atividade: string | null; responsavel: { id: string; nome: string } | null; areas: { id: string; nome: string }[]; empresa: string };
  situacao: Situacao;
  acoes: Record<AcaoId, AcaoDoMenu>;
  abas: Record<AbaId, { estado: EstadoAba; resumo: string }>;
  modulos: { iso: boolean };
  proxima_pergunta: { aba: AbaId; campo: string } | null; // PR3 (modo guiado); null até lá
  lacunas: { aba: AbaId; campo: string }[]; // todas, em ordem; a primeira é a proxima_pergunta
};
