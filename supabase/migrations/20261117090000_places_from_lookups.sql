-- Places found by lookups (milestone 4).
--
-- Place rows are shared across trips, so what they say must come from the
-- provider, not from whoever asked first. Until now any signed-in user could
-- call ensure_place with a name and coordinates of their choosing. From here the
-- app server stores places with the secret key, straight from a lookup result.

alter table public.places drop constraint places_provider_check;
alter table public.places add constraint places_provider_check
  check (provider in ('osm', 'overture', 'foursquare', 'google', 'custom'));

create or replace function public.ensure_place(
  p_provider text,
  p_provider_place_id text,
  p_name text default null,
  p_lat double precision default null,
  p_lng double precision default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_provider = 'google' then
    p_name := null; p_lat := null; p_lng := null;
  end if;

  insert into public.places (provider, provider_place_id, name, lat, lng)
  values (p_provider, p_provider_place_id, p_name, p_lat, p_lng)
  on conflict (provider, provider_place_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.places
    where provider = p_provider and provider_place_id = p_provider_place_id;
  end if;
  return v_id;
end $$;

revoke execute on function public.ensure_place from authenticated, anon, public;
grant execute on function public.ensure_place to service_role;
