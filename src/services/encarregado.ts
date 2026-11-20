import { listarIncidentes } from './incidentes';
import { listarPedidos } from './titular-pedidos';
import { listarTerceiros } from './terceiros';
import { lacunasDaFonte, resumoDeLacunas } from './requisitos';
import { lerParametros } from './parametros-legais';
import { ehLegitimoInteresse } from './lia';
import { SQL_TITULOS_ADICIONAIS } from './bases';
import { acoesDasAtividades, faixaDePrazo, FAIXAS_PRAZO } from './riscos-atividade';
import { hojeEmSaoPaulo, diaMaisSP } from './hoje';
import { SQL_EVIDENCIA_RUIM } from './evidencia-regras';
import { escopoRopa } from './escopo-itens';
import { resumoDoCanal } from './titular-canal';

/**
 * Núcleo do n.privacy, fatia 8: a visão do encarregado. É CONSULTA sobre as tabelas das fatias anteriores, nunca grava: o que está atrasado
 * ou faltando num projeto, numa chamada só. Bloco sem dado aparece zerado ou "não carregado", sem número inventado.
 */

/**
 * `nivel`, `texto` e `tela` são os de sempre (o menu e a tela antiga leem). Os campos seguintes vieram com o painel de entrada
 * (estudo de 14/10/2026, direção A): `grupo` diz em que bloco de "O que fazer" o item cai (prazo vencido, nesta semana, para
 * planejar), `quando` é o prazo escrito ("Venceu em 02/10", "Exigido"), `contexto` traz até dois exemplos, `acao` é o rótulo do
 * botão e `aba`, quando há, a aba da tela de destino.
 */
export type Grupo = 'atraso' | 'semana' | 'plano';
export type Prioridade = { nivel: 'alta' | 'media'; texto: string; tela: string; grupo: Grupo; quando: string; contexto: string; acao: string; aba?: string;
  /** Situação com que a lista de destino abre filtrada (chave fechada de frontend/src/filtro-painel.js; nunca dado). */
  filtro?: string };
type Extra = Omit<Prioridade, 'nivel' | 'texto' | 'tela'>;

/** AAAA-MM-DD → DD/MM. */
export const diaMes = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
/** Até dois exemplos, separados por vírgula; o resto vira "e mais N". */
export const exemplos = (lista: (string | null | undefined)[]) => {
  const v = lista.filter((x): x is string => !!x && !!String(x).trim());
  return v.length <= 2 ? v.join(', ') : `${v.slice(0, 2).join(', ')} e mais ${v.length - 2}`;
};

