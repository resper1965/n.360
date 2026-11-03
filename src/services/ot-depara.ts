// De-para de planilha do n.ot (L4, spec 2026-11-03 §2). Cabeçalho → campos do ativo: por perfil salvo (mesma assinatura do cabeçalho),
// por proposta da IA (cabeçalho + até 5 linhas, com `mascararPii` por célula e a máscara de rede do ot-ia, P0-7) ou pelo mapa de
// cabeçalho da coleta (`COLUNAS`). Quem confirma o mapeamento é a pessoa; as linhas viram achados em rascunho da sessão documental.
import { z } from 'zod';
import { rateLimitD1, sha256Hex } from '../helpers';
import { chave } from './tratamentos-importar';
import { COLUNAS, valorDaCelula } from './ot-coleta';
import { garantirSemEndereco, mascararParaIa, perguntarIa, perguntarIaItens, RecusaIa, semTokens, type EnvIa } from './ot-ia';
import { mascararPii, temPii } from './rascunhos-privacy';
import { ENDERECO_EM_TEXTO } from './ot-cifra';
import { normalizarEspacos } from './ot-documento';

export const CAMPOS_DEPARA = ['nome', 'ip', 'mac', 'fabricante', 'modelo', 'tipo_dispositivo', 'funcao', 'protocolos_portas', 'firmware_so_versao',
  'no_arciber', 'categoria_arciber', 'firmware_nao_aplicavel', 'zona'] as const;
export type CampoDepara = typeof CAMPOS_DEPARA[number];
/** Índice da coluna em texto ("0", "3") → campo. Coluna ausente é ignorada. */
export type Mapeamento = Record<string, CampoDepara>;
export const TETO_DEPARA = { pessoa: 10, projeto: 30 } as const;

export const assinaturaDoCabecalho = (cab: string[]) => sha256Hex(cab.map(chave).join('|'));

export function mapeamentoPorCabecalho(cab: string[]): Mapeamento {
  const m: Mapeamento = {};
  cab.forEach((c, i) => { const campo = COLUNAS[chave(c)]; if (campo) m[String(i)] = campo as CampoDepara; });
  return m;
}

const PROMPT = `Você mapeia as colunas de uma planilha de inventário de ativos de tecnologia operacional (OT) do setor elétrico para os campos
do inventário do n.ot: ${CAMPOS_DEPARA.join(', ')}. Recebe o cabeçalho (com o índice de cada coluna) e algumas linhas de amostra.
Responda só JSON com colunas: lista de { indice, campo }, um item por coluna, campo null quando a coluna não serve a nenhum campo.
Não use o mesmo campo para duas colunas. Identificadores entre [[ ]] são marcadores: nunca os repita.`;
const JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['colunas'],
  properties: { colunas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['indice', 'campo'],
    properties: { indice: { type: 'integer', minimum: 0 }, campo: { type: ['string', 'null'], enum: [...CAMPOS_DEPARA, null] } } } } },
};

export async function proporMapeamento(env: EnvIa, cab: string[], amostra: string[][]): Promise<{ mapeamento: Mapeamento; origem: 'ia' | 'cabecalho'; aviso?: string }> {
  const esquema = z.object({
    colunas: z.array(z.object({ indice: z.number().int().min(0).max(cab.length - 1), campo: z.enum(CAMPOS_DEPARA).nullable() }).strict()).max(cab.length),
  }).strict();
  const pii = (l: string[]) => l.map((c) => mascararPii(c) ?? '');
  const entrada = JSON.stringify({ cabecalho: pii(cab).map((nome, indice) => ({ indice, nome })), amostra: amostra.slice(0, 5).map(pii) });
  try {
    const s = await perguntarIa(env, PROMPT, entrada, esquema, JSON_SCHEMA);
    const m: Mapeamento = {};
    const usados = new Set<string>();
    for (const { indice, campo } of s.colunas) {
      if (!campo || usados.has(campo) || String(indice) in m) continue;
      usados.add(campo);
      m[String(indice)] = campo;
    }
    return { mapeamento: m, origem: 'ia' };
  } catch (e) {
    if (!(e instanceof RecusaIa)) throw e;
    return { mapeamento: mapeamentoPorCabecalho(cab), origem: 'cabecalho', aviso: e.message };
  }
}

/** Linhas SEM o cabeçalho → objetos brutos (como o corpo da entrada manual). Linha sem nenhum campo mapeado é pulada. */
export function aplicarMapeamento(linhas: string[][], m: Mapeamento): Record<string, unknown>[] {
  return linhas.map((l) => {
    const o: Record<string, unknown> = {};
    for (const [i, campo] of Object.entries(m)) {
      const v = (l[Number(i)] ?? '').trim();
      if (v) o[campo] = valorDaCelula(campo, v);
    }
    return o;
  }).filter((o) => Object.keys(o).length > 0);
}

