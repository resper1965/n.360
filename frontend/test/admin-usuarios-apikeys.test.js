// Gestão de usuários e API keys (src/views/admin.js). O menu por papel e os papéis oferecidos no
// modal já são cobertos por papeis-admin.test.js; aqui: a listagem (contagens, rótulos, escape,
// vazio, erro), exclusão, salvar usuário (validação e payload) e o ciclo da API key (acesso
// restrito a platform_admin, revogar só se ativa, expiração, chave exibida uma vez).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { apiMock, renderMock } = vi.hoisted(() => ({ apiMock: vi.fn(), renderMock: vi.fn() }));
vi.mock('../src/api.js', () => ({ api: apiMock, API_BASE: 'http://api.test' }));
vi.mock('../src/router.js', () => ({ render: renderMock, navigate: vi.fn() }));

import '../src/ui.js';
import '../src/views/admin.js';
import { S } from '../src/state.js';

const $ = (id) => document.getElementById(id);
const dom = () => {
  document.body.innerHTML =
    '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div><div id="c"></div><h1 id="h"></h1><div id="a"></div>';
  return [$('c'), $('h'), $('a')];
};

beforeEach(() => {
  apiMock.mockReset();
  renderMock.mockReset();
  window.loadProjects = vi.fn(async () => {});
  S.user = { role: 'platform_admin', email: 'root@exemplo.test' };
  S.projects = [{ id: 'p1', client_name: 'Cliente Um' }];
  S.activeProject = null;
  S.apiKeysProjectId = null;
});

const USERS = [
  { id: 'u1', name: 'Ana <b id="nm">x</b>', email: 'ana@exemplo.test', role: 'platform_admin' },
  { id: 'u2', name: 'Caio', email: 'caio@exemplo.test', role: 'org_admin', client_project_id: 'p1' },
  { id: 'u3', name: 'Bia', email: 'bia@exemplo.test', role: 'org_user', client_project_id: 'pX' },
  { id: 'u4', name: 'Duda', email: 'duda@exemplo.test', role: 'consultant' },
];

describe('renderUsers', () => {
  it('lista com rótulo por papel, projeto resolvido (ou o id) e nome escapado', async () => {
    apiMock.mockResolvedValue(USERS);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/users');
    expect(a.querySelector('[data-action="openUserModal"]')).toBeTruthy();
    expect($('nm')).toBeNull();
    const linhas = [...c.querySelectorAll('tbody tr')];
    expect(linhas).toHaveLength(4);
    expect(linhas[0].textContent).toContain('Admin Plataforma');
    expect(linhas[1].textContent).toContain('Gestor Cliente');
    expect(linhas[1].textContent).toContain('Cliente Um');
    expect(linhas[2].textContent).toContain('Colaborador Cliente');
    expect(linhas[2].textContent).toContain('pX');
    expect(linhas[3].textContent).toContain('Consultor');
    expect(linhas[1].querySelector('[data-action="confirmarContaAtiva"]').dataset.args).toBe('["u2"]');
    expect(linhas[1].querySelector('[data-action="openUserModal"]').dataset.args).toBe('["u2"]');
  });

  it('mostra a organização de cada conta e avisa que a lista é de todas, quando não há filtro', async () => {
    window.nomeOrgDe = (id) => ({ org_ness: 'ness.', org_bekaa: 'Bekaa' }[id]);
    window.orgsConhecidas = () => [{ id: 'org_ness', nome: 'ness.' }, { id: 'org_bekaa', nome: 'Bekaa' }];
    S.orgAtuacao = null;
    apiMock.mockResolvedValue([
      { id: 'u1', name: 'Ana', email: 'ana@exemplo.test', role: 'platform_admin', org: 'org_ness' },
      { id: 'u2', name: 'Caio', email: 'caio@exemplo.test', role: 'org_admin', client_project_id: 'p1', org: 'org_bekaa' },
    ]);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    const linhas = [...c.querySelectorAll('tbody tr')];
    expect(linhas[0].textContent).toContain('ness.');
    expect(linhas[1].textContent).toContain('Bekaa');
    const sel = c.querySelector('#usr-org');
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Todas as organizações', 'ness.', 'Bekaa']);
    apiMock.mockClear();
    renderMock.mockClear();
    window.__usuariosFiltrarOrg('org_bekaa');
    expect(renderMock).toHaveBeenCalled();   // a tela se redesenha com o filtro
    await window.renderUsers(c, h, a);
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/users', undefined, { 'X-Org-Id': 'org_bekaa' });
    window.__usuariosFiltrarOrg('');
    delete window.nomeOrgDe; delete window.orgsConhecidas;
  });

  it('estado vazio e resposta que não é array', async () => {
    apiMock.mockResolvedValue({ erro: 'x' });
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(c.textContent).toMatch(/Nenhum usuário cadastrado/);
    expect(c.querySelector('table')).toBeNull();
  });

  it('carrega projetos quando S.projects está vazio', async () => {
    S.projects = [];
    apiMock.mockResolvedValue([]);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(window.loadProjects).toHaveBeenCalledOnce();
  });

  it('falha ao carregar: estado de erro em português, sem a mensagem técnica na tela', async () => {
    S.projects = [];
    window.loadProjects = vi.fn(async () => { throw new Error('<i id="e">boom</i>'); });
    apiMock.mockResolvedValue([]);
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(c.querySelector('.error-state').textContent).toContain('Não foi possível carregar os usuários.');
    expect(c.textContent).not.toContain('boom');
    expect($('e')).toBeNull();
    erro.mockRestore();
  });

  // BUG (admin.js:136): "Administradores & Consultores" só conta platform_admin/admin/consultor;
  // consultoria_admin, comercial e o legado `consultant` caem em "Usuários de Clientes".
  it('equipe da consultoria não é contada como usuário de cliente (admin.js:136)', async () => {
    apiMock.mockResolvedValue([
      { id: 'a', name: 'A', email: 'a@x.test', role: 'consultoria_admin' },
      { id: 'b', name: 'B', email: 'b@x.test', role: 'comercial' },
      { id: 'c', name: 'C', email: 'c@x.test', role: 'consultant' },
    ]);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    const txt = c.textContent;
    expect(txt).toMatch(/Usuários de Clientes\s*0/);
  });

  // BUG (admin.js:147-153): consultoria_admin não tem rótulo e aparece como "consultoria_admin" cru.
  it('consultoria_admin tem rótulo legível (admin.js:147)', async () => {
    apiMock.mockResolvedValue([{ id: 'a', name: 'A', email: 'a@x.test', role: 'consultoria_admin' }]);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(c.querySelector('tbody tr').textContent).not.toContain('consultoria_admin');
  });
});

