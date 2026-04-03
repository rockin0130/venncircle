
DROP FUNCTION IF EXISTS public.get_profiles_by_ids(_user_ids uuid[]);

CREATE FUNCTION public.get_profiles_by_ids(_user_ids uuid[])
RETURNS TABLE(id uuid, display_name text, avatar_url text, invite_code text, email text, username text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name, p.avatar_url, p.invite_code, p.email, p.username
  FROM public.profiles p
  WHERE p.id = ANY(_user_ids);
$$;

CREATE OR REPLACE FUNCTION public.check_username_available(_username text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(username) = lower(_username)
    AND id != auth.uid()
  );
$$;

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
      OR lower(p.username) = lower(_identifier)
    )
  LIMIT 5;
$$;
