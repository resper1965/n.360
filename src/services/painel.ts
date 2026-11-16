import { visaoDoEncarregado, diaMes, exemplos, type Grupo, type Prioridade } from './encarregado';
import { lerEmpresa } from './empresas';
import { aprovacoesDoProjeto } from './documentos';
import { situacaoDaAtividade } from './ropa-abas/situacao';
import { ehLegitimoInteresse } from './lia';
import { SQL_TITULOS_ADICIONAIS } from './bases';
import { NOME_DO_PRODUTO, type Modulo } from '../modulos';
import { hojeEmSaoPaulo } from './hoje';
import { SQL_EH_FORNECEDOR, listarTerceiros } from './terceiros';
import { SQL_CLASSE_CONTROLE, sqlClasseControle } from './classe-controle';
import { blocoOt } from './painel-ot';
import { TETO_LEITURA_OT } from './ot-inventario';
import { situacaoSensor, type Cred } from './ot-sensor';

/** Situação do controle numa palavra: concluído, em andamento, não iniciado ou fora da SoA. A regra mora em classe-controle.ts. */
export { SQL_CLASSE_CONTROLE } from './classe-controle';

/**
 * Painel de entrada do n.360, do n.iso e do n.privacy (estudo `docs/design/diagnostico-2026-10-14/dashboard-entrada.md`,
 * direção A). Só leitura. Uma chamada devolve tudo o que a entrada mostra: a empresa, o estado do programa, a frase de saúde
 * (montada aqui, para a frase e a lista nunca discordarem), "O que fazer", a cobertura por tema, os vencimentos de 90 dias, o
 * mapa de risco e os pedidos por semana. A visão por papel também é daqui: o cliente recebe a frase, as linhas dos módulos e o
 * que espera a decisão dele; cobertura, mapa, vencimentos e a lista da consultoria não saem para ele.
 * As contas novas vão num `db.batch` por módulo; o n.privacy reaproveita a visão do encarregado (prioridades e contagens).
 */

export type Tom = Grupo | 'ok' | 'vez';
export type Saude = { tom: Tom; rotulo: string; frase: string; apoio: string };
export type ItemFazer = { grupo: Grupo; quando: string; texto: string; contexto: string; acao: string; tela: string; aba?: string; filtro?: string; modulo: Modulo };
export type Tema = { tema: string; feito: number; andamento: number; falta: number; conta: string };
export type LinhaVencimento = { tipo: string; vencidos: number; itens: { dias: number; rotulo: string }[] };
export type Passo = { texto: string; contexto: string; feito: boolean; acao: string; tela: string };
export type Proximo = { dias: number; rotulo: string; tipo: string } | null;

