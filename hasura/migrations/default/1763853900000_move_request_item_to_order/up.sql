-- Mover un Artículo de un Pedido a una Venta. La descripción viaja con él, así que order_item también la tiene.
ALTER TABLE public.order_item ADD COLUMN description text;

-- Mueve un Artículo de Pedido a la Venta Pendiente más reciente (fecha, luego creación) del mismo Cliente y
-- Viaje (o General), o a una Venta nueva Pendiente en CRC con fecha `today` (hoy del servidor si es nula) si no
-- hay ninguna. Copia nombre, talla, descripción y foto con cantidad 1 y precio `price` (en la moneda de esa
-- Venta) y borra el Artículo del Pedido. Todo o nada: es una sola transacción.
-- Concurrencia: bloquea el Artículo y su Pedido (un doble clic espera y luego ve que el Artículo ya no existe) y
-- toma un advisory lock por Cliente + Viaje, así dos movimientos simultáneos no crean dos Ventas nuevas.
-- Devuelve la Venta destino (SETOF para que Hasura la exponga como mutación sobre la tabla `order`).
CREATE FUNCTION public.move_request_item_to_order(item_id uuid, price numeric, today date DEFAULT NULL)
RETURNS SETOF public."order"
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    v_item     public.customer_request_item%ROWTYPE;
    v_customer uuid;
    v_trip     uuid;
    v_order_id uuid;
BEGIN
    IF price IS NULL OR price < 0 THEN
        RAISE EXCEPTION 'El precio debe ser mayor o igual a 0' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT i.* INTO v_item
    FROM public.customer_request_item i
    WHERE i.id = move_request_item_to_order.item_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El Artículo del Pedido no existe o ya se movió a una Venta' USING ERRCODE = 'invalid_parameter_value';
    END IF;

    SELECT r.customer_id, r.trip_id INTO v_customer, v_trip
    FROM public.customer_request r
    WHERE r.id = v_item.request_id
    FOR UPDATE;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('move_request_item_to_order:' || v_customer || ':' || COALESCE(v_trip::text, 'general'), 0)
    );

    SELECT o.id INTO v_order_id
    FROM public."order" o
    WHERE o.customer_id = v_customer
      AND o.trip_id IS NOT DISTINCT FROM v_trip
      AND o.status = 'pending'
    ORDER BY o.date DESC, o.created_at DESC
    LIMIT 1;

    IF v_order_id IS NULL THEN
        INSERT INTO public."order" (customer_id, trip_id, currency_code, status, date)
        VALUES (v_customer, v_trip, 'CRC', 'pending', COALESCE(today, CURRENT_DATE))
        RETURNING id INTO v_order_id;
    END IF;

    INSERT INTO public.order_item (order_id, name, price, quantity, size, description, photo_url)
    VALUES (v_order_id, v_item.name, move_request_item_to_order.price, 1, v_item.size, v_item.description, v_item.photo_url);

    DELETE FROM public.customer_request_item i WHERE i.id = v_item.id;

    RETURN QUERY SELECT o.* FROM public."order" o WHERE o.id = v_order_id;
END
$$;

COMMENT ON FUNCTION public.move_request_item_to_order(uuid, numeric, date) IS
    'Mueve un Artículo de Pedido a la Venta Pendiente más reciente del Cliente y Viaje (o a una nueva en CRC) y lo borra del Pedido.';
