-- Viajes y sus tipos de cambio propios (ADR-0002). Sin fila en trip_rate => se usa el tipo global.
CREATE TABLE public.trip (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text         NOT NULL CHECK (length(trim(name)) > 0),
    destination text         NOT NULL CHECK (length(trim(destination)) > 0),
    start_date  date         NOT NULL,
    end_date    date         NOT NULL,
    notes       text,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT trip_dates_ordered CHECK (start_date <= end_date)
);

CREATE TABLE public.trip_rate (
    trip_id       uuid          NOT NULL REFERENCES public.trip (id) ON DELETE CASCADE,
    currency_code text          NOT NULL REFERENCES public.currency (code) ON DELETE RESTRICT,
    rate          numeric(18,6) NOT NULL CHECK (rate > 0),
    created_at    timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT trip_rate_pkey PRIMARY KEY (trip_id, currency_code),
    CONSTRAINT trip_rate_not_usd CHECK (currency_code <> 'USD')
);

COMMENT ON TABLE public.trip_rate IS 'Tipo de cambio de una moneda fijado en un Viaje (unidades por 1 USD).';
