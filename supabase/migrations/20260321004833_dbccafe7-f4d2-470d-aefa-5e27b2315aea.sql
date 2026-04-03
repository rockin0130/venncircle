-- Fix Evelyn's habits: normalize category from 'morning' to 'morning-habits' for the shared group
UPDATE habits 
SET category = 'morning-habits' 
WHERE user_id = '33e53f06-d666-4c4c-b82b-95d2bf5a3c1e' 
  AND group_id = '783c1fdb-b6e4-4cd9-ae79-b326fcb42372' 
  AND category = 'morning';

-- Also create a morning-habits section for Evelyn in this group so the section metadata exists
INSERT INTO habit_sections (user_id, group_id, key, label, icon, sort_order)
VALUES ('33e53f06-d666-4c4c-b82b-95d2bf5a3c1e', '783c1fdb-b6e4-4cd9-ae79-b326fcb42372', 'morning-habits', 'Morning Habits', '☀️', 0)
ON CONFLICT DO NOTHING;