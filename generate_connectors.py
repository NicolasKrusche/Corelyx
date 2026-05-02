#!/usr/bin/env python3
"""Generate scaffold connector implementations for missing providers."""

from __future__ import annotations

from pathlib import Path

MISSING_PROVIDERS = [
    ("acuityscheduling", "Acuity Scheduling", ["list_appointments", "create_appointment"]),
    ("adyen", "Adyen", ["list_payments", "create_payment"]),
    ("ahrefs", "Ahrefs", ["get_site_overview", "get_backlinks"]),
    ("aircall", "Aircall", ["list_calls", "get_call_details"]),
    ("amplitude", "Amplitude", ["get_event_segmentation", "list_users"]),
    ("auth0", "Auth0", ["list_users", "get_user"]),
    ("awss3", "AWS S3", ["list_objects", "upload_object"]),
    ("bamboohr", "BambooHR", ["list_employees", "get_employee"]),
    ("beehiiv", "Beehiiv", ["list_subscribers", "get_subscriber"]),
    ("box", "Box", ["list_files", "get_file"]),
    ("braintree", "Braintree", ["list_transactions", "create_transaction"]),
    ("braze", "Braze", ["trigger_campaign", "get_user"]),
    ("brex", "Brex", ["list_transactions", "get_card"]),
    ("calendly", "Calendly", ["list_events", "get_event"]),
    ("campaignmonitor", "Campaign Monitor", ["list_campaigns", "get_campaign"]),
    ("canva", "Canva", ["list_designs", "get_design"]),
    ("circleci", "CircleCI", ["list_workflows", "get_workflow"]),
    ("clearbit", "Clearbit", ["enrich_company", "enrich_person"]),
    ("clockify", "Clockify", ["list_time_entries", "create_time_entry"]),
    ("cloudflare", "Cloudflare", ["list_zones", "get_zone"]),
    ("cloudinary", "Cloudinary", ["list_resources", "upload_resource"]),
    ("cohere", "Cohere", ["generate_text", "embed_text"]),
    ("confluence", "Confluence", ["list_pages", "create_page"]),
    ("contentful", "Contentful", ["list_entries", "get_entry"]),
    ("crisp", "Crisp", ["list_conversations", "get_conversation"]),
    ("datadog", "Datadog", ["list_metrics", "query_logs"]),
    ("deel", "Deel", ["list_contractors", "get_contractor"]),
    ("dialpad", "Dialpad", ["list_calls", "get_call"]),
    ("digitalocean", "DigitalOcean", ["list_droplets", "create_droplet"]),
    ("docusign", "DocuSign", ["list_envelopes", "send_envelope"]),
    ("doodle", "Doodle", ["list_polls", "create_poll"]),
    ("drift", "Drift", ["list_conversations", "get_conversation"]),
    ("dropbox", "Dropbox", ["list_files", "upload_file"]),
    ("eventbrite", "Eventbrite", ["list_events", "get_event"]),
    ("evernote", "Evernote", ["list_notebooks", "create_note"]),
    ("expensify", "Expensify", ["list_reports", "create_report"]),
    ("figma", "Figma", ["list_files", "get_file"]),
    ("firebase", "Firebase", ["query_database", "write_database"]),
    ("framer", "Framer", ["list_sites", "get_site"]),
    ("freshbooks", "FreshBooks", ["list_invoices", "create_invoice"]),
    ("freshdesk", "Freshdesk", ["list_tickets", "create_ticket"]),
    ("freshservice", "Freshservice", ["list_tickets", "create_ticket"]),
    ("front", "Front", ["list_conversations", "reply_conversation"]),
    ("fullstory", "FullStory", ["list_sessions", "get_session"]),
    ("ghost", "Ghost", ["list_posts", "create_post"]),
    ("gocardless", "GoCardless", ["list_payments", "create_mandate"]),
    ("googleanalytics", "Google Analytics", ["query_report", "get_metrics"]),
    ("googleforms", "Google Forms", ["list_forms", "get_responses"]),
    ("gorgias", "Gorgias", ["list_tickets", "create_ticket"]),
    ("grafana", "Grafana", ["list_dashboards", "query_metrics"]),
    ("greenhouse", "Greenhouse", ["list_candidates", "get_candidate"]),
    ("gusto", "Gusto", ["list_employees", "get_employee"]),
    ("harvest", "Harvest", ["list_time_entries", "create_time_entry"]),
    ("heap", "Heap", ["list_users", "get_user"]),
    ("hellosign", "Dropbox Sign", ["list_signature_requests", "send_signature_request"]),
    ("helpscout", "Help Scout", ["list_conversations", "create_conversation"]),
    ("heroku", "Heroku", ["list_apps", "get_app"]),
    ("hibob", "HiBob", ["list_employees", "get_employee"]),
    ("hotjar", "Hotjar", ["list_heatmaps", "get_heatmap"]),
    ("hubstaff", "Hubstaff", ["list_time_entries", "get_time_entry"]),
    ("hunter", "Hunter.io", ["find_email", "verify_email"]),
    ("intercom", "Intercom", ["list_conversations", "create_message"]),
    ("invision", "InVision", ["list_projects", "get_project"]),
    ("iterable", "Iterable", ["track_event", "get_user"]),
    ("jotform", "Jotform", ["list_forms", "get_submissions"]),
    ("jumpcloud", "JumpCloud", ["list_users", "get_user"]),
    ("keap", "Keap", ["list_contacts", "create_contact"]),
    ("kustomer", "Kustomer", ["list_customers", "create_customer"]),
    ("lattice", "Lattice", ["list_reviews", "get_review"]),
    ("lemonsqueezy", "Lemon Squeezy", ["list_orders", "get_order"]),
    ("lever", "Lever", ["list_candidates", "get_candidate"]),
    ("linkedin", "LinkedIn", ["list_posts", "create_post"]),
    ("loom", "Loom", ["list_videos", "get_video"]),
    ("luma", "Luma", ["list_events", "get_event"]),
    ("lusha", "Lusha", ["enrich_lead", "verify_email"]),
    ("miro", "Miro", ["list_boards", "get_board"]),
    ("mixpanel", "Mixpanel", ["query_data", "track_event"]),
    ("mollie", "Mollie", ["list_payments", "create_payment"]),
    ("mux", "Mux", ["list_assets", "create_asset"]),
    ("netlify", "Netlify", ["list_sites", "trigger_build"]),
    ("netsuite", "NetSuite", ["query_records", "create_record"]),
    ("newrelic", "New Relic", ["query_nrql", "get_entity"]),
    ("nuclino", "Nuclino", ["list_items", "create_item"]),
    ("nutshell", "Nutshell", ["list_leads", "create_lead"]),
    ("okta", "Okta", ["list_users", "get_user"]),
    ("onedrive", "OneDrive", ["list_files", "upload_file"]),
    ("onenote", "OneNote", ["list_notebooks", "create_page"]),
    ("openai", "OpenAI", ["create_completion", "create_embedding"]),
    ("openphone", "OpenPhone", ["list_messages", "send_message"]),
    ("opsgenie", "OpsGenie", ["list_alerts", "create_alert"]),
    ("pagerduty", "PagerDuty", ["list_incidents", "create_incident"]),
    ("pandadoc", "PandaDoc", ["list_documents", "send_document"]),
    ("paperform", "Paperform", ["list_forms", "get_submissions"]),
    ("personio", "Personio", ["list_employees", "get_employee"]),
    ("pinecone", "Pinecone", ["query_index", "upsert_vectors"]),
    ("pipedrive", "Pipedrive", ["list_deals", "create_deal"]),
    ("plausible", "Plausible", ["get_stats", "query_breakdown"]),
    ("posthog", "PostHog", ["get_feature_flags", "query_events"]),
    ("postmark", "Postmark", ["send_email", "list_messages"]),
    ("prismic", "Prismic", ["query_documents", "get_document"]),
    ("quickbooks", "QuickBooks", ["list_invoices", "create_invoice"]),
    ("ramp", "Ramp", ["list_transactions", "get_card"]),
    ("render", "Render", ["list_services", "trigger_deploy"]),
    ("replicate", "Replicate", ["run_model", "list_models"]),
    ("resend", "Resend", ["send_email", "list_emails"]),
    ("ringcentral", "RingCentral", ["list_messages", "send_message"]),
    ("rippling", "Rippling", ["list_employees", "get_employee"]),
    ("rudderstack", "RudderStack", ["track_event", "identify_user"]),
    ("sanity", "Sanity", ["query_documents", "create_document"]),
    ("segment", "Segment", ["track_event", "identify_user"]),
    ("semrush", "Semrush", ["get_domain_analytics", "get_keywords"]),
    ("sentry", "Sentry", ["list_events", "get_event"]),
    ("servicenow", "ServiceNow", ["list_incidents", "create_incident"]),
    ("shopify", "Shopify", ["list_orders", "create_order"]),
    ("simplybook", "SimplyBook.me", ["list_bookings", "create_booking"]),
    ("storyblok", "Storyblok", ["list_stories", "create_story"]),
    ("supabase", "Supabase", ["query_table", "insert_record"]),
    ("surveymonkey", "SurveyMonkey", ["list_surveys", "get_responses"]),
    ("tally", "Tally", ["list_forms", "get_responses"]),
    ("telnyx", "Telnyx", ["send_sms", "list_messages"]),
    ("toggl", "Toggl", ["list_time_entries", "create_time_entry"]),
    ("twilio", "Twilio", ["send_sms", "send_whatsapp"]),
    ("twitter", "X (Twitter)", ["post_tweet", "list_tweets"]),
    ("vercel", "Vercel", ["list_projects", "trigger_deploy"]),
    ("vimeo", "Vimeo", ["list_videos", "upload_video"]),
    ("vonage", "Vonage", ["send_sms", "send_message"]),
    ("webflow", "Webflow", ["list_sites", "query_cms"]),
    ("wistia", "Wistia", ["list_videos", "get_video"]),
    ("wordpress", "WordPress", ["list_posts", "create_post"]),
    ("workable", "Workable", ["list_candidates", "get_candidate"]),
    ("workday", "Workday", ["list_workers", "get_worker"]),
    ("xero", "Xero", ["list_invoices", "create_invoice"]),
    ("zendesk", "Zendesk", ["list_tickets", "create_ticket"]),
    ("zeplin", "Zeplin", ["list_projects", "get_project"]),
    ("zoom", "Zoom", ["list_meetings", "create_meeting"]),
]

