import { describe, it, expect } from 'vitest';
import { estadoDoPasso, situacaoDaFase, continuar, montarBancada } from '../src/services/passos/estado';
import { ctxVazio, linha } from './helpers/passos';
import catalogoMini from '../contracts/bancada/catalogo.json';
import { catalogoSchema } from '../src/data/passos/tipos';

const { ok: _ok, ...cru } = catalogoMini as Record<string, unknown>;
const cat = catalogoSchema.parse(cru);               // p3_3 e p3_4, fase 3
const [p33, p34] = cat.passos;

describe('estadoDoPasso', () => {
  it('nada: não iniciado', () => { expect(estadoDoPasso(p33, ctxVazio()).estado).toBe('nao_iniciado'); });
  it('campo preenchido, evidência ou responsável: em andamento', () => {
    const c = ctxVazio(); c.respostas.set('p3_3.justificativas', { valor: 'x', atualizado_em: '2026-10-15 10:00:00', por: null });
    expect(estadoDoPasso(p33, c).estado).toBe('em_andamento');
    const d = ctxVazio(); d.progresso.set('p3_3', linha({ assigned_to: 'Maria' }));
    expect(estadoDoPasso(p33, d).estado).toBe('em_andamento');
  });
  it('is_checked: concluído; com exceção, a marca', () => {
    const c = ctxVazio(); c.progresso.set('p3_3', linha({ is_checked: 1, excecao_motivo: 'Cliente já tinha o documento assinado' }));
    expect(estadoDoPasso(p33, c)).toMatchObject({ estado: 'concluido', concluidoPorExcecao: true });
  });
  it('bloqueio só vale com motivo E responsável', () => {
    const c = ctxVazio(); c.progresso.set('p3_3', linha({ bloqueio_motivo: 'Aguardando a diretoria' }));
    expect(estadoDoPasso(p33, c).estado).not.toBe('bloqueado');
    c.progresso.set('p3_3', linha({ bloqueio_motivo: 'Aguardando a diretoria', bloqueio_responsavel: 'Maria' }));
    expect(estadoDoPasso(p33, c).estado).toBe('bloqueado');
  });
});

describe('situacaoDaFase', () => {
  it('bloqueado vence; todos concluídos = completed; algum movimento = in_progress; senão pending', () => {
    expect(situacaoDaFase(['concluido', 'bloqueado'], null)).toBe('blocked');
    expect(situacaoDaFase(['concluido', 'concluido'], null)).toBe('completed');
    expect(situacaoDaFase(['concluido', 'nao_iniciado'], null)).toBe('in_progress');
    expect(situacaoDaFase(['em_andamento', 'nao_iniciado'], null)).toBe('in_progress');
    expect(situacaoDaFase(['nao_iniciado', 'nao_iniciado'], null)).toBe('pending');
  });
  it('situação anterior bloqueada segura a fase, mas fase toda concluída se solta dela', () => {
    expect(situacaoDaFase(['nao_iniciado'], 'blocked')).toBe('blocked');
    expect(situacaoDaFase(['concluido', 'concluido'], 'blocked')).toBe('completed');
  });
});

describe('continuar', () => {
  it('sem atividade: o primeiro passo não concluído', () => {
    expect(continuar(cat, ctxVazio())).toEqual({ fase: 3, passo: 'p3_3' });
  });
  it('depois do último concluído, o seguinte; bloqueado é pulado', () => {
    const c = ctxVazio(); c.progresso.set('p3_3', linha({ is_checked: 1, checked_at: '2026-10-15 11:00:00' }));
    expect(continuar(cat, c)).toEqual({ fase: 3, passo: 'p3_4' });
    c.progresso.set('p3_4', linha({ item_id: 'p3_4', bloqueio_motivo: 'x esperando', bloqueio_responsavel: 'Maria' }));
    expect(continuar(cat, c)).toBeNull();
  });
  it('o passo em andamento mais recente vence o primeiro da fila', () => {
    const c = ctxVazio(); c.respostas.set('p3_4.aprovador', { valor: 'CEO', atualizado_em: '2026-10-15 12:00:00', por: null });
    expect(continuar(cat, c)).toEqual({ fase: 3, passo: 'p3_4' });
  });
});

describe('montarBancada', () => {
  it('conta passos, devolve 1 linha por passo e o bloqueio da fase', () => {
    const c = ctxVazio(); c.progresso.set('p3_3', linha({ bloqueio_motivo: 'Aguardando a diretoria', bloqueio_responsavel: 'Maria', bloqueado_em: '2026-10-15 09:00:00' }));
    const b = montarBancada(cat, c);
    expect(b.passos).toHaveLength(cat.passos.length);
    expect(b.totais).toMatchObject({ passos: cat.passos.length, bloqueados: 1 });
    expect(b.fases.find((f) => f.numero === 3)).toMatchObject({ situacao: 'blocked', bloqueio: { motivo: 'Aguardando a diretoria', responsavel: 'Maria' } });
  });
});
