-- Milestone 1: the full planning data model.
-- The itinerary is the source of truth; chat edits it through tool calls.
-- Every table is scoped to a trip and guarded by trip membership.

-- ───────────────────────── Types ─────────────────────────

create type public.member_role as enum ('owner', 'editor', 'viewer');
create type public.item_type as enum ('activity', 'sight', 'food', 'stay', 'transit', 'flight', 'rail', 'note');
create type public.item_status as enum ('idea', 'planned', 'booked');
create type public.day_slot as enum ('morning', 'afternoon', 'evening', 'night');
create type public.booking_kind as enum ('stay', 'flight', 'rail', 'activity', 'car', 'other');
create type public.booking_status as enum ('pending', 'confirmed', 'cancelled');
create type public.actor_kind as enum ('user', 'agent');
create type public.change_op as enum ('insert', 'update', 'delete');
create type public.message_role as enum ('user', 'assistant');

-- ───────────────────────── Helpers ─────────────────────────

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── Profiles ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(split_part(new.email, '@', 1), ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Places ─────────────────────────
-- A reference to a place from a provider. Shared across trips; holds no user data.
-- Google's terms allow storing only the place ID, so Google rows carry no name or
-- coordinates; those are fetched fresh when shown.

create table public.places (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('overture', 'foursquare', 'google', 'custom')),
  provider_place_id text not null,
  name text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  created_at timestamptz not null default now(),
  unique (provider, provider_place_id),
  constraint google_stores_id_only check (
    provider <> 'google' or (name is null and lat is null and lng is null)
  ),
  constraint coords_together check ((lat is null) = (lng is null))
);

-- ───────────────────────── Trips ─────────────────────────

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  destination text check (char_length(destination) <= 200),
  -- Day N's date is start_date + (N - 1). Null until dates are set.
  start_date date,
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  budget_total numeric(12, 2) check (budget_total >= 0),
  -- Trip profile: travellers, pace, interests, dietary needs, saved preferences.
  -- Shape is validated in the app (src/lib/trip-profile.ts).
  profile jsonb not null default '{}'::jsonb check (jsonb_typeof(profile) = 'object'),
  conversation_summary text not null default '',
  summary_message_id uuid, -- last message folded into the summary
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trip_members (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members (user_id);

-- Membership checks used by every policy. Security definer so policies on
-- trip_members itself don't recurse.
create function public.trip_role(p_trip_id uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select role from public.trip_members
  where trip_id = p_trip_id and user_id = (select auth.uid())
$$;

create function public.can_read_trip(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.trip_role(p_trip_id) is not null
$$;

create function public.can_edit_trip(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.trip_role(p_trip_id) in ('owner', 'editor')
$$;

create function public.add_trip_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end $$;

create trigger on_trip_created
  after insert on public.trips
  for each row execute function public.add_trip_owner();

-- ───────────────────────── Days ─────────────────────────

create table public.days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  number int not null check (number >= 1),
  base_city text check (char_length(base_city) <= 120),
  base_place_id uuid references public.places (id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Deferred so days can be renumbered in one transaction.
  constraint days_trip_number_key unique (trip_id, number) deferrable initially deferred
);

-- ───────────────────────── Items ─────────────────────────
-- Items with no day are the ideas backlog. Moving an idea onto a day is a
-- single update, and undo stays uniform.

create table public.items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  day_id uuid references public.days (id) on delete set null,
  type public.item_type not null default 'activity',
  title text not null check (char_length(title) between 1 and 200),
  place_id uuid references public.places (id) on delete set null,
  start_time time,
  end_time time,
  slot public.day_slot,
  position double precision not null default 0,
  status public.item_status not null default 'idea',
  cost_amount numeric(12, 2) check (cost_amount >= 0),
  cost_currency char(3) check (cost_currency ~ '^[A-Z]{3}$'),
  notes text not null default '',
  url text,
  booking_id uuid, -- fk added after bookings
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_or_slot check (start_time is null or slot is null),
  constraint end_after_start check (end_time is null or (start_time is not null and end_time > start_time)),
  constraint cost_has_currency check (cost_amount is null or cost_currency is not null)
);
create index items_trip_day_idx on public.items (trip_id, day_id, position);

-- ───────────────────────── Bookings ─────────────────────────

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  kind public.booking_kind not null,
  title text not null check (char_length(title) between 1 and 200),
  provider_name text,
  confirmation_ref text,
  starts_at timestamptz,
  ends_at timestamptz,
  place_id uuid references public.places (id) on delete set null,
  cost_amount numeric(12, 2) check (cost_amount >= 0),
  cost_currency char(3) check (cost_currency ~ '^[A-Z]{3}$'),
  status public.booking_status not null default 'pending',
  url text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ends_after_starts check (ends_at is null or starts_at is null or ends_at >= starts_at),
  constraint cost_has_currency check (cost_amount is null or cost_currency is not null)
);
create index bookings_trip_idx on public.bookings (trip_id);

alter table public.items
  add constraint items_booking_fk foreign key (booking_id) references public.bookings (id) on delete set null;

-- ───────────────────────── Packing ─────────────────────────

create table public.packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  reason text not null default '', -- why it's on the list, e.g. "Rain forecast on day 3"
  category text,
  quantity int not null default 1 check (quantity >= 1),
  packed boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index packing_items_trip_idx on public.packing_items (trip_id, position);

-- ───────────────────────── Ruled out ─────────────────────────
-- Options the group has rejected, so the agent stops suggesting them.

create table public.ruled_out (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  place_id uuid references public.places (id) on delete set null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index ruled_out_trip_idx on public.ruled_out (trip_id);

-- ───────────────────────── Change log ─────────────────────────
-- One row per entity change. Rows sharing a batch_id form one change card and
-- are undone together by applying `before` in reverse order.

create table public.change_log (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  batch_id uuid not null,
  actor public.actor_kind not null,
  actor_user_id uuid default auth.uid() references auth.users (id) on delete set null,
  entity text not null check (entity in ('trips', 'days', 'items', 'bookings', 'packing_items', 'ruled_out')),
  entity_id uuid not null,
  op public.change_op not null,
  before jsonb,
  after jsonb,
  summary text not null default '',
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
create index change_log_trip_batch_idx on public.change_log (trip_id, batch_id);
create index change_log_trip_created_idx on public.change_log (trip_id, created_at desc);

-- ───────────────────────── Messages ─────────────────────────

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  role public.message_role not null,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  parts jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  change_batch_id uuid, -- the change card this message produced, if any
  created_at timestamptz not null default now()
);
create index messages_trip_created_idx on public.messages (trip_id, created_at);

-- ───────────────────────── updated_at triggers ─────────────────────────

create trigger touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger touch before update on public.trips for each row execute function public.touch_updated_at();
create trigger touch before update on public.days for each row execute function public.touch_updated_at();
create trigger touch before update on public.items for each row execute function public.touch_updated_at();
create trigger touch before update on public.bookings for each row execute function public.touch_updated_at();
create trigger touch before update on public.packing_items for each row execute function public.touch_updated_at();

-- ───────────────────────── Row level security ─────────────────────────

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.days enable row level security;
alter table public.items enable row level security;
alter table public.bookings enable row level security;
alter table public.packing_items enable row level security;
alter table public.ruled_out enable row level security;
alter table public.change_log enable row level security;
alter table public.messages enable row level security;

revoke all on all tables in schema public from anon;

-- Profiles: you, and people you share a trip with.
create policy "read own or co-member profiles" on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.trip_members m
      where m.user_id = profiles.id and public.can_read_trip(m.trip_id)
    )
  );
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Places: shared references, readable by any signed-in user. Added only through
-- ensure_place(), which never overwrites an existing row.
create policy "read places" on public.places for select to authenticated using (true);

-- Trips
-- owner_id check lets `insert ... returning` see the row before the
-- membership trigger has run.
create policy "members read trips" on public.trips for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_read_trip(id));
create policy "create own trips" on public.trips for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "editors update trips" on public.trips for update to authenticated
  using (public.can_edit_trip(id)) with check (public.can_edit_trip(id));
