
-- Create friendships table
CREATE TABLE public.friendships (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT friendships_status_check CHECK (status IN ('pending', 'accepted', 'declined')),
  CONSTRAINT friendships_no_self CHECK (requester_id != addressee_id),
  CONSTRAINT friendships_unique_pair UNIQUE (requester_id, addressee_id)
);

-- Enable RLS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Users can see friendships they are part of
CREATE POLICY "Users can view own friendships"
ON public.friendships FOR SELECT TO authenticated
USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Users can send friend requests (insert)
CREATE POLICY "Users can send friend requests"
ON public.friendships FOR INSERT TO authenticated
WITH CHECK (requester_id = auth.uid() AND status = 'pending');

-- Users can update friendships they received (accept/decline) or cancel ones they sent
CREATE POLICY "Users can update friendships"
ON public.friendships FOR UPDATE TO authenticated
USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Users can delete friendships they are part of
CREATE POLICY "Users can delete friendships"
ON public.friendships FOR DELETE TO authenticated
USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
