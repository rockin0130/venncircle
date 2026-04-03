-- Allow any group member to update group metadata (including launcher cover image)
CREATE POLICY "Members can update groups"
ON public.groups
FOR UPDATE
TO authenticated
USING (is_group_member(auth.uid(), id))
WITH CHECK (is_group_member(auth.uid(), id));