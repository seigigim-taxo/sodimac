#!/usr/bin/env python3
"""
Genera el juego de íconos del launcher de Android.

    python tools/generar-iconos-android.py

Produce tres cosas por densidad:

  ic_launcher.png            ícono clásico, esquinas redondeadas (API < 26)
  ic_launcher_round.png      variante circular, para launchers que la piden
  ic_launcher_foreground.png capa frontal del ícono adaptativo (API 26+)

Y el fondo del adaptativo como drawable vectorial con el degradado, en vez de
PNGs por densidad: una <shape> escala sola y pesa nada.

El adaptativo se dibuja sobre 108dp pero el sistema recorta con la máscara del
launcher —círculo, squircle, lo que use el equipo— y solo garantiza los 72dp
centrales. Por eso la etiqueta va más chica en la capa frontal que en el ícono
clásico: si ocupara lo mismo, un launcher circular le cortaría las puntas.
"""

from pathlib import Path

from PIL import Image, ImageDraw

from icono_marca import GRADIENTE, etiqueta_sobre_transparente, icono

RES = Path(__file__).resolve().parent.parent / "android" / "app" / "src" / "main" / "res"

# densidad → (lado del ícono clásico, lado de la capa frontal 108dp)
DENSIDADES = {
    "mdpi":    (48, 108),
    "hdpi":    (72, 162),
    "xhdpi":   (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

# El ícono clásico llena el cuadro; la capa frontal se queda dentro de la zona
# segura de 72dp sobre 108dp.
OCUPACION_CLASICO = 0.98
OCUPACION_FRONTAL = 0.78

ADAPTATIVO = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
"""


def hex_de(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def fondo_vectorial() -> str:
    """
    El degradado como <shape>. El ángulo 315 corre de arriba-izquierda a
    abajo-derecha, igual que el del favicon; Android solo admite múltiplos de 45.
    """
    inicio, centro, fin = (hex_de(c) for _, c in GRADIENTE)
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!-- Generado por tools/generar-iconos-android.py -->
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <gradient
        android:type="linear"
        android:angle="315"
        android:startColor="{inicio}"
        android:centerColor="{centro}"
        android:endColor="{fin}" />
</shape>
"""


def circular(img: Image.Image) -> Image.Image:
    """Recorta a círculo, para ic_launcher_round."""
    mascara = Image.new("L", img.size, 0)
    ImageDraw.Draw(mascara).ellipse([0, 0, img.width - 1, img.height - 1], fill=255)
    salida = img.copy()
    salida.putalpha(mascara)
    return salida


def main() -> None:
    escritos = 0

    for densidad, (lado, lado_frontal) in DENSIDADES.items():
        carpeta = RES / f"mipmap-{densidad}"
        carpeta.mkdir(parents=True, exist_ok=True)

        # Cada uno se dibuja a su medida final: reducir un maestro grande
        # emborrona las barras en mdpi, que es el más chico.
        clasico = icono(lado, con_barras=True, ocupacion=OCUPACION_CLASICO)
        clasico.save(carpeta / "ic_launcher.png", optimize=True)

        circular(icono(lado, con_barras=True, radio_rel=None,
                       ocupacion=OCUPACION_CLASICO)).save(
            carpeta / "ic_launcher_round.png", optimize=True)

        etiqueta_sobre_transparente(
            lado_frontal, con_barras=True, ocupacion=OCUPACION_FRONTAL
        ).save(carpeta / "ic_launcher_foreground.png", optimize=True)

        escritos += 3
        print(f"  mipmap-{densidad:<8} {lado}px clásico y redondo · {lado_frontal}px frontal")

    drawable = RES / "drawable"
    drawable.mkdir(parents=True, exist_ok=True)
    (drawable / "ic_launcher_background.xml").write_text(fondo_vectorial(), encoding="utf-8")

    anydpi = RES / "mipmap-anydpi-v26"
    anydpi.mkdir(parents=True, exist_ok=True)
    for nombre in ("ic_launcher.xml", "ic_launcher_round.xml"):
        (anydpi / nombre).write_text(ADAPTATIVO, encoding="utf-8")

    print(f"\n{escritos} PNG + drawable/ic_launcher_background.xml + 2 adaptativos")


if __name__ == "__main__":
    main()
