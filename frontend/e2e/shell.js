import fs from 'node:fs';
import path from 'node:path';

// O Playwright serve dist com http.server (sem fallback de SPA): /iso e /privacy entregam o shell.
export async function servirShell(page) {
  const shell = fs.readFileSync(path.join(import.meta.dirname, '../dist/login.html'), 'utf8');
  await page.route(/\/(iso|privacy)(\/.*)?(\?.*)?$/, (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'text/html', body: shell });
  });
}
