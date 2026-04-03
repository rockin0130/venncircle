
CREATE OR REPLACE FUNCTION public.get_profiles_by_ids(_user_ids uuid[])
RETURNS TABLE(id uuid, display_name text, avatar_url text, invite_code text, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name, p.avatar_url, p.invite_code, p.email
  FROM public.profiles p
  WHERE p.id = ANY(_user_ids);
$$;
