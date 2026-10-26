import { chave, lerCsv } from './tratamentos-importar';
import { PERGUNTAS_IMPORTAVEIS } from './impacto';
import type { Entidade } from './importacao';
import { PERGUNTAS_LIA } from '../data/lia-perguntas';

/**
 * Modelos de CSV da importação (F6): o caminho DETERMINÍSTICO da migração do legado. Um CSV cujo cabeçalho é exatamente o conjunto de
 * colunas de um modelo (em qualquer ordem, sem acento nem caixa) vira itens propostos SEM passar pela IA; cada linha ainda passa pelo
 * esquema estrito da entidade e por uma pessoa antes de gravar. Os nomes de coluna são os campos do esquema (`src/schemas/importacao.ts`).
 * Amostras fictícias em `docs/modelos-importacao/` (`node scripts/importacao-amostra.mjs`).
 *
 * Conversão por coluna: `lista` separa por `|`; `bool` aceita sim/não; `nota` vira número; `dia` aceita AAAA-MM-DD ou DD/MM/AAAA;
 * `opcao` normaliza como a chave (sem acento, minúsculas, `_`: "Em andamento" vira `em_andamento`). Célula vazia fica de fora.
 */
type Conversao = 'texto' | 'lista' | 'bool' | 'nota' | 'dia' | 'opcao';
type TipoArquivoModelo = 'inventario' | 'terceiros' | 'avaliacao' | 'historico';
/** `opcionais`: colunas que o cabeçalho pode ter a mais (todas as `colunas` continuam obrigatórias); sem elas o modelo casa como sempre. */
export type Modelo = { nome: string; entidade: Entidade; tipo: TipoArquivoModelo; colunas: Record<string, Conversao>; opcionais?: Record<string, Conversao> };

const T = 'texto' as const;
export const MODELOS: Modelo[] = [
  {
    nome: 'tratamentos', entidade: 'tratamento', tipo: 'inventario', colunas: {
      finalidade: T, base_legal: T, categorias_dados: T, titulares: T, retencao: T, destinatarios: T, transferencia_internacional: 'bool',
      salvaguardas: T, dpia_requerido: 'bool', dados_sensiveis: 'bool', criancas_adolescentes: 'bool', responsavel: T, sistemas: 'lista',
      areas: 'lista', pessoas: 'lista',
    },
  },
  {
    nome: 'terceiros', entidade: 'terceiro', tipo: 'terceiros', colunas: {
      nome: T, tipo: 'opcao', cnpj: T, contato: T, avaliacao_resultado: 'opcao', avaliacao_valido_ate: 'dia', avaliacao_metodo: T, dpa: T,
      tratamentos: 'lista',
    },
  },
  {
    nome: 'riscos', entidade: 'risco', tipo: 'avaliacao', colunas: {
      atividade: T, ameaca: T, vulnerabilidade: T, ativo: T, impacto: 'nota', probabilidade: 'nota', nivel: 'opcao', estrategia: 'opcao',
      plano: T, impacto_residual: 'nota', probabilidade_residual: 'nota', prazo: 'dia', responsavel: T, status: 'opcao',
    },
  },
  { nome: 'gaps', entidade: 'gap', tipo: 'avaliacao', colunas: { atividade: T, titulo: T, descricao: T, prazo: 'dia', responsavel: T, status: 'opcao', risco: T } },
  { nome: 'impacto', entidade: 'impacto', tipo: 'avaliacao', colunas: { atividade: T, ...Object.fromEntries(PERGUNTAS_IMPORTAVEIS().map((p) => [p.id, 'opcao' as const])) } },
  { nome: 'ciclo', entidade: 'ciclo', tipo: 'avaliacao', colunas: { atividade: T, etapa: 'opcao', situacao: 'opcao', item: T, descricao: T } },
  { nome: 'bases', entidade: 'bases', tipo: 'avaliacao', colunas: { atividade: T, adicionais: 'lista', base_gdpr: T } },
  {
    nome: 'ripd', entidade: 'dpia', tipo: 'avaliacao', colunas: {
      tratamento: T, conclusao: T, riscos: 'lista', necessidade: T, medidas: T, risco_residual: 'opcao',
    },
  },
  {
    nome: 'lia', entidade: 'lia', tipo: 'avaliacao', colunas: {
      tratamento: T, conclusao: T, riscos: 'lista', finalidade_legitima: T, necessidade: T, balanceamento: T, salvaguardas: T,
    },
    // As 12 perguntas do legado (migration 0084): coluna = id da pergunta; as de escolha trazem sim, não ou não sei.
    opcionais: Object.fromEntries(PERGUNTAS_LIA.map((p) => [p.id, p.tipo === 'escolha' ? 'opcao' as const : T])),
  },
  // Pedidos do titular SEM coluna de titular: o modelo não carrega dado pessoal.
  { nome: 'pedidos', entidade: 'titular_pedido', tipo: 'historico', colunas: { tipo: 'opcao', canal: 'opcao', recebido_em: 'dia', status: 'opcao', respondido_em: 'dia', protocolo: T } },
];

/** O modelo cujo cabeçalho é a primeira linha do CSV, ou null (aí o arquivo segue pela IA). */
export function modeloDoCsv(texto: string): Modelo | null {
  const cab = (lerCsv(texto.split(/\r?\n/, 1)[0] ?? '')[0] ?? []).map(chave);
  const conjunto = new Set(cab);
  if (conjunto.size !== cab.length) return null;
  return MODELOS.find((m) => {
    const cols = Object.keys(m.colunas);
    return cols.every((c) => conjunto.has(c)) && cab.every((c) => c in m.colunas || (!!m.opcionais && c in m.opcionais));
  }) ?? null;
}

function converter(v: string, c: Conversao): unknown {
  const t = v.trim();
  if (c === 'lista') return t.split('|').map((x) => x.trim()).filter(Boolean);
  if (c === 'bool') { const k = chave(t); return ['sim', 's', 'true', 'x', '1'].includes(k) ? true : ['nao', 'n', 'false', '0'].includes(k) ? false : t; }
  if (c === 'nota') return /^\d+$/.test(t) ? Number(t) : t;
  if (c === 'dia') { const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return br ? `${br[3]}-${br[2]}-${br[1]}` : t; }
  if (c === 'opcao') return chave(t);
  return t;
}

/** As linhas de dados do CSV, já convertidas para o formato do esquema da entidade (`linha` é o número do registro, sem o cabeçalho). */
export function itensDoModelo(texto: string, m: Modelo): { linha: number; dados: Record<string, unknown> }[] {
  const [cab, ...linhas] = lerCsv(texto);
  const nomes = cab.map(chave);
  return linhas.map((cels, i) => {
    const dados: Record<string, unknown> = {};
    nomes.forEach((n, j) => { if ((cels[j] ?? '').trim()) dados[n] = converter(cels[j], m.colunas[n] ?? m.opcionais![n]); });
    if (m.entidade === 'terceiro') {
      const { avaliacao_resultado: resultado, avaliacao_valido_ate: valido_ate, avaliacao_metodo: metodo } = dados;
      delete dados.avaliacao_resultado; delete dados.avaliacao_valido_ate; delete dados.avaliacao_metodo;
      if (resultado || valido_ate) dados.ultima_avaliacao = { resultado, valido_ate, ...(metodo ? { metodo } : {}) };
    }
    return { linha: i + 1, dados };
  });
}