const hoje = () => hojeEmSaoPaulo();
const n = async (db: D1Database, sql: string, ...binds: unknown[]) => (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;

/** `cliente`: quem pede é papel de cliente; o que é assunto da ness. (catálogo não carregado) sai das prioridades dele. */
export async function visaoDoEncarregado(db: D1Database, projectId: string, { cliente = false } = {}) {
  const dia = hoje();
  const em7 = diaMaisSP(7);
  const [pedidos, incidentes, terceiros, parametros, fontes, encarregados, canal] = await Promise.all([
    listarPedidos(db, projectId), listarIncidentes(db, projectId), listarTerceiros(db, projectId), lerParametros(db),
    db.prepare(`SELECT count(*) AS n FROM requisitos WHERE fonte_id = 'lgpd'`).first<{ n: number }>(),
    db.prepare(`SELECT p.id, p.nome, p.email FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id
                 WHERE v.project_id = ? AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto' AND p.status = 'ativa' ORDER BY p.nome`)
      .bind(projectId).all<{ id: string; nome: string; email: string | null }>().then((r) => r.results),
    resumoDoCanal(db, projectId),
  ]);

  const pedidosAbertos = pedidos.filter((p) => ['recebido', 'em_andamento'].includes(p.status));
  const incidentesAbertos = incidentes.filter((i) => i.status !== 'encerrado');
  const comunicacoes = incidentesAbertos.flatMap((i) => [i.situacao_anpd, i.situacao_titular].filter((s) => i.risco_titular !== 'sem_risco' && s !== 'comunicado'));

  // Tratamentos: contas que dependem de texto livre (legítimo interesse) são feitas aqui, sobre as poucas linhas do projeto.
  // Base legal (F3): a principal, uma adicional ou o texto do GDPR; qualquer uma de legítimo interesse pede a LIA.
  const { results: trat } = await db.prepare(
    `SELECT r.id, r.processing_purpose AS nome, r.legal_basis, r.base_legal_id, r.owner, r.owner_parte_id, r.dpia_required, q.titulo AS base_titulo,
            r.base_gdpr, ${SQL_TITULOS_ADICIONAIS} AS adicionais,
            EXISTS (SELECT 1 FROM dpia_assessments d WHERE d.ropa_id = r.id AND d.project_id = r.project_id) AS tem_dpia,
            EXISTS (SELECT 1 FROM lia_assessments l WHERE l.ropa_id = r.id AND l.project_id = r.project_id) AS tem_lia
       FROM ropa_records r LEFT JOIN requisitos q ON q.id = r.base_legal_id WHERE r.project_id = ? AND COALESCE(r.status, '') <> 'Inactive'`
  ).bind(projectId).all<{ id: string; nome: string; legal_basis: string | null; base_legal_id: string | null; owner: string | null; owner_parte_id: string | null; dpia_required: number | null; base_titulo: string | null; base_gdpr: string | null; adicionais: string | null; tem_dpia: number; tem_lia: number }>();
  const comTerceiroVencido = await n(db,
    `SELECT count(DISTINCT u.ropa_id) AS n FROM (
        SELECT parte_id, alvo_id AS ropa_id FROM parte_vinculos WHERE project_id = ?1 AND alvo_tipo = 'tratamento'
        UNION SELECT parte_id, ropa_id FROM tratamento_externo_parceiros WHERE project_id = ?1) u JOIN partes p ON p.id = u.parte_id
        JOIN ropa_records r ON r.id = u.ropa_id AND r.project_id = ?1 AND COALESCE(r.status, '') <> 'Inactive'
      WHERE p.tipo = 'organizacao' AND p.status = 'ativa'
        AND (SELECT CASE WHEN a.resultado <> 'reprovado' THEN a.valido_ate END FROM avaliacoes_terceiro a WHERE a.parte_id = p.id ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1) < ?2`, projectId, dia);

  const tratamentos = {
    total: trat.length,
    sem_base_legal: trat.filter((t) => !t.base_legal_id && !String(t.legal_basis ?? '').trim() && !t.adicionais && !String(t.base_gdpr ?? '').trim()).length,
    dpia_pendente: trat.filter((t) => t.dpia_required && !t.tem_dpia).length,
    lia_pendente: trat.filter((t) => ehLegitimoInteresse(t.base_titulo, t.legal_basis, t.adicionais, t.base_gdpr) && !t.tem_lia).length,
    sem_responsavel: trat.filter((t) => !t.owner_parte_id && !String(t.owner ?? '').trim()).length,
    com_terceiro_vencido: comTerceiroVencido,
  };

  const lgpdCarregada = (fontes?.n ?? 0) > 0;
  const lacunas = lgpdCarregada ? await lacunasDaFonte(db, projectId, 'lgpd') : [];
  const evidencias = {
    // O mesmo critério da cobertura do Painel (`SQL_EVIDENCIAS`) e da Prontidão: só `conforming` em dia cobre; vencida ou não conforme é a corrigir.
    a_corrigir: await n(db, `SELECT count(*) AS n FROM evidence WHERE project_id = ?1 AND ${SQL_EVIDENCIA_RUIM}`, projectId, dia),
    vencem_em_7_dias: await n(db, `SELECT count(*) AS n FROM evidence WHERE project_id = ?1 AND valido_ate IS NOT NULL AND substr(valido_ate, 1, 10) >= ?2 AND substr(valido_ate, 1, 10) <= ?3`, projectId, dia, em7),
  };

  // Riscos e ações das atividades (F2, 0073): só o que tem ropa_id; risco e CAPA só do n.iso ficam na matriz e na CAPA dele.
  const riscos = {
    altos: await n(db, `SELECT count(*) AS n FROM risks WHERE project_id = ?1${escopoRopa('atividades')} AND risk_level IN ('High', 'Critical') AND COALESCE(status, 'Open') = 'Open'`, projectId),
    acoes_vencidas: await n(db, `SELECT count(*) AS n FROM corrective_actions WHERE project_id = ?1${escopoRopa('atividades')} AND COALESCE(status, 'Open') <> 'Closed' AND due_date IS NOT NULL AND substr(due_date, 1, 10) < ?2`, projectId, dia),
  };

  // Faixas de prazo das ações abertas das atividades (F4): contagem e até 50 itens por faixa, para a tela abrir a lista.
  const abertas = await acoesDasAtividades(db, projectId, { soAbertas: true });
  const acoes_por_prazo = FAIXAS_PRAZO.map((f) => {
    const da = abertas.filter((a) => faixaDePrazo(a.due_date, dia) === f.id);
    return { faixa: f.id, rotulo: f.rotulo, total: da.length, itens: da.slice(0, 50).map((a) => ({ id: a.id, ropa_id: a.ropa_id, atividade: a.atividade, title: a.title, due_date: a.due_date, responsavel: a.responsavel })) };
  });

  const secao = {
    pedidos_titular: {
      abertos: pedidosAbertos.length,
      atrasados: pedidosAbertos.filter((p) => p.situacao_prazo === 'atrasado').length,
      vencem_em_7_dias: pedidosAbertos.filter((p) => p.prazo_em && p.prazo_em.slice(0, 10) >= dia && p.prazo_em.slice(0, 10) <= em7).length,
      // Contador do menu: aberto com prazo já vencido ou até 7 dias à frente (os dois grupos não se cruzam; sem prazo fica de fora).
      exigem_atencao: pedidosAbertos.filter((p) => p.prazo_em && p.prazo_em.slice(0, 10) <= em7).length,
      sem_prazo: pedidosAbertos.filter((p) => p.situacao_prazo === 'sem_prazo').length,
      itens: pedidosAbertos.slice(0, 5).map((p) => ({ id: p.id, protocolo: p.protocolo, tipo: p.tipo, prazo_em: p.prazo_em, situacao_prazo: p.situacao_prazo })),
    },
    incidentes: {
      abertos: incidentesAbertos.length,
      comunicacoes_atrasadas: comunicacoes.filter((s) => s === 'atrasado').length,
      comunicacoes_pendentes: comunicacoes.length,
      sem_avaliacao_de_risco: incidentesAbertos.filter((i) => !i.risco_titular).length,
      itens: incidentesAbertos.slice(0, 5).map((i) => ({ id: i.id, protocolo: i.protocolo, titulo: i.titulo, risco_titular: i.risco_titular, situacao_anpd: i.situacao_anpd, situacao_titular: i.situacao_titular })),
    },
    tratamentos,
    terceiros: {
      total: terceiros.length,
      sem_tipo: terceiros.filter((t) => !t.terceiro_tipo).length,
      pendentes: terceiros.filter((t) => t.terceiro_tipo && (t.situacao === 'pendente' || t.situacao === 'reavaliar')).length,
      vencidos: terceiros.filter((t) => t.situacao === 'vencida').length,
      reprovados: terceiros.filter((t) => t.situacao === 'reprovada').length,
      // Contador do menu: sem tipo (nunca avaliado), pendente, vencido ou reprovado, sem contar duas vezes.
      com_pendencia: terceiros.filter((t) => !t.terceiro_tipo || ['pendente', 'vencida', 'reprovada', 'reavaliar'].includes(t.situacao)).length,
    },
    documentos: { revisao_vencida: await n(db, `SELECT count(*) AS n FROM documentos WHERE project_id = ?1 AND status = 'vigente' AND revisar_ate IS NOT NULL AND substr(revisar_ate, 1, 10) < ?2`, projectId, dia) },
    evidencias,
    riscos,
    acoes_por_prazo,
    lgpd: lgpdCarregada
      ? { carregada: true as const, ...resumoDeLacunas(lacunas) } // o mesmo resumo da tela de Requisitos: o não aplicável fica fora do total
      : { carregada: false as const },
    prazos_legais: { nao_definidos: parametros.filter((p) => !p.definido).map((p) => p.chave) },
  };

  const prioridades: Prioridade[] = [];
  const p = (nivel: Prioridade['nivel'], quantidade: number, texto: (q: number) => string, tela: string, extra: Extra) => { if (quantidade > 0) prioridades.push({ nivel, texto: texto(quantidade), tela, ...extra }); };
  const venceu = (datas: (string | null | undefined)[]) => { const d = datas.filter((x): x is string => !!x).map((x) => x.slice(0, 10)).sort()[0]; return d ? `Venceu em ${diaMes(d)}` : 'Vencido'; };
  const atrasados = pedidosAbertos.filter((x) => x.situacao_prazo === 'atrasado');
  const em7dias = pedidosAbertos.filter((x) => x.prazo_em && x.prazo_em.slice(0, 10) >= dia && x.prazo_em.slice(0, 10) <= em7);
  const comAtraso = incidentesAbertos.filter((i) => i.risco_titular !== 'sem_risco' && (i.situacao_anpd === 'atrasado' || i.situacao_titular === 'atrasado'));
  const terceirosVencidos = terceiros.filter((t) => t.situacao === 'vencida');
  const acoesVencidas = abertas.filter((a) => faixaDePrazo(a.due_date, dia) === 'vencidas');
  const semBase = (t: (typeof trat)[number]) => !t.base_legal_id && !String(t.legal_basis ?? '').trim() && !t.adicionais && !String(t.base_gdpr ?? '').trim();
  const exigido = (contexto: string, acao: string, aba?: string, filtro?: string): Extra => ({ grupo: 'semana', quando: 'Exigido', contexto, acao, ...(aba ? { aba } : {}), ...(filtro ? { filtro } : {}) });
  const planejar = (contexto: string, acao: string, filtro?: string): Extra => ({ grupo: 'plano', quando: 'Planejar', contexto, acao, ...(filtro ? { filtro } : {}) });
  p('alta', encarregados.length ? 0 : 1, () => 'Nenhum encarregado indicado (LGPD, art. 41)', 'encarregado', exigido('A LGPD exige a indicação do encarregado', 'Indicar o encarregado'));
  // Canal do titular (0117): decisão 3 da spec. Ao menos um meio (o portal ativo conta) é exigido; a página e a conferência, planejar.
  const temMeio = canal.meios.length > 0 || canal.portal_ativo;
  p('alta', temMeio ? 0 : 1, () => 'Canal do titular não registrado', 'titular',
    exigido('Novo no passo 1 da trilha: registre o e-mail, o telefone ou o formulário pelo qual o titular fala com a empresa (LGPD, art. 41)', 'Registrar o canal', 'pedidos'));
  p('media', temMeio && (!canal.divulgado || !canal.conferido_em) ? 1 : 0, () => 'Canal sem página de divulgação ou nunca conferido', 'titular',
    planejar('Registre a página onde o canal e o encarregado estão publicados e confira-a (Res. CD/ANPD 18/2024, arts. 8 e 9)', 'Registrar a divulgação'));
  // Projeto vazio não é projeto em dia: sem inventário e sem catálogo, a lista vazia afirmaria conformidade que ninguém verificou.
  p('alta', tratamentos.total ? 0 : 1, () => 'Nenhum tratamento no RoPA (LGPD, art. 37)', 'ropa', exigido('Importe o programa que já existe ou cadastre a primeira atividade', 'Abrir os tratamentos'));
  p('alta', secao.pedidos_titular.atrasados, (q) => `${q} ${q === 1 ? 'pedido do titular atrasado' : 'pedidos do titular atrasados'}`, 'titular',
    { grupo: 'atraso', quando: venceu(atrasados.map((x) => x.prazo_em)), contexto: exemplos(atrasados.map((x) => `${x.protocolo} (${x.tipo})`)), acao: 'Responder os pedidos', aba: 'pedidos', filtro: 'atrasados' });
  p('alta', secao.incidentes.comunicacoes_atrasadas, (q) => `${q} ${q === 1 ? 'comunicação de incidente atrasada' : 'comunicações de incidente atrasadas'}`, 'titular',
    { grupo: 'atraso', quando: venceu(comAtraso.flatMap((i) => [i.situacao_anpd === 'atrasado' ? i.prazo_anpd_em : null, i.situacao_titular === 'atrasado' ? i.prazo_titular_em : null])),
      contexto: exemplos(comAtraso.map((i) => i.protocolo)), acao: 'Comunicar o incidente', aba: 'incidentes', filtro: 'comunicacao_atrasada' });
  p('alta', secao.incidentes.sem_avaliacao_de_risco, (q) => `${q} ${q === 1 ? 'incidente sem avaliação de risco' : 'incidentes sem avaliação de risco'}`, 'titular',
    exigido(exemplos(incidentesAbertos.filter((i) => !i.risco_titular).map((i) => i.protocolo)), 'Avaliar o risco', 'incidentes', 'sem_avaliacao'));
  p('alta', secao.terceiros.vencidos, (q) => `${q} ${q === 1 ? 'fornecedor com avaliação vencida' : 'fornecedores com avaliação vencida'}`, 'terceiros',
    { grupo: 'atraso', quando: venceu(terceirosVencidos.map((t) => t.ultima_avaliacao?.valido_ate)), contexto: exemplos(terceirosVencidos.map((t) => t.nome)), acao: 'Reavaliar os fornecedores', filtro: 'vencidos' });
  p('alta', secao.tratamentos.dpia_pendente, (q) => `${q} ${q === 1 ? 'tratamento exige DPIA e não tem' : 'tratamentos exigem DPIA e não têm'}`, 'ropa',
    exigido(exemplos(trat.filter((t) => t.dpia_required && !t.tem_dpia).map((t) => t.nome)), 'Criar o RIPD'));
  p('alta', secao.tratamentos.lia_pendente, (q) => `${q} ${q === 1 ? 'tratamento por legítimo interesse sem LIA' : 'tratamentos por legítimo interesse sem LIA'}`, 'ropa',
    exigido(exemplos(trat.filter((t) => ehLegitimoInteresse(t.base_titulo, t.legal_basis, t.adicionais, t.base_gdpr) && !t.tem_lia).map((t) => t.nome)), 'Fazer a LIA'));
  p('alta', riscos.altos, (q) => `${q} ${q === 1 ? 'risco alto ou crítico em aberto nas atividades' : 'riscos altos ou críticos em aberto nas atividades'}`, 'mapa-de-risco',
    exigido('Defina o tratamento de cada risco', 'Tratar os riscos'));
  p('alta', riscos.acoes_vencidas, (q) => `${q} ${q === 1 ? 'ação de atividade com prazo vencido' : 'ações de atividade com prazo vencido'}`, 'ropa',
    { grupo: 'atraso', quando: venceu(acoesVencidas.map((a) => a.due_date)), contexto: exemplos(acoesVencidas.map((a) => a.title)), acao: 'Ver as ações', filtro: 'acoes_vencidas' });
  p('media', secao.pedidos_titular.vencem_em_7_dias, (q) => `${q} ${q === 1 ? 'pedido do titular vence' : 'pedidos do titular vencem'} em até 7 dias`, 'titular',
    { grupo: 'semana', quando: `Até ${diaMes(em7dias.map((x) => String(x.prazo_em).slice(0, 10)).sort().pop())}`, contexto: exemplos(em7dias.map((x) => x.protocolo)), acao: 'Ver os pedidos', aba: 'pedidos', filtro: 'vencem_7_dias' });
  p('media', secao.evidencias.a_corrigir, (q) => `${q} ${q === 1 ? 'evidência vencida ou não conforme' : 'evidências vencidas ou não conformes'}`, 'evidence', planejar('Renove ou substitua o arquivo', 'Renovar as evidências', 'vencidas_ou_nao_conformes'));
  p('media', secao.documentos.revisao_vencida, (q) => `${q} ${q === 1 ? 'documento com revisão vencida' : 'documentos com revisão vencida'}`, 'documentos', planejar('A data de revisão passou', 'Revisar os documentos'));
  p('media', secao.terceiros.pendentes, (q) => `${q} ${q === 1 ? 'fornecedor nunca avaliado ou a reavaliar' : 'fornecedores nunca avaliados ou a reavaliar'}`, 'terceiros',
    planejar(exemplos(terceiros.filter((t) => t.terceiro_tipo && (t.situacao === 'pendente' || t.situacao === 'reavaliar')).map((t) => t.nome)), 'Avaliar os fornecedores', 'pendentes'));
  p('media', secao.tratamentos.sem_base_legal, (q) => `${q} ${q === 1 ? 'tratamento sem base legal' : 'tratamentos sem base legal'}`, 'ropa',
    planejar(exemplos(trat.filter(semBase).map((t) => t.nome)), 'Definir a base legal'));
  p('media', lgpdCarregada || cliente ? 0 : 1, () => 'Catálogo de requisitos LGPD não carregado', 'requisitos', planejar('Sem o catálogo, a cobertura da LGPD não é calculada', 'Abrir a cobertura'));
  if (secao.lgpd.carregada) p('media', secao.lgpd.lacunas ?? 0, (q) => `${q} ${q === 1 ? 'requisito da LGPD sem cobertura' : 'requisitos da LGPD sem cobertura'}`, 'requisitos',
    planejar('Ligue documentos, controles ou evidências aos artigos', 'Ver as lacunas'));
  p('media', secao.prazos_legais.nao_definidos.length, (q) => `${q} ${q === 1 ? 'prazo legal ainda não cadastrado' : 'prazos legais ainda não cadastrados'} (os prazos ficam "não calculados")`, 'titular',
    planejar('O administrador da plataforma cadastra os prazos com a fonte', 'Ver os pedidos'));

  return { gerado_em: new Date().toISOString(), encarregados, canal, prioridades, ...secao };
}
