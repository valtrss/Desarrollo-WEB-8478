<?php
require_once "datos.php";
$titulo = "Inicio";
$activo = "inicio";
include "partials/head.php";
include "partials/navbar.php";

// En la portada mostramos solo las cuatro guias mas recientes.
$destacadas = array_slice($guias, 0, 4);
?>

<main id="contenido" class="container my-4">

    <!-- Presentacion -->
    <section class="p-4 p-md-5 mb-4 bg-body-secondary rounded-3" aria-labelledby="titulo-hero">
        <div class="row">
            <div class="col-12 col-lg-8">
                <h1 id="titulo-hero" class="fw-bold">Guias para platinar sin perder el tiempo</h1>
                <p class="lead mb-3">
                    Rutas ordenadas para conseguir el 100% de los logros. Cada guia dice cuanto
                    demora de verdad, que trofeos son perdibles y en que orden conviene hacerlos.
                </p>
                <a href="guias.php" class="btn btn-primary btn-lg">Ver todas las guias</a>
            </div>
        </div>
    </section>

    <!-- Guias destacadas: 4 por fila en escritorio, 2 en tablet, 1 en movil -->
    <section aria-labelledby="titulo-destacadas">
        <h2 id="titulo-destacadas" class="h4 mb-3">Ultimas guias publicadas</h2>

        <div class="row g-4">
            <?php foreach ($destacadas as $guia) { ?>
                <article class="col-12 col-md-6 col-lg-3">
                    <div class="card tarjeta-guia">
                        <img src="img/<?php echo $guia["img"]; ?>"
                             class="portada card-img-top"
                             alt="Portada de <?php echo $guia["juego"]; ?>">
                        <div class="card-body">
                            <h3 class="card-title h6"><?php echo $guia["juego"]; ?></h3>
                            <p class="small text-body-secondary mb-2"><?php echo $guia["plataforma"]; ?></p>
                            <span class="badge text-bg-<?php echo colorDificultad($guia["dificultad"]); ?>">
                                <?php echo textoDificultad($guia["dificultad"]); ?> <?php echo $guia["dificultad"]; ?>/10
                            </span>
                            <p class="card-text small mt-2 mb-0"><?php echo $guia["horas"]; ?> horas aprox.</p>
                        </div>
                    </div>
                </article>
            <?php } ?>
        </div>
    </section>

</main>

<?php
include "partials/modal.php";
include "partials/footer.php";
