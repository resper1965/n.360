// Catraca da economia de minutos de Actions (repositório privado cobra minuto).
//
// Cada uma destas voltas parece inofensiva num diff e custa caro no mês:
//  - `push` no ci.yml: a suíte inteira roda de novo na `main` (~14 min por merge) sobre a
//    mesma árvore que o PR já testou;
//  - `schedule` no uptime.yml: 1 minuto arredondado a cada 15 min, ~2.900 min/mês;
//  - suíte sem `if` de workflow_dispatch no deploy.yml: mais ~14 min por merge.
// E uma que trava o merge em vez de custar: `paths`/`paths-ignore` no ci.yml faz PR sem o
// check obrigatório, que nunca reporta.
import { describe, it, expect } from 'vitest';

const arquivos = import.meta.glob('../.github/workflows/*.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const fonte = (nome: string) => {
  const texto = arquivos[`../.github/workflows/${nome}`];
  expect(texto, `${nome} não encontrado`).toBeTruthy();
  return texto.replace(/\r\n/g, '\n');
};

/** Os gatilhos: do `on:` até a próxima chave de topo, sem comentários. */
const gatilhos = (texto: string) => {
  const m = /^on:\s*\n((?:[ \t]+.*\n|\s*\n|#.*\n)*)/m.exec(texto);
  expect(m, 'bloco `on:` não encontrado').toBeTruthy();
  return m![1].split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
};

describe('economia de minutos dos workflows', () => {
  it('ci.yml dispara só em pull_request, sem push e sem filtro de caminho', () => {
    const on = gatilhos(fonte('ci.yml'));
    expect(on).toMatch(/^\s+pull_request:/m);
    expect(on).not.toMatch(/^\s+push:/m);
    expect(on).not.toMatch(/paths(-ignore)?:/);
  });

  it('ci.yml cancela a execução superada do mesmo PR', () => {
    expect(fonte('ci.yml')).toMatch(/concurrency:\s*\n\s+group: ci-\$\{\{ github\.ref \}\}\s*\n\s+cancel-in-progress: true/);
  });

  it('uptime.yml não tem schedule (vigilância contínua é do monitor externo e da sonda interna)', () => {
    const on = gatilhos(fonte('uptime.yml'));
    expect(on).not.toMatch(/schedule:/);
    expect(on).toMatch(/workflow_dispatch:/);
  });

  it('deploy.yml só roda a suíte no deploy manual', () => {
    const linhas = fonte('deploy.yml').split('\n');
    const suites = linhas.flatMap((l, i) => (/run: .*test:coverage/.test(l) ? [i] : []));
    expect(suites.length).toBeGreaterThanOrEqual(2);
    for (const i of suites) expect(linhas[i - 1]).toMatch(/if: github\.event_name == 'workflow_dispatch'/);
  });

  it('codeql.yml se pula em repositório privado', () => {
    expect(fonte('codeql.yml')).toMatch(/if: \$\{\{ github\.event\.repository\.private == false \}\}/);
  });
});
