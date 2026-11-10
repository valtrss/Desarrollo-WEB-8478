// Home.
//
// Esta pantalla es la evidencia del Modulo 8: toda la portada se arma con UNA
// sola consulta GraphQL que el gateway privado compone desde inventory, orders
// y clients. El navegador no sabe que existen esos subsistemas.

import { graphql, api, pesos, sesion, carritoInvitado, pintarNavegacion, mostrarAviso, mostrarError } from './api.js';

const CONSULTA_PORTADA = `
  query {
    portada {
      horaCorte
      categorias { id nombre }
      productosDelDia { id nombre formato precio disponible stockDelDia }
      misUltimosPedidos {
        id estado total creadoEn
        items { nombre cantidad }
      }
    }
  }
`;

function tarjetaProducto(producto) {
  const agotado = !producto.disponible;
  return `
    <div class="col-6 col-lg-3">
      <article class="nonna-card h-100 d-flex flex-column">
        <div class="nonna-figura"></div>
        <div class="p-3 d-flex flex-column flex-grow-1">
          <h3 class="h6 mb-1">${producto.nombre}</h3>
          <p class="text-secondary small mb-2">Formato ${producto.formato}</p>
          <div class="d-flex align-items-center justify-content-between mb-3">
            <span class="nonna-precio">${pesos(producto.precio)}</span>
            <span class="nonna-badge-stock">
              ${agotado ? 'agotado' : 'quedan ' + producto.stockDelDia}
            </span>
          </div>
          <button class="btn ${agotado ? 'btn-outline-secondary' : 'btn-nonna'} mt-auto w-100"
                  data-producto="${producto.id}" ${agotado ? 'disabled' : ''}>
            ${agotado ? 'Sin stock hoy' : 'Agregar al carrito'}
          </button>
        </div>
      </article>
    </div>`;
}

function tarjetaCategoria(categoria) {
  return `
    <div class="col-6 col-md-4">
      <a class="text-decoration-none" href="/catalogo.html?categoria=${categoria.id}">
        <div class="nonna-card h-100">
          <div class="nonna-figura" style="aspect-ratio: 21/9;"></div>
          <div class="p-3"><strong class="text-dark">${categoria.nombre}</strong></div>
        </div>
      </a>
    </div>`;
}

function tarjetaPedido(pedido) {
  const resumen = pedido.items.map((i) => `${i.cantidad} x ${i.nombre}`).join(', ');
  return `
    <div class="col-md-4">
      <div class="nonna-card p-3 h-100">
        <div class="d-flex justify-content-between">
          <code class="small">${pedido.id}</code>
          <span class="badge text-bg-secondary">${pedido.estado}</span>
        </div>
        <p class="small text-secondary mt-2 mb-1">${resumen}</p>
        <strong>${pesos(pedido.total)}</strong>
      </div>
    </div>`;
}

async function agregarAlCarrito(productoId, boton) {
  // Sin sesion, el producto va al carrito del navegador. Se traspasa al
  // servidor al entrar, y recien ahi se fijan precios y se reserva stock.
  if (!sesion.token) {
    carritoInvitado.agregar(productoId, 1);
    pintarNavegacion();
    mostrarAviso('aviso',
      'Agregado a tu carrito de invitado. Para confirmar el pedido vas a necesitar una cuenta.',
      'info');
    return;
  }

  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Agregando...';
  try {
    // El navegador manda producto y cantidad. El precio lo pone el servidor.
    await api('/api/v1/cart/items', {
      metodo: 'POST', cuerpo: { productoId, cantidad: 1 },
    });
    mostrarAviso('aviso', 'Producto agregado al carrito.');
    boton.textContent = 'Agregado';
    setTimeout(() => { boton.textContent = textoOriginal; boton.disabled = false; }, 1200);
  } catch (error) {
    mostrarError('aviso', error);
    boton.textContent = textoOriginal;
    boton.disabled = false;
  }
}

async function cargar() {
  pintarNavegacion();
  try {
    const { portada } = await graphql(CONSULTA_PORTADA);

    document.getElementById('hora-corte').textContent = portada.horaCorte;

    document.getElementById('productos-del-dia').innerHTML =
      portada.productosDelDia.length > 0
        ? portada.productosDelDia.map(tarjetaProducto).join('')
        : '<div class="col-12 text-secondary">Hoy no queda produccion disponible.</div>';

    document.getElementById('categorias').innerHTML =
      portada.categorias.slice(0, 3).map(tarjetaCategoria).join('');

    if (portada.misUltimosPedidos.length > 0) {
      document.getElementById('seccion-pedidos').classList.remove('d-none');
      document.getElementById('mis-pedidos').innerHTML =
        portada.misUltimosPedidos.map(tarjetaPedido).join('');
    }

    for (const boton of document.querySelectorAll('[data-producto]')) {
      boton.addEventListener('click', () => agregarAlCarrito(boton.dataset.producto, boton));
    }
  } catch (error) {
    document.getElementById('productos-del-dia').innerHTML =
      '<div class="col-12 text-secondary">No se pudo cargar el catalogo.</div>';
    mostrarError('aviso', error);
  }
}

cargar();
