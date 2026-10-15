import { z } from 'zod';
import { normalizarNome } from '../services/nomes';

export const MODULOS = ['iso', 'privacy'] as const;
export type Modulo = (typeof MODULOS)[number];

/** `organizations.modulos_contratados` é JSON gravado pela rota validada; JSON ruim cai no padrão. */
export function parseModulos(bruto: string | null | undefined): Modulo[] {
  try {
    const v: unknown = JSON.parse(bruto ?? '[]');
    const ok = Array.isArray(v) ? MODULOS.filter((m) => v.includes(m)) : [];
    return ok.length ? ok : ['iso'];
  } catch {
    return ['iso'];
  }
}

export const moduloHabilitarSchema = z.object({ habilitado: z.boolean() });
export const orgModulosSchema = z.object({ modulos: z.array(z.enum(MODULOS)).min(1).max(MODULOS.length) });

export const PAPEIS_VINCULO = ['encarregado', 'dono_processo', 'dono_sistema', 'operador', 'cocontrolador', 'suboperador', 'terceiro', 'responsavel', 'parte_interessada'] as const;
export const ALVOS_VINCULO = ['projeto', 'item', 'departamento', 'tratamento', 'parte'] as const;
export type PapelVinculo = (typeof PAPEIS_VINCULO)[number];
export type AlvoVinculo = (typeof ALVOS_VINCULO)[number];

/** Que papel faz sentido em que alvo. Decisão do plano da fatia 1.1: a spec fixa os dois conjuntos, não o cruzamento. */
export const MATRIZ_PAPEL_ALVO: Record<AlvoVinculo, readonly PapelVinculo[]> = {
  projeto: ['encarregado', 'terceiro', 'operador', 'cocontrolador', 'parte_interessada', 'responsavel'],
  departamento: ['responsavel'],
  parte: ['suboperador'],
  item: ['dono_sistema', 'dono_processo', 'responsavel', 'operador'],
  tratamento: ['operador', 'cocontrolador', 'suboperador', 'terceiro', 'responsavel'],
};

const nome = z.string().trim().min(1).max(200).transform(normalizarNome);
const email = z.string().trim().email().max(320);

export const padronizarNomesSchema = z.object({
  itens: z.array(z.object({ tabela: z.enum(['partes', 'departamentos', 'itens']), id: z.string().min(1).max(100), antes: z.string().max(500) }).strict()).min(1).max(200),
}).strict();

export const departamentoCriarSchema = z.object({ nome });
export const departamentoAtualizarSchema = z.object({ nome: nome.optional(), status: z.enum(['ativo', 'inativo']).optional() });
export const parteCriarSchema = z.object({ tipo: z.enum(['pessoa', 'organizacao']).default('pessoa'), nome, email: email.optional().nullable() });
export const parteAtualizarSchema = z.object({ nome: nome.optional(), email: email.optional().nullable(), status: z.enum(['ativa', 'inativa']).optional() });
export const vinculoCriarSchema = z.object({ papel: z.enum(PAPEIS_VINCULO), alvo_tipo: z.enum(ALVOS_VINCULO), alvo_id: z.string().trim().min(1).max(100) });

// ─── Ligações do tratamento (fatia 4.1) ───────────────────────────────────────
const idCurto = z.string().trim().min(1).max(100);
export const tratamentoItensSchema = z.object({ itens: z.array(idCurto).max(200) }).strict();
export const tratamentoDepartamentosSchema = z.object({ departamentos: z.array(idCurto).max(200) }).strict();
export const tratamentoTransferenciaSchema = z.object({
  pais: z.string().trim().min(1).max(100),
  destinatario_parte_id: idCurto.nullish(),
  mecanismo: z.string().trim().max(300).nullish(),
  observacao: z.string().trim().max(2000).nullish(),
}).strict();

/** LIA (fatia 5): tudo opcional (rascunho parcial); o serviço exige o conjunto para concluir. `.strict()`: campo desconhecido é 400. */
const textoLia = z.string().trim().max(5000).nullable();
export const liaSalvarSchema = z.object({
  finalidade_legitima: textoLia.optional(), necessidade: textoLia.optional(), balanceamento: textoLia.optional(), salvaguardas: textoLia.optional(),
  conclusao: z.enum(['prevalece', 'nao_prevalece']).nullable().optional(),
  status: z.enum(['rascunho', 'concluida']).optional(),
}).strict();

/** Teste de impacto do tratamento (0072): as respostas que vieram (a pergunta é conferida no serviço contra o catálogo) e, opcional, finalizar. */
export const tratamentoImpactoSchema = z.object({
  respostas: z.record(z.string().max(60), z.enum(['sim', 'nao', 'nao_sei'])).refine((r) => Object.keys(r).length <= 40, 'respostas demais'),
  finalizar: z.boolean().optional(),
}).strict();

