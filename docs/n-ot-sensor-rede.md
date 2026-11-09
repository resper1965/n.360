# Sensor de rede no n.ot

## O que é

Um sensor Zeek, ligado numa porta espelhada, observa quem fala com quem na rede de OT. Um script resume os logs num arquivo pequeno (`resumo.json`) e o n.ot o recebe como achados em rascunho. O consultor revisa e aprova, como em qualquer outra coleta.

Há dois modos de levar o resumo ao n.ot:

| Modo | Como o resumo chega | Quando usar |
|---|---|---|
| **Manual** | Você gera o `resumo.json` e sobe com **Importar arquivo**, numa sessão de documento | Sem caminho de saída da sonda, ou para um período específico |
| **Automático** | A sonda manda sozinha, uma vez por dia, com uma credencial própria (`ots_…`) | Sonda instalada em campo com saída aprovada |

Os dois usam o mesmo esquema e as mesmas regras de revisão.

Isto é **visibilidade e conformidade**: descobrir ativos e comunicações que o inventário ainda não tem. **Não é detecção de ataque** e não gera alerta de intrusão.

## Modo manual

### Instalar o Zeek ou o Malcolm

Instale o Zeek (ou o Malcolm, que já traz o Zeek) numa máquina própria para o sensor. Os logs precisam estar em **JSON**; no `local.zeek`, acrescente:

```
@load policy/tuning/json-logs.zeek
@load policy/protocols/conn/mac-logging
```

O `mac-logging` faz o MAC aparecer no `conn.log`; sem ele, equipamentos que só respondem (CLPs e UTRs consultados) chegam sem MAC.

### Ligar na porta espelhada

Ligue o sensor **só** numa porta SPAN/espelhada do switch, em modo de escuta. Nunca faça varredura ativa (nmap e similares) na rede de campo: o sensor só ouve o que já passa.

### Gerar o resumo

Deixe o Zeek capturar pelo período que quiser (alguns dias mostram mais) e rode:

```bash
python3 scripts/n-ot-resumo-zeek.py <pasta-de-logs> -o resumo.json
```

`<pasta-de-logs>` pode ser a pasta de logs inteira do Zeek (no zeekctl, `logs/`; no Malcolm, a pasta dos logs do Zeek): o script percorre as subpastas e lê todos os arquivos de cada log, inclusive os rotacionados e compactados (`conn.log`, `conn.10:00:00-11:00:00.log.gz` nas pastas por dia). Para um período só, aponte para a pasta daquele dia.

O script usa só a biblioteca padrão do Python. Lê os logs de conexão (`conn*`, obrigatório) e, se existirem, os de modbus, dnp3, dhcp, `known_*` e software. Guarda apenas IP, MAC, portas, protocolo e horários: **nunca payload**. Multicast, broadcast (255.255.255.255), endereço não especificado e loopback ficam de fora.

Limites: 5.000 ativos e 20.000 conexões por resumo, e o arquivo tem de ter **até 5 MB** (o n.ot recusa acima disso). O script grava JSON compacto e, se ainda passar de 4,5 MB, descarta as conexões menos frequentes e avisa quantas saíram.

### Importar no n.ot

Em **Levantamento**, abra uma sessão de **documento** e use **Importar arquivo** com o `resumo.json` (até 5 MB). Só quem vê o inventário completo (Gestor ARCiber ou consultoria designada) pode importar; os demais recebem 403. O arquivo é lido na hora e descartado: não vai para o armazenamento e não passa por IA.

## Modo automático: a sonda manda sozinha

### Caminho de saída

A sonda sai **pela rede de gestão ou pela DMZ, nunca pela zona de controle**. O caminho (por onde a sonda chega ao n.360 pela internet) é aprovado pelo Gestor ARCiber e anexado como evidência (4.1.2). Sem uma rede de gestão ou DMZ com saída, não instale o modo automático: use o manual.

### Hardware

PC industrial sem ventoinha, 4 núcleos, 8 GB de memória, SSD de 256 GB e **duas placas de rede**: uma de **escuta** (ligada na porta espelhada, sem IP) e uma de **gestão** (com IP, por onde saem o envio e o SSH).

### Cadastrar a sonda e gerar a credencial

