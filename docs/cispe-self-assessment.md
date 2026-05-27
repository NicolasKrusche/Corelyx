# Corelyx CISPE Cloud Code Self-Assessment

**Status:** Self-assessment draft; not an official CISPE listing  
**Owner:** Corelyx responsible person / founder  
**Last reviewed:** 2026-05-27

Corelyx has not submitted for an official paid CISPE listing. This document records the current self-assessment against CISPE-aligned cloud data-protection principles.

| Requirement | Status | Evidence |
|---|---|---|
| Customer data processed for customer purposes only | In place | Privacy policy, DPA, no advertising/profile-building use of customer workflow data |
| Transparent subprocessor list | In place | `/subprocessors` and provider registry |
| DPA available | In place | `/dpa` |
| Data portability | In place | `/data-export-schema` |
| Deletion on request | In place | Account/workspace deletion flow and retention jobs |
| Security measures documented | In place | `/security`, policy suite, incident response plan |
| EU-first processing controls | In progress | `/data-residency`, EU-only workspace mode, provider registry |
| No blanket no-transfer claim | In place | Trust Center copy uses EU-first and EU-only controls for eligible workflows |
| Customer-configured providers visible | In place | Data-flow preview and publish checklist |

## Limitations

Some connected services, model providers, email providers, analytics tools, or customer-selected integrations may process data outside the EEA. Corelyx shows this before activation where it can infer the provider. Final compliance depends on the customer use case, selected providers, configuration, and role.
