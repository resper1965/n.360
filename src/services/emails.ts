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
 * Convite de primeiro acesso. ponytail: a senha temporária ainda vai no corpo porque não existe
 * definição de senha por link de uso único; quando existir, o e-mail leva o link e a senha sai daqui.
 */
export function emailBoasVindas(d: { nome: string; email: string; senha: string; organizacao: string; convidante: Pessoa | null; url: string }): EmailComAssunto {
  return com(`Seu acesso ao n.360 (${d.organizacao})`, {
    previa: `Sua conta no n.360 foi criada (organização: ${d.organizacao}).`,
    titulo: 'Seu acesso ao n.360 está pronto',
    saudacao: ola(d.nome),
    paragrafos: [`Você tem uma conta nova no n.360 (organização: ${d.organizacao}), a plataforma de governança, risco e conformidade da ness.`],
    quemPede: d.convidante ?? { organizacao: d.organizacao },
    acao: 'Entrar com a senha temporária abaixo e criar a sua senha',
    prazo: 'No primeiro acesso: a senha temporária vale para um login',
    dados: [['E-mail', d.email], ['Senha temporária', d.senha]],
    botao: { rotulo: 'Entrar no n.360', url: d.url },
    notas: ['No primeiro login o n.360 pede uma senha nova. Não encaminhe este e-mail.'],
    motivo: `uma conta com este endereço foi criada no n.360 (organização: ${d.organizacao}).`,
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

export function emailCodigoPoliticas(d: { nome: string; cliente: string; codigo: string }): EmailComAssunto {
  return com(`Seu código para ler as políticas de ${d.cliente}`, {
    previa: `Código de acesso às políticas de ${d.cliente}. Ele vale por 15 minutos.`,
    titulo: `Políticas de ${d.cliente}`,
    saudacao: ola(d.nome),
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
const nomeDoCliente = (q: QuemPede) => q.cliente || q.pessoa?.organizacao || 'A organização';

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
