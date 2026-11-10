// Convierte docs/informe-arquitectura.md en un .docx con todo incrustado.
//
// No hay pandoc en este equipo, asi que se arma con la libreria docx.
// Cubre el subconjunto de Markdown que usa el informe: titulos, parrafos,
// tablas, bloques de codigo, imagenes, listas y reglas horizontales.
//
// Las tablas muy anchas (8 columnas o mas) se emiten en una seccion apaisada:
// la matriz de trazabilidad del Modulo 1 tiene 10 columnas y en vertical
// quedaria ilegible.

const fs = require('node:fs');
const path = require('node:path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, AlignmentType, HeadingLevel,
  PageOrientation, LevelFormat, convertInchesToTwip,
} = require('docx');

const RAIZ = '/Applications/XAMPP/xamppfiles/htdocs/Desarrollo-WEB-8478';
const BASE_IMG = path.join(RAIZ, 'docs');
const ENTRADA = path.join(RAIZ, 'docs', 'informe-arquitectura.md');
const SALIDA = path.join(RAIZ, 'docs', 'Informe de Arquitectura - Pastas Frescas La Nonna.docx');

const TINTA = '2E3138';
const ACENTO = 'C0392B';
const GRIS = '8A9099';
const LINEA = 'C3C7CE';
const SUPERFICIE = 'F3F4F6';

