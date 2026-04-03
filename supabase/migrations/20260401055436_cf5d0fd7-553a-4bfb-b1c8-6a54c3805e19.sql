
ALTER TABLE public.profiles ADD COLUMN username text;
CREATE UNIQUE INDEX profiles_username_unique ON public.profiles (lower(username));
