drop policy "shop inserts entries" on public.entries;
create policy "shop inserts entries" on public.entries for insert to authenticated with check (
  shop_id = auth.uid()
  and exists(select 1 from public.customers c where c.id = customer_id and c.shop_id = auth.uid())
  and exists(select 1 from public.profiles p where p.id = auth.uid() and p.subscription_until > now())
);