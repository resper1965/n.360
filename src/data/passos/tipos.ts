import { z } from 'zod';

// Contrato do catálogo de passos da Bancada (spec 2026-10-15, seção 3). Fonte única do conteúdo: o Worker o valida aqui, o
// avaliador (src/services/passos/avaliar.ts) o lê e o frontend o recebe em GET /api/v1/passos/catalogo.

export const TIPOS_CAMPO = ['texto', 'texto_longo', 'escolha', 'multipla', 'data'] as const;
export const TRILHAS = ['executiva', 'tecnologia', 'juridico', 'rh', 'operacoes'] as const;
/** Lista FECHADA do que um critério pode contar: cada uma tem a sua consulta em contexto.ts. Nada de nome de tabela vindo do dado. */
export const ENTIDADES = [
  'riscos', 'ativos', 'controles_implementados', 'documentos_vigentes', 'atividades_ropa', 'ripd', 'fornecedores', 'treinamentos',
  'auditorias', 'analises_criticas', 'acoes_corretivas', 'partes_interessadas', 'governanca', 'incidentes', 'metricas',
] as const;
export const PEDIDO_TIPOS = ['dpia', 'politica', 'documento', 'excecao', 'tratamento', 'avaliacao_terceiro'] as const;
/** Telas do router (frontend/src/router.js) que um passo pode apontar em "Onde isto vive". */
export const TELAS = [
  'soa', 'risks', 'assets', 'documentos', 'ropa', 'dpia', 'partes', 'vendors', 'training', 'audits', 'capa', 'governance',
  'stakeholders', 'context', 'management-review', 'evidence', 'controls', 'metrics', 'certification', 'titular', 'terceiros',
  'policies-dashboard', 'audit-execution', 'requisitos',
] as const;
/** Teto de caracteres por tipo de campo (o do `notes` antigo era 5.000 para todos juntos). */
export const TETO_CAMPO = { texto: 300, texto_longo: 4000, escolha: 200, multipla: 1000, data: 10 } as const;

export type TipoCampo = (typeof TIPOS_CAMPO)[number];
export type Trilha = (typeof TRILHAS)[number];
export type Entidade = (typeof ENTIDADES)[number];

const idSnake = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const curto = (max: number) => z.string().trim().min(1).max(max);

export const campoSchema = z.strictObject({
  id: idSnake,
  rotulo: curto(200),
  tipo: z.enum(TIPOS_CAMPO),
  obrigatorio: z.boolean(),
  exemplo: z.string().trim().max(400),
  ajuda: curto(300).optional(),
  opcoes: z.array(curto(120)).min(2).max(12).optional(),
  pergunta: z.string().regex(/^p\d{1,2}_q\d{1,2}$/).optional(),
  semIA: z.boolean().optional(),
}).refine((c) => (c.tipo === 'escolha' || c.tipo === 'multipla') === (c.opcoes !== undefined), {
  message: 'opcoes existe se e só se o campo é escolha ou multipla',
});

const rotulo = curto(160);
export const criterioSchema = z.discriminatedUnion('tipo', [
  z.strictObject({ tipo: z.literal('campos_preenchidos'), rotulo, campos: z.array(idSnake).min(1).optional() }),
  z.strictObject({ tipo: z.literal('evidencia_anexada'), rotulo }),
  z.strictObject({ tipo: z.literal('registro_vinculado'), rotulo, entidade: z.enum(ENTIDADES), minimo: z.number().int().min(1).max(1000) }),
  z.strictObject({ tipo: z.literal('pedido_de_aprovacao'), rotulo, pedidoTipo: z.enum(PEDIDO_TIPOS), situacao: z.enum(['aberto', 'aprovado', 'qualquer']) }),
  z.strictObject({ tipo: z.literal('entrevistas_concluidas'), rotulo, trilhas: z.array(z.enum(TRILHAS)).min(1) }),
  z.strictObject({ tipo: z.literal('responsavel_e_prazo'), rotulo }),
]);

export const passoSchema = z.strictObject({
  id: z.string().regex(/^p\d{1,2}_\d{1,2}$/),
  fase: z.number().int().min(0).max(40),
  ordem: z.number().int().min(1).max(20),
  titulo: curto(120),
  clausula: curto(60),
  porQue: curto(600),
  campos: z.array(campoSchema).min(1).max(8),
  prova: z.strictObject({ descricao: curto(300), obrigatoria: z.boolean(), aceita: z.enum(['arquivo', 'documento_gerado', 'ambos']) }),
  ondeVive: z.array(z.strictObject({ tela: z.enum(TELAS), rotulo: curto(80) })).max(3),
  concluidoQuando: z.array(criterioSchema).min(1).max(5),
  gera: z.literal('documento').optional(),
}).superRefine((p, ctx) => {
  const erro = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (p.id.split('_')[0] !== `p${p.fase}`) erro(`o id ${p.id} não é da fase ${p.fase}`);
  const ids = p.campos.map((c) => c.id);
  if (new Set(ids).size !== ids.length) erro('ids de campo repetidos');
  const primeiro = p.concluidoQuando[0];
  if (primeiro.tipo !== 'campos_preenchidos') erro('o primeiro critério deve ser campos_preenchidos');
  else if (primeiro.campos?.some((c) => !ids.includes(c))) erro('campos_preenchidos cita campo que o passo não tem');
  if (p.prova.obrigatoria && !p.concluidoQuando.some((c) => c.tipo === 'evidencia_anexada')) erro('prova obrigatória exige o critério evidencia_anexada');
});

export const etapaSchema = z.strictObject({
  id: z.number().int().min(1).max(6), nome: curto(80), resumo: curto(200), fases: z.array(z.number().int().min(0).max(40)).min(1),
});
export const faseSchema = z.strictObject({
  numero: z.number().int().min(0).max(40), etapa: z.number().int().min(1).max(6), titulo: curto(80), clausula: z.string().trim().max(60), objetivo: curto(500),
});
export const catalogoSchema = z.strictObject({
  versao: z.string(), etapas: z.array(etapaSchema), fases: z.array(faseSchema), passos: z.array(passoSchema),
});

export type Campo = z.infer<typeof campoSchema>;
export type Criterio = z.infer<typeof criterioSchema>;
export type Passo = z.infer<typeof passoSchema>;
export type EtapaDoCatalogo = z.infer<typeof etapaSchema>;
export type FaseDoCatalogo = z.infer<typeof faseSchema>;
export type Catalogo = z.infer<typeof catalogoSchema>;
