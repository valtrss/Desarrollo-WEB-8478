<?php
// Cabecera comun. Cada pagina define $titulo antes de incluir este archivo.
$titulo = isset($titulo) ? $titulo : "Ruta Platino";
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo $titulo; ?> | Ruta Platino</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="css/estilos.css" rel="stylesheet">
</head>
<body>
<!-- Enlace para saltar la navegacion usando el teclado -->
<a href="#contenido" class="visually-hidden-focusable saltar">Saltar al contenido principal</a>
