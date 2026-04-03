
-- Add shared_pages column to groups table
ALTER TABLE public.groups ADD COLUMN shared_pages text[] NOT NULL DEFAULT ARRAY['calendar','workout','nutrition','habits','sobriety','special_days','shopping'];

-- Update create_group function to accept shared_pages
CREATE OR REPLACE FUNCTION public.create_group(_name text, _type text DEFAULT 'custom'::text, _emoji text DEFAULT '📅'::text, _shared_pages text[] DEFAULT ARRAY['calendar','workout','nutrition','habits','sobriety','special_days','shopping'])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_group_id uuid;
  new_invite_code text;
BEGIN
  INSERT INTO public.groups (name, type, emoji, created_by, shared_pages)
  VALUES (_name, _type, _emoji, auth.uid(), _shared_pages)
  RETURNING id, invite_code INTO new_group_id, new_invite_code;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (new_group_id, auth.uid(), 'admin');

  RETURN json_build_object('id', new_group_id, 'invite_code', new_invite_code);
END;
$function$;
