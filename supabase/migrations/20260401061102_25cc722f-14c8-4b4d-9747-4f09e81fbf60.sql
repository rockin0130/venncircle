
-- Create a SECURITY DEFINER function to check group membership without triggering RLS
CREATE OR REPLACE FUNCTION public.is_group_member_raw(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id AND status = 'active'
  );
$$;

-- Drop the recursive policies on group_members
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Pending members can view group members" ON public.group_members;

-- Recreate non-recursive policies
-- Active members can see other members in their groups
CREATE POLICY "Members can view group members" ON public.group_members
FOR SELECT TO authenticated
USING (
  is_group_member_raw(auth.uid(), group_id)
);

-- Pending invited members can see members of the group they're invited to
CREATE POLICY "Pending members can view group members" ON public.group_members
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm2
    WHERE gm2.group_id = group_members.group_id
      AND gm2.user_id = auth.uid()
      AND gm2.status = 'pending_invited'
  )
);
