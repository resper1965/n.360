/**
 * Cada e-mail do n.360, montado pelo invólucro único (`montarEmail`). As rotas buscam os dados e
 * chamam daqui; o texto de cada e-mail mora só neste arquivo (e o resumo de prazos em
 * `avisos-prazo.ts`, que precisa dos rótulos de lá). `scripts/emails-amostra.mjs` gera as amostras
 * de revisão visual a partir destas mesmas funções.
 */
import { montarEmail, dataBr, type EmailMontado, type Pessoa } from './email-layout';

export type EmailComAssunto = EmailMontado & { assunto: string };
const com = (assunto: string, m: Omit<Parameters<typeof montarEmail>[0], 'assunto'>): EmailComAssunto =>
  ({ assunto, ...montarEmail({ assunto, ...m }) });
const ola = (nome?: string | null) => (nome ? `Olá, ${nome},` : 'Olá,');

/**
 * Convite de primeiro acesso. Nunca leva senha: com `link`, o botão "Criar minha senha" (token de uso único no fragmento, 72 h);
 * sem `link` (o domínio do e-mail entra por SSO), a pessoa entra pelo login único da empresa.
 */
export function emailBoasVindas(d: { nome: string; email: string; organizacao: string; equipe: boolean; convidante: Pessoa | null; url: string; link: string | null; horas: number }): EmailComAssunto {
  // "(consultoria: X)" só para a equipe da consultoria; cliente, org_user e stakeholder não são dela.
  const daConsultoria = d.equipe ? ` (consultoria: ${d.organizacao})` : '';
  return com(d.equipe ? `Seu acesso ao n.360 (${d.organizacao})` : 'Seu acesso ao n.360', {
    previa: `Sua conta no n.360 foi criada${daConsultoria}.`,
    titulo: 'Seu acesso ao n.360 está pronto',
    saudacao: ola(d.nome),
    paragrafos: [`Você tem uma conta nova no n.360${daConsultoria}, a plataforma de governança, risco e conformidade da ness.`],
    quemPede: d.convidante ?? { organizacao: d.organizacao },
    acao: d.link ? 'Abrir o link abaixo e criar a sua senha' : 'Entrar com o login único (SSO) da sua empresa, usando este e-mail',
    prazo: d.link ? `${d.horas} horas a partir do envio deste e-mail` : null,
    dados: [['E-mail', d.email]],
    botao: d.link ? { rotulo: 'Criar minha senha', url: d.link } : { rotulo: 'Entrar no n.360', url: d.url },
    notas: d.link
      ? ['O link é pessoal e vale uma vez: não encaminhe este e-mail. Se ele vencer, peça um convite novo a quem convidou ou use "Esqueci a senha".']
      : ['Sua empresa usa login único: não há senha do n.360 para criar.'],
    motivo: `uma conta com este endereço foi criada no n.360${daConsultoria}.`,
    contato: d.convidante?.email ? d.convidante : null,
  });
}

export function emailRedefinicaoSenha(d: { nome: string | null; codigo: string }): EmailComAssunto {
  return com('Código para redefinir a sua senha do n.360', {
    previa: 'Use o código deste e-mail para criar uma senha nova. Ele vale por 1 hora.',
    titulo: 'Redefinição de senha',
    saudacao: ola(d.nome),
    paragrafos: ['Recebemos um pedido para redefinir a senha da sua conta no n.360.'],
    acao: 'Digitar este código na tela de redefinição de senha',
    prazo: '1 hora a partir do envio deste e-mail',
    codigo: d.codigo,
    notas: ['Se você não pediu a redefinição, ignore este e-mail: a sua senha continua a mesma.'],
    motivo: 'alguém pediu a redefinição da senha da conta com este endereço no n.360.',
  });
}

