-- Pedidos y Artículos (PRD historias 40–42, 45–49) y su resumen (Total en la moneda del Pedido y en USD).

-- Estados del Pedido: tabla de referencia (enum de Hasura). `comment` es la etiqueta en español.
CREATE TABLE public.order_status (
    value   text PRIMARY KEY,
    comment text NOT NULL
);

INSERT INTO public.order_status (value, comment) VALUES
    ('pending',   'Pendiente'),
    ('delivered', 'Entregado'),
    ('cancelled', 'Cancelado');

-- Un Pedido pertenece a un Cliente y a un Viaje o es Personal (trip_id NULL); está en una sola moneda.
-- No se puede borrar un Cliente ni un Viaje que tienen Pedidos (RESTRICT).
CREATE TABLE public."order" (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id   uuid        NOT NULL REFERENCES public.customer (id) ON DELETE RESTRICT,
    trip_id       uuid        REFERENCES public.trip (id) ON DELETE RESTRICT,
    currency_code text        NOT NULL REFERENCES public.currency (code) ON DELETE RESTRICT,
    status        text        NOT NULL DEFAULT 'pending' REFERENCES public.order_status (value) ON DELETE RESTRICT,
    date          date        NOT NULL,
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_customer_id_idx ON public."order" (customer_id);
CREATE INDEX order_trip_id_idx ON public."order" (trip_id);

COMMENT ON TABLE public."order" IS 'Pedidos de un Cliente, de un Viaje o Personales (trip_id nulo), en una sola moneda.';

-- Artículos (líneas) del Pedido, en la moneda del Pedido. Al borrar el Pedido se borran (CASCADE).
-- `photo_url` queda para la rebanada de fotos.
CREATE TABLE public.order_item (
    id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   uuid          NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    name       text          NOT NULL CHECK (length(trim(name)) > 0),
    price      numeric(14,2) NOT NULL CHECK (price >= 0),
    quantity   integer       NOT NULL DEFAULT 1 CHECK (quantity > 0),
    size       text,
    photo_url  text,
    created_at timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX order_item_order_id_idx ON public.order_item (order_id);

COMMENT ON TABLE public.order_item IS 'Artículos de un Pedido; el precio está en la moneda del Pedido.';

-- Resumen por Pedido. `total` = suma de precio × cantidad (0 sin Artículos, nunca nulo), en la moneda del
-- Pedido; `total_usd` lo convierte con el tipo efectivo del Viaje del Pedido (global si es Personal).
-- Incluye los Pedidos Cancelados: excluirlos de los totales es trabajo de los resúmenes por Cliente/Viaje.
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
