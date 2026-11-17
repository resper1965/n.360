import { z } from 'zod';
import { normalizarIp, normalizarMac, ENDERECO_EM_TEXTO } from '../services/ot-cifra';
import { temPii } from '../services/rascunhos-privacy';
import { hojeEmSaoPaulo } from '../services/hoje';

// Corpos do inventário do n.ot. Todos `.strict()` (modelo de ameaças P1-3/P0-8): `project_id`, `status`, `verificado_por`,
// `ultima_verificacao_em`, `ip_cifrado`, `ip_hash` e afins no corpo são recusados; o servidor é quem os escreve.

// P0-6: IP ou MAC digitado em campo livre sairia em claro para quem vê mascarado (padrão em services/ot-cifra.ts).
// Decisão do dono (2026-11-04): recusa mesmo o falso positivo (item da norma, versão), mas explica o motivo e a saída.
export const RECUSA_ENDERECO = 'O texto tem algo com forma de endereço IP ou MAC (ex.: quatro números separados por ponto). Para não expor dado sensível, campo de texto livre não aceita endereço: registre IP e MAC nos campos próprios do ativo. Se for item da norma ou versão de firmware, troque o último ponto por hífen (ex.: 4.5.1-1).';
const livre = (max: number, min = 0) => z.string().trim().min(min).max(max).refine((s) => !ENDERECO_EM_TEXTO.test(s), RECUSA_ENDERECO);
const nome = livre(200, 1);
const id = z.string().trim().min(1).max(100);
const opcional = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional();

/** CIDR IPv4 (`a.b.c.d/0-32`) ou IPv6 (`x::/0-128`), sem espaços. */
export const faixaCidr = z.string().trim().refine((f) => {
  const [ip, n, ...resto] = f.split('/');
  return resto.length === 0 && /^(0|[1-9]\d{0,2})$/.test(n ?? '') && normalizarIp(ip) !== null && Number(n) <= (ip.includes(':') ? 128 : 32);
}, 'Faixa inválida: use CIDR, como 200.10.0.0/24');

export const otSiteCriarSchema = z.object({
  nome,
  tipo: z.enum(['subestacao', 'usina', 'centro_operacao', 'outro']).optional(),
  criticidade: opcional(z.enum(['alta', 'media', 'baixa'])),
  localizacao: opcional(livre(500)),
  faixas_internas: z.array(faixaCidr).max(50).optional(),
}).strict();
export const otSiteAtualizarSchema = otSiteCriarSchema.partial().strict();

export const otZonaCriarSchema = z.object({
  site_id: id,
  nome,
  nivel_purdue: z.number().int().min(0).max(5),
  tipo: z.enum(['supervisao', 'dmz_operativa', 'corporativa', 'outra']).optional(),
  descricao: opcional(livre(2000)),
}).strict();
export const otZonaAtualizarSchema = otZonaCriarSchema.omit({ site_id: true }).partial().strict();

const campoAtivo = {
  zona_id: opcional(id),
  nome,
  no_arciber: z.boolean().optional(),
  categoria_arciber: opcional(z.enum(['centro_operacao', 'infra_dados_voz', 'ambiente_ons'])),
  tipo_dispositivo: opcional(livre(200)),
  fabricante: opcional(livre(200)),
  modelo: opcional(livre(200)),
  funcao: opcional(livre(500)),
  // Em claro no corpo; o servidor normaliza, cifra e calcula o hash (P0-8).
  ip: opcional(z.string().trim().max(100).refine((s) => normalizarIp(s) !== null, 'IP inválido')),
  mac: opcional(z.string().trim().max(100).refine((s) => normalizarMac(s) !== null, 'MAC inválido')),
  protocolos_portas: z.array(z.object({
    protocolo: livre(50, 1),
    porta: z.number().int().min(0).max(65535).optional(),
  }).strict()).max(100).optional(),
  // Versão de firmware tem forma de IPv4 ("10.2.0.4"): fica fora da recusa de endereço.
  firmware_so_versao: opcional(z.string().trim().max(200)),
  firmware_nao_aplicavel: z.boolean().optional(),
};
export const otAtivoCriarSchema = z.object({ site_id: id, ...campoAtivo }).strict();
export const otAtivoAtualizarSchema = z.object(campoAtivo).partial().strict();

