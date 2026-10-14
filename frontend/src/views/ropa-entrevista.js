import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHTML, renderEmptyState } from '../ui.js';
import { navigate } from '../router.js';
import { BASES_ART7, BASES_ART11, ART11, normaliza, rotuloBase, ehLegitimoInteresse, ehConsentimento, ehArt11, camposDaBase, idsDoCatalogo, textoDaBase } from '../bases-legais.js';
import { parecidos, mesmoEmail } from '../similares.js';
import { podeEditar as podeCadastrar } from './partes.js';

// Entrevista do RoPA (n.privacy): o caminho principal para criar e revisar uma atividade de tratamento, uma pergunta por vez,
// em linguagem de consultor. Desenho em docs/design/diagnostico-2026-10-13/n-privacy-ropa-entrevista.md (seção 4).
// Regras que não se quebram aqui: só a finalidade é exigida pelo servidor (a entrevista exige também titulares e categorias);
// o POST cria sempre rascunho; nada de coluna nova (as respostas sem coluna só alimentam a recomendação de RIPD e o resumo);
// IA só como proposta em base legal e retenção, nunca em sensíveis, crianças e salvaguarda.
// As respostas ficam em memória e na sessionStorage da aba: sair e voltar não perde nada. Gravar é no fim, em lote.

const NAO_SEI = '__nao_sei';
const OUTRO = '__outro';
const NENHUM = '__nenhum';
const AVISO_IA = 'Rascunho gerado por IA: revise antes de usar.';

/** Quem responde: a equipe da consultoria e o administrador do cliente (decisão do dono, 13/10/2026). */
export const podeEntrevistar = () => !!S.user && ['platform_admin', 'consultant', 'consultor', 'consultoria_admin', 'org_admin'].includes(S.user.role);

/** Registro aprovado, ou com aprovação por pedido vigente: gravar substitui o pedido (ropa.ts, conferirPedidosDoDocumento). */
export const temAprovacao = (r) => !!r && (r.status === 'Approved' || !!(r.aprovacao_pedido && (r.aprovacao_pedido.ciso || r.aprovacao_pedido.ceo)));
export async function confirmaEdicaoAprovada(r) {
    if (!temAprovacao(r)) return true;
    return window.confirmar('Esta atividade tem aprovação. Salvar a alteração substitui o pedido de aprovação vigente: a aprovação perde a validade e precisa ser pedida de novo.',
        { titulo: 'Alterar atividade aprovada', rotulo: 'Salvar mesmo assim' });
}

// ─── Vocabulário das perguntas ──────────────────────────────────────────────────────────────────────

const op = (v, r = v, dica = '') => ({ v, r, dica });
const SIM_NAO = [op('sim', 'Sim'), op('nao', 'Não')];
const BLOCOS = { A: 'A atividade', B: 'De quem são os dados', C: 'Quais dados', D: 'Por que a empresa usa', E: 'De onde vêm e onde passam', F: 'Com quem compartilha', G: 'Quanto tempo ficam', H: 'Transferência e riscos' };
const LETRAS = Object.keys(BLOCOS);

const TITULARES = ['Colaboradores', 'Candidatos', 'Ex-colaboradores', 'Dependentes de colaboradores', 'Clientes pessoa física',
    'Representantes de clientes empresariais', 'Visitantes', 'Fornecedores pessoa física', 'Usuários do site ou aplicativo'].map((t) => op(t));
const CATEGORIAS = [op('Identificação', 'Identificação', 'nome, CPF, RG, data de nascimento'), op('Contato', 'Contato', 'e-mail, telefone, endereço'),
    op('Financeiro', 'Financeiro', 'conta bancária, salário, cartão'), op('Profissional', 'Profissional', 'cargo, currículo, avaliações'),
    op('Acesso e uso', 'Acesso e uso', 'login, IP, cookies, registros de acesso'), op('Imagem e voz', 'Imagem e voz', 'foto, vídeo, gravação'),
    op('Localização', 'Localização', 'GPS, endereço de entrega, check-in')];
const SENSIVEIS = [op('Saúde', 'Saúde', 'atestados, exames, plano de saúde'), op('Biometria', 'Biometria', 'digital, reconhecimento facial'),
    op('Origem racial ou étnica'), op('Convicção religiosa'), op('Opinião política'), op('Filiação sindical'), op('Vida sexual'), op('Dado genético')];
const DICAS_ART7 = ['A pessoa autorizou de forma livre, informada e específica, e pode revogar.', 'Uma lei ou norma obriga a empresa (eSocial, obrigação fiscal).',
    'Só para a administração pública.', 'Órgão de pesquisa, anonimizando sempre que possível.', 'Necessário para cumprir contrato com a própria pessoa.',
    'Guardar para se defender em processo judicial, administrativo ou arbitral.', 'Emergência que ameaça a vida ou a integridade física.',
    'Só por profissionais e serviços de saúde.', 'Interesse da empresa que a pessoa razoavelmente espera. Exige o teste de balanceamento (LIA).',
    'Análise de risco e cobrança de crédito.'];
const DICAS_ART11 = ['Consentimento específico e destacado, para finalidade específica.', 'Uma lei ou norma obriga a empresa.', 'Só para a administração pública.',
    'Órgão de pesquisa, anonimizando sempre que possível.', 'Defesa em processo, inclusive em contrato.', 'Emergência que ameaça a vida ou a integridade física.',
    'Só por profissionais e serviços de saúde.', 'Identificação e autenticação em sistemas, para prevenir fraude.'];
// Motivo em linguagem leiga → hipótese do art. 7 e a do art. 11 (null: não serve para dado sensível).
const MOTIVOS = [
    { ...op('lei', 'A lei ou uma norma obriga'), b7: BASES_ART7[1], b11: ART11(BASES_ART11[1]) },
    { ...op('contrato', 'Há contrato com a própria pessoa'), b7: BASES_ART7[4], b11: ART11(BASES_ART11[4]) },
    { ...op('autorizou', 'A pessoa autorizou'), b7: BASES_ART7[0], b11: ART11(BASES_ART11[0]) },
    { ...op('defesa', 'Defender direitos em processo'), b7: BASES_ART7[5], b11: ART11(BASES_ART11[4]) },
    { ...op('saude', 'Proteger a vida ou a saúde'), b7: BASES_ART7[7], b11: ART11(BASES_ART11[6]) },
    { ...op('interesse', 'A empresa tem um interesse legítimo e a pessoa espera isso'), b7: BASES_ART7[8], b11: null },
    { ...op('credito', 'Analisar ou proteger crédito'), b7: BASES_ART7[9], b11: null },
    { ...op(OUTRO, 'Outro motivo'), b7: null, b11: null },
];
const RETENCOES = ['Durante o contrato e mais 5 anos', '5 anos (obrigação fiscal e contábil)', 'Durante o processo seletivo e mais 6 meses', 'Até a pessoa pedir a exclusão'].map((t) => op(t));
const MECANISMOS = ['País com nível adequado reconhecido pela ANPD', 'Cláusulas-padrão contratuais (Res. CD/ANPD 19/2024)', 'Normas corporativas globais',
    'Consentimento específico e destacado', 'Ainda sem mecanismo definido'];
const SEM_MECANISMO = MECANISMOS[4];
const PAISES = ['Estados Unidos', 'Irlanda', 'Países Baixos', 'Alemanha', 'Reino Unido', 'Singapura'];
const CONCLUSOES_LIA = [op('prevalece', 'O interesse da empresa prevalece'), op('nao_prevalece', 'Os direitos da pessoa prevalecem')];
const VOLUME_ALTO = ['10mil-100mil', '100mil+'];
// "Cadastrar agora" de sistema ou arquivo: as categorias do inventário de ativos (monitor.js, openNewAssetModal), menos Pessoas.
const CATEGORIAS_ITEM = [op('Software', 'Sistema (software, aplicativo, API)'), op('Informacao', 'Arquivo ou base de dados'), op('Hardware', 'Equipamento')];
const ROTULO_CATEGORIA = { Software: 'sistema', Informacao: 'arquivo ou base', Hardware: 'equipamento', Pessoas: 'pessoas' };
// O que cada "Cadastrar agora" cria, pela rota de sempre do cadastro (partes.js, monitor.js).
// Um literal /api/v1 por rota: test/contrato-tela-api.test.ts só confere o que consegue ler no fonte.
const criarCadastro = (tipo, pid, corpo) =>
    tipo === 'pessoa' ? api('POST', `/api/v1/projects/${pid}/partes`, corpo)
    : tipo === 'area' ? api('POST', `/api/v1/projects/${pid}/departamentos`, corpo)
    : api('POST', `/api/v1/projects/${pid}/assets`, corpo);
// Parecidos por SIGNIFICADO (servidor, embeddings): só sistema/arquivo e área. Pessoa nunca vai ao modelo; a regra de similares.js é a única.
const buscarPorSignificado = (pid, corpo) => api('POST', `/api/v1/projects/${pid}/similares`, corpo);
const ESPERA_SIGNIFICADO = 600;
const significado = { timer: null, seq: 0 };

const CADASTROS = {
    pessoa: { nome: 'Pessoa', lista: 'pessoas', detalhe: (x) => x.email || 'pessoa',
        corpo: (f) => ({ tipo: 'pessoa', nome: f.nome, email: f.email || null }), novo: (id, f) => ({ id, nome: f.nome, email: f.email || null, tipo: 'pessoa', status: 'ativa' }) },
    area: { nome: 'Área', lista: 'deptos', detalhe: () => 'área',
        corpo: (f) => ({ nome: f.nome }), novo: (id, f) => ({ id, nome: f.nome }) },
    item: { nome: 'Sistema ou arquivo', lista: 'itens', detalhe: (x) => ROTULO_CATEGORIA[x.category] || 'item',
        corpo: (f) => ({ name: f.nome, category: f.categoria }), novo: (id, f) => ({ id, name: f.nome, category: f.categoria }) },
};

