-- Enlace público de un Pedido para su Cliente (issue #35). Una fila por Pedido con un token secreto
-- aleatorio (24 bytes de pgcrypto = 192 bits, 48 caracteres hex). El enlace nunca lleva el id del Pedido.
-- Compartir de nuevo reutiliza la fila; "Desactivar enlace" la borra y "Generar enlace nuevo" la borra y
-- crea otra (token nuevo) en la misma mutación. Al borrar el Pedido se borra su enlace (CASCADE).
-- Nadie lee esta tabla sin sesión: la página pública pasa por Hapi (GET /public/orders/{token}), que
-- consulta con el admin secret y devuelve solo un DTO curado. Hasura no tiene rol anónimo.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.order_share (
    order_id   uuid        PRIMARY KEY REFERENCES public."order" (id) ON DELETE CASCADE,
    token      text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex')
                           CHECK (token ~ '^[0-9a-f]{48}$'),
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_share IS
    'Enlace público (token secreto) de un Pedido para su Cliente; borrar la fila desactiva el enlace.';
