-- ═══════════════════════════════════════════════════════════════════════════
-- Permisos en la base (18-11-2026)
--
-- Antes: operations y vehicles tenían una sola regla "todo usuario con sesión
-- puede hacer todo" (using true). Los permisos "puede editar" / "puede borrar"
-- sólo escondían botones. Como el registro público estaba abierto y la clave
-- pública va dentro de la página, cualquiera podía crearse una cuenta y leer,
-- cambiar o borrar todo. Además get_operation_genealogy (SECURITY DEFINER, sin
-- uso en la app) se podía llamar sin iniciar sesión y salteaba las reglas.
--
-- Ahora:
--   ver      → is_admin, can_view, can_edit o can_delete
--   cargar / modificar operaciones y sus vehículos → is_admin o can_edit
--   borrar operaciones → is_admin o can_delete; o can_edit sobre una operación
--                        propia de los últimos 10 minutos (deshacer un alta fallida)
--   perfiles → cada uno ve el suyo; el administrador ve y cambia todos
--   get_operation_genealogy → nadie la puede llamar desde la API
--
-- Columna nueva profiles.can_view. La primera vez que corre se le da a TODOS
-- los perfiles existentes, así nadie que hoy ve los datos deja de verlos. Las
-- cuentas nuevas empiezan sin ver nada.
--
-- CÓMO CORRERLO (Supabase → SQL Editor):
--   1. Tal cual (ensayo := true): hace todo, prueba con usuarios simulados y
--      DESHACE todo. Tiene que terminar con el error «ENSAYO OK ...».
--   2. Cambiar ensayo := false y correrlo otra vez: guarda y muestra «Success».
-- Para volver atrás: db/2026-11-18-permisos-en-la-base-revertir.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Ayudante de prueba: corre una consulta como un usuario simulado (o como
-- visitante sin sesión si uid es null) y DESHACE lo que haya hecho.
-- Devuelve: filas vistas/afectadas; -2 = la base lo rechazó por permisos;
-- -3 = lo rechazó el trigger de perfiles.
create or replace function pg_temp.probar(p_uid uuid, p_sql text) returns bigint
language plpgsql as $f$
declare n bigint := -1;
begin
  begin
    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    perform set_config('request.jwt.claims',
      case when p_uid is null then '{"role":"anon"}'
           else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true);
    execute case when p_uid is null then 'set local role anon' else 'set local role authenticated' end;
    if p_sql ilike 'select%' then
      execute p_sql into n;
    else
      execute p_sql;
      get diagnostics n = row_count;
    end if;
    raise exception 'deshacer prueba';
  exception
    when insufficient_privilege then n := -2;
    when raise_exception then
      if sqlerrm <> 'deshacer prueba' then n := -3; end if;
  end;
  return n;
end $f$;

do $mig$
declare
  ensayo boolean := true;   -- ← cambiar a false para guardar
  resumen text := '';
  n bigint;
  v_total bigint;
  v_admin uuid;
  v_viewer uuid;
  v_editor uuid;
  v_nadie uuid := gen_random_uuid();
  v_op uuid;
