
ALTER TABLE public.special_days 
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS reminder_minutes integer;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('special-days', 'special-days', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload special day photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'special-days' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their special day photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'special-days' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their special day photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'special-days' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anyone can view special day photos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'special-days');
