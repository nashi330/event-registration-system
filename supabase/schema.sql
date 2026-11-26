-- 1. Events Table (Enables multi-event reuse)
create table public.events (
    id uuid primary key default gen_random_uuid (),
    slug text unique not null,
    title text not null,
    description text,
    event_date timestamptz not null,
    venue text not null,
    scanner_pin text not null default '1234',
    visibility text not null default 'public' check (visibility in ('public', 'exclusive')),
    status text not null default 'active' check (status in ('active', 'closed', 'cancelled')),
    created_at timestamptz not null default now()
);

-- 2. Attendees Table
create table public.attendees (
    id uuid primary key default gen_random_uuid (),
    event_id uuid not null references public.events (id) on delete cascade,
    ticket_code text unique not null,
    full_name text not null,
    email text not null,
    organization text not null,
    contact_number text not null,
    status text not null default 'approved' check (status in ('approved', 'pending', 'declined')),
    checked_in boolean not null default false,
    checked_in_at timestamptz,
    created_at timestamptz not null default now(),
    constraint unique_event_email unique (event_id, email)
);

-- Indexes for fast scanner lookups & admin filtering
create index idx_attendees_ticket_code on public.attendees (ticket_code);

create index idx_attendees_event_id on public.attendees (event_id);

-- 3. Enable RLS
alter table public.events enable row level security;

alter table public.attendees enable row level security;

-- Public can view active events
create policy "Public read active events" on public.events for
select using (status = 'active');

-- Admins (authenticated) have full access to events
create policy "Authenticated full access events" on public.events for all using (
    auth.role () = 'authenticated'
);

-- Public can register (insert) into active events
create policy "Public insert attendee" on public.attendees for
insert
with
    check (
        exists (
            select 1
            from public.events
            where
                id = event_id
                    and status = 'active'
        )
    );

-- Authenticated admins have full access to attendees
create policy "Authenticated full access attendees" on public.attendees for all using (
    auth.role () = 'authenticated'
);

-- 4. Secure RPC Function for Gate Staff Scanner (No admin login required, PIN-verified)
create or replace function public.verify_and_checkin(
  p_event_id uuid,
  p_ticket_code text,
  p_scanner_pin text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_valid_pin boolean;
  v_attendee record;
begin
  select exists(
    select 1 from public.events
    where id = p_event_id and scanner_pin = p_scanner_pin and status = 'active'
  ) into v_valid_pin;

  if not v_valid_pin then
    return jsonb_build_object('status', 'unauthorized', 'message', 'Invalid Scanner PIN');
  end if;

  select * into v_attendee
  from public.attendees
  where event_id = p_event_id and ticket_code = p_ticket_code;

  if not found then
    return jsonb_build_object('status', 'invalid', 'message', 'Ticket not found for this event');
  end if;

  if v_attendee.checked_in then
    return jsonb_build_object(
      'status', 'already_checked_in',
      'checked_in_at', v_attendee.checked_in_at,
      'attendee', row_to_json(v_attendee)
    );
  end if;

  update public.attendees
  set checked_in = true, checked_in_at = now()
  where id = v_attendee.id
  returning * into v_attendee;

  return jsonb_build_object(
    'status', 'valid',
    'attendee', row_to_json(v_attendee)
  );
end;
$$;

-- 5. User Profiles & Role-Based Access ('guest' | 'admin')
create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null,
    full_name text,
    role text not null default 'guest' check (role in ('guest', 'admin')),
    created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile (to check role on login)
create policy "Users read own profile" on public.profiles for
select using (auth.uid () = id);

-- Users can update their own profile
create policy "Users update own profile" on public.profiles for
update using (auth.uid () = id);

-- Helper function to check admin role cleanly in RLS
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$select exists ( select 1 from public.profiles where id = auth.uid() and role = 'admin' );$$;
;

-- Automatically create a 'guest' profile when someone signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$ begin insert into public.profiles (id, email, full_name, role) values ( new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'guest' ); return new; end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Tighten admin policies so only role = 'admin' can manage events/all attendees
drop policy if exists "Authenticated full access events" on public.events;

create policy "Admins full access events" on public.events for all using (public.is_admin ());

drop policy if exists "Authenticated full access attendees" on public.attendees;

create policy "Admins full access attendees" on public.attendees for all using (public.is_admin ());

-- Logged-in guests can view their own registered passes
create policy "Guests read own registrations" on public.attendees for
select using (
        auth.uid () is not null
        and email = (
            select email
            from public.profiles
            where
                id = auth.uid ()
        )
    );

-- API role grants required for PostgREST access
grant usage on schema public to anon, authenticated;

grant select on table public.events to anon, authenticated;
grant select, insert, update, delete on table public.events to authenticated;

grant select, insert, update, delete on table public.attendees to authenticated;
grant insert on table public.attendees to anon;

grant select, update on table public.profiles to authenticated;

grant execute on function public.verify_and_checkin(uuid, text, text) to anon, authenticated;