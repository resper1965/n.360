// Casca (onda 1): menu de cada produto, rodapé de links entre módulos, teclado na barra lateral e rodapé da entrada.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import html from '../login.html?raw';
import css from '../src/style.css?raw';
import { aplicarCasca, atualizarLinkCruzado, SO_N360 } from '../src/produto.js';

const ir = (caminho) => history.replaceState(null, '', caminho);
const el = (id) => document.getElementById(id);
const montarApp = () => { document.open(); document.write(html); document.close(); };
const visiveis = () => [...document.querySelectorAll('.sidebar-nav[id^="nav-"]')].filter((n) => n.dataset.foraDoProduto !== '1').map((n) => n.id);
const rotuloDe = (grupo) => document.querySelector(`.sidebar-label[data-args='["${grupo}"]']`);

beforeEach(() => { S.user = { role: 'platform_admin' }; S.activeProject = null; });
afterEach(() => ir('/'));

describe('n.360: menu de hub', () => {
    it('só Início, Minhas aprovações, Conta e acessos, Segurança do projeto e Trilha de auditoria', () => {
        montarApp();
        aplicarCasca('n360');
        expect(new Set(visiveis())).toEqual(new Set(['nav-inicio', 'nav-meus', ...SO_N360, 'nav-seguranca-projeto', 'nav-audit-trail']));
    });
    it('grupo que ficou vazio some com o rótulo', () => {
        montarApp();
        aplicarCasca('n360');
        for (const g of ['group-sales', 'group-impl', 'group-ops', 'group-privacy', 'group-provas', 'group-implantacao', 'group-intel']) {
            expect(el(g).dataset.foraDoProduto, g).toBe('1');
            expect(rotuloDe(g).dataset.foraDoProduto, g).toBe('1');
        }
        expect(el('group-system-config').dataset.foraDoProduto).toBe('');
    });
});

describe('Segurança do projeto', () => {
    // Entre os dois, a Identidade da organização (só com a área comercial desligada; ver papeis-admin.test.js).
    it('um item só, em Conta e acessos, logo depois de Organizações e da Identidade da organização', () => {
        montarApp();
        expect(document.querySelectorAll('#nav-seguranca-projeto').length).toBe(1);
        expect(el('nav-seguranca-projeto').parentElement.id).toBe('group-conta');
        expect(el('nav-organizacoes').nextElementSibling.id).toBe('nav-identidade');
        expect(el('nav-identidade').nextElementSibling.id).toBe('nav-seguranca-projeto');
    });
});

// A estrutura do menu do n.iso e do n.360, medida antes da alternativa A do n.privacy: não pode mudar (rótulos, ordem, grupos
// e quem começa aberto). Formato: item `id=rótulo`, `[rótulo de grupo] aria-expanded` e `grupo (aberto): itens`.
const estrutura = () => [...document.querySelector('.sidebar-nav-list').children]
    .filter((n) => n.dataset.foraDoProduto !== '1')
    .map((n) => (n.matches('.sidebar-label') ? `[${n.textContent.trim()}] ${n.getAttribute('aria-expanded')}`
        : n.matches('.sidebar-group') ? `${n.id}${n.classList.contains('expanded') ? ' (aberto)' : ''}: ${[...n.querySelectorAll('.sidebar-nav')].filter((i) => i.dataset.foraDoProduto !== '1').map((i) => `${i.id}=${i.querySelector('.sidebar-nav-text').textContent.trim()}`).join(', ')}`
        : `${n.id}=${n.querySelector('.sidebar-nav-text').textContent.trim()}`));
