ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE DEFAULT substr(encode(extensions.gen_random_bytes(6),'hex'),1,8);
UPDATE public.profiles SET referral_code = substr(encode(extensions.gen_random_bytes(6),'hex'),1,8) WHERE referral_code IS NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by uuid;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS referral_percent integer NOT NULL DEFAULT 25;

CREATE TABLE public.referral_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL,
  payment_id uuid NOT NULL UNIQUE,
  amount integer NOT NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.referral_earnings TO authenticated;
GRANT ALL ON public.referral_earnings TO service_role;
ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or admin earnings read" ON public.referral_earnings FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin marks earnings" ON public.referral_earnings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.protect_subscription()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
begin
  if auth.uid() is not null and not public.has_role(auth.uid(),'admin') then
    if new.subscription_until is distinct from old.subscription_until then
      new.subscription_until := old.subscription_until;
    end if;
    new.referral_code := old.referral_code;
    if new.referred_by is distinct from old.referred_by then
      if old.referred_by is not null or new.referred_by = new.id or old.created_at < now() - interval '2 days' then
        new.referred_by := old.referred_by;
      end if;
    end if;
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.claim_referral(_code text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare r uuid;
begin
  select id into r from public.profiles where referral_code = lower(trim(_code));
  if r is null or r = auth.uid() then return false; end if;
  update public.profiles set referred_by = r
   where id = auth.uid() and referred_by is null and created_at > now() - interval '2 days';
  return found;
end $$;

CREATE OR REPLACE FUNCTION public.review_payment(_id uuid, _approve boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare p public.payments; ref uuid; pct integer;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  select * into p from public.payments where id = _id for update;
  if p.status <> 'pending' then return; end if;
  update public.payments set status = case when _approve then 'approved' else 'rejected' end, reviewed_at = now() where id = _id;
  if _approve then
    update public.profiles set subscription_until = greatest(coalesce(subscription_until, now()), now()) + (p.months || ' months')::interval where id = p.user_id;
    select referred_by into ref from public.profiles where id = p.user_id;
    select referral_percent into pct from public.app_settings where id = 1;
    if ref is not null and coalesce(pct,0) > 0 then
      insert into public.referral_earnings (referrer_id, referred_id, payment_id, amount)
      values (ref, p.user_id, p.id, (p.amount * pct) / 100) on conflict (payment_id) do nothing;
    end if;
  end if;
end $$;