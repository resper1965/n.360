// Onda 3 do diagnóstico de 15/10/2026: "uma língua". As telas principais, desenhadas com o que o banco grava em inglês
// (status, classificação, frequência, tipo de auditoria) e com datas ISO, não mostram nem o termo em inglês nem a data
// crua. E o título de cada tela é o rótulo do item de menu que a abre.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import html from '../login.html?raw';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));

import '../src/ui.js';
import '../src/views/monitor.js';
import '../src/views/grc.js';
import '../src/views/commercial.js';
import { S } from '../src/state.js';

const PROIBIDOS = /\b(Implemented|Missing|Partial|Compliant|Not Applicable|Open|Closed|In Progress|AT RISK|At Risk|On Track|EXPIRED|Expired|WON|LOST|Won|Lost|Pending|Draft|Approved|Active|Inactive|Controller|Processor|Under Review|CONFIDENTIAL|Confidential|Internal|External|Certification|Surveillance|Completed|Planned|Critical|High|Medium|Low|Mitigate|Monthly|Weekly|Quarterly|Dashboard|Download|Upload|Score|Gap Analysis|Owner|Assessment|Trust Score|Template|Workflow)\b/;
const DATA_ISO = /\b\d{4}-\d{2}-\d{2}\b/;

const DADOS = {
    '/assets': [{ id: 'a1', name: 'ERP', category: 'Software', owner: 'TI', classification: 'Confidential', status: 'Active' },
        { id: 'a2', name: 'Site', category: 'Software', owner: 'TI', classification: 'Internal', status: 'Inactive' }],
    '/training': [{ id: 't1', training_name: 'LGPD', employee_name: 'Ana', score: 90, completion_date: '2026-09-05', status: 'Completed' },
        { id: 't2', training_name: 'Phishing', employee_name: 'Bia', score: 60, completion_date: '2025-09-10', status: 'Expired' }],
    '/training/summary': { total: 2, completed: 1, expired: 1 },
    '/audits': [{ id: 'au1', title: 'Interna 2026', audit_type: 'Internal', auditor_name: 'Carla', scheduled_date: '2026-11-24', status: 'Planned' },
        { id: 'au2', title: 'Estágio 1', audit_type: 'Certification', auditor_name: 'OC', scheduled_date: '2027-01-18', status: 'In Progress' }],
    '/capa': [{ id: 'c1', title: 'MFA na VPN', assigned_to: 'Rui', due_date: '2026-10-25', severity: 'High', status: 'Open' },
        { id: 'c2', title: 'Backup', assigned_to: 'Rui', due_date: '2026-08-16', severity: 'Low', status: 'Closed' }],
    '/metrics': [{ id: 'm1', metric_name: 'Patches', target_value: 95, current_value: 80, frequency: 'Monthly', last_measured_at: '2026-10-01', owner: 'TI', status: 'At Risk' },
        { id: 'm2', metric_name: 'Incidentes', target_value: 0, current_value: 0, frequency: 'Weekly', last_measured_at: '2026-10-08', owner: 'TI', status: 'On Track' }],
    '/api/v1/leads': [{ id: 'l1', company_name: 'ACME', contact_name: 'Ana', status: 'Won', created_at: '2026-09-01 10:00:00' },
        { id: 'l2', company_name: 'Beta', contact_name: 'Bia', status: 'Lost', created_at: '2026-09-02 10:00:00' }],
};

const tela = () => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    return [document.getElementById('c'), document.getElementById('h'), document.getElementById('a')];
};

beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (m, url) => {
        const chave = Object.keys(DADOS).filter((k) => url.endsWith(k)).sort((x, y) => y.length - x.length)[0];
        return chave ? DADOS[chave] : [];
    });
    S.user = { id: 'u1', role: 'consultor' };
    window.ehEquipeNess = () => true;
    S.currentProject = { id: 'p1', project_name: 'Projeto', modulos: ['iso'] };
    S.activeProject = S.currentProject;
    history.replaceState(null, '', '/iso');
});

describe('telas principais em português, com data dd/mm/aaaa', () => {
    it.each([['renderAssets'], ['renderTraining'], ['renderAudits'], ['renderCAPA'], ['renderMetrics'], ['renderLeads']])('%s', async (fn) => {
        const [c, h, a] = tela();
        await window[fn](c, h, a);
        // Texto visível com as fronteiras entre elementos (o textContent cola "TI" e "Confidential" de células vizinhas).
        const texto = [h, a, c].map((x) => x.innerHTML.replace(/<[^>]*>/g, ' ')).join(' ');
        expect(texto).toMatch(/ERP|LGPD|Interna 2026|MFA na VPN|Patches|ACME/); // a tela desenhou as linhas
        expect(texto.match(PROIBIDOS)?.[0] ?? null).toBeNull();
        expect(texto.match(DATA_ISO)?.[0] ?? null).toBeNull();
    });
});

describe('o título da tela é o rótulo do menu', () => {
    it.each([
        ['renderAssets', 'nav-assets'], ['renderTraining', 'nav-training'], ['renderAudits', 'nav-audits'], ['renderCAPA', 'nav-capa'],
        ['renderVendors', 'nav-vendors'], ['renderStakeholders', 'nav-stakeholders'],
        ['renderContext', 'nav-context'], ['renderManagementReview', 'nav-mgmt'], ['renderLeads', 'nav-leads'], ['renderAssessments', 'nav-assessments'],
    ])('%s', async (fn, nav) => {
        const [c, h, a] = tela();
        const menu = new DOMParser().parseFromString(html, 'text/html').getElementById(nav);
        expect(menu).toBeTruthy();
        document.body.appendChild(document.importNode(menu, true));
        await window[fn](c, h, a);
        expect(h.textContent).toBe(menu.querySelector('.sidebar-nav-text').textContent.trim());
    });
});
