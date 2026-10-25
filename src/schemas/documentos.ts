import { z } from 'zod';

const titulo = z.string().trim().min(1).max(300);
// 2 MB: teto do texto de uma versão de documento.
const texto = z.string().min(1).max(2_000_000);

export const TIPOS_DOCUMENTO = ['politica', 'norma', 'procedimento'] as const;

export const documentoCriarSchema = z.object({
  tipo: z.enum(TIPOS_DOCUMENTO).default('politica'),
  titulo,
  texto,
  pai_id: z.string().trim().min(1).max(100).nullish(),
  dono_parte_id: z.string().trim().min(1).max(100).nullish(),
  revisar_a_cada_meses: z.number().int().min(1).max(120).nullish(),
});
export type DocumentoCriar = z.infer<typeof documentoCriarSchema>;

export const versaoSalvarSchema = z.object({ texto, origem: z.enum(['humano', 'agente', 'gerador']).default('humano') });

/**
 * Edição de metadados do documento (nunca o texto, que é versão). `.strict()`: campo desconhecido é 400.
 * `status`: só `obsoleto` (aposentar) ou `vigente` (reativar, se houver versão vigente).
 */
export const documentoAtualizarSchema = z.object({
  titulo: titulo.optional(),
  tipo: z.enum(TIPOS_DOCUMENTO).optional(),
  pai_id: z.string().trim().min(1).max(100).nullable().optional(),
  dono_parte_id: z.string().trim().min(1).max(100).nullable().optional(),
  revisar_a_cada_meses: z.number().int().min(1).max(120).nullable().optional(),
  status: z.enum(['vigente', 'obsoleto']).optional(),
}).strict();

/** AAAA-MM-DD e uma data que existe (2027-02-30 não). Se está no passado, quem sabe do relógio é o serviço. */
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD')
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, 'Data inexistente');
const escopo = z.string().trim().min(1).max(2000);
const motivo = z.string().trim().min(1).max(4000);

/** Exceção a documento (fatia 3.5): a quem vale, por quê e até quando. `.strict()`: campo desconhecido é 400. */
export const excecaoCriarSchema = z.object({ escopo, motivo, vence_em: dia }).strict();
export const excecaoAtualizarSchema = z.object({ escopo: escopo.optional(), motivo: motivo.optional(), vence_em: dia.optional() }).strict();

/** Documento do legado (0081, `documentos_arquivo`): arquivo com metadados. PUT e POST mandam o registro inteiro (o modal tem tudo). */
export const TIPOS_DOCUMENTO_ARQUIVO = ['politica', 'norma', 'procedimento', 'termo', 'contrato', 'aditivo', 'relatorio', 'outro'] as const;
export const STATUS_DOCUMENTO_ARQUIVO = ['rascunho', 'publicado', 'obsoleto'] as const;
export const documentoArquivoSchema = z.object({
  nome: titulo,
  tipo: z.enum(TIPOS_DOCUMENTO_ARQUIVO),
  status: z.enum(STATUS_DOCUMENTO_ARQUIVO),
  vencimento: dia.nullish(),
  sem_vencimento: z.boolean().optional(),
  responsavel_parte_id: z.string().trim().min(1).max(100).nullish(),
}).strict().refine((d) => !(d.sem_vencimento && d.vencimento), { message: 'Documento sem vencimento não leva data', path: ['vencimento'] });
export type DocumentoArquivo = z.infer<typeof documentoArquivoSchema>;

/** Política temática: pelo código do tema do catálogo, ou tema livre com título e requisitos. */
export const politicaCriarSchema = z.union([
  z.object({ tema: z.string().max(20) }).strict(),
  z.object({ titulo: z.string().min(3).max(300), requisitos: z.array(z.string().max(80)).max(200) }).strict(),
]);

/** Gerar uma seção: sem campos (a seção vem na URL); a rota aceita corpo vazio. */
export const politicaSecaoGerarSchema = z.object({}).strict();

/** Organizar: incorporar a política por controle (origem) a uma temática (destino). */
export const politicaIncorporarSchema = z.object({ origem: z.string().min(1).max(80), destino: z.string().min(1).max(80) }).strict();
/** Organizar: promover a política por controle a temática, com título e requisitos novos. */
export const politicaPromoverSchema = z.object({ titulo: z.string().min(3).max(200), requisitos: z.array(z.string().max(80)).min(1).max(200) }).strict();
