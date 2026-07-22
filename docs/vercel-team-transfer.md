# Vercel Team Transfer Instructions for Nicolas

This document outlines the steps Nicolas needs to execute to transfer the Corelyx Vercel project to the target team/organization.

## Prerequisites

- Nicolas must have **Owner** or **Admin** permissions on the current Vercel project
- Nicolas must have **Owner** permissions on the target Vercel team/organization
- Both Vercel accounts/teams must be on the same Vercel plan tier (or the target team must support the current plan)

## Pre-Transfer Checklist

- [ ] Verify all environment variables are documented in Vercel dashboard (Production, Preview, Development)
- [ ] Export/backup all environment variables from current project settings
- [ ] Verify all domains are documented (custom domains, preview deployments)
- [ ] Verify all integrations are documented (GitHub, Slack, Datadog, etc.)
- [ ] Notify team members of planned transfer window
- [ ] Ensure no active deployments are in progress

## Transfer Steps

### 1. Verify Current Project Settings
1. Go to https://vercel.com/dashboard
2. Select the current Corelyx project
3. Go to **Settings** → **General**
4. Note the **Project Name** and **Project ID**
5. Go to **Settings** → **Environment Variables** - export/screenshot all variables
6. Go to **Settings** → **Domains** - note all custom domains
7. Go to **Settings** → **Integrations** - note all connected integrations

### 2. Transfer Project to Target Team
1. In **Settings** → **General**, scroll to **Transfer Project**
2. Click **Transfer Project**
3. Select the target team/organization from the dropdown
4. Confirm the transfer by typing the project name
5. Click **Transfer Project**

### 3. Post-Transfer Verification
1. Switch to the target team in Vercel dashboard
2. Verify the project appears in the new team
3. Go to **Settings** → **General** and verify:
   - Project name is correct
   - Framework preset is "Next.js"
   - Build command: `pnpm --filter @flowos/web build` (or `pnpm build` from root)
   - Output directory: `.next`
   - Install command: `pnpm install`
4. Go to **Settings** → **Environment Variables** and re-add all variables:
   - Copy all Production, Preview, and Development variables
   - **Critical**: Ensure these production variables are set:
     - `INNGEST_EVENT_KEY`
     - `INNGEST_SIGNING_KEY`
     - `LEGAL_ENTITY_NAME`
     - `LEGAL_ADDRESS_LINE_1`
     - `LEGAL_POSTAL_CODE`
     - `LEGAL_CITY`
     - `LEGAL_COUNTRY`
     - `LEGAL_REPRESENTATIVE` (or `LEGAL_RESPONSIBLE_PERSON`)
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `NEXT_PUBLIC_APP_URL`
     - `INTERNAL_API_SECRET`
     - `STRIPE_SECRET_KEY`
     - `STRIPE_WEBHOOK_SECRET`
     - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
     - `RESEND_API_KEY`
     - `OPENAI_API_KEY`
     - `ANTHROPIC_API_KEY`
     - `GITHUB_CLIENT_ID`
     - `GITHUB_CLIENT_SECRET`
     - `AIRTABLE_CLIENT_ID`
     - `AIRTABLE_CLIENT_SECRET`
     - `VERCEL_AUTOMATION_BYPASS_SECRET` (if used)

### 4. Reconfigure Domains
1. Go to **Settings** → **Domains**
2. Re-add all custom domains
3. Update DNS records if nameservers changed
4. Verify SSL certificates provision correctly

### 5. Reconfigure Integrations
1. Go to **Settings** → **Integrations**
2. Reconnect:
   - GitHub (repository access)
   - Slack (notifications)
   - Datadog / Sentry / other monitoring
   - Any other integrations

### 6. Trigger Test Deployment
1. Go to **Deployments** tab
2. Click **Redeploy** on the latest production deployment
3. Or push a new commit to trigger a fresh deployment
4. Verify build passes (especially the `validate-env.ts` build step)
5. Verify deployment succeeds and site loads correctly

### 7. Verify Production Build Validation
The project now includes a build-time environment validation script (`scripts/validate-env.ts`) that runs during `vercel-build`. Verify the build fails appropriately if required production env vars are missing.

### 8. Update Team Access
1. Go to **Settings** → **Members**
2. Add team members with appropriate roles:
   - **Owner**: Nicolas (and any other owners)
   - **Member**: Developers who need deploy access
   - **Viewer**: Stakeholders who need view-only access
3. Remove old team members from the previous team if no longer needed

### 9. Update Local Development
Team members should:
1. Run `vercel link` in the project root to link to the new project
2. Run `vercel env pull` to sync environment variables locally
3. Verify `vercel dev` works correctly

## Rollback Plan
If issues arise:
1. Vercel transfers are reversible - go to the target team's project settings and transfer back
2. DNS changes may take time to propagate (up to 48 hours for NS records)
3. Keep the old team access for 24-48 hours as backup

## Post-Transfer Checklist
- [ ] Build passes with env validation
- [ ] Production deployment works
- [ ] Preview deployments work
- [ ] Custom domains resolve correctly
- [ ] SSL certificates valid
- [ ] All environment variables present in all environments
- [ ] Integrations working (GitHub checks, Slack notifications)
- [ ] Team members have correct access
- [ ] Monitoring/alerts firing correctly
- [ ] Documentation updated with new project URL/team

## Contact
If issues arise during transfer, contact Vercel Support at https://vercel.com/support with:
- Current project ID
- Target team slug
- Description of the issue