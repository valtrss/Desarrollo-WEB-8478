# -*- coding: utf-8 -*-
"""Ilustraciones vectoriales para el catalogo de La Nonna.

Una por producto, en SVG. No son fotos: son dibujos propios, para que el
catalogo se vea intencional y no quede con marcadores de posicion.

Si mas adelante hay fotos reales, basta con dejarlas en frontend/web/img/
con el mismo nombre y extension .jpg: el frontend prueba primero el .jpg.
"""
import math
import os
import random

OUT = "/Applications/XAMPP/xamppfiles/htdocs/Desarrollo-WEB-8478/frontend/web/img"
os.makedirs(OUT, exist_ok=True)

W, H = 640, 360
TRAZO = "#2E3138"
FONDO = "#FAF6EF"
TABLA = "#EFE6D6"
SOMBRA = "rgba(46,49,56,0.10)"

# Tonos de masa y de salsa
MASA = {
    "huevo":    ("#EFC25E", "#D9A63E"),
    "semola":   ("#E8D6A6", "#CFB882"),
    "espinaca": ("#8FB176", "#6F9159"),
    "zapallo":  ("#EFA75E", "#D4873D"),
    "papa":     ("#F0DFBC", "#D6C296"),
}
SALSA = {
    "tomate":   ("#C0453A", "#9E3328"),
    "pesto":    ("#6E9A52", "#55793D"),
    "crema":    ("#F2E3C6", "#DCC9A3"),
    "azul":     ("#A7B2CE", "#8793B3"),
    "carne":    ("#A7572F", "#85401F"),
    "aceituna": ("#7C6B48", "#5F5134"),
}


def cabecera(semilla):
    random.seed(semilla)
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
        '<defs>'
        '<filter id="s" x="-20%" y="-20%" width="140%" height="140%">'
        '<feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#2E3138" flood-opacity="0.18"/>'
        '</filter>'
        '</defs>',
        f'<rect width="{W}" height="{H}" fill="{FONDO}"/>',
        # Tabla de madera clara, para que todas las piezas compartan escenario
        f'<rect x="38" y="30" width="{W-76}" height="{H-60}" rx="18" fill="{TABLA}"/>',
        f'<rect x="38" y="30" width="{W-76}" height="{H-60}" rx="18" fill="none" '
        f'stroke="{TRAZO}" stroke-opacity="0.12" stroke-width="2"/>',
    ]


def harina(n=26):
    """Motas de harina sobre la tabla."""
    o = []
    for _ in range(n):
        x = random.uniform(60, W - 60)
        y = random.uniform(50, H - 50)
        r = random.uniform(1.2, 3.2)
        o.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="#FFFFFF" opacity="0.55"/>')
    return o


def borde_ondulado(x, y, w, h, dientes=7):
    """Rectangulo con borde dentado, como el corte de la ruedita."""
    p = []
    paso = w / dientes
    for i in range(dientes):
        p.append(f"L{x + paso * (i + 0.5):.1f} {y - 4:.1f} L{x + paso * (i + 1):.1f} {y:.1f}")
    arriba = f"M{x:.1f} {y:.1f} " + " ".join(p)
    p = []
    paso = h / max(2, dientes - 2)
    for i in range(max(2, dientes - 2)):
        p.append(f"L{x + w + 4:.1f} {y + paso * (i + 0.5):.1f} L{x + w:.1f} {y + paso * (i + 1):.1f}")
    derecha = " ".join(p)
    p = []
    paso = w / dientes
    for i in range(dientes):
        p.append(f"L{x + w - paso * (i + 0.5):.1f} {y + h + 4:.1f} L{x + w - paso * (i + 1):.1f} {y + h:.1f}")
    abajo = " ".join(p)
    p = []
    paso = h / max(2, dientes - 2)
    for i in range(max(2, dientes - 2)):
        p.append(f"L{x - 4:.1f} {y + h - paso * (i + 0.5):.1f} L{x:.1f} {y + h - paso * (i + 1):.1f}")
    izquierda = " ".join(p)
    return arriba + " " + derecha + " " + abajo + " " + izquierda + " Z"


