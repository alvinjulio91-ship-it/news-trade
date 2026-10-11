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

type HistoricalStats = { above: number; below: number; near: number; samples: number; recent: string[] };

async function buildScenarios(event: Event, indicators: Indicator[], history: HistoricalStats) {
  const relevant = indicators.filter((x) => !event.event_name || x.event_name.toLowerCase() === event.event_name.toLowerCase() || x.event_name.toLowerCase().includes(event.event_name.toLowerCase().split(" ")[0]));
  const aboveSignals = relevant.filter((x) => ["supports_above", "above_forecast", "supports_upside"].includes((x.relationship ?? "").toLowerCase()));
  const belowSignals = relevant.filter((x) => ["supports_below", "below_forecast", "supports_downside"].includes((x.relationship ?? "").toLowerCase()));
  const evidenceNames = relevant.slice(0, 8).map((x) => x.indicator_name);
  const sampleText = history.samples
    ? `Historical outcomes for this event: above ${history.above}/${history.samples}, below ${history.below}/${history.samples}, near ${history.near}/${history.samples} across ${history.samples} stored releases.`
    : "No comparable historical actual-versus-forecast records are stored for this event yet.";
  const context = [
    sampleText,
    evidenceNames.length ? `Available context indicators: ${evidenceNames.join(", ")}.` : "No related leading indicators were available.",
    history.recent.length ? `Recent historical outcomes: ${history.recent.join(", ")}.` : "",
  ].filter(Boolean).join(" ");
  if (!history.samples && relevant.length === 0) {
    return [
      buildScenario(event, "above_forecast", 33, "Insufficient evidence. No historical surprise sample or related indicator is available.", [], []),
      buildScenario(event, "near_forecast", 34, "Insufficient evidence. No historical surprise sample or related indicator is available.", [], []),
      buildScenario(event, "below_forecast", 33, "Insufficient evidence. No historical surprise sample or related indicator is available.", [], []),
    ];
  }

  const key = Deno.env.get("GEMINI_API_KEY");
  if (key) {
    // This function is deliberately evidence-constrained: the model may summarize supplied data,
    // but it must not invent consensus values, historical observations, or source citations.
    return generateAIPrediction(event, relevant, history, key).catch(() => fallbackScenarios(event, relevant, history, context));
  }
  return fallbackScenarios(event, relevant, history, context, aboveSignals, belowSignals);
}

function fallbackScenarios(
  event: Event,
  indicators: Indicator[],
  history: HistoricalStats,
  context: string,
  aboveSignals = indicators.filter((x) => ["supports_above", "above_forecast", "supports_upside"].includes((x.relationship ?? "").toLowerCase())),
  belowSignals = indicators.filter((x) => ["supports_below", "below_forecast", "supports_downside"].includes((x.relationship ?? "").toLowerCase())),
) {
  if (!history.samples) {
    const noHistory = "No historical surprise sample is available; directional evidence is too weak for a reliable estimate. " + context;
    return [
      buildScenario(event, "above_forecast", 33, noHistory, aboveSignals.map((x) => x.indicator_name), belowSignals.map((x) => x.indicator_name)),
      buildScenario(event, "near_forecast", 34, noHistory, indicators.slice(0, 4).map((x) => x.indicator_name), []),
      buildScenario(event, "below_forecast", 33, noHistory, belowSignals.map((x) => x.indicator_name), aboveSignals.map((x) => x.indicator_name)),
    ];
  }
  const above = history.above + 1 + Math.min(aboveSignals.length, 2);
  const below = history.below + 1 + Math.min(belowSignals.length, 2);
  const near = history.near + 1;
  const sum = above + below + near;
  const score = (n: number) => Math.round((n / sum) * 100);
  const scores = [score(above), score(near), score(below)];
  scores[1] += 100 - scores.reduce((a, b) => a + b, 0);
  const note = "Baseline estimate uses stored actual-versus-forecast history and explicit indicator relationships only. It is not a calibrated probability. " + context;
  return [
    buildScenario(event, "above_forecast", scores[0], note, [...history.recent.slice(0, 3), ...aboveSignals.map((x) => x.indicator_name)].slice(0, 6), belowSignals.map((x) => x.indicator_name).slice(0, 4)),
    buildScenario(event, "near_forecast", scores[1], note, history.recent.slice(0, 3), []),
    buildScenario(event, "below_forecast", scores[2], note, [...history.recent.slice(0, 3), ...belowSignals.map((x) => x.indicator_name)].slice(0, 6), aboveSignals.map((x) => x.indicator_name).slice(0, 4)),
  ];
}

