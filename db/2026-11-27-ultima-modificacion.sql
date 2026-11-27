-- ═══════════════════════════════════════════════════════════════════════════
-- Quién cargó y quién modificó cada operación (27-11-2026)
--
-- Pedido: ver en la trazabilidad la última persona que modificó una operación.
-- Hasta hoy la base guardaba quién la CARGÓ (operations.user_id) pero no quién
-- la editó: cada edición pisaba los datos sin dejar rastro. Lo que se editó
-- antes de correr este script no se puede reconstruir.
--
-- Columnas nuevas en operations:
--   created_by_email  correo de quien la cargó. Las existentes se completan
--                     desde profiles por user_id.
--   updated_at        cuándo se modificó por última vez.
--   updated_by        id del usuario que la modificó.
--   updated_by_email  su correo.
--
-- Las pone la BASE, no la página (trigger): no dependen de que la pantalla las
-- mande y nadie las puede falsear desde el navegador. Cuenta como modificación:
--   - un cambio real en la operación (editar, carga rápida). Un UPDATE que no
--     cambia nada no cuenta;
--   - agregar, cambiar o quitar un vehículo de la operación (partes de pago).
-- NO cuenta: guardar precios de mercado (vehicles.market_data), que lo hace la
-- app sola.
--
-- CÓMO CORRERLO (Supabase → SQL Editor):
--   1. Tal cual (ensayo := true): hace todo, prueba con usuarios simulados y
--      DESHACE todo. Tiene que terminar con el error «ENSAYO OK ...».
--   2. Cambiar ensayo := false y correrlo otra vez: guarda y muestra «Success».
-- Para volver atrás: db/2026-11-27-ultima-modificacion-revertir.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Ayudante de prueba: corre p_sql como un usuario simulado, devuelve lo que da
-- p_check (como ese mismo usuario) y DESHACE todo. 'ERROR: ...' si falló.
create or replace function pg_temp.como(p_uid uuid, p_email text, p_sql text, p_check text) returns text
language plpgsql as $f$
declare r text;
begin
  begin
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid, 'role', 'authenticated', 'email', p_email)::text, true);
    set local role authenticated;
    execute p_sql;
    execute p_check into r;
    raise exception 'deshacer prueba';
  exception
    when raise_exception then
      if sqlerrm <> 'deshacer prueba' then r := 'ERROR: ' || sqlerrm; end if;
    when others then r := 'ERROR: ' || sqlerrm;
  end;
  return coalesce(r, '∅');
end $f$;

do $mig$
declare
  ensayo boolean := true;   -- ← cambiar a false para guardar
  resumen text := '';
  n bigint;
  r text;
  v_user uuid;
  v_email text;
  v_op uuid;
  v_nueva uuid := gen_random_uuid();
  chk text;
