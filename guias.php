<?php
require_once "datos.php";
$titulo = "Guias";
$activo = "guias";
$scriptPagina = "js/guias.js";

// Filtros que llegan por la URL. Sin parametros se muestran todas.
$filtroPlataforma = isset($_GET["plataforma"]) ? $_GET["plataforma"] : "";
$orden            = isset($_GET["orden"]) ? $_GET["orden"] : "";

$resultado = $guias;

if ($filtroPlataforma != "") {
    $resultado = array_values(array_filter($resultado, function ($g) use ($filtroPlataforma) {
        return $g["plataforma"] == $filtroPlataforma;
    }));
}

if ($orden == "faciles") {
    usort($resultado, function ($a, $b) { return $a["dificultad"] - $b["dificultad"]; });
} elseif ($orden == "cortas") {
    usort($resultado, function ($a, $b) { return $a["horas"] - $b["horas"]; });
}

include "partials/head.php";
include "partials/navbar.php";
?>

<div class="container my-4">
    <div class="row g-4">

        <!--
            El <main> va ANTES que el <aside> en el HTML: en movil el contenido
            queda arriba y los filtros bajan al final. En escritorio el orden
            visual se invierte con order-lg-*.
        -->
        <main id="contenido" class="col-12 col-md-8 col-lg-9 order-lg-2">
            <h1 class="h3 mb-1">Todas las guias</h1>
            <p class="text-body-secondary" id="contador" aria-live="polite">
                <?php echo count($resultado); ?> guia(s) encontrada(s)
            </p>

            <!-- El buscador lo maneja js/guias.js: filtra sin recargar la pagina -->
            <div class="mb-4">
                <label for="buscador" class="form-label">Buscar por juego</label>
                <input type="search" class="form-control" id="buscador"
                       placeholder="Escribe el nombre de un juego" autocomplete="off">
            </div>

            <?php if (count($resultado) == 0) { ?>
                <!-- Estado vacio: hay filtros aplicados pero ninguna guia calza -->
                <div class="text-center border rounded-3 p-5">
                    <p class="fs-5 mb-1">No hay guias para ese filtro</p>
                    <p class="text-body-secondary">Prueba con otra plataforma.</p>
                    <a href="guias.php" class="btn btn-outline-primary">Ver todas</a>
                </div>
            <?php } else { ?>
                <div class="row g-4" id="listado">
                    <?php foreach ($resultado as $guia) { ?>
                        <article class="col-12 col-lg-6 tarjeta"
                                 data-juego="<?php echo strtolower($guia["juego"]); ?>">
                            <div class="card tarjeta-guia">
                                <div class="row g-0">
                                    <div class="col-4">
                                        <img src="img/<?php echo $guia["img"]; ?>"
                                             class="portada h-100"
                                             alt="Portada de <?php echo $guia["juego"]; ?>">
                                    </div>
                                    <div class="col-8">
                                        <div class="card-body">
                                            <h2 class="card-title h6"><?php echo $guia["juego"]; ?></h2>
                                            <p class="small text-body-secondary mb-2">
                                                <?php echo $guia["plataforma"]; ?> &#183;
                                                <?php echo $guia["logros"]; ?> logros
                                            </p>
                                            <p class="card-text small"><?php echo $guia["resumen"]; ?></p>

                                            <p class="small mb-1">
                                                Dificultad <?php echo $guia["dificultad"]; ?>/10 &#183;
                                                <?php echo $guia["horas"]; ?> h
                                            </p>
                                            <div class="progress medidor"
                                                 role="progressbar"
                                                 aria-label="Dificultad de <?php echo $guia["juego"]; ?>"
                                                 aria-valuenow="<?php echo $guia["dificultad"]; ?>"
                                                 aria-valuemin="0" aria-valuemax="10">
                                                <div class="progress-bar bg-<?php echo colorDificultad($guia["dificultad"]); ?>"
                                                     style="width: <?php echo $guia["dificultad"] * 10; ?>%"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </article>
                    <?php } ?>
                </div>

                <!-- Estado vacio del buscador. Oculto hasta que JavaScript lo necesite. -->
                <div id="sinResultados" class="text-center border rounded-3 p-5 d-none">
                    <p class="fs-5 mb-1">Ningun juego coincide con tu busqueda</p>
                    <p class="text-body-secondary mb-0">Prueba escribiendo solo una parte del nombre.</p>
                </div>
            <?php } ?>
        </main>

        <!-- Filtros: 3/12 en escritorio, 4/12 en tablet, 12/12 apilado en movil -->
        <aside class="col-12 col-md-4 col-lg-3 order-lg-1" aria-labelledby="titulo-filtros">
            <h2 id="titulo-filtros" class="h5">Filtrar</h2>

            <nav aria-label="Filtro por plataforma">
                <p class="fw-semibold small mb-1">Plataforma</p>
                <ul class="list-group mb-3">
                    <li class="list-group-item <?php echo $filtroPlataforma == "" ? "active" : ""; ?>">
                        <a class="<?php echo $filtroPlataforma == "" ? "link-light" : "link-dark"; ?> text-decoration-none"
                           href="guias.php">Todas</a>
                    </li>
                    <?php foreach ($plataformas as $p) { ?>
                        <li class="list-group-item <?php echo $filtroPlataforma == $p ? "active" : ""; ?>">
                            <a class="<?php echo $filtroPlataforma == $p ? "link-light" : "link-dark"; ?> text-decoration-none"
                               href="guias.php?plataforma=<?php echo urlencode($p); ?>"><?php echo $p; ?></a>
                        </li>
                    <?php } ?>
                </ul>
            </nav>

            <nav aria-label="Ordenar resultados">
                <p class="fw-semibold small mb-1">Ordenar por</p>
                <ul class="list-group">
                    <li class="list-group-item"><a class="link-dark text-decoration-none" href="guias.php?orden=faciles">Mas accesibles</a></li>
                    <li class="list-group-item"><a class="link-dark text-decoration-none" href="guias.php?orden=cortas">Mas cortas</a></li>
                </ul>
            </nav>
        </aside>

    </div>
</div>

<?php
include "partials/modal.php";
include "partials/footer.php";
