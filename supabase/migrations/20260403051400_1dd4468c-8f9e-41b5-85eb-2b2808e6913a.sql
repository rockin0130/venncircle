-- Drop existing insert policy
DROP POLICY "Users can insert nudges to partner" ON public.nudges;

-- Create new insert policy allowing nudges to partners OR group members
CREATE POLICY "Users can insert nudges to partner or group member"
ON public.nudges
FOR INSERT
TO authenticated
WITH CHECK (
  from_user_id = auth.uid()
  AND (
    to_user_id = get_partner_id(auth.uid())
    OR EXISTS (
      SELECT 1 FROM group_members gm1
      JOIN group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid()
        AND gm2.user_id = to_user_id
        AND gm1.status = 'active'
        AND gm2.status = 'active'
    )
  )
);

-- Allow users to see nudges sent to them (already exists) but also from group members
-- The existing SELECT policy "Users can read own nudges" covers to_user_id = auth.uid() which is correct