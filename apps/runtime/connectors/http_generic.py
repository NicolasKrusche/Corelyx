"""HTTP Generic native connector."""

from __future__ import annotations

import base64
from typing import Any

import httpx
from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit


class HTTPGenericConnector(IConnector):
    provider = "http_generic"
    supported_operations = [
        "request",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        if operation != "request":
            raise ConnectorError(
                "UNSUPPORTED_OPERATION",
                f"HTTP Generic connector only supports 'request' operation, got '{operation}'",
            )

        # Build request configuration
        method = params.get("method", "GET").upper()
        url = params.get("url")
        if not url:
            raise ConnectorError("MISSING_PARAM", "request operation requires 'url' parameter")

        # Build headers
        headers = params.get("headers", {}) or {}
        
        # Handle authentication
        auth_type = params.get("auth_type", "none").lower()
        if auth_type == "bearer":
            token = params.get("auth_token") or access_token
            if token:
                headers["Authorization"] = f"Bearer {token}"
        elif auth_type == "basic":
            username = params.get("auth_username")
            password = params.get("auth_password")
            if username and password:
                credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
                headers["Authorization"] = f"Basic {credentials}"
        elif auth_type == "api_key":
            api_key = params.get("auth_token") or access_token
            api_key_header = params.get("auth_header", "X-API-Key")
            if api_key:
                headers[api_key_header] = api_key

        # Build query parameters
        query_params = params.get("params", {}) or {}

        # Build request body
        body = params.get("body")
        json_body = params.get("json")
        form_data = params.get("form_data")
        files = params.get("files")

        # Request options
        timeout = params.get("timeout", 30.0)
        follow_redirects = params.get("follow_redirects", True)
        parse_response = params.get("parse_response", True)
        response_type = params.get("response_type", "json")  # json, text, bytes

        async with httpx.AsyncClient(timeout=timeout, follow_redirects=follow_redirects) as client:
            request_kwargs: dict[str, Any] = {
                "method": method,
                "url": url,
                "headers": headers,
                "params": query_params,
            }

            if json_body is not None:
                request_kwargs["json"] = json_body
            elif body is not None:
                request_kwargs["content"] = body
            elif form_data is not None:
                request_kwargs["data"] = form_data
            elif files is not None:
                request_kwargs["files"] = files

            try:
                response = await request_with_rate_limit(client, **request_kwargs)
            except httpx.RequestError as e:
                raise ConnectorError(
                    "HTTP_REQUEST_ERROR",
                    f"HTTP request failed: {str(e)}",
                ) from e

            # Parse response
            result = {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "url": str(response.url),
            }

            if parse_response:
                if response_type == "json":
                    try:
                        result["data"] = response.json()
                    except Exception as e:
                        raise ConnectorError(
                            "RESPONSE_PARSE_ERROR",
                            f"Failed to parse JSON response: {str(e)}",
                        ) from e
                elif response_type == "text":
                    result["data"] = response.text
                elif response_type == "bytes":
                    result["data"] = response.content
                else:
                    result["data"] = response.text
            else:
                result["raw_response"] = response

            # Raise on error status if not explicitly disabled
            if params.get("raise_on_error", True) and response.status_code >= 400:
                error_msg = f"HTTP {method} {url} failed with status {response.status_code}"
                if "data" in result:
                    error_msg += f": {result['data']}"
                raise ConnectorError(
                    "HTTP_ERROR",
                    error_msg,
                )

            return result