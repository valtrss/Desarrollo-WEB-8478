# Herramientas de documentación

## `construir-docx.js`

Genera `docs/Informe de Arquitectura - Pastas Frescas La Nonna.docx` a partir de
`docs/informe-arquitectura.md`, con los diagramas y las capturas incrustados.

No usa pandoc: convierte el Markdown con la librería `docx` de npm, porque este
equipo no tiene pandoc ni LibreOffice instalados.

```bash
cd docs/herramientas
npm install docx@9.0.2
node construir-docx.js
```

Qué hace, además de lo obvio:

- **Cambia los SVG por los PNG de `docs/png/`**, porque Word no muestra SVG de
  forma fiable.
- **Pone las tablas de 8 columnas o más en páginas apaisadas.** La matriz de
  trazabilidad del Módulo 1 tiene 10 columnas y en vertical quedaría ilegible.
- Ajusta el tamaño de letra de cada tabla según su número de columnas, y reparte
  el ancho de columna según el largo del contenido.
- Escala cada imagen al área útil de su sección, manteniendo la proporción.

Si cambias el informe en Markdown, vuelve a correr el script y el `.docx` se
regenera completo.


## `generar-ilustraciones.py`

Genera las ilustraciones del catálogo en `frontend/web/img/`, una por producto.

```bash
python3 docs/herramientas/generar-ilustraciones.py
```

Son dibujos vectoriales propios, no fotos: no hay fotografía de pastas con
licencia clara que se pueda incluir en una entrega evaluada. Se agrupan en
familias de forma (rellena cuadrada, media luna, anillo, cinta, hebra, lámina,
tubo, ñoqui, salsa, pack) y cambian de color según la masa, así que cada
producto se distingue del resto.

**Si consigues fotos reales:** déjalas en `frontend/web/img/` con el mismo
nombre del producto y cambia la extensión en `scripts/sembrar.js`, en la línea
que arma `imagenUrl`. El frontend no necesita ningún cambio: si una imagen no
carga, la tarjeta vuelve sola al marcador con aspas.
