
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS end_day integer,
  ADD COLUMN IF NOT EXISTS end_month integer,
  ADD COLUMN IF NOT EXISTS end_year integer,
  ADD COLUMN IF NOT EXISTS end_time text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false;

-- Backfill: set end fields to match start fields for existing events
UPDATE public.events
SET end_day = day, end_month = month, end_year = year,
    end_time = CASE WHEN time = '' OR time = 'All day' THEN '' ELSE time END,
    all_day = CASE WHEN time = '' OR time = 'All day' THEN true ELSE false END
WHERE end_day IS NULL;