const ESTRUTURA_ISO = [
    'nav-meus=Minhas aprovações',
    'nav-dashboard=Painel',
    '[Comercial] true',
    'group-sales (aberto): nav-comercial=Comercial, nav-leads=Leads, nav-assessments=Levantamentos, nav-proposals=Propostas, nav-catalogo=Catálogo, nav-config=Configuração comercial',
    '[Implementação] false',
    'group-impl: nav-project=Jornada, nav-certification=Prontidão, nav-monitor=Monitor, nav-soa=SoA, nav-governance=Governança',
    '[Operacional] false',
    'group-ops: nav-stakeholders=Partes interessadas, nav-context=Contexto, nav-assets=Ativos, nav-risks=Riscos, nav-vendors=Fornecedores, nav-partes=Partes, nav-documentos=Políticas e normas, nav-training=Treinamento, nav-acknowledgments=Ciência de políticas, nav-policies=Gestão de políticas, nav-audits=Auditorias, nav-capa=Ações corretivas, nav-incidentes=Incidentes, nav-mgmt=Análise crítica, nav-evidence=Evidências',
    '[Privacidade] false',
    'group-privacy: nav-ropa=Tratamentos (RoPA), nav-dpia=RIPD',
    '[Inteligência] false',
    'group-intel: nav-ai=Assistente',
    '[Sistema] false',
    'group-system-config: nav-audit-trail=Trilha de auditoria, nav-settings=Preços e margens',
];
const ESTRUTURA_N360 = [
    'nav-inicio=Início',
    'nav-meus=Minhas aprovações',
    '[Conta e acessos] true',
    'group-conta (aberto): nav-projects=Projetos, nav-users=Usuários, nav-organizacoes=Organizações, nav-identidade=Identidade da organização, nav-seguranca-projeto=Segurança do projeto, nav-api-keys=Chaves de API, nav-conectar-agente=Agentes',
    '[Sistema] false',
    'group-system-config: nav-audit-trail=Trilha de auditoria',
];

describe('n.iso e n.360: o menu não muda com a alternativa A do n.privacy', () => {
    it.each([['iso', ESTRUTURA_ISO], ['n360', ESTRUTURA_N360]])('%s: mesma estrutura, mesmos rótulos, mesmos grupos', (produto, esperado) => {
        montarApp();
        aplicarCasca(produto);
        expect(estrutura()).toEqual(esperado);
        expect(el('secoes-privacy')).toBeNull();
        expect(document.querySelector('.sidebar-secao')).toBeNull();
    });
});

