
-- Create study_sessions table
CREATE TABLE public.study_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  group_id UUID REFERENCES public.groups(id),
  subject TEXT NOT NULL DEFAULT 'Other',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

-- Users manage own sessions
CREATE POLICY "Users manage own study sessions"
ON public.study_sessions
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Group members can view group sessions
CREATE POLICY "Group members can view group study sessions"
ON public.study_sessions
FOR SELECT
TO authenticated
USING (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.study_sessions;