begin
  -- 1. Columna can_view (sólo la primera vez; conserva el acceso actual).
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'can_view') then
    alter table public.profiles add column can_view boolean not null default false;
    update public.profiles set can_view = true;
    get diagnostics n = row_count;
    resumen := resumen || format('can_view creado y dado a los %s perfiles existentes. ', n);
  end if;

  -- 2. Funciones de permiso (leen el perfil del usuario de la sesión).
  create or replace function public.can_view() returns boolean
  language sql stable security definer set search_path = public as $f$
    select coalesce((select is_admin or can_view or can_edit or can_delete
                     from public.profiles where id = auth.uid()), false);
  $f$;
  create or replace function public.can_edit() returns boolean
  language sql stable security definer set search_path = public as $f$
    select coalesce((select is_admin or can_edit from public.profiles where id = auth.uid()), false);
  $f$;
  create or replace function public.can_delete() returns boolean
  language sql stable security definer set search_path = public as $f$
    select coalesce((select is_admin or can_delete from public.profiles where id = auth.uid()), false);
  $f$;
  revoke execute on function public.can_view(), public.can_edit(), public.can_delete() from public, anon;
  grant execute on function public.can_view(), public.can_edit(), public.can_delete() to authenticated;

  -- 3. Operaciones.
  drop policy if exists "Team shared access for operations" on public.operations;
  drop policy if exists "Ver operaciones" on public.operations;
  drop policy if exists "Cargar operaciones" on public.operations;
  drop policy if exists "Modificar operaciones" on public.operations;
  drop policy if exists "Borrar operaciones" on public.operations;
  create policy "Ver operaciones" on public.operations for select to authenticated
    using (public.can_view());
  create policy "Cargar operaciones" on public.operations for insert to authenticated
    with check (public.can_edit());
  create policy "Modificar operaciones" on public.operations for update to authenticated
    using (public.can_edit()) with check (public.can_edit());
  create policy "Borrar operaciones" on public.operations for delete to authenticated
    using (public.can_delete()
           or (public.can_edit() and user_id::text = auth.uid()::text
               and created_at > now() - interval '10 minutes'));

  -- 4. Vehículos (editar una operación agrega y quita partes de pago: can_edit).
  drop policy if exists "Team shared access for vehicles" on public.vehicles;
  drop policy if exists "Ver vehiculos" on public.vehicles;
  drop policy if exists "Cargar vehiculos" on public.vehicles;
  drop policy if exists "Modificar vehiculos" on public.vehicles;
  drop policy if exists "Quitar vehiculos" on public.vehicles;
  create policy "Ver vehiculos" on public.vehicles for select to authenticated
    using (public.can_view());
  create policy "Cargar vehiculos" on public.vehicles for insert to authenticated
    with check (public.can_edit());
  create policy "Modificar vehiculos" on public.vehicles for update to authenticated
    using (public.can_edit()) with check (public.can_edit());
  create policy "Quitar vehiculos" on public.vehicles for delete to authenticated
    using (public.can_edit());

  -- 5. Perfiles: cada uno ve el suyo (el administrador ve todos por
  --    "Admins can do everything"). Antes cualquiera veía todos los correos.
  drop policy if exists "Profiles viewable by authenticated" on public.profiles;
  drop policy if exists "Ver mi perfil" on public.profiles;
  create policy "Ver mi perfil" on public.profiles for select to authenticated
    using (id = auth.uid());

  -- 6. Nadie se da permisos a sí mismo (ahora también can_view).
  create or replace function public.prevent_privilege_escalation() returns trigger
  language plpgsql set search_path to 'public' as $f$
  begin
    if current_user in ('postgres', 'service_role') then
      return new;
    end if;
    if not public.is_admin() then
      if new.is_admin   is distinct from old.is_admin
      or new.can_view   is distinct from old.can_view
      or new.can_edit   is distinct from old.can_edit
      or new.can_delete is distinct from old.can_delete
      or new.id         is distinct from old.id then
        raise exception 'no podés modificar permisos ni el id de tu perfil';
      end if;
    end if;
    return new;
  end;
  $f$;

  -- 7. Función que salteaba las reglas: no se puede llamar desde la API.
  if to_regprocedure('public.get_operation_genealogy(text)') is not null then
    revoke execute on function public.get_operation_genealogy(text) from public, anon, authenticated;
  end if;

  -- 8. Permisos de tabla que la app no usa y que RLS no cubre (TRUNCATE).
  revoke truncate, references, trigger on public.operations, public.vehicles, public.profiles from anon, authenticated;

  -- ── Pruebas con usuarios simulados ──────────────────────────────────────
  select count(*) into v_total from public.operations;
  select id into v_op from public.operations order by created_at desc nulls last limit 1;
  select id into v_admin  from public.profiles where is_admin limit 1;
  select id into v_editor from public.profiles where can_edit and not is_admin limit 1;
  select id into v_viewer from public.profiles
    where can_view and not is_admin and not can_edit and not can_delete limit 1;

  n := pg_temp.probar(null, 'select count(*) from public.operations');
  if n <> 0 then raise exception 'FALLA: sin sesión ve % operaciones', n; end if;
  n := pg_temp.probar(null, 'select count(*) from public.vehicles');
  if n <> 0 then raise exception 'FALLA: sin sesión ve % vehículos', n; end if;
  if to_regprocedure('public.get_operation_genealogy(text)') is not null and (
       has_function_privilege('anon', 'public.get_operation_genealogy(text)', 'execute')
       or has_function_privilege('authenticated', 'public.get_operation_genealogy(text)', 'execute')) then
    raise exception 'FALLA: get_operation_genealogy sigue habilitada';
  end if;
  resumen := resumen || 'Sin sesión: 0 operaciones. ';

  n := pg_temp.probar(v_nadie, 'select count(*) from public.operations');
  if n <> 0 then raise exception 'FALLA: una cuenta sin perfil ve % operaciones', n; end if;
  n := pg_temp.probar(v_nadie, format('update public.operations set buyer = buyer where id = %L', v_op));
  if n > 0 then raise exception 'FALLA: una cuenta sin perfil modifica operaciones'; end if;
  n := pg_temp.probar(v_nadie, format('delete from public.vehicles where operation_id = %L', v_op));
  if n > 0 then raise exception 'FALLA: una cuenta sin perfil borra vehículos'; end if;
  n := pg_temp.probar(v_nadie, 'select count(*) from public.profiles');
  if n <> 0 then raise exception 'FALLA: una cuenta sin perfil ve % perfiles', n; end if;
  resumen := resumen || 'Cuenta nueva: no ve, no modifica, no borra. ';

  if v_admin is not null then
    n := pg_temp.probar(v_admin, 'select count(*) from public.operations');
    if n <> v_total then raise exception 'FALLA: el administrador ve % de % operaciones', n, v_total; end if;
    n := pg_temp.probar(v_admin, format('update public.operations set buyer = buyer where id = %L', v_op));
    if n <> 1 then raise exception 'FALLA: el administrador no puede modificar'; end if;
    resumen := resumen || format('Administrador: ve las %s y modifica. ', v_total);
  end if;

  if v_editor is not null then
    n := pg_temp.probar(v_editor, format('update public.operations set buyer = buyer where id = %L', v_op));
    if n <> 1 then raise exception 'FALLA: un editor no puede modificar'; end if;
    resumen := resumen || 'Editor: modifica. ';
  end if;

  if v_viewer is not null then
    n := pg_temp.probar(v_viewer, 'select count(*) from public.operations');
    if n <> v_total then raise exception 'FALLA: el de sólo lectura ve % de % operaciones', n, v_total; end if;
    n := pg_temp.probar(v_viewer, format('update public.operations set buyer = buyer where id = %L', v_op));
    if n > 0 then raise exception 'FALLA: el de sólo lectura modifica operaciones'; end if;
    n := pg_temp.probar(v_viewer, format('delete from public.operations where id = %L', v_op));
    if n > 0 then raise exception 'FALLA: el de sólo lectura borra operaciones'; end if;
    n := pg_temp.probar(v_viewer, format('update public.vehicles set market_data = market_data where operation_id = %L', v_op));
    if n > 0 then raise exception 'FALLA: el de sólo lectura modifica vehículos'; end if;
    n := pg_temp.probar(v_viewer, 'select count(*) from public.profiles');
    if n <> 1 then raise exception 'FALLA: el de sólo lectura ve % perfiles', n; end if;
    n := pg_temp.probar(v_viewer, format('update public.profiles set can_edit = true where id = %L', v_viewer));
    if n <> -3 then raise exception 'FALLA: el de sólo lectura se puede dar permisos (%)', n; end if;
    resumen := resumen || 'Sólo lectura: ve todo, no modifica, no borra, no se da permisos, ve sólo su perfil. ';
  end if;

  if ensayo then
    raise exception 'ENSAYO OK (no se guardó nada). %', resumen;
  end if;
  raise notice 'GUARDADO. %', resumen;
end
$mig$;
