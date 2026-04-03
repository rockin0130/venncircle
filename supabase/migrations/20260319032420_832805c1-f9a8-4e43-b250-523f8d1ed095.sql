
-- Drop the partial unique index that doesn't support ON CONFLICT
DROP INDEX IF EXISTS public.google_calendar_tokens_user_group_key;

-- Create a proper unique constraint that works with upsert
ALTER TABLE public.google_calendar_tokens
ADD CONSTRAINT google_calendar_tokens_user_id_group_id_key UNIQUE (user_id, group_id);
