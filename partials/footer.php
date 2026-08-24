<footer class="bg-dark text-light mt-5 py-4">
    <div class="container">
        <div class="row">
            <div class="col-12 col-md-6">
                <p class="fw-bold mb-1">Ruta Platino</p>
                <p class="small mb-0">Guias para completar tus juegos al 100%.</p>
            </div>
            <div class="col-12 col-md-3 mt-3 mt-md-0">
                <p class="fw-bold mb-1">Secciones</p>
                <ul class="list-unstyled small mb-0">
                    <li><a class="link-light" href="guias.php">Guias</a></li>
                    <li><a class="link-light" href="plataformas.php">Plataformas</a></li>
                    <li><a class="link-light" href="contacto.php">Contacto</a></li>
                </ul>
            </div>
            <div class="col-12 col-md-3 mt-3 mt-md-0">
                <p class="fw-bold mb-1">Proyecto</p>
                <p class="small mb-0">Desarrollo Web 8478<br>2026</p>
            </div>
        </div>
    </div>
</footer>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"></script>
<?php if (isset($scriptPagina)) { ?>
    <script src="<?php echo $scriptPagina; ?>"></script>
<?php } ?>
</body>
</html>
