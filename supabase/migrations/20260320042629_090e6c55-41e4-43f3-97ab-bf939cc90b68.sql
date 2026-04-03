
CREATE TABLE public.gcal_event_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gcal_event_id text NOT NULL,
  group_id uuid REFERENCES public.groups(id),
  done boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, gcal_event_id)
);

ALTER TABLE public.gcal_event_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own gcal completions"
  ON public.gcal_event_completions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Group members can view gcal completions"
  ON public.gcal_event_completions
  FOR SELECT
  TO authenticated
  USING (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id));

ALTER PUBLICATION supabase_realtime ADD TABLE public.gcal_event_completions;
