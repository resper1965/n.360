#!/usr/bin/env bash
# Instala a sonda do n.ot num Ubuntu 24.04 limpo: Zeek LTS + ICSNPP, placa de escuta sem IP,
# firewall nftables, unattended-upgrades, configuracao e timers de envio.
# Uso: sudo ./instalar-sonda.sh --escuta <placa> --gestao <placa> --conf <arquivo.conf>
# Repetivel: rodar de novo nao quebra uma instalacao existente. Nao pergunta nada.
set -euo pipefail

ZEEK=/opt/zeek
REPO_ZEEK=https://download.opensuse.org/repositories/security:/zeek/xUbuntu_24.04/
CHAVE_ZEEK=/etc/apt/keyrings/zeek.gpg
ICSNPP=(icsnpp-enip icsnpp-s7comm icsnpp-bacnet icsnpp-opcua-binary icsnpp-profinet-io-cm)
USUARIO=n-ot-sonda
CONF=/etc/n-ot-sonda.conf
ESTADO=/var/lib/n-ot-sonda
SCRIPT=/usr/local/bin/n-ot-resumo-zeek.py
NETPLAN=/etc/netplan/90-n-ot-escuta.yaml

falha() { echo "instalar-sonda: $*" >&2; exit 1; }
passo() { echo "==> $*"; }

netplan_escuta() {  # placa de escuta sem nenhum endereco
	cat <<EOF
network:
  version: 2
  ethernets:
    $1:
      dhcp4: false
      dhcp6: false
      accept-ra: false
      link-local: []
      optional: true
EOF
}

conjunto() {  # conjunto <nome> <tipo> <ips...>: set do nftables, sem elements quando vazio
	local nome=$1 tipo=$2 elementos=""
	shift 2
	(($#)) && elementos=" elements = { $(IFS=,; echo "$*") };"
	echo "	set $nome { type $tipo;$elementos }"
}

regras_nft() {  # regras_nft <gestao> <uid _apt> <uid sonda> <porta n.360> <ips do n.360...>
	local gestao=$1 uid_apt=$2 uid_sonda=$3 porta=$4 ip v4=() v6=()
	shift 4
	for ip in "$@"; do
		if [[ $ip == *:* ]]; then v6+=("$ip"); else v4+=("$ip"); fi
	done
	echo "flush ruleset"
	echo "table inet n_ot_sonda {"
	conjunto n360 ipv4_addr "${v4[@]}"
	conjunto n360_6 ipv6_addr "${v6[@]}"
	cat <<EOF
	chain entrada {
		type filter hook input priority filter; policy drop;
		iif "lo" accept
		ct state established,related accept
		meta l4proto { icmp, ipv6-icmp } accept
		iifname "$gestao" udp sport 67 udp dport 68 accept
		iifname "$gestao" tcp dport 22 accept
	}
	chain encaminhar {
		type filter hook forward priority filter; policy drop;
	}
	chain saida {
		type filter hook output priority filter; policy drop;
		oif "lo" accept
		ct state established,related accept
		meta l4proto { icmp, ipv6-icmp } accept
		udp dport { 67, 123 } accept
		meta l4proto { tcp, udp } th dport 53 accept
		meta skuid $uid_sonda ip daddr @n360 tcp dport $porta accept
		meta skuid $uid_sonda ip6 daddr @n360_6 tcp dport $porta accept
		meta skuid $uid_apt tcp dport { 80, 443 } accept
	}
}
EOF
}

unidade() {  # texto da unidade systemd pelo nome
	local executar="/usr/bin/python3 $SCRIPT $ZEEK/logs --enviar"
	case $1 in
	n-ot-sonda-resumo.service) cat <<EOF
[Unit]
Description=n.ot: gera o resumo das ultimas 24 h e envia
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=$USUARIO
Group=$USUARIO
ExecStart=/usr/bin/flock $ESTADO/.trava $executar --conf $CONF --estado $ESTADO --ultimas-horas 24
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=$ESTADO
EOF
	;;
	n-ot-sonda-fila.service) cat <<EOF
[Unit]
Description=n.ot: envia o que ficou na fila da sonda
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=$USUARIO
Group=$USUARIO
ExecStart=/usr/bin/flock -n -E 0 $ESTADO/.trava $executar --so-fila --conf $CONF --estado $ESTADO
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=$ESTADO
EOF
	;;
	n-ot-sonda-resumo.timer) cat <<EOF
[Unit]
Description=n.ot: resumo diario da sonda, de madrugada

