
CREATE TABLE public.sobriety_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid REFERENCES public.groups(id),
  label text NOT NULL,
  icon text NOT NULL DEFAULT '🚫',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  money_per_day numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sobriety_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sobriety categories"
  ON public.sobriety_categories FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Group members can view group sobriety categories"
  ON public.sobriety_categories FOR SELECT
  TO authenticated
  USING (group_id IS NOT NULL AND is_group_member(auth.uid(), group_id));

CREATE TABLE public.sobriety_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.sobriety_categories(id) ON DELETE CASCADE,
  check_date date NOT NULL,
  stayed_on_track boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, check_date)
);

ALTER TABLE public.sobriety_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own sobriety checkins"
  ON public.sobriety_checkins FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
