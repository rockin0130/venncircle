CREATE POLICY "Users can read partner water tracking"
ON public.water_tracking FOR SELECT
TO authenticated
USING (user_id = get_partner_id(auth.uid()));

CREATE POLICY "Group members can view group water tracking"
ON public.water_tracking FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.user_id = water_tracking.user_id
    AND EXISTS (
      SELECT 1 FROM public.group_members gm2
      WHERE gm2.group_id = gm.group_id
      AND gm2.user_id = auth.uid()
    )
  )
);