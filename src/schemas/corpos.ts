import { z } from 'zod';
import { dataIso, dataOuInstante, dataOuVazio } from './ropa-abas';

/**
 * Corpos de escrita que eram lidos com `c.req.json()` sem schema (item T3 do
 * plano de fechamento).
 *
 * Regra: o formato que os handlers já aceitavam continua aceito. O schema só
 * recusa tipo errado, texto sem teto e coleção sem limite. Campo que o handler
 * já valida com mensagem própria (`client_name é obrigatório` etc.) fica
 * opcional aqui, para a mensagem existente não mudar. Chave desconhecida é
 * descartada (z.object padrão), nunca repassada ao handler.
 */

const txt = (max: number) => z.string().max(max).optional().nullable();
const num = z.number().finite().optional().nullable();

// ─── projects ───────────────────────────────────────────────────────────────

/** CNPJ só com dígitos, 14, com os dois dígitos verificadores certos (módulo 11 da Receita). */
export function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * ((n - i - 1) % 8 + 2);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/** CNPJ opcional: só dígitos, com os verificadores certos; vazio limpa, ausente não mexe. Vale para a empresa do projeto e para a organização em `partes`. */
export const cnpjCampo = z.string().max(20).nullable().optional()
  .transform((s) => (s === undefined ? undefined : s === null ? null : s.replace(/\D/g, '') || null))
  .refine((d) => d == null || cnpjValido(d), { message: 'CNPJ inválido (confira os dígitos verificadores)' });

/** Texto opcional: aparado, vazio vira null (limpa o campo); ausente fica ausente (não mexe). */
const campo = (max: number) => z.string().max(max).nullable().optional()
  .transform((s) => (s === undefined ? undefined : s === null ? null : s.trim() || null));

/**
 * Cadastro da empresa do projeto (migration 0071). Estrito: chave desconhecida é recusada. SEM CPF de ninguém;
 * o representante entra por nome e cargo, e vira pessoa em `partes` na criação do projeto.
 */
export const empresaSchema = z.object({
  cnpj: cnpjCampo,
  documento_alternativo: campo(100),
  razao_social: campo(300),
  nome_fantasia: campo(300),
  natureza_juridica: campo(200),
  porte: campo(100),
  data_abertura: campo(10).refine((s) => s == null || /^\d{4}-\d{2}-\d{2}$/.test(s), { message: 'Data no formato AAAA-MM-DD' }),
  situacao_cadastral: campo(100),
  cnae_codigo: campo(20),
  cnae_descricao: campo(300),
  setor: campo(200),
  funcionarios: z.number().int().nonnegative().max(10_000_000).nullable().optional(),
  cep: campo(20),
  logradouro: campo(300),
  numero: campo(30),
  complemento: campo(200),
  bairro: campo(200),
  municipio: campo(200),
  uf: campo(2).transform((s) => (s ? s.toUpperCase() : s)).refine((s) => s == null || /^[A-Z]{2}$/.test(s), { message: 'UF com 2 letras' }),
  pais: campo(60),
  telefone: campo(40),
  email: campo(320).refine((s) => s == null || z.email().safeParse(s).success, { message: 'E-mail inválido' }),
  site: campo(500),
  representante_nome: campo(200),
  representante_cargo: campo(200),
}).strict();
export type EmpresaCorpo = z.output<typeof empresaSchema>;

/** Pessoas-chave da criação do projeto: viram partes (o DPO, com o vínculo `encarregado`). Sem CPF. */
export const pessoasChaveSchema = z.object({
  representante: z.object({ nome: z.string().trim().min(1).max(200), cargo: z.string().trim().max(200).optional().nullable() }).strict().optional(),
  dpo: z.object({ nome: z.string().trim().min(1).max(200), email: z.union([z.email().max(320), z.literal('')]).optional().nullable() }).strict().optional(),
  /** Canal do titular (0117, decisão 7 da spec do canal): SÓ o e-mail (o link do portal e as páginas não entram por aqui). Só com o n.privacy no projeto. */
  canal_titular: z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(200)) }).strict().optional(),
}).strict();

export const projetoCriarSchema = z.object({
  project_name: txt(500),
  client_name: z.string().max(500).optional(),
  sector: txt(500),
  scope: txt(50_000),
  standards: txt(200),
  org_role: txt(200),
  /** Produtos do projeto (n.iso, n.privacy, n.ot), dentro do que a organização contratou. Ausente = tudo o que foi contratado. */
  // Literal: importar `MODULOS` de ./nucleo faria ciclo (nucleo importa `cnpjCampo` daqui); test/modulos-produto.test.ts confere.
  modulos: z.array(z.enum(['iso', 'privacy', 'ot'])).min(1).max(3).optional(),
  /** Cadastro da empresa (o mesmo de `PUT /projects/:id/empresa`). Ausente = só o projeto, como sempre foi. */
  empresa: empresaSchema.optional(),
  pessoas: pessoasChaveSchema.optional(),
});

export const projetoAtualizarSchema = z.object({
  status: z.string().max(50).optional().nullable(),
  project_name: txt(500),
  repository_url: txt(2000),
  repository_token: txt(5000),
  // O handler recusa a presença com mensagem própria; qualquer valor serve.
  standards: z.unknown().optional(),
  scope: txt(50_000),
});

/** Revogação de aprovação (unitária e em lote); `control_ids` só vale no lote. */
export const revogarAprovacaoSchema = z.object({
  role: z.string().max(20).optional(),
  reason: z.string().max(5000).optional(),
  control_ids: z.array(z.string().max(200)).max(1000).optional(),
});

export const reatribuirResponsavelSchema = z.object({
  owner_from: z.string().max(500).optional(),
  owner_to: z.string().max(500).optional(),
});

