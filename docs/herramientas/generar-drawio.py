# -*- coding: utf-8 -*-
"""Genera los diagramas del informe en formato nativo .drawio (diagrams.net).

Un .drawio es XML (mxGraphModel). Al generarlo nativo, el diagrama queda
editable en diagrams.net con formas UML reales, ruteo ortogonal de la propia
herramienta y exportacion a PNG/SVG/PDF desde el menu Archivo.
"""
import os
from xml.sax.saxutils import escape

OUT = "/Applications/XAMPP/xamppfiles/htdocs/Desarrollo-WEB-8478/docs/diagramas"
os.makedirs(OUT, exist_ok=True)

TINTA = "#2E3138"
GRIS = "#8A9099"
BORDE = "#C3C7CE"
ACENTO = "#C0392B"
SUP = "#F3F4F6"

LANES = {
    "clients":   "#EAF0F6",
    "inventory": "#EDF4EC",
    "orders":    "#FBF3E8",
    "payments":  "#F7EEF3",
    "analytics": "#EEF0F6",
    "publica":   "#FDF1EE",
    "privada":   "#F4F6F4",
}

FILA = 22
CABECERA = 28

LIMITES = {}


class Lienzo:
    def __init__(self):
        self.celdas = []
        self.n = 0
        self.max_x = 0
        self.max_y = 0

    def _id(self, pista="c"):
        self.n += 1
        return f"{pista}{self.n}"

    def nodo(self, valor, x, y, w, h, estilo, padre="1", ident=None):
        ident = ident or self._id()
        if padre == "1":
            self.max_x = max(self.max_x, x + w)
            self.max_y = max(self.max_y, y + h)
        self.celdas.append(
            f'<mxCell id="{ident}" value="{escape(valor)}" style="{estilo}" vertex="1" parent="{padre}">'
            f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>'
        )
        return ident

    def contenedor(self, titulo, x, y, w, h, color):
        estilo = (f"rounded=1;whiteSpace=wrap;html=1;dashed=1;dashPattern=8 5;"
                  f"fillColor={color};strokeColor={BORDE};verticalAlign=top;"
                  f"fontColor={GRIS};fontSize=12;fontStyle=1;align=center;spacingTop=4;")
        return self.nodo(titulo, x, y, w, h, estilo)

    def clase(self, nombre, x, y, w, atributos=(), operaciones=(), estereotipo=None,
              relleno="#FFFFFF", borde=None):
        """Clase UML como swimlane apilada, igual que la forma nativa de draw.io."""
        borde = borde or TINTA
        cabecera = CABECERA + (16 if estereotipo else 0)
        alto = cabecera + FILA * (len(atributos) + len(operaciones)) + (8 if operaciones else 0)
        etiqueta = f"\u00ab{estereotipo}\u00bb<br>{nombre}" if estereotipo else nombre
        estilo = (f"swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;"
                  f"horizontal=1;startSize={cabecera};horizontalStack=0;resizeParent=0;"
                  f"resizeParentMax=0;html=1;whiteSpace=wrap;collapsible=0;marginBottom=0;"
                  f"fillColor={relleno};strokeColor={borde};fontColor={TINTA};fontSize=12;")
        ident = self._id("cl")
        self.max_x = max(self.max_x, x + w)
        self.max_y = max(self.max_y, y + alto)
        self.celdas.append(
            f'<mxCell id="{ident}" value="{escape(etiqueta)}" style="{estilo}" vertex="1" parent="1">'
            f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{alto}" as="geometry"/></mxCell>'
        )

        fila_estilo = ("text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;"
                       "spacingLeft=6;spacingRight=6;overflow=hidden;points=[[0,0.5],[1,0.5]];"
                       f"portConstraint=eastwest;rotatable=0;whiteSpace=wrap;html=1;fontSize=10;fontColor={TINTA};")
        dy = cabecera
        for a in atributos:
            self.nodo(a, 0, dy, w, FILA, fila_estilo, padre=ident)
            dy += FILA
        if operaciones:
            linea = ("line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;"
                     "spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;"
                     f"points=[];portConstraint=eastwest;strokeColor={BORDE};")
            self.nodo("", 0, dy, w, 8, linea, padre=ident)
            dy += 8
            for o in operaciones:
                self.nodo(o, 0, dy, w, FILA, fila_estilo, padre=ident)
                dy += FILA
        return ident

    def arista(self, origen, destino, estilo, mult_origen=None, mult_destino=None,
               etiqueta=None, salida=None, entrada=None, puntos=None):
        if salida:
            estilo += f"exitX={salida[0]};exitY={salida[1]};exitDx=0;exitDy=0;"
        if entrada:
            estilo += f"entryX={entrada[0]};entryY={entrada[1]};entryDx=0;entryDy=0;"
        ident = self._id("e")
        geo = '<mxGeometry relative="1" as="geometry"/>'
        if puntos:
            trazos = "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in puntos)
            geo = ('<mxGeometry relative="1" as="geometry">'
                   f'<Array as="points">{trazos}</Array></mxGeometry>')
        self.celdas.append(
            f'<mxCell id="{ident}" style="{estilo}" edge="1" parent="1" '
            f'source="{origen}" target="{destino}">{geo}</mxCell>'
        )
        etiqueta_estilo = ("edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;"
                           f"points=[];fontSize=10;fontColor={TINTA};labelBackgroundColor=#FFFFFF;")
        for valor, posicion in ((mult_origen, -0.75), (mult_destino, 0.75)):
            if valor:
                sub = self._id("lb")
                self.celdas.append(
                    f'<mxCell id="{sub}" value="{escape(valor)}" style="{etiqueta_estilo}" '
                    f'vertex="1" connectable="0" parent="{ident}">'
                    f'<mxGeometry x="{posicion}" relative="1" as="geometry">'
                    f'<mxPoint as="offset"/></mxGeometry></mxCell>'
                )
        if etiqueta:
            sub = self._id("lb")
            self.celdas.append(
                f'<mxCell id="{sub}" value="{escape(etiqueta)}" style="{etiqueta_estilo}" '
                f'vertex="1" connectable="0" parent="{ident}">'
                f'<mxGeometry relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>'
            )
        return ident

    def nota(self, texto, x, y, w, h, color=SUP, borde=None):
        estilo = (f"rounded=1;whiteSpace=wrap;html=1;fillColor={color};strokeColor={borde or BORDE};"
                  f"align=left;verticalAlign=top;spacingLeft=10;spacingTop=6;fontSize=11;fontColor={TINTA};")
        return self.nodo(texto, x, y, w, h, estilo)

    def titulo(self, texto, subtitulo, x=40, y=20, w=900):
        self.nodo(texto, x, y, w, 30,
                  f"text;html=1;align=left;verticalAlign=middle;fontSize=20;fontStyle=1;fontColor={TINTA};")
        if subtitulo:
            self.nodo(subtitulo, x, y + 28, w, 22,
                      f"text;html=1;align=left;verticalAlign=middle;fontSize=11;fontColor={GRIS};")

    def guardar(self, nombre_archivo, nombre_pagina):
        xml = (
            f'<mxfile host="app.diagrams.net" type="device">'
            f'<diagram name="{escape(nombre_pagina)}">'
            f'<mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" '
            f'connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="826" '
            f'math="0" shadow="0"><root>'
            f'<mxCell id="0"/><mxCell id="1" parent="0"/>'
            + "".join(self.celdas) +
            f'</root></mxGraphModel></diagram></mxfile>'
        )
        ruta = os.path.join(OUT, nombre_archivo)
        with open(ruta, "w", encoding="utf-8") as f:
            f.write(xml)
        LIMITES[nombre_archivo] = {"w": int(self.max_x) + 60, "h": int(self.max_y) + 60}
        print("ok", nombre_archivo, f"{len(self.celdas)} celdas",
              f"({LIMITES[nombre_archivo]['w']}x{LIMITES[nombre_archivo]['h']})")


