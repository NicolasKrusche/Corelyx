-- Make current user an admin
-- Run this in Supabase SQL Editor

UPDATE profiles 
SET is_admin = TRUE 
WHERE email = 'nicolas.krusche.09@gmail.com';  -- Change to your email

-- Verify
SELECT email, is_admin 
FROM profiles 
WHERE is_admin = TRUE;
