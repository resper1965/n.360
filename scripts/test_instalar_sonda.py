"""Checagem estatica do instalar-sonda.sh: nunca roda o instalador (ele mexe em rede e firewall).
Uso: python3 -m unittest scripts/test_instalar_sonda.py"""
import os, shutil, subprocess, tempfile, unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(AQUI, "instalar-sonda.sh")
ICSNPP = ("icsnpp-enip", "icsnpp-s7comm", "icsnpp-bacnet", "icsnpp-opcua-binary", "icsnpp-profinet-io-cm")


def funcao(nome, *args):
    """Carrega o script sem rodar o main e chama uma funcao que so imprime texto."""
    # $0 diferente do script: o guarda do fim do arquivo nao chama o main
    cmd = 'source "$1"; shift; %s "$@"' % nome
    return subprocess.run(["bash", "-c", cmd, "teste", SCRIPT, *args], capture_output=True, text=True, check=True).stdout


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(SCRIPT, encoding="utf-8") as f:
            cls.s = f.read()

    def tem(self, *trechos):
        for t in trechos:
            self.assertIn(t, self.s)

    def test_sintaxe(self):
        subprocess.run(["bash", "-n", SCRIPT], check=True)
        self.tem("set -euo pipefail")

    @unittest.skipUnless(shutil.which("shellcheck"), "shellcheck nao instalado")
    def test_shellcheck(self):
        subprocess.run(["shellcheck", SCRIPT], check=True)

    def test_so_ubuntu_2404_e_root(self):
        self.tem("/etc/os-release", '"24.04"', "EUID")

    def test_zeek_lts_oficial_e_icsnpp(self):
        self.tem("download.opensuse.org/repositories/security:/zeek/xUbuntu_24.04/",
                 "Release.key", "signed-by=", "zeek-lts")
        self.tem("zkg install")
        for p in ICSNPP:
            self.assertIn(p, self.s)

    def test_json_mac_e_retencao_30_dias(self):
        self.tem("@load policy/tuning/json-logs", "@load policy/protocols/conn/mac-logging",
                 "LogExpireInterval = 30day", "zeekctl cron")

    def test_placa_de_escuta_sem_ip_e_promiscua(self):
        self.tem("ip addr flush dev", "promisc on")
        netplan = funcao("netplan_escuta", "enp2s0")
        self.assertIn("enp2s0:", netplan)
        self.assertIn("dhcp4: false", netplan)
        self.assertNotIn("addresses", netplan)
        sysctl = funcao("sysctl_escuta", "enp2s0")
        self.assertIn("net.ipv6.conf.enp2s0.disable_ipv6 = 1", sysctl)
        self.assertIn("net.ipv6.conf.enp2s0.accept_ra = 0", sysctl)
        # o sysctl vale antes de a placa subir (sem link-local IPv6)
        self.assertLess(self.s.index("sysctl -q -p /etc/sysctl.d/90-n-ot-escuta.conf"),
                        self.s.index('ip link set dev "$ESCUTA" up'))
        self.tem('[[ -z $(ip -o addr show dev "$ESCUTA") ]]', "50-cloud-init.yaml")

    def test_escuta_sem_lease_por_20_s_apos_o_apply(self):
        # o lease de DHCP de outra definicao chega depois do apply: checa endereco e networkd 10 x 2 s, depois do apply
        laco = self.s.index("for i in {1..10}; do")
        self.assertLess(self.s.index("netplan apply"), laco)
        corpo = self.s[laco:self.s.index("done", laco)]
        for t in ('ip -o addr show dev "$ESCUTA"', 'networkctl status "$ESCUTA"', "dhcp|lease", "falha", "sleep 2"):
            self.assertIn(t, corpo)

    def test_sem_grep_q_em_pipe(self):
        # grep -q no fim de um pipe sai cedo; com pipefail o SIGPIPE do produtor vira falso negativo
        self.assertNotRegex(self.s, r"\|\s*grep -q")

    def test_recusa_escuta_com_rota_padrao(self):
        self.tem("ip route show default", "ip -6 route show default")

    def test_firewall(self):
        regras = funcao("regras_nft", "enp2s0", "enp1s0", "42", "998", "443")
        self.assertIn("policy drop", regras)
        saida = regras[regras.index("chain saida"):].splitlines()
        self.assertEqual(saida[2].strip(), 'oifname "enp2s0" drop')  # primeira regra: a escuta nunca transmite
        self.assertIn('iifname "enp1s0" tcp dport 22 accept', regras)
        self.assertEqual(regras.count("dport 22"), 1)  # SSH so pela gestao
        self.assertIn("meta skuid 998 tcp dport 443 accept", regras)
        self.assertIn("meta skuid 42 tcp dport { 80, 443 } accept", regras)
        self.assertNotIn("daddr", regras)  # sem IP fixo do n.360
        self.assertNotIn("icmp, ipv6-icmp } accept", "\n".join(saida))  # sem ICMP de saida liberado em bloco
        self.tem("nftables")
        if shutil.which("nft"):  # confere a sintaxe sem carregar nada
            with tempfile.NamedTemporaryFile("w", suffix=".nft") as f:
                f.write(regras.replace("flush ruleset\n", ""))
                f.flush()
                subprocess.run(["nft", "-c", "-f", f.name], check=True)

    def test_zkg_com_firewall_fechado_explica(self):
        self.tem("nft list table inet n_ot_sonda", "nft delete table inet n_ot_sonda")

    def test_unattended_upgrades(self):
        self.tem("unattended-upgrades", 'APT::Periodic::Unattended-Upgrade "1"')

    def test_conf_0600_do_usuario_da_sonda(self):
        self.tem("install -m 0600 -o n-ot-sonda -g n-ot-sonda")

    def test_timers(self):
        resumo = funcao("unidade", "n-ot-sonda-resumo.timer")
        self.assertIn("OnCalendar=*-*-* 02:00", resumo)
        self.assertIn("RandomizedDelaySec=3h", resumo)
        self.assertIn("Persistent=true", resumo)
        fila = funcao("unidade", "n-ot-sonda-fila.timer")
        self.assertIn("OnCalendar=*:0/5", fila)
        gera = funcao("unidade", "n-ot-sonda-resumo.service")
        self.assertIn("--enviar --conf /etc/n-ot-sonda.conf --estado /var/lib/n-ot-sonda --ultimas-horas 24", gera)
        self.assertNotIn("--so-fila", gera)
        so_fila = funcao("unidade", "n-ot-sonda-fila.service")
        self.assertIn("--enviar --so-fila --conf /etc/n-ot-sonda.conf --estado /var/lib/n-ot-sonda", so_fila)
        for u in (gera, so_fila):
            self.assertIn("User=n-ot-sonda", u)
            self.assertIn("flock", u)  # as duas filas nunca enviam ao mesmo tempo
        self.tem("systemctl enable --now n-ot-sonda-resumo.timer n-ot-sonda-fila.timer")


if __name__ == "__main__":
    unittest.main()
