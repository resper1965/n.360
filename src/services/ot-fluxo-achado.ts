// src/services/ot-fluxo-achado.ts
import type { ZodType } from 'zod';
import { campoFluxo } from '../schemas/ot';
import { TETO_LEITURA_OT } from './ot-inventario';
import { temPii } from './rascunhos-privacy';

// Achado de fluxo (spec 2026-11-01, L2). Validação campo a campo pelo MESMO esquema do cadastro de fluxo; pontas só do site da sessão
// (ponta de outro site nunca casa: sem oráculo, P0-5). Confronto pela chave das pontas: novo, confirma ou contradiz (externo/VPN diferente).

export const COLS_FLUXO = ['origem_ativo_id', 'origem_zona_id', 'destino_ativo_id', 'destino_zona_id', 'protocolo', 'porta', 'direcao',
  'finalidade', 'externo', 'via_vpn'] as const;
export interface FluxoExistente { id: string; origem_ativo_id: string | null; origem_zona_id: string | null; destino_ativo_id: string | null;
  destino_zona_id: string | null; direcao: string; externo: number; via_vpn: number; updated_at?: string; [k: string]: unknown }
type Erro = { campo: string; motivo: string };
const FORMA: Record<string, ZodType> = campoFluxo;
const MOTIVO: Record<string, string> = { invalid_type: 'tipo inválido', invalid_value: 'valor fora da lista', invalid_format: 'formato inválido', too_big: 'acima do tamanho', too_small: 'vazio ou abaixo do mínimo' };
const PONTA: Record<string, 'ativos' | 'zonas'> = { origem_ativo_id: 'ativos', destino_ativo_id: 'ativos', origem_zona_id: 'zonas', destino_zona_id: 'zonas' };

export const fluxosDoSite = async (db: D1Database, projectId: string, siteId: string) => (await db.prepare(`SELECT id, ${COLS_FLUXO.join(', ')}, updated_at
  FROM ot_fluxos WHERE project_id = ? AND site_id = ? AND status = 'ativo' LIMIT ${TETO_LEITURA_OT}`).bind(projectId, siteId).all<FluxoExistente>()).results;

export async function pontasDoSite(db: D1Database, projectId: string, siteId: string) {
  const [a, z] = await Promise.all(['ot_ativos', 'ot_zonas'].map((t) => db.prepare(`SELECT id FROM ${t} WHERE project_id = ? AND site_id = ? AND status = 'ativo'
    LIMIT ${TETO_LEITURA_OT}`).bind(projectId, siteId).all<{ id: string }>()));
  return { ativos: new Set(a.results.map((x) => x.id)), zonas: new Set(z.results.map((x) => x.id)) };
}

/** Campo inválido vira erro e não entra em `dados` (como prepararItem). Pontas insuficientes são aviso: achado pode estar incompleto. */
export function prepararFluxo(bruto: Record<string, unknown>, pontas: { ativos: Set<string>; zonas: Set<string> }) {
  const erros: Erro[] = [];
  const dados: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(bruto)) {
    if (!(campo in FORMA)) { erros.push({ campo, motivo: 'campo não aceito' }); continue; }
    const v = FORMA[campo].safeParse(valor);
    if (!v.success) { const i = v.error.issues[0]; erros.push({ campo, motivo: i.code === 'custom' ? i.message : MOTIVO[i.code] ?? 'valor inválido' }); continue; }
    if (v.data === undefined || v.data === null) continue;
    if (PONTA[campo] && !pontas[PONTA[campo]].has(v.data as string)) { erros.push({ campo, motivo: 'não encontrado no site' }); continue; }
    if (typeof v.data === 'string' && temPii(v.data)) { erros.push({ campo, motivo: 'Não informe CPF, e-mail nem telefone' }); continue; }
    dados[campo] = typeof v.data === 'boolean' ? Number(v.data) : v.data;
  }
  for (const lado of ['origem', 'destino']) {
    if (dados[`${lado}_ativo_id`] && dados[`${lado}_zona_id`]) {
      erros.push({ campo: lado, motivo: 'Use ativo ou zona, não os dois' });
      delete dados[`${lado}_zona_id`];
    }
  }
  // Espelha o CHECK de ot_fluxos: interno precisa das duas pontas; externo, de ao menos uma.
  const n = ['origem_ativo_id', 'origem_zona_id', 'destino_ativo_id', 'destino_zona_id'].filter((k) => dados[k]).length;
  if (n < 2 - Number(dados.externo ?? 0)) erros.push({ campo: 'pontas', motivo: 'Informe origem e destino (fluxo externo: ao menos um)' });
  return { dados, erros };
}

const ponta = (d: Record<string, unknown>, lado: string) => String(d[`${lado}_ativo_id`] ?? d[`${lado}_zona_id`] ?? '');
const chaveFluxo = (o: string, d: string) => `o:${o}|d:${d}`;

export function indiceFluxos(fluxos: FluxoExistente[]) {
  const m = new Map<string, FluxoExistente>();
  for (const f of fluxos) {
    const o = ponta(f, 'origem'), d = ponta(f, 'destino');
    m.set(chaveFluxo(o, d), f);
    if (f.direcao === 'bidirecional' && !m.has(chaveFluxo(d, o))) m.set(chaveFluxo(d, o), f);
  }
  return { achar: (x: Record<string, unknown>) => (ponta(x, 'origem') || ponta(x, 'destino')) ? m.get(chaveFluxo(ponta(x, 'origem'), ponta(x, 'destino'))) : undefined };
}

export function confrontarFluxo(d: Record<string, unknown>, idx: ReturnType<typeof indiceFluxos>) {
  const alvo = idx.achar(d);
  if (!alvo) return { confronto: 'novo' as const, alvo_id: null };
  const difere = (['externo', 'via_vpn'] as const).some((k) => d[k] !== undefined && Number(d[k]) !== Number(alvo[k]));
  return { confronto: difere ? 'contradiz' as const : 'confirma' as const, alvo_id: alvo.id };
}
