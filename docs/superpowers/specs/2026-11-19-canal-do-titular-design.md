# Canal do titular no n.privacy

Data: 19/11/2026. Situação: **aprovada em 19/11/2026; PR1 a PR3 construídos (#597, #599, #600; migration 0117); PR4 a executar** (plano `2026-11-20-lote3-e-canal-pr4.md`). Base: leitura somente
de uma cópia de trabalho sobre `origin/main` `c0badf9` + um commit de docs; nada foi executado (sem vitest, tsc ou npm). Toda afirmação sobre o código
traz arquivo:linha.

## O pedido

A etapa 1 da trilha do n.privacy chama-se "Encarregado e canal do titular" na skill (`agent-skills/implantacao-privacy/SKILL.md:21,38`), mas
só confere o encarregado: o critério é `v.encarregados.length > 0` (`src/services/programa.ts:79`), o catálogo da trilha nem cita o canal
(`src/data/programa.ts:27,37`) e não existe campo de canal em lugar nenhum. A onda 4 registrou isso como limite (`2026-11-18-onda4-jornada-comum-design.md:93`).
O dono quer o canal do titular como coisa de primeira classe: registrado, visível, conferível e contado na trilha.

## O que existe hoje

- **Pedido do titular** (migration `0058`, `migrations/0058_titular_incidente_consentimento.sql`): `titular_pedidos` com `tipo` (os 9 do art. 18),
  `canal` por pedido em lista fechada `email | telefone | formulario | presencial | outro` (`src/services/titular-pedidos.ts:11`) e status
  `recebido → em_andamento → respondido | negado → arquivado` (`:12`, regras em `:123-150`). Identidade e ponto focal (`0104`), código de
  acompanhamento (`0105`). O `canal` do pedido diz por onde **um** pedido chegou; não diz qual canal a empresa oferece.
- **Prazos:** parâmetro global, sem valor no código (`src/services/parametros-legais.ts:9-13`, as 3 `CHAVES`); `titular.resposta` é congelado no
  pedido (`titular-pedidos.ts:62`). Só o `platform_admin` edita (`src/routes/titular.ts:40-55`; agente fora, `src/middleware/agente.ts:120`).
- **Portal público** (migration `0096`): um link por projeto em `titular_portais`, **só o SHA-256 do token**; o link sai uma vez
  (`titular-pedidos.ts:154-163`; `routes/titular.ts:175-181`, URL `/solicitacao#<token>`). Gerar e desativar: equipe ou `org_admin`, nunca chave
  nem agente (`podeGerirPortal`, `routes/titular.ts:168`). Recepção sem sessão, token no corpo, limite por IP e por projeto, cria pedido
  `canal='formulario'` (`src/routes/public-titular.ts:31-57`). A página `/solicitacao` (`frontend/public/solicitacao.html`) não mostra o nome do
  controlador nem o encarregado. Na tela, botão "Link do portal" em Solicitações (`frontend/src/views/titular.js:94-96,354-397`).
- **Encarregado:** vínculo `parte_vinculos.papel='encarregado'`, `alvo_tipo='projeto'` com parte ativa (`src/services/encarregado.ts:48-50`); a
  pessoa tem só `nome` e `email` (`migrations/0047_nucleo_partes_modulos.sql:37-47`; sem telefone). O DPO da Governança vira o encarregado
  (`src/services/encarregado-pessoa.ts:2-4,35-42`); o assistente de projeto pede nome e e-mail do DPO em "Pessoas-chave"
  (`frontend/src/views/empresa.js:322-340`; `src/services/empresas.ts:120-124`). Indicar na tela: só equipe (`frontend/src/views/encarregado.js:12`).
- **Painel e trilha:** prioridade alta "Nenhum encarregado indicado (LGPD, art. 41)" (`encarregado.ts:152`); lista "Indicar o encarregado" do
  painel de quem começa (`src/services/painel.ts:283`); trilha de 7 passos derivada (`programa.ts:75-101`). O rótulo de cada passo tem de ser
  igual ao da tabela da skill (`test/agente-skills.test.ts:138`).
- **Trilha do n.iso** (faixa `iso`, texto livre): `p5_3` pergunta onde a identidade e o contato do encarregado estão divulgados
  (`src/data/passos/etapa-1.ts:496-520`); `p23_1` pergunta o canal e se está publicado (`src/data/passos/etapa-4.ts:202-219`). Projeto só com
  n.privacy não as tem.
- **Catálogo legal no repositório** (títulos em palavras próprias, não texto legal): LGPD art. 18 e incisos, 19 e 41 (`src/data/lgpd.ts:64-74,96`);
  Res. CD/ANPD 18/2024 art. 8 "Divulgar e manter atualizadas a identidade e o contato do encarregado", art. 9 "Publicar ... em destaque no
  sítio eletrônico", art. 15 (reclamações dos titulares) (`src/data/anpd.ts:78-79,83`); Res. CD/ANPD 2/2022 art. 11 "Sem encarregado indicado,
  manter canal de comunicação com o titular" (`anpd.ts:58`). Fonte declarada: DOU consultado em 10/10/2026 (`anpd.ts:4-12,38`).
- **Quem age:** equipe e `org_admin` registram e respondem; `org_user` e `client` só leem (`AGENTS.md:544-549`). Na direta, o
  `consultoria_admin` conta como equipe (`src/helpers.ts:560,579-582`). Responder, negar, arquivar, prazo e eliminação são atos do cliente,
  recusados ao agente (`routes/titular.ts:80-83`; `agente.ts:113,126-127`; `AGENTS.md:783-784`).

### O que a lei pede (o que sei e o que não conferi)

- LGPD art. 41, §1º: identidade e informações de contato do encarregado divulgadas publicamente, de forma clara e objetiva, de preferência no
  sítio eletrônico do controlador (minha leitura; o título do catálogo `lgpd.ts:96` diz o mesmo em resumo). **Texto não conferido nesta spec.**
- LGPD art. 18: os direitos são exercidos por requerimento do titular ao agente de tratamento (§3º, minha leitura, **não conferido**). Art. 19:
  prazos de confirmação e acesso. O app **não** guarda número de prazo; segue assim (parâmetro com fonte).
- Res. CD/ANPD 18/2024: arts. 8 e 9 como no catálogo acima. Se a resolução exige conteúdo mínimo do contato (por exemplo, um meio que permita
  exercer os direitos): **não conferido**.
- Res. CD/ANPD 2/2022, art. 11: o agente de pequeno porte dispensado de encarregado mantém um canal. É o caso em que **canal e encarregado se
  separam**; o app não tem o atributo "pequeno porte" (`empresas.porte` é texto livre, `migrations/0071_empresas.sql:13`).

Conclusão: o que dá para conferir é **(a) um meio de contato oferecido** e **(b) a página pública onde ele e o encarregado aparecem**. O
endereço é dado de contato da empresa (ou do encarregado, cuja divulgação a lei exige), não dado pessoal do titular.

## Não regridem (travados por teste)

- **P0 do n.ot:** nada aqui lê, grava ou referencia `ot_*`; a tabela nova não começa com `ot_` e não guarda nada de OT.
- **Atos do cliente:** responder, negar, arquivar, prazo e eliminação seguem recusados ao agente (`agente.ts:113,126`; `routes/titular.ts:80-83`).
- **Portal:** o banco continua sem o token; nenhum campo novo aceita o link `/solicitacao#...` (o token é credencial de portador).
- **Nenhum PII de titular** no registro do canal; o pedido continua sendo o único lugar com nome e contato do titular.
- Os três números do cliente (`test/onda2-numeros.test.ts`, que não se edita) e o desempenho do painel (`test/painel.test.ts`).
- Rota nova classificada em `src/modulos.ts` (`test/modulos-produto.test.ts`), coberta por `contrato-isolamento-org` e `contrato-tela-api`;
  nenhuma rota some; o MCP não perde nada.

## Decisões do dono (a responder; recomendação minha em cada uma)

| # | Tema | Recomendação minha | Alternativa e custo |
|---|---|---|---|
| 1 | Modelo | **Registro próprio, uma linha por projeto** (`titular_canal`, migration `0117`, aditiva). | Derivar de dados existentes: o e-mail do encarregado e o portal ativo dizem que há um meio, mas não **onde está divulgado**; `p5_3`/`p23_1` são texto livre e só existem com n.iso. Várias linhas por projeto (um canal por linha): só se houver cliente com vários canais por marca ou unidade. |
| 2 | O passo 1 da trilha | **Mesmo passo, rótulo "Encarregado e canal", critério `encarregado_e_canal`**: encarregado indicado **e** ao menos um meio **e** página de divulgação. A conferência fica fora do critério (decisão 2 da onda 4: sem marca manual). | Passo novo (8 passos): muda a contagem "x de 7" de todos os projetos e a tabela da skill. |
| 3 | Painel ("O que fazer") | **Alta, "Exigido":** "Canal do titular não registrado" quando não há meio. **Média, "Planejar":** "Canal sem página de divulgação ou nunca conferido". Sem periodicidade de reconferência agora. | Só média: menos ruído no dia do deploy, mas trata o canal abaixo do encarregado, que a lei põe junto. |
| 4 | Quem grava | **A mesma regra do portal** (`podeGerirPortal`: equipe, `org_admin` e o admin da direta). `org_user` e `client` leem. **Agente e chave de API só leem** (`PUT` em `FORA_DO_AGENTE`). | Deixar o agente registrar: ele já registra pedido, mas "conferido em" é afirmação de uma pessoa sobre o site do cliente. |
| 5 | Portal do n.360 conta como meio? | **Sim**: portal ativo conta como meio `formulario`; a página de divulgação continua exigida. O link do portal **nunca** é gravado. | Exigir que o cliente cadastre a página do formulário mesmo com o portal: duplica o que o portal já prova. |
| 6 | Pequeno porte sem encarregado (Res. 2/2022, art. 11) | **Fora agora**: o critério exige o encarregado; fica registrado como limite (sem marca manual). | Novo atributo "pequeno porte" no projeto: decisão de produto maior, com efeito em outros requisitos. |
| 7 | Onboarding | **Campo opcional "E-mail do canal do titular"** em "Pessoas-chave" do assistente, gravado pela mesma criação de projeto (sem chamada nova). | Não mexer no assistente; o canal se cadastra em Solicitações. |
| 8 | Página pública `/solicitacao` | **Não mostrar** encarregado nem canal nela agora; a divulgação exigida é no site do controlador. | Mostrar o contato do encarregado no portal: ajuda o titular, mas é dado do cliente numa página da ness. |

## Modelo (com as recomendações 1, 4 e 5)

Migration `0117_titular_canal.sql`, aditiva e repetível:

```sql
CREATE TABLE IF NOT EXISTS titular_canal (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    email TEXT CHECK (email IS NULL OR length(email) <= 200),
    telefone TEXT CHECK (telefone IS NULL OR length(telefone) <= 40),
    formulario_url TEXT CHECK (formulario_url IS NULL OR length(formulario_url) <= 500),
    divulgacao_url TEXT CHECK (divulgacao_url IS NULL OR length(divulgacao_url) <= 500),
    responsavel_parte_id TEXT REFERENCES partes(id) ON DELETE SET NULL,
    conferido_em TEXT, conferido_por TEXT,
    atualizado_por TEXT, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- Sem `ativo` nem `tipo`: o meio existe quando o campo está preenchido; tirar o canal é limpar o campo. Os nomes casam com `CANAIS_PEDIDO`.
- **Validação no servidor** (`src/schemas`, zod): e-mail válido; URLs `https://`; **recusa** URL do host do app (`appUrl`) e qualquer
  `/solicitacao#` (o token do portal não entra no banco nem na exportação); `responsavel_parte_id` do mesmo projeto (o padrão de
  `parteDoProjeto`, `titular-pedidos.ts:52-53`). "Conferido" é `conferir: true` no corpo; o servidor carimba o dia e quem conferiu (como a
  identidade, migration `0104`). O servidor não busca a URL (sem acesso do Worker ao site do cliente).
- **Serviço** `src/services/titular-canal.ts`: `lerCanal`, `salvarCanal` (upsert, trilha `titular.canal` só com os **nomes** dos campos
  mudados) e `resumoDoCanal(db, projectId)` → `{ meios: ('email'|'telefone'|'formulario')[], portal_ativo, divulgado, conferido_em }`
  (lê `titular_portais.ativo`).
- **Rotas** em `src/routes/titular.ts`: `titularCanalApp` `GET /` e `PUT /`, montado em `/api/v1/projects/:projectId/titular-canal`
  (`src/index.ts`, ao lado da linha 514); faixa `'titular-canal': 'privacy'` em `src/modulos.ts:41`. `PUT` com `podeGerirPortal`
  (exportado e reutilizado) e entrada em `FORA_DO_AGENTE`.
- **Visão do encarregado** (`src/services/encarregado.ts`): campo `canal` = `resumoDoCanal` (uma consulta a mais no `Promise.all` da linha 45)
  e as duas prioridades da decisão 3, tela `titular`, aba `pedidos`.
- **Trilha** (`src/data/programa.ts:27,37`; `src/services/programa.ts:79`): chave `encarregado_e_canal` no lugar de `encarregado` =
  `encarregados.length > 0 && (meios.length > 0 || portal_ativo) && divulgado`; rótulo "Encarregado e canal", ação "Registrar o canal".
- **Portabilidade:** entra sozinha (tabela com `project_id`, `src/portabilidade.ts:175-188`); não há segredo a tirar.
- **Mesclar partes:** `titular_canal.responsavel_parte_id` entra em `TROCAR.partes` (`src/services/mesclar.ts:19-32`).
- **Isolamento:** a chave primária é o projeto e toda leitura filtra por ele; a rota fica sob `projectAccessMiddleware`.

## Entrega: três PRs pequenos e independentes, o de menor risco primeiro

1. **Modelo e API (migration sim: `0117`).** Tabela, serviço, `GET/PUT /titular-canal`, faixa, `FORA_DO_AGENTE`, validação, mesclar,
   `docs/openapi.json` e `mcp-server-niso/src/contrato-gerado.ts` regenerados (`npm run openapi`, `package.json:14`). Nada muda na tela nem
   na trilha. A `0117` segue `migrations/README.md` (backup, aplicar em produção, conferir com `PRAGMA table_info(titular_canal)`, só então merge).
2. **Tela (migration não).** Botão "Canal do titular" ao lado de "Link do portal" (`frontend/src/views/titular.js:94-96`): formulário com
   e-mail, telefone, página do formulário, página de divulgação, responsável e "Conferi a página hoje"; dica para usar caixa institucional.
   Só quem pode gravar vê o botão de salvar; os outros leem. O Painel do n.privacy mostra "Canal: registrado/não registrado" no bloco do
   encarregado e invalida o painel guardado ao salvar (o padrão de `encarregado.js:74`).
3. **Trilha, painel e agente (migration não).** `canal` na visão do encarregado, as duas prioridades, critério e rótulo novos, tabela e texto
   da skill `implantacao-privacy` (etapa 1: "lê o canal em `niso_privacy_encarregado`; registrar é pela interface"), `src/mcp/skills-gerado.ts`
   (`npm run skills:gerar`, `package.json:15`) e a descrição de `niso_privacy_encarregado` (`mcp-server-niso/src/ferramentas.ts:485-487`).
4. **Opcional, onboarding (migration não), se a decisão 7 for sim.** Campo em `frontend/src/views/empresa.js:322-340`, gravado em
   `src/services/empresas.ts` junto do DPO. Sem chamada nova (`test/onboarding-rotas.test.ts`).

## Testes

- PR1: `GET` para equipe, `org_admin`, `org_user` e `client`; `PUT` recusado a `org_user`, `client`, chave de API e agente (403); outro projeto
  não lê nem grava; URL do app ou com `/solicitacao#` recusada (422); parte de outro projeto recusada; conferência carimbada pelo servidor;
  trilha sem o endereço; a portabilidade leva a linha; mesclar troca o responsável; `modulos-produto`, `contrato-isolamento-org`, `contrato-mcp`.
- PR2: `contrato-tela-api` (caminho novo casa com rota); teste de frontend do formulário (só quem grava vê "Salvar"; texto escapado).
- PR3: `criterioPrivacy('encarregado_e_canal')` nos quatro casos (sem encarregado; sem meio; meio sem divulgação; tudo) e com só o portal ativo;
  prioridades alta e média; `test/agente-skills.test.ts` com o rótulo novo; `test/programa.test.ts` e `programa-rota.test.ts`; agente lê o
  `canal` em `niso_privacy_encarregado`; `onda2-numeros` e `painel.test.ts` intocados.

## Riscos

- **Mudança visível no dia do PR3:** todo projeto com encarregado e sem canal perde o passo 1 e ganha uma prioridade alta. É o efeito
  desejado, mas convém avisar consultores antes (nota no CHANGELOG).
- **Link do portal no campo errado:** a pessoa tende a colar o link do portal como "página do formulário"; a recusa no servidor existe para
  isso (senão o token iria para quem lê, para o agente e para a exportação).
- **E-mail pessoal do encarregado como canal:** é dado pessoal do encarregado (não do titular), divulgado por exigência legal; sai na
  exportação e o agente lê. A tela recomenda caixa institucional.
- **"Conferido" é declaração de uma pessoa**, não prova; o app não visita o site. A prova continua sendo evidência ligada aos requisitos
  (art. 41; Res. 18/2024, arts. 8 e 9).

## Fora de escopo

Busca automática da página do cliente; vários canais por projeto; ligar `titular_pedidos.canal` ao registro do canal; atributo "pequeno
porte"; canal e encarregado na página `/solicitacao`, no Word do RIPD (`documento-word.ts:50`) e no relatório da atividade; periodicidade de
reconferência; item novo na lista de quem começa (`painel.ts:283`). Achado lateral: `titular_portais.token_hash` e
`titular_pedidos.acompanhamento_hash` saem na portabilidade (não estão em `SEGREDOS_DE_INTEGRACAO`, `portabilidade.ts:45-51`); são hash de
segredo aleatório, risco baixo, à parte.

## Não conferido

Texto oficial da LGPD (arts. 18, §3º; 19; 41, §§1º e 2º) e das Res. CD/ANPD 18/2024 e 2/2022: usei os títulos do catálogo do repositório e
a minha leitura, sem abrir o DOU nem o Planalto nesta spec. Quantos projetos em produção têm encarregado, portal ativo ou respostas em
`p5_3`/`p23_1`. Onde as respostas dos passos `p5_3`/`p23_1` ficam gravadas (não li). O que `npm run openapi` e `npm run skills:gerar` mudam
(não rodei). Nenhum teste foi executado.

## Rulings da execução

- `titular_canal` ganhou `id TEXT PRIMARY KEY` e `project_id ... UNIQUE` no lugar de `project_id` como chave: as varreduras de isolamento (`test/contrato-isolamento-org.test.ts`, `-topo`) pulam tabela sem `id`.
- `podeGerirPortal` não foi exportado: `titularCanalApp` mora no mesmo arquivo.
- Responsável de outro projeto: 400 (o mesmo de `titular_pedidos`); URL do app ou `/solicitacao`: 422 em qualquer host.
- Trocar a página de divulgação apaga a conferência anterior; conferir sem página é 422.
- O indicador "Canal do titular" do Painel saiu do PR2 para o PR3 (o dado `canal_titular` só existe com a visão do PR3).
- O passo 1 leva a Solicitações (`tela: 'titular'`) com "Registrar o canal"; o id do passo continua `encarregado`.
- A `0117` só vai a produção antes do código que a lê (deploy.yml recusa migration pendente); `resumoDoCanal` tolera a tabela ausente.
- (Preencha na execução: o que `npm run openapi` mudou; a mediana do desempenho do painel depois do PR3.)
