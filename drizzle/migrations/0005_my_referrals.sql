CREATE OR REPLACE FUNCTION public.my_referrals()
RETURNS TABLE(shop_name text, created_at timestamptz, subscription_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.shop_name, p.created_at, p.subscription_until
  FROM public.profiles p WHERE p.referred_by = auth.uid()
  ORDER BY p.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.my_referrals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referrals() TO authenticated;