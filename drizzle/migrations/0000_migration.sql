create type public.app_role as enum ('admin','user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  shop_name text not null default 'Ma boutique',
  owner_name text,
  phone text,
  subscription_until timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());

-- prevent users extending their own subscription
create or replace function public.protect_subscription() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.subscription_until is distinct from old.subscription_until
     and auth.uid() is not null and not public.has_role(auth.uid(),'admin') then
    new.subscription_until := old.subscription_until;
  end if;
  return new;
end $$;
create trigger profiles_protect_sub before update on public.profiles for each row execute function public.protect_subscription();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, owner_name, subscription_until)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), now() + interval '14 days');
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  if (select count(*) from public.user_roles where role = 'admin') = 0 then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  name text not null,
  phone text not null,
  share_token text not null unique default encode(gen_random_bytes(12),'hex'),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
create policy "shop owns customers" on public.customers for all to authenticated using (shop_id = auth.uid()) with check (shop_id = auth.uid());

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind text not null check (kind in ('credit','payment')),
  amount integer not null check (amount > 0),
  products text,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  reminded_at timestamptz
);
create index on public.entries(customer_id, created_at desc);
grant select, insert, update on public.entries to authenticated;
grant all on public.entries to service_role;
alter table public.entries enable row level security;
create policy "shop reads entries" on public.entries for select to authenticated using (shop_id = auth.uid());
create policy "shop inserts entries" on public.entries for insert to authenticated with check (shop_id = auth.uid() and exists(select 1 from public.customers c where c.id = customer_id and c.shop_id = auth.uid()));
create policy "shop updates entries" on public.entries for update to authenticated using (shop_id = auth.uid()) with check (shop_id = auth.uid());
-- entries are immutable except notification timestamps
create or replace function public.lock_entries() returns trigger language plpgsql as $$
begin
  if new.amount <> old.amount or new.kind <> old.kind or new.products is distinct from old.products
     or new.created_at <> old.created_at or new.customer_id <> old.customer_id then
    raise exception 'Une opération enregistrée ne peut pas être modifiée';
  end if;
  return new;
end $$;
create trigger entries_lock before update on public.entries for each row execute function public.lock_entries();

create table public.app_settings (
  id int primary key default 1 check (id = 1),
  monthly_price integer not null default 2000,
  currency text not null default 'FCFA',
  orange_enabled boolean not null default true,
  orange_number text default '',
  moov_enabled boolean not null default true,
  moov_number text default '',
  card_enabled boolean not null default true,
  reminder_days integer not null default 7,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1);
grant select on public.app_settings to anon, authenticated;
grant update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "settings readable" on public.app_settings for select to anon, authenticated using (true);
create policy "admin updates settings" on public.app_settings for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  method text not null check (method in ('orange','moov','card')),
  amount integer not null,
  months integer not null default 1 check (months between 1 and 12),
  reference text not null,
  payer_phone text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
grant select, insert, update on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "own payments read" on public.payments for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own payments insert" on public.payments for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy "admin reviews payments" on public.payments for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.review_payment(_id uuid, _approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p public.payments;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  select * into p from public.payments where id = _id for update;
  if p.status <> 'pending' then return; end if;
  update public.payments set status = case when _approve then 'approved' else 'rejected' end, reviewed_at = now() where id = _id;
  if _approve then
    update public.profiles set subscription_until = greatest(coalesce(subscription_until, now()), now()) + (p.months || ' months')::interval where id = p.user_id;
  end if;
end $$;
grant execute on function public.review_payment(uuid, boolean) to authenticated;

-- public client view by token
create or replace function public.client_ledger(_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'customer', json_build_object('name', c.name),
    'shop', json_build_object('name', p.shop_name, 'phone', p.phone),
    'entries', coalesce((select json_agg(json_build_object('kind',e.kind,'amount',e.amount,'products',e.products,'created_at',e.created_at) order by e.created_at desc) from public.entries e where e.customer_id = c.id), '[]'::json)
  )
  from public.customers c join public.profiles p on p.id = c.shop_id
  where c.share_token = _token
$$;
grant execute on function public.client_ledger(text) to anon, authenticated;