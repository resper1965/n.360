import { AlignmentType, Document, Footer, Header, HeadingLevel, Packer, Paragraph, type Table } from 'docx';
import { CORPO, TITULO, limpo, logoRun, par, runs, tabela } from './documento-docx';
import { dataBr } from './documento-proposta';
import { lerEmpresa } from './empresas';
import { lerBases, basesEmTexto } from './bases';
import { lerCiclo, cicloEmTexto } from './ciclo';
import { lerImpacto } from './impacto';
import { lerLia, RESULTADO_IMPACTO } from './lia';
import { lerQuestionarioLia } from './lia-questionario';
import { listarRiscos } from './riscos-atividade';
import { aprovacoesDoProjeto } from './documentos';
import { documentoAtual, hashConteudo } from './pedidos';
import { ORG_NESS } from './organizacao';
import { logoComoDataUri } from './logo-org';
import { ESTRATEGIA, NIVEL, STATUS, dataHoraBr, traduz } from './exportacao';
import { lerIncidente } from './incidentes';
import { listarAnalises, lerHistoricoIncidente } from './incidente-analises';
import { listarAcoesDoIncidente } from './incidente-acoes';
import { lerPostmortem } from './incidente-postmortem';

/**
 * RIPD e LIA em Word (F4). Tudo é lido AO VIVO da origem única (pré-preenchimento): a empresa (`empresas`, 0071), o encarregado
 * (`parte_vinculos` papel `encarregado`), a atividade do RoPA, as bases (F3), o ciclo de vida (F3), o teste de impacto (F1) e os riscos
 * da atividade (F2). Nada se copia nem se pergunta de novo. Rascunho sai com "RASCUNHO" no cabeçalho de toda página. A biblioteca
 * escapa o XML; `limpo` tira o caractere de controle que o Word recusa.
 */

export const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
type Bloco = Paragraph | Table;
type Linha = Record<string, unknown>;
type Gerado = { bytes: Uint8Array; nome: string };

const txt = (v: unknown) => (v == null ? '' : String(v)).trim();
const ou = (v: unknown, padrao = 'Não informado') => txt(v) || padrao;
const simNao = (v: unknown) => (v ? 'Sim' : 'Não');
const titulo = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 140 }, children: runs(t, { bold: true, font: TITULO, size: 26, color: '0F172A' }) });
const campos = (linhas: [string, unknown][]) => [tabela([], linhas.map(([r, v]) => [r, ou(v)])), par('')];

