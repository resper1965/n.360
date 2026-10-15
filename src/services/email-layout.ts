/**
 * Invólucro único de todo e-mail que o n.360 envia (convite, código, ciência, proposta, homologação,
 * resumo de prazos, alerta da sonda). Devolve o HTML e o texto puro equivalente; `enviarEmail`
 * (helpers.ts) exige os dois.
 *
 * Regras do meio, não da tela: tabela, CSS inline, 600px, fundo claro (o tema escuro do produto quebra
 * no Outlook e no modo claro do Gmail), nenhuma imagem nem fonte externa obrigatória. Todo dado
 * interpolado passa por `escapeHtml` aqui dentro: quem chama entrega texto, nunca HTML.
 *
 * Cores (contraste WCAG medido em test/email-layout.test.ts): botão #0b1326 com texto #ffffff
 * (18,5:1); texto #0f172a sobre #ffffff; apoio e rodapé #475569. O #00ade8 só no ponto das marcas.
 */
import { escapeHtml as e } from '../helpers';

export type Produto = 'n.360' | 'n.iso' | 'n.privacy';
export type EmailMontado = { html: string; text: string };

export const COR = {
  fundo: '#f1f5f9', cartao: '#ffffff', borda: '#e2e8f0', rodape: '#f8fafc',
  texto: '#0f172a', apoio: '#475569', ponto: '#00ade8', botao: '#0b1326', botaoTexto: '#ffffff',
} as const;

const FONTE_MARCA = "Montserrat, 'Segoe UI', Arial, sans-serif";
const FONTE_TEXTO = "Inter, 'Segoe UI', Arial, sans-serif";
const FONTE_CODIGO = "'JetBrains Mono', Consolas, 'Courier New', monospace";
const ENDERECO = 'noreply@ness.com.br';

export type Pessoa = { nome?: string | null; email?: string | null; organizacao?: string | null };

export type EmailEntrada = {
  produto?: Produto;
  /** Vai no <title> e no texto de pré-visualização da caixa de entrada. */
  assunto: string;
  previa?: string;
  titulo: string;
  saudacao?: string | null;
  paragrafos?: string[];
  quemPede?: Pessoa | null;
  acao?: string;
  /** Já em dd/mm/aaaa (use `dataBr`) ou uma duração ("15 minutos a partir deste e-mail"). */
  prazo?: string | null;
  codigo?: string;
  /** Linhas rotuladas, ex. e-mail e senha temporária do convite. */
  dados?: [string, string][];
  listas?: { titulo: string; itens: string[] }[];
  /** Texto livre de quem envia (mensagem da proposta): quebras de linha preservadas. */
  mensagem?: string | null;
  botao?: { rotulo: string; url: string };
  notas?: string[];
  /** Completa "Você recebeu este e-mail porque ...". */
  motivo: string;
  /** Pessoa a quem responder; sem ela, o rodapé diz que o endereço não recebe resposta. */
  contato?: Pessoa | null;
};

