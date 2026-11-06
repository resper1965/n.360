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

    def test_firewall(self):
        regras = funcao("regras_nft", "enp1s0", "42", "998", "443", "203.0.113.7", "2001:db8::7")
        self.assertIn("policy drop", regras)
        self.assertIn('iifname "enp1s0" tcp dport 22 accept', regras)
        self.assertEqual(regras.count("dport 22"), 1)  # SSH so pela gestao
        self.assertIn("203.0.113.7", regras)
        self.assertIn("2001:db8::7", regras)
        self.assertIn("meta skuid 998 ip daddr @n360 tcp dport 443 accept", regras)
        self.tem("nftables")
        if shutil.which("nft"):  # confere a sintaxe sem carregar nada
            with tempfile.NamedTemporaryFile("w", suffix=".nft") as f:
                f.write(regras.replace("flush ruleset\n", ""))
                f.flush()
                subprocess.run(["nft", "-c", "-f", f.name], check=True)

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
