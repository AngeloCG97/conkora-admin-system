DROP VIEW public.order_summary;

CREATE VIEW public.order_summary AS
SELECT
    o.id                                                      AS order_id,
    o.customer_id,
    o.trip_id,
    o.status,
    o.currency_code,
    public.effective_rate(o.trip_id, o.currency_code)         AS rate,
    round(t.total, 2)                                         AS total,
    round(t.total / public.effective_rate(o.trip_id, o.currency_code), 2) AS total_usd
FROM public."order" o
CROSS JOIN LATERAL (
    SELECT COALESCE(sum(i.price * i.quantity), 0) AS total
    FROM public.order_item i
    WHERE i.order_id = o.id
) t;

COMMENT ON VIEW public.order_summary IS 'Pedido con su tipo de cambio efectivo y su Total en su moneda y en USD.';

DROP TABLE public.payment;
