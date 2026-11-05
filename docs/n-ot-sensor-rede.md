# Sensor de rede no n.ot

## O que é

Um sensor Zeek, ligado numa porta espelhada, observa quem fala com quem na rede de OT. Um script resume os logs num arquivo pequeno (`resumo.json`), e você sobe esse arquivo no n.ot como achados em rascunho. O consultor revisa e aprova, como em qualquer outra coleta.

Isto é **visibilidade e conformidade**: descobrir ativos e comunicações que o inventário ainda não tem. **Não é detecção de ataque** e não gera alerta de intrusão.

## Instalar o Zeek ou o Malcolm

Instale o Zeek (ou o Malcolm, que já traz o Zeek) numa máquina própria para o sensor. Os logs precisam estar em **JSON**; no `local.zeek`, acrescente:

```
@load policy/tuning/json-logs.zeek
```

## Ligar na porta espelhada

Ligue o sensor **só** numa porta SPAN/espelhada do switch, em modo de escuta. Nunca faça varredura ativa (nmap e similares) na rede de campo: o sensor só ouve o que já passa.

## Gerar o resumo

Deixe o Zeek capturar pelo período que quiser (alguns dias mostram mais) e rode:

```bash
python3 scripts/n-ot-resumo-zeek.py <pasta-de-logs> -o resumo.json
```

`<pasta-de-logs>` pode ser a pasta de logs inteira do Zeek (no zeekctl, `logs/`; no Malcolm, a pasta dos logs do Zeek): o script percorre as subpastas e lê todos os arquivos de cada log, inclusive os rotacionados e compactados (`conn.log`, `conn.10:00:00-11:00:00.log.gz` nas pastas por dia). Para um período só, aponte para a pasta daquele dia.

O script usa só a biblioteca padrão do Python. Lê os logs de conexão (`conn*`, obrigatório) e, se existirem, os de modbus, dnp3, dhcp, `known_*` e software. Guarda apenas IP, MAC, portas, protocolo e horários: **nunca payload**. Multicast, broadcast (255.255.255.255), endereço não especificado e loopback ficam de fora.

Limites: 5.000 ativos e 20.000 conexões por resumo, e o arquivo tem de ter **até 5 MB** (o n.ot recusa acima disso). O script grava JSON compacto e, se ainda passar de 4,5 MB, descarta as conexões menos frequentes e avisa quantas saíram.

## Importar no n.ot

Em **Levantamento**, abra uma sessão de **documento** e use **Importar arquivo** com o `resumo.json` (até 5 MB). Só quem vê o inventário completo (Gestor ARCiber ou consultoria designada) pode importar; os demais recebem 403. O arquivo é lido na hora e descartado: não vai para o armazenamento e não passa por IA.

## O que acontece depois

- **Ativos novos** (IP fora do inventário) viram achados com nome gerado, como `SEL (dnp3) #3` (sem o IP). Renomeie na revisão. Só vira ativo novo o IP que iniciou alguma conexão ou tem MAC.
- **Broadcast de sub-rede** (como 192.168.1.255) não é reconhecido sem a máscara; o fluxo para ele fica pendente e nunca vira ativo. Se aparecer como ponta de algum achado, descarte.
- **IP conhecido sem MAC** no inventário gera um achado que completa o MAC quando você aprova.
- **Fluxos** aparecem como `novo` (não está no inventário) ou `confirma`. O sensor não sabe se o tráfego usa VPN, então nunca produz `contradiz`.
- **Fluxos pendentes**: conexão cujo lado interno ainda não está no inventário espera (guardam-se só hashes, nenhum IP) e vira achado de fluxo quando esse ativo for aprovado. Pendência vence em 90 dias.
- Tetos por sessão: 2.000 pendências e 2.000 achados.
- **Subir o mesmo resumo de novo duplica** os achados e as pendências (até os tetos). Descarte os repetidos na revisão.

## Rede interna

Conta como interna a rede privada IPv4, IPv6 ULA e link-local (169.254.0.0/16 e fe80::/10), mais as **Faixas internas com IP público** cadastradas no site. Se a sua rede usa IP público internamente, preencha esse campo antes de importar. Do contrário, esses IPs não viram ativos, a conexão entre um IP privado e um deles vira fluxo **externo**, e a conexão só entre eles é ignorada.

## Limites

- Só vê o que passa pela porta espelhada, e só protocolos que o Zeek analisa (IEC 61850/GOOSE não aparecem sem porta).
- Não indica VPN, não detecta ataque nem desvio.
- O envio é manual; o sensor não manda nada sozinho.
