<?php
// Catalogo de guias del blog.
// Por ahora vive en un arreglo PHP. Mas adelante saldra de una base de datos.

$plataformas = ["PlayStation 5", "PlayStation 4", "Steam"];

$guias = [
    [
        "id"          => 1,
        "juego"       => "Hollow Knight",
        "plataforma"  => "Steam",
        "dificultad"  => 8,
        "horas"       => 62,
        "logros"      => 63,
        "img"         => "hollow-knight.svg",
        "resumen"     => "El 112% exige Alma Pura y el Panteon de Hallownest. La parte dificil no son los jefes sueltos, sino encadenarlos sin morir."
    ],
    [
        "id"          => 2,
        "juego"       => "God of War Ragnarok",
        "plataforma"  => "PlayStation 5",
        "dificultad"  => 4,
        "horas"       => 45,
        "logros"      => 36,
        "img"         => "gow-ragnarok.svg",
        "resumen"     => "Platino accesible y sin trofeos perdibles. Puedes volver a cualquier zona despues del final para cerrar los coleccionables."
    ],
    [
        "id"          => 3,
        "juego"       => "Bloodborne",
        "plataforma"  => "PlayStation 4",
        "dificultad"  => 7,
        "horas"       => 70,
        "logros"      => 34,
        "img"         => "bloodborne.svg",
        "resumen"     => "Necesita tres finales y las Mazmorras Calices. Planifica los finales con partidas guardadas antes del ultimo jefe."
    ],
    [
        "id"          => 4,
        "juego"       => "Stardew Valley",
        "plataforma"  => "Steam",
        "dificultad"  => 5,
        "horas"       => 130,
        "logros"      => 40,
        "img"         => "stardew-valley.svg",
        "resumen"     => "No es dificil, es largo. El cuello de botella son los envios completos: hay cultivos que solo aparecen en una estacion."
    ],
    [
        "id"          => 5,
        "juego"       => "Marvel's Spider-Man 2",
        "plataforma"  => "PlayStation 5",
        "dificultad"  => 3,
        "horas"       => 28,
        "logros"      => 51,
        "img"         => "spiderman-2.svg",
        "resumen"     => "El platino mas amable de la lista. Todo es acumulable y el mapa marca lo que falta una vez terminada la historia."
    ],
    [
        "id"          => 6,
        "juego"       => "Elden Ring",
        "plataforma"  => "PlayStation 5",
        "dificultad"  => 7,
        "horas"       => 115,
        "logros"      => 42,
        "img"         => "elden-ring.svg",
        "resumen"     => "Requiere las tres reliquias de hechizos y varios finales. Con dos partidas paralelas evitas una tercera vuelta completa."
    ],
];

// Devuelve una etiqueta de color segun la dificultad (1 a 10).
function colorDificultad($nivel) {
    if ($nivel <= 4) { return "success"; }
    if ($nivel <= 7) { return "warning"; }
    return "danger";
}

function textoDificultad($nivel) {
    if ($nivel <= 4) { return "Accesible"; }
    if ($nivel <= 7) { return "Exigente"; }
    return "Muy dificil";
}