async function generateAIPrediction(event: Event, indicators: Indicator[], history: HistoricalStats, key: string) {
  const prompt = {
    task: "Estimate the tendency of an upcoming US macroeconomic release versus its consensus forecast. This is a research scenario, not a trading instruction.",
    rules: [
      "Use only the supplied event, historical surprise counts, and indicator observations.",
      "Do not invent actual, forecast, release dates, sources, or observations.",
      "For a missing forecast or weak evidence, favor near_forecast and explain the limitation.",
      "Return scores for above_forecast, near_forecast, and below_forecast that sum to 100; scores are relative model scores, not calibrated probabilities.",
      "Explain what supports and contradicts each scenario in concise language.",
      "Keep Gold impact conditional: the market response also depends on core components, revisions, USD, Treasury yields, Fed expectations, and positioning.",
    ],
    event: { name: event.event_name, category: event.category, event_time: event.event_time, previous: event.previous, consensus_forecast: event.forecast },
    historical_surprises: history,
    indicators: indicators.map((x) => ({
      name: x.indicator_name, latest_value: x.latest_value, previous_value: x.previous_value,
      latest_date: x.latest_date, relationship: x.relationship, direction: x.direction,
      source_name: x.source_name, source_url: x.source_url,
    })),
    required_json: {
      scenarios: [
        { scenario_type: "above_forecast", score: 33, reasoning: "brief evidence-based explanation", supporting_factors: ["factor"], counter_factors: ["factor"] },
        { scenario_type: "near_forecast", score: 34, reasoning: "brief evidence-based explanation", supporting_factors: ["factor"], counter_factors: ["factor"] },
        { scenario_type: "below_forecast", score: 33, reasoning: "brief evidence-based explanation", supporting_factors: ["factor"], counter_factors: ["factor"] },
      ],
    },
  };
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: JSON.stringify(prompt) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });
  if (!response.ok) throw new Error("Gemini prediction request failed (" + response.status + ").");
  const payload = await response.json();
  const raw = payload?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  const clean = raw.startsWith("```json") ? raw.slice(7).replace(/```$/, "").trim() : raw.replace(/```$/, "").trim();
  const parsed = JSON.parse(clean);
  const rows = Array.isArray(parsed.scenarios) ? parsed.scenarios : [];
  const expected = ["above_forecast", "near_forecast", "below_forecast"];
  const normalized = expected.map((type) => {
    const row = rows.find((x: Record<string, unknown>) => x.scenario_type === type);
    const score = Math.max(0, Math.min(100, Number(row?.score ?? 0)));
    return {
      ...buildScenario(event, type as "above_forecast" | "near_forecast" | "below_forecast", score,
        String(row?.reasoning ?? "Evidence is limited."), stringArray(row?.supporting_factors), stringArray(row?.counter_factors)),
    };
  });
  const total = normalized.reduce((sum, x) => sum + x.confidence, 0) || 1;
  normalized.forEach((x) => { x.confidence = Math.round((x.confidence / total) * 100); });
  normalized[1].confidence += 100 - normalized.reduce((sum, x) => sum + x.confidence, 0);
  return normalized;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((x) => String(x)).slice(0, 6) : [];
}

