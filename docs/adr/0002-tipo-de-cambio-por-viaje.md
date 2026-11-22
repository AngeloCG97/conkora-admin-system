# 0002 — Multimoneda con tipo de cambio fijo por Viaje

## Estado
Aceptado — 2026-11-22

## Contexto
Los Gastos, Pedidos y Abonos pueden estar en USD, en CRC o en otras monedas. Los reportes (Utilidad del Viaje, Saldo del Cliente) necesitan una sola moneda. Las alternativas eran: un tipo de cambio por registro (sugerido por una API), uno fijo por Viaje, o el tipo del día al momento de ver el reporte.

## Decisión
- La moneda base es USD.
- Cada Viaje fija sus tipos de cambio (unidades por 1 USD) y todo lo del Viaje se convierte con ellos.
- Lo Personal, y cualquier moneda sin tipo fijado en el Viaje, usa el tipo de cambio global.
- La conversión se calcula al consultar (vistas SQL); no se guardan montos convertidos.

## Consecuencias
- Si cambias el tipo de un Viaje, cambian todos sus reportes, y eso es lo esperado: el Viaje se evalúa con un solo tipo.
- Si cambias el tipo global, cambian los reportes de todo lo Personal, incluido lo histórico.
- No depende de APIs externas de tipo de cambio.
