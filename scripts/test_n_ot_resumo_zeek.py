import contextlib, gzip, importlib.util, io, json, os, shutil, tempfile, unittest

AQUI = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(AQUI, "fixtures-zeek")
# saida de resumir(FIX) com gerado_em fixo; o teste do backend (test/ot-rede-servico.test.ts) passa este arquivo no resumoRedeSchema.
# Regerar: REGERAR=1 python3 -m unittest scripts/test_n_ot_resumo_zeek.py
ESPERADO = os.path.join(FIX, "resumo-esperado.json")
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
        r = resumo.resumir(os.path.join(AQUI, "fixtures-zeek-gz"))
        self.assertEqual(sum(c["contagem"] for c in r["conexoes"]), 2)

    def test_rotacao_em_subpastas(self):
        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d)
        linha = lambda ts, porta: json.dumps(self._c(ts=ts, **{"id.resp_p": porta})) + "\n"
        for sub, nome, conteudo in (("2026-11-01", "conn.10:00:00-11:00:00.log.gz", linha(1793491200, 502)),
                                    ("2026-11-01", "conn.11:00:00-12:00:00.log.gz", linha(1793494800, 502)),
                                    ("2026-11-02", "modbus.10:00:00-11:00:00.log.gz", json.dumps(
                                        {"id.orig_h": "10.0.0.1", "id.resp_h": "10.0.0.2", "id.resp_p": 502}) + "\n"),
                                    ("", "conn.log", linha(1793577600, 22))):
            os.makedirs(os.path.join(d, sub), exist_ok=True)
            caminho = os.path.join(d, sub, nome)
            with (gzip.open if nome.endswith(".gz") else open)(caminho, "wt") as f:
                f.write(conteudo)
        r = resumo.resumir(d)
        self.assertEqual({c["porta"]: (c["aplicacao"], c["contagem"]) for c in r["conexoes"]}, {502: ("modbus", 2), 22: (None, 1)})
        self.assertEqual(r["periodo"], {"inicio": "2026-11-01T00:00:00Z", "fim": "2026-11-02T00:00:00Z"})

    def test_multicast_broadcast_ignorados(self):
        r = resumo.resumir(self._pasta([
            self._c(**{"id.resp_h": "224.0.0.251"}), self._c(**{"id.resp_h": "239.255.255.250"}), self._c(**{"id.resp_h": "255.255.255.255"}),
            self._c(**{"id.orig_h": "0.0.0.0"}), self._c(**{"id.orig_h": "fe80::1", "id.resp_h": "ff02::fb"}),
            self._c(**{"id.orig_h": "::", "id.resp_h": "fe80::2"}), self._c(**{"id.resp_h": "127.0.0.1"}), self._c()],
            dhcp=[{"client_addr": "0.0.0.0", "mac": "00:30:a7:00:00:01"}], known_hosts=[{"host": "ff02::1"}]))
        self.assertEqual([(c["origem"], c["destino"]) for c in r["conexoes"]], [("10.0.0.1", "10.0.0.2")])
        self.assertEqual(sorted(a["ip"] for a in r["ativos"]), ["10.0.0.1", "10.0.0.2"])

    def test_cabe_no_teto(self):
        base = {"formato": "f", "ativos": [{"ip": "10.0.0.%d" % i, "protocolos": [], "portas_servico": []} for i in range(3)]
                + [{"ip": "10.0.0.9", "mac": "00:00:00:00:00:01", "protocolos": [], "portas_servico": []}],
                "conexoes": [{"origem": "10.0.0.1", "destino": "10.0.0.2", "contagem": n} for n in (9, 5, 1)]}
        r = json.loads(json.dumps(base))
        self.assertEqual(resumo.caber(r), json.dumps(base, separators=(",", ":")))  # cabe: compacto e intacto
        so_dois = dict(base, conexoes=[], ativos=[base["ativos"][0], base["ativos"][3]])
        for teto, conexoes, ativos in ((len(resumo.compacto(base)) - 1, [9, 5], 4), (len(resumo.compacto(so_dois)), [], 2)):
            r, err = json.loads(json.dumps(base)), io.StringIO()
            with contextlib.redirect_stderr(err):
                texto = resumo.caber(r, teto)
            self.assertLessEqual(len(texto.encode()), teto)
            out = json.loads(texto)
            self.assertEqual([c["contagem"] for c in out["conexoes"]], conexoes)
            self.assertEqual(len(out["ativos"]), ativos)
            self.assertIn("descartadas %d conexoes e %d ativos" % (3 - len(conexoes), 4 - ativos), err.getvalue())
        self.assertEqual([a["ip"] for a in out["ativos"]], ["10.0.0.0", "10.0.0.9"])  # fica o com MAC e o mais visto

    def test_resumo_esperado(self):
        r = dict(self.r, gerado_em="2026-11-04T12:00:00Z")
        if os.environ.get("REGERAR"):
            with open(ESPERADO, "w", encoding="utf-8") as f:
                f.write(json.dumps(r, ensure_ascii=False, indent=2) + "\n")
        with open(ESPERADO, encoding="utf-8") as f:
            self.assertEqual(json.load(f), r)

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

    def test_zeek_versao(self):
        ok = resumo.resumir(self._pasta([self._c()], software=[{"name": "Zeek", "unparsed_version": "6.0.4"}]))
        self.assertEqual(ok["zeek_versao"], "6.0.4")
        ruim = resumo.resumir(self._pasta([self._c()], software=[{"name": "zeek", "unparsed_version": "Zeek 6.0 (build x)"}]))
        self.assertNotIn("zeek_versao", ruim)

    def test_cli(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, "r.json")
            self.assertEqual(resumo.main([FIX, "-o", out]), 0)
            with open(out) as f:
                texto = f.read()
            self.assertEqual(json.loads(texto)["formato"], "n.ot-resumo-rede/1")
            self.assertNotIn("\n", texto)  # compacto
            vazia = os.path.join(d, "vazia")
            os.mkdir(vazia)
            self.assertEqual(resumo.main([vazia, "-o", out]), 2)


if __name__ == "__main__":
    unittest.main()
