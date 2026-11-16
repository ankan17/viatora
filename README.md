# Viatora — Travel Planner AI

**Plan your trip in minutes, not hours — with your AI trip-planning buddy.**

Plan a trip together by chatting. See `AGENTS.md` for setup and conventions, and `docs/milestones.md` for the plan.

```sh
pnpm install
pnpm db:start   # local Supabase (Docker)
cp .env.example .env.local   # fill from `supabase status`; add ANTHROPIC_API_KEY for chat
pnpm dev        # http://localhost:3100
```

Tests: `pnpm check` (types, lint, unit, database), `pnpm test:e2e` and `pnpm test:visual` (screenshots; needs Docker). CI runs them all on every pull request.
