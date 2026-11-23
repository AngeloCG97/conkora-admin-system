-- Resumen de lo que no tiene Viaje (USD). Misma forma que trip_summary, sin trip_id, siempre una fila (ceros, nunca null).
-- Suma los *_usd ya redondeados por Pedido/Gasto; los Pedidos Cancelados no cuentan.
CREATE VIEW no_trip_summary AS
SELECT
  COALESCE(o.order_count, 0)::int AS order_count,
  COALESCE(o.income_usd, 0)::numeric(14,2) AS income_usd,
  COALESCE(o.collected_usd, 0)::numeric(14,2) AS collected_usd,
  COALESCE(o.pending_usd, 0)::numeric(14,2) AS pending_usd,
  COALESCE(e.expenses_usd, 0)::numeric(14,2) AS expenses_usd,
  (COALESCE(o.income_usd, 0) - COALESCE(e.expenses_usd, 0))::numeric(14,2) AS profit_usd
FROM (SELECT 1) one
LEFT JOIN (
  SELECT count(*) AS order_count, sum(total_usd) AS income_usd,
         sum(paid_usd) AS collected_usd, sum(balance_usd) AS pending_usd
  FROM order_summary
  WHERE status <> 'cancelled' AND trip_id IS NULL
) o ON true
LEFT JOIN (
  SELECT sum(amount_usd) AS expenses_usd
  FROM expense_summary
  WHERE trip_id IS NULL
) e ON true;
