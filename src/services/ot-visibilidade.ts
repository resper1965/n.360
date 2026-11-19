import { modulosDaPessoa, modulosDoProjeto } from '../modulos';

/** Pessoa com o módulo ot na PESSOA e no PROJETO (P0-1); agente e chave de API nunca (P0-2). Falha fechada. ASYNC: use `await`. */
export async function podeVerOt(
  db: D1Database,
  user: { id?: string; role?: string; client_project_id?: string | null; agente?: boolean } | undefined,
  projectId: string,
): Promise<boolean> {
  if (!user || user.agente === true || String(user.id ?? '').startsWith('apikey:')) return false;
  const [pessoa, projeto] = await Promise.all([modulosDaPessoa(db, user), modulosDoProjeto(db, projectId)]);
  return pessoa.includes('ot') && projeto.includes('ot');
}

/** Fragmento SQL constante: tira as linhas de auditoria do n.ot (toda ação do n.ot começa por `ot.`). */
export const SEM_ACAO_OT = " AND action NOT LIKE 'ot.%'";