// --- medidas de imagen ------------------------------------------------------
function medirPng(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function medirJpg(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marcador = buf[i + 1];
    const largo = buf.readUInt16BE(i + 2);
    // SOF0..SOF15, saltando los que no llevan dimensiones
    if (marcador >= 0xc0 && marcador <= 0xcf &&
        marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + largo;
  }
  return { w: 800, h: 600 };
}

// --- parser de markdown -----------------------------------------------------
function parsear(texto) {
  const lineas = texto.split('\n');
  const bloques = [];
  let i = 0;

  const esFilaDeTabla = (l) => l.trim().startsWith('|');

  while (i < lineas.length) {
    const linea = lineas[i];
    const limpia = linea.trim();

    if (limpia === '') { i++; continue; }

    // Bloque de codigo
    if (limpia.startsWith('```')) {
      const lenguaje = limpia.slice(3).trim();
      const cuerpo = [];
      i++;
      while (i < lineas.length && !lineas[i].trim().startsWith('```')) {
        cuerpo.push(lineas[i]);
        i++;
      }
      i++;
      bloques.push({ tipo: 'codigo', lenguaje, lineas: cuerpo });
      continue;
    }

    // Regla horizontal
    if (/^-{3,}$/.test(limpia)) { bloques.push({ tipo: 'hr' }); i++; continue; }

    // Titulos
    const titulo = limpia.match(/^(#{1,4})\s+(.*)$/);
    if (titulo) {
      bloques.push({ tipo: 'h' + titulo[1].length, texto: titulo[2] });
      i++;
      continue;
    }

    // Imagen sola en su linea
    const img = limpia.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      bloques.push({ tipo: 'img', alt: img[1], ruta: img[2] });
      i++;
      continue;
    }

    // Tabla
    if (esFilaDeTabla(linea) && i + 1 < lineas.length && /^\|[\s:|-]+\|$/.test(lineas[i + 1].trim())) {
      const filas = [];
      const partir = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      filas.push(partir(lineas[i]));
      i += 2; // salta el separador
      while (i < lineas.length && esFilaDeTabla(lineas[i])) {
        filas.push(partir(lineas[i]));
        i++;
      }
      bloques.push({ tipo: 'tabla', filas });
      continue;
    }

    // Listas
    if (/^[-*]\s+/.test(limpia) || /^\d+\.\s+/.test(limpia)) {
      const ordenada = /^\d+\.\s+/.test(limpia);
      const items = [];
      while (i < lineas.length) {
        const l = lineas[i];
        const t = l.trim();
        const m = ordenada ? t.match(/^\d+\.\s+(.*)$/) : t.match(/^[-*]\s+(.*)$/);
        if (m) {
          items.push(m[1]);
          i++;
          // continuacion indentada del mismo item
          while (i < lineas.length && /^\s{2,}\S/.test(lineas[i]) &&
                 !/^\s*([-*]|\d+\.)\s/.test(lineas[i])) {
            items[items.length - 1] += ' ' + lineas[i].trim();
            i++;
          }
        } else if (t === '') {
          break;
        } else {
          break;
        }
      }
      bloques.push({ tipo: ordenada ? 'ol' : 'ul', items });
      continue;
    }

    // Parrafo: se acumulan lineas hasta un corte
    const parrafo = [];
    while (i < lineas.length) {
      const t = lineas[i].trim();
      if (t === '' || t.startsWith('#') || t.startsWith('```') || esFilaDeTabla(lineas[i]) ||
          /^-{3,}$/.test(t) || /^!\[/.test(t) || /^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) break;
      parrafo.push(t);
      i++;
    }
    if (parrafo.length) bloques.push({ tipo: 'p', texto: parrafo.join(' ') });
  }
  return bloques;
}

// --- formato en linea -------------------------------------------------------
function enLinea(texto, opciones = {}) {
  const base = {
    size: opciones.size ?? 20,
    font: opciones.font ?? 'Calibri',
    color: opciones.color ?? TINTA,
    ...(opciones.bold ? { bold: true } : {}),
  };
  const partes = [];
  // Se trocea por negrita, codigo y cursiva, en ese orden de prioridad.
  const patron = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let ultimo = 0;
  let m;
  while ((m = patron.exec(texto)) !== null) {
    if (m.index > ultimo) {
      partes.push(new TextRun({ ...base, text: texto.slice(ultimo, m.index) }));
    }
    const t = m[0];
    if (t.startsWith('**')) {
      partes.push(new TextRun({ ...base, text: t.slice(2, -2), bold: true }));
    } else if (t.startsWith('`')) {
      partes.push(new TextRun({
        ...base, text: t.slice(1, -1), font: 'Consolas',
        size: Math.max(14, base.size - 2), color: ACENTO,
      }));
    } else {
      partes.push(new TextRun({ ...base, text: t.slice(1, -1), italics: true }));
    }
    ultimo = m.index + t.length;
  }
  if (ultimo < texto.length) partes.push(new TextRun({ ...base, text: texto.slice(ultimo) }));
  return partes.length ? partes : [new TextRun({ ...base, text: texto })];
}

// --- render de bloques ------------------------------------------------------
const bordeFino = { style: BorderStyle.SINGLE, size: 2, color: LINEA };
const bordesTabla = {
  top: bordeFino, bottom: bordeFino, left: bordeFino, right: bordeFino,
  insideHorizontal: bordeFino, insideVertical: bordeFino,
};

function celda(texto, { encabezado = false, ancho, tam }) {
  return new TableCell({
    width: { size: ancho, type: WidthType.DXA },
    shading: encabezado ? { type: ShadingType.CLEAR, fill: SUPERFICIE, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: enLinea(texto, { size: tam, bold: encabezado }),
    })],
  });
}

function construirTabla(filas, anchoTotalDxa) {
  const columnas = filas[0].length;
  const tam = columnas >= 8 ? 13 : columnas >= 6 ? 15 : 17; // media-puntos

  // Ancho proporcional al contenido, con piso y techo para que ninguna
  // columna quede como un hilo ni se coma la tabla.
  const pesos = filas[0].map((_, c) => {
    const largos = filas.map((f) => (f[c] ?? '').length);
    const promedio = largos.reduce((a, b) => a + b, 0) / largos.length;
    return Math.min(Math.max(promedio, 6), 40);
  });
  const suma = pesos.reduce((a, b) => a + b, 0);
  const anchos = pesos.map((p) => Math.floor((p / suma) * anchoTotalDxa));
  anchos[anchos.length - 1] += anchoTotalDxa - anchos.reduce((a, b) => a + b, 0);

  return new Table({
    width: { size: anchoTotalDxa, type: WidthType.DXA },
    columnWidths: anchos,
    borders: bordesTabla,
    rows: filas.map((fila, idx) => new TableRow({
      tableHeader: idx === 0,
      children: fila.map((texto, c) => celda(texto, {
        encabezado: idx === 0, ancho: anchos[c], tam,
      })),
    })),
  });
}

function construirImagen(ruta, alt, anchoMaxPx, altoMaxPx) {
  const completa = path.join(BASE_IMG, ruta);
  if (!fs.existsSync(completa)) {
    return [new Paragraph({ children: enLinea(`[falta la imagen: ${ruta}]`, { color: ACENTO }) })];
  }
  const buf = fs.readFileSync(completa);
  const ext = path.extname(completa).toLowerCase();
  const dim = ext === '.png' ? medirPng(buf) : medirJpg(buf);

  let w = anchoMaxPx;
  let h = Math.round((dim.h / dim.w) * w);
  if (h > altoMaxPx) {
    h = altoMaxPx;
    w = Math.round((dim.w / dim.h) * h);
  }

  const elementos = [new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 60 },
    children: [new ImageRun({
      data: buf,
      type: ext === '.png' ? 'png' : 'jpg',
      transformation: { width: w, height: h },
    })],
  })];
  if (alt) {
    elementos.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      children: [new TextRun({ text: alt, size: 16, italics: true, color: GRIS, font: 'Calibri' })],
    }));
  }
  return elementos;
}

