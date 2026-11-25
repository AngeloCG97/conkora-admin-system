# ConKora — Glosario del dominio

Sistema administrativo de ConKora, tienda en línea que compra mercadería en viajes y la vende a sus clientes.

## Términos

**Viaje**
Un viaje de compras con nombre, destino y fechas. Agrupa gastos y ventas para medir su rentabilidad.
_Evitar_: tour, ruta.

**General**
Venta o Gasto que no pertenece a ningún Viaje (por ejemplo empaques, publicidad o una venta local). Se convierte con el tipo de cambio global.
_Evitar_: "Personal" para referirse a lo que no tiene Viaje, "sin viaje".

**Gasto personal**
Gasto de manutención de quien viaja durante un Viaje, como la alimentación o la gasolina del carro alquilado. Se marca en cada Gasto (personal o del negocio), independientemente de su categoría. Pertenece al Viaje y sí resta en su Utilidad; los reportes lo muestran como subtotal aparte.
_Evitar_: "Personal" como sinónimo de General.

**Gasto**
Dinero que sale del negocio, con categoría (vuelo, hospedaje, alimentación, alquiler de carro, combustible, mercadería, gastos generales u otra), monto y moneda. Pertenece a un Viaje o es General. Puede marcarse como Gasto personal. El costo de la mercadería se registra como Gasto, no en el Artículo.
_Evitar_: costo, egreso.

**Cliente**
Persona que compra a ConKora.

**Venta**
Compra de un Cliente, compuesta por Artículos, en una sola moneda. Pertenece a un Viaje o es General. Tiene un estado: Pendiente, Entregado o Cancelado. Una Venta Cancelada no cuenta en Total, Ingreso ni Saldo. Un Cliente puede tener muchas Ventas en distintos Viajes.
_Evitar_: pedido (nombre anterior en la interfaz, renombrado a Venta; las rutas son /ventas/ y la página pública /venta/; el código y las tablas conservan el nombre `order`), orden, compra (como sustantivo del modelo).

**Artículo**
Línea de una Venta: nombre, precio, y opcionalmente foto y talla.
_Evitar_: producto, ítem.

**Abono**
Pago parcial o total que un Cliente hace sobre una Venta concreta. Puede venir en una moneda distinta a la de la Venta; para el Saldo se convierte a la moneda de la Venta.
_Evitar_: pago a cuenta general.

**Total**
Suma de los precios de los Artículos de una Venta (o de varias Ventas, según el contexto: por Cliente, por Viaje).

**Saldo**
Total menos Abonos. Lo que el Cliente todavía debe.

**Moneda base**
Dólar (USD). Todos los reportes (Ingreso, Utilidad, Saldo del Cliente) se expresan en ella y, además, en colones (CRC): el equivalente en ₡ de un total es la suma de los ₡ de cada registro, cada uno con el tipo de cambio de su Viaje. Cada monto registrado se muestra primero en su moneda y luego su equivalente en ₡ y/o $. Pueden agregarse otras monedas.

**Tipo de cambio del Viaje**
Unidades de cada moneda por 1 USD, fijadas por Viaje. Todo lo que pertenece al Viaje (Gastos, Ventas, Abonos) se convierte con ese tipo.

**Tipo de cambio global**
Tipo de cambio que se usa para lo General, y para cualquier moneda que un Viaje no tenga fijada.

**Ingreso (de un Viaje)**
Suma del Total de las Ventas del Viaje (lo vendido, no lo cobrado).

**Utilidad (de un Viaje)**
Ingreso del Viaje menos sus Gastos (incluidos los Gastos personales).

**Utilidad global**
Utilidad de todo el negocio: Ingreso menos Gastos de todos los Viajes más lo General, en USD.

## Relaciones

- Un **Viaje** tiene muchos **Gastos** y muchas **Ventas**; lo que no tiene Viaje es **General**.
- Un **Cliente** tiene muchas **Ventas**; una **Venta** tiene muchos **Artículos** y muchos **Abonos**.
- Saldo del Cliente = suma de los Saldos de sus Ventas.
