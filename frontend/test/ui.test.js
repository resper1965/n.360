// Testes de `src/ui.js` — os montadores de HTML compartilhados. Nao se testa
// aparencia aqui; testa-se ESCAPE (o CSP tem 'unsafe-inline', entao escapar e a
// unica defesa contra XSS refletido da API) e a traducao de status, que decide
// o que o cliente le na tela.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    escapeHTML,
    renderPageHeader,
    renderStatCards,
    renderStatusBadge,
    renderDataTable,
    showToast,
    TOAST_MS,
    traduzStatus,
    renderAbas,
} from '../src/ui.js';

describe('escapeHTML()', () => {
    it('escapa os cinco caracteres perigosos', () => {
        expect(escapeHTML('&')).toBe('&amp;');
        expect(escapeHTML('<')).toBe('&lt;');
        expect(escapeHTML('>')).toBe('&gt;');
        expect(escapeHTML('"')).toBe('&quot;');
        expect(escapeHTML("'")).toBe('&#39;');
    });

    it('neutraliza uma tag script inteira', () => {
        expect(escapeHTML('<script>alert(1)</script>')).toBe(
            '&lt;script&gt;alert(1)&lt;/script&gt;'
        );
    });

    it('escapa o & primeiro, sem dupla-escapada', () => {
        // Se a ordem estivesse invertida, '<' viraria '&amp;lt;'.
        expect(escapeHTML('<')).toBe('&lt;');
        expect(escapeHTML('&lt;')).toBe('&amp;lt;');
    });

    it('null e undefined viram string vazia, nao "null"', () => {
        expect(escapeHTML(null)).toBe('');
        expect(escapeHTML(undefined)).toBe('');
    });

    it('zero e false viram texto, nao vazio', () => {
        expect(escapeHTML(0)).toBe('0');
        expect(escapeHTML(false)).toBe('false');
    });

    it('nao escapa crase nem = (contexto de atributo sem aspas segue inseguro)', () => {
        // Documenta o limite: escapeHTML basta para conteudo de texto e para
        // atributo ENTRE ASPAS. Interpolar em atributo sem aspas continua
        // vulneravel, e nenhum teste deve dar a impressao contraria.
        expect(escapeHTML('a=b`c')).toBe('a=b`c');
    });
});

describe('renderStatusBadge()', () => {
    it('aceita (tipo, texto)', () => {
        const html = renderStatusBadge('success', 'Tudo certo');
        expect(html).toContain('Tudo certo');
        expect(html).toContain('var(--success)');
    });

    it('aceita (texto, tipo) — ordem invertida', () => {
        const html = renderStatusBadge('Tudo certo', 'success');
        expect(html).toContain('Tudo certo');
        expect(html).toContain('var(--success)');
    });

    it('sem tipo conhecido cai em neutral', () => {
        const html = renderStatusBadge('Rascunho', 'inexistente');
        expect(html).toContain('Rascunho');
        expect(html).toContain('var(--text-dim)');
    });

    it('preenche por color-mix e NAO desenha borda', () => {
        const html = renderStatusBadge('danger', 'Gap');
        expect(html).toContain('color-mix(in oklab, var(--danger) 16%, transparent)');
        expect(html).toContain('border:0');
        expect(html).not.toMatch(/border:1px/);
    });

    it('usa a mono em caixa alta, sem raio', () => {
        const html = renderStatusBadge('info', '');
        expect(html).toContain('var(--font-mono)');
        expect(html).toContain('text-transform:uppercase');
        expect(html).toContain('border-radius:0');
    });

    it('traduz "na" para N/A — a aplicabilidade tem rotulo proprio', () => {
        expect(renderStatusBadge('na', 'neutral')).toContain('N/A');
    });

    it.each([
        ['implemented', 'Implementado'],
        ['not applicable', 'Não Aplicável'],
        ['in_progress', 'Em Andamento'],
        ['in progress', 'Em Andamento'],
        ['critical', 'Crítico'],
        ['pending', 'Pendente'],
    ])('traduz "%s" para "%s"', (entrada, esperado) => {
        expect(renderStatusBadge(entrada, 'info')).toContain(esperado);
    });

    it('a traducao ignora caixa e espacos das pontas', () => {
        expect(renderStatusBadge('  APPROVED  ', 'success')).toContain('Aprovado');
    });

    it('status desconhecido passa cru (sem inventar traducao)', () => {
        expect(renderStatusBadge('Aguardando ANPD', 'warning')).toContain('Aguardando ANPD');
    });

    it('escapa o texto vindo da API', () => {
        const html = renderStatusBadge('<img src=x onerror=alert(1)>', 'danger');
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });

    // ARESTA: os dois argumentos sao posicionalmente ambiguos. Um status cujo
    // texto coincida com um nome de tipo ('info', 'danger', ...) e engolido
    // como TIPO e a badge sai sem texto. Nenhum status atual da API cai nisso,
    // mas o dia em que cair, a celula fica vazia em silencio.
    it('ARESTA: texto que coincide com nome de tipo e lido como tipo', () => {
        const html = renderStatusBadge('info', 'warning');
        expect(html).toContain('color:var(--info)'); // venceu 'info' como TIPO
        expect(html).toContain('>warning<'); // e 'warning' virou o TEXTO
    });
});