/** Nome de arquivo seguro: sem acento, só letras, dígitos e hífen, até 60 caracteres. */
export function nomeArquivo(prefixo: string, texto: unknown): string {
  const base = txt(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return `${prefixo}${base ? `-${base}` : ''}.docx`;
}

/** Controlador e encarregado do projeto: as mesmas fontes do relatório do RoPA. */
async function identificacao(db: D1Database, projectId: string): Promise<Bloco[]> {
  const e = await lerEmpresa(db, projectId);
  const dpo = await db.prepare(
    `SELECT p.nome, p.email FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id
      WHERE v.project_id = ? AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto' AND p.status = 'ativa' ORDER BY v.created_at LIMIT 1`
  ).bind(projectId).first<{ nome: string; email: string | null }>();
  const cnpj = e?.cnpj ? String(e.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : txt(e?.documento_alternativo);
  const endereco = e ? [[e.logradouro, e.numero].filter(Boolean).join(', '), e.complemento, e.bairro, [e.municipio, e.uf].filter(Boolean).join('/'), e.cep]
    .map(txt).filter(Boolean).join(' · ') : '';
  const representante = [e?.representante_nome, e?.representante_cargo].map(txt).filter(Boolean).join(', ');
  return [titulo('Identificação'), ...campos([
    ['Controlador', e?.razao_social], ['CNPJ', cnpj], ['Endereço', endereco], ['Representante legal', representante],
    ['Encarregado', dpo ? `${dpo.nome}${dpo.email ? ` (${dpo.email})` : ''}` : ''],
  ])];
}

/** A atividade do RoPA, as bases, o ciclo, o teste de impacto e os riscos. Sem atividade ligada, nada (o RIPD feito à mão). */
async function atividade(db: D1Database, projectId: string, ropaId: string | null): Promise<{ blocos: Bloco[]; finalidade: string | null }> {
  if (!ropaId) return { blocos: [], finalidade: null };
  const r = await db.prepare('SELECT * FROM ropa_records WHERE id = ? AND project_id = ?').bind(ropaId, projectId).first<Linha>();
  if (!r) return { blocos: [], finalidade: null };
  const [bases, ciclo, impacto, riscos] = await Promise.all([
    lerBases(db, projectId, ropaId), lerCiclo(db, projectId, ropaId), lerImpacto(db, projectId, ropaId), listarRiscos(db, projectId, ropaId),
  ]);
  const principal = bases?.principal ? `${bases.principal.referencia} - ${bases.principal.titulo}` : r.legal_basis;
  const blocos: Bloco[] = [titulo('Atividade de tratamento'), ...campos([
    ['Finalidade', r.processing_purpose], ['Titulares', r.data_subjects], ['Categorias de dados', r.data_categories],
    ['Dados sensíveis (art. 11)', simNao(r.dados_sensiveis)], ['Crianças e adolescentes (art. 14)', simNao(r.criancas_adolescentes)],
    ['Base legal principal', principal], ['Outras bases legais', bases ? basesEmTexto(bases).join('\n') : ''],
    ['Retenção', r.retention_period], ['Destinatários', r.recipients],
    ['Transferência internacional', r.international_transfers ? `Sim${txt(r.transfer_safeguards) ? `. Salvaguarda: ${txt(r.transfer_safeguards)}` : ''}` : 'Não'],
  ])];
  const etapas = cicloEmTexto(ciclo ?? []);
  if (etapas.length) blocos.push(titulo('Ciclo de vida do dado'), ...etapas.map((t) => par(t)));
  if (impacto && impacto.perguntas.some((p) => p.resposta)) {
    const sim = impacto.perguntas.filter((p) => p.resposta === 'sim');
    blocos.push(titulo('Teste de impacto'),
      par(`Resultado: ${RESULTADO_IMPACTO[impacto.recomendacao.resultado]}${impacto.finalizado_em ? `, finalizado em ${dataBr(impacto.finalizado_em)}` : ', não finalizado'}.`),
      ...(sim.length ? [par('Critérios respondidos com sim:'), tabela([], sim.map((p) => [p.texto]))] : [par('Nenhum critério respondido com sim.')]), par(''));
  }
  if (riscos?.length) {
    blocos.push(titulo('Riscos da atividade'), tabela(['Ameaça', 'Nível', 'Estratégia', 'Nível residual', 'Situação'],
      (riscos as Linha[]).map((k) => [txt(k.threat), traduz(NIVEL, k.risk_level), traduz(ESTRATEGIA, k.treatment), traduz(NIVEL, k.residual_level) || '—', traduz(STATUS, k.status || 'Open')])), par(''));
  }
  return { blocos, finalidade: txt(r.processing_purpose) || null };
}

/**
 * A marca da consultoria do projeto, como na capa da proposta: o logo da organização (lido do R2 por `logoComoDataUri`, que só
 * aceita a pasta da própria organização, PNG/JPEG até 200 KB, e cai para sem logo em qualquer falha) ou o nome.
 */
async function marca(db: D1Database, projectId: string, storage?: R2Bucket) {
  const o = await db.prepare('SELECT o.id, o.name, o.logo_chave FROM projects p JOIN organizations o ON o.id = p.org_id WHERE p.id = ?')
    .bind(projectId).first<{ id: string; name: string; logo_chave: string | null }>();
  const nome = !o || o.id === ORG_NESS ? 'ness.' : o.name;
  const logo = o && storage ? logoRun(await logoComoDataUri(storage, o.logo_chave, o.id), nome) : null;
  return logo ? [logo] : runs(nome, { bold: true, font: TITULO, size: 18, color: '0F172A' });
}

async function montar(db: D1Database, projectId: string, o: { nome: string; titulo: string; rascunho: boolean; corpo: Bloco[]; rodape: string }, storage?: R2Bucket): Promise<Gerado> {
  const cab = new Header({ children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [
    ...(await marca(db, projectId, storage)),
    ...(o.rascunho ? runs('   RASCUNHO', { bold: true, font: TITULO, size: 18, color: 'B45309' }) : []),
  ] })] });
  const nota = new Paragraph({ children: runs(o.rodape, { size: 16, color: '8A94A6' }) });
  const doc = new Document({
    title: limpo(o.titulo),
    styles: { default: { document: { run: { font: CORPO, size: 20 } } } },
    sections: [{
      headers: { default: cab },
      footers: { default: new Footer({ children: [nota] }) },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 240 }, children: runs(o.titulo, { bold: true, font: TITULO, size: 40, color: '0F172A' }) }),
        ...(o.rascunho ? [par('RASCUNHO: documento em elaboração, sem aprovação.', { bold: true, color: 'B45309' })] : []),
        ...o.corpo,
      ],
    }],
  });
  return { bytes: await Packer.pack(doc, 'uint8array'), nome: o.nome };
}

