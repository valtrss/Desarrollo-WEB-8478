# Evaluación Unidad 2 — Backend seguro completo

**Caso:** Pastas Frescas "La Nonna" — sistema de ventas on-line con despacho a domicilio
**Ramo:** Desarrollo Web 8478
**Integrante:** Simón Saavedra (trabajo individual)
**Versión del frontend de partida:** bocetos low-fi v1 (`frontend/01-home.svg`, `02-catalogo.svg`, `03-carrito.svg`)

---

## 1. Requisitos del caso

El enunciado oficial del caso no fue provisto en formato documento. Los requisitos
funcionales se establecen a partir del caso de referencia del curso (`Caso19.docx`,
Fukusuke Sushi-Delivery), adaptados al rubro de pastas frescas. Se mantiene la
numeración del caso de referencia para facilitar la trazabilidad.

| ID | Requisito funcional |
|---|---|
| RF1 | Armar un pedido con los productos disponibles en el catálogo |
| RF2 | El pedido se prepara únicamente una vez confirmado el pago |
| RF3 | Permitir anular una compra, registrando el motivo |
| RF4 | Realizar la venta solo sobre pedidos de clientes registrados, asociada a la caja de un cajero virtual |
| RF5 | Registro de clientes con RUN, nombre, dirección, comuna, provincia, región, fecha de nacimiento, sexo, correo y teléfono, validando la existencia del correo |
| RF6 | El registro puede hacerlo el cliente por la web o el administrador en el local |
| RF7 | Administrar la disponibilidad de cada producto (consultar y actualizar) |
| RF8 | Emitir boleta digital por cada venta y enviarla al correo del cliente |
| RF9 | Reporte de ventas por período para el dueño |
| RF10 | Mantenedores de productos, usuarios y clientes |
| RF11 | Validar el correo del cliente mediante una API de mensajería |
| RF12 | Autenticación de usuarios con acceso limitado según perfil |
| RF13 | Emitir las órdenes de despacho para cocina, en el orden de llegada |

**Regla propia del rubro (no presente en el caso de referencia):** la pasta fresca es
perecible. El sistema trabaja con producción y stock del día, con una hora de corte de
pedidos para despacho en la jornada. Esta regla justifica la reserva de stock del
Módulo 3 y la liberación de stock ante anulación.

**Restricción de despacho:** entrega gratuita únicamente dentro de un radio de 3 km
del local.

---

## 2. Stakeholders

| Stakeholder | Interés | Rol en el sistema |
|---|---|---|
| Cliente | Comprar sin ir al local | Rol operativo autenticado |
| Visitante | Conocer la oferta antes de registrarse | Acceso anónimo, solo lectura pública |
| Administrador | Mantener productos, usuarios y clientes | Rol operativo autenticado |
| Cajero virtual | Confirmar ventas y emitir boletas | Rol operativo autenticado |
| Encargado de despacho | Obtener las órdenes para cocina y reparto | Rol operativo autenticado |
| Dueño | Ver cuánto se vendió | Rol autenticado, solo consulta de reportes |
| Choferes | Entregar los pedidos | **Sin permisos operativos.** Reciben la orden de despacho impresa por el encargado |
| Proveedor de pagos | Cobrar y notificar el resultado | Identidad técnica, no usuario |
| Proveedor de correo | Validar correos y enviar boletas | Identidad técnica, no usuario |

---

## 3. Pantallas existentes y brechas declaradas

### Pantallas diseñadas

| ID | Pantalla | Estado |
|---|---|---|
| P01 | Home | Boceto low-fi, escritorio |
| P02 | Catálogo con filtros | Boceto low-fi, escritorio |
| P03 | Carrito (paso 1 del checkout) | Boceto low-fi, escritorio |

### Brechas

La guía exige registrar las funciones del caso que todavía no tienen pantalla y
proponer cómo se incorporan. Estas son:

| ID | Pantalla faltante | Requisito que cubre | Cómo se incorpora |
|---|---|---|---|
| P04 | Registro de cliente | RF5, RF6, RF11 | Formulario con los campos del RF5 y verificación por correo |
| P05 | Inicio de sesión | RF12 | Formulario correo + contraseña, emite sesión |
| P06 | Checkout pasos 2 a 4 (datos, pago, confirmación) | RF2, RF8 | Continuación del stepper ya dibujado en P03 |
| P07 | Mis pedidos y detalle | RF3 | Listado del cliente con acción de anulación |
| P08 | Panel de administración | RF7, RF10 | Mantenedores de productos, usuarios y clientes |
| P09 | Órdenes de despacho | RF13 | Cola de pedidos pagados en orden de llegada |
| P10 | Reporte de ventas | RF9 | Consulta por período para el dueño |

**Variantes móviles:** los bocetos traen anotado el reflujo responsivo por breakpoint
(tarjetas 4→2→1, filtros a offcanvas, resumen del carrito al final). Una variación
visual no genera servicios nuevos: móvil y escritorio consumen los mismos contratos.

---

## 4. Decisiones de arquitectura (no son requisitos del caso)

Estas decisiones son propias de esta evaluación y se fundamentan en los módulos
correspondientes:

- Separación en cuatro microservicios privados: `inventory`, `orders`, `clients`, `payments`.
- Un API Gateway como única superficie pública.
- GraphQL Gateway privado para agregaciones de lectura.
- Servicio de analítica separado de las transacciones para el RF9.
- Comunicación interna gRPC para la reserva de stock entre `orders` e `inventory`.
- Persistencia en PostgreSQL, una base por servicio, sin acceso cruzado.
- Despliegue reproducible con Docker Compose y red privada.
