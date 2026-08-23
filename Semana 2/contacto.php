<?php
require_once "datos.php";
$titulo = "Contacto";
$activo = "contacto";

// El formulario todavia no envia nada a ninguna parte: solo confirma en pantalla.
// El envio real es tema de una semana posterior.
$enviado = isset($_POST["enviar"]);
$nombre  = isset($_POST["nombre"]) ? trim($_POST["nombre"]) : "";

include "partials/head.php";
include "partials/navbar.php";
?>

<main id="contenido" class="container my-4">
    <div class="row">
        <div class="col-12 col-md-8 col-lg-6">
            <h1 class="h3 mb-1">Proponer una guia</h1>
            <p class="text-body-secondary mb-4">
                Si conseguiste un platino que no esta en la lista, cuentanos como lo hiciste.
            </p>

            <?php if ($enviado) { ?>
                <!-- Estado de exito -->
                <div class="alert alert-success" role="alert">
                    Gracias<?php echo $nombre != "" ? ", " . htmlspecialchars($nombre) : ""; ?>.
                    Recibimos tu propuesta y la revisaremos antes de publicarla.
                </div>
            <?php } ?>

            <form method="post" action="contacto.php">
                <div class="mb-3">
                    <label for="nombre" class="form-label">Nombre</label>
                    <input type="text" class="form-control" id="nombre" name="nombre" required>
                </div>

                <div class="mb-3">
                    <label for="correo" class="form-label">Correo</label>
                    <input type="email" class="form-control" id="correo" name="correo"
                           aria-describedby="ayudaCorreo" required>
                    <div id="ayudaCorreo" class="form-text">Solo lo usamos para responderte.</div>
                </div>

                <div class="mb-3">
                    <label for="plataforma" class="form-label">Plataforma</label>
                    <select class="form-select" id="plataforma" name="plataforma">
                        <?php foreach ($plataformas as $p) { ?>
                            <option value="<?php echo $p; ?>"><?php echo $p; ?></option>
                        <?php } ?>
                    </select>
                </div>

                <div class="mb-3">
                    <label for="mensaje" class="form-label">Tu ruta al platino</label>
                    <textarea class="form-control" id="mensaje" name="mensaje" rows="5" required></textarea>
                </div>

                <button type="submit" name="enviar" value="1" class="btn btn-primary">Enviar propuesta</button>
            </form>
        </div>
    </div>
</main>

<?php
include "partials/modal.php";
include "partials/footer.php";
