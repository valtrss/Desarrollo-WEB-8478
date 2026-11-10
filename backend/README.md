# Backend — Pastas Frescas La Nonna

Sistema de ventas on-line del caso. Evaluación Unidad 2, Desarrollo Web 8478.

## Requisitos

- Node.js 22.5 o superior (usa `node:sqlite`, incluido en Node; no hay módulos nativos que compilar).
- Nada más. No requiere Docker, ni motor de base de datos aparte, ni cuenta de nube.

## Puesta en marcha

```
cd backend
npm install
npm run secrets     # genera los secretos locales en backend/secrets/ (permisos 600)
npm run migrate     # crea el esquema: una base por microservicio
npm run seed        # datos de prueba ficticios
npm start           # levanta los 9 procesos
```

Para detener: `Ctrl+C` en la terminal donde corre `npm start`. Eso baja todo el conjunto.

Para rotar los secretos: `npm run secrets -- --rotar`.
Para partir de cero: borrar `backend/data/` y repetir `migrate` y `seed`.

## Qué queda corriendo

| Proceso | Puerto | Visibilidad |
|---|---|---|
| `api-gateway` | 8080 | **público** — única superficie externa |
| sitio estático | 8081 | **público** — frontend |
| `auth` | 4000 | privado (127.0.0.1) |
| `clients` | 4001 | privado |
| `inventory` | 4002 | privado, + gRPC en 50051 |
| `orders` | 4003 | privado |
| `payments` | 4004 | privado |
| `analytics` | 4005 | privado |
| `graphql-gateway` | 4100 | privado |

Los privados se enlazan solo a `127.0.0.1` y además exigen una identidad interna
firmada que únicamente el gateway puede emitir. Un navegador no los alcanza, y
si alguien llega al puerto igual recibe `401`.

## Pruebas

Con el sistema levantado, en otra terminal:

```
npm test
```

- `tests/flujo-compra.test.js` — recorrido completo del caso: catálogo, carrito,
  pedido, reserva de stock, pago, boleta, cola de despacho, agregación GraphQL y anulación.
- `tests/seguridad.test.js` — los casos de validación del Módulo 7.

## Cuentas de prueba

Todas ficticias, creadas por `npm run seed`. Las contraseñas están en
`scripts/sembrar.js` y solo sirven en el entorno local.

| Perfil | Correo |
|---|---|
| administrador | `admin@lanonna.cl` |
| dueño | `dueno@lanonna.cl` |
| cajero virtual | `cajero@lanonna.cl` |
| encargado de despacho | `despacho@lanonna.cl` |
| cliente | `ana.perez@ejemplo.cl` |
| cliente | `juan.diaz@ejemplo.cl` |

## Configuración y secretos

No hay valores reales en el repositorio. `backend/secrets/` está en `.gitignore`
y solo se versiona `README.example`, que documenta las referencias simbólicas.

Las cuatro referencias declaradas (`jwt-firma-usuario`, `identidad-interna`,
`pagos-webhook`, `correo-api`) están en `shared/secretos.js` con su emisor,
consumidor, finalidad, alcance y política de rotación. Se pueden consultar sin
valores en `GET http://localhost:8080/api/v1/_rutas`.

## Diagnóstico

- `GET /health` en cualquier servicio.
- `GET http://localhost:8080/api/v1/_rutas` — tabla de rutas publicadas, lista de
  rutas internas no publicadas e inventario de secretos sin valores.
- Los logs salen en JSON con `correlacion`, que permite seguir una solicitud a
  través de todos los servicios. No se registran contraseñas, tokens, RUN ni
  correos: el filtro está en `shared/http.js`.

## Integraciones externas

El proveedor de pagos y el de correo no son accesibles desde este entorno. Se
usan adaptadores de prueba que **conservan el contrato, la firma y las
transiciones**:

- El pago se confirma con una notificación firmada con HMAC-SHA256 y una clave de
  idempotencia, igual que lo haría el proveedor. El adaptador vive en
  `tests/ayuda.js`; el servicio que la verifica es `payments`, y es código real.
- La validación de correo y el envío de boleta quedan registrados como evento en
  el log, sin enviar correo real.

Esto no reemplaza la implementación de los servicios propios: `payments` verifica
firma, idempotencia y monto de verdad, y esas comprobaciones están cubiertas por
las pruebas.
