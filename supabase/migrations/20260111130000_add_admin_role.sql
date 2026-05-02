-- Migration: Add admin role to profiles
-- Created: 2026-01-11

-- Add is_admin column to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Create index for admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin 
ON profiles(is_admin) 
WHERE is_admin = TRUE;

-- Update RLS policies to allow admin access
-- (Existing policies will still work, admins get special privileges)

-- Add comment
COMMENT ON COLUMN profiles.is_admin IS 'Whether user has admin access to system dashboards';