[Timer]
OnCalendar=*-*-* 02:00
RandomizedDelaySec=3h
Persistent=true

[Install]
WantedBy=timers.target
EOF
	;;
	n-ot-sonda-fila.timer) cat <<EOF
[Unit]
Description=n.ot: tenta a fila da sonda a cada 5 minutos

[Timer]
OnCalendar=*:0/5

[Install]
WantedBy=timers.target
EOF
	;;
	*) falha "unidade desconhecida: $1" ;;
	esac
}

linha_em() {  # acrescenta a linha ao arquivo se ainda nao estiver la
	grep -qxF "$1" "$2" || echo "$1" >>"$2"
}

verificar() {
	[[ $EUID -eq 0 ]] || falha "rode como root (sudo)"
	# shellcheck disable=SC1091
	. /etc/os-release
	[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == "24.04" ]] || falha "so Ubuntu 24.04 (achei ${PRETTY_NAME:-desconhecido})"
	[[ -n ${ESCUTA:-} && -n ${GESTAO:-} && -n ${ORIGEM_CONF:-} ]] ||
		falha "uso: $0 --escuta <placa> --gestao <placa> --conf <arquivo.conf>"
	[[ $ESCUTA != "$GESTAO" ]] || falha "escuta e gestao precisam ser placas diferentes"
	ip link show dev "$ESCUTA" >/dev/null || falha "placa de escuta $ESCUTA nao existe"
	ip link show dev "$GESTAO" >/dev/null || falha "placa de gestao $GESTAO nao existe"
	[[ -f $ORIGEM_CONF ]] || falha "conf $ORIGEM_CONF nao existe"
	[[ -f $(dirname "$0")/n-ot-resumo-zeek.py ]] || falha "n-ot-resumo-zeek.py precisa estar ao lado deste script"
}

