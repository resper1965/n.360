// Amostras de revisão visual dos e-mails do n.360, com dados FICTÍCIOS.
// Monta cada e-mail pelas mesmas funções que as rotas usam (src/services/emails.ts e o resumo de
// avisos-prazo.ts), grava o HTML e o texto puro em docs/design/emails/ e captura um PNG de cada
// HTML com o Chromium do Playwright.
//   node scripts/emails-amostra.mjs            (HTML, texto e PNG)
//   node scripts/emails-amostra.mjs --sem-png  (só HTML e texto)
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const saida = join(raiz, 'docs', 'design', 'emails');
mkdirSync(saida, { recursive: true });

const bundle = join(tmpdir(), `emails-amostra-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `export * from './src/services/emails'; export { emailResumo } from './src/services/avisos-prazo';`,
    resolveDir: raiz, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error',
});
const m = await import(pathToFileURL(bundle).href);

const ana = { nome: 'Ana Souza', email: 'ana.souza@ness.example', organizacao: 'ness.' };
const quem = { cliente: 'Metalúrgica Exemplo Ltda', pessoa: ana };
const daqui = (dias) => new Date(Date.now() + dias * 86_400_000);
const amostras = {
  'convite': m.emailBoasVindas({ nome: 'Bruno Lima', email: 'bruno.lima@cliente.example', organizacao: 'ness.', equipe: false, convidante: ana, url: 'https://n360.ness.com.br', link: 'https://n360.ness.com.br/#convite=exemplo', horas: 72 }),
  'redefinicao-senha': m.emailRedefinicaoSenha({ nome: 'Bruno Lima', codigo: '482913' }),
  'codigo-politicas': m.emailCodigoPoliticas({ cliente: 'Metalúrgica Exemplo Ltda', codigo: '705218' }),
  'protocolo-titular': m.emailProtocoloTitular({ protocolo: 'PT-2026-0001', codigo: 'K7QM-3XRP-9WTD-H2FN', link: 'https://n360.ness.com.br/solicitacao#acompanhar=PT-2026-0001.K7QM-3XRP-9WTD-H2FN' }),
  'encaminhamento-titular': m.emailEncaminhamentoTitular({ protocolo: 'PT-2026-0001', tipo: 'Acesso aos dados', prazo: '2026-12-01', mensagem: 'Por favor, localize os registros de ponto do titular deste pedido entre janeiro e março e me responda por este e-mail.', nome: 'Ponto Focal Exemplo', quem: { nome: 'Consultora Exemplo', email: 'consultora@ness.com.br', organizacao: 'ness.' } }),
  'senha-definida': m.emailSenhaDefinidaPorOutro({ nome: 'Bruno Lima', quem: { nome: 'Ana Souza', email: 'ana.souza@ness.example' }, url: 'https://n360.ness.com.br', link: 'https://n360.ness.com.br/#convite=exemplo', horas: 72 }),
  'ciencia': m.emailCiencia({ titulo: 'Política de Segurança da Informação', nome: 'Carla Dias', link: 'https://n360.ness.com.br/politicas#exemplo', quem, reenvio: false, validoAte: daqui(30) }),
  'ciencia-reenvio': m.emailCiencia({ titulo: 'Política de Segurança da Informação', nome: 'Carla Dias', link: 'https://n360.ness.com.br/politicas#exemplo', quem, reenvio: true, validoAte: daqui(30) }),
  'codigo-ciencia': m.emailCodigoCiencia({ titulo: 'Política de Segurança da Informação', nome: 'Carla Dias', codigo: '319460', quem }),
  'proposta': m.emailProposta({ organizacao: 'ness.', numero: 'NESS-2026-014', revisao: 1, validaAte: '2026-11-30', link: 'https://n360.ness.com.br/proposta#exemplo',
    quem: { nome: 'Diego Ramos', email: 'diego.ramos@ness.example', organizacao: 'ness.' }, mensagem: 'Conforme conversamos na reunião de terça.\nFico à disposição para ajustar o escopo.' }),
  'homologacao': m.emailHomologacao({ cliente: 'Metalúrgica Exemplo Ltda', fornecedor: 'Transportes Exemplo S.A.', expiraEm: '2026-10-30 14:00:00', link: 'https://n360.ness.com.br/homologacao#exemplo', quem: ana }),
  'pedido-aprovacao': m.emailPedidoAprovacao({ tipo: 'politica', titulo: 'Política: Política de Segurança da Informação', papel: 'ciso', nome: 'Carla Dias', link: 'https://n360.ness.com.br/?tela=meus-pedidos', quem }),
  'homologacao-lembrete': m.emailLembreteHomologacao({ cliente: 'Metalúrgica Exemplo Ltda', fornecedor: 'Transportes Exemplo S.A.', enviadoEm: '2026-10-15 14:00:00', expiraEm: '2026-10-30 14:00:00', quem: ana }),
  'homologacao-respondida': m.emailHomologacaoRespondida({ nome: 'Ana Souza', fornecedor: 'Transportes Exemplo S.A.', cliente: 'Metalúrgica Exemplo Ltda', respondidas: 9, total: 12, percentual: 75, link: 'https://n360.ness.com.br/privacy?tela=terceiros' }),
  'resumo-prazos': m.emailResumo([
    { id: '1', user_id: 'u', email: 'ana.souza@ness.example', nome: 'Ana Souza', projeto: 'Metalúrgica Exemplo', fonte: 'capa', marco: 'D-7', vence_em: '2026-10-22', titulo: 'Revisar acessos de terceiros' },
    { id: '2', user_id: 'u', email: 'ana.souza@ness.example', nome: 'Ana Souza', projeto: 'Metalúrgica Exemplo', fonte: 'documento', marco: 'atraso', vence_em: '2026-10-08', titulo: 'Política de Backup' },
    { id: '3', user_id: 'u', email: 'ana.souza@ness.example', nome: 'Ana Souza', projeto: 'Clínica Exemplo', fonte: 'titular_pedido', marco: 'D0', vence_em: '2026-10-15', titulo: 'PT-2026-0007' },
  ], 'https://n360.ness.com.br'),
  'alerta-sonda': m.emailAlertaSonda('n.360: dependência de produção sem resposta', ['KV SESSIONS: tempo esgotado (exemplo)', 'Verificado em 15/10/2026 08:00 (Brasília).']),
};

for (const [nome, e] of Object.entries(amostras)) {
  writeFileSync(join(saida, `${nome}.html`), e.html);
  writeFileSync(join(saida, `${nome}.txt`), `Assunto: ${e.assunto}\n\n${e.text}\n`);
}

if (!process.argv.includes('--sem-png')) {
  // o playwright-core mora nas dependências do frontend (E2E)
  const { chromium } = createRequire(join(raiz, 'frontend', 'package.json'))('playwright-core');
  const navegador = await chromium.launch(process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {});
  const pagina = await navegador.newPage({ viewport: { width: 680, height: 600 } });
  for (const nome of Object.keys(amostras)) {
    await pagina.goto(pathToFileURL(join(saida, `${nome}.html`)).href);
    await pagina.screenshot({ path: join(saida, `${nome}.png`), fullPage: true });
  }
  await navegador.close();
}
console.log(`${Object.keys(amostras).length} amostras em ${saida}`);
