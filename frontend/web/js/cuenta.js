// Cuenta: acceso, registro, mis pedidos y anulacion.
//
// Servicios: S09 (registro), S11 (login), S13 (perfil), S22 (mis pedidos),
// S24 (anular) y la agregacion GraphQL panelDueno para los perfiles internos.

import {
  api, graphql, pesos, sesion, invitado, carritoInvitado, traspasarCarritoInvitado,
  pintarNavegacion, mostrarError, mostrarAviso, limpiarAviso,
} from './api.js';

let pedidoAAnular = null;

const ESTADOS = {
  pendiente_pago: 'warning',
  pagado: 'success',
  en_preparacion: 'info',
  en_despacho: 'info',
  entregado: 'secondary',
  anulado: 'danger',
};

function volverA() {
  return new URLSearchParams(location.search).get('volver');
}

// --- acceso -----------------------------------------------------------------
async function entrar(evento) {
  evento.preventDefault();
  limpiarAviso('aviso');
  try {
    const datos = await api('/api/v1/auth/login', {
      metodo: 'POST',
      cuerpo: {
        correo: document.getElementById('correo').value.trim(),
        password: document.getElementById('clave').value,
      },
    });
    sesion.guardar(datos);
    invitado.desactivar();

    // El carrito armado como invitado se traspasa al servidor, que vuelve a
    // fijar los precios y a comprobar el stock. Lo que no alcance, se avisa.
    const traspaso = await traspasarCarritoInvitado();
    if (traspaso.omitidos.length > 0) {
      mostrarAviso('aviso',
        `Se traspasaron ${traspaso.traspasados} productos. ${traspaso.omitidos.length} ya no tenian stock.`,
        'warning');
      setTimeout(() => { location.href = volverA() ?? '/cuenta.html'; }, 2500);
      return;
    }
    location.href = volverA() ?? '/cuenta.html';
  } catch (error) {
    // El servidor responde lo mismo para correo inexistente y clave mala.
    mostrarError('aviso', error);
  }
}

async function registrar(evento) {
  evento.preventDefault();
  limpiarAviso('aviso');
  const leer = (id) => document.getElementById(id).value.trim();

  try {
    const creado = await api('/api/v1/clients', {
      metodo: 'POST',
      cuerpo: {
        run: leer('r-run'),
        nombreCompleto: leer('r-nombre'),
        correo: leer('r-correo'),
        password: document.getElementById('r-clave').value,
        telefono: leer('r-telefono'),
        direccion: leer('r-direccion'),
        comuna: leer('r-comuna'),
        provincia: leer('r-provincia'),
        region: leer('r-region'),
        fechaNacimiento: leer('r-nacimiento'),
      },
    });

    // RF11: la cuenta nace sin verificar. En un entorno real el token llega
    // por correo; el adaptador de prueba lo devuelve para poder continuar.
    if (creado.tokenVerificacionPrueba) {
      await api('/api/v1/clients/verify-email', {
        metodo: 'POST', cuerpo: { token: creado.tokenVerificacionPrueba },
      });
    }
    mostrarAviso('aviso', 'Cuenta creada y correo verificado. Ya puedes entrar.');
    document.querySelector('[data-bs-target="#panel-entrar"]').click();
    document.getElementById('correo').value = creado.correo;
  } catch (error) {
    mostrarError('aviso', error);
  }
}

// --- panel del cliente ------------------------------------------------------
function tarjetaPedido(pedido) {
  const puedeAnular = ['pendiente_pago', 'pagado'].includes(pedido.estado);
  const lineas = pedido.items
    .map((i) => `<li>${i.cantidad} x ${i.nombre} <span class="text-secondary">(${i.formato})</span></li>`)
    .join('');

  return `
    <article class="nonna-card p-3">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <code>${pedido.id}</code>
          <span class="badge text-bg-${ESTADOS[pedido.estado] ?? 'secondary'} ms-2">${pedido.estado}</span>
        </div>
        <strong class="nonna-precio">${pesos(pedido.total)}</strong>
      </div>
      <ul class="small text-secondary mt-2 mb-2">${lineas}</ul>
      <p class="small text-secondary mb-2">
        ${pedido.comuna} &middot; ${new Date(pedido.creadoEn).toLocaleString('es-CL')}
      </p>
      ${pedido.anulacion
        ? `<p class="small text-danger mb-0">Anulado: ${pedido.anulacion.motivo}</p>`
        : puedeAnular
          ? `<button class="btn btn-outline-danger btn-sm" data-anular="${pedido.id}">Anular pedido</button>`
          : ''}
    </article>`;
}

