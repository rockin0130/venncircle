
CREATE OR REPLACE FUNCTION public.set_member_role(_group_id uuid, _target_user_id uuid, _new_role text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Check caller is admin of this group
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = current_user_id AND role = 'admin' AND status = 'active'
  ) THEN
    RETURN json_build_object('error', 'Only admins can change roles');
  END IF;

  -- Check target is an active member
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _target_user_id AND status = 'active'
  ) THEN
    RETURN json_build_object('error', 'Target user is not an active member');
  END IF;

  -- Validate role
  IF _new_role NOT IN ('admin', 'member') THEN
    RETURN json_build_object('error', 'Invalid role');
  END IF;

  -- Update role
  UPDATE public.group_members
  SET role = _new_role
  WHERE group_id = _group_id AND user_id = _target_user_id;

  RETURN json_build_object('success', true);
END;
$$;