describe('n.privacy: menu do legado (seções fixas, 19/10/2026)', () => {
    const itensDe = (ul) => [...ul.querySelectorAll(':scope > li > .sidebar-nav')].map((n) => n.id);
    it('na ordem do legado: Dashboard e Empresas, Cadastros, Mapeamento, Diagnóstico, Fornecedores, Documentos e Solicitações, Mais e o Assistente no fim', () => {
        montarApp();
        aplicarCasca('privacy');
        const caixa = el('secoes-privacy');
        expect(caixa.previousElementSibling).toBe(el('nav-dashboard'));
        const partes = [...caixa.children].map((n) => (n.matches('.sidebar-secao') ? `# ${n.textContent}` : itensDe(n).join(' ')));
        expect(partes).toEqual([
            'nav-encarregado nav-empresas',
            '# Cadastros', 'nav-areas nav-sistemas nav-titulares nav-dados-titular nav-parceiros nav-partes',
            '# Mapeamento', 'nav-ropa nav-dpia nav-lia',
            '# Diagnóstico', 'nav-gaps nav-mapa-de-risco',
            '# Fornecedores', 'nav-terceiros nav-avaliacoes-terceiros',
            'nav-documentos-arquivo nav-titular',
            '# Mais', 'nav-referencia-juridica nav-incidentes-privacy nav-consentimentos nav-requisitos nav-documentos nav-evidence nav-training nav-governance nav-importacao',
            'nav-ai',
        ]);
        expect(el('secao-diagnostico').textContent).toBe('Diagnóstico');
        expect(caixa.lastElementChild.classList.contains('sidebar-secao-fim')).toBe(true);
        for (const ul of caixa.querySelectorAll('ul')) {
            expect(ul.className).toContain('sidebar-secao-lista');
            for (const li of ul.children) expect(li.tagName).toBe('LI');
        }
    });
    it('os títulos de seção não são botão, não recolhem e dão nome à lista', () => {
        montarApp();
        aplicarCasca('privacy');
        for (const t of document.querySelectorAll('.sidebar-secao')) {
            expect(t.getAttribute('role'), t.textContent).toBeNull();
            expect(t.hasAttribute('tabindex'), t.textContent).toBe(false);
            expect(t.dataset.action, t.textContent).toBeUndefined();
            expect(t.hasAttribute('aria-expanded'), t.textContent).toBe(false);
            expect(t.nextElementSibling.getAttribute('aria-labelledby')).toBe(t.id);
        }
        expect(document.querySelectorAll('.sidebar-secao').length).toBe(5);
        // nenhum rótulo de grupo (acordeão) sobra no menu do n.privacy
        const rotulos = [...document.querySelectorAll('.sidebar-label')].filter((r) => r.dataset.foraDoProduto !== '1');
        expect(rotulos.map((r) => r.textContent)).toEqual([]);
    });
    it('27 destinos, todos à vista; Minhas aprovações, Trilha de auditoria e Preços e margens ficam fora do menu do módulo', () => {
        montarApp();
        aplicarCasca('privacy');
        const destinos = [...el('secoes-privacy').querySelectorAll('.sidebar-nav')].map((n) => n.id);
        expect(destinos.length).toBe(27);
        expect(new Set(visiveis())).toEqual(new Set(destinos));
        for (const id of ['nav-meus', 'nav-audit-trail', 'nav-settings']) expect(el(id).dataset.foraDoProduto, id).toBe('1');
        expect(el('group-system-config').dataset.foraDoProduto).toBe('1');
    });
    it('aplicar a casca de novo não duplica as seções', () => {
        montarApp();
        aplicarCasca('privacy');
        aplicarCasca('privacy');
        expect(document.querySelectorAll('#secoes-privacy').length).toBe(1);
        expect(document.querySelectorAll('.sidebar-secao').length).toBe(5);
    });
    it('n.iso não mostra Implantação nem Consentimentos', () => {
        montarApp();
        aplicarCasca('iso');
        expect(el('group-implantacao').dataset.foraDoProduto).toBe('1');
        expect(rotuloDe('group-implantacao').dataset.foraDoProduto).toBe('1');
        expect(visiveis()).not.toContain('nav-consentimentos');
        expect(visiveis()).not.toContain('nav-gaps');
        expect(visiveis()).not.toContain('nav-lia');
        expect(visiveis()).not.toContain('nav-areas');
        expect(visiveis()).not.toContain('nav-sistemas');
    });
    it('rótulos de uma linha, nome do objeto antes da sigla; ids, rotas e ações não mudam', () => {
        montarApp();
        aplicarCasca('privacy');
        const texto = (id) => el(id).querySelector('.sidebar-nav-text').textContent.trim();
        expect(Object.fromEntries([...el('secoes-privacy').querySelectorAll('.sidebar-nav')].map((n) => [n.id, texto(n.id)]))).toEqual({
            'nav-encarregado': 'Dashboard', 'nav-empresas': 'Empresas', 'nav-areas': 'Áreas', 'nav-sistemas': 'Ativos', 'nav-titulares': 'Titulares',
            'nav-dados-titular': 'Dados de titular', 'nav-parceiros': 'Parceiros', 'nav-partes': 'Pessoas', 'nav-ropa': 'Atividades', 'nav-dpia': 'DPIA', 'nav-lia': 'LIA',
            'nav-gaps': 'Gaps', 'nav-mapa-de-risco': 'Riscos', 'nav-terceiros': 'Fornecedores', 'nav-avaliacoes-terceiros': 'Avaliações', 'nav-documentos-arquivo': 'Documentos', 'nav-titular': 'Solicitações',
            'nav-referencia-juridica': 'Referência jurídica', 'nav-incidentes-privacy': 'Incidentes', 'nav-consentimentos': 'Consentimentos', 'nav-requisitos': 'Cobertura da LGPD', 'nav-documentos': 'Políticas e normas',
            'nav-evidence': 'Evidências', 'nav-training': 'Treinamento', 'nav-governance': 'Papéis e comitê', 'nav-importacao': 'Importar programa', 'nav-ai': 'Assistente',
        });
        for (const [id, selo] of [['nav-titular', 'selo-titular'], ['nav-terceiros', 'selo-terceiros'], ['nav-incidentes-privacy', 'selo-incidentes'], ['nav-encarregado', 'selo-painel']]) {
            expect(el(id).contains(el(selo)), selo).toBe(true);
            expect(el(selo).hidden, selo).toBe(true);
        }
        // peso igual em todo item: sem a classe de destaque das filas
        expect(document.querySelector('.sidebar-nav-destaque')).toBeNull();
        expect(JSON.parse(el('nav-ropa').getAttribute('data-args'))).toEqual(['ropa']);
        expect(JSON.parse(el('nav-terceiros').getAttribute('data-args'))).toEqual(['terceiros']);
        expect(JSON.parse(el('nav-areas').getAttribute('data-args'))).toEqual(['areas']);
        expect(JSON.parse(el('nav-sistemas').getAttribute('data-args'))).toEqual(['sistemas']);
        expect(JSON.parse(el('nav-mapa-de-risco').getAttribute('data-args'))).toEqual(['mapa-de-risco']);
        for (const t of ['empresas', 'titulares', 'dados-titular', 'parceiros', 'documentos-arquivo']) {
            expect(el(`nav-${t}`).getAttribute('data-action'), t).toBe('navigate');
            expect(JSON.parse(el(`nav-${t}`).getAttribute('data-args')), t).toEqual([t]);
        }
        expect(el('nav-catalogos')).toBeNull();
    });
    it('os rótulos novos ficam só no n.privacy: n.iso e n.360 mantêm os deles', () => {
        const texto = (id) => el(id).querySelector('.sidebar-nav-text').textContent.trim();
        for (const produto of ['iso', 'n360']) {
            montarApp();
            aplicarCasca(produto);
            expect([texto('nav-governance'), texto('nav-partes'), texto('nav-ropa'), texto('nav-dpia'), texto('nav-requisitos'), texto('nav-meus')], produto)
                .toEqual(['Governança', 'Partes', 'Tratamentos (RoPA)', 'RIPD', 'Requisitos', 'Minhas aprovações']);
        }
    });
    it('rótulo de item numa linha só: o CSS não deixa o texto quebrar', () => {
        expect(css).toMatch(/\.sidebar-nav-text\s*\{[^}]*white-space:\s*nowrap/);
        expect(css).not.toMatch(/\.sidebar-nav-destaque/);
    });
    it('os itens com projeto seguem o projeto: sem projeto somem, e as seções também', () => {
        montarApp();
        for (const id of ['nav-encarregado', 'nav-empresas', 'nav-titulares', 'nav-dados-titular', 'nav-parceiros', 'nav-documentos-arquivo', 'nav-titular', 'nav-terceiros', 'nav-avaliacoes-terceiros', 'nav-areas', 'nav-sistemas', 'nav-incidentes-privacy', 'nav-consentimentos', 'nav-mapa-de-risco', 'nav-lia', 'nav-gaps']) {
            expect(el(id).classList.contains('group-project-only'), id).toBe(true);
            expect(el(id).style.display, id).toBe('none');
        }
        aplicarCasca('privacy');
        for (const n of document.querySelectorAll('.sidebar-secao, #secoes-privacy ul[aria-labelledby]')) expect(n.classList.contains('group-project-only')).toBe(true);
    });
    it('Pedidos do titular, Incidentes e Consentimentos abrem a tela do titular na aba deles; Partes Interessadas, Ativos e Fornecedores ficam fora', () => {
        montarApp();
        aplicarCasca('privacy');
        for (const [id, aba] of [['nav-titular', 'pedidos'], ['nav-incidentes-privacy', 'incidentes'], ['nav-consentimentos', 'consentimentos']]) {
            expect(el(id).getAttribute('data-action'), id).toBe('abrirAbaTitular');
            expect(JSON.parse(el(id).getAttribute('data-args')), id).toEqual([aba]);
        }
        for (const id of ['nav-stakeholders', 'nav-assets', 'nav-vendors']) expect(visiveis(), id).not.toContain(id);
    });
});

