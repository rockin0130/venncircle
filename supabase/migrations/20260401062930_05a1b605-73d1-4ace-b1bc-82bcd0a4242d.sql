
-- Remove the unique constraint on (user_id, group_id) and add one on just user_id
-- so each user has ONE google calendar token at the account level
-- First drop old constraint if it exists
DO $$
BEGIN
  -- Drop the old unique constraint on (user_id, group_id)
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'google_calendar_tokens_user_id_group_id_key'
  ) THEN
    ALTER TABLE public.google_calendar_tokens DROP CONSTRAINT google_calendar_tokens_user_id_group_id_key;
  END IF;
END $$;

-- Add a unique constraint on just user_id (one Google connection per user)
ALTER TABLE public.google_calendar_tokens ADD CONSTRAINT google_calendar_tokens_user_id_key UNIQUE (user_id);

-- Remove group_id from calendars for google provider (make them account-level)
-- Set group_id to NULL for all google calendars so they're user-scoped
UPDATE public.calendars SET group_id = NULL WHERE provider = 'google';

-- Set group_id to NULL for existing google_calendar_tokens
UPDATE public.google_calendar_tokens SET group_id = NULL;
