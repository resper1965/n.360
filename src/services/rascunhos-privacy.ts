import { ehEquipeNess, logAudit } from '../helpers';
import { PrivacidadeAgent } from '../agents/privacidade';
import { lerPedido } from './titular-pedidos';
import { lerIncidente } from './incidentes';
import { TELEFONE } from './importacao';

/**
 * Rascunhos de IA do n.privacy (fatia 5.3). Cada função escolhe O QUE vai ao modelo (minimização), valida a saída pelo esquema do
 * agente e devolve a proposta SEM gravar no registro: aplicar é a pessoa, pelas rotas de edição de sempre. A única escrita é a trilha
 * `agente.rascunho`, com o alvo e o modelo, nunca o texto. A trava de produto (faixa `privacy`, projeto e pessoa) é do
 * `projectAccessMiddleware`; aqui é a de papel.
 */

type Falha = { ok: false; status: 403 | 404 | 502; error: string };
const falha = (status: Falha['status'], error: string): Falha => ({ ok: false, status, error });
type Env = { DB: D1Database; AI?: unknown } & Record<string, unknown>;
type Ator = { role?: string; email?: string } | undefined;

/** Equipe da consultoria e o administrador do cliente. O `org_user` lê o registro, mas não pede rascunho. */
export const podePedirRascunho = (user: Ator) => ehEquipeNess(user) || user?.role === 'org_admin';
const NEGADO = falha(403, 'Rascunho de IA é pedido pela equipe da consultoria ou pelo administrador do cliente');

/** Quem chama registra a falha do modelo no log (a rota passa `registraErro`). */
type AoFalhar = (e: unknown) => void;

/**
 * Mascara CPF (com ou sem pontuação), e-mail e telefone BR no texto livre antes de ir ao modelo externo. Telefone pela regra da
 * importação (`TELEFONE`): intervalo de anos e protocolo com hífen não são telefone. CNPJ fica (é da
 * empresa). ponytail: regex, não detector de PII; nome de pessoa no texto livre passa. Upgrade: NER, se o risco pedir.
 */
export function mascararPii(texto: string | null | undefined): string | null {
  if (texto == null) return null;
  return texto
    .replace(/(?<![\d./-])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\d/])/g, '[CPF]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[e-mail]')
    .replace(TELEFONE, '[telefone]');
}

/** Há CPF, e-mail ou telefone no texto? Mesmas regras de `mascararPii` (o levantamento do n.ot recusa em vez de mascarar). */
export const temPii = (texto: string) => mascararPii(texto) !== texto;

/** Chama o agente: modelo fora do ar ou resposta fora do esquema viram 502, sem nada gravado. */
async function consultar<T>(pergunta: () => Promise<{ valor: T | null; modelo: string }>, aoFalhar: AoFalhar): Promise<Falha | { ok: true; valor: T; modelo: string }> {
  let r: { valor: T | null; modelo: string };
  try { r = await pergunta(); } catch (e) { aoFalhar(e); return falha(502, 'A IA não respondeu. Tente de novo; nada foi gravado.'); }
  return r.valor ? { ok: true, valor: r.valor, modelo: r.modelo } : falha(502, 'A IA respondeu fora do formato esperado. Tente de novo; nada foi gravado.');
}
const agente = (env: Env) => new PrivacidadeAgent(env.AI, env.DB, env);
const trilha = (env: Env, ator: Ator, projectId: string, alvo: string, modelo: string) =>
  logAudit(env.DB, 'agente.rascunho', ator?.email || 'system', `${alvo}: rascunho de IA gerado (modelo ${modelo}); nada gravado no registro`, '', '', projectId);

/** Sugestão de base legal, retenção e DPIA. Ao modelo vai só a DESCRIÇÃO do tratamento (sem responsável, sem texto livre de pessoa). */
export async function sugerirTratamento(env: Env, projectId: string, ropaId: string, ator: Ator, aoFalhar: AoFalhar) {
  if (!podePedirRascunho(ator)) return NEGADO;
  const t = await env.DB.prepare(`SELECT processing_purpose, data_categories, data_subjects, recipients, international_transfers FROM ropa_records WHERE id = ? AND project_id = ?`)
    .bind(ropaId, projectId).first<{ processing_purpose: string; data_categories: string | null; data_subjects: string | null; recipients: string | null; international_transfers: number | null }>();
  if (!t) return falha(404, 'Registro do RoPA não encontrado');
  const r = await consultar(() => agente(env).sugerirTratamento({
    finalidade: mascararPii(t.processing_purpose), categorias_de_dados: mascararPii(t.data_categories), titulares: mascararPii(t.data_subjects),
    destinatarios: mascararPii(t.recipients), transferencia_internacional: !!t.international_transfers,
  }), aoFalhar);
  if (!r.ok) return r;
  await trilha(env, ator, projectId, `Tratamento ${ropaId}`, r.modelo);
  return { ok: true as const, sugestao: r.valor };
}