describe('barra lateral acessível nos três produtos', () => {
    it('todo rótulo de grupo diz qual grupo controla (aria-controls)', () => {
        montarApp();
        const rotulos = [...document.querySelectorAll('.sidebar-label')];
        expect(rotulos.length).toBeGreaterThan(0);
        for (const r of rotulos) {
            const alvo = JSON.parse(r.dataset.args)[0];
            expect(r.getAttribute('aria-controls'), r.textContent).toBe(alvo);
            expect(el(alvo).classList.contains('sidebar-group'), alvo).toBe(true);
        }
    });
    it('grupo fechado sai do Tab e da árvore de acessibilidade (visibility), o aberto volta', () => {
        expect(css).toMatch(/\.sidebar-group\s*\{[^}]*max-height:\s*0[^}]*visibility:\s*hidden/);
        expect(css).toMatch(/\.sidebar-group\.expanded\s*\{[^}]*visibility:\s*visible/);
    });
    it('recolhida: o texto do item fica só visualmente escondido (nunca display:none), e o selo vai para o canto do ícone', () => {
        expect(css).not.toMatch(/\.sidebar\.collapsed \.sidebar-nav-text[^{]*\{[^}]*display:\s*none/);
        expect(css).toMatch(/\.sidebar\.collapsed \.sidebar-nav-text[^{]*\{[^}]*position:\s*absolute[^}]*clip:\s*rect\(0 0 0 0\)/);
        expect(css).not.toMatch(/\.sidebar\.collapsed \.sidebar-selo[^{]*\{[^}]*display:\s*none/);
        expect(css).toMatch(/\.sidebar\.collapsed \.sidebar-selo\s*\{[^}]*position:\s*absolute/);
        expect(css).toMatch(/\.sidebar-dica\s*\{[^}]*position:\s*fixed/);
        montarApp();
        expect(el('sidebar-dica').getAttribute('aria-hidden')).toBe('true');
    });
    it('Partes e Governança com ícones diferentes', () => {
        montarApp();
        const desenho = (id) => el(id).querySelector('svg').innerHTML;
        expect(desenho('nav-governance')).not.toBe(desenho('nav-partes'));
    });
});

describe('menu: AI Assistant virou Assistente', () => {
    it('em qualquer produto', () => {
        expect(html).not.toContain('AI Assistant');
    });
});

describe('teclado na barra lateral', () => {
    it('todo item e todo rótulo de grupo recebe foco e tem papel', () => {
        montarApp();
        for (const n of document.querySelectorAll('.sidebar-nav[id^="nav-"]')) {
            expect(n.getAttribute('tabindex'), n.id).toBe('0');
            expect(n.getAttribute('role'), n.id).toBe('link');
        }
        for (const l of document.querySelectorAll('.sidebar-label')) {
            expect(l.getAttribute('tabindex'), l.textContent).toBe('0');
            expect(l.getAttribute('role')).toBe('button');
        }
    });
});

describe('rodapé de links entre módulos', () => {
    it('num contêiner próprio, com classe e sem estilo inline', () => {
        montarApp();
        ir('/iso');
        aplicarCasca('iso');
        el('nav-users').style.display = '';
        S.activeProject = { id: 'c', modulos: ['iso', 'privacy'] };
        atualizarLinkCruzado();
        const caixa = document.querySelector('#sidebar .sidebar-crosslinks');
        expect(caixa).not.toBeNull();
        const links = [...caixa.querySelectorAll('a')];
        expect(links.map((a) => a.id)).toEqual(['link-n360', 'link-conta', 'link-outro-produto']);
        for (const a of links) {
            expect(a.className).toBe('sidebar-crosslink');
            expect(a.getAttribute('style')).toBeNull();
        }
        expect(document.querySelectorAll('.sidebar-crosslinks').length).toBe(1);
        // no n.360 o contêiner some junto
        ir('/');
        atualizarLinkCruzado();
        expect(document.querySelector('.sidebar-crosslinks')).toBeNull();
    });
    it('CSS: contêiner com fio de borda e link discreto', () => {
        expect(css).toMatch(/\.sidebar-crosslinks\s*\{[^}]*border-top:\s*1px solid var\(--border\)/);
        expect(css).toMatch(/\.sidebar-crosslink\s*\{[^}]*font-size:\s*13px[^}]*\}/);
        expect(css).toMatch(/\.sidebar-crosslink:hover\s*\{[^}]*color:\s*var\(--text\)/);
    });
});

