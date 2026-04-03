-- Nutrition goals per user per group
CREATE TABLE public.nutrition_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  protein_goal integer NOT NULL DEFAULT 150,
  calorie_goal integer DEFAULT NULL,
  show_calories boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

ALTER TABLE public.nutrition_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own nutrition goals"
  ON public.nutrition_goals FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Meal logs
CREATE TABLE public.meal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  meal_date date NOT NULL DEFAULT CURRENT_DATE,
  meal_type text NOT NULL DEFAULT 'snack',
  title text NOT NULL,
  ingredients jsonb DEFAULT '[]'::jsonb,
  prep_steps jsonb DEFAULT '[]'::jsonb,
  protein integer NOT NULL DEFAULT 0,
  calories integer DEFAULT 0,
  is_ai_generated boolean NOT NULL DEFAULT false,
  ai_tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meal logs"
  ON public.meal_logs FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Group members can view meal logs"
  ON public.meal_logs FOR SELECT
  TO authenticated
  USING (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id));

-- AI meal suggestions (cached per day)
CREATE TABLE public.ai_meal_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  suggestion_date date NOT NULL DEFAULT CURRENT_DATE,
  meal_type text NOT NULL DEFAULT 'lunch',
  title text NOT NULL,
  ingredients jsonb DEFAULT '[]'::jsonb,
  prep_steps jsonb DEFAULT '[]'::jsonb,
  protein integer NOT NULL DEFAULT 0,
  calories integer DEFAULT 0,
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_meal_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own meal suggestions"
  ON public.ai_meal_suggestions FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());