// Microservicio privado: inventory
//
// Autoridad sobre: catalogo, precios, disponibilidad y stock del dia.
// Servicios del Modulo 1: S01 a S08. Requisitos: RF1, RF7, RF10.

import { randomUUID } from 'node:crypto';
import { crearApp, montarManejadorDeErrores, escucharPrivado, ruta, fallar } from '../../shared/http.js';
import { exigirIdentidadInterna, exigirRol } from '../../shared/identidad.js';
import { exigirTexto, exigirEntero } from '../../shared/validacion.js';
import {
  db, liberarReservasVencidas, reservarStock, liberarReservasDePedido,
  consumirReservasDePedido, ErrorStock,
} from './stock.js';
import { iniciarServidorGrpc } from './servidor-grpc.js';

const NOMBRE = 'inventory';
const PUERTO = 4002;

const app = crearApp(NOMBRE);
app.use(exigirIdentidadInterna(NOMBRE));

const ahora = () => new Date().toISOString();

// Campos publicos del catalogo. Lo que no esta aqui, no sale del servicio.
function aDtoPublico(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    categoria: p.categoria_id,
    formato: p.formato,
    porciones: p.porciones,
    precio: p.precio,
    imagenUrl: p.imagen_url,
    disponible: p.descontinuado === 0 && p.stock_del_dia - p.stock_reservado > 0,
    stockDelDia: Math.max(0, p.stock_del_dia - p.stock_reservado),
  };
}

// ---------------------------------------------------------------------------
// S01 Consultar catalogo
// ---------------------------------------------------------------------------
app.get('/products', ruta((req, res) => {
  liberarReservasVencidas();

  const limite = exigirEntero(req.query.limit ?? 12, 'limit', { min: 1, max: 50 });
  const pagina = exigirEntero(req.query.page ?? 1, 'page', { min: 1, max: 1000 });
  const condiciones = ['descontinuado = 0'];
  const parametros = [];

  if (req.query.categoria) {
    condiciones.push('categoria_id = ?');
    parametros.push(exigirTexto(req.query.categoria, 'categoria', { max: 60 }));
  }
  if (req.query.formato) {
    condiciones.push('formato = ?');
    parametros.push(exigirTexto(req.query.formato, 'formato', { max: 30 }));
  }
  if (req.query.q) {
    condiciones.push('LOWER(nombre) LIKE ?');
    parametros.push('%' + exigirTexto(req.query.q, 'q', { max: 60 }).toLowerCase() + '%');
  }
  if (req.query.available === 'true') {
    condiciones.push('(stock_del_dia - stock_reservado) > 0');
  }

  const donde = 'WHERE ' + condiciones.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM productos ${donde}`).get(...parametros).n;
  const filas = db.prepare(
    `SELECT * FROM productos ${donde} ORDER BY nombre LIMIT ? OFFSET ?`
  ).all(...parametros, limite, (pagina - 1) * limite);

  res.json({ data: filas.map(aDtoPublico), page: pagina, limit: limite, total });
}));

// ---------------------------------------------------------------------------
// S04 Productos del dia (la home no decide que significa "del dia")
// ---------------------------------------------------------------------------
app.get('/products/today', ruta((req, res) => {
  liberarReservasVencidas();
  const filas = db.prepare(
    'SELECT * FROM productos WHERE descontinuado = 0 AND (stock_del_dia - stock_reservado) > 0 ORDER BY stock_del_dia DESC LIMIT 4'
  ).all();
  res.json({ data: filas.map(aDtoPublico), horaCorte: '16:00' });
}));

// ---------------------------------------------------------------------------
// S03 Categorias
// ---------------------------------------------------------------------------
app.get('/categories', ruta((req, res) => {
  const filas = db.prepare('SELECT * FROM categorias ORDER BY orden, nombre').all();
  res.json({ data: filas.map((c) => ({ id: c.id, nombre: c.nombre })) });
}));

// ---------------------------------------------------------------------------
// S02 Detalle de producto
// ---------------------------------------------------------------------------
app.get('/products/:id', ruta((req, res) => {
  liberarReservasVencidas();
  const fila = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!fila || fila.descontinuado === 1) {
    fallar(404, 'no_encontrado', 'El producto no existe o fue descontinuado.');
  }
  res.json(aDtoPublico(fila));
}));

// ---------------------------------------------------------------------------
// S05 Crear producto (RF7, RF10)
// ---------------------------------------------------------------------------
app.post('/products', exigirRol('administrador'), ruta((req, res) => {
  const cuerpo = req.body ?? {};
  const nombre = exigirTexto(cuerpo.nombre, 'nombre', { min: 3, max: 120 });
  const categoria = exigirTexto(cuerpo.categoria, 'categoria', { max: 60 });
  const formato = exigirTexto(cuerpo.formato, 'formato', { max: 30 });
  const precio = exigirEntero(cuerpo.precio, 'precio', { min: 1, max: 1_000_000 });
  const porciones = exigirEntero(cuerpo.porciones ?? 1, 'porciones', { min: 1, max: 20 });
  const stock = exigirEntero(cuerpo.stockDelDia ?? 0, 'stockDelDia', { min: 0, max: 10_000 });

  const existeCategoria = db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoria);
  if (!existeCategoria) fallar(400, 'categoria_invalida', 'La categoria indicada no existe.');

  const id = 'prd_' + randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO productos (id, nombre, descripcion, categoria_id, formato, porciones,
      precio, imagen_url, stock_del_dia, stock_reservado, descontinuado, actualizado_en)
    VALUES (?,?,?,?,?,?,?,?,?,0,0,?)
  `).run(id, nombre, cuerpo.descripcion ?? '', categoria, formato, porciones,
         precio, cuerpo.imagenUrl ?? '', stock, ahora());

  res.status(201).json(aDtoPublico(db.prepare('SELECT * FROM productos WHERE id = ?').get(id)));
}));

