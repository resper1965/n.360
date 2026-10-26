import { escapeHtml } from '../../helpers';
import { lerEmpresa } from '../empresas';
import { lerImpacto } from '../impacto';
import { listarRiscos } from '../riscos-atividade';
import { lerDadosAtividade } from './conferencia';
import { listarGaps } from './gaps';
import { lerEtapas, type EtapaDetalhe } from './etapas';

const e = (v: unknown) => escapeHtml(String(v ?? ''));
const vazio = (v: unknown) => (String(v ?? '').trim() ? e(v) : '-');
const lista = (itens: string[]) => (itens.length ? `<ul>${itens.map((i) => `<li>${i}</li>`).join('')}</ul>` : '<p>Nada registrado.</p>');
const secao = (titulo: string, corpo: string) => `<section><h2>${e(titulo)}</h2>${corpo}</section>`;
const campo = (rotulo: string, valor: string) => `<div class="campo"><div class="rotulo">${e(rotulo)}</div><div>${valor}</div></div>`;
const PROC: Record<string, string> = { nao: 'Não, não são submetidos.', apoio: 'Sim, como apoio à decisão humana.', decisao: 'Sim, com decisão automatizada.' };
const ESTRATEGIA: Record<string, string> = { Mitigate: 'Mitigar', Accept: 'Aceitar', Avoid: 'Evitar', Transfer: 'Transferir' };
const STATUS_GAP: Record<string, string> = { Open: 'Pendente', 'In Progress': 'Em andamento', Closed: 'Concluído' };
const STATUS_MEDIDA: Record<string, string> = { ativa: 'Ativo', em_implantacao: 'Em implantação', planejada: 'Planejada' };
const SITUACAO_ETAPA: Record<string, string> = { concluida: 'Concluída', pendente: 'Pendente', nao_aplicavel: 'Não aplicável' };

/** As seis etapas do tratamento, com o que cada uma registra (spec 5). Só o que está gravado; o dado sensível aparece marcado. */
function etapasEmHtml(etapas: EtapaDetalhe[]): string {
  return etapas.map((x) => {
    const cab = `<h3>${e(x.rotulo)} (${e(SITUACAO_ETAPA[x.situacao] ?? x.situacao)})</h3>`;
    if (x.nao_aplicavel) return `${cab}<p>Não se aplica a esta atividade.</p>`;
    const titulares = x.titulares.map((t) => `<li>${e(t.nome)}${t.situacao === 'nao_usa' ? ' (dados não usados nesta etapa)' : ''}: ${t.dados.map((d) => (d.sensivel ? `${e(d.nome)} (dado sensível)` : e(d.nome))).join(', ') || '-'}</li>`);
    const ativos = x.ativos.map((a) => `<li>${e(a.nome)}${a.local_armazenamento ? ` (local: ${e(a.local_armazenamento)})` : ''}</li>`);
    const partes = [
      campo('Descrição', vazio(x.descricao)),
      campo('Ativos', ativos.length ? `<ul>${ativos.join('')}</ul>` : '-'),
      ...(x.areas.length ? [campo('Áreas', e(x.areas.map((a) => a.nome).join(', ')))] : []),
      ...(x.parceiros.length ? [campo('Parceiros', e(x.parceiros.map((p) => p.nome).join(', ')))] : []),
      campo('Titulares e dados', titulares.length ? `<ul>${titulares.join('')}</ul>` : '-'),
      ...(x.etapa === 'eliminacao' ? [campo('Prazo', vazio(x.prazo)), campo('Descarte', vazio(x.descarte))] : []),
    ];
    return `${cab}${partes.join('')}`;
  }).join('');
}

/**
 * HTML de impressão da atividade: as nove abas na ordem, autossuficiente (sem script, sem `style=` fora do `<style>` do documento) e
 * com TODO texto escapado. null: a atividade não é do projeto.
 */
