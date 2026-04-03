
-- Add cover_image_url column to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS cover_image_url text;

-- Create storage bucket for group cover images
INSERT INTO storage.buckets (id, name, public)
VALUES ('group-covers', 'group-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to group-covers bucket
CREATE POLICY "Authenticated users can upload group covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'group-covers');

-- Allow anyone to view group cover images (public bucket)
CREATE POLICY "Anyone can view group covers"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'group-covers');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update group covers"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'group-covers');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete group covers"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'group-covers');
