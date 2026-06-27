from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from schema import (
    AgentConfig,
    FileConnectionConfig,
    HttpConnectionConfig,
    OAuthConnectionConfig,
    ProgramSchema,
)


@dataclass(frozen=True)
class ProviderPolicy:
    id: str
    name: str
    default_region: str
    eu_only_supported: bool
    dpa_available: bool
    scc_available: bool
    trains_on_customer_data: bool | str
    status: str
    transfer_basis: str


PROVIDERS: dict[str, ProviderPolicy] = {
    "corelyx": ProviderPolicy(
        "corelyx",
        "Corelyx internal runtime",
        "Workspace configured EU region",
        True,
        True,
        True,
        False,
        "approved",
        "Internal processing under the Corelyx customer agreement and DPA.",
    ),
    "openai": ProviderPolicy(
        "openai",
        "OpenAI",
        "United States by default unless eligible European data residency is configured.",
        True,
        True,
        True,
        False,
        "customer_configured",
        "DPA and SCCs unless an eligible EU-resident project is verified for the workspace.",
    ),
    "anthropic": ProviderPolicy(
        "anthropic",
        "Anthropic",
        "United States for customer data unless otherwise agreed.",
        False,
        True,
        True,
        False,
        "warning",
        "DPA and SCCs required for EEA personal data.",
    ),
    "google": ProviderPolicy(
        "google",
        "Google",
        "Provider-managed; depends on Google account, Workspace region, and service.",
        True,
        True,
        True,
        False,
        "customer_configured",
        "Google terms, DPA, SCCs, and customer tenant controls.",
    ),
    "microsoft": ProviderPolicy(
        "microsoft",
        "Microsoft",
        "Provider-managed; depends on Microsoft tenant settings.",
        True,
        True,
        True,
        False,
        "customer_configured",
        "Microsoft DPA, SCCs, and customer tenant region controls.",
    ),
    "slack": ProviderPolicy(
        "slack",
        "Slack",
        "Provider-managed; depends on Slack workspace plan and settings.",
        True,
        True,
        True,
        False,
        "customer_configured",
        "Slack DPA, SCCs, and customer workspace residency settings.",
    ),
    "tavily": ProviderPolicy(
        "tavily",
        "Tavily Search",
        "United States.",
        False,
        False,
        False,
        "unknown",
        "blocked",
        "US-based search API with no EU-resident option; document DPA, SCCs, and transfer basis before personal-data use.",
    ),
    "brave": ProviderPolicy(
        "brave",
        "Brave Search",
        "United States.",
        False,
        False,
        False,
        "unknown",
        "blocked",
        "US-based search API with no EU-resident option; document DPA, SCCs, and transfer basis before personal-data use.",
    ),
    "openrouter": ProviderPolicy(
        "openrouter",
        "OpenRouter",
        "Provider-managed global routing.",
        True,
        False,
        False,
        "unknown",
        "blocked",
        "Customer must verify DPA, SCCs, EU routing, and downstream provider policy before production personal-data use.",
    ),
    "generic_http": ProviderPolicy(
        "generic_http",
        "Customer-configured HTTP endpoint",
        "Customer-configured destination.",
        False,
        False,
        False,
        "unknown",
        "blocked",
        "Customer must document recipient, DPA, SCCs, and transfer basis before personal-data use.",
    ),
}

PROVIDER_ALIASES = {
    "gmail": "google",
    "calendar": "google",
    "docs": "google",
    "drive": "google",
    "sheets": "google",
    "googleforms": "google",
    "googlechat": "google",
    "outlook": "microsoft",
    "onedrive": "microsoft",
    "teams": "microsoft",
    "graph": "microsoft",
    "http": "generic_http",
}

DEFAULT_WORKSPACE_POLICY = {
    "compliance_mode": "standard",
    "data_region": "eu-central-1",
    "execution_log_retention_days": 90,
    # "auto" → strict person-name pseudonymization for eu_only workspaces.
    "pii_mode": "auto",
}


def normalize_provider_id(provider_id: str | None) -> str:
    provider = (provider_id or "").strip().lower()
    if not provider:
        return "unknown"
    return PROVIDER_ALIASES.get(provider, provider)


def get_provider(provider_id: str | None) -> ProviderPolicy:
    normalized = normalize_provider_id(provider_id)
    return PROVIDERS.get(
        normalized,
        ProviderPolicy(
            normalized,
            "Unknown provider" if normalized == "unknown" else normalized,
            "Unknown",
            False,
            False,
            False,
            "unknown",
            "blocked",
            "Missing provider review; treat as unresolved transfer risk.",
        ),
    )


def provider_leaves_eea(provider: ProviderPolicy) -> bool:
    region = provider.default_region.lower()
    return any(
        marker in region
        for marker in ("united states", "global", "provider-managed", "unknown", "customer-configured")
    )


