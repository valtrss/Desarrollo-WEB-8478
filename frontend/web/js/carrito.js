// Carrito y checkout.
//
// Servicios: S17 a S21 (carrito y pedido), S16 (zona de despacho), S27 (pago).
//
// Funciona en dos modos:
//
//  - Con sesion: el carrito vive en orders. Cada cambio vuelve del servidor
//    con el total recalculado.
//  - Como invitado: el carrito vive en este navegador. Los precios que se
//    muestran salen del catalogo publico y son referenciales; al entrar, el
//    carrito se traspasa al servidor y todo se vuelve a calcular alli.
//
// En ningun modo esta pantalla puede confirmar un pago: eso ocurre entre el
// proveedor y payments, sin pasar por el navegador.

import {
  api, pesos, sesion, invitado, carritoInvitado, traspasarCarritoInvitado,
  pintarNavegacion, mostrarError, mostrarAviso, limpiarAviso,
} from './api.js';

let carritoActual = null;
let zonaValida = false;
let modoInvitado = false;

function marcarPaso(numero) {
  for (const elemento of document.querySelectorAll('#pasos [data-paso]')) {
    const propio = Number(elemento.dataset.paso);
    elemento.className = propio === numero ? 'fw-bold'
      : propio < numero ? 'text-success' : 'text-secondary';
  }
}

function fila(item) {
  const clave = modoInvitado ? item.productoId : item.id;
  return `
    <tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="nonna-figura" style="width:56px;aspect-ratio:1;border-radius:3px;"></div>
          <div>
            <div class="fw-semibold">${item.nombre}</div>
            ${item.disponible ? '' : '<div class="small text-danger">sin stock hoy</div>'}
          </div>
        </div>
      </td>
      <td class="text-secondary small">${item.formato}</td>
      <td>${pesos(item.precioUnitario)}</td>
      <td>
        <div class="input-group input-group-sm" style="width: 120px;">
          <button class="btn btn-outline-secondary" data-menos="${clave}">-</button>
          <input class="form-control text-center" value="${item.cantidad}" readonly>
          <button class="btn btn-outline-secondary" data-mas="${clave}">+</button>
        </div>
      </td>
      <td class="fw-semibold">${pesos(item.subtotal)}</td>
      <td class="text-end">
        <button class="btn btn-link btn-sm text-danger p-0" data-quitar="${clave}">Quitar</button>
      </td>
    </tr>`;
}

function pintar(carrito) {
  carritoActual = carrito;
  document.getElementById('items-carrito').innerHTML = carrito.items.length > 0
    ? carrito.items.map(fila).join('')
    : '<tr><td colspan="6" class="text-center text-secondary py-4">Tu carrito esta vacio.</td></tr>';

  document.getElementById('cuenta-items').textContent =
    carrito.items.length === 1 ? '1 producto' : `${carrito.items.length} productos`;
  document.getElementById('resumen-subtotal').textContent = pesos(carrito.subtotal);
  document.getElementById('resumen-total').textContent = pesos(carrito.total);

  for (const boton of document.querySelectorAll('[data-mas]')) {
    boton.addEventListener('click', () => cambiarCantidad(boton.dataset.mas, 1));
  }
  for (const boton of document.querySelectorAll('[data-menos]')) {
    boton.addEventListener('click', () => cambiarCantidad(boton.dataset.menos, -1));
  }
  for (const boton of document.querySelectorAll('[data-quitar]')) {
    boton.addEventListener('click', () => quitar(boton.dataset.quitar));
  }
  actualizarBotonPago();
}

function correoInvitadoValido() {
  const valor = document.getElementById('correo-invitado').value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);
}

function actualizarBotonPago() {
  const boton = document.getElementById('btn-pagar');
  const hayItems = (carritoActual?.items.length ?? 0) > 0;
  const hayDireccion = document.getElementById('direccion').value.trim().length >= 5;
  const hayCorreo = modoInvitado ? correoInvitadoValido() : true;

  boton.disabled = !(hayItems && zonaValida && hayDireccion && hayCorreo);
  boton.textContent = modoInvitado ? 'Pagar como invitado' : 'Continuar al pago';
}

// --- modo con sesion --------------------------------------------------------
async function cargarCarrito() {
  try {
    pintar(await api('/api/v1/cart'));
  } catch (error) {
    mostrarError('aviso', error);
  }
}

