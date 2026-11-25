-- EYE brukerkontoer. Kjør hele filen i Supabase → SQL Editor.
-- Prinsipp: hver bruker kan bare se og endre sine egne rader (Row Level Security). Ingen tabeller er åpne for anonyme.
-- Lagrede svar fra «Politikk for dummies» er politiske meninger (GDPR art. 9) og krever eget, uttrykkelig samtykke.

create table if not exists public.profiles (
  id             uuid primary key references auth.users on delete cascade,
  opprettet      timestamptz not null default now(),
  epostvarsler   boolean     not null default false,
  samtykke_svar  timestamptz,                     -- når brukeren ga samtykke til å lagre politiske svar
  sist_sett      timestamptz not null default now()
);

create table if not exists public.folger (
  bruker     uuid not null default auth.uid() references auth.users on delete cascade,
  type       text not null check (type in ('rep', 'parti', 'org')),
  ref        text not null check (ref ~ '^[A-Za-z0-9ÆØÅæøå]{1,20}$'),
  opprettet  timestamptz not null default now(),
  primary key (bruker, type, ref)
);

create table if not exists public.svar (
  bruker  uuid not null default auth.uid() references auth.users on delete cascade,
  tema    text not null check (tema ~ '^[a-z0-9_-]{1,30}$'),
  svar    smallint not null check (svar between -2 and 2),
  viktig  boolean not null default false,
  lagret  timestamptz not null default now(),
  primary key (bruker, tema)
);

alter table public.profiles enable row level security;
alter table public.folger   enable row level security;
alter table public.svar     enable row level security;

-- Ingen tilgang for anonyme i det hele tatt
revoke all on public.profiles, public.folger, public.svar from anon;
grant select, update                 on public.profiles to authenticated;
grant select, insert, delete         on public.folger   to authenticated;
grant select, insert, update, delete on public.svar     to authenticated;
-- Brukeren kan bare endre disse feltene i egen profil
revoke update on public.profiles from authenticated;
grant update (epostvarsler, samtykke_svar, sist_sett) on public.profiles to authenticated;

drop policy if exists "egen profil les" on public.profiles;
drop policy if exists "egen profil endre" on public.profiles;
create policy "egen profil les"   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "egen profil endre" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "egne følger" on public.folger;
create policy "egne følger" on public.folger for all to authenticated
  using (bruker = (select auth.uid())) with check (bruker = (select auth.uid()));

drop policy if exists "egne svar les" on public.svar;
drop policy if exists "egne svar slett" on public.svar;
drop policy if exists "egne svar lagre" on public.svar;
drop policy if exists "egne svar endre" on public.svar;
create policy "egne svar les"   on public.svar for select to authenticated using (bruker = (select auth.uid()));
create policy "egne svar slett" on public.svar for delete to authenticated using (bruker = (select auth.uid()));
-- Lagring krever samtykke
create policy "egne svar lagre" on public.svar for insert to authenticated with check (
  bruker = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.samtykke_svar is not null));
create policy "egne svar endre" on public.svar for update to authenticated using (bruker = (select auth.uid())) with check (
  bruker = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.samtykke_svar is not null));

-- Profil opprettes automatisk ved første innlogging
create or replace function public.ny_bruker() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists ny_bruker on auth.users;
create trigger ny_bruker after insert on auth.users for each row execute function public.ny_bruker();

-- Trekker brukeren samtykket, slettes alle lagrede svar med en gang
create or replace function public.trekk_samtykke() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if old.samtykke_svar is not null and new.samtykke_svar is null then
    delete from public.svar where bruker = new.id;
  end if;
  return new;
end $$;
drop trigger if exists trekk_samtykke on public.profiles;
create trigger trekk_samtykke after update of samtykke_svar on public.profiles for each row execute function public.trekk_samtykke();

-- Maks 500 ting å følge per bruker (vern mot misbruk)
create or replace function public.maks_folger() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.folger where bruker = new.bruker) >= 500 then
    raise exception 'Du kan følge maks 500 ting';
  end if;
  return new;
end $$;
drop trigger if exists maks_folger on public.folger;
create trigger maks_folger before insert on public.folger for each row execute function public.maks_folger();

-- «Slett kontoen min»: fjerner brukeren og alt som hører til (cascade)
create or replace function public.slett_meg() returns void
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'ikke innlogget'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.slett_meg() from public, anon;
grant execute on function public.slett_meg() to authenticated;
revoke all on function public.ny_bruker(), public.trekk_samtykke(), public.maks_folger() from public, anon, authenticated;
