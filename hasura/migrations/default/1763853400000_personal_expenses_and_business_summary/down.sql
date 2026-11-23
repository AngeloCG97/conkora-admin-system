-- Drop every view that depends on expense_summary, then restore the previous definitions
-- (removing appended columns requires DROP + CREATE).
DROP VIEW business_summary;
DROP VIEW no_trip_summary;
DROP VIEW trip_summary;
DROP VIEW trip_expense_category_summary;
DROP VIEW public.expense_summary;

CREATE VIEW public.expense_summary AS
SELECT
    e.id                                                      AS expense_id,
    e.trip_id,
    e.category,
    e.currency_code,
    public.effective_rate(e.trip_id, e.currency_code)         AS rate,
    round(e.amount / public.effective_rate(e.trip_id, e.currency_code), 2) AS amount_usd
FROM public.expense e;
COMMENT ON VIEW public.expense_summary IS 'Gasto con su tipo de cambio efectivo y su equivalente en USD.';

CREATE VIEW trip_expense_category_summary AS
SELECT
  trip_id,
  category,
  count(*)::int AS expense_count,
  COALESCE(sum(amount_usd), 0)::numeric(14,2) AS total_usd
FROM expense_summary
WHERE trip_id IS NOT NULL
GROUP BY trip_id, category;

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

DELETE FROM public.expense_category WHERE value = 'fuel';

COMMENT ON TABLE public.expense IS 'Gastos del negocio, de un Viaje o Personales (trip_id nulo).';
COMMENT ON FUNCTION public.effective_rate(uuid, text) IS
    'Tipo de cambio efectivo (unidades por 1 USD): el del Viaje si existe; si no, el global (ADR-0002).';
ALTER TABLE public.expense DROP COLUMN is_personal;
