
-- Add is_ai_coach flag to messages table to distinguish coach messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_ai_coach boolean NOT NULL DEFAULT false;

-- Add metadata column for structured AI responses (plan previews, suggestions etc)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

-- Create coach conversation state table
CREATE TABLE public.coach_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  phase text NOT NULL DEFAULT 'gathering',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own coach conversations"
  ON public.coach_conversations FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
