
CREATE OR REPLACE FUNCTION public.transfer_group_admin(_group_id uuid, _new_admin_user_id uuid)
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
    WHERE group_id = _group_id AND user_id = current_user_id AND role = 'admin'
  ) THEN
    RETURN json_build_object('error', 'You are not an admin of this group');
  END IF;

  -- Check target is a member
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _new_admin_user_id
  ) THEN
    RETURN json_build_object('error', 'Target user is not a member of this group');
  END IF;

  -- Promote target to admin
  UPDATE public.group_members
  SET role = 'admin'
  WHERE group_id = _group_id AND user_id = _new_admin_user_id;

  -- Demote current user to member
  UPDATE public.group_members
  SET role = 'member'
  WHERE group_id = _group_id AND user_id = current_user_id;

  -- Transfer group ownership
  UPDATE public.groups
  SET created_by = _new_admin_user_id
  WHERE id = _group_id AND created_by = current_user_id;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_group(_group_id uuid)
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

  -- Check caller is admin/creator of this group
  IF NOT EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = _group_id AND created_by = current_user_id
  ) THEN
    RETURN json_build_object('error', 'Only the group creator can delete this group');
  END IF;

  -- Delete all group members
  DELETE FROM public.group_members WHERE group_id = _group_id;

  -- Delete the group
  DELETE FROM public.groups WHERE id = _group_id;

  RETURN json_build_object('success', true);
END;
$$;
