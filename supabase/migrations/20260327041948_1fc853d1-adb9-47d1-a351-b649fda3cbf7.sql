
-- Allow group members to view sobriety checkins for categories in their group
CREATE POLICY "Group members can view group sobriety checkins"
ON public.sobriety_checkins
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sobriety_categories sc
    WHERE sc.id = sobriety_checkins.category_id
    AND sc.group_id IS NOT NULL
    AND is_group_member(auth.uid(), sc.group_id)
  )
);
