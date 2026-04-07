
-- Add onboarding fields to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS join_type text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS selected_interests text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by uuid;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code text DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

-- Create onboarding_preferences table
CREATE TABLE IF NOT EXISTS onboarding_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  preferences jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, category)
);

ALTER TABLE onboarding_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own onboarding preferences"
ON onboarding_preferences FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Create referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  premium_granted boolean DEFAULT false,
  UNIQUE(referrer_id, referred_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referrals"
ON referrals FOR SELECT TO authenticated
USING (referrer_id = auth.uid() OR referred_id = auth.uid());

CREATE POLICY "Users can insert referrals"
ON referrals FOR INSERT TO authenticated
WITH CHECK (referrer_id = auth.uid() OR referred_id = auth.uid());

-- Backfill referral_code for existing profiles that don't have one
UPDATE profiles SET referral_code = upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))
WHERE referral_code IS NULL;
