-- Allow group members to update shared special days
CREATE POLICY "Group members can update group special days"
ON public.special_days
FOR UPDATE
TO authenticated
USING (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id))
WITH CHECK (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id));

-- Allow group members to delete shared special days
CREATE POLICY "Group members can delete group special days"
ON public.special_days
FOR DELETE
TO authenticated
USING (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id));

-- Allow group members to insert into shared groups
CREATE POLICY "Group members can insert group special days"
ON public.special_days
FOR INSERT
TO authenticated
WITH CHECK (
  (group_id IS NULL AND user_id = auth.uid())
  OR (group_id IS NOT NULL AND user_id = auth.uid() AND public.is_group_member(auth.uid(), group_id))
);