// ---------------------------------------------------------------------------
// S06 Modificar producto
// ---------------------------------------------------------------------------
app.put('/products/:id', exigirRol('administrador'), ruta((req, res) => {
  const fila = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!fila) fallar(404, 'no_encontrado', 'El producto no existe.');

  const cuerpo = req.body ?? {};
  const nombre = exigirTexto(cuerpo.nombre ?? fila.nombre, 'nombre', { min: 3, max: 120 });
  const precio = exigirEntero(cuerpo.precio ?? fila.precio, 'precio', { min: 1, max: 1_000_000 });
  const formato = exigirTexto(cuerpo.formato ?? fila.formato, 'formato', { max: 30 });

  db.prepare(
    'UPDATE productos SET nombre = ?, precio = ?, formato = ?, descripcion = ?, actualizado_en = ? WHERE id = ?'
  ).run(nombre, precio, formato, cuerpo.descripcion ?? fila.descripcion, ahora(), fila.id);

  res.json(aDtoPublico(db.prepare('SELECT * FROM productos WHERE id = ?').get(fila.id)));
}));

// ---------------------------------------------------------------------------
// S07 Actualizar stock del dia (RF7)
// ---------------------------------------------------------------------------
app.put('/products/:id/stock', exigirRol('administrador'), ruta((req, res) => {
  const fila = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!fila) fallar(404, 'no_encontrado', 'El producto no existe.');

  const stock = exigirEntero(req.body?.stockDelDia, 'stockDelDia', { min: 0, max: 10_000 });
  if (stock < fila.stock_reservado) {
    fallar(409, 'stock_bajo_reservas',
      'No puede dejar el stock por debajo de lo ya reservado por pedidos vigentes.');
  }
  db.prepare('UPDATE productos SET stock_del_dia = ?, actualizado_en = ? WHERE id = ?')
    .run(stock, ahora(), fila.id);

  res.json(aDtoPublico(db.prepare('SELECT * FROM productos WHERE id = ?').get(fila.id)));
}));

// ---------------------------------------------------------------------------
// S08 Descontinuar producto. Retiro logico: el historial de ventas se conserva.
// ---------------------------------------------------------------------------
app.delete('/products/:id', exigirRol('administrador'), ruta((req, res) => {
  const fila = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!fila) fallar(404, 'no_encontrado', 'El producto no existe.');

  const activas = db.prepare(
    "SELECT COUNT(*) AS n FROM reservas WHERE producto_id = ? AND estado = 'activa'"
  ).get(fila.id).n;
  if (activas > 0) {
    fallar(409, 'reservas_vigentes', 'El producto tiene pedidos en curso.');
  }

  db.prepare('UPDATE productos SET descontinuado = 1, actualizado_en = ? WHERE id = ?')
    .run(ahora(), fila.id);
  res.json({ id: fila.id, descontinuado: true });
}));

// ---------------------------------------------------------------------------
// Interno: precios autorizados. orders los pide; nunca los recibe del navegador.
// ---------------------------------------------------------------------------
app.post('/internal/precios', ruta((req, res) => {
  const ids = Array.isArray(req.body?.productoIds) ? req.body.productoIds.slice(0, 50) : [];
  if (ids.length === 0) fallar(400, 'sin_productos', 'Debe indicar al menos un producto.');

  const marcadores = ids.map(() => '?').join(',');
  const filas = db.prepare(
    `SELECT * FROM productos WHERE id IN (${marcadores}) AND descontinuado = 0`
  ).all(...ids);

  res.json({
    data: filas.map((p) => ({
      id: p.id, nombre: p.nombre, formato: p.formato, precio: p.precio,
      disponible: p.stock_del_dia - p.stock_reservado > 0,
      stockLibre: Math.max(0, p.stock_del_dia - p.stock_reservado),
    })),
  });
}));

// ---------------------------------------------------------------------------
// Rutas internas de reserva.
//
// La logica vive en stock.js y la comparten esta API REST y el servidor gRPC,
// para que ambos caminos apliquen exactamente las mismas reglas de negocio.
// Estas rutas REST son el respaldo del canal gRPC (ver ADR del Modulo 9).
// ---------------------------------------------------------------------------
app.post('/internal/reservas', ruta((req, res) => {
  const pedidoId = exigirTexto(req.body?.pedidoId, 'pedidoId', { max: 40 });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) fallar(400, 'sin_items', 'El pedido no tiene items.');

  try {
    res.status(201).json(reservarStock({ pedidoId, items }));
  } catch (error) {
    if (error instanceof ErrorStock) {
      const mensajes = {
        stock_insuficiente: 'No hay stock del dia suficiente.',
        producto_no_disponible: 'Un producto del pedido ya no esta disponible.',
      };
      fallar(409, error.codigo, mensajes[error.codigo] ?? 'No se pudo reservar.', error.detalle);
    }
    throw error;
  }
}));

app.post('/internal/reservas/:pedidoId/liberar', ruta((req, res) => {
  res.json({ liberadas: liberarReservasDePedido(req.params.pedidoId) });
}));

app.post('/internal/reservas/:pedidoId/consumir', ruta((req, res) => {
  res.json({ consumidas: consumirReservasDePedido(req.params.pedidoId) });
}));

montarManejadorDeErrores(app, NOMBRE);
escucharPrivado(app, PUERTO, NOMBRE);

// Canal interno gRPC para la reserva de stock (Modulo 9).
iniciarServidorGrpc();
