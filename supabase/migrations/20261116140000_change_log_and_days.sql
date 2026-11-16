-- Milestone 2: every edit is recorded automatically, grouped into batches that
-- can be undone as one. Also day add/remove/move, which renumber in one step.
--
-- How a write joins a batch: the app sends request headers with the write
--   x-change-batch    uuid (client-generated; reuse it across requests to group them)
--   x-change-actor    'user' | 'agent'
--   x-change-summary  base64 of UTF-8 text, e.g. "Moved Fushimi Inari to the morning"
-- The first logged row creates the batch. Writes without a header get one
-- batch per transaction with an empty summary.

-- ───────────────────────── Fix: membership checks never return null ─────────────────────────
-- trip_role() is null for non-members, and `null in (...)` is null. Policies treat
-- null as false, but `if not can_edit_trip(...)` in plpgsql would let it through.

create or replace function public.can_read_trip(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.trip_role(p_trip_id) is not null, false)
$$;

create or replace function public.can_edit_trip(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.trip_role(p_trip_id) in ('owner', 'editor'), false)
$$;

-- ───────────────────────── Batches ─────────────────────────

create table public.change_batches (
  id uuid primary key,
  trip_id uuid not null references public.trips (id) on delete cascade,
  actor public.actor_kind not null default 'user',
  actor_user_id uuid references auth.users (id) on delete set null,
  summary text not null default '' check (char_length(summary) <= 300),
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index change_batches_trip_created_idx on public.change_batches (trip_id, created_at desc);

alter table public.change_batches enable row level security;
create policy "members read batches" on public.change_batches for select to authenticated
  using (public.can_read_trip(trip_id));
-- No client writes: batches are created by the log trigger and closed by undo_batch().

-- The change log is now written only by triggers; batch-level fields move to change_batches.
drop policy "editors append changes" on public.change_log;
drop policy "editors mark undone" on public.change_log;
revoke insert, update, delete on public.change_log from authenticated;
alter table public.change_log
  drop column actor,
  drop column actor_user_id,
  drop column summary,
  drop column undone_at,
  add constraint change_log_batch_fk foreign key (batch_id) references public.change_batches (id) on delete cascade;

alter table public.messages
  add constraint messages_change_batch_fk foreign key (change_batch_id) references public.change_batches (id) on delete set null;

-- Undo restores rows in reverse order; deferring these lets a deleted day come
-- back after the items that pointed at it.
--
-- The keys also include trip_id, so an item can only point at a day or booking
-- of its own trip (RLS checks the item's trip, not the referenced row's).
alter table public.days add constraint days_id_trip_key unique (id, trip_id);
alter table public.bookings add constraint bookings_id_trip_key unique (id, trip_id);
alter table public.items
  drop constraint items_day_id_fkey,
  drop constraint items_booking_fk,
  add constraint items_day_fk foreign key (day_id, trip_id) references public.days (id, trip_id)
    on delete set null (day_id) deferrable initially immediate,
  add constraint items_booking_fk foreign key (booking_id, trip_id) references public.bookings (id, trip_id)
    on delete set null (booking_id) deferrable initially immediate;

-- ───────────────────────── Logging ─────────────────────────

create function public.request_header(p_name text) returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('request.headers', true), '')::json ->> p_name
$$;

