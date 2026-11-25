-- Restore the views as they were before #30: appended columns can only be removed with DROP + CREATE.
DROP VIEW business_summary;
DROP VIEW no_trip_summary;
DROP VIEW trip_expense_category_summary;
DROP VIEW trip_summary;
DROP VIEW customer_trip_summary;
DROP VIEW customer_summary;
DROP VIEW public.payment_summary;
DROP VIEW public.order_item_summary;
DROP VIEW public.order_summary;
DROP VIEW public.expense_summary;

CREATE VIEW public.expense_summary AS
SELECT
    e.id                                                      AS expense_id,
    e.trip_id,
    e.category,
    e.currency_code,
    public.effective_rate(e.trip_id, e.currency_code)         AS rate,
    round(e.amount / public.effective_rate(e.trip_id, e.currency_code), 2) AS amount_usd,
    e.is_personal
FROM public.expense e;

CREATE VIEW public.order_summary AS
SELECT
    o.id                                                      AS order_id,
    o.customer_id,
    o.trip_id,
    o.status,
    o.currency_code,
    r.rate,
    round(t.total, 2)                                         AS total,
    round(t.total / r.rate, 2)                                AS total_usd,
    round(p.paid, 2)                                          AS paid,
    round(t.total, 2) - round(p.paid, 2)                      AS balance,
    round(p.paid_usd, 2)                                      AS paid_usd,
    round(t.total / r.rate, 2) - round(p.paid_usd, 2)         AS balance_usd,
    (round(t.total, 2) > 0 AND round(t.total, 2) - round(p.paid, 2) <= 0) AS is_paid
FROM public."order" o
CROSS JOIN LATERAL (SELECT public.effective_rate(o.trip_id, o.currency_code) AS rate) r
CROSS JOIN LATERAL (
    SELECT COALESCE(sum(i.price * i.quantity), 0) AS total
    FROM public.order_item i
    WHERE i.order_id = o.id
) t
CROSS JOIN LATERAL (
    SELECT
        COALESCE(sum(pm.amount / public.effective_rate(o.trip_id, pm.currency_code) * r.rate), 0) AS paid,
        COALESCE(sum(pm.amount / public.effective_rate(o.trip_id, pm.currency_code)), 0)          AS paid_usd
    FROM public.payment pm
    WHERE pm.order_id = o.id
) p;

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

CREATE VIEW trip_summary AS
SELECT
  t.id AS trip_id,
  COALESCE(o.order_count, 0)::int AS order_count,
  COALESCE(o.income_usd, 0)::numeric(14,2) AS income_usd,
  COALESCE(o.collected_usd, 0)::numeric(14,2) AS collected_usd,
  COALESCE(o.pending_usd, 0)::numeric(14,2) AS pending_usd,
  COALESCE(e.expenses_usd, 0)::numeric(14,2) AS expenses_usd,
  (COALESCE(o.income_usd, 0) - COALESCE(e.expenses_usd, 0))::numeric(14,2) AS profit_usd,
  COALESCE(e.personal_expenses_usd, 0)::numeric(14,2) AS personal_expenses_usd,
  COALESCE(e.business_expenses_usd, 0)::numeric(14,2) AS business_expenses_usd
FROM trip t
LEFT JOIN (
  SELECT trip_id, count(*) AS order_count, sum(total_usd) AS income_usd,
         sum(paid_usd) AS collected_usd, sum(balance_usd) AS pending_usd
  FROM order_summary
  WHERE status <> 'cancelled' AND trip_id IS NOT NULL
  GROUP BY trip_id
) o ON o.trip_id = t.id
LEFT JOIN (
  SELECT trip_id, sum(amount_usd) AS expenses_usd,
         sum(amount_usd) FILTER (WHERE is_personal) AS personal_expenses_usd,
         sum(amount_usd) FILTER (WHERE NOT is_personal) AS business_expenses_usd
  FROM expense_summary
  WHERE trip_id IS NOT NULL
  GROUP BY trip_id
) e ON e.trip_id = t.id;

CREATE VIEW trip_expense_category_summary AS
SELECT
  trip_id,
  category,
  count(*)::int AS expense_count,
  COALESCE(sum(amount_usd), 0)::numeric(14,2) AS total_usd
FROM expense_summary
WHERE trip_id IS NOT NULL
GROUP BY trip_id, category;

CREATE VIEW no_trip_summary AS
SELECT
  COALESCE(o.order_count, 0)::int AS order_count,
  COALESCE(o.income_usd, 0)::numeric(14,2) AS income_usd,
  COALESCE(o.collected_usd, 0)::numeric(14,2) AS collected_usd,
  COALESCE(o.pending_usd, 0)::numeric(14,2) AS pending_usd,
  COALESCE(e.expenses_usd, 0)::numeric(14,2) AS expenses_usd,
  (COALESCE(o.income_usd, 0) - COALESCE(e.expenses_usd, 0))::numeric(14,2) AS profit_usd,
  COALESCE(e.personal_expenses_usd, 0)::numeric(14,2) AS personal_expenses_usd,
  COALESCE(e.business_expenses_usd, 0)::numeric(14,2) AS business_expenses_usd
FROM (SELECT 1) one
LEFT JOIN (
  SELECT count(*) AS order_count, sum(total_usd) AS income_usd,
         sum(paid_usd) AS collected_usd, sum(balance_usd) AS pending_usd
  FROM order_summary
  WHERE status <> 'cancelled' AND trip_id IS NULL
) o ON true
LEFT JOIN (
  SELECT sum(amount_usd) AS expenses_usd,
         sum(amount_usd) FILTER (WHERE is_personal) AS personal_expenses_usd,
         sum(amount_usd) FILTER (WHERE NOT is_personal) AS business_expenses_usd
  FROM expense_summary
  WHERE trip_id IS NULL
) e ON true;

CREATE VIEW business_summary AS
SELECT
  COALESCE(sum(order_count), 0)::int AS order_count,
  COALESCE(sum(income_usd), 0)::numeric(14,2) AS income_usd,
  COALESCE(sum(collected_usd), 0)::numeric(14,2) AS collected_usd,
  COALESCE(sum(pending_usd), 0)::numeric(14,2) AS pending_usd,
  COALESCE(sum(expenses_usd), 0)::numeric(14,2) AS expenses_usd,
  COALESCE(sum(personal_expenses_usd), 0)::numeric(14,2) AS personal_expenses_usd,
  COALESCE(sum(business_expenses_usd), 0)::numeric(14,2) AS business_expenses_usd,
  COALESCE(sum(profit_usd), 0)::numeric(14,2) AS profit_usd
FROM (
  SELECT order_count, income_usd, collected_usd, pending_usd, expenses_usd,
         personal_expenses_usd, business_expenses_usd, profit_usd
  FROM trip_summary
  UNION ALL
  SELECT order_count, income_usd, collected_usd, pending_usd, expenses_usd,
         personal_expenses_usd, business_expenses_usd, profit_usd
  FROM no_trip_summary
) s;

COMMENT ON VIEW public.expense_summary IS 'Gasto con su tipo de cambio efectivo y su equivalente en USD.';
COMMENT ON VIEW public.order_summary IS
    'Pedido con su tipo de cambio efectivo, Total, Abono y Saldo en su moneda y en USD (incluye Cancelados).';

DROP FUNCTION public.to_crc(uuid, numeric, text);
