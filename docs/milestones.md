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
- [x] Visual tests: 86 screenshots of every screen and dialog (phone and desktop, light and dark), and CI on GitHub for all the suites

Decisions made along the way:
- Removing a day moves its items to ideas (and resets planned items to idea; booked stays booked) rather than deleting them.
- Undo is not itself logged, so there is no redo yet.
- Items point at days and bookings through (id, trip_id) keys, so they can't reference another trip's rows.
- Packing, Bookings and Budget tabs are placeholders until milestone 5.
- The selected day isn't kept in the URL yet; reloading returns to Day 1.

## 3. Chat that edits — built, not yet run against the real model

- [x] Chat beside the itinerary (under the pinned bar on phone): messages, a streaming reply, Stop, suggestions to start from
- [x] Agent on the server (Claude Opus 5.5 through the Anthropic SDK; the key never reaches the browser). Each turn it gets the earlier conversation and a fresh snapshot of the trip: details, profile, every day, ideas, and the latest changes, including ones made by hand or undone
- [x] Edit tools that wrap the ops from milestone 2: add, update, remove and reorder items; add, remove and move days; set a day's city; trip details; trip profile
- [x] Change cards: every reply that edits lists what it changed, with one Undo for all of it
- [x] Trip profile (travellers, pace, interests, dietary, accessibility, preferences) saved from chat and sent with every turn
- [x] Messages stored per trip; the conversation is there after a reload
- [x] Tests: unit 36, database 38, end-to-end 24 (phone and desktop), 94 screenshots. Chat tests run against a scripted stand-in for the model
- [ ] A real conversation with the model (needs `ANTHROPIC_API_KEY`): the prompt, the tool descriptions and effort level are untuned until then

Decisions made along the way:
- The model names days by number and items by id. Day numbers are looked up at the moment each tool runs, so a turn that adds or removes days keeps working.
- Earlier turns are sent as words only. Tool calls are not replayed: the snapshot already shows what they did, and it also shows edits made by hand.
- Edits apply at once, without asking first. The card and its Undo are the way back.
- Replies are plain text. Rendering Markdown can wait until replies need it.
- One model call runs at a time and tools run in order, because positions and day numbers depend on the edits before.
- Stopping a reply keeps what had arrived, and any edits already made keep their card.
- If the model declines a request for policy reasons, the API retries on its default fallback model (server-side fallback, a beta feature).
- No daily message cap yet; only people who can edit a trip can chat on it. The cap belongs with launch prep.
## 4. Lookups
## 5. Lists
## 6. Launch prep
