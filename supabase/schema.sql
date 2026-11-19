-- =====================================================================
-- BLEDI FIT – Skema e databazës (Supabase / PostgreSQL)
-- Ekzekutoje të gjithë këtë skedar një herë në: Supabase → SQL Editor → New query → Run
-- Është i sigurt për t'u ekzekutuar përsëri (përdor IF NOT EXISTS / ON CONFLICT).
-- =====================================================================

-- ---------- PROFILI ----------
create table if not exists public.profiles (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  display_name          text not null default 'Bledi',
  start_weight          numeric(5,2) not null default 101.75 check (start_weight between 30 and 300),
  target_weight         numeric(5,2) not null default 90     check (target_weight between 30 and 300),
  height_cm             int  not null default 178  check (height_cm between 120 and 230),
  age                   int  not null default 24   check (age between 14 and 100),
  training_days         int  not null default 4    check (training_days between 0 and 7),
  cardio_minutes        int  not null default 20   check (cardio_minutes between 0 and 120),
  calorie_target        int  not null default 2300 check (calorie_target between 1500 and 4500),
  protein_min           int  not null default 180  check (protein_min between 60 and 300),
  protein_max           int  not null default 190  check (protein_max between 60 and 320),
  training_time         text not null default '17:00–20:00',
  food_preferences      text not null default 'Pulë, vezë, peshk, jogurt grek, oriz, patate dhe perime',
  main_problem          text not null default 'Ngrënie impulsive dhe shtyrja e dietës për nesër',
  timezone              text not null default 'Europe/Belgrade',
  remind_morning        boolean not null default true,
  remind_afternoon      boolean not null default true,
  remind_evening        boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint protein_range check (protein_max >= protein_min)
);

-- Krijo profilin automatikisht kur regjistrohet përdoruesi
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- PESHA (asnjëherë nuk fshihet automatikisht) ----------
create table if not exists public.weights (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kg          numeric(5,2) not null check (kg between 30 and 300),
  measured_at timestamptz not null default now(),
  note        text check (char_length(note) <= 200)
);
create index if not exists weights_user_time on public.weights (user_id, measured_at desc);

-- ---------- USHQIMET (lista e paracaktuar + ushqime personale) ----------
create table if not exists public.foods (
  id            bigserial primary key,
  user_id       uuid references auth.users(id) on delete cascade,  -- NULL = ushqim global
  code          text unique,
  name          text not null check (char_length(name) between 1 and 80),
  kcal          numeric(6,1) not null check (kcal between 0 and 950),   -- për 100 g
  protein       numeric(5,1) not null check (protein between 0 and 100),
  carbs         numeric(5,1) not null check (carbs between 0 and 100),
  fat           numeric(5,1) not null check (fat between 0 and 100),
  portion_grams int  check (portion_grams between 1 and 2000),
  portion_label text check (char_length(portion_label) <= 40),
  source        text not null default 'custom',
  created_at    timestamptz not null default now()
);

-- Vlerat për 100 g sipas USDA FoodData Central (SR Legacy)
insert into public.foods (code, name, kcal, protein, carbs, fat, portion_grams, portion_label, source) values
 ('chicken_breast', 'Gjoks pule (i gatuar, pa lëkurë)', 165, 31.0, 0.0, 3.6, 150, '1 porcion 150 g', 'USDA FoodData Central'),
 ('egg',            'Vezë (e plotë)',                   143, 12.6, 0.7, 9.5,  50, '1 vezë ≈ 50 g',   'USDA FoodData Central'),
 ('tuna',           'Ton në ujë (i kulluar)',           116, 25.5, 0.0, 0.8, 120, '1 kanaçe ≈ 120 g','USDA FoodData Central'),
 ('fish_white',     'Peshk i bardhë (merluc, i gatuar)',105, 22.8, 0.0, 0.9, 150, '1 fileto 150 g',  'USDA FoodData Central'),
 ('greek_yogurt',   'Jogurt grek natyral (2%)',          73, 10.0, 3.9, 1.9, 170, '1 kupë 170 g',    'USDA FoodData Central'),
 ('oats',           'Tërshërë (e thatë)',               379, 13.2, 67.7, 6.5, 50, '½ filxhan 50 g',  'USDA FoodData Central'),
 ('rice',           'Oriz i bardhë (i gatuar)',         130,  2.7, 28.2, 0.3, 200, '1 pjatë 200 g',   'USDA FoodData Central'),
 ('potato',         'Patate (të ziera)',                 87,  1.9, 20.1, 0.1, 200, '2 patate mesatare','USDA FoodData Central'),
 ('banana',         'Banane',                            89,  1.1, 22.8, 0.3, 120, '1 banane ≈ 120 g','USDA FoodData Central'),
 ('vegetables',     'Perime të përziera (të ziera)',     65,  2.9, 13.1, 0.2, 150, '1 pjatë 150 g',   'USDA FoodData Central'),
 ('bread',          'Bukë e bardhë',                    266,  7.6, 50.6, 3.3,  30, '1 fetë ≈ 30 g',   'USDA FoodData Central')
