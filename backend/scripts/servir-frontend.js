// Servidor estatico del frontend.
//
// Sirve solo archivos de frontend/web. No ejecuta codigo del lado del servidor
// ni conoce ningun secreto: el navegador habla con el API Gateway por fetch.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

// El sitio puede estar en distintos lugares segun como se entregue el proyecto:
// en el repo es ../../frontend/web, pero en el ZIP de la entrega las dos
// evaluaciones van en carpetas separadas. Se prueban los candidatos en orden,
// y FRONTEND_DIR permite forzar una ruta.
const CANDIDATOS = [
  process.env.FRONTEND_DIR,
  join(AQUI, '..', '..', 'frontend', 'web'),
  join(AQUI, '..', '..', '..', 'Evaluacion-1-Frontend', 'sitio'),
  join(AQUI, '..', '..', '..', '..', 'Evaluacion-1-Frontend', 'sitio'),
].filter(Boolean).map((r) => resolve(r));

const RAIZ = CANDIDATOS.find((r) => existsSync(join(r, 'index.html'))) ?? CANDIDATOS[1];
const PUERTO = 8081;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rutaRelativa = decodeURIComponent(url.pathname);
    if (rutaRelativa.endsWith('/')) rutaRelativa += 'index.html';

    // Evita salir de la carpeta publica con ../
    const destino = resolve(join(RAIZ, normalize(rutaRelativa)));
    if (!destino.startsWith(RAIZ)) {
      res.writeHead(403).end('Prohibido');
      return;
    }

    const info = await stat(destino).catch(() => null);
    if (!info || !info.isFile()) {
      const alternativa = join(RAIZ, 'index.html');
      const contenido = await readFile(alternativa).catch(() => null);
      if (!contenido) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado');
        return;
      }
      res.writeHead(200, { 'content-type': TIPOS['.html'] }).end(contenido);
      return;
    }

    const contenido = await readFile(destino);
    res.writeHead(200, {
      'content-type': TIPOS[extname(destino)] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    }).end(contenido);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('Error del servidor');
  }
}).listen(PUERTO, () => {
  console.log(`[frontend] sitio estatico en http://localhost:${PUERTO}`);
  if (!existsSync(join(RAIZ, 'index.html'))) {
    console.error(`[frontend] AVISO: no encontre el sitio. Busque en:`);
    for (const c of CANDIDATOS) console.error(`[frontend]   ${c}`);
    console.error('[frontend] Puede indicarlo con FRONTEND_DIR=/ruta/al/sitio npm start');
  }
});
