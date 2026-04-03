-- Scope Google Calendar connections per group
ALTER TABLE public.google_calendar_tokens
ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE;

-- Remove legacy unique constraint/index that forced one token per user
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'google_calendar_tokens'
      AND constraint_name = 'google_calendar_tokens_user_id_key'
  ) THEN
    ALTER TABLE public.google_calendar_tokens
      DROP CONSTRAINT google_calendar_tokens_user_id_key;
  END IF;
END $$;

DROP INDEX IF EXISTS public.google_calendar_tokens_user_id_key;

-- Enforce one token row per (user, group)
CREATE UNIQUE INDEX IF NOT EXISTS google_calendar_tokens_user_group_key
ON public.google_calendar_tokens (user_id, group_id)
WHERE group_id IS NOT NULL;

-- Backfill legacy rows to a single primary group per user
UPDATE public.google_calendar_tokens gct
SET group_id = (
  SELECT gm.group_id
  FROM public.group_members gm
  JOIN public.groups g ON g.id = gm.group_id
  WHERE gm.user_id = gct.user_id
  ORDER BY (g.created_by = gct.user_id) DESC, g.created_at ASC
  LIMIT 1
)
WHERE gct.group_id IS NULL;