/** true = dentro do teto. Conta a tentativa nas duas chaves (pessoa e projeto), janela de 1 h. */
export async function tetoDepara(db: D1Database, userId: string, projectId: string): Promise<boolean> {
  const pessoa = await rateLimitD1(db, `ot:depara:pessoa:${userId}`, TETO_DEPARA.pessoa, 3600);
  const projeto = await rateLimitD1(db, `ot:depara:projeto:${projectId}`, TETO_DEPARA.projeto, 3600);
  return pessoa && projeto;
}

const PROMPT_TEXTO = `Você lê um trecho de documento técnico de tecnologia operacional (OT) do setor elétrico e lista os ativos citados
(equipamentos: RTU, IED, CLP, IHM, switch, servidor, gateway...). Para cada ativo: nome, tipo_dispositivo, fabricante, modelo, funcao,
ip, mac, hostname, firmware_so_versao, protocolos_portas (ex.: "DNP3:20000, Modbus:502") e evidencia. Campo sem informação no trecho: null.
evidencia é um trecho COPIADO LITERALMENTE do texto recebido (até 500 caracteres) que cita o ativo. Identificadores entre [[ ]] são
marcadores: em ip, mac e hostname copie o marcador exato; na evidencia podem aparecer como estão no texto; em nenhum outro campo.
Não invente ativos. Responda só JSON: { "itens": [...] }.`;
const LIMITES_ITEM = { nome: 200, tipo_dispositivo: 200, fabricante: 200, modelo: 200, funcao: 500, ip: 100, mac: 100, hostname: 200,
  firmware_so_versao: 200, protocolos_portas: 500 } as const;
const ITEM_TEXTO = z.object({
  ...(Object.fromEntries(Object.entries(LIMITES_ITEM).map(([k, max]) => [k, z.string().max(max).nullable().optional()])) as
    Record<keyof typeof LIMITES_ITEM, z.ZodOptional<z.ZodNullable<z.ZodString>>>),
  evidencia: z.string().min(1).max(500),
}).strict();
const nulo = (max: number) => ({ type: ['string', 'null'], maxLength: max });
const JSON_SCHEMA_TEXTO = {
  type: 'object', additionalProperties: false, required: ['itens'],
  properties: { itens: { type: 'array', maxItems: 50, items: { type: 'object', additionalProperties: false, required: [...Object.keys(LIMITES_ITEM), 'evidencia'],
    properties: { ...Object.fromEntries(Object.entries(LIMITES_ITEM).map(([k, max]) => [k, nulo(max)])), evidencia: { type: 'string', minLength: 1, maxLength: 500 } } } } },
};

/**
 * Achados de ativo sugeridos pela IA a partir dos trechos do documento. Evidência real: o trecho devolvido precisa estar no texto
 * mascarado enviado; a gravada sai sem token, endereço nem dado pessoal. `RecusaIa` propaga (a rota responde 422).
 */
export async function achadosDoTexto(env: EnvIa, trechos: string[]) {
  const itens: { dados: Record<string, unknown>; evidencia: string }[] = [];
  let descartados = 0;
  let trechos_pulados = 0;
  for (const trecho of trechos) {
    const m = mascararParaIa(mascararPii(trecho) ?? '');
    try { garantirSemEndereco(m.texto); } catch (e) { if (!(e instanceof RecusaIa)) throw e; trechos_pulados++; continue; }
    const enviado = normalizarEspacos(m.texto);
    const r = await perguntarIaItens(env, PROMPT_TEXTO, m, ITEM_TEXTO, JSON_SCHEMA_TEXTO, { camposComToken: ['evidencia'] });
    for (const { evidencia, hostname, ...campos } of r) {
      const ev = normalizarEspacos(semTokens(evidencia as string));
      if (!enviado.includes(normalizarEspacos(evidencia as string)) || ENDERECO_EM_TEXTO.test(ev) || temPii(ev)) { descartados++; continue; }
      const dados: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(campos)) {
        const t = typeof v === 'string' ? v.trim() : '';
        if (t) dados[k] = valorDaCelula(k, t);
      }
      // hostname só preenche o nome que faltou; nunca vai para outro campo
      if (!dados.nome && typeof hostname === 'string' && hostname.trim()) dados.nome = hostname.trim();
      itens.push({ dados, evidencia: ev });
    }
  }
  return { itens, descartados, trechos_pulados };
}
