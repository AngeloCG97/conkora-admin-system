-- Pedidos: lo que un Cliente nos pide que le busquemos. Al encontrar un Artículo, se mueve a una Venta
-- (función move_request_item_to_order, migración siguiente).

-- Un Pedido pertenece a un Cliente y a un Viaje o es General (trip_id NULL), como una Venta.
-- No se puede borrar un Cliente ni un Viaje que tienen Pedidos (RESTRICT).
CREATE TABLE public.customer_request (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid        NOT NULL REFERENCES public.customer (id) ON DELETE RESTRICT,
    trip_id     uuid        REFERENCES public.trip (id) ON DELETE RESTRICT,
    date        date        NOT NULL,
    notes       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_request_customer_id_idx ON public.customer_request (customer_id);
CREATE INDEX customer_request_trip_id_idx ON public.customer_request (trip_id);

COMMENT ON TABLE public.customer_request IS 'Pedidos de un Cliente (lo que quiere que le busquemos), de un Viaje o Generales (trip_id nulo).';

-- Artículos del Pedido: sin precio (se pone al moverlos a una Venta). Al borrar el Pedido se borran (CASCADE).
CREATE TABLE public.customer_request_item (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  uuid        NOT NULL REFERENCES public.customer_request (id) ON DELETE CASCADE,
    name        text        NOT NULL CHECK (length(trim(name)) > 0),
    size        text,
    description text,
    photo_url   text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_request_item_request_id_idx ON public.customer_request_item (request_id);

COMMENT ON TABLE public.customer_request_item IS 'Artículos que un Cliente pidió buscar; no tienen precio hasta moverse a una Venta.';
