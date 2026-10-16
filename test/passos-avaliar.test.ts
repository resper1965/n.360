import { describe, it, expect } from 'vitest';
import { avaliarPasso } from '../src/services/passos/avaliar';
import { validarValor, valoresDoPasso } from '../src/services/passos/valores';
import type { Passo } from '../src/data/passos/tipos';
import { ctxVazio, linha } from './helpers/passos';

const passo: Passo = {
  id: 'p3_3', fase: 3, ordem: 3, titulo: 'Justificar as exclusões de controles', clausula: 'Cl 6.1.3', porQue: 'O auditor confere cada exclusão.',
  campos: [
    { id: 'justificativas', rotulo: 'Quais controles ficam de fora?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'A.7.4: time remoto.' },
    { id: 'aprovador', rotulo: 'Quem aprovou?', tipo: 'escolha', obrigatorio: true, exemplo: '', opcoes: ['CEO', 'CISO'] },
    { id: 'obs', rotulo: 'Observações', tipo: 'texto', obrigatorio: false, exemplo: 'Nenhuma.' },
  ],
  prova: { descricao: 'Declaração com as justificativas.', obrigatoria: true, aceita: 'ambos' },
  ondeVive: [],
  concluidoQuando: [
    { tipo: 'campos_preenchidos', rotulo: 'Campos obrigatórios preenchidos' },
    { tipo: 'evidencia_anexada', rotulo: 'Prova anexada' },
    { tipo: 'registro_vinculado', rotulo: 'Ao menos um risco cadastrado', entidade: 'riscos', minimo: 1 },
    { tipo: 'pedido_de_aprovacao', rotulo: 'Pedido de aprovação aberto', pedidoTipo: 'documento', situacao: 'qualquer' },
  ],
};
const resp = (valor: string) => ({ valor, atualizado_em: '2026-10-15 10:00:00', por: 'a@x.test' });

describe('validarValor', () => {
  const [texto, escolha] = [passo.campos[0], passo.campos[1]];
  it('vazio limpa; escolha fora da lista e texto acima do teto são recusados', () => {
    expect(validarValor(texto, '  ')).toEqual({ ok: true, valor: '' });
    expect(validarValor(escolha, 'Estagiário').ok).toBe(false);
    expect(validarValor(texto, 'x'.repeat(4001)).ok).toBe(false);
    expect(validarValor(texto, 'x'.repeat(4000)).ok).toBe(true);
  });
  it('data só em aaaa-mm-dd válido; múltipla só com opções do campo', () => {
    const data = { id: 'd', rotulo: 'd', tipo: 'data', obrigatorio: false, exemplo: '' } as const;
    expect(validarValor(data, '2026-02-30').ok).toBe(false);
    expect(validarValor(data, '2026-11-05').ok).toBe(true);
    const mult = { id: 'm', rotulo: 'm', tipo: 'multipla', obrigatorio: false, exemplo: '', opcoes: ['A', 'B'] } as const;
    expect(validarValor(mult, 'A||B')).toEqual({ ok: true, valor: 'A||B' });
    expect(validarValor(mult, 'A||C').ok).toBe(false);
  });
});

describe('valoresDoPasso', () => {
  it('lê do JSON antigo de notes quando não há linha, e marca como herdado', () => {
    const c = ctxVazio();
    c.progresso.set('p3_3', linha({ notes: JSON.stringify({ justificativas: 'Texto antigo', aprovador: 'Estagiário' }) }));
    const v = valoresDoPasso(passo, c);
    expect(v.justificativas).toEqual({ valor: 'Texto antigo', atualizado_em: null, por: null, herdado: true });
    expect(v.aprovador).toBeUndefined(); // fora do domínio do campo novo: não é herdado
  });
  it('a linha de project_phase_answers vence o JSON antigo', () => {
    const c = ctxVazio();
    c.progresso.set('p3_3', linha({ notes: JSON.stringify({ justificativas: 'antigo' }) }));
    c.respostas.set('p3_3.justificativas', resp('novo'));
    expect(valoresDoPasso(passo, c).justificativas.herdado).toBe(false);
    expect(valoresDoPasso(passo, c).justificativas.valor).toBe('novo');
  });
});

describe('avaliarPasso', () => {
  it('passo vazio: nada cumprido, faltam todos', () => {
    const a = avaliarPasso(passo, ctxVazio());
    expect(a.ok).toBe(false);
    expect(a.faltam).toBe(4);
    expect(a.criterios[0]).toMatchObject({ tipo: 'campos_preenchidos', ok: false, detalhe: 'faltam 2 de 2' });
  });
  it('tudo cumprido passa', () => {
    const c = ctxVazio();
    c.respostas.set('p3_3.justificativas', resp('A.7.4 fica de fora.'));
    c.respostas.set('p3_3.aprovador', resp('CISO'));
    c.progresso.set('p3_3', linha({ evidence_id: 'ev-1' }));
    c.evidencias.add('ev-1');
    c.entidades.riscos = 3;
    c.pedidos.set('documento:aberto', 1);
    expect(avaliarPasso(passo, c)).toMatchObject({ ok: true, faltam: 0 });
  });
  it('evidência de outro projeto (fora do conjunto) não conta', () => {
    const c = ctxVazio();
    c.progresso.set('p3_3', linha({ evidence_id: 'ev-de-outro' }));
    expect(avaliarPasso(passo, c).criterios[1].ok).toBe(false);
  });
  it('entrevistas: toda trilha pedida precisa ter resposta', () => {
    const p: Passo = { ...passo, concluidoQuando: [passo.concluidoQuando[0], { tipo: 'entrevistas_concluidas', rotulo: 'Cinco trilhas', trilhas: ['executiva', 'rh'] as Array<'executiva' | 'rh'> }] };
    const c = ctxVazio();
    c.trilhas.add('executiva');
    expect(avaliarPasso(p, c).criterios[1]).toMatchObject({ ok: false, detalhe: 'falta: rh' });
    c.trilhas.add('rh');
    expect(avaliarPasso(p, c).criterios[1].ok).toBe(true);
  });
  it('critério desconhecido falha fechado', () => {
    const p = { ...passo, concluidoQuando: [passo.concluidoQuando[0], { tipo: 'sql_livre', rotulo: 'x' }] } as unknown as Passo;
    expect(avaliarPasso(p, ctxVazio()).criterios[1]).toMatchObject({ ok: false, detalhe: 'critério desconhecido' });
  });
});
