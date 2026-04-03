
-- Allow reading partner's habits
CREATE POLICY "Users can read partner habits"
ON public.habits
FOR SELECT
TO authenticated
USING (user_id = get_partner_id(auth.uid()));

-- Allow reading partner's habit completions
CREATE POLICY "Users can read partner habit completions"
ON public.habit_completions
FOR SELECT
TO authenticated
USING (user_id = get_partner_id(auth.uid()));

-- Create nudges table
CREATE TABLE public.nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  habit_id uuid REFERENCES public.habits(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT 'Your partner nudged you!',
  seen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert nudges to partner"
ON public.nudges
FOR INSERT
TO authenticated
WITH CHECK (from_user_id = auth.uid() AND to_user_id = get_partner_id(auth.uid()));

CREATE POLICY "Users can read own nudges"
ON public.nudges
FOR SELECT
TO authenticated
USING (to_user_id = auth.uid());

CREATE POLICY "Users can update own nudges"
ON public.nudges
FOR UPDATE
TO authenticated
USING (to_user_id = auth.uid())
WITH CHECK (to_user_id = auth.uid());