/** Aviso ao dono da conta: outra pessoa (quem gere a conta) definiu a senha dele. Nunca leva a senha. */
export function emailSenhaDefinidaPorOutro(d: { nome: string | null; quem: Pessoa; url: string; link: string | null; horas: number }): EmailComAssunto {
  return com('Crie uma senha nova para a sua conta no n.360', {
    previa: 'A senha anterior deixou de valer. Crie a sua pelo link deste e-mail.',
    titulo: 'Crie uma senha nova',
    saudacao: ola(d.nome),
    paragrafos: [
      'Quem gere a sua conta no n.360 pediu a redefinição da sua senha. A senha anterior deixou de valer e as sessões abertas foram encerradas.',
      'Ninguém mais conhece a senha nova: só você a cria, pelo link abaixo.',
    ],
    quemPede: d.quem,
    acao: d.link ? 'Abrir o link abaixo e criar a sua senha' : 'Entrar com o login único (SSO) da sua empresa, usando este e-mail',
    prazo: d.link ? `${d.horas} horas a partir do envio deste e-mail` : null,
    botao: d.link ? { rotulo: 'Criar minha senha', url: d.link } : { rotulo: 'Entrar no n.360', url: d.url },
    notas: ['O link é pessoal e vale uma vez: não encaminhe este e-mail. Se você não esperava esta mudança, fale com quem gere a sua conta.'],
    motivo: 'a senha da conta com este endereço foi redefinida por outra pessoa no n.360.',
    contato: d.quem.email ? d.quem : null,
  });
}

/** Código do portal de políticas. Sem nome: o portal é público e o nome digitado não vai no e-mail. */
export function emailCodigoPoliticas(d: { cliente: string; codigo: string }): EmailComAssunto {
  return com(`Seu código para ler as políticas de ${d.cliente}`, {
    previa: `Código de acesso às políticas de ${d.cliente}. Ele vale por 15 minutos.`,
    titulo: `Políticas de ${d.cliente}`,
    saudacao: ola(null),
    paragrafos: [`Você pediu acesso ao portal de políticas de ${d.cliente} no n.360.`],
    quemPede: { organizacao: d.cliente },
    acao: 'Digitar este código no portal de políticas para ler e confirmar a leitura',
    prazo: '15 minutos a partir do envio deste e-mail',
    codigo: d.codigo,
    notas: ['Se você não pediu este código, ignore este e-mail.'],
    motivo: `este endereço pediu um código no portal de políticas de ${d.cliente}.`,
  });
}

/** Quem pede a ciência: o cliente do projeto e quem criou o pedido (com a organização dele). */
export type QuemPede = { cliente: string; pessoa: Pessoa | null };
const quemPedeBloco = (q: QuemPede): Pessoa => (q.pessoa ? { ...q.pessoa, organizacao: q.pessoa.organizacao ?? q.cliente } : { organizacao: q.cliente });
const nomeDoCliente = (q: QuemPede) => q.cliente || q.pessoa?.organizacao || 'A empresa';

/** Link pessoal de ciência. `reenvio`: o link anterior desta pessoa deixou de valer (lembrete ou documento alterado). */
export function emailCiencia(d: { titulo: string; nome: string | null; link: string; quem: QuemPede; reenvio: boolean; validoAte: Date }): EmailComAssunto {
  const cliente = nomeDoCliente(d.quem);
  return com(`${cliente} pede a sua ciência: ${d.titulo}`, {
    previa: `Leia o documento "${d.titulo}" e confirme a leitura com um código.`,
    titulo: `Ciência do documento: ${d.titulo}`,
    saudacao: ola(d.nome),
    paragrafos: [`${cliente} pede que você leia o documento "${d.titulo}" e confirme que tomou ciência dele.`],
    quemPede: quemPedeBloco(d.quem),
    acao: 'Abrir o link, ler o documento e confirmar com o código que chega por e-mail',
    prazo: dataBr(d.validoAte),
    botao: { rotulo: 'Ler e dar ciência', url: d.link },
    notas: [
      'O link é pessoal: não o encaminhe.',
      ...(d.reenvio ? ['Se você recebeu um link anterior para este documento, ele deixou de valer: use este.'] : []),
    ],
    motivo: `${cliente} incluiu este endereço entre as pessoas que precisam dar ciência deste documento.`,
    contato: d.quem.pessoa,
  });
}

