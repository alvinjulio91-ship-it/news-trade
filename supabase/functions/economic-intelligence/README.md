# Economic Intelligence Edge Function

This function is the server-side gateway for AI Economic Intelligence.

## Operations

### calendar
POST:
`{"operation":"calendar","range_days":14,"category":"Inflation"}`

The function:
1. verifies the Supabase user session;
2. fetches US events from the configured Economic Data API;
3. classifies events as released/upcoming from event time and actual value;
4. stores official event data;
5. stores sources and supporting indicators;
6. creates transparent above/near/below scenario scores for upcoming events;
7. performs a recent macro news search.

### search
POST:
`{"operation":"search","query":"US CPI latest Reuters"}`

The function searches Google Custom Search JSON API server-side and never exposes the Google key to the browser.

## Secrets

Store secrets in Supabase Edge Function secrets, not in frontend code:

- `GOOGLE_CSE_API_KEY`
- `GOOGLE_CSE_ID`
- `ECONOMIC_DATA_API_URL`
- `ECONOMIC_DATA_API_KEY` (optional depending on provider)
- `ECONOMIC_DATA_API_PROVIDER`
- `FRED_API_KEY` (reserved for official supporting-series adapters)
- `SUPABASE_SERVICE_ROLE_KEY` (provided by/managed in the Supabase project environment)

For local function development, use `supabase/functions/.env`. Do not commit that file.

## Economic Data API contract

The current adapter intentionally uses a provider-neutral contract because no specific calendar vendor was supplied.

The endpoint should accept:
- `country=US`
- `from=<ISO timestamp>`
- `to=<ISO timestamp>`
- `limit=250`
- optional `category=<category>`
- optional `api_key=<key>`

Response can be an array or:
`{"events":[...]}`

Each event should expose:
- `event_name`
- `country`
- `currency`
- `event_time`
- `importance`
- `previous`
- `forecast` (official/provider forecast)
- `actual`
- `status`
- `category`
- `related_asset`
- optional `source_name`, `source_url`
- optional `indicators[]`

The function does not synthesize missing official values. A null value remains null in the UI.

## Scenario model

The initial pre-prediction engine is deliberately transparent and evidence based. It can output:
- ABOVE FORECAST
- NEAR FORECAST
- BELOW FORECAST

Confidence is a model-confidence score, not a guaranteed probability of release or price direction. Numeric AI estimates remain null until an actual forecasting model is connected.

When evidence is absent, the function returns:
`Insufficient evidence to estimate the likely release.`
