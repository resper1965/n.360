import { test, expect } from '@playwright/test';
import { servirShell, aguardarBoot } from './shell.js';

// Políticas temáticas (spec 2026-10-23): Nova política → tema do catálogo → seções "a gerar" → Gerar seções pendentes →
// Abrir em Documentos → Publicar rascunho → Vigente. API mockada com estado; o texto do rascunho muda a cada seção gerada.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };
const P = 'proj-e2e';
const BASE = `/api/v1/projects/${P}`;
const MARCA = '> Seção a gerar.';
const TITULOS = ['Objetivo', 'Escopo', 'Diretrizes'];

async function mockApi(page) {
  await servirShell(page);
  const chamadas = [];
  let doc = null; // { texto, estado, numero, hash }
  const texto = () => `# Política de Exemplo\n\n${TITULOS.map((t, i) => `## ${i + 1}. ${t}\n\n${doc.corpos[i] || MARCA}\n`).join('\n')}`;
  const documento = () => {
    const v = { numero: 1, estado: doc.estado, hash: `h${doc.corpos.filter(Boolean).length}`, origem: 'agente', criado_por: USER.email, criado_em: '2026-10-24 10:00:00', texto: texto() };
    return { id: 'd1', tipo: 'politica', titulo: 'Política de Exemplo', status: doc.estado === 'vigente' ? 'vigente' : 'rascunho',
      versao_vigente: doc.estado === 'vigente' ? 1 : null, tem_rascunho: doc.estado === 'rascunho', versoes: [v] };
  };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const url = new URL(route.request().url());
    const method = route.request().method();
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === '/api/v1/auth/login') return json({ token: 'e2e-fake-token', user: USER });
    if (path === '/api/v1/auth/me') return json({ user: USER, modulos: ['iso'] });
    if (path === '/api/v1/projects' && method === 'GET') return json([{ id: P, client_name: 'Cliente E2E', project_name: 'Projeto E2E', modulos: ['iso'] }]);
    if (path === `${BASE}/documentos` && method === 'GET') return json(doc ? [{ ...documento(), versoes: undefined }] : []);
    if (path === `${BASE}/documentos/cobertura`) return json({ aplicaveis: 0, cobertos: 0, sem_cobertura: [], por_controle: {}, por_documento: {} });
    if (path === `${BASE}/politicas/temas`) {
      return json({ temas: [{ codigo: 'POL-EX', titulo: 'Política de Exemplo', controles: ['A.5.1', 'A.5.2'], documento_id: doc ? 'd1' : null }] });
    }
    if (path === `${BASE}/politicas` && method === 'POST') {
      chamadas.push(`criar ${JSON.stringify(route.request().postDataJSON())}`);
      doc = { estado: 'rascunho', corpos: [] };
      return json({ id: 'd1' }, 201);
    }
    if (path === `${BASE}/documentos/d1` && method === 'GET') return json(documento());
    const gerar = path.match(new RegExp(`^${BASE}/documentos/d1/secoes/(\\d+)/gerar$`));
    if (gerar && method === 'POST') {
      chamadas.push(`gerar ${gerar[1]}`);
      doc.corpos[Number(gerar[1]) - 1] = `Texto gerado da seção ${gerar[1]}.`;
      return json({ ok: true });
    }
    if (path === `${BASE}/documentos/d1/versoes/1/publicar` && method === 'POST') {
      chamadas.push(`publicar hash=${url.searchParams.get('hash')}`);
      doc.estado = 'vigente';
      return json({ ok: true });
    }
    if (path.startsWith(`${BASE}/documentos/d1/`) || path.startsWith('/api/v1/requisitos')) return json([]);
    return json(method === 'GET' ? [] : { ok: true });
  });
  return chamadas;
}

test('Nova política → gerar seções pendentes → publicar → Vigente', async ({ page }) => {
  const chamadas = await mockApi(page);
  await page.goto('/iso');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
  await expect(page).toHaveURL(/\/iso$/);
  await aguardarBoot(page);

  // O item fica em "Mais" (recolhido) e a tela inicial ainda pode redesenhar por cima: repete o caminho todo até o modal abrir.
  await expect(async () => {
    await page.locator('#sidebar #nav-documentos').evaluate((b) => b.click());
    await page.getByRole('button', { name: 'Nova política' }).click({ timeout: 1500 });
    await expect(page.locator('.modal-title', { hasText: 'Nova política' })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByText('POL-EX')).toBeVisible();
  await page.getByRole('button', { name: 'Criar', exact: true }).first().click();

  await expect(page.locator('#header-title')).toHaveText('Política de Exemplo');
  await expect(page.locator('#pol-secoes')).toContainText('0 de 3 seções prontas');
  await expect(page.locator('#pol-texto')).toContainText('Seção a gerar.');

  await page.getByRole('button', { name: 'Gerar seções pendentes' }).click();
  await expect(page.locator('#pol-secoes')).toContainText('3 de 3 seções prontas');
  await expect(page.locator('#pol-texto')).toContainText('Texto gerado da seção 3.');
  await expect(page.locator('#pol-texto')).not.toContainText('Seção a gerar.');
  await expect(page.getByRole('button', { name: 'Gerar seções pendentes' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Abrir em Documentos' }).click();
  await expect(page.locator('#doc-rascunho')).toContainText('Rascunho');
  await page.getByRole('button', { name: 'Publicar rascunho' }).click();
  await expect(page.locator('#doc-texto-vigente')).toContainText('Texto gerado da seção 1.');
  await expect(page.getByText('versão vigente 1')).toBeVisible();
  await expect(page.getByText('Versão 1 · Vigente')).toBeVisible();
  await expect(page.locator('#doc-rascunho')).toHaveCount(0);

  expect(chamadas).toEqual(['criar {"tema":"POL-EX"}', 'gerar 1', 'gerar 2', 'gerar 3', 'publicar hash=h3']);
});
