import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { BaseAgent } from '../src/agents/types';

class Sonda extends BaseAgent {
  async run() { return { success: true, content: '', confidence: 1 }; }
  chamar() { return this.runModel([{ role: 'user', content: 'x' }], { maxTokens: 100 }); }
}
const com = (resposta: unknown) => new Sonda({ run: async () => resposta }, env.DB, env);

describe('runModel informa corte', () => {
  it('finish_reason length (formato OpenAI do gateway)', async () => {
    expect((await com({ choices: [{ message: { content: 'meio' }, finish_reason: 'length' }] }).chamar()).cortada).toBe(true);
  });
  it('sem finish_reason: usa o uso de tokens', async () => {
    expect((await com({ response: 'meio', usage: { completion_tokens: 100 } }).chamar()).cortada).toBe(true);
    expect((await com({ response: 'inteiro', usage: { completion_tokens: 40 } }).chamar()).cortada).toBe(false);
  });
  it('resposta normal', async () => {
    expect((await com({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }).chamar()).cortada).toBe(false);
  });
});
