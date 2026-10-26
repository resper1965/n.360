import { z } from 'zod';
import { CANAIS_PEDIDO, STATUS_PEDIDO, TIPOS_PEDIDO } from '../services/titular-pedidos';
import { RISCOS } from '../services/incidentes';
import { PERGUNTAS_IMPORTAVEIS } from '../services/impacto';
import { IDS_ETAPAS } from '../services/ciclo';

/**
 * Importação de programa de privacidade (n.privacy, fatias 1 a 4). O que o agente propõe só chega ao banco por este esquema:
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
  dados_sensiveis: z.boolean().nullish(),
  criancas_adolescentes: z.boolean().nullish(),
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

/**
 * Fatia 3: documento proposto (um por arquivo). O texto inteiro do arquivo vira a versão em rascunho; daqui só sai o que a revisão
 * decide: título, tipo (o da tabela `documentos`) e um resumo para quem revisa.
 */
export const documentoPropostoSchema = z.object({
  titulo: z.string().trim().min(1).max(300),
  tipo: z.enum(['politica', 'norma', 'procedimento']).nullish(),
  resumo: z.string().trim().max(2000).nullish(),
}).strict();
export type DocumentoProposto = z.infer<typeof documentoPropostoSchema>;
export const OBRIGATORIOS_DOCUMENTO = ['titulo', 'tipo'] as const;

/** Fatia 3: DPIA ou LIA proposta (a entidade do item diz qual). `tratamento` é a finalidade, casada com o RoPA pelo nome normalizado. */
const longo = z.string().trim().max(2000).nullish();
export const avaliacaoPropostaSchema = z.object({
  tratamento: z.string().trim().min(1).max(500),
  conclusao: longo,
  riscos: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  // F6: as seções do RIPD e da LIA do legado (todas opcionais; o arquivo só com conclusão e riscos continua valendo).
  necessidade: longo,
  medidas: longo,
  risco_residual: z.enum(['baixo', 'medio', 'alto']).nullish(),
  finalidade_legitima: longo,
  balanceamento: longo,
  salvaguardas: longo,
  // As 23 perguntas da LIA do legado (migration 0084), opcionais e todas texto livre; ids = `src/data/lia-perguntas.ts`. Só a LIA as grava.
  finalidades: longo,
  beneficios_empresa: longo,
  beneficios_terceiros: longo,
  relevancia_beneficios: longo,
  consequencias_nao_tratamento: longo,
  regulamentacoes_setoriais: longo,
  aspecto_antietico: longo,
  tratamento_necessario: longo,
  tratamento_proporcional_finalidade: longo,
  finalidade_sem_dados: longo,
  finalidade_menos_dados: longo,
  finalidade_menos_danosa: longo,
  dados_sensiveis: longo,
  relacao_formal: longo,
  tratamento_anterior: longo,
  coleta_direta: longo,
  ciencia_coleta_terceiros: longo,
  tempo_desde_coleta: longo,
  mudanca_expectativa_titular: longo,
  tecnicas_adequadas: longo,
  tratamento_inovador: longo,
  registro_expectativa_original: longo,
  registro_ciencia_titulares: longo,
}).strict();
export type AvaliacaoProposta = z.infer<typeof avaliacaoPropostaSchema>;
export const OBRIGATORIOS_AVALIACAO = ['tratamento', 'conclusao', 'riscos'] as const;

/**
 * Fatia 4: histórico operacional. Dado pessoal mínimo: nenhum campo de nome, CPF, e-mail ou telefone do titular. `titular_ref` só
 * aceita o pseudônimo que o servidor calcula (HMAC por projeto, `pseudonimizador` em services/importacao.ts), nunca o identificador.
 * `protocolo` é o do registro de origem (vai para a descrição; o protocolo do sistema é gerado na gravação).
 */
export const PSEUDONIMO = /^tit-[0-9a-f]{16}$/;
const pseudonimo = z.string().regex(PSEUDONIMO, 'Use o pseudônimo calculado pelo sistema (tit-...)');
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use AAAA-MM-DD');
const instante = z.string().regex(/^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/, 'Use AAAA-MM-DD ou data e hora ISO');
const protocolo = z.string().trim().max(60).nullish();

export const pedidoPropostoSchema = z.object({
  tipo: z.enum(TIPOS_PEDIDO),
  canal: z.enum(CANAIS_PEDIDO).nullish(),
  recebido_em: dia,
  status: z.enum(STATUS_PEDIDO),
  respondido_em: dia.nullish(),
  protocolo,
  titular_ref: pseudonimo.nullish(),
}).strict();
export type PedidoProposto = z.infer<typeof pedidoPropostoSchema>;
export const OBRIGATORIOS_PEDIDO = ['protocolo'] as const;

export const incidentePropostoSchema = z.object({
  titulo: z.string().trim().min(1).max(300),
  protocolo,
  ciencia_em: instante,
  risco_titular: z.enum(RISCOS).nullish(),
  comunicacao_anpd_em: instante.nullish(),
  comunicacao_titular_em: instante.nullish(),
  status: z.enum(['aberto', 'avaliado', 'comunicado', 'encerrado']),
}).strict();
export type IncidenteProposto = z.infer<typeof incidentePropostoSchema>;
export const OBRIGATORIOS_INCIDENTE = ['protocolo', 'risco_titular'] as const;

