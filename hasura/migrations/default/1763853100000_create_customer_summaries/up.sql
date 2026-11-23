-- Cuenta del Cliente (USD): sums the per-Pedido rounded columns of order_summary, Cancelados excluded.
-- customer_summary: one row per Cliente (0s and count 0 when it has no Pedidos).
CREATE VIEW customer_summary AS
SELECT
  c.id AS customer_id,
  count(s.order_id)::int AS order_count,
  COALESCE(sum(s.total_usd), 0)::numeric(14,2) AS total_usd,
  COALESCE(sum(s.paid_usd), 0)::numeric(14,2) AS paid_usd,
  COALESCE(sum(s.balance_usd), 0)::numeric(14,2) AS balance_usd
FROM customer c
LEFT JOIN order_summary s ON s.customer_id = c.id AND s.status <> 'cancelled'
GROUP BY c.id;

-- customer_trip_summary: one row per Cliente and Viaje that has non-cancelled Pedidos; trip_id NULL = Personal.
CREATE VIEW customer_trip_summary AS
SELECT
  s.customer_id,
  s.trip_id,
  count(*)::int AS order_count,
  COALESCE(sum(s.total_usd), 0)::numeric(14,2) AS total_usd,
  COALESCE(sum(s.paid_usd), 0)::numeric(14,2) AS paid_usd,
  COALESCE(sum(s.balance_usd), 0)::numeric(14,2) AS balance_usd
FROM order_summary s
WHERE s.status <> 'cancelled'
GROUP BY s.customer_id, s.trip_id;
