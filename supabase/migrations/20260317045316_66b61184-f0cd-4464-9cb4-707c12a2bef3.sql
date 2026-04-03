-- Add hidden_from_partner column to all shareable tables
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS hidden_from_partner boolean NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS hidden_from_partner boolean NOT NULL DEFAULT false;
ALTER TABLE public.habits ADD COLUMN IF NOT EXISTS hidden_from_partner boolean NOT NULL DEFAULT false;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS hidden_from_partner boolean NOT NULL DEFAULT false;

-- Partner read policies for tasks
CREATE POLICY "Users can read partner tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  user_id = get_partner_id(auth.uid())
  AND hidden_from_partner = false
);

-- Partner read policies for events
CREATE POLICY "Users can read partner events"
ON public.events
FOR SELECT
TO authenticated
USING (
  user_id = get_partner_id(auth.uid())
  AND hidden_from_partner = false
);

-- Partner read policies for workouts
CREATE POLICY "Users can read partner workouts"
ON public.workouts
FOR SELECT
TO authenticated
USING (
  user_id = get_partner_id(auth.uid())
  AND hidden_from_partner = false
);

-- Drop and recreate habits partner policy to include hidden check
DROP POLICY IF EXISTS "Users can read partner habits" ON public.habits;
CREATE POLICY "Users can read partner habits"
ON public.habits
FOR SELECT
TO authenticated
USING (
  user_id = get_partner_id(auth.uid())
  AND hidden_from_partner = false
);

-- Drop and recreate habit_completions partner policy
DROP POLICY IF EXISTS "Users can read partner habit completions" ON public.habit_completions;
CREATE POLICY "Users can read partner habit completions"
ON public.habit_completions
FOR SELECT
TO authenticated
USING (
  user_id = get_partner_id(auth.uid())
);

-- Function to create a shared habit for both partners
CREATE OR REPLACE FUNCTION public.create_shared_habit(_label text, _category text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  partner_user_id UUID;
  my_habit_id UUID;
  partner_habit_id UUID;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  SELECT partner_id INTO partner_user_id FROM public.profiles WHERE id = current_user_id;
  IF partner_user_id IS NULL THEN
    RETURN json_build_object('error', 'No partner connected');
  END IF;

  INSERT INTO public.habits (user_id, label, category)
  VALUES (current_user_id, _label, _category)
  RETURNING id INTO my_habit_id;

  INSERT INTO public.habits (user_id, label, category)
  VALUES (partner_user_id, _label, _category)
  RETURNING id INTO partner_habit_id;

  RETURN json_build_object('success', true, 'my_habit_id', my_habit_id, 'partner_habit_id', partner_habit_id);
END;
$$;