const temSensivel = (r) => Array.isArray(r.sensiveis) && r.sensiveis.some((x) => x !== NENHUM);
const valor = (r, id) => (r[id] === NAO_SEI ? undefined : r[id]);
const basesPermitidas = (r) => (temSensivel(r) ? BASES_ART11.map((b, i) => op(ART11(b), b, DICAS_ART11[i])) : BASES_ART7.map((b, i) => op(b, b, DICAS_ART7[i])));

/** Por que recomendar o RIPD (art. 38), a partir das respostas. Vazio: nenhum gatilho de alto risco. */
export function motivosRipd(r) {
    return [
        temSensivel(r) && 'há dado sensível',
        r.criancas === 'sim' && 'há dados de crianças ou adolescentes',
        VOLUME_ALTO.includes(r.volume) && 'são mais de 10 mil pessoas',
        r.decisao_auto === 'sim' && 'há decisão automatizada sobre pessoas',
        r.impacto === 'alto' && 'um vazamento pode causar dano sério às pessoas',
    ].filter(Boolean);
}

const AVISO_ART14 = 'Art. 14 da LGPD: dados de crianças e adolescentes são tratados no melhor interesse deles. Se a base for o consentimento, ele precisa ser dado por um dos pais ou pelo responsável legal, de forma específica e destacada. Recomendamos o RIPD.';
const AVISO_ART11 = 'Art. 11 da LGPD: dado sensível só pode ser tratado nas hipóteses do art. 11, mais restritas que as do art. 7. Na pergunta da base legal, mostramos só elas. Recomendamos o RIPD.';

/**
 * As perguntas, na ordem. `mostrar` decide as condicionais; `obrigatoria` não aceita "Não sei agora"; `curto` é o rótulo do resumo.
 * Ajuda e exemplos ficam aqui, no frontend: o servidor não sabe da entrevista.
 */
const PERGUNTAS = [
    { id: 'finalidade', bloco: 'A', tipo: 'texto', obrigatoria: true, max: 200, curto: 'Atividade',
        titulo: 'Qual atividade da empresa usa dados de pessoas?',
        ajuda: 'Cada atividade vira uma linha do inventário que a ANPD pode pedir (art. 37 da LGPD). Use o nome que a empresa usa no dia a dia.',
        exemplos: ['Folha de pagamento', 'Recrutamento e seleção', 'Cadastro e atendimento de clientes', 'Cobrança', 'Controle de acesso e câmeras', 'Marketing e newsletter', 'Canal de denúncias', 'Gestão de fornecedores'] },
    { id: 'para_que', bloco: 'A', tipo: 'texto', max: 280, curto: 'Para que serve',
        // Só na atividade nova: na revisão, a finalidade gravada já é a frase inteira.
        mostrar: (r, c) => !(c && c.registro) && String(r.finalidade || '').trim().length <= 40,
        titulo: 'Em uma frase, para que essa atividade serve?',
        ajuda: 'A finalidade precisa ser específica: "RH" não basta. A frase entra junto com o nome da atividade.',
        exemplos: ['Pagar salários e recolher encargos', 'Escolher quem contratar para as vagas abertas', 'Responder pedidos e reclamações de clientes'] },
    { id: 'responsavel', bloco: 'A', tipo: 'unica', curto: 'Responsável', cadastro: 'pessoa',
        opcoes: (ctx) => ctx.pessoas.map((p) => op(p.id, p.nome, p.email || '')),
        titulo: 'Quem responde por essa atividade na empresa?',
        ajuda: 'É quem explica o fluxo dos dados se a ANPD ou o titular perguntarem. As opções vêm do cadastro de partes do projeto.' },
    { id: 'areas', bloco: 'A', tipo: 'multipla', curto: 'Áreas', cadastro: 'area',
        opcoes: (ctx) => ctx.deptos.map((d) => op(d.id, d.nome)),
        titulo: 'Qual área executa a atividade?',
        ajuda: 'Delimita quem acessa os dados e quem precisa de treinamento. As áreas vêm do cadastro de departamentos.' },
    { id: 'titulares', bloco: 'B', tipo: 'multipla', obrigatoria: true, curto: 'Titulares', outro: 'Outro grupo', opcoes: () => TITULARES,
        titulo: 'De quem são os dados que a atividade usa?',
        ajuda: 'Os direitos e os prazos mudam conforme a pessoa (art. 18). Marque todos os grupos.' },
    { id: 'criancas', bloco: 'B', tipo: 'unica', curto: 'Crianças ou adolescentes', opcoes: () => SIM_NAO,
        titulo: 'Há crianças ou adolescentes (menores de 18 anos) entre essas pessoas?',
        ajuda: 'Menores têm proteção reforçada na lei. Exemplos: dependentes em plano de saúde, alunos, menores aprendizes.',
        aviso: (r) => (r.criancas === 'sim' ? AVISO_ART14 : '') },
    { semColuna: true, id: 'volume', bloco: 'B', tipo: 'unica', curto: 'Quantas pessoas',
        opcoes: () => [op('ate100', 'Até 100'), op('100-10mil', 'De 100 a 10 mil'), op('10mil-100mil', 'De 10 mil a 100 mil'), op('100mil+', 'Mais de 100 mil')],
        titulo: 'Mais ou menos quantas pessoas?',
        ajuda: 'Tratamento em larga escala é um dos critérios para o relatório de impacto. Esta resposta não fica gravada: serve à recomendação do RIPD.' },
    { id: 'categorias', bloco: 'C', tipo: 'multipla', obrigatoria: true, curto: 'Tipos de dado', outro: 'Outro tipo', opcoes: () => CATEGORIAS,
        titulo: 'Que tipos de dado a atividade usa?',
        ajuda: 'É o coração do inventário: sem saber quais dados, não há análise de risco. Dados sensíveis vêm na próxima pergunta.' },
    { id: 'sensiveis', bloco: 'C', tipo: 'multipla', curto: 'Dados sensíveis', nenhum: 'Nenhum destes', outro: 'Outro dado sensível', opcoes: () => SENSIVEIS,
        titulo: 'Algum destes dados sensíveis aparece?',
        ajuda: 'Dado sensível exige base legal mais restrita e quase sempre o relatório de impacto (art. 11).',
        aviso: (r) => (temSensivel(r) ? AVISO_ART11 : '') },
    { semColuna: true, id: 'decisao_auto', bloco: 'C', tipo: 'unica', curto: 'Decisão automática', opcoes: () => SIM_NAO,
        titulo: 'A atividade toma decisão automática sobre pessoas?',
        ajuda: 'Exemplos: pontuação de crédito, triagem automática de candidatos. A pessoa pode pedir revisão (art. 20). Esta resposta serve à recomendação do RIPD.' },
    { id: 'motivo', bloco: 'D', tipo: 'unica', curto: 'Motivo', opcoes: () => MOTIVOS,
        titulo: 'Qual destes motivos descreve melhor por que a empresa usa esses dados?',
        ajuda: 'A base legal responde "com que direito a empresa trata esse dado?" (arts. 7 e 11). O motivo escolhido já marca a hipótese na próxima pergunta, onde você confirma.' },
    { id: 'base', bloco: 'D', tipo: 'unica', curto: 'Base legal', opcoes: (ctx, r) => basesPermitidas(r), sugerir: 'base',
        titulo: 'Confirme a hipótese legal',
        ajuda: 'É o texto que vai para o relatório do RoPA e para os pedidos de aprovação. Com dado sensível, só as hipóteses do art. 11 aparecem.' },
    { id: 'consentimento', bloco: 'D', tipo: 'longo', curto: 'Como o consentimento é colhido', max: 5000, mostrar: (r) => ehConsentimento(valor(r, 'base')),
        titulo: 'Como o consentimento é pedido e guardado?',
        ajuda: 'Consentimento só vale se for livre, informado e comprovável (art. 8). Com crianças, quem consente é um dos pais ou o responsável legal (art. 14).',
        exemplos: ['Caixa marcada no formulário, com data e versão do aviso de privacidade', 'Termo assinado pelo titular ou pelo responsável legal'] },
    { id: 'lia', bloco: 'D', tipo: 'grupo', curto: 'Teste de legítimo interesse (LIA)', mostrar: (r) => ehLegitimoInteresse(valor(r, 'base')),
        titulo: 'Vamos registrar o teste de legítimo interesse (LIA)?',
        ajuda: 'A LIA é a prova de que o interesse da empresa foi pesado contra os direitos da pessoa. Sem ela, o painel do encarregado mostra pendência. Pode responder depois ("Não sei agora").',
        sub: [
            { id: 'finalidade_legitima', rotulo: 'Qual é o interesse da empresa?', tipo: 'longo' },
            { id: 'necessidade', rotulo: 'Dá para atingir o objetivo sem esses dados, ou com menos dados?', tipo: 'longo' },
            { id: 'balanceamento', rotulo: 'O que a pessoa espera e que impacto ela sofre?', tipo: 'longo' },
            { id: 'salvaguardas', rotulo: 'Que medidas reduzem esse impacto?', tipo: 'longo' },
            { id: 'conclusao', rotulo: 'Conclusão', tipo: 'select', opcoes: CONCLUSOES_LIA },
        ] },
    { semColuna: true, id: 'origem', bloco: 'E', tipo: 'multipla', curto: 'Origem dos dados',
        opcoes: () => ['A própria pessoa', 'Outro sistema da empresa', 'Parceiro ou fornecedor', 'Fonte pública', 'Base comprada ou licenciada'].map((t) => op(t)),
        titulo: 'De onde vêm os dados?',
        ajuda: 'Dado recebido de terceiro exige conferir a origem e informar o titular (art. 9). Esta resposta não fica gravada: aparece no resumo.' },
    { id: 'sistemas', bloco: 'E', tipo: 'multipla', curto: 'Sistemas e arquivos', cadastro: 'item',
        opcoes: (ctx) => ctx.itens.map((i) => op(i.id, i.nome || i.name || '', ROTULO_CATEGORIA[i.category] || '')),
        titulo: 'Em quais sistemas ou arquivos esses dados passam?',
        ajuda: 'Mostra onde procurar o dado e onde aplicar segurança, e desenha o diagrama do tratamento. As opções vêm dos itens do projeto.' },
    { id: 'compartilha', bloco: 'F', tipo: 'unica', curto: 'Compartilha com terceiros', opcoes: () => SIM_NAO,
        titulo: 'A empresa envia esses dados para alguém de fora?',
        ajuda: 'Compartilhar sem informar o titular é irregular (art. 9, V). Conta contabilidade externa, plano de saúde, órgãos públicos, provedores.' },
    { id: 'destinatarios', bloco: 'F', tipo: 'texto', curto: 'Para quem', max: 500, mostrar: (r) => r.compartilha === 'sim',
        titulo: 'Para quem a empresa envia?',
        ajuda: 'Operador (trata os dados em nome da empresa) e controlador respondem de forma diferente (arts. 39 e 42). Para ligar as partes do cadastro, use as Ligações depois.',
        exemplos: ['Contabilidade externa', 'Receita Federal e INSS', 'Operadora do plano de saúde', 'Provedor de nuvem'] },
    { id: 'retencao', bloco: 'G', tipo: 'unica', curto: 'Retenção', outro: 'Outro prazo', opcoes: () => RETENCOES, sugerir: 'retencao',
        titulo: 'Por quanto tempo a empresa guarda esses dados?',
        ajuda: 'Guardar além do necessário é infração: a lei pede eliminar quando a finalidade acaba (arts. 15 e 16).' },
    { semColuna: true, id: 'eliminacao', bloco: 'G', tipo: 'unica', curto: 'Como elimina',
        opcoes: () => ['Exclusão do sistema', 'Anonimização', 'Descarte físico seguro', 'Ainda não definimos'].map((t) => op(t)),
        titulo: 'Como o dado é eliminado ao fim do prazo?',
        ajuda: 'O inventário deve mostrar que o prazo é cumprido. Esta resposta não fica gravada: aparece no resumo.' },
    { id: 'transferencia', bloco: 'H', tipo: 'unica', curto: 'Transferência internacional', opcoes: () => SIM_NAO,
        titulo: 'Algum desses dados vai para fora do Brasil, ou fica em servidor no exterior?',
        ajuda: 'Transferência exige mecanismo legal (arts. 33 a 36). Quase todo provedor de nuvem estrangeiro entra aqui: e-mail em nuvem, sistema de RH hospedado fora, suporte de fornecedor internacional.' },
    { id: 'transf_destino', bloco: 'H', tipo: 'grupo', curto: 'País e salvaguarda', mostrar: (r) => r.transferencia === 'sim',
        titulo: 'Para qual país, e com qual proteção?',
        ajuda: 'Transferência sem mecanismo registrado é irregular. Para mais de um país, registre os outros nas Ligações depois.',
        sub: [
            { id: 'pais', rotulo: 'País', tipo: 'texto', lista: PAISES },
            { id: 'mecanismo', rotulo: 'Mecanismo de proteção (salvaguarda)', tipo: 'select', opcoes: MECANISMOS.map((m) => op(m)) },
        ] },
    { semColuna: true, id: 'impacto', bloco: 'H', tipo: 'unica', curto: 'Impacto de um vazamento',
        opcoes: () => [op('baixo', 'Pouco ou nada'), op('medio', 'Constrangimento ou transtorno'), op('alto', 'Prejuízo financeiro, discriminação ou dano à imagem')],
        titulo: 'Se esses dados vazassem, o que aconteceria com as pessoas?',
        ajuda: 'Mede o risco ao titular, que decide o relatório de impacto. Esta resposta serve à recomendação do RIPD.' },
    { id: 'ripd', bloco: 'H', tipo: 'unica', curto: 'Exige RIPD', opcoes: () => SIM_NAO,
        titulo: 'Esta atividade precisa de relatório de impacto, o RIPD (DPIA)?',
        ajuda: 'O RIPD é exigido em tratamento de alto risco (art. 38). A recomendação abaixo sai das suas respostas; a decisão é sua e fica registrada.' },
    { id: 'criar_ripd', bloco: 'H', tipo: 'unica', curto: 'Criar o RIPD agora', opcoes: () => SIM_NAO, mostrar: (r, ctx) => r.ripd === 'sim' && !ctx.temDpia,
        titulo: 'Quer criar o RIPD agora, a partir desta atividade?',
        ajuda: 'O RIPD nasce como rascunho, já preenchido com o que esta entrevista registrou. Você completa na tela de RIPD.' },
];
const PERGUNTA = Object.fromEntries(PERGUNTAS.map((p) => [p.id, p]));

