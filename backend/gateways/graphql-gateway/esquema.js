// Schema del GraphQL Gateway privado (Modulo 8).
//
// Solo lectura: las reglas transaccionales se quedan en los servicios de
// negocio. Aqui no hay mutations que creen pedidos ni confirmen pagos.

export const SDL = `
  "Producto tal como lo ve el publico. Nunca expone costo ni proveedor."
  type Producto {
    id: ID!
    nombre: String!
    formato: String!
    precio: Int!
    disponible: Boolean!
    stockDelDia: Int!
    imagenUrl: String
  }

  type Categoria {
    id: ID!
    nombre: String!
  }

  "Linea de un pedido. El precio quedo congelado al confirmar."
  type ItemPedido {
    productoId: ID!
    nombre: String!
    formato: String!
    cantidad: Int!
    precioUnitario: Int!
    subtotal: Int!
    "Descripcion vigente del catalogo. Viene de inventory, no de orders."
    productoVigente: Producto
  }

  type Anulacion {
    motivo: String!
    fecha: String!
  }

  "Agregacion principal: combina orders, inventory y clients."
  type ResumenPedido {
    id: ID!
    estado: String!
    subtotal: Int!
    costoDespacho: Int!
    total: Int!
    ventanaDespacho: String
    creadoEn: String!
    items: [ItemPedido!]!
    anulacion: Anulacion
    "Nombre del cliente. Solo se entrega al propio cliente o al personal."
    nombreCliente: String
    "Direccion de entrega: dato restringido, nunca sale a un tercero."
    direccionEntrega: String
  }

  type Portada {
    productosDelDia: [Producto!]!
    categorias: [Categoria!]!
    horaCorte: String!
    "Ultimos pedidos del cliente autenticado. Vacio para un visitante."
    misUltimosPedidos: [ResumenPedido!]!
  }

  type PanelDueno {
    dia: String!
    totalVentas: Int!
    cantidadPedidos: Int!
    pedidosEnCola: Int!
  }

  type Query {
    "Agregacion de orders + inventory + clients para una pantalla de detalle."
    resumenPedido(id: ID!): ResumenPedido

    "Agregacion de inventory + orders para la home."
    portada: Portada!

    "Agregacion de analytics + orders. Solo el dueno o el administrador."
    panelDueno: PanelDueno
  }
`;
