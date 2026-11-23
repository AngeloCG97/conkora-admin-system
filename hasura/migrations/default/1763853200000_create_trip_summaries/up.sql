-- Reporte por Viaje (USD). Ingreso = Total de Pedidos sin Cancelados; Gastos = equivalentes USD de expense_summary.
-- Suma los valores *_usd ya redondeados por Pedido/Gasto. Un Viaje sin Pedidos/Gastos da 0.
-- trip_summary: una fila por Viaje.
CREATE VIEW trip_summary AS
SELECT
  t.id AS trip_id,
  COALESCE(o.order_count, 0)::int AS order_count,
  COALESCE(o.income_usd, 0)::numeric(14,2) AS income_usd,
  COALESCE(o.collected_usd, 0)::numeric(14,2) AS collected_usd,
  COALESCE(o.pending_usd, 0)::numeric(14,2) AS pending_usd,
  COALESCE(e.expenses_usd, 0)::numeric(14,2) AS expenses_usd,
  (COALESCE(o.income_usd, 0) - COALESCE(e.expenses_usd, 0))::numeric(14,2) AS profit_usd
FROM trip t
LEFT JOIN (
  SELECT trip_id, count(*) AS order_count, sum(total_usd) AS income_usd,
         sum(paid_usd) AS collected_usd, sum(balance_usd) AS pending_usd
  FROM order_summary
  WHERE status <> 'cancelled' AND trip_id IS NOT NULL
  GROUP BY trip_id
) o ON o.trip_id = t.id
LEFT JOIN (
  SELECT trip_id, sum(amount_usd) AS expenses_usd
  FROM expense_summary
  WHERE trip_id IS NOT NULL
  GROUP BY trip_id
) e ON e.trip_id = t.id;

-- trip_expense_category_summary: Gastos del Viaje por categoría (solo categorías con Gastos).
CREATE VIEW trip_expense_category_summary AS
SELECT
  trip_id,
  category,
  count(*)::int AS expense_count,
  COALESCE(sum(amount_usd), 0)::numeric(14,2) AS total_usd
FROM expense_summary
WHERE trip_id IS NOT NULL
GROUP BY trip_id, category;
