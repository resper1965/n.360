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
