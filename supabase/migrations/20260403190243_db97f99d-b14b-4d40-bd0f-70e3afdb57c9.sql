ALTER TABLE public.groups ADD COLUMN category text NOT NULL DEFAULT 'home';

-- Update the create_group function to accept category parameter
CREATE OR REPLACE FUNCTION public.create_group(
  _name text,
  _type text DEFAULT 'custom',
  _emoji text DEFAULT '📅',
  _shared_pages text[] DEFAULT ARRAY['calendar','workout','nutrition','habits','sobriety','special_days','shopping'],
  _category text DEFAULT 'home'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _group_id uuid;
  _invite_code text;
BEGIN
  INSERT INTO groups (name, type, emoji, created_by, shared_pages, category)
  VALUES (_name, _type, _emoji, auth.uid(), _shared_pages, _category)
  RETURNING id, invite_code INTO _group_id, _invite_code;

  INSERT INTO group_members (group_id, user_id, role, status)
  VALUES (_group_id, auth.uid(), 'admin', 'active');

  RETURN json_build_object('id', _group_id, 'invite_code', _invite_code);
END;
$$;