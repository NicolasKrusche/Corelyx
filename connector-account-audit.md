# Corelyx Connector Account Audit

Date: 2026-06-03

Scope: all runtime connector files in `apps/runtime/connectors` except framework helpers.

Rules:
- Try `office@corelyx.app` first when an email signup is practical.
- Fall back to `nicolas.krusche.09@gmail.com` when `office@corelyx.app` is rejected or verification does not arrive.
- Skip or block anything requiring payment, phone verification, CAPTCHA/MFA, admin approval, or unsafe secret disclosure.
- Do not generate one-time-visible secrets unless there is a secure place to store them.

## Completed / Prepared

| Provider | Status | Account / Project | Connection Info | Notes |
| --- | --- | --- | --- | --- |
| google / gmail / sheets / calendar / docs / drive / googleforms / googlechat / googleanalytics / youtube | prepared | Google Cloud project `archeon-001` | OAuth client `762755784112-evi6oln44lo9v1ho6u5skjc30gp1tik1.apps.googleusercontent.com`; redirect includes `https://www.corelyx.app/api/connections/oauth/google/callback` | Existing client secret is not fully visible anymore (`****_jE6` only). |
| bigquery | prepared | Google Cloud project `archeon-001` | BigQuery Sandbox visible, no billing upgrade performed | Free sandbox mode. |
| mongodb | prepared | Org `68e2642ddeb4b70ed304eb5a`, project `Corelyx` / `6a207b47ef33c3b79aedc186` | Project exists; no cluster created | Existing old project `Project 0` has paused cluster `ANALYZER`; resume would restore hourly charges. |
| databricks | ready | `nicolas.krusche.09@gmail.com` | Workspace `https://dbc-2ef83c0e-3068.cloud.databricks.com`; account `4d429d22-38a1-4977-ac51-addd5258b531`; workspace/org param `7474645772732877` | Free Edition, no card. Personal access token page exists; token not generated yet. |
| airbyte | ready | `nicolas.krusche.09@gmail.com` | Org `155d718c-3e16-4fd2-916d-ca9626814db8`; workspace `06348546-9997-4294-add5-f63925eb0b2d` | Trial starts after first sync; no sync started. |
| dockerhub | ready | `nicolas.krusche.09@gmail.com` | Username `corelyx` | Docker sent a later confirmation mail: account verified. Browser session ended on auth error, but verification completed. |
| airtable | ready | `nicolas.krusche.09@gmail.com` | User `usr0ZZs0pH1I51oPI`; workspace `My First Workspace` / `wspvQNt8fDVUj8rY5`; OAuth integration `oapb2Zv47H84I2mgh` | Google login works. Trial-expired dialog was dismissed; no paid upgrade selected. |
| linear | ready | `nicolas.krusche.09@gmail.com` | Workspace `Corelyx`; slug `corelyx`; region `European Union`; team `Corelyx`; team key `COR`; URL `https://linear.app/corelyx/team/COR/active` | Google OAuth login works. GitHub/Slack onboarding skipped. Newsletter boxes were unchecked. |
| typeform | ready | `nicolas.krusche.09@gmail.com` | Account `01KPV93KEBQ268SSH05T9CQ7TA`; workspace `My workspace` / `ea4TX7`; existing form `fFUMB0L1` | Google/Okta auth works. Free banner shows 10 form responses/month. |
| todoist | ready | `nicolas.krusche.09@gmail.com` | User ID `59327057`; status `free`; type `solo`; inbox URL `https://app.todoist.com/app/inbox` | Google OAuth login works. Calendar integration skipped. Pro trial upsell shown but not started. |
| calendly | ready | `nicolas.krusche.09@gmail.com` | Profile `https://calendly.com/nicolas-krusche-09`; event type `30 Minute Meeting`; live URL `https://calendly.com/nicolas-krusche-09/30min`; Google Calendar connected | Solo scheduling setup. Calendar OAuth granted for Calendly. No paid upgrade selected. |

## Corelyx OAuth App Requirements

Production app URL assumed from the user prompt: `https://corelyx.app`.
Some existing Google redirect URIs use `https://www.corelyx.app`; keep both host variants where the provider allows multiple redirect URLs.

