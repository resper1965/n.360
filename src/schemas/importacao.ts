import { z } from 'zod';

/**
 * Importação de programa de privacidade (n.privacy, fatia 1). O que o agente propõe só chega ao banco por este esquema:
 * `strict` (campo a mais recusa o item inteiro, inclusive o que uma instrução escondida no arquivo tentasse pôr) e com teto
 * de tamanho por campo. Os nomes são os da spec; o mapeamento para o RoPA é o da planilha (`validarTratamento`).
 */
const texto = z.string().trim().max(500).nullish();
const nomes = z.array(z.string().trim().min(1).max(200)).max(50).optional();

export const tratamentoPropostoSchema = z.object({
  finalidade: z.string().trim().min(1).max(500),
  base_legal: texto,
  categorias_dados: texto,
  titulares: texto,
  retencao: texto,
  destinatarios: texto,
  transferencia_internacional: z.boolean().nullish(),
  salvaguardas: texto,
  dpia_requerido: z.boolean().nullish(),
  responsavel: texto,
  sistemas: nomes,
  areas: nomes,
  pessoas: nomes,
}).strict();
export type TratamentoProposto = z.infer<typeof tratamentoPropostoSchema>;

/** Obrigatórios do RoPA que a revisão mostra como "faltando" (só a finalidade barra a gravação). */
export const OBRIGATORIOS_ROPA = ['finalidade', 'base_legal', 'categorias_dados', 'titulares', 'retencao'] as const;

export const importacaoItemSchema = z.object({
  dados: tratamentoPropostoSchema.optional(),
  decisao: z.enum(['aceito', 'descartado', 'pendente']).optional(),
}).strict().refine((b) => b.dados !== undefined || b.decisao !== undefined, { message: 'Informe dados ou decisao' });
