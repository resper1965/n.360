// Detalhe do controle (n.iso): o status gravado aparece como está (um controle Implementado não vira "Ausente" no seletor,
// e salvar sem mexer não grava regressão), o título usa o código da norma e a descrição é markdown sanitizado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test', cabecalhosAuth: () => ({}) }));
vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

// O app carrega o marked por <script> (login.html): aqui o mesmo arquivo roda no escopo global.
import markedSrc from '../public/marked.min.js?raw';
import { S } from '../src/state.js';
import { markdownSeguro } from '../src/ui.js';
import '../src/views/compliance.js';

new Function(markedSrc)();
const el = (id) => document.getElementById(id);
const CTRL = (extra = {}) => ({ id: 'ctrl-a51', project_id: 'p1', title: 'A.5.1 — Políticas de segurança da informação', status: 'Implemented', maturity: 3, description: '', ...extra });

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue([]);
    document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.currentProject = { id: 'p1' };
});
const abrir = (ctrl) => { S.controls = [ctrl]; window.openControlDetail(ctrl.id); return el('controle-status'); };

describe('status no detalhe do controle', () => {
    it.each(['Implemented', 'Partial', 'Missing', 'Planned', 'In Progress', 'Compliant', 'Approved', 'Not Applicable', 'IMPLEMENTED'])(
        '%s: o seletor abre no valor gravado e salvar sem mudar grava o mesmo status', async (status) => {
            const sel = abrir(CTRL({ status }));
            expect(sel.value).toBe(status);
            expect(apiMock.mock.calls.filter((c) => c[0] === 'PUT')).toEqual([]);
            await window.updateControlStatus('ctrl-a51', sel.value);
            const put = apiMock.mock.calls.find((c) => c[0] === 'PUT');
            expect(put[1]).toBe('/api/v1/controls/ctrl-a51/status');
            expect(put[2]).toEqual({ status });
        });

    it('rótulos em português, sem "Ausente" para um controle implementado', () => {
        const sel = abrir(CTRL());
        expect(sel.selectedOptions[0].textContent).toBe('Implementado');
        expect([...sel.options].map((o) => o.textContent)).toEqual(['Pendente', 'Planejado', 'Em Andamento', 'Parcial', 'Implementado']);
        expect(el('modal-content').textContent).not.toMatch(/Ausente/);
    });

    it('sem status gravado, abre em Pendente (Missing), que é o padrão do banco', () => {
        expect(abrir(CTRL({ status: null })).value).toBe('Missing');
    });
});

describe('título e descrição', () => {
    it('título com o código da norma, sem o id interno', () => {
        abrir(CTRL());
        const titulo = document.querySelector('.modal-title').textContent;
        expect(titulo).toBe('A.5.1 — Políticas de segurança da informação');
        expect(titulo).not.toMatch(/ctrl-a51/);
    });

    it('descrição em markdown vira lista e negrito; HTML e link perigoso não passam', () => {
        abrir(CTRL({ description: '**Objetivo**\n\n- item um\n- item dois\n\n<img src=x onerror="alert(1)"><script>alert(2)</script>[clique](javascript:alert(3)) [norma](https://www.iso.org)' }));
        const d = document.querySelector('.controle-descricao');
        expect(d.querySelector('strong').textContent).toBe('Objetivo');
        expect(d.querySelectorAll('li')).toHaveLength(2);
        expect(d.querySelector('img, script')).toBeNull();
        expect(d.innerHTML).not.toMatch(/onerror|javascript:/);
        const links = [...d.querySelectorAll('a')];
        expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://www.iso.org']);
        expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    });
});

describe('markdownSeguro', () => {
    it('remove atributos de evento e estilo, mantém o texto de tag desconhecida', () => {
        const html = markdownSeguro('<p style="color:red" onclick="x()">oi <span class="a">mundo</span></p>');
        expect(html).toBe('<p>oi mundo</p>');
    });
    it('sem o marked carregado, escapa e quebra linha', () => {
        const marked = window.marked;
        delete window.marked;
        try { expect(markdownSeguro('<b>a</b>\nb')).toBe('&lt;b&gt;a&lt;/b&gt;<br>b'); } finally { window.marked = marked; }
    });
});