/** dd/mm/aaaa no fuso de Brasília. Data pura (aaaa-mm-dd) não muda de dia; datetime do SQLite é UTC. */
export function dataBr(v: string | Date | null | undefined): string {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('/');
  const d = typeof v === 'string' ? new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v.replace(' ', 'T')}Z`) : v;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** Nome para o cabeçalho From: sem <, >, aspas nem quebra de linha. */
export const nomeSeguro = (n: string | null | undefined) => (n ?? '').replace(/[<>"\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

/** "Cliente via n.360 <noreply@...>" quando há quem pede; senão "n.360 | ness. <noreply@...>". O domínio é sempre o verificado. */
export function remetente(produto: Produto = 'n.360', quem?: string | null): string {
  const n = nomeSeguro(quem);
  return n ? `${n} via ${produto} <${ENDERECO}>` : `${produto} | ness. <${ENDERECO}>`;
}
export const REMETENTE_PADRAO = remetente();

/** "Ana Souza (ana@x.com), da Consultoria X". Texto puro: o HTML escapa depois. */
export function descreverPessoa(p: Pessoa | null | undefined): string {
  if (!p) return '';
  const nome = p.nome?.trim() || '';
  const email = p.email?.trim() || '';
  const quem = nome && email ? `${nome} (${email})` : nome || email;
  const org = p.organizacao?.trim() || '';
  return quem && org ? `${quem}, da ${org}` : quem || org;
}

/** A marca com o ponto na cor: "n.360", "ness.". */
function marca(nome: string, tamanho: number): string {
  const i = nome.indexOf('.');
  const corpo = i < 0 ? e(nome) : `${e(nome.slice(0, i))}<span style="color:${COR.ponto};">.</span>${e(nome.slice(i + 1))}`;
  return `<span style="font-family:${FONTE_MARCA};font-weight:500;font-size:${tamanho}px;letter-spacing:-0.01em;color:#000000;">${corpo}</span>`;
}

const p = (texto: string, estilo = '') =>
  `<p style="margin:0 0 16px;font-family:${FONTE_TEXTO};font-size:15px;line-height:1.6;color:${COR.texto};${estilo}">${e(texto)}</p>`;

function linhaFato(rotulo: string, valor: string): string {
  return `<tr><td valign="top" style="padding:8px 16px 8px 0;font-family:${FONTE_TEXTO};font-size:13px;color:${COR.apoio};white-space:nowrap;width:120px;">${e(rotulo)}</td>`
    + `<td valign="top" style="padding:8px 0;font-family:${FONTE_TEXTO};font-size:15px;line-height:1.5;color:${COR.texto};font-weight:500;">${e(valor)}</td></tr>`;
}

export function montarEmail(m: EmailEntrada): EmailMontado {
  const produto = m.produto ?? 'n.360';
  const quem = descreverPessoa(m.quemPede);
  const contato = descreverPessoa(m.contato);
  // nome que já termina em ponto ("ness.", "S.A.") no fim da frase não ganha outro
  const motivo = m.motivo.replace(/\.\.$/, '.');
  const fatos: [string, string][] = [
    ...(quem ? [['Quem pede', quem] as [string, string]] : []),
    ...(m.acao ? [['O que fazer', m.acao] as [string, string]] : []),
    ...(m.prazo ? [['Até quando', m.prazo] as [string, string]] : []),
  ];
  const rodapeContato = m.contato?.email
    ? `Dúvidas: responda a este e-mail para falar com ${contato}${contato.endsWith('.') ? '' : '.'}`
    : 'Este endereço não recebe respostas.';
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${e(m.assunto)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${e(m.previa ?? m.titulo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR.fundo};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${COR.cartao};border:1px solid ${COR.borda};">
<tr><td style="padding:20px 32px;border-bottom:1px solid ${COR.borda};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="left">${marca(produto, 22)}</td><td align="right">${marca('ness.', 16)}</td></tr></table></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 20px;font-family:${FONTE_MARCA};font-weight:600;font-size:22px;line-height:1.3;color:${COR.texto};">${e(m.titulo)}</h1>
${m.saudacao ? p(m.saudacao) : ''}${(m.paragrafos ?? []).map((t) => p(t)).join('')}
${m.mensagem ? `<div style="margin:0 0 16px;padding:12px 16px;background:${COR.rodape};border:1px solid ${COR.borda};font-family:${FONTE_TEXTO};font-size:15px;line-height:1.6;color:${COR.texto};white-space:pre-wrap;">${e(m.mensagem)}</div>` : ''}
${fatos.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border-top:1px solid ${COR.borda};border-bottom:1px solid ${COR.borda};">${fatos.map(([r, v]) => linhaFato(r, v)).join('')}</table>` : ''}
${m.dados?.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:${COR.fundo};"><tr><td style="padding:12px 16px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0">${m.dados.map(([r, v]) => `<tr><td style="padding:4px 16px 4px 0;font-family:${FONTE_TEXTO};font-size:13px;color:${COR.apoio};">${e(r)}</td><td style="padding:4px 0;font-family:${FONTE_CODIGO};font-size:15px;color:${COR.texto};"><strong>${e(v)}</strong></td></tr>`).join('')}</table></td></tr></table>` : ''}
${m.codigo ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="padding:16px 24px;background:${COR.fundo};border:1px solid ${COR.borda};font-family:${FONTE_CODIGO};font-size:28px;letter-spacing:6px;color:${COR.texto};"><strong>${e(m.codigo)}</strong></td></tr></table>` : ''}
${(m.listas ?? []).map((l) => `<h2 style="margin:24px 0 8px;font-family:${FONTE_MARCA};font-weight:600;font-size:16px;color:${COR.texto};">${e(l.titulo)}</h2><ul style="margin:0 0 16px;padding-left:20px;">${l.itens.map((i) => `<li style="margin:0 0 6px;font-family:${FONTE_TEXTO};font-size:15px;line-height:1.5;color:${COR.texto};">${e(i)}</li>`).join('')}</ul>`).join('')}
${m.botao ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;"><tr><td bgcolor="${COR.botao}" style="background:${COR.botao};"><a href="${e(m.botao.url)}" style="display:inline-block;padding:14px 28px;font-family:${FONTE_TEXTO};font-size:15px;font-weight:600;color:${COR.botaoTexto};text-decoration:none;">${e(m.botao.rotulo)}</a></td></tr></table>
<p style="margin:0 0 16px;font-family:${FONTE_TEXTO};font-size:13px;line-height:1.5;color:${COR.apoio};">Se o botão não abrir, copie este endereço no navegador:<br><a href="${e(m.botao.url)}" style="color:${COR.texto};text-decoration:underline;word-break:break-all;">${e(m.botao.url)}</a></p>` : ''}
${(m.notas ?? []).map((t) => p(t, `font-size:13px;color:${COR.apoio};`)).join('')}
</td></tr>
<tr><td style="padding:20px 32px;background:${COR.rodape};border-top:1px solid ${COR.borda};font-family:${FONTE_TEXTO};font-size:13px;line-height:1.6;color:${COR.apoio};">
Você recebeu este e-mail porque ${e(motivo)}<br>${e(rodapeContato)}<br><br>${marca(produto, 14)} <span style="color:${COR.apoio};">·</span> ${marca('ness.', 14)}
</td></tr>
</table></td></tr></table>
</body></html>`;

  const t: string[] = [`${produto} | ness.`, '', m.titulo, ''];
  if (m.saudacao) t.push(m.saudacao, '');
  for (const x of m.paragrafos ?? []) t.push(x, '');
  if (m.mensagem) t.push(m.mensagem, '');
  if (fatos.length) t.push(...fatos.map(([r, v]) => `${r}: ${v}`), '');
  if (m.dados?.length) t.push(...m.dados.map(([r, v]) => `${r}: ${v}`), '');
  if (m.codigo) t.push(`Código: ${m.codigo}`, '');
  for (const l of m.listas ?? []) t.push(l.titulo, ...l.itens.map((i) => `- ${i}`), '');
  if (m.botao) t.push(`${m.botao.rotulo}: ${m.botao.url}`, '');
  for (const x of m.notas ?? []) t.push(x, '');
  t.push('--', `Você recebeu este e-mail porque ${motivo}`, rodapeContato, `${produto} · ness.`);
  return { html, text: t.join('\n') };
}