/** `tratamento` é a finalidade do RoPA (casada pelo nome normalizado, como DPIA e LIA); `finalidade` é a consentida. */
export const consentimentoPropostoSchema = z.object({
  tratamento: z.string().trim().min(1).max(500),
  titular_ref: pseudonimo,
  finalidade: z.string().trim().min(1).max(500),
  obtido_em: dia,
  revogado_em: dia.nullish(),
  versao_aviso: z.string().trim().max(100).nullish(),
  canal: z.string().trim().max(100).nullish(),
}).strict();
export type ConsentimentoProposto = z.infer<typeof consentimentoPropostoSchema>;
export const OBRIGATORIOS_CONSENTIMENTO = ['versao_aviso'] as const;

/**
 * F6 (importação do legado). `atividade` é a finalidade do tratamento, casada com o RoPA pelo nome normalizado (sem ela, o item é
 * recusado). Responsável é nome de pessoa já cadastrada nas partes e ativo é nome de item; o que não casar vira aviso, nada é criado.
 * Nenhum campo de titular: o texto livre de risco e ação ainda passa por `mascararPii` no servidor.
 */
const atividade = z.string().trim().min(1).max(500);
const nota = z.number().int().min(1).max(5).nullish();
const nomeCurto = z.string().trim().max(200).nullish();

export const riscoPropostoSchema = z.object({
  atividade,
  ameaca: z.string().trim().min(1).max(500),
  vulnerabilidade: texto,
  ativo: nomeCurto,
  impacto: nota,
  probabilidade: nota,
  nivel: z.enum(['baixo', 'medio', 'alto', 'critico']).nullish(),
  estrategia: z.enum(['mitigar', 'aceitar', 'evitar', 'transferir']).nullish(),
  plano: texto,
  impacto_residual: nota,
  probabilidade_residual: nota,
  prazo: dia.nullish(),
  responsavel: nomeCurto,
  status: z.enum(['aberto', 'mitigado', 'aceito', 'fechado']).nullish(),
}).strict();
export type RiscoProposto = z.infer<typeof riscoPropostoSchema>;
export const OBRIGATORIOS_RISCO = ['atividade', 'ameaca', 'impacto', 'probabilidade', 'estrategia'] as const;

export const gapPropostoSchema = z.object({
  atividade,
  titulo: z.string().trim().min(1).max(500),
  descricao: texto,
  prazo: dia.nullish(),
  responsavel: nomeCurto,
  status: z.enum(['aberto', 'em_andamento', 'concluido']).nullish(),
  risco: z.string().trim().max(500).nullish(),
}).strict();
export type GapProposto = z.infer<typeof gapPropostoSchema>;
export const OBRIGATORIOS_GAP = ['atividade', 'titulo', 'prazo', 'responsavel'] as const;

const resposta = z.enum(['sim', 'nao', 'nao_sei']).nullish();
export const impactoPropostoSchema = z.object({
  atividade,
  ...Object.fromEntries(PERGUNTAS_IMPORTAVEIS().map((p) => [p.id, resposta])) as Record<string, typeof resposta>,
}).strict();
export type ImpactoProposto = { atividade: string } & Record<string, 'sim' | 'nao' | 'nao_sei' | null | undefined>;
export const OBRIGATORIOS_IMPACTO = ['atividade'] as const;

export const cicloPropostoSchema = z.object({
  atividade,
  etapa: z.enum(IDS_ETAPAS),
  situacao: z.enum(['registrada', 'nao_aplicavel']),
  item: nomeCurto,
  descricao: texto,
}).strict();
export type CicloProposto = z.infer<typeof cicloPropostoSchema>;
export const OBRIGATORIOS_CICLO = ['atividade', 'etapa', 'situacao'] as const;

/** `adicionais`: texto da base (casado com o catálogo como na fatia 1) ou o id do requisito (`lgpd:art7:ix`). */
export const basesPropostasSchema = z.object({
  atividade,
  adicionais: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  base_gdpr: z.string().trim().max(300).nullish(),
}).strict();
export type BasesPropostas = z.infer<typeof basesPropostasSchema>;
export const OBRIGATORIOS_BASES = ['atividade'] as const;

/** `dados` passa por um dos esquemas aqui; o serviço confere que é o da entidade do item. */
/** Aceitar ou descartar vários itens de uma vez (a gravação continua exigindo "confirmar"). */
export const importacaoItensDecidirSchema = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1).max(200),
  decisao: z.enum(['aceito', 'descartado']),
}).strict();

export const importacaoItemSchema = z.object({
  dados: z.union([tratamentoPropostoSchema, terceiroPropostoSchema, documentoPropostoSchema, avaliacaoPropostaSchema,
    pedidoPropostoSchema, incidentePropostoSchema, consentimentoPropostoSchema, riscoPropostoSchema, gapPropostoSchema, impactoPropostoSchema,
    cicloPropostoSchema, basesPropostasSchema]).optional(),
  decisao: z.enum(['aceito', 'descartado', 'pendente']).optional(),
}).strict().refine((b) => b.dados !== undefined || b.decisao !== undefined, { message: 'Informe dados ou decisao' });
