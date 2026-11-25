-- Montos en colones y dólares (issue #30): cada vista que expone *_usd expone también *_crc, y hay vistas por
-- Artículo (order_item_summary) y por Abono (payment_summary) con sus equivalentes en $ y ₡.
-- Columnas nuevas al final; las anteriores no cambian.
--
-- ₡ de un registro = monto / tasa(moneda del registro) × tasa('CRC'), con las tasas efectivas de SU Viaje
-- (global si es General); los Abonos usan el Viaje del Pedido. Un monto ya en CRC queda tal cual.
-- Redondeo igual que *_usd: por registro se redondea a 2 decimales; los agregados suman los *_crc ya
-- redondeados por Pedido/Gasto, así las partes cuadran con el total. Si CRC no existiera, ₡ = 0 (nunca nulo).

-- Equivalente en CRC (sin redondear) de un monto de un Viaje (p_trip_id NULL = General).
CREATE FUNCTION public.to_crc(p_trip_id uuid, p_amount numeric, p_currency_code text)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN p_currency_code = 'CRC' THEN p_amount
        ELSE p_amount / public.effective_rate(p_trip_id, p_currency_code) * public.effective_rate(p_trip_id, 'CRC')
    END
$$;

COMMENT ON FUNCTION public.to_crc(uuid, numeric, text) IS
    'Equivalente en CRC (sin redondear) con las tasas efectivas del Viaje (General: trip_id NULL; ADR-0002).';

-- Gasto: + amount_crc.
CREATE OR REPLACE VIEW public.expense_summary AS
SELECT
    e.id                                                      AS expense_id,
    e.trip_id,
    e.category,
    e.currency_code,
    public.effective_rate(e.trip_id, e.currency_code)         AS rate,
    round(e.amount / public.effective_rate(e.trip_id, e.currency_code), 2) AS amount_usd,
    e.is_personal,
    COALESCE(round(public.to_crc(e.trip_id, e.amount, e.currency_code), 2), 0) AS amount_crc
FROM public.expense e;

COMMENT ON VIEW public.expense_summary IS 'Gasto con su tipo de cambio efectivo y sus equivalentes en USD y CRC.';

-- Pedido: + total_crc, paid_crc, balance_crc (mismo redondeo que total_usd / paid_usd / balance_usd).
CREATE OR REPLACE VIEW public.order_summary AS
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
    (round(t.total, 2) > 0 AND round(t.total, 2) - round(p.paid, 2) <= 0) AS is_paid,
    COALESCE(round(public.to_crc(o.trip_id, t.total, o.currency_code), 2), 0) AS total_crc,
    COALESCE(round(p.paid_crc, 2), 0)                         AS paid_crc,
    COALESCE(round(public.to_crc(o.trip_id, t.total, o.currency_code), 2), 0)
        - COALESCE(round(p.paid_crc, 2), 0)                   AS balance_crc
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
        COALESCE(sum(pm.amount / public.effective_rate(o.trip_id, pm.currency_code)), 0)          AS paid_usd,
        COALESCE(sum(public.to_crc(o.trip_id, pm.amount, pm.currency_code)), 0)                   AS paid_crc
    FROM public.payment pm
    WHERE pm.order_id = o.id
) p;

COMMENT ON VIEW public.order_summary IS
    'Pedido con su tipo de cambio efectivo, Total, Abono y Saldo en su moneda, en USD y en CRC (incluye Cancelados).';

-- Artículo: importe de la línea (precio × cantidad) en la moneda del Pedido, en USD y en CRC (tasas del Viaje del Pedido).
CREATE VIEW public.order_item_summary AS
SELECT
    i.id                                                      AS order_item_id,
    i.order_id,
    o.currency_code,
    round(i.price * i.quantity, 2)                            AS line_total,
    round(i.price * i.quantity / public.effective_rate(o.trip_id, o.currency_code), 2) AS line_total_usd,
    COALESCE(round(public.to_crc(o.trip_id, i.price * i.quantity, o.currency_code), 2), 0) AS line_total_crc
FROM public.order_item i
JOIN public."order" o ON o.id = i.order_id;

COMMENT ON VIEW public.order_item_summary IS 'Artículo con el importe de su línea en la moneda del Pedido, en USD y en CRC.';

-- Abono: su monto en la moneda del Pedido, en USD y en CRC (tasas del Viaje del Pedido, como order_summary).
CREATE VIEW public.payment_summary AS
SELECT
    pm.id                                                     AS payment_id,
    pm.order_id,
    o.trip_id,
    pm.currency_code,
    public.effective_rate(o.trip_id, pm.currency_code)        AS rate,
    o.currency_code                                           AS order_currency_code,
    round(pm.amount / public.effective_rate(o.trip_id, pm.currency_code)
          * public.effective_rate(o.trip_id, o.currency_code), 2) AS order_amount,
    round(pm.amount / public.effective_rate(o.trip_id, pm.currency_code), 2) AS amount_usd,
    COALESCE(round(public.to_crc(o.trip_id, pm.amount, pm.currency_code), 2), 0) AS amount_crc
