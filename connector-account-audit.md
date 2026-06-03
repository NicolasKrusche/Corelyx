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
| github | blocked | Browser login via Google reached GitHub 2FA/SMS. GitHub app is available in Codex, but provider browser account setup cannot continue without 2FA. |
