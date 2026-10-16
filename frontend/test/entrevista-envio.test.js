// A tela de entrevistas (checklist p2_2) salvava uma requisição por pergunta no formato
// antigo; a API valida `{ answers: [...] }` e respondia 400. Agora é um envio só.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { S } from '../src/state.js';
import { servir } from './servir-api.js';
import '../src/ui.js';
import '../src/views/project.js';

beforeEach(() => {
  document.body.innerHTML = `
    <textarea id="ans-q1">resposta um</textarea><input id="who-q1" value="Ana CISO"><input type="checkbox" id="gap-q1" checked>
    <textarea id="ans-q2">  </textarea><input id="who-q2" value=""><input type="checkbox" id="gap-q2">
    <div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><div id="interview-buttons-right"></div>
    <div id="interview-questions-container"></div>`;
  S.activeInterviewTrackQuestions = [{ key: 'q1', question: 'Pergunta 1?' }, { key: 'q2', question: 'Pergunta 2?' }];
});

describe('saveInterviewTrack', () => {
  it('envia um POST com { answers: [...] } só das perguntas respondidas', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true,"questions":[]}'));
    const btn = document.createElement('button');
    await window.saveInterviewTrack('p1', 'executiva', btn);
    const posts = f.mock.calls.filter(([, o]) => o.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toMatch(/\/api\/v1\/projects\/p1\/interviews$/);
    expect(JSON.parse(posts[0][1].body)).toEqual({
      answers: [{ track: 'executiva', question: 'Pergunta 1?', answer: 'resposta um', interviewee: 'Ana CISO', gap_detected: 1 }],
    });
  });
});

describe('openInterviewWizard', () => {
  it('as trilhas feitas vêm do resumo do servidor, não do navegador', async () => {
    const f = servir({
      'GET /api/v1/projects/p1/interviews/summary': { ok: true, summary: [{ track: 'rh', total: 2, gaps: 0 }] },
      'GET /api/v1/projects/p1/interviews/executiva': { ok: true, interviews: [], questions: [] },
    });
    await window.openInterviewWizard('p1');
    expect(f.mock.calls.some(([u]) => /\/projects\/p1\/interviews\/summary$/.test(u))).toBe(true);
    expect(localStorage.getItem('niso_interviewProgress')).toBeNull();
    expect(document.getElementById('track-tab-rh').querySelector('.t-sucesso')).not.toBeNull();
    expect(document.getElementById('track-tab-executiva').querySelector('.t-sucesso')).toBeNull();
  });
});