export const campoFluxo = {
  origem_ativo_id: opcional(id),
  origem_zona_id: opcional(id),
  destino_ativo_id: opcional(id),
  destino_zona_id: opcional(id),
  protocolo: opcional(livre(50)),
  porta: opcional(z.number().int().min(0).max(65535)),
  direcao: z.enum(['unidirecional', 'bidirecional']).optional(),
  finalidade: opcional(livre(500)),
  externo: z.boolean().optional(),
  via_vpn: z.boolean().optional(),
};
export const otFluxoCriarSchema = z.object({ site_id: id, ...campoFluxo }).strict();
export const otFluxoAtualizarSchema = z.object(campoFluxo).partial().strict();

export const otAcessoCriarSchema = z.object({ user_id: id, site_id: id }).strict();

/** Revelar IP/MAC e exportar (P1-1): o motivo vai à trilha (`audit_logs.justification`) e ao aviso do Gestor ARCiber, por isso sem IP/MAC. */
const justificativa = livre(500, 10);
export const otRevelarSchema = z.object({ justificativa }).strict();
/** Exportação por site (P1-6): POST para a justificativa não ir no endereço. */
export const otExportarSchema = z.object({ formato: z.enum(['csv', 'xlsx']), site_id: id, justificativa }).strict();

/** Teto de itens por lote (P0-5, P1-5): o mesmo da planilha (5.000 linhas). */
export const TETO_ITENS_LOTE = 5000;
/** Entrada manual em lote: cada item é validado campo a campo na tubulação da coleta (services/ot-coleta.ts), não aqui, para que
 *  um item ruim fique no lote com o erro em vez de derrubar o envio inteiro. */
export const otLoteManualSchema = z.object({ site_id: id, itens: z.array(z.record(z.string(), z.unknown())).min(1).max(TETO_ITENS_LOTE) }).strict();
/** Rejeitar lote: o motivo vai à trilha (`audit_logs.justification`), nunca a `details`. */
export const otLoteRejeitarSchema = z.object({ motivo: livre(500, 3) }).strict();

// Levantamento (spec descoberta operacional, L1): texto livre também recusa CPF, e-mail e telefone; o operador não tem nome.
export const livreSemPii = (max: number, min = 0) => livre(max, min).refine((s) => !temPii(s), 'Não informe CPF, e-mail nem telefone');
/** Recusar item: o motivo é lido por papel mascarado (`desfecho`), por isso sem IP/MAC (via `livre`) nem CPF/e-mail/telefone. */
export const otItemRecusarSchema = z.object({ motivo: livreSemPii(500, 3) }).strict();
/** Base do site: aprovar exige a declaração do Gestor; devolver leva o motivo (mesma regra do recusar item). */
export const otBaseAprovarSchema = z.object({ declaracao: z.literal(true) }).strict();
export const otBaseDevolverSchema = z.object({ motivo: livreSemPii(500, 3) }).strict();
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD');
/** Obra: justificativa sem PII e prazo (a faixa de dias é do serviço, em dias de São Paulo). */
export const otObraSchema = z.object({
  justificativa: livreSemPii(500, 3),
  ate: data.refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Data inexistente'),
}).strict();
export const TETO_ACHADOS_SESSAO = 2000;
const respostaRoteiro = z.object({ resposta: z.enum(['sim', 'nao', 'nao_perguntado']), nota: livreSemPii(500).optional() }).strict();

export const otLevantamentoCriarSchema = z.object({
  site_id: id,
  tipo: z.enum(['entrevista', 'visita', 'documento']),
  realizado_em: data,
  funcao: opcional(livreSemPii(100)),
  turno: opcional(livreSemPii(50)),
  documento_titulo: opcional(livreSemPii(200, 1)),
  documento_data: opcional(data),
  notas: livreSemPii(20000).optional(),
  roteiro: z.record(z.string().max(20), respostaRoteiro).optional(),
}).strict().refine((s) => s.tipo !== 'documento' || !!s.documento_titulo, { message: 'Documento exige o título', path: ['documento_titulo'] });

export const otLevantamentoAtualizarSchema = z.object({
  funcao: opcional(livreSemPii(100)),
  turno: opcional(livreSemPii(50)),
  documento_titulo: opcional(livreSemPii(200, 1)),
  documento_data: opcional(data),
  notas: livreSemPii(20000).optional(),
  roteiro: z.record(z.string().max(20), respostaRoteiro).optional(),
  situacao: z.enum(['aberto', 'encerrado']).optional(),
}).strict();

