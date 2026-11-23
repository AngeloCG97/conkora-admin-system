-- Clientes. Los Pedidos (otra rebanada) los referencian con ON DELETE RESTRICT.
CREATE TABLE public.customer (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text        NOT NULL CHECK (length(trim(name)) > 0),
    phone      text,
    email      text,
    notes      text,
    created_at timestamptz NOT NULL DEFAULT now()
);
