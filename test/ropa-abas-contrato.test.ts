import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ABAS_IDS, ETAPAS } from '../src/schemas/ropa-abas';
import ficha from '../contracts/ropa-abas/ficha.json';
import escopo from '../contracts/ropa-abas/escopo.json';
import baseJuridica from '../contracts/ropa-abas/base-juridica.json';
import gap from '../contracts/ropa-abas/gap.json';
import etapas from '../contracts/ropa-abas/etapas.json';
import conferencia from '../contracts/ropa-abas/conferencia.json';
import situacao409 from '../contracts/ropa-abas/situacao-409.json';
import contratoFrontend from '../frontend/src/atividade/contrato.js?raw';

/**
 * Os JSON de `contracts/ropa-abas/` são o contrato de resposta: o backend os compara com a saída real e o frontend os usa como dublê.
 * Os esquemas abaixo são DE PROPÓSITO escritos aqui, estritos, para o contrato não depender do serviço que ele fiscaliza.
 */
const S = z.strictObject;
const parte = S({ id: z.string(), nome: z.string() });
const estadoAba = z.enum(['feito', 'pendente', 'na', 'vazio']);
const acao = S({ habilitada: z.boolean(), motivo: z.string().nullable() });
const ABAS = Object.fromEntries(ABAS_IDS.map((a) => [a, S({ estado: estadoAba, resumo: z.string() })]));
const ACOES = ['conferir_aprovar', 'alterar_para_em_revisao', 'imprimir', 'reabrir', 'reativar', 'cancelar', 'excluir'];
const itemConferencia = S({ id: z.string(), aba: z.enum(ABAS_IDS), texto: z.string() });

const FORMAS: [string, unknown, z.ZodTypeAny][] = [
  ['ficha', ficha, S({
    ok: z.literal(true),
    registro: S({ id: z.string(), nome: z.string(), finalidade: z.string(), descricao_atividade: z.string().nullable(), responsavel: parte.nullable(), areas: z.array(parte), empresa: z.string() }),
    situacao: S({ codigo: z.enum(['rascunho', 'em_revisao', 'aprovada', 'cancelada']), rotulo: z.string(), aprovacao_desatualizada: z.boolean(), em_nova_revisao: z.boolean() }),
    acoes: S(Object.fromEntries(ACOES.map((a) => [a, acao]))),
    abas: S(ABAS),
    modulos: S({ iso: z.boolean() }),
    proxima_pergunta: S({ aba: z.enum(ABAS_IDS), campo: z.string() }).nullable(),
  })],
  ['escopo', escopo, S({ ok: z.literal(true), mudou_hash: z.boolean() })],
  ['base-juridica', baseJuridica, S({
    ok: z.literal(true),
    previsao_legal: z.string().nullable(),
    lgpd: z.array(S({ requisito_id: z.string(), referencia: z.string(), titulo: z.string(), finalidade: z.string(), principal: z.boolean(), finalidade_pendente: z.boolean() })),
    art11: S({ nao_aplicavel: z.boolean(), incisos: z.array(z.unknown()) }),
    gdpr: z.array(S({ base: z.string(), rotulo: z.string(), finalidade: z.string() })),
    lia_exigida: z.boolean(),
    base_gdpr_texto_anterior: z.string().nullable(),
    legal_basis_texto: z.string().nullable(),
  })],
  ['gap', gap, S({
    ok: z.literal(true),
    gaps: z.array(S({
      id: z.string(), gap: z.string(), recomendacao: z.string().nullable(), plano_acao: z.string().nullable(), responsavel: parte.nullable(), prazo: z.string().nullable(),
      status: z.enum(['Open', 'In Progress', 'Closed']), anexos: z.array(S({ id: z.string(), file_name: z.string(), file_type: z.enum(['pdf', 'doc', 'docx']), file_size: z.number() })),
    })),
    nao_aplicavel: z.boolean(),
  })],
  ['etapas', etapas, S({
    ok: z.literal(true),
    materializada: z.boolean(),
    etapas: z.array(S({
      etapa: z.enum(ETAPAS), rotulo: z.string(), situacao: z.enum(['pendente', 'concluida', 'nao_aplicavel']), faltas: z.array(z.string()), nao_aplicavel: z.boolean(),
      descricao: z.string().nullable(), origem: z.array(z.string()), solicita_consentimento: z.number().nullable(), criancas_adolescentes: z.boolean(),
      ativos: z.array(S({ item_id: z.string(), nome: z.string(), local_armazenamento: z.string().nullable(), travado: z.boolean() })),
      areas: z.array(parte), parceiros: z.array(parte),
      titulares: z.array(S({ titular_id: z.string(), nome: z.string(), situacao: z.enum(['definido', 'nao_usa']), dados: z.array(S({ id: z.string(), nome: z.string(), sensivel: z.boolean() })) })),
      prazo: z.string().nullable(), descarte: z.string().nullable(), migrado: z.boolean(), bloqueada: z.boolean(),
    })).length(6),
  })],
  ['conferencia', conferencia, S({ pronta: z.boolean(), bloqueios: z.array(itemConferencia), avisos: z.array(itemConferencia) })],
  ['situacao-409', situacao409, S({ error: z.string() })],
];

describe('contratos de resposta da ficha em abas', () => {
  for (const [nome, json, forma] of FORMAS) it(`${nome}.json cumpre a forma estrita`, () => {
    const r = forma.safeParse(json);
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
  });

  it('a lista ABAS do frontend tem os ids do backend, na mesma ordem, e os rótulos do legado', () => {
    const abas = contratoFrontend.slice(contratoFrontend.indexOf('export const ABAS'), contratoFrontend.indexOf('export const ETAPAS'));
    expect([...abas.matchAll(/id: '([a-z_]+)', rotulo: '([^']+)'/g)].map((m) => [m[1], m[2]])).toEqual([
      ['escopo', 'Escopo'], ['tratamento', 'Tratamento de Dados'], ['agentes', 'Agentes de Tratamento'], ['medidas', 'Medidas de Segurança'],
      ['base_juridica', 'Base Jurídica'], ['gaps', 'Controle de GAPs'], ['impacto', 'Teste de Impacto'], ['riscos', 'Riscos'], ['logs', 'Logs ROPA'],
    ]);
    expect([...abas.matchAll(/id: '([a-z_]+)'/g)].map((m) => m[1])).toEqual([...ABAS_IDS]);
  });
});
