/**
 * Mapeamento entre controles ISO (27001:2022 e 27701:2025) e requisitos da LGPD e das resoluções da ANPD.
 *
 * Proposta gerada; só conta depois de validada por pessoa na tela de requisitos.
 *
 * Método: cada requisito de `lgpd.ts` e `anpd.ts` foi lido contra os títulos próprios dos controles de
 * `iso27001-2022.ts` e `iso27701-2025.ts`. O seed grava tudo como `proposto`, e a cobertura
 * (`lacunasDaFonte`) só considera `validado_juridico` com tipo `equivalente` ou `parcial`.
 *   - `equivalente`: o controle cumpre o dever inteiro (raro de propósito);
 *   - `parcial`: o controle cumpre parte do dever (o caso normal);
 *   - `relacionado`: o controle só ajuda, não cumpre.
 * Ficam de fora os requisitos sem contrapartida em controle: hipóteses legais isoladas (incisos dos arts. 7,
 * 11 e 33 que só descrevem a hipótese; a contrapartida, A.1.2.3 ou A.1.5.2, está no artigo pai), não usar
 * dado contra o titular (art. 21), defesa em juízo (art. 22), poder público (art. 23; Res. 18/2024, art. 5),
 * responsabilidade civil (arts. 42, 43 e 45), padrões técnicos que a ANPD estimula (art. 51), enquadramento e
 * prazos do pequeno porte (Res. 2/2022, arts. 3, 5 e 14), pedido de sigilo à ANPD (Res. 15/2024, art. 7),
 * conduta pessoal do encarregado (Res. 18/2024, arts. 13, 18 e 20), conteúdo das normas corporativas globais
 * (Res. 19/2024, art. 27) e os pais de resolução.
 *
 * Os pares abaixo estão agrupados pelo requisito legal, um par por linha. `de` é o controle ISO, `para`
 * é o requisito legal. Código A.1.x e A.2.x é da 27701:2025 (controlador e operador); A.5 a A.8, da 27001:2022.
 */

export interface Mapeamento { de: string; para: string; tipo: 'equivalente' | 'parcial' | 'relacionado' }

// ponytail: o prefixo da norma sai do código; A.1/A.2 só existem na 27701, A.5–A.8 só na 27001.
const iso = (code: string) => (/^A\.[12]\./.test(code) ? `iso27701:2025:${code}` : `iso27001:2022:${code}`);
const p = (para: string, code: string, tipo: Mapeamento['tipo']): Mapeamento => ({ de: iso(code), para, tipo });

