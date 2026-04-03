
-- Create habit_sections table for persistent, shareable section metadata
CREATE TABLE public.habit_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid REFERENCES public.groups(id),
  key text NOT NULL,
  label text NOT NULL,
  icon text NOT NULL DEFAULT '📋',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.habit_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own habit sections"
  ON public.habit_sections FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Group members can view group habit sections"
  ON public.habit_sections FOR SELECT
  TO authenticated
  USING (group_id IS NOT NULL AND is_group_member(auth.uid(), group_id));

-- RPC to create shared section for all group members
CREATE OR REPLACE FUNCTION public.create_shared_section(
  _key text,
  _label text,
  _icon text DEFAULT '📋',
  _group_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  member RECORD;
  current_user_id uuid;
  max_order int;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  IF _group_id IS NULL THEN
    RETURN json_build_object('error', 'No group specified');
  END IF;

  IF NOT is_group_member(current_user_id, _group_id) THEN
    RETURN json_build_object('error', 'Not a group member');
  END IF;

  -- Insert for all group members (skip if already exists for that user+group+key)
  FOR member IN SELECT user_id FROM group_members WHERE group_id = _group_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM habit_sections
      WHERE user_id = member.user_id AND group_id = _group_id AND key = _key
    ) THEN
      SELECT COALESCE(MAX(sort_order), -1) + 1 INTO max_order
      FROM habit_sections
      WHERE user_id = member.user_id AND group_id = _group_id;

      INSERT INTO habit_sections (user_id, group_id, key, label, icon, sort_order)
      VALUES (member.user_id, _group_id, _key, _label, _icon, max_order);
    END IF;
  END LOOP;

  RETURN json_build_object('success', true);
END;
$$;
