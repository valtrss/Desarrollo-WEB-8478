# Módulo 1 — Servicios derivados del frontend

Cada operación que el navegador necesita realizar sobre el backend, con su contrato,
su trazabilidad a pantalla y requisito, y la clasificación de los datos que transporta.

**Convención de clasificación de datos**

- `público` — puede divulgarse sin identificar ni perjudicar a nadie (descripción de producto, precio).
- `restringido` — dato personal del cliente (RUN, dirección, correo, historial de pedidos).
- `credencial` — contraseña o token del usuario.
- `secreto` — credencial de integración entre sistemas. **Nunca viaja al navegador.**

Que un dato aparezca en una pantalla no lo vuelve público.

---

## 1. Catálogo de servicios

| ID | Requisito | Pantalla y acción | Verbo y ruta | Sistema | Acceso |
|---|---|---|---|---|---|
| S01 | RF1, RF7 | P02 Catálogo → cargar productos | `GET /api/v1/products` | inventory | anónimo |
| S02 | RF1 | P02 → abrir detalle de producto | `GET /api/v1/products/{id}` | inventory | anónimo |
| S03 | RF1 | P01 Home → listar categorías | `GET /api/v1/categories` | inventory | anónimo |
| S04 | RF1, RF7 | P01 → productos del día | `GET /api/v1/products/today` | inventory | anónimo |
| S05 | RF7, RF10 | P08 Admin → crear producto | `POST /api/v1/products` | inventory | administrador |
| S06 | RF7, RF10 | P08 → editar producto | `PUT /api/v1/products/{id}` | inventory | administrador |
| S07 | RF7 | P08 → actualizar stock del día | `PUT /api/v1/products/{id}/stock` | inventory | administrador |
| S08 | RF10 | P08 → descontinuar producto | `DELETE /api/v1/products/{id}` | inventory | administrador |
| S09 | RF5, RF6, RF11 | P04 Registro → crear cuenta | `POST /api/v1/clients` | clients | anónimo |
| S10 | RF11 | P04 → confirmar correo | `POST /api/v1/clients/verify-email` | clients | anónimo con token |
| S11 | RF12 | P05 Login → iniciar sesión | `POST /api/v1/auth/login` | clients | anónimo |
| S12 | RF12 | header → cerrar sesión | `POST /api/v1/auth/logout` | clients | autenticado |
| S13 | RF5 | P06 → cargar mis datos | `GET /api/v1/clients/me` | clients | cliente propietario |
| S14 | RF5 | P06 → actualizar dirección | `PUT /api/v1/clients/me` | clients | cliente propietario |
| S15 | RF10 | P08 → listar clientes | `GET /api/v1/clients` | clients | administrador |
| S16 | solución | P03 Carrito → validar comuna | `POST /api/v1/delivery/check` | orders | anónimo |
| S17 | RF1 | P03 → ver carrito | `GET /api/v1/cart` | orders | cliente propietario |
| S18 | RF1 | P01/P02 → agregar al carrito | `POST /api/v1/cart/items` | orders | cliente propietario |
| S19 | RF1 | P03 → cambiar cantidad | `PUT /api/v1/cart/items/{id}` | orders | cliente propietario |
| S20 | RF1 | P03 → quitar producto | `DELETE /api/v1/cart/items/{id}` | orders | cliente propietario |
| S21 | RF1, RF4 | P06 → confirmar pedido | `POST /api/v1/orders` | orders | cliente autenticado |
| S22 | RF3 | P07 Mis pedidos → listar | `GET /api/v1/orders` | orders | cliente propietario |
| S23 | RF3 | P07 → ver un pedido | `GET /api/v1/orders/{id}` | orders | propietario, admin o despacho |
| S24 | RF3 | P07 → anular indicando motivo | `POST /api/v1/orders/{id}/cancellation` | orders | propietario o admin |
| S25 | RF2, RF4 | P08 → cambiar estado del pedido | `PUT /api/v1/orders/{id}/status` | orders | admin o cajero virtual |
| S26 | RF13 | P09 Despacho → cola de preparación | `GET /api/v1/dispatch/orders` | orders | encargado de despacho |
| S27 | RF2 | P06 → iniciar pago | `POST /api/v1/payments` | payments | cliente propietario |
| S28 | RF2 | — (servidor a servidor) | `POST /api/v1/payments/webhook` | payments | identidad del proveedor |
| S29 | RF2 | P06 → estado del pago | `GET /api/v1/payments/{id}` | payments | cliente propietario |
| S30 | RF8 | — (interno, tras pago) | `POST /internal/invoices` | payments | cajero virtual (interno) |
| S31 | RF9 | P10 Reporte → ventas por período | `GET /api/v1/reports/sales` | analytics | dueño o administrador |
| G01 | RF1, RF3 | P07 → resumen de un pedido | `POST /graphql` → `resumenPedido` | graphql-gateway | cliente propietario |
| G02 | RF1, RF7 | P01 → datos de la portada | `POST /graphql` → `portada` | graphql-gateway | anónimo o autenticado |

