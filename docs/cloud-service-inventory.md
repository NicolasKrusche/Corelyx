# Corelyx Cloud Service Inventory

**Status:** ISO 27017 preparation evidence  
**Owner:** Corelyx responsible person / founder  
**Last reviewed:** 2026-05-27

| Service | Role | Data categories | Default region / residency | Customer optional? | DPA/SCC status | Notes |
|---|---|---|---|---|---|---|
| Vercel | Web hosting, API routes, deployment logs | Request metadata, app data rendered by APIs | EU-first compute where configured; CDN/log routing may be provider-managed | No | DPA/SCC available | Not equivalent to a blanket all-data-remains-in-EU claim. |
| Railway | Runtime hosting | Workflow payloads, connector requests, runtime logs | EU region where configured | No | DPA/SCC available | Runtime re-checks compliance mode before external calls. |
| Supabase | Database, auth, Vault references | Accounts, schemas, runs, approvals, connection metadata | Production expected in EU project region | No | DPA/SCC available | RLS and service-role isolation are critical controls. |
| GitHub | Source control and CI | Source code, issues, CI metadata | Provider-managed | No | Provider terms | No customer workflow payloads should be stored in issues. |
| Resend | Transactional email | Recipient email, notification metadata | Provider-managed/US | No for app email, optional for workflow email | DPA/SCC available | Notifications must not include secrets. |
| Stripe | Billing | Billing contact, invoices, payment metadata | Provider-managed | Billing only | DPA/SCC available | Card data handled by Stripe, not Corelyx. |
| OpenAI | Optional LLM inference | Prompts, inputs, outputs, usage | Account/project dependent | Yes | DPA/SCC available | EU residency only where verified for the selected project. |
| Anthropic | Optional LLM inference | Prompts, inputs, outputs, usage | Provider-managed/US | Yes | DPA/SCC available | Blocked in EU-only mode unless future registry status changes. |
| OpenRouter | Optional LLM routing | Prompts, routing metadata, downstream provider data | Provider-managed | Yes | Missing in registry | Blocked until DPA/SCC/training evidence is complete. |
| Google/Microsoft/Slack | Customer connectors | Customer tenant data selected by workflows | Customer tenant/provider dependent | Yes | DPA/SCC available | Customer-configured; Corelyx shows transfer risk before publish. |
