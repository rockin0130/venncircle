
CREATE OR REPLACE FUNCTION public.migrate_group_items(
  _source_group_id uuid,
  _target_group_id uuid,
  _copy_habits boolean DEFAULT false,
  _copy_tasks boolean DEFAULT false,
  _copy_events boolean DEFAULT false,
  _copy_workouts boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  habits_count int := 0;
  tasks_count int := 0;
  events_count int := 0;
  workouts_count int := 0;
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Verify user is member of both groups
  IF NOT is_group_member(current_user_id, _source_group_id) THEN
    RETURN json_build_object('error', 'You are not a member of the source group');
  END IF;
  IF NOT is_group_member(current_user_id, _target_group_id) THEN
    RETURN json_build_object('error', 'You are not a member of the target group');
  END IF;

  -- Copy habits
  IF _copy_habits THEN
    WITH inserted AS (
      INSERT INTO public.habits (user_id, label, category, group_id, hidden_from_partner)
      SELECT current_user_id, label, category, _target_group_id, hidden_from_partner
      FROM public.habits
      WHERE group_id = _source_group_id AND user_id = current_user_id
      RETURNING id
    )
    SELECT count(*) INTO habits_count FROM inserted;
  END IF;

  -- Copy tasks (only incomplete ones)
  IF _copy_tasks THEN
    WITH inserted AS (
      INSERT INTO public.tasks (user_id, title, tag, time, assignee, group_id, hidden_from_partner, scheduled_day, scheduled_month, scheduled_year)
      SELECT current_user_id, title, tag, time, 'me', _target_group_id, hidden_from_partner, scheduled_day, scheduled_month, scheduled_year
      FROM public.tasks
      WHERE group_id = _source_group_id AND user_id = current_user_id AND done = false
      RETURNING id
    )
    SELECT count(*) INTO tasks_count FROM inserted;
  END IF;

  -- Copy events (future events only)
  IF _copy_events THEN
    WITH inserted AS (
      INSERT INTO public.events (user_id, title, description, day, month, year, time, assignee, group_id, hidden_from_partner)
      SELECT current_user_id, title, description, day, month, year, time, 'me', _target_group_id, hidden_from_partner
      FROM public.events
      WHERE group_id = _source_group_id AND user_id = current_user_id
        AND (year > EXTRACT(YEAR FROM now())
          OR (year = EXTRACT(YEAR FROM now()) AND month > EXTRACT(MONTH FROM now()))
          OR (year = EXTRACT(YEAR FROM now()) AND month = EXTRACT(MONTH FROM now()) AND day >= EXTRACT(DAY FROM now())))
      RETURNING id
    )
    SELECT count(*) INTO events_count FROM inserted;
  END IF;

  -- Copy workouts (incomplete only)
  IF _copy_workouts THEN
    WITH inserted AS (
      INSERT INTO public.workouts (user_id, title, emoji, tag, duration, cal, exercises, group_id, hidden_from_partner, scheduled_date)
      SELECT current_user_id, title, emoji, tag, duration, cal, exercises, _target_group_id, hidden_from_partner, scheduled_date
      FROM public.workouts
      WHERE group_id = _source_group_id AND user_id = current_user_id AND done = false
      RETURNING id
    )
    SELECT count(*) INTO workouts_count FROM inserted;
  END IF;

  RETURN json_build_object(
    'success', true,
    'habits_copied', habits_count,
    'tasks_copied', tasks_count,
    'events_copied', events_count,
    'workouts_copied', workouts_count
  );
END;
$$;
