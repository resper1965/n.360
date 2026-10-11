// Domínios antigos (spec 2026-10-11-n360-casca-design.md). `niso` e `nprivacy` redirecionam a página
// de navegador para o módulo no n.360 e servem as exceções (API, SCIM, MCP, OAuth, portais públicos) no
// lugar. Os legados de antes (`n-iso`, `workers.dev`) vão tudo para o n.360. 308, não 301/302: preserva
// método e corpo, então POST de webhook, SCIM e token OAuth chegam inteiros.
import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { fica } from '../src/config/url';
import { workerEnv } from './helpers/d1';

const N360 = 'https://n360.ness.com.br';
const chamar = (url: string, init: RequestInit = {}) => app.fetch(new Request(url, init), workerEnv() as any, {} as any);

describe('niso e nprivacy: página de navegador vai ao módulo no n.360', () => {
  const casos: [string, string][] = [
    ['https://niso.ness.com.br/', `${N360}/iso`],
    ['https://niso.ness.com.br/login', `${N360}/iso`],
    ['https://niso.ness.com.br/login.html', `${N360}/iso`],
    ['https://niso.ness.com.br/login?x=1', `${N360}/iso?x=1`],
    ['https://niso.ness.com.br/x?y=1', `${N360}/iso/x?y=1`],
    ['https://niso.ness.com.br/apix', `${N360}/iso/apix`],
    ['https://niso.ness.com.br/healthz', `${N360}/iso/healthz`],
    ['https://niso.ness.com.br/politicasx', `${N360}/iso/politicasx`],
    ['https://nprivacy.ness.com.br/', `${N360}/privacy`],
    ['https://nprivacy.ness.com.br/login', `${N360}/privacy`],
    ['https://nprivacy.ness.com.br/x?y=1', `${N360}/privacy/x?y=1`],
  ];
  for (const [de, para] of casos) {
    it(`${de} → 308 ${para}`, async () => {
      const res = await chamar(de);
      expect(res.status).toBe(308);
      expect(res.headers.get('location')).toBe(para);
    });
  }
});

describe('niso e nprivacy: exceções respondem no lugar', () => {
  const excecoes = [
    '/health', '/api/v1/auth/me', '/scim/v2/Users', '/mcp', '/oauth/token', '/.well-known/security.txt',
    '/politicas', '/politicas.html', '/auditor', '/auditor.js', '/auditor.css', '/proposta', '/proposta.html',
  ];
  for (const host of ['niso.ness.com.br', 'nprivacy.ness.com.br']) {
    for (const caminho of excecoes) {
      it(`${host}${caminho} não redireciona`, async () => {
        expect((await chamar(`https://${host}${caminho}`)).status).not.toBe(308);
      });
    }
  }

  it('/health no niso responde 200', async () => {
    expect((await chamar('https://niso.ness.com.br/health')).status).toBe(200);
  });

  it('login da API e descoberta do OAuth respondem no niso, com o status de sempre', async () => {
    const login = await chamar('https://niso.ness.com.br/api/v1/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(login.status).toBe(400);
    expect((await chamar('https://niso.ness.com.br/.well-known/oauth-authorization-server')).status).toBe(200);
  });
});

describe('fica(caminho)', () => {
  it('casa prefixo só em fronteira de segmento', () => {
    expect(fica('/api')).toBe(true);
    expect(fica('/api/v1/x')).toBe(true);
    expect(fica('/apix')).toBe(false);
    expect(fica('/mcp')).toBe(true);
    expect(fica('/mcpx')).toBe(false);
    expect(fica('/politicas.html')).toBe(true);
    expect(fica('/auditor.js')).toBe(true);
    expect(fica('/proposta.css')).toBe(true);
    expect(fica('/politicas.json')).toBe(false);
    expect(fica('/')).toBe(false);
    expect(fica('/login')).toBe(false);
  });

  it('entrada hostil não trava', () => {
    const t0 = performance.now();
    fica(`/api${'/'.repeat(100_000)}x`);
    fica('/'.repeat(100_000));
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('legados de antes (n-iso, workers.dev)', () => {
  it('página vai ao /iso do n.360', async () => {
    const res = await chamar('https://n-iso.ness.com.br/?x=1');
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${N360}/iso?x=1`);
    expect((await chamar('https://niso.ness.workers.dev/projetos')).headers.get('location')).toBe(`${N360}/iso/projetos`);
  });

  it('exceção vai ao mesmo caminho no n.360, com query', async () => {
    const res = await chamar('https://n-iso.ness.com.br/health?x=1');
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${N360}/health?x=1`);
  });

  it('POST em niso.ness.workers.dev vira 308 (método e corpo preservados), não 301/302', async () => {
    const res = await chamar('https://niso.ness.workers.dev/scim/v2/Users', {
      method: 'POST', headers: { 'Content-Type': 'application/scim+json' }, body: '{}',
    });
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${N360}/scim/v2/Users`);
  });

  it('rotas do OAuth/MCP no host legado vão ao niso, onde o recurso do MCP responde', async () => {
    const res = await chamar('https://n-iso.ness.com.br/oauth/token', { method: 'POST', body: 'grant_type=x' });
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://niso.ness.com.br/oauth/token');
    for (const c of ['/mcp', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/mcp?x=1']) {
      expect((await chamar(`https://niso.ness.workers.dev${c}`)).headers.get('location')).toBe(`https://niso.ness.com.br${c}`);
    }
    // .well-known que não é do OAuth segue para o n.360
    expect((await chamar('https://n-iso.ness.com.br/.well-known/security.txt')).headers.get('location')).toBe(`${N360}/.well-known/security.txt`);
  });
});

describe('APP_URL num domínio de módulo (produção até a troca, ou volta atrás)', () => {
  const comAppUrl = (url: string) => app.fetch(new Request(url), { ...workerEnv(), APP_URL: 'https://niso.ness.com.br' } as any, {} as any);

  it('o próprio host do APP_URL não redireciona (sem laço niso → niso/iso → niso/iso/iso)', async () => {
    expect((await comAppUrl('https://niso.ness.com.br/')).status).not.toBe(308);
    expect((await comAppUrl('https://niso.ness.com.br/iso')).status).not.toBe(308);
  });

  it('o outro domínio de módulo continua indo ao APP_URL com o prefixo', async () => {
    const res = await comAppUrl('https://nprivacy.ness.com.br/x');
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://niso.ness.com.br/privacy/x');
  });
});

describe('o n.360 não redireciona', () => {
  it('/health e /iso respondem no lugar', async () => {
    expect((await chamar(`${N360}/health`)).status).toBe(200);
    expect((await chamar(`${N360}/iso`)).status).not.toBe(308);
  });
});
