-- ═══════════════════════════════════════════════════════════════════════════
-- Vuelve las reglas de acceso al estado anterior a
-- db/2026-11-18-permisos-en-la-base.sql (estado leído de pg_policies el 18-11).
-- Sólo para emergencias: deja la base abierta a cualquier usuario con sesión.
-- No borra la columna can_view (no molesta y conserva lo que se haya asignado).
-- ═══════════════════════════════════════════════════════════════════════════
begin;

drop policy if exists "Ver operaciones" on public.operations;
drop policy if exists "Cargar operaciones" on public.operations;
drop policy if exists "Modificar operaciones" on public.operations;
drop policy if exists "Borrar operaciones" on public.operations;
create policy "Team shared access for operations" on public.operations for all to authenticated
  using (true) with check (true);

drop policy if exists "Ver vehiculos" on public.vehicles;
drop policy if exists "Cargar vehiculos" on public.vehicles;
drop policy if exists "Modificar vehiculos" on public.vehicles;
drop policy if exists "Quitar vehiculos" on public.vehicles;
create policy "Team shared access for vehicles" on public.vehicles for all to authenticated
  using (true) with check (true);

drop policy if exists "Ver mi perfil" on public.profiles;
create policy "Profiles viewable by authenticated" on public.profiles for select to authenticated
  using (true);

grant execute on function public.get_operation_genealogy(text) to anon, authenticated;

commit;