create policy "owner deletes trips" on public.trips for delete to authenticated
  using (public.trip_role(id) = 'owner');

-- Members: visible to co-members; managed by the owner. (Invites arrive with sharing.)
create policy "members read members" on public.trip_members for select to authenticated
  using (public.can_read_trip(trip_id));
create policy "owner adds members" on public.trip_members for insert to authenticated
  with check (public.trip_role(trip_id) = 'owner');
create policy "owner updates members" on public.trip_members for update to authenticated
  using (public.trip_role(trip_id) = 'owner') with check (public.trip_role(trip_id) = 'owner');
create policy "owner removes members" on public.trip_members for delete to authenticated
  using (public.trip_role(trip_id) = 'owner');

-- Trip-scoped tables: members read, editors write.
do $$
declare t text;
begin
  foreach t in array array['days', 'items', 'bookings', 'packing_items', 'ruled_out'] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.can_read_trip(trip_id))', t);
    execute format('create policy "editors insert" on public.%I for insert to authenticated with check (public.can_edit_trip(trip_id))', t);
    execute format('create policy "editors update" on public.%I for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id))', t);
    execute format('create policy "editors delete" on public.%I for delete to authenticated using (public.can_edit_trip(trip_id))', t);
  end loop;
end $$;

-- Change log: append-only for editors; only undone_at may change.
create policy "members read changes" on public.change_log for select to authenticated
  using (public.can_read_trip(trip_id));
create policy "editors append changes" on public.change_log for insert to authenticated
  with check (public.can_edit_trip(trip_id) and actor_user_id = (select auth.uid()));
create policy "editors mark undone" on public.change_log for update to authenticated
  using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
revoke update on public.change_log from authenticated;
grant update (undone_at) on public.change_log to authenticated;

-- Messages: members read; members post their own user messages. Assistant
-- messages are written by the server with the user's session.
create policy "members read messages" on public.messages for select to authenticated
  using (public.can_read_trip(trip_id));
create policy "editors post messages" on public.messages for insert to authenticated
  with check (public.can_edit_trip(trip_id) and author_id = (select auth.uid()));

-- ───────────────────────── RPC: create a trip with its days ─────────────────────────

create function public.create_trip(
  p_name text,
  p_destination text default null,
  p_start_date date default null,
  p_day_count int default 3,
  p_currency char(3) default 'USD'
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_trip_id uuid;
begin
  if p_day_count < 1 or p_day_count > 60 then
    raise exception 'day count must be between 1 and 60';
  end if;

  insert into public.trips (name, destination, start_date, currency)
  values (p_name, nullif(trim(p_destination), ''), p_start_date, p_currency)
  returning id into v_trip_id;

  insert into public.days (trip_id, number)
  select v_trip_id, n from generate_series(1, p_day_count) as n;

  return v_trip_id;
end $$;

revoke execute on function public.create_trip from anon, public;
grant execute on function public.create_trip to authenticated;

-- ───────────────────────── RPC: get or add a place reference ─────────────────────────

create function public.ensure_place(
  p_provider text,
  p_provider_place_id text,
  p_name text default null,
  p_lat double precision default null,
  p_lng double precision default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
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

revoke execute on function public.ensure_place from anon, public;
grant execute on function public.ensure_place to authenticated;
