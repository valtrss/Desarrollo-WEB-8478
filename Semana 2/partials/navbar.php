<?php
// Barra de navegacion. Cada pagina define $activo para marcar su enlace.
$activo = isset($activo) ? $activo : "";
?>
<nav class="navbar navbar-expand-lg bg-dark navbar-dark" aria-label="Navegacion principal">
    <div class="container-fluid">
        <a class="navbar-brand fw-bold" href="index.php">Ruta Platino</a>

        <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
                data-bs-target="#menuPrincipal" aria-controls="menuPrincipal"
                aria-expanded="false" aria-label="Abrir el menu de navegacion">
            <span class="navbar-toggler-icon"></span>
        </button>

        <div class="collapse navbar-collapse" id="menuPrincipal">
            <ul class="navbar-nav me-auto">
                <li class="nav-item dropdown">
                    <a class="nav-link dropdown-toggle <?php echo $activo == "guias" ? "active" : ""; ?>"
                       href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">Guias</a>
                    <ul class="dropdown-menu">
                        <li><a class="dropdown-item" href="guias.php">Todas las guias</a></li>
                        <li><a class="dropdown-item" href="guias.php?orden=faciles">Las mas accesibles</a></li>
                        <li><a class="dropdown-item" href="guias.php?orden=cortas">Las mas cortas</a></li>
                    </ul>
                </li>
                <li class="nav-item">
                    <a class="nav-link <?php echo $activo == "plataformas" ? "active" : ""; ?>" href="plataformas.php">Plataformas</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link <?php echo $activo == "sobre" ? "active" : ""; ?>" href="sobre.php">Sobre el blog</a>
                </li>
                <li class="nav-item">
                    <a class="nav-link <?php echo $activo == "contacto" ? "active" : ""; ?>" href="contacto.php">Contacto</a>
                </li>
            </ul>

            <button type="button" class="btn btn-outline-light" data-bs-toggle="modal" data-bs-target="#modalAcceso">
                Acceder
            </button>
        </div>
    </div>
</nav>