async function historicalStats(admin: ReturnType<typeof createClient>, event: Event): Promise<HistoricalStats> {
  const { data } = await admin.from("economic_events")
    .select("id,event_name,event_time,forecast,actual,status")
    .ilike("event_name", event.event_name)
    .eq("status", "released")
    .neq("id", event.id ?? "")
    .order("event_time", { ascending: false })
    .limit(12);
  const rows = (data ?? []).filter((x) => x.forecast !== null && x.actual !== null);
  const stats: HistoricalStats = { above: 0, below: 0, near: 0, samples: rows.length, recent: [] };
  for (const row of rows) {
    const actual = Number(row.actual);
    const forecast = Number(row.forecast);
    const type = actual > forecast ? "above" : actual < forecast ? "below" : "near";
    stats[type]++;
    stats.recent.push(type + " (" + String(row.event_time).slice(0, 10) + ")");
  }
  return stats;
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
  const genericUrl = Deno.env.get("ECONOMIC_DATA_API_URL");
  const provider = Deno.env.get("ECONOMIC_DATA_API_PROVIDER") ?? "generic";
  const genericKey = Deno.env.get("ECONOMIC_DATA_API_KEY");
  const tradingEconomicsKey = Deno.env.get("TRADING_ECONOMICS_API_KEY");

  if (tradingEconomicsKey) {
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    const teUrl = new URL("https://api.tradingeconomics.com/calendar/country/united%20states/" + from + "/" + to);
    teUrl.searchParams.set("c", tradingEconomicsKey);
    teUrl.searchParams.set("f", "json");
    const response = await fetch(teUrl.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Trading Economics calendar request failed (" + response.status + ").");
    const payload = await response.json();
    const rawEvents = Array.isArray(payload) ? payload : [];
    const mapped = rawEvents.map((x: Record<string, unknown>) => {
      const importanceNumber = numeric(x.Importance) ?? 1;
      const importance = importanceNumber >= 3 ? "high" : importanceNumber >= 2 ? "medium" : "low";
      const categoryName = String(x.Category ?? "All");
      const eventName = String(x.Event ?? "");
      return {
        event_name: eventName,
        country: String(x.Country ?? "United States"),
        currency: x.Currency ? String(x.Currency) : "USD",
        event_time: String(x.Date ?? ""),
        importance,
        previous: numeric(x.Previous),
        forecast: numeric(x.Forecast ?? x.TEForecast),
        actual: numeric(x.Actual),
        status: undefined,
        category: normalizeCategory(categoryName + " " + eventName),
        related_asset: "XAUUSD",
        source_name: x.Source ? String(x.Source) : undefined,
        source_url: x.SourceURL ? String(x.SourceURL) : undefined,
        indicators: [],
      } satisfies Event & { source_name?: string; source_url?: string; indicators: unknown[] };
    }).filter((e: Event) => e.event_name && e.event_time);
    return category && category !== "All"
      ? mapped.filter((e: Event) => normalizeCategory((e.category ?? "") + " " + e.event_name) === normalizeCategory(category))
      : mapped;
  }

  if (!genericUrl) throw new Error("Economic calendar provider is not configured. Add TRADING_ECONOMICS_API_KEY or ECONOMIC_DATA_API_URL to Supabase Edge Function secrets.");
  const target = new URL(genericUrl);
  target.searchParams.set("country", "US");
  target.searchParams.set("from", start.toISOString());
  target.searchParams.set("to", end.toISOString());
  target.searchParams.set("limit", "250");
  if (category && category !== "All") target.searchParams.set("category", category);
  if (genericKey) target.searchParams.set("api_key", genericKey);
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

function normalizeCategory(value: string) {
  const x = value.toLowerCase();
  if (/cpi|consumer price|ppi|producer price|pce|inflation/.test(x)) return "Inflation";
  if (/non farm|payroll|employment|unemployment|jobless|claims|adp|jolts|wage/.test(x)) return "Employment";
  if (/fomc|fed|interest rate|federal funds/.test(x)) return "Fed";
  if (/gdp/.test(x)) return "GDP";
  if (/pmi|manufacturing|ism/.test(x)) return "PMI";
  if (/retail|consumer confidence|consumer sentiment|personal spending|personal income/.test(x)) return "Consumer";
  if (/housing|home|building permit|housing starts/.test(x)) return "Housing";
  return "All";
}

const FRED_SERIES: Record<string, { name: string; code: string }[]> = {
  Inflation: [
    { name: "CPI", code: "CPIAUCSL" },
    { name: "Core CPI", code: "CPILFESL" },
    { name: "PPI", code: "PPIFIS" },
  ],
  Employment: [
    { name: "Nonfarm Payrolls", code: "PAYEMS" },
    { name: "Unemployment Rate", code: "UNRATE" },
    { name: "Average Hourly Earnings", code: "CES0500000003" },
    { name: "Initial Jobless Claims", code: "ICSA" },
    { name: "Continuing Claims", code: "CCSA" },
  ],
  Consumer: [
    { name: "Retail Sales", code: "RSAFS" },
    { name: "Personal Income", code: "PI" },
    { name: "Personal Consumption Expenditures", code: "PCE" },
  ],
  Retail: [
    { name: "Retail Sales", code: "RSAFS" },
    { name: "Personal Consumption Expenditures", code: "PCE" },
  ],
  GDP: [
    { name: "Real GDP", code: "GDPC1" },
    { name: "Personal Income", code: "PI" },
  ],
  Fed: [
    { name: "Federal Funds Rate", code: "FEDFUNDS" },
  ],
};

async function fetchFredIndicators(category: string | null, eventName: string): Promise<Indicator[]> {
  const key = Deno.env.get("FRED_API_KEY");
  if (!key || !category || !FRED_SERIES[category]) return [];
  const series = FRED_SERIES[category];
  const results: Indicator[] = [];
  for (const item of series) {
    try {
      const params = new URLSearchParams({
        series_id: item.code,
        api_key: key,
        file_type: "json",
        sort_order: "desc",
        limit: "2",
      });
      const response = await fetch("https://api.stlouisfed.org/fred/series/observations?" + params.toString());
      if (!response.ok) continue;
      const payload = await response.json();
      const obs = Array.isArray(payload.observations) ? payload.observations.filter((x: Record<string, unknown>) => x.value !== ".") : [];
      const latest = obs[0];
      const previous = obs[1];
      if (!latest) continue;
      const latestValue = numeric(latest.value);
      const previousValue = numeric(previous?.value);
      const delta = latestValue != null && previousValue != null ? latestValue - previousValue : null;
      results.push({
        event_name: eventName,
        indicator_name: item.name,
        indicator_code: item.code,
        relationship: "mixed",
        latest_value: latestValue,
        previous_value: previousValue,
        latest_date: latest.date ? String(latest.date) : null,
        surprise: null,
        direction: delta == null ? "neutral" : delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral",
        relevance: 70,
        source_name: "Federal Reserve Bank of St. Louis (FRED)",
        source_url: "https://fred.stlouisfed.org/series/" + item.code,
      });
    } catch {
      // One unavailable series must not block the rest of the event refresh.
    }
  }
  return results;
}

function scenarioIndicators(event: Event, rows: Record<string, unknown>[]): Indicator[] {
  return rows.map((x) => ({
    event_name: event.event_name,
    indicator_name: String(x.indicator_name ?? x.name ?? "Related indicator"),
    indicator_code: x.indicator_code ? String(x.indicator_code) : undefined,
    relationship: x.relationship ? String(x.relationship) : "mixed",
    latest_value: numeric(x.latest_value),
    previous_value: numeric(x.previous_value),
    latest_date: x.latest_date ? String(x.latest_date) : null,
    surprise: numeric(x.surprise),
    direction: String(x.direction ?? "neutral"),
    relevance: numeric(x.relevance) ?? 0,
    source_name: x.source_name ? String(x.source_name) : undefined,
    source_url: x.source_url ? String(x.source_url) : undefined,
  }));
}

async function persistCalendar(admin: ReturnType<typeof createClient>, events: (Event & { source_name?: string; source_url?: string; indicators?: unknown[] })[]) {
  const now = new Date();
  const normalized = events
    .filter((e) => e.event_name && e.event_time)
    .map((e) => ({ ...e, status: new Date(e.event_time).getTime() <= now.getTime() || e.actual !== null ? "released" : "upcoming" }));
  if (!normalized.length) return { events: [], count: 0 };

  const { data, error } = await admin.from("economic_events").upsert(
    normalized.map(({ source_name, source_url, indicators, ...event }) => event),
    { onConflict: "event_name,event_time" },
  ).select("*");
  if (error) throw error;
  const rows = data ?? [];

  for (const event of rows) {
    const incoming = normalized.find((x) => x.event_name === event.event_name && x.event_time === event.event_time);
    if (!incoming) continue;

    if (incoming.source_name && incoming.source_url) {
      await admin.from("economic_event_sources").upsert({
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

    let indicators = Array.isArray(incoming.indicators) ? incoming.indicators as Record<string, unknown>[] : [];
    if (event.status === "upcoming" && indicators.length === 0) {
      indicators = await fetchFredIndicators(event.category ?? null, event.event_name) as unknown as Record<string, unknown>[];
    }
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
      const history = await historicalStats(admin, event);
      const scenarios = await buildScenarios(event, (indicatorRows ?? []).map((x) => ({ ...x, event_name: event.event_name })), history);
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
    let news_error: string | null = null;
    try {
      const payload = await googleSearch(newsQuery);
      news = mapSearchResults(payload);
    } catch (error) {
      news_error = error instanceof Error ? error.message : "News search unavailable.";
    }

    return json({
      retrieved_at: new Date().toISOString(),
      range: { from: start.toISOString(), to: end.toISOString(), days },
      released: stored.events.filter((e: Event) => e.status === "released"),
      upcoming: stored.events.filter((e: Event) => e.status === "upcoming"),
      news,
      news_error,
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
