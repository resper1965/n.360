import { z } from 'zod';

const id = z.string().trim().min(1).max(200);

/** Título do requisito (paráfrase curta própria; nunca o texto da norma). */
export const requisitoAtualizarSchema = z.object({
  titulo: z.string().trim().min(1).max(300),
}).strict();

/** Requisito "não aplicável" no projeto (migration 0107): a justificativa barra o "não se aplica" genérico. */
export const requisitoExclusaoSchema = z.object({
  justificativa: z.string().trim().min(20, 'Explique em ao menos 20 caracteres por que o requisito não se aplica').max(2000),
}).strict();

export const TIPOS_MAPEAMENTO = ['equivalente', 'parcial', 'relacionado'] as const;
export const ESTADOS_MAPEAMENTO = ['proposto', 'validado_juridico'] as const;

/**
 * Mapeamento entre requisitos. `validado_por`/`validado_em` são aceitos só por compatibilidade e IGNORADOS: o servidor
 * carimba a sessão e a data quando `estado = 'validado_juridico'`.
 */
export const mapeamentoSchema = z.object({
  de_id: id,
  para_id: id,
  tipo: z.enum(TIPOS_MAPEAMENTO),
  estado: z.enum(ESTADOS_MAPEAMENTO).default('proposto'),
  validado_por: z.string().trim().min(1).max(200).nullish(),
  validado_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD').nullish(),
  nota: z.string().trim().max(2000).nullish(),
}).strict().superRefine((v, ctx) => {
  if (v.de_id === v.para_id) ctx.addIssue({ code: 'custom', path: ['para_id'], message: 'Um requisito não se mapeia a si mesmo' });
});
export type Mapeamento = z.infer<typeof mapeamentoSchema>;

/** Validar os mapeamentos propostos: só o recorte por fonte. Quem valida é quem está logado, nunca vem do corpo (`strict`). */
export const validarMapeamentosSchema = z.object({
  fonte: id.optional(),
}).strict();

export const documentoRequisitosSchema = z.object({
  requisitos: z.array(id).max(100),
}).strict();

/** Validade da evidência (fatia 8): data AAAA-MM-DD, ou null para tirar a validade. */
export const evidenciaValidadeSchema = z.object({
  valido_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD').nullable(),
}).strict();
