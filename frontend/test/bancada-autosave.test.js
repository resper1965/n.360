import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarAutosave } from '../src/bancada/autosave.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('criarAutosave', () => {
  it('junta digitações em uma gravação depois de 800 ms e avisa "salvo"', async () => {
    const salvar = vi.fn().mockResolvedValue({ salvo_em: '2026-10-15 14:02:11' });
    const status = vi.fn();
    const a = criarAutosave({ salvar, aoMudar: status });
    a.agendar('justificativas', 'a'); a.agendar('justificativas', 'ab'); a.agendar('obs', 'x');
    await vi.advanceTimersByTimeAsync(799);
    expect(salvar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar).toHaveBeenCalledWith({ justificativas: 'ab', obs: 'x' });
    expect(status).toHaveBeenLastCalledWith({ situacao: 'salvo', salvoEm: '2026-10-15 14:02:11' });
  });
  it('repete 3 vezes em falha de rede e, esgotado, pede "Tentar agora"', async () => {
    const salvar = vi.fn().mockRejectedValue(new Error('rede'));
    const status = vi.fn();
    const a = criarAutosave({ salvar, aoMudar: status });
    a.agendar('x', 'y');
    await vi.advanceTimersByTimeAsync(800 + 2000 + 2000);
    expect(salvar).toHaveBeenCalledTimes(3);
    expect(status).toHaveBeenLastCalledWith({ situacao: 'erro', mensagem: expect.stringContaining('Não foi possível salvar') });
    salvar.mockResolvedValueOnce({ salvo_em: 'agora' });
    await a.tentarAgora();
    expect(status).toHaveBeenLastCalledWith({ situacao: 'salvo', salvoEm: 'agora' });
    expect(salvar).toHaveBeenLastCalledWith({ x: 'y' });
  });
  it('409 de edição concorrente não repete: devolve os conflitos e mantém o campo pendente', async () => {
    const conflitos = [{ campo: 'x', valor_atual: 'dele', atualizado_em: '2026-10-15 14:00:00', por: 'ana@exemplo.test' }];
    const salvar = vi.fn().mockRejectedValue(Object.assign(new Error('Outra pessoa alterou este campo'), { status: 409, body: { conflitos } }));
    const status = vi.fn();
    const a = criarAutosave({ salvar, aoMudar: status });
    a.agendar('x', 'meu');
    await vi.advanceTimersByTimeAsync(800);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenLastCalledWith({ situacao: 'conflito', conflitos });
    expect(a.temPendente()).toBe(true);
  });
  it('descartar() tira o campo da fila', async () => {
    const salvar = vi.fn().mockResolvedValue({ salvo_em: 'agora' });
    const a = criarAutosave({ salvar, aoMudar: () => {} });
    a.agendar('x', 'y'); a.descartar('x');
    await vi.advanceTimersByTimeAsync(800);
    expect(salvar).not.toHaveBeenCalled();
  });
  it('esvaziar() grava já o que estiver pendente (antes de navegar)', async () => {
    const salvar = vi.fn().mockResolvedValue({ salvo_em: 'agora' });
    const a = criarAutosave({ salvar, aoMudar: () => {} });
    a.agendar('x', 'y');
    await a.esvaziar();
    expect(salvar).toHaveBeenCalledWith({ x: 'y' });
    await a.esvaziar();
    expect(salvar).toHaveBeenCalledTimes(1);
  });
});
