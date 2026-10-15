# Runbook: migração de um cliente do sistema anterior (DPO as a Service) para o n.360

Checklist operacional, um cliente por vez. Transforma a seção "Migração do legado e desligamento" do plano mestre
(`docs/superpowers/plans/2026-10-14-legado-privacidade.md`) em passos com tela, arquivo e critério numérico. A importação em si está
descrita no `AGENTS.md` (seção "Importacao de programa de privacidade", fatias 1 a 4 e F6).

## Regra de dados pessoais (vale para todos os passos)

- As planilhas exportadas do sistema anterior contêm dados de titulares. **Nunca** entram no repositório, em issue, em PR, em
  comentário, em e-mail aberto ou em documento. Ficam numa pasta controlada do projeto do cliente, com acesso só da equipe que migra.
- Os modelos de CSV de `docs/modelos-importacao/` são **fictícios**. O que se envia ao n.360 é a planilha do cliente ajustada ao
  cabeçalho do modelo, feita fora do repositório.
- O modelo de pedidos do titular **não tem coluna de titular**: não acrescente uma. Nome, e-mail, CPF ou telefone do titular não vão em
  nenhuma coluna de nenhum modelo. Texto livre de risco e de ação passa por `mascararPii` no servidor, mas a primeira defesa é não exportar.
- O relatório de reconciliação e a trilha da importação levam só contagens e motivos genéricos: podem circular no projeto.
- Depois do desligamento, a cópia final do sistema anterior é guardada fora do repositório, com o mesmo controle de acesso.

## Modelos de CSV (caminho sem IA)

Um CSV cujo cabeçalho é **exatamente** o conjunto de colunas de um modelo (qualquer ordem, sem acento nem caixa, separador `;` ou `,`,
com ou sem BOM) entra direto como itens propostos de confiança alta, sem passar pela IA. Cada linha ainda passa pelo esquema estrito e
por uma pessoa antes de gravar. Arquivo com outro cabeçalho segue pelo caminho da IA.

| Modelo | Arquivo de exemplo | Entidade no n.360 | Tela do sistema anterior |
|---|---|---|---|
| tratamentos | `docs/modelos-importacao/tratamentos.csv` | atividade do RoPA, com sistemas, áreas e pessoas | Registro de Atividade, Áreas, Ativos |
| terceiros | `terceiros.csv` | parte organização com tipo, avaliação e DPA | Parceiros e fornecedores |
| riscos | `riscos.csv` | risco da atividade (o prazo vira ação ligada) | Riscos |
| gaps | `gaps.csv` | ação da atividade | Controle de GAPS |
| impacto | `impacto.csv` | teste de impacto (13 perguntas) | Teste de impacto |
| ciclo | `ciclo.csv` | etapa do ciclo de vida | Ciclo de vida da atividade |
| bases | `bases.csv` | bases adicionais e base do GDPR | Bases legais da atividade |
| ripd | `ripd.csv` | RIPD em rascunho, com necessidade, medidas e risco residual | RIPD |
| lia | `lia.csv` | LIA em rascunho, com as quatro seções | LIA |
| pedidos | `pedidos.csv` | pedido do titular (sem titular) | Solicitações |

Convenções: listas separadas por `|`; sim/não; notas de 1 a 5; datas AAAA-MM-DD ou DD/MM/AAAA; opções como no exemplo (acento e caixa
não importam: "Em andamento" vale `em_andamento`). A atividade de riscos, gaps, impacto, ciclo e bases é a **finalidade** exatamente como
no modelo de tratamentos (comparação sem acento, caixa nem pontuação). Responsável é o nome de uma pessoa já cadastrada (vem do modelo de
tratamentos); ativo e sistema são nomes de itens. O que não casar vira aviso, nada é criado sozinho.

Usuários não são importados: crie cada conta pela tela Usuários, com os módulos da pessoa, e mande o convite.

## Roteiro por cliente

### 1. Inventário (no sistema anterior, somente leitura)

- [ ] Contar os registros por entidade e anotar numa planilha controlada: atividades, áreas, ativos, parceiros, riscos, ações (gaps),
      testes de impacto, RIPD, LIA, solicitações, documentos, usuários.
