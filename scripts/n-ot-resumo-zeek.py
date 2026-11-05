#!/usr/bin/env python3
"""Resume logs JSON do Zeek em resumo.json (n.ot-resumo-rede/1). So biblioteca padrao.
Uso: python3 n-ot-resumo-zeek.py <pasta-de-logs> [-o resumo.json]
Le apenas IP, MAC, portas, protocolo e horarios; nunca payload, usuario, URI, arquivo ou certificado."""
import argparse, fnmatch, gzip, ipaddress, json, os, re, sys
from datetime import datetime, timezone

FORMATO = "n.ot-resumo-rede/1"
LIMITE_ATIVOS, LIMITE_CONEXOES = 5000, 20000
TETO_BYTES = 4500000  # o n.ot recusa arquivo acima de 5 MB
ACEITOS = {"modbus", "dnp3", "iec104", "s7comm", "enip", "bacnet", "opcua", "mms", "goose", "http",
           "https", "ssh", "telnet", "rdp", "smb", "snmp", "ntp", "dns", "syslog", "ftp"}
OUI = {"00:30:a7": "SEL", "00:0e:8c": "Siemens", "00:1b:1b": "Siemens", "00:21:c1": "ABB",
       "00:80:f4": "Schneider", "00:a0:db": "GE Grid", "00:80:63": "Hirschmann",
       "00:1b:54": "Cisco", "00:90:e8": "Moxa", "00:00:bc": "Rockwell"}


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def arquivos(pasta, nome):
    """nome*.log e nome*.log.gz em qualquer subpasta (rotacao do zeekctl/Malcolm: 2026-11-01/conn.10:00:00-11:00:00.log.gz)."""
    achados = []
    for raiz, _, nomes in os.walk(pasta, followlinks=True):  # logs/current do zeekctl e symlink
        achados += [os.path.join(raiz, n) for n in nomes
                    if not (nome == "conn" and n.startswith("conn_long"))  # conexoes longas repetem as de conn.log
                    and fnmatch.fnmatchcase(n, nome + "*.log") or fnmatch.fnmatchcase(n, nome + "*.log.gz")]
    return sorted(achados)


def ler(pasta, nome):
    """Gera os registros de todos os arquivos de nome (.log e .gz juntos); linhas invalidas sao ignoradas."""
    for caminho in arquivos(pasta, nome):
        abrir = gzip.open if caminho.endswith(".gz") else open
        with abrir(caminho, "rt", encoding="utf-8", errors="replace") as f:
            for linha in f:
                try:
                    r = json.loads(linha)
                except ValueError:
                    continue
                if isinstance(r, dict):
                    yield r


def aplicacao(service):
    """Primeiro valor de service que esteja na lista aceita (ssl vira https), senao None."""
    valores = service if isinstance(service, list) else str(service or "").split(",")
    for v in valores:
        v = v.strip().lower()
        v = "https" if v == "ssl" else v
        if v in ACEITOS:
            return v
    return None


MAC_RE = re.compile(r"^[0-9a-f]{2}([:-][0-9a-f]{2}){5}$")
TRANSPORTES = {"tcp", "udp", "icmp"}


def mac_ok(m):
    m = m.lower() if isinstance(m, str) else ""
    return m.replace("-", ":") if MAC_RE.match(m) else None


def porta_ok(p):
    return isinstance(p, int) and not isinstance(p, bool) and 1 <= p <= 65535


def ip_ok(x):
    """IP de um host: multicast, broadcast limitado, nao especificado e loopback ficam de fora (o servidor repete o filtro)."""
    try:
        a = ipaddress.ip_address(x) if isinstance(x, str) else None
    except ValueError:
        return False
    return a is not None and not (a.is_multicast or a.is_unspecified or a.is_loopback or x == "255.255.255.255")


def ts_ok(t):  # 2000-01-01 .. 2100-01-01 (evita overflow em iso)
    return isinstance(t, (int, float)) and not isinstance(t, bool) and 946684800 <= t <= 4102444800


