-- Monedas. USD es la moneda base: su tipo de cambio global es siempre 1.
-- global_rate = unidades de la moneda por 1 USD (ADR-0002).
CREATE TABLE public.currency (
    code        text          PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
    name        text          NOT NULL CHECK (length(trim(name)) > 0),
    symbol      text          NOT NULL CHECK (length(trim(symbol)) > 0),
    global_rate numeric(18,6) NOT NULL CHECK (global_rate > 0),
    created_at  timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT currency_usd_rate_is_one CHECK (code <> 'USD' OR global_rate = 1)
);

COMMENT ON TABLE public.currency IS 'Monedas disponibles; USD es la base con tipo global 1.';

INSERT INTO public.currency (code, name, symbol, global_rate) VALUES
    ('USD', 'Dólar estadounidense', '$', 1),
    ('CRC', 'Colón costarricense', '₡', 505);
