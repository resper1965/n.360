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

/**
 * Fatia 2: terceiro proposto. `tipo` é o do n.privacy (define o método de avaliação); `ultima_avaliacao.metodo` é só o que o
 * arquivo diz (o método gravado vem do tipo, como na tela de terceiros); `tratamentos` são finalidades, ligadas por nome.
 */
export const terceiroPropostoSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  tipo: z.enum(['grande_provedor', 'medio', 'pequeno', 'critico']).nullish(),
  cnpj: z.string().trim().max(30).nullish(),
  contato: z.string().trim().max(200).nullish(),
  ultima_avaliacao: z.object({
    resultado: z.enum(['aprovado', 'com_ressalvas', 'reprovado']),
    valido_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD'),
    metodo: z.string().trim().max(100).nullish(),
  }).strict().nullish(),
  dpa: z.string().trim().max(300).nullish(),
  tratamentos: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
}).strict();
export type TerceiroProposto = z.infer<typeof terceiroPropostoSchema>;

/** O que a revisão mostra como "faltando" num terceiro (só o nome barra a gravação). */
export const OBRIGATORIOS_TERCEIRO = ['nome', 'tipo', 'ultima_avaliacao'] as const;

/** `dados` passa por um dos dois esquemas aqui; o serviço confere que é o da entidade do item. */
export const importacaoItemSchema = z.object({
  dados: z.union([tratamentoPropostoSchema, terceiroPropostoSchema]).optional(),
  decisao: z.enum(['aceito', 'descartado', 'pendente']).optional(),
}).strict().refine((b) => b.dados !== undefined || b.decisao !== undefined, { message: 'Informe dados ou decisao' });
