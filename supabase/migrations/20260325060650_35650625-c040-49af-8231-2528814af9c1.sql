ALTER TABLE public.tasks ADD COLUMN due_date date DEFAULT NULL;
ALTER TABLE public.tasks ADD COLUMN prior_notice_days integer NOT NULL DEFAULT 0;