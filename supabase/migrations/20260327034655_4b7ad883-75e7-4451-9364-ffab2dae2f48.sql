ALTER TABLE public.workouts ADD COLUMN distance numeric NOT NULL DEFAULT 0;
ALTER TABLE public.workouts ADD COLUMN distance_unit text NOT NULL DEFAULT 'km';