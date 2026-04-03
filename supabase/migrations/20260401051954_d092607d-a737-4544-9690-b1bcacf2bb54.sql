
-- Add status and invited_by columns to group_members
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_by uuid;

-- Update is_group_member to only match active members
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id AND status = 'active'
  )
$$;

-- Allow pending members to view groups (for invite display)
CREATE POLICY "Pending members can view groups"
ON public.groups FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = groups.id AND user_id = auth.uid() AND status = 'pending_invited'
  )
);

-- Allow pending members to view group members (to see who invited them)
CREATE POLICY "Pending members can view group members"
ON public.group_members FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm2
    WHERE gm2.group_id = group_members.group_id AND gm2.user_id = auth.uid() AND gm2.status = 'pending_invited'
  )
);

-- Allow pending members to read profiles of group members (to see inviter name)
CREATE POLICY "Users can read group member profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.user_id = profiles.id
      AND EXISTS (
        SELECT 1 FROM public.group_members gm2
        WHERE gm2.group_id = gm.group_id AND gm2.user_id = auth.uid()
      )
  )
);

-- Function to invite a friend to a group
CREATE OR REPLACE FUNCTION public.invite_to_group(_group_id uuid, _user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = auth.uid() AND status = 'active') THEN
    RETURN json_build_object('error', 'You are not an active member of this group');
  END IF;

  IF EXISTS (SELECT 1 FROM public.group_members WHERE group_id = _group_id AND user_id = _user_id) THEN
    RETURN json_build_object('error', 'User already has a membership in this group');
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role, status, invited_by)
  VALUES (_group_id, _user_id, 'member', 'pending_invited', auth.uid());

  RETURN json_build_object('success', true);
END;
$$;

-- Function to accept group invite
CREATE OR REPLACE FUNCTION public.accept_group_invite(_group_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.group_members
  SET status = 'active'
  WHERE group_id = _group_id AND user_id = auth.uid() AND status = 'pending_invited';

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'No pending invite found');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- Function to decline group invite
CREATE OR REPLACE FUNCTION public.decline_group_invite(_group_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.group_members
  WHERE group_id = _group_id AND user_id = auth.uid() AND status = 'pending_invited';

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'No pending invite found');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;
