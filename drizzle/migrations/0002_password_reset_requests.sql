create table public.password_resets (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid,
  token_hash text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  used_at timestamptz
);
grant select, update on public.password_resets to authenticated;
grant all on public.password_resets to service_role;
alter table public.password_resets enable row level security;
create policy "admin reads resets" on public.password_resets for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin reviews resets" on public.password_resets for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.user_id_by_email(_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(_email) limit 1
$$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;