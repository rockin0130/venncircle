ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS assignee_user_ids uuid[];

UPDATE public.events
SET assignee_user_ids = ARRAY[user_id]
WHERE assignee_user_ids IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_assignee_user_ids
ON public.events USING GIN (assignee_user_ids);