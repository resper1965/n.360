import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';

type App = Hono<{ Bindings: Bindings; Variables: Variables }>;
const aindaNao = (c: { json: (b: unknown, s: 501) => Response }) => c.json({ error: 'Ainda não implementado' }, 501);

/** /api/v1/projects/:projectId/passos/:itemId/copiloto: rascunho de IA da trilha. Esqueleto do pacote 0; o pacote D escreve os corpos. */
export const projectCopilotoApp: App = new Hono<{ Bindings: Bindings; Variables: Variables }>();
projectCopilotoApp.post('/rascunhar-campo', aindaNao);
projectCopilotoApp.post('/da-conversa', aindaNao);
projectCopilotoApp.post('/revisao', aindaNao);