| Provider | Required env vars | Redirect URI for provider app | Current setup data |
| --- | --- | --- | --- |
| google / gmail / sheets / calendar / docs / drive | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` | `https://corelyx.app/api/connections/oauth/google/callback`; Gmail route also uses `https://corelyx.app/api/connections/oauth/gmail/callback` | Client ID `762755784112-evi6oln44lo9v1ho6u5skjc30gp1tik1.apps.googleusercontent.com`; secret must be recovered/rotated in Google Cloud if not already in env. |
| airtable | `AIRTABLE_CLIENT_ID`, `AIRTABLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` | `https://corelyx.app/api/connections/oauth/airtable/callback` | Developer OAuth app `Corelyx` / integration `oapb2Zv47H84I2mgh`; `AIRTABLE_CLIENT_ID=55923ad7-0f87-4fac-b300-720cde432077`; scopes selected: `data.records:read`, `data.records:write`, `schema.bases:read`; secret stored in local ignored `.env.oauth.local`. |
| linear | `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` | `https://corelyx.app/api/connections/oauth/linear/callback` | Developer OAuth app `Corelyx` / app UUID `20431a08-eb91-4f7a-bff7-8a6028340082`; `LINEAR_CLIENT_ID=d7d8d541909a99d318347bc7918e9fd0`; secret stored in local ignored `.env.oauth.local`. |
| typeform | `TYPEFORM_CLIENT_ID`, `TYPEFORM_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` | `https://corelyx.app/api/connections/oauth/typeform/callback` | Developer app `Corelyx`; `TYPEFORM_CLIENT_ID=7KXiCTnNTeH85RyTdjCyuAziNidmSfRdh9kZAdS2KV7Y`; secret stored in local ignored `.env.oauth.local`. |
| todoist | `TODOIST_CLIENT_ID`, `TODOIST_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` | `https://corelyx.app/api/connections/oauth/todoist/callback` | Developer app `Corelyx` / app ID `120229`; `TODOIST_CLIENT_ID=a126982ae24f4cda92e1f0b265ae19f6`; redirect set; secret stored in local ignored `.env.oauth.local`. |
| calendly | `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` | `https://corelyx.app/api/connections/oauth/calendly/callback` | Developer OAuth app `Corelyx`; `CALENDLY_CLIENT_ID=RNK2vyfCdlb2TLvOMHO3IcFuQ-u_Kuk08qSRh8lz_ig`; scopes selected: `event_types:read`, `scheduled_events:read`, `organizations:read`, `users:read`; secret and webhook signing key stored in local ignored `.env.oauth.local`. |
| trello | `TRELLO_API_KEY`, `NEXT_PUBLIC_APP_URL` | `https://corelyx.app/api/connections/oauth/trello/callback` | Account creation blocked by reCAPTCHA; Trello app key still needed. Runtime connector also accepts user token plus `TRELLO_API_KEY`. |

## Blocked / Skipped So Far

| Provider | Status | Reason |
| --- | --- | --- |
| sharepoint / excel online / dynamics365 / powerbi / azuredevops / entra / outlook / teams / onedrive / onenote / azure blob | skipped | Microsoft account setup deferred by user. |
| snowflake | blocked | Signup rejected both `office@corelyx.app` and Gmail as valid email/work email. |
| postgres / mysql | needs external DB | No central SaaS account; needs actual database host/user/password. |
| aws lambda / dynamodb / ses / awss3 | blocked | New AWS account signup reaches account creation path and normally requires phone/billing verification. |
| fivetran | blocked | Google signup reached final profile form, but `Get started` stayed disabled after required fields; likely hidden validation/CAPTCHA or Gmail/company-email issue. |
| dbt cloud | blocked | Signup needs password plus reCAPTCHA/terms flow; no secure password store available. |
| notion | blocked | `office@corelyx.app` code mail arrived, but Notion rejected the visible code; magic link returned to the same error; Google login requires popup flow unsupported by current in-app browser session. |
| slack | blocked | Google get-started OAuth callback returned Slack generic error. Email signup shows embedded verification iframe and keeps Continue disabled. |