describe('renderStatCards()', () => {
    it('lista vazia ou ausente nao emite markup', () => {
        expect(renderStatCards([])).toBe('');
        expect(renderStatCards(null)).toBe('');
        expect(renderStatCards(undefined)).toBe('');
    });

    it('escapa label, value e subtext', () => {
        const html = renderStatCards([
            { label: '<b>L</b>', value: '<b>V</b>', subtext: '<b>S</b>' },
        ]);
        expect(html).not.toContain('<b>');
        expect((html.match(/&lt;b&gt;/g) || []).length).toBe(3);
    });

    it('converte value numerico sem virar vazio', () => {
        expect(renderStatCards([{ label: 'Leads', value: 0 }])).toContain('>0<');
    });

    it('usa a cor informada e cai no accent quando nao ha', () => {
        expect(renderStatCards([{ label: 'x', value: 1, color: '#ff0000' }])).toContain('#ff0000');
        expect(renderStatCards([{ label: 'x', value: 1 }])).toContain('var(--accent)');
    });

    it('omite o subtext quando nao existe', () => {
        expect(renderStatCards([{ label: 'x', value: 1 }])).not.toContain('margin-top:0.4rem');
    });
});

describe('renderPageHeader()', () => {
    it('escapa titulo e subtitulo', () => {
        const html = renderPageHeader('<script>a</script>', '<i>sub</i>');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&lt;i&gt;sub&lt;/i&gt;');
    });

    it('sem subtitulo nao emite o paragrafo', () => {
        expect(renderPageHeader('Riscos')).not.toContain('<p ');
    });

    it('actionsHtml entra CRU (e o contrato: sao botoes montados pela view)', () => {
        expect(renderPageHeader('T', '', '<button id="x">ok</button>')).toContain('<button id="x">');
    });

    // Decisao registrada no cartao 6a: o titulo nomeia A TELA e a banda nao
    // carrega metadado de tenant/projeto. O subtitulo continua aceito na
    // assinatura, mas sai da banda e vira kicker - primeira linha do conteudo.
    it('o subtitulo NAO fica na banda do titulo: desce para o kicker', () => {
        const html = renderPageHeader('SoA', 'A.8.12 - Tecnologico');
        const banda = html.slice(html.indexOf('page-header-band'), html.indexOf('</div>'));
        expect(banda).not.toContain('A.8.12');
        expect(html).toContain('class="page-kicker"');
        expect(html.indexOf('page-kicker')).toBeGreaterThan(html.indexOf('page-title'));
    });

    it('as acoes ficam NA banda, ao lado do titulo', () => {
        const html = renderPageHeader('SoA', '', '<button>Exportar</button>');
        const banda = html.slice(html.indexOf('page-header-band'), html.indexOf('</div>'));
        expect(banda).toContain('header-actions-group');
    });
});

