-- Decisión de #11 (CONTEXT.md): lo que no tiene Viaje es General; un Gasto puede ser Gasto personal
-- (manutención de quien viaja, independiente de la categoría), que sí resta en la Utilidad.

-- Gasto personal: marca booleana en cada Gasto.
ALTER TABLE public.expense ADD COLUMN is_personal boolean NOT NULL DEFAULT false;

COMMENT ON TABLE public.expense IS 'Gastos del negocio, de un Viaje o Generales (trip_id nulo). is_personal = Gasto personal.';
COMMENT ON FUNCTION public.effective_rate(uuid, text) IS
    'Tipo de cambio efectivo (unidades por 1 USD): el del Viaje si existe; si no, el global (General: trip_id NULL; ADR-0002).';

-- Nueva categoría de Gasto.
INSERT INTO public.expense_category (value, comment) VALUES ('fuel', 'Combustible');

-- expense_summary: agrega is_personal al final (para filtrar la vista con el mismo `where` que la tabla).
CREATE OR REPLACE VIEW public.expense_summary AS
SELECT
    e.id                                                      AS expense_id,
    e.trip_id,
    e.category,
    e.currency_code,
    public.effective_rate(e.trip_id, e.currency_code)         AS rate,
    round(e.amount / public.effective_rate(e.trip_id, e.currency_code), 2) AS amount_usd,
    e.is_personal
FROM public.expense e;

-- trip_summary: agrega los subtotales de Gastos personales y del negocio (expenses_usd = ambos; la Utilidad los incluye).
CREATE OR REPLACE VIEW trip_summary AS
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

-- no_trip_summary (lo General): mismas columnas nuevas.
CREATE OR REPLACE VIEW no_trip_summary AS
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

-- Utilidad global (USD): todos los Viajes más lo General, siempre una fila (ceros, nunca null).
-- Suma trip_summary + no_trip_summary, así coincide exactamente con lo que muestra cada reporte.
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