**Reutilización.** P01 y P02 ejecutan la misma operación de agregar al carrito (S18):
es un solo servicio, no dos. S04 es un caso particular de S01 con el filtro del día
aplicado por el servidor; se expone aparte porque la home no debe decidir qué
significa "del día".

**Operaciones destructivas.** El único `DELETE` sobre un recurso de negocio es S08, y
es un retiro lógico: el producto queda descontinuado y conserva su historial de ventas.
La anulación de un pedido (S24) **no** es un `DELETE`: crea un registro de anulación
con su motivo, porque el RF3 exige conservar el motivo y el RF9 necesita el histórico.

---

## 2. Contratos

### S01 — Consultar catálogo

- **Propósito:** listar los productos que el cliente puede comprar.
- **Entrada:** `available` (boolean, opcional), `categoria` (string, opcional), `formato` (string, opcional), `q` (string, opcional, búsqueda), `page` (entero ≥ 1, por defecto 1), `limit` (entero 1–50, por defecto 12). Sin cuerpo.
- **Salida:** `200` con la lista paginada. `[]` si no hay resultados, no `404`.
- **Reglas y errores:** `400` ante filtros inválidos o `limit` fuera de rango. Devuelve únicamente campos del catálogo: nunca costo de producción, proveedor ni margen.
- **Clasificación:** todo público.
- **Acceso:** anónimo.

```json
{
  "data": [
    {
      "id": "prd_rav_ricotta",
      "nombre": "Ravioles de ricotta",
      "categoria": "pastas-rellenas",
      "formato": "500 g",
      "porciones": 2,
      "precio": 4990,
      "disponible": true,
      "stockDelDia": 12,
      "imagenUrl": "/img/ravioles-ricotta.jpg"
    }
  ],
  "page": 1,
  "limit": 12,
  "total": 48
}
```

### S09 — Registrar cliente

- **Propósito:** crear la cuenta que habilita comprar (RF5, RF6).
- **Entrada:** cuerpo JSON. `run` (string, obligatorio, formato chileno con dígito verificador), `nombreCompleto` (string, obligatorio), `correo` (string, obligatorio, formato válido), `password` (string, obligatorio, mínimo 10 caracteres), `telefono` (string, obligatorio), `direccion`, `comuna`, `provincia`, `region` (string, obligatorios), `fechaNacimiento` (fecha ISO, obligatorio, mayor de 18), `sexo` (enum, opcional).
- **Salida:** `201` con `{id, nombreCompleto, correo, estadoVerificacion}`. **No devuelve el RUN completo ni la contraseña.**
- **Reglas y errores:** `409` si el RUN o el correo ya existen. `422` si el RUN tiene dígito verificador inválido. La contraseña se almacena con hash adaptativo con sal (argon2id), nunca cifrada ni en claro. La cuenta queda en `pendiente_verificacion` hasta que el proveedor de correo confirme la existencia de la casilla (RF11); mientras tanto no puede confirmar pedidos.
- **Clasificación:** `run`, `direccion`, `fechaNacimiento`, `telefono`, `correo` son **restringidos**; `password` es **credencial**.
- **Acceso:** anónimo.

