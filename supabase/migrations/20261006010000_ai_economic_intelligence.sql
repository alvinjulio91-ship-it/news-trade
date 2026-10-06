alter table public.economic_events
  add column if not exists category text,
  add column if not exists related_asset text;

create table if not exists public.economic_event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.economic_events(id) on delete cascade,
  source_name text not null,
  source_url text not null,
  source_type text not null default 'web',
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  source_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.economic_event_history (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.economic_events(id) on delete cascade,
  release_date timestamptz not null,
  previous numeric,
  forecast numeric,
  actual numeric,
  surprise numeric,
  gold_reaction text,
  source_name text,
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.economic_event_indicators (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.economic_events(id) on delete cascade,
  indicator_name text not null,
  indicator_code text,
  relationship text not null default 'mixed',
  latest_value numeric,
  previous_value numeric,
  latest_date timestamptz,
  surprise numeric,
  direction text not null default 'neutral',
  relevance numeric(5,2) not null default 0,
  source_name text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.economic_event_scenarios (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.economic_events(id) on delete cascade,
  scenario_type text not null check (scenario_type in ('above_forecast','near_forecast','below_forecast')),
  expected_value text,
  confidence numeric(5,2) not null default 0,
  reasoning text not null,
  supporting_factors jsonb not null default '[]'::jsonb,
  counter_factors jsonb not null default '[]'::jsonb,
  gold_impact text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, scenario_type)
);

create table if not exists public.economic_search_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  range_days integer not null default 14,
  filters jsonb not null default '{}'::jsonb,
  result_count integer not null default 0,
  searched_at timestamptz not null default now()
);

create table if not exists public.economic_news_sources (
  id uuid primary key default gen_random_uuid(),
  news_id uuid references public.economic_news(id) on delete cascade,
  event_id uuid references public.economic_events(id) on delete set null,
  headline text not null,
  source_name text not null,
  source_url text not null,
  published_at timestamptz,
  summary text,
  relevance text,
  xauusd_relevance text,
  source_verified boolean not null default false,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists economic_event_sources_event_id_idx on public.economic_event_sources(event_id);
create index if not exists economic_event_history_event_id_idx on public.economic_event_history(event_id, release_date desc);
create index if not exists economic_event_indicators_event_id_idx on public.economic_event_indicators(event_id, relevance desc);
create index if not exists economic_event_scenarios_event_id_idx on public.economic_event_scenarios(event_id);
create index if not exists economic_search_queries_user_id_idx on public.economic_search_queries(user_id, searched_at desc);
create index if not exists economic_news_sources_event_id_idx on public.economic_news_sources(event_id, published_at desc);

alter table public.economic_event_sources enable row level security;
alter table public.economic_event_history enable row level security;
alter table public.economic_event_indicators enable row level security;
alter table public.economic_event_scenarios enable row level security;
alter table public.economic_search_queries enable row level security;
alter table public.economic_news_sources enable row level security;

create policy "economic_event_sources_read" on public.economic_event_sources for select to authenticated using (true);
create policy "economic_event_history_read" on public.economic_event_history for select to authenticated using (true);
create policy "economic_event_indicators_read" on public.economic_event_indicators for select to authenticated using (true);
create policy "economic_event_scenarios_read" on public.economic_event_scenarios for select to authenticated using (true);
create policy "economic_news_sources_read" on public.economic_news_sources for select to authenticated using (true);

create policy "economic_search_queries_select_own" on public.economic_search_queries for select to authenticated using (auth.uid() = user_id);
create policy "economic_search_queries_insert_own" on public.economic_search_queries for insert to authenticated with check (auth.uid() = user_id);
create policy "economic_search_queries_delete_own" on public.economic_search_queries for delete to authenticated using (auth.uid() = user_id);

do $$
declare t text;
begin
  foreach t in array array[
    'economic_event_sources','economic_event_history','economic_event_indicators',
    'economic_event_scenarios','economic_search_queries','economic_news_sources'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
