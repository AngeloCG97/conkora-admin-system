-- Administrators that can log in through Hapi (POST /auth/login).
-- Only Hapi reads this table, using the Hasura admin secret; the `manager`
-- role has no permissions on it, so it is not part of its GraphQL schema.
CREATE TABLE public.admin_user (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    username      text        NOT NULL UNIQUE CHECK (length(trim(username)) > 0),
    password_hash text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_user IS 'Administradores del sistema (contraseñas con bcrypt).';
