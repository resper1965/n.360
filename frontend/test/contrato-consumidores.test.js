// Contrato tela↔API do lado da tela (P1): o `api()` aqui é o DE VERDADE e só o `fetch` é dublado,
// com o corpo que cada handler devolve (arquivo:linha ao lado). Cada caso é uma tela que lia o
// campo errado e mostrava vazio sem erro.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/views/project.js';
import '../src/views/bancada.js';
import '../src/views/monitor.js';
import catalogo from '../../contracts/bancada/catalogo.json';
import bancada from '../../contracts/bancada/bancada.json';
import passoJson from '../../contracts/bancada/passo.json';
import '../src/views/compliance.js';

const $ = (id) => document.getElementById(id);
const tela = () => [$('content'), $('header-title'), $('header-actions')];

beforeEach(() => {
    document.body.innerHTML = `
        <div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>
        <div id="content"></div><h1 id="header-title"></h1><div id="header-actions"></div>`;
    S.token = 'tok123';
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('consumidores que o desembrulho antigo quebrava', () => {
    it('entrevistas: lê `questions` (projects.ts:596)', async () => {
        servir({ 'GET /api/v1/projects/p1/interviews/executiva': {
            ok: true, interviews: [],
            questions: [{ key: 'exec_vision', question: 'Qual a visão estratégica para segurança?' }],
        } });
        document.body.insertAdjacentHTML('beforeend', '<div id="interview-questions-container"></div><div id="interview-buttons-right"></div>');
        await window.changeInterviewTrack('p1', 'executiva');
        expect($('interview-questions-container').textContent).toContain('Qual a visão estratégica para segurança?');
    });

    it('jornada: o catálogo vem de /api/v1/passos/catalogo (objeto inteiro, não lista desembrulhada)', async () => {
        S.currentProject = { id: 'p1' };
        S.passosCatalogo = null;
        servir({
            'GET /api/v1/projects/p1/bancada': bancada,
            'GET /api/v1/passos/catalogo': catalogo,
            'GET /api/v1/projects/p1/governance': [],
            'GET /api/v1/projects/p1/prontidao': { indicador: { implementados: 1, aplicaveis: 2 } },
            'GET /api/v1/projects/p1/passos/p3_3': passoJson,
        });
        await window.renderProjectDetail(...tela());
        expect(S.passosCatalogo.passos[0].id).toBe('p3_3');
        expect(S.passosCatalogo.etapas[0].fases).toContain(3);
        expect($('content').querySelector('h3').textContent).toMatch(/Passo 1 de 2/);
    });

    it('análise de lacunas: lê coverage_pct e by_status (projects.ts:1042)', async () => {
        servir({ 'GET /api/v1/projects/p1/gap-analysis': {
            ok: true, total: 2, applicable: 2, by_status: { Implemented: 1, Missing: 1 }, coverage_pct: 50,
            controls_with_evidence: 1, controls_with_risks: 0,
            gaps: [{ control_id: 'c2', title: 'A.5.2', status: 'Missing', evidence_count: 0, risk_count: 0 }],
        } });
        await window.showGapAnalysis('p1');
        const t = $('modal-content').textContent;
        expect(t).toContain('50%');
        expect(t).toContain('Controles com evidencia: 1');
    });

    it('migrar 27701: mostra o resultado (projects.ts:831)', async () => {
        vi.spyOn(window, 'confirmar').mockResolvedValue(true);
        servir({ 'POST /api/v1/projects/p1/migrate-27701': { ok: true, gaps: [{ control_id: 'A.5.34' }], transformation_ratio: 0.5, new_controls_created: 3 } });
        await window.migrate27701('p1');
        expect(document.querySelector('.toast').textContent).toContain('Novos controles: 3');
    });

    it('carteira: lê `portfolio` do envelope de duas listas (platform.ts:547)', async () => {
        const p = { id: 'p1', client_name: 'Acme', project_name: null, overall_progress_pct: 80, completed_phases: 3, phase_count: 41, risk_count: 0, evidence_count: 2 };
        servir({ 'GET /api/v1/portfolio': { ok: true, portfolio: [p], projects: [p] } });
        const [c, h, a] = tela();
        await window.renderPortfolio(c, h, a);
        expect(c.textContent).toContain('Acme');
    });
});

describe('consumidores que liam campo que a resposta não tem', () => {
    it('notas do auditor: a lista vem desembrulhada (auditor.ts:91)', async () => {
        servir({ 'GET /api/v1/projects/p1/auditor-notes': { ok: true, notes: [{
            id: 'n1', project_id: 'p1', control_id: null, note_type: 'evidence_request',
            content: 'Enviar a política assinada', response: null, control_standard: null, control_title: null,
        }] } });
        await window.openAuditorNotesModal('p1');
        expect($('auditor-notes-modal-content').textContent).toContain('Enviar a política assinada');
    });

    it('SoA: o mapa de rastreabilidade recebe a evidência de cada controle (projects.ts:1003)', async () => {
        S.activeProject = { id: 'p1', project_name: 'Projeto' };
        servir({
            'GET /api/v1/projects/p1/controls': { ok: true, controls: [{ id: 'c1', project_id: 'p1', title: 'A.5.1 — Políticas', status: 'Implemented' }] },
            'GET /api/v1/projects/p1/traceability': { ok: true, controls: [{
                id: 'c1', title: 'A.5.1 — Políticas', status: 'Implemented', risks: [],
                evidence: [{ id: 'e1', file_name: 'politica.pdf', created_at: '2026-10-01' }],
            }] },
        });
        await window.renderSoA(...tela());
        expect(window.currentSoATraceMap.c1.evidence).toHaveLength(1);
    });
});
