
-- Groups table
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'custom',
  emoji text NOT NULL DEFAULT '📅',
  invite_code text UNIQUE DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Group members table
CREATE TABLE public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Security definer function to check group membership
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id uuid, _group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id
  )
$$;

-- RLS for groups
CREATE POLICY "Members can view their groups"
ON public.groups FOR SELECT TO authenticated
USING (public.is_group_member(auth.uid(), id));

CREATE POLICY "Users can create groups"
ON public.groups FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creator can update groups"
ON public.groups FOR UPDATE TO authenticated
USING (created_by = auth.uid());

CREATE POLICY "Creator can delete groups"
ON public.groups FOR DELETE TO authenticated
USING (created_by = auth.uid());

-- RLS for group_members
CREATE POLICY "Members can view group members"
ON public.group_members FOR SELECT TO authenticated
USING (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Users manage own membership"
ON public.group_members FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add group_id to existing tables
ALTER TABLE public.events ADD COLUMN group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL;
ALTER TABLE public.habits ADD COLUMN group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL;
ALTER TABLE public.workouts ADD COLUMN group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL;

-- Group members can view group events
CREATE POLICY "Group members can view group events"
ON public.events FOR SELECT TO authenticated
USING (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id));

-- Group members can view group tasks
CREATE POLICY "Group members can view group tasks"
ON public.tasks FOR SELECT TO authenticated
USING (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id));

-- Group members can view group habits
CREATE POLICY "Group members can view group habits"
ON public.habits FOR SELECT TO authenticated
USING (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id));

-- Group members can view group workouts
CREATE POLICY "Group members can view group workouts"
ON public.workouts FOR SELECT TO authenticated
USING (group_id IS NOT NULL AND public.is_group_member(auth.uid(), group_id));

-- Function to create a group and add creator as admin
CREATE OR REPLACE FUNCTION public.create_group(_name text, _type text DEFAULT 'custom', _emoji text DEFAULT '📅')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_group_id uuid;
  new_invite_code text;
BEGIN
  INSERT INTO public.groups (name, type, emoji, created_by)
  VALUES (_name, _type, _emoji, auth.uid())
  RETURNING id, invite_code INTO new_group_id, new_invite_code;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (new_group_id, auth.uid(), 'admin');

  RETURN json_build_object('id', new_group_id, 'invite_code', new_invite_code);
END;
$$;

-- Function to join a group by invite code
CREATE OR REPLACE FUNCTION public.join_group(_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_group RECORD;
BEGIN
  SELECT id, name INTO target_group
  FROM public.groups
  WHERE invite_code = upper(_code);

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid invite code');
  END IF;

  IF EXISTS (SELECT 1 FROM public.group_members WHERE group_id = target_group.id AND user_id = auth.uid()) THEN
    RETURN json_build_object('error', 'You are already a member of this group');
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (target_group.id, auth.uid(), 'member');

  RETURN json_build_object('success', true, 'group_name', target_group.name, 'group_id', target_group.id);
END;
$$;

-- Function to leave a group
CREATE OR REPLACE FUNCTION public.leave_group(_group_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.group_members
  WHERE group_id = _group_id AND user_id = auth.uid();

  RETURN json_build_object('success', true);
END;
$$;

-- Auto-migrate existing partner relationships into couple groups
DO $$
DECLARE
  pair RECORD;
  new_group_id uuid;
BEGIN
  FOR pair IN
    SELECT p1.id AS user1_id, p1.display_name AS user1_name,
           p1.partner_id AS user2_id, p2.display_name AS user2_name
    FROM public.profiles p1
    JOIN public.profiles p2 ON p1.partner_id = p2.id
    WHERE p1.id < p1.partner_id
  LOOP
    INSERT INTO public.groups (name, type, emoji, created_by)
    VALUES (pair.user1_name || ' & ' || pair.user2_name, 'couple', '💑', pair.user1_id)
    RETURNING id INTO new_group_id;

    INSERT INTO public.group_members (group_id, user_id, role)
    VALUES (new_group_id, pair.user1_id, 'admin'),
           (new_group_id, pair.user2_id, 'admin');

    UPDATE public.events SET group_id = new_group_id WHERE user_id IN (pair.user1_id, pair.user2_id);
    UPDATE public.tasks SET group_id = new_group_id WHERE user_id IN (pair.user1_id, pair.user2_id);
    UPDATE public.habits SET group_id = new_group_id WHERE user_id IN (pair.user1_id, pair.user2_id);
    UPDATE public.workouts SET group_id = new_group_id WHERE user_id IN (pair.user1_id, pair.user2_id);
  END LOOP;
END;
$$;
