"""Instagram Business native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://graph.facebook.com/v19.0"


class InstagramConnector(IConnector):
    provider = "instagram"
    supported_operations = [
        "get_media",
        "post_image",
        "get_insights",
        "get_comments",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "get_media":
                    return await self._get_media(client, headers, params)
                case "post_image":
                    return await self._post_image(client, headers, params)
                case "get_insights":
                    return await self._get_insights(client, headers, params)
                case "get_comments":
                    return await self._get_comments(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Instagram does not support operation '{operation}'",
                    )

    async def _get_media(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        ig_user_id = params.get("ig_user_id")
        if not ig_user_id:
            raise ConnectorError("MISSING_PARAM", "get_media requires 'ig_user_id'")
        query: dict[str, Any] = {
            "fields": params.get("fields", "id,caption,media_type,media_url,timestamp"),
            "limit": int(params.get("limit", 10)),
        }
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/{ig_user_id}/media", headers=headers, params=query)
        _raise_for_status(r, "get_media")
        data = r.json()
        return {"media": data.get("data", []), "next": data.get("paging", {}).get("next")}

    async def _post_image(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        ig_user_id = params.get("ig_user_id")
        image_url = params.get("image_url")
        if not ig_user_id or not image_url:
            raise ConnectorError("MISSING_PARAM", "post_image requires 'ig_user_id' and 'image_url'")
        # Step 1: create container
        container_body: dict[str, Any] = {"image_url": image_url}
        if params.get("caption"):
            container_body["caption"] = params["caption"]
        r1 = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/{ig_user_id}/media",
            headers=headers,
            json=container_body,
        )
        _raise_for_status(r1, "post_image (container)")
        container_id = r1.json().get("id")
        # Step 2: publish container
        r2 = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/{ig_user_id}/media_publish",
            headers=headers,
            json={"creation_id": container_id},
        )
        _raise_for_status(r2, "post_image (publish)")
        data = r2.json()
        return {"media_id": data.get("id")}

    async def _get_insights(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        media_id = params.get("media_id")
        if not media_id:
            raise ConnectorError("MISSING_PARAM", "get_insights requires 'media_id'")
        query: dict[str, Any] = {
            "metric": params.get("metric", "impressions,reach,engagement"),
        }
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/{media_id}/insights",
            headers=headers,
            params=query,
        )
        _raise_for_status(r, "get_insights")
        data = r.json()
        return {"insights": data.get("data", [])}

    async def _get_comments(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        media_id = params.get("media_id")
        if not media_id:
            raise ConnectorError("MISSING_PARAM", "get_comments requires 'media_id'")
        query: dict[str, Any] = {
            "fields": "id,text,timestamp,username",
            "limit": int(params.get("limit", 20)),
        }
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/{media_id}/comments",
            headers=headers,
            params=query,
        )
        _raise_for_status(r, "get_comments")
        data = r.json()
        return {"comments": data.get("data", [])}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Instagram {operation} failed: token expired",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "INSTAGRAM_FORBIDDEN",
            f"Instagram {operation} failed: insufficient permissions",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "INSTAGRAM_API_ERROR",
            f"Instagram {operation} failed ({r.status_code}): {r.text[:300]}",
        )
