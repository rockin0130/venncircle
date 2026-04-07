
-- Group challenges table
CREATE TABLE public.group_challenges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  challenge_type TEXT NOT NULL DEFAULT 'workout',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_weeks INTEGER NOT NULL DEFAULT 3,
  difficulty TEXT NOT NULL DEFAULT 'easy',
  goal_description TEXT NOT NULL DEFAULT '',
  partner_reward TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.group_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view challenges"
  ON public.group_challenges FOR SELECT TO authenticated
  USING (is_group_member(auth.uid(), group_id));

CREATE POLICY "Group members can create challenges"
  ON public.group_challenges FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND is_group_member(auth.uid(), group_id));

CREATE POLICY "Creator can update challenges"
  ON public.group_challenges FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Creator can delete challenges"
  ON public.group_challenges FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Challenge progress tracking per member per week
CREATE TABLE public.group_challenge_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES public.group_challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  week_number INTEGER NOT NULL DEFAULT 1,
  completed_count INTEGER NOT NULL DEFAULT 0,
  target_count INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(challenge_id, user_id, week_number)
);

ALTER TABLE public.group_challenge_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view challenge progress"
  ON public.group_challenge_progress FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.group_challenges gc
    WHERE gc.id = challenge_id AND is_group_member(auth.uid(), gc.group_id)
  ));

CREATE POLICY "Users manage own challenge progress"
  ON public.group_challenge_progress FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
