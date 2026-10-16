import { lerCiclo, ETAPAS_CICLO } from '../ciclo';
import type { EstadoEtapa } from './tipos';

/**
 * Situação de cada etapa do Tratamento de Dados. PR1: lida do ciclo da F3 (`registrada` conta como concluída, `nao_aplicavel` como tal, sem
 * linha é pendente). PR2: o pacote A2 troca o corpo pela derivação por etapa (spec 5) sem mudar a assinatura.
 */
export async function estadoDasEtapas(db: D1Database, projectId: string, ropaId: string): Promise<EstadoEtapa[]> {
  const ciclo = (await lerCiclo(db, projectId, ropaId)) ?? [];
  return ETAPAS_CICLO.map((e) => {
    const l = ciclo.find((x) => x.etapa === e.id);
    const situacao = l?.situacao === 'registrada' ? 'concluida' : l?.situacao === 'nao_aplicavel' ? 'nao_aplicavel' : 'pendente';
    return { etapa: e.id, situacao, faltas: situacao === 'pendente' ? ['etapa ainda não respondida'] : [] };
  });
}
