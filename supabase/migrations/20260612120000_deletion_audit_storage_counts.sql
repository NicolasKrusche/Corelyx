-- Account deletion now purges the user's Supabase Storage objects (avatars
-- bucket, folder = user id). Track the result in the deletion audit receipt.

ALTER TABLE public.account_deletion_audit
  ADD COLUMN IF NOT EXISTS storage_objects_seen    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_objects_deleted INTEGER NOT NULL DEFAULT 0;
