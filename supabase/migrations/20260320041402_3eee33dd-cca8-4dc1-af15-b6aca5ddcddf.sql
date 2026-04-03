-- Persist completion metadata on tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS completed_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Persist completion metadata on events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS done BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS completed_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Backfill existing completed tasks/events metadata
UPDATE public.tasks
SET
  completed_at = COALESCE(completed_at, created_at),
  completed_by = COALESCE(completed_by, user_id),
  updated_at = COALESCE(updated_at, now())
WHERE done = true;

UPDATE public.events
SET
  completed_at = COALESCE(completed_at, created_at),
  completed_by = COALESCE(completed_by, user_id),
  updated_at = COALESCE(updated_at, now())
WHERE done = true;

-- Shared updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_row_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tasks_updated_at ON public.tasks;
CREATE TRIGGER set_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_events_updated_at ON public.events;
CREATE TRIGGER set_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.set_row_updated_at();

-- Permission helper for cross-view completion toggles
CREATE OR REPLACE FUNCTION public.can_user_toggle_assigned_item(
  _owner_user_id UUID,
  _group_id UUID,
  _assignee TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    auth.uid() = _owner_user_id
    OR (
      _assignee IN ('partner', 'both')
      AND (
        (_group_id IS NOT NULL AND public.is_group_member(auth.uid(), _group_id))
        OR public.get_partner_id(_owner_user_id) = auth.uid()
        OR public.get_partner_id(auth.uid()) = _owner_user_id
      )
    )
  );
$$;

-- Security-definer mutation for task completion
CREATE OR REPLACE FUNCTION public.toggle_task_completion(
  _task_id UUID,
  _completed BOOLEAN
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_row public.tasks%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = _task_id
      AND public.can_user_toggle_assigned_item(t.user_id, t.group_id, t.assignee)
  ) THEN
    RAISE EXCEPTION 'Not allowed to toggle this task';
  END IF;

  UPDATE public.tasks t
  SET
    done = _completed,
    completed_at = CASE WHEN _completed THEN now() ELSE NULL END,
    completed_by = CASE WHEN _completed THEN auth.uid() ELSE NULL END,
    updated_at = now()
  WHERE t.id = _task_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  RETURN updated_row;
END;
$$;

-- Security-definer mutation for event completion
CREATE OR REPLACE FUNCTION public.toggle_event_completion(
  _event_id UUID,
  _completed BOOLEAN
)
RETURNS public.events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_row public.events%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = _event_id
      AND public.can_user_toggle_assigned_item(e.user_id, e.group_id, e.assignee)
  ) THEN
    RAISE EXCEPTION 'Not allowed to toggle this event';
  END IF;

  UPDATE public.events e
  SET
    done = _completed,
    completed_at = CASE WHEN _completed THEN now() ELSE NULL END,
    completed_by = CASE WHEN _completed THEN auth.uid() ELSE NULL END,
    updated_at = now()
  WHERE e.id = _event_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_user_toggle_assigned_item(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_task_completion(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_event_completion(UUID, BOOLEAN) TO authenticated;

-- Realtime sync for tasks/events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  END IF;
END
$$;