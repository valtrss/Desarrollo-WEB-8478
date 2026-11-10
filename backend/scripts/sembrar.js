// Datos de prueba ficticios.
//
// Ningun dato aqui corresponde a una persona real. Las contrasenas se guardan
// hasheadas con sal igual que en el alta normal: no hay un camino alternativo
// que las deje en claro.

import { abrirBase } from '../shared/db.js';
import { hashearClave } from '../shared/clave.js';

const ahora = new Date().toISOString();

// --- clients ----------------------------------------------------------------
const clients = abrirBase('clients');

const CUENTAS = [
  { id: 'cli_admin', run: '11111111-1', nombre: 'Rosa Bianchi Nonna', correo: 'admin@lanonna.cl',
    clave: 'AdminNonna2026!', rol: 'administrador' },
  { id: 'cli_dueno', run: '22222222-2', nombre: 'Giuseppe Bianchi', correo: 'dueno@lanonna.cl',
    clave: 'DuenoNonna2026!', rol: 'dueno' },
  { id: 'cli_cajero', run: '33333333-3', nombre: 'Marta Rojas', correo: 'cajero@lanonna.cl',
    clave: 'CajeroNonna2026!', rol: 'cajero' },
  { id: 'cli_despacho', run: '44444444-4', nombre: 'Luis Contreras', correo: 'despacho@lanonna.cl',
    clave: 'DespachoNonna2026!', rol: 'despacho' },
  { id: 'cli_ana', run: '12345678-5', nombre: 'Ana Perez Soto', correo: 'ana.perez@ejemplo.cl',
    clave: 'pastaFresca2026!', rol: 'cliente' },
  { id: 'cli_juan', run: '9876543-3', nombre: 'Juan Diaz Lagos', correo: 'juan.diaz@ejemplo.cl',
    clave: 'ravioles2026Seguro', rol: 'cliente' },
];

for (const cuenta of CUENTAS) {
  clients.prepare(`
    INSERT INTO clientes (id, run, nombre_completo, correo, clave_hash, telefono,
      direccion, comuna, provincia, region, fecha_nacimiento, sexo, rol,
      estado_verificacion, token_verificacion, creado_en, actualizado_en)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)
    ON CONFLICT(id) DO NOTHING
  `).run(
    cuenta.id, cuenta.run, cuenta.nombre, cuenta.correo, hashearClave(cuenta.clave),
    '+5691000000' + cuenta.id.length, 'Av. Pajaritos 1234', 'Maipu', 'Santiago',
    'Metropolitana', '1990-01-15', null, cuenta.rol, 'verificado', ahora, ahora
  );
}
console.log(`  + clients: ${CUENTAS.length} cuentas (todas verificadas, claves hasheadas)`);

// --- inventory --------------------------------------------------------------
const inventory = abrirBase('inventory');

const CATEGORIAS = [
  { id: 'pastas-rellenas', nombre: 'Pastas rellenas', orden: 1 },
  { id: 'pastas-largas', nombre: 'Pastas largas', orden: 2 },
  { id: 'noquis', nombre: 'Noquis', orden: 3 },
  { id: 'salsas', nombre: 'Salsas', orden: 4 },
  { id: 'packs', nombre: 'Packs y ofertas', orden: 5 },
];
for (const c of CATEGORIAS) {
  inventory.prepare('INSERT INTO categorias (id, nombre, orden) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING')
    .run(c.id, c.nombre, c.orden);
}