// ─── Estado ─────────────────────────────────────────────────────────────────────────────────────────

let st = null;   // { chave, projectId, recordId, passo, respostas, voltarAoResumo, sugestao, salvo, erros }
let ctx = null;  // o que veio do servidor: pessoas, deptos, itens, catálogo, registro, ligações, LIA

const chaveDe = (projectId, recordId) => `ropa-entrevista:${projectId}:${recordId || 'nova'}`;
function guardar() {
    try { sessionStorage.setItem(st.chave, JSON.stringify({ passo: st.passo, respostas: st.respostas, recordId: st.recordId, criados: st.criados })); } catch (e) { /* sem storage: fica em memória */ }
}
function lerGuardado(chave) {
    try { const v = JSON.parse(sessionStorage.getItem(chave) || 'null'); return v && typeof v === 'object' && v.respostas ? v : null; } catch (e) { return null; }
}
function esquecer() { try { sessionStorage.removeItem(st.chave); } catch (e) { /* idem */ } }

const visiveis = () => PERGUNTAS.filter((p) => !p.mostrar || p.mostrar(st.respostas, ctx));
const opcoesDe = (p) => (p.opcoes ? p.opcoes(ctx, st.respostas) : []);
const args = (...v) => escapeHTML(JSON.stringify(v));
const vazio = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
    || (typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => String(x || '').trim()));

// ─── Leitura do servidor e pré-preenchimento ──────────────────────────────────────────────────────

const lista = (r) => (Array.isArray(r) ? r : []);
async function tentar(fazer, padrao) { try { return await fazer(); } catch (e) { return padrao; } }

async function carregar(projectId, recordId) {
    const c = { pessoas: [], deptos: [], itens: [], catalogo: new Set(), registro: null, ligacoes: null, lia: null, temDpia: false, transferencias: [], inicial: {} };
    c.pessoas = lista(await tentar(() => api('GET', `/api/v1/projects/${projectId}/partes?tipo=pessoa&status=ativa`), []));
    c.deptos = lista(await tentar(() => api('GET', `/api/v1/projects/${projectId}/departamentos`), []));
    const ativos = await tentar(() => api('GET', `/api/v1/projects/${projectId}/assets`), []);
    c.itens = Array.isArray(ativos) ? ativos : lista(ativos && ativos.assets);
    c.catalogo = await idsDoCatalogo(api);
    if (!Array.isArray(S.ropa) || (recordId && !S.ropa.some((x) => x.id === recordId))) S.ropa = lista(await tentar(() => api('GET', `/api/v1/projects/${projectId}/ropa`), []));
    if (recordId) {
        c.registro = S.ropa.find((x) => x.id === recordId) || null;
        c.ligacoes = await tentar(() => api('GET', `/api/v1/projects/${projectId}/ropa/${recordId}/ligacoes`), null);
        c.lia = (await tentar(() => api('GET', `/api/v1/projects/${projectId}/ropa/${recordId}/lia`), {}))?.lia || null;
        c.temDpia = !!(c.ligacoes && lista(c.ligacoes.dpias).length);
        c.transferencias = lista(c.ligacoes && c.ligacoes.transferencias);
    }
    return c;
}

/** Texto separado por vírgula → opções conhecidas e o resto em "Outro". */
function separar(texto, opcoes) {
    const partes = String(texto || '').split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean);
    const achadas = [], resto = [];
    for (const t of partes) { const o = opcoes.find((x) => normaliza(x.v) === normaliza(t)); if (o) achadas.push(o.v); else resto.push(t); }
    return { achadas, resto };
}

