// Validaciones de entrada. Modulo 1: "Todas las entradas de datos deben
// considerar las validaciones correspondientes". El servidor nunca confia en
// que el navegador ya valido.

import { fallar } from './http.js';

export function exigirTexto(valor, campo, { min = 1, max = 200 } = {}) {
  if (typeof valor !== 'string' || valor.trim().length < min || valor.trim().length > max) {
    fallar(400, 'campo_invalido', `El campo "${campo}" debe tener entre ${min} y ${max} caracteres.`);
  }
  return valor.trim();
}

export function exigirEntero(valor, campo, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < min || numero > max) {
    fallar(400, 'campo_invalido', `El campo "${campo}" debe ser un entero entre ${min} y ${max}.`);
  }
  return numero;
}

export function exigirUnoDe(valor, campo, permitidos) {
  if (!permitidos.includes(valor)) {
    fallar(400, 'campo_invalido', `El campo "${campo}" debe ser uno de: ${permitidos.join(', ')}.`);
  }
  return valor;
}

// Formato de correo. La existencia real de la casilla la confirma el proveedor
// de correo (RF11), no esta expresion.
export function exigirCorreo(valor, campo = 'correo') {
  const texto = exigirTexto(valor, campo, { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto)) {
    fallar(400, 'correo_invalido', 'El correo no tiene un formato valido.');
  }
  return texto;
}

// RUN chileno con digito verificador (modulo 11).
export function exigirRun(valor, campo = 'run') {
  const texto = exigirTexto(valor, campo, { max: 15 }).replace(/[.\s]/g, '').toUpperCase();
  const partes = texto.split('-');
  if (partes.length !== 2) {
    fallar(400, 'run_invalido', 'El RUN debe venir en formato 12345678-5.');
  }
  const [cuerpo, digito] = partes;
  if (!/^\d{7,8}$/.test(cuerpo)) {
    fallar(400, 'run_invalido', 'El cuerpo del RUN debe tener 7 u 8 digitos.');
  }

  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);

  if (digito !== esperado) {
    fallar(422, 'run_digito_invalido', 'El digito verificador del RUN no corresponde.');
  }
  return cuerpo + '-' + digito;
}

export function exigirFechaIso(valor, campo) {
  const texto = exigirTexto(valor, campo, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto) || Number.isNaN(Date.parse(texto))) {
    fallar(400, 'fecha_invalida', `El campo "${campo}" debe venir como AAAA-MM-DD.`);
  }
  return texto;
}

export function edadEnAnios(fechaIso) {
  const nacimiento = new Date(fechaIso);
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
  return edad;
}
