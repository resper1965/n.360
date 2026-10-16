import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';

type App = Hono<{ Bindings: Bindings; Variables: Variables }>;
/** /api/v1/projects/:projectId/ropa/:recordId/...: a ficha em abas (spec 2026-10-16). Parâmetros `:projectId` e `:recordId`. */
export const ropaAbasApp: App = new Hono<{ Bindings: Bindings; Variables: Variables }>();
/** /api/v1/projects/:projectId/catalogos/:tipo (PR2). */
export const catalogosApp: App = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// A: escopo, agentes, medidas, base-juridica, logs
// S: ficha, situacao, conferencia, gaps, relatorio
// A2: etapas, catalogos
// D2: etapas/:etapa/rascunho