def resumir(pasta, limite_ativos=LIMITE_ATIVOS, limite_conexoes=LIMITE_CONEXOES):
    if not os.path.isdir(pasta):
        raise NotADirectoryError("pasta nao encontrada: " + pasta)
    if not arquivos(pasta, "conn"):
        raise FileNotFoundError("conn.log nao encontrado em " + pasta)
    marcas = {}  # (origem, destino) -> aplicacao dada por modbus.log/dnp3.log
    for nome in ("modbus", "dnp3"):
        for r in ler(pasta, nome):
            if porta_ok(r.get("id.resp_p")):
                marcas[(r.get("id.orig_h"), r.get("id.resp_h"), r["id.resp_p"])] = nome
    ativos, conns, ts_all = {}, {}, []

    def ativo(ip):
        return ativos.setdefault(ip, {"mac": None, "protocolos": set(), "portas": set(), "ini": None, "fim": None, "peso": 0})

    def tempo(a, ts):
        a["ini"] = ts if a["ini"] is None else min(a["ini"], ts)
        a["fim"] = ts if a["fim"] is None else max(a["fim"], ts)

    for r in ler(pasta, "conn"):
        o, d, p, ts = r.get("id.orig_h"), r.get("id.resp_h"), r.get("id.resp_p"), r.get("ts")
        tr = r.get("proto")
        if not (ip_ok(o) and ip_ok(d) and ts_ok(ts) and tr in TRANSPORTES):
            continue
        if not porta_ok(p):  # ICMP e portas invalidas: sem conexao, sem porta de servico
            p = None
        app = marcas.get((o, d, p)) or aplicacao(r.get("service"))
        ts_all.append(ts)
        if p:  # sem porta valida (ex.: ICMP) so conta para os ativos
            c = conns.setdefault((o, d, tr, p, app), {"n": 0, "ini": ts, "fim": ts})
            c["n"] += 1
            c["ini"], c["fim"] = min(c["ini"], ts), max(c["fim"], ts)
        for ip, mac in ((o, r.get("orig_l2_addr")), (d, r.get("resp_l2_addr"))):
            a = ativo(ip)
            a["peso"] += 1
            tempo(a, ts)
            a["mac"] = a["mac"] or mac_ok(mac)
        s = ativos[d]
        if p:
            s["portas"].add(p)
        if app:
            s["protocolos"].add(app)
    for r in ler(pasta, "dhcp"):
        ip = r.get("assigned_addr") or r.get("client_addr")
        if ip_ok(ip) and mac_ok(r.get("mac")):
            a = ativo(ip)
            a["mac"] = a["mac"] or mac_ok(r["mac"])
    for r in ler(pasta, "known_hosts"):
        if ip_ok(r.get("host")):
            ativo(r["host"])
    for r in ler(pasta, "known_services"):
        if ip_ok(r.get("host")) and porta_ok(r.get("port_num")):
            a = ativo(r["host"])
            a["portas"].add(r["port_num"])
            app = aplicacao(r.get("service"))
            if app:
                a["protocolos"].add(app)
    versao = None
    for r in ler(pasta, "software"):
        if str(r.get("name", "")).lower() == "zeek" and r.get("unparsed_version"):
            v = str(r["unparsed_version"])
            versao = v if re.fullmatch(r"[\w.+-]{1,50}", v, re.ASCII) else None  # mesma forma que o n.ot aceita
            break

    lc = sorted(conns.items(), key=lambda kv: -kv[1]["n"])
    if len(lc) > limite_conexoes:
        print("aviso: %d conexoes; mantidas as %d mais frequentes" % (len(lc), limite_conexoes), file=sys.stderr)
        lc = lc[:limite_conexoes]
    la = sorted(ativos.items(), key=lambda kv: -kv[1]["peso"])
    if len(la) > limite_ativos:
        print("aviso: %d ativos; mantidos os %d mais frequentes" % (len(la), limite_ativos), file=sys.stderr)
        la = la[:limite_ativos]

    out_a = []
    for ip, a in la:
        x = {"ip": ip}
        if a["mac"]:
            x["mac"] = a["mac"]
            if a["mac"][:8] in OUI:
                x["fabricante"] = OUI[a["mac"][:8]]
        x["protocolos"] = sorted(a["protocolos"])
        x["portas_servico"] = sorted(a["portas"])
        if a["ini"] is not None:
            x["primeira_vez"], x["ultima_vez"] = iso(a["ini"]), iso(a["fim"])
        out_a.append(x)
    out = {"formato": FORMATO, "gerado_em": iso(datetime.now(timezone.utc).timestamp())}
    if ts_all:
        out["periodo"] = {"inicio": iso(min(ts_all)), "fim": iso(max(ts_all))}
    if versao:
        out["zeek_versao"] = versao
    out["ativos"] = out_a
    out["conexoes"] = [{"origem": o, "destino": d, "transporte": t, "porta": p, "aplicacao": app,
                        "contagem": c["n"], "primeira_vez": iso(c["ini"]), "ultima_vez": iso(c["fim"])}
                       for (o, d, t, p, app), c in lc]
    return out


def compacto(x):
    return json.dumps(x, ensure_ascii=False, separators=(",", ":"))


def caber(out, teto=TETO_BYTES):
    """JSON compacto ate o teto: corta as conexoes menos frequentes; se ainda passar, os ativos sem conexao e sem MAC."""
    tam = len(compacto(out).encode())
    cs, at = out["conexoes"], out["ativos"]
    nc, na = len(cs), len(at)
    while tam > teto and cs:  # a lista ja vem da mais para a menos frequente
        tam -= len(compacto(cs.pop()).encode()) + (1 if cs else 0)
    for i in range(len(at) - 1, -1, -1):  # sem conexoes e ainda acima: ativos sem MAC, do menos para o mais visto
        if tam <= teto:
            break
        if "mac" not in at[i]:
            tam -= len(compacto(at.pop(i)).encode()) + (1 if at else 0)
    if nc != len(cs) or na != len(at):
        print("aviso: resumo acima de %.1f MB; descartadas %d conexoes e %d ativos menos frequentes"
              % (teto / 1e6, nc - len(cs), na - len(at)), file=sys.stderr)
    return compacto(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Resume logs JSON do Zeek para o n.ot")
    ap.add_argument("pasta")
    ap.add_argument("-o", "--saida", default="resumo.json")
    args = ap.parse_args(argv)
    try:
        r = resumir(args.pasta)
    except (FileNotFoundError, NotADirectoryError) as e:
        print("erro: " + str(e), file=sys.stderr)
        return 2
    with open(args.saida, "w", encoding="utf-8") as f:
        f.write(caber(r))
    print("%s: %d ativos, %d conexoes" % (args.saida, len(r["ativos"]), len(r["conexoes"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
