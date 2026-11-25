-- Aviso de Cliente con nombre igual o parecido (issue #31).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() is only STABLE; this wrapper pins the dictionary so it can be IMMUTABLE (usable in indexes).
CREATE FUNCTION public.normalize_name(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT btrim(regexp_replace(lower(public.unaccent('public.unaccent'::regdictionary, value)), '\s+', ' ', 'g'))
$$;

CREATE INDEX customer_name_trgm_idx ON public.customer USING gin (public.normalize_name(name) gin_trgm_ops);

-- Clientes cuyo nombre es igual (sin mayúsculas/tildes/espacios extra) o parecido (trigramas >= 0.45).
CREATE FUNCTION public.similar_customers(search_name text, exclude_id uuid DEFAULT NULL)
RETURNS SETOF public.customer
LANGUAGE sql STABLE AS $$
  SELECT c.*
  FROM public.customer c
  WHERE (exclude_id IS NULL OR c.id <> exclude_id)
    AND public.normalize_name(search_name) <> ''
    AND (
      public.normalize_name(c.name) = public.normalize_name(search_name)
      OR similarity(public.normalize_name(c.name), public.normalize_name(search_name)) >= 0.45
    )
  ORDER BY similarity(public.normalize_name(c.name), public.normalize_name(search_name)) DESC, c.created_at
  LIMIT 5
$$;
