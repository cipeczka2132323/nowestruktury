-- Wklej całość w Supabase → SQL Editor → Run (jeden raz).

-- ===== KONTA =====
-- Członek = konto, które ma wiersz w profiles. Wiersze dodaje tylko admin,
-- więc ktoś, kto zarejestruje się przez API, nie ma dostępu do niczego.
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  nick text unique not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create function is_member() returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid()) $$;
create function is_admin() returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid() and is_admin) $$;

alter table profiles enable row level security;
create policy "czytaj profile" on profiles for select using (is_member() or id = auth.uid());
create policy "admin zarzadza" on profiles for all using (is_admin()) with check (is_admin());

-- ===== WIKI =====
create table wikis (
  id bigint generated always as identity primary key,
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  created_by uuid references profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create table wiki_pages (
  id bigint generated always as identity primary key,
  wiki_id bigint not null references wikis on delete cascade,
  title text not null check (length(title) between 1 and 120),
  content text not null default '',
  updated_by uuid references profiles on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (wiki_id, title)
);
alter table wikis enable row level security;
alter table wiki_pages enable row level security;
create policy "czytaj" on wikis for select using (is_member());
create policy "dodaj" on wikis for insert with check (is_member() and created_by = auth.uid());
create policy "usun" on wikis for delete using (is_admin());
create policy "czytaj" on wiki_pages for select using (is_member());
create policy "dodaj" on wiki_pages for insert with check (is_member() and updated_by = auth.uid());
create policy "edytuj" on wiki_pages for update using (is_member()) with check (is_member() and updated_by = auth.uid());
create policy "usun" on wiki_pages for delete using (is_admin());

-- puste wiki na start
insert into wikis (slug, name, created_by) values
  ('browiki', 'BroWiki', null),
  ('kwadrat-wiki', 'Kwadrat Wiki', null),
  ('art-deco-wiki', 'Art Deco Wiki', null),
  ('noran-wiki', 'Noran Wiki', null);

-- ===== BIBLIOTEKA =====
create table library_links (
  id bigint generated always as identity primary key,
  url text not null check (url ~* '^https?://'),
  title text not null check (length(title) between 1 and 120),
  description text not null default '',
  image_url text,
  created_by uuid references profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table library_links enable row level security;
create policy "czytaj" on library_links for select using (is_member());
create policy "dodaj" on library_links for insert with check (is_member() and created_by = auth.uid());
create policy "usun" on library_links for delete using (created_by = auth.uid() or is_admin());

-- ===== FORUM =====
create table forum_threads (
  id bigint generated always as identity primary key,
  title text not null check (length(title) between 1 and 150),
  body text not null default '',
  image_url text,
  created_by uuid references profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create table forum_posts (
  id bigint generated always as identity primary key,
  thread_id bigint not null references forum_threads on delete cascade,
  body text not null default '',
  image_url text,
  created_by uuid references profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table forum_threads enable row level security;
alter table forum_posts enable row level security;
create policy "czytaj" on forum_threads for select using (is_member());
create policy "dodaj" on forum_threads for insert with check (is_member() and created_by = auth.uid());
create policy "usun" on forum_threads for delete using (created_by = auth.uid() or is_admin());
create policy "czytaj" on forum_posts for select using (is_member());
create policy "dodaj" on forum_posts for insert with check (is_member() and created_by = auth.uid());
create policy "usun" on forum_posts for delete using (created_by = auth.uid() or is_admin());

-- ===== ZDJĘCIA =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
create policy "czlonkowie wrzucaja" on storage.objects for insert
  with check (bucket_id = 'images' and is_member());
create policy "admin usuwa" on storage.objects for delete
  using (bucket_id = 'images' and is_admin());

-- ===== WSPÓLNY TELEWIZOR (YouTube) =====
-- jeden wiersz = to, co teraz leci u wszystkich; started_at z zegara serwera pozwala zsynchronizować widzów
create table tv_state (
  id int primary key default 1 check (id = 1),
  video_id text check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text,
  started_at timestamptz,
  set_by uuid references profiles on delete set null
);
insert into tv_state (id) values (1);
create table tv_queue (
  id bigint generated always as identity primary key,
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null default '' check (length(title) <= 200),
  added_by uuid references profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table tv_state enable row level security;
alter table tv_queue enable row level security;
create policy "czytaj" on tv_state for select using (is_member());
-- tv_state zmieniamy tylko przez funkcje poniżej
create policy "czytaj" on tv_queue for select using (is_member());
create policy "dodaj" on tv_queue for insert with check (is_member() and added_by = auth.uid());
create policy "usun" on tv_queue for delete using (added_by = auth.uid() or is_admin());

create function server_now() returns timestamptz language sql stable as $$ select now() $$;

-- puść film od razu u wszystkich
create function tv_play(vid text, ttl text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'Brak dostępu'; end if;
  update tv_state set video_id = vid, title = left(coalesce(ttl, ''), 200), started_at = now(), set_by = auth.uid() where id = 1;
end $$;

-- następny z kolejki; "expected" = film, który się skończył/pomijamy.
-- Gdy kilku widzów wywoła to naraz, zadziała tylko pierwszy (reszta widzi już inny film).
create function tv_next(expected text) returns void language plpgsql security definer set search_path = public as $$
declare q tv_queue;
begin
  if not is_member() then raise exception 'Brak dostępu'; end if;
  perform 1 from tv_state where id = 1 and video_id is not distinct from expected for update;
  if not found then return; end if;
  select * into q from tv_queue order by id limit 1 for update skip locked;
  if found then
    delete from tv_queue where id = q.id;
    update tv_state set video_id = q.video_id, title = q.title, started_at = now(), set_by = q.added_by where id = 1;
  else
    update tv_state set video_id = null, title = null, started_at = null, set_by = null where id = 1;
  end if;
end $$;

-- powiadomienia na żywo o zmianach (Supabase Realtime)
alter publication supabase_realtime add table tv_state, tv_queue;
