
-- Create group_feed_posts table
CREATE TABLE public.group_feed_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  post_type text NOT NULL DEFAULT 'text',
  interest_tag text,
  photos text[] NOT NULL DEFAULT '{}',
  stats jsonb,
  likes_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create group_feed_likes table
CREATE TABLE public.group_feed_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.group_feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Create group_feed_comments table
CREATE TABLE public.group_feed_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid NOT NULL REFERENCES public.group_feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.group_feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_feed_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies for posts
CREATE POLICY "Group members can view feed posts"
  ON public.group_feed_posts FOR SELECT TO authenticated
  USING (is_group_member(auth.uid(), group_id));

CREATE POLICY "Users can create feed posts in their groups"
  ON public.group_feed_posts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_group_member(auth.uid(), group_id));

CREATE POLICY "Users can update own feed posts"
  ON public.group_feed_posts FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own feed posts"
  ON public.group_feed_posts FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- RLS policies for likes
CREATE POLICY "Group members can view likes"
  ON public.group_feed_likes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_feed_posts p WHERE p.id = post_id AND is_group_member(auth.uid(), p.group_id)));

CREATE POLICY "Users can like posts"
  ON public.group_feed_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.group_feed_posts p WHERE p.id = post_id AND is_group_member(auth.uid(), p.group_id)));

CREATE POLICY "Users can unlike posts"
  ON public.group_feed_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- RLS policies for comments
CREATE POLICY "Group members can view comments"
  ON public.group_feed_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.group_feed_posts p WHERE p.id = post_id AND is_group_member(auth.uid(), p.group_id)));

CREATE POLICY "Users can create comments"
  ON public.group_feed_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.group_feed_posts p WHERE p.id = post_id AND is_group_member(auth.uid(), p.group_id)));

CREATE POLICY "Users can delete own comments"
  ON public.group_feed_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Storage bucket for feed photos
INSERT INTO storage.buckets (id, name, public) VALUES ('feed-photos', 'feed-photos', true);

CREATE POLICY "Authenticated users can upload feed photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feed-photos');

CREATE POLICY "Anyone can view feed photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'feed-photos');

CREATE POLICY "Users can delete own feed photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'feed-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Enable realtime for feed posts
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_feed_posts;
