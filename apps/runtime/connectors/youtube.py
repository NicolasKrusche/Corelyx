"""YouTube native connector."""

from __future__ import annotations

from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://www.googleapis.com/youtube/v3"


class YoutubeConnector(IConnector):
    provider = "youtube"
    supported_operations = [
        "list_videos",
        "get_video",
        "list_channels",
        "get_channel_analytics",
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
                case "list_videos":
                    return await self._list_videos(client, headers, params)
                case "get_video":
                    return await self._get_video(client, headers, params)
                case "list_channels":
                    return await self._list_channels(client, headers, params)
                case "get_channel_analytics":
                    return await self._get_channel_analytics(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"YouTube does not support operation '{operation}'",
                    )

    async def _list_videos(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query: dict[str, Any] = {
            "part": params.get("part", "snippet,contentDetails,statistics"),
            "maxResults": int(params.get("max_results", 10)),
            "chart": params.get("chart", "mostPopular"),
        }
        if params.get("channel_id"):
            query["channelId"] = params["channel_id"]
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/videos", headers=headers, params=query)
        _raise_for_status(r, "list_videos")
        data = r.json()
        return {
            "videos": [
                {
                    "id": item["id"],
                    "title": item.get("snippet", {}).get("title"),
                    "published_at": item.get("snippet", {}).get("publishedAt"),
                    "view_count": item.get("statistics", {}).get("viewCount"),
                }
                for item in data.get("items", [])
            ],
            "next_page_token": data.get("nextPageToken"),
        }

    async def _get_video(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        video_id = params.get("video_id")
        if not video_id:
            raise ConnectorError("MISSING_PARAM", "get_video requires 'video_id'")
        query: dict[str, Any] = {
            "part": params.get("part", "snippet,contentDetails,statistics"),
            "id": video_id,
        }
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/videos", headers=headers, params=query)
        _raise_for_status(r, "get_video")
        data = r.json()
        items = data.get("items", [])
        if not items:
            raise ConnectorError("YOUTUBE_NOT_FOUND", f"Video '{video_id}' not found")
        item = items[0]
        return {
            "id": item["id"],
            "title": item.get("snippet", {}).get("title"),
            "description": item.get("snippet", {}).get("description"),
            "published_at": item.get("snippet", {}).get("publishedAt"),
            "duration": item.get("contentDetails", {}).get("duration"),
            "statistics": item.get("statistics", {}),
        }

    async def _list_channels(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query: dict[str, Any] = {
            "part": "snippet,statistics",
            "mine": True,
        }
        if params.get("channel_id"):
            del query["mine"]
            query["id"] = params["channel_id"]
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/channels", headers=headers, params=query)
        _raise_for_status(r, "list_channels")
        data = r.json()
        return {
            "channels": [
                {
                    "id": c["id"],
                    "title": c.get("snippet", {}).get("title"),
                    "subscriber_count": c.get("statistics", {}).get("subscriberCount"),
                    "video_count": c.get("statistics", {}).get("videoCount"),
                }
                for c in data.get("items", [])
            ]
        }

    async def _get_channel_analytics(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        # Uses YouTube Analytics API
        analytics_base = "https://youtubeanalytics.googleapis.com/v2"
        query: dict[str, Any] = {
            "ids": f"channel=={params.get('channel_id', 'MINE')}",
            "metrics": params.get("metrics", "views,estimatedMinutesWatched,subscribersGained"),
            "startDate": params.get("start_date", "2024-01-01"),
            "endDate": params.get("end_date", "2024-12-31"),
            "dimensions": params.get("dimensions", "day"),
        }
        r = await request_with_rate_limit(client, "GET", f"{analytics_base}/reports", headers=headers, params=query)
        _raise_for_status(r, "get_channel_analytics")
        data = r.json()
        return {
            "column_headers": data.get("columnHeaders", []),
            "rows": data.get("rows", []),
        }


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"YouTube {operation} failed: token expired",
        )
    if r.status_code == 403:
        raise ConnectorError(
            "YOUTUBE_FORBIDDEN",
            f"YouTube {operation} failed: quota exceeded or insufficient permissions",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "YOUTUBE_API_ERROR",
            f"YouTube {operation} failed ({r.status_code}): {r.text[:300]}",
        )