/** O RIPD do projeto em Word, ou null se não é do projeto. */
export async function ripdEmWord(db: D1Database, projectId: string, dpiaId: string, storage?: R2Bucket): Promise<Gerado | null> {
  const d = await db.prepare('SELECT * FROM dpia_assessments WHERE id = ? AND project_id = ?').bind(dpiaId, projectId).first<Linha>();
  if (!d) return null;
  const ropaId = typeof d.ropa_id === 'string' ? d.ropa_id : null;
  const [ident, ativ, aprovacoes, atual] = await Promise.all([
    identificacao(db, projectId), atividade(db, projectId, ropaId), aprovacoesDoProjeto(db, projectId, dpiaId, 'dpia'), documentoAtual(db, 'dpia', dpiaId, projectId),
  ]);
  const hash = atual ? (await hashConteudo(atual.conteudo)).slice(0, 8) : '';
  const ap = aprovacoes.get(dpiaId);
  const assinatura = (papel: 'ciso' | 'ceo', direta: unknown) => {
    const p = ap?.[papel];
    if (p) return `Aprovado por ${p.por} em ${dataBr(p.em)} (pedido de aprovação)`;
    return txt(direta) ? `Assinado por ${txt(direta)}` : 'Pendente';
  };
  const status = txt(d.status) || 'Draft';
  const nomeTratamento = txt(d.processing_name) || txt(d.system_name) || ativ.finalidade;
  const corpo: Bloco[] = [
    ...ident, ...ativ.blocos,
    titulo('Avaliação de impacto'), ...campos([
      ['Tratamento ou sistema', nomeTratamento], ['Titulares', d.data_subjects_types], ['Categorias de dados', d.personal_data_categories],
      ['Fluxo de dados', d.data_flow_description], ['Necessidade e proporcionalidade', d.necessity_proportionality],
      ['Riscos identificados', [d.risks_identified, d.data_category_risk].map(txt).filter(Boolean).join('\n')],
      ['Medidas técnicas e de segurança', d.technical_measures], ['Medidas de mitigação e salvaguardas', d.mitigation_measures],
      ['Risco residual', d.residual_risk_level], ['Parecer do encarregado', txt(d.dpo_recommendations) || d.dpo_opinion],
    ]),
    titulo('Aprovação'), ...campos([
      ['Situação', traduz(STATUS, status)],
      ['Líder SGSI', assinatura('ciso', d.dpo_signature)], ['Direção', assinatura('ceo', d.ceo_signature)],
      ['Aprovação do encarregado', txt(d.dpo_approved_by) ? `${txt(d.dpo_approved_by)}${txt(d.dpo_approved_at) ? ` em ${dataBr(txt(d.dpo_approved_at))}` : ''}` : 'Pendente'],
    ]),
  ];
  return montar(db, projectId, {
    nome: nomeArquivo('RIPD', nomeTratamento), titulo: 'Relatório de Impacto à Proteção de Dados Pessoais (RIPD)', rascunho: status !== 'Approved', corpo,
    rodape: `Gerado pelo n.privacy em ${dataBr(new Date().toISOString())}.${hash ? ` Versão do conteúdo: ${hash}.` : ''}`,
  }, storage);
}

const ESCOLHA_LIA: Record<string, string> = { sim: 'Sim', nao: 'Não', nao_sei: 'Não sei agora' };
const CONCLUSAO_LIA: Record<string, string> = { prevalece: 'O legítimo interesse prevalece', nao_prevalece: 'O legítimo interesse não prevalece' };

