# Ruta Platino

Proyecto del ramo **Desarrollo Web 8478**. Blog de guias para conseguir el platino
o el 100% de los logros en videojuegos de PlayStation y Steam.

El repositorio es una bitacora: cada carpeta corresponde al avance de una semana
de clases y se construye sobre la anterior.

## Concepto

Cada guia publica la informacion que suele faltar en las guias que circulan:
dificultad real en escala de 1 a 10, horas efectivas, cantidad de logros y cuales
trofeos se pierden para siempre si avanzas la historia.

## Avance por semana

| Semana | Contenido |
|---|---|
| 2 | Sitio multipagina en PHP con Bootstrap 5: navbar con dropdown, modal de acceso, footer en grilla, listado de guias con filtros por plataforma y formulario de contacto. |
| 3 | JavaScript: recorrido de una respuesta simulada de API, tipos de dato, manejo de errores con try/catch, y generacion del listado en el DOM con createElement. |

## Estructura responsiva

La grilla de 12 columnas se resuelve en tres rangos de ancho:

| Rango | Prefijo | Aside / Main | Tarjetas por fila |
|---|---|---|---|
| Movil (< 768 px) | por defecto | 12 / 12 apilado | 1 |
| Tablet (>= 768 px) | `col-md-*` | 4 / 8 | 2 |
| Escritorio (>= 1200 px) | `col-lg-*` | 3 / 9 | 4 |

En movil el `<main>` se declara antes que el `<aside>` para que el contenido
conserve la prioridad y los filtros queden al final.

## Como ejecutarlo

Requiere XAMPP con Apache encendido. El proyecto debe estar dentro de `htdocs`:

```
/Applications/XAMPP/xamppfiles/htdocs/Desarrollo-WEB-8478
```

Luego abrir en el navegador:

```
http://localhost/Desarrollo-WEB-8478/
```

## Nota sobre las imagenes

Las portadas son imagenes SVG de referencia generadas para este proyecto. No se
utiliza material con derechos de autor de Sony, Valve ni de los estudios
desarrolladores.
