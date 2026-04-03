
CREATE TABLE public.gcal_event_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gcal_event_id text NOT NULL,
  assignee text NOT NULL DEFAULT 'me',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, gcal_event_id)
);

ALTER TABLE public.gcal_event_designations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own gcal designations"
ON public.gcal_event_designations
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
