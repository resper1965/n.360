import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';

type App = Hono<{ Bindings: Bindings; Variables: Variables }>;
const novo = (): App => new Hono<{ Bindings: Bindings; Variables: Variables }>();
// Esqueleto do pacote 0 (spec 2026-10-15, seção 5): caminhos e métodos finais, corpo ainda não escrito. O pacote A troca cada
// handler, sem mexer na montagem (`src/index.ts`).
const aindaNao = (c: { json: (b: unknown, s: 501) => Response }) => c.json({ error: 'Ainda não implementado' }, 501);

/** /api/v1/passos: catálogo, global (não é de projeto). */
export const passosCatalogoApp: App = novo();
passosCatalogoApp.get('/catalogo', aindaNao);

/** /api/v1/projects/:projectId/passos: um passo do projeto. Parâmetro `:itemId`. */
export const projectPassosApp: App = novo();
projectPassosApp.get('/:itemId', aindaNao);
projectPassosApp.put('/:itemId/campos', aindaNao);
projectPassosApp.patch('/:itemId', aindaNao);
projectPassosApp.post('/:itemId/concluir', aindaNao);
projectPassosApp.post('/:itemId/reabrir', aindaNao);
projectPassosApp.post('/:itemId/bloquear', aindaNao);
projectPassosApp.post('/:itemId/desbloquear', aindaNao);
projectPassosApp.delete('/:itemId/anotacao-anterior', aindaNao);

/** /api/v1/projects/:projectId/bancada: o estado do projeto e a situação antiga das fases. */
export const projectBancadaApp: App = novo();
projectBancadaApp.get('/', aindaNao);
projectBancadaApp.delete('/fases/:n/situacao-antiga', aindaNao);
