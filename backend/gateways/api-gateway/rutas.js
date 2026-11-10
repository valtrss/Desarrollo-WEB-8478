// Tabla de rutas del API Gateway (Modulo 6).
//
// Es la unica lista de endpoints alcanzables desde internet. Lo que no esta
// aqui, no se publica: no hay redireccion generica hacia los servicios.
//
// acceso:
//   'anonimo'       -> no exige sesion
//   'autenticado'   -> exige sesion valida, cualquier perfil
//   [ 'rol', ... ]  -> exige sesion y uno de esos perfiles
//
// La autorizacion fina (propiedad del recurso, estado del pedido) la vuelve a
// comprobar el servicio de destino. El gateway filtra, no sustituye.

export const DESTINOS = {
  auth: 'http://127.0.0.1:4000',
  clients: 'http://127.0.0.1:4001',
  inventory: 'http://127.0.0.1:4002',
  orders: 'http://127.0.0.1:4003',
  payments: 'http://127.0.0.1:4004',
  analytics: 'http://127.0.0.1:4005',
};

export const RUTAS = [
  // --- catalogo: publico y anonimo -----------------------------------------
  { id: 'S01', metodo: 'GET',    externa: '/api/v1/products',            destino: 'inventory', interna: '/products',            acceso: 'anonimo',     limite: 120 },
  { id: 'S04', metodo: 'GET',    externa: '/api/v1/products/today',      destino: 'inventory', interna: '/products/today',      acceso: 'anonimo',     limite: 120 },
  { id: 'S03', metodo: 'GET',    externa: '/api/v1/categories',          destino: 'inventory', interna: '/categories',          acceso: 'anonimo',     limite: 120 },
  { id: 'S02', metodo: 'GET',    externa: '/api/v1/products/:id',        destino: 'inventory', interna: '/products/:id',        acceso: 'anonimo',     limite: 120 },

  // --- administracion del catalogo -----------------------------------------
  { id: 'S05', metodo: 'POST',   externa: '/api/v1/products',            destino: 'inventory', interna: '/products',            acceso: ['administrador'], limite: 30 },
  { id: 'S06', metodo: 'PUT',    externa: '/api/v1/products/:id',        destino: 'inventory', interna: '/products/:id',        acceso: ['administrador'], limite: 30 },
  { id: 'S07', metodo: 'PUT',    externa: '/api/v1/products/:id/stock',  destino: 'inventory', interna: '/products/:id/stock',  acceso: ['administrador'], limite: 60 },
  { id: 'S08', metodo: 'DELETE', externa: '/api/v1/products/:id',        destino: 'inventory', interna: '/products/:id',        acceso: ['administrador'], limite: 10 },

  // --- cuentas ---------------------------------------------------------------
  { id: 'S09', metodo: 'POST',   externa: '/api/v1/clients',             destino: 'clients',   interna: '/clients',             acceso: 'anonimo',     limite: 5 },
  { id: 'S10', metodo: 'POST',   externa: '/api/v1/clients/verify-email',destino: 'clients',   interna: '/clients/verify-email',acceso: 'anonimo',     limite: 10 },
  // El limite por IP contiene el abuso masivo; la proteccion real contra
  // fuerza bruta sobre UNA cuenta son los 5 intentos fallidos en 15 minutos
  // que cuenta clients, que es el custodio de la credencial.
  { id: 'S11', metodo: 'POST',   externa: '/api/v1/auth/login',          destino: 'auth',      interna: '/auth/login',          acceso: 'anonimo',     limite: 30 },
  { id: 'S32', metodo: 'POST',   externa: '/api/v1/auth/invitado',        destino: 'auth',      interna: '/auth/invitado',       acceso: 'anonimo',     limite: 20 },
  { id: 'S12', metodo: 'POST',   externa: '/api/v1/auth/logout',         destino: 'auth',      interna: '/auth/logout',         acceso: 'autenticado', limite: 30 },
  { id: 'S13', metodo: 'GET',    externa: '/api/v1/clients/me',          destino: 'clients',   interna: '/clients/me',          acceso: 'autenticado', limite: 60 },
  { id: 'S14', metodo: 'PUT',    externa: '/api/v1/clients/me',          destino: 'clients',   interna: '/clients/me',          acceso: 'autenticado', limite: 30 },
  { id: 'S15', metodo: 'GET',    externa: '/api/v1/clients',             destino: 'clients',   interna: '/clients',             acceso: ['administrador'], limite: 30 },

  // --- carrito y pedidos -----------------------------------------------------
  { id: 'S33', metodo: 'GET',    externa: '/api/v1/delivery/comunas',    destino: 'orders',    interna: '/delivery/comunas',    acceso: 'anonimo',     limite: 60 },
  { id: 'S16', metodo: 'POST',   externa: '/api/v1/delivery/check',      destino: 'orders',    interna: '/delivery/check',      acceso: 'anonimo',     limite: 60 },
  { id: 'S17', metodo: 'GET',    externa: '/api/v1/cart',                destino: 'orders',    interna: '/cart',                acceso: ['cliente', 'invitado'],   limite: 120 },
  { id: 'S18', metodo: 'POST',   externa: '/api/v1/cart/items',          destino: 'orders',    interna: '/cart/items',          acceso: ['cliente', 'invitado'],   limite: 120 },
  { id: 'S19', metodo: 'PUT',    externa: '/api/v1/cart/items/:id',      destino: 'orders',    interna: '/cart/items/:id',      acceso: ['cliente', 'invitado'],   limite: 120 },
  { id: 'S20', metodo: 'DELETE', externa: '/api/v1/cart/items/:id',      destino: 'orders',    interna: '/cart/items/:id',      acceso: ['cliente', 'invitado'],   limite: 120 },
  { id: 'S21', metodo: 'POST',   externa: '/api/v1/orders',              destino: 'orders',    interna: '/orders',              acceso: ['cliente', 'invitado'],   limite: 20 },
  { id: 'S22', metodo: 'GET',    externa: '/api/v1/orders',              destino: 'orders',    interna: '/orders',              acceso: ['cliente', 'invitado'],   limite: 60 },
  { id: 'S23', metodo: 'GET',    externa: '/api/v1/orders/:id',          destino: 'orders',    interna: '/orders/:id',          acceso: 'autenticado', limite: 60 },
  { id: 'S24', metodo: 'POST',   externa: '/api/v1/orders/:id/cancellation', destino: 'orders', interna: '/orders/:id/cancellation', acceso: 'autenticado', limite: 20 },
  { id: 'S25', metodo: 'PUT',    externa: '/api/v1/orders/:id/status',   destino: 'orders',    interna: '/orders/:id/status',   acceso: ['administrador', 'cajero'], limite: 60 },
  { id: 'S26', metodo: 'GET',    externa: '/api/v1/dispatch/orders',     destino: 'orders',    interna: '/dispatch/orders',     acceso: ['despacho', 'administrador'], limite: 60 },

  // --- pagos -----------------------------------------------------------------
  { id: 'S27', metodo: 'POST',   externa: '/api/v1/payments',            destino: 'payments',  interna: '/payments',            acceso: ['cliente', 'invitado'],   limite: 20 },
  { id: 'S29', metodo: 'GET',    externa: '/api/v1/payments/:id',        destino: 'payments',  interna: '/payments/:id',        acceso: 'autenticado', limite: 60 },
  { id: 'S30', metodo: 'GET',    externa: '/api/v1/invoices/:pedidoId',  destino: 'payments',  interna: '/invoices/:pedidoId',  acceso: 'autenticado', limite: 60 },
  // El webhook no lleva sesion: su identidad es la firma HMAC del proveedor,
  // que verifica payments. El gateway solo lo enruta y limita su frecuencia.
  { id: 'S28', metodo: 'POST',   externa: '/api/v1/payments/webhook',    destino: 'payments',  interna: '/payments/webhook',    acceso: 'proveedor',   limite: 60 },

  // --- reportes ---------------------------------------------------------------
  { id: 'S31', metodo: 'GET',    externa: '/api/v1/reports/sales',       destino: 'analytics', interna: '/reports/sales',       acceso: ['dueno', 'administrador'], limite: 30 },
];

// Rutas internas que NUNCA se publican. Estan aqui para dejar explicito que su
// ausencia en la tabla anterior es una decision, no un olvido.
export const NO_PUBLICADAS = [
  'clients  /internal/credenciales/verificar',
  'clients  /internal/clients/:id',
  'auth     /internal/revocada/:jti',
  'inventory /internal/precios',
  'inventory /internal/reservas',
  'orders   /internal/orders/:id',
  'orders   /internal/orders/:id/pagado',
  'orders   /internal/ventas',
  'analytics /internal/resumen-hoy',
  'inventory gRPC lanonna.inventario.Inventario (127.0.0.1:50051)',
];
