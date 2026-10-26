import { Hono, type Context } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500, logAudit } from '../helpers';
import { EXPORTACOES, NIVEIS_DE_RISCO, STATUS_DE_GAP, STATUS_DE_RISCO, exportarCsv, type FiltroExportacao, type TipoExportacao } from '../services/exportacao';
import { ehFaixaPrazo } from '../services/riscos-atividade';
import { ripdEmWord, liaEmWord, documentoEmWord, TIPO_DOCX } from '../services/documento-word';

/**
 * Exportação (F4): CSV das listas do n.privacy e RIPD/LIA em Word. Montado em `/api/v1/projects/:projectId`, depois do
 * `projectAccessMiddleware`; a faixa de cada caminho está em `src/modulos.ts` e o agente fica de fora (`FORA_DO_AGENTE`).
 * A trilha leva o tipo e a contagem, nunca o conteúdo.
 */
export const exportacaoApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const nota = (v: string | undefined) => (v === undefined ? undefined : /^[1-5]$/.test(v) ? Number(v) : NaN);

for (const tipo of Object.keys(EXPORTACOES) as TipoExportacao[]) {
  exportacaoApp.get(`/export/${tipo}`, async (c) => {
    try {
      const projectId = c.req.param('projectId')!;
      const filtro: FiltroExportacao = {};
      // Busca e filtros da tela (texto curto; só comparados, nunca interpolados).
      const texto = (k: string) => { const v = c.req.query(k)?.trim(); return v ? v.slice(0, 200) : undefined; };
      if (tipo === 'riscos-atividade' || tipo === 'acoes-atividade') {
        filtro.area = texto('area');
        filtro.status = texto('status');
        if (tipo === 'riscos-atividade') {
          filtro.motivo = texto('motivo');
          filtro.nivel = texto('nivel');
          if (filtro.nivel && !NIVEIS_DE_RISCO.includes(filtro.nivel)) return c.json({ error: 'Nível de risco desconhecido' }, 400);
          if (filtro.status && !STATUS_DE_RISCO.includes(filtro.status)) return c.json({ error: 'Situação de risco desconhecida' }, 400);
        } else {
          filtro.q = texto('q');
          if (filtro.status && !STATUS_DE_GAP.includes(filtro.status)) return c.json({ error: 'Situação de gap desconhecida' }, 400);
        }
      }
      if (tipo === 'riscos-atividade') {
        filtro.probabilidade = nota(c.req.query('probabilidade'));
        filtro.impacto = nota(c.req.query('impacto'));
        if (Number.isNaN(filtro.probabilidade) || Number.isNaN(filtro.impacto)) return c.json({ error: 'Probabilidade e impacto vão de 1 a 5' }, 400);
      }
      if (tipo === 'acoes-atividade') {
        const faixa = c.req.query('faixa');
        if (faixa !== undefined && !ehFaixaPrazo(faixa)) return c.json({ error: 'Faixa de prazo desconhecida' }, 400);
        filtro.faixa = faixa;
      }
      const r = await exportarCsv(c.env.DB, projectId, tipo, filtro);
      const filtrado = Object.values(filtro).some((v) => v !== undefined) ? ', com filtro' : '';
      await logAudit(c.env.DB, 'exportacao.csv', c.get('user')?.email || 'system',
        `Exportação CSV de ${EXPORTACOES[tipo].rotulo}: ${r.total} linhas${filtrado}${r.truncado ? ' (cortada no teto)' : ''}`, '', '', projectId);
      return new Response(r.csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${tipo}-${new Date().toISOString().slice(0, 10)}.csv"`,
          'Cache-Control': 'no-store',
          ...(r.truncado ? { 'X-Exportacao-Truncada': '1' } : {}),
        },
      });
    } catch (e) { return erro500(c, 'Erro ao exportar', e); }
  });
}

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

async function responderWord(c: Ctx, gerar: () => Promise<{ bytes: Uint8Array; nome: string } | null>, oQue: string, id: string) {
  try {
    const doc = await gerar();
    if (!doc) return c.json({ error: `${oQue} não encontrado` }, 404);
    await logAudit(c.env.DB, 'exportacao.docx', c.get('user')?.email || 'system', `${oQue} ${id} baixado em Word`, '', '', c.req.param('projectId'));
    return new Response(doc.bytes, {
      headers: { 'Content-Type': TIPO_DOCX, 'Content-Disposition': `attachment; filename="${doc.nome}"`, 'Cache-Control': 'no-store' },
    });
  } catch (e) { return erro500(c, 'Erro ao gerar o Word', e); }
}

exportacaoApp.get('/dpia/:dpiaId/docx', (c) =>
  responderWord(c, () => ripdEmWord(c.env.DB, c.req.param('projectId')!, c.req.param('dpiaId'), c.env.STORAGE), 'RIPD', c.req.param('dpiaId')));

exportacaoApp.get('/documentos/:docId/docx', (c) =>
  responderWord(c, () => documentoEmWord(c.env.DB, c.req.param('projectId')!, c.req.param('docId'), c.env.STORAGE), 'Documento', c.req.param('docId')));

exportacaoApp.get('/ropa/:recordId/lia/docx', (c) =>
  responderWord(c, () => liaEmWord(c.env.DB, c.req.param('projectId')!, c.req.param('recordId'), c.env.STORAGE), 'LIA', c.req.param('recordId')));
