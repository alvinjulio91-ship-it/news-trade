create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  asset_type text not null,
  created_at timestamptz not null default now(),
  unique (user_id, symbol, asset_type)
);

create table if not exists public.crypto_assets (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.market_prices (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  price numeric(24,8),
  change_24h numeric(12,4),
  high_24h numeric(24,8),
  low_24h numeric(24,8),
  volume numeric(30,8),
  updated_at timestamptz not null default now()
);

create table if not exists public.economic_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  country text not null,
  currency text,
  event_time timestamptz not null,
  importance text not null default 'medium',
  previous numeric,
  forecast numeric,
  actual numeric,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists public.economic_news (
  id uuid primary key default gen_random_uuid(),
  headline text not null,
  source text not null,
  url text,
  published_at timestamptz not null,
  summary text,
  category text,
  importance text not null default 'medium',
  related_asset text,
  sentiment text,
  created_at timestamptz not null default now()
);

create table if not exists public.news_analysis (
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null references public.economic_news(id) on delete cascade,
  bias text,
  impact text,
  confidence numeric(5,2),
  reasoning text,
  created_at timestamptz not null default now()
);

create table if not exists public.market_analysis (
  id uuid primary key default gen_random_uuid(),
  asset text not null,
  bias text,
  confidence numeric(5,2),
  factors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Jakarta',
  theme text not null default 'dark',
  compact_mode boolean not null default true,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  asset_type text not null,
  target_price numeric(24,8) not null,
  condition text not null check (condition in ('above','below')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists watchlists_user_id_idx on public.watchlists(user_id);
create index if not exists market_prices_symbol_idx on public.market_prices(symbol);
create index if not exists economic_events_event_time_idx on public.economic_events(event_time);
create index if not exists economic_news_published_at_idx on public.economic_news(published_at desc);
create index if not exists news_analysis_news_id_idx on public.news_analysis(news_id);
create index if not exists market_analysis_asset_idx on public.market_analysis(asset);
create index if not exists price_alerts_user_id_idx on public.price_alerts(user_id);

alter table public.profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.crypto_assets enable row level security;
alter table public.market_prices enable row level security;
alter table public.economic_events enable row level security;
alter table public.economic_news enable row level security;
alter table public.news_analysis enable row level security;
alter table public.market_analysis enable row level security;
alter table public.user_preferences enable row level security;
alter table public.price_alerts enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "watchlists_select_own" on public.watchlists;
create policy "watchlists_select_own" on public.watchlists for select to authenticated using (auth.uid() = user_id);
drop policy if exists "watchlists_insert_own" on public.watchlists;
create policy "watchlists_insert_own" on public.watchlists for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "watchlists_update_own" on public.watchlists;
create policy "watchlists_update_own" on public.watchlists for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "watchlists_delete_own" on public.watchlists;
create policy "watchlists_delete_own" on public.watchlists for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "crypto_assets_read" on public.crypto_assets;
create policy "crypto_assets_read" on public.crypto_assets for select to authenticated using (true);
drop policy if exists "market_prices_read" on public.market_prices;
create policy "market_prices_read" on public.market_prices for select to authenticated using (true);
drop policy if exists "economic_events_read" on public.economic_events;
create policy "economic_events_read" on public.economic_events for select to authenticated using (true);
drop policy if exists "economic_news_read" on public.economic_news;
create policy "economic_news_read" on public.economic_news for select to authenticated using (true);
drop policy if exists "news_analysis_read" on public.news_analysis;
create policy "news_analysis_read" on public.news_analysis for select to authenticated using (true);
drop policy if exists "market_analysis_read" on public.market_analysis;
create policy "market_analysis_read" on public.market_analysis for select to authenticated using (true);

drop policy if exists "preferences_select_own" on public.user_preferences;
create policy "preferences_select_own" on public.user_preferences for select to authenticated using (auth.uid() = user_id);
drop policy if exists "preferences_insert_own" on public.user_preferences;
create policy "preferences_insert_own" on public.user_preferences for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "preferences_update_own" on public.user_preferences;
create policy "preferences_update_own" on public.user_preferences for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "preferences_delete_own" on public.user_preferences;
create policy "preferences_delete_own" on public.user_preferences for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "price_alerts_select_own" on public.price_alerts;
create policy "price_alerts_select_own" on public.price_alerts for select to authenticated using (auth.uid() = user_id);
drop policy if exists "price_alerts_insert_own" on public.price_alerts;
create policy "price_alerts_insert_own" on public.price_alerts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "price_alerts_update_own" on public.price_alerts;
create policy "price_alerts_update_own" on public.price_alerts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "price_alerts_delete_own" on public.price_alerts;
create policy "price_alerts_delete_own" on public.price_alerts for delete to authenticated using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email,''),'@',1)))
  on conflict (id) do update set email = excluded.email;
  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.touch_user_preferences()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists set_user_preferences_updated_at on public.user_preferences;
create trigger set_user_preferences_updated_at before update on public.user_preferences for each row execute procedure public.touch_user_preferences();

create or replace function public.touch_price_alerts()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists set_price_alerts_updated_at on public.price_alerts;
create trigger set_price_alerts_updated_at before update on public.price_alerts for each row execute procedure public.touch_price_alerts();

create or replace function public.protect_profile_identity()
returns trigger language plpgsql as $$
begin
  new.id = old.id;
  new.email = old.email;
  new.created_at = old.created_at;
  return new;
end;
$$;
drop trigger if exists protect_profile_identity_before_update on public.profiles;
create trigger protect_profile_identity_before_update before update on public.profiles for each row execute procedure public.protect_profile_identity();

do $$
declare
  t text;
begin
  foreach t in array array['market_prices','economic_events','economic_news','news_analysis','market_analysis'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
