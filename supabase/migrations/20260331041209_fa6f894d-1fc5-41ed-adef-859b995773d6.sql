
-- Storage bucket for AI chat images
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-chat-images', 'ai-chat-images', true);

-- Allow authenticated users to upload to ai-chat-images
CREATE POLICY "Users can upload ai chat images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ai-chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public read access
CREATE POLICY "Public read ai chat images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'ai-chat-images');

-- Allow users to delete own images
CREATE POLICY "Users can delete own ai chat images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'ai-chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);
