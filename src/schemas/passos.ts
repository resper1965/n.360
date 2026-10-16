import { z } from 'zod';

const idCampo = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);

/** PUT .../passos/:itemId/campos: o autosave. `vistos` = o `atualizado_em` que a tela viu de cada campo (null: não havia). */
export const passoCamposSchema = z.strictObject({
  campos: z.record(idCampo, z.string().max(4000).nullable()).refine((o) => Object.keys(o).length >= 1 && Object.keys(o).length <= 8, 'de 1 a 8 campos'),
  vistos: z.record(idCampo, z.string().max(40).nullable()).optional(),
});
/** PATCH .../passos/:itemId: responsável e prazo, que saem do "Editar" antigo. */
export const passoMetaSchema = z.strictObject({
  assigned_to: z.string().trim().max(200).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).refine((o) => o.assigned_to !== undefined || o.due_date !== undefined, 'informe responsável ou prazo');
export const passoConcluirSchema = z.strictObject({ excecao: z.strictObject({ motivo: z.string().trim().min(10).max(500) }).optional() });
export const passoReabrirSchema = z.strictObject({ motivo: z.string().trim().max(500).optional() });
export const passoBloquearSchema = z.strictObject({ motivo: z.string().trim().min(5).max(500), responsavel: z.string().trim().min(2).max(200) });
export const passoDesbloquearSchema = z.strictObject({});
export const copilotoCampoSchema = z.strictObject({ campo: idCampo, instrucao: z.string().trim().max(500).optional() });
export const copilotoConversaSchema = z.strictObject({ conversa: z.string().trim().min(20).max(8000) });
export const copilotoRevisaoSchema = z.strictObject({});
