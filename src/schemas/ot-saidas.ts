import { z } from 'zod';

// Corpos das rotas de IA do n.ot (N4). `.strict()` como o resto do inventário. A descrição livre PODE ter IP/MAC: é dela que a IA
// extrai os campos, e a máscara própria (services/ot-ia.ts, P0-7) tira os identificadores antes de qualquer chamada.

export const otIaZonaSchema = z.object({ ativo_id: z.string().trim().min(1).max(100) }).strict();
export const otIaCompletudeSchema = z.object({ descricao: z.string().trim().min(10).max(4000) }).strict();