/** Ciclo de vida da atividade (F3, 0074): as etapas que vieram; campo ausente mantém o gravado (a etapa é conferida também no CHECK). */
export const tratamentoCicloSchema = z.object({
  etapas: z.array(z.object({
    etapa: z.enum(['coleta', 'uso', 'compartilhamento_interno', 'compartilhamento_externo', 'armazenamento', 'eliminacao']),
    situacao: z.enum(['registrada', 'nao_aplicavel']),
    item_id: idCurto.nullish(),
    descricao: z.string().trim().max(1000).nullish(),
  }).strict()).min(1).max(6),
}).strict();

/** Bases legais da atividade (F3, 0074): `adicionais` troca o conjunto; `base_gdpr` é texto livre até o catálogo do GDPR existir. */
export const tratamentoBasesSchema = z.object({
  adicionais: z.array(z.object({ requisito_id: idCurto, observacao: z.string().trim().max(500).nullish() }).strict()).max(20).optional(),
  base_gdpr: z.string().trim().max(300).nullable().optional(),
}).strict();

/**
 * Risco e ação da atividade de tratamento (F2, migration 0073). Criação exige ameaça, impacto e probabilidade; edição é parcial
 * (ausente mantém, null limpa onde a coluna aceita). Nível e residual são calculados no servidor. `.strict()`: `ropa_id`, nível e
 * aceite não vêm do corpo (a atividade é a da rota; o aceite é carimbado pelo servidor).
 */