def is_provider_allowed_in_eu_only(provider_id: str | None) -> bool:
    provider = get_provider(provider_id)
    return (
        provider.eu_only_supported
        and provider.status != "blocked"
        and provider.dpa_available
        and (provider.scc_available or not provider_leaves_eea(provider))
    )


def policy_block_reason(provider_id: str | None, compliance_mode: str) -> str | None:
    if compliance_mode != "eu_only":
        return None
    provider = get_provider(provider_id)
    if not is_provider_allowed_in_eu_only(provider.id):
        return (
            f"{provider.name} is blocked in EU-only mode until EU residency, DPA, "
            "SCCs, and transfer basis are verified."
        )
    return None


def provider_for_model(model: str | None, api_key_provider: str | None = None) -> str:
    provider = normalize_provider_id(api_key_provider)
    if provider != "unknown":
        return provider
    needle = (model or "").lower()
    if "claude" in needle:
        return "anthropic"
    if "gemini" in needle:
        return "google"
    if "gpt" in needle or "o3" in needle or "o4" in needle:
        return "openai"
    if "/" in needle:
        return "openrouter"
    return "unknown"


def load_workspace_policy(db: Any, workspace_id: str | None) -> dict[str, Any]:
    if not workspace_id:
        return dict(DEFAULT_WORKSPACE_POLICY)
    try:
        result = (
            db.table("workspaces")
            .select("compliance_mode, data_region, execution_log_retention_days")
            .eq("id", workspace_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return dict(DEFAULT_WORKSPACE_POLICY)
        row = rows[0]

        # Queried separately so a deployment where the pii_mode migration has
        # not been applied yet degrades to the "auto" default WITHOUT also
        # resetting compliance_mode/data_region to defaults.
        pii_mode = "auto"
        try:
            pii_result = (
                db.table("workspaces").select("pii_mode").eq("id", workspace_id).limit(1).execute()
            )
            pii_rows = pii_result.data or []
            if pii_rows and pii_rows[0].get("pii_mode") in ("auto", "standard", "strict"):
                pii_mode = pii_rows[0]["pii_mode"]
        except Exception:
            pass

        return {
            **DEFAULT_WORKSPACE_POLICY,
            "compliance_mode": row.get("compliance_mode") or "standard",
            "data_region": row.get("data_region") or DEFAULT_WORKSPACE_POLICY["data_region"],
            "execution_log_retention_days": row.get("execution_log_retention_days") or 90,
            "pii_mode": pii_mode,
        }
    except Exception as exc:
        print(f"[runtime] WARNING: could not load workspace compliance policy: {exc}", flush=True)
        return dict(DEFAULT_WORKSPACE_POLICY)


def load_program_connection_providers(db: Any, program_id: str) -> dict[str, str]:
    try:
        link_result = (
            db.table("program_connections")
            .select("connection_id")
            .eq("program_id", program_id)
            .execute()
        )
        connection_ids = [row["connection_id"] for row in (link_result.data or [])]
        if not connection_ids:
            return {}
        conn_result = (
            db.table("connections")
            .select("id, name, provider")
            .in_("id", connection_ids)
            .execute()
        )
        providers: dict[str, str] = {}
        for row in conn_result.data or []:
            provider = normalize_provider_id(row.get("provider"))
            if row.get("id"):
                providers[str(row["id"])] = provider
            if row.get("name"):
                providers[str(row["name"])] = provider
        return providers
    except Exception as exc:
        print(f"[runtime] WARNING: could not load workflow connection providers: {exc}", flush=True)
        return {}


def validate_schema_policy(
    schema: ProgramSchema,
    compliance_mode: str,
    connection_providers: dict[str, str] | None = None,
) -> list[dict[str, str]]:
    blocks: list[dict[str, str]] = []
    connection_providers = connection_providers or {}
    for node in schema.nodes:
        provider_id = "corelyx"
        if isinstance(node.config, AgentConfig):
            if node.config.api_key_ref == "platform":
                provider_id = "openrouter"
            else:
                provider_id = provider_for_model(node.config.model)
        elif isinstance(node.config, FileConnectionConfig):
            # Local file ops run on the user's own device — no external provider
            # and no cross-border transfer, so never a provider-policy block.
            continue
        elif isinstance(node.config, HttpConnectionConfig):
            provider_id = "generic_http"
        elif isinstance(node.config, OAuthConnectionConfig):
            provider_id = connection_providers.get(node.connection or "", "unknown")

        reason = policy_block_reason(provider_id, compliance_mode)
        if reason:
            blocks.append(
                {
                    "node_id": node.id,
                    "node_label": node.label,
                    "provider_id": normalize_provider_id(provider_id),
                    "reason": reason,
                }
            )
    return blocks