describe('renderDataTable()', () => {
    const colunas = [
        { label: 'Nome', key: 'name' },
        { label: 'Status', key: 'status', align: 'right' },
    ];

    it('sem linhas mostra o estado vazio padrao', () => {
        expect(renderDataTable(colunas, [])).toContain('Nenhum registro encontrado.');
        expect(renderDataTable(colunas, null)).toContain('Nenhum registro encontrado.');
    });

    it('aceita emptyState e emptyMessage, e escapa a mensagem', () => {
        expect(renderDataTable(colunas, [], { emptyState: 'Sem fornecedores' })).toContain(
            'Sem fornecedores'
        );
        expect(renderDataTable(colunas, [], { emptyMessage: 'Sem riscos' })).toContain('Sem riscos');
        expect(renderDataTable(colunas, [], { emptyState: '<b>x</b>' })).not.toContain('<b>');
    });

    it('escapa o cabecalho e respeita o alinhamento', () => {
        const html = renderDataTable([{ label: '<b>H</b>', key: 'a' }], [{ a: 1 }]);
        expect(html).not.toContain('<b>H</b>');
        expect(renderDataTable(colunas, [{ name: 'n', status: 's' }])).toContain('text-align:right');
    });

    it('coluna declarada como string vira label com alinhamento a esquerda', () => {
        expect(renderDataTable(['Nome'], [{ Nome: 'x' }])).toContain('text-align:left');
    });

    it('LINHA-OBJETO: escapa o valor vindo da API', () => {
        const html = renderDataTable(colunas, [{ name: '<img src=x onerror=alert(1)>', status: 'ok' }]);
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });

    it('LINHA-OBJETO: campo ausente vira celula vazia, nao "undefined"', () => {
        expect(renderDataTable(colunas, [{ name: 'n' }])).not.toContain('undefined');
    });

    it('LINHA-OBJETO: render() customizado entra cru (contrato da API)', () => {
        const html = renderDataTable(
            [{ label: 'Acoes', render: () => '<button>Ver</button>' }],
            [{ id: 1 }]
        );
        expect(html).toContain('<button>Ver</button>');
    });

    // RISCO REAL. Os dois caminhos de linha nao tem a mesma politica: objeto
    // escapa, array NAO. Como a maioria das views passa arrays (17 dos 18
    // pontos de chamada), a seguranca de cada tabela depende de a view lembrar
    // de chamar escapeHTML celula por celula — e ha celulas que esquecem
    // (ver `frontend/src/views/grc.js`, tabela de treinamentos: `r.score` e
    // `r.completion_date` sao interpolados crus).
    it('LINHA-ARRAY: celulas entram CRU, sem escape', () => {
        const html = renderDataTable(['Nome'], [['<img src=x onerror=alert(1)>']]);
        expect(html).toContain('<img src=x onerror=alert(1)>');
    });

    it('LINHA-ARRAY: celula null/undefined vira vazio', () => {
        const html = renderDataTable(['a', 'b'], [[null, undefined]]);
        expect(html).not.toContain('null');
        expect(html).not.toContain('undefined');
    });

    it('emite uma linha por registro', () => {
        const html = renderDataTable(colunas, [
            { name: 'a', status: 'x' },
            { name: 'b', status: 'y' },
        ]);
        expect((html.match(/<tr>/g) || []).length).toBe(3); // 1 cabecalho + 2 dados
    });

    it('TODA th e sticky com fundo opaco - inclusive a coluna de selecao', () => {
        const html = renderDataTable(
            [{ label: '', key: 'sel' }, { label: 'Nome', key: 'name' }],
            [{ sel: '', name: 'a' }]
        );
        const ths = html.match(/<th [^>]*>/g);
        expect(ths).toHaveLength(2);
        // A th vazia de selecao e a que costuma escapar e virar buraco
        // transparente no cabecalho fixo.
        ths.forEach(th => {
            expect(th).toContain('position:sticky');
            expect(th).toContain('background:var(--bg)');
        });
    });

    it('so emite aria-sort quando a coluna declara ordenacao', () => {
        expect(renderDataTable([{ label: 'Ctrl', key: 'a', sort: 'ascending' }], [{ a: 1 }]))
            .toContain('aria-sort="ascending"');
        expect(renderDataTable([{ label: 'Ctrl', key: 'a' }], [{ a: 1 }])).not.toContain('aria-sort');
    });

    it('coluna a direita ganha tabular-nums sem a view pedir', () => {
        const html = renderDataTable([{ label: 'CMMI', key: 'c', align: 'right' }], [{ c: 3 }]);
        expect((html.match(/tabular-nums/g) || []).length).toBe(2); // th + td
    });

    it('numeric:true alinha tabular mesmo a esquerda (codigo de controle)', () => {
        const html = renderDataTable([{ label: 'Ctrl', key: 'c', numeric: true }], [{ c: 'A.5.7' }]);
        expect(html).toContain('tabular-nums');
        expect(html).toContain('text-align:left');
    });

    it('coluna comum a esquerda NAO recebe tabular-nums', () => {
        expect(renderDataTable([{ label: 'Nome', key: 'n' }], [{ n: 'x' }])).not.toContain('tabular-nums');
    });

    it('densidade compacta encolhe o padding da celula', () => {
        expect(renderDataTable(colunas, [{ name: 'a' }])).toContain('padding:12px 10px');
        expect(renderDataTable(colunas, [{ name: 'a' }], { dense: true })).toContain('padding:7px 10px');
    });

    it('o hover saiu do inline: nada de onmouseenter/onmouseleave', () => {
        const html = renderDataTable(colunas, [{ name: 'a' }, { name: 'b' }]);
        expect(html).not.toContain('onmouseenter');
        expect(html).not.toContain('onmouseleave');
    });

    it('o container nao corta o overflow - sticky morre dentro de overflow:hidden', () => {
        expect(renderDataTable(colunas, [{ name: 'a' }])).not.toContain('overflow:hidden');
    });
});

