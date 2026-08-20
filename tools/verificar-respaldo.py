#!/usr/bin/env python3
"""
Verifica un respaldo generado por la app: abre el .zip, restaura el .sql en una
base nueva y revisa que haya quedado consistente.

    python tools/verificar-respaldo.py respaldo.zip

Con --guardar deja la base restaurada en disco para abrirla con un visor.
"""

import argparse
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

# Tablas que, si vienen vacías, casi siempre significan que el respaldo se tomó
# antes de que la PDA descargara datos. No es un error del respaldo, pero es
# justo lo que uno quiere saber antes de confiar en él.
TABLAS_CLAVE = [
    "sod_user",
    "sod_sucursal",
    "sod_evento_inventario",
    "sod_muestra",
    "sod_muestra_detalle",
    "sod_producto",
    "sod_conteo",
    "sod_conteo_detalle",
]


# La consola de Windows usa cp1252 por defecto y destroza los acentos de la
# salida. Se fuerza UTF-8; si la consola no lo soporta, se sigue igual.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass


def extraer_sql(ruta_zip: Path) -> tuple[str, str]:
    with zipfile.ZipFile(ruta_zip) as z:
        sqls = [n for n in z.namelist() if n.lower().endswith(".sql")]
        if not sqls:
            raise SystemExit(f"El zip no contiene ningún .sql (tiene: {', '.join(z.namelist()) or 'nada'})")
        if len(sqls) > 1:
            raise SystemExit(f"El zip tiene más de un .sql: {', '.join(sqls)}")
        return sqls[0], z.read(sqls[0]).decode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("zip", type=Path, help="ruta al respaldo .zip")
    parser.add_argument("--guardar", type=Path, help="dejar la base restaurada en esta ruta")
    args = parser.parse_args()

    if not args.zip.exists():
        raise SystemExit(f"No existe: {args.zip}")

    nombre_sql, script = extraer_sql(args.zip)
    print(f"Archivo   : {args.zip.name}  ({args.zip.stat().st_size / 1024:.0f} KB)")
    print(f"Contenido : {nombre_sql}  ({len(script.encode('utf-8')) / 1024:.0f} KB sin comprimir)")
    print(f"Sentencias: {script.count(';')}")
    print()

    destino = args.guardar or Path(tempfile.gettempdir()) / "respaldo-verificado.db"
    destino.unlink(missing_ok=True)

    con = sqlite3.connect(destino)
    try:
        try:
            con.executescript(script)
        except sqlite3.Error as err:
            print(f"FALLA: el .sql no se pudo restaurar\n  {err}")
            return 1

        cur = con.cursor()
        tablas = [
            r[0] for r in cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]

        print(f"{'TABLA':<28} {'FILAS':>8}")
        print("-" * 38)
        conteos: dict[str, int] = {}
        for tabla in tablas:
            n = cur.execute(f'SELECT COUNT(*) FROM "{tabla}"').fetchone()[0]
            conteos[tabla] = n
            print(f"{tabla:<28} {n:>8}")
        print()

        problemas: list[str] = []

        integridad = cur.execute("PRAGMA integrity_check").fetchone()[0]
        print(f"integrity_check    : {integridad}")
        if integridad != "ok":
            problemas.append("la base restaurada no pasa integrity_check")

        huerfanas = cur.execute("PRAGMA foreign_key_check").fetchall()
        print(f"foreign_key_check  : {'ok' if not huerfanas else f'{len(huerfanas)} fila(s) huérfanas'}")
        if huerfanas:
            for fila in huerfanas[:5]:
                print(f"    tabla={fila[0]} rowid={fila[1]} apunta a {fila[2]}")
            problemas.append("hay filas que apuntan a registros inexistentes")

        indices = cur.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
        ).fetchone()[0]
        print(f"índices restaurados: {indices}")

        vacias = [t for t in TABLAS_CLAVE if conteos.get(t, 0) == 0]
        if vacias:
            print(f"\nAviso: tablas clave vacías -> {', '.join(vacias)}")
            print("       El respaldo es válido, pero se tomó sin esos datos cargados.")

        print()
        if problemas:
            for p in problemas:
                print(f"FALLA: {p}")
            return 1

        print("OK — el respaldo se restaura completo y consistente.")
        if args.guardar:
            print(f"Base restaurada en: {destino}")
        return 0
    finally:
        con.close()


if __name__ == "__main__":
    sys.exit(main())
