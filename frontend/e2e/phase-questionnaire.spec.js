import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { servirShell } from './shell.js';

// Respostas da fase e interpretação — navegador real. A tela de respostas agora é a Bancada (cartão do passo com autosave no
// servidor); a API é mockada com os JSON de contracts/bancada. A interpretação e o dossiê seguem como eram.

const contrato = (nome) => JSON.parse(fs.readFileSync(new URL(`../../contracts/bancada/${nome}.json`, import.meta.url), 'utf8'));

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor', client_project_id: 'proj-e2e' };

test('abre o passo pelo endereço, escreve e o texto é salvo no servidor', async ({ page }) => {
  await page.addInitScript((u) => {
    localStorage.setItem('niso_token', 'e2e-fake-token');
    localStorage.setItem('niso_user', JSON.stringify(u));
    localStorage.setItem('niso_activeProject', JSON.stringify({ id: 'proj-e2e', project_name: 'Projeto E2E', modulos: ['iso'] }));
  }, USER);

  let putBody = null;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const metodo = route.request().method();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.pathname === '/api/v1/auth/me') return json({ user: USER });
    if (url.pathname === '/api/v1/passos/catalogo') return json(contrato('catalogo'));
    if (url.pathname === '/api/v1/projects/proj-e2e/bancada') return json(contrato('bancada'));
    if (url.pathname === '/api/v1/projects/proj-e2e/prontidao') return json({ indicador: { implementados: 31, aplicaveis: 90 } });
    if (url.pathname === '/api/v1/projects/proj-e2e/passos/p3_3' && metodo === 'GET') return json(contrato('passo'));
    if (/\/passos\/p3_3\/campos$/.test(url.pathname) && metodo === 'PUT') {
      putBody = route.request().postDataJSON();
      return json(contrato('campos'));
    }
    return json(metodo === 'GET' ? [] : { ok: true });
  });

  await servirShell(page).then(() => page.goto('/iso?tela=project-detail&fase=3&passo=p3_3'));

  // O endereço leva ao passo: h2 da fase e h3 do passo.
  await expect(page.locator('.bancada-cartao').getByRole('heading', { level: 3 })).toContainText('Passo 1 de 2');
  await expect(page.locator('.bancada-cartao').getByRole('heading', { level: 2 })).toContainText('Fase 3');

  // Escreve e espera o autosave (800 ms): o PUT sai com o campo e o aviso "Salvo às" aparece.
  await page.fill('#campo-justificativas', 'A.7.4: sem acesso físico ao escritório.');
  await expect.poll(() => putBody && putBody.campos.justificativas).toContain('sem acesso físico');
  await expect(page.locator('#bancada-salvo')).toContainText(/Salvo às \d{2}:\d{2}/);
});

test('interpreta a fase e mostra o diagnóstico específico', async ({ page }) => {
  await page.addInitScript((u) => {
    localStorage.setItem('niso_token', 'e2e-fake-token');
    localStorage.setItem('niso_user', JSON.stringify(u));
    localStorage.setItem('niso_activeProject', JSON.stringify({ id: 'proj-e2e', project_name: 'Projeto E2E' }));
  }, USER);

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.pathname === '/api/v1/auth/me') return json({ user: USER });
    if (/\/phase-answers\/1\/interpret$/.test(url.pathname)) {
      return json({
        generated_at: new Date().toISOString(), project_id: 'proj-e2e', phase: 1,
        titulo: 'Entrevista Executiva', clausula: '5.2 & 6.2',
        rotulo: 'Interpretação assistida da fase — revisar; não é parecer de certificação',
        cobertura: { total: 2, respondidas: 1, sem_resposta: [{ pergunta_key: 'p1_q2', pergunta: 'Objetivos de negócio?' }] },
        fonte: 'ia',
        interpretacao: {
          prontidao: 'critico', origem: 'ia',
          resumo: 'Apetite de risco não definido compromete a base da fase.',
          pontos: [{ severidade: 'alto', pergunta_key: 'p1_q1', observacao: 'Sem apetite de risco declarado pela direção.' }],
          proximos_passos: ['Formalizar o apetite de risco em ata da direção.'],
        },
      });
    }
    return json(route.request().method() === 'GET' ? [] : { ok: true });
  });

  await servirShell(page).then(() => page.goto('/iso'));
  await page.waitForFunction(() => typeof window.navigate === 'function' && !!window.S);

  await page.evaluate(() => {
    window.S.phaseQuestions = { 1: [
      { key: 'p1_q1', type: 'select', question: 'Apetite de risco declarado pela direção?', options: ['Baixo', 'Moderado', 'Alto', 'Não definido'] },
      { key: 'p1_q2', type: 'text', question: 'Quais os 3 principais objetivos de negócio?' },
    ] };
    window.S.phaseAnswers = { 1: { p1_q1: 'Não definido' } };
    window.interpretPhaseAnswers(1, 'proj-e2e');
  });

  // O diagnóstico específico aparece: prontidão, resumo citando a resposta e o passo.
  await expect(page.locator('.modal')).toContainText('Crítico');
  await expect(page.locator('.modal')).toContainText('Apetite de risco não definido');
  await expect(page.locator('.modal')).toContainText('Formalizar o apetite de risco');
  await expect(page.locator('.modal')).toContainText('1/2 perguntas respondidas');
});

test('gera o dossiê da jornada com as respostas consolidadas', async ({ page }) => {
  await page.addInitScript((u) => {
    localStorage.setItem('niso_token', 'e2e-fake-token');
    localStorage.setItem('niso_user', JSON.stringify(u));
    localStorage.setItem('niso_activeProject', JSON.stringify({ id: 'proj-e2e', project_name: 'Projeto E2E' }));
  }, USER);

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (url.pathname === '/api/v1/auth/me') return json({ user: USER });
    if (/\/journey-dossier$/.test(url.pathname)) {
      return json({
        generated_at: new Date().toISOString(), project_id: 'proj-e2e',
        rotulo: 'Dossiê da jornada — não é parecer de certificação',
        projeto: { client_name: 'ACME S.A.', scope: 'Sede e nuvem', standards: 'ISO 27001', org_role: 'controller', status: 'Active' },
        resumo: { fases_iniciadas: 1, total_perguntas_das_fases_iniciadas: 4, respondidas: 1 },
        secoes: [{
          phase: 1, titulo: 'Entrevista Executiva', clausula: '5.2 & 6.2', status: 'Em andamento',
          cobertura: { total: 4, respondidas: 1 },
          respostas: [
            { pergunta_key: 'p1_q1', pergunta: 'Apetite de risco declarado pela direção?', tipo: 'select', resposta: 'Moderado' },
            { pergunta_key: 'p1_q2', pergunta: 'Objetivos de negócio?', tipo: 'text', resposta: null },
          ],
        }],
      });
    }
    return json(route.request().method() === 'GET' ? [] : { ok: true });
  });

  await servirShell(page).then(() => page.goto('/iso'));
  await page.waitForFunction(() => typeof window.navigate === 'function' && !!window.S);

  await page.evaluate(() => window.generateJourneyDossier('proj-e2e'));

  await expect(page.locator('.modal')).toContainText('Dossiê da Jornada — ACME S.A.');
  await expect(page.locator('.modal')).toContainText('Fase 1 — Entrevista Executiva');
  await expect(page.locator('.modal')).toContainText('Moderado');
  await expect(page.locator('.modal')).toContainText('— sem resposta —');
});