1. No n.ot, abra **Acessos e agente** e, na área **Sondas** do site, clique em **Nova sonda**.
2. Informe o **nome** e a **faixa de origem** (obrigatória): o CIDR do IP de saída da rede de gestão do cliente, como ele aparece na internet. Exemplo: `203.0.113.10/32`. Só o Gestor ARCiber ou a consultoria designada cadastram.
3. A credencial (`ots_…`) aparece **uma única vez**, junto com um bloco pronto para o `/etc/n-ot-sonda.conf`. Copie o bloco para um arquivo `n-ot-sonda.conf` e guarde-o até a instalação. Depois disso, só o hash fica no n.360.

A credencial vale **365 dias** (também o máximo). Cada sonda pode ter **até 2 credenciais ativas**, para a troca sem parar: **Gerar nova credencial**, troque o arquivo na sonda e **Revogar credencial** da antiga. Revogar a sonda revoga as credenciais dela; envios e achados já recebidos ficam.

O n.360 só aceita o envio se o IP que chegou, lido **apenas** do cabeçalho `CF-Connecting-IP`, estiver dentro da faixa de origem. Sem faixa, ou fora dela, a resposta é 403.

### Instalar a sonda

O instalador é para **Ubuntu Server 24.04** limpo e roda como root. Copie para a sonda `scripts/instalar-sonda.sh`, `scripts/n-ot-resumo-zeek.py` (têm de ficar na mesma pasta) e o `n-ot-sonda.conf`. Do PowerShell do seu computador (troque `usuario`, `ip-da-sonda`):

```powershell
scp scripts/instalar-sonda.sh scripts/n-ot-resumo-zeek.py n-ot-sonda.conf usuario@ip-da-sonda:~/
```

Na sonda (Linux), descubra os nomes das placas e rode o instalador:

```bash
ip -br link
sudo bash instalar-sonda.sh --escuta <placa-de-escuta> --gestao <placa-de-gestao> --conf n-ot-sonda.conf
```

O formato do arquivo é:

```
url = https://<endereço do n.360>/ot-sensor/resumo
credencial = ots_…
```

A `url` tem de ser **https**; o script só aceita http para `127.0.0.1` e `localhost`. O firewall fixa na instalação a porta de saída da `url`: se a `url` mudar para outra porta, rode o instalador de novo. O arquivo fica em `/etc/n-ot-sonda.conf`, com modo 0600 e dono o usuário dedicado da sonda (`n-ot-sonda`); o script se recusa a ler se outros usuários puderem lê-lo.

O que o instalador faz (repetível: rodar de novo não quebra uma instalação existente):

- instala o **Zeek LTS** (`zeek-lts`) do repositório openSUSE OBS `security:zeek` e os parsers **ICSNPP** (`icsnpp-enip`, `icsnpp-s7comm`, `icsnpp-bacnet`, `icsnpp-opcua-binary`, `icsnpp-profinet-io-cm`) com o `zkg`;
- configura logs em JSON, `mac-logging` e retenção de 30 dias;
- deixa a placa de escuta **sem IP**, com **IPv6 desligado** nela e em modo promíscuo, e põe no `nftables` uma regra que **derruba tudo que sairia por essa placa**;
- fecha o firewall: entrada só por SSH na placa de gestão; saída só para a porta da `url`, DNS, NTP e o `apt`;
- liga o `unattended-upgrades` (segurança);
- cria o usuário dedicado, instala o script em `/usr/local/bin` e liga **dois timers** do systemd: o envio **diário às 02:00 mais até 3 h de atraso aleatório**, e a **fila a cada 5 minutos**.

Pontos de atenção na instalação:

- **O firewall fecha no fim, e depois dele o root não alcança o GitHub.** Os pacotes ICSNPP precisam estar instalados antes disso. Se faltar algum e o firewall já estiver fechado, o instalador para e diz como abri-lo só durante a instalação.
- O `netplan apply` da primeira instalação pode **piscar o SSH** por alguns segundos.
- **Confira que a placa de escuta ficou sem endereço.** Outro arquivo do netplan (como `50-cloud-init.yaml`) pode dar IP a ela; o instalador para com erro nesse caso, mas confira também depois:

```bash
ip -br addr show <placa-de-escuta>
```

- **O `zeek-lts` não se atualiza sozinho, de propósito.** Os plugins ICSNPP são compilados para a ABI do Zeek; uma atualização automática os quebraria em silêncio. Atualizar é **procedimento de janela de manutenção**: atualize o pacote à mão, **reconstrua os pacotes ICSNPP com o `zkg`** e faça o `zeekctl deploy`. Como o firewall bloqueia a saída do root para o GitHub, é preciso abri-lo. **Enquanto a tabela estiver apagada, o firewall da sonda está totalmente aberto**: faça tudo seguido, num bloco só, que fecha o firewall sozinho no fim.