/** Rascunho de resposta ao titular. Ao modelo vão o TIPO e as datas do pedido; nome, contato e descrição do titular ficam de fora. */
export async function rascunharResposta(env: Env, projectId: string, pedidoId: string, ator: Ator, aoFalhar: AoFalhar) {
  if (!podePedirRascunho(ator)) return NEGADO;
  const p = await lerPedido(env.DB, projectId, pedidoId);
  if (!p) return falha(404, 'Pedido não encontrado');
  const r = await consultar(() => agente(env).rascunharResposta({ tipo: p.tipo, recebido_em: p.recebido_em, prazo_em: p.prazo_em, situacao_do_prazo: p.situacao_prazo }), aoFalhar);
  if (!r.ok) return r;
  await trilha(env, ator, projectId, `Pedido ${p.protocolo}`, r.modelo);
  return { ok: true as const, texto: r.valor.texto };
}

type Inc = NonNullable<Awaited<ReturnType<typeof lerIncidente>>>;
type Campo = [rotulo: string, tem: (i: Inc, x: { encarregado: boolean }) => boolean];
const nunca = () => false; // o registro não tem campo para isso: sempre falta, a pessoa completa
const temTexto = (s: string | null | undefined) => !!s && !!s.trim();
const riscos: Campo = ['Riscos e impactos aos titulares', (i) => temTexto(i.avaliacao_texto)];
const ciencia: Campo = ['Data da ciência', (i) => temTexto(i.ciencia_em)];
const natureza: Campo = ['Natureza e categoria dos dados afetados', nunca];
const medidasSeg: Campo = ['Medidas técnicas e de segurança adotadas antes e depois', nunca];
const mitigacao: Campo = ['Medidas para reverter ou mitigar os efeitos', nunca];
const encarregado: Campo = ['Dados do encarregado', (_i, x) => x.encarregado];

/** Conteúdo mínimo da comunicação (Res. CD/ANPD 15/2024): art. 6 para a ANPD, art. 9 para o titular. */
const CAMPOS: Record<'anpd' | 'titular', Campo[]> = {
  anpd: [
    ['Descrição do incidente', (i) => temTexto(i.descricao)], natureza, ['Número de titulares afetados', nunca], medidasSeg, riscos, mitigacao,
    ['Data da ocorrência', (i) => temTexto(i.ocorrido_em)], ciencia, encarregado, ['Identificação do controlador', () => true],
    ['Identificação do operador, quando houver', nunca], ['Total de titulares nas atividades afetadas', nunca],
  ],
  titular: [natureza, medidasSeg, riscos, mitigacao, ciencia, encarregado],
};

/** O que o incidente tem e o que falta, calculado do REGISTRO (nunca do modelo). Atrasada, a comunicação exige o motivo da demora. */
export function camposDaComunicacao(i: Inc, destino: 'anpd' | 'titular', x: { encarregado: boolean }) {
  const presentes: string[] = [], faltando: string[] = [];
  for (const [rotulo, tem] of CAMPOS[destino]) (tem(i, x) ? presentes : faltando).push(rotulo);
  if ((destino === 'anpd' ? i.situacao_anpd : i.situacao_titular) === 'atrasado') faltando.push('Motivo da demora');
  return { presentes, faltando };
}

/** Rascunho da comunicação. Ao modelo vão os fatos do incidente e as listas; o encarregado entra só como "tem ou não" (sem nome nem e-mail). */
export async function rascunharComunicacao(env: Env, projectId: string, incidenteId: string, destino: 'anpd' | 'titular', ator: Ator, aoFalhar: AoFalhar) {
  if (!podePedirRascunho(ator)) return NEGADO;
  const i = await lerIncidente(env.DB, projectId, incidenteId);
  if (!i) return falha(404, 'Incidente não encontrado');
  const [enc, proj] = await Promise.all([
    env.DB.prepare(`SELECT 1 FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id
                     WHERE v.project_id = ? AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto' AND p.status = 'ativa' LIMIT 1`).bind(projectId).first(),
    env.DB.prepare('SELECT client_name FROM projects WHERE id = ?').bind(projectId).first<{ client_name: string }>(),
  ]);
  const campos = camposDaComunicacao(i, destino, { encarregado: !!enc });
  const r = await consultar(() => agente(env).rascunharComunicacao({
    destino: destino === 'anpd' ? 'ANPD' : 'titulares afetados', controlador: proj?.client_name ?? null,
    titulo: mascararPii(i.titulo), descricao: mascararPii(i.descricao), ocorrido_em: i.ocorrido_em, ciencia_em: i.ciencia_em, risco_ao_titular: i.risco_titular,
    avaliacao_do_risco: mascararPii(i.avaliacao_texto), prazo: destino === 'anpd' ? i.prazo_anpd_em : i.prazo_titular_em, ...campos,
  }), aoFalhar);
  if (!r.ok) return r;
  await trilha(env, ator, projectId, `Incidente ${i.protocolo} (comunicação ${destino === 'anpd' ? 'à ANPD' : 'ao titular'})`, r.modelo);
  return { ok: true as const, texto: r.valor.texto, ...campos };
}
