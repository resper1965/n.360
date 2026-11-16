import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// O Playwright serve dist com http.server (sem fallback de SPA): /iso, /privacy e /ot entregam o shell.
export async function servirShell(page) {
  const shell = fs.readFileSync(path.join(import.meta.dirname, '../dist/login.html'), 'utf8');
  await page.route(/\/(iso|privacy|ot)(\/.*)?(\?.*)?$/, (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'text/html', body: shell });
  });
}

// O boot terminou quando o seletor de projeto mostra o projeto ativo: a URL do módulo vale desde o login, antes de o boot
// redesenhar a tela, e um clique nesse intervalo se perde. Para quem loga direto no caminho de um módulo com um projeto.
export async function aguardarBoot(page) {
  await expect(page.locator('#tenant-name')).not.toHaveText('Nenhum projeto escolhido');
}
