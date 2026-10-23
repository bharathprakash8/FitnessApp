-- App language per person (owner, 23 Oct 2026): English or Kannada. The person sets it on Me;
-- AI insights are written in it too.
alter table public.profiles
  add column language text not null default 'en' check (language in ('en', 'kn'));
