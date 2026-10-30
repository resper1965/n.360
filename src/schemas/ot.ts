import { z } from 'zod';
import { normalizarIp, normalizarMac } from '../services/ot-cifra';

// Corpos do inventário do n.ot. Todos `.strict()` (modelo de ameaças P1-3/P0-8): `project_id`, `status`, `verificado_por`,
// `ultima_verificacao_em`, `ip_cifrado`, `ip_hash` e afins no corpo são recusados; o servidor é quem os escreve.

// P0-6: IP ou MAC digitado em campo livre sairia em claro para quem vê mascarado. IPv4, IPv6 (4+ grupos ou `::`) e MAC com `:`, `-` ou `.`.
const ENDERECO = /\b\d{1,3}(\.\d{1,3}){3}\b|\b([0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b|[0-9a-f]{0,4}::[0-9a-f]{0,4}|\b[0-9a-f]{2}([:-][0-9a-f]{2}){5}\b|\b[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}\b/i;
const livre = (max: number, min = 0) => z.string().trim().min(min).max(max).refine((s) => !ENDERECO.test(s), 'Não informe IP nem MAC em campo de texto livre');
const nome = livre(200, 1);
const id = z.string().trim().min(1).max(100);
const opcional = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional();

export const otSiteCriarSchema = z.object({
  nome,
  tipo: z.enum(['subestacao', 'usina', 'centro_operacao', 'outro']).optional(),
  criticidade: opcional(z.enum(['alta', 'media', 'baixa'])),
  localizacao: opcional(livre(500)),
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
    protocolo: z.string().trim().min(1).max(50),
    porta: z.number().int().min(0).max(65535).optional(),
  }).strict()).max(100).optional(),
  // Versão de firmware tem forma de IPv4 ("10.2.0.4"): fica fora da recusa de endereço.
  firmware_so_versao: opcional(z.string().trim().max(200)),
  firmware_nao_aplicavel: z.boolean().optional(),
};
export const otAtivoCriarSchema = z.object({ site_id: id, ...campoAtivo }).strict();
export const otAtivoAtualizarSchema = z.object(campoAtivo).partial().strict();

const campoFluxo = {
  origem_ativo_id: opcional(id),
  origem_zona_id: opcional(id),
  destino_ativo_id: opcional(id),
  destino_zona_id: opcional(id),
  protocolo: opcional(z.string().trim().max(50)),
  porta: opcional(z.number().int().min(0).max(65535)),
  direcao: z.enum(['unidirecional', 'bidirecional']).optional(),
  finalidade: opcional(livre(500)),
  externo: z.boolean().optional(),
  via_vpn: z.boolean().optional(),
};
export const otFluxoCriarSchema = z.object({ site_id: id, ...campoFluxo }).strict();
export const otFluxoAtualizarSchema = z.object(campoFluxo).partial().strict();

export const otAcessoCriarSchema = z.object({ user_id: id, site_id: id }).strict();

/** Revelar IP/MAC (platform_admin): o motivo vai à trilha (`audit_logs.justification`). */
export const otRevelarSchema = z.object({ justificativa: z.string().trim().min(10).max(500) }).strict();