```json
{
  "run": "12.345.678-5",
  "nombreCompleto": "Ana Pérez Soto",
  "correo": "ana.perez@ejemplo.cl",
  "password": "pastaFresca2026!",
  "telefono": "+56912345678",
  "direccion": "Av. Siempre Viva 742",
  "comuna": "Maipú",
  "provincia": "Santiago",
  "region": "Metropolitana",
  "fechaNacimiento": "1996-04-12",
  "sexo": "F"
}
```

Respuesta `201`:

```json
{
  "id": "cli_8f21",
  "nombreCompleto": "Ana Pérez Soto",
  "correo": "ana.perez@ejemplo.cl",
  "estadoVerificacion": "pendiente_verificacion"
}
```

### S11 — Iniciar sesión

- **Entrada:** `{correo, password}`.
- **Salida:** `200` con `{accessToken, expiraEn, perfil}`. El token se emite firmado por el Auth Service.
- **Reglas y errores:** `401` genérico ante correo inexistente o contraseña incorrecta — **el mensaje no distingue cuál de los dos falló**, para no permitir enumerar cuentas. Límite de intentos por correo y por IP. `403` si la cuenta no ha verificado su correo.
- **Clasificación:** `password` credencial; `accessToken` credencial de sesión.
- **Acceso:** anónimo.

```json
{
  "accessToken": "<jwt>",
  "expiraEn": 900,
  "perfil": { "id": "cli_8f21", "nombre": "Ana", "rol": "cliente" }
}
```

### S18 — Agregar producto al carrito

- **Entrada:** `{productoId, cantidad}`. `cantidad` entero entre 1 y 20.
- **Salida:** `200` con el carrito recalculado por el servidor.
- **Reglas y errores:** `404` si el producto no existe, `409` si no hay stock del día suficiente, `400` si la cantidad está fuera de rango. **El precio no se recibe del navegador:** `orders` lo consulta a `inventory`. Si el producto cambió de precio desde que se cargó la pantalla, manda el precio del servidor.
- **Clasificación:** público el producto; el contenido del carrito es restringido y pertenece al cliente.
- **Acceso:** cliente propietario del carrito.

```json
{ "productoId": "prd_rav_ricotta", "cantidad": 2 }
```

Respuesta `200`:

```json
{
  "carritoId": "car_31ac",
  "items": [
    { "id": "it_01", "productoId": "prd_rav_ricotta", "nombre": "Ravioles de ricotta",
      "formato": "500 g", "precioUnitario": 4990, "cantidad": 2, "subtotal": 9980 }
  ],
  "subtotal": 9980,
  "despacho": 0,
  "total": 9980
}
```

### S21 — Confirmar pedido

- **Entrada:** `{direccionEntrega, comuna, observaciones?}`. El contenido del pedido **no se envía**: se toma del carrito del servidor.
- **Salida:** `201` con `{pedidoId, estado: "pendiente_pago", total, ventanaDespacho}`.
- **Reglas y errores:** `409` si el carrito está vacío, si algún ítem perdió stock o si la comuna queda fuera del radio de 3 km. `409` si se superó la hora de corte y el cliente pidió despacho del mismo día. El servidor **recalcula todos los precios y el total**; los valores que muestre el navegador son solo informativos. Reserva el stock de cada ítem en `inventory` antes de aceptar el pedido, y lo libera si el pago no se confirma dentro del plazo.
- **Clasificación:** dirección y comuna restringidos.
- **Acceso:** cliente autenticado y verificado (RF4: solo clientes registrados).

```json
{
  "pedidoId": "ped_2026_0417",
  "estado": "pendiente_pago",
  "total": 9980,
  "ventanaDespacho": "2026-11-09T18:00:00-03:00",
  "expiraReserva": "2026-11-09T12:20:00-03:00"
}
```

### S24 — Anular pedido