/** The batch the current write belongs to, creating it on first use. */
create function public.current_batch(p_trip_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_header text := public.request_header('x-change-batch');
  v_batch uuid;
  v_actor public.actor_kind := 'user';
  v_summary text := '';
  v_existing_trip uuid;
begin
  if v_header ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_batch := v_header::uuid;
    select trip_id into v_existing_trip from public.change_batches where id = v_batch;
    if v_existing_trip = p_trip_id then
      return v_batch;
    elsif v_existing_trip is not null then
      v_batch := null; -- belongs to another trip: ignore the header
    end if;
  end if;

  if v_batch is null then
    -- One batch per transaction (and trip) when the caller didn't name one.
    v_header := current_setting('app.auto_batch', true);
    if v_header like p_trip_id::text || ':%' then
      return split_part(v_header, ':', 2)::uuid;
    end if;
    v_batch := gen_random_uuid();
    perform set_config('app.auto_batch', p_trip_id::text || ':' || v_batch::text, true);
  else
    if public.request_header('x-change-actor') = 'agent' then v_actor := 'agent'; end if;
    begin
      v_summary := left(convert_from(decode(coalesce(public.request_header('x-change-summary'), ''), 'base64'), 'UTF8'), 300);
    exception when others then
      v_summary := '';
    end;
  end if;

  insert into public.change_batches (id, trip_id, actor, actor_user_id, summary)
  values (v_batch, p_trip_id, v_actor, (select auth.uid()), v_summary);
  return v_batch;
end $$;

create function public.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_trip uuid;
begin
  if current_setting('app.skip_log', true) = 'on' then return null; end if;

  if tg_table_name = 'trips' then
    if tg_op <> 'UPDATE' then return null; end if; -- creating or deleting a trip isn't undoable
    v_trip := (v_row ->> 'id')::uuid;
  else
    v_trip := (v_row ->> 'trip_id')::uuid;
  end if;

  -- Children removed because their trip is being deleted.
  if not exists (select 1 from public.trips where id = v_trip) then return null; end if;

  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return null;
  end if;

  insert into public.change_log (trip_id, batch_id, entity, entity_id, op, before, after)
  values (
    v_trip,
    public.current_batch(v_trip),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    lower(tg_op)::public.change_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['trips', 'days', 'items', 'bookings', 'packing_items', 'ruled_out'] loop
    execute format('create trigger log_change after insert or update or delete on public.%I for each row execute function public.log_change()', t);
  end loop;
end $$;

-- Trip creation sets up days; that isn't an undoable edit.
create or replace function public.create_trip(
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
  perform set_config('app.skip_log', 'on', true);

  insert into public.trips (name, destination, start_date, currency)
  values (p_name, nullif(trim(p_destination), ''), p_start_date, p_currency)
  returning id into v_trip_id;

  insert into public.days (trip_id, number)
  select v_trip_id, n from generate_series(1, p_day_count) as n;

  perform set_config('app.skip_log', 'off', true);
  return v_trip_id;
end $$;

-- ───────────────────────── Undo ─────────────────────────

/**
 * Reverts every change in a batch, newest first. Returns 'ok', 'already_undone',
 * or 'conflict' when a later change touched the same rows (undo that one first).
 */
create function public.undo_batch(p_batch_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_batch public.change_batches;
  v_last bigint;
  r public.change_log;
  v_cols text;
begin
  select * into v_batch from public.change_batches where id = p_batch_id for update;
  if not found or not public.can_edit_trip(v_batch.trip_id) then
    raise exception 'change not found' using errcode = 'P0002';
  end if;
  if v_batch.undone_at is not null then return 'already_undone'; end if;

  select max(id) into v_last from public.change_log where batch_id = p_batch_id;
  if exists (
    select 1
    from public.change_log l
    join public.change_batches lb on lb.id = l.batch_id
    where l.trip_id = v_batch.trip_id
      and l.id > v_last
      and lb.undone_at is null
      and l.entity_id in (select entity_id from public.change_log where batch_id = p_batch_id)
  ) then
    return 'conflict';
  end if;

  perform set_config('app.skip_log', 'on', true);
  set constraints all deferred;

  for r in select * from public.change_log where batch_id = p_batch_id order by id desc loop
    if r.op = 'insert' then
      execute format('delete from public.%I where id = $1', r.entity) using r.entity_id;
    elsif r.op = 'delete' then
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', r.entity, r.entity)
        using r.before;
    else
      select string_agg(quote_ident(k), ', ') into v_cols
      from jsonb_object_keys(r.before) as k
      where k not in ('id', 'created_at', 'updated_at');
      execute format(
        'update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id = $2',
        r.entity, v_cols, v_cols, r.entity
      ) using r.before, r.entity_id;
    end if;
  end loop;

  update public.change_batches set undone_at = now() where id = p_batch_id;
  set constraints all immediate;
  perform set_config('app.skip_log', 'off', true);
  return 'ok';
end $$;

-- ───────────────────────── Days ─────────────────────────

/** Adds a day after `p_after` (0 = at the start; null = at the end). Returns its id. */
create function public.add_day(p_trip_id uuid, p_after int default null) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_count int;
  v_number int;
  v_id uuid;
begin
  select count(*) into v_count from public.days where trip_id = p_trip_id;
  if v_count >= 60 then raise exception 'a trip can have up to 60 days'; end if;
  v_number := least(coalesce(p_after, v_count), v_count) + 1;
  if v_number < 1 then v_number := 1; end if;

  update public.days set number = number + 1 where trip_id = p_trip_id and number >= v_number;
  insert into public.days (trip_id, number) values (p_trip_id, v_number) returning id into v_id;
  return v_id;
end $$;

/** Removes a day. Its items move to the ideas backlog; later days move up. */
create function public.remove_day(p_day_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_day public.days;
begin
  select * into v_day from public.days where id = p_day_id;
  if not found then raise exception 'day not found' using errcode = 'P0002'; end if;
  if (select count(*) from public.days where trip_id = v_day.trip_id) <= 1 then
    raise exception 'a trip needs at least one day';
  end if;

  update public.items set day_id = null, status = case when status = 'booked' then status else 'idea' end
  where day_id = p_day_id;
  delete from public.days where id = p_day_id;
  update public.days set number = number - 1 where trip_id = v_day.trip_id and number > v_day.number;
end $$;

/** Moves a day to a new position, shifting the days in between. */
create function public.move_day(p_day_id uuid, p_to int) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_day public.days;
  v_count int;
begin
  select * into v_day from public.days where id = p_day_id;
  if not found then raise exception 'day not found' using errcode = 'P0002'; end if;
  select count(*) into v_count from public.days where trip_id = v_day.trip_id;
  p_to := greatest(1, least(p_to, v_count));
  if p_to = v_day.number then return; end if;

  if p_to < v_day.number then
    update public.days set number = number + 1
    where trip_id = v_day.trip_id and number >= p_to and number < v_day.number;
  else
    update public.days set number = number - 1
    where trip_id = v_day.trip_id and number > v_day.number and number <= p_to;
  end if;
  update public.days set number = p_to where id = p_day_id;
end $$;

revoke execute on function public.undo_batch, public.add_day, public.remove_day, public.move_day from anon, public;
grant execute on function public.undo_batch, public.add_day, public.remove_day, public.move_day to authenticated;
revoke execute on function public.current_batch, public.log_change, public.request_header from anon, public, authenticated;
