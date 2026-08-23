<?php
// Portada del repositorio: acceso rapido al avance de cada semana.
$semanas = [
    [
        "numero"  => 2,
        "titulo"  => "Sitio multipagina con Bootstrap 5",
        "detalle" => "Navegacion con dropdown, modal de acceso, footer en grilla, filtros por plataforma y formulario de contacto.",
        "enlace"  => "Semana 2/index.php"
    ],
    [
        "numero"  => 3,
        "titulo"  => "JavaScript: tipos, objetos y DOM",
        "detalle" => "Respuesta simulada de la API de guias, manejo de errores y listado generado con createElement.",
        "enlace"  => "Semana 3/index.html"
    ],
];
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Ruta Platino | Desarrollo Web 8478</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>

<main class="container my-5">
    <h1 class="fw-bold">Ruta Platino</h1>
    <p class="lead">
        Blog de guias para completar videojuegos al 100%. Proyecto del ramo
        Desarrollo Web 8478, construido semana a semana.
    </p>

    <hr class="my-4">

    <h2 class="h4 mb-3">Avance por semana</h2>

    <div class="row g-4">
        <?php foreach ($semanas as $s) { ?>
            <div class="col-12 col-md-6">
                <div class="card h-100">
                    <div class="card-body">
                        <p class="badge text-bg-secondary">Semana <?php echo $s["numero"]; ?></p>
                        <h3 class="card-title h5"><?php echo $s["titulo"]; ?></h3>
                        <p class="card-text"><?php echo $s["detalle"]; ?></p>
                        <a class="btn btn-primary" href="<?php echo $s["enlace"]; ?>">Abrir</a>
                    </div>
                </div>
            </div>
        <?php } ?>
    </div>
</main>

</body>
</html>
