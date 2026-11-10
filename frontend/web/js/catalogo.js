// Catalogo.
//
// Usa los servicios REST S01 (listar), S03 (categorias) y S18 (agregar).
// Los filtros viajan como parametros de consulta y el servidor los valida:
// un filtro invalido devuelve 400, no una lista entera sin filtrar.

import { api, pesos, sesion, carritoInvitado, pintarNavegacion, mostrarAviso, mostrarError, limpiarAviso } from './api.js';

const POR_PAGINA = 9;
const estado = { pagina: 1, categoria: '', formato: '', q: '', soloDisponibles: true };

function tarjeta(producto) {
  const agotado = !producto.disponible;
  return `
    <div class="col-sm-6 col-xl-4">
      <article class="nonna-card d-flex flex-column h-100">
        <div class="nonna-figura"></div>
        <div class="p-3 d-flex flex-column flex-grow-1">
          <h3 class="h6 mb-1">${producto.nombre}</h3>
          <p class="text-secondary small mb-2">${producto.formato} &middot; ${producto.porciones} porciones</p>
          <p class="text-secondary small flex-grow-1">${producto.descripcion ?? ''}</p>
          <div class="d-flex align-items-center justify-content-between mb-3">
            <span class="nonna-precio">${pesos(producto.precio)}</span>
            ${agotado
              ? '<span class="nonna-badge-stock text-danger">AGOTADO</span>'
              : `<span class="nonna-badge-stock">quedan ${producto.stockDelDia}</span>`}
          </div>
          <button class="btn ${agotado ? 'btn-outline-secondary' : 'btn-nonna'} w-100"
                  data-producto="${producto.id}" ${agotado ? 'disabled' : ''}>
            ${agotado ? 'Sin stock hoy' : 'Agregar'}
          </button>
        </div>
      </article>
    </div>`;
}

function pintarPaginacion(total) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const lista = document.getElementById('paginacion');
  if (paginas === 1) { lista.innerHTML = ''; return; }

  let html = '';
  for (let p = 1; p <= paginas; p++) {
    html += `<li class="page-item ${p === estado.pagina ? 'active' : ''}">
      <button class="page-link" data-pagina="${p}">${p}</button></li>`;
  }
  lista.innerHTML = html;
  for (const boton of lista.querySelectorAll('[data-pagina]')) {
    boton.addEventListener('click', () => {
      estado.pagina = Number(boton.dataset.pagina);
      cargarProductos();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}

async function cargarProductos() {
  const parametros = new URLSearchParams({
    page: String(estado.pagina),
    limit: String(POR_PAGINA),
  });
  if (estado.categoria) parametros.set('categoria', estado.categoria);
  if (estado.formato) parametros.set('formato', estado.formato);
  if (estado.q) parametros.set('q', estado.q);
  if (estado.soloDisponibles) parametros.set('available', 'true');

  const contenedor = document.getElementById('resultados');
  try {
    const respuesta = await api('/api/v1/products?' + parametros.toString());
    document.getElementById('total-resultados').textContent = respuesta.total;

    contenedor.innerHTML = respuesta.data.length > 0
      ? respuesta.data.map(tarjeta).join('')
      : '<div class="col-12 text-secondary">No hay productos que cumplan esos filtros.</div>';

    pintarPaginacion(respuesta.total);

    for (const boton of contenedor.querySelectorAll('[data-producto]')) {
      boton.addEventListener('click', () => agregar(boton.dataset.producto, boton));
    }
  } catch (error) {
    contenedor.innerHTML = '<div class="col-12 text-secondary">No se pudo cargar el catalogo.</div>';
    mostrarError('aviso', error);
  }
}

async function cargarFiltros() {
  try {
    const { data } = await api('/api/v1/categories');
    document.getElementById('filtro-categorias').innerHTML = data.map((c) => `
      <div class="form-check">
        <input class="form-check-input" type="radio" name="categoria" id="cat-${c.id}" value="${c.id}">
        <label class="form-check-label" for="cat-${c.id}">${c.nombre}</label>
      </div>`).join('');

    document.getElementById('filtro-formatos').innerHTML =
      ['250 g', '350 g', '500 g', 'Pack 2 kg'].map((f, i) => `
        <div class="form-check">
          <input class="form-check-input" type="radio" name="formato" id="fmt-${i}" value="${f}">
          <label class="form-check-label" for="fmt-${i}">${f}</label>
        </div>`).join('');
  } catch {
    document.getElementById('filtro-categorias').textContent = 'No se pudieron cargar las categorias.';
  }
}

async function agregar(productoId, boton) {
  // Sin sesion, el producto va al carrito del navegador (modo invitado).
  if (!sesion.token) {
    carritoInvitado.agregar(productoId, 1);
    pintarNavegacion();
    mostrarAviso('aviso',
      'Agregado a tu carrito de invitado. Para confirmar el pedido vas a necesitar una cuenta.',
      'info');
    return;
  }

  limpiarAviso('aviso');
  boton.disabled = true;
  try {
    const carrito = await api('/api/v1/cart/items', {
      metodo: 'POST', cuerpo: { productoId, cantidad: 1 },
    });
    mostrarAviso('aviso', `Agregado. Tu carrito suma ${pesos(carrito.total)}.`);
  } catch (error) {
    // Por ejemplo: el stock se acabo mientras el cliente miraba la pagina.
    mostrarError('aviso', error);
    cargarProductos();
  } finally {
    boton.disabled = false;
  }
}

function conectarFiltros() {
  document.getElementById('btn-filtrar').addEventListener('click', () => {
    estado.categoria = document.querySelector('input[name="categoria"]:checked')?.value ?? '';
    estado.formato = document.querySelector('input[name="formato"]:checked')?.value ?? '';
    estado.soloDisponibles = document.getElementById('solo-disponibles').checked;
    estado.pagina = 1;
    cargarProductos();
  });

  document.getElementById('btn-limpiar').addEventListener('click', () => {
    for (const entrada of document.querySelectorAll('input[type="radio"]')) entrada.checked = false;
    document.getElementById('solo-disponibles').checked = true;
    document.getElementById('buscador').value = '';
    Object.assign(estado, { pagina: 1, categoria: '', formato: '', q: '', soloDisponibles: true });
    cargarProductos();
  });

  let temporizador;
  document.getElementById('buscador').addEventListener('input', (evento) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      estado.q = evento.target.value.trim();
      estado.pagina = 1;
      cargarProductos();
    }, 300);
  });
}

async function iniciar() {
  pintarNavegacion();
  const categoriaInicial = new URLSearchParams(location.search).get('categoria');
  if (categoriaInicial) estado.categoria = categoriaInicial;

  await cargarFiltros();
  if (categoriaInicial) {
    const entrada = document.getElementById('cat-' + categoriaInicial);
    if (entrada) entrada.checked = true;
  }
  conectarFiltros();
  cargarProductos();
}

iniciar();