/** As respostas de um registro existente. O que a importação não informou (nao_informado) fica sem resposta, não vira "não". */
export function respostasDoRegistro(r, c) {
    const nao = new Set(Array.isArray(r.nao_informado) ? r.nao_informado : []);
    const flag = (coluna) => (nao.has(coluna) ? undefined : r[coluna] ? 'sim' : 'nao');
    const out = { finalidade: r.processing_purpose || '' };
    if (r.owner_parte_id && c.pessoas.some((p) => p.id === r.owner_parte_id)) out.responsavel = r.owner_parte_id;
    // Registro antigo com o responsável só em texto: o texto fica à vista (e no PUT, por omissão) até alguém ligar a pessoa.
    else if (r.owner || r.owner_parte_nome) out.responsavel_texto = r.owner || r.owner_parte_nome;
    if (c.ligacoes) {
        out.areas = lista(c.ligacoes.departamentos).map((d) => d.id);
        out.sistemas = lista(c.ligacoes.itens).map((i) => i.id);
    }
    const tit = separar(r.data_subjects, TITULARES);
    if (tit.achadas.length || tit.resto.length) { out.titulares = [...tit.achadas, ...(tit.resto.length ? [OUTRO] : [])]; out.titulares_outro = tit.resto.join(', '); }
    out.criancas = flag('criancas_adolescentes');
    const cat = separar(r.data_categories, CATEGORIAS);
    const sens = separar(cat.resto.join(', '), SENSIVEIS);
    if (cat.achadas.length || sens.resto.length) { out.categorias = [...cat.achadas, ...(sens.resto.length ? [OUTRO] : [])]; out.categorias_outro = sens.resto.join(', '); }
    if (!nao.has('dados_sensiveis')) out.sensiveis = r.dados_sensiveis ? (sens.achadas.length ? sens.achadas : [OUTRO]) : [NENHUM];
    const base = rotuloBase(r.legal_basis || textoDaBase(r.base_legal_id) || '');
    if (base) {
        out.base = base;
        const m = MOTIVOS.find((x) => x.b7 === base || x.b11 === base);
        if (m) out.motivo = m.v;
    }
    if (r.consent_details) out.consentimento = r.consent_details;
    if (c.lia) out.lia = Object.fromEntries(PERGUNTA.lia.sub.map((s) => [s.id, c.lia[s.id] || '']));
    if (r.recipients) { out.compartilha = 'sim'; out.destinatarios = r.recipients; }
    if (r.retention_period) {
        if (RETENCOES.some((o) => o.v === r.retention_period)) out.retencao = r.retention_period;
        else { out.retencao = OUTRO; out.retencao_outro = r.retention_period; }
    }
    out.transferencia = flag('international_transfers');
    if (r.international_transfers && r.transfer_safeguards) out.transf_destino = { pais: '', mecanismo: MECANISMOS.includes(r.transfer_safeguards) ? r.transfer_safeguards : '' };
    out.ripd = r.dpia_required ? 'sim' : 'nao';
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
}

// ─── O que vai para a API ────────────────────────────────────────────────────────────────────────

const comOutro = (r, id) => {
    const v = valor(r, id);
    if (!Array.isArray(v)) return null;
    const outro = String(r[`${id}_outro`] || '').trim();
    return [...v.filter((x) => x !== OUTRO && x !== NENHUM), ...(v.includes(OUTRO) && outro ? [outro] : [])];
};
const simNao = (v) => (v === 'sim' ? 1 : v === 'nao' ? 0 : undefined);

/**
 * Corpo do POST/PUT do registro a partir das respostas. Resposta ausente ou "Não sei agora" não entra: no registro novo fica vazio,
 * no existente o valor gravado fica como está. Base legal: o texto e o id do catálogo saem juntos (camposDaBase).
 */
export function montarPayload(r, c) {
    const b = {};
    const para = String(valor(r, 'para_que') || '').trim();
    const fin = String(r.finalidade || '').trim();
    b.processing_purpose = para && PERGUNTA.para_que.mostrar(r, c) ? `${fin}: ${para}` : fin;
    // O responsável é sempre uma pessoa do cadastro; sem escolha, o owner gravado (inclusive o texto antigo) fica como está.
    const resp = valor(r, 'responsavel');
    const p = resp && c.pessoas.find((x) => x.id === resp);
    if (p) { b.owner_parte_id = p.id; b.owner = p.nome; }
    const tit = comOutro(r, 'titulares');
    if (tit) b.data_subjects = tit.join(', ');
    const cat = comOutro(r, 'categorias');
    const sens = comOutro(r, 'sensiveis');
    if (cat || sens) b.data_categories = [...(cat || []), ...(sens || [])].join(', ');
    if (Array.isArray(valor(r, 'sensiveis'))) b.dados_sensiveis = temSensivel(r) ? 1 : 0;
    if (simNao(valor(r, 'criancas')) !== undefined) b.criancas_adolescentes = simNao(r.criancas);
    const base = valor(r, 'base');
    if (base) Object.assign(b, camposDaBase(base, c.catalogo));
    if (base && ehConsentimento(base) && String(valor(r, 'consentimento') || '').trim()) b.consent_details = r.consentimento.trim();
    if (r.compartilha === 'sim' && String(valor(r, 'destinatarios') || '').trim()) b.recipients = r.destinatarios.trim();
    else if (r.compartilha === 'nao') b.recipients = null;
    const ret = valor(r, 'retencao');
    if (ret === OUTRO) { const t = String(r.retencao_outro || '').trim(); if (t) b.retention_period = t; } else if (ret) b.retention_period = ret;
    if (simNao(valor(r, 'transferencia')) !== undefined) b.international_transfers = simNao(r.transferencia);
    const mec = r.transferencia === 'sim' && r.transf_destino && r.transf_destino !== NAO_SEI ? r.transf_destino.mecanismo : '';
    if (mec) b.transfer_safeguards = mec === SEM_MECANISMO ? null : mec;
    if (simNao(valor(r, 'ripd')) !== undefined) b.dpia_required = simNao(r.ripd);
    return b;
}

/** O que falta no resumo: pergunta visível sem resposta ou com "Não sei agora", e as pendências que derivam das respostas. */
export function pendencias(r, c) {
    // Fora da lista: o motivo (só prepara a base), "criar o RIPD" (tem pendência própria logo abaixo) e as perguntas sem coluna no
    // registro, que só alimentam a recomendação de RIPD: na revisão de uma atividade salva elas voltam sempre vazias.
    const lista = PERGUNTAS.filter((p) => (!p.mostrar || p.mostrar(r, c)) && !p.semColuna && !['para_que', 'motivo', 'criar_ripd'].includes(p.id) && (r[p.id] === NAO_SEI || vazio(r[p.id])))
        .map((p) => ({ bloco: p.bloco, texto: p.id === 'responsavel' && r.responsavel_texto ? 'Responsável só em texto: escolha ou cadastre a pessoa' : `Sem resposta: ${p.curto}` }));
    const mec = r.transf_destino && r.transf_destino !== NAO_SEI ? r.transf_destino.mecanismo : '';
    if (r.transferencia === 'sim' && mec === SEM_MECANISMO) lista.push({ bloco: 'H', texto: 'Transferência internacional sem salvaguarda definida' });
    if (r.ripd === 'sim' && !c.temDpia && r.criar_ripd !== 'sim') lista.push({ bloco: 'H', texto: 'RIPD exigido e ainda não criado' });
    if (temSensivel(r) && valor(r, 'base') && !ehArt11(r.base)) lista.push({ bloco: 'D', texto: 'Base legal do art. 7 com dado sensível: escolha uma hipótese do art. 11' });
    return lista;
}

// ─── Desenho ─────────────────────────────────────────────────────────────────────────────────────

