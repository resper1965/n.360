#!/usr/bin/env python3
"""Resume logs JSON do Zeek em resumo.json (n.ot-resumo-rede/1). So biblioteca padrao.
Uso: python3 n-ot-resumo-zeek.py <pasta-de-logs> [-o resumo.json] [--ultimas-horas N]
     python3 n-ot-resumo-zeek.py <pasta-de-logs> --enviar [--so-fila] [--conf /etc/n-ot-sonda.conf] [--estado /var/lib/n-ot-sonda]
Le apenas IP, MAC, portas, protocolo e horarios; nunca payload, usuario, URI, arquivo ou certificado."""
import argparse, fnmatch, gzip, ipaddress, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

FORMATO = "n.ot-resumo-rede/1"
VERSAO = "2.0.0"
LIMITE_ATIVOS, LIMITE_CONEXOES = 5000, 20000
MAC_GATEWAY_MIN_IPS = 3  # MAC do conn.log em 3+ IPs e do roteador/firewall (L3 de outra sub-rede), nao do ativo
TETO_BYTES = 4500000  # o n.ot recusa arquivo acima de 5 MB
ACEITOS = {"modbus", "dnp3", "iec104", "s7comm", "enip", "bacnet", "opcua", "mms", "goose", "http",
           "https", "ssh", "telnet", "rdp", "smb", "snmp", "ntp", "dns", "syslog", "ftp", "profinet"}
# service do Zeek/ICSNPP -> nome da lista (origem de cada nome em test_icsnpp)
APELIDOS = {"ssl": "https", "cip": "enip", "s7comm-plus": "s7comm", "opcua-binary": "opcua",
            "spicy_profinet_io_cm": "profinet"}
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


def ler(pasta, nome, desde=None):
    """Gera os registros de todos os arquivos de nome (.log e .gz juntos); linhas invalidas e anteriores a desde sao ignoradas."""
    for caminho in arquivos(pasta, nome):
        abrir = gzip.open if caminho.endswith(".gz") else open
        with abrir(caminho, "rt", encoding="utf-8", errors="replace") as f:
            for linha in f:
                try:
                    r = json.loads(linha)
                except ValueError:
                    continue
                if isinstance(r, dict) and not (desde and ts_ok(r.get("ts")) and r["ts"] < desde):
                    yield r


def aplicacao(service):
    """Primeiro valor de service que esteja na lista aceita (pelos APELIDOS), senao None."""
    valores = service if isinstance(service, list) else str(service or "").split(",")
    for v in valores:
        v = v.strip().lower()
        v = APELIDOS.get(v, v)
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


def resumir(pasta, limite_ativos=LIMITE_ATIVOS, limite_conexoes=LIMITE_CONEXOES, janela=None):
    """janela=(desde, ate) em epoch: so registros a partir de desde, e o periodo e a propria janela."""
    desde = janela[0] if janela else None
    if not os.path.isdir(pasta):
        raise NotADirectoryError("pasta nao encontrada: " + pasta)
    if not arquivos(pasta, "conn"):
        raise FileNotFoundError("conn.log nao encontrado em " + pasta)
    marcas = {}  # (origem, destino) -> aplicacao dada por modbus.log/dnp3.log
    for nome in ("modbus", "dnp3"):
        for r in ler(pasta, nome, desde):
            if porta_ok(r.get("id.resp_p")):
                marcas[(r.get("id.orig_h"), r.get("id.resp_h"), r["id.resp_p"])] = nome
    ativos, conns, ts_all = {}, {}, []

    def ativo(ip):
        return ativos.setdefault(ip, {"mac": None, "dhcp": None, "protocolos": set(), "portas": set(), "ini": None, "fim": None, "peso": 0})

    def tempo(a, ts):
        a["ini"] = ts if a["ini"] is None else min(a["ini"], ts)
        a["fim"] = ts if a["fim"] is None else max(a["fim"], ts)

    for r in ler(pasta, "conn", desde):
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
    for r in ler(pasta, "dhcp", desde):
        ip = r.get("assigned_addr") or r.get("client_addr")
        if ip_ok(ip) and mac_ok(r.get("mac")):
            a = ativo(ip)
            a["dhcp"] = a["dhcp"] or mac_ok(r["mac"])  # observacao L2 direta do cliente: vale mesmo se o MAC aparece em outros IPs
    for r in ler(pasta, "known_hosts", desde):
        if ip_ok(r.get("host")):
            ativo(r["host"])
    for r in ler(pasta, "known_services", desde):
        if ip_ok(r.get("host")) and porta_ok(r.get("port_num")):
            a = ativo(r["host"])
            a["portas"].add(r["port_num"])
            app = aplicacao(r.get("service"))
            if app:
                a["protocolos"].add(app)
    versao = None
    for r in ler(pasta, "software"):  # software.log so registra a versao quando muda: sem janela
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

    ips_por_mac = {}
    for a in ativos.values():
        if a["mac"]:
            ips_por_mac[a["mac"]] = ips_por_mac.get(a["mac"], 0) + 1
    gateway = {m for m, n in ips_por_mac.items() if n >= MAC_GATEWAY_MIN_IPS}
    descartados = 0
    out_a = []
    for ip, a in la:
        x = {"ip": ip}
        mac = a["dhcp"] or (a["mac"] if a["mac"] not in gateway else None)
        descartados += bool(a["mac"] and not mac)
        if mac:
            x["mac"] = mac
            if mac[:8] in OUI:
                x["fabricante"] = OUI[mac[:8]]
        x["protocolos"] = sorted(a["protocolos"])
        x["portas_servico"] = sorted(a["portas"])
        if a["ini"] is not None:
            x["primeira_vez"], x["ultima_vez"] = iso(a["ini"]), iso(a["fim"])
        out_a.append(x)
    if descartados:
        print("aviso: %d MACs de gateway descartados (MAC visto em %d ou mais IPs no conn.log)" % (descartados, MAC_GATEWAY_MIN_IPS), file=sys.stderr)
    agora = janela[1] if janela else datetime.now(timezone.utc).timestamp()
    out = {"formato": FORMATO, "gerado_em": iso(agora)}
    ini, fim = janela or ((min(ts_all), max(ts_all)) if ts_all else (agora, agora))
    out["periodo"] = {"inicio": iso(ini), "fim": iso(fim)}
    if versao:
        out["zeek_versao"] = versao
    perdas = [r["percent_lost"] for r in ler(pasta, "capture_loss", desde)
              if isinstance(r.get("percent_lost"), (int, float)) and not isinstance(r["percent_lost"], bool)
              and 0 <= r["percent_lost"] <= 100]
    if perdas:
        out["capture_loss"] = round(max(perdas), 2)
    out["versao_script"] = VERSAO
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


