<!-- Ventana de acceso. Todavia no valida nada: la autenticacion real es tema de otra semana. -->
<div class="modal fade" id="modalAcceso" tabindex="-1" aria-labelledby="tituloAcceso" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title fs-5" id="tituloAcceso">Acceder a tu cuenta</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
                <form>
                    <div class="mb-3">
                        <label for="correo" class="form-label">Correo</label>
                        <input type="email" class="form-control" id="correo" name="correo" required>
                    </div>
                    <div class="mb-3">
                        <label for="clave" class="form-label">Contrasena</label>
                        <input type="password" class="form-control" id="clave" name="clave" required>
                    </div>
                    <button type="submit" class="btn btn-primary w-100">Entrar</button>
                </form>
            </div>
        </div>
    </div>
</div>