// --- modo invitado ----------------------------------------------------------
// Los precios salen del catalogo publico (S01), que es anonimo. Son los mismos
// que usa el servidor, pero aqui solo sirven para mostrar: al traspasar el
// carrito, orders los vuelve a pedir a inventory.
async function cargarCarritoInvitado() {
  const guardados = carritoInvitado.leer();
  if (guardados.length === 0) {
    pintar({ items: [], subtotal: 0, total: 0 });
    return;
  }
  try {
    const { data } = await api('/api/v1/products?limit=50');
    const porId = new Map(data.map((p) => [p.id, p]));

    const items = [];
    let subtotal = 0;
    for (const guardado of guardados) {
      const producto = porId.get(guardado.productoId);
      if (!producto) continue;
      const sub = producto.precio * guardado.cantidad;
      subtotal += sub;
      items.push({
        productoId: producto.id,
        nombre: producto.nombre,
        formato: producto.formato,
        precioUnitario: producto.precio,
        cantidad: guardado.cantidad,
        subtotal: sub,
        disponible: producto.disponible,
      });
    }
    pintar({ items, subtotal, total: subtotal });
  } catch (error) {
    mostrarError('aviso', error);
  }
}

// --- acciones comunes -------------------------------------------------------
async function cambiarCantidad(clave, delta) {
  if (modoInvitado) {
    const item = carritoActual.items.find((i) => i.productoId === clave);
    const nueva = item.cantidad + delta;
    if (nueva < 1) return quitar(clave);
    carritoInvitado.cambiar(clave, Math.min(20, nueva));
    pintarNavegacion();
    return cargarCarritoInvitado();
  }

  const item = carritoActual.items.find((i) => i.id === clave);
  const nueva = item.cantidad + delta;
  if (nueva < 1) return quitar(clave);
  try {
    limpiarAviso('aviso');
    pintar(await api(`/api/v1/cart/items/${clave}`, { metodo: 'PUT', cuerpo: { cantidad: nueva } }));
  } catch (error) {
    mostrarError('aviso', error);
  }
}

async function quitar(clave) {
  if (modoInvitado) {
    carritoInvitado.quitar(clave);
    pintarNavegacion();
    return cargarCarritoInvitado();
  }
  try {
    pintar(await api(`/api/v1/cart/items/${clave}`, { metodo: 'DELETE' }));
  } catch (error) {
    mostrarError('aviso', error);
  }
}

// S33: las comunas vienen del servidor. Las que quedan fuera del radio se
// muestran igual, deshabilitadas, para que el cliente entienda por que no
// puede elegirlas en vez de no encontrarlas.
async function cargarComunas() {
  const select = document.getElementById('comuna');
  try {
    const { data, radioKm } = await api('/api/v1/delivery/comunas');
    const dentro = data.filter((c) => c.dentroDelRadio);
    const fuera = data.filter((c) => !c.dentroDelRadio);

    select.innerHTML = [
      '<option value="">Elige tu comuna</option>',
      `<optgroup label="Con despacho (dentro de ${radioKm} km)">`,
      ...dentro.map((c) => `<option value="${c.comuna}">${c.comuna}</option>`),
      '</optgroup>',
      '<optgroup label="Fuera de la zona de despacho">',
      ...fuera.map((c) => `<option value="${c.comuna}" disabled>${c.comuna}</option>`),
      '</optgroup>',
    ].join('');
  } catch {
    select.innerHTML = '<option value="">No se pudieron cargar las comunas</option>';
  }
}

// S16: la validacion de la zona la hace el servidor. La lista de comunas del
// select es solo comodidad; aunque alguien la edite, el pedido se rechaza.
async function revisarComuna() {
  const comuna = document.getElementById('comuna').value;
  const estado = document.getElementById('estado-zona');
  zonaValida = false;

  if (!comuna) {
    estado.className = 'small mb-3 text-secondary';
    estado.textContent = 'El despacho es gratis dentro de 3 km del local.';
    actualizarBotonPago();
    return;
  }

  try {
    const respuesta = await api('/api/v1/delivery/check', { metodo: 'POST', cuerpo: { comuna } });
    zonaValida = respuesta.dentroDelRadio;
    estado.className = 'small mb-3 ' + (zonaValida ? 'text-success' : 'text-danger');
    estado.textContent = zonaValida
      ? `Dentro del radio de 3 km. Despacho ${respuesta.costo === 0 ? 'gratis' : pesos(respuesta.costo)}.`
      : respuesta.mensaje;
    document.getElementById('resumen-despacho').textContent =
      zonaValida ? (respuesta.costo === 0 ? 'Gratis' : pesos(respuesta.costo)) : '-';
  } catch (error) {
    mostrarError('aviso', error);
  }
  actualizarBotonPago();
}