Rode dentro de `tmux` ou `screen` (ou prefixe o comando com `systemd-run --wait --pty`), para uma queda do SSH não matar o bloco no meio. O `trap` reabre as regras ao sair do bloco, por sucesso, falha ou Ctrl-C; se a sessão cair mesmo assim, o shell recebe o sinal de desligamento e o `trap` também roda. Confira depois com `sudo nft list tables`: tem de aparecer `inet n_ot_sonda`.

```bash
sudo bash -c 'trap "nft -f /etc/nftables.conf" EXIT; nft delete table inet n_ot_sonda && apt-get update && apt-get install --only-upgrade -y zeek-lts && env PATH=/opt/zeek/bin:$PATH zkg refresh && env PATH=/opt/zeek/bin:$PATH zkg install --force --skiptests icsnpp-enip icsnpp-s7comm icsnpp-bacnet icsnpp-opcua-binary icsnpp-profinet-io-cm && /opt/zeek/bin/zeekctl deploy'
```

Teste o primeiro envio:

```bash
sudo systemctl start n-ot-sonda-resumo.service
journalctl -u n-ot-sonda-resumo -n 30 --no-pager
```

### O que a sonda envia e quando

- `n-ot-resumo-zeek.py --enviar` gera o resumo das **últimas 24 horas**, põe em `/var/lib/n-ot-sonda/fila/` e envia a fila na ordem. O timer diário roda isso.
- `--enviar --so-fila` não gera nada: só esvazia a fila. É o que o timer de 5 minutos roda, para as esperas terminarem sem esperar o dia seguinte.
- A fila guarda até **7 dias**; o que passa disso vai para `rejeitados/`. Os arquivos recusados pelo n.360 também vão para `rejeitados/`, ao lado de um `.motivo`.
- O script **não segue redirecionamento**: um 3xx para como o 401 e o 403, para a credencial nunca seguir para outro endereço.
- O log vai para o journal do systemd.

### Erros e o que o script faz

| Código | Quando | O que o script faz |
|---|---|---|
| 200 | Aceito, ou já recebido | Remove da fila |
| 400 | Resumo inválido, ou relógio da sonda errado (o motivo vem na resposta) | Move para `rejeitados/` e registra o motivo |
| 401 | Credencial inválida, revogada ou vencida | Para e registra o erro; não reenvia (a fila fica) |
| 403 | n.ot desligado, sem faixa de origem ou IP fora da faixa | Para e registra o erro; não reenvia (a fila fica) |
| 3xx | `url` do arquivo de configuração errada | Para e registra o erro, como o 401 e o 403 |
| 413 | Maior que 5 MB | Move para `rejeitados/` |
| 429 | Teto de 30 envios por dia | Reenvia no dia seguinte |
| 503 | Chaves do n.360 ausentes, ou envio em processamento | Reenvia com espera |
| 5xx e falha de rede | Falha transitória | Reenvia com espera |

A espera é de 1 minuto, depois 5 minutos, 30 minutos e então a cada hora; a espera só é zerada por uma resposta 200, 400 ou 413. Em 401, 403 e 3xx a fila não é apagada: corrija a credencial ou a `url` e ela sai no próximo ciclo.

A resposta de sucesso é sempre só `{ recebido, envio_id }`, igual para aceito e para já recebido. Ela **nunca** traz contagens nem diz o que é novo: a sonda é uma máquina dentro da subestação e a contagem seria um oráculo do inventário.

### O que vira achado

Cada envio com novidade cria uma **sessão de documento já encerrada**, "Sonda <nome> · dd/mm a dd/mm", com os achados em rascunho. Só entra o que é novidade: o item é pulado se já há, no projeto, um achado em rascunho ou uma pendência com a mesma chave, ou um achado **descartado há menos de 90 dias**. A chave inclui o site, porque subestações reutilizam as mesmas faixas privadas. Sem novidade, não nasce sessão.

Os achados descartados que vieram da sonda ficam **90 dias** (para não voltarem); os demais, 30. Rascunhos de sessão encerrada da sonda **expiram em 30 dias** e, se ainda não revisados, voltam no próximo envio.

