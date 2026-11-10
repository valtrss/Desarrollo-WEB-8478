# -*- coding: utf-8 -*-
"""Renderiza los .drawio a PNG con el visor oficial de diagrams.net.

Monta una pagina local por diagrama que carga viewer-static.min.js y le pasa
el XML, y despues la captura con Chrome headless al tamano exacto.
Asi el PNG que va al informe sale del mismo motor que dibuja diagrams.net.
"""
import json
import os
import subprocess
from html import escape

DOCS = "/Applications/XAMPP/xamppfiles/htdocs/Desarrollo-WEB-8478/docs"
DIAGRAMAS = os.path.join(DOCS, "diagramas")
PNG = os.path.join(DOCS, "png")
TEMP = "/private/tmp/claude-501/-Users-saavedra-Desktop-Universidad/cf7efa5b-3776-42e7-b767-3605c27b9ed3/scratchpad/render"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

os.makedirs(PNG, exist_ok=True)
os.makedirs(TEMP, exist_ok=True)

limites = json.load(open(os.path.join(DIAGRAMAS, "limites.json")))

PLANTILLA = """<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html, body {{ margin: 0; padding: 0; background: #ffffff; }}
  .mxgraph {{ background: #ffffff; }}
</style>
</head><body>
<div class="mxgraph" data-mxgraph="{datos}"></div>
<script src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
</body></html>"""

for archivo, dim in limites.items():
    nombre = os.path.splitext(archivo)[0]
    xml = open(os.path.join(DIAGRAMAS, archivo), encoding="utf-8").read()

    config = {
        "highlight": "#0000ff",
        "nav": False,
        "resize": False,
        "toolbar": None,
        "edit": None,
        "border": 16,
        "zoom": 1,
        "xml": xml,
    }
    html = PLANTILLA.format(datos=escape(json.dumps(config), quote=True))
    ruta_html = os.path.join(TEMP, nombre + ".html")
    open(ruta_html, "w", encoding="utf-8").write(html)

    salida = os.path.join(PNG, nombre + ".png")
    subprocess.run([
        CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
        "--force-device-scale-factor=2",
        "--virtual-time-budget=8000",
        f"--window-size={dim['w']},{dim['h']}",
        f"--screenshot={salida}",
        "file://" + ruta_html,
    ], capture_output=True, timeout=120)

    tam = os.path.getsize(salida) if os.path.exists(salida) else 0
    print(f"  {nombre}.png  {dim['w']}x{dim['h']} @2x  {tam // 1024} KB")

print("\nPNG regenerados desde el visor de diagrams.net.")
