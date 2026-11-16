# Milestones

## 1. Foundation — done

- [x] Next.js 16 + TypeScript + Tailwind v4, pnpm, git
- [x] Theme from the design system: tokens as CSS variables, light and dark (follows the system; `data-theme` override ready), Nunito and Nunito Sans
- [x] UI primitives: Button, Field, StatusChip
- [x] Local Supabase, full data model in one migration (trips, members, days, items + ideas backlog, places, bookings, packing, ruled-out, change log, messages), RLS on every table, `create_trip` and `ensure_place` RPCs, generated types
- [x] Sign-in by email: link or 6-digit code (the code covers the installed app, where email links open in the browser)
- [x] Proxy protects every page except sign-in
- [x] Trips list, new trip, trip shell (pinned bar, chat placeholder, itinerary column on desktop)
- [x] Installable: manifest, generated icons
- [x] Tests: unit, RLS (17), Playwright on phone and desktop (8)
- [ ] Hosted Supabase + Vercel deploy (needs go-ahead)

Decisions made along the way:
- Day dates are derived from `trips.start_date`, not stored per day, so days can't drift out of sequence.
- The ideas backlog is `items` with no day, so "move idea to day 2" is one update and undo stays uniform.
- `trip_members` with owner/editor/viewer roles exists now, so sharing later doesn't mean rewriting RLS. Only owners exist until invites ship.
- The change log is append-only (`undone_at` is the only updatable column). Rows sharing a `batch_id` form one change card.

## 2. Itinerary by hand — done

- [x] Every edit is logged by database triggers into change batches (`change_batches`, `change_log`); clients can't write the log
- [x] `undo_batch` reverts a batch newest-first, and refuses with "conflict" if a later change touched the same rows
- [x] `add_day`, `remove_day` (its items go to ideas), `move_day` renumber in one transaction
- [x] Edit ops in `src/lib/itinerary/ops.ts` (add/update/delete/move item, add/remove/move/update day, update trip): validated, with plain-language summaries. Milestone 3's tools call these.
- [x] Phone: pinned bar opens the itinerary sheet (peek, then full with tabs); drag the handle or press Escape to step back
- [x] Desktop: the full itinerary beside the chat
- [x] Item editor (what, kind, day, part of day or exact time, status, cost, notes; earlier/later; remove), day settings, trip details, ideas backlog with "add to a day"
- [x] Undo toast after every edit; the changed item is highlighted for a few seconds
- [x] Tests: unit 17, database 34, end-to-end 14 (phone and desktop)

Decisions made along the way:
- Removing a day moves its items to ideas (and resets planned items to idea; booked stays booked) rather than deleting them.
- Undo is not itself logged, so there is no redo yet.
- Items point at days and bookings through (id, trip_id) keys, so they can't reference another trip's rows.
- Packing, Bookings and Budget tabs are placeholders until milestone 5.
- The selected day isn't kept in the URL yet; reloading returns to Day 1.

## 3. Chat that edits
## 4. Lookups
## 5. Lists
## 6. Launch prep
