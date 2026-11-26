-- Inventario: Artículos de inventario (mercadería en existencia, lista para vender), su valor a precio de venta,
-- la Utilidad proyectada (Utilidad global + Inventario disponible) y la función sell_stock_item ("Vender").

-- Género del Artículo de inventario: tabla de referencia (enum de Hasura). `comment` es la etiqueta en español.
CREATE TABLE public.item_gender (
    value   text PRIMARY KEY,
    comment text NOT NULL
);

INSERT INTO public.item_gender (value, comment) VALUES
    ('men',    'Hombre'),
    ('women',  'Mujer'),
    ('unisex', 'Unisex');

-- Artículo de inventario: precio de venta unitario en su moneda y cantidad en existencia (0 = Agotado; se conserva
-- como historial). Pertenece al Viaje donde se compró o es General (trip_id NULL): sus tasas convierten el valor.
CREATE TABLE public.stock_item (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text          NOT NULL CHECK (length(trim(name)) > 0),
    description   text,
    size          text,
    gender        text          NOT NULL REFERENCES public.item_gender (value) ON DELETE RESTRICT,
    photo_url     text,
    price         numeric(14,2) NOT NULL CHECK (price >= 0),
    currency_code text          NOT NULL DEFAULT 'CRC' REFERENCES public.currency (code) ON DELETE RESTRICT,
    quantity      integer       NOT NULL DEFAULT 1 CHECK (quantity >= 0),
    trip_id       uuid          REFERENCES public.trip (id) ON DELETE RESTRICT,
    created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX stock_item_trip_id_idx ON public.stock_item (trip_id);

COMMENT ON TABLE public.stock_item IS
    'Artículos de inventario: mercadería en existencia con precio de venta, de un Viaje o General (trip_id nulo).';

-- Por Artículo de inventario: precio unitario y valor (precio × cantidad) en su moneda, USD y CRC, con las tasas
-- efectivas de su Viaje (global si es General). Redondeo por registro, como order_item_summary.
CREATE VIEW public.stock_item_summary AS
SELECT
    s.id                                                                       AS stock_item_id,
    s.trip_id,
    s.gender,
    s.currency_code,
    s.quantity,
    public.effective_rate(s.trip_id, s.currency_code)                          AS rate,
    round(s.price / public.effective_rate(s.trip_id, s.currency_code), 2)      AS price_usd,
    COALESCE(round(public.to_crc(s.trip_id, s.price, s.currency_code), 2), 0)  AS price_crc,
    round(s.price * s.quantity, 2)                                             AS stock_value,
    round(s.price * s.quantity / public.effective_rate(s.trip_id, s.currency_code), 2) AS stock_value_usd,
    COALESCE(round(public.to_crc(s.trip_id, s.price * s.quantity, s.currency_code), 2), 0) AS stock_value_crc
FROM public.stock_item s;

COMMENT ON VIEW public.stock_item_summary IS
    'Artículo de inventario con su precio y valor (precio × cantidad) en su moneda, USD y CRC (tasas de su Viaje).';

-- Inventario disponible: una fila (0s si no hay) con lo que vale, a precio de venta, lo que queda por vender.
-- Solo cantidad > 0; suma los valores ya redondeados por Artículo de inventario, así cuadra con la lista.
CREATE VIEW public.stock_summary AS
SELECT
    count(*)::int                                          AS item_count,
    COALESCE(sum(quantity), 0)::int                        AS unit_count,
    COALESCE(sum(stock_value_usd), 0)::numeric(14,2)       AS stock_value_usd,
    COALESCE(sum(stock_value_crc), 0)::numeric(14,2)       AS stock_value_crc
FROM public.stock_item_summary
WHERE quantity > 0;

COMMENT ON VIEW public.stock_summary IS
    'Inventario disponible (cantidad > 0) valorado a precio de venta, en USD y CRC; siempre una fila.';

-- Utilidad proyectada = Utilidad global (business_summary) + Inventario disponible (stock_summary). Una fila.
CREATE VIEW public.projected_profit_summary AS
SELECT
    b.profit_usd,
    s.stock_value_usd,
    (b.profit_usd + s.stock_value_usd)::numeric(14,2) AS projected_profit_usd,
    b.profit_crc,
    s.stock_value_crc,
    (b.profit_crc + s.stock_value_crc)::numeric(14,2) AS projected_profit_crc
FROM public.business_summary b
CROSS JOIN public.stock_summary s;

COMMENT ON VIEW public.projected_profit_summary IS
    'Utilidad proyectada: Utilidad global más el Inventario disponible a precio de venta, en USD y CRC.';

-- "Vender": pasa `quantity` unidades de un Artículo de inventario a la Venta Pendiente más reciente (fecha, luego
-- creación) del Cliente `customer_id` en el mismo Viaje del Artículo (o General), o a una Venta nueva Pendiente en
-- CRC con fecha `today` (hoy del servidor si es nula) si no hay ninguna: mismas reglas que
-- move_request_item_to_order. Copia nombre, talla, descripción y foto con esa cantidad y el precio unitario `price`
-- (en la moneda de esa Venta) y descuenta la cantidad del inventario. Todo o nada: es una sola transacción.
-- Concurrencia: bloquea el Artículo de inventario (FOR UPDATE: dos ventas simultáneas esperan una a la otra y la
-- segunda ve la cantidad ya descontada, así nunca queda negativa) y toma el MISMO advisory lock por Cliente + Viaje
-- que move_request_item_to_order, así ninguna combinación de ventas y movimientos crea dos Ventas nuevas.
-- Devuelve la Venta destino (SETOF para que Hasura la exponga como mutación sobre la tabla `order`).
CREATE FUNCTION public.sell_stock_item(
    item_id uuid,
    customer_id uuid,
    quantity integer,
    price numeric,
    today date DEFAULT NULL
)
RETURNS SETOF public."order"
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_item     public.stock_item%ROWTYPE;
    v_order_id uuid;
BEGIN
    IF sell_stock_item.quantity IS NULL OR sell_stock_item.quantity <= 0 THEN
        RAISE EXCEPTION 'La cantidad debe ser un número entero mayor que 0' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF sell_stock_item.price IS NULL OR sell_stock_item.price < 0 THEN
        RAISE EXCEPTION 'El precio debe ser mayor o igual a 0' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT s.* INTO v_item
    FROM public.stock_item s
    WHERE s.id = sell_stock_item.item_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El Artículo de inventario no existe' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_item.quantity = 0 THEN
        RAISE EXCEPTION 'El Artículo de inventario está agotado' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF sell_stock_item.quantity > v_item.quantity THEN
        RAISE EXCEPTION '%', CASE WHEN v_item.quantity = 1 THEN 'Solo queda 1 en inventario'
                                  ELSE format('Solo quedan %s en inventario', v_item.quantity) END
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    PERFORM 1 FROM public.customer c WHERE c.id = sell_stock_item.customer_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El Cliente no existe' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Same key as move_request_item_to_order on purpose (see above).
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'move_request_item_to_order:' || sell_stock_item.customer_id || ':' || COALESCE(v_item.trip_id::text, 'general'),
            0
        )
    );

    SELECT o.id INTO v_order_id
    FROM public."order" o
    WHERE o.customer_id = sell_stock_item.customer_id
      AND o.trip_id IS NOT DISTINCT FROM v_item.trip_id
      AND o.status = 'pending'
    ORDER BY o.date DESC, o.created_at DESC
    LIMIT 1;

    IF v_order_id IS NULL THEN
        INSERT INTO public."order" (customer_id, trip_id, currency_code, status, date)
        VALUES (sell_stock_item.customer_id, v_item.trip_id, 'CRC', 'pending', COALESCE(today, CURRENT_DATE))
        RETURNING id INTO v_order_id;
    END IF;

    INSERT INTO public.order_item (order_id, name, price, quantity, size, description, photo_url)
    VALUES (v_order_id, v_item.name, sell_stock_item.price, sell_stock_item.quantity, v_item.size,
            v_item.description, v_item.photo_url);

    UPDATE public.stock_item s
    SET quantity = s.quantity - sell_stock_item.quantity
    WHERE s.id = v_item.id;

    RETURN QUERY SELECT o.* FROM public."order" o WHERE o.id = v_order_id;
END
$$;

COMMENT ON FUNCTION public.sell_stock_item(uuid, uuid, integer, numeric, date) IS
    'Vende unidades de un Artículo de inventario: las agrega a la Venta Pendiente más reciente del Cliente y Viaje (o a una nueva en CRC) y descuenta el inventario.';