### Saúde da coleta

A situação de cada sonda é calculada pelo último envio concluído:

| Situação | Quando |
|---|---|
| **Em dia** | Até 26 horas |
| **Atrasada** | De 26 a 72 horas |
| **Parada** | Mais de 72 horas, ou sem credencial ativa válida |
| **Vencendo** | Credencial ativa que vence em até 30 dias |

Na tela:

- **Acessos e agente > Sondas** lista nome, situação, último envio, perda de captura e validade, e tem **Nova sonda**, **Gerar nova credencial**, **Revogar credencial** e **Revogar sonda**.
- No topo da aba **Levantamento**, o cartão **Saúde da coleta** mostra quantas sondas estão em dia e há quanto tempo veio o último resumo, e o cartão **Pontos a esclarecer** conta os rascunhos com o selo "Sensor de rede", separados em ativos e fluxos.
- Perda de captura acima de 5% aparece como aviso.

Todo dia, no mesmo cron dos avisos (08:00 em São Paulo), o n.360 registra na trilha as sondas atrasadas e **envia um e-mail ao Gestor ARCiber para cada sonda parada**, com o nome da sonda e do site e nenhum dado de rede.

### ICSNPP: o que acrescenta

Sem o ICSNPP, o Zeek identifica Modbus, DNP3 e pouco mais de protocolo industrial. Os pacotes acrescentam a análise de **EtherNet/IP e CIP, S7comm, BACnet, OPC UA binário e Profinet**. O script reconhece os nomes de serviço que eles gravam no `conn.log` (`cip` vira `enip`, `opcua-binary` vira `opcua`, `s7comm-plus` vira `s7comm`, `spicy_profinet_io_cm` vira `profinet`). Modelo e firmware lidos desses logs ainda **não** entram no resumo.

## Importar ou receber: o que acontece depois

- **Ativos novos** (IP fora do inventário) viram achados com nome gerado, como `SEL (dnp3) #3` (sem o IP). Renomeie na revisão. Vira ativo novo o IP que **iniciou** alguma conexão, **tem MAC**, ou **recebeu TCP ou um protocolo conhecido** (um CLP ou UTR que só responde). Quem só recebeu UDP sem protocolo identificado não vira: é o caso do broadcast de sub-rede.
- **Broadcast de sub-rede** (como 192.168.1.255) não é reconhecido sem a máscara; o fluxo para ele fica pendente e nunca vira ativo. Se aparecer como ponta de algum achado, descarte.
- **IP conhecido sem MAC** no inventário gera um achado que completa o MAC quando você aprova.
- **Fluxos** aparecem como `novo` (as pontas não têm fluxo no inventário) ou `confirma` (têm, com outro protocolo ou porta; com os mesmos, o fluxo não vira achado). O sensor não sabe se o tráfego usa VPN, então nunca produz `contradiz`.
- **Fluxos pendentes**: conexão cujo lado interno ainda não está no inventário espera (guardam-se só hashes, nenhum IP) e vira achado de fluxo quando esse ativo for aprovado. Pendência vence em 90 dias.
- Tetos por sessão: 2.000 pendências e 2.000 achados.
- **Subir o mesmo resumo de novo não duplica**: no modo manual e no automático, o filtro de novidade pula o que já está em rascunho, foi descartado há menos de 90 dias ou está pendente (a resposta conta esses itens em `repetidos`). Fluxo que já está no inventário (mesmas pontas, protocolo e porta) também não vira achado (`fluxos_conhecidos`).

## Desvios

Desvio é o que a sonda viu e o inventário aprovado não prevê. Serve para o consultor e o SOC saberem do tráfego fora do inventário sem esperar a revisão dos achados.

### O que vira desvio

- Só o **envio automático** da sonda. A importação manual não cria desvio.
- Em todo envio aceito, o n.ot compara o resumo com o inventário **antes do filtro de novidade**: um item que já é achado em rascunho ou foi descartado continua sendo desvio. Desvio não é novidade.
- Vira desvio o **ativo** novo e o **fluxo** que o inventário não tem, inclusive o fluxo pendente (cuja ponta interna ainda não foi aprovada). Cada desvio é único por projeto, tipo e chave; ver de novo só conta ocorrências.

### Ciclo de vida