async function confirmarPedido() {
  const boton = document.getElementById('btn-pagar');
  boton.disabled = true;
  boton.textContent = 'Creando pedido...';
  limpiarAviso('aviso');

  try {
    // Compra sin cuenta: se abre una sesion de invitado con el correo de
    // contacto y el carrito del navegador se traspasa al servidor, que vuelve
    // a fijar precios y a reservar stock. El correo es contacto, no identidad:
    // el identificador de la sesion es aleatorio.
    if (modoInvitado) {
      const sesionInvitado = await api('/api/v1/auth/invitado', {
        metodo: 'POST',
        cuerpo: { correo: document.getElementById('correo-invitado').value.trim() },
      });
      sesion.guardar(sesionInvitado);
      const traspaso = await traspasarCarritoInvitado();
      if (traspaso.traspasados === 0) {
        throw new Error('Los productos de tu carrito ya no tienen stock del dia.');
      }
      modoInvitado = false;
    }

    marcarPaso(2);
    // S21: no se envia ni el contenido ni el total. Eso lo tiene el servidor.
    const pedido = await api('/api/v1/orders', {
      metodo: 'POST',
      cuerpo: {
        direccionEntrega: document.getElementById('direccion').value.trim(),
        comuna: document.getElementById('comuna').value,
      },
    });

    marcarPaso(3);
    // S27: el monto lo fija payments consultando a orders.
    const pago = await api('/api/v1/payments', {
      metodo: 'POST', cuerpo: { pedidoId: pedido.pedidoId, medio: 'servipag' },
    });

    document.getElementById('zona-carrito').classList.add('d-none');
    document.getElementById('zona-pago').classList.remove('d-none');
    document.getElementById('pago-pedido').textContent = pedido.pedidoId;
    document.getElementById('pago-estado').textContent = pedido.estado;
    document.getElementById('pago-total').textContent = pesos(pago.monto);
    if (pedido.descuento > 0) {
      document.getElementById('pago-total').insertAdjacentHTML('beforeend',
        ` <span class="nonna-nota">incluye ${pesos(pedido.descuento)} de descuento de primera compra</span>`);
    }
    document.getElementById('pago-ventana').textContent =
      new Date(pedido.ventanaDespacho).toLocaleString('es-CL');
    document.getElementById('pago-reserva').textContent =
      new Date(pedido.expiraReserva).toLocaleTimeString('es-CL');
    document.getElementById('btn-proveedor').href = pago.urlRedireccion;

    mostrarAviso('aviso',
      'Pedido creado y stock reservado. Queda pendiente hasta que el proveedor confirme el pago.',
      'info');
  } catch (error) {
    marcarPaso(1);
    mostrarError('aviso', error);
    boton.textContent = 'Continuar al pago';
    boton.disabled = false;
  }
}

function iniciar() {
  pintarNavegacion();
  marcarPaso(1);

  modoInvitado = !sesion.token;

  if (modoInvitado && carritoInvitado.leer().length === 0 && !invitado.activo) {
    document.getElementById('sin-sesion').classList.remove('d-none');
    return;
  }

  document.getElementById('zona-carrito').classList.remove('d-none');
  document.getElementById('btn-pagar').addEventListener('click', confirmarPedido);
  document.getElementById('comuna').addEventListener('change', revisarComuna);
  document.getElementById('direccion').addEventListener('input', actualizarBotonPago);

  cargarComunas();

  if (modoInvitado) {
    // Puede comprar igual: solo se le pide un correo de contacto, y se le
    // ofrece la cuenta por el descuento de primera compra.
    document.getElementById('promo-cuenta').classList.remove('d-none');
    document.getElementById('campo-correo').classList.remove('d-none');
    document.getElementById('correo-invitado').addEventListener('input', actualizarBotonPago);
    cargarCarritoInvitado();
    return;
  }

  cargarCarrito();
}

iniciar();
