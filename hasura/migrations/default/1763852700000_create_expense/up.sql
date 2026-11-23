-- Gastos (PRD historias 24–31) y el tipo de cambio efectivo (ADR-0002, PRD "Módulo 1").

-- Categorías de Gasto: tabla de referencia (enum de Hasura). `comment` es la etiqueta en español.
CREATE TABLE public.expense_category (
    value   text PRIMARY KEY,
    comment text NOT NULL
);

INSERT INTO public.expense_category (value, comment) VALUES
    ('flights',     'Vuelos'),
    ('lodging',     'Hospedaje'),
    ('food',        'Alimentación'),
    ('car_rental',  'Alquiler de carro'),
    ('merchandise', 'Mercadería'),
    ('general',     'Gastos generales'),
    ('other',       'Otro');

-- Un Gasto pertenece a un Viaje o es Personal (trip_id NULL).
-- No se puede borrar un Viaje que tiene Gastos (RESTRICT).
CREATE TABLE public.expense (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id       uuid          REFERENCES public.trip (id) ON DELETE RESTRICT,
    category      text          NOT NULL REFERENCES public.expense_category (value) ON DELETE RESTRICT,
    description   text          NOT NULL CHECK (length(trim(description)) > 0),
    amount        numeric(14,2) NOT NULL CHECK (amount >= 0),
    currency_code text          NOT NULL REFERENCES public.currency (code) ON DELETE RESTRICT,
    date          date          NOT NULL,
    created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX expense_trip_id_idx ON public.expense (trip_id);

COMMENT ON TABLE public.expense IS 'Gastos del negocio, de un Viaje o Personales (trip_id nulo).';

-- Tipo de cambio efectivo (unidades de la moneda por 1 USD) para algo de un Viaje
-- (o Personal, con p_trip_id NULL): el tipo fijado en el Viaje si existe; si no, el global.
-- USD siempre es 1 (trip_rate prohíbe USD y su global_rate es 1).
-- Todas las vistas de cálculos financieros convierten con esta función, al consultar.
CREATE FUNCTION public.effective_rate(p_trip_id uuid, p_currency_code text)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (SELECT tr.rate FROM public.trip_rate tr
          WHERE tr.trip_id = p_trip_id AND tr.currency_code = p_currency_code),
        (SELECT c.global_rate FROM public.currency c WHERE c.code = p_currency_code)
    )
$$;

COMMENT ON FUNCTION public.effective_rate(uuid, text) IS
    'Tipo de cambio efectivo (unidades por 1 USD): el del Viaje si existe; si no, el global (ADR-0002).';

-- Equivalente en USD de cada Gasto, redondeado a 2 decimales.
CREATE VIEW public.expense_summary AS
SELECT
    e.id                                                      AS expense_id,
    e.trip_id,
    e.category,
    e.currency_code,
    public.effective_rate(e.trip_id, e.currency_code)         AS rate,
    round(e.amount / public.effective_rate(e.trip_id, e.currency_code), 2) AS amount_usd
FROM public.expense e;

COMMENT ON VIEW public.expense_summary IS 'Gasto con su tipo de cambio efectivo y su equivalente en USD.';
