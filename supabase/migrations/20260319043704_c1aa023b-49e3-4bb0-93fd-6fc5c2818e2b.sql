
-- Group chat messages table
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Members can read messages in their groups
CREATE POLICY "Group members can read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (is_group_member(auth.uid(), group_id));

-- Members can insert messages in their groups
CREATE POLICY "Group members can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_group_member(auth.uid(), group_id));

-- Users can delete own messages
CREATE POLICY "Users can delete own messages"
  ON public.messages FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Hidden Google Calendar events table
CREATE TABLE public.hidden_gcal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gcal_event_id text NOT NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, gcal_event_id)
);

ALTER TABLE public.hidden_gcal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own hidden gcal events"
  ON public.hidden_gcal_events FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