# --- familias de forma ------------------------------------------------------
def rellena_cuadrada(masa, relleno):
    claro, oscuro = MASA[masa]
    o = []
    lado, sep = 112, 18
    inicio_x = (W - (3 * lado + 2 * sep)) / 2
    for fila in range(2):
        for col in range(3):
            if fila == 1 and col == 2:
                continue
            x = inicio_x + col * (lado + sep) + (28 if fila else 0)
            y = 76 + fila * (lado + sep) - (6 if fila else 0)
            giro = random.uniform(-7, 7)
            o.append(f'<g transform="rotate({giro:.1f} {x+lado/2:.0f} {y+lado/2:.0f})" filter="url(#s)">')
            o.append(f'<path d="{borde_ondulado(x, y, lado, lado)}" fill="{claro}" '
                     f'stroke="{oscuro}" stroke-width="2.5" stroke-linejoin="round"/>')
            o.append(f'<rect x="{x+22:.0f}" y="{y+22:.0f}" width="{lado-44}" height="{lado-44}" '
                     f'rx="10" fill="{relleno}" opacity="0.5"/>')
            o.append(f'<circle cx="{x+lado/2:.0f}" cy="{y+lado/2:.0f}" r="7" fill="{oscuro}" opacity="0.35"/>')
            o.append('</g>')
    return o


def rellena_redonda(masa, relleno):
    claro, oscuro = MASA[masa]
    o = []
    for i, (cx, cy, r) in enumerate([(190, 150, 66), (330, 120, 58), (300, 245, 62), (450, 200, 60)]):
        o.append('<g filter="url(#s)">')
        o.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{claro}" stroke="{oscuro}" stroke-width="2.5"/>')
        o.append(f'<circle cx="{cx}" cy="{cy}" r="{r-16}" fill="{relleno}" opacity="0.45"/>')
        # pliegue central
        o.append(f'<path d="M{cx-r+14} {cy} Q{cx} {cy-20} {cx+r-14} {cy}" fill="none" '
                 f'stroke="{oscuro}" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>')
        o.append('</g>')
    return o


def media_luna(masa, relleno):
    claro, oscuro = MASA[masa]
    o = []
    for (cx, cy, r, giro) in [(195, 160, 70, -12), (340, 135, 62, 18), (330, 258, 60, -4), (460, 215, 58, 26)]:
        o.append(f'<g transform="rotate({giro} {cx} {cy})" filter="url(#s)">')
        o.append(f'<path d="M{cx-r} {cy} A{r} {r} 0 0 1 {cx+r} {cy} Q{cx} {cy+30} {cx-r} {cy} Z" '
                 f'fill="{claro}" stroke="{oscuro}" stroke-width="2.5" stroke-linejoin="round"/>')
        o.append(f'<path d="M{cx-r+16} {cy-4} A{r-16} {r-16} 0 0 1 {cx+r-16} {cy-4}" fill="{relleno}" opacity="0.45"/>')
        for k in range(5):
            px = cx - r + 16 + k * ((2 * r - 32) / 4)
            o.append(f'<line x1="{px:.0f}" y1="{cy}" x2="{px:.0f}" y2="{cy+11}" '
                     f'stroke="{oscuro}" stroke-width="2.5" stroke-linecap="round" opacity="0.75"/>')
        o.append('</g>')
    return o


def anillo(masa, relleno):
    claro, oscuro = MASA[masa]
    o = []
    for (cx, cy, r) in [(200, 155, 56), (335, 125, 50), (310, 250, 52), (452, 198, 54)]:
        o.append('<g filter="url(#s)">')
        o.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{claro}" stroke="{oscuro}" stroke-width="2.5"/>')
        o.append(f'<circle cx="{cx}" cy="{cy}" r="{r*0.42:.0f}" fill="{TABLA}" stroke="{oscuro}" stroke-width="2.5"/>')
        o.append(f'<path d="M{cx-r} {cy} A{r} {r} 0 0 1 {cx} {cy-r}" fill="none" '
                 f'stroke="{relleno}" stroke-width="9" stroke-linecap="round" opacity="0.5"/>')
        o.append('</g>')
    return o


