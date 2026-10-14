// Dados FICTÍCIOS dos protótipos (exemplo). Nenhum nome, CNPJ ou pessoa é real. Comuns às direções A e B.
window.EXEMPLO = {
  empresa: {
    razao: 'Exemplo Logística Integrada S.A.', fantasia: 'Exemplo Log', cnpj: '12.345.678/0001-90',
    setor: 'Transporte rodoviário de carga', cnae: '4930-2/02', porte: 'Médio porte', funcionarios: 420, local: 'Campinas, SP',
    encarregado: 'Marina Exemplo', programa: 'Em operação desde março de 2026',
  },
  empresaNova: {
    razao: 'Exemplo Educação Ltda.', fantasia: null, cnpj: '98.765.432/0001-10', setor: null, cnae: null, porte: 'Pequeno porte',
    funcionarios: null, local: 'Recife, PE', encarregado: null, programa: 'Começando',
  },
  saude: {
    privacy: { tom: 'atraso', rotulo: 'Atrasado', frase: 'Dois prazos legais vencidos. O resto do programa está em dia.', apoio: '2 pedidos do titular passaram de 15 dias; 4 coisas vencem nesta semana.' },
    iso: { tom: 'atraso', rotulo: 'Atrasado', frase: 'Quatro ações corretivas vencidas, e a auditoria interna é em 9 dias.', apoio: '31 de 93 controles implementados; 6 controles do escopo da auditoria ainda sem evidência.' },
    cliente: { tom: 'semana', rotulo: 'Sua vez', frase: 'Três documentos esperam a sua aprovação.', apoio: 'O mais antigo espera há 5 dias. A consultoria cuida do resto e está em dia, com dois pedidos do titular atrasados em resposta.' },
  },
  fazer: {
    privacy: [
      { tom: 'atraso', quando: 'Venceu há 2 dias', texto: '2 pedidos do titular passaram do prazo legal', ctx: 'PT-2026-0031 (acesso) e PT-2026-0034 (eliminação)', acao: 'Responder os pedidos' },
      { tom: 'atraso', quando: 'Venceu em 02/10', texto: 'A avaliação do terceiro TransExemplo Cargas venceu', ctx: 'Usado em 4 atividades, entre elas Folha de pagamento', acao: 'Reavaliar o terceiro' },
      { tom: 'semana', quando: 'Até 21/10', texto: '4 pedidos do titular vencem nesta semana', ctx: 'Dois de acesso, um de correção, um de portabilidade', acao: 'Ver os pedidos' },
      { tom: 'semana', quando: 'Exigido', texto: '3 atividades exigem RIPD e ainda não têm', ctx: 'Câmeras no pátio, Biometria de acesso, Telemetria da frota', acao: 'Criar o RIPD' },
      { tom: 'plano', quando: 'Planejar', texto: '5 evidências vencidas', ctx: 'A mais antiga: treinamento anual de 2025', acao: 'Renovar' },
      { tom: 'plano', quando: 'Planejar', texto: '12 artigos da LGPD sem cobertura', ctx: 'Concentrados nos arts. 46 a 49 (segurança e incidentes)', acao: 'Ver as lacunas' },
      { tom: 'plano', quando: 'Planejar', texto: '1 atividade por legítimo interesse sem LIA', ctx: 'Marketing para clientes ativos', acao: 'Fazer a LIA' },
    ],
    iso: [
      { tom: 'atraso', quando: 'Até 23 dias', texto: '4 ações corretivas passaram do prazo', ctx: 'A mais antiga: revisão de acessos do ERP', acao: 'Ver as ações' },
      { tom: 'semana', quando: 'Em 9 dias', texto: 'Auditoria interna em 23/10', ctx: '6 controles do escopo ainda sem evidência', acao: 'Preparar a auditoria' },
      { tom: 'semana', quando: 'Exigido', texto: '2 riscos altos sem tratamento definido', ctx: 'Vazamento por e-mail; indisponibilidade do TMS', acao: 'Tratar os riscos' },
      { tom: 'plano', quando: 'Planejar', texto: '19 controles em andamento há mais de 60 dias', ctx: 'Metade deles no tema Tecnológicos', acao: 'Ver os controles' },
      { tom: 'plano', quando: 'Planejar', texto: '3 exclusões da SoA sem justificativa', ctx: 'A.7.5, A.7.11 e A.8.30', acao: 'Revisar a SoA' },
    ],
    cliente: [
      { tom: 'semana', quando: 'Há 5 dias', texto: 'Aprovar a atividade "Folha de pagamento"', ctx: 'Aprovação do CISO; versão 3, com 2 terceiros e 1 transferência', acao: 'Ler e aprovar' },
      { tom: 'semana', quando: 'Há 2 dias', texto: 'Aprovar a Política de privacidade, versão 3', ctx: 'Aprovação do CEO; muda a retenção de currículos para 12 meses', acao: 'Ler e aprovar' },
      { tom: 'semana', quando: 'Há 1 dia', texto: 'Aprovar a exceção "Imagens de câmera por 60 dias"', ctx: 'Aprovação do CISO; vale até 31/03/2027', acao: 'Ler e aprovar' },
      { tom: 'plano', quando: 'Sem prazo', texto: 'Dar ciência da Norma de uso aceitável, versão 2', ctx: 'Pedido para toda a diretoria', acao: 'Ler e dar ciência' },
    ],
  },
  // Cobertura: concluído / em andamento / falta. O que cada parte quer dizer fica na coluna "como se conta".
  cobertura: {
    privacy: [
      { tema: 'Atividades (RoPA)', f: 29, a: 6, x: 3, conta: 'aprovadas / em revisão / rascunho ou sem base legal' },
      { tema: 'RIPD exigidos', f: 4, a: 2, x: 3, conta: 'aprovados / em revisão / não iniciados' },
      { tema: 'LIA exigidas', f: 3, a: 1, x: 1, conta: 'concluídas / rascunho / não iniciadas' },
      { tema: 'Terceiros', f: 15, a: 5, x: 1, conta: 'avaliação vigente / nunca avaliados / vencidos ou reprovados' },
      { tema: 'Pedidos do titular (90 dias)', f: 22, a: 7, x: 2, conta: 'respondidos / em andamento no prazo / atrasados' },
      { tema: 'Incidentes (12 meses)', f: 2, a: 1, x: 0, conta: 'encerrados / abertos com comunicação em dia / comunicação atrasada' },
      { tema: 'Evidências', f: 52, a: 4, x: 5, conta: 'válidas / em análise / vencidas' },
    ],
    iso: [
      { tema: 'Controles organizacionais', f: 15, a: 12, x: 10, conta: 'implementados / em andamento / não iniciados' },
      { tema: 'Controles de pessoas', f: 5, a: 2, x: 1, conta: 'implementados / em andamento / não iniciados' },
      { tema: 'Controles físicos', f: 6, a: 4, x: 4, conta: 'implementados / em andamento / não iniciados' },
      { tema: 'Controles tecnológicos', f: 5, a: 14, x: 15, conta: 'implementados / em andamento / não iniciados' },
      { tema: 'Riscos', f: 14, a: 7, x: 3, conta: 'tratados / em tratamento / sem tratamento' },
      { tema: 'Ações corretivas', f: 9, a: 4, x: 4, conta: 'concluídas / abertas no prazo / vencidas' },
      { tema: 'Evidências', f: 88, a: 20, x: 12, conta: 'conformes / em análise / vencidas ou não conformes' },
    ],
  },
  // Riscos: [probabilidade, impacto] de 1 a 5. Nível pela mesma regra do servidor (riskLevel em src/routes/risks.ts).
  riscos: [[5,5],[4,5],[4,4],[4,4],[3,5],[4,3],[3,4],[3,4],[3,3],[3,3],[3,3],[2,4],[2,4],[4,2],[2,3],[3,2],[2,2],[2,2],[1,4],[1,3],[2,1],[1,2],[1,1],[1,1]],
  // Vencimentos em dias a partir de hoje (negativo = vencido).
  vencimentos: {
    privacy: [
      { tipo: 'Pedidos do titular', itens: [[-2,'PT-2026-0031, acesso'],[-1,'PT-2026-0034, eliminação'],[2,'PT-2026-0036'],[4,'PT-2026-0037'],[5,'PT-2026-0038'],[7,'PT-2026-0039'],[12,'PT-2026-0040']] },
      { tipo: 'Terceiros', itens: [[-12,'TransExemplo Cargas'],[19,'Exemplo Cloud'],[44,'Folha Exemplo Serviços'],[81,'Exemplo Seguros']] },
      { tipo: 'Evidências', itens: [[-40,'Treinamento anual 2025'],[-9,'Teste de restauração'],[-3,'Relatório de acessos'],[-2,'Inventário de bases'],[-1,'Política assinada'],[6,'Pentest externo'],[33,'Termo de confidencialidade']] },
      { tipo: 'Documentos (revisão)', itens: [[27,'Política de retenção'],[62,'Norma de câmeras']] },
      { tipo: 'Ações das atividades', itens: [[15,'Reduzir retenção de currículos'],[52,'Anonimizar base de testes']], fase: 'F2' },
    ],
    iso: [
      { tipo: 'Ações corretivas', itens: [[-23,'Revisão de acessos do ERP'],[-14,'Backup do TMS'],[-6,'Registro de visitantes'],[-2,'MFA no VPN'],[10,'Hardening dos servidores'],[38,'Plano de continuidade']] },
      { tipo: 'Auditorias', itens: [[9,'Auditoria interna'],[74,'Auditoria de certificação, fase 1']] },
      { tipo: 'Evidências', itens: [[-5,'Teste de restauração'],[3,'Varredura de vulnerabilidades'],[21,'Revisão de logs'],[55,'Treinamento de phishing']] },
      { tipo: 'Documentos (revisão)', itens: [[14,'Política de controle de acesso'],[47,'Política de backup']] },
    ],
  },
  pedidosSemana: [2, 3, 1, 4, 3, 2, 5, 3, 4, 2, 6, 4],
  carteira: [
    { empresa: 'Exemplo Logística Integrada S.A.', modulos: 'n.iso, n.privacy', tom: 'atraso', situacao: '2 prazos legais vencidos', urgente: 'PT-2026-0031 venceu em 12/10', mov: 'hoje' },
    { empresa: 'Clínica Exemplo Saúde', modulos: 'n.privacy', tom: 'atraso', situacao: 'Comunicação à ANPD atrasada', urgente: 'IN-2026-0003, ciência em 08/10', mov: 'ontem' },
    { empresa: 'Exemplo Varejo Ltda.', modulos: 'n.iso', tom: 'semana', situacao: 'Auditoria em 9 dias', urgente: '6 controles sem evidência', mov: 'há 2 dias' },
    { empresa: 'Exemplo Educação Ltda.', modulos: 'n.iso, n.privacy', tom: 'plano', situacao: 'Começando', urgente: 'Nenhuma atividade mapeada', mov: 'há 6 dias' },
    { empresa: 'Cooperativa Exemplo', modulos: 'n.privacy', tom: 'ok', situacao: 'Em dia', urgente: 'Próximo prazo em 18 dias', mov: 'há 3 dias' },
    { empresa: 'Exemplo Engenharia S.A.', modulos: 'n.iso', tom: 'ok', situacao: 'Em dia', urgente: 'Revisão da SoA em 40 dias', mov: 'há 12 dias' },
  ],
};