begin
  -- 1. Columnas.
  alter table public.operations add column if not exists created_by_email text;
  alter table public.operations add column if not exists updated_at timestamptz;
  alter table public.operations add column if not exists updated_by uuid;
  alter table public.operations add column if not exists updated_by_email text;

  -- 2. Quién cargó las que ya existen (user_id → profiles.email).
  update public.operations o set created_by_email = p.email
    from public.profiles p
   where o.created_by_email is null and o.user_id is not null and p.id::text = o.user_id::text;
  get diagnostics n = row_count;
  resumen := resumen || format('Cargó completado en %s operaciones. ', n);
  select count(*) into n from public.operations where created_by_email is null;
  resumen := resumen || format('%s quedan sin usuario de carga (sin user_id o perfil borrado). ', n);

  -- 3. Sello de la operación.
  create or replace function public.operations_sello() returns trigger
  language plpgsql set search_path = public as $f$
  declare
    v_uid uuid := auth.uid();
    v_email text;
    sello constant text[] := array['created_by_email', 'updated_at', 'updated_by', 'updated_by_email'];
  begin
    if v_uid is not null then
      select email into v_email from public.profiles where id = v_uid;
      v_email := coalesce(v_email, auth.jwt() ->> 'email');
    else
      -- SQL Editor o service_role: queda constancia de que no fue una persona.
      v_email := 'sistema (' || current_user || ')';
    end if;

    if tg_op = 'INSERT' then
      if v_uid is not null or new.created_by_email is null then
        new.created_by_email := v_email;
      end if;
      new.updated_at := null;
      new.updated_by := null;
      new.updated_by_email := null;
      return new;
    end if;

    -- UPDATE. Quién la cargó no cambia nunca.
    new.created_by_email := old.created_by_email;
    if (to_jsonb(new) - sello) is distinct from (to_jsonb(old) - sello)
       or coalesce(current_setting('app.sello_vehiculo', true), '') = '1' then
      new.updated_at := now();
      new.updated_by := v_uid;
      new.updated_by_email := v_email;
    else
      -- Nada cambió (o sólo intentaron escribir el sello a mano): se deja como estaba.
      new.updated_at := old.updated_at;
      new.updated_by := old.updated_by;
      new.updated_by_email := old.updated_by_email;
    end if;
    return new;
  end;
  $f$;
  drop trigger if exists operations_sello on public.operations;
  create trigger operations_sello before insert or update on public.operations
    for each row execute function public.operations_sello();

  -- 4. Un cambio en los vehículos marca la operación (menos los precios de mercado).
  create or replace function public.vehiculos_sello() returns trigger
  language plpgsql set search_path = public as $f$
  declare ops uuid[];
  begin
    if tg_op = 'UPDATE'
       and (to_jsonb(new) - 'market_data') is not distinct from (to_jsonb(old) - 'market_data') then
      return null;
    end if;
    ops := case tg_op
             when 'INSERT' then array[new.operation_id]
             when 'DELETE' then array[old.operation_id]
             else array[new.operation_id, old.operation_id] end;
    perform set_config('app.sello_vehiculo', '1', true);
    -- Si la operación se está borrando (cascada), no hay fila y no pasa nada.
    update public.operations set updated_at = updated_at where id = any(ops);
    perform set_config('app.sello_vehiculo', '', true);
    return null;
  end;
  $f$;
  drop trigger if exists vehiculos_sello on public.vehicles;
  create trigger vehiculos_sello after insert or update or delete on public.vehicles
    for each row execute function public.vehiculos_sello();

  -- ── Pruebas con un usuario simulado (editor; si no hay, administrador) ──
  select id, email into v_user, v_email from public.profiles where can_edit and not is_admin limit 1;
  if v_user is null then
    select id, email into v_user, v_email from public.profiles where is_admin limit 1;
  end if;
  select o.id into v_op from public.operations o
   where exists (select 1 from public.vehicles v where v.operation_id = o.id)
   order by o.created_at desc nulls last limit 1;

  if v_user is null or v_op is null then
    resumen := resumen || 'SIN PRUEBAS: no hay editor/administrador u operación con vehículos. ';
  else
    chk := format('select coalesce(updated_by_email, ''∅'') || ''|'' || coalesce(updated_by::text, ''∅'')'
                  || ' from public.operations where id = %L', v_op);

    r := pg_temp.como(v_user, v_email, format('update public.operations set buyer = buyer where id = %L', v_op), chk);
    if r <> '∅|∅' then raise exception 'FALLA: un UPDATE sin cambios marcó la operación (%)', r; end if;

    r := pg_temp.como(v_user, v_email,
      format('update public.operations set buyer = coalesce(buyer, '''') || '' '' where id = %L', v_op), chk);
    if r <> coalesce(v_email, '') || '|' || v_user::text then
      raise exception 'FALLA: editar no dejó al usuario (%; esperaba %)', r, v_email;
    end if;

    r := pg_temp.como(v_user, v_email,
      format('update public.operations set updated_by_email = ''falso@x.com'' where id = %L', v_op), chk);
    if r <> '∅|∅' then raise exception 'FALLA: se pudo escribir el sello a mano (%)', r; end if;

    r := pg_temp.como(v_user, v_email,
      format('update public.vehicles set market_data = market_data where operation_id = %L', v_op), chk);
    if r <> '∅|∅' then raise exception 'FALLA: guardar precios de mercado marcó la operación (%)', r; end if;

    r := pg_temp.como(v_user, v_email,
      format('update public.vehicles set valuation = coalesce(valuation, 0) + 1 where operation_id = %L', v_op), chk);
    if r <> coalesce(v_email, '') || '|' || v_user::text then
      raise exception 'FALLA: cambiar un vehículo no marcó la operación (%)', r;
    end if;

    r := pg_temp.como(v_user, v_email,
      format('insert into public.operations (id, operation_type, payment_type, user_id, created_by_email, updated_by_email)'
             || ' values (%L, ''compra'', ''contado'', %L, ''falso@x.com'', ''falso@x.com'')', v_nueva, v_user),
      format('select coalesce(created_by_email, ''∅'') || ''|'' || coalesce(updated_by_email, ''∅'')'
             || ' from public.operations where id = %L', v_nueva));
    if r <> coalesce(v_email, '') || '|∅' then
      raise exception 'FALLA: una operación nueva no quedó a nombre de quien la cargó (%)', r;
    end if;

    resumen := resumen || format('Pruebas con %s: editar marca, sin cambios no marca, el sello no se falsea, '
      || 'precios de mercado no marcan, un vehículo sí marca, una alta queda a su nombre. ', v_email);
  end if;

  if ensayo then
    raise exception 'ENSAYO OK (no se guardó nada). %', resumen;
  end if;
  raise notice 'GUARDADO. %', resumen;
end
$mig$;