const DIA = 86_400_000;
const hoje = () => hojeEmSaoPaulo();
const somarDias = (d: string, n: number) => new Date(Date.parse(d) + n * DIA).toISOString().slice(0, 10);
/** AAAA-MM do mês de `dia` recuado `n` meses (n >= 0). */
const mesesAtras = (dia: string, n: number) => {
  const t = Number(dia.slice(0, 4)) * 12 + Number(dia.slice(5, 7)) - 1 - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const diasAte = (d: string, de: string) => Math.round((Date.parse(d.slice(0, 10)) - Date.parse(de)) / DIA);
const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`;
const ORDEM: Grupo[] = ['atraso', 'semana', 'plano'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A frase de saúde, função pura (decisão 3 do estudo). Ordem: "Sua vez" (só cliente, com pedido para ele), "Começando" (sem
 * cadastro mínimo: projeto vazio NUNCA está em dia), "Atrasado" (algum prazo vencido; a frase nomeia o mais grave, o primeiro da
 * lista, que já vem em ordem), "Atenção" (vence em até 7 dias ou há pendência exigida) e "Em dia" (diz o próximo prazo).
 */
export function saudeDoProjeto(e: { itens: ItemFazer[]; comecando: boolean; decisoes?: number; cliente?: boolean; proximo?: Proximo }): Saude {
  const por = (g: Grupo) => e.itens.filter((i) => i.grupo === g);
  const [atraso, semana, plano] = ORDEM.map(por);
  const modulos = new Set(e.itens.map((i) => i.modulo));
  const onde = (i: ItemFazer) => (modulos.size > 1 ? ` no ${NOME_DO_PRODUTO[i.modulo]}` : '');
  const decisoes = e.decisoes ?? 0;
  if (e.cliente && decisoes > 0) {
    return { tom: 'vez', rotulo: 'Sua vez', frase: `${decisoes === 1 ? 'Um pedido espera' : `${decisoes} pedidos esperam`} a sua decisão.`,
      apoio: 'São aprovações ou ciências pedidas a você neste projeto. A consultoria cuida do resto do programa.' };
  }
  if (e.comecando) {
    // A visão do cliente não desenha os passos (são da consultoria): a frase não os promete.
    return { tom: 'plano', rotulo: 'Começando', frase: 'O programa ainda não começou: falta o cadastro mínimo.',
      apoio: e.cliente
        ? 'A consultoria está montando o cadastro do programa. Quando houver um pedido de aprovação ou ciência para você, ele aparece aqui.'
        : 'Os primeiros passos estão abaixo. Sem cadastro, não há como dizer que o programa está em dia.' };
  }
  if (atraso.length) {
    const resto = [semana.length ? plural(semana.length, 'item para esta semana', 'itens para esta semana') : '', plano.length ? plural(plano.length, 'para planejar', 'para planejar') : ''].filter(Boolean);
    return { tom: 'atraso', rotulo: 'Atrasado', frase: `${maiuscula(atraso[0].texto)}${onde(atraso[0])}.`,
      apoio: `${plural(atraso.length, 'assunto com prazo vencido', 'assuntos com prazo vencido')}${resto.length ? `; ${resto.join(' e ')}` : ''}.` };
  }
  if (semana.length) {
    return { tom: 'semana', rotulo: 'Atenção', frase: `${maiuscula(semana[0].texto)}${onde(semana[0])}.`,
      apoio: `Nada vencido. ${plural(semana.length, 'item pede atenção', 'itens pedem atenção')} nesta semana${plano.length ? `, e ${plural(plano.length, 'outro fica', 'outros ficam')} para planejar` : ''}.` };
  }
  const p = e.proximo;
  return { tom: 'ok', rotulo: 'Em dia', frase: 'Nada vencido nem vencendo nos próximos 7 dias.',
    apoio: `${p ? `O próximo prazo é ${p.rotulo} (${p.tipo.toLowerCase()}), em ${plural(p.dias, 'dia', 'dias')}.` : 'Nenhum prazo nos próximos 90 dias.'}${plano.length ? ` ${plural(plano.length, 'item fica', 'itens ficam')} para planejar.` : ''}` };
}

/**
 * Estado do programa (decisão 2): "Em operação desde <mês>" a partir da primeira aprovação de RoPA ou de controle da SoA,
 * "Em implantação" com cadastro e sem esse marco, "Começando" sem cadastro. Função pura.
 */
export function estadoDoPrograma(marco: string | null, temCadastro: boolean): { estado: 'comecando' | 'implantacao' | 'operacao'; desde: string | null; rotulo: string } {
  if (marco && /^\d{4}-\d{2}/.test(marco)) {
    const desde = marco.slice(0, 7);
    return { estado: 'operacao', desde, rotulo: `Em operação desde ${MESES[Number(desde.slice(5, 7)) - 1]} de ${desde.slice(0, 4)}` };
  }
  return temCadastro ? { estado: 'implantacao', desde: null, rotulo: 'Em implantação' } : { estado: 'comecando', desde: null, rotulo: 'Começando' };
}

/** Itens em ordem de prazo (atrasado, semana, planejar), sem mudar a ordem de gravidade dentro de cada grupo. */
export const emOrdem = (itens: ItemFazer[]) => ORDEM.flatMap((g) => itens.filter((i) => i.grupo === g));

const daPrioridade = (modulo: Modulo) => (p: Prioridade): ItemFazer => ({
  grupo: p.grupo, quando: p.quando, texto: p.texto, contexto: p.contexto, acao: p.acao, tela: p.tela, ...(p.aba ? { aba: p.aba } : {}), ...(p.filtro ? { filtro: p.filtro } : {}), modulo,
});

type Contagem = { feito: number | null; andamento: number | null; falta: number | null };
const tema = (nome: string, c: Contagem | undefined, conta: string): Tema => ({ tema: nome, feito: c?.feito ?? 0, andamento: c?.andamento ?? 0, falta: c?.falta ?? 0, conta });
type Datada = { tipo: string; rotulo: string; data: string };

const TETO_VENCIMENTOS = 200;
// O D1 recusa SELECT composto com mais de 5 termos ("too many terms in compound SELECT"): a união vai em blocos de 4.
const TERMOS_POR_UNIAO = 4;

/**
 * As consultas dos vencimentos de 90 dias, para entrar no `db.batch` do módulo: por bloco da união, os itens do período (com
 * teto) e os vencidos por tipo. `lerVencimentos` junta as respostas na mesma ordem.
 */
function consultasDeVencimento(db: D1Database, partes: string[], projectId: string, dia: string): D1PreparedStatement[] {
  const unioes: string[] = [];
  for (let i = 0; i < partes.length; i += TERMOS_POR_UNIAO) unioes.push(partes.slice(i, i + TERMOS_POR_UNIAO).join(' UNION ALL '));
  return [
    ...unioes.map((u) => db.prepare(`SELECT tipo, rotulo, data FROM (${u}) WHERE data >= ?2 AND data <= ?3 ORDER BY data, tipo, rotulo LIMIT ${TETO_VENCIMENTOS}`)
      .bind(projectId, dia, somarDias(dia, 90))),
    ...unioes.map((u) => db.prepare(`SELECT tipo, count(*) AS n FROM (${u}) WHERE data < ?2 GROUP BY tipo`).bind(projectId, dia)),
  ];
}

function lerVencimentos(tipos: string[], respostas: D1Result[], dia: string): { linhas: LinhaVencimento[]; proximo: Proximo } {
  const meio = respostas.length / 2;
  const itens = respostas.slice(0, meio).flatMap((r) => r.results as Datada[])
    .sort((a, b) => a.data.localeCompare(b.data) || a.tipo.localeCompare(b.tipo) || a.rotulo.localeCompare(b.rotulo)).slice(0, TETO_VENCIMENTOS);
  const vencidos = respostas.slice(meio).flatMap((r) => r.results as { tipo: string; n: number }[]);
  const linhas = tipos.map((tipo) => ({
    tipo, vencidos: vencidos.filter((v) => v.tipo === tipo).reduce((t, v) => t + v.n, 0),
    itens: itens.filter((i) => i.tipo === tipo).map((i) => ({ dias: diasAte(i.data, dia), rotulo: i.rotulo })),
  }));
  const p = itens[0];
  return { linhas, proximo: p ? { dias: diasAte(p.data, dia), rotulo: p.rotulo, tipo: p.tipo } : null };
}

/** Mapa de risco 5x5: contagem por probabilidade e impacto. */
type Celula = { p: number; i: number; n: number };

export { SQL_EVIDENCIA_VENCIDA, SQL_EVIDENCIA_RUIM } from './evidencia-regras';
import { SQL_EVIDENCIA_RUIM } from './evidencia-regras';
import { escopoRopa } from './escopo-itens';
/** Escopo do SGSI registrado (ISO/IEC 27001, 4.3), sobre `projects p LEFT JOIN context_analysis x`: a mesma regra no Painel e na Prontidão. */
export const SQL_ESCOPO_DEFINIDO = `(trim(COALESCE(p.scope, '')) <> '' OR (x.notes IS NOT NULL AND CASE WHEN json_valid(x.notes) THEN trim(COALESCE(json_extract(x.notes, '$.perimeter'), '')) <> ''
          ELSE trim(x.notes) <> '' END))`;
// Ordem das colunas de status de evidência, igual nos dois módulos: válida e conforme, em análise, vencida ou não conforme.
const SQL_EVIDENCIAS = `SELECT
    sum(CASE WHEN (valido_ate IS NULL OR substr(valido_ate, 1, 10) >= ?2) AND evaluation_status = 'conforming' THEN 1 ELSE 0 END) AS feito,
    sum(CASE WHEN ${SQL_EVIDENCIA_RUIM} THEN 0
             WHEN (valido_ate IS NULL OR substr(valido_ate, 1, 10) >= ?2) AND evaluation_status = 'conforming' THEN 0 ELSE 1 END) AS andamento,
    sum(CASE WHEN ${SQL_EVIDENCIA_RUIM} THEN 1 ELSE 0 END) AS falta
  FROM evidence WHERE project_id = ?1`;
const SQL_UNIAO_EVIDENCIAS = `SELECT 'Evidências' AS tipo, file_name AS rotulo, substr(valido_ate, 1, 10) AS data FROM evidence WHERE project_id = ?1 AND valido_ate IS NOT NULL`;
const SQL_UNIAO_DOCUMENTOS = `SELECT 'Documentos (revisão)' AS tipo, titulo AS rotulo, substr(revisar_ate, 1, 10) AS data FROM documentos WHERE project_id = ?1 AND status = 'vigente' AND revisar_ate IS NOT NULL`;
// Documentos do legado (`documentos_arquivo`): o vencimento entra na mesma linha do painel; obsoleto e "sem vencimento" ficam fora (a regra dos avisos de prazo).
const SQL_UNIAO_DOCUMENTOS_ARQUIVO = `SELECT 'Documentos (revisão)' AS tipo, nome AS rotulo, substr(vencimento, 1, 10) AS data FROM documentos_arquivo WHERE project_id = ?1 AND status <> 'obsoleto' AND sem_vencimento = 0 AND vencimento IS NOT NULL`;

// ─── n.privacy ──────────────────────────────────────────────────────────────────────────────────────────

const TIPOS_PRIVACY = ['Pedidos do titular', 'Comunicações de incidente', 'Fornecedores', 'Evidências', 'Documentos (revisão)', 'Ações das atividades'];
const UNIAO_PRIVACY = [
  `SELECT 'Pedidos do titular' AS tipo, protocolo AS rotulo, substr(prazo_em, 1, 10) AS data FROM titular_pedidos
    WHERE project_id = ?1 AND status IN ('recebido', 'em_andamento') AND prazo_em IS NOT NULL`,
  `SELECT 'Comunicações de incidente', protocolo || ' (ANPD)', substr(prazo_anpd_em, 1, 10) FROM incidentes
    WHERE project_id = ?1 AND status <> 'encerrado' AND COALESCE(risco_titular, '') <> 'sem_risco' AND comunicacao_anpd_em IS NULL AND prazo_anpd_em IS NOT NULL`,
  `SELECT 'Comunicações de incidente', protocolo || ' (titulares)', substr(prazo_titular_em, 1, 10) FROM incidentes
    WHERE project_id = ?1 AND status <> 'encerrado' AND COALESCE(risco_titular, '') <> 'sem_risco' AND comunicacao_titular_em IS NULL AND prazo_titular_em IS NOT NULL`,
  // A avaliação que vale é a mais recente (a mesma regra de `situacaoDe`): reprovada não tem validade.
  `SELECT 'Fornecedores', p.nome, (SELECT CASE WHEN a.resultado <> 'reprovado' THEN substr(a.valido_ate, 1, 10) END FROM avaliacoes_terceiro a
      WHERE a.parte_id = p.id ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1) AS data
    FROM partes p WHERE p.project_id = ?1 AND ${SQL_EH_FORNECEDOR}`,
  SQL_UNIAO_EVIDENCIAS,
  SQL_UNIAO_DOCUMENTOS,
  SQL_UNIAO_DOCUMENTOS_ARQUIVO,
];

async function blocoPrivacy(db: D1Database, projectId: string, cliente: boolean, dia: string) {
  const [visao, aprovacoes] = await Promise.all([visaoDoEncarregado(db, projectId, { cliente }), aprovacoesDoProjeto(db, projectId, undefined, 'tratamento')]);
  const consultas = consultasDeVencimento(db, UNIAO_PRIVACY, projectId, dia);
  const respostas = await db.batch([
    ...consultas,
    // Atividades: a aprovação é DERIVADA dos pedidos (situacaoDaAtividade), não a coluna status; a conta é feita no Worker.
    db.prepare(`SELECT r.id, r.status, r.reaberta_em, (r.base_legal_id IS NULL AND trim(COALESCE(r.legal_basis, '')) = '' AND trim(COALESCE(r.base_gdpr, '')) = ''
              AND NOT EXISTS (SELECT 1 FROM tratamento_bases b WHERE b.ropa_id = r.id AND b.project_id = r.project_id)) AS sem_base
              FROM ropa_records r WHERE r.project_id = ?1 AND COALESCE(r.status, '') <> 'Inactive'`).bind(projectId),
    // RIPD exigidos: aprovado / existe e não aprovado / não existe.
    db.prepare(`SELECT sum(CASE WHEN aprovado THEN 1 ELSE 0 END) AS feito, sum(CASE WHEN existe AND NOT aprovado THEN 1 ELSE 0 END) AS andamento,
        sum(CASE WHEN existe THEN 0 ELSE 1 END) AS falta
      FROM (SELECT EXISTS (SELECT 1 FROM dpia_assessments d WHERE d.ropa_id = r.id AND d.project_id = r.project_id) AS existe,
                   EXISTS (SELECT 1 FROM dpia_assessments d WHERE d.ropa_id = r.id AND d.project_id = r.project_id AND d.status = 'Approved') AS aprovado
              FROM ropa_records r WHERE r.project_id = ?1 AND r.dpia_required = 1 AND COALESCE(r.status, '') <> 'Inactive')`).bind(projectId),
    // LIA: a base de legítimo interesse vem de texto livre, então a conta final é aqui no Worker (a mesma regra da visão).
    db.prepare(`SELECT r.legal_basis, q.titulo AS base_titulo, r.base_gdpr, ${SQL_TITULOS_ADICIONAIS} AS adicionais,
        (SELECT l.status FROM lia_assessments l WHERE l.ropa_id = r.id AND l.project_id = r.project_id) AS lia
      FROM ropa_records r LEFT JOIN requisitos q ON q.id = r.base_legal_id WHERE r.project_id = ?1 AND COALESCE(r.status, '') <> 'Inactive'`).bind(projectId),
    db.prepare(`SELECT sum(CASE WHEN status IN ('respondido', 'negado', 'arquivado') THEN 1 ELSE 0 END) AS feito,
        sum(CASE WHEN status IN ('recebido', 'em_andamento') AND (prazo_em IS NULL OR substr(prazo_em, 1, 10) >= ?2) THEN 1 ELSE 0 END) AS andamento,
        sum(CASE WHEN status IN ('recebido', 'em_andamento') AND substr(prazo_em, 1, 10) < ?2 THEN 1 ELSE 0 END) AS falta
      FROM titular_pedidos WHERE project_id = ?1 AND substr(recebido_em, 1, 10) >= ?3`).bind(projectId, dia, somarDias(dia, -90)),
    db.prepare(`SELECT sum(CASE WHEN status = 'encerrado' THEN 1 ELSE 0 END) AS feito, sum(CASE WHEN status <> 'encerrado' AND NOT atraso THEN 1 ELSE 0 END) AS andamento,
        sum(CASE WHEN status <> 'encerrado' AND atraso THEN 1 ELSE 0 END) AS falta
      FROM (SELECT status, (COALESCE(risco_titular, '') <> 'sem_risco' AND ((comunicacao_anpd_em IS NULL AND substr(prazo_anpd_em, 1, 10) < ?2)
              OR (comunicacao_titular_em IS NULL AND substr(prazo_titular_em, 1, 10) < ?2))) AS atraso
              FROM incidentes WHERE project_id = ?1 AND substr(ciencia_em, 1, 10) >= ?3)`).bind(projectId, dia, somarDias(dia, -365)),
    db.prepare(SQL_EVIDENCIAS).bind(projectId, dia),
    // Ciclo de vida (F3): as seis etapas registradas (ou não aplicáveis) / parte delas / nenhuma.
    db.prepare(`SELECT sum(CASE WHEN n >= 6 THEN 1 ELSE 0 END) AS feito, sum(CASE WHEN n BETWEEN 1 AND 5 THEN 1 ELSE 0 END) AS andamento, sum(CASE WHEN n = 0 THEN 1 ELSE 0 END) AS falta
      FROM (SELECT (SELECT count(*) FROM tratamento_ciclo c WHERE c.ropa_id = r.id AND c.project_id = r.project_id) AS n
              FROM ropa_records r WHERE r.project_id = ?1 AND COALESCE(r.status, '') <> 'Inactive')`).bind(projectId),
    // Pedidos por mês: 12 meses, o atual incluído (do dia 1 de onze meses atrás em diante).
    db.prepare(`SELECT substr(recebido_em, 1, 7) AS m FROM titular_pedidos WHERE project_id = ?1 AND substr(recebido_em, 1, 10) >= ?2`).bind(projectId, mesesAtras(dia, 11) + '-01'),
    // Riscos das atividades (F2): o mesmo recorte do Mapa de risco do n.privacy.
    db.prepare(`SELECT probability AS p, impact AS i, count(*) AS n FROM risks WHERE project_id = ?1${escopoRopa('atividades')} GROUP BY probability, impact`).bind(projectId),
    // Indicadores de andamento (% de gaps e de riscos das atividades concluídos). Gap = ação corretiva da atividade; risco tratado = fechado, mitigado ou aceito.
    db.prepare(`SELECT (SELECT count(*) FROM corrective_actions WHERE project_id = ?1${escopoRopa('atividades')}) AS gaps,
        (SELECT count(*) FROM corrective_actions WHERE project_id = ?1 ${escopoRopa('atividades')} AND status = 'Closed') AS gaps_ok,
        (SELECT count(*) FROM risks WHERE project_id = ?1${escopoRopa('atividades')}) AS riscos,
        (SELECT count(*) FROM risks WHERE project_id = ?1 ${escopoRopa('atividades')} AND status IN ('Closed', 'Mitigated', 'Accepted')) AS riscos_ok`).bind(projectId),
  ]);
  const [ativ, ripd, lias, pedidos90, incidentes12, evid, ciclo, meses, mapa, andamento] = respostas.slice(consultas.length);
  const um = (r: D1Result) => r.results[0] as Contagem | undefined;
  const linhasAtiv = ativ.results as { id: string; status: string | null; reaberta_em: string | null; sem_base: number }[];
  const contaAtiv = { feito: 0, andamento: 0, falta: 0 };
  for (const r of linhasAtiv) {
    const s = situacaoDaAtividade({ status: r.status, reaberta_em: r.reaberta_em, aprovacao: aprovacoes.get(r.id) ?? null, aprovacao_anterior: null });
    if (s.codigo === 'aprovada') contaAtiv.feito++;
    else if (r.status === 'Draft' || r.sem_base) contaAtiv.falta++;
    else contaAtiv.andamento++;
  }
  const linhasLia = lias.results as { legal_basis: string | null; base_titulo: string | null; base_gdpr: string | null; adicionais: string | null; lia: string | null }[];
  const exigidas = linhasLia.filter((l) => ehLegitimoInteresse(l.base_titulo, l.legal_basis, l.adicionais, l.base_gdpr));
  const te = visao.terceiros;
  const cobertura: Tema[] = [
    tema('Atividades (RoPA)', contaAtiv, 'aprovadas / em revisão ou ativas sem aprovação / rascunho ou sem base legal'),
    tema('RIPD exigidos', um(ripd), 'aprovados / em elaboração ou revisão / não iniciados'),
    tema('LIA exigidas', { feito: exigidas.filter((l) => l.lia === 'concluida').length, andamento: exigidas.filter((l) => l.lia === 'rascunho').length, falta: exigidas.filter((l) => !l.lia).length },
      'concluídas / em rascunho / não iniciadas'),
    tema('Ciclo de vida documentado', um(ciclo), 'as seis etapas registradas / parte das etapas / nenhuma etapa'),
    tema('Fornecedores', { feito: Math.max(0, te.total - te.sem_tipo - te.pendentes - te.vencidos - te.reprovados), andamento: te.sem_tipo + te.pendentes, falta: te.vencidos + te.reprovados },
      'avaliação vigente / sem tipo ou nunca avaliados / vencidos ou reprovados'),
    tema('Pedidos do titular (90 dias)', um(pedidos90), 'respondidos ou encerrados / em andamento no prazo / atrasados'),
    tema('Incidentes (12 meses)', um(incidentes12), 'encerrados / abertos com comunicação em dia / comunicação atrasada'),
    tema('Evidências', um(evid), 'válidas e conformes / em análise / vencidas ou não conformes'),
  ];
  const v = lerVencimentos(TIPOS_PRIVACY.filter((t) => t !== 'Ações das atividades'), respostas.slice(0, consultas.length), dia);
  // Ações das atividades (F2/F4): a linha sai das faixas de prazo que a visão já monta (acoes_por_prazo), sem consulta nova.
  const faixa = (id: string) => visao.acoes_por_prazo.find((f) => f.faixa === id);
  const acoes = ['ate_30', 'de_31_a_90'].flatMap((id) => faixa(id)?.itens ?? [])
    .map((a) => ({ dias: diasAte(String(a.due_date), dia), rotulo: a.title })).filter((a) => a.dias >= 0 && a.dias <= 90);
  v.linhas.push({ tipo: 'Ações das atividades', vencidos: faixa('vencidas')?.total ?? 0, itens: acoes });
  const primeiraAcao = [...acoes].sort((a, b) => a.dias - b.dias)[0];
  if (primeiraAcao && (!v.proximo || primeiraAcao.dias < v.proximo.dias)) v.proximo = { ...primeiraAcao, tipo: 'Ações das atividades' };
  // Pedidos recebidos por mês, 12 meses, o mês atual por último.
  const chaves = Array.from({ length: 12 }, (_, i) => mesesAtras(dia, 11 - i));
  const pedidosMes = chaves.map(() => 0);
  for (const { m } of meses.results as { m: string }[]) {
    const idx = chaves.indexOf(m);
    if (idx >= 0) pedidosMes[idx] += 1;
  }
  const an = (andamento.results[0] ?? {}) as Record<string, number>;
  const pct = (ok: number, total: number) => (total ? `${Math.round((ok / total) * 100)}%` : 'nenhum');
  const totalAtiv = contaAtiv.feito + contaAtiv.andamento + contaAtiv.falta;
  const lg = visao.lgpd;
  const encarregados = visao.encarregados;
  const comecando = visao.tratamentos.total === 0;
  return {
    encarregados, comecando, tratamentos: visao.tratamentos.total,
    itens: emOrdem(visao.prioridades.map(daPrioridade('privacy'))),
    cobertura, vencimentos: v.linhas, proximo: v.proximo, pedidos_mes: pedidosMes, meses_pedidos: chaves,
    riscos: mapa.results as Celula[], acoes_por_prazo: visao.acoes_por_prazo,
    numeros: [
      [`${contaAtiv.feito} de ${totalAtiv}`, 'atividades aprovadas'],
      [String(visao.pedidos_titular.atrasados), 'pedidos atrasados'],
      lg.carregada ? [`${lg.cobertos ?? 0} de ${lg.total ?? 0}`, 'artigos da LGPD cobertos'] : [String(te.vencidos), 'fornecedores vencidos'],
      [pct(an.gaps_ok ?? 0, an.gaps ?? 0), 'de gaps concluídos'],
      [pct(an.riscos_ok ?? 0, an.riscos ?? 0), 'de riscos concluídos'],
    ] as [string, string][],
    passos: [
      { texto: 'Indicar o encarregado', contexto: 'A LGPD exige a indicação (art. 41)', feito: encarregados.length > 0, acao: 'Indicar', tela: 'encarregado' },
      { texto: 'Trazer as atividades de tratamento', contexto: 'Importe o programa que já existe ou cadastre a primeira', feito: !comecando, acao: 'Abrir os tratamentos', tela: 'ropa' },
      { texto: 'Cadastrar os fornecedores', contexto: 'Fornecedores que recebem dados pessoais', feito: te.total > 0, acao: 'Cadastrar fornecedores', tela: 'terceiros' },
    ] as Passo[],
    // Os números dos selos do menu (`selos-menu.js`): a mesma visão, sem segunda chamada.
    selos: { pedidos_titular: visao.pedidos_titular, terceiros: visao.terceiros, incidentes: visao.incidentes },
  };
}

// ─── n.iso ──────────────────────────────────────────────────────────────────────────────────────────────

const TIPOS_ISO = ['Ações corretivas', 'Auditorias', 'Evidências', 'Documentos (revisão)'];
const UNIAO_ISO = [
  `SELECT 'Ações corretivas' AS tipo, title AS rotulo, substr(due_date, 1, 10) AS data FROM corrective_actions
    WHERE project_id = ?1${escopoRopa('programa')} AND COALESCE(status, 'Open') <> 'Closed' AND due_date IS NOT NULL`,
  `SELECT 'Auditorias', title, substr(scheduled_date, 1, 10) FROM audit_schedule WHERE project_id = ?1 AND COALESCE(status, 'Planned') NOT IN ('Completed', 'Cancelled')`,
  SQL_UNIAO_EVIDENCIAS,
  SQL_UNIAO_DOCUMENTOS,
  SQL_UNIAO_DOCUMENTOS_ARQUIVO,
];

const TEMAS_ANEXO_A: [string, string][] = [['A.5', 'Controles organizacionais'], ['A.6', 'Controles de pessoas'], ['A.7', 'Controles físicos'], ['A.8', 'Controles tecnológicos']];

async function blocoIso(db: D1Database, projectId: string, dia: string, quem: QuemPede) {
  const consultas = consultasDeVencimento(db, UNIAO_ISO, projectId, dia);
  const [terceiros, respostas] = await Promise.all([listarTerceiros(db, projectId), db.batch([
    ...consultas,
    db.prepare(`SELECT substr(title, 1, 3) AS tema, ${SQL_CLASSE_CONTROLE} AS classe, count(*) AS n FROM compliance_controls
      WHERE project_id = ?1 GROUP BY 1, 2`).bind(projectId),
    // Riscos do n.iso (sem atividade de tratamento): tratados / em tratamento (com plano) / sem tratamento definido.
    db.prepare(`SELECT sum(CASE WHEN COALESCE(status, 'Open') IN ('Mitigated', 'Accepted', 'Closed') THEN 1 ELSE 0 END) AS feito,
        sum(CASE WHEN COALESCE(status, 'Open') NOT IN ('Mitigated', 'Accepted', 'Closed') AND trim(COALESCE(treatment_plan, '')) <> '' THEN 1 ELSE 0 END) AS andamento,
        sum(CASE WHEN COALESCE(status, 'Open') NOT IN ('Mitigated', 'Accepted', 'Closed') AND trim(COALESCE(treatment_plan, '')) = '' THEN 1 ELSE 0 END) AS falta
      FROM risks WHERE project_id = ?1${escopoRopa('programa')}`).bind(projectId),
    db.prepare(`SELECT threat FROM risks WHERE project_id = ?1${escopoRopa('programa')} AND risk_level IN ('High', 'Critical') AND COALESCE(status, 'Open') = 'Open'
      AND trim(COALESCE(treatment_plan, '')) = '' ORDER BY impact * probability DESC, threat`).bind(projectId),
    db.prepare(`SELECT sum(CASE WHEN COALESCE(status, 'Open') = 'Closed' THEN 1 ELSE 0 END) AS feito,
        sum(CASE WHEN COALESCE(status, 'Open') <> 'Closed' AND (due_date IS NULL OR substr(due_date, 1, 10) >= ?2) THEN 1 ELSE 0 END) AS andamento,
        sum(CASE WHEN COALESCE(status, 'Open') <> 'Closed' AND substr(due_date, 1, 10) < ?2 THEN 1 ELSE 0 END) AS falta
      FROM corrective_actions WHERE project_id = ?1${escopoRopa('programa')}`).bind(projectId, dia),
    db.prepare(`SELECT title, substr(due_date, 1, 10) AS due FROM corrective_actions WHERE project_id = ?1${escopoRopa('programa')} AND COALESCE(status, 'Open') <> 'Closed'
      AND substr(due_date, 1, 10) < ?2 ORDER BY due_date, title`).bind(projectId, dia),
    db.prepare(SQL_EVIDENCIAS).bind(projectId, dia),
    db.prepare(`SELECT title, substr(scheduled_date, 1, 10) AS data FROM audit_schedule WHERE project_id = ?1 AND COALESCE(status, 'Planned') NOT IN ('Completed', 'Cancelled')
      AND substr(scheduled_date, 1, 10) >= ?2 ORDER BY scheduled_date LIMIT 1`).bind(projectId, dia),
    db.prepare(`SELECT count(*) AS n FROM compliance_controls WHERE project_id = ?1 AND (${SQL_CLASSE_CONTROLE}) = 'andamento' AND substr(COALESCE(updated_at, ''), 1, 10) < ?2`)
      .bind(projectId, somarDias(dia, -60)),
    // Exclusão da SoA sem justificativa: a justificativa do N/A mora em `description` (soa-logic.ts).
    db.prepare(`SELECT title FROM compliance_controls WHERE project_id = ?1 AND status = 'Not Applicable' AND trim(COALESCE(description, '')) = '' ORDER BY title`).bind(projectId),
    db.prepare(`SELECT probability AS p, impact AS i, count(*) AS n FROM risks WHERE project_id = ?1${escopoRopa('programa')} GROUP BY probability, impact`).bind(projectId),
    // Pedidos à espera da decisão DESTA pessoa (o mesmo destinatário de GET /api/v1/pedidos, que "meus-pedidos" lista).
    db.prepare(`SELECT count(DISTINCT p.id) AS n FROM pedidos p JOIN pedido_destinatarios d ON d.pedido_id = p.id WHERE ${SQL_ESPERA_A_PESSOA}`)
      .bind(projectId, quem.id ?? '', quem.email ?? ''),
    // Primeiros passos: o diagnóstico existe para gerar a jornada, então jornada carregada conta como feito.
    db.prepare(`SELECT ${SQL_ESCOPO_DEFINIDO} AS escopo, EXISTS (SELECT 1 FROM project_phases WHERE project_id = ?1) AS jornada,
        EXISTS (SELECT 1 FROM itens WHERE project_id = ?1 AND status = 'ativo') AS ativos
      FROM projects p LEFT JOIN context_analysis x ON x.project_id = p.id WHERE p.id = ?1`).bind(projectId),
  ])]);
  const [controles, riscos, altos, capa, capaVencidas, evid, auditoria, parados, soa, mapa, pedidosAb, inicio] = respostas.slice(consultas.length);
  const feito = (k: 'escopo' | 'jornada' | 'ativos') => !!(inicio.results[0] as Record<string, number> | undefined)?.[k];
  const ctrl = controles.results as { tema: string; classe: string; n: number }[];
  const soma = (f: (c: { tema: string; classe: string }) => boolean) => ctrl.filter(f).reduce((t, c) => t + c.n, 0);
  const um = (r: D1Result) => r.results[0] as Contagem | undefined;
  const cobertura: Tema[] = [
    ...TEMAS_ANEXO_A.map(([pre, nome]) => tema(nome, { feito: soma((c) => c.tema === pre && c.classe === 'feito'), andamento: soma((c) => c.tema === pre && c.classe === 'andamento'),
      falta: soma((c) => c.tema === pre && c.classe === 'falta') }, `implementados / em andamento / não iniciados (${pre}, sem os não aplicáveis)`)),
    tema('Riscos', um(riscos), 'tratados ou aceitos / com plano de tratamento / sem tratamento definido'),
    tema('Ações corretivas', um(capa), 'concluídas / abertas no prazo / vencidas'),
    tema('Evidências', um(evid), 'válidas e conformes / em análise / vencidas ou não conformes'),
  ];
  const feitos = soma((c) => c.classe === 'feito');
  const aplicaveis = soma((c) => c.classe !== 'na');
  const avaliados = soma((c) => c.classe !== 'falta');
  const comecando = avaliados === 0;
  const itens: ItemFazer[] = [];
  const add = (q: number, item: Omit<ItemFazer, 'modulo'>) => { if (q > 0) itens.push({ ...item, modulo: 'iso' }); };
  const vencidasCapa = capaVencidas.results as { title: string; due: string }[];
  add(vencidasCapa.length, { grupo: 'atraso', quando: `Venceu em ${diaMes(vencidasCapa[0]?.due)}`, texto: plural(vencidasCapa.length, 'ação corretiva passou do prazo', 'ações corretivas passaram do prazo'),
    contexto: `A mais antiga: ${vencidasCapa[0]?.title ?? ''}`, acao: 'Ver as ações', tela: 'capa', filtro: 'vencidas' });
  const aud = auditoria.results[0] as { title: string; data: string } | undefined;
  const emDias = aud ? diasAte(aud.data, dia) : 99;
  add(aud && emDias <= 30 ? 1 : 0, { grupo: emDias <= 7 ? 'semana' : 'plano', quando: emDias === 0 ? 'Hoje' : `Em ${plural(emDias, 'dia', 'dias')}`,
    texto: `${aud?.title ?? 'Auditoria'} em ${diaMes(aud?.data)}`, contexto: 'Confira as evidências e os controles do escopo', acao: 'Preparar a auditoria', tela: 'audits' });
  const semTratamento = (altos.results as { threat: string }[]).map((r) => r.threat);
  add(semTratamento.length, { grupo: 'semana', quando: 'Exigido', texto: plural(semTratamento.length, 'risco alto sem tratamento definido', 'riscos altos sem tratamento definido'),
    contexto: exemplos(semTratamento), acao: 'Tratar os riscos', tela: 'risks' });
  const nParados = (parados.results[0] as { n: number } | undefined)?.n ?? 0;
  add(nParados, { grupo: 'plano', quando: 'Planejar', texto: plural(nParados, 'controle em andamento há mais de 60 dias', 'controles em andamento há mais de 60 dias'),
    contexto: 'Sem atualização no período', acao: 'Ver os controles', tela: 'soa' });
  const semJust = (soa.results as { title: string }[]).map((r) => r.title.split(' ')[0]);
  add(semJust.length, { grupo: 'plano', quando: 'Planejar', texto: plural(semJust.length, 'exclusão da SoA sem justificativa', 'exclusões da SoA sem justificativa'),
    contexto: exemplos(semJust), acao: 'Revisar a SoA', tela: 'soa' });
  const ev = um(evid);
  add(ev?.falta ?? 0, { grupo: 'plano', quando: 'Planejar', texto: plural(ev?.falta ?? 0, 'evidência vencida ou não conforme', 'evidências vencidas ou não conformes'),
    contexto: 'Renove ou substitua o arquivo', acao: 'Renovar as evidências', tela: 'evidence', filtro: 'vencidas_ou_nao_conformes' });
  const vencidos = terceiros.filter((t) => t.situacao === 'vencida');
  add(vencidos.length, { grupo: 'atraso', quando: 'Vencida', texto: plural(vencidos.length, 'fornecedor com avaliação vencida', 'fornecedores com avaliação vencida'),
    contexto: exemplos(vencidos.map((t) => t.nome)), acao: 'Ver os fornecedores', tela: 'vendors', filtro: 'vencidos' });
  const pedidosAbertos = (pedidosAb.results[0] as { n: number } | undefined)?.n ?? 0;
  // O cliente já tem "Esperando a sua decisão" (`decisoes`): o item é só das outras visões.
  add(quem.cliente ? 0 : pedidosAbertos, { grupo: 'semana', quando: 'Aguardando', texto: plural(pedidosAbertos, 'pedido esperando decisão', 'pedidos esperando decisão'),
    contexto: 'Aprovação ou ciência pendente', acao: 'Ver os pedidos', tela: 'meus-pedidos' });
  const v = lerVencimentos(TIPOS_ISO, respostas.slice(0, consultas.length), dia);
  const capaAbertas = ((capa.results[0] as Contagem | undefined)?.andamento ?? 0) + vencidasCapa.length;
  return {
    // Números dos selos do menu do n.iso (`selos-menu.js`), a mesma conta do painel.
    selos: {
      capa: { abertas: capaAbertas, vencidas: vencidasCapa.length },
      evidencias: { em_analise: ev?.andamento ?? 0, ruins: ev?.falta ?? 0 },
      fornecedores: { pendentes: terceiros.filter((t) => t.situacao === 'pendente' || t.situacao === 'reavaliar').length, vencidos: vencidos.length, reprovados: terceiros.filter((t) => t.situacao === 'reprovada').length },
      pedidos: { abertos: pedidosAbertos },
    },
    comecando, controles_avaliados: avaliados,
    itens: emOrdem(itens), cobertura, vencimentos: v.linhas, proximo: v.proximo, riscos: mapa.results as Celula[],
    numeros: [
      [`${feitos} de ${aplicaveis}`, 'controles aplicáveis implementados'],
      [String(vencidasCapa.length), 'ações vencidas'],
      [aud ? diaMes(aud.data) : 'nenhuma', 'próxima auditoria'],
    ] as [string, string][],
    passos: [
      { texto: 'Definir o escopo do SGSI', contexto: 'Contexto da organização e partes interessadas', feito: feito('escopo'), acao: 'Definir o escopo', tela: 'context' },
      { texto: 'Responder o diagnóstico inicial', contexto: 'Gera a SoA proposta e a jornada', feito: feito('jornada'), acao: 'Abrir a jornada', tela: 'project-detail' },
      { texto: 'Cadastrar os ativos principais', contexto: 'Ou importar uma planilha', feito: feito('ativos'), acao: 'Cadastrar ativos', tela: 'assets' },
    ] as Passo[],
  };
}

type Fase = { phase_number: number; title: string; status: string | null };
const FASE_FEITA = new Set(['completed', 'skipped']);
/** A jornada como o cliente a lê: a fase em curso (o próximo marco) e quantas já passaram. Sem fases, nulo. */
function jornadaDoCliente(fases: Fase[]) {
  if (!fases.length) return null;
  const atual = fases.find((f) => !FASE_FEITA.has(f.status ?? ''));
  return {
    atual: atual ? { numero: atual.phase_number + 1, titulo: atual.title, status: atual.status ?? 'pending' } : null,
    concluidas: fases.filter((f) => FASE_FEITA.has(f.status ?? '')).length,
    total: fases.length,
  };
}

// ─── O painel ───────────────────────────────────────────────────────────────────────────────────────────

/** Marco do programa: a primeira aprovação registrada, de qualquer fonte (colunas gravadas ou pedido aprovado pelo CISO/CEO). */
export const SQL_MARCO_DO_PROGRAMA = `SELECT min(d) AS d FROM (
    SELECT min(COALESCE(ciso_approved_at, ceo_approved_at)) AS d FROM ropa_records WHERE project_id = ?1
    UNION ALL SELECT min(COALESCE(ciso_approved_at, ceo_approved_at)) FROM compliance_controls WHERE project_id = ?1
    UNION ALL SELECT min(dpo_approved_at) FROM dpia_assessments WHERE project_id = ?1
    -- RIPD aprovado só pela Direção não tem data própria: a aprovação direta fica na trilha.
    UNION ALL SELECT min(created_at) FROM audit_logs WHERE project_id = ?1 AND action = 'dpia.approved'
    UNION ALL SELECT min(pd.decidido_em) FROM pedido_destinatarios pd JOIN pedidos pe ON pe.id = pd.pedido_id
      WHERE pe.project_id = ?1 AND pe.papel_exigido IN ('ciso', 'ceo') AND pd.status = 'aprovado')`;

/**
 * Pedido aberto que espera a decisão da pessoa (?1 projeto, ?2 id, ?3 e-mail): o destinatário de GET /api/v1/pedidos ("Minhas
 * aprovações"), menos o que ela mesma criou, que não pode decidir (403 em decidir).
 */
const SQL_ESPERA_A_PESSOA = `p.project_id = ?1 AND p.status = 'aberto' AND d.status = 'pendente'
  AND (d.user_id = ?2 OR (d.user_id IS NULL AND d.email = lower(?3))) AND lower(p.criado_por) <> lower(?3)`;

/** Quem pede: a visão de cliente sai para papel de cliente; o agente MCP (que entra como `client`) lê como a consultoria que o concedeu. */
export type QuemPede = { id?: string; email?: string; cliente: boolean; agente?: boolean; role?: string; client_project_id?: string | null; org_id?: string | null };

export async function painelDoProjeto(db: D1Database, projectId: string, modulos: Modulo[], quem: QuemPede) {
  const dia = hoje();
  const [empresa, base] = await Promise.all([
    lerEmpresa(db, projectId),
    db.batch([
      db.prepare(SQL_MARCO_DO_PROGRAMA).bind(projectId),
      db.prepare(`SELECT (SELECT count(*) FROM ropa_records WHERE project_id = ?1 AND COALESCE(status, '') <> 'Inactive') AS tratamentos,
          (SELECT count(*) FROM compliance_controls WHERE project_id = ?1 AND (${SQL_CLASSE_CONTROLE}) <> 'falta') AS controles`).bind(projectId),
      // O que espera a decisão DESTA pessoa neste projeto (cliente ou equipe; o agente MCP não decide pedido).
      !quem.agente
        ? db.prepare(`SELECT DISTINCT p.id, p.tipo, p.titulo, p.papel_exigido, p.criado_em FROM pedidos p JOIN pedido_destinatarios d ON d.pedido_id = p.id
            WHERE ${SQL_ESPERA_A_PESSOA} ORDER BY p.criado_em LIMIT 50`).bind(projectId, quem.id ?? '', quem.email ?? '')
        : db.prepare('SELECT 1 WHERE 0'),
      db.prepare(`SELECT p.nome FROM parte_vinculos v JOIN partes p ON p.id = v.parte_id
          WHERE v.project_id = ?1 AND v.papel = 'encarregado' AND v.alvo_tipo = 'projeto' AND p.status = 'ativa' ORDER BY p.nome`).bind(projectId),
      // Para o cliente no n.iso: a jornada (o próximo marco é a primeira fase não concluída nem pulada).
      quem.cliente && modulos.includes('iso')
        ? db.prepare('SELECT phase_number, title, status FROM project_phases WHERE project_id = ? ORDER BY phase_number').bind(projectId)
        : db.prepare('SELECT 1 WHERE 0'),
    ]),
  ]);
  const [marco, cadastro, pedidos, encs, fases] = base;
  const iso = modulos.includes('iso') ? await blocoIso(db, projectId, dia, quem) : null;
  const privacy = modulos.includes('privacy') ? await blocoPrivacy(db, projectId, quem.cliente, dia) : null;
  const ot = modulos.includes('ot') && quem.id
    ? await blocoOt(db, projectId, { id: quem.id, email: quem.email ?? '', role: quem.role ?? '', org_id: quem.org_id, client_project_id: quem.client_project_id }, dia, new Date()) : null;
  const c = cadastro.results[0] as { tratamentos: number; controles: number };
  const programa = estadoDoPrograma((marco.results[0] as { d: string | null } | undefined)?.d ?? null, c.tratamentos > 0 || c.controles > 0 || (!!ot && !ot.comecando));
  const decisoes = (pedidos.results as { id: string; tipo: string; titulo: string; papel_exigido: string; criado_em: string }[]).map((p) => ({
    id: p.id, titulo: p.titulo, tipo: p.tipo, papel: p.papel_exigido, desde: String(p.criado_em).slice(0, 10),
    acao: p.papel_exigido === 'ciente' ? 'Ler e dar ciência' : 'Ler e aprovar',
  }));
  // Na lista que junta os dois módulos, o n.privacy vem primeiro dentro de cada grupo: o prazo dele é legal.
  const blocos = { ...(privacy ? { privacy } : {}), ...(iso ? { iso } : {}), ...(ot ? { ot } : {}) } as Partial<Record<Modulo, NonNullable<typeof iso> | NonNullable<typeof privacy> | NonNullable<typeof ot>>>;
  const proximoDe = (lista: Proximo[]) => lista.filter((p): p is NonNullable<Proximo> => !!p).sort((a, b) => a.dias - b.dias)[0] ?? null;
  const modulosResp: Record<string, unknown> = {};
  for (const m of modulos) {
    const b = blocos[m];
    if (!b) continue;
    const saude = saudeDoProjeto({ itens: b.itens, comecando: b.comecando, decisoes: decisoes.length, cliente: quem.cliente, proximo: b.proximo });
    // O cliente vê a frase e os números da linha do módulo; a lista, a cobertura, o mapa e os vencimentos são da consultoria.
    modulosResp[m] = quem.cliente
      ? { saude, numeros: b.numeros, comecando: b.comecando, ...(m === 'iso' && iso ? { selos: iso.selos } : {}), ...(m === 'iso' ? { jornada: jornadaDoCliente(fases.results as Fase[]) } : {}) }
      : { saude, numeros: b.numeros, comecando: b.comecando, ...(m === 'iso' && iso ? { selos: iso.selos } : {}), fazer: b.itens, cobertura: b.cobertura, vencimentos: b.vencimentos, riscos: b.riscos, passos: b.passos,
          ...(m === 'privacy' && privacy ? { pedidos_mes: privacy.pedidos_mes, meses_pedidos: privacy.meses_pedidos, acoes_por_prazo: privacy.acoes_por_prazo } : {}) };
  }
  const todos = emOrdem(Object.values(blocos).flatMap((b) => b.itens));
  return {
    gerado_em: new Date().toISOString(),
    visao: quem.cliente ? 'cliente' : 'equipe',
    modulos_pedidos: modulos,
    empresa: empresa && {
      razao_social: empresa.razao_social, nome_fantasia: empresa.nome_fantasia, cnpj: empresa.cnpj, documento_alternativo: empresa.documento_alternativo,
      setor: empresa.setor, cnae_codigo: empresa.cnae_codigo, cnae_descricao: empresa.cnae_descricao, porte: empresa.porte, funcionarios: empresa.funcionarios,
      municipio: empresa.municipio, uf: empresa.uf,
    },
    encarregados: (privacy?.encarregados ?? (encs.results as { nome: string }[])).map((e) => ({ nome: e.nome })),
    programa,
    saude: saudeDoProjeto({ itens: todos, comecando: Object.values(blocos).every((b) => b.comecando), decisoes: decisoes.length, cliente: quem.cliente,
      proximo: proximoDe(Object.values(blocos).map((b) => b.proximo)) }),
    modulos: modulosResp,
    // A equipe recebe a lista só quando há pedido para ela; a frase de saúde ("Sua vez") continua só do cliente.
    ...(quem.cliente || decisoes.length ? { decisoes } : {}),
    ...(privacy ? { selos: privacy.selos } : {}),
  };
}

// ─── Carteira do consultor ──────────────────────────────────────────────────────────────────────────────

export type LinhaCarteira = {
  id: string; nome: string; modulos: Modulo[]; tom: Tom; situacao: string; urgente: string; modulo_urgente: Modulo; ultimo_movimento: string | null;
};

/** Situação de um projeto na carteira, função pura: a mesma ordem da frase (atrasado, atenção, começando, em dia). */
export function situacaoNaCarteira(x: {
  modulos: Modulo[]; pedidos_atrasados: number; comunicacoes_atrasadas: number; acoes_vencidas: number; terceiros_vencidos: number;
  vence_7_dias: number; tratamentos: number; controles: number; proximo: { data: string; rotulo: string } | null;
  sites?: number; desvios_abertos?: number; lotes_revisao?: number; sondas_paradas?: number;
}): { tom: Tom; situacao: string; urgente: string; modulo: Modulo } {
  const priv = x.modulos.includes('privacy');
  const legais = priv ? x.pedidos_atrasados + x.comunicacoes_atrasadas : 0;
  const primeiro = x.modulos[0] ?? 'iso';
  if (legais > 0) {
    return { tom: 'atraso', situacao: plural(legais, 'prazo legal vencido', 'prazos legais vencidos'), modulo: 'privacy',
      urgente: [x.pedidos_atrasados ? plural(x.pedidos_atrasados, 'pedido do titular atrasado', 'pedidos do titular atrasados') : '',
        x.comunicacoes_atrasadas ? plural(x.comunicacoes_atrasadas, 'comunicação de incidente atrasada', 'comunicações de incidente atrasadas') : ''].filter(Boolean).join(' e ') };
  }
  const outros = x.acoes_vencidas + (priv ? x.terceiros_vencidos : 0);
  if (outros > 0) {
    return { tom: 'atraso', situacao: plural(outros, 'prazo vencido', 'prazos vencidos'), modulo: x.acoes_vencidas || !priv ? primeiro : 'privacy',
      urgente: [x.acoes_vencidas ? plural(x.acoes_vencidas, 'ação vencida', 'ações vencidas') : '', priv && x.terceiros_vencidos ? plural(x.terceiros_vencidos, 'fornecedor vencido', 'fornecedores vencidos') : '']
        .filter(Boolean).join(' e ') };
  }
  const temOt = x.modulos.includes('ot');
  const sondas = temOt ? x.sondas_paradas ?? 0 : 0;
  const desvios = temOt ? x.desvios_abertos ?? 0 : 0;
  const lotes = temOt ? x.lotes_revisao ?? 0 : 0;
  const doOt = [sondas ? plural(sondas, 'sonda parada', 'sondas paradas') : '', desvios ? plural(desvios, 'desvio aberto', 'desvios abertos') : '',
    lotes ? plural(lotes, 'lote aguardando revisão', 'lotes aguardando revisão') : ''].filter(Boolean);
  if (sondas > 0) return { tom: 'atraso', situacao: doOt[0], urgente: doOt.join(' e '), modulo: 'ot' };
  if (doOt.length) return { tom: 'semana', situacao: doOt[0], urgente: doOt.join(' e '), modulo: 'ot' };
  if (x.tratamentos === 0 && x.controles === 0 && !(temOt && (x.sites ?? 0) > 0)) return { tom: 'plano', situacao: 'Começando', urgente: 'Nada cadastrado ainda', modulo: primeiro };
  const quando = x.proximo ? `${x.proximo.rotulo} em ${diaMes(x.proximo.data)}` : 'Nenhum prazo nos próximos 90 dias';
  if (x.vence_7_dias > 0) return { tom: 'semana', situacao: plural(x.vence_7_dias, 'prazo nesta semana', 'prazos nesta semana'), urgente: quando, modulo: primeiro };
  return { tom: 'ok', situacao: 'Em dia', urgente: x.proximo ? `Próximo: ${quando}` : quando, modulo: primeiro };
}

const PESO: Record<Tom, number> = { atraso: 0, vez: 1, semana: 2, plano: 3, ok: 4 };

/**
 * A carteira: para os projetos que a pessoa alcança (`visiveis`, de `projetosVisiveis`; null = a plataforma inteira), seis
 * consultas agrupadas por projeto num `db.batch`, nunca o painel projeto a projeto. Só conta o módulo que o projeto tem e a
 * pessoa também tem; projeto sem nenhum desses fica de fora.
 */
export async function carteira(db: D1Database, visiveis: { sql: string; bind: string } | null, modulosDaPessoa: Modulo[], agora = new Date()): Promise<LinhaCarteira[]> {
  const dia = hoje();
  const em7 = somarDias(dia, 7);
  const em90 = somarDias(dia, 90);
  const escopo = visiveis ? `IN (${visiveis.sql.replace(/\?/g, '?9')})` : `IN (SELECT id FROM projects)`;
  // ?1 hoje, ?2 daqui a 7 dias, ?3 daqui a 90, ?9 o escopo. Cada consulta recebe só até o maior índice que usa.
  const args = [dia, em7, em90, null, null, null, null, null, visiveis?.bind ?? null];
  const b = (sql: string) => db.prepare(sql).bind(...args.slice(0, Math.max(0, ...[...sql.matchAll(/\?(\d)/g)].map((m) => Number(m[1])))));
  const [proj, mods, contas, terceiros, proximos, movimento, otContas, otSondas, otCreds] = await db.batch([
    b(`SELECT p.id, COALESCE(NULLIF(e.nome_fantasia, ''), NULLIF(e.razao_social, ''), NULLIF(p.client_name, ''), p.project_name, p.id) AS nome
         FROM projects p LEFT JOIN empresas e ON e.project_id = p.id WHERE p.id ${escopo} ORDER BY nome LIMIT 300`),
    b(`SELECT project_id, modulo FROM projeto_modulos WHERE project_id ${escopo}`),
    b(`SELECT p.id AS project_id,
         (SELECT count(*) FROM titular_pedidos t WHERE t.project_id = p.id AND t.status IN ('recebido', 'em_andamento') AND substr(t.prazo_em, 1, 10) < ?1) AS pedidos_atrasados,
         (SELECT count(*) FROM incidentes i WHERE i.project_id = p.id AND i.status <> 'encerrado' AND COALESCE(i.risco_titular, '') <> 'sem_risco'
            AND ((i.comunicacao_anpd_em IS NULL AND substr(i.prazo_anpd_em, 1, 10) < ?1) OR (i.comunicacao_titular_em IS NULL AND substr(i.prazo_titular_em, 1, 10) < ?1))) AS comunicacoes_atrasadas,
         (SELECT count(*) FROM corrective_actions a WHERE a.project_id = p.id${escopoRopa('todos', 'a.ropa_id')} AND COALESCE(a.status, 'Open') <> 'Closed' AND substr(a.due_date, 1, 10) < ?1) AS acoes_vencidas,
         (SELECT count(*) FROM ropa_records r WHERE r.project_id = p.id AND COALESCE(r.status, '') <> 'Inactive') AS tratamentos,
         (SELECT count(*) FROM compliance_controls c WHERE c.project_id = p.id AND (${sqlClasseControle('c.status')}) <> 'falta') AS controles
       FROM projects p WHERE p.id ${escopo}`),
    b(`SELECT p.project_id, count(*) AS n FROM partes p WHERE p.project_id ${escopo} AND ${SQL_EH_FORNECEDOR}
         AND (SELECT CASE WHEN a.resultado <> 'reprovado' THEN substr(a.valido_ate, 1, 10) END FROM avaliacoes_terceiro a WHERE a.parte_id = p.id ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1) < ?1
       GROUP BY p.project_id`),
    b(`SELECT project_id, tipo, rotulo, data FROM (
         SELECT project_id, 'pedido' AS tipo, 'Pedido ' || protocolo AS rotulo, substr(prazo_em, 1, 10) AS data FROM titular_pedidos WHERE project_id ${escopo} AND status IN ('recebido', 'em_andamento')
         UNION ALL SELECT project_id, 'acao', 'Ação ' || title, substr(due_date, 1, 10) FROM corrective_actions WHERE project_id ${escopo} AND COALESCE(status, 'Open') <> 'Closed'
         UNION ALL SELECT project_id, 'auditoria', title, substr(scheduled_date, 1, 10) FROM audit_schedule WHERE project_id ${escopo} AND COALESCE(status, 'Planned') NOT IN ('Completed', 'Cancelled')
         UNION ALL SELECT project_id, 'evidencia', 'Evidência ' || file_name, substr(valido_ate, 1, 10) FROM evidence WHERE project_id ${escopo} AND valido_ate IS NOT NULL
       ) WHERE data >= ?1 AND data <= ?3 ORDER BY data`),
    b(`SELECT project_id, max(created_at) AS em FROM audit_logs WHERE project_id ${escopo} GROUP BY project_id`),
    // n.ot: só quando a pessoa tem o módulo; senão as três consultas ficam vazias.
    ...(modulosDaPessoa.includes('ot') ? [
      b(`SELECT s.project_id,
           count(*) AS sites,
           sum((SELECT count(*) FROM ot_desvios d WHERE d.site_id = s.id AND d.situacao = 'aberto')) AS desvios_abertos,
           sum((SELECT count(*) FROM ot_lotes l WHERE l.site_id = s.id AND l.status = 'em_revisao')) AS lotes_revisao
         FROM ot_sites s WHERE s.project_id ${escopo} AND s.status = 'ativo' GROUP BY s.project_id`),
      b(`SELECT s.id, s.project_id, s.created_at,
           (SELECT created_at FROM ot_sensor_envios e WHERE e.sensor_id = s.id AND e.situacao = 'concluido' ORDER BY e.created_at DESC LIMIT 1) AS ultimo_envio
         FROM ot_sensores s WHERE s.project_id ${escopo} AND s.situacao = 'ativa'
           AND s.site_id IN (SELECT id FROM ot_sites WHERE project_id = s.project_id AND status = 'ativo') LIMIT ${TETO_LEITURA_OT}`),
      b(`SELECT sensor_id, project_id, expira_em, situacao FROM ot_sensor_credenciais WHERE project_id ${escopo} AND situacao = 'ativa' LIMIT ${TETO_LEITURA_OT}`),
    ] : [b('SELECT 1 WHERE 0'), b('SELECT 1 WHERE 0'), b('SELECT 1 WHERE 0')]),
  ]);
  const porProjeto = <T extends { project_id: string }>(r: D1Result) => {
    const m = new Map<string, T[]>();
    for (const x of r.results as T[]) m.set(x.project_id, [...(m.get(x.project_id) ?? []), x]);
    return m;
  };
  const mm = porProjeto<{ project_id: string; modulo: Modulo }>(mods);
  const cc = porProjeto<{ project_id: string; pedidos_atrasados: number; comunicacoes_atrasadas: number; acoes_vencidas: number; tratamentos: number; controles: number }>(contas);
  const tt = porProjeto<{ project_id: string; n: number }>(terceiros);
  const pp = porProjeto<{ project_id: string; tipo: string; rotulo: string; data: string }>(proximos);
  const mv = porProjeto<{ project_id: string; em: string }>(movimento);
  const oo = porProjeto<{ project_id: string; sites: number; desvios_abertos: number; lotes_revisao: number }>(otContas);
  const sondasPor = porProjeto<{ project_id: string; id: string; created_at: string; ultimo_envio: string | null }>(otSondas);
  const credsOt = otCreds.results as (Cred & { sensor_id: string })[];
  const paradas = (id: string) => (sondasPor.get(id) ?? [])
    .filter((s) => situacaoSensor(s.ultimo_envio ?? s.created_at, credsOt.filter((k) => k.sensor_id === s.id), agora) === 'parada').length;
  const linhas: LinhaCarteira[] = [];
  for (const p of proj.results as { id: string; nome: string }[]) {
    const modulos = (mm.get(p.id) ?? []).map((x) => x.modulo).filter((m) => modulosDaPessoa.includes(m)).sort();
    if (!modulos.length) continue;
    const c = cc.get(p.id)?.[0];
    const prox = pp.get(p.id) ?? [];
    const s = situacaoNaCarteira({
      modulos, pedidos_atrasados: c?.pedidos_atrasados ?? 0, comunicacoes_atrasadas: c?.comunicacoes_atrasadas ?? 0, acoes_vencidas: c?.acoes_vencidas ?? 0,
      terceiros_vencidos: tt.get(p.id)?.[0]?.n ?? 0, vence_7_dias: prox.filter((x) => x.data <= em7).length, tratamentos: c?.tratamentos ?? 0, controles: c?.controles ?? 0,
      proximo: prox[0] ? { data: prox[0].data, rotulo: prox[0].rotulo } : null,
      // shortcut: a carteira conta o projeto inteiro, sem o corte por site; por isso a rota tira o `ot` de quem tem papel de cliente (inclusive o técnico por site). Se a carteira passar a servir cliente, aplicar sitesPermitidos.
      ...(modulos.includes('ot') ? { sites: oo.get(p.id)?.[0]?.sites ?? 0, desvios_abertos: oo.get(p.id)?.[0]?.desvios_abertos ?? 0,
        lotes_revisao: oo.get(p.id)?.[0]?.lotes_revisao ?? 0, sondas_paradas: paradas(p.id) } : {}),
    });
    linhas.push({ id: p.id, nome: p.nome, modulos, tom: s.tom, situacao: s.situacao, urgente: s.urgente, modulo_urgente: s.modulo, ultimo_movimento: mv.get(p.id)?.[0]?.em ?? null });
  }
  return linhas.sort((a, b) => PESO[a.tom] - PESO[b.tom] || a.nome.localeCompare(b.nome, 'pt-BR'));
}
