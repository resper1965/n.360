import { z } from 'zod';

/**
 * Corpos das rotas da ficha em abas (spec 2026-10-16, seção 8). Todos ESTRITOS (campo a mais é 400). Convenção: campo ausente mantém o
 * valor gravado, `null` limpa (onde a coluna aceita NULL). Texto livre é aparado. Nada aqui carrega dado pessoal além do que a pessoa digita.
 */
export const ETAPAS = ['coleta', 'uso', 'compartilhamento_interno', 'compartilhamento_externo', 'armazenamento', 'eliminacao'] as const;
export type Etapa = (typeof ETAPAS)[number];
/** As nove abas, na ordem e com o id estável (os rótulos exatos do legado ficam em `frontend/src/atividade/contrato.js`). */
export const ABAS_IDS = ['escopo', 'tratamento', 'agentes', 'medidas', 'base_juridica', 'gaps', 'impacto', 'riscos', 'logs'] as const;
export type AbaId = (typeof ABAS_IDS)[number];

const id = z.string().trim().min(1).max(100);
const texto = (max: number) => z.string().trim().max(max);
const textoOuNulo = (max: number) => texto(max).nullish().transform((v) => (v === '' ? null : v));
const ids = (max: number) => z.array(id).max(max).refine((xs) => new Set(xs).size === xs.length, 'ids repetidos');

export const escopoSchema = z.strictObject({
  nome: textoOuNulo(200).optional(),
  descricao_atividade: textoOuNulo(8000).optional(),
  finalidade: texto(500).min(1, 'Finalidade não pode ficar vazia').optional(),
  volume_mensal: textoOuNulo(200).optional(),
  processamento_automatizado: z.enum(['nao', 'apoio', 'decisao']).nullish().optional(),
  owner_parte_id: id.nullish().optional(),
  areas_ids: ids(50).optional(),
});
export type EscopoCorpo = z.infer<typeof escopoSchema>;

const boolLike = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => (v ? 1 : 0));
export const agentesSchema = z.strictObject({
  papel_controlador: boolLike.nullish().optional(),
  papel_operador: boolLike.nullish().optional(),
  international_transfers: boolLike.optional(),
  transfer_safeguards: textoOuNulo(500).optional(),
});

export const MEDIDA_STATUS = ['ativa', 'em_implantacao', 'planejada'] as const;
export const medidaCriarSchema = z.strictObject({
  medida: texto(200).min(1, 'Medida é obrigatória'),
  status: z.enum(MEDIDA_STATUS),
  descricao: textoOuNulo(2000).optional(),
  controle_id: id.nullish().optional(),
});
export const medidaAtualizarSchema = medidaCriarSchema.partial();

const incisoComFinalidade = z.strictObject({ requisito_id: id, finalidade: texto(2000).min(3, 'A finalidade é obrigatória em cada inciso') });
export const GDPR_BASES = ['consentimento', 'contrato', 'interesses_legitimos', 'interesses_vitais', 'obrigacao_legal', 'tarefa_publica'] as const;
export const baseJuridicaSchema = z.strictObject({
  previsao_legal: textoOuNulo(500).optional(),
  lgpd: z.array(incisoComFinalidade.refine((x) => x.requisito_id.startsWith('lgpd:art7:'), 'Só incisos do art. 7º entram em lgpd')).max(10).optional(),
  art11: z.strictObject({
    nao_aplicavel: z.boolean(),
    incisos: z.array(incisoComFinalidade.refine((x) => x.requisito_id.startsWith('lgpd:art11:'), 'Só incisos do art. 11 entram em art11')).max(12),
  }).refine((x) => !(x.nao_aplicavel && x.incisos.length), 'Não Aplicável não tem incisos').optional(),
  gdpr: z.array(z.strictObject({ base: z.enum(GDPR_BASES), finalidade: texto(2000).min(3, 'A finalidade é obrigatória em cada base') })).max(6).optional(),
});
export type BaseJuridicaCorpo = z.infer<typeof baseJuridicaSchema>;