// Utilitários comuns: escape, nível de risco, tooltip por textContent.
window.U = {
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  nivel: (s) => (s <= 5 ? 'Baixo' : s <= 12 ? 'Médio' : s <= 20 ? 'Alto' : 'Crítico'),
  ligarDicas() {
    const tip = document.querySelector('.tip');
    const mostrar = (el, x, y) => {
      const [v, r] = el.dataset.tip.split('|');
      tip.replaceChildren(Object.assign(document.createElement('b'), { textContent: v }), document.createTextNode(r || ''));
      tip.style.display = 'block'; tip.style.left = Math.min(x + 12, innerWidth - 240) + 'px'; tip.style.top = y + 12 + 'px';
    };
    document.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-tip]'); if (el) mostrar(el, e.clientX, e.clientY); });
    document.addEventListener('pointermove', (e) => { if (tip.style.display === 'block' && e.target.closest('[data-tip]')) { tip.style.left = Math.min(e.clientX + 12, innerWidth - 240) + 'px'; tip.style.top = e.clientY + 12 + 'px'; } });
    document.addEventListener('pointerout', (e) => { if (e.target.closest('[data-tip]')) tip.style.display = 'none'; });
    document.addEventListener('focusin', (e) => { const el = e.target.closest('[data-tip]'); if (el) { const b = el.getBoundingClientRect(); mostrar(el, b.right, b.top); } });
    document.addEventListener('focusout', () => { tip.style.display = 'none'; });
  },
};
