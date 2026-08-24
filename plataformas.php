<?php
require_once "datos.php";
$titulo = "Plataformas";
$activo = "plataformas";
include "partials/head.php";
include "partials/navbar.php";
?>

<main id="contenido" class="container my-4">
    <h1 class="h3 mb-1">Plataformas</h1>
    <p class="text-body-secondary mb-4">Cuantas guias hay publicadas para cada una.</p>

    <div class="row g-4">
        <?php foreach ($plataformas as $p) {
            // Contamos y promediamos las guias de esta plataforma.
            $delaPlataforma = array_values(array_filter($guias, function ($g) use ($p) {
                return $g["plataforma"] == $p;
            }));
            $cantidad = count($delaPlataforma);
            $horas    = array_sum(array_column($delaPlataforma, "horas"));
            $promedio = $cantidad > 0 ? round($horas / $cantidad) : 0;
        ?>
            <article class="col-12 col-md-6 col-lg-4">
                <div class="card h-100">
                    <div class="card-body">
                        <h2 class="card-title h5"><?php echo $p; ?></h2>
                        <p class="display-6 mb-0"><?php echo $cantidad; ?></p>
                        <p class="text-body-secondary">guia(s) publicada(s)</p>
                        <p class="small mb-3">Promedio: <?php echo $promedio; ?> horas por platino</p>
                        <a class="btn btn-outline-primary btn-sm"
                           href="guias.php?plataforma=<?php echo urlencode($p); ?>">Ver sus guias</a>
                    </div>
                </div>
            </article>
        <?php } ?>
    </div>
</main>

<?php
include "partials/modal.php";
include "partials/footer.php";
