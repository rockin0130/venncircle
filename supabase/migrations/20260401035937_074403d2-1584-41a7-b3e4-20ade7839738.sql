
CREATE OR REPLACE FUNCTION public.search_users_by_identifier(_identifier text)
RETURNS TABLE(id uuid, display_name text, avatar_url text, invite_code text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name, p.avatar_url, p.invite_code
  FROM public.profiles p
  WHERE p.id != auth.uid()
    AND (
      lower(p.email) = lower(_identifier)
      OR upper(p.invite_code) = upper(_identifier)
      OR lower(p.display_name) = lower(_identifier)
    )
  LIMIT 5;
$$;