FROM public.payment pm
JOIN public."order" o ON o.id = pm.order_id;

COMMENT ON VIEW public.payment_summary IS 'Abono con su monto en la moneda del Pedido, en USD y en CRC.';

-- Cuenta del Cliente: + total_crc, paid_crc, balance_crc.
CREATE OR REPLACE VIEW customer_summary AS
SELECT
  c.id AS customer_id,
  count(s.order_id)::int AS order_count,
  COALESCE(sum(s.total_usd), 0)::numeric(14,2) AS total_usd,
  COALESCE(sum(s.paid_usd), 0)::numeric(14,2) AS paid_usd,
  COALESCE(sum(s.balance_usd), 0)::numeric(14,2) AS balance_usd,
  COALESCE(sum(s.total_crc), 0)::numeric(14,2) AS total_crc,
  COALESCE(sum(s.paid_crc), 0)::numeric(14,2) AS paid_crc,
  COALESCE(sum(s.balance_crc), 0)::numeric(14,2) AS balance_crc
FROM customer c
LEFT JOIN order_summary s ON s.customer_id = c.id AND s.status <> 'cancelled'
GROUP BY c.id;

CREATE OR REPLACE VIEW customer_trip_summary AS
SELECT
  s.customer_id,
  s.trip_id,
  count(*)::int AS order_count,
  COALESCE(sum(s.total_usd), 0)::numeric(14,2) AS total_usd,
  COALESCE(sum(s.paid_usd), 0)::numeric(14,2) AS paid_usd,
  COALESCE(sum(s.balance_usd), 0)::numeric(14,2) AS balance_usd,
  COALESCE(sum(s.total_crc), 0)::numeric(14,2) AS total_crc,
  COALESCE(sum(s.paid_crc), 0)::numeric(14,2) AS paid_crc,
  COALESCE(sum(s.balance_crc), 0)::numeric(14,2) AS balance_crc
FROM order_summary s
WHERE s.status <> 'cancelled'
GROUP BY s.customer_id, s.trip_id;

-- Reporte por Viaje: + *_crc de cada cifra.
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
  COALESCE(e.business_expenses_usd, 0)::numeric(14,2) AS business_expenses_usd,
  COALESCE(o.income_crc, 0)::numeric(14,2) AS income_crc,
  COALESCE(o.collected_crc, 0)::numeric(14,2) AS collected_crc,
  COALESCE(o.pending_crc, 0)::numeric(14,2) AS pending_crc,
  COALESCE(e.expenses_crc, 0)::numeric(14,2) AS expenses_crc,
  (COALESCE(o.income_crc, 0) - COALESCE(e.expenses_crc, 0))::numeric(14,2) AS profit_crc,
  COALESCE(e.personal_expenses_crc, 0)::numeric(14,2) AS personal_expenses_crc,
  COALESCE(e.business_expenses_crc, 0)::numeric(14,2) AS business_expenses_crc
FROM trip t
LEFT JOIN (
  SELECT trip_id, count(*) AS order_count, sum(total_usd) AS income_usd,
         sum(paid_usd) AS collected_usd, sum(balance_usd) AS pending_usd,
         sum(total_crc) AS income_crc, sum(paid_crc) AS collected_crc, sum(balance_crc) AS pending_crc
  FROM order_summary
  WHERE status <> 'cancelled' AND trip_id IS NOT NULL
  GROUP BY trip_id
) o ON o.trip_id = t.id
LEFT JOIN (
  SELECT trip_id, sum(amount_usd) AS expenses_usd,
         sum(amount_usd) FILTER (WHERE is_personal) AS personal_expenses_usd,
         sum(amount_usd) FILTER (WHERE NOT is_personal) AS business_expenses_usd,
         sum(amount_crc) AS expenses_crc,
         sum(amount_crc) FILTER (WHERE is_personal) AS personal_expenses_crc,
         sum(amount_crc) FILTER (WHERE NOT is_personal) AS business_expenses_crc
  FROM expense_summary
  WHERE trip_id IS NOT NULL
  GROUP BY trip_id
) e ON e.trip_id = t.id;

CREATE OR REPLACE VIEW trip_expense_category_summary AS
SELECT
  trip_id,
  category,
  count(*)::int AS expense_count,
  COALESCE(sum(amount_usd), 0)::numeric(14,2) AS total_usd,
  COALESCE(sum(amount_crc), 0)::numeric(14,2) AS total_crc
FROM expense_summary
WHERE trip_id IS NOT NULL
GROUP BY trip_id, category;

