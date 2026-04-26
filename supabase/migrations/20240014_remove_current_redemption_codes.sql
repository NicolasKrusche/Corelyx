-- FlowOS — remove all currently active redemption codes
-- This revokes every live code while keeping redemption history intact.

UPDATE public.redemption_codes
SET is_active = FALSE
WHERE is_active = TRUE;