# --- estilos de arista ------------------------------------------------------
ORTO = "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;jettySize=auto;orthogonalLoop=1;"
ASOC = ORTO + f"endArrow=none;strokeColor={TINTA};strokeWidth=1.5;"
COMPOSICION = ORTO + f"startArrow=diamondThin;startFill=1;startSize=14;endArrow=none;strokeColor={TINTA};strokeWidth=1.5;"
DEPENDENCIA = ORTO + f"dashed=1;endArrow=open;endSize=10;strokeColor={GRIS};strokeWidth=1.5;"
CRUCE = ORTO + f"dashed=1;dashPattern=6 4;endArrow=open;endSize=10;strokeColor={ACENTO};strokeWidth=1.5;"
FLUJO = ORTO + f"endArrow=block;endFill=1;endSize=8;strokeColor={TINTA};strokeWidth=1.5;"
FLUJO_ROJO = ORTO + f"dashed=1;endArrow=block;endFill=1;endSize=8;strokeColor={ACENTO};strokeWidth=1.5;"


# ===========================================================================
# 1. UML de clases del dominio
# ===========================================================================
def uml_dominio():
    g = Lienzo()
    g.titulo("Módulo 2 — Diagrama UML de clases del dominio",
             "Pastas Frescas La Nonna. Las clases se agrupan por el microservicio que tiene autoridad sobre sus datos.")

    g.contenedor("microservicio clients", 40, 90, 260, 980, LANES["clients"])
    g.contenedor("microservicio inventory", 320, 90, 280, 980, LANES["inventory"])
    g.contenedor("microservicio orders", 620, 90, 440, 980, LANES["orders"])
    g.contenedor("microservicio payments", 1080, 90, 280, 980, LANES["payments"])

    cliente = g.clase("Cliente", 60, 130, 220, [
        "id: String", "run: String {restringido}", "nombreCompleto: String",
        "correo: String {restringido}", "claveHash: String {credencial}",
        "telefono / direccion / comuna", "rol: Rol", "estadoVerificacion: Estado"])

    categoria = g.clase("Categoria", 340, 130, 240, ["id: String", "nombre: String"])
    producto = g.clase("Producto", 340, 240, 240, [
        "id: String", "nombre: String", "formato: String", "precio: Int",
        "stockDelDia: Int", "stockReservado: Int", "descontinuado: Boolean"])
    reserva = g.clase("Reserva", 340, 460, 240, [
        "id: String", "cantidad: Int", "estado: EstadoReserva", "expiraEn: DateTime"])

    carrito = g.clase("Carrito", 650, 130, 240, ["id: String", "actualizadoEn: DateTime"])
    item = g.clase("ItemCarrito", 650, 240, 240, ["id: String", "cantidad: Int {1..20}"])
    pedido = g.clase("Pedido", 650, 350, 240, [
        "id: String", "estado: EstadoPedido", "subtotal: Int", "costoDespacho: Int",
        "descuento: Int", "total: Int", "direccionEntrega {restringido}",
        "correoContacto {restringido}", "ventanaDespacho: DateTime"])
    detalle = g.clase("DetallePedido", 650, 620, 240, [
        "id: String", "nombreProducto: String", "precioUnitario: Int",
        "cantidad: Int", "subtotal: Int"])
    anulacion = g.clase("Anulacion", 650, 790, 240, [
        "motivo: String {10..300}", "anuladoPor: String", "rol: Rol", "fecha: DateTime"])
    comuna = g.clase("ComunaDespacho", 650, 930, 240, [
        "comuna: String", "dentroRadio: Boolean", "costo: Int"])

    pago = g.clase("Pago", 1100, 350, 240, [
        "id: String", "monto: Int", "medio: MedioPago",
        "estado: EstadoPago", "correoContacto {restringido}"])
    boleta = g.clase("Boleta", 1100, 530, 240, [
        "id: String", "monto: Int", "enviadaA {restringido}", "emitidaPor: String"])
    notificacion = g.clase("Notificacion", 1100, 680, 240, [
        "idempotencyKey: String", "resultado: String", "recibidaEn: DateTime"])

    ABAJO, ARRIBA = (0.5, 1), (0.5, 0)
    DER, IZQ = (1, 0.5), (0, 0.5)

    g.arista(categoria, producto, ASOC, "1", "0..*", salida=ABAJO, entrada=ARRIBA)
    g.arista(producto, reserva, ASOC, "1", "0..*", salida=ABAJO, entrada=ARRIBA)
    g.arista(carrito, item, COMPOSICION, "1", "0..*", salida=ABAJO, entrada=ARRIBA)
    g.arista(pedido, detalle, COMPOSICION, "1", "1..*", salida=ABAJO, entrada=ARRIBA)
    g.arista(pedido, anulacion, COMPOSICION, "1", "0..1", salida=(1, 0.9), entrada=(1, 0.2))
    g.arista(pedido, comuna, DEPENDENCIA, etiqueta="valida zona contra",
             salida=(1, 0.97), entrada=(1, 0.5))
    g.arista(pago, boleta, COMPOSICION, "1", "0..1", salida=ABAJO, entrada=ARRIBA)
    g.arista(pago, notificacion, COMPOSICION, "1", "0..*", salida=(1, 0.9), entrada=(1, 0.3))

    g.arista(cliente, pedido, CRUCE, "1", "0..*", salida=DER, entrada=(0, 0.15))
    g.arista(producto, detalle, CRUCE, "1", "0..*", salida=(1, 0.85), entrada=(0, 0.3))
    g.arista(producto, item, CRUCE, "1", "0..*", salida=(1, 0.15), entrada=IZQ)
    g.arista(pedido, reserva, CRUCE, "1", "0..*", salida=(0, 0.6), entrada=DER)
    g.arista(pedido, pago, CRUCE, "1", "0..*", salida=(1, 0.35), entrada=IZQ)

    # Servicios publicos y sus DTO
    g.nodo("Servicios públicos (Módulo 1) y los DTO con que responden", 40, 1100, 600, 24,
           f"text;html=1;align=left;verticalAlign=middle;fontSize=13;fontStyle=1;fontColor={TINTA};")
    servicios = [
        ("CatalogoService", ["+ consultarCatalogo(filtro)", "+ consultarProducto(id)"], "ProductoDTO", 40),
        ("CuentaService", ["+ registrarCliente(datos)", "+ autenticar(credenciales)"], "ClienteDTO", 290),
        ("PedidoService", ["+ crearPedido(despacho)", "+ anularPedido(id, motivo)"], "PedidoDTO", 540),
        ("PagoService", ["+ iniciarPago(pedidoId)", "+ confirmarPago(aviso)"], "PagoDTO", 790),
        ("ReporteService", ["+ ventasPorPeriodo(desde, hasta)"], "ReporteDTO", 1040),
    ]
    for nombre, ops, dto, x in servicios:
        d = g.clase(dto, x, 1140, 220, ["(solo campos permitidos)"], relleno=SUP, borde=GRIS)
        s = g.clase(nombre, x, 1260, 220, (), ops, estereotipo="service")
        g.arista(s, d, DEPENDENCIA, etiqueta="usa", salida=(0.5, 0), entrada=(0.5, 1))

    g.nota(
        "<b>Leyenda</b><br>"
        "• Rombo negro: <b>composición</b>. La parte no existe sin el todo.<br>"
        "• Línea sólida: <b>asociación</b> dentro del mismo microservicio.<br>"
        "• Línea roja punteada: relación <b>entre microservicios</b>. No es clave foránea: "
        "cada servicio tiene su base y la relación se resuelve por contrato (REST o gRPC).<br>"
        "• Línea gris punteada: <b>dependencia</b> de uso.<br>"
        "• {restringido} y {credencial}: clasificación del Módulo 7.",
        40, 1390, 900, 130)
    g.guardar("modulo-02-uml-dominio.drawio", "Módulo 2 - Dominio")