// ─── assessments ────────────────────────────────────────────────────────────
export const assessmentCriarSchema = z.object({
  client_name: z.string().max(500).optional(),
  lead_id: txt(200),
});

export const assessmentAtualizarSchema = z.object({
  status: z.string().max(50).optional().nullable(),
  client_name: z.string().max(500).optional().nullable(),
});

export const assessmentPrecoSchema = z.object({
  precoFinal: num,
  desconto: num,
  notas: txt(5000),
});

const respostaAssessment = z.object({
  question_key: z.string().max(200),
  question: z.string().max(5000),
  answer: z.union([z.string().max(50_000), z.number(), z.boolean()]),
  complexity_impact: txt(200),
  gap_detected: z.number().int().min(0).max(1).optional().nullable(),
  notes: txt(5000),
});

const blocoAssessment = z.array(respostaAssessment).max(500);

export const assessmentRespostasPublicasSchema = z.object({
  block: z.number().int().min(0).max(100),
  answers: blocoAssessment,
});

export const assessmentBlocoSchema = z.object({ answers: blocoAssessment });

// ─── policies ───────────────────────────────────────────────────────────────
export const documentoGerarSchema = z.object({
  itemId: z.string().min(1).max(200),
  fields: z.record(z.string().max(200), z.union([z.string().max(50_000), z.number(), z.boolean(), z.null()])),
});

// O teto de 2MB do conteúdo é do handler (mensagem própria).
export const documentoAprovarSchema = z.object({
  itemId: z.string().min(1).max(200),
  content: z.string().min(1),
});

// ─── governance ─────────────────────────────────────────────────────────────
export const stakeholderAtualizarSchema = z.object({
  name: txt(500),
  type: txt(500),
  category: txt(500),
  requirements: txt(50_000),
  influence: txt(500),
  communication_method: txt(500),
});

export const revisaoCriarSchema = z.object({
  review_date: dataIso,
  attendees: txt(5000),
});

export const revisaoAtualizarSchema = z.object({
  decisions: txt(50_000),
  action_items: txt(50_000),
  status: txt(50),
  minutes_url: txt(2000),
  attendees: txt(5000),
});

export const metricaCriarSchema = z.object({
  metric_name: z.string().max(500).optional(),
  target_value: num,
  current_value: num,
  frequency: txt(50),
  last_measured_at: z.union([dataOuVazio, dataOuInstante]).optional().nullable(),
  owner: txt(500),
  status: txt(50),
});

export const metricaAtualizarSchema = metricaCriarSchema;
export const cienciaPoliticaSchema = z.object({
  policy_type: z.string().max(200).optional(),
  user_name: z.string().max(500).optional(),
  user_email: z.string().max(320).optional(),
});

// ─── platform / proposals ───────────────────────────────────────────────────
/** Config de precificação: JSON livre, mas tem de ser objeto (nunca array/escalar). */
export const precificacaoConfigSchema = z.record(z.string().max(200), z.unknown());

// ─── evidence ───────────────────────────────────────────────────────────────
export const evidenciaVincularSchema = z.object({
  // `null` desassocia; a presença da chave é checada pelo handler.
  control_id: z.string().max(200).nullable().optional(),
  // Documento VIGENTE a que a evidência se liga; `null` desvincula. O handler
  // confere que existe, é do projeto e está vigente. A ligação é ao DOCUMENTO,
  // não a uma versão fixa (acompanha a versão vigente).
  documento_id: z.string().max(200).nullable().optional(),
});

export const evidenciaTextoSchema = z.object({ text: z.string().optional() });

// PATCH de avaliação: nota (texto; `null` limpa) e/ou veredito do avaliador.
// 'conforming' NÃO entra: conforme é a assinatura do Líder SGSI (assinarEvidencia),
// com autoridade de governança, senha e hash do conteúdo — marcá-lo por PATCH de
// nota driblava essas travas e inflava a cobertura (que conta `conforming` como válido).
// Ligar a evidência a mais um controle do projeto (N:N, migration 0119). Desligar é DELETE .../controles/:controlId.
export const evidenciaControleSchema = z.object({
  control_id: z.string().trim().min(1).max(200),
}).strict();

export const evidenciaAvaliacaoSchema = z.object({
  evaluation_notes: z.string().max(20000).nullable().optional(),
  evaluation_status: z.enum(['pending', 'partial', 'non_conforming']).optional(),
});

export const evidenciaAssinarSchema = z.object({
  // Hash SHA-256 que a tela exibiu; obrigatório (o handler responde 400 depois das checagens de autoridade).
  file_hash: z.string().max(128).optional(),
  password: z.string().max(500).optional(),
  role: z.string().max(20).optional().nullable(),
});

// Aceite do risco residual (migration 0120): a senha de quem aceita, o hash do estado que a tela mostrou e a justificativa opcional.
export const riscoAceiteSchema = z.object({
  senha: z.string().min(1).max(200),
  hash_visto: z.string().regex(/^[0-9a-f]{64}$/),
  justificativa: z.string().trim().max(2000).nullable().optional(),
}).strict();

// Revogar o próprio aceite: a senha de quem aceitou e o motivo, obrigatórios.
export const riscoRevogarAceiteSchema = z.object({
  senha: z.string().min(1).max(200),
  motivo: z.string().trim().min(5).max(2000),
}).strict();

// Alçada de aceite por nível do risco residual: 'ceo' (Direção) ou 'ciso' (Líder SGSI). Nível ausente fica como está.
const papelAlcada = z.enum(['ceo', 'ciso']);
export const riscoAlcadasSchema = z.object({
  alcadas: z.object({ Low: papelAlcada, Medium: papelAlcada, High: papelAlcada, Critical: papelAlcada }).partial().strict(),
}).strict();