/** A LIA da atividade em Word, ou null se a atividade não é do projeto ou não tem LIA. */
export async function liaEmWord(db: D1Database, projectId: string, ropaId: string, storage?: R2Bucket): Promise<Gerado | null> {
  const l = await lerLia(db, projectId, ropaId);
  if (!l) return null;
  const [ident, ativ, questionario] = await Promise.all([identificacao(db, projectId), atividade(db, projectId, ropaId), lerQuestionarioLia(db, projectId, ropaId)]);
  const concluida = l.status === 'concluida';
  const corpo: Bloco[] = [
    ...ident, ...ativ.blocos,
    // As 23 perguntas do legado, uma seção por aba (migration 0084); sem resposta aparece o traço de sempre.
    ...(questionario?.abas ?? []).flatMap((a) => [titulo(a.rotulo), ...campos(a.perguntas.map((q): [string, unknown] => [q.texto, q.tipo === 'escolha' && q.resposta ? ESCOLHA_LIA[q.resposta] ?? q.resposta : q.resposta]))]),
    titulo('Teste de legítimo interesse'), ...campos([
      ['Finalidade legítima', l.finalidade_legitima], ['Necessidade', l.necessidade], ['Balanceamento', l.balanceamento],
      ['Salvaguardas', l.salvaguardas], ['Conclusão', l.conclusao ? CONCLUSAO_LIA[l.conclusao] : ''],
    ]),
    titulo('Situação'), ...campos([
      ['Situação', concluida ? 'Concluída' : 'Rascunho'],
      ['Concluída por', concluida ? `${l.concluida_por}${l.concluida_em ? ` em ${dataBr(l.concluida_em)}` : ''}` : 'Pendente'],
    ]),
  ];
  return montar(db, projectId, {
    nome: nomeArquivo('LIA', ativ.finalidade), titulo: 'Teste de Legítimo Interesse (LIA)', rascunho: !concluida, corpo,
    rodape: `Gerado pelo n.privacy em ${dataBr(new Date().toISOString())}. Versão gravada em ${dataBr(l.updated_at)}.`,
  }, storage);
}