describe('desativar, reativar e excluir definitivamente', () => {
  const COM_DESATIVADA = [...USERS, { id: 'u9', name: 'Zeca', email: 'zeca@exemplo.test', role: 'org_user', ativo: false }];

  it('desativadas ficam escondidas até o filtro; a coluna Situação diz Ativa/Desativada', async () => {
    apiMock.mockResolvedValue(COM_DESATIVADA);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(c.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(c.textContent).toContain('Situação');
    expect(c.textContent).not.toContain('Contas ativas');
    expect(c.querySelector('tbody tr').textContent).toContain('Ativa');
    window.alternarDesativadas();
    expect(renderMock).toHaveBeenCalledOnce();
    await window.renderUsers(c, h, a);
    const linhas = [...c.querySelectorAll('tbody tr')];
    expect(linhas).toHaveLength(5);
    expect(linhas[4].textContent).toContain('Desativada');
    expect(linhas[4].textContent).toContain('Reativar');
    window.alternarDesativadas(); // devolve o padrão
  });

  it('desativar: confirma na janela e envia PUT /ativo {ativo:false}', async () => {
    apiMock.mockResolvedValue(USERS);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    window.confirmarContaAtiva('u2');
    expect(apiMock).toHaveBeenCalledTimes(1); // nada foi enviado antes da confirmação
    expect($('modal-content').textContent).toContain('Desativar conta');
    const botao = $('modal-content').querySelector('[data-action="definirContaAtiva"]');
    expect(botao.dataset.args).toBe('["u2",false]');
    apiMock.mockResolvedValue({ ok: true, ativo: false });
    await window.definirContaAtiva('u2', false);
    expect(apiMock).toHaveBeenLastCalledWith('PUT', '/api/v1/users/u2/ativo', { ativo: false });
    expect(renderMock).toHaveBeenCalledOnce();
  });

  it('reativar envia {ativo:true}; recusa do servidor aparece e não re-renderiza', async () => {
    apiMock.mockResolvedValue({ ok: true });
    dom();
    await window.definirContaAtiva('u9', true);
    expect(apiMock).toHaveBeenCalledWith('PUT', '/api/v1/users/u9/ativo', { ativo: true });
    renderMock.mockReset();
    apiMock.mockRejectedValue(new Error('A organização precisa de ao menos um administrador ativo'));
    await window.definirContaAtiva('u2', false);
    expect(renderMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('precisa de ao menos um administrador ativo');
  });

  it('excluir definitivamente: só platform_admin vê o botão; DELETE com ?definitivo=1 após confirmar', async () => {
    apiMock.mockResolvedValue(USERS);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(c.querySelectorAll('[data-action="confirmarExclusaoDefinitiva"]')).toHaveLength(4);
    S.user = { role: 'consultoria_admin', email: 'g@exemplo.test' };
    await window.renderUsers(c, h, a);
    expect(c.querySelector('[data-action="confirmarExclusaoDefinitiva"]')).toBeNull();
    S.user = { role: 'platform_admin', email: 'root@exemplo.test' };
    await window.renderUsers(c, h, a);
    apiMock.mockClear();
    window.confirmarExclusaoDefinitiva('u2');
    expect($('modal-content').textContent).toMatch(/apaga a conta/);
    expect(apiMock).not.toHaveBeenCalled();
    apiMock.mockResolvedValue({ ok: true });
    await window.excluirContaDefinitiva('u2');
    expect(apiMock).toHaveBeenCalledWith('DELETE', '/api/v1/users/u2?definitivo=1');
    expect(renderMock).toHaveBeenCalledOnce();
  });

  it('a própria conta não tem Desativar nem Excluir; as outras têm', async () => {
    S.user = { id: 'u2', role: 'platform_admin', email: 'caio@exemplo.test' };
    apiMock.mockResolvedValue(USERS);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    const linhas = [...c.querySelectorAll('tbody tr')];
    expect(linhas[1].querySelector('[data-action="confirmarContaAtiva"]')).toBeNull();
    expect(linhas[1].querySelector('[data-action="confirmarExclusaoDefinitiva"]')).toBeNull();
    expect(linhas[1].querySelector('[data-action="openUserModal"]')).toBeTruthy();
    expect(linhas[0].querySelector('[data-action="confirmarContaAtiva"]')).toBeTruthy();
  });

  it('a confirmação não promete cortar chave de API e avisa das chaves do projeto', async () => {
    apiMock.mockResolvedValue(USERS);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    window.confirmarContaAtiva('u2');
    const t = $('modal-content').textContent;
    expect(t).not.toMatch(/SSO e chave de API/);
    expect(t).toContain('As chaves de API do projeto continuam valendo; revogue-as em Chaves de API');
  });

  it('Total de Usuários conta todas as contas, inclusive as desativadas escondidas', async () => {
    apiMock.mockResolvedValue([...USERS, { id: 'u9', name: 'Zeca', email: 'zeca@exemplo.test', role: 'org_user', ativo: false }]);
    const [c, h, a] = dom();
    await window.renderUsers(c, h, a);
    expect(c.textContent).toMatch(/Total de Usuários\s*5/);
  });
});

describe('reenviar convite', () => {
  it('POST na rota da conta e a tela se redesenha', async () => {
    apiMock.mockResolvedValue({ ok: true, emailEnviado: true });
    await window.reenviarConviteUsuario('u-9');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/users/u-9/reenviar-convite', {});
    expect(renderMock).toHaveBeenCalledOnce();
  });
});

describe('saveUser', () => {
  function formulario({ name = 'Ana', email = 'ana@exemplo.test', password = 'senha-forte', role = 'org_user', projeto = '' } = {}) {
    dom();
    document.body.insertAdjacentHTML(
      'beforeend',
      `<input id="user-m-name" value="${name}"><input id="user-m-email" value="${email}">
       <input id="user-m-password" value="${password}">
       <select id="user-m-role"><option value="${role}" selected>${role}</option></select>
       <select id="user-m-project"><option value="${projeto}" selected>${projeto}</option></select>`,
    );
  }

  it.each([
    ['sem nome', { name: '' }],
    ['sem e-mail', { email: '' }],
    ['sem papel', { role: '' }],
  ])('%s: não chama a API', async (_t, campos) => {
    formulario(campos);
    await window.saveUser('');
    expect(apiMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Preencha os campos obrigatórios');
  });

  it('usuário novo não leva senha: o convite por e-mail traz o link para criá-la', async () => {
    formulario({ password: 'ignorada' });
    apiMock.mockResolvedValue({ emailEnviado: true });
    await window.saveUser('');
    expect(apiMock.mock.calls[0][2]).not.toHaveProperty('password');
    expect(document.body.textContent).not.toContain('A senha é obrigatória');
  });

  it('criar: POST com projeto nulo quando vazio, e re-render', async () => {
    formulario({ projeto: '' });
    apiMock.mockResolvedValue({});
    await window.saveUser('');
    expect(apiMock).toHaveBeenCalledWith('POST', '/api/v1/users', {
      name: 'Ana', email: 'ana@exemplo.test', role: 'org_user', client_project_id: null,
    });
    expect(renderMock).toHaveBeenCalledOnce();
  });

  it('editar com senha em branco: PUT sem o campo password', async () => {
    formulario({ password: '', projeto: 'p1' });
    apiMock.mockResolvedValue({});
    await window.saveUser('u2');
    const [metodo, url, corpo] = apiMock.mock.calls[0];
    expect([metodo, url]).toEqual(['PUT', '/api/v1/users/u2']);
    expect(corpo).not.toHaveProperty('password');
    expect(corpo.client_project_id).toBe('p1');
  });

  it('erro do servidor: mostra e não re-renderiza', async () => {
    formulario();
    apiMock.mockRejectedValue(new Error('E-mail já existe'));
    await window.saveUser('');
    expect(renderMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Erro ao salvar usuário: E-mail já existe');
  });
});

describe('toggleUserProjectSelect', () => {
  function grupo() {
    dom();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="user-m-project-group"><select id="user-m-project"><option value="">-</option><option value="p1" selected>p1</option></select></div>',
    );
  }

  it('gestor de plataforma + papel de cliente: mostra o projeto', () => {
    grupo();
    window.toggleUserProjectSelect('org_admin');
    expect($('user-m-project-group').style.display).toBe('block');
  });

  it('papel de equipe: esconde e zera o projeto escolhido', () => {
    grupo();
    window.toggleUserProjectSelect('consultor');
    expect($('user-m-project-group').style.display).toBe('none');
    expect($('user-m-project').value).toBe('');
  });

  it('quem não é gestor do sistema nunca vê o seletor', () => {
    grupo();
    S.user = { role: 'org_admin' };
    window.toggleUserProjectSelect('org_user');
    expect($('user-m-project-group').style.display).toBe('none');
  });
});

describe('renderApiKeys', () => {
  it.each(['consultoria_admin', 'comercial', 'org_admin', 'consultor'])('%s: acesso restrito, sem chamar a API', async (papel) => {
    S.user = { role: papel };
    const [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(c.textContent).toBe('Acesso restrito ao Platform Admin.');
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('platform_admin: seleciona o primeiro projeto, lista chaves e só oferece revogar a ativa', async () => {
    apiMock.mockResolvedValue({ keys: [
      { id: 'k1', name: '<b id="kn">x</b>', status: 'Active', permissions: 'consultant', created_at: '2026-10-01T10:00:00Z' },
      { id: 'k2', name: 'velha', status: 'Revoked', last_used_at: '2026-09-01' },
    ] });
    const [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(S.apiKeysProjectId).toBe('p1');
    expect(apiMock).toHaveBeenCalledWith('GET', '/api/v1/projects/p1/api-keys');
    expect($('kn')).toBeNull();
    expect(h.textContent).toBe('Chaves de API');
    expect(a.querySelector('[data-action="openApiKeyModal"]').textContent).toBe('Nova chave');
    const linhas = c.querySelectorAll('tbody tr');
    expect(linhas).toHaveLength(2);
    expect(linhas[0].querySelector('[data-action="revokeApiKey"]').dataset.args).toBe('["k1"]');
    expect(linhas[0].textContent).toContain('Consultor');
    expect(linhas[0].textContent).not.toContain('consultant');
    expect(linhas[0].textContent).toContain('2026-10-01');
    expect(linhas[1].querySelector('[data-action="revokeApiKey"]')).toBeNull();
    expect(linhas[1].textContent).toContain('2026-09-01');
  });

  it('sem chaves: linha de vazio; sem projetos: "Nova chave" desabilitado e nenhuma chamada de chaves', async () => {
    apiMock.mockResolvedValue([]);
    let [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(c.textContent).toMatch(/Nenhuma chave para este projeto/);

    apiMock.mockReset();
    S.projects = [];
    S.apiKeysProjectId = null;
    [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(apiMock).not.toHaveBeenCalled();
    expect(a.querySelector('[data-action="openApiKeyModal"]').disabled).toBe(true);
  });

  it('erro da API não vira "sem chaves": mostra o erro', async () => {
    apiMock.mockRejectedValue(new Error('403 Forbidden'));
    const [c, h, a] = dom();
    await window.renderApiKeys(c, h, a);
    expect(c.querySelector('.error-state').textContent).toContain('Não foi possível carregar as chaves de API.');
    expect(c.textContent).not.toContain('403');
    expect(c.querySelector('table')).toBeNull();
  });
});

describe('criar e revogar chave', () => {
  it('a criação não oferece os papéis legados write/admin', () => {
    dom();
    S.apiKeysProjectId = 'p1';
    window.openApiKeyModal();
    const valores = [...$('apikey-perm').options].map((o) => o.value);
    expect(valores).toEqual(['consultant', 'auditor', 'read']);
  });

  function abreModal() {
    dom();
    S.apiKeysProjectId = 'p1';
    window.openApiKeyModal();
  }

  it('sem projeto selecionado não abre o modal', () => {
    dom();
    S.apiKeysProjectId = null;
    window.openApiKeyModal();
    expect($('apikey-name')).toBeNull();
  });

  it('nome obrigatório', async () => {
    abreModal();
    $('apikey-name').value = '  ';
    await window.createApiKey();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('padrão de 90 dias: expires_at ~ agora + 90d, papel escolhido', async () => {
    abreModal();
    $('apikey-name').value = ' agente-x ';
    $('apikey-perm').value = 'auditor';
    apiMock.mockResolvedValue({ key: 'niso_abc<b id="kk">' });
    const antes = Date.now();
    await window.createApiKey();
    const [metodo, url, corpo] = apiMock.mock.calls[0];
    expect([metodo, url]).toEqual(['POST', '/api/v1/projects/p1/api-keys']);
    expect(corpo.name).toBe('agente-x');
    expect(corpo.permissions).toBe('auditor');
    const dias = (new Date(corpo.expires_at).getTime() - antes) / 86400000;
    expect(dias).toBeGreaterThan(89.99);
    expect(dias).toBeLessThan(90.01);
  });

  it('"sem expiração" não envia expires_at; a chave aparece escapada num campo somente leitura', async () => {
    abreModal();
    $('apikey-name').value = 'k';
    $('apikey-exp').value = '';
    apiMock.mockResolvedValue({ key: 'niso_abc"><b id="kk">' });
    await window.createApiKey();
    expect(apiMock.mock.calls[0][2]).not.toHaveProperty('expires_at');
    expect($('apikey-plain').value).toBe('niso_abc"><b id="kk">');
    expect($('apikey-plain').readOnly).toBe(true);
    expect($('kk')).toBeNull();
  });

  it('falha ao criar: nenhuma chave exibida', async () => {
    abreModal();
    $('apikey-name').value = 'k';
    apiMock.mockRejectedValue(new Error('limite'));
    await window.createApiKey();
    expect($('apikey-plain')).toBeNull();
    expect(document.body.textContent).toContain('Erro ao criar chave: limite');
  });

  it('revogar: só com confirmação, DELETE na rota certa e re-render', async () => {
    dom();
    // Confirmação na própria tela (ui.js confirmar), não window.confirm.
    const nativo = vi.fn(); vi.stubGlobal('confirm', nativo);
    const conf = vi.spyOn(window, 'confirmar').mockResolvedValue(false);
    await window.revokeApiKey('k1');
    expect(conf.mock.calls[0][1]).toMatchObject({ perigo: true, rotulo: 'Revogar' });
    expect(nativo).not.toHaveBeenCalled();
    expect(apiMock).not.toHaveBeenCalled();

    conf.mockResolvedValue(true);
    apiMock.mockResolvedValue({});
    await window.revokeApiKey('k1');
    expect(apiMock).toHaveBeenCalledWith('DELETE', '/api/v1/api-keys/k1');
    expect(renderMock).toHaveBeenCalledOnce();
  });
});

describe('renderSettings (Preços e margens)', () => {
  it('falha da API: mensagem própria, sem exceção crua, com "Tentar de novo"', async () => {
    apiMock.mockRejectedValue(new Error("Cannot read properties of undefined (reading '1')"));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const [c, h, a] = dom();
    await window.renderSettings(c, h, a);
    expect(h.textContent).toBe('Preços e margens');
    expect(c.textContent).toContain('Não foi possível carregar a tabela de preços');
    expect(c.textContent).not.toContain('Cannot read');
    expect(c.querySelector('[data-action="navigate"]').dataset.args).toBe('["settings"]');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('configuração incompleta não quebra: campos aparecem zerados', async () => {
    apiMock.mockResolvedValue({});
    const [c, h, a] = dom();
    await window.renderSettings(c, h, a);
    expect(c.querySelector('#cfg-venda-1').value).toBe('0');
    expect(c.querySelector('#cfg-iss').value).toBe('0.00');
    expect(c.textContent).toContain('Parâmetros gerais');
    expect(c.textContent).toContain('Comissão');
  });
});
