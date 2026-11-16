<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Viatora — Travel Planner AI

Chat-based trip planner. The itinerary in Postgres is the source of truth; the chat agent (milestone 3) only edits it through tool calls. Plan: see `docs/milestones.md`.

## Run it

- `pnpm db:start` — local Supabase (Docker). Ports are 554xx because another project uses the 543xx defaults. Studio: http://127.0.0.1:55423, Mailpit (sign-in emails): http://127.0.0.1:55424.
- `pnpm dev` — app on http://localhost:3100 (3000 is taken on this machine; Supabase `site_url` matches 3100).
- `pnpm check` — typecheck, lint, unit tests, database (RLS) tests. `pnpm test:e2e` — Playwright, starts the dev server itself.
- One test: `pnpm test src/lib/dates.test.ts` (unit, `src/**/*.test.ts`), `pnpm test:db tests/db/rls.test.ts -t "name"` (needs `pnpm db:start`), `pnpm test:e2e tests/e2e/itinerary.spec.ts --project <name>` (projects in `playwright.config.ts`).

## How it fits together

- Trip page (`src/app/trips/[tripId]/page.tsx`) loads the whole trip once with `loadItinerary` (`src/lib/itinerary/snapshot.ts`) and hands it to `TripScreen`.
- Client components share state through `TripProvider` (`src/components/itinerary/trip-context.tsx`); its `run(op, input)` calls the `edit` / `undo` server actions in `src/app/trips/[tripId]/actions.ts` and shows the undo toast.
- Server actions dispatch to the ops in `src/lib/itinerary/ops.ts`. Each op validates with zod, writes through a client tagged with the batch headers, and returns a summary. Database triggers record the writes in `change_batches` / `change_log`; `undo_batch` reverts one batch.
- Milestone 3's chat agent calls the same ops as tools (actor `agent`), so UI edits and agent edits share one path and one undo history.

## Conventions

- Next 16 with `cacheComponents`: anything that reads cookies or the database sits under `<Suspense>`. The server Supabase client calls `connection()` for this reason. Middleware is `src/proxy.ts`.
- Schema changes: add a migration in `supabase/migrations/` (write the file directly; `supabase migration new` waits on stdin), then `pnpm db:reset && pnpm db:types`. Run `supabase db advisors --local` and keep it at zero findings.
- Every table is trip-scoped and guarded by `can_read_trip` / `can_edit_trip`. Add an RLS test in `tests/db/` for every new table or policy.
- Places: Google rows store the place ID only (enforced by a check constraint). Add places via the `ensure_place` RPC.
- Items with `day_id = null` are the ideas backlog.
- Edits go through `applyEdit` in `src/lib/itinerary/ops.ts`. Never write itinerary tables from UI code directly. Writes carry `x-change-batch` / `x-change-actor` / `x-change-summary` (base64) headers; triggers log them for undo. RPCs that set up data rather than edit it (like `create_trip`) set `app.skip_log`.
- `can_read_trip` / `can_edit_trip` must never return null (plpgsql `if not null` passes). Keep the `coalesce`.
- Day dates are derived: `trips.start_date + (number - 1)`. See `src/lib/dates.ts`.
- Styling uses design-system tokens only (`bg-ground`, `bg-raised`, `bg-blush`, `text-ink`, `text-muted`, `border-hairline`, `border-outline`, `bg-plum`, `text-on-plum`; text sizes `text-display/title/heading/body/caption/label`). Source: https://claude.ai/artifact/WZ69JU2DQXvSu7fwGBtJJm. One accent (plum). Tap targets ≥ 44px (`min-h-11`).