// `dados` é validado campo a campo por prepararItem (mesmo esquema do ativo); aqui só a forma.
export const otAchadoCriarSchema = z.object({
  entidade: z.enum(['ativo', 'fluxo']).optional(),
  dados: z.record(z.string(), z.unknown()),
  evidencia: livreSemPii(2000, 1),
  pergunta_id: opcional(z.string().min(1).max(20)),
}).strict();
export const otAchadoAtualizarSchema = z.object({
  dados: z.record(z.string(), z.unknown()).optional(),
  evidencia: livreSemPii(2000, 1).optional(),
  situacao: z.enum(['rascunho', 'descartado']).optional(),
  pergunta_id: opcional(z.string().min(1).max(20)),
}).strict();
export const otEnviarAchadosSchema = z.object({ achados: z.array(id).min(1).max(TETO_ACHADOS_SESSAO) }).strict();

/** Validade máxima da chave do agente de coleta (L5). Mora aqui, não em ot-agente.ts, para ot-agente poder importar este arquivo sem ciclo. */
export const VALIDADE_MAX_DIAS = 30;
// Agente de coleta (L5): interruptor do Gestor ARCiber e chave `ot_coleta` (validade em dias, 1..VALIDADE_MAX_DIAS).
export const otAgenteInterruptorSchema = z.object({ ligado: z.boolean() }).strict();
export const otAgenteChaveSchema = z.object({ nome: livreSemPii(100, 1), dias: z.number().int().min(1).max(VALIDADE_MAX_DIAS).optional() }).strict();

/** Cadastro da sonda de rede: nome sem PII e a faixa de onde ela envia (obrigatória). */
export const sensorCriarSchema = z.object({ nome: livreSemPii(80, 1), faixa_origem: faixaCidr }).strict();

/** Desvio (spec n-ot-desvio): tratar exige nota; aceitar exige justificativa e prazo de hoje até 90 dias. Só ids vão à trilha, nota e justificativa ficam na linha. */
export const otDesvioTratarSchema = z.object({ nota: livreSemPii(500, 1) }).strict();
export const PRAZO_MAX_ACEITE_DIAS = 90;
const diaUtc = (d: Date) => d.toISOString().slice(0, 10);
export const otDesvioAceitarSchema = z.object({
  justificativa: livreSemPii(500, 1),
  // dia de calendário real: 2026-13-01 passaria na comparação de texto, e datetime() dele é NULL (o aceite nunca venceria)
  ate: data.refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Data inexistente')
    .refine((v) => v >= diaUtc(new Date()) && v <= diaUtc(new Date(Date.now() + PRAZO_MAX_ACEITE_DIAS * 86_400_000)),
      `Prazo de hoje até ${PRAZO_MAX_ACEITE_DIAS} dias`),
}).strict();

/** Assessment da RO-CB.BR.01: autoavaliação de um item de política (a justificativa exigida fora do "atende" é conferida no serviço e pelo CHECK). */
export const otAvaliacaoSchema = z.object({
  situacao: z.enum(['atende', 'parcial', 'nao_atende', 'nao_se_aplica']),
  justificativa: opcional(livreSemPii(2000)),
  responsavel_id: opcional(id),
  proxima_revisao: opcional(data.refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Data inexistente')
    .refine((v) => v >= hojeEmSaoPaulo(), 'A próxima revisão não pode ser antes de hoje')),
}).strict();
/** Confirmar vale só para a versão que o Gestor viu: o `updated_at` lido na tela. */
export const otAvaliacaoConfirmarSchema = z.object({ updated_at: z.string().trim().min(1).max(40) }).strict();
export const otAvaliacaoEvidenciaSchema = z.object({ evidencia_id: id }).strict();

/** Referência núcleo → OT: exatamente um alvo do núcleo e site e/ou ativo de OT (o desvio entra no PR3). */
export const otReferenciaCriarSchema = z.object({
  risk_id: id.optional(), acao_id: id.optional(), incidente_id: id.optional(),
  ot_site_id: id.optional(), ot_ativo_id: id.optional(),
}).strict().refine((v) => [v.risk_id, v.acao_id, v.incidente_id].filter(Boolean).length === 1, 'Informe exatamente um entre risk_id, acao_id e incidente_id')
  .refine((v) => !!(v.ot_site_id || v.ot_ativo_id), 'Informe ot_site_id e/ou ot_ativo_id');
