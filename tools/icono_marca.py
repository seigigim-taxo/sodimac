#!/usr/bin/env python3
"""
La marca del ícono, en un solo lugar.

La usan generar-icono.py (favicon .ico) y generar-iconos-android.py (launcher).
Si se toca el diseño acá, las dos salidas quedan iguales; duplicando la
geometría se irían separando sin que nadie lo note.

La marca es la etiqueta (TAG): el objeto que organiza toda la app y lo que el
operador pega y escanea en la góndola. Las barras internas son el guiño al
escaneo. Es un diseño original con los colores del tema — no reproduce el
logotipo de Sodimac.
"""

from PIL import Image, ImageDraw

BLANCO = (255, 255, 255, 255)

# Rampa magenta → violeta con los tokens del tema: --app-primary,
# --app-secondary y --app-accent. La parada intermedia va pasado el medio a
# propósito: deja que domine el magenta, que es el color con el que se
# reconoce la app, y reserva el violeta para el remate.
GRADIENTE = [
    (0.00, (230, 18, 106)),   # --app-primary   #E6126A
    (0.58, (191, 36, 160)),   # --app-secondary #BF24A0
    (1.00, (63, 32, 135)),    # --app-accent    #3F2087
]

# La etiqueta va inclinada: horizontal desperdiciaba la mitad del alto y a
# tamaño chico la silueta se leía como un rectángulo cualquiera. En diagonal
# aprovecha la diagonal del cuadrado y la punta queda inconfundible.
INCLINACION = 30
LIENZO = 2048  # se dibuja grande y se reduce: la rotación queda limpia

# Cuánto del lienzo ocupa la etiqueta ya rotada. Sirve para calcular márgenes.
PROPORCION_ETIQUETA = 0.80


def color_en(t: float) -> tuple[int, int, int]:
    """Color de la rampa en la posición t (0..1), interpolando entre paradas."""
    for (t0, c0), (t1, c1) in zip(GRADIENTE, GRADIENTE[1:]):
        if t <= t1:
            f = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
            return tuple(round(a + (b - a) * f) for a, b in zip(c0, c1))
    return GRADIENTE[-1][1]


def fondo(lado: int, radio_rel: float | None = 0.22) -> Image.Image:
    """
    Cuadrado con el gradiente en diagonal. `radio_rel` redondea las esquinas;
    en None sale a bordes rectos, que es lo que necesita el ícono adaptativo
    de Android porque la máscara la aplica el sistema.

    El degradado se calcula chico y se amplía: uno lineal escala sin
    artefactos, y a tamaño completo el cálculo pixel a pixel en Python puro
    tardaría sin ganar nada.
    """
    n = 256
    grad = Image.new("RGB", (n, n))
    px = grad.load()
    for y in range(n):
        for x in range(n):
            # Proyección sobre la diagonal: claro arriba-izquierda, oscuro abajo-derecha.
            px[x, y] = color_en((x + y) / (2 * (n - 1)))

    img = grad.resize((lado, lado), Image.BICUBIC).convert("RGBA")

    if radio_rel is not None:
        recorte = Image.new("L", (lado, lado), 0)
        ImageDraw.Draw(recorte).rounded_rectangle(
            [0, 0, lado - 1, lado - 1], radius=int(lado * radio_rel), fill=255
        )
        img.putalpha(recorte)

    return img


def _mascara_base(con_barras: bool) -> Image.Image:
    """
    La etiqueta como máscara (modo L) a tamaño LIENZO, sin rotar.

    Es máscara y no una capa de color porque el agujero y las barras tienen que
    dejar ver el fondo: pintándolos de un color plano quedarían como manchas
    que no siguen el degradado.
    """
    capa = Image.new("L", (LIENZO, LIENZO), 0)
    d = ImageDraw.Draw(capa)

    cx = cy = LIENZO / 2
    largo, alto = 1450, 760          # cuerpo + punta
    punta = 370
    x0, y0 = cx - largo / 2, cy - alto / 2
    x1, y1 = cx + largo / 2, cy + alto / 2

    radio = 135
    base = x0 + punta

    # Cuerpo con las esquinas redondeadas SOLO a la derecha: se dibuja el
    # rectángulo redondeado y se cuadra el lado izquierdo tapándolo. Así la
    # arista izquierda mide el alto completo y el triángulo nace justo de ella.
    # Dejando ese lado redondeado, la punta arrancaba más adentro y quedaba un
    # escalón.
    d.rounded_rectangle([base, y0, x1, y1], radius=radio, fill=255)
    d.rectangle([base, y0, base + radio, y1], fill=255)
    d.polygon([(base, y0), (base, y1), (x0, cy)], fill=255)

    # Perforación calada dentro de la punta.
    hx, r = x0 + punta * 0.62, 92
    d.ellipse([hx - r, cy - r, hx + r, cy + r], fill=0)

    if con_barras:
        inicio = x0 + punta + 160
        for ancho, hueco in [(88, 58), (50, 50), (108, 58), (50, 50), (82, 0)]:
            d.rounded_rectangle([inicio, y0 + 160, inicio + ancho, y1 - 160],
                                radius=20, fill=0)
            inicio += ancho + hueco

    return capa


def mascara_etiqueta(lado: int, con_barras: bool, ocupacion: float) -> Image.Image:
    """Etiqueta rotada y llevada a `lado` px. `ocupacion` la escala en el cuadro."""
    capa = _mascara_base(con_barras).rotate(
        INCLINACION, resample=Image.BICUBIC, expand=False
    )
    destino = max(1, int(lado * ocupacion))
    return capa.resize((destino, destino), Image.LANCZOS)


def icono(lado: int, con_barras: bool, radio_rel: float | None = 0.22,
          ocupacion: float = 0.98) -> Image.Image:
    """Ícono completo: gradiente de fondo con la etiqueta blanca encima."""
    img = fondo(lado, radio_rel)
    etiqueta = mascara_etiqueta(lado, con_barras, ocupacion)

    # La etiqueta es una máscara: se pinta blanco donde vale y el gradiente
    # queda intacto en los recortes del agujero y las barras.
    off = (lado - etiqueta.width) // 2
    img.paste(BLANCO, (off, off), etiqueta)
    return img


def etiqueta_sobre_transparente(lado: int, con_barras: bool,
                                ocupacion: float) -> Image.Image:
    """Solo la etiqueta blanca, sin fondo. Es la capa frontal del adaptativo."""
    img = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    etiqueta = mascara_etiqueta(lado, con_barras, ocupacion)
    off = (lado - etiqueta.width) // 2
    img.paste(BLANCO, (off, off), etiqueta)
    return img