| Situação | Como chega | O que acontece depois |
|---|---|---|
| **Aberto** | A sonda viu e o inventário não tem | Ver de novo soma ocorrências |
| **Tratado** | Alguém registra uma **nota** (obrigatória) | Se o sensor vir de novo, **reabre e avisa** |
| **Aceito** | Só o **Gestor ARCiber**, com justificativa e prazo de **até 90 dias** | Ver de novo no prazo só conta. Se reaparecer vencido, ou no cron diário, volta a aberto como `aceite_vencido` e avisa |
| **Regularizado** | Automático, quando um lote **aprova** o item que veio de um achado do sensor | Se o item voltar a aparecer, reabre |

**Limite conhecido:** se o item entrar no inventário por outro caminho (cadastro à mão, outra importação), o desvio fica aberto até alguém marcá-lo como tratado.

**"Aceito" não é a exceção formal 5.1.1.** É um adiamento com prazo e justificativa dentro do n.ot; a exceção do requisito segue o seu processo próprio.

Na aba **Desvios** (n.ot) há filtros por situação, site e tipo, e as ações Tratar e Aceitar temporariamente. O cartão **Pontos a esclarecer**, no topo do Levantamento, mostra "N desvios abertos". O IP de um desvio de ativo só aparece a quem vê o inventário completo, e cada visualização é registrada na trilha.

### Webhook `ot.desvio`

Para avisar o SOC, cadastre um webhook do projeto com o evento `ot.desvio` na lista de eventos.

- Só recebe webhook cuja lista contém **exatamente** `ot.desvio`. Não há curinga.
- **Cadastrar exige ver o inventário completo**, porque o corpo traz nome de ativo e zona.
- O POST é assinado com HMAC em `X-nISO-Signature`. São até **3 tentativas** (agora, +2 s, +10 s), com **5 s** de tempo limite cada; o `event_id` é o mesmo nas tentativas, para o receptor deduplicar. **Redirecionamento não é seguido** (3xx conta como falha). Esgotar as tentativas soma o `failure_count` do webhook.
- **Quando sai:** um POST por resumo aceito que abre ou reabre itens, e um por fechamento ou reabertura feito na tela ou pelo cron.
- O corpo **não traz IP, MAC nem hash de IP**: as pontas vão como nome do ativo e da zona (`null` se a ponta não está no inventário). Até **200 itens** por POST; o excedente vem em `nao_listados`.

```json
{
  "evento": "ot.desvio",
  "projeto_id": "prj_123",
  "site": { "id": "site_1", "nome": "Subestação Norte" },
  "desvios": [
    {
      "id": "des_9f2", "acao": "aberto", "situacao": "aberto", "tipo": "fluxo",
      "protocolo": "modbus", "porta": 502, "externo": false,
      "origem": { "ativo": "Estação de engenharia 1", "zona": "Supervisão" },
      "destino": { "ativo": null, "zona": null },
      "primeira_vez": "2026-11-09T11:00:00.000Z", "ultima_vez": "2026-11-09T11:00:00.000Z", "ocorrencias": 1,
      "link": "https://…/ot/desvios/des_9f2"
    }
  ],
  "nao_listados": 0,
  "event": "ot.desvio", "event_id": "…", "project_id": "prj_123", "timestamp": "2026-11-09T11:00:03.000Z"
}
```

`acao` é `aberto`, `reaberto`, `aceite_vencido` ou `fechado` (tratado, aceito ou regularizado).

**Recomendação:** ligue o webhook **só depois de aprovar o inventário inicial**. No primeiro dia a sonda vê tudo como novo e o aviso seria só ruído.

## Rede interna

Conta como interna a rede privada IPv4, IPv6 ULA e link-local (169.254.0.0/16 e fe80::/10), mais as **Faixas internas com IP público** cadastradas no site. Se a sua rede usa IP público internamente, preencha esse campo antes de importar. Do contrário, esses IPs não viram ativos, a conexão entre um IP privado e um deles vira fluxo **externo**, e a conexão só entre eles é ignorada.

## Limites

- Só vê o que passa pela porta espelhada, e só protocolos que o Zeek analisa (IEC 61850/GOOSE não aparecem sem porta).
- Não indica VPN nem detecta ataque. O que chama de desvio é só o que o sensor viu e o inventário aprovado não tem (veja "Desvios").
- No modo manual, o sensor não manda nada sozinho. No automático, depende do caminho de saída aprovado; sem ele, a sonda não envia.
- A sonda não faz varredura e não recebe ordens do n.360: só escuta e manda o resumo.
