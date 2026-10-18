import { ETAPAS } from '../../schemas/ropa-abas';
import { lerEtapas, situacaoDaEtapa, type DadosDaEtapa } from './etapas';
import type { EstadoEtapa } from './tipos';

const VAZIA = (etapa: DadosDaEtapa['etapa']): DadosDaEtapa => ({
  etapa, naoAplicavel: false, descricao: null, ativos: [], areas: 0, parceiros: 0, titularesDaColeta: [], titularesDaEtapa: [],
  prazo: null, descarte: null, armazenamento: { naoAplicavel: false, ativos: 0 },
});

/**
 * Situação de cada etapa do Tratamento de Dados, DERIVADA do modelo por etapa (spec 5). Registro que não é do projeto: todas
 * pendentes e vazias (a conferência e a ficha não falham por isso).
 */
export async function estadoDasEtapas(db: D1Database, projectId: string, ropaId: string): Promise<EstadoEtapa[]> {
  const etapas = await lerEtapas(db, projectId, ropaId);
  if (!etapas) return ETAPAS.map((e) => situacaoDaEtapa(VAZIA(e)));
  return etapas.map((e) => ({ etapa: e.etapa, situacao: e.situacao, faltas: e.faltas }));
}