export const MAPEAMENTOS: readonly Mapeamento[] = [
  // ─── LGPD ─────────────────────────────────────────────────────────────────────────────────────────
  // art. 6 — princípios
  p('lgpd:art6', 'A.5.34', 'parcial'),
  p('lgpd:art6', 'A.1.2.2', 'parcial'),
  p('lgpd:art6', 'A.1.4.3', 'parcial'),
  p('lgpd:art6', 'A.1.4.4', 'relacionado'),
  p('lgpd:art6', 'A.1.3.4', 'relacionado'),
  // art. 7 — bases legais
  p('lgpd:art7', 'A.1.2.3', 'parcial'),
  p('lgpd:art7', 'A.1.2.2', 'relacionado'),
  p('lgpd:art7', 'A.5.4', 'relacionado'),
  p('lgpd:art7:i', 'A.1.2.4', 'parcial'),
  p('lgpd:art7:i', 'A.1.2.5', 'parcial'),
  p('lgpd:art7:ii', 'A.5.31', 'relacionado'),
  p('lgpd:art7:ix', 'A.1.2.3', 'parcial'),
  p('lgpd:art7:ix', 'A.1.2.6', 'relacionado'),
  // art. 8 — consentimento
  p('lgpd:art8', 'A.1.2.4', 'parcial'),
  p('lgpd:art8', 'A.1.2.5', 'parcial'),
  p('lgpd:art8', 'A.1.3.5', 'parcial'),
  // art. 9 — informação ao titular
  p('lgpd:art9', 'A.1.3.3', 'parcial'),
  p('lgpd:art9', 'A.1.3.4', 'parcial'),
  p('lgpd:art9', 'A.5.5', 'relacionado'),
  // art. 10 — legítimo interesse
  p('lgpd:art10', 'A.1.2.3', 'parcial'),
  p('lgpd:art10', 'A.1.4.2', 'parcial'),
  p('lgpd:art10', 'A.1.3.4', 'relacionado'),
  // art. 11 — dados sensíveis
  p('lgpd:art11', 'A.1.2.3', 'parcial'),
  p('lgpd:art11', 'A.5.12', 'relacionado'),
  p('lgpd:art11', 'A.1.2.6', 'relacionado'),
  p('lgpd:art11:i', 'A.1.2.4', 'parcial'),
  p('lgpd:art11:i', 'A.1.2.5', 'parcial'),
  p('lgpd:art11:ii-a', 'A.5.31', 'relacionado'),
  // art. 12 — anonimização reversível
  p('lgpd:art12', 'A.8.11', 'relacionado'),
  p('lgpd:art12', 'A.1.4.6', 'relacionado'),
  // art. 14 — crianças e adolescentes
  p('lgpd:art14', 'A.1.2.4', 'parcial'),
  p('lgpd:art14', 'A.1.2.5', 'relacionado'),
  // arts. 15 e 16 — término e eliminação
  p('lgpd:art15', 'A.1.4.6', 'parcial'),
  p('lgpd:art15', 'A.1.4.8', 'parcial'),
  p('lgpd:art16', 'A.1.4.6', 'parcial'),
  p('lgpd:art16', 'A.1.4.8', 'parcial'),
  p('lgpd:art16', 'A.1.4.9', 'parcial'),
  p('lgpd:art16', 'A.8.10', 'parcial'),
  p('lgpd:art16', 'A.2.4.3', 'parcial'),
  // art. 17 — titularidade
  p('lgpd:art17', 'A.1.3.2', 'relacionado'),
  // art. 18 — direitos do titular
  p('lgpd:art18', 'A.1.3.10', 'parcial'),
  p('lgpd:art18', 'A.1.3.2', 'parcial'),
  p('lgpd:art18', 'A.2.2.6', 'parcial'),
  p('lgpd:art18', 'A.2.3.2', 'parcial'),
  p('lgpd:art18:i', 'A.1.3.7', 'parcial'),
  p('lgpd:art18:ii', 'A.1.3.7', 'parcial'),
  p('lgpd:art18:ii', 'A.1.3.9', 'parcial'),
  p('lgpd:art18:iii', 'A.1.3.7', 'parcial'),
  p('lgpd:art18:iii', 'A.1.3.8', 'parcial'),
  p('lgpd:art18:iii', 'A.1.4.4', 'relacionado'),
  p('lgpd:art18:iv', 'A.1.3.7', 'parcial'),
  p('lgpd:art18:iv', 'A.1.3.8', 'parcial'),
  p('lgpd:art18:iv', 'A.8.11', 'relacionado'),
  p('lgpd:art18:v', 'A.1.3.9', 'parcial'),
  p('lgpd:art18:vi', 'A.1.3.7', 'parcial'),
  p('lgpd:art18:vi', 'A.1.3.8', 'parcial'),
  p('lgpd:art18:vi', 'A.8.10', 'relacionado'),
  p('lgpd:art18:vii', 'A.1.5.5', 'parcial'),
  p('lgpd:art18:vii', 'A.1.3.4', 'parcial'),
  p('lgpd:art18:viii', 'A.1.3.3', 'parcial'),
  p('lgpd:art18:viii', 'A.1.2.4', 'relacionado'),
  p('lgpd:art18:ix', 'A.1.3.5', 'equivalente'),
  // art. 19 — confirmação e acesso nos prazos
  p('lgpd:art19', 'A.1.3.7', 'parcial'),
  p('lgpd:art19', 'A.1.3.9', 'parcial'),
  p('lgpd:art19', 'A.1.3.10', 'parcial'),
  // art. 20 — decisões automatizadas
  p('lgpd:art20', 'A.1.3.11', 'parcial'),
  // art. 33 a 36 — transferência internacional
  p('lgpd:art33', 'A.1.5.2', 'parcial'),
  p('lgpd:art33', 'A.2.5.2', 'parcial'),
  p('lgpd:art33', 'A.5.14', 'relacionado'),
  p('lgpd:art33:i', 'A.1.5.2', 'relacionado'),
  p('lgpd:art33:i', 'A.1.5.3', 'relacionado'),
  p('lgpd:art33:ii', 'A.1.5.2', 'parcial'),
  p('lgpd:art33:ii', 'A.1.2.7', 'relacionado'),
  p('lgpd:art33:viii', 'A.1.5.2', 'relacionado'),
  p('lgpd:art33:viii', 'A.1.2.5', 'relacionado'),
  p('lgpd:art34', 'A.1.5.3', 'relacionado'),
  p('lgpd:art35', 'A.1.5.2', 'parcial'),
  p('lgpd:art35', 'A.1.2.7', 'relacionado'),
  p('lgpd:art35', 'A.5.20', 'relacionado'),
  p('lgpd:art36', 'A.5.5', 'relacionado'),
  // art. 37 — registro das operações
  p('lgpd:art37', 'A.1.2.9', 'equivalente'),
  p('lgpd:art37', 'A.2.2.7', 'parcial'),
  p('lgpd:art37', 'A.1.5.4', 'relacionado'),
  p('lgpd:art37', 'A.1.5.5', 'relacionado'),
  p('lgpd:art37', 'A.5.2', 'relacionado'),
  p('lgpd:art37', 'A.5.3', 'relacionado'),
  // art. 38 — relatório de impacto
  p('lgpd:art38', 'A.1.2.6', 'parcial'),
  p('lgpd:art38', 'A.5.34', 'relacionado'),
  // art. 39 — operador segue instruções
  p('lgpd:art39', 'A.2.2.2', 'parcial'),
  p('lgpd:art39', 'A.2.2.3', 'parcial'),
  p('lgpd:art39', 'A.2.2.5', 'parcial'),
  p('lgpd:art39', 'A.1.2.7', 'parcial'),
  // art. 40 — interoperabilidade, portabilidade e guarda
  p('lgpd:art40', 'A.1.3.9', 'relacionado'),
  p('lgpd:art40', 'A.1.4.8', 'relacionado'),
  // art. 41 — encarregado
  p('lgpd:art41', 'A.5.2', 'parcial'),
  p('lgpd:art41', 'A.5.34', 'relacionado'),
  p('lgpd:art41', 'A.5.5', 'relacionado'),
  // art. 44 — tratamento irregular
  p('lgpd:art44', 'A.5.34', 'relacionado'),
  // arts. 46 e 47 — segurança
  p('lgpd:art46', 'A.5.34', 'parcial'),
  p('lgpd:art46', 'A.5.15', 'parcial'),
  p('lgpd:art46', 'A.8.24', 'parcial'),
  p('lgpd:art46', 'A.1.4.10', 'parcial'),
  p('lgpd:art46', 'A.8.12', 'relacionado'),
  p('lgpd:art46', 'A.8.27', 'relacionado'),
  p('lgpd:art46', 'A.5.1', 'parcial'),
  p('lgpd:art47', 'A.6.6', 'parcial'),
  p('lgpd:art47', 'A.5.34', 'relacionado'),
  p('lgpd:art47', 'A.8.10', 'relacionado'),
  p('lgpd:art47', 'A.1.4.7', 'relacionado'),
  // art. 48 — comunicação de incidente
  p('lgpd:art48', 'A.5.24', 'parcial'),
  p('lgpd:art48', 'A.5.26', 'parcial'),
  p('lgpd:art48', 'A.5.5', 'parcial'),
  p('lgpd:art48', 'A.5.25', 'relacionado'),
  p('lgpd:art48', 'A.6.8', 'relacionado'),
  // art. 49 — sistemas estruturados para segurança e princípios
  p('lgpd:art49', 'A.8.25', 'parcial'),
  p('lgpd:art49', 'A.8.27', 'parcial'),
  p('lgpd:art49', 'A.8.26', 'relacionado'),
  p('lgpd:art49', 'A.1.4.5', 'relacionado'),
  // art. 50 — boas práticas e programa de governança
  p('lgpd:art50', 'A.5.34', 'parcial'),
  p('lgpd:art50', 'A.6.3', 'parcial'),
  p('lgpd:art50', 'A.5.1', 'relacionado'),
  p('lgpd:art50', 'A.5.4', 'relacionado'),
  p('lgpd:art50', 'A.5.35', 'relacionado'),
  p('lgpd:art50', 'A.5.36', 'relacionado'),

  // ─── Res. CD/ANPD 2/2022 — pequeno porte ──────────────────────────────────────────────────────────
  p('anpd:res2-2022:art4', 'A.1.2.6', 'relacionado'),
  p('anpd:res2-2022:art6', 'A.5.31', 'relacionado'),
  p('anpd:res2-2022:art7', 'A.1.3.4', 'parcial'),
  p('anpd:res2-2022:art7', 'A.1.3.10', 'parcial'),
  p('anpd:res2-2022:art9', 'A.1.2.9', 'parcial'),
  p('anpd:res2-2022:art11', 'A.1.3.10', 'parcial'),
  p('anpd:res2-2022:art12', 'A.5.34', 'parcial'),
  p('anpd:res2-2022:art12', 'A.5.15', 'relacionado'),
  p('anpd:res2-2022:art12', 'A.8.24', 'relacionado'),
  p('anpd:res2-2022:art13', 'A.5.1', 'parcial'),
  p('anpd:res2-2022:art15', 'A.1.3.7', 'relacionado'),
  p('anpd:res2-2022:art15', 'A.1.3.9', 'relacionado'),

  // ─── Res. CD/ANPD 15/2024 — incidente de segurança ───────────────────────────────────────────────
  p('anpd:res15-2024:art4', 'A.5.26', 'parcial'),
  p('anpd:res15-2024:art4', 'A.5.5', 'parcial'),
  p('anpd:res15-2024:art5', 'A.5.25', 'parcial'),
  p('anpd:res15-2024:art6', 'A.5.5', 'parcial'),
  p('anpd:res15-2024:art6', 'A.5.24', 'relacionado'),
  p('anpd:res15-2024:art8', 'A.5.28', 'relacionado'),
  p('anpd:res15-2024:art8', 'A.1.2.9', 'relacionado'),
  p('anpd:res15-2024:art8', 'A.1.2.6', 'relacionado'),
  p('anpd:res15-2024:art9', 'A.5.26', 'parcial'),
  p('anpd:res15-2024:art10', 'A.5.33', 'parcial'),
  p('anpd:res15-2024:art10', 'A.5.24', 'relacionado'),
  p('anpd:res15-2024:art10', 'A.5.28', 'relacionado'),

  // ─── Res. CD/ANPD 18/2024 — encarregado ──────────────────────────────────────────────────────────
  p('anpd:res18-2024:art3', 'A.5.2', 'parcial'),
  p('anpd:res18-2024:art4', 'A.5.2', 'relacionado'),
  p('anpd:res18-2024:art7', 'A.5.2', 'relacionado'),
  p('anpd:res18-2024:art8', 'A.1.3.4', 'relacionado'),
  p('anpd:res18-2024:art9', 'A.1.3.4', 'relacionado'),
  p('anpd:res18-2024:art10', 'A.5.4', 'relacionado'),
  p('anpd:res18-2024:art11', 'A.5.31', 'relacionado'),
  p('anpd:res18-2024:art11', 'A.5.36', 'relacionado'),
  p('anpd:res18-2024:art15', 'A.1.3.10', 'relacionado'),
  p('anpd:res18-2024:art15', 'A.6.3', 'relacionado'),
  p('anpd:res18-2024:art16', 'A.5.24', 'relacionado'),
  p('anpd:res18-2024:art16', 'A.1.2.6', 'relacionado'),
  p('anpd:res18-2024:art19', 'A.5.3', 'relacionado'),
  p('anpd:res18-2024:art21', 'A.5.3', 'relacionado'),

  // ─── Res. CD/ANPD 19/2024 — transferência internacional ──────────────────────────────────────────
  p('anpd:res19-2024:art4', 'A.1.5.2', 'parcial'),
  p('anpd:res19-2024:art4', 'A.1.5.3', 'relacionado'),
  p('anpd:res19-2024:art4', 'A.1.5.4', 'relacionado'),
  p('anpd:res19-2024:art9', 'A.1.5.2', 'parcial'),
  p('anpd:res19-2024:art9', 'A.1.4.10', 'relacionado'),
  p('anpd:res19-2024:art16', 'A.1.5.2', 'parcial'),
  p('anpd:res19-2024:art16', 'A.1.2.7', 'relacionado'),
  p('anpd:res19-2024:art16', 'A.2.5.2', 'relacionado'),
  p('anpd:res19-2024:art17', 'A.1.3.4', 'parcial'),
  p('anpd:res19-2024:art21', 'A.1.5.2', 'relacionado'),
  p('anpd:res19-2024:art22', 'A.5.5', 'relacionado'),
  p('anpd:res19-2024:art23', 'A.1.5.2', 'relacionado'),
  p('anpd:res19-2024:art26', 'A.5.34', 'relacionado'),
  p('anpd:res19-2024:art26', 'A.1.5.2', 'relacionado'),
  p('anpd:res19-2024:art28', 'A.5.5', 'relacionado'),
  p('anpd:res19-2024:art32', 'A.1.3.4', 'parcial'),
  p('anpd:res19-2024:art33', 'A.5.5', 'relacionado'),
];
