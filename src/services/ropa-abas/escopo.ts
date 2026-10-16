import { refForaDoProjeto } from '../../helpers';
import { definirLigacao } from '../tratamentos';
import type { EscopoCorpo } from '../../schemas/ropa-abas';
import { exigirEditavel, falha, type Falha, type Gravado } from './comum';

/** Coluna do corpo → coluna do banco, e se a coluna está no conteúdo congelado do tratamento (spec 4.4). */
const COLUNAS: Record<string, { coluna: string; hash: boolean }> = {
  nome: { coluna: 'nome', hash: false },
  descricao_atividade: { coluna: 'descricao_atividade', hash: false },
  finalidade: { coluna: 'processing_purpose', hash: true },
  volume_mensal: { coluna: 'volume_mensal', hash: false },
  processamento_automatizado: { coluna: 'processamento_automatizado', hash: false },
  owner_parte_id: { coluna: 'owner_parte_id', hash: false },
};

/** Campo ausente mantém; `null` limpa. O nome das colunas vem da lista fixa acima (allowlist), nunca do corpo. */
export async function salvarEscopo(db: D1Database, projectId: string, ropaId: string, _ator: string, corpo: EscopoCorpo): Promise<Falha | Gravado> {
  const ed = await exigirEditavel(db, projectId, ropaId);
  if (!ed.ok) return ed;
  const fora = await refForaDoProjeto(db, projectId, corpo, ['owner_parte_id']);
  if (fora) return falha(400, `${fora} inexistente ou de outro projeto`);

  // Áreas primeiro: se alguma é inválida, nada foi gravado ainda.
  let areasMudaram = false;
  if (corpo.areas_ids) {
    const antes = (await db.prepare('SELECT departamento_id FROM tratamento_departamentos WHERE ropa_id = ? AND project_id = ? ORDER BY departamento_id').bind(ropaId, projectId).all<{ departamento_id: string }>()).results.map((r) => r.departamento_id);
    const r = await definirLigacao(db, projectId, ropaId, 'departamentos', corpo.areas_ids);
    if (!r) return falha(404, 'Registro do RoPA não encontrado');
    if (!r.ok) return falha(400, 'Área inexistente ou de outro projeto', r.invalidos);
    areasMudaram = JSON.stringify([...corpo.areas_ids].sort()) !== JSON.stringify(antes);
  }

  let mudouHash = areasMudaram;
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [campo, def] of Object.entries(COLUNAS)) {
    if (!Object.hasOwn(corpo, campo)) continue;
    const v = (corpo as Record<string, unknown>)[campo];
    if (v === undefined) continue;
    sets.push(`${def.coluna} = ?`);
    binds.push(v ?? null);
    if (def.hash && v !== ed.atividade.processing_purpose) mudouHash = true;
  }
  if (sets.length) {
    await db.prepare(`UPDATE ropa_records SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND project_id = ?`).bind(...binds, new Date().toISOString(), ropaId, projectId).run();
  }
  return { ok: true, mudouHash };
}
