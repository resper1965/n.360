// Spec 2026-11-26 §6 (PR2, "pronto quando"): nenhuma tela do n.ot decide papel por S.user.role; quem decide é o servidor
// (GET /ot/permissoes, lido em ot-comum.js). Exceções explícitas abaixo, cada uma com o motivo.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const VIEWS = join(__dirname, '../src/views');
// filtro da lista de contas do projeto (o papel de OUTRA pessoa, não o de quem vê); podeRevelar fica em ot-comum.js
const EXCECOES = { 'ot.js': [/u\.role === 'org_user'/] };

describe('papel no n.ot vem do servidor', () => {
    it('views/ot*.js não lê S.user.role', () => {
        const arquivos = readdirSync(VIEWS).filter((f) => /^ot.*\.js$/.test(f));
        expect(arquivos.length).toBeGreaterThan(5);
        for (const f of arquivos) {
            const linhas = readFileSync(join(VIEWS, f), 'utf8').split('\n').filter((l) => /S\.user\??\.role/.test(l))
                .filter((l) => !(EXCECOES[f] || []).some((r) => r.test(l)));
            expect(linhas, f).toEqual([]);
        }
    });
    it('a lista de exceções existe de verdade (não sobra exceção morta)', () => {
        for (const [f, rs] of Object.entries(EXCECOES)) for (const r of rs) expect(r.test(readFileSync(join(VIEWS, f), 'utf8')), `${f} ${r}`).toBe(true);
    });
});