async function cargarPedidos() {
  const contenedor = document.getElementById('lista-pedidos');

  // "Mis pedidos" es del comprador. Un administrador o un dueno no tienen
  // historial propio: mostrarles un error rojo era confundir falta de datos
  // con falta de permiso.
  if (!['cliente', 'invitado'].includes(sesion.perfil?.rol)) {
    document.getElementById('pedidos').classList.add('d-none');
    return;
  }

  try {
    const { data } = await api('/api/v1/orders');
    contenedor.innerHTML = data.length > 0
      ? data.map(tarjetaPedido).join('')
      : '<p class="text-secondary">Todavia no has hecho pedidos.</p>';

    for (const boton of contenedor.querySelectorAll('[data-anular]')) {
      boton.addEventListener('click', () => abrirAnulacion(boton.dataset.anular));
    }
  } catch (error) {
    contenedor.innerHTML = '<p class="text-secondary">No se pudieron cargar tus pedidos.</p>';
    mostrarError('aviso', error);
  }
}

async function cargarPerfil() {
  try {
    const perfil = await api('/api/v1/clients/me');
    document.getElementById('datos-perfil').innerHTML = `
      <dt class="col-5 fw-normal text-secondary">Nombre</dt><dd class="col-7">${perfil.nombreCompleto}</dd>
      <dt class="col-5 fw-normal text-secondary">Correo</dt><dd class="col-7">${perfil.correo}</dd>
      <dt class="col-5 fw-normal text-secondary">RUN</dt><dd class="col-7">${perfil.run}</dd>
      <dt class="col-5 fw-normal text-secondary">Comuna</dt><dd class="col-7">${perfil.comuna}</dd>
      <dt class="col-5 fw-normal text-secondary">Perfil</dt><dd class="col-7">${perfil.rol}</dd>`;
    // El RUN llega enmascarado desde clients: el servidor decide cuanto muestra.
  } catch (error) {
    mostrarError('aviso', error);
  }
}

async function cargarPanelDueno() {
  const rol = sesion.perfil?.rol;
  if (!['dueno', 'administrador'].includes(rol)) return;

  document.getElementById('panel-dueno').classList.remove('d-none');
  try {
    const { panelDueno } = await graphql('query { panelDueno { dia totalVentas cantidadPedidos pedidosEnCola } }');
    document.getElementById('datos-dueno').innerHTML = `
      <dt class="col-7 fw-normal text-secondary">Dia</dt><dd class="col-5 text-end">${panelDueno.dia}</dd>
      <dt class="col-7 fw-normal text-secondary">Ventas</dt><dd class="col-5 text-end">${pesos(panelDueno.totalVentas)}</dd>
      <dt class="col-7 fw-normal text-secondary">Pedidos</dt><dd class="col-5 text-end">${panelDueno.cantidadPedidos}</dd>
      <dt class="col-7 fw-normal text-secondary">En cola</dt><dd class="col-5 text-end">${panelDueno.pedidosEnCola}</dd>`;
  } catch (error) {
    document.getElementById('datos-dueno').innerHTML =
      `<dd class="col-12 text-secondary small">${error.message}</dd>`;
  }
}

// --- anulacion (RF3) --------------------------------------------------------
function abrirAnulacion(pedidoId) {
  pedidoAAnular = pedidoId;
  document.getElementById('motivo').value = '';
  document.getElementById('error-motivo').classList.add('d-none');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('modal-anular')).show();
}

async function confirmarAnulacion() {
  const motivo = document.getElementById('motivo').value.trim();
  const error = document.getElementById('error-motivo');

  if (motivo.length < 10) {
    error.textContent = 'El motivo debe tener al menos 10 caracteres.';
    error.classList.remove('d-none');
    return;
  }
  try {
    await api(`/api/v1/orders/${pedidoAAnular}/cancellation`, {
      metodo: 'POST', cuerpo: { motivo },
    });
    bootstrap.Modal.getInstance(document.getElementById('modal-anular')).hide();
    mostrarAviso('aviso', 'Pedido anulado. El stock volvio al catalogo del dia.');
    cargarPedidos();
  } catch (errorApi) {
    error.textContent = errorApi.message;
    error.classList.remove('d-none');
  }
}

// --- arranque ---------------------------------------------------------------
function iniciar() {
  pintarNavegacion();

  if (!sesion.token) {
    document.getElementById('zona-acceso').classList.remove('d-none');
    document.getElementById('form-entrar').addEventListener('submit', entrar);
    document.getElementById('form-registro').addEventListener('submit', registrar);
    document.getElementById('btn-invitado').addEventListener('click', () => {
      invitado.activar();
      location.href = carritoInvitado.leer().length > 0 ? '/carrito.html' : '/catalogo.html';
    });
    return;
  }

  document.getElementById('zona-cuenta').classList.remove('d-none');
  document.getElementById('btn-confirmar-anular').addEventListener('click', confirmarAnulacion);
  cargarPerfil();
  cargarPedidos();
  cargarPanelDueno();
}

iniciar();
