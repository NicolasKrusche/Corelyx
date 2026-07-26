-- Template Marketplace v1: Seed 10 curated marketplace templates
-- These are the "featured" templates that power the Template Marketplace UI.
-- Each template has a program_json (valid ProgramSchema) and genesis_prompt for re-generation.
-- All templates are public and categorized for easy discovery.

DO $$
DECLARE
  t_id uuid;
BEGIN

-- ─── 1. Gmail → Slack Notification ────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Gmail → Slack Notification',
  'Forward important emails to a Slack channel automatically. AI filters and summarizes each message before posting.',
  'general',
  'easy',
  '< 1 Min',
  ARRAY['Gmail', 'Slack'],
  ARRAY['email', 'slack', 'notification', 'ai'],
  'Monitor Gmail for important emails, summarize each with AI, and post notifications to a Slack channel.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000011",
    "program_name": "Gmail → Slack Notification",
    "created_at": "2026-07-23T00:00:00Z",
    "updated_at": "2026-07-23T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Every hour","description":"Check for new emails every hour.","connection":null,"config":{"trigger_type":"cron","expression":"0 * * * *","timezone":"UTC"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"gmail-1","type":"connection","label":"Fetch unread emails","description":"Lists unread emails from Gmail inbox.","connection":null,"config":{"scope_access":"read","scope_required":["https://www.googleapis.com/auth/gmail.readonly"],"operation":"list_emails","operation_params":{"query":"is:unread label:inbox","max_results":10}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"filter-1","type":"step","label":"Skip if no emails","description":"Stops if inbox is empty.","connection":null,"config":{"logic_type":"filter","condition":"len(data.get(\"emails\", [])) > 0","pass_schema":null},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"agent-1","type":"agent","label":"Summarize with AI","description":"Produce a concise summary of each email.","connection":null,"config":{"model":"__USER_ASSIGNED__","api_key_ref":"__USER_ASSIGNED__","system_prompt":"Summarize the email list in 3 bullet points. Return JSON: {\"summary\": \"...\"}","input_schema":null,"output_schema":null,"requires_approval":false,"approval_timeout_hours":24,"scope_required":null,"scope_access":"read","retry":{"max_attempts":3,"backoff":"exponential","backoff_base_seconds":5,"fail_program_on_exhaust":false},"tools":[]},"position":{"x":1060,"y":200},"status":"idle"},
      {"id":"slack-1","type":"connection","label":"Post to Slack","description":"Send the summary to Slack.","connection":null,"config":{"scope_access":"write","scope_required":["chat:write"],"operation":"send_message","operation_params":{"channel":"__USER_ASSIGNED__","text":"*Email Summary*\n{{agent-1.summary}}"}},"position":{"x":1380,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"gmail-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"gmail-1","to":"filter-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"filter-1","to":"agent-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e4","from":"agent-1","to":"slack-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"cron","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Forward important emails to Slack with AI summaries.","genesis_model":"template","genesis_timestamp":"2026-07-23T00:00:00Z","tags":["email","slack","notification","ai"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
) RETURNING id INTO t_id;

-- ─── 2. Notion → Google Sheets Sync ──────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Notion → Google Sheets Sync',
  'Keep your Google Sheets in sync with Notion database entries. Automatically sync new and updated records.',
  'general',
  'medium',
  '~ 2 Min',
  ARRAY['Notion', 'Sheets'],
  ARRAY['notion', 'sheets', 'sync', 'data'],
  'Sync Notion database entries to Google Sheets automatically. Fetch new records from Notion and append them as rows in Sheets.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000012",
    "program_name": "Notion → Google Sheets Sync",
    "created_at": "2026-07-23T00:00:00Z",
    "updated_at": "2026-07-23T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Every 30 min","description":"Sync every 30 minutes.","connection":null,"config":{"trigger_type":"cron","expression":"*/30 * * * *","timezone":"UTC"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"notion-1","type":"connection","label":"Query Notion database","description":"Fetch records from the configured Notion database.","connection":null,"config":{"scope_access":"read","scope_required":[],"operation":"query_database","operation_params":{"database_id":"__USER_ASSIGNED__"}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"filter-1","type":"step","label":"Skip if empty","description":"No new records found.","connection":null,"config":{"logic_type":"filter","condition":"len(data.get(\"results\", [])) > 0","pass_schema":null},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"sheets-1","type":"connection","label":"Append to Google Sheets","description":"Add new records as rows in the spreadsheet.","connection":null,"config":{"scope_access":"write","scope_required":["https://www.googleapis.com/auth/spreadsheets"],"operation":"append_row","operation_params":{"spreadsheet_id":"__USER_ASSIGNED__","range":"Sheet1","values":"{{notion-1.results}}"}},"position":{"x":1060,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"notion-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"notion-1","to":"filter-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"filter-1","to":"sheets-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"cron","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Sync Notion database entries to Google Sheets.","genesis_model":"template","genesis_timestamp":"2026-07-23T00:00:00Z","tags":["notion","sheets","sync","data"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 3. GitHub → Linear Issue Creation ────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'GitHub → Linear Issue Creation',
  'Automatically create Linear issues from new GitHub issues. Keeps your project tracking in sync with your code repository.',
  'devops',
  'easy',
  '< 1 Min',
  ARRAY['GitHub', 'Linear'],
  ARRAY['github', 'linear', 'issues', 'devops'],
  'When a new GitHub issue is created, automatically create a corresponding Linear issue with the same title and description.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000013",
    "program_name": "GitHub → Linear Issue Creation",
    "created_at": "2026-07-23T00:00:00Z",
    "updated_at": "2026-07-23T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"New GitHub issue","description":"Fires when a new issue is opened.","connection":null,"config":{"trigger_type":"webhook","endpoint_id":"00000000-0000-0000-0000-000000000013","method":"POST"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"github-1","type":"connection","label":"Get issue details","description":"Fetch full issue data from GitHub.","connection":null,"config":{"scope_access":"read","scope_required":["repo"],"operation":"create_issue","operation_params":{"owner":"__USER_ASSIGNED__","repo":"__USER_ASSIGNED__","title":"{{trigger-1.issue.title}}","body":"{{trigger-1.issue.body}}"}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"linear-1","type":"connection","label":"Create Linear issue","description":"Create a new issue in Linear.","connection":null,"config":{"scope_access":"write","scope_required":[],"operation":"create_issue","operation_params":{"title":"{{trigger-1.issue.title}}","description":"{{trigger-1.issue.body}}","team_id":"__USER_ASSIGNED__"}},"position":{"x":740,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"github-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"github-1","to":"linear-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"webhook","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Create Linear issues from new GitHub issues.","genesis_model":"template","genesis_timestamp":"2026-07-23T00:00:00Z","tags":["github","linear","issues","devops"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 4. Typeform → Email Confirmation ────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Typeform → Email Confirmation',
  'Send a personalized confirmation email when someone submits a Typeform. Perfect for registration forms and lead capture.',
  'marketing',
  'easy',
  '< 1 Min',
  ARRAY['Typeform', 'Gmail'],
  ARRAY['typeform', 'email', 'confirmation', 'marketing'],
  'When a Typeform is submitted, extract the respondent email and send a personalized confirmation.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000014",
    "program_name": "Typeform → Email Confirmation",
    "created_at": "2026-07-23T00:00:00Z",
    "updated_at": "2026-07-23T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Typeform submission","description":"Fires when a form is submitted.","connection":null,"config":{"trigger_type":"webhook","endpoint_id":"00000000-0000-0000-0000-000000000014","method":"POST"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"typeform-1","type":"connection","label":"Get form responses","description":"Fetch the latest responses from the form.","connection":null,"config":{"scope_access":"read","scope_required":[],"operation":"get_responses","operation_params":{"form_id":"__USER_ASSIGNED__","page_size":1}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"gmail-1","type":"connection","label":"Send confirmation email","description":"Send a thank-you email to the respondent.","connection":null,"config":{"scope_access":"write","scope_required":["https://www.googleapis.com/auth/gmail.send"],"operation":"send_email","operation_params":{"to":"__USER_ASSIGNED__","subject":"Thank you for your submission!","body":"Hi! We received your form submission. Thank you for your time."}},"position":{"x":740,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"typeform-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"typeform-1","to":"gmail-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"webhook","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Send confirmation emails for Typeform submissions.","genesis_model":"template","genesis_timestamp":"2026-07-23T00:00:00Z","tags":["typeform","email","confirmation","marketing"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 5. Stripe → Invoice Generation ──────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Stripe → Invoice Generation',
  'Automatically generate and send invoices when Stripe payments complete. Includes AI-powered invoice formatting.',
  'ecommerce',
  'medium',
  '~ 2 Min',
  ARRAY['Stripe', 'Gmail'],
  ARRAY['stripe', 'invoice', 'payment', 'billing'],
  'When a Stripe payment succeeds, generate a professional invoice and email it to the customer.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000015",
    "program_name": "Stripe → Invoice Generation",
    "created_at": "2026-07-23T00:00:00Z",
    "updated_at": "2026-07-23T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Payment succeeded","description":"Fires when a Stripe payment completes.","connection":null,"config":{"trigger_type":"webhook","endpoint_id":"00000000-0000-0000-0000-000000000015","method":"POST"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"stripe-1","type":"connection","label":"Get payment details","description":"Fetch payment details from Stripe.","connection":null,"config":{"scope_access":"read","scope_required":[],"operation":"retrieve_invoice","operation_params":{"invoice_id":"__USER_ASSIGNED__"}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"agent-1","type":"agent","label":"Format invoice","description":"AI formats the invoice data.","connection":null,"config":{"model":"__USER_ASSIGNED__","api_key_ref":"__USER_ASSIGNED__","system_prompt":"Format this payment data into a professional invoice email. Return JSON: {\"subject\": \"...\", \"body\": \"...\"}","input_schema":null,"output_schema":null,"requires_approval":false,"approval_timeout_hours":24,"scope_required":null,"scope_access":"read","retry":{"max_attempts":3,"backoff":"exponential","backoff_base_seconds":5,"fail_program_on_exhaust":false},"tools":[]},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"gmail-1","type":"connection","label":"Send invoice email","description":"Email the invoice to the customer.","connection":null,"config":{"scope_access":"write","scope_required":["https://www.googleapis.com/auth/gmail.send"],"operation":"send_email","operation_params":{"to":"__USER_ASSIGNED__","subject":"{{agent-1.subject}}","body":"{{agent-1.body}}"}},"position":{"x":1060,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"stripe-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"stripe-1","to":"agent-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"agent-1","to":"gmail-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"webhook","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Generate and send invoices after Stripe payments.","genesis_model":"template","genesis_timestamp":"2026-07-23T00:00:00Z","tags":["stripe","invoice","payment","billing"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 6. Shopify → Inventory Sync ─────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Shopify → Inventory Sync',
  'Monitor Shopify inventory levels and sync low-stock alerts to Google Sheets. Track inventory changes over time.',
  'ecommerce',
  'medium',
  '~ 2 Min',
  ARRAY['HTTP', 'Sheets'],
  ARRAY['shopify', 'inventory', 'sync', 'ecommerce'],
  'Check Shopify inventory levels periodically and log changes to a Google Sheet for tracking and alerts.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000016",
    "program_name": "Shopify → Inventory Sync",
    "created_at": "2026-07-23T00:00:00Z",
    "updated_at": "2026-07-23T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Every 6 hours","description":"Check inventory every 6 hours.","connection":null,"config":{"trigger_type":"cron","expression":"0 */6 * * *","timezone":"UTC"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"http-1","type":"connection","label":"Fetch Shopify products","description":"Get product inventory from Shopify API.","connection":null,"config":{"connector_type":"http","method":"GET","url":"__USER_ASSIGNED__","auth_type":"bearer","auth_value":"__USER_ASSIGNED__","query_params":[],"headers":[],"body":null,"parse_response":true,"timeout_seconds":30,"retry":null},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"filter-1","type":"step","label":"Skip if no changes","description":"Only proceed if there are products.","connection":null,"config":{"logic_type":"filter","condition":"len(data.get(\"products\", [])) > 0","pass_schema":null},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"sheets-1","type":"connection","label":"Log to Google Sheets","description":"Append inventory data to spreadsheet.","connection":null,"config":{"scope_access":"write","scope_required":["https://www.googleapis.com/auth/spreadsheets"],"operation":"append_row","operation_params":{"spreadsheet_id":"__USER_ASSIGNED__","range":"Inventory","values":"{{http-1.products}}"}},"position":{"x":1060,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"http-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"http-1","to":"filter-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"filter-1","to":"sheets-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"cron","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Sync Shopify inventory to Google Sheets.","genesis_model":"template","genesis_timestamp":"2026-07-23T00:00:00Z","tags":["shopify","inventory","sync","ecommerce"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 7. HubSpot → CRM Update ────────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'HubSpot → CRM Update',
  'Keep your CRM updated automatically when HubSpot contacts change. Sync contact details and deal stages.',
  'sales',
  'easy',
  '< 1 Min',
  ARRAY['HubSpot'],
  ARRAY['hubspot', 'crm', 'contacts', 'sales'],
  'Monitor HubSpot contact changes and automatically update your CRM records with the latest information.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000017",
    "program_name": "HubSpot → CRM Update",
    "created_at": "2026-07-23T00:00:00Z",
    "updated_at": "2026-07-23T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Every hour","description":"Check for updates hourly.","connection":null,"config":{"trigger_type":"cron","expression":"0 * * * *","timezone":"UTC"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"hubspot-1","type":"connection","label":"List contacts","description":"Fetch recent HubSpot contacts.","connection":null,"config":{"scope_access":"read","scope_required":[],"operation":"list_contacts","operation_params":{"limit":50}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"filter-1","type":"step","label":"Skip if empty","description":"No contacts found.","connection":null,"config":{"logic_type":"filter","condition":"len(data.get(\"contacts\", [])) > 0","pass_schema":null},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"loop-1","type":"step","label":"Loop over contacts","description":"Process each contact.","connection":null,"config":{"logic_type":"loop","over":"data['contacts']","item_var":"contact"},"position":{"x":1060,"y":200},"status":"idle"},
      {"id":"hubspot-2","type":"connection","label":"Update CRM","description":"Update the contact record.","connection":null,"config":{"scope_access":"write","scope_required":[],"operation":"update_contact","operation_params":{"contact_id":"{{loop-1.contact.id}}","firstname":"{{loop-1.contact.firstname}}","lastname":"{{loop-1.contact.lastname}}","email":"{{loop-1.contact.email}}"}},"position":{"x":1380,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"hubspot-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"hubspot-1","to":"filter-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"filter-1","to":"loop-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e4","from":"loop-1","to":"hubspot-2","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"cron","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Sync HubSpot contacts to CRM.","genesis_model":"template","genesis_timestamp":"2026-07-23T00:00:00Z","tags":["hubspot","crm","contacts","sales"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 8. Webhook → Database Write ─────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Webhook → Database Write',
  'Receive webhook data and write it directly to your database. Perfect for integrating external services with your data layer.',
  'general',
  'easy',
  '< 1 Min',
  ARRAY['HTTP', 'Supabase'],
  ARRAY['webhook', 'database', 'integration', 'api'],
  'Receive a webhook payload, validate the data, and write it to a database table.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000018",
    "program_name": "Webhook → Database Write",
    "created_at": "2026-07-23T00:00:00Z",
    "updated_at": "2026-07-23T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Incoming webhook","description":"Receives HTTP POST payloads.","connection":null,"config":{"trigger_type":"webhook","endpoint_id":"00000000-0000-0000-0000-000000000018","method":"POST"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"step-1","type":"step","label":"Validate data","description":"Validate incoming payload.","connection":null,"config":{"logic_type":"filter","condition":"data.get(\"payload\") is not None","pass_schema":null},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"http-1","type":"connection","label":"Write to database","description":"Insert data into the database via API.","connection":null,"config":{"connector_type":"http","method":"POST","url":"__USER_ASSIGNED__","auth_type":"bearer","auth_value":"__USER_ASSIGNED__","query_params":[],"headers":[{"key":"Content-Type","value":"application/json"}],"body":"{{trigger-1.payload}}","parse_response":true,"timeout_seconds":30,"retry":null},"position":{"x":740,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"step-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"step-1","to":"http-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"webhook","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Receive webhooks and write data to database.","genesis_model":"template","genesis_timestamp":"2026-07-23T00:00:00Z","tags":["webhook","database","integration","api"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 9. RSS → Social Media Post ──────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'RSS → Social Media Post',
  'Automatically share new RSS feed items on your social media channels. AI rewrites content for each platform.',
  'marketing',
  'medium',
  '~ 2 Min',
  ARRAY['HTTP', 'Slack'],
  ARRAY['rss', 'social', 'content', 'marketing'],
  'Monitor RSS feeds for new articles, use AI to rewrite them for social media, and post to your channels.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000019",
    "program_name": "RSS → Social Media Post",
    "created_at": "2026-07-23T00:00:00Z",
    "updated_at": "2026-07-23T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Every 4 hours","description":"Check RSS feeds every 4 hours.","connection":null,"config":{"trigger_type":"cron","expression":"0 */4 * * *","timezone":"UTC"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"http-1","type":"connection","label":"Fetch RSS feed","description":"Get latest RSS feed items.","connection":null,"config":{"connector_type":"http","method":"GET","url":"__USER_ASSIGNED__","auth_type":"none","auth_value":null,"query_params":[],"headers":[],"body":null,"parse_response":true,"timeout_seconds":30,"retry":null},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"filter-1","type":"step","label":"Skip if empty","description":"No new items.","connection":null,"config":{"logic_type":"filter","condition":"len(data.get(\"items\", [])) > 0","pass_schema":null},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"agent-1","type":"agent","label":"Rewrite for social","description":"AI rewrites content for social media.","connection":null,"config":{"model":"__USER_ASSIGNED__","api_key_ref":"__USER_ASSIGNED__","system_prompt":"Rewrite this article for social media. Make it engaging and concise. Return JSON: {\"post\": \"...\", \"hashtags\": \"...\"}","input_schema":null,"output_schema":null,"requires_approval":false,"approval_timeout_hours":24,"scope_required":null,"scope_access":"read","retry":{"max_attempts":3,"backoff":"exponential","backoff_base_seconds":5,"fail_program_on_exhaust":false},"tools":[]},"position":{"x":1060,"y":200},"status":"idle"},
      {"id":"slack-1","type":"connection","label":"Post to social channel","description":"Share the rewritten post.","connection":null,"config":{"scope_access":"write","scope_required":["chat:write"],"operation":"send_message","operation_params":{"channel":"__USER_ASSIGNED__","text":"{{agent-1.post}}\n\n{{agent-1.hashtags}}"}},"position":{"x":1380,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"http-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"http-1","to":"filter-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"filter-1","to":"agent-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e4","from":"agent-1","to":"slack-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"cron","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Share RSS articles on social media with AI rewriting.","genesis_model":"template","genesis_timestamp":"2026-07-23T00:00:00Z","tags":["rss","social","content","marketing"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 10. Calendar → Meeting Prep Email ───────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Calendar → Meeting Prep Email',
  'Get an AI-generated meeting prep email before each meeting. Includes attendee info, agenda items, and relevant context.',
  'sales',
  'easy',
  '< 1 Min',
  ARRAY['Calendar', 'Gmail'],
  ARRAY['calendar', 'meeting', 'prep', 'productivity'],
  'Before each meeting, gather attendee information and send yourself a preparation email with AI-generated talking points.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000020",
    "program_name": "Calendar → Meeting Prep Email",
    "created_at": "2026-07-23T00:00:00Z",
    "updated_at": "2026-07-23T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Every morning 8am","description":"Check calendar each morning.","connection":null,"config":{"trigger_type":"cron","expression":"0 8 * * 1-5","timezone":"UTC"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"calendar-1","type":"connection","label":"List today events","description":"Get today''s calendar events.","connection":null,"config":{"scope_access":"read","scope_required":[],"operation":"list_events","operation_params":{"calendar_id":"primary","time_min":"{{trigger-1.today_start}}","time_max":"{{trigger-1.today_end}}"}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"filter-1","type":"step","label":"Skip if no meetings","description":"No meetings today.","connection":null,"config":{"logic_type":"filter","condition":"len(data.get(\"events\", [])) > 0","pass_schema":null},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"agent-1","type":"agent","label":"Generate prep email","description":"AI creates meeting prep content.","connection":null,"config":{"model":"__USER_ASSIGNED__","api_key_ref":"__USER_ASSIGNED__","system_prompt":"Create a meeting prep email with agenda, attendee context, and talking points. Return JSON: {\"subject\": \"...\", \"body\": \"...\"}","input_schema":null,"output_schema":null,"requires_approval":false,"approval_timeout_hours":24,"scope_required":null,"scope_access":"read","retry":{"max_attempts":3,"backoff":"exponential","backoff_base_seconds":5,"fail_program_on_exhaust":false},"tools":[]},"position":{"x":1060,"y":200},"status":"idle"},
      {"id":"gmail-1","type":"connection","label":"Send prep email","description":"Email the meeting prep to yourself.","connection":null,"config":{"scope_access":"write","scope_required":["https://www.googleapis.com/auth/gmail.send"],"operation":"send_email","operation_params":{"to":"__USER_ASSIGNED__","subject":"{{agent-1.subject}}","body":"{{agent-1.body}}"}},"position":{"x":1380,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"calendar-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"calendar-1","to":"filter-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"filter-1","to":"agent-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e4","from":"agent-1","to":"gmail-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"cron","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Get AI-generated meeting prep emails before each meeting.","genesis_model":"template","genesis_timestamp":"2026-07-23T00:00:00Z","tags":["calendar","meeting","prep","productivity"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

END $$;