def cinta(masa, ancho=22):
    """Cintas onduladas. Cuanto mas ancha la cinta, menos caben sin apelmazarse."""
    claro, oscuro = MASA[masa]
    o = []
    cuantas = 4 if ancho >= 30 else 6
    separacion = (H - 150) / max(1, cuantas - 1)
    for i in range(cuantas):
        y = 96 + i * separacion
        fase = random.uniform(0, math.pi)
        d = f"M104 {y:.0f}"
        for x in range(104, 505, 36):
            d += f" Q{x+18} {y + math.sin((x/62)+fase)*15:.0f} {x+36} {y:.0f}"
        o.append(f'<path d="{d}" fill="none" stroke="{oscuro}" stroke-width="{ancho+4}" '
                 f'stroke-linecap="round" opacity="0.5"/>')
        o.append(f'<path d="{d}" fill="none" stroke="{claro}" stroke-width="{ancho}" stroke-linecap="round"/>')
    return o


def hebra(masa):
    claro, oscuro = MASA[masa]
    o = ['<g filter="url(#s)">']
    for i in range(16):
        x = 96 + i * 29
        curva = random.uniform(-14, 14)
        o.append(f'<path d="M{x} 64 Q{x+curva:.0f} 180 {x} 296" fill="none" '
                 f'stroke="{oscuro}" stroke-width="10" stroke-linecap="round" opacity="0.5"/>')
        o.append(f'<path d="M{x} 64 Q{x+curva:.0f} 180 {x} 296" fill="none" '
                 f'stroke="{claro}" stroke-width="7" stroke-linecap="round"/>')
    o.append('</g>')
    return o


def lamina(masa):
    claro, oscuro = MASA[masa]
    o = []
    for i in range(4):
        x, y = 128 + i * 16, 92 + i * 34
        o.append(f'<g filter="url(#s)">')
        o.append(f'<path d="{borde_ondulado(x, y, 300, 56, 9)}" fill="{claro}" '
                 f'stroke="{oscuro}" stroke-width="2.5" stroke-linejoin="round"/>')
        o.append('</g>')
    return o


def tubo(masa, relleno):
    claro, oscuro = MASA[masa]
    o = []
    for i in range(3):
        y = 96 + i * 62
        o.append('<g filter="url(#s)">')
        o.append(f'<rect x="120" y="{y}" width="400" height="48" rx="24" fill="{claro}" '
                 f'stroke="{oscuro}" stroke-width="2.5"/>')
        o.append(f'<ellipse cx="120" cy="{y+24}" rx="13" ry="24" fill="{relleno}" '
                 f'stroke="{oscuro}" stroke-width="2.5"/>')
        o.append(f'<path d="M150 {y+12} L490 {y+12}" stroke="#FFFFFF" stroke-width="4" '
                 f'stroke-linecap="round" opacity="0.35"/>')
        o.append('</g>')
    return o


def noqui(masa):
    claro, oscuro = MASA[masa]
    o = []
    posiciones = [(165, 135), (255, 110), (345, 140), (430, 115),
                  (205, 220), (300, 245), (395, 220), (470, 250), (140, 255)]
    for (cx, cy) in posiciones:
        giro = random.uniform(-25, 25)
        o.append(f'<g transform="rotate({giro:.0f} {cx} {cy})" filter="url(#s)">')
        o.append(f'<ellipse cx="{cx}" cy="{cy}" rx="42" ry="30" fill="{claro}" '
                 f'stroke="{oscuro}" stroke-width="2.5"/>')
        for k in range(4):
            px = cx - 22 + k * 15
            o.append(f'<path d="M{px} {cy-17} Q{px+5} {cy} {px} {cy+17}" fill="none" '
                     f'stroke="{oscuro}" stroke-width="2.5" stroke-linecap="round" opacity="0.65"/>')
        o.append('</g>')
    return o


