#!/usr/bin/env python3
"""
Verifica un respaldo ZIP/SQL generado por la app Sodimac.

Uso:
  python tools/verificar-respaldo.py ruta/al/respaldo.zip

Salida:
  0 = OK
  1 = Error (mensaje claro)
"""
import sys
import os
import zipfile
import sqlite3
import io

TABLAS_CRITICAS = [
    "sod_user",
    "sod_sucursal",
    "sod_evento_inventario",
    "sod_producto",
    "sod_producto_detalle",
    "sod_muestra",
    "sod_muestra_detalle",
    "sod_pda",
    "sod_zona",
    "sod_ubicacion",
    "sod_sincronizacion",
    "sod_conteo",
    "sod_conteo_detalle",
]

MARCADORES = [
    "PRAGMA foreign_keys=OFF;",
    "BEGIN TRANSACTION;",
    "COMMIT;",
]


def fail(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) != 2:
        print("Uso: python tools/verificar-respaldo.py ruta/al/respaldo.zip")
        sys.exit(1)

    ruta = sys.argv[1]

    if not os.path.isfile(ruta):
        fail(f"Archivo no encontrado: {ruta}")

    if not zipfile.is_zipfile(ruta):
        fail(f"No es un ZIP valido: {ruta}")

    with zipfile.ZipFile(ruta, "r") as zf:
        archivos_sql = [n for n in zf.namelist() if n.endswith(".sql")]
        if len(archivos_sql) == 0:
            fail("No se encontro ningun archivo .sql dentro del ZIP")
        if len(archivos_sql) > 1:
            fail(f"Se encontraron {len(archivos_sql)} archivos .sql (se esperaba 1)")

        nombre_sql = archivos_sql[0]
        print(f"Archivo SQL encontrado: {nombre_sql}")

        with zf.open(nombre_sql) as f:
            sql_bytes = f.read()

    try:
        sql_texto = sql_bytes.decode("utf-8")
    except UnicodeDecodeError:
        fail("El archivo .sql no se pudo leer como UTF-8")

    # Validar marcadores
    for marcador in MARCADORES:
        if marcador not in sql_texto:
            fail(f"Falta marcador: {marcador}")

    print("Marcadores de dump OK")

    # Restaurar en SQLite in-memory
    try:
        con = sqlite3.connect(":memory:")
        con.executescript(sql_texto)
    except sqlite3.DatabaseError as e:
        fail(f"Error al restaurar SQL en SQLite: {e}")

    # Verificar tablas criticas
    cursor = con.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tablas_existentes = {row[0] for row in cursor.fetchall()}

    faltan = [t for t in TABLAS_CRITICAS if t not in tablas_existentes]
    if faltan:
        con.close()
        fail(f"Tablas criticas faltantes: {', '.join(faltan)}")

    print("Tablas criticas OK")

    # Resumen de filas
    print("")
    print("Resumen de filas por tabla:")
    for tabla in TABLAS_CRITICAS:
        try:
            count = con.execute(f'SELECT COUNT(*) FROM "{tabla}"').fetchone()[0]
            print(f"  {tabla}: {count}")
        except sqlite3.DatabaseError:
            print(f"  {tabla}: ERROR al contar")

    con.close()
    print("")
    print("OK: respaldo valido y restaurable")


if __name__ == "__main__":
    main()
