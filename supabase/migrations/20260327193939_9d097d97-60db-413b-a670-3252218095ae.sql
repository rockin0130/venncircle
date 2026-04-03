
-- Add columns for multi-group sharing and private event context
ALTER TABLE public.special_days ADD COLUMN shared_group_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.special_days ADD COLUMN context_group_id uuid;

-- Migrate existing group_id data to new columns
UPDATE public.special_days 
SET shared_group_ids = ARRAY[group_id], context_group_id = group_id 
WHERE group_id IS NOT NULL;

-- RLS: View events shared with user's groups via array
CREATE POLICY "View via shared groups array" ON public.special_days
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_members gm 
  WHERE gm.user_id = auth.uid() 
  AND gm.group_id = ANY(special_days.shared_group_ids)
));

-- RLS: Update events shared with user's groups via array
CREATE POLICY "Update via shared groups array" ON public.special_days
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_members gm 
  WHERE gm.user_id = auth.uid() 
  AND gm.group_id = ANY(special_days.shared_group_ids)
));

-- RLS: Delete events shared with user's groups via array
CREATE POLICY "Delete via shared groups array" ON public.special_days
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_members gm 
  WHERE gm.user_id = auth.uid() 
  AND gm.group_id = ANY(special_days.shared_group_ids)
));
