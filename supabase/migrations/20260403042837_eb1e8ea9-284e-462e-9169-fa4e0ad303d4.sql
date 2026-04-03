-- Step 1: Add shared_group_ids column
ALTER TABLE public.habits ADD COLUMN IF NOT EXISTS shared_group_ids uuid[] NOT NULL DEFAULT '{}';

-- Step 2: Migrate existing data — merge group copies into their personal counterpart
-- For each user+label+category combo, find the personal copy (group_id IS NULL) and collect all group_ids from copies
DO $$
DECLARE
  r RECORD;
  group_ids uuid[];
  personal_id uuid;
BEGIN
  -- Find all distinct user+label+category combos that have both personal and group copies
  FOR r IN
    SELECT user_id, label, category
    FROM habits
    GROUP BY user_id, label, category
    HAVING COUNT(*) > 1
  LOOP
    -- Get personal copy id
    SELECT id INTO personal_id
    FROM habits
    WHERE user_id = r.user_id AND label = r.label AND category = r.category AND group_id IS NULL
    LIMIT 1;

    -- If no personal copy, pick the first one as the "primary" and set its group_id to NULL
    IF personal_id IS NULL THEN
      SELECT id INTO personal_id
      FROM habits
      WHERE user_id = r.user_id AND label = r.label AND category = r.category
      ORDER BY created_at ASC
      LIMIT 1;

      UPDATE habits SET group_id = NULL WHERE id = personal_id;
    END IF;

    -- Collect all group_ids from non-personal copies
    SELECT array_agg(DISTINCT group_id) INTO group_ids
    FROM habits
    WHERE user_id = r.user_id AND label = r.label AND category = r.category
      AND group_id IS NOT NULL AND id != personal_id;

    -- Update the personal copy with shared_group_ids
    IF group_ids IS NOT NULL THEN
      UPDATE habits SET shared_group_ids = group_ids WHERE id = personal_id;

      -- Move completions from duplicates to the personal copy
      UPDATE habit_completions
      SET habit_id = personal_id
      WHERE habit_id IN (
        SELECT id FROM habits
        WHERE user_id = r.user_id AND label = r.label AND category = r.category
          AND id != personal_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM habit_completions hc2
        WHERE hc2.habit_id = personal_id AND hc2.completed_date = habit_completions.completed_date
      );

      -- Delete completions that would be duplicates
      DELETE FROM habit_completions
      WHERE habit_id IN (
        SELECT id FROM habits
        WHERE user_id = r.user_id AND label = r.label AND category = r.category
          AND id != personal_id
      );

      -- Delete the duplicate group copies
      DELETE FROM habits
      WHERE user_id = r.user_id AND label = r.label AND category = r.category
        AND id != personal_id;
    END IF;
  END LOOP;
END $$;

-- Step 3: For habits that only exist with a group_id (no personal copy), convert them
UPDATE habits
SET shared_group_ids = ARRAY[group_id], group_id = NULL
WHERE group_id IS NOT NULL AND shared_group_ids = '{}';

-- Step 4: Add RLS policy for group members to view habits shared with their group
CREATE POLICY "Group members can view shared habits"
ON public.habits
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.user_id = auth.uid()
      AND gm.status = 'active'
      AND gm.group_id = ANY(habits.shared_group_ids)
  )
);

-- Step 5: Drop the old group-based SELECT policy since we now use shared_group_ids
DROP POLICY IF EXISTS "Group members can view group habits" ON public.habits;

-- Step 6: Add index for shared_group_ids lookups
CREATE INDEX IF NOT EXISTS idx_habits_shared_group_ids ON public.habits USING GIN(shared_group_ids);