# ===========================================================================
# 2. Mapa de componentes
# ===========================================================================
def mapa_componentes():
    g = Lienzo()
    g.titulo("Módulo 3 — Mapa de componentes",
             "Separación entre zona pública y zona privada, y propiedad de datos por microservicio.")

    g.contenedor("ZONA PÚBLICA", 40, 90, 1210, 140, LANES["publica"])
    g.contenedor("ZONA PRIVADA — 127.0.0.1, inalcanzable desde el navegador",
                 40, 270, 1210, 500, LANES["privada"])

    comp = ("html=1;shape=component;align=left;spacingLeft=36;whiteSpace=wrap;"
            f"fillColor=#FFFFFF;strokeColor={TINTA};fontColor={TINTA};fontSize=12;")
    comp_pub = comp.replace("fillColor=#FFFFFF", "fillColor=#FDE9E4")
    base = ("shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=8;"
            f"fillColor={SUP};strokeColor={GRIS};fontColor={TINTA};fontSize=10;")

    navegador = g.nodo("Navegador<br>Bootstrap 5 + fetch", 90, 130, 190, 60, comp)
    gateway = g.nodo("API Gateway<br>PÚBLICO :8080", 420, 130, 190, 60, comp_pub)
    sitio = g.nodo("Sitio estático<br>PÚBLICO :8081", 740, 130, 180, 60, comp)
    proveedor = g.nodo("Proveedor de pagos<br>externo", 1040, 130, 190, 60, comp)

    datos = [("auth-service", ":4000"), ("clients", ":4001"),
             ("inventory", ":4002 + gRPC :50051"), ("orders", ":4003"), ("payments", ":4004")]
    servicios, centros = [], []
    for i, (nombre, puerto) in enumerate(datos):
        x = 90 + i * 235
        servicios.append(g.nodo(f"{nombre}<br>{puerto}", x, 310, 180, 60, comp))
        centros.append(x + 90)
        b = g.nodo(f"{nombre}.db", x + 15, 540, 150, 50, base)
        g.arista(servicios[-1], b, ORTO + f"endArrow=none;strokeColor={GRIS};",
                 salida=(0.5, 1), entrada=(0.5, 0))

    graphql = g.nodo("graphql-gateway<br>:4100 agregación", 90, 650, 200, 60, comp)
    analytics = g.nodo("analytics<br>:4005", 360, 650, 170, 60, comp)
    secretos = g.nodo("Administrador de secretos<br>archivos 600, fuera del repo", 620, 650, 250, 60,
                      comp.replace("fillColor=#FFFFFF", f"fillColor={SUP}"))

    g.arista(navegador, gateway, FLUJO, etiqueta="HTTPS", salida=(1, 0.5), entrada=(0, 0.5))
    for s_id in servicios:
        g.arista(gateway, s_id, FLUJO, salida=(0.5, 1), entrada=(0.5, 0))
    g.nodo("identidad interna firmada por el gateway", 640, 250, 300, 20,
           f"text;html=1;align=left;verticalAlign=middle;fontSize=10;fontColor={TINTA};")

    # Llamadas entre servicios: bajan a un pasillo libre y vuelven a subir,
    # para no pasar por encima de ninguna caja.
    g.arista(servicios[0], servicios[1], FLUJO_ROJO, etiqueta="verifica credencial",
             salida=(0.75, 1), entrada=(0.25, 1),
             puntos=[(centros[0] + 45, 420), (centros[1] - 45, 420)])
    g.arista(servicios[3], servicios[2], FLUJO_ROJO, etiqueta="gRPC: reserva stock",
             salida=(0.25, 1), entrada=(0.75, 1),
             puntos=[(centros[3] - 45, 460), (centros[2] + 45, 460)])
    g.arista(servicios[4], servicios[3], FLUJO_ROJO, etiqueta="confirma pago",
             salida=(0.25, 1), entrada=(0.75, 1),
             puntos=[(centros[4] - 45, 420), (centros[3] + 45, 420)])
    g.arista(proveedor, servicios[4], FLUJO_ROJO, etiqueta="webhook firmado",
             salida=(0.5, 1), entrada=(0.5, 0))

    # El gateway tambien enruta GraphQL: baja por el pasillo del borde izquierdo.
    g.arista(gateway, graphql, FLUJO, etiqueta="POST /graphql",
             salida=(0, 0.5), entrada=(0, 0.5), puntos=[(65, 160), (65, 680)])
    g.arista(graphql, analytics, FLUJO_ROJO, salida=(1, 0.5), entrada=(0, 0.5))
    # El administrador de secretos entrega valores por el borde derecho.
    g.arista(secretos, servicios[4], DEPENDENCIA, etiqueta="credenciales por referencia",
             salida=(1, 0.5), entrada=(1, 0.5), puntos=[(1225, 680), (1225, 340)])

    g.nota(
        "Solo dos procesos escuchan fuera de loopback: el <b>API Gateway</b> y el <b>sitio estático</b>. "
        "Todo lo demás está en 127.0.0.1 y además exige una identidad interna firmada que solo el gateway "
        "puede emitir, así que llegar al puerto no alcanza para usar el servicio.<br><br>"
        "Cada microservicio tiene su propia base de datos: ninguno abre la del otro, y toda colaboración "
        "pasa por un contrato explícito.",
        40, 800, 1210, 90)
    g.guardar("modulo-03-mapa-componentes.drawio", "Módulo 3 - Componentes")