function controle(p) {
    const r = st.respostas;
    const v = r[p.id] === NAO_SEI ? undefined : r[p.id];
    const ex = p.exemplos ? `<div class="re-exemplos" aria-label="Exemplos">${p.exemplos.map((e) =>
        `<button type="button" class="chip" data-action="reExemplo" data-args='${args(p.id, e)}'>${escapeHTML(e)}</button>`).join('')}</div>` : '';
    if (p.tipo === 'texto') {
        return `<input class="form-input" id="re-campo" type="text" maxlength="${p.max || 500}" aria-labelledby="re-titulo" aria-describedby="re-erro"
            value="${escapeHTML(v || '')}" data-action-input="reTexto" data-args='${args(p.id)}' data-arg-val>${ex}`;
    }
    if (p.tipo === 'longo') {
        return `<textarea class="form-input" id="re-campo" rows="4" maxlength="${p.max || 5000}" aria-labelledby="re-titulo" aria-describedby="re-erro"
            data-action-input="reTexto" data-args='${args(p.id)}' data-arg-val>${escapeHTML(v || '')}</textarea>${ex}`;
    }
    if (p.tipo === 'grupo') {
        const g = v && typeof v === 'object' ? v : {};
        return p.sub.map((s) => {
            const idc = `re-sub-${s.id}`;
            const val = g[s.id] || '';
            const campo = s.tipo === 'select'
                ? `<select class="form-input" id="${idc}" data-action-change="reSub" data-args='${args(p.id, s.id)}' data-arg-val><option value="">Escolha</option>${s.opcoes.map((o) =>
                    `<option value="${escapeHTML(o.v)}" ${o.v === val ? 'selected' : ''}>${escapeHTML(o.r)}</option>`).join('')}</select>`
                : s.tipo === 'longo'
                    ? `<textarea class="form-input" id="${idc}" rows="3" maxlength="5000" data-action-input="reSub" data-args='${args(p.id, s.id)}' data-arg-val>${escapeHTML(val)}</textarea>`
                    : `<input class="form-input" id="${idc}" type="text" maxlength="100" value="${escapeHTML(val)}" ${s.lista ? `list="${idc}-lista"` : ''} data-action-input="reSub" data-args='${args(p.id, s.id)}' data-arg-val>${s.lista ? `<datalist id="${idc}-lista">${s.lista.map((x) => `<option value="${escapeHTML(x)}"></option>`).join('')}</datalist>` : ''}`;
            return `<div class="form-group"><label class="form-label" for="${idc}">${escapeHTML(s.rotulo)}</label>${campo}</div>`;
        }).join('');
    }
    const multipla = p.tipo === 'multipla';
    const marcados = multipla ? (Array.isArray(v) ? v : []) : [v];
    const opcoes = [...opcoesDe(p), ...(p.outro ? [op(OUTRO, p.outro)] : []), ...(p.nenhum ? [op(NENHUM, p.nenhum)] : [])];
    const busca = p.cadastro ? normaliza((st.busca || {})[p.id]) : '';
    const itens = opcoes.map((o, i) => `<label class="re-opcao" for="re-op-${i}" ${p.cadastro ? `data-busca="${escapeHTML(normaliza(`${o.r} ${o.dica}`))}"` : ''} ${busca && !normaliza(`${o.r} ${o.dica}`).includes(busca) ? 'hidden' : ''}>
            <input type="${multipla ? 'checkbox' : 'radio'}" id="re-op-${i}" name="re-${escapeHTML(p.id)}" value="${escapeHTML(o.v)}" ${marcados.includes(o.v) ? 'checked' : ''}
                data-action-change="${multipla ? 'reMarcar' : 'reEscolher'}" data-args='${args(p.id)}' data-arg-el>
            <span class="re-opcao-texto">${escapeHTML(o.r)}${o.dica ? `<span class="re-opcao-dica">${escapeHTML(o.dica)}</span>` : ''}</span></label>`).join('');
    const outro = p.outro && marcados.includes(OUTRO)
        ? `<div class="form-group re-outro"><label class="form-label" for="re-outro">${escapeHTML(p.outro)}: qual?</label>
            <input class="form-input" id="re-outro" type="text" maxlength="300" value="${escapeHTML(r[`${p.id}_outro`] || '')}" data-action-input="reTexto" data-args='${args(`${p.id}_outro`)}' data-arg-val></div>` : '';
    const semOpcao = !opcoes.length ? '<p class="re-nota">Nada cadastrado neste projeto ainda.</p>' : '';
    const campoBusca = p.cadastro && opcoes.length ? `<div class="form-group re-busca"><label class="form-label" for="re-busca">Buscar na lista</label>
        <input class="form-input" id="re-busca" type="search" maxlength="100" autocomplete="off" value="${escapeHTML((st.busca || {})[p.id] || '')}" data-action-input="reBuscar" data-args='${args(p.id)}' data-arg-val>
        <p class="re-nota" id="re-busca-vazia" aria-live="polite">${busca && !opcoes.some((o) => normaliza(`${o.r} ${o.dica}`).includes(busca)) ? 'Nada na lista com esse nome.' : ''}</p></div>` : '';
    return `${campoBusca}<div class="re-opcoes" role="${multipla ? 'group' : 'radiogroup'}" aria-labelledby="re-titulo">${itens}</div>${semOpcao}${outro}${p.cadastro ? blocoCadastro(p) : ''}`;
}

// ─── "Cadastrar agora" (pessoa, área, sistema ou arquivo) ──────────────────────────────────────────

/** Os existentes do cadastro da pergunta, no formato de similares.js: { id, nome, email?, detalhe }. */
function existentesDe(tipo) {
    const k = CADASTROS[tipo];
    return ctx[k.lista].map((x) => ({ id: x.id, nome: x.nome || x.name || '', email: x.email || null, detalhe: k.detalhe(x) }));
}

/** O que já existe parecido com o que está no formulário: aviso por nome (e por e-mail, na pessoa). Vazio quando nada. */
function avisosDeDuplicata(tipo, f) {
    const ex = existentesDe(tipo);
    const usar = (x, rot) => `<button type="button" class="btn btn-sm" data-action="reUsarExistente" data-args='${args(x.id)}'>${rot}</button>`;
    const linhas = [];
    const mail = tipo === 'pessoa' && mesmoEmail(f.email, ex);
    if (mail) linhas.push(`<p class="re-aviso">Já existe uma pessoa com este e-mail: ${escapeHTML(mail.nome)} (${escapeHTML(mail.email)}). Usar esta pessoa? ${usar(mail, 'Usar esta')}</p>`);
    for (const s of parecidos(f.nome, ex)) {
        if (mail && s.item.id === mail.id) continue;
        linhas.push(s.igual
            ? `<p class="re-aviso">Já existe com este nome: ${escapeHTML(s.item.nome)} (${escapeHTML(s.item.detalhe)}). Use o existente. ${usar(s.item, 'Usar este')}</p>`
            : `<p class="re-aviso">Já existe: ${escapeHTML(s.item.nome)} (${escapeHTML(s.item.detalhe)}; ${escapeHTML(s.motivo)}). Usar este? ${usar(s.item, 'Usar este')}</p>`);
    }
    // O servidor devolve o id; o aviso só aparece se o item está na lista desta tela (é o que "Usar este" marca).
    for (const s of f.porSignificado || []) {
        const x = ex.find((e) => e.id === s.id);
        if (x) linhas.push(`<p class="re-aviso">Já existe: ${escapeHTML(x.nome)} (${escapeHTML(x.detalhe)}; parecido por significado). Usar este? ${usar(x, 'Usar este')}</p>`);
    }
    return linhas.join('');
}

const textoBuscando = (f) => (f && f.buscando ? 'buscando parecidos…' : '');
function marcarBuscando(f, v) {
    f.buscando = v;
    const n = document.getElementById('re-similares-busca');
    if (n) n.textContent = textoBuscando(f);
}

/**
 * Pergunta ao servidor quais itens já cadastrados significam o mesmo ("folha de pagamento" ~ "payroll system"), quando a regra
 * não achou nada e o nome tem 4+ letras. Debounce de 600 ms; a resposta de um nome já superado é descartada (seq). Falha ou
 * `indisponivel` = silêncio: a tela segue só com a regra.
 */
function agendarSignificado() {
    clearTimeout(significado.timer);
    const seq = ++significado.seq;
    const f = st && st.cadastro;
    if (!f) return;
    f.porSignificado = null;
    const tipo = PERGUNTA[f.pergunta].cadastro;
    const nome = String(f.nome || '').trim();
    if (tipo === 'pessoa' || nome.length < 4 || parecidos(nome, existentesDe(tipo)).length) { marcarBuscando(f, false); return; }
    marcarBuscando(f, true);
    significado.timer = setTimeout(async () => {
        if (seq !== significado.seq || !st || st.cadastro !== f) return;
        let r = null;
        try { r = await buscarPorSignificado(st.projectId, { tipo, nome }); } catch (e) { /* silêncio: segue só a regra */ }
        if (seq !== significado.seq || !st || st.cadastro !== f) return;
        f.porSignificado = r && Array.isArray(r.resultados) ? r.resultados : [];
        marcarBuscando(f, false);
        const sim = document.getElementById('re-similares');
        if (sim) sim.innerHTML = avisosDeDuplicata(tipo, f);
    }, ESPERA_SIGNIFICADO);
}

function blocoCadastro(p) {
    const k = CADASTROS[p.cadastro];
    if (!podeCadastrar()) return '<p class="re-nota">Não está na lista? Peça a quem administra o cadastro.</p>';
    const f = st.cadastro && st.cadastro.pergunta === p.id ? st.cadastro : null;
    if (!f) return `<div class="re-cadastro-abrir"><button type="button" class="btn btn-sm" data-action="reCadastroAbrir" data-args='${args(p.id)}'>Cadastrar agora: ${escapeHTML(k.nome.toLowerCase())}</button></div>`;
    // Enter no campo salva o cadastro (e não avança a pergunta). O filtro de tecla fica no invólucro: no próprio campo ele
    // barraria também o evento de input (delegation.js confere data-key em qualquer evento).
    const campo = (id, rotulo, extra = '') => `<div class="form-group" data-action-keydown="reCadastrar" data-key="Enter" data-prevent><label class="form-label" for="re-cad-${id}">${rotulo}</label>
        <input class="form-input" id="re-cad-${id}" ${extra} value="${escapeHTML(f[id] || '')}" data-action-input="reCadastroCampo" data-args='${args(id)}' data-arg-val></div>`;
    const categoria = p.cadastro === 'item' ? `<div class="form-group"><label class="form-label" for="re-cad-categoria">Tipo</label>
        <select class="form-input" id="re-cad-categoria" data-action-change="reCadastroCampo" data-args='${args('categoria')}' data-arg-val>${CATEGORIAS_ITEM.map((o) =>
            `<option value="${escapeHTML(o.v)}" ${o.v === f.categoria ? 'selected' : ''}>${escapeHTML(o.r)}</option>`).join('')}</select></div>` : '';
    return `<div class="re-cadastro" role="group" aria-labelledby="re-cad-titulo">
        <h3 class="re-cadastro-titulo" id="re-cad-titulo">Cadastrar ${escapeHTML(k.nome.toLowerCase())}</h3>
        ${campo('nome', 'Nome (obrigatório)', 'type="text" maxlength="200" autocomplete="off" aria-describedby="re-similares"')}
        <div id="re-similares" aria-live="polite">${avisosDeDuplicata(p.cadastro, f)}</div>
        ${p.cadastro === 'pessoa' ? '' : `<p class="re-nota re-similares-busca" id="re-similares-busca" aria-live="polite">${textoBuscando(f)}</p>`}
        ${p.cadastro === 'pessoa' ? campo('email', 'E-mail (opcional)', 'type="email" maxlength="320" autocomplete="off"') : ''}
        ${categoria}
        <div class="re-cadastro-acoes">
            <button type="button" class="btn btn-sm btn-primary" data-action="reCadastrar">Salvar no cadastro</button>
            <button type="button" class="btn btn-sm btn-ghost" data-action="reCadastroFechar">Cancelar</button>
        </div>
    </div>`;
}