const TIPO_PEDIDO: Record<string, string> = {
  dpia: 'RIPD (DPIA)', politica: 'Política', documento: 'Documento', excecao: 'Exceção a documento',
  tratamento: 'Tratamento (RoPA)', avaliacao_terceiro: 'Avaliação de terceiro',
};
const PAPEL_PEDIDO: Record<string, string> = { ciso: 'Líder SGSI', ceo: 'Direção (CEO)' };

/**
 * Pedido de APROVAÇÃO criado (`POST /projects/:id/pedidos`): o destinatário decide em "Minhas aprovações", logado e com senha.
 * O link só abre o app (nenhuma credencial nele). O pedido não tem data-limite: o e-mail diz isso em vez de inventar uma.
 */
export function emailPedidoAprovacao(d: { tipo: string; titulo: string; papel: string; nome: string | null; link: string; quem: QuemPede }): EmailComAssunto {
  const cliente = nomeDoCliente(d.quem);
  const tipo = TIPO_PEDIDO[d.tipo] ?? 'Documento';
  const papel = PAPEL_PEDIDO[d.papel] ?? d.papel;
  return com(`${cliente} pede a sua aprovação: ${d.titulo}`, {
    previa: `${tipo} "${d.titulo}" aguarda a sua aprovação como ${papel}.`,
    titulo: `Aprovação pedida: ${d.titulo}`,
    saudacao: ola(d.nome),
    paragrafos: [`${cliente} pede a sua aprovação, como ${papel}, para o item abaixo no n.360.`],
    quemPede: quemPedeBloco(d.quem),
    acao: 'Entrar no n.360, abrir Minhas aprovações, ler e aprovar ou recusar com a sua senha',
    prazo: 'Sem data marcada: o pedido fica aberto até a sua decisão',
    dados: [['Tipo', tipo], ['Título', d.titulo], ['Papel', papel]],
    botao: { rotulo: 'Abrir Minhas aprovações', url: d.link },
    notas: ['A decisão é registrada com a sua senha, no n.360. Este e-mail não aprova nada sozinho.'],
    motivo: `${cliente} indicou este endereço para aprovar um item como ${papel}.`,
    contato: d.quem.pessoa,
  });
}

/** O fornecedor enviou o questionário de homologação: aviso à equipe (os mesmos do sino). Nunca o token nem as respostas. */
export function emailHomologacaoRespondida(d: { nome: string | null; fornecedor: string; cliente: string; respondidas: number; total: number; percentual: number; link: string }): EmailComAssunto {
  return com(`${d.fornecedor} respondeu à homologação`, {
    produto: 'n.privacy',
    previa: `${d.fornecedor} enviou o questionário de homologação (${d.percentual}% respondido).`,
    titulo: 'Questionário de homologação respondido',
    saudacao: ola(d.nome),
    paragrafos: [`${d.fornecedor} enviou o questionário de homologação de fornecedor${d.cliente ? ` do projeto ${d.cliente}` : ''}.`],
    acao: 'Revisar as respostas na ficha do terceiro e concluir a avaliação',
    dados: [['Fornecedor', d.fornecedor], ['Respondido', `${d.percentual}% (${d.respondidas} de ${d.total} perguntas)`]],
    botao: { rotulo: 'Abrir Terceiros', url: d.link },
    notas: ['As respostas não vão por e-mail: leia e conclua no n.privacy.'],
    motivo: 'você acompanha este projeto na consultoria e o fornecedor enviou o questionário.',
  });
}

export function emailCodigoCiencia(d: { titulo: string; nome: string | null; codigo: string; quem: QuemPede }): EmailComAssunto {
  const cliente = nomeDoCliente(d.quem);
  return com(`Seu código para dar ciência: ${d.titulo}`, {
    previa: `Código para confirmar a ciência de "${d.titulo}". Ele vale por 15 minutos.`,
    titulo: 'Seu código para dar ciência',
    saudacao: ola(d.nome),
    paragrafos: [`Use este código para confirmar que leu o documento "${d.titulo}", a pedido de ${cliente}.`],
    quemPede: quemPedeBloco(d.quem),
    acao: 'Digitar este código na página do documento',
    prazo: '15 minutos a partir do envio deste e-mail',
    codigo: d.codigo,
    notas: ['Se você não pediu este código, ignore este e-mail: nada é registrado sem ele.'],
    motivo: `este endereço pediu um código na página de ciência de um documento de ${cliente}.`,
    contato: d.quem.pessoa,
  });
}

