// Practica 2 - Manipulacion del DOM y composicion de objetos
// El listado de guias que en la Semana 2 escribimos con PHP, aqui lo genera JavaScript.

const responseAPI = {
    "status": 200,
    "message": "Guias obtenidas",
    "data": [
        { "id": 1, "juego": "Hollow Knight",       "plataforma": "Steam",         "dificultad": 8, "horas": 62 },
        { "id": 2, "juego": "God of War Ragnarok", "plataforma": "PlayStation 5", "dificultad": 4, "horas": 45 },
        { "id": 3, "juego": "Bloodborne",          "plataforma": "PlayStation 4", "dificultad": 7, "horas": 70 },
        { "id": 4, "juego": "Stardew Valley",      "plataforma": "Steam",         "dificultad": 5, "horas": 130 }
    ]
};

// --- Parte 1: llenar un select con las plataformas ----------------------

// Set elimina las plataformas repetidas del listado.
const plataformas = [...new Set(responseAPI.data.map((guia) => guia.plataforma))];

const cmbPlataforma = document.createElement("select");
cmbPlataforma.setAttribute("name", "cmbPlataforma");
cmbPlataforma.setAttribute("id", "cmbPlataforma");
cmbPlataforma.setAttribute("class", "form-select");

const opcionTodas = document.createElement("option");
opcionTodas.setAttribute("value", "");
opcionTodas.innerText = "Todas las plataformas";
cmbPlataforma.appendChild(opcionTodas);

plataformas.forEach((p) => {
    const opcion = document.createElement("option");
    opcion.setAttribute("value", p);
    opcion.innerText = p;
    cmbPlataforma.appendChild(opcion);
});

document.getElementById("filtro").appendChild(cmbPlataforma);

// --- Parte 2: construir las tarjetas en el DOM --------------------------

const contenedor = document.getElementById("listado");
const contador = document.getElementById("contador");

function colorDificultad(nivel) {
    if (nivel <= 4) { return "success"; }
    if (nivel <= 7) { return "warning"; }
    return "danger";
}

function crearTarjeta(guia) {
    const columna = document.createElement("article");
    columna.setAttribute("class", "col-12 col-md-6 col-lg-3");

    const tarjeta = document.createElement("div");
    tarjeta.setAttribute("class", "card h-100");

    const cuerpo = document.createElement("div");
    cuerpo.setAttribute("class", "card-body");

    const titulo = document.createElement("h2");
    titulo.setAttribute("class", "card-title h6");
    titulo.innerText = guia.juego;

    const plataforma = document.createElement("p");
    plataforma.setAttribute("class", "small text-body-secondary mb-2");
    plataforma.innerText = guia.plataforma;

    const etiqueta = document.createElement("span");
    etiqueta.setAttribute("class", `badge text-bg-${colorDificultad(guia.dificultad)}`);
    etiqueta.innerText = `Dificultad ${guia.dificultad}/10`;

    const horas = document.createElement("p");
    horas.setAttribute("class", "card-text small mt-2 mb-0");
    horas.innerText = `${guia.horas} horas aprox.`;

    cuerpo.appendChild(titulo);
    cuerpo.appendChild(plataforma);
    cuerpo.appendChild(etiqueta);
    cuerpo.appendChild(horas);
    tarjeta.appendChild(cuerpo);
    columna.appendChild(tarjeta);

    return columna;
}

function pintarGuias(guias) {
    contenedor.innerHTML = "";   // limpiamos antes de volver a dibujar

    if (guias.length === 0) {
        // Estado vacio
        const vacio = document.createElement("div");
        vacio.setAttribute("class", "col-12 border rounded-3 p-5 text-center");
        vacio.innerText = "No hay guias para esa plataforma.";
        contenedor.appendChild(vacio);
    } else {
        guias.forEach((guia) => contenedor.appendChild(crearTarjeta(guia)));
    }

    contador.innerText = `${guias.length} guia(s)`;
}

pintarGuias(responseAPI.data);

// El select filtra el listado sin recargar la pagina.
cmbPlataforma.addEventListener("change", (evento) => {
    const elegida = evento.target.value;
    const filtradas = elegida === ""
        ? responseAPI.data
        : responseAPI.data.filter((guia) => guia.plataforma === elegida);
    pintarGuias(filtradas);
});

// --- Parte 3: objetos, copia y composicion ------------------------------

const guiaBase = { juego: "Elden Ring", plataforma: "PlayStation 5", borrador: true };

delete guiaBase.borrador;
console.log(guiaBase);

// El spread copia las propiedades en un objeto nuevo.
const guiaPublicada = { publicada: true, ...guiaBase };
console.log(guiaPublicada);

const metadatos = { "tipo": "guia", "idioma": "es" };

// Fusion: todo queda en un mismo nivel.
const fusion = Object.assign({}, guiaPublicada, metadatos);
console.log(fusion);

// Composicion: cada objeto conserva su identidad.
const composicion = { guiaPublicada, metadatos };
console.log(composicion);
console.log(composicion.metadatos);

for (let propiedad in composicion) {
    console.log(propiedad);
}

Object.entries(composicion).forEach(([clave, valor]) => {
    console.log(`clave: ${clave}, juego: ${valor.juego}`);
});

Object.values(composicion).forEach((valor) => {
    console.log(valor);
});

Object.entries(composicion).forEach(([clave, valor]) => {
    Object.entries(valor).forEach(([subclave, subvalor]) => {
        console.log(`${clave}.${subclave} = ${subvalor}`);
    });
});
