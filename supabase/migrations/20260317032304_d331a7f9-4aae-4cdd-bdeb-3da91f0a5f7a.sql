
-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  email TEXT,
  timezone TEXT DEFAULT 'UTC',
  partner_id UUID REFERENCES public.profiles(id),
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile and their partner's profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR id = (SELECT partner_id FROM public.profiles WHERE id = auth.uid())
  );

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, invite_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    upper(substr(md5(random()::text), 1, 8))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to connect partners via invite code (security definer to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.connect_partner(code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partner_record RECORD;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Find the partner by invite code
  SELECT id, display_name, partner_id INTO partner_record
  FROM public.profiles
  WHERE invite_code = upper(code) AND id != current_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid invite code');
  END IF;

  IF partner_record.partner_id IS NOT NULL THEN
    RETURN json_build_object('error', 'That user is already connected to someone');
  END IF;

  -- Check if current user already has a partner
  IF (SELECT partner_id FROM public.profiles WHERE id = current_user_id) IS NOT NULL THEN
    RETURN json_build_object('error', 'You are already connected to a partner');
  END IF;

  -- Connect both users
  UPDATE public.profiles SET partner_id = partner_record.id WHERE id = current_user_id;
  UPDATE public.profiles SET partner_id = current_user_id WHERE id = partner_record.id;

  RETURN json_build_object('success', true, 'partner_name', partner_record.display_name);
END;
$$;

-- Function to disconnect partner
CREATE OR REPLACE FUNCTION public.disconnect_partner()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_partner_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  SELECT partner_id INTO current_partner_id FROM public.profiles WHERE id = current_user_id;

  IF current_partner_id IS NULL THEN
    RETURN json_build_object('error', 'No partner connected');
  END IF;

  UPDATE public.profiles SET partner_id = NULL WHERE id = current_user_id;
  UPDATE public.profiles SET partner_id = NULL WHERE id = current_partner_id;

  RETURN json_build_object('success', true);
END;
$$;
