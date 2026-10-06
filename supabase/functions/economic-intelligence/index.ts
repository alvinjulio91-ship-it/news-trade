import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";

type Event = {
  id?: string;
  event_name: string;
  country: string;
  currency?: string | null;
  event_time: string;
  importance?: string | null;
  previous?: number | null;
  forecast?: number | null;
  actual?: number | null;
  status?: string | null;
  category?: string | null;
  related_asset?: string | null;
};

type Indicator = {
  event_name: string;
  indicator_name: string;
  indicator_code?: string;
  relationship?: string;
  latest_value?: number | null;
  previous_value?: number | null;
  latest_date?: string | null;
  surprise?: number | null;
  direction?: string;
  relevance?: number;
  source_name?: string;
  source_url?: string;
};

const VERIFIED_HOSTS = [
  "reuters.com",
  "federalreserve.gov",
  "bls.gov",
  "bea.gov",
  "census.gov",
  "dol.gov",
  "commerce.gov",
  "fred.stlouisfed.org",
];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === ".") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function verifiedUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return VERIFIED_HOSTS.some((allowed) => host === allowed || host.endsWith("." + allowed));
  } catch {
    return false;
  }
}

function goldImpact(category: string | null | undefined, scenario: string): string {
  const c = (category ?? "").toLowerCase();
  if (c.includes("inflation") || c.includes("employment") || c.includes("consumer") || c.includes("retail")) {
    if (scenario === "above_forecast") return "Potential downside pressure on Gold";
    if (scenario === "below_forecast") return "Potential upside support for Gold";
    return "Potentially mixed; USD and yields may dominate";
  }
  if (c.includes("fed") || c.includes("rate")) {
    if (scenario === "above_forecast") return "Potential downside pressure if interpreted as more hawkish";
    if (scenario === "below_forecast") return "Potential upside support if interpreted as more dovish";
    return "Potentially mixed around guidance and positioning";
  }
  return scenario === "near_forecast" ? "Potentially mixed" : "Direction depends on USD/yield transmission";
}

function buildScenarios(event: Event, indicators: Indicator[]) {
  const relevant = indicators.filter((x) => !event.event_name || x.event_name.toLowerCase() === event.event_name.toLowerCase() || x.event_name.toLowerCase().includes(event.event_name.toLowerCase().split(" ")[0]));
  const supporting = relevant.filter((x) => ["supports_above", "supports_upside", "positive", "above"].includes((x.relationship ?? x.direction ?? "").toLowerCase()) || (x.surprise ?? 0) > 0);
  const counter = relevant.filter((x) => ["supports_below", "supports_downside", "negative", "below"].includes((x.relationship ?? x.direction ?? "").toLowerCase()) || (x.surprise ?? 0) < 0);
  const total = Math.min(relevant.reduce((sum, x) => sum + Math.max(0, Number(x.relevance ?? 0)), 0), 100);
  const evidence = Math.min(relevant.length * 12 + total, 100);
  if (relevant.length === 0) {
    return [buildScenario(event, "above_forecast", 33, "Insufficient evidence to estimate the likely release.", [], []),
      buildScenario(event, "near_forecast", 34, "Insufficient evidence to estimate the likely release.", [], []),
      buildScenario(event, "below_forecast", 33, "Insufficient evidence to estimate the likely release.", [], [])];
  }
  const aboveScore = Math.max(1, 33 + (supporting.length - counter.length) * 6 + Math.round(evidence * 0.08));
  const belowScore = Math.max(1, 33 + (counter.length - supporting.length) * 6 + Math.round(evidence * 0.05));
  const nearScore = Math.max(1, 100 - Math.abs(aboveScore - belowScore) - 40);
  const totalScore = aboveScore + nearScore + belowScore;
  const confidence = (n: number) => Math.round((n / totalScore) * 100);
  const supportNames = supporting.slice(0, 6).map((x) => x.indicator_name);
  const counterNames = counter.slice(0, 6).map((x) => x.indicator_name);
  return [
    buildScenario(event, "above_forecast", confidence(aboveScore), supporting.length ? "Current evidence provides upside pressure signals, but the release remains uncertain." : "Insufficient evidence to estimate the likely release.", supportNames, counterNames),
    buildScenario(event, "near_forecast", confidence(nearScore), "A near-forecast outcome remains plausible when supporting and counter evidence are mixed.", supportNames.slice(0, 3), counterNames.slice(0, 3)),
    buildScenario(event, "below_forecast", confidence(belowScore), counter.length ? "Current evidence provides some downside pressure signals, but the release remains uncertain." : "Insufficient evidence to estimate the likely release.", counterNames, supportNames),
  ];
}

function buildScenario(
  event: Event,
  scenario: "above_forecast" | "near_forecast" | "below_forecast",
  confidence: number,
  reasoning: string,
  supporting_factors: string[],
  counter_factors: string[],
) {
  return {
    event_id: event.id,
    scenario_type: scenario,
    expected_value: null,
    confidence,
    reasoning,
    supporting_factors,
    counter_factors,
    gold_impact: goldImpact(event.category, scenario),
  };
}

