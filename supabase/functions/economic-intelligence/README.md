# Economic Intelligence Edge Function

This function is the server-side gateway for AI Economic Intelligence.

## Operations

### calendar
POST:
`{"operation":"calendar","range_days":14,"category":"Inflation"}`

The function:
1. verifies the Supabase user session;
2. fetches the US economic calendar from Trading Economics when `TRADING_ECONOMICS_API_KEY` is configured;
3. otherwise uses the provider-neutral `ECONOMIC_DATA_API_URL` adapter;
4. classifies events as released/upcoming from event time and actual value;
5. stores official event data;
6. stores sources and supporting indicators;
7. creates transparent above/near/below scenario scores for upcoming events;
8. performs a recent macro news search.

Trading Economics documents a US country calendar endpoint that exposes fields including Actual, Previous, Forecast, Source, Importance, and LastUpdate. citeturn622116search2

### search
POST:
`{"operation":"search","query":"US CPI latest Reuters"}`

The function searches Google Custom Search JSON API server-side and never exposes the Google key to the browser.

## Secrets

Store secrets in Supabase Edge Function secrets, not frontend code:

- `GOOGLE_CSE_API_KEY`
- `GOOGLE_CSE_ID`
- `TRADING_ECONOMICS_API_KEY` (recommended calendar adapter)
- `ECONOMIC_DATA_API_URL` (fallback/provider-neutral adapter)
- `ECONOMIC_DATA_API_KEY` (optional depending on provider)
- `ECONOMIC_DATA_API_PROVIDER`
- `FRED_API_KEY` (supporting official series)
- `SUPABASE_SERVICE_ROLE_KEY`

Do not commit `supabase/functions/.env`.

The frontend only needs:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

## Important deployment note

Changing the Edge Function source in GitHub does not by itself update an already deployed Supabase Edge Function unless your deployment pipeline is configured to do so.

After changing this function, deploy it again:

```bash
supabase functions deploy economic-intelligence
```

Then refresh `/economic-intelligence`.

## Data integrity

The function never invents missing official Previous/Forecast/Actual values. Missing values remain null and are rendered as `—`.

The AI scenario layer is not the official forecast. It only scores Above / Near / Below Forecast from available evidence. Without sufficient evidence it explicitly returns `Insufficient evidence to estimate the likely release.`
