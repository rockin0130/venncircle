ALTER TABLE public.gcal_event_designations
ADD COLUMN IF NOT EXISTS assignee_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
ADD COLUMN IF NOT EXISTS override_title text,
ADD COLUMN IF NOT EXISTS override_description text,
ADD COLUMN IF NOT EXISTS override_location text,
ADD COLUMN IF NOT EXISTS override_start timestamptz,
ADD COLUMN IF NOT EXISTS override_end timestamptz,
ADD COLUMN IF NOT EXISTS override_all_day boolean,
ADD COLUMN IF NOT EXISTS override_timezone text,
ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

UPDATE public.gcal_event_designations
SET assignee = 'me',
    assignee_user_ids = ARRAY[user_id],
    updated_at = now()
WHERE assignee_user_ids IS NULL
   OR cardinality(assignee_user_ids) = 0;

CREATE TABLE IF NOT EXISTS public.calendar_team_dashboard_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  context_key text NOT NULL,
  column_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, context_key)
);

ALTER TABLE public.calendar_team_dashboard_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'calendar_team_dashboard_preferences'
      AND policyname = 'Users manage own calendar team dashboard preferences'
  ) THEN
    CREATE POLICY "Users manage own calendar team dashboard preferences"
    ON public.calendar_team_dashboard_preferences
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_calendar_team_dashboard_preferences_updated_at'
  ) THEN
    CREATE TRIGGER set_calendar_team_dashboard_preferences_updated_at
    BEFORE UPDATE ON public.calendar_team_dashboard_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.set_row_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_gcal_event_designations_updated_at'
  ) THEN
    CREATE TRIGGER set_gcal_event_designations_updated_at
    BEFORE UPDATE ON public.gcal_event_designations
    FOR EACH ROW
    EXECUTE FUNCTION public.set_row_updated_at();
  END IF;
END $$;