describe('showToast()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="live-region" role="status" aria-live="polite"></div>';
    });
    afterEach(() => vi.useRealTimers());

    it('escreve na regiao ja montada, sem cria-la junto da mensagem', () => {
        showToast('Dono atribuido a 3 controles');
        // A regiao e a MESMA de antes: recriar a cada toast nao e anunciado.
        expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
        expect(document.getElementById('live-region').textContent).toBe('Dono atribuido a 3 controles');
    });

    it('nao injeta HTML da mensagem (a mensagem ecoa texto do servidor)', () => {
        showToast('<img src=x onerror=alert(1)>');
        expect(document.querySelector('.toast img')).toBeNull();
        expect(document.querySelector('.toast-text').textContent).toContain('<img');
    });

    it('sem callback nao ha botao Desfazer', () => {
        showToast('salvo');
        expect(document.querySelector('.toast-undo')).toBeNull();
    });

    it('com callback, Desfazer dispara e fecha o toast na hora', () => {
        const desfaz = vi.fn();
        showToast('3 controles marcados', 'info', desfaz);
        const btn = document.querySelector('.toast-undo');
        expect(btn.textContent).toBe('Desfazer');
        btn.click();
        expect(desfaz).toHaveBeenCalledTimes(1);
        expect(document.querySelector('.toast')).toBeNull();
    });

    it('some sozinho em 4200ms, nao antes', () => {
        showToast('salvo');
        vi.advanceTimersByTime(TOAST_MS - 1);
        expect(document.querySelector('.toast')).not.toBeNull();
        vi.advanceTimersByTime(1);
        expect(document.querySelector('.toast')).toBeNull();
    });

    it('desfazer nao deixa o timer removendo um toast que ja saiu', () => {
        showToast('x', 'info', () => {});
        document.querySelector('.toast-undo').click();
        expect(() => vi.advanceTimersByTime(TOAST_MS * 2)).not.toThrow();
    });
});


