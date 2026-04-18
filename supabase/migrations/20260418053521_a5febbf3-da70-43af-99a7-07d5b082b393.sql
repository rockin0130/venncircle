CREATE OR REPLACE FUNCTION public.preview_group_by_invite_code(_code text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target_group RECORD;
BEGIN
  SELECT id, name, invite_code, emoji, type, shared_pages, category, cover_image_url
  INTO target_group
  FROM public.groups
  WHERE invite_code = upper(_code);

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid invite code');
  END IF;

  RETURN json_build_object(
    'success', true,
    'group_id', target_group.id,
    'group_name', target_group.name,
    'invite_code', target_group.invite_code,
    'emoji', target_group.emoji,
    'type', target_group.type,
    'shared_pages', target_group.shared_pages,
    'category', target_group.category,
    'cover_image_url', target_group.cover_image_url
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_group(_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target_group RECORD;
  existing_membership RECORD;
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  SELECT id, name, invite_code
  INTO target_group
  FROM public.groups
  WHERE invite_code = upper(_code);

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid invite code');
  END IF;

  SELECT id, status
  INTO existing_membership
  FROM public.group_members
  WHERE group_id = target_group.id
    AND user_id = current_user_id;

  IF FOUND THEN
    IF existing_membership.status = 'active' THEN
      RETURN json_build_object(
        'error', 'You are already a member of this group',
        'group_name', target_group.name,
        'group_id', target_group.id
      );
    END IF;

    UPDATE public.group_members
    SET status = 'active',
        joined_at = now()
    WHERE id = existing_membership.id;

    RETURN json_build_object(
      'success', true,
      'group_name', target_group.name,
      'group_id', target_group.id,
      'reactivated', true
    );
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role, status)
  VALUES (target_group.id, current_user_id, 'member', 'active');

  RETURN json_build_object(
    'success', true,
    'group_name', target_group.name,
    'group_id', target_group.id
  );
END;
$function$;