instalar_zeek() {
	passo "Zeek LTS (repositorio oficial do projeto Zeek)"
	export DEBIAN_FRONTEND=noninteractive
	apt-get update -q
	apt-get install -y -q curl gpg ca-certificates
	if [[ ! -s $CHAVE_ZEEK ]]; then
		install -d -m 0755 /etc/apt/keyrings
		curl -fsSL "${REPO_ZEEK}Release.key" | gpg --dearmor -o "$CHAVE_ZEEK"
	fi
	echo "deb [signed-by=$CHAVE_ZEEK] $REPO_ZEEK /" >/etc/apt/sources.list.d/zeek.list
	apt-get update -q
	# zeek-lts traz zeekctl, zkg e spicy; cmake/g++/git compilam os pacotes ICSNPP
	apt-get install -y -q zeek-lts cmake make g++ git libpcap-dev libssl-dev zlib1g-dev \
		nftables unattended-upgrades acl python3 util-linux

	passo "ICSNPP via zkg"
	export PATH=$ZEEK/bin:$PATH
	zkg autoconfig --force >/dev/null
	local p falta=()
	for p in "${ICSNPP[@]}"; do
		zkg list installed 2>/dev/null | grep -q "/$p " || falta+=("$p")
	done
	if ((${#falta[@]})); then
		zkg refresh
		zkg install --force --skiptests "${falta[@]}"  # sem btest no sistema; --force nao pergunta
	fi
}

configurar_zeek() {
	passo "Zeek: logs JSON, MAC, placa $ESCUTA e retencao de 30 dias"
	local site=$ZEEK/share/zeek/site/local.zeek cfg=$ZEEK/etc/zeekctl.cfg
	linha_em "@load policy/tuning/json-logs" "$site"
	linha_em "@load policy/protocols/conn/mac-logging" "$site"
	linha_em "@load packages" "$site"
	sed -i "s/^interface=.*/interface=$ESCUTA/" $ZEEK/etc/node.cfg
	if grep -q "^LogExpireInterval" "$cfg"; then
		sed -i "s/^LogExpireInterval.*/LogExpireInterval = 30day/" "$cfg"
	else
		echo "LogExpireInterval = 30day" >>"$cfg"
	fi
	# zeekctl cron apaga os logs vencidos e religa o Zeek apos queda ou reboot
	echo "*/5 * * * * root $ZEEK/bin/zeekctl cron" >/etc/cron.d/zeekctl
}

configurar_escuta() {
	passo "Placa de escuta $ESCUTA sem IP e em modo promiscuo"
	ip addr flush dev "$ESCUTA"
	ip link set dev "$ESCUTA" up promisc on
	if ! cmp -s <(netplan_escuta "$ESCUTA") "$NETPLAN"; then
		netplan_escuta "$ESCUTA" >"$NETPLAN"
		chmod 0600 "$NETPLAN"
		netplan apply
		ip link set dev "$ESCUTA" up promisc on
	fi
	cat >/etc/systemd/system/n-ot-escuta.service <<EOF
[Unit]
Description=n.ot: placa de escuta $ESCUTA em modo promiscuo
After=network.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/ip link set dev $ESCUTA up promisc on

[Install]
WantedBy=multi-user.target
EOF
	systemctl daemon-reload
	systemctl enable --now n-ot-escuta.service
}

configurar_sonda() {
	passo "Usuario $USUARIO, configuracao e script"
	id -u "$USUARIO" >/dev/null 2>&1 ||
		useradd --system --home-dir "$ESTADO" --no-create-home --shell /usr/sbin/nologin "$USUARIO"
	install -d -m 0700 -o "$USUARIO" -g "$USUARIO" "$ESTADO"
	install -m 0755 "$(dirname "$0")/n-ot-resumo-zeek.py" "$SCRIPT"
	# o script recusa conf com qualquer bit de grupo/outros; o servico roda como $USUARIO
	install -m 0600 -o n-ot-sonda -g n-ot-sonda "$ORIGEM_CONF" "$CONF"
	# valida com o proprio script (url https, credencial) e devolve "host porta"
	DESTINO=$(python3 - "$SCRIPT" "$CONF" <<'EOF'
import importlib.util, sys, urllib.parse
s = importlib.util.spec_from_file_location("r", sys.argv[1]); m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
u = urllib.parse.urlsplit(m.ler_conf(sys.argv[2])["url"])
print(u.hostname, u.port or 443)
EOF
	) || falha "conf invalida: $ORIGEM_CONF"
}

ligar_zeek() {
	passo "Zeek: deploy"
	$ZEEK/bin/zeekctl deploy
	# a sonda le os logs (atuais e arquivados) sem ser root
	setfacl -R -m "u:$USUARIO:rX" $ZEEK/logs $ZEEK/spool
	setfacl -R -d -m "u:$USUARIO:rX" $ZEEK/logs $ZEEK/spool
}

ligar_atualizacoes() {
	passo "unattended-upgrades (seguranca)"
	cat >/etc/apt/apt.conf.d/20auto-upgrades <<EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
	systemctl enable --now unattended-upgrades.service
}

ligar_timers() {
	passo "Timers de envio"
	local u
	for u in n-ot-sonda-resumo.service n-ot-sonda-fila.service n-ot-sonda-resumo.timer n-ot-sonda-fila.timer; do
		unidade "$u" >"/etc/systemd/system/$u"
	done
	systemctl daemon-reload
	systemctl enable --now n-ot-sonda-resumo.timer n-ot-sonda-fila.timer
}

fechar_firewall() {
	local host porta ips
	read -r host porta <<<"$DESTINO"
	passo "nftables: saida so para $host:$porta (mais DNS, NTP e apt) e SSH so por $GESTAO"
	# shortcut: IPs do n.360 resolvidos agora; se mudarem, rode o instalador de novo
	mapfile -t ips < <(getent ahosts "$host" | awk '{print $1}' | sort -u)
	((${#ips[@]})) || falha "nao resolvi $host"
	{
		echo "#!/usr/sbin/nft -f"
		regras_nft "$GESTAO" "$(id -u _apt)" "$(id -u "$USUARIO")" "$porta" "${ips[@]}"
	} >/etc/nftables.conf
	nft -c -f /etc/nftables.conf
	nft -f /etc/nftables.conf
	systemctl enable nftables.service
}

main() {
	ESCUTA="" GESTAO="" ORIGEM_CONF=""
	while (($#)); do
		case $1 in
		--escuta | --gestao | --conf) (($# >= 2)) || falha "falta o valor de $1" ;;
		*) falha "opcao desconhecida: $1" ;;
		esac
		case $1 in
		--escuta) ESCUTA=$2 ;;
		--gestao) GESTAO=$2 ;;
		--conf) ORIGEM_CONF=$2 ;;
		esac
		shift 2
	done
	verificar
	instalar_zeek
	configurar_zeek
	configurar_sonda
	configurar_escuta
	ligar_zeek
	ligar_atualizacoes
	ligar_timers
	fechar_firewall  # por ultimo: os passos acima baixam pacotes de fora
	passo "pronto. Teste o envio: systemctl start n-ot-sonda-resumo.service; journalctl -u n-ot-sonda-resumo"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
	main "$@"
fi
