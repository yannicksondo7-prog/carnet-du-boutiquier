CREATE OR REPLACE FUNCTION public.my_referral_count()
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select count(*)::int from public.profiles where referred_by = auth.uid() $$;