-- Abonos (PRD historias 50–57) y Abono/Saldo del Pedido en `order_summary`.

-- Un Abono pertenece a un Pedido y puede estar en otra moneda distinta a la del Pedido.
-- Al borrar el Pedido se borran sus Abonos (CASCADE).
CREATE TABLE public.payment (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      uuid          NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    amount        numeric(14,2) NOT NULL CHECK (amount > 0),
    currency_code text          NOT NULL REFERENCES public.currency (code) ON DELETE RESTRICT,
    date          date          NOT NULL,
    notes         text,
    created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX payment_order_id_idx ON public.payment (order_id);

COMMENT ON TABLE public.payment IS 'Abonos de un Pedido, en su moneda original (la conversión se hace en order_summary).';

-- Resumen por Pedido, ahora con Abono y Saldo (columnas nuevas al final; las anteriores no cambian).
-- Cada Abono se convierte a la moneda del Pedido con las tasas efectivas del Viaje del Pedido
-- (global si es Personal): monto / tasa(moneda del Abono) × tasa(moneda del Pedido).
-- Redondeo: `total`, `paid`, `total_usd` y `paid_usd` suman valores sin redondear y redondean una vez a 2
-- decimales; `balance` = total − paid y `balance_usd` = total_usd − paid_usd se restan ya redondeados, así
-- Total − Abono = Saldo siempre cuadra en pantalla. Sin Artículos ni Abonos todo es 0, nunca nulo.
-- `is_paid` (indicador "Pagado") = hay algo que cobrar (total > 0) y el Saldo es 0 o menos.
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

COMMENT ON VIEW public.order_summary IS
    'Pedido con su tipo de cambio efectivo, Total, Abono y Saldo en su moneda y en USD (incluye Cancelados).';
