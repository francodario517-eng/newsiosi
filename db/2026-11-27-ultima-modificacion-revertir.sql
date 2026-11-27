-- Vuelve atrás db/2026-11-27-ultima-modificacion.sql.
-- Saca los dos triggers y sus funciones. Las columnas se dejan (con lo que
-- registraron) salvo que se descomente el bloque de abajo: borrarlas pierde
-- para siempre quién modificó cada operación desde que se corrió el script.

drop trigger if exists operations_sello on public.operations;
drop trigger if exists vehiculos_sello on public.vehicles;
drop function if exists public.operations_sello();
drop function if exists public.vehiculos_sello();

-- alter table public.operations
--   drop column if exists created_by_email,
--   drop column if exists updated_at,
--   drop column if exists updated_by,
--   drop column if exists updated_by_email;