describe('header', () => {
    it('fechar do painel de contexto: some recolhido, rótulo acessível e sem letra solta', () => {
        montarApp();
        const b = document.querySelector('.toggle-context');
        expect(b.getAttribute('aria-label')).toBe('Fechar painel');
        expect(b.textContent.trim()).not.toBe('x');
        expect(css).toMatch(/\.context-panel\.collapsed \.toggle-context\s*\{\s*display:\s*none/);
        expect(css).toMatch(/\.context-panel\s*\{[^}]*position:\s*relative/);
    });
    it('seletor de organização só aparece com duas ou mais opções', () => {
        expect(css).toMatch(/\.org-seletor:not\(:has\(option \+ option\)\)\s*\{\s*display:\s*none/);
    });
    it('o projeto ativo mora num lugar só: sem selo no cabeçalho e sem "Tenant" na casca', () => {
        montarApp();
        expect(document.getElementById('header-project-badge')).toBeNull();
        expect(document.getElementById('sidebar-project-select')).toBeTruthy();
        expect(document.body.textContent).not.toMatch(/tenant/i);
    });
    it('etiqueta de módulos do projeto em linha própria, abaixo do nome', () => {
        expect(css).toMatch(/\.tenant-face\s*\{[^}]*flex-wrap:\s*wrap/);
        expect(css).toMatch(/\.tenant-norm\s*\{[^}]*flex-basis:\s*100%/);
    });
    it('rótulo de grupo: 11px, espaçamento .08em, cor --text-dim', () => {
        expect(css).toMatch(/\.sidebar-label\s*\{[^}]*font-size:\s*11px[^}]*letter-spacing:\s*0?\.08em[^}]*color:\s*var\(--text-dim\)/);
    });
});

describe('pedidos do portal', () => {
    it('Configurações é a tabela de preços: o menu diz "Preços e margens"', () => {
        montarApp();
        expect(el('nav-settings').textContent.trim()).toBe('Preços e margens');
    });
    it('tabela de Organizações quadrada e respiro entre as ações do header', () => {
        expect(css).toMatch(/\.org-tabela-caixa\s*\{[^}]*border-radius:\s*0;/);
        expect(css).toMatch(/\.header-actions\s*\{[^}]*gap:\s*0\.75rem/);
    });
    it('entrada escondida também sai da tela (visibility), não só fica transparente', () => {
        expect(css).toMatch(/#login-overlay\.hidden\s*\{[^}]*visibility:\s*hidden/);
    });
});

describe('rodapé da entrada', () => {
    it('sem os links de privacidade e termos (eram as políticas do cliente); texto em 12px', () => {
        montarApp();
        expect(document.querySelector('.login-sign-links a, .entry-foot a')).toBeNull();
        expect(css).toMatch(/\.login-sign-links\s*\{[^}]*font-size:\s*12px/);
    });
});