const PRODUCTOS = [
  // Pastas rellenas
  ['prd_ravioles', 'Ravioles de ricotta', 'Masa fresca del dia rellena con ricotta y nuez moscada.', 'pastas-rellenas', '500 g', 2, 4990, 12],
  ['prd_sorrentinos', 'Sorrentinos de jamon y queso', 'Rellenos de jamon de pierna y queso mantecoso.', 'pastas-rellenas', '500 g', 2, 5490, 8],
  ['prd_capelletti', 'Capelletti de carne', 'Posta negra cocida lento con sofrito de verduras.', 'pastas-rellenas', '500 g', 2, 5990, 9],
  ['prd_panzotti', 'Panzotti de espinaca y ricotta', 'Espinaca salteada con ajo y ricotta fresca.', 'pastas-rellenas', '500 g', 2, 5290, 11],
  ['prd_agnolotti', 'Agnolotti de osobuco', 'Osobuco deshilachado, receta de la casa.', 'pastas-rellenas', '500 g', 2, 6490, 6],
  ['prd_tortellini', 'Tortellini de queso azul y nuez', 'Para quienes buscan algo con mas caracter.', 'pastas-rellenas', '250 g', 1, 3990, 7],
  ['prd_canelones', 'Canelones de verdura', 'Listos para hornear, en bandeja de aluminio.', 'pastas-rellenas', 'Bandeja 1 kg', 4, 10900, 4],

  // Pastas largas
  ['prd_fettuccine', 'Fettuccine al huevo', 'Cortados a cuchillo, con huevo de campo.', 'pastas-largas', '500 g', 2, 4490, 20],
  ['prd_tallarines', 'Tallarines de espinaca', 'Masa verde con espinaca fresca.', 'pastas-largas', '500 g', 2, 4690, 10],
  ['prd_spaghetti', 'Spaghetti alla chitarra', 'Corte cuadrado tradicional abruzense.', 'pastas-largas', '500 g', 2, 4590, 16],
  ['prd_pappardelle', 'Pappardelle al huevo', 'Cinta ancha, ideal para salsas de carne.', 'pastas-largas', '500 g', 2, 4890, 13],
  ['prd_linguine', 'Linguine de semola', 'Semola de trigo candeal, sin huevo.', 'pastas-largas', '500 g', 2, 4390, 18],
  ['prd_tagliatelle', 'Tagliatelle al limon', 'Ralladura de limon de Pica en la masa.', 'pastas-largas', '500 g', 2, 4990, 8],
  ['prd_lasagna', 'Laminas para lasana', 'Doce laminas listas para armar.', 'pastas-largas', '500 g', 4, 3890, 12],

  // Noquis
  ['prd_noquis', 'Noquis de papa', 'Papa seleccionada, sin conservantes.', 'noquis', '500 g', 2, 4290, 15],
  ['prd_noquis_zapallo', 'Noquis de zapallo', 'Zapallo camote asado, mas dulces y suaves.', 'noquis', '500 g', 2, 4590, 9],
  ['prd_noquis_rellenos', 'Noquis rellenos de queso', 'Con corazon de queso mantecoso.', 'noquis', '500 g', 2, 5190, 6],

  // Salsas
  ['prd_pomodoro', 'Salsa pomodoro', 'Tomate san marzano cocido a fuego lento.', 'salsas', '350 g', 2, 2490, 0],
  ['prd_pesto', 'Salsa pesto genovese', 'Albahaca, pinones y parmesano.', 'salsas', '250 g', 2, 3290, 14],
  ['prd_bolognesa', 'Salsa bolognesa', 'Cuatro horas de coccion, carne molida a cuchillo.', 'salsas', '350 g', 2, 3890, 10],
  ['prd_alfredo', 'Salsa alfredo', 'Crema, mantequilla y parmesano reggiano.', 'salsas', '350 g', 2, 3590, 8],
  ['prd_putanesca', 'Salsa putanesca', 'Alcaparras, aceitunas y anchoas.', 'salsas', '350 g', 2, 3690, 5],
  ['prd_cuatro_quesos', 'Salsa cuatro quesos', 'Azul, parmesano, mantecoso y de cabra.', 'salsas', '350 g', 2, 4290, 7],

  // Packs
  ['prd_pack_familiar', 'Pack familiar', 'Dos pastas, dos salsas, para cuatro personas.', 'packs', 'Pack 2 kg', 4, 15900, 5],
  ['prd_pack_dos', 'Pack para dos', 'Una pasta rellena y una salsa a eleccion.', 'packs', 'Pack 750 g', 2, 7900, 9],
  ['prd_pack_vegetariano', 'Pack vegetariano', 'Panzotti, noquis de zapallo y pesto.', 'packs', 'Pack 1.5 kg', 3, 12900, 4],
];
for (const [id, nombre, descripcion, categoria, formato, porciones, precio, stock] of PRODUCTOS) {
  inventory.prepare(`
    INSERT INTO productos (id, nombre, descripcion, categoria_id, formato, porciones,
      precio, imagen_url, stock_del_dia, stock_reservado, descontinuado, actualizado_en)
    VALUES (?,?,?,?,?,?,?,?,?,0,0,?)
    ON CONFLICT(id) DO UPDATE SET stock_del_dia = excluded.stock_del_dia
  `).run(id, nombre, descripcion, categoria, formato, porciones, precio,
         `/img/${id}.jpg`, stock, ahora);
}
console.log(`  + inventory: ${CATEGORIAS.length} categorias y ${PRODUCTOS.length} productos`);
console.log('    (la salsa pomodoro queda en 0 para demostrar el caso AGOTADO)');

// --- orders -----------------------------------------------------------------
const orders = abrirBase('orders');

// Comunas de la Region Metropolitana de Santiago de Chile.
// El local esta en Maipu: solo Maipu y Cerrillos quedan dentro del radio de
// 3 km. Las demas se declaran igual, para poder responderle al cliente que su
// comuna esta fuera de la zona en vez de dejarlo adivinando.
const DENTRO_DEL_RADIO = ['Maipu', 'Cerrillos'];

const COMUNAS_RM = [
  'Cerrillos', 'Cerro Navia', 'Conchali', 'El Bosque', 'Estacion Central',
  'Huechuraba', 'Independencia', 'La Cisterna', 'La Florida', 'La Granja',
  'La Pintana', 'La Reina', 'Las Condes', 'Lo Barnechea', 'Lo Espejo',
  'Lo Prado', 'Macul', 'Maipu', 'Nunoa', 'Pedro Aguirre Cerda',
  'Penalolen', 'Providencia', 'Pudahuel', 'Quilicura', 'Quinta Normal',
  'Recoleta', 'Renca', 'San Joaquin', 'San Miguel', 'San Ramon',
  'Santiago', 'Vitacura', 'Puente Alto', 'San Bernardo', 'Padre Hurtado',
  'Penaflor', 'Talagante', 'Colina', 'Lampa', 'Buin',
];

for (const comuna of COMUNAS_RM) {
  const dentro = DENTRO_DEL_RADIO.includes(comuna) ? 1 : 0;
  orders.prepare(`
    INSERT INTO comunas_despacho (comuna, dentro_radio, costo, region)
    VALUES (?,?,?,?)
    ON CONFLICT(comuna) DO UPDATE SET dentro_radio = excluded.dentro_radio
  `).run(comuna, dentro, 0, 'Metropolitana');
}
console.log(`  + orders: ${COMUNAS_RM.length} comunas de la RM (${DENTRO_DEL_RADIO.length} dentro del radio de 3 km)`);

console.log('\nDatos de prueba listos.');
console.log('Cuentas (solo para el entorno local):');
console.log('  administrador  admin@lanonna.cl');
console.log('  dueno          dueno@lanonna.cl');
console.log('  cajero         cajero@lanonna.cl');
console.log('  despacho       despacho@lanonna.cl');
console.log('  cliente        ana.perez@ejemplo.cl');
console.log('Las contrasenas estan en backend/scripts/sembrar.js, que no se despliega.');