export const GAP_STATUS = ['Open', 'In Progress', 'Closed'] as const;
export const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD');
export const gapCriarSchema = z.strictObject({
  gap: texto(4000).min(1, 'O gap é obrigatório'),
  recomendacao: textoOuNulo(4000).optional(),
  plano_acao: textoOuNulo(4000).optional(),
  responsavel_parte_id: id,
  prazo: dataIso.nullish().optional(),
  status: z.enum(GAP_STATUS).optional(),
});
export const gapAtualizarSchema = gapCriarSchema.partial();
export const gapsNaoAplicavelSchema = z.strictObject({ valor: z.boolean() });

export const situacaoSchema = z.discriminatedUnion('acao', [
  z.strictObject({ acao: z.literal('enviar_revisao') }),
  z.strictObject({ acao: z.literal('reativar') }),
  z.strictObject({ acao: z.literal('reabrir'), motivo: texto(1000).min(5, 'Informe o motivo (5 caracteres ou mais)') }),
  z.strictObject({ acao: z.literal('cancelar'), motivo: texto(1000).min(5, 'Informe o motivo (5 caracteres ou mais)') }),
]);

// ─── PR2: etapas e catálogos ───
export const ORIGENS_IDS_MAX = 12;
export const etapaCabecalhoSchema = z.strictObject({
  nao_aplicavel: z.boolean().optional(),
  descricao: textoOuNulo(4000).optional(),
  origem: z.array(texto(60).min(1)).max(ORIGENS_IDS_MAX).optional(),
  solicita_consentimento: boolLike.optional(),
  criancas_adolescentes: boolLike.optional(),
  prazo: textoOuNulo(500).optional(),
  descarte: textoOuNulo(2000).optional(),
}).refine((x) => !(x.nao_aplicavel && Object.entries(x).some(([k, v]) => k !== 'nao_aplicavel' && v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))),
  'Etapa que não se aplica não tem conteúdo');
export const etapaAtivosSchema = z.strictObject({
  ativos: z.array(z.strictObject({ item_id: id, local_armazenamento: textoOuNulo(200).optional() })).max(100)
    .refine((xs) => new Set(xs.map((x) => x.item_id)).size === xs.length, 'ativos repetidos'),
});
export const etapaAreasSchema = z.strictObject({ departamentos_ids: ids(100) });
export const etapaParceirosSchema = z.strictObject({ partes_ids: ids(100) });
export const etapaTitularesColetaSchema = z.strictObject({
  titulares: z.array(z.strictObject({ titular_id: id, dados_ids: ids(200).refine((xs) => xs.length > 0, 'Escolha ao menos um dado') })).max(50)
    .refine((xs) => new Set(xs.map((x) => x.titular_id)).size === xs.length, 'titulares repetidos'),
});
export const etapaTitularSchema = z.strictObject({ dados_ids: ids(200), nao_usa: z.boolean().optional() })
  .refine((x) => (x.nao_usa ? x.dados_ids.length === 0 : x.dados_ids.length > 0), 'Escolha ao menos um dado ou marque "Dados não usados nesse tratamento"');

export const CATALOGO_TIPOS = ['titulares', 'dados', 'medidas', 'motivos-risco'] as const;
export const catalogoCriarSchema = z.strictObject({
  nome: texto(200).min(1, 'O nome é obrigatório'),
  sensivel: z.boolean().optional(),
  descricao_padrao: textoOuNulo(2000).optional(),
  descricao: textoOuNulo(2000).optional(),
});
export const catalogoAtualizarSchema = z.strictObject({
  nome: texto(200).min(1).optional(), sensivel: z.boolean().optional(), descricao_padrao: textoOuNulo(2000).optional(), descricao: textoOuNulo(2000).optional(), status: z.enum(['ativo', 'inativo']).optional(),
});

/** Corpo do POST de rascunho da etapa: uma nota opcional da pessoa (dado). Campo a mais é 400. */
export const etapaRascunhoSchema = z.strictObject({ nota: z.string().trim().max(2000).optional() });
export type CorpoRascunhoEtapa = z.infer<typeof etapaRascunhoSchema>;