async function verifyUser(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase Edge Function secrets are incomplete.");
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication required.");
  const token = authorization.slice("Bearer ".length);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid or expired session.");
  return { user: data.user, admin: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) };
}

async function googleSearch(query: string) {
  const key = Deno.env.get("GOOGLE_CSE_API_KEY");
  const cx = Deno.env.get("GOOGLE_CSE_ID");
  if (!key || !cx) throw new Error("Google Custom Search is not configured. Set GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID.");
  const params = new URLSearchParams({ key, cx, q: query, num: "10", sort: "date", dateRestrict: "d14", safe: "active", hl: "en" });
  const response = await fetch("https://customsearch.googleapis.com/customsearch/v1?" + params.toString());
  if (!response.ok) throw new Error("Google Custom Search request failed (" + response.status + ").");
  return await response.json();
}

async function fetchCalendar(start: Date, end: Date, category?: string) {
  const url = Deno.env.get("ECONOMIC_DATA_API_URL");
  const provider = Deno.env.get("ECONOMIC_DATA_API_PROVIDER") ?? "generic";
  const key = Deno.env.get("ECONOMIC_DATA_API_KEY");
  if (!url) throw new Error("Economic Data API is not configured. Set ECONOMIC_DATA_API_URL.");
  const target = new URL(url);
  target.searchParams.set("country", "US");
  target.searchParams.set("from", start.toISOString());
  target.searchParams.set("to", end.toISOString());
  target.searchParams.set("limit", "250");
  if (category && category !== "All") target.searchParams.set("category", category);
  if (key) target.searchParams.set("api_key", key);
  const response = await fetch(target.toString(), { headers: { Accept: "application/json", "X-Economic-Provider": provider } });
  if (!response.ok) throw new Error("Economic Data API request failed (" + response.status + ").");
  const payload = await response.json();
  const rawEvents = Array.isArray(payload) ? payload : Array.isArray(payload.events) ? payload.events : [];
  return rawEvents.map((x: Record<string, unknown>) => ({
    event_name: String(x.event_name ?? x.name ?? ""),
    country: String(x.country ?? "US"),
    currency: x.currency ? String(x.currency) : "USD",
    event_time: String(x.event_time ?? x.datetime ?? x.date ?? ""),
    importance: x.importance ? String(x.importance).toLowerCase() : "medium",
    previous: numeric(x.previous),
    forecast: numeric(x.forecast ?? x.consensus),
    actual: numeric(x.actual),
    status: x.status ? String(x.status).toLowerCase() : undefined,
    category: x.category ? String(x.category) : "All",
    related_asset: x.related_asset ? String(x.related_asset) : "XAUUSD",
    source_name: x.source_name ? String(x.source_name) : undefined,
    source_url: x.source_url ? String(x.source_url) : undefined,
    indicators: Array.isArray(x.indicators) ? x.indicators : [],
  } satisfies Event & { source_name?: string; source_url?: string; indicators: unknown[] }));
}

async function persistCalendar(admin: ReturnType<typeof createClient>, events: (Event & { source_name?: string; source_url?: string; indicators?: unknown[] })[]) {
  const now = new Date();
  const normalized = events
    .filter((e) => e.event_name && e.event_time)
    .map((e) => ({ ...e, status: new Date(e.event_time).getTime() <= now.getTime() || e.actual !== null ? "released" : "upcoming" }));
  if (!normalized.length) return { events: [], count: 0 };

  const { data, error } = await admin.from("economic_events").upsert(
    normalized.map(({ source_name, source_url, indicators, ...event }) => event),
    { onConflict: "id" },
  ).select("*");
  if (error) throw error;
  const rows = data ?? [];

  for (const event of rows) {
    const incoming = normalized.find((x) => x.event_name === event.event_name && x.event_time === event.event_time);
    if (!incoming) continue;

    if (incoming.source_name && incoming.source_url) {
      await admin.from("economic_event_sources").insert({
        event_id: event.id,
        source_name: incoming.source_name,
        source_url: incoming.source_url,
        source_type: "economic_data_api",
        source_verified: verifiedUrl(incoming.source_url),
      });
    }

    if (event.status === "released") {
      const surprise = event.actual != null && event.forecast != null ? Number(event.actual) - Number(event.forecast) : null;
      await admin.from("economic_event_history").upsert({
        event_id: event.id,
        release_date: event.event_time,
        previous: event.previous,
        forecast: event.forecast,
        actual: event.actual,
        surprise,
        gold_reaction: goldImpact(event.category, actualVsForecast(event)),
      }, { onConflict: "event_id,release_date" });
    }

    const indicators = Array.isArray(incoming.indicators) ? incoming.indicators as Record<string, unknown>[] : [];
    if (indicators.length) {
      await admin.from("economic_event_indicators").delete().eq("event_id", event.id);
      const indicatorRows = indicators.map((x) => ({
        event_id: event.id,
        indicator_name: String(x.indicator_name ?? x.name ?? "Related indicator"),
        indicator_code: x.indicator_code ? String(x.indicator_code) : null,
        relationship: String(x.relationship ?? "mixed"),
        latest_value: numeric(x.latest_value),
        previous_value: numeric(x.previous_value),
        latest_date: x.latest_date ? String(x.latest_date) : null,
        surprise: numeric(x.surprise),
        direction: String(x.direction ?? "neutral"),
        relevance: numeric(x.relevance) ?? 0,
        source_name: x.source_name ? String(x.source_name) : null,
        source_url: x.source_url ? String(x.source_url) : null,
      }));
      await admin.from("economic_event_indicators").insert(indicatorRows);
    }

    const { data: indicatorRows } = await admin.from("economic_event_indicators").select("*").eq("event_id", event.id).order("relevance", { ascending: false });
    if (event.status === "upcoming") {
      const scenarios = buildScenarios(event, (indicatorRows ?? []).map((x) => ({ ...x, event_name: event.event_name })));
      await admin.from("economic_event_scenarios").upsert(scenarios, { onConflict: "event_id,scenario_type" });
    }
  }
  return { events: rows, count: rows.length };
}