export async function montarRelatorio(db: D1Database, projectId: string, ropaId: string): Promise<string | null> {
  const d = await lerDadosAtividade(db, projectId, ropaId);
  if (!d) return null;
  const [empresa, dpo, etapas, medidas, bases, gdpr, impacto, riscos, gaps, logs, transf] = await Promise.all([
    lerEmpresa(db, projectId),
    db.prepare(
      `SELECT p.nome, p.email FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id
        WHERE v.project_id = ? AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto' AND p.status = 'ativa' ORDER BY v.created_at LIMIT 1`
    ).bind(projectId).first<{ nome: string; email: string | null }>(),
    lerEtapas(db, projectId, ropaId),
    db.prepare('SELECT medida, status, descricao FROM tratamento_medidas WHERE ropa_id = ? AND project_id = ? ORDER BY created_at, rowid').bind(ropaId, projectId)
      .all<{ medida: string; status: string; descricao: string | null }>(),
    db.prepare(
      `SELECT q.referencia, q.titulo, b.finalidade FROM tratamento_bases b JOIN requisitos q ON q.id = b.requisito_id
        WHERE b.ropa_id = ? AND b.project_id = ? ORDER BY q.id`
    ).bind(ropaId, projectId).all<{ referencia: string; titulo: string; finalidade: string | null }>(),
    db.prepare('SELECT base, finalidade FROM tratamento_bases_gdpr WHERE ropa_id = ? AND project_id = ? ORDER BY base').bind(ropaId, projectId).all<{ base: string; finalidade: string }>(),
    lerImpacto(db, projectId, ropaId),
    listarRiscos(db, projectId, ropaId),
    listarGaps(db, projectId, ropaId),
    db.prepare(
      `SELECT l.field, l.action, l.created_at, COALESCE(NULLIF(u.name, ''), l.actor) AS nome FROM audit_logs l LEFT JOIN users u ON lower(u.email) = lower(l.actor)
        WHERE l.project_id = ?1 AND ((l.entity_type = 'ropa' AND l.entity_id = ?2) OR l.details LIKE ?3) ORDER BY l.created_at DESC, l.rowid DESC LIMIT 20`
    ).bind(projectId, ropaId, `ROPA ${ropaId}:%`).all<{ field: string | null; action: string; created_at: string; nome: string }>(),
    db.prepare(
      `SELECT t.pais, p.nome AS destinatario, t.mecanismo FROM tratamento_transferencias t LEFT JOIN partes p ON p.id = t.destinatario_parte_id
        WHERE t.ropa_id = ? AND t.project_id = ? ORDER BY t.pais`
    ).bind(ropaId, projectId).all<{ pais: string; destinatario: string | null; mecanismo: string | null }>(),
  ]);

  const cnpj = empresa?.cnpj ? String(empresa.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : null;
  const controlador = [
    d.empresa ? `<strong>Controlador:</strong> ${e(d.empresa)}` : '',
    cnpj ? `CNPJ ${e(cnpj)}` : '',
    dpo ? `<strong>Encarregado:</strong> ${e(dpo.nome)}${dpo.email ? ` (${e(dpo.email)})` : ''}` : '',
  ].filter(Boolean).join('<br>');
  const areas = (() => { try { return (d.areas_json ? JSON.parse(d.areas_json) : []) as { nome: string }[]; } catch { return []; } })();
  const titulo = d.nome || d.finalidade || 'Atividade de tratamento';

  const corpo = [
    secao('Escopo', [
      campo('Finalidade', vazio(d.finalidade)), campo('Descrição da atividade', vazio(d.descricao_atividade)), campo('Volume mensal', vazio(d.volume_mensal)),
      campo('Processamento automatizado', d.processamento_automatizado ? e(PROC[d.processamento_automatizado] ?? d.processamento_automatizado) : '-'),
      campo('Responsável', vazio(d.owner_nome)), campo('Áreas', areas.length ? areas.map((a) => e(a.nome)).join(', ') : '-'),
    ].join('')),
    secao('Tratamento de Dados', etapasEmHtml(etapas ?? [])),
    secao('Agentes de Tratamento', [
      campo('Controlador dos dados', d.papel_controlador ? 'Sim' : 'Não'), campo('Operador dos dados', d.papel_operador ? 'Sim' : 'Não'),
      campo('Transferência internacional', d.international_transfers ? 'Sim' : 'Não'), campo('Salvaguarda', vazio(d.transfer_safeguards)),
      lista(transf.results.map((t) => `${e(t.pais)}${t.destinatario ? `, ${e(t.destinatario)}` : ''}${t.mecanismo ? `, ${e(t.mecanismo)}` : ''}`)),
    ].join('')),
    secao('Medidas de Segurança', lista(medidas.results.map((m) => `${e(m.medida)} (${e(STATUS_MEDIDA[m.status] ?? m.status)})${m.descricao ? `: ${e(m.descricao)}` : ''}`))),
    secao('Base Jurídica', [
      campo('Base legal principal', vazio(d.base_titulo ?? d.legal_basis)),
      lista(bases.results.map((b) => `${e(b.referencia)}, ${e(b.titulo)}${b.finalidade ? `: ${e(b.finalidade)}` : ''}`)),
      d.base_art11_na ? '<p>Dados sensíveis (art. 11): Não Aplicável.</p>' : '',
      gdpr.results.length ? lista(gdpr.results.map((g) => `GDPR, ${e(g.base)}: ${e(g.finalidade)}`)) : '',
    ].join('')),
    secao('Controle de GAPs', gaps?.nao_aplicavel ? '<p>Não Aplicável.</p>' : lista((gaps?.gaps ?? []).map((g) =>
      `${e(g.gap)} (${e(STATUS_GAP[g.status] ?? g.status)}${g.responsavel ? `, ${e(g.responsavel.nome)}` : ''}${g.prazo ? `, até ${e(g.prazo)}` : ''})${g.recomendacao ? `<br>Recomendação: ${e(g.recomendacao)}` : ''}${g.plano_acao ? `<br>Plano de ação: ${e(g.plano_acao)}` : ''}`))),
    secao('Teste de Impacto', [
      campo('Teste finalizado', impacto?.finalizado_em ? 'Sim' : 'Não'),
      campo('Recomendação', e(impacto?.recomendacao.resultado ?? 'incompleto')),
      lista((impacto?.perguntas ?? []).filter((p) => p.resposta).map((p) => `${e(p.texto)}: ${e(p.resposta)}`)),
    ].join('')),
    secao('Riscos', lista(((riscos ?? []) as RiscoLinha[]).map((r) =>
      `IDR ${e(r.idr ?? '-')}: ${e(r.threat)} (nível ${e(r.risk_level)}, ${e(ESTRATEGIA[r.treatment] ?? r.treatment)}${r.residual_level ? `, residual ${e(r.residual_level)}` : ''}${r.treatment_due_date ? `, prazo ${e(r.treatment_due_date)}` : ''})`))),
    secao('Logs ROPA', lista(logs.results.map((l) => {
      const [s, ev] = l.field ? l.field.split(' / ') : ['Escopo', l.action];
      return `${e(s)}: ${e(ev ?? 'Alteração')} · ${e(l.nome)} · ${e(l.created_at)}`;
    }))),
  ].join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Atividade de tratamento - ${e(titulo)}</title>
<style>
  body { font-family: Inter, Arial, sans-serif; color: #0f172a; margin: 2rem; line-height: 1.5; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; } h2 { font-size: 1.05rem; border-bottom: 1px solid #cbd5e1; padding-bottom: .25rem; margin-top: 1.5rem; }
  .campo { margin-bottom: .5rem; } .rotulo { font-size: .75rem; text-transform: uppercase; color: #475569; font-weight: 600; }
  ul { margin: .25rem 0; padding-left: 1.25rem; } @media print { body { margin: 1rem; } section { break-inside: avoid; } }
</style>
</head>
<body>
<h1>${e(titulo)}</h1>
<p>Registro da atividade de tratamento de dados pessoais (art. 37 da LGPD)</p>
${controlador ? `<p>${controlador}</p>` : ''}
${corpo}
</body>
</html>`;
}

type RiscoLinha = { idr: number | null; threat: string; risk_level: string; treatment: string; residual_level: string | null; treatment_due_date: string | null };