function extras(p) {
    const r = st.respostas;
    const partes = [];
    if (p.id === 'finalidade') {
        const k = normaliza(r.finalidade);
        const dup = k && (S.ropa || []).find((x) => x.id !== st.recordId && normaliza(x.processing_purpose) === k);
        if (dup) partes.push(`<p class="re-aviso">Já existe uma atividade com essa finalidade no inventário. Se for a mesma, volte e use "Continuar entrevista" nela.</p>`);
    }
    if (p.id === 'base') {
        if (temSensivel(r) && valor(r, 'base') && !ehArt11(r.base)) partes.push(`<p class="re-aviso">A hipótese gravada (${escapeHTML(r.base)}) é do art. 7. Com dado sensível, escolha uma do art. 11.</p>`);
        const m = MOTIVOS.find((x) => x.v === r.motivo);
        if (m && temSensivel(r) && m.b7 && !m.b11) partes.push('<p class="re-aviso">Com dado sensível, esse motivo não serve de base legal (art. 11). Escolha a hipótese que se aplica.</p>');
    }
    if (p.id === 'responsavel' && r.responsavel_texto && !valor(r, 'responsavel')) {
        partes.push(`<p class="re-aviso">Hoje o responsável está só em texto: ${escapeHTML(r.responsavel_texto)}. Escolha a pessoa na lista ou cadastre agora para ligar ao cadastro; sem escolha, o texto fica como está.</p>`);
    }
    if (p.id === 'lia' && ctx.lia && ctx.lia.status === 'concluida') partes.push('<p class="re-aviso">A LIA desta atividade já está concluída. Para alterar, reabra nas Ligações; aqui ela não é regravada.</p>');
    if (p.id === 'transf_destino' && ctx.transferencias.length) {
        partes.push(`<p class="re-nota">Já registradas: ${ctx.transferencias.map((t) => `${escapeHTML(t.pais)}${t.mecanismo ? ` (${escapeHTML(t.mecanismo)})` : ''}`).join('; ')}. Preencha o país só para acrescentar outro.</p>`);
    }
    if (p.id === 'ripd') {
        const mot = motivosRipd(r);
        partes.push(mot.length
            ? `<p class="re-aviso" id="re-recomendacao">Recomendamos Sim porque ${escapeHTML(mot.join(', '))}.</p>`
            : '<p class="re-nota" id="re-recomendacao">Nenhum gatilho de alto risco nas suas respostas. A decisão é sua.</p>');
    }
    if (p.sugerir && podeEntrevistar() && (p.sugerir !== 'base' || ctx.catalogo.size)) partes.push(blocoSugestao(p.sugerir));
    return partes.join('');
}

function blocoSugestao(campo) {
    const s = st.sugestao;
    if (!s) {
        return `<div class="re-sugestao"><p class="re-nota">A IA pode propor ${campo === 'base' ? 'a base legal' : 'o prazo de retenção'} a partir da finalidade, dos titulares e das categorias. Nada muda até você escolher.${st.recordId ? '' : ' Para isso, a atividade é salva como rascunho com o que você já respondeu.'}</p>
            <button type="button" class="btn btn-sm" data-action="reSugerir">Sugerir</button></div>`;
    }
    const texto = campo === 'base' ? textoDaBase(s.base_legal) : s.retencao;
    const recusada = campo === 'base' && texto && temSensivel(st.respostas) && !ehArt11(texto);
    return `<div class="re-sugestao" role="note"><p><strong>${escapeHTML(AVISO_IA)}</strong></p>
        <p>Proposta: ${escapeHTML(texto || s.base_legal || 'sem proposta')}</p>
        ${s.justificativa ? `<p class="re-nota">${escapeHTML(s.justificativa)}</p>` : ''}
        ${recusada ? '<p class="re-aviso">A proposta é do art. 7 e não vale com dado sensível.</p>'
            : texto ? `<button type="button" class="btn btn-sm" data-action="reUsarSugestao" data-args='${args(campo)}'>Usar esta proposta</button>` : ''}</div>`;
}

function topo() {
    const vis = visiveis();
    const p = PERGUNTA[st.passo];
    const letra = p ? p.bloco : null;
    const blocosVis = LETRAS.filter((l) => vis.some((x) => x.bloco === l));
    const nBloco = letra ? blocosVis.indexOf(letra) + 1 : blocosVis.length;
    const doBloco = letra ? vis.filter((x) => x.bloco === letra) : [];
    const pct = p ? Math.round((vis.indexOf(p) / vis.length) * 100) : 100;
    const legenda = p ? `Bloco ${nBloco} de ${blocosVis.length}: ${BLOCOS[letra]}. Pergunta ${doBloco.indexOf(p) + 1} de ${doBloco.length}.` : 'Resumo: confira antes de salvar.';
    const aprovado = temAprovacao(ctx.registro)
        ? '<p class="re-aviso re-faixa">Esta atividade tem aprovação. Salvar as alterações no fim substitui o pedido de aprovação vigente.</p>' : '';
    return `<div class="re-topo">
        <p class="re-legenda" id="re-legenda">${escapeHTML(legenda)}</p>
        <progress class="re-barra" max="100" value="${pct}" aria-labelledby="re-legenda"></progress>
        <ol class="re-blocos">${blocosVis.map((l) => `<li class="${l === letra ? 're-bloco-atual' : ''}" ${l === letra ? 'aria-current="step"' : ''}>${escapeHTML(BLOCOS[l])}</li>`).join('')}</ol>
    </div>${aprovado}`;
}

function desenharPergunta(p) {
    const primeira = visiveis()[0] === p;
    return `${topo()}
    <form class="re-pergunta" data-action-submit="reAvancar" data-prevent novalidate>
        <fieldset class="re-fieldset">
            <legend class="re-legend"><h2 class="re-titulo" id="re-titulo" tabindex="-1">${escapeHTML(p.titulo)}</h2></legend>
            <details class="re-ajuda"><summary>Por que perguntamos</summary><p>${escapeHTML(p.ajuda)}</p></details>
            ${controle(p)}
            ${p.aviso && p.aviso(st.respostas) ? `<p class="re-aviso" role="note">${escapeHTML(p.aviso(st.respostas))}</p>` : ''}
            ${extras(p)}
            <p class="re-erro" id="re-erro" aria-live="polite"></p>
        </fieldset>
        <div class="re-acoes">
            <button type="button" class="btn" data-action="reVoltar" ${primeira ? 'disabled' : ''}>Voltar</button>
            ${p.obrigatoria ? '<span class="re-nota">Resposta obrigatória</span>' : '<button type="button" class="btn btn-ghost" data-action="reNaoSei">Não sei agora</button>'}
            <button type="submit" class="btn btn-primary">Próxima</button>
        </div>
    </form>`;
}

function textoResposta(p) {
    const r = st.respostas;
    if (r[p.id] === NAO_SEI) return 'Não sei agora';
    const v = r[p.id];
    if (p.id === 'responsavel' && vazio(v) && r.responsavel_texto) return `${r.responsavel_texto} (só texto, sem cadastro)`;
    if (vazio(v)) return '';
    if (p.tipo === 'texto' || p.tipo === 'longo') return v;
    if (p.tipo === 'grupo') return p.sub.filter((s) => String(v[s.id] || '').trim()).map((s) => `${s.rotulo} ${s.tipo === 'select' ? (s.opcoes.find((o) => o.v === v[s.id]) || {}).r || v[s.id] : v[s.id]}`).join(' / ');
    const ops = [...opcoesDe(p), ...(p.nenhum ? [op(NENHUM, p.nenhum)] : [])];
    const rot = (x) => (x === OUTRO ? String(r[`${p.id}_outro`] || p.outro || 'Outro') : (ops.find((o) => o.v === x) || {}).r || x);
    return (Array.isArray(v) ? v : [v]).map(rot).join(', ');
}

function desenharResumo() {
    const pend = pendencias(st.respostas, ctx);
    const vis = visiveis();
    const blocos = LETRAS.filter((l) => vis.some((x) => x.bloco === l)).map((l) => `<section class="re-bloco" aria-labelledby="re-b-${l}">
        <div class="re-bloco-cabeca"><h3 id="re-b-${l}">${escapeHTML(BLOCOS[l])}</h3>
            <button type="button" class="btn btn-ghost btn-sm" data-action="reAlterar" data-args='${args(l)}' aria-label="Alterar: ${escapeHTML(BLOCOS[l])}">Alterar</button></div>
        <dl class="re-respostas">${vis.filter((p) => p.bloco === l).map((p) => {
            const t = textoResposta(p);
            return `<dt>${escapeHTML(p.curto)}</dt><dd>${t ? escapeHTML(t) : '<span class="re-pendente">Sem resposta</span>'}</dd>`;
        }).join('')}</dl></section>`).join('');
    const mot = motivosRipd(st.respostas);
    return `${topo()}
    <div class="re-resumo">
        <h2 class="re-titulo" id="re-titulo" tabindex="-1">Confira o que você nos contou</h2>
        ${pend.length ? `<div class="re-pendencias" role="note"><h3>O que ficou para depois (${pend.length})</h3><ul>${pend.map((x) => `<li>${escapeHTML(x.texto)}</li>`).join('')}</ul></div>`
            : '<p class="re-nota">Nenhuma pendência nas respostas.</p>'}
        ${mot.length ? `<p class="re-aviso">Recomendação de RIPD (DPIA): ${escapeHTML(mot.join(', '))}.</p>` : ''}
        ${(st.criados || []).length ? `<p class="re-nota" id="re-criados">Cadastrados durante a entrevista: ${st.criados.map((x) => `${escapeHTML(x.tipo)} ${escapeHTML(x.nome)}`).join('; ')}.</p>` : ''}
        ${blocos}
        <p class="re-erro" id="re-erro" aria-live="polite"></p>
        <div class="re-acoes">
            <button type="button" class="btn" data-action="reVoltar">Voltar</button>
            <button type="button" class="btn btn-primary" data-action="reSalvar">${st.recordId ? 'Salvar alterações' : 'Salvar como rascunho'}</button>
        </div>
        <p class="re-nota">${st.recordId ? 'O status da atividade não muda por aqui.' : 'A atividade entra no inventário como rascunho.'}</p>
    </div>`;
}