describe('traduzStatus()', () => {
    // O dicionário saiu de dentro do `renderStatusBadge` porque nem toda tela
    // usa badge: a lista de riscos e a de controles pintam o valor com estilo
    // próprio e mostravam "High", "Medium", "Completed" e "In Progress" crus.
    it('traduz o vocabulário que o banco grava em inglês', () => {
        expect(traduzStatus('High')).toBe('Alto');
        expect(traduzStatus('Medium')).toBe('Médio');
        expect(traduzStatus('Completed')).toBe('Concluído');
        expect(traduzStatus('In Progress')).toBe('Em Andamento');
        expect(traduzStatus('Treated')).toBe('Tratado');
        expect(traduzStatus('Mitigate')).toBe('Mitigar');
    });

    it('não depende de caixa nem de espaço em volta', () => {
        expect(traduzStatus('  hIgH  ')).toBe('Alto');
    });

    it('valor desconhecido volta como veio — apagar a informação é pior', () => {
        expect(traduzStatus('Frobnicated')).toBe('Frobnicated');
    });

    it('vazio, null e undefined viram string vazia (nunca "undefined" na tela)', () => {
        // Era exatamente isto que aparecia em Riscos: "Tratamento: undefined".
        expect(traduzStatus(undefined)).toBe('');
        expect(traduzStatus(null)).toBe('');
        expect(traduzStatus('')).toBe('');
    });

    it('NÃO escapa — quem chama é que escapa, e o badge já faz isso', () => {
        // Deixar o escape aqui esconderia a responsabilidade de quem interpola
        // o valor direto no HTML, que é onde o bug estava.
        expect(traduzStatus('<b>x</b>')).toBe('<b>x</b>');
        expect(renderStatusBadge('<b>x</b>', 'info')).toContain('&lt;b&gt;');
    });
});


describe('traduzStatus(): Inativo', () => {
    it('o RoPA grava "Inactive" e a tabela mostrava cru', () => {
        expect(traduzStatus('Inactive')).toBe('Inativo');
    });
});

describe('renderDataTable(): estado vazio que ensina', () => {
    it('emptyHint (escapado, em --text-dim) e emptyAction (HTML do botão) aparecem só sem linhas', () => {
        const vazio = renderDataTable(['A'], [], { emptyState: 'Nada <aqui>', emptyHint: 'LGPD, art. 37 <b>', emptyAction: '<button class="btn" data-action="x">Criar</button>' });
        const d = document.createElement('div'); d.innerHTML = vazio;
        expect(d.textContent).toContain('Nada <aqui>');
        expect(d.querySelector('b')).toBeNull();
        expect(d.querySelector('.empty-hint').textContent).toBe('LGPD, art. 37 <b>');
        expect(d.querySelector('.empty-hint').hasAttribute('style')).toBe(false);
        expect(d.querySelector('[data-action="x"]').textContent).toBe('Criar');
        const cheio = renderDataTable(['A'], [['1']], { emptyHint: 'H', emptyAction: '<button data-action="x"></button>' });
        expect(cheio).not.toContain('data-action="x"');
    });
    it('sem as opções novas, o vazio continua igual (chamadas antigas)', () => {
        const d = document.createElement('div'); d.innerHTML = renderDataTable(['A'], [], { emptyState: 'Vazio' });
        expect(d.querySelector('.empty-hint')).toBeNull();
        expect(d.textContent.trim()).toBe('Vazio');
    });
});

describe('renderAbas()', () => {
    it('tablist com tab, aria-selected e a ação com o valor da aba; ativa sem preenchimento', () => {
        const d = document.createElement('div');
        d.innerHTML = renderAbas([['a', 'Pedidos (2)'], ['b', 'Incidentes']], 'b', 'trocar');
        const lista = d.querySelector('[role="tablist"]');
        const abas = [...lista.querySelectorAll('[role="tab"]')];
        expect(abas.map((x) => x.getAttribute('aria-selected'))).toEqual(['false', 'true']);
        expect(abas.map((x) => JSON.parse(x.getAttribute('data-args'))[0])).toEqual(['a', 'b']);
        expect(abas.every((x) => x.getAttribute('data-action') === 'trocar')).toBe(true);
        expect(abas[1].className).not.toContain('btn-primary');
        expect(abas[1].getAttribute('tabindex')).toBe('0');
        expect(abas[0].getAttribute('tabindex')).toBe('-1');
    });
});