/** O texto da versão (Markdown simples) em blocos do Word: títulos `#`, listas `-`/`*`/`1.`, parágrafos. Negrito e itálico saem como texto. */
function markdownEmBlocos(md: string): Bloco[] {
  const out: Bloco[] = [];
  let corrente: string[] = [];
  const fecha = () => { if (corrente.length) out.push(par(corrente.join('\n'))); corrente = []; };
  const sem = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`([^`]+)`/g, '$1');
  for (const bruta of md.replace(/\r\n?/g, '\n').split('\n')) {
    const l = bruta.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(l);
    if (!l.trim()) fecha();
    else if (h) { fecha(); out.push(h[1].length === 1 ? titulo(sem(h[2])) : new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 }, children: runs(sem(h[2]), { bold: true, font: TITULO, size: 22, color: '0F172A' }) })); }
    else if (item) { fecha(); out.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: runs(sem(item[1]), { color: '44506A' }) })); }
    else corrente.push(sem(l));
  }
  fecha();
  return out;
}

const TIPO_DOCUMENTO: Record<string, string> = { politica: 'Política', norma: 'Norma', procedimento: 'Procedimento' };

/**
 * Um documento versionado em Word (a versão vigente; sem vigente, o rascunho mais novo, marcado RASCUNHO), ou null se não é do
 * projeto ou não tem versão. O texto é o da versão gravada, sem reescrita; a aprovação vem dos pedidos (a mesma derivação da tela).
 */
export async function documentoEmWord(db: D1Database, projectId: string, documentoId: string, storage?: R2Bucket): Promise<Gerado | null> {
  const d = await db.prepare('SELECT id, tipo, titulo, revisar_ate FROM documentos WHERE id = ? AND project_id = ?').bind(documentoId, projectId).first<Linha>();
  if (!d) return null;
  const versoes = (await db.prepare(
    `SELECT numero, estado, texto, hash, criado_por, criado_em FROM documento_versoes WHERE documento_id = ? AND project_id = ? ORDER BY numero DESC`
  ).bind(documentoId, projectId).all<Linha>()).results;
  const v = versoes.find((x) => x.estado === 'vigente') ?? versoes.find((x) => x.estado === 'rascunho');
  if (!v) return null;
  const [ident, aprovacoes] = await Promise.all([identificacao(db, projectId), aprovacoesDoProjeto(db, projectId, documentoId, 'documento')]);
  const ap = aprovacoes.get(documentoId);
  const aprov = (papel: 'ciso' | 'ceo') => { const p = ap?.[papel]; return p ? `Aprovado por ${p.por} em ${dataBr(p.em)}` : 'Pendente'; };
  const vigente = v.estado === 'vigente';
  const corpo: Bloco[] = [
    ...ident,
    titulo('Controle do documento'), ...campos([
      ['Tipo', TIPO_DOCUMENTO[txt(d.tipo)] ?? d.tipo], ['Versão', `${v.numero}${vigente ? ' (vigente)' : ' (rascunho)'}`],
      ['Autor da versão', v.criado_por], ['Registrada em', v.criado_em ? dataBr(txt(v.criado_em)) : ''],
      ['Próxima revisão', d.revisar_ate ? dataBr(txt(d.revisar_ate)) : ''],
      ...(vigente ? [['Líder SGSI', aprov('ciso')], ['Direção', aprov('ceo')]] as [string, unknown][] : []),
    ]),
    ...markdownEmBlocos(txt(v.texto)),
  ];
  return montar(db, projectId, {
    nome: nomeArquivo('Documento', d.titulo), titulo: txt(d.titulo), rascunho: !vigente, corpo,
    rodape: `Gerado pelo n.privacy em ${dataBr(new Date().toISOString())}. Versão ${v.numero}${txt(v.hash) ? `, conteúdo ${txt(v.hash).slice(0, 8)}` : ''}.`,
  }, storage);
}

// Incidente (fatia 7): os rótulos são os da tela (`frontend/src/views/titular.js`); os valores, os do servidor (`src/schemas/nucleo.ts`).
const STATUS_INCIDENTE: Record<string, string> = { aberto: 'Aberto', avaliado: 'Avaliado', comunicado: 'Comunicado', encerrado: 'Encerrado' };
const RISCO_TITULAR: Record<string, string> = { sem_risco: 'Sem risco', baixo: 'Baixo', relevante: 'Relevante' };
const SEVERIDADE: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
const TIPO_INCIDENTE: Record<string, string> = { acesso_indevido: 'Acesso indevido', vazamento: 'Vazamento ou exposição', perda: 'Perda ou extravio',
  indisponibilidade: 'Indisponibilidade', alteracao_indevida: 'Alteração indevida', terceiro: 'Incidente em terceiro (fornecedor ou operador)',
  malware: 'Malware ou ransomware', engenharia_social: 'Engenharia social', outro: 'Outro' };
const COMPROMETIMENTO: Record<string, string> = { confidencialidade: 'Confidencialidade', integridade: 'Integridade', disponibilidade: 'Disponibilidade' };
const CRITERIO_RISCO: Record<string, string> = { sensiveis: 'Dados sensíveis', criancas_idosos: 'Crianças, adolescentes ou idosos', financeiros: 'Dados financeiros',
  autenticacao: 'Autenticação em sistemas', sigilo: 'Sigilo legal, judicial ou profissional', larga_escala: 'Larga escala', nenhum: 'Não afeta nenhum dos critérios' };
const CANAL_ANPD: Record<string, string> = { sei: 'Peticionamento eletrônico (SEI)', formulario_anpd: 'Formulário da ANPD', email: 'E-mail', outro: 'Outro' };
const TRATAMENTO_ACAO: Record<string, string> = { contencao: 'Contenção', correcao: 'Correção', aperfeicoamento: 'Aperfeiçoamento' };
const rotulos = (mapa: Record<string, string>, xs: string[]) => xs.map((x) => mapa[x] ?? x).join(', ');
const dataHora = dataHoraBr;

/**
 * O incidente em Word (fatia 7): registro, risco, comunicações, análises, ações corretivas, post mortem e o histórico resumido (os 100
 * eventos mais recentes, sem texto livre, como na aba). Lido ao vivo pelos mesmos serviços das abas. Antes do encerramento sai como
 * rascunho. null = o incidente não é do projeto.
 */
export async function incidenteEmWord(db: D1Database, projectId: string, incidenteId: string, storage?: R2Bucket): Promise<Gerado | null> {
  const i = await lerIncidente(db, projectId, incidenteId);
  if (!i) return null;
  const [ident, analises, acoes, postmortem, historico, resp] = await Promise.all([
    identificacao(db, projectId), listarAnalises(db, projectId, incidenteId, ''), listarAcoesDoIncidente(db, projectId, incidenteId),
    lerPostmortem(db, projectId, incidenteId), lerHistoricoIncidente(db, projectId, incidenteId, 100),
    i.responsavel_parte_id ? db.prepare('SELECT nome FROM partes WHERE id = ? AND project_id = ?').bind(i.responsavel_parte_id, projectId).first<{ nome: string }>() : null,
  ]);
  const encerrado = i.status === 'encerrado';
  // A situação central (`situacaoDaComunicacao`): risco sem_risco ou baixo não exige a comunicação.
  const comunicacao = (feita: string | null, prazo: string | null, situacao: string) => feita ? `Comunicada em ${dataHora(feita)}`
    : situacao === 'nao_exigida' ? `Não exigida (risco ${RISCO_TITULAR[i.risco_titular ?? '']?.toLowerCase() ?? ''})`
    : prazo ? `Pendente, prazo ${dataHora(prazo)}` : 'Pendente, prazo não calculado';
  const corpo: Bloco[] = [
    ...ident,
    titulo('Registro'), ...campos([
      ['Protocolo', i.protocolo], ['Título', i.titulo], ['Situação', STATUS_INCIDENTE[i.status] ?? i.status], ['Responsável', resp?.nome],
      ['Origem do alerta', i.origem_alerta], ['Severidade', i.severidade ? SEVERIDADE[i.severidade] : ''], ['Tipo', i.tipo ? TIPO_INCIDENTE[i.tipo] : ''],
      ['Início', dataHora(i.ocorrido_em)], ['Ciência', dataHora(i.ciencia_em)], ['Fim', dataHora(i.fim_em)],
      ['Áreas afetadas', i.areas.map((a) => a.nome).join(', ')], ['Comprometimento', rotulos(COMPROMETIMENTO, i.comprometimento)],
      ['Titulares estimados', i.titulares_estimados ?? ''], ['Critérios de risco', rotulos(CRITERIO_RISCO, i.criterios_risco)],
      ['Descrição', i.descricao],
    ]),
    ...(i.dados.length ? [titulo('Titulares e dados afetados'), tabela(['Titulares', 'Dado', 'Sensível'], i.dados.map((d) => [d.titular, d.dado, simNao(d.sensivel)])), par('')] : []),
    titulo('Risco ao titular'), ...campos([['Avaliação', i.risco_titular ? RISCO_TITULAR[i.risco_titular] : 'Não avaliado'], ['Justificativa', i.avaliacao_texto]]),
    titulo('Comunicação'), ...campos([
      ['ANPD', comunicacao(i.comunicacao_anpd_em, i.prazo_anpd_em, i.situacao_anpd)], ['Canal', i.anpd_canal ? CANAL_ANPD[i.anpd_canal] : ''],
      ['Protocolo na ANPD', i.anpd_protocolo], ['Protocolo interno', i.anpd_protocolo_interno], ['Justificativa', i.anpd_justificativa],
      ['Titulares', comunicacao(i.comunicacao_titular_em, i.prazo_titular_em, i.situacao_titular)],
    ]),
    titulo('Análises'),
    ...(analises?.length ? analises.flatMap((a) => [par(`${txt(a.autor_nome) || a.autor} · ${dataHora(a.created_at)}`, { bold: true }), par(a.texto)]) : [par('Nenhuma análise.')]),
    titulo('Ações corretivas'),
    ...(acoes?.length ? [tabela(['Protocolo', 'Ação', 'Tratamento', 'Responsável', 'Prazo', 'Situação'], (acoes as Linha[]).map((a) => [
      txt(a.protocolo), txt(a.title), TRATAMENTO_ACAO[txt(a.tratamento)] ?? 'Não informado', ou(a.assigned_to_parte_nome, '—'),
      a.due_date ? dataBr(txt(a.due_date)) : '—', traduz(STATUS, a.status || 'Open')])), par('')] : [par('Nenhuma ação.')]),
    titulo('Post mortem'),
    ...(postmortem?.aberto ? campos(postmortem.perguntas.map((q, n): [string, unknown] => [`${n + 1}. ${q.texto}`, q.resposta]))
      : [par('Abre depois do encerramento do incidente.')]),
    titulo('Histórico'),
    ...(historico?.length ? [tabela(['Data', 'Evento', 'Detalhe', 'Quem'], historico.map((h) => [dataHora(h.data), h.evento, h.detalhe ?? '', h.nome])), par('')]
      : [par('Nenhum registro.')]),
  ];
  return montar(db, projectId, {
    nome: nomeArquivo('Incidente', i.protocolo), titulo: `Incidente ${i.protocolo}`, rascunho: !encerrado, corpo,
    rodape: `Gerado pelo n.360 em ${dataBr(new Date().toISOString())}.`,
  }, storage);
}
