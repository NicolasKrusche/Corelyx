-- Seed 10 curated onboarding templates
-- These are the "cold start" templates that power the template gallery.
-- Each template has a program_json (valid ProgramSchema) and genesis_prompt for re-generation.

DO $$
DECLARE
  t_id uuid;
BEGIN

-- ─── 1. Email → Slack Summary ─────────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'E-Mail → Slack Zusammenfassung',
  'Eingehende E-Mails per KI zusammenfassen und in Slack posten.',
  'general',
  'easy',
  '< 1 Min',
  ARRAY['Gmail', 'Slack'],
  ARRAY['email', 'slack', 'ai'],
  'Fetch unread emails, summarize each with AI, and post a digest to a Slack channel.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000001",
    "program_name": "E-Mail → Slack Zusammenfassung",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
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
    "metadata": {"description":"Fetch unread emails, summarize with AI, post to Slack.","genesis_model":"template","genesis_timestamp":"2026-01-01T00:00:00Z","tags":["email","slack","ai"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
) RETURNING id INTO t_id;

-- ─── 2. GitHub Issue → Notion Page ────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'GitHub Issue → Notion Seite',
  'Neue GitHub Issues automatisch als Notion-Seiten anlegen.',
  'devops',
  'easy',
  '< 1 Min',
  ARRAY['GitHub', 'Notion'],
  ARRAY['github', 'notion', 'issues'],
  'When a new GitHub issue is created, automatically create a corresponding Notion page with the issue details.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000002",
    "program_name": "GitHub Issue → Notion Seite",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"New GitHub issue","description":"Fires when a new issue is opened.","connection":null,"config":{"trigger_type":"webhook","endpoint_id":"00000000-0000-0000-0000-000000000002","method":"POST"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"github-1","type":"connection","label":"Get issue details","description":"Fetch full issue data from GitHub.","connection":null,"config":{"scope_access":"read","scope_required":["repo"],"operation":"get_issue","operation_params":{"owner":"__USER_ASSIGNED__","repo":"__USER_ASSIGNED__","issue_number":"{{trigger-1.issue.number}}"}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"notion-1","type":"connection","label":"Create Notion page","description":"Create a page in the configured Notion database.","connection":null,"config":{"scope_access":"write","scope_required":[],"operation":"create_database_entry","operation_params":{"database_id":"__USER_ASSIGNED__","_title":"{{github-1.title}}","_body":"{{github-1.body}}"}},"position":{"x":740,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"github-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"github-1","to":"notion-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"webhook","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"When a new GitHub issue is created, automatically create a Notion page.","genesis_model":"template","genesis_timestamp":"2026-01-01T00:00:00Z","tags":["github","notion","issues"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 3. Form Submission → CRM Lead ────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Formular → CRM Lead',
  'Webformular-Einreichung automatisch als Lead in dein CRM eintragen.',
  'ecommerce',
  'easy',
  '< 1 Min',
  ARRAY['HTTP', 'CRM'],
  ARRAY['form', 'crm', 'lead'],
  'Receive a webhook from a form submission and create a new lead in the CRM.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000003",
    "program_name": "Formular → CRM Lead",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Form submission","description":"Receives webhook from form.","connection":null,"config":{"trigger_type":"webhook","endpoint_id":"00000000-0000-0000-0000-000000000003","method":"POST"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"step-1","type":"step","label":"Format lead data","description":"Reshape form data for CRM.","connection":null,"config":{"logic_type":"transform","transformation":"{\"name\": data.get(\"name\", \"\"), \"email\": data.get(\"email\", \"\"), \"company\": data.get(\"company\", \"\")}","input_schema":null,"output_schema":null},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"crm-1","type":"connection","label":"Create CRM lead","description":"Insert lead into CRM system.","connection":null,"config":{"scope_access":"write","scope_required":[],"operation":"create_lead","operation_params":{"name":"{{step-1.name}}","email":"{{step-1.email}}","company":"{{step-1.company}}"}},"position":{"x":740,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"step-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"step-1","to":"crm-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"webhook","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Receive form submission and create CRM lead.","genesis_model":"template","genesis_timestamp":"2026-01-01T00:00:00Z","tags":["form","crm","lead"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 4. Daily Digest ─────────────────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Täglicher Digest',
  'Tägliche Zusammenfassung deiner wichtigsten Aktivitäten per E-Mail.',
  'general',
  'easy',
  '< 1 Min',
  ARRAY['Gmail'],
  ARRAY['daily', 'digest', 'summary'],
  'Each morning, collect unread emails, format them into a digest, and send it to your inbox.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000004",
    "program_name": "Täglicher Digest",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Daily at 7am","description":"Fires every day at 7am UTC.","connection":null,"config":{"trigger_type":"cron","expression":"0 7 * * *","timezone":"UTC"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"gmail-1","type":"connection","label":"Search emails","description":"Finds unread emails.","connection":null,"config":{"scope_access":"read","scope_required":["https://www.googleapis.com/auth/gmail.readonly"],"operation":"search_emails","operation_params":{"query":"is:unread","max_results":10}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"filter-1","type":"step","label":"Skip if empty","description":"No emails = skip.","connection":null,"config":{"logic_type":"filter","condition":"len(data.get(\"emails\", [])) > 0","pass_schema":null},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"step-1","type":"step","label":"Format digest","description":"Create digest text.","connection":null,"config":{"logic_type":"format","template":"You have {count} unread emails today.","output_key":"digest_text"},"position":{"x":1060,"y":200},"status":"idle"},
      {"id":"gmail-2","type":"connection","label":"Send digest email","description":"Send the digest.","connection":null,"config":{"scope_access":"read_write","scope_required":["https://www.googleapis.com/auth/gmail.readonly","https://www.googleapis.com/auth/gmail.send"],"operation":"send_email","operation_params":{"to":"__USER_ASSIGNED__","subject":"Your daily email digest","body":"{{step-1.digest_text}}"}},"position":{"x":1380,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"gmail-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"gmail-1","to":"filter-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"filter-1","to":"step-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e4","from":"step-1","to":"gmail-2","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"cron","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Daily email digest of unread messages.","genesis_model":"template","genesis_timestamp":"2026-01-01T00:00:00Z","tags":["daily","digest","summary"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 5. Weekly Report ─────────────────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Wöchentlicher Bericht',
  'Automatisch einen Wochenbericht aus Datenquellen zusammenstellen und versenden.',
  'general',
  'medium',
  '~ 2 Min',
  ARRAY['Gmail', 'Slack'],
  ARRAY['report', 'weekly', 'analytics'],
  'Every Friday, compile a weekly activity report from email data and post it to Slack.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000005",
    "program_name": "Wöchentlicher Bericht",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Friday 5pm","description":"Fires every Friday at 5pm UTC.","connection":null,"config":{"trigger_type":"cron","expression":"0 17 * * 5","timezone":"UTC"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"gmail-1","type":"connection","label":"Fetch this week emails","description":"Get emails from the past week.","connection":null,"config":{"scope_access":"read","scope_required":["https://www.googleapis.com/auth/gmail.readonly"],"operation":"search_emails","operation_params":{"query":"newer_than:7d","max_results":50}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"agent-1","type":"agent","label":"Compile report","description":"AI compiles a weekly summary.","connection":null,"config":{"model":"__USER_ASSIGNED__","api_key_ref":"__USER_ASSIGNED__","system_prompt":"Compile these emails into a weekly report with key themes, action items, and stats. Return JSON: {\"report\": \"...\"}","input_schema":null,"output_schema":null,"requires_approval":false,"approval_timeout_hours":24,"scope_required":null,"scope_access":"read","retry":{"max_attempts":3,"backoff":"exponential","backoff_base_seconds":5,"fail_program_on_exhaust":false},"tools":[]},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"slack-1","type":"connection","label":"Post report to Slack","description":"Send the report to Slack.","connection":null,"config":{"scope_access":"write","scope_required":["chat:write"],"operation":"send_message","operation_params":{"channel":"__USER_ASSIGNED__","text":"*Weekly Report*\n{{agent-1.report}}"}},"position":{"x":1060,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"gmail-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"gmail-1","to":"agent-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"agent-1","to":"slack-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"cron","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Weekly activity report from email data.","genesis_model":"template","genesis_timestamp":"2026-01-01T00:00:00Z","tags":["report","weekly","analytics"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 6. GitHub PR Review ──────────────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'GitHub PR Review',
  'Pull Requests automatisch reviewen und KI-Feedback posten.',
  'devops',
  'medium',
  '~ 3 Min',
  ARRAY['GitHub'],
  ARRAY['github', 'pr', 'review'],
  'When a pull request is opened, fetch the diff and use AI to post a code review comment.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000006",
    "program_name": "GitHub PR Review",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"PR opened","description":"Fires when a PR is opened.","connection":null,"config":{"trigger_type":"webhook","endpoint_id":"00000000-0000-0000-0000-000000000006","method":"POST"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"github-1","type":"connection","label":"Get PR diff","description":"Fetch the PR diff from GitHub.","connection":null,"config":{"scope_access":"read","scope_required":["repo"],"operation":"get_pull_request","operation_params":{"owner":"__USER_ASSIGNED__","repo":"__USER_ASSIGNED__","pull_number":"{{trigger-1.pull_request.number}}"}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"agent-1","type":"agent","label":"AI code review","description":"AI reviews the code changes.","connection":null,"config":{"model":"__USER_ASSIGNED__","api_key_ref":"__USER_ASSIGNED__","system_prompt":"Review this pull request diff. Provide constructive feedback on code quality, potential bugs, and suggestions. Return JSON: {\"review\": \"...\"}","input_schema":null,"output_schema":null,"requires_approval":false,"approval_timeout_hours":24,"scope_required":null,"scope_access":"read","retry":{"max_attempts":3,"backoff":"exponential","backoff_base_seconds":5,"fail_program_on_exhaust":false},"tools":[]},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"github-2","type":"connection","label":"Post review comment","description":"Post the AI review as a PR comment.","connection":null,"config":{"scope_access":"write","scope_required":["repo"],"operation":"create_issue_comment","operation_params":{"owner":"__USER_ASSIGNED__","repo":"__USER_ASSIGNED__","issue_number":"{{trigger-1.pull_request.number}}","body":"{{agent-1.review}}"}},"position":{"x":1060,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"github-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"github-1","to":"agent-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"agent-1","to":"github-2","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"webhook","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"AI-powered PR code review.","genesis_model":"template","genesis_timestamp":"2026-01-01T00:00:00Z","tags":["github","pr","review"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 7. Meeting Notes → Tasks ─────────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Meeting Notes → Tasks',
  'Meeting-Notizen in aufgabenbasierte Einträge umwandeln.',
  'sales',
  'easy',
  '< 1 Min',
  ARRAY['Notion'],
  ARRAY['meeting', 'tasks', 'notes'],
  'When meeting notes are added to a Notion database, extract action items and create tasks.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000007",
    "program_name": "Meeting Notes → Tasks",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"New meeting note","description":"Fires when a new page is added.","connection":null,"config":{"trigger_type":"webhook","endpoint_id":"00000000-0000-0000-0000-000000000007","method":"POST"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"agent-1","type":"agent","label":"Extract tasks","description":"AI extracts action items from notes.","connection":null,"config":{"model":"__USER_ASSIGNED__","api_key_ref":"__USER_ASSIGNED__","system_prompt":"Extract action items from these meeting notes. Return JSON: {\"tasks\": [{\"title\": \"...\", \"assignee\": \"...\", \"due\": \"...\"}]}","input_schema":null,"output_schema":null,"requires_approval":false,"approval_timeout_hours":24,"scope_required":null,"scope_access":"read","retry":{"max_attempts":3,"backoff":"exponential","backoff_base_seconds":5,"fail_program_on_exhaust":false},"tools":[]},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"loop-1","type":"step","label":"Loop over tasks","description":"Iterate over extracted tasks.","connection":null,"config":{"logic_type":"loop","over":"data[''tasks'']","item_var":"task"},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"notion-1","type":"connection","label":"Create Notion task","description":"Create a task in Notion.","connection":null,"config":{"scope_access":"write","scope_required":[],"operation":"create_database_entry","operation_params":{"database_id":"__USER_ASSIGNED__","_title":"{{loop-1.task.title}}","_body":"Assignee: {{loop-1.task.assignee}} | Due: {{loop-1.task.due}}"}},"position":{"x":1060,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"agent-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"agent-1","to":"loop-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"loop-1","to":"notion-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"webhook","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Extract tasks from meeting notes.","genesis_model":"template","genesis_timestamp":"2026-01-01T00:00:00Z","tags":["meeting","tasks","notes"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 8. Invoice Processing ────────────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Rechnungsverarbeitung',
  'Eingehende Rechnungen parsen, validieren und im System erfassen.',
  'ecommerce',
  'medium',
  '~ 2 Min',
  ARRAY['Gmail', 'HTTP'],
  ARRAY['invoice', 'finance', 'automation'],
  'When an invoice email arrives, extract the PDF, parse invoice data with AI, and log it.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000008",
    "program_name": "Rechnungsverarbeitung",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Invoice email","description":"Fires on emails with subject containing invoice.","connection":null,"config":{"trigger_type":"cron","expression":"0 */4 * * *","timezone":"UTC"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"gmail-1","type":"connection","label":"Search invoice emails","description":"Find emails with invoices.","connection":null,"config":{"scope_access":"read","scope_required":["https://www.googleapis.com/auth/gmail.readonly"],"operation":"search_emails","operation_params":{"query":"subject:invoice has:attachment","max_results":5}},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"filter-1","type":"step","label":"Skip if none","description":"No invoices found.","connection":null,"config":{"logic_type":"filter","condition":"len(data.get(\"emails\", [])) > 0","pass_schema":null},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"agent-1","type":"agent","label":"Parse invoice","description":"AI extracts invoice details.","connection":null,"config":{"model":"__USER_ASSIGNED__","api_key_ref":"__USER_ASSIGNED__","system_prompt":"Extract invoice data: vendor, amount, date, line items. Return JSON: {\"vendor\": \"...\", \"amount\": 0, \"date\": \"...\", \"items\": []}","input_schema":null,"output_schema":null,"requires_approval":false,"approval_timeout_hours":24,"scope_required":null,"scope_access":"read","retry":{"max_attempts":3,"backoff":"exponential","backoff_base_seconds":5,"fail_program_on_exhaust":false},"tools":[]},"position":{"x":1060,"y":200},"status":"idle"},
      {"id":"http-1","type":"connection","label":"Log to API","description":"Send parsed data to accounting API.","connection":null,"config":{"connector_type":"http","method":"POST","url":"__USER_ASSIGNED__","auth_type":"bearer","auth_value":"__USER_ASSIGNED__","query_params":[],"headers":[{"key":"Content-Type","value":"application/json"}],"body":"{{agent-1}}","parse_response":true,"timeout_seconds":30,"retry":null},"position":{"x":1380,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"gmail-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"gmail-1","to":"filter-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"filter-1","to":"agent-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e4","from":"agent-1","to":"http-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"cron","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Parse invoices from email and log them.","genesis_model":"template","genesis_timestamp":"2026-01-01T00:00:00Z","tags":["invoice","finance","automation"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 9. Social Media Monitor ──────────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'Social Media Monitor',
  'Erwähnungen und Engagement auf Social Media automatisch tracken.',
  'marketing',
  'easy',
  '< 1 Min',
  ARRAY['HTTP', 'Slack'],
  ARRAY['social', 'monitoring', 'marketing'],
  'Periodically check social media mentions via API and alert the team on Slack.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000009",
    "program_name": "Social Media Monitor",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Every 2 hours","description":"Check social mentions every 2 hours.","connection":null,"config":{"trigger_type":"cron","expression":"0 */2 * * *","timezone":"UTC"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"http-1","type":"connection","label":"Fetch mentions","description":"Call social media monitoring API.","connection":null,"config":{"connector_type":"http","method":"GET","url":"__USER_ASSIGNED__","auth_type":"bearer","auth_value":"__USER_ASSIGNED__","query_params":[{"key":"since","value":"{{trigger-1.timestamp}}"}],"headers":[],"body":null,"parse_response":true,"timeout_seconds":30,"retry":null},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"filter-1","type":"step","label":"Skip if none","description":"No new mentions.","connection":null,"config":{"logic_type":"filter","condition":"len(data.get(\"mentions\", [])) > 0","pass_schema":null},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"slack-1","type":"connection","label":"Alert on Slack","description":"Post mention summary to Slack.","connection":null,"config":{"scope_access":"write","scope_required":["chat:write"],"operation":"send_message","operation_params":{"channel":"__USER_ASSIGNED__","text":"*New Social Mentions*\n{{http-1.mentions}}"}},"position":{"x":1060,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"http-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"http-1","to":"filter-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"filter-1","to":"slack-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"cron","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Monitor social media mentions and alert via Slack.","genesis_model":"template","genesis_timestamp":"2026-01-01T00:00:00Z","tags":["social","monitoring","marketing"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

-- ─── 10. API Health Check ─────────────────────────────────────────────────────
INSERT INTO public.templates (name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, is_public)
VALUES (
  'API Health Check',
  'Regelmäßig API-Endpunkte prüfen und bei Problemen benachrichtigen.',
  'devops',
  'easy',
  '< 1 Min',
  ARRAY['HTTP', 'Slack'],
  ARRAY['api', 'health', 'monitoring'],
  'Periodically ping configured API endpoints and alert Slack if any return errors.',
  '{
    "version": "1.0",
    "program_id": "00000000-0000-0000-0000-000000000010",
    "program_name": "API Health Check",
    "created_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-01-01T00:00:00Z",
    "execution_mode": "autonomous",
    "nodes": [
      {"id":"trigger-1","type":"trigger","label":"Every 5 minutes","description":"Health check every 5 minutes.","connection":null,"config":{"trigger_type":"cron","expression":"*/5 * * * *","timezone":"UTC"},"position":{"x":100,"y":200},"status":"idle"},
      {"id":"http-1","type":"connection","label":"Ping endpoint","description":"GET request to the API endpoint.","connection":null,"config":{"connector_type":"http","method":"GET","url":"__USER_ASSIGNED__","auth_type":"none","auth_value":null,"query_params":[],"headers":[],"body":null,"parse_response":true,"timeout_seconds":10,"retry":null},"position":{"x":420,"y":200},"status":"idle"},
      {"id":"filter-1","type":"step","label":"Check status","description":"Only alert if status is not 200.","connection":null,"config":{"logic_type":"filter","condition":"data.get(\"status\", 200) != 200","pass_schema":null},"position":{"x":740,"y":200},"status":"idle"},
      {"id":"slack-1","type":"connection","label":"Alert on Slack","description":"Post health alert to Slack.","connection":null,"config":{"scope_access":"write","scope_required":["chat:write"],"operation":"send_message","operation_params":{"channel":"__USER_ASSIGNED__","text":"🚨 *API Health Alert*\nEndpoint returned status {{http-1.status}}"}},"position":{"x":1060,"y":200},"status":"idle"}
    ],
    "edges": [
      {"id":"e1","from":"trigger-1","to":"http-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e2","from":"http-1","to":"filter-1","type":"data_flow","data_mapping":null,"condition":null,"label":null},
      {"id":"e3","from":"filter-1","to":"slack-1","type":"data_flow","data_mapping":null,"condition":null,"label":null}
    ],
    "triggers": [{"node_id":"trigger-1","type":"cron","is_active":true,"last_fired":null,"next_scheduled":null}],
    "version_history": [],
    "metadata": {"description":"Periodically check API health and alert on failures.","genesis_model":"template","genesis_timestamp":"2026-01-01T00:00:00Z","tags":["api","health","monitoring"],"is_active":false,"last_run_id":null,"last_run_status":null,"last_run_timestamp":null}
  }'::jsonb,
  true
);

END $$;
