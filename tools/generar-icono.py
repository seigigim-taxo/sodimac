#!/usr/bin/env python3
"""
Genera el favicon .ico de Control de Inventario.

    python tools/generar-icono.py

El diseño vive en icono_marca.py, compartido con el generador de íconos de
Android para que las dos salidas no se separen.
"""

import struct
from io import BytesIO
from pathlib import Path

from PIL import Image

from icono_marca import icono

SALIDA = Path(__file__).resolve().parent.parent / "src" / "assets" / "icon" / "favicon.ico"
SALIDA_PNG = SALIDA.with_name("favicon-512.png")

# Tamaño → si lleva barras. Bajo 48 px se empastan y ensucian la silueta, que
# es lo único que se llega a leer, así que ahí manda la silueta sola.
TAMANOS = {16: False, 24: False, 32: False, 48: True, 64: True, 128: True, 256: True}

# Sin barras la silueta puede ocupar algo más sin verse cargada.
OCUPACION = {True: 0.98, False: 1.04}


def escribir_ico(entradas: list[tuple[int, bytes]], destino: Path) -> None:
    """
    Empaqueta el .ico a mano para poder elegir qué variante va en cada tamaño;
    Pillow, al guardar con `sizes=`, reduce siempre desde una sola imagen.
    Las entradas van como PNG, soportado por Windows desde Vista.
    """
    n = len(entradas)
    cabecera = struct.pack("<HHH", 0, 1, n)
    offset = 6 + 16 * n
    directorio, cuerpos = b"", b""

    for lado, datos in entradas:
        directorio += struct.pack(
            "<BBBBHHII",
            0 if lado >= 256 else lado,   # 0 significa 256 en el formato
            0 if lado >= 256 else lado,
            0, 0, 1, 32, len(datos), offset,
        )
        cuerpos += datos
        offset += len(datos)

    destino.write_bytes(cabecera + directorio + cuerpos)


def png_bytes(img: Image.Image) -> bytes:
    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def main() -> None:
    entradas = []
    for lado, barras in sorted(TAMANOS.items()):
        # Cada tamaño se dibuja a su medida y no reduciendo uno grande: así el
        # gradiente y los bordes se resuelven a la resolución final.
        img = icono(lado * 4, barras, ocupacion=OCUPACION[barras])
        entradas.append((lado, png_bytes(img.resize((lado, lado), Image.LANCZOS))))

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    escribir_ico(entradas, SALIDA)
    icono(512, True, ocupacion=OCUPACION[True]).save(SALIDA_PNG, optimize=True)

    print(f"{SALIDA.name}  {SALIDA.stat().st_size / 1024:.1f} KB")
    for lado, datos in entradas:
        print(f"  {lado:>3}px  {len(datos):>6} B  "
              f"{'con barras' if TAMANOS[lado] else 'silueta'}")
    print(f"{SALIDA_PNG.name}  {SALIDA_PNG.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
