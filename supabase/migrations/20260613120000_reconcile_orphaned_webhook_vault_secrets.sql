-- One-off reconciliation: purge orphaned webhook-secret Vault entries.
--
-- Before the account-deletion path was extended to cover
-- connection_webhook_secrets, deleting an account cascade-removed those rows but
-- left the Vault secrets they referenced behind, with nothing pointing at them.
-- Those secrets are named 'webhook:<provider>:<connectionId>:<secretName>'
-- (see lib/connection-webhook-secrets.ts) and now have no surviving
-- connection_webhook_secrets row referencing them.
--
-- We only delete entries with no referencing row, and only those older than a
-- day, so an in-flight webhook-secret creation (Vault write committed, row
-- insert not yet) can never be caught by this sweep.

DELETE FROM vault.secrets v
 WHERE v.name LIKE 'webhook:%'
   AND v.created_at < NOW() - INTERVAL '1 day'
   AND NOT EXISTS (
     SELECT 1
       FROM public.connection_webhook_secrets s
      WHERE s.vault_secret_id = v.id
   );