# ===========================================================================
# 3. Diagrama de secuencia
# ===========================================================================
def secuencia():
    g = Lienzo()
    g.titulo("Módulo 3 — Diagrama de secuencia: crear y pagar un pedido",
             "Flujo representativo del caso, desde la confirmación del carrito hasta el descuento de stock.")

    actores = [("Navegador", 60), ("API Gateway", 260), ("orders", 470), ("inventory", 660),
               ("payments", 850), ("Proveedor de pagos", 1040)]
    lineas = {}
    ALTO = 640
    for nombre, x in actores:
        estilo = ("shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;"
                  "container=1;collapsible=0;recursiveResize=0;outlineConnect=0;"
                  f"fillColor={SUP};strokeColor={TINTA};fontColor={TINTA};fontSize=12;fontStyle=1;size=34;")
        lineas[nombre] = g.nodo(nombre, x, 100, 160, ALTO, estilo)

    def mensaje(desde, hasta, y, texto, color=TINTA, respuesta=False):
        f = round(y / ALTO, 4)
        estilo = (f"html=1;verticalAlign=bottom;rounded=0;fontSize=10;fontColor={color};"
                  f"strokeColor={color};endFill={'0' if respuesta else '1'};"
                  f"endArrow={'open' if respuesta else 'block'};"
                  f"{'dashed=1;' if respuesta else ''}"
                  f"exitX=0.5;exitY={f};exitDx=0;exitDy=0;entryX=0.5;entryY={f};entryDx=0;entryDy=0;")
        g.arista(lineas[desde], lineas[hasta], estilo, etiqueta=texto)

    mensaje("Navegador", "API Gateway", 70, "POST /api/v1/orders")
    mensaje("API Gateway", "orders", 110, "identidad verificada")
    mensaje("orders", "inventory", 170, "ReservarStock (gRPC)", ACENTO)
    mensaje("inventory", "orders", 215, "reserva OK (20 min)", ACENTO, respuesta=True)
    mensaje("orders", "API Gateway", 270, "201 pendiente_pago", respuesta=True)
    mensaje("API Gateway", "Navegador", 310, "201", respuesta=True)
    mensaje("Navegador", "payments", 365, "POST /api/v1/payments")
    mensaje("payments", "orders", 405, "consulta monto oficial", ACENTO, respuesta=True)
    mensaje("payments", "Proveedor de pagos", 450, "inicia transacción")
    mensaje("Proveedor de pagos", "payments", 500, "webhook firmado + idempotencia", ACENTO)
    mensaje("payments", "orders", 550, "pedido pagado", ACENTO)
    mensaje("orders", "inventory", 595, "ConsumirReserva", ACENTO)

    g.nota(
        "<b>Lo que este diagrama demuestra</b><br>"
        "1. El pedido nace en <i>pendiente_pago</i> y reserva stock antes de aceptarse: no se puede vender "
        "producción que ya no existe.<br>"
        "2. El salto de <i>pendiente_pago</i> a <i>pagado</i> lo dispara el proveedor contra payments, con firma "
        "e idempotencia. El navegador nunca interviene en ese tramo.<br>"
        "3. Recién con el pago confirmado la reserva se consume y la producción sale del stock del día.",
        60, 780, 1140, 90)
    g.guardar("modulo-03-secuencia.drawio", "Módulo 3 - Secuencia")