def log(msg):
    print(msg, file=sys.stderr)  # stderr vai para o journal do systemd


ESPERAS = (60, 300, 1800, 3600)  # 1, 5 e 30 min, depois a cada hora (spec 4.6)
VALIDADE_FILA = 7 * 86400
FILA_RE = re.compile(r"\d{8}T\d{6}\.json")


def ler_conf(caminho):
    """chave = valor, com url e credencial; recusa arquivo legivel por outros (a credencial esta nele)."""
    if os.stat(caminho).st_mode & 0o077:
        raise PermissionError("%s legivel por outros usuarios; use chmod 600" % caminho)
    conf = {}
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            chave, igual, valor = linha.partition("=")
            if igual and not chave.strip().startswith("#"):
                conf[chave.strip()] = valor.strip()
    if not conf.get("url") or not conf.get("credencial"):
        raise ValueError("%s sem url ou credencial" % caminho)
    u = urllib.parse.urlsplit(conf["url"])
    if u.scheme != "https" and u.hostname not in ("127.0.0.1", "localhost"):  # a credencial nao viaja em texto claro
        raise ValueError("%s: url precisa ser https" % caminho)
    return conf


class SemRedirecionar(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a):
        return None  # o 3xx vira HTTPError: o Authorization nunca segue para outro endereco


ABRIR = urllib.request.build_opener(SemRedirecionar).open


def postar(conf, corpo):
    """(codigo HTTP ou None em falha de rede, texto do motivo)."""
    req = urllib.request.Request(conf["url"], data=corpo, method="POST", headers={
        "Authorization": "Bearer " + conf["credencial"], "Content-Type": "application/json"})
    try:
        with ABRIR(req, timeout=60) as resp:
            return resp.status, ""
    except urllib.error.HTTPError as e:
        texto = e.read(2000).decode("utf-8", "replace")
        try:
            texto = json.loads(texto).get("error") or texto
        except (ValueError, AttributeError):
            pass
        return e.code, texto
    except OSError as e:  # URLError, recusada, timeout
        return None, str(e)


def gravar(caminho, texto):
    with open(caminho + ".tmp", "w", encoding="utf-8") as f:
        f.write(texto)
    os.replace(caminho + ".tmp", caminho)  # a fila nunca ve arquivo pela metade


def rejeitar(caminho, rejeitados, motivo):
    nome = os.path.basename(caminho)
    os.replace(caminho, os.path.join(rejeitados, nome))
    gravar(os.path.join(rejeitados, nome[:-5] + ".motivo"), motivo + "\n")
    log("rejeitado %s: %s" % (nome, motivo))