- [ ] Exportar as listas (exportação geral do aplicativo, se existir; senão as exportações para Excel de Gaps, Riscos, RIPD e LIA e a
      leitura das demais telas).
- [ ] Ajustar cada exportação ao cabeçalho do modelo correspondente (fora do repositório). Salvar como CSV.

### 2. Cópia de homologação no n.360

- [ ] n.360 > Conta e acessos > Projetos > **Novo projeto** (assistente), com o n.privacy habilitado e os dados da empresa.
- [ ] n.privacy > Mapear > **Importar programa** > Nova importação. Um lote por cliente e rodada.
- [ ] Enviar primeiro `tratamentos` (e `terceiros`, se houver), Processar, revisar, **Confirmar**. Depois enviar `riscos`, `gaps`,
      `impacto`, `ciclo`, `bases`, `ripd`, `lia` e `pedidos`, Processar, revisar e Confirmar. (No mesmo lote também funciona: a
      confirmação grava tratamentos antes do resto.)
- [ ] Documentos (políticas, avisos, normas): enviar os arquivos originais; a IA propõe título e tipo e uma pessoa revisa.
- [ ] Amostra: para cada entidade, abrir 3 registros no n.360 e comparar campo a campo com o sistema anterior. Anotar o resultado.

### 3. Relatório de reconciliação

- [ ] No lote, botão **Reconciliação** e **Exportar CSV** (`GET /api/v1/projects/:id/importacoes/:lote/reconciliacao/csv`).
- [ ] Preencher a coluna "No legado (preencher)" com a contagem do passo 1.
- [ ] Critérios de aceite, todos obrigatórios:
  - situação "Sem pendência" no relatório (0 pendentes, 0 aceitos sem gravar, 0 recusados sem decisão: recusado se corrige e grava, ou
    se descarta com motivo anotado);
  - para cada entidade, **gravados + descartados como duplicata = contagem no legado**, diferença 0; diferença explicada por escrito
    (ex.: registro duplicado no próprio legado) só com o aceite do responsável do cliente;
  - avisos lidos um a um e resolvidos na tela da atividade (responsável a ligar, ativo a cadastrar, aceite de risco a registrar);
  - amostra do passo 2 sem divergência.
- [ ] Guardar o CSV da reconciliação, com a coluna preenchida, na pasta controlada do cliente.

### 4. Congelamento do sistema anterior

- [ ] Combinar a data com o cliente. A partir dela o sistema anterior fica **somente leitura** (ninguém edita).
- [ ] Exportar de novo o que mudou desde o passo 1 e importar num **lote novo** (o delta). Reimportar é seguro: o que já existe nasce
      descartado como duplicata, e a importação nunca sobrescreve o que está no n.360 (teste de impacto e ciclo só preenchem o que está
      vazio, bases só acrescentam).
- [ ] Reconciliação do lote do delta com os mesmos critérios do passo 3.

### 5. Corte

- [ ] Criar as contas dos usuários do cliente (tela Usuários), com o n.privacy, e enviar os convites.
- [ ] Comunicar o cliente: a partir de agora o trabalho é no n.360. O sistema anterior fica ligado, só leitura, por um período de
      segurança combinado (sugestão: 30 dias).

### 6. Desligamento

- [ ] Aceite formal do cliente (e-mail ou ata) de que o n.360 tem o programa completo.
- [ ] Exportar uma **cópia final** do sistema anterior e guardá-la fora do repositório, na área controlada.
- [ ] Só então desligar o acesso do cliente ao sistema anterior.

### 7. Volta atrás

- Até o passo 6 o sistema anterior está íntegro: se a homologação falhar, cancele os lotes (Cancelar lote apaga arquivos e itens
  propostos; o que já foi gravado fica) e, se preciso, descarte o projeto de homologação e refaça a partir das exportações.
- Depois do passo 6 a cópia final é a fonte: uma nova importação dela segue o mesmo roteiro, a partir do passo 2.

## O que não é importado (e fica para uma pessoa)

- Aceite de risco, conclusão do teste de impacto, conclusão da LIA (prevalece ou não), aprovação de RIPD: atos de uma pessoa no n.360.
- Homologações de fornecedor feitas no sistema anterior: o resultado entra como avaliação do terceiro (modelo de terceiros); o
  questionário respondido não.
- Usuários: criação manual, com convite.
