# Trade News Intelligence

Professional market-intelligence terminal built with React, Vite, TypeScript, Tailwind CSS, shadcn/ui conventions, Lucide React, React Router, and Supabase.

## Current stages

### Stage 1
Core financial-terminal UI with responsive navigation, market cards, charts, and placeholder data.

### Stage 2
Supabase PostgreSQL, Auth, Realtime, protected routes, and RLS.

### AI Economic Intelligence
The new `/economic-intelligence` module is the evidence layer before the future Prediction/Scenario Engine.

It provides:
- Search-based US macro intelligence
- NEXT 1 / 3 / 7 / 14 DAYS filters
- Released vs Upcoming separation
- Official Previous / Forecast / Actual fields
- Event detail and historical data
- Supporting indicators and counter evidence
- Above / Near / Below forecast scenarios
- Gold / XAUUSD impact language
- News search results with source verification
- Retrieved / Published timestamps
- Source links back to the original publisher

No fabricated market or economic values are included. Missing values remain `—`, and the preliminary scenario layer returns `Insufficient evidence` when there is not enough evidence.

## Search API

The requested Google Custom Search JSON API integration is implemented server-side in the Supabase Edge Function. Google currently documents that the Custom Search JSON API is closed to new customers and that existing customers have until January 1, 2027 to transition. Keep the search adapter isolated so it can be swapped without changing the terminal UI.

## Economic data

The calendar adapter is provider-neutral because no specific economic-calendar vendor was supplied. Configure `ECONOMIC_DATA_API_URL` and optionally `ECONOMIC_DATA_API_KEY` in Supabase Edge Function secrets.

The Edge Function also supports `FRED_API_KEY` for official supporting macro series.

## Environment

Frontend `.env.local`:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

Edge Function secrets live in Supabase, not frontend code:

```env
GOOGLE_CSE_API_KEY=
GOOGLE_CSE_ID=
ECONOMIC_DATA_API_URL=
ECONOMIC_DATA_API_KEY=
ECONOMIC_DATA_API_PROVIDER=generic
FRED_API_KEY=
```

Do not commit `supabase/functions/.env`.

## Supabase deployment

Apply migrations:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy economic-intelligence
supabase secrets set --env-file supabase/functions/.env
```

The migration includes a self-check for required tables, RLS, policies, and idempotent event/history keys.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The future Prediction/Scenario Engine should consume the structured data produced by AI Economic Intelligence rather than scraping/searching the web directly.
