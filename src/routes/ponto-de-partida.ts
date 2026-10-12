import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { erro500 } from '../helpers';
import { pontoDePartida } from '../services/ponto-de-partida';

/** Painel "ponto de partida": só leitura, faixa núcleo. O `projectAccessMiddleware` já cortou o projeto antes daqui. */
export const pontoDePartidaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

pontoDePartidaApp.get('/', async (c) => {
  try { return c.json(await pontoDePartida(c.env.DB, c.req.param('projectId')!)); }
  catch (e) { return erro500(c, 'Falha ao montar o ponto de partida', e); }
});