-- Lo General: mismas columnas nuevas que trip_summary.
CREATE OR REPLACE VIEW no_trip_summary AS
SELECT
  COALESCE(o.order_count, 0)::int AS order_count,
  COALESCE(o.income_usd, 0)::numeric(14,2) AS income_usd,
  COALESCE(o.collected_usd, 0)::numeric(14,2) AS collected_usd,
  COALESCE(o.pending_usd, 0)::numeric(14,2) AS pending_usd,
  COALESCE(e.expenses_usd, 0)::numeric(14,2) AS expenses_usd,
  (COALESCE(o.income_usd, 0) - COALESCE(e.expenses_usd, 0))::numeric(14,2) AS profit_usd,
  COALESCE(e.personal_expenses_usd, 0)::numeric(14,2) AS personal_expenses_usd,
  COALESCE(e.business_expenses_usd, 0)::numeric(14,2) AS business_expenses_usd,
  COALESCE(o.income_crc, 0)::numeric(14,2) AS income_crc,
  COALESCE(o.collected_crc, 0)::numeric(14,2) AS collected_crc,
  COALESCE(o.pending_crc, 0)::numeric(14,2) AS pending_crc,
  COALESCE(e.expenses_crc, 0)::numeric(14,2) AS expenses_crc,
  (COALESCE(o.income_crc, 0) - COALESCE(e.expenses_crc, 0))::numeric(14,2) AS profit_crc,
  COALESCE(e.personal_expenses_crc, 0)::numeric(14,2) AS personal_expenses_crc,
  COALESCE(e.business_expenses_crc, 0)::numeric(14,2) AS business_expenses_crc
FROM (SELECT 1) one
LEFT JOIN (
  SELECT count(*) AS order_count, sum(total_usd) AS income_usd,
         sum(paid_usd) AS collected_usd, sum(balance_usd) AS pending_usd,
         sum(total_crc) AS income_crc, sum(paid_crc) AS collected_crc, sum(balance_crc) AS pending_crc
  FROM order_summary
  WHERE status <> 'cancelled' AND trip_id IS NULL
) o ON true
LEFT JOIN (
  SELECT sum(amount_usd) AS expenses_usd,
         sum(amount_usd) FILTER (WHERE is_personal) AS personal_expenses_usd,
         sum(amount_usd) FILTER (WHERE NOT is_personal) AS business_expenses_usd,
         sum(amount_crc) AS expenses_crc,
         sum(amount_crc) FILTER (WHERE is_personal) AS personal_expenses_crc,
         sum(amount_crc) FILTER (WHERE NOT is_personal) AS business_expenses_crc
  FROM expense_summary
  WHERE trip_id IS NULL
) e ON true;

-- Utilidad global: + *_crc (Σ trip_summary + no_trip_summary).
CREATE OR REPLACE VIEW business_summary AS
SELECT
  COALESCE(sum(order_count), 0)::int AS order_count,
  COALESCE(sum(income_usd), 0)::numeric(14,2) AS income_usd,
  COALESCE(sum(collected_usd), 0)::numeric(14,2) AS collected_usd,
  COALESCE(sum(pending_usd), 0)::numeric(14,2) AS pending_usd,
  COALESCE(sum(expenses_usd), 0)::numeric(14,2) AS expenses_usd,
  COALESCE(sum(personal_expenses_usd), 0)::numeric(14,2) AS personal_expenses_usd,
  COALESCE(sum(business_expenses_usd), 0)::numeric(14,2) AS business_expenses_usd,
  COALESCE(sum(profit_usd), 0)::numeric(14,2) AS profit_usd,
  COALESCE(sum(income_crc), 0)::numeric(14,2) AS income_crc,
  COALESCE(sum(collected_crc), 0)::numeric(14,2) AS collected_crc,
  COALESCE(sum(pending_crc), 0)::numeric(14,2) AS pending_crc,
  COALESCE(sum(expenses_crc), 0)::numeric(14,2) AS expenses_crc,
  COALESCE(sum(personal_expenses_crc), 0)::numeric(14,2) AS personal_expenses_crc,
  COALESCE(sum(business_expenses_crc), 0)::numeric(14,2) AS business_expenses_crc,
  COALESCE(sum(profit_crc), 0)::numeric(14,2) AS profit_crc
FROM (
  SELECT order_count, income_usd, collected_usd, pending_usd, expenses_usd,
         personal_expenses_usd, business_expenses_usd, profit_usd,
         income_crc, collected_crc, pending_crc, expenses_crc,
         personal_expenses_crc, business_expenses_crc, profit_crc
  FROM trip_summary
  UNION ALL
  SELECT order_count, income_usd, collected_usd, pending_usd, expenses_usd,
         personal_expenses_usd, business_expenses_usd, profit_usd,
         income_crc, collected_crc, pending_crc, expenses_crc,
         personal_expenses_crc, business_expenses_crc, profit_crc
  FROM no_trip_summary
) s;
