
-- Add shared_group_ids to sobriety_categories (same pattern as habits)
ALTER TABLE public.sobriety_categories
ADD COLUMN IF NOT EXISTS shared_group_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Migrate existing group_id data into shared_group_ids
UPDATE public.sobriety_categories
SET shared_group_ids = ARRAY[group_id]
WHERE group_id IS NOT NULL AND shared_group_ids = '{}'::uuid[];

-- Add RLS policy for viewing via shared_group_ids
CREATE POLICY "View sobriety categories via shared groups"
ON public.sobriety_categories
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.user_id = auth.uid()
      AND gm.status = 'active'
      AND gm.group_id = ANY(sobriety_categories.shared_group_ids)
  )
);

-- Add RLS policy for viewing sobriety checkins via shared_group_ids
CREATE POLICY "View sobriety checkins via shared categories"
ON public.sobriety_checkins
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM sobriety_categories sc
    WHERE sc.id = sobriety_checkins.category_id
      AND EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.user_id = auth.uid()
          AND gm.status = 'active'
          AND gm.group_id = ANY(sc.shared_group_ids)
      )
  )
);