def salsa(tono):
    claro, oscuro = SALSA[tono]
    o = ['<g filter="url(#s)">']
    # frasco
    o.append(f'<rect x="236" y="96" width="168" height="196" rx="20" fill="#FFFFFF" '
             f'stroke="{TRAZO}" stroke-width="3" stroke-opacity="0.5"/>')
    o.append(f'<path d="M248 150 h144 v124 a16 16 0 0 1 -16 16 h-112 a16 16 0 0 1 -16 -16 Z" fill="{claro}"/>')
    o.append(f'<path d="M248 150 h144 v18 h-144 Z" fill="{oscuro}" opacity="0.55"/>')
    # tapa
    o.append(f'<rect x="252" y="70" width="136" height="34" rx="12" fill="{oscuro}" '
             f'stroke="{TRAZO}" stroke-width="2.5" stroke-opacity="0.5"/>')
    # etiqueta
    o.append(f'<rect x="262" y="196" width="116" height="56" rx="8" fill="{FONDO}" opacity="0.92"/>')
    o.append(f'<rect x="276" y="214" width="88" height="6" rx="3" fill="{TRAZO}" opacity="0.35"/>')
    o.append(f'<rect x="276" y="230" width="58" height="6" rx="3" fill="{TRAZO}" opacity="0.22"/>')
    o.append('</g>')
    # hojas de albahaca al lado
    for (cx, cy, g) in [(150, 240, -25), (492, 232, 22)]:
        o.append(f'<g transform="rotate({g} {cx} {cy})">')
        o.append(f'<path d="M{cx} {cy-26} Q{cx+26} {cy} {cx} {cy+26} Q{cx-26} {cy} {cx} {cy-26} Z" '
                 f'fill="#6E9A52" stroke="#55793D" stroke-width="2"/>')
        o.append(f'<line x1="{cx}" y1="{cy-20}" x2="{cx}" y2="{cy+20}" stroke="#55793D" stroke-width="2"/>')
        o.append('</g>')
    return o


def pack(masa, tono):
    """Bolsa de papel con el pedido dentro: se lee como «pack» de inmediato."""
    claro, oscuro = MASA[masa]
    sclaro, soscuro = SALSA[tono]
    papel, papel_oscuro = "#E3D2B4", "#C9B68F"
    o = []

    # Cuerpo de la bolsa
    o.append('<g filter="url(#s)">')
    o.append(f'<path d="M196 116 L444 116 L430 318 Q428 330 416 330 L224 330 Q212 330 210 318 Z" '
             f'fill="{papel}" stroke="{TRAZO}" stroke-width="3" stroke-opacity="0.45" stroke-linejoin="round"/>')
    # Fuelle lateral
    o.append(f'<path d="M196 116 L444 116 L434 158 L206 158 Z" fill="{papel_oscuro}" opacity="0.55"/>')
    o.append(f'<path d="M320 158 L320 330" stroke="{TRAZO}" stroke-width="2" stroke-opacity="0.12"/>')
    o.append('</g>')

    # Asomando por la boca de la bolsa
    o.append('<g filter="url(#s)">')
    o.append(f'<path d="{borde_ondulado(226, 60, 82, 82, 6)}" fill="{claro}" '
             f'stroke="{oscuro}" stroke-width="2.5" stroke-linejoin="round"/>')
    o.append(f'<circle cx="396" cy="104" r="40" fill="{claro}" stroke="{oscuro}" stroke-width="2.5"/>')
    o.append(f'<rect x="318" y="44" width="56" height="78" rx="12" fill="{sclaro}" '
             f'stroke="{soscuro}" stroke-width="2.5"/>')
    o.append(f'<rect x="322" y="36" width="48" height="16" rx="6" fill="{soscuro}"/>')
    o.append('</g>')

    # Etiqueta colgada
    o.append(f'<g filter="url(#s)">')
    o.append(f'<rect x="252" y="214" width="136" height="64" rx="10" fill="{FONDO}" '
             f'stroke="{TRAZO}" stroke-width="2" stroke-opacity="0.35"/>')
    o.append(f'<rect x="272" y="234" width="96" height="7" rx="3.5" fill="{TRAZO}" opacity="0.38"/>')
    o.append(f'<rect x="272" y="252" width="62" height="7" rx="3.5" fill="{TRAZO}" opacity="0.22"/>')
    o.append('</g>')
    return o


