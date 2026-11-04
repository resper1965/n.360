import importlib.util, json, os, shutil, tempfile, unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(AQUI, "fixtures-zeek")
spec = importlib.util.spec_from_file_location("resumo", os.path.join(AQUI, "n-ot-resumo-zeek.py"))
resumo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resumo)

RAIZ = {"formato", "gerado_em", "periodo", "zeek_versao", "ativos", "conexoes"}
ATIVO = {"ip", "mac", "fabricante", "protocolos", "portas_servico", "primeira_vez", "ultima_vez"}
CONEXAO = {"origem", "destino", "transporte", "porta", "aplicacao", "contagem", "primeira_vez", "ultima_vez"}


class T(unittest.TestCase):
    def setUp(self):
        self.r = resumo.resumir(FIX)

    def conn(self, destino, porta):
        return next(c for c in self.r["conexoes"] if c["destino"] == destino and c["porta"] == porta)

    def ativo(self, ip):
        return next(a for a in self.r["ativos"] if a["ip"] == ip)

    def test_repetidas_agregam(self):
        c = self.conn("10.1.1.10", 502)
        self.assertEqual(c["contagem"], 3)
        self.assertEqual((c["primeira_vez"], c["ultima_vez"]), ("2026-11-01T00:00:00Z", "2026-11-01T00:02:00Z"))

    def test_modbus(self):
        self.assertEqual(self.conn("10.1.1.10", 502)["aplicacao"], "modbus")
        a = self.ativo("10.1.1.10")
        self.assertEqual((a["protocolos"], a["portas_servico"]), (["modbus"], [502]))

    def test_service_lista(self):
        self.assertEqual(self.conn("10.1.1.11", 20000)["aplicacao"], "dnp3")
        self.assertEqual(self.conn("10.1.1.30", 443)["aplicacao"], "https")
        self.assertIsNone(self.conn("10.1.1.31", 9999)["aplicacao"])

    def test_mac_e_oui(self):
        a = self.ativo("10.1.1.10")
        self.assertEqual((a["mac"], a["fabricante"]), ("00:30:a7:01:02:03", "SEL"))
        b = self.ativo("10.1.1.20")  # MAC vem do dhcp.log
        self.assertEqual((b["mac"], b["fabricante"]), ("00:0e:8c:aa:bb:cc", "Siemens"))
        self.assertNotIn("mac", self.ativo("10.1.1.30"))

    def test_gz(self):
        r = resumo.resumir(os.path.join(FIX, "gz"))
        self.assertEqual(sum(c["contagem"] for c in r["conexoes"]), 2)

    def test_teto(self):
        r = resumo.resumir(FIX, limite_conexoes=2)
        self.assertEqual(len(r["conexoes"]), 2)
        self.assertEqual(r["conexoes"][0]["contagem"], 3)

    def test_chaves(self):
        self.assertLessEqual(set(self.r), RAIZ)
        self.assertEqual(self.r["formato"], "n.ot-resumo-rede/1")
        for a in self.r["ativos"]:
            self.assertLessEqual(set(a), ATIVO)
        for c in self.r["conexoes"]:
            self.assertEqual(set(c), CONEXAO)

    def _pasta(self, conn, **outros):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d)
        for nome, rows in dict(conn=conn, **outros).items():
            with open(os.path.join(d, nome + ".log"), "w") as f:
                f.write("".join(json.dumps(x) + "\n" for x in rows))
        return d

    def _c(self, **kw):
        base = {"ts": 1793491200, "id.orig_h": "10.0.0.1", "id.resp_h": "10.0.0.2", "id.resp_p": 80, "proto": "tcp"}
        base.update(kw)
        return base

    def test_portas_invalidas(self):
        r = resumo.resumir(self._pasta([
            self._c(proto="icmp", **{"id.resp_p": 0}), self._c(**{"id.resp_p": 70000}),
            self._c(**{"id.resp_p": True}), self._c()],
            known_services=[{"host": "10.0.0.2", "port_num": 99999}, {"host": "10.0.0.2", "port_num": 22}]))
        self.assertEqual([c["porta"] for c in r["conexoes"]], [80])
        self.assertEqual(next(a for a in r["ativos"] if a["ip"] == "10.0.0.2")["portas_servico"], [22, 80])

    def test_valores_invalidos(self):
        r = resumo.resumir(self._pasta([
            self._c(**{"id.orig_h": "-"}), self._c(**{"id.resp_h": "nao-ip"}), self._c(**{"id.orig_h": 5}),
            self._c(proto="-"), self._c(proto=""), self._c(ts=True), self._c(ts=1e300), self._c(ts="x"),
            self._c(resp_l2_addr="zz:zz"), self._c(resp_l2_addr="AA:BB:CC:DD:EE:FF", proto="udp")]))
        self.assertEqual([(c["transporte"], c["contagem"]) for c in r["conexoes"]], [("tcp", 1), ("udp", 1)])
        self.assertEqual(next(a for a in r["ativos"] if a["ip"] == "10.0.0.2")["mac"], "aa:bb:cc:dd:ee:ff")

    def test_marca_por_porta(self):
        r = resumo.resumir(self._pasta(
            [self._c(service="ssh", **{"id.resp_p": 22}), self._c(**{"id.resp_p": 502}), self._c(**{"id.resp_p": 502})],
            modbus=[{"id.orig_h": "10.0.0.1", "id.resp_h": "10.0.0.2", "id.resp_p": 502}]))
        self.assertEqual({c["porta"]: (c["aplicacao"], c["contagem"]) for c in r["conexoes"]},
                         {22: ("ssh", 1), 502: ("modbus", 2)})
        self.assertEqual(next(a for a in r["ativos"] if a["ip"] == "10.0.0.2")["protocolos"], ["modbus", "ssh"])

    def test_valores_completos(self):
        r = dict(self.r)
        r.pop("gerado_em")
        self.assertEqual(r["periodo"], {"inicio": "2026-11-01T00:00:00Z", "fim": "2026-11-01T00:02:00Z"})
        self.assertEqual(self.ativo("10.1.1.10"), {"ip": "10.1.1.10", "mac": "00:30:a7:01:02:03", "fabricante": "SEL",
            "protocolos": ["modbus"], "portas_servico": [502], "primeira_vez": "2026-11-01T00:00:00Z", "ultima_vez": "2026-11-01T00:02:00Z"})
        self.assertEqual(self.conn("10.1.1.11", 20000), {"origem": "10.1.1.20", "destino": "10.1.1.11", "transporte": "tcp",
            "porta": 20000, "aplicacao": "dnp3", "contagem": 1, "primeira_vez": "2026-11-01T00:00:30Z", "ultima_vez": "2026-11-01T00:00:30Z"})
        self.assertEqual(len(r["conexoes"]), 4)

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "r.json")
            self.assertEqual(resumo.main([FIX, "-o", out]), 0)
            self.assertEqual(json.load(open(out))["formato"], "n.ot-resumo-rede/1")
            vazia = os.path.join(d, "vazia")
            os.mkdir(vazia)
            self.assertEqual(resumo.main([vazia, "-o", out]), 2)


if __name__ == "__main__":
    unittest.main()
