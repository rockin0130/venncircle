
CREATE TABLE public.calendar_context_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  calendar_id uuid NOT NULL REFERENCES public.calendars(id) ON DELETE CASCADE,
  context_id text NOT NULL,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, calendar_id, context_id)
);

ALTER TABLE public.calendar_context_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own context visibility"
ON public.calendar_context_visibility
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