# --- catalogo de ilustraciones ---------------------------------------------
PRODUCTOS = {
    # rellenas
    "prd_ravioles":        ("rellena_cuadrada", "huevo", "#F2E6CE"),
    "prd_sorrentinos":     ("rellena_redonda", "huevo", "#EFCFA0"),
    "prd_capelletti":      ("rellena_redonda", "semola", "#B5603A"),
    "prd_panzotti":        ("media_luna", "espinaca", "#F2E6CE"),
    "prd_agnolotti":       ("media_luna", "semola", "#A7572F"),
    "prd_tortellini":      ("anillo", "huevo", "#A7B2CE"),
    "prd_canelones":       ("tubo", "huevo", "#8FB176"),
    "prd_ravioles_espinaca": ("rellena_cuadrada", "espinaca", "#F2E6CE"),
    "prd_sorrentinos_calabaza": ("rellena_redonda", "zapallo", "#EFC25E"),
    # largas
    "prd_fettuccine":      ("cinta", "huevo", None),
    "prd_tallarines":      ("cinta", "espinaca", None),
    "prd_spaghetti":       ("hebra", "semola", None),
    "prd_pappardelle":     ("cinta_ancha", "huevo", None),
    "prd_linguine":        ("hebra", "semola", None),
    "prd_tagliatelle":     ("cinta", "huevo", None),
    "prd_lasagna":         ("lamina", "huevo", None),
    "prd_fideos_zapallo":  ("cinta", "zapallo", None),
    # noquis
    "prd_noquis":          ("noqui", "papa", None),
    "prd_noquis_zapallo":  ("noqui", "zapallo", None),
    "prd_noquis_rellenos": ("noqui", "semola", None),
    # salsas
    "prd_pomodoro":        ("salsa", "tomate", None),
    "prd_pesto":           ("salsa", "pesto", None),
    "prd_bolognesa":       ("salsa", "carne", None),
    "prd_alfredo":         ("salsa", "crema", None),
    "prd_putanesca":       ("salsa", "aceituna", None),
    "prd_cuatro_quesos":   ("salsa", "azul", None),
    "prd_salsa_rosa":      ("salsa", "tomate", None),
    # packs
    "prd_pack_familiar":   ("pack", "huevo", "tomate"),
    "prd_pack_dos":        ("pack", "semola", "pesto"),
    "prd_pack_vegetariano": ("pack", "espinaca", "pesto"),
    "prd_pack_noquis":     ("pack", "papa", "crema"),
}


def dibujar(identificador, familia, masa, extra):
    o = cabecera(identificador)
    o += harina()
    if familia == "rellena_cuadrada":
        o += rellena_cuadrada(masa, extra)
    elif familia == "rellena_redonda":
        o += rellena_redonda(masa, extra)
    elif familia == "media_luna":
        o += media_luna(masa, extra)
    elif familia == "anillo":
        o += anillo(masa, extra)
    elif familia == "cinta":
        o += cinta(masa, 20)
    elif familia == "cinta_ancha":
        o += cinta(masa, 32)
    elif familia == "hebra":
        o += hebra(masa)
    elif familia == "lamina":
        o += lamina(masa)
    elif familia == "tubo":
        o += tubo(masa, extra)
    elif familia == "noqui":
        o += noqui(masa)
    elif familia == "salsa":
        o += salsa(masa)
    elif familia == "pack":
        o += pack(masa, extra)
    o.append("</svg>")
    return "".join(o)


for identificador, (familia, masa, extra) in PRODUCTOS.items():
    ruta = os.path.join(OUT, identificador + ".svg")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(dibujar(identificador, familia, masa, extra))

print(f"{len(PRODUCTOS)} ilustraciones en {OUT}")