export function emailProposta(d: { organizacao: string; numero: string; revisao: number | string; validaAte: string | null; link: string; quem: Pessoa; mensagem?: string | null }): EmailComAssunto {
  const validade = dataBr(d.validaAte ? d.validaAte.slice(0, 10) : null);
  return com(`Proposta ${d.numero} - ${d.organizacao}`, {
    previa: `Proposta ${d.numero} de ${d.organizacao}${validade ? `, válida até ${validade}` : ''}.`,
    titulo: `Proposta ${d.numero}`,
    saudacao: 'Olá,',
    paragrafos: [`A proposta ${d.numero} (revisão ${d.revisao}) de ${d.organizacao} está pronta para a sua avaliação.`],
    mensagem: d.mensagem ?? null,
    quemPede: d.quem,
    acao: 'Abrir a proposta e responder: aceitar, pedir ajuste ou recusar',
    prazo: validade || null,
    botao: { rotulo: 'Ver e responder a proposta', url: d.link },
    notas: ['O link é pessoal: quem o tiver pode responder pela sua empresa. Não o encaminhe.'],
    motivo: `uma proposta comercial de ${d.organizacao} foi enviada a este endereço.`,
    contato: d.quem,
  });
}

/** Questionário de homologação ao fornecedor: assunto do n.privacy. */
export function emailHomologacao(d: { cliente: string; fornecedor: string; expiraEm: string; link: string; quem: Pessoa }): EmailComAssunto {
  const pede = d.cliente || 'Nosso cliente';
  const prazo = dataBr(d.expiraEm);
  return com(`${pede} pede a homologação de ${d.fornecedor}`, {
    produto: 'n.privacy',
    previa: `Questionário de homologação de fornecedor. Prazo: ${prazo}.`,
    titulo: 'Questionário de homologação de fornecedor',
    saudacao: 'Olá,',
    paragrafos: [
      `${pede} pede que ${d.fornecedor} responda ao questionário de homologação de fornecedor. As respostas ajudam a avaliar como os dados pessoais e as informações compartilhadas são protegidos.`,
    ],
    quemPede: d.quem,
    acao: `Responder ao questionário em nome de ${d.fornecedor}`,
    prazo,
    botao: { rotulo: 'Abrir o questionário', url: d.link },
    notas: ['O link é pessoal: não o encaminhe. Se outra pessoa deve responder, peça um link novo a quem enviou.'],
    motivo: `${pede} indicou este endereço para responder pela empresa ${d.fornecedor}.`,
    contato: d.quem,
  });
}

export function emailAlertaSonda(assunto: string, linhas: string[]): EmailComAssunto {
  return com(assunto, {
    titulo: assunto,
    paragrafos: linhas,
    motivo: 'este endereço está configurado como ALERTA_EMAIL da sonda interna do n.360.',
  });
}

/** Aviso ao Gestor ARCiber (n.ot, P1-1): alguém revelou IP/MAC ou exportou o inventário. Sem IP, MAC nem nome de ativo. */
export function emailAvisoOtSensivel(d: { quem: string; oQue: string; justificativa: string; url: string }): EmailComAssunto {
  return com('n.ot: revelação ou exportação do inventário de OT', {
    previa: `${d.quem} ${d.oQue}.`,
    titulo: 'Revelação ou exportação do inventário de OT',
    paragrafos: [`${d.quem} ${d.oQue}, depois de confirmar o segundo fator.`],
    dados: [['Quem', d.quem], ['Justificativa', d.justificativa]],
    botao: { rotulo: 'Abrir o n.ot', url: `${d.url}/ot` },
    notas: ['Se este acesso não era esperado, fale com quem o fez e revise a trilha de auditoria do projeto.'],
    motivo: 'este endereço está cadastrado como Gestor ARCiber (titular ou suplente) do projeto no n.360.',
  });
}