function renderizar(bloques, anchoTablaDxa, anchoImgPx, altoImgPx) {
  const salida = [];
  for (const b of bloques) {
    switch (b.tipo) {
      case 'h1':
        salida.push(new Paragraph({ heading: HeadingLevel.TITLE, children: enLinea(b.texto, { size: 44, font: 'Calibri Light' }) }));
        break;
      case 'h2':
        salida.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: enLinea(b.texto, { size: 30, font: 'Calibri Light' }) }));
        break;
      case 'h3':
        salida.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: enLinea(b.texto, { size: 24, font: 'Calibri Light' }) }));
        break;
      case 'h4':
        salida.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: enLinea(b.texto, { size: 21, font: 'Calibri Light' }) }));
        break;
      case 'p':
        salida.push(new Paragraph({ spacing: { before: 0, after: 140, line: 276 }, children: enLinea(b.texto) }));
        break;
      case 'ul':
        for (const it of b.items) {
          salida.push(new Paragraph({ bullet: { level: 0 }, spacing: { before: 0, after: 60 }, children: enLinea(it) }));
        }
        break;
      case 'ol':
        for (const it of b.items) {
          salida.push(new Paragraph({ numbering: { reference: 'numerada', level: 0 }, spacing: { before: 0, after: 60 }, children: enLinea(it) }));
        }
        break;
      case 'codigo':
        salida.push(new Paragraph({
          spacing: { before: 120, after: 0 },
          shading: { type: ShadingType.CLEAR, fill: SUPERFICIE, color: 'auto' },
          children: [new TextRun({ text: b.lenguaje || 'codigo', size: 14, color: GRIS, font: 'Consolas' })],
        }));
        for (const l of b.lineas) {
          salida.push(new Paragraph({
            spacing: { before: 0, after: 0 },
            shading: { type: ShadingType.CLEAR, fill: SUPERFICIE, color: 'auto' },
            children: [new TextRun({ text: l || ' ', size: 15, font: 'Consolas', color: TINTA })],
          }));
        }
        salida.push(new Paragraph({ spacing: { before: 0, after: 160 }, children: [new TextRun({ text: '', size: 8 })] }));
        break;
      case 'tabla':
        salida.push(construirTabla(b.filas, anchoTablaDxa));
        salida.push(new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: '', size: 8 })] }));
        break;
      case 'img':
        salida.push(...construirImagen(b.ruta, b.alt, anchoImgPx, altoImgPx));
        break;
      case 'hr':
        salida.push(new Paragraph({
          spacing: { before: 120, after: 160 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINEA } },
          children: [new TextRun({ text: '', size: 2 })],
        }));
        break;
    }
  }
  return salida;
}

// --- armado del documento ---------------------------------------------------
let md = fs.readFileSync(ENTRADA, 'utf8');
// En el .docx se incrustan los PNG: Word no muestra SVG de forma fiable.
md = md.replace(/\((evidencias|diagramas)\/([a-z0-9-]+)\.svg\)/g, '(png/$2.png)');

const bloques = parsear(md);

// Las tablas de 8 columnas o mas se llevan a una seccion apaisada.
const esApaisado = (b) => b.tipo === 'tabla' && b.filas[0].length >= 8;
const grupos = [];
for (const b of bloques) {
  const modo = esApaisado(b) ? 'apaisada' : 'vertical';
  if (!grupos.length || grupos.at(-1).modo !== modo) grupos.push({ modo, bloques: [] });
  grupos.at(-1).bloques.push(b);
}

const MARGEN = convertInchesToTwip(0.9);
const ANCHO_TXT_VERTICAL = convertInchesToTwip(8.5 - 1.8);   // 6.7"
const ANCHO_TXT_APAISADO = convertInchesToTwip(11 - 1.8);    // 9.2"

const secciones = grupos.map((g) => ({
  properties: {
    page: {
      size: {
        width: convertInchesToTwip(8.5),
        height: convertInchesToTwip(11),
        orientation: g.modo === 'apaisada' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
      },
      margin: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
    },
  },
  children: renderizar(
    g.bloques,
    g.modo === 'apaisada' ? ANCHO_TXT_APAISADO : ANCHO_TXT_VERTICAL,
    g.modo === 'apaisada' ? 880 : 640,
    g.modo === 'apaisada' ? 560 : 820
  ),
}));

const doc = new Document({
  creator: 'Simon Saavedra',
  title: 'Informe de Arquitectura de Backend Seguro - Pastas Frescas La Nonna',
  description: 'Evaluacion Unidad 2, Desarrollo Web 8478',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 20, color: TINTA } },
      title: {
        run: { font: 'Calibri Light', size: 44, bold: true, color: TINTA },
        paragraph: { spacing: { before: 0, after: 240 }, keepNext: true },
      },
      heading1: {
        run: { font: 'Calibri Light', size: 30, bold: true, color: TINTA },
        paragraph: { spacing: { before: 320, after: 160 }, keepNext: true },
      },
      heading2: {
        run: { font: 'Calibri Light', size: 24, bold: true, color: TINTA },
        paragraph: { spacing: { before: 260, after: 120 }, keepNext: true },
      },
      heading3: {
        run: { font: 'Calibri Light', size: 21, bold: true, color: ACENTO },
        paragraph: { spacing: { before: 200, after: 100 }, keepNext: true },
      },
    },
  },
  numbering: {
    config: [{
      reference: 'numerada',
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: 400, hanging: 240 } } },
      }],
    }],
  },
  sections: secciones,
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(SALIDA, buf);
  const n = bloques.filter((b) => b.tipo === 'img').length;
  const t = bloques.filter((b) => b.tipo === 'tabla').length;
  console.log(`Escrito: ${SALIDA}`);
  console.log(`  ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  ${bloques.length} bloques, ${n} imagenes, ${t} tablas`);
  console.log(`  ${secciones.length} secciones (${grupos.filter((g) => g.modo === 'apaisada').length} apaisadas)`);
});
