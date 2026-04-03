ALTER TABLE public.calendar_context_visibility
ADD COLUMN visibility_mode text NOT NULL DEFAULT 'full';