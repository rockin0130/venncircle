
-- Add carbs, fat, fiber columns to meal_logs
ALTER TABLE public.meal_logs
  ADD COLUMN IF NOT EXISTS carbs integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fat integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiber integer DEFAULT 0;

-- Add carbs, fat, fiber columns to ai_meal_suggestions
ALTER TABLE public.ai_meal_suggestions
  ADD COLUMN IF NOT EXISTS carbs integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fat integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiber integer DEFAULT 0;

-- Add tracker configuration to nutrition_goals
ALTER TABLE public.nutrition_goals
  ADD COLUMN IF NOT EXISTS carbs_goal integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fat_goal integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fiber_goal integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS enabled_trackers jsonb DEFAULT '["protein","calories"]'::jsonb,
  ADD COLUMN IF NOT EXISTS tracker_order jsonb DEFAULT '["protein","calories","carbs","fat","fiber"]'::jsonb;
