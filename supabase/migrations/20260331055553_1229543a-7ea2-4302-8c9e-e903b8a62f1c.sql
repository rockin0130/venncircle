
ALTER TABLE public.workouts
ADD COLUMN IF NOT EXISTS external_id text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS normalized_type text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS origin_type text NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS completion_source text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS matched_planned_workout_id uuid DEFAULT NULL,
ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS imported_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS start_time timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS end_time timestamp with time zone DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_workouts_external_id ON public.workouts(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workouts_needs_review ON public.workouts(needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_workouts_origin_type ON public.workouts(origin_type);
