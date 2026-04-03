
-- Recreate the trigger on auth.users to auto-create profiles
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for existing auth users that are missing profiles
INSERT INTO public.profiles (id, display_name, email, invite_code)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
  u.email,
  upper(substr(md5(random()::text), 1, 8))
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);