# ===========================================================================
# 4. UML del API Gateway
# ===========================================================================
def uml_gateway():
    g = Lienzo()
    g.titulo("Módulo 5 — Diagrama UML del API Gateway y sus políticas",
             "Clases de infraestructura, no del dominio. Muestra dónde está la frontera de confianza.")

    g.contenedor("FRONTERA DE CONFIANZA — todo lo de abajo está en la red privada",
                 40, 90, 1140, 225, LANES["publica"])

    gw = g.clase("ApiGateway", 70, 120, 230,
                 ["puerto: 8080", "origenPermitido: String", "plazoMs: 5000"],
                 ["+ enrutarPeticion(req)", "+ aplicarPoliticas(ruta, sesion)",
                  "+ descartarCabecerasDeIdentidad()"])
    ruta = g.clase("RouteDefinition", 440, 120, 230,
                   ["id: String (S01..S33)", "rutaExterna: String", "verboHttp: String",
                    "acceso: Acceso", "limitePorMinuto: Int"])
    destino = g.clase("ServiceTarget", 810, 120, 230,
                      ["nombre: String", "urlInterna: String (127.0.0.1)"])

    auth = g.clase("AuthenticationPolicy", 70, 380, 230, ["clave: ref jwt-firma-usuario"],
                   ["+ validarToken(authorization)", "+ estaRevocado(jti)"])
    autz = g.clase("AuthorizationPolicy", 440, 380, 230, ["rolesPermitidos: Rol[]"],
                   ["+ permite(acceso, sesion)"])
    secretos = g.clase("SecretProvider", 810, 380, 230, ["inventario: Referencia[]"],
                       ["+ obtenerSecreto(referencia)"])

    gql = g.clase("GraphQLGateway", 70, 600, 230,
                  ["puerto: 4100", "profundidadMaxima: 8", "nodosMaximos: 200"],
                  ["+ ejecutar(consulta, identidad)", "+ medirCosto(documento)"])
    schema = g.clase("Schema", 440, 600, 190, ["tipos: Type[]", "queries: Query[]"])
    resolver = g.clase("Resolver", 740, 600, 230, ["operacion: String"],
                       ["+ resolver(args, contexto)", "+ autorizarCampo(rol)"])
    identidad = g.clase("IdentidadInterna", 440, 790, 230,
                        ["sub, rol, correo", "aud: servicio destino", "exp: 60 s"],
                        estereotipo="token firmado", relleno=SUP)

    g.arista(gw, ruta, COMPOSICION, "1", "1..*")
    g.arista(ruta, destino, ASOC, "1", "1")
    g.arista(gw, auth, DEPENDENCIA)
    g.arista(ruta, autz, DEPENDENCIA)
    g.arista(gw, secretos, DEPENDENCIA, etiqueta="obtiene credenciales por referencia")
    g.arista(gw, gql, DEPENDENCIA)
    g.arista(gql, schema, ASOC, "1", "1")
    g.arista(schema, resolver, ASOC, "1", "1..*")
    g.arista(auth, identidad, DEPENDENCIA, etiqueta="emite")
    g.arista(identidad, destino, CRUCE, mult_destino="viaja al servicio")

    g.nota(
        "<b>Qué valida cada capa</b><br>"
        "<b style='color:#C0392B'>API Gateway:</b> que la ruta exista en la tabla, que el token sea válido y "
        "no esté revocado, que el rol pueda usar el verbo, y el límite por IP.<br>"
        "<b style='color:#C0392B'>Servicio interno:</b> que la identidad venga firmada por el gateway y sea "
        "para él (aud), y luego TODA la regla de negocio: propiedad del recurso, estado, stock.<br>"
        "<b style='color:#C0392B'>GraphQL Gateway:</b> profundidad y costo de la consulta, y autorización por "
        "campo. POST /graphql no autoriza por sí mismo cada operación.<br><br>"
        "<b>El gateway filtra; no sustituye. Un servicio interno nunca confía en que alguien ya revisó por él.</b>",
        70, 960, 1110, 120, borde=ACENTO)
    g.guardar("modulo-05-uml-gateway.drawio", "Módulo 5 - API Gateway")


uml_dominio()
mapa_componentes()
secuencia()
uml_gateway()
import json
with open(os.path.join(OUT, "limites.json"), "w") as f:
    json.dump(LIMITES, f, indent=2)
print("\nLos cuatro .drawio quedaron en docs/diagramas/")
