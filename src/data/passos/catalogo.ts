import { sha256Hex } from '../../helpers';
import { catalogoSchema, type Campo, type Catalogo, type Passo } from './tipos';
import { ETAPAS } from './etapas';
import { FASES_ETAPA_1, PASSOS_ETAPA_1 } from './etapa-1';
import { FASES_ETAPA_2, PASSOS_ETAPA_2 } from './etapa-2';
import { FASES_ETAPA_3, PASSOS_ETAPA_3 } from './etapa-3';
import { FASES_ETAPA_4, PASSOS_ETAPA_4 } from './etapa-4';
import { FASES_ETAPA_5, PASSOS_ETAPA_5 } from './etapa-5';
import { FASES_ETAPA_6, PASSOS_ETAPA_6 } from './etapa-6';

const montar = (): Catalogo => {
  const passos = [PASSOS_ETAPA_1, PASSOS_ETAPA_2, PASSOS_ETAPA_3, PASSOS_ETAPA_4, PASSOS_ETAPA_5, PASSOS_ETAPA_6]
    .flat().sort((a, b) => a.fase - b.fase || a.ordem - b.ordem);
  const fases = [FASES_ETAPA_1, FASES_ETAPA_2, FASES_ETAPA_3, FASES_ETAPA_4, FASES_ETAPA_5, FASES_ETAPA_6].flat().sort((a, b) => a.numero - b.numero);
  return { versao: '', etapas: ETAPAS, fases, passos };
};

let cache: Catalogo | null = null;
let versao: string | null = null;
let paraTeste: Catalogo | null = null;

/** O catálogo inteiro, validado uma vez por isolate. Um passo inválido derruba o carregamento (falha alta, nunca tela torta). */
export function obterCatalogo(): Catalogo {
  if (paraTeste) return paraTeste;
  if (!cache) cache = catalogoSchema.parse(montar());
  return cache;
}
/** Só para teste: troca o catálogo por um pequeno. `null` volta ao real. */
export function __usarCatalogoDeTeste(c: Catalogo | null): void { paraTeste = c; versao = null; }

export const passoPorId = (id: string): Passo | undefined => obterCatalogo().passos.find((p) => p.id === id);
export const passosDaFase = (fase: number): Passo[] => obterCatalogo().passos.filter((p) => p.fase === fase);

/** Chave de `project_phase_answers` do campo: a do questionário antigo, se ele o substitui; senão `<passo>.<campo>`. */
export const chaveDoCampo = (passo: Passo, campo: Campo): string => campo.pergunta ?? `${passo.id}.${campo.id}`;

/** De uma `question_key` ou `<passo>.<campo>` para o passo e o campo dono dela (para a atividade por passo). */
export function donoDaChave(chave: string): { passo: Passo; campo: Campo } | undefined {
  for (const passo of obterCatalogo().passos) {
    const campo = passo.campos.find((c) => chaveDoCampo(passo, c) === chave);
    if (campo) return { passo, campo };
  }
  return undefined;
}

/** Hash do conteúdo, para o cache do navegador (`versao` no catálogo servido). */
export async function versaoDoCatalogo(): Promise<string> {
  if (!versao) versao = (await sha256Hex(JSON.stringify(obterCatalogo()))).slice(0, 16);
  return versao;
}
