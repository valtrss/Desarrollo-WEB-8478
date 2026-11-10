// Cliente del API Gateway.
//
// El navegador solo conoce esta direccion. No sabe que detras hay seis
// servicios, ni sus puertos, ni ninguna credencial de integracion.
//
// Sobre la sesion: el token se guarda en sessionStorage, no en localStorage,
// para que muera al cerrar la pestana. Un navegador no puede guardar nada en
// secreto, asi que el token dura 15 minutos y el servidor lo revoca al salir.

const API = 'http://localhost:8080';
const CLAVE_SESION = 'lanonna.sesion';
const CLAVE_INVITADO = 'lanonna.invitado';
const CLAVE_CARRITO_INVITADO = 'lanonna.carrito-invitado';

export const sesion = {
  guardar(datos) {
    try { sessionStorage.setItem(CLAVE_SESION, JSON.stringify(datos)); } catch { /* modo privado */ }
  },
  leer() {
    try { return JSON.parse(sessionStorage.getItem(CLAVE_SESION) ?? 'null'); } catch { return null; }
  },
  borrar() {
    try { sessionStorage.removeItem(CLAVE_SESION); } catch { /* modo privado */ }
  },
  get token() { return this.leer()?.accessToken ?? null; },
  get perfil() { return this.leer()?.perfil ?? null; },
};

// --- Modo invitado ---------------------------------------------------------
//
// Un visitante puede mirar el catalogo y armar su carrito sin cuenta. Ese
// carrito vive SOLO en este navegador y no tiene ninguna autoridad: no fija
// precios ni reserva stock. Al entrar, se traspasa al servidor y recien ahi
// se recalcula todo.
//
// Confirmar el pedido sigue exigiendo cuenta: el caso pide que la venta se
// realice unicamente sobre pedidos de clientes registrados (RF4).

export const invitado = {
  get activo() {
    try { return localStorage.getItem(CLAVE_INVITADO) === '1'; } catch { return false; }
  },
  activar() {
    try { localStorage.setItem(CLAVE_INVITADO, '1'); } catch { /* modo privado */ }
  },
  desactivar() {
    try { localStorage.removeItem(CLAVE_INVITADO); } catch { /* modo privado */ }
  },
};

export const carritoInvitado = {
  leer() {
    try { return JSON.parse(localStorage.getItem(CLAVE_CARRITO_INVITADO) ?? '[]'); } catch { return []; }
  },
  guardar(items) {
    try { localStorage.setItem(CLAVE_CARRITO_INVITADO, JSON.stringify(items)); } catch { /* modo privado */ }
  },
  agregar(productoId, cantidad = 1) {
    const items = this.leer();
    const existente = items.find((i) => i.productoId === productoId);
    if (existente) existente.cantidad = Math.min(20, existente.cantidad + cantidad);
    else items.push({ productoId, cantidad });
    this.guardar(items);
    return items;
  },
  cambiar(productoId, cantidad) {
    const items = this.leer().map((i) => (i.productoId === productoId ? { ...i, cantidad } : i));
    this.guardar(items);
    return items;
  },
  quitar(productoId) {
    const items = this.leer().filter((i) => i.productoId !== productoId);
    this.guardar(items);
    return items;
  },
  vaciar() {
    try { localStorage.removeItem(CLAVE_CARRITO_INVITADO); } catch { /* modo privado */ }
  },
  get cantidadTotal() {
    return this.leer().reduce((suma, i) => suma + i.cantidad, 0);
  },
};

// Traspasa el carrito de invitado al servidor despues de iniciar sesion.
// Si algo ya no tiene stock, se omite y se informa: el servidor manda.
export async function traspasarCarritoInvitado() {
  const items = carritoInvitado.leer();
  if (items.length === 0) return { traspasados: 0, omitidos: [] };

  const omitidos = [];
  let traspasados = 0;
  for (const item of items) {
    try {
      await api('/api/v1/cart/items', {
        metodo: 'POST', cuerpo: { productoId: item.productoId, cantidad: item.cantidad },
      });
      traspasados++;
    } catch {
      omitidos.push(item.productoId);
    }
  }
  carritoInvitado.vaciar();
  return { traspasados, omitidos };
}

export class ErrorApi extends Error {
  constructor(estado, cuerpo) {
    super(cuerpo?.mensaje ?? 'No se pudo completar la operacion.');
    this.estado = estado;
    this.codigo = cuerpo?.error;
    this.detalle = cuerpo?.detalle;
  }
}

export async function api(ruta, { metodo = 'GET', cuerpo, cabeceras = {} } = {}) {
  const token = sesion.token;
  const respuesta = await fetch(API + ruta, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...cabeceras,
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });

  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : null;

  if (respuesta.status === 401 && token) {
    // La sesion vencio o fue revocada: se limpia y se pide entrar de nuevo.
    sesion.borrar();
  }
  if (!respuesta.ok) throw new ErrorApi(respuesta.status, datos);
  return datos;
}

export async function graphql(consulta, variables) {
  const datos = await api('/graphql', { metodo: 'POST', cuerpo: { query: consulta, variables } });
  if (datos.errors?.length) throw new Error(datos.errors[0].message);
  return datos.data;
}

export const pesos = (valor) =>
  '$' + Number(valor ?? 0).toLocaleString('es-CL', { maximumFractionDigits: 0 });

// Barra de navegacion comun. Refleja el perfil de quien entro.
export function pintarNavegacion() {
  const perfil = sesion.perfil;
  const zona = document.getElementById('zona-sesion');
  if (!zona) return;

  if (!perfil) {
    const enCarrito = carritoInvitado.cantidadTotal;
    const marca = enCarrito > 0 ? ` <span class="badge text-bg-danger">${enCarrito}</span>` : '';
    zona.innerHTML = `
      ${invitado.activo ? '<span class="nonna-nota me-2">modo invitado</span>' : ''}
      <a class="btn btn-sm btn-nonna-linea" href="/cuenta.html">Mi cuenta</a>
      <a class="btn btn-sm btn-nonna ms-2" href="/carrito.html">Carrito${marca}</a>`;
    return;
  }

  zona.innerHTML = `
    <span class="text-secondary small me-2">${perfil.nombre} &middot; ${perfil.rol}</span>
    <a class="btn btn-sm btn-nonna" href="/carrito.html">Carrito</a>
    <button class="btn btn-sm btn-nonna-linea ms-2" id="btn-salir">Salir</button>`;

  document.getElementById('btn-salir')?.addEventListener('click', async () => {
    try {
      await api('/api/v1/auth/logout', { metodo: 'POST', cuerpo: { accessToken: sesion.token } });
    } catch { /* si ya expiro, igual se cierra localmente */ }
    sesion.borrar();
    invitado.desactivar();
    location.href = '/';
  });
}

export function mostrarError(contenedor, error) {
  const caja = document.getElementById(contenedor);
  if (!caja) return;
  caja.className = 'alert alert-danger';
  caja.textContent = error.message;
  caja.classList.remove('d-none');
}

export function limpiarAviso(contenedor) {
  const caja = document.getElementById(contenedor);
  if (caja) caja.classList.add('d-none');
}

export function mostrarAviso(contenedor, mensaje, tipo = 'success') {
  const caja = document.getElementById(contenedor);
  if (!caja) return;
  caja.className = `alert alert-${tipo}`;
  caja.textContent = mensaje;
  caja.classList.remove('d-none');
}
