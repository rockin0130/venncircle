
CREATE TABLE public.special_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '❤️',
  event_date DATE NOT NULL,
  count_direction TEXT NOT NULL DEFAULT 'since' CHECK (count_direction IN ('since', 'until')),
  repeats_yearly BOOLEAN NOT NULL DEFAULT false,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.special_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own special days"
  ON public.special_days FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Group members can view group special days"
  ON public.special_days FOR SELECT
  TO authenticated
  USING (group_id IS NOT NULL AND is_group_member(auth.uid(), group_id));
