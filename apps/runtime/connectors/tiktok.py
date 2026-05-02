"""TikTok for Business native connector."""
from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://business-api.tiktok.com/open_api/v1.3"


class TiktokConnector(IConnector):
    provider = "tiktok"
    supported_operations = [
        "get_ad_accounts",
        "list_campaigns",
        "get_campaign_stats",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {
            "Access-Token": access_token,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "get_ad_accounts":
                    return await self._get_ad_accounts(client, headers, params)
                case "list_campaigns":
                    return await self._list_campaigns(client, headers, params)
                case "get_campaign_stats":
                    return await self._get_campaign_stats(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"TikTok does not support operation '{operation}'",
                    )

    async def _get_ad_accounts(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/oauth2/advertiser/get/", headers=headers
        )
        _raise_for_status(r, "get_ad_accounts")
        data = r.json()
        if data.get("code") != 0:
            raise ConnectorError(
                "TIKTOK_API_ERROR",
                f"TikTok get_ad_accounts error: {data.get('message', 'unknown')}",
            )
        return {
            "ad_accounts": data.get("data", {}).get("list", []),
        }

    async def _list_campaigns(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        advertiser_id = params.get("advertiser_id")
        if not advertiser_id:
            raise ConnectorError("MISSING_PARAM", "list_campaigns requires 'advertiser_id'")
        query: dict[str, Any] = {
            "advertiser_id": advertiser_id,
            "page_size": int(params.get("page_size", 10)),
            "page": int(params.get("page", 1)),
        }
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/campaign/get/", headers=headers, params=query
        )
        _raise_for_status(r, "list_campaigns")
        data = r.json()
        if data.get("code") != 0:
            raise ConnectorError(
                "TIKTOK_API_ERROR",
                f"TikTok list_campaigns error: {data.get('message', 'unknown')}",
            )
        return {
            "campaigns": data.get("data", {}).get("list", []),
            "total": data.get("data", {}).get("page_info", {}).get("total_number", 0),
        }

    async def _get_campaign_stats(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        advertiser_id = params.get("advertiser_id")
        if not advertiser_id:
            raise ConnectorError("MISSING_PARAM", "get_campaign_stats requires 'advertiser_id'")
        query: dict[str, Any] = {
            "advertiser_id": advertiser_id,
            "report_type": params.get("report_type", "BASIC"),
            "dimensions": params.get("dimensions", ["campaign_id"]),
            "metrics": params.get("metrics", ["spend", "impressions", "clicks"]),
            "start_date": params.get("start_date", "2024-01-01"),
            "end_date": params.get("end_date", "2024-12-31"),
            "page_size": int(params.get("page_size", 10)),
        }
        r = await request_with_rate_limit(
            client, "GET", f"{_BASE}/report/integrated/get/", headers=headers, params=query
        )
        _raise_for_status(r, "get_campaign_stats")
        data = r.json()
        if data.get("code") != 0:
            raise ConnectorError(
                "TIKTOK_API_ERROR",
                f"TikTok get_campaign_stats error: {data.get('message', 'unknown')}",
            )
        return {
            "rows": data.get("data", {}).get("list", []),
            "total": data.get("data", {}).get("page_info", {}).get("total_number", 0),
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"TikTok {operation} failed: token expired",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "TIKTOK_API_ERROR",
            f"TikTok {operation} failed ({r.status_code}): {r.text[:300]}",
        )
