-- Add linked_workout_id to workouts for cross-group linking
ALTER TABLE public.workouts
ADD COLUMN linked_workout_id uuid DEFAULT NULL;

-- Index for efficient lookup of linked workouts
CREATE INDEX idx_workouts_linked_workout_id ON public.workouts (linked_workout_id) WHERE linked_workout_id IS NOT NULL;