function desenharFim() {
    const s = st.salvo;
    return `<div class="re-resumo">
        <h2 class="re-titulo" id="re-titulo" tabindex="-1">Atividade salva</h2>
        <p>${escapeHTML(s.finalidade)} ${s.novo ? 'entrou no inventário como rascunho.' : 'foi atualizada.'}</p>
        ${s.feitos.length ? `<ul>${s.feitos.map((x) => `<li>${escapeHTML(x)}</li>`).join('')}</ul>` : ''}
        ${s.erros.length ? `<div class="re-pendencias" role="alert"><h3>O que não foi gravado</h3><ul>${s.erros.map((x) => `<li>${escapeHTML(x)}</li>`).join('')}</ul><p class="re-nota">Complete nas Ligações da atividade.</p></div>` : ''}
        <div class="re-acoes">
            <button type="button" class="btn" data-action="openLigacoesTratamento" data-args='${args(st.projectId, s.id)}'>Abrir as ligações</button>
            <button type="button" class="btn" data-action="abrirRopaEntrevista" data-args='${args(st.projectId)}'>Cadastrar outra atividade</button>
            <button type="button" class="btn btn-primary" data-action="reSair">Voltar ao inventário</button>
        </div>
    </div>`;
}

let alvo = null;
function desenhar(foco = 'titulo') {
    // Resposta do servidor que chega depois de a pessoa ir para outra tela não desenha por cima dela.
    if (!alvo || S.view !== 'ropa-entrevista') return;
    const c = alvo.c;
    c.innerHTML = `<div class="re">${st.salvo ? desenharFim() : st.passo === 'resumo' ? desenharResumo() : desenharPergunta(PERGUNTA[st.passo])}</div>`;
    const f = foco === 'titulo' ? document.getElementById('re-titulo') : document.getElementById(foco);
    if (f && typeof f.focus === 'function') f.focus();
}

function erro(msg) {
    const e = document.getElementById('re-erro');
    if (e) e.textContent = msg;
}

/** Primeira pergunta a abrir: a do rascunho guardado; no registro existente, a primeira obrigatória vazia; senão o resumo. */
function passoInicial() {
    const vis = visiveis();
    if (!st.recordId) return vis[0].id;
    const falta = vis.find((p) => p.obrigatoria && vazio(st.respostas[p.id]));
    return falta ? falta.id : 'resumo';
}

// ─── Tela ────────────────────────────────────────────────────────────────────────────────────────

async function renderRopaEntrevista(c, h, a) {
    const pedido = S.ropaEntrevista;
    const proj = S.activeProject || (S.projects || [])[0];
    if (!proj || !pedido) {
        a.innerHTML = '';
        h.textContent = 'Entrevista do RoPA';
        c.innerHTML = proj ? renderEmptyState({ titulo: 'Nenhuma entrevista aberta', texto: 'Comece uma atividade nova ou continue uma do inventário.',
            acao: '<button class="btn btn-primary" data-action="navigate" data-args=\'["ropa"]\'>Abrir o RoPA</button>' }) : window.renderSemProjeto();
        return;
    }
    alvo = { c, h, a };
    const chave = chaveDe(pedido.projectId, pedido.recordId);
    if (!st || st.chave !== chave || !ctx) {
        c.innerHTML = '<p class="re-nota" aria-live="polite">Carregando a entrevista...</p>';
        const guardado = lerGuardado(chave);
        ctx = await carregar(pedido.projectId, pedido.recordId || (guardado && guardado.recordId));
        const respostas = guardado ? guardado.respostas : ctx.registro ? respostasDoRegistro(ctx.registro, ctx) : {};
        // Rascunho de antes do "Cadastrar agora" com "Outra pessoa" digitada: vira o texto antigo, à espera da pessoa do cadastro.
        if (respostas.responsavel === OUTRO) { respostas.responsavel_texto = respostas.responsavel_outro || ''; delete respostas.responsavel; delete respostas.responsavel_outro; }
        // O que o SERVIDOR já tem ligado (não o rascunho da aba): rascunho retomado de atividade nova também liga no fim.
        ctx.inicial = { areas: lista(ctx.ligacoes && ctx.ligacoes.departamentos).map((d) => d.id), sistemas: lista(ctx.ligacoes && ctx.ligacoes.itens).map((i) => i.id) };
        st = { chave, projectId: pedido.projectId, recordId: pedido.recordId || (guardado && guardado.recordId) || null, respostas, passo: null, voltarAoResumo: false, sugestao: null, salvo: null,
            criados: Array.isArray(guardado && guardado.criados) ? guardado.criados : [], cadastro: null, busca: {} };
        st.passo = guardado && (guardado.passo === 'resumo' || PERGUNTA[guardado.passo]) ? guardado.passo : passoInicial();
    }
    h.textContent = st.recordId ? 'Entrevista do RoPA: revisar atividade' : 'Entrevista do RoPA: nova atividade';
    const avancada = st.recordId && S.user && ['platform_admin', 'consultant', 'consultor'].includes(S.user.role)
        ? `<button class="btn" data-action="reEdicaoAvancada" data-args='${args(st.recordId)}'>Edição avançada</button>` : '';
    a.innerHTML = `${avancada}<button class="btn" data-action="reSair">Voltar ao inventário</button>`;
    desenhar();
}

window.abrirRopaEntrevista = function (projectId, recordId) {
    if (!podeEntrevistar()) { showToast('A entrevista é da equipe da consultoria e do administrador do cliente', 'error'); return; }
    if (typeof window.forceCloseModal === 'function') window.forceCloseModal();
    S.ropaEntrevista = { projectId, recordId: recordId || null };
    // Atividade nova começa limpa; o rascunho guardado de uma nova que não foi salva é retomado.
    st = null; ctx = null;
    navigate('ropa-entrevista');
};

// ─── Ações (delegação por data-action) ─────────────────────────────────────────────────────────────

window.reTexto = function (id, v) { st.respostas[id] = v; guardar(); };
window.reSub = function (id, sub, v) {
    const g = st.respostas[id] && st.respostas[id] !== NAO_SEI && typeof st.respostas[id] === 'object' ? st.respostas[id] : {};
    st.respostas[id] = { ...g, [sub]: v }; guardar();
};
window.reExemplo = function (id, texto) {
    st.respostas[id] = texto; guardar();
    desenhar('re-campo');
};
window.reEscolher = function (id, el) {
    st.respostas[id] = el.value;
    // O motivo marca a hipótese correspondente; a pessoa confirma na pergunta seguinte.
    if (id === 'motivo') {
        const m = MOTIVOS.find((x) => x.v === el.value);
        const b = m && (temSensivel(st.respostas) ? m.b11 : m.b7);
        if (b) st.respostas.base = b;
    }
    guardar(); desenhar(el.id);
};
window.reMarcar = function (id, el) {
    let v = Array.isArray(st.respostas[id]) ? [...st.respostas[id]] : [];
    if (el.checked) v = el.value === NENHUM ? [NENHUM] : [...v.filter((x) => x !== NENHUM), el.value];
    else v = v.filter((x) => x !== el.value);
    st.respostas[id] = v; guardar(); desenhar(el.id);
};

// Busca na lista: esconde as opções sem redesenhar, para o cursor ficar no campo.
window.reBuscar = function (id, v) {
    st.busca[id] = v;
    const q = normaliza(v);
    let algum = false;
    document.querySelectorAll('.re-opcao[data-busca]').forEach((l) => { l.hidden = !!q && !l.dataset.busca.includes(q); if (!l.hidden) algum = true; });
    const n = document.getElementById('re-busca-vazia');
    if (n) n.textContent = algum ? '' : 'Nada na lista com esse nome.';
};

window.reCadastroAbrir = function (pid) {
    const p = PERGUNTA[pid];
    // O nome já vem com o que a pessoa buscou, ou com o responsável antigo em texto.
    const nome = String(st.busca[pid] || (pid === 'responsavel' ? st.respostas.responsavel_texto || '' : '')).trim();
    st.cadastro = { pergunta: pid, nome, email: '', categoria: p.cadastro === 'item' ? CATEGORIAS_ITEM[0].v : '' };
    desenhar('re-cad-nome');
    agendarSignificado();
};
window.reCadastroFechar = function () { st.cadastro = null; desenhar(); };
window.reCadastroCampo = function (campo, v) {
    if (!st.cadastro) return;
    st.cadastro[campo] = v;
    const sim = document.getElementById('re-similares');
    if (campo === 'nome') agendarSignificado();
    if (sim && campo !== 'categoria') sim.innerHTML = avisosDeDuplicata(PERGUNTA[st.cadastro.pergunta].cadastro, st.cadastro);
};

