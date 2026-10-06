# Trade News Intelligence

Professional market-intelligence dashboard built with React, Vite, TypeScript, Tailwind CSS, shadcn/ui conventions, Lucide React, React Router, and Supabase.

## Phase 2 — Supabase

Integrated:
- Supabase PostgreSQL schema and indexes
- Row Level Security policies
- Supabase Auth with email/password
- Supabase Realtime for `market_prices`
- Protected application routes
- Private profiles, watchlists, preferences, and price alerts
- Read-only market/news/calendar/analysis datasets for authenticated users

## Environment

Copy `.env.example` to `.env.local` and fill in your Supabase project values:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

The project intentionally contains no hardcoded Supabase credentials.

## Supabase setup

Run the migration in:

`supabase/migrations/20261006000000_initial_schema.sql`

Using the Supabase CLI, from the repository root:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Then verify in the Supabase dashboard that the tables exist, RLS is enabled, and Realtime is enabled for the market/news tables.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

No external market/news API is integrated yet. Rows with no database data continue to render as `—`.
