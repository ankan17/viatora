-- Chat messages, tightened for milestone 3.
--
-- Clients may only post the traveller's own words. Replies are written by the
-- app server with the secret key, so nobody can forge what the assistant said
-- or attach a change card to a message. (Until now replies were stored with the
-- member's own session, which let any editor insert them directly.)

drop policy "editors post messages" on public.messages;
create policy "editors post their own words" on public.messages for insert to authenticated
  with check (
    public.can_edit_trip(trip_id)
    and author_id = (select auth.uid())
    and role = 'user'
    and change_batch_id is null
  );

-- Earlier turns are sent to the model again, so a message has a size.
alter table public.messages
  add constraint parts_size check (octet_length(parts::text) <= case when role = 'user' then 8192 else 131072 end);

-- The daily cap counts a person's messages across their trips.
create index messages_author_created_idx on public.messages (author_id, created_at desc);
