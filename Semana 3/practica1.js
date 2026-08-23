// Practica 1 - Tipos de datos, objetos y manejo de errores
// Ruta Platino: trabajamos sobre la respuesta que mas adelante entregara la API de guias.

// respuestaAPI = apicall();  // GET https://rutaplatino.cl/api/guias

const respuestaAPI = {
    "status": 200,
    "message": "Guias obtenidas correctamente",
    "data": [
        { "id": 1, "juego": "Hollow Knight",       "plataforma": "Steam",         "dificultad": 8, "horas": 62 },
        { "id": 2, "juego": "God of War Ragnarok", "plataforma": "PlayStation 5", "dificultad": 4, "horas": 45 },
        { "id": 3, "juego": "Bloodborne",          "plataforma": "PlayStation 4", "dificultad": 7, "horas": 70 },
        { "id": 4, "juego": "Stardew Valley",      "plataforma": "Steam",         "dificultad": 5, "horas": 130 }
    ]
};

// --- Recorrido basico ---------------------------------------------------

console.log(`Estado: ${respuestaAPI.status} - ${respuestaAPI.message}`);

respuestaAPI.data.forEach((guia) => {
    console.log(`${guia.juego} (${guia.plataforma}) - dificultad ${guia.dificultad}/10 - ${guia.horas} h`);
});

// --- Transformaciones ---------------------------------------------------

// Solo los nombres de los juegos
const nombres = respuestaAPI.data.map((guia) => guia.juego);
console.log(nombres);

// Las guias accesibles: dificultad menor o igual a 5
const accesibles = respuestaAPI.data.filter((guia) => guia.dificultad <= 5);
console.log(`Guias accesibles: ${accesibles.length}`);

// Total de horas para platinar todo el catalogo
const totalHoras = respuestaAPI.data.reduce((suma, guia) => suma + guia.horas, 0);
console.log(`Horas totales del catalogo: ${totalHoras}`);
console.log(`Promedio por guia: ${(totalHoras / respuestaAPI.data.length).toFixed(1)} h`);

// --- Tipos de datos -----------------------------------------------------

let dato = null;
console.log(typeof(dato));                  // object: null es un caso especial de JavaScript

dato = { "plataforma": "Steam" };
console.log(typeof(dato.plataforma));       // string

let calculo = NaN;
console.log(typeof(calculo));               // number, aunque NaN signifique "no es un numero"

calculo = 1 / 0;
console.log(typeof(calculo), calculo);      // number Infinity

calculo = 1 / dato;
console.log(typeof(calculo), calculo);      // number NaN: no se puede dividir por un objeto

let sinValor;
console.log(typeof(sinValor));              // undefined

console.log(sinValor instanceof Object);    // false
console.log(null instanceof Object);        // false, pese a que typeof diga object
console.log(respuestaAPI.data instanceof Array);  // true

// --- Manejo de errores --------------------------------------------------

// Caso 1: variable que no existe
try {
    console.log(guiaInexistente.juego);
} catch (err) {
    console.log(`Error controlado: ${err.name} - ${err.message}`);
}

// Caso 2: buscar una guia que no esta en el catalogo
function buscarGuia(id) {
    const encontrada = respuestaAPI.data.find((guia) => guia.id === id);
    if (encontrada === undefined) {
        throw new Error(`No existe una guia con id ${id}`);
    }
    return encontrada;
}

try {
    console.log(buscarGuia(2).juego);
    console.log(buscarGuia(99).juego);
} catch (err) {
    console.log(`Error controlado: ${err.message}`);
} finally {
    console.log("Busqueda finalizada");
}
