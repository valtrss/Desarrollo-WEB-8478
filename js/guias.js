// Buscador del listado de guias.
// Filtra las tarjetas ya presentes en la pagina, sin recargar ni volver al servidor.

const buscador      = document.getElementById("buscador");
const contador      = document.getElementById("contador");
const sinResultados = document.getElementById("sinResultados");

// document.querySelectorAll devuelve una NodeList; la pasamos a arreglo
// para poder usar filter y forEach con comodidad.
const tarjetas = Array.from(document.querySelectorAll(".tarjeta"));

// Deja el texto en minusculas y sin tildes, para que "ragnarok" encuentre "Ragnarök".
function normalizar(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function filtrar(termino) {
    const busqueda = normalizar(termino.trim());
    let visibles = 0;

    tarjetas.forEach((tarjeta) => {
        const juego = normalizar(tarjeta.dataset.juego);
        const calza = juego.includes(busqueda);

        // classList.toggle agrega o quita la clase segun la condicion.
        tarjeta.classList.toggle("d-none", !calza);

        if (calza) {
            visibles = visibles + 1;
        }
    });

    contador.innerText = `${visibles} guia(s) encontrada(s)`;

    // El estado vacio solo aparece cuando hay una busqueda que no dio resultados.
    sinResultados.classList.toggle("d-none", visibles > 0);
}

// El buscador solo tiene sentido si la pagina trae tarjetas.
if (buscador !== null && tarjetas.length > 0) {
    buscador.addEventListener("input", (evento) => {
        filtrar(evento.target.value);
    });
}
