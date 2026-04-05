
ALTER TABLE public.shopping_list_items
ADD COLUMN meal_name text DEFAULT NULL,
ADD COLUMN assignee_user_ids uuid[] NOT NULL DEFAULT '{}';

-- Allow group members to view shopping list items in their group
CREATE POLICY "Group members can view shopping list items"
ON public.shopping_list_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.shopping_lists sl
    WHERE sl.id = shopping_list_items.list_id
      AND sl.group_id IS NOT NULL
      AND public.is_group_member(auth.uid(), sl.group_id)
  )
);

-- Allow group members to update shopping list items (for checking/assigning)
CREATE POLICY "Group members can update shopping list items"
ON public.shopping_list_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.shopping_lists sl
    WHERE sl.id = shopping_list_items.list_id
      AND sl.group_id IS NOT NULL
      AND public.is_group_member(auth.uid(), sl.group_id)
  )
);
