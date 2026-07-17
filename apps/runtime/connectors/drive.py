"""Google Drive native connector."""

from __future__ import annotations

import base64
import json
from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://www.googleapis.com/drive/v3"
_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3"


def _escape_query_value(value: Any) -> str:
    """Escape a value for use inside a single-quoted Google Drive ``q`` term.

    Per the Drive v3 API, within a query string a backslash is escaped as ``\\\\``
    and a single quote as ``\\'``. Without this, a value containing an apostrophe
    (e.g. a filename like ``O'Brien``) breaks the query syntax and the API returns
    400 "Invalid Value" on the ``q`` parameter.
    """
    return str(value).replace("\\", "\\\\").replace("'", "\\'")


class DriveConnector(IConnector):
    provider = "drive"
    supported_operations = [
        "list_files",
        "get_file",
        "get_file_metadata",
        "upload_file",
        "create_folder",
        "move_file",
        "share_file",
        "delete_file",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            match operation:
                case "list_files":
                    return await self._list_files(client, headers, params)
                case "get_file" | "get_file_metadata":
                    return await self._get_file(client, headers, params)
                case "upload_file":
                    return await self._upload_file(client, headers, params)
                case "create_folder":
                    return await self._create_folder(client, headers, params)
                case "move_file":
                    return await self._move_file(client, headers, params)
                case "share_file":
                    return await self._share_file(client, headers, params)
                case "delete_file":
                    return await self._delete_file(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Google Drive does not support operation '{operation}'",
                    )

    async def _list_files(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        query_parts: list[str] = ["trashed = false"]
        if params.get("query"):
            query_parts.append(f"name contains '{_escape_query_value(params['query'])}'")
        if params.get("folder_id"):
            query_parts.append(f"'{_escape_query_value(params['folder_id'])}' in parents")
        if params.get("mime_type"):
            query_parts.append(f"mimeType = '{_escape_query_value(params['mime_type'])}'")
        q = " and ".join(query_parts)
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/files",
            headers=headers,
            params={
                "q": q,
                "pageSize": int(params.get("max_results", 20)),
                "fields": "files(id,name,mimeType,size,modifiedTime,parents,webViewLink)",
            },
        )
        _raise_for_status(r, "list_files")
        data = r.json()
        return {"files": data.get("files", [])}

    async def _get_file(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        file_id = params.get("file_id")
        if not file_id:
            raise ConnectorError("MISSING_PARAM", "get_file requires 'file_id'")
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/files/{file_id}",
            headers=headers,
            params={"fields": "id,name,mimeType,size,modifiedTime,parents,webViewLink,description"},
        )
        _raise_for_status(r, "get_file")
        return r.json()

    async def _create_folder(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        name = params.get("name")
        if not name:
            raise ConnectorError("MISSING_PARAM", "create_folder requires 'name'")
        body: dict[str, Any] = {
            "name": name,
            "mimeType": "application/vnd.google-apps.folder",
        }
        if params.get("parent_id"):
            body["parents"] = [params["parent_id"]]
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/files",
            headers={**headers, "Content-Type": "application/json"},
            json=body,
        )
        _raise_for_status(r, "create_folder")
        data = r.json()
        return {"folder_id": data.get("id"), "name": data.get("name")}

    async def _upload_file(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        name = params.get("name")
        content_base64 = params.get("content_base64")
        mime_type = params.get("mime_type", "application/octet-stream")
        parent_id = params.get("parent_id")
        if not name or not content_base64:
            raise ConnectorError("MISSING_PARAM", "upload_file requires 'name' and 'content_base64'")
        try:
            file_bytes = base64.b64decode(content_base64)
        except Exception as exc:
            raise ConnectorError("INVALID_PARAM", f"upload_file: content_base64 is not valid base64 — {exc}") from exc

        metadata: dict[str, Any] = {"name": name}
        if parent_id:
            metadata["parents"] = [parent_id]

        boundary = "nexflow_drive_boundary"
        meta_part = (
            f"--{boundary}\r\n"
            f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
            f"{json.dumps(metadata)}\r\n"
            f"--{boundary}\r\n"
            f"Content-Type: {mime_type}\r\n\r\n"
        ).encode()
        body = meta_part + file_bytes + f"\r\n--{boundary}--".encode()

        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_UPLOAD_BASE}/files",
            headers={
                **headers,
                "Content-Type": f"multipart/related; boundary={boundary}",
            },
            params={"uploadType": "multipart", "fields": "id,name,webViewLink"},
            content=body,
        )
        _raise_for_status(r, "upload_file")
        data = r.json()
        return {
            "file_id": data.get("id"),
            "name": data.get("name"),
            "web_view_link": data.get("webViewLink"),
        }

    async def _move_file(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        file_id = params.get("file_id")
        folder_id = params.get("folder_id")
        if not file_id or not folder_id:
            raise ConnectorError("MISSING_PARAM", "move_file requires 'file_id' and 'folder_id'")
        # Fetch current parents so we can remove them after adding the new one
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/files/{file_id}",
            headers=headers,
            params={"fields": "parents,name"},
        )
        _raise_for_status(r, "move_file")
        info = r.json()
        old_parents = ",".join(info.get("parents", []))
        r = await request_with_rate_limit(
            client,
            "PATCH",
            f"{_BASE}/files/{file_id}",
            headers={**headers, "Content-Type": "application/json"},
            params={
                "addParents": folder_id,
                "removeParents": old_parents,
                "fields": "id,name",
            },
            content=b"{}",
        )
        _raise_for_status(r, "move_file")
        return {"file_id": file_id, "name": info.get("name"), "moved": True}

    async def _share_file(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        file_id = params.get("file_id")
        email = params.get("email")
        role = params.get("role", "reader")
        if not file_id or not email:
            raise ConnectorError("MISSING_PARAM", "share_file requires 'file_id' and 'email'")
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/files/{file_id}/permissions",
            headers={**headers, "Content-Type": "application/json"},
            json={"type": "user", "role": role, "emailAddress": email},
        )
        _raise_for_status(r, "share_file")
        data = r.json()
        return {"file_id": file_id, "permission_id": data.get("id"), "role": role, "email": email}

    async def _delete_file(self, client: httpx.AsyncClient, headers: dict, params: dict) -> dict:
        file_id = params.get("file_id")
        if not file_id:
            raise ConnectorError("MISSING_PARAM", "delete_file requires 'file_id'")
        r = await request_with_rate_limit(client, "DELETE", f"{_BASE}/files/{file_id}", headers=headers)
        if r.status_code not in (200, 204):
            _raise_for_status(r, "delete_file")
        return {"file_id": file_id, "deleted": True}


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Google Drive {operation} failed: access token is invalid or expired",
        )
    if r.status_code == 404:
        raise ConnectorError(
            "NOT_FOUND",
            f"Google Drive {operation} failed: file or folder not found",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "DRIVE_HTTP_ERROR",
            f"Google Drive {operation} failed ({r.status_code}): {r.text[:300]}",
        )
