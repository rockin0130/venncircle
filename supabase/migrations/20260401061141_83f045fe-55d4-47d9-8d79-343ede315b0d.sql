
-- Create a SECURITY DEFINER function to check pending membership
CREATE OR REPLACE FUNCTION public.is_pending_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id AND status = 'pending_invited'
  );
$$;

-- Drop and recreate the pending members policy using the safe function
DROP POLICY IF EXISTS "Pending members can view group members" ON public.group_members;

CREATE POLICY "Pending members can view group members" ON public.group_members
FOR SELECT TO authenticated
USING (
  is_pending_group_member(auth.uid(), group_id)
);
