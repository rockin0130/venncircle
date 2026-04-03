ALTER TABLE public.special_days ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'custom';
ALTER TABLE public.special_days ADD COLUMN IF NOT EXISTS display_mode text NOT NULL DEFAULT 'auto';

-- Update existing rows based on category
UPDATE public.special_days SET event_type = category WHERE category IN ('birthday', 'anniversary', 'custom');
UPDATE public.special_days SET event_type = 'custom' WHERE event_type NOT IN ('birthday', 'anniversary', 'first_met', 'wedding', 'holiday', 'custom');