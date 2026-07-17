"""Metadata-only connection introspection for Genesis V2.

Data-minimization contract (EU compliance — do not weaken):
- Fetch STRUCTURE only: label names, channel names, database titles and
  property names/types. NEVER call endpoints that return record contents
  (message bodies, page blocks, database rows, files).
- Nothing here is persisted; descriptors live for the duration of one
  introspection request and are returned to the web app.
- Names the user created (labels, channels, database titles, property names,
  select options) are user data. The web app pseudonymizes them before any
  LLM prompt (see apps/web/lib/genesis/introspection.ts); the runtime returns
  them raw over the internal-auth channel only, marked `user_named: true`.
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlsplit

import httpx

from internal_auth import build_internal_service_headers

INTROSPECTION_TIMEOUT_SECONDS = 6.0

# Caps keep descriptors bounded: they limit prompt size downstream and bound
# how many pseudonymization placeholders one request can mint.
MAX_RESOURCES_PER_CONNECTION = 100
MAX_PROPERTIES_PER_RESOURCE = 50
MAX_OPTIONS_PER_PROPERTY = 20

_GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
_SLACK_BASE = "https://slack.com/api"
_NOTION_BASE = "https://api.notion.com/v1"
_NOTION_VERSION = "2022-06-28"


class IntrospectionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _nextjs_endpoint_candidates(endpoint_path: str) -> list[str]:
    """Internal endpoint URLs with an origin-only fallback (mirrors executor)."""
    raw_base = os.environ.get("NEXTJS_INTERNAL_URL", "http://localhost:3000").strip()
    if not raw_base:
        raw_base = "http://localhost:3000"
    if "://" not in raw_base:
        raw_base = f"http://{raw_base}"

    normalized = raw_base.rstrip("/")
    urls = [f"{normalized}{endpoint_path}"]

    parsed = urlsplit(normalized)
    if parsed.path and parsed.path != "/":
        origin_only = f"{parsed.scheme}://{parsed.netloc}{endpoint_path}"
        if origin_only not in urls:
            urls.append(origin_only)

    return urls


async def fetch_connection_token(connection_id: str, user_id: str) -> str:
    """Fetch a valid OAuth access token from the web app.

    Same path the executor uses (`next:connections:token`); refresh
    serialization is owned web-side via credential_locks — never lock here.
    """
    endpoint_path = f"/api/internal/connections/{connection_id}/token"
    errors: list[str] = []
    async with httpx.AsyncClient(timeout=15) as client:
        for endpoint_url in _nextjs_endpoint_candidates(endpoint_path):
            try:
                resp = await client.get(
                    endpoint_url,
                    headers=build_internal_service_headers(
                        "next:connections:token",
                        subject=user_id,
                        method="GET",
                        path=endpoint_path,
                    ),
                )
            except (httpx.ConnectError, httpx.TimeoutException) as e:
                errors.append(f"{type(e).__name__}")
                break
            if resp.is_success:
                data = resp.json()
                token = data.get("access_token")
                if not token:
                    raise IntrospectionError("TOKEN_FETCH_FAILED", "Token endpoint response missing access_token")
                return str(token)
            errors.append(f"HTTP {resp.status_code}")
            if resp.status_code not in {301, 302, 307, 308, 404}:
                break
    raise IntrospectionError(
        "TOKEN_FETCH_FAILED",
        f"Could not retrieve token for connection: {' | '.join(errors) or 'no response'}",
    )


def _raise_for_status(resp: httpx.Response, provider: str) -> None:
    if resp.is_success:
        return
    raise IntrospectionError("PROVIDER_ERROR", f"{provider} metadata endpoint returned HTTP {resp.status_code}")


async def introspect_gmail(client: httpx.AsyncClient, access_token: str) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = await client.get(f"{_GMAIL_BASE}/labels", headers=headers)
    _raise_for_status(resp, "gmail")
    labels = resp.json().get("labels") or []

    resources: list[dict[str, Any]] = []
    truncated = False
    for label in labels:
        name = label.get("name")
        if not name:
            continue
        if len(resources) >= MAX_RESOURCES_PER_CONNECTION:
            truncated = True
            break
        # System labels (INBOX, SPAM, …) are identical for every Gmail account —
        # structural, not user data. Only user-created labels are user_named.
        is_user = label.get("type") == "user"
        resources.append({"kind": "label", "name": name, "user_named": is_user})

    return {"provider": "gmail", "resources": resources, "truncated": truncated}


async def _slack_conversations(client: httpx.AsyncClient, headers: dict, types: str) -> httpx.Response:
    return await client.get(
        f"{_SLACK_BASE}/conversations.list",
        headers=headers,
        params={
            "types": types,
            "exclude_archived": "true",
            "limit": str(MAX_RESOURCES_PER_CONNECTION),
        },
    )


async def introspect_slack(client: httpx.AsyncClient, access_token: str) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {access_token}"}
    # Private channels need groups:read; requesting them when the token only has
    # channels:read makes Slack reject the WHOLE call with missing_scope. So ask
    # for both, and on missing_scope fall back to public channels only (readable
    # with channels:read) rather than failing introspection entirely.
    resp = await _slack_conversations(client, headers, "public_channel,private_channel")
    _raise_for_status(resp, "slack")
    body = resp.json()
    if not body.get("ok"):
        if body.get("error") == "missing_scope":
            resp = await _slack_conversations(client, headers, "public_channel")
            _raise_for_status(resp, "slack")
            body = resp.json()
        if not body.get("ok"):
            raise IntrospectionError("PROVIDER_ERROR", f"slack: {body.get('error', 'unknown')}")

    resources = [
        {"kind": "channel", "name": ch["name"], "user_named": True}
        for ch in (body.get("channels") or [])
        if ch.get("name")
    ][:MAX_RESOURCES_PER_CONNECTION]

    # Slack reports the token's granted scopes on every API response.
    granted_scopes = [s.strip() for s in resp.headers.get("x-oauth-scopes", "").split(",") if s.strip()]

    return {
        "provider": "slack",
        "resources": resources,
        "granted_scopes": granted_scopes,
        "truncated": bool(body.get("response_metadata", {}).get("next_cursor")),
    }


async def introspect_notion(client: httpx.AsyncClient, access_token: str) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Notion-Version": _NOTION_VERSION,
        "Content-Type": "application/json",
    }
    # Search filtered to databases returns titles + property schemas — never
    # page/row contents.
    resp = await client.post(
        f"{_NOTION_BASE}/search",
        headers=headers,
        json={
            "filter": {"value": "database", "property": "object"},
            "page_size": min(MAX_RESOURCES_PER_CONNECTION, 100),
        },
    )
    _raise_for_status(resp, "notion")
    body = resp.json()

    resources: list[dict[str, Any]] = []
    for db in body.get("results") or []:
        if db.get("object") != "database":
            continue
        title = "".join(t.get("plain_text", "") for t in db.get("title") or []).strip()
        properties: list[dict[str, Any]] = []
        prop_truncated = False
        for prop_name, prop in (db.get("properties") or {}).items():
            if len(properties) >= MAX_PROPERTIES_PER_RESOURCE:
                prop_truncated = True
                break
            prop_type = prop.get("type", "unknown")
            entry: dict[str, Any] = {"name": prop_name, "type": prop_type}
            options = (
                (prop.get(prop_type) or {}).get("options")
                if prop_type
                in (
                    "select",
                    "multi_select",
                    "status",
                )
                else None
            )
            if options:
                entry["options"] = [o["name"] for o in options[:MAX_OPTIONS_PER_PROPERTY] if o.get("name")]
            properties.append(entry)
        resources.append(
            {
                "kind": "database",
                "name": title or "(untitled)",
                "user_named": True,
                "properties": properties,
                "properties_truncated": prop_truncated,
            }
        )
        if len(resources) >= MAX_RESOURCES_PER_CONNECTION:
            break

    return {
        "provider": "notion",
        "resources": resources,
        "truncated": bool(body.get("has_more")),
    }


INTROSPECTORS = {
    "gmail": introspect_gmail,
    "slack": introspect_slack,
    "notion": introspect_notion,
}


def supports_introspection(provider: str) -> bool:
    return provider.lower() in INTROSPECTORS


async def introspect_connection(provider: str, connection_id: str, user_id: str) -> dict[str, Any]:
    """Introspect one connection: fetch token, then metadata. Raises IntrospectionError."""
    introspector = INTROSPECTORS.get(provider.lower())
    if introspector is None:
        raise IntrospectionError("UNSUPPORTED_PROVIDER", f"No introspection for '{provider}'")

    access_token = await fetch_connection_token(connection_id, user_id)
    try:
        async with httpx.AsyncClient(timeout=INTROSPECTION_TIMEOUT_SECONDS) as client:
            descriptor = await introspector(client, access_token)
    except IntrospectionError:
        raise
    except (httpx.TimeoutException, httpx.HTTPError) as e:
        raise IntrospectionError("PROVIDER_UNREACHABLE", type(e).__name__) from e
    descriptor["connection_id"] = connection_id
    return descriptor