def esvaziar(estado, conf, agora):
    """Envia a fila na ordem, pelo contrato de erros da spec 4.6. 0 se tudo saiu da fila sem rejeicao."""
    fila, rejeitados, espera_json = (os.path.join(estado, n) for n in ("fila", "rejeitados", "espera.json"))
    try:
        with open(espera_json) as f:
            espera = json.load(f)
    except (OSError, ValueError):
        espera = {}
    if agora < espera.get("proxima", 0):
        log("envio adiado ate %s" % iso(espera["proxima"]))
        return 0
    saida = 0
    for nome in sorted(n for n in os.listdir(fila) if FILA_RE.fullmatch(n)):
        caminho = os.path.join(fila, nome)
        criado = datetime.strptime(nome[:15], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc).timestamp()
        if agora - criado > VALIDADE_FILA:
            rejeitar(caminho, rejeitados, "mais de 7 dias na fila")
            saida = 1
            continue
        with open(caminho, "rb") as f:
            codigo, motivo = postar(conf, f.read())
        if codigo in (200, 400, 413) and os.path.exists(espera_json):
            os.remove(espera_json)  # o n.360 respondeu: a espera recomeca
            espera = {}
        if codigo == 200:
            os.remove(caminho)
            log("enviado %s" % nome)
        elif codigo in (400, 413):
            rejeitar(caminho, rejeitados, "HTTP %d: %s" % (codigo, motivo))
            saida = 1
        elif codigo in (401, 403) or (codigo and 300 <= codigo < 400):  # 3xx: url errada na conf
            log("erro: HTTP %d: %s; envio interrompido, a fila fica" % (codigo, motivo))
            return 1
        else:
            falhas = 0 if codigo == 429 else espera.get("falhas", 0) + 1
            proxima = agora + (86400 if codigo == 429 else ESPERAS[min(falhas, len(ESPERAS)) - 1])
            gravar(espera_json, json.dumps({"proxima": proxima, "falhas": falhas}))
            log("erro: %s: %s; nova tentativa a partir de %s" % ("HTTP %d" % codigo if codigo else "rede", motivo, iso(proxima)))
            return 1
    return saida


def enviar(pasta, conf_caminho, estado, horas=24, agora=None, so_fila=False):
    """Poe o resumo das ultimas horas na fila e esvazia a fila; com so_fila, so esvazia (timer de 5 min das esperas)."""
    agora = time.time() if agora is None else agora
    try:
        conf = ler_conf(conf_caminho)
    except (OSError, ValueError) as e:
        log("erro: " + str(e))
        return 2
    for sub in ("fila", "rejeitados"):
        os.makedirs(os.path.join(estado, sub), mode=0o700, exist_ok=True)
    saida = 0
    try:
        if so_fila:
            return esvaziar(estado, conf, agora)
        r = resumir(pasta, janela=(agora - horas * 3600, agora))
        nome = datetime.fromtimestamp(agora, timezone.utc).strftime("%Y%m%dT%H%M%S") + ".json"
        gravar(os.path.join(estado, "fila", nome), caber(r))
        log("na fila %s: %d ativos, %d conexoes" % (nome, len(r["ativos"]), len(r["conexoes"])))
    except (FileNotFoundError, NotADirectoryError) as e:
        log("erro: " + str(e))
        saida = 2  # a fila antiga ainda sai
    return esvaziar(estado, conf, agora) or saida


def main(argv=None):
    ap = argparse.ArgumentParser(description="Resume logs JSON do Zeek para o n.ot")
    ap.add_argument("pasta")
    ap.add_argument("-o", "--saida", default="resumo.json")
    ap.add_argument("--ultimas-horas", type=float, help="so os registros das ultimas N horas (padrao no --enviar: 24)")
    ap.add_argument("--enviar", action="store_true", help="poe o resumo na fila e envia ao n.ot")
    ap.add_argument("--conf", default="/etc/n-ot-sonda.conf")
    ap.add_argument("--estado", default="/var/lib/n-ot-sonda")
    ap.add_argument("--so-fila", action="store_true", help="com --enviar: nao gera resumo, so esvazia a fila")
    args = ap.parse_args(argv)
    if args.enviar:
        return enviar(args.pasta, args.conf, args.estado, args.ultimas_horas or 24, so_fila=args.so_fila)
    agora = time.time()
    try:
        r = resumir(args.pasta, janela=(agora - args.ultimas_horas * 3600, agora) if args.ultimas_horas else None)
    except (FileNotFoundError, NotADirectoryError) as e:
        print("erro: " + str(e), file=sys.stderr)
        return 2
    with open(args.saida, "w", encoding="utf-8") as f:
        f.write(caber(r))
    print("%s: %d ativos, %d conexoes" % (args.saida, len(r["ativos"]), len(r["conexoes"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