describe('renderEmptyState(): o estado vazio único', () => {
    it('título e texto escapados, ação como HTML, numa caixa .empty-state sem estilo inline', async () => {
        const { renderEmptyState } = await import('../src/ui.js');
        const d = document.createElement('div');
        d.innerHTML = renderEmptyState({ titulo: 'Nada <b>', texto: 'ISO 27001, 7.5 <i>', acao: '<button class="btn" data-action="x">Criar</button>' });
        const caixa = d.querySelector('.empty-state');
        expect(caixa.hasAttribute('style')).toBe(false);
        expect(caixa.querySelector('h3').textContent).toBe('Nada <b>');
        expect(caixa.querySelector('.empty-hint').textContent).toBe('ISO 27001, 7.5 <i>');
        expect(caixa.querySelector('b, i')).toBeNull();
        expect(caixa.querySelector('.empty-action [data-action="x"]').textContent).toBe('Criar');
    });
    it('sem texto nem ação, não sobra parágrafo nem contêiner vazio', async () => {
        const { renderEmptyState } = await import('../src/ui.js');
        const d = document.createElement('div');
        d.innerHTML = renderEmptyState({ titulo: 'Vazio' });
        expect(d.querySelector('.empty-hint')).toBeNull();
        expect(d.querySelector('.empty-action')).toBeNull();
    });
    it('itens: lista de texto escapado, cada um com ação opcional; renderDataTable repassa emptyItens', async () => {
        const { renderEmptyState } = await import('../src/ui.js');
        const d = document.createElement('div');
        d.innerHTML = renderEmptyState({ titulo: 'T', itens: ['Um <b>', { texto: 'Dois', acao: '<button data-action="z">Criar</button>' }] });
        const lis = [...d.querySelectorAll('.empty-state ul.empty-list li')];
        expect(lis.map((li) => li.querySelector('span').textContent)).toEqual(['Um <b>', 'Dois']);
        expect(d.querySelector('b')).toBeNull();
        expect(lis[1].querySelector('[data-action="z"]')).not.toBeNull();
        d.innerHTML = renderEmptyState({ titulo: 'T' });
        expect(d.querySelector('.empty-list')).toBeNull();
        d.innerHTML = renderDataTable(['A'], [], { emptyState: 'Sem', emptyItens: ['x'] });
        expect(d.querySelector('.empty-state .empty-list li').textContent).toBe('x');
    });
    it('renderDataTable usa o mesmo primitivo', async () => {
        const d = document.createElement('div');
        d.innerHTML = renderDataTable(['A'], [], { emptyState: 'Sem linhas', emptyHint: 'Dica', emptyAction: '<button data-action="y"></button>' });
        expect(d.querySelector('.empty-state h3').textContent).toBe('Sem linhas');
        expect(d.querySelector('.empty-state .empty-hint').textContent).toBe('Dica');
        expect(d.querySelector('.empty-state .empty-action [data-action="y"]')).not.toBeNull();
    });
});