on conflict (code) do update set
  name = excluded.name, kcal = excluded.kcal, protein = excluded.protein, carbs = excluded.carbs,
  fat = excluded.fat, portion_grams = excluded.portion_grams, portion_label = excluded.portion_label, source = excluded.source;

-- ---------- REGJISTRIMI I USHQIMIT ----------
create table if not exists public.food_logs (
  id        bigserial primary key,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  food_id   bigint references public.foods(id) on delete set null,
  name      text not null check (char_length(name) between 1 and 120),
  grams     numeric(6,1) not null check (grams > 0 and grams <= 3000),
  kcal      numeric(7,1) not null check (kcal >= 0 and kcal <= 10000),
  protein   numeric(6,1) not null default 0 check (protein >= 0),
  carbs     numeric(6,1) not null default 0 check (carbs >= 0),
  fat       numeric(6,1) not null default 0 check (fat >= 0),
  source    text not null default 'database' check (source in ('database','custom','ai_estimate')),
  log_date  date not null,
  eaten_at  timestamptz not null default now()
);
create index if not exists food_logs_user_date on public.food_logs (user_id, log_date);

-- ---------- STËRVITJA DHE KARDIO ----------
create table if not exists public.workout_sessions (
  id            bigserial primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_date  date not null,
  day_key       text not null check (day_key in ('upper_a','lower_a','upper_b','lower_b')),
  done          jsonb not null default '[]'::jsonb,
  completed     boolean not null default false,
  completed_at  timestamptz,
  unique (user_id, session_date)
);

create table if not exists public.cardio_sessions (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_date  date not null,
  minutes       int not null default 20 check (minutes between 0 and 180),
  completed     boolean not null default false,
  primary key (user_id, session_date)
);

-- ---------- LISTA DITORE ----------
create table if not exists public.daily_checklist (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  bike       boolean not null default false,
  food_plan  boolean not null default false,
  protein    boolean not null default false,
  workout    boolean not null default false,
  water      boolean not null default false,
  primary key (user_id, day)
);

-- ---------- CHECK-IN ME AI (uria / energjia) ----------
create table if not exists public.daily_checkins (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day      date not null,
  hunger   smallint check (hunger between 1 and 5),
  energy   smallint check (energy between 1 and 5),
  note     text check (char_length(note) <= 500),
  primary key (user_id, day)
);

-- ---------- NGJARJET "DUA TË HA" (për zbulimin e modeleve) ----------
create table if not exists public.craving_events (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('hungry','craving','already_ate','opened')),
  note        text check (char_length(note) <= 300),
  created_at  timestamptz not null default now()
);
create index if not exists craving_user_time on public.craving_events (user_id, created_at desc);

-- ---------- PUSH ----------
create table if not exists public.push_subscriptions (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create table if not exists public.notification_log (
  user_id  uuid not null references auth.users(id) on delete cascade,
  slot     text not null check (slot in ('morning','afternoon','evening')),
  day      date not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, slot, day)
);

-- ---------- AI COACH ----------
create table if not exists public.ai_messages (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  mode        text not null default 'chat' check (mode in ('chat','craving','checkin','weekly','estimate')),
  content     text not null check (char_length(content) <= 8000),
  created_at  timestamptz not null default now()
);
create index if not exists ai_messages_user_time on public.ai_messages (user_id, created_at desc);

create table if not exists public.ai_reports (
  id            bigserial primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('daily','weekly')),
  period_start  date not null,
  stats         jsonb not null default '{}'::jsonb,
  content       text not null,
  created_at    timestamptz not null default now(),
  unique (user_id, kind, period_start)
);

create table if not exists public.plan_proposals (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  field       text not null check (field in ('calorie_target','protein_min','protein_max','cardio_minutes')),
  old_value   numeric not null,
  new_value   numeric not null,
  reason      text not null,
  status      text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

-- =====================================================================
-- ROW LEVEL SECURITY – çdo përdorues sheh VETËM të dhënat e veta
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.weights            enable row level security;
alter table public.foods              enable row level security;
alter table public.food_logs          enable row level security;
alter table public.workout_sessions   enable row level security;
alter table public.cardio_sessions    enable row level security;
alter table public.daily_checklist    enable row level security;
alter table public.daily_checkins     enable row level security;
alter table public.craving_events     enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log   enable row level security;  -- pa politika: vetëm service role
alter table public.ai_messages        enable row level security;
alter table public.ai_reports         enable row level security;
alter table public.plan_proposals     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles','weights','food_logs','workout_sessions','cardio_sessions',
                           'daily_checklist','daily_checkins','craving_events','push_subscriptions',
                           'ai_messages','ai_reports','plan_proposals']
  loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Ushqimet: globale (user_id NULL) i lexojnë të gjithë; ato personale vetëm pronari
drop policy if exists foods_read on public.foods;
create policy foods_read on public.foods for select to authenticated
  using (user_id is null or user_id = auth.uid());
drop policy if exists foods_write on public.foods;
create policy foods_write on public.foods for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists foods_update on public.foods;
create policy foods_update on public.foods for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists foods_delete on public.foods;
create policy foods_delete on public.foods for delete to authenticated
  using (user_id = auth.uid());