CONNECTOR_TEMPLATE = '''"""{label} native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://api.{domain}.com"


class {class_name}Connector(IConnector):
    provider = "{provider}"
    supported_operations = [
{operations}
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {{
            "Authorization": f"Bearer {{access_token}}",
            "Content-Type": "application/json",
        }}
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
{match_cases}
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"{label} does not support '{{operation}}'",
                    )

{methods}
'''

def camel_case(s):
    """Convert snake_case to CamelCase."""
    parts = s.split('_')
    return ''.join(word.capitalize() for word in parts)

def generate_connector(provider, label, operations):
    """Generate a scaffold connector file."""
    class_name = camel_case(provider)
    domain = provider.replace('_', '')

    # Generate operations list
    ops_list = ",\n".join(f'        "{op}"' for op in operations)

    # Generate match cases
    match_cases = '\n'.join(
        f'                case "{op}":\n                    return await self._{op}(client, headers, params)'
        for op in operations
    )
    
    # Generate method stubs
    methods_list = []
    for op in operations:
        methods_list.append(f'''
    async def _{op}(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        """Execute {op} operation."""
        r = await request_with_rate_limit(
            client, "GET", f"{{_BASE}}", headers=headers
        )
        if r.status_code >= 400:
            raise ConnectorError("API_ERROR", r.text)
        return r.json()''')
    
    methods = '\n'.join(methods_list)
    
    return CONNECTOR_TEMPLATE.format(
        provider=provider,
        label=label,
        class_name=class_name,
        domain=domain,
        operations=ops_list,
        match_cases=match_cases,
        methods=methods,
    )

def main() -> None:
    repo_root = Path(__file__).resolve().parent
    connectors_dir = repo_root / "apps" / "runtime" / "connectors"
    created = 0

    for provider, label, operations in MISSING_PROVIDERS:
        filepath = connectors_dir / f"{provider}.py"

        code = generate_connector(provider, label, operations)
        filepath.write_text(code, encoding="utf-8")

        created += 1
        print(f"CREATED: {provider}")

    print(f"\nTotal created: {created}/{len(MISSING_PROVIDERS)}")


if __name__ == "__main__":
    main()