describe('confirmar() e pedirTexto(): pergunta na própria tela, sem window.confirm/prompt', () => {
    beforeEach(() => { document.body.innerHTML = '<div id="modal-overlay" class="open"><div id="modal"><div id="modal-content"><textarea id="t">rascunho</textarea></div></div></div>'; });

    it('confirmar resolve true no botão de confirmar e some, sem tocar a janela que estava aberta', async () => {
        const { confirmar } = await import('../src/ui.js');
        const p = confirmar('Revogar <b>chave</b>?', { titulo: 'Revogar chave', rotulo: 'Revogar', perigo: true });
        const dlg = document.querySelector('.confirmar[role="alertdialog"]');
        expect(dlg.getAttribute('aria-modal')).toBe('true');
        expect(dlg.textContent).toContain('Revogar <b>chave</b>?');
        expect(dlg.querySelector('b')).toBeNull();
        expect(document.activeElement.textContent).toBe('Cancelar');
        dlg.querySelector('[data-confirmar="sim"]').click();
        await expect(p).resolves.toBe(true);
        expect(document.querySelector('.confirmar')).toBeNull();
        expect(document.getElementById('t').value).toBe('rascunho');
        expect(document.getElementById('modal-overlay').classList.contains('open')).toBe(true);
    });
    it('confirmar resolve false em Cancelar e em Esc, e o Esc não fecha a janela de baixo', async () => {
        const { confirmar } = await import('../src/ui.js');
        const esc = vi.fn();
        document.addEventListener('keydown', esc);
        let p = confirmar('Excluir?');
        document.querySelector('[data-confirmar="nao"]').click();
        await expect(p).resolves.toBe(false);
        p = confirmar('Excluir?');
        document.querySelector('.confirmar').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await expect(p).resolves.toBe(false);
        expect(esc).not.toHaveBeenCalled();
        document.removeEventListener('keydown', esc);
    });
    it('pedirTexto devolve o texto (aparado), null ao cancelar, e senha vai em input password', async () => {
        const { pedirTexto } = await import('../src/ui.js');
        let p = pedirTexto('Motivo', { padrao: 'x' });
        const input = document.querySelector('.confirmar input');
        expect(input.value).toBe('x');
        expect(document.activeElement).toBe(input);
        input.value = '  falta de base  ';
        document.querySelector('[data-confirmar="sim"]').click();
        await expect(p).resolves.toBe('falta de base');
        p = pedirTexto('Senha', { tipo: 'password' });
        expect(document.querySelector('.confirmar input').type).toBe('password');
        document.querySelector('[data-confirmar="nao"]').click();
        await expect(p).resolves.toBeNull();
    });
    it('pedirTexto: Enter no campo confirma', async () => {
        const { pedirTexto } = await import('../src/ui.js');
        const p = pedirTexto('Nome');
        const input = document.querySelector('.confirmar input');
        input.value = 'Ana';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await expect(p).resolves.toBe('Ana');
    });
    it('cancelar: false deixa um botão só (mostrar para copiar), que resolve o texto', async () => {
        const { pedirTexto } = await import('../src/ui.js');
        const p = pedirTexto('Copie a URL.', { titulo: 'Portal', rotulo: 'Fechar', padrao: 'https://x', cancelar: false });
        const botoes = [...document.querySelectorAll('.confirmar button')].map((b) => b.textContent);
        expect(botoes).toEqual(['Fechar']);
        document.querySelector('[data-confirmar="sim"]').click();
        await expect(p).resolves.toBe('https://x');
    });
    it('senha não é aparada: espaço no começo ou no fim faz parte dela', async () => {
        const { pedirTexto } = await import('../src/ui.js');
        const p = pedirTexto('Senha', { tipo: 'password' });
        document.querySelector('.confirmar input').value = ' s3nha ';
        document.querySelector('[data-confirmar="sim"]').click();
        await expect(p).resolves.toBe(' s3nha ');
    });
    it('mousedown no fundo da camada não tira o foco do diálogo', async () => {
        const { confirmar } = await import('../src/ui.js');
        const p = confirmar('Excluir?');
        const camada = document.querySelector('.confirmar');
        const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        camada.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
        const noBotao = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        camada.querySelector('[data-confirmar="nao"]').dispatchEvent(noBotao);
        expect(noBotao.defaultPrevented).toBe(false);
        camada.querySelector('[data-confirmar="nao"]').click();
        await p;
    });
    it('Esc com o foco fora da camada também cancela e não chega ao handler global', async () => {
        const { confirmar } = await import('../src/ui.js');
        const global = vi.fn();
        document.addEventListener('keydown', global);
        const p = confirmar('Excluir?');
        document.body.focus();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await expect(p).resolves.toBe(false);
        expect(global).not.toHaveBeenCalled();
        // Depois de fechada, o Esc volta a chegar ao app.
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(global).toHaveBeenCalledOnce();
        document.removeEventListener('keydown', global);
    });
});