/** Marca o registro do cadastro na pergunta (seleção única ou múltipla), fecha o formulário e redesenha com o foco nele. */
function selecionar(pid, id) {
    const p = PERGUNTA[pid];
    if (p.tipo === 'multipla') {
        const v = Array.isArray(st.respostas[pid]) ? st.respostas[pid] : [];
        st.respostas[pid] = v.includes(id) ? v : [...v, id];
    } else st.respostas[pid] = id;
    if (pid === 'responsavel') delete st.respostas.responsavel_texto;
    st.cadastro = null;
    st.busca[pid] = '';
    guardar();
    desenhar(`re-op-${opcoesDe(p).findIndex((o) => o.v === id)}`);
}
window.reUsarExistente = function (id) { if (st.cadastro) selecionar(st.cadastro.pergunta, id); };

window.reCadastrar = async function () {
    const f = st.cadastro;
    if (!f || f.gravando) return;
    const p = PERGUNTA[f.pergunta];
    const k = CADASTROS[p.cadastro];
    const dados = { nome: String(f.nome || '').trim(), email: String(f.email || '').trim(), categoria: f.categoria };
    if (!dados.nome) { erro('Digite o nome para cadastrar.'); return; }
    const igual = parecidos(dados.nome, existentesDe(p.cadastro)).find((x) => x.igual);
    if (igual) { erro(`Já existe com este nome: ${igual.item.nome}. Use o existente.`); return; }
    f.gravando = true;
    let id;
    try { id = (await criarCadastro(p.cadastro, st.projectId, k.corpo(dados))).id; }
    catch (e) { f.gravando = false; erro(`Não foi possível cadastrar: ${e.message}`); return; }
    ctx[k.lista].push(k.novo(id, dados));
    st.criados.push({ tipo: k.nome, nome: dados.nome });
    selecionar(f.pergunta, id);
};

/** Mensagem de validação da pergunta atual, ou vazio quando pode seguir. */
function validar(p) {
    const r = st.respostas;
    const v = r[p.id];
    if (p.obrigatoria && (v === NAO_SEI || vazio(v) || (Array.isArray(v) && v.length === 1 && v[0] === OUTRO && !String(r[`${p.id}_outro`] || '').trim()))) {
        return p.tipo === 'multipla' ? 'Marque ao menos uma opção para seguir.' : 'Responda para seguir: esta resposta é obrigatória.';
    }
    if (p.id === 'finalidade' && String(v).trim().length < 3) return 'Descreva a atividade com pelo menos 3 letras.';
    if (p.id === 'base' && temSensivel(r) && valor(r, 'base') && !ehArt11(r.base)) return 'Com dado sensível, a base precisa ser uma hipótese do art. 11. Escolha uma ou responda "Não sei agora".';
    return '';
}

function irPara(passo, foco) { st.passo = passo; guardar(); desenhar(foco); }

window.reAvancar = function () {
    const p = PERGUNTA[st.passo];
    if (!p) return;
    if (st.cadastro && st.cadastro.pergunta === p.id) { erro('Salve ou cancele o cadastro aberto antes de seguir.'); return; }
    const msg = validar(p);
    if (msg) { erro(msg); return; }
    proximo(p);
};
function proximo(p) {
    const vis = visiveis();
    const seg = vis[vis.indexOf(p) + 1];
    if (!seg || (st.voltarAoResumo && seg.bloco !== p.bloco)) { st.voltarAoResumo = false; irPara('resumo'); return; }
    irPara(seg.id);
}
window.reNaoSei = function () {
    const p = PERGUNTA[st.passo];
    if (!p || p.obrigatoria) return;
    st.respostas[p.id] = NAO_SEI;
    st.cadastro = null;
    proximo(p);
};
window.reVoltar = function () {
    const vis = visiveis();
    if (st.passo === 'resumo') { irPara(vis[vis.length - 1].id); return; }
    const i = vis.indexOf(PERGUNTA[st.passo]);
    if (i > 0) irPara(vis[i - 1].id);
};
window.reAlterar = function (bloco) {
    const p = visiveis().find((x) => x.bloco === bloco);
    if (!p) return;
    st.voltarAoResumo = true;
    irPara(p.id);
};
window.reSair = function () { S.ropaEntrevista = null; navigate('ropa'); };
// A edição avançada sai da entrevista (o rascunho da aba fica guardado) e abre o formulário sobre o inventário.
window.reEdicaoAvancada = async function (id) { window.reSair(); await window.openEditROPAModal(id); };

window.reSugerir = async function () {
    try {
        if (!st.recordId) {
            const corpo = montarPayload(st.respostas, ctx);
            const r = await api('POST', `/api/v1/projects/${st.projectId}/ropa`, corpo);
            st.recordId = r.id; guardar();
        }
        const r = await api('POST', `/api/v1/projects/${st.projectId}/ropa/${st.recordId}/sugestao`, undefined, { timeoutMs: 90000 });
        st.sugestao = r.sugestao || null;
    } catch (e) { erro(`Não foi possível gerar a sugestão: ${e.message}`); return; }
    desenhar();
};
window.reUsarSugestao = function (campo) {
    const s = st.sugestao;
    if (!s) return;
    if (campo === 'base') { const t = textoDaBase(s.base_legal); if (t) st.respostas.base = t; }
    else if (s.retencao) {
        if (RETENCOES.some((o) => o.v === s.retencao)) st.respostas.retencao = s.retencao;
        else { st.respostas.retencao = OUTRO; st.respostas.retencao_outro = s.retencao; }
    }
    guardar(); desenhar();
};

/** Grava tudo no fim: o registro (POST ou PUT) e as ligações que mudaram. Falha de uma ligação não desfaz o registro: vai para a lista. */
window.reSalvar = async function () {
    const r = st.respostas;
    const falta = PERGUNTAS.filter((p) => p.obrigatoria && validar(p));
    if (falta.length) { erro(`Antes de salvar, responda: ${falta.map((p) => p.curto).join(', ')}.`); return; }
    if (st.recordId && !(await confirmaEdicaoAprovada(ctx.registro))) return;
    const corpo = montarPayload(r, ctx);
    const pid = st.projectId;
    const novo = !st.recordId;
    try {
        if (novo) st.recordId = (await api('POST', `/api/v1/projects/${pid}/ropa`, corpo)).id;
        else await api('PUT', `/api/v1/ropa/${st.recordId}`, corpo);
    } catch (e) { erro(`Não foi possível salvar: ${e.message}`); return; }
    const id = st.recordId;
    const feitos = [], erros = [];
    const passo = async (feito, fazer, falha) => { try { await fazer(); if (feito) feitos.push(feito); } catch (e) { erros.push(`${falha}: ${e.message}`); } };
    const mudou = (a, b) => a.length !== b.length || a.some((x) => !b.includes(x));
    const areas = valor(r, 'areas');
    if (Array.isArray(areas) && ctx.deptos.length && mudou(areas, ctx.inicial.areas)) {
        await passo('Áreas ligadas.', () => api('PUT', `/api/v1/projects/${pid}/ropa/${id}/departamentos`, { departamentos: areas }), 'Áreas');
    }
    const sistemas = valor(r, 'sistemas');
    if (Array.isArray(sistemas) && ctx.itens.length && mudou(sistemas, ctx.inicial.sistemas)) {
        await passo('Sistemas ligados.', () => api('PUT', `/api/v1/projects/${pid}/ropa/${id}/itens`, { itens: sistemas }), 'Sistemas');
    }
    const td = r.transferencia === 'sim' && r.transf_destino && r.transf_destino !== NAO_SEI ? r.transf_destino : null;
    const pais = td ? String(td.pais || '').trim() : '';
    if (pais && !ctx.transferencias.some((t) => normaliza(t.pais) === normaliza(pais))) {
        await passo(`Transferência para ${pais} registrada.`, () => api('POST', `/api/v1/projects/${pid}/ropa/${id}/transferencias`,
            { pais, mecanismo: td.mecanismo && td.mecanismo !== SEM_MECANISMO ? td.mecanismo : null }), 'Transferência internacional');
    }
    const lia = ehLegitimoInteresse(valor(r, 'base')) ? valor(r, 'lia') : null;
    if (lia && typeof lia === 'object' && !vazio(lia) && !(ctx.lia && ctx.lia.status === 'concluida')) {
        const t = (k) => String(lia[k] || '').trim() || null;
        const completa = t('finalidade_legitima') && t('necessidade') && t('balanceamento') && lia.conclusao;
        await passo(completa ? 'LIA concluída.' : 'LIA salva em rascunho.', () => api('PUT', `/api/v1/projects/${pid}/ropa/${id}/lia`, {
            finalidade_legitima: t('finalidade_legitima'), necessidade: t('necessidade'), balanceamento: t('balanceamento'), salvaguardas: t('salvaguardas'),
            conclusao: lia.conclusao || null, status: completa ? 'concluida' : 'rascunho',
        }), 'LIA');
    }
    if (r.ripd === 'sim' && r.criar_ripd === 'sim' && !ctx.temDpia) {
        try { await api('POST', `/api/v1/projects/${pid}/ropa/${id}/dpia`); feitos.push('RIPD criado como rascunho. Complete na tela de RIPD.'); }
        catch (e) { if (e.status === 409) feitos.push('O RIPD desta atividade já existia.'); else erros.push(`RIPD: ${e.message}`); }
    }
    esquecer();
    st.salvo = { id, novo, finalidade: corpo.processing_purpose, feitos, erros };
    if (alvo) alvo.h.textContent = 'Entrevista do RoPA: concluída';
    desenhar();
};

export { renderRopaEntrevista, PERGUNTAS };
window.renderRopaEntrevista = renderRopaEntrevista;
