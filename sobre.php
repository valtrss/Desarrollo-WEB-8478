<?php
$titulo = "Sobre el blog";
$activo = "sobre";
include "partials/head.php";
include "partials/navbar.php";
?>

<main id="contenido" class="container my-4">
    <div class="row">
        <div class="col-12 col-md-8 col-lg-7">
            <h1 class="h3 mb-3">Sobre Ruta Platino</h1>

            <p>
                Ruta Platino reune guias para completar juegos al 100%. La idea nacio de un
                problema concreto: la mayoria de las guias que circulan dicen que hacer, pero
                no advierten cuales trofeos se pierden para siempre si avanzas la historia.
            </p>

            <h2 class="h5 mt-4">Que trae cada guia</h2>
            <ul>
                <li>Dificultad estimada en una escala de 1 a 10.</li>
                <li>Horas reales, no las del mejor caso posible.</li>
                <li>Trofeos perdibles marcados antes de que sea tarde.</li>
                <li>Orden sugerido para evitar una segunda partida completa.</li>
            </ul>

            <h2 class="h5 mt-4">Sobre las imagenes</h2>
            <p class="mb-0">
                Las portadas pertenecen a sus respectivos estudios y distribuidoras. Se
                utilizan aqui unicamente con fines academicos, como parte de un trabajo
                del ramo Desarrollo Web, sin ningun proposito comercial.
            </p>
        </div>
    </div>
</main>

<?php
include "partials/modal.php";
include "partials/footer.php";