- **Entrada:** `{motivo}` (string obligatorio, 10–300 caracteres).
- **Salida:** `200` con `{pedidoId, estado: "anulado", motivo, anuladoPor, fecha}`.
- **Reglas y errores:** `403` si el pedido no pertenece al cliente. `409` si el pedido ya entró a preparación — a partir de ese estado solo el administrador puede anular. El registro del pedido **se conserva**; cambia de estado y gana un registro de anulación. Libera el stock reservado en `inventory`.
- **Clasificación:** el motivo es restringido.
- **Acceso:** cliente propietario, o administrador.

```json
{ "motivo": "Me equivoqué en la dirección de entrega" }
```

### S27 — Iniciar pago

- **Entrada:** `{pedidoId, medio}` donde `medio` ∈ `servipag` | `transferencia`.
- **Salida:** `201` con `{pagoId, urlRedireccion, estado: "iniciado"}`.
- **Reglas y errores:** `409` si el pedido no está en `pendiente_pago` o ya tiene un pago iniciado vigente. **El monto lo determina `payments` consultando a `orders`, nunca el navegador.**
- **Clasificación:** el `pagoId` es restringido; la credencial del proveedor es **secreto** y no sale del backend.
- **Acceso:** cliente propietario del pedido.

### S28 — Notificación del proveedor de pagos

- **Entrada:** cuerpo del proveedor + cabecera de firma `X-Signature` + `X-Idempotency-Key`.
- **Salida:** `200` siempre que la notificación se haya procesado o ya estuviera procesada.
- **Reglas y errores:** se verifica la firma HMAC con el secreto compartido antes de leer el cuerpo; firma inválida → `401` y se registra el intento. Una misma `X-Idempotency-Key` **no se procesa dos veces** (RF2: no confirmar dos veces un pedido ni cobrar doble). `payments` es el único que decide que un pago está confirmado; luego notifica a `orders` para la transición a `pagado`. **El frontend nunca puede declarar un pedido pagado.**
- **Clasificación:** el secreto de firma es **secreto de integración**.
- **Acceso:** identidad técnica del proveedor, no un usuario.

```json
{
  "pagoId": "pag_55de",
  "pedidoId": "ped_2026_0417",
  "estado": "aprobado",
  "montoConfirmado": 9980,
  "fecha": "2026-11-09T12:08:31-03:00"
}
```

### S31 — Reporte de ventas por período

- **Entrada:** `from` y `to` (fechas ISO, obligatorias, rango máximo 1 año), `agrupacion` ∈ `dia` | `semana` | `mes`.
- **Salida:** `200` con totales agregados por período y por categoría.
- **Reglas y errores:** `400` si `from` > `to` o el rango excede el máximo. **El reporte no incluye datos personales de clientes**: entrega totales, no listados de compradores.
- **Clasificación:** agregados internos del negocio, no públicos.
- **Acceso:** dueño o administrador.

```json
{
  "desde": "2026-11-01", "hasta": "2026-11-09", "agrupacion": "dia",
  "totalVentas": 1284300,
  "cantidadPedidos": 142,
  "series": [ { "periodo": "2026-11-01", "ventas": 148900, "pedidos": 17 } ]
}
```

### G01 — `resumenPedido` (GraphQL)

Agregación de lectura que combina `orders` (estado y totales), `inventory`
(descripción pública de cada producto) y `clients` (nombre para el saludo). Se detalla
en el Módulo 8 junto al schema y los resolvers.

---

## 3. Qué calcula el servidor y qué solo transporta el navegador

La guía advierte explícitamente que *"los precios, totales y estados de pago enviados
desde el navegador no constituyen evidencia confiable para el servidor"*. En este
diseño:

| Dato | Lo envía el navegador | Lo determina el servidor |
|---|---|---|
| Precio unitario | No | `inventory` |
| Subtotal y total | No, solo los muestra | `orders` |
| Costo de despacho | No | `orders`, según la comuna |
| Disponibilidad | No | `inventory` |
| Estado del pedido | No | `orders`, y solo tras aviso de `payments` |
| Estado del pago | No | `payments`, tras verificar la firma del proveedor |
| Identidad del usuario | Envía el token | El gateway lo valida y propaga identidad verificada |
| Cantidad pedida | Sí | El servidor la valida contra stock y rango permitido |
| Dirección de entrega | Sí | El servidor la valida contra el radio de despacho |
