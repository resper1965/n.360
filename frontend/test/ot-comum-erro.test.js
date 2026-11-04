import { describe, it, expect } from 'vitest';
import { mensagemDeErro } from '../src/ot-comum.js';

// Decisão do dono (2026-11-04): a recusa de IP/MAC em texto livre fica, mas a tela explica o motivo. A explicação vem em `details`.
describe('mensagemDeErro: recusa de texto livre explicada', () => {
  const explicacao = 'O texto tem algo com forma de endereço IP ou MAC (ex.: quatro números separados por ponto). Para não expor dado sensível, campo de texto livre não aceita endereço: registre IP e MAC nos campos próprios do ativo. Se for item da norma ou versão de firmware, troque o último ponto por hífen (ex.: 4.5.1-1).';
  const erro = (details) => Object.assign(new Error('Payload inválido'), { status: 400, body: { error: 'Payload inválido', details } });

  it('mostra a explicação de endereço em vez de "Payload inválido"', () => {
    expect(mensagemDeErro(erro([{ path: 'notas', message: explicacao }]), 'x')).toBe(explicacao);
  });
  it('mostra a recusa de dado pessoal', () => {
    expect(mensagemDeErro(erro([{ path: 'evidencia', message: 'Não informe CPF, e-mail nem telefone' }]), 'x')).toBe('Não informe CPF, e-mail nem telefone');
  });
  it('outros 400 seguem como antes', () => {
    expect(mensagemDeErro(erro([{ path: 'nome', message: 'Too small' }]), 'x')).toBe('Payload inválido');
  });
});
