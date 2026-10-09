"""
H1 — El servidor y el proxy del laboratorio: qué pasa cuando la respuesta se pierde.

Requiere el laboratorio arriba (ver tools/lab/README.md): MySQL desechable en :3399,
el servidor PHP en :8099 y tools/lab/proxy-lab.mjs en :8081.

OJO: el esquema de la base de prueba está DEDUCIDO del código, no es el DDL real.

Uso:  python tools/lab/probar-respuesta-perdida.py
"""
import http.client
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

PROXY = "127.0.0.1:8081"
BASE = f"http://{PROXY}/api/sincronizaciones/"
MYSQL = r"C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysql.exe"

resultados = []


def http_json(metodo, ruta, cuerpo=None):
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(BASE + ruta, data=datos, method=metodo, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        texto = e.read().decode("utf-8")
        try:
            return e.code, json.loads(texto)
        except ValueError:
            return e.code, {"_crudo": texto}


def control(ruta, metodo="POST"):
    req = urllib.request.Request(f"http://{PROXY}/__lab/{ruta}", method=metodo)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


def sql(consulta):
    r = subprocess.run(
        [MYSQL, "-u", "root", "-h", "127.0.0.1", "-P", "3399", "-N", "-B", "-D", "sodimac_prueba", "-e", consulta],
        capture_output=True, text=True, encoding="utf-8",
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr)
    return [l.split("\t") for l in r.stdout.strip().split("\n") if l != ""]


def cuenta(tabla):
    return int(sql(f"SELECT COUNT(*) FROM {tabla}")[0][0])


def limpiar():
    sql("DELETE FROM sod_pda_tag_carga_detalle; DELETE FROM sod_pda_tag_carga;")
    control("reset")


def lectura(uid, n, cantidad=1):
    return {"lectura_uid": f"{uid}-LECT{n}", "codigo_lectura": "2000000672281", "medio_captura": "ESCANER",
            "cantidad": cantidad, "fecha_hora": "2026-10-05 10:19:34.123"}


def payload(uid="UID-1", cantidades=(1, 1, 1), tag="7001"):
    return {
        "carga_uid": uid, "codigo_tienda": "4093", "fecha_programada": "2026-10-05", "iteracion": 1,
        "tag_codigo": tag, "zona_nombre": "OTRO", "zona_descripcion": "Pto. vta. otros",
        "operador_rut": "19756709", "operador_login": "197567090", "pda_codigo": "PDA-1",
        "codigo_muestra": "MUE-1", "id_agenda": 2714, "numero_agenda": "AG-20261005-4093-01",
        "detalles": [{"detalle_uid": f"{uid}-DET1", "sku": "672289", "codigo_barras": "2000000672281",
                      "descripcion": "TAPA CAMARA",
                      "lecturas": [lectura(uid, i + 1, c) for i, c in enumerate(cantidades)]}],
    }


def post_tag(p):
    return http_json("POST", "tag-finalizado.php", p)


def post_tag_sin_respuesta(p):
    """Devuelve True si la conexión se cortó sin respuesta (lo que vería la PDA)."""
    try:
        post_tag(p)
        return False
    except (urllib.error.URLError, http.client.HTTPException, ConnectionError, OSError):
        return True


def consulta(uids):
    return http_json("POST", "estado-cargas.php", {"carga_uids": uids})


def prueba(nombre):
    def deco(fn):
        try:
            limpiar()
            fn()
            resultados.append((nombre, True, ""))
        except AssertionError as e:
            resultados.append((nombre, False, str(e)))
        except Exception as e:  # noqa
            resultados.append((nombre, False, f"{type(e).__name__}: {e}"))
        finally:
            try:
                control("modo/normal")
            except Exception:  # noqa
                pass
        return fn
    return deco


def eq(real, esperado, que=""):
    assert real == esperado, f"{que}: esperaba {esperado!r} y llegó {real!r}"


# =============================================================================
@prueba("normal: el envío llega y la respuesta vuelve")
def _():
    st, r = post_tag(payload("UID-1"))
    eq(st, 200, "http")
    eq(r["data"]["recepcion"], "RECIBIDO", "recepcion")
    eq(cuenta("sod_pda_tag_carga"), 1, "cabeceras")


@prueba("respuesta perdida: el servidor lo guarda y la PDA no recibe nada")
def _():
    control("modo/perder-respuesta")
    eq(post_tag_sin_respuesta(payload("UID-1")), True, "la conexión debía cortarse")
    eq(cuenta("sod_pda_tag_carga"), 1, "el servidor SÍ lo tiene")
    eq(cuenta("sod_pda_tag_carga_detalle"), 3, "lecturas guardadas")


@prueba("respuesta perdida: estado-cargas lo ve y cuenta las lecturas")
def _():
    control("modo/perder-respuesta")
    post_tag_sin_respuesta(payload("UID-1"))
    control("modo/normal")
    st, r = consulta(["UID-1", "OTRO"])
    eq(st, 200, "http")
    por_uid = {c["carga_uid"]: c for c in r["data"]["cargas"]}
    eq(por_uid["UID-1"]["existe"], True, "existe")
    eq(por_uid["UID-1"]["total_lecturas"], 3, "lecturas")
    eq(por_uid["UID-1"]["tag_codigo"], "7001", "tag")
    eq(por_uid["OTRO"]["existe"], False, "el desconocido no existe")


@prueba("respuesta perdida: reenviar el MISMO envío no duplica nada")
def _():
    control("modo/perder-respuesta")
    post_tag_sin_respuesta(payload("UID-1"))
    control("modo/normal")
    st, r = post_tag(payload("UID-1"))
    eq(st, 200, "http")
    eq(r["data"]["recepcion"], "YA_RECIBIDO", "recepcion")
    eq(r["data"]["coincide"], True, "coincide")
    eq(cuenta("sod_pda_tag_carga"), 1, "cabeceras")
    eq(cuenta("sod_pda_tag_carga_detalle"), 3, "lecturas (sin duplicar)")


@prueba("el caso del TAG 7001: se editó tras perder la respuesta y se reenvía con otro contenido → 409")
def _():
    control("modo/perder-respuesta")
    post_tag_sin_respuesta(payload("UID-1", (1, 1, 1)))
    control("modo/normal")
    st, r = post_tag(payload("UID-1", (1, 1, 1, 1, 1)))
    eq(st, 409, "http")
    eq(r.get("codigo"), "CARGA_EXISTENTE_DISTINTA", "codigo")
    eq((r["data"]["lecturas_servidor"], r["data"]["lecturas_enviadas"]), (3, 5), "conteos")
    eq(cuenta("sod_pda_tag_carga_detalle"), 3, "el servidor conserva lo primero")


@prueba("perder-respuesta-una: solo la primera se pierde; el reintento pasa")
def _():
    control("modo/perder-respuesta-una")
    eq(post_tag_sin_respuesta(payload("UID-1")), True, "la primera se corta")
    st, r = post_tag(payload("UID-1"))
    eq(st, 200, "http")
    eq(r["data"]["recepcion"], "YA_RECIBIDO", "la segunda ve que ya estaba")
    eq(control("modo", "GET")["modo"], "normal", "el modo vuelve solo")


@prueba("cortar-antes: el pedido nunca llega; el servidor no tiene nada")
def _():
    control("modo/cortar-antes")
    eq(post_tag_sin_respuesta(payload("UID-1")), True, "se corta")
    eq(cuenta("sod_pda_tag_carga"), 0, "nada guardado")
    control("modo/normal")
    st, r = consulta(["UID-1"])
    eq(r["data"]["cargas"][0]["existe"], False, "no existe")


@prueba("rechazar: 503 sin tocar el servidor")
def _():
    control("modo/rechazar")
    st, _ = post_tag(payload("UID-1"))
    eq(st, 503, "http")
    eq(cuenta("sod_pda_tag_carga"), 0, "nada guardado")


@prueba("lento: la respuesta llega con demora y completa")
def _():
    control("modo/lento-1500")
    t0 = time.time()
    st, r = post_tag(payload("UID-1"))
    eq(st, 200, "http")
    assert time.time() - t0 >= 1.4, "debía demorar"
    eq(r["data"]["recepcion"], "RECIBIDO", "recepcion")


@prueba("caido: también se cortan las consultas de estado")
def _():
    control("modo/caido")
    try:
        consulta(["UID-1"])
        assert False, "debía cortarse"
    except (urllib.error.URLError, http.client.HTTPException, ConnectionError, OSError):
        pass


@prueba("el servidor rechaza una cantidad negativa con 400 (la PDA no debe mandarlas)")
def _():
    st, r = post_tag(payload("UID-1", (1, -1)))
    eq(st, 400, "http")
    eq(cuenta("sod_pda_tag_carga"), 0, "nada guardado")


@prueba("el registro del proxy anota lo que pasó")
def _():
    control("modo/perder-respuesta")
    post_tag_sin_respuesta(payload("UID-1"))
    log = control("log", "GET")
    assert any("respuesta perdida" in str(e["estado"]) for e in log), f"sin anotación: {log}"


# =============================================================================
ok = sum(1 for _, bien, _ in resultados if bien)
for nombre, bien, detalle in resultados:
    print(("OK   " if bien else "FALLA"), nombre, ("" if bien else f"\n        -> {detalle}"))
print(f"\n{ok}/{len(resultados)} pruebas OK")
sys.exit(0 if ok == len(resultados) else 1)
