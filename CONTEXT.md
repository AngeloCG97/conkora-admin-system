# ConKora — Glosario del dominio

Sistema administrativo de ConKora, tienda en línea que compra mercadería en viajes y la vende a sus clientes.

## Términos

**Viaje**
Un viaje de compras con nombre, destino y fechas. Agrupa gastos y pedidos para medir su rentabilidad.
_Evitar_: tour, ruta.

**Personal**
Pedido o gasto que no pertenece a ningún Viaje.
_Evitar_: "viaje personal" (no es un Viaje).

**Gasto**
Dinero que sale del negocio, con categoría (vuelo, hospedaje, alimentación, alquiler de carro, mercadería, general u otra), monto y moneda. Pertenece a un Viaje o es Personal. El costo de la mercadería se registra como Gasto, no en el Artículo.
_Evitar_: costo, egreso.

**Cliente**
Persona que compra a ConKora.

**Pedido**
Compra de un Cliente, compuesta por Artículos, en una sola moneda. Pertenece a un Viaje o es Personal. Tiene un estado: Pendiente, Entregado o Cancelado. Un Pedido Cancelado no cuenta en Total, Ingreso ni Saldo. Un Cliente puede tener muchos Pedidos en distintos Viajes.
_Evitar_: orden, compra (como sustantivo del modelo), venta.

**Artículo**
Línea de un Pedido: nombre, precio, y opcionalmente foto y talla.
_Evitar_: producto, ítem.

**Abono**
Pago parcial o total que un Cliente hace sobre un Pedido concreto. Puede venir en una moneda distinta a la del Pedido; para el Saldo se convierte a la moneda del Pedido.
_Evitar_: pago a cuenta general.

**Total**
Suma de los precios de los Artículos de un Pedido (o de varios Pedidos, según el contexto: por Cliente, por Viaje).

**Saldo**
Total menos Abonos. Lo que el Cliente todavía debe.

**Moneda base**
Dólar (USD). Todos los reportes (Ingreso, Utilidad, Saldo del Cliente) se expresan en ella. También se usan colones (CRC) y pueden agregarse otras.

**Tipo de cambio del Viaje**
Unidades de cada moneda por 1 USD, fijadas por Viaje. Todo lo que pertenece al Viaje (Gastos, Pedidos, Abonos) se convierte con ese tipo.

**Tipo de cambio global**
Tipo de cambio que se usa para lo Personal, y para cualquier moneda que un Viaje no tenga fijada.

**Ingreso (de un Viaje)**
Suma del Total de los Pedidos del Viaje (lo vendido, no lo cobrado).

**Utilidad (de un Viaje)**
Ingreso del Viaje menos sus Gastos.

## Relaciones

- Un **Viaje** tiene muchos **Gastos** y muchos **Pedidos**.
- Un **Cliente** tiene muchos **Pedidos**; un **Pedido** tiene muchos **Artículos** y muchos **Abonos**.
- Saldo del Cliente = suma de los Saldos de sus Pedidos.
