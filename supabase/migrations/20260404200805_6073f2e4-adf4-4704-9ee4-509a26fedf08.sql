
CREATE OR REPLACE FUNCTION public.delete_group(_group_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Check caller is admin/creator of this group
  IF NOT EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = _group_id AND created_by = current_user_id
  ) THEN
    RETURN json_build_object('error', 'Only the group creator can delete this group');
  END IF;

  -- Delete child records in correct order to avoid FK violations

  -- Chat messages
  DELETE FROM public.messages WHERE group_id = _group_id;

  -- AI conversations
  DELETE FROM public.ai_messages WHERE conversation_id IN (
    SELECT id FROM public.ai_conversations WHERE group_id = _group_id
  );
  DELETE FROM public.ai_conversations WHERE group_id = _group_id;

  -- Coach conversations
  DELETE FROM public.coach_conversations WHERE group_id = _group_id;

  -- AI meal suggestions
  DELETE FROM public.ai_meal_suggestions WHERE group_id = _group_id;

  -- Exercise logs for group workouts
  DELETE FROM public.exercise_logs WHERE workout_id IN (
    SELECT id FROM public.workouts WHERE group_id = _group_id
  );

  -- Workouts
  DELETE FROM public.workouts WHERE group_id = _group_id;

  -- Events
  DELETE FROM public.events WHERE group_id = _group_id;

  -- Tasks
  DELETE FROM public.tasks WHERE group_id = _group_id;

  -- Habit completions for group habits
  DELETE FROM public.habit_completions WHERE habit_id IN (
    SELECT id FROM public.habits WHERE group_id = _group_id
  );

  -- Habits
  DELETE FROM public.habits WHERE group_id = _group_id;

  -- Habit sections
  DELETE FROM public.habit_sections WHERE group_id = _group_id;

  -- Meal logs
  DELETE FROM public.meal_logs WHERE group_id = _group_id;

  -- Nutrition goals
  DELETE FROM public.nutrition_goals WHERE group_id = _group_id;

  -- Sobriety checkins for group categories
  DELETE FROM public.sobriety_checkins WHERE category_id IN (
    SELECT id FROM public.sobriety_categories WHERE group_id = _group_id
  );

  -- Sobriety categories
  DELETE FROM public.sobriety_categories WHERE group_id = _group_id;

  -- Special days
  DELETE FROM public.special_days WHERE group_id = _group_id;

  -- Shopping list items for group lists
  DELETE FROM public.shopping_list_items WHERE list_id IN (
    SELECT id FROM public.shopping_lists WHERE group_id = _group_id
  );

  -- Shopping lists
  DELETE FROM public.shopping_lists WHERE group_id = _group_id;

  -- Calendars
  DELETE FROM public.calendar_context_visibility WHERE calendar_id IN (
    SELECT id FROM public.calendars WHERE group_id = _group_id
  );
  DELETE FROM public.calendars WHERE group_id = _group_id;

  -- Google calendar tokens
  DELETE FROM public.google_calendar_tokens WHERE group_id = _group_id;

  -- Hidden gcal events
  DELETE FROM public.hidden_gcal_events WHERE group_id = _group_id;

  -- Gcal event completions
  DELETE FROM public.gcal_event_completions WHERE group_id = _group_id;

  -- Water tracking (no group_id, skip)

  -- Nudges (no group_id, skip)

  -- Remove shared_group_ids references from habits and sobriety_categories
  UPDATE public.habits SET shared_group_ids = array_remove(shared_group_ids, _group_id)
    WHERE _group_id = ANY(shared_group_ids);
  UPDATE public.sobriety_categories SET shared_group_ids = array_remove(shared_group_ids, _group_id)
    WHERE _group_id = ANY(shared_group_ids);
  UPDATE public.special_days SET shared_group_ids = array_remove(shared_group_ids, _group_id)
    WHERE _group_id = ANY(shared_group_ids);

  -- Group members
  DELETE FROM public.group_members WHERE group_id = _group_id;

  -- Finally delete the group
  DELETE FROM public.groups WHERE id = _group_id;

  RETURN json_build_object('success', true);
END;
$function$;