function actualVsForecast(event: Event) {
  if (event.actual == null || event.forecast == null) return "near_forecast";
  return event.actual > event.forecast ? "above_forecast" : event.actual < event.forecast ? "below_forecast" : "near_forecast";
}

function mapSearchResults(payload: Record<string, unknown>) {
  const items = Array.isArray(payload.items) ? payload.items as Record<string, unknown>[] : [];
  return items.map((item) => {
    const link = String(item.link ?? "");
    const meta = (item.pagemap as Record<string, unknown> | undefined)?.metatags;
    const tags = Array.isArray(meta) && meta[0] ? meta[0] as Record<string, unknown> : undefined;
    const published = tags?.["article:published_time"] ?? tags?.date ?? null;
    return {
      headline: String(item.title ?? ""),
      source_name: String(item.displayLink ?? new URL(link).hostname),
      source_url: link,
      published_at: published ? String(published) : null,
      summary: String(item.snippet ?? ""),
      source_verified: verifiedUrl(link),
    };
  }).filter((x) => x.headline && x.source_url);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, admin } = await verifyUser(req);
    const body = await req.json().catch(() => ({}));
    const operation = String(body.operation ?? "calendar");

    if (operation === "search") {
      const query = String(body.query ?? "").trim();
      if (!query) return json({ error: "Search query is required." }, 400);
      const payload = await googleSearch(query);
      const results = mapSearchResults(payload);
      await admin.from("economic_search_queries").insert({
        user_id: user.id,
        query,
        range_days: Number(body.range_days ?? 14),
        filters: body.filters ?? {},
        result_count: results.length,
      });
      await Promise.all(results.map(async (result) => {
        const { data: news } = await admin.from("economic_news").insert({
          headline: result.headline,
          source: result.source_name,
          url: result.source_url,
          published_at: result.published_at ?? new Date().toISOString(),
          summary: result.summary,
          category: "economic",
          importance: "medium",
          related_asset: inferAsset(query),
          sentiment: null,
        }).select("id").maybeSingle();
        return admin.from("economic_news_sources").insert({
          news_id: news?.id ?? null,
          headline: result.headline,
          source_name: result.source_name,
          source_url: result.source_url,
          published_at: result.published_at,
          summary: result.summary,
          relevance: inferAsset(query) === "XAUUSD" ? "XAUUSD" : "US macro",
          xauusd_relevance: inferGoldRelevance(query),
          source_verified: result.source_verified,
        });
      }));
      return json({ retrieved_at: new Date().toISOString(), results });
    }

    const days = Math.min(14, Math.max(1, Number(body.range_days ?? 14)));
    const start = new Date();
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    const events = await fetchCalendar(start, end, body.category);
    const stored = await persistCalendar(admin, events);

    const newsQuery = String(body.news_query ?? "US economy latest Reuters Federal Reserve inflation employment");
    let news: unknown[] = [];
    try {
      const payload = await googleSearch(newsQuery);
      news = mapSearchResults(payload);
    } catch {
      news = [];
    }

    return json({
      retrieved_at: new Date().toISOString(),
      range: { from: start.toISOString(), to: end.toISOString(), days },
      released: stored.events.filter((e: Event) => e.status === "released"),
      upcoming: stored.events.filter((e: Event) => e.status === "upcoming"),
      news,
      source_verification: "Verified means the result URL matches a configured trusted-domain allowlist; it does not guarantee the content is correct.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 500);
  }
});

function inferAsset(query: string) {
  const q = query.toLowerCase();
  return /(gold|xauusd|cpi|ppi|pce|fomc|fed|inflation|nfp|employment|jobs)/.test(q) ? "XAUUSD" : null;
}

function inferGoldRelevance(query: string) {
  return inferAsset(query) ? "Potential relevance through USD, Treasury yields, Fed expectations, and risk sentiment." : "No direct Gold relevance inferred.";
}