const nota = z.number().int().min(1, 'Mínimo 1').max(5, 'Máximo 5');
const textoRisco = z.string().trim().max(5000);
const riscoAtividadeCampos = {
  threat: z.string().trim().min(1, 'Ameaça é obrigatória').max(500),
  vulnerability: textoRisco.nullish(),
  asset_id: idCurto.nullish(),
  impact: nota,
  probability: nota,
  treatment: z.enum(['Mitigate', 'Accept', 'Avoid', 'Transfer']),
  treatment_plan: textoRisco.nullish(),
  residual_impact: nota.nullish(),
  residual_probability: nota.nullish(),
  owner_parte_id: idCurto.nullish(),
  control_id: idCurto.nullish(),
  status: z.enum(['Open', 'Mitigated', 'Accepted', 'Closed']),
};
export const riscoAtividadeCriarSchema = z.object({
  ...riscoAtividadeCampos, treatment: riscoAtividadeCampos.treatment.optional(), status: riscoAtividadeCampos.status.optional(),
}).strict();
export const riscoAtividadeAtualizarSchema = z.object(riscoAtividadeCampos).partial().strict();
const acaoAtividadeCampos = {
  title: z.string().trim().min(1, 'Título é obrigatório').max(500),
  description: textoRisco.nullish(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD').nullish(),
  assigned_to_parte_id: idCurto.nullish(),
  status: z.enum(['Open', 'In Progress', 'Closed']),
  risk_id: idCurto.nullish(),
};
export const acaoAtividadeCriarSchema = z.object({ ...acaoAtividadeCampos, status: acaoAtividadeCampos.status.optional() }).strict();
export const acaoAtividadeAtualizarSchema = z.object(acaoAtividadeCampos).partial().strict();

/** Importação do RoPA por planilha (fatia 4.4): o CSV inteiro como texto; as linhas são validadas uma a uma no serviço. */
export const ropaImportarSchema = z.object({ csv: z.string().min(1).max(300_000) }).strict();

/**
 * Parecidos por significado (entrevista do RoPA). Só sistema/arquivo (`item`) e área: nome de pessoa nunca vai ao modelo
 * de embeddings, então `pessoa` não existe aqui e é recusado pelo enum.
 */
/** Copiloto da entrevista do RoPA: só a descrição livre; o contexto (sistemas, áreas, bases) o servidor lê do banco. */
export const copilotoRopaSchema = z.object({ descricao: z.string().trim().min(20).max(2000) }).strict();
export const similaresSchema = z.object({ tipo: z.enum(['item', 'area']), nome: z.string().trim().min(1).max(120) }).strict();

// ─── Terceiros tipificados (fatia 6) ──────────────────────────────────────────
export const terceiroTipoSchema = z.object({ terceiro_tipo: z.enum(['grande_provedor', 'medio', 'pequeno', 'critico']).nullable() }).strict();

/** A evidência vira link na tela: só http(s), nunca `javascript:` nem `data:`. */
const urlWeb = z.string().trim().max(2000).regex(/^https?:\/\/\S+$/i, 'Use um link http ou https');
export const avaliacaoTerceiroSchema = z.object({
  resultado: z.enum(['aprovado', 'com_ressalvas', 'reprovado']),
  valido_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD'),
  evidencia_url: urlWeb.nullish(),
  observacao: z.string().trim().max(2000).nullish(),
}).strict();

// ─── Homologação de fornecedor por questionário (F5) ─────────────────────────────────────────────────────────────
const temaPergunta = z.string().trim().min(1).max(80);
const textoPergunta = z.string().trim().min(1).max(500);
export const homologacaoPerguntaCriarSchema = z.object({ tema: temaPergunta, texto: textoPergunta, ordem: z.number().int().min(0).max(100_000).optional() }).strict();
export const homologacaoPerguntaAtualizarSchema = z.object({
  tema: temaPergunta.optional(), texto: textoPergunta.optional(), ordem: z.number().int().min(0).max(100_000).optional(), ativa: z.boolean().optional(),
}).strict().refine((d) => Object.keys(d).length > 0, 'Informe ao menos um campo');
export const homologacaoCriarSchema = z.object({
  parte_id: z.string().trim().min(1).max(100),
  dias: z.number().int().min(1).max(60).optional(),
  /** Se vier, o link vai por e-mail (o endereço não é gravado). */
  email: z.string().trim().email().max(254).optional(),
}).strict();
export const homologacaoConcluirSchema = z.object({
  resultado: z.enum(['aprovado', 'com_ressalvas', 'reprovado']),
  valido_ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD'),
  observacao: z.string().trim().max(1500).nullish(),
}).strict();
const tokenHomologacao = z.string().min(1).max(200);
const respostasHomologacao = z.record(z.string().min(1).max(200), z.object({
  resposta: z.enum(['sim', 'nao', 'parcial', 'na']),
  justificativa: z.string().trim().max(1000).nullish(),
}).strict()).refine((r) => Object.keys(r).length <= 100, 'No máximo 100 respostas');
export const homologacaoTokenSchema = z.object({ token: tokenHomologacao }).strict();
export const homologacaoRespostasSchema = z.object({ token: tokenHomologacao, respostas: respostasHomologacao }).strict();
export const homologacaoEnviarSchema = z.object({ token: tokenHomologacao, respostas: respostasHomologacao.optional() }).strict();

export const terceiroDocumentoSchema = z.object({
  documento_id: z.string().trim().min(1).max(100),
  papel: z.enum(['dpa', 'contrato', 'outro']).default('dpa'),
}).strict();

// ─── Titular, incidente e consentimento (fatia 7) ─────────────────────────────
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD');
const instante = z.string().regex(/^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/, 'Use AAAA-MM-DD ou data e hora ISO');
const textoCurto = z.string().trim().min(1).max(500);
const textoLongo = z.string().trim().max(5000);
const idParte = z.string().trim().min(1).max(100);

export const parametroLegalSchema = z.object({
  valor: z.number().int().min(1).max(100000),
  unidade: z.enum(['horas', 'dias_corridos', 'dias_uteis']),
  fonte: z.string().trim().min(1).max(1000),
  revisado_em: dia,
  revisado_por: z.string().trim().min(1).max(200),
}).strict();

export const titularPedidoCriarSchema = z.object({
  tipo: z.enum(['confirmacao', 'acesso', 'correcao', 'anonimizacao_bloqueio_eliminacao', 'portabilidade', 'informacao_compartilhamento', 'revogacao_consentimento', 'oposicao', 'outro']),
  canal: z.enum(['email', 'telefone', 'formulario', 'presencial', 'outro']).optional(),
  titular_nome: z.string().trim().max(200).nullish(),
  titular_contato: z.string().trim().max(300).nullish(),
  descricao: textoLongo.nullish(),
  recebido_em: dia.optional(),
  responsavel_parte_id: idParte.nullish(),
}).strict();

export const titularPedidoAtualizarSchema = z.object({
  status: z.enum(['recebido', 'em_andamento', 'respondido', 'negado', 'arquivado']).optional(),
  resposta_texto: textoLongo.nullable().optional(),
  responsavel_parte_id: idParte.nullable().optional(),
  prazo_em: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use AAAA-MM-DD').nullable().optional(),
  descricao: textoLongo.nullable().optional(),
}).strict();

export const incidenteCriarSchema = z.object({
  titulo: textoCurto,
  descricao: textoLongo.nullish(),
  ocorrido_em: instante.nullish(),
  ciencia_em: instante,
  responsavel_parte_id: idParte.nullish(),
}).strict();

export const incidenteRiscoSchema = z.object({
  risco_titular: z.enum(['sem_risco', 'baixo', 'relevante']),
  avaliacao_texto: textoLongo.nullish(),
}).strict();

export const incidenteRascunhoSchema = z.object({ destino: z.enum(['anpd', 'titular']) }).strict();

export const incidenteComunicacaoSchema = z.object({
  destino: z.enum(['anpd', 'titular']),
  em: instante.optional(),
}).strict();

export const consentimentoCriarSchema = z.object({
  ropa_id: idParte,
  titular_ref: textoCurto,
  finalidade: textoCurto,
  versao_aviso: textoCurto,
  obtido_em: dia,
  canal: z.string().trim().max(100).nullish(),
}).strict();
