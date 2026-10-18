-- Whether clients get a Google Calendar invite email for this session (set when created).
alter table public.sessions add column send_invite boolean not null default true;
alter table public.session_series add column send_invite boolean not null default true;
