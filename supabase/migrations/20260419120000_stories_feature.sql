-- Stories (Instagram-style) for groups

CREATE TABLE public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('photo', 'video')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stories_group_id_expires_idx ON public.stories (group_id, expires_at DESC);
CREATE INDEX stories_user_group_idx ON public.stories (user_id, group_id);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view stories"
  ON public.stories FOR SELECT TO authenticated
  USING (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Users can create stories in their groups"
  ON public.stories FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_group_member(auth.uid(), group_id)
  );

CREATE POLICY "Users can delete own stories"
  ON public.stories FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Public bucket for story media URLs (RLS on table gates who can discover URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('stories', 'stories', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload story media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stories');

CREATE POLICY "Anyone can view story media"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'stories');

CREATE POLICY "Users can delete own story uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'stories'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
