"""Gmail native connector."""
from __future__ import annotations

import asyncio
import base64
import random
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import httpx

from .base import IConnector, ConnectorError
from .rate_limit import request_with_rate_limit

_BASE = "https://gmail.googleapis.com/gmail/v1/users/me"
_INLINE_ATTACHMENT_MAX_BYTES = 262_144  # 256 KB


class GmailConnector(IConnector):
    provider = "gmail"
    supported_operations = [
        "list_emails",
        "list_threads",
        "search",
        "read_email",
        "get_attachment",
        "send_email",
        "archive_email",
        "label_email",
        "delete_email",
    ]

    async def execute(
        self,
        operation: str,
        params: dict[str, Any],
        access_token: str,
    ) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            match operation:
                case "list_emails":
                    return await self._list_emails(client, headers, params)
                case "list_threads":
                    return await self._list_threads(client, headers, params)
                case "search":
                    return await self._search(client, headers, params)
                case "read_email":
                    return await self._read_email(client, headers, params)
                case "get_attachment":
                    return await self._get_attachment(client, headers, params)
                case "send_email":
                    return await self._send_email(client, headers, params)
                case "archive_email":
                    return await self._archive_email(client, headers, params)
                case "label_email":
                    return await self._label_email(client, headers, params)
                case "delete_email":
                    return await self._delete_email(client, headers, params)
                case _:
                    raise ConnectorError(
                        "UNSUPPORTED_OPERATION",
                        f"Gmail does not support operation '{operation}'",
                    )

    async def _list_emails(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        query = str(params.get("query", ""))
        max_results = int(params.get("max_results", 10))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/messages",
            headers=headers,
            params={"q": query, "maxResults": max_results},
        )
        _raise_for_status(r, "list_emails")
        data = r.json()
        messages = data.get("messages", [])
        return {
            "emails": messages,
            "query": query,
            "result_size_estimate": data.get("resultSizeEstimate", 0),
            "next_page_token": data.get("nextPageToken"),
        }

    async def _list_threads(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        query = str(params.get("query", ""))
        max_results = int(params.get("max_results", 10))
        r = await request_with_rate_limit(
            client,
            "GET",
            f"{_BASE}/threads",
            headers=headers,
            params={"q": query, "maxResults": max_results},
        )
        _raise_for_status(r, "list_threads")
        data = r.json()
        threads = data.get("threads", [])
        return {
            "threads": threads,
            "query": query,
            "result_size_estimate": data.get("resultSizeEstimate", 0),
            "next_page_token": data.get("nextPageToken"),
        }

    async def _search(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        query = str(params.get("query", "")).strip()
        # Empty query is valid — falls back to listing all messages (same as list_emails).
        return await self._list_emails(
            client,
            headers,
            {
                "query": query,
                "max_results": params.get("max_results", 10),
            },
        )

    async def _read_email(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        message_id = params.get("message_id")
        if not message_id:
            raise ConnectorError(
                "MISSING_PARAM",
                "read_email requires 'message_id'. Add a filter or branch before "
                "read_email when the upstream event or search can be empty.",
            )

        r = await _get_with_precondition_retry(
            client,
            f"{_BASE}/messages/{message_id}",
            headers=headers,
            params={"format": "full"},
        )
        _raise_for_status(r, "read_email")
        msg = r.json()
        payload = msg.get("payload", {})
        subject = _header(payload, "Subject")
        sender = _header(payload, "From")
        recipient = _header(payload, "To")
        body_text, body_html, attachments = _extract_text_and_attachments(payload, message_id)

        include_attachments = bool(params.get("include_attachments", False))
        max_inline_bytes = int(
            params.get("attachment_inline_max_bytes", _INLINE_ATTACHMENT_MAX_BYTES)
        )

        if include_attachments and attachments:
            for attachment in attachments:
                attachment_id = attachment.get("attachment_id")
                if not attachment_id:
                    continue
                try:
                    content_bytes = await self._fetch_attachment_bytes(
                        client, headers, message_id, str(attachment_id)
                    )
                except ConnectorError as exc:
                    attachment["fetch_error"] = exc.message
                    continue

                attachment_size = int(attachment.get("size_bytes") or len(content_bytes))
                attachment["size_bytes"] = attachment_size
                if attachment_size <= max_inline_bytes:
                    attachment["data_base64"] = base64.b64encode(content_bytes).decode("ascii")
                    mime_type = str(attachment.get("mime_type", ""))
                    if mime_type.startswith("text/"):
                        attachment["text"] = content_bytes.decode("utf-8", errors="replace")
                else:
                    attachment["truncated"] = True

        return {
            "message_id": message_id,
            "thread_id": msg.get("threadId"),
            "history_id": msg.get("historyId"),
            "subject": subject,
            "from": sender,
            "to": recipient,
            "snippet": msg.get("snippet", ""),
            "body": body_text,  # backwards-compatible field name
            "body_text": body_text,
            "body_html": body_html,
            "labels": msg.get("labelIds", []),
            "attachments": attachments,
            "attachment_count": len(attachments),
        }

    async def _get_attachment(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        message_id = params.get("message_id")
        attachment_id = params.get("attachment_id")
        if not message_id or not attachment_id:
            raise ConnectorError(
                "MISSING_PARAM",
                "get_attachment requires 'message_id' and 'attachment_id'",
            )
        content_bytes = await self._fetch_attachment_bytes(
            client, headers, str(message_id), str(attachment_id)
        )
        result = {
            "message_id": message_id,
            "attachment_id": attachment_id,
            "size_bytes": len(content_bytes),
            "data_base64": base64.b64encode(content_bytes).decode("ascii"),
        }
        if bool(params.get("decode_text", False)):
            result["text"] = content_bytes.decode("utf-8", errors="replace")
        return result

    async def _send_email(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        to = params.get("to")
        subject = str(params.get("subject", ""))
        body = str(params.get("body", ""))
        if not to:
            raise ConnectorError("MISSING_PARAM", "send_email requires 'to'")

        attachments = params.get("attachments") or []
        if attachments:
            mime_message = MIMEMultipart()
            mime_message.attach(MIMEText(body, "plain"))
        else:
            mime_message = MIMEText(body)

        mime_message["to"] = to
        mime_message["subject"] = subject
        if params.get("cc"):
            mime_message["cc"] = params["cc"]
        if params.get("bcc"):
            mime_message["bcc"] = params["bcc"]
        if params.get("reply_to_id"):
            mime_message["In-Reply-To"] = params["reply_to_id"]
            mime_message["References"] = params["reply_to_id"]

        if attachments:
            for raw_attachment in attachments:
                if not isinstance(raw_attachment, dict):
                    continue
                filename = str(raw_attachment.get("filename", "attachment.bin"))
                mime_type = str(raw_attachment.get("mime_type", "application/octet-stream"))
                if raw_attachment.get("content_base64"):
                    content_bytes = base64.b64decode(str(raw_attachment["content_base64"]))
                elif raw_attachment.get("content") is not None:
                    content_bytes = str(raw_attachment["content"]).encode("utf-8")
                else:
                    continue

                major, minor = (
                    mime_type.split("/", 1)
                    if "/" in mime_type
                    else ("application", "octet-stream")
                )
                part = MIMEBase(major, minor)
                part.set_payload(content_bytes)
                encoders.encode_base64(part)
                part.add_header("Content-Type", mime_type)
                part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
                mime_message.attach(part)

        raw = base64.urlsafe_b64encode(mime_message.as_bytes()).decode("ascii")
        payload: dict[str, Any] = {"raw": raw}
        if params.get("thread_id"):
            payload["threadId"] = params["thread_id"]

        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/messages/send",
            headers=headers,
            json=payload,
        )
        _raise_for_status(r, "send_email")
        result = r.json()
        return {"message_id": result.get("id"), "thread_id": result.get("threadId")}

    async def _archive_email(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        message_id = params.get("message_id")
        if not message_id:
            raise ConnectorError("MISSING_PARAM", "archive_email requires 'message_id'")
        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/messages/{message_id}/modify",
            headers=headers,
            json={"removeLabelIds": ["INBOX"]},
        )
        _raise_for_status(r, "archive_email")
        return {"message_id": message_id, "archived": True}

    async def _delete_email(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        message_id = params.get("message_id")
        if not message_id:
            raise ConnectorError("MISSING_PARAM", "delete_email requires 'message_id'")

        # Default to trashing (reversible, needs only gmail.modify). Permanent
        # delete requires the broad https://mail.google.com/ scope, so it is opt-in.
        permanent = bool(params.get("permanent", False))
        if permanent:
            r = await request_with_rate_limit(
                client,
                "DELETE",
                f"{_BASE}/messages/{message_id}",
                headers=headers,
            )
            _raise_for_status(r, "delete_email")
            return {"message_id": message_id, "deleted": True, "permanent": True}

        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/messages/{message_id}/trash",
            headers=headers,
        )
        _raise_for_status(r, "delete_email")
        return {"message_id": message_id, "deleted": True, "permanent": False}

    async def _resolve_label_names(
        self, client: httpx.AsyncClient, headers: dict, names: list[str]
    ) -> list[str]:
        """Resolve label names to Gmail label IDs, creating missing labels automatically."""
        if not names:
            return []
        # Fetch all existing labels once
        r = await request_with_rate_limit(client, "GET", f"{_BASE}/labels", headers=headers)
        _raise_for_status(r, "list_labels")
        existing = {lbl["name"].lower(): lbl["id"] for lbl in r.json().get("labels", [])}
        ids = []
        for name in names:
            label_id = existing.get(name.lower())
            if not label_id:
                # Create the label automatically
                print(f"[gmail] creating label '{name}'", flush=True)
                cr = await request_with_rate_limit(
                    client, "POST", f"{_BASE}/labels", headers=headers,
                    json={"name": name, "labelListVisibility": "labelShow", "messageListVisibility": "show"},
                )
                _raise_for_status(cr, "create_label")
                label_id = cr.json()["id"]
                print(f"[gmail] created label '{name}' -> {label_id}", flush=True)
            ids.append(label_id)
        return ids

    async def _label_email(
        self, client: httpx.AsyncClient, headers: dict, params: dict
    ) -> dict:
        message_id = params.get("message_id")
        if not message_id:
            raise ConnectorError("MISSING_PARAM", "label_email requires 'message_id'")

        # Accept label names (strings) or raw IDs — resolve names automatically
        add_raw = params.get("add_label_ids") or params.get("add_label_names") or []
        remove_raw = params.get("remove_label_ids") or params.get("remove_label_names") or []
        if isinstance(add_raw, str):
            add_raw = [add_raw]
        if isinstance(remove_raw, str):
            remove_raw = [remove_raw]

        # Names contain spaces or aren't all-caps system IDs → resolve to IDs
        def _needs_resolve(labels: list) -> bool:
            return any(not str(l).isupper() or " " in str(l) for l in labels)

        add_ids = await self._resolve_label_names(client, headers, [str(l) for l in add_raw]) \
            if _needs_resolve(add_raw) else [str(l) for l in add_raw]
        remove_ids = await self._resolve_label_names(client, headers, [str(l) for l in remove_raw]) \
            if _needs_resolve(remove_raw) else [str(l) for l in remove_raw]

        # Gmail rejects a modify call with no label changes ("No label ... updates
        # provided", 400). Surface a clear, actionable error instead of the raw
        # API failure when neither add nor remove labels were supplied.
        if not add_ids and not remove_ids:
            raise ConnectorError(
                "MISSING_PARAM",
                "label_email requires at least one label to add or remove "
                "(set add_label_names/add_label_ids or remove_label_names/remove_label_ids)",
            )

        # Only send the keys that actually have values so empty arrays never reach
        # the Gmail API.
        body: dict = {}
        if add_ids:
            body["addLabelIds"] = add_ids
        if remove_ids:
            body["removeLabelIds"] = remove_ids

        r = await request_with_rate_limit(
            client,
            "POST",
            f"{_BASE}/messages/{message_id}/modify",
            headers=headers,
            json=body,
        )
        _raise_for_status(r, "label_email")
        return {"message_id": message_id, "labels": r.json().get("labelIds", [])}

    async def _fetch_attachment_bytes(
        self,
        client: httpx.AsyncClient,
        headers: dict,
        message_id: str,
        attachment_id: str,
    ) -> bytes:
        r = await _get_with_precondition_retry(
            client,
            f"{_BASE}/messages/{message_id}/attachments/{attachment_id}",
            headers=headers,
        )
        _raise_for_status(r, "get_attachment")
        data = r.json().get("data", "")
        return _decode_base64url(str(data))


def _is_transient_precondition(r: httpx.Response) -> bool:
    """True when Gmail returns a 400 ``failedPrecondition``.

    Gmail intermittently rejects ``messages.get`` (and related per-message reads)
    with ``400 FAILED_PRECONDITION`` / "Precondition check failed" even when the
    OAuth token and message id are valid — Google documents this as a transient
    backend state that succeeds on retry. Detect it by reason/status so we only
    retry this specific case and still fail fast on genuine 400s (e.g. bad id).
    """
    if r.status_code != 400:
        return False
    try:
        error = r.json().get("error", {})
    except Exception:
        return "failedprecondition" in r.text.lower()
    if str(error.get("status", "")).upper() == "FAILED_PRECONDITION":
        return True
    return any(
        str(e.get("reason", "")).lower() == "failedprecondition"
        for e in error.get("errors", [])
        if isinstance(e, dict)
    )


async def _get_with_precondition_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict,
    params: dict | None = None,
    max_attempts: int = 4,
) -> httpx.Response:
    """GET that retries Gmail's transient 400 ``failedPrecondition`` with backoff."""
    delay = 0.5
    r: httpx.Response | None = None
    for attempt in range(1, max_attempts + 1):
        r = await request_with_rate_limit(
            client, "GET", url, headers=headers, params=params
        )
        if attempt >= max_attempts or not _is_transient_precondition(r):
            return r
        await asyncio.sleep(delay + random.uniform(0, 0.25))
        delay = min(delay * 2, 5.0)
    assert r is not None  # loop runs at least once
    return r


def _raise_for_status(r: httpx.Response, operation: str) -> None:
    if r.status_code == 401:
        raise ConnectorError(
            "TOKEN_EXPIRED",
            f"Gmail {operation} failed: OAuth access token is invalid or expired",
        )
    if r.status_code >= 400:
        raise ConnectorError(
            "GMAIL_API_ERROR",
            f"Gmail {operation} failed ({r.status_code}): {r.text[:300]}",
        )


def _header(payload: dict, name: str) -> str:
    for h in payload.get("headers", []):
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _decode_base64url(data: str) -> bytes:
    if not data:
        return b""
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _extract_text_and_attachments(payload: dict, message_id: str) -> tuple[str, str, list[dict[str, Any]]]:
    plain_parts: list[str] = []
    html_parts: list[str] = []
    attachments: list[dict[str, Any]] = []

    def visit(part: dict) -> None:
        mime_type = str(part.get("mimeType", ""))
        body = part.get("body", {}) if isinstance(part.get("body"), dict) else {}
        filename = str(part.get("filename", "") or "")
        data = body.get("data")
        attachment_id = body.get("attachmentId")
        size = body.get("size")

        if mime_type == "text/plain" and data:
            plain_parts.append(_decode_base64url(str(data)).decode("utf-8", errors="replace"))
        elif mime_type == "text/html" and data:
            html_parts.append(_decode_base64url(str(data)).decode("utf-8", errors="replace"))

        if attachment_id:
            attachments.append(
                {
                    "message_id": message_id,
                    "attachment_id": str(attachment_id),
                    "filename": filename or "attachment",
                    "mime_type": mime_type or "application/octet-stream",
                    "size_bytes": int(size) if isinstance(size, int) else 0,
                    "is_inline": bool(part.get("headers"))
                    and any(
                        str(h.get("name", "")).lower() == "content-id"
                        for h in (part.get("headers") or [])
                        if isinstance(h, dict)
                    ),
                }
            )

        for child in part.get("parts", []) if isinstance(part.get("parts"), list) else []:
            if isinstance(child, dict):
                visit(child)

    visit(payload)

    body_text = "\n".join([p for p in plain_parts if p]).strip()
    body_html = "\n".join([p for p in html_parts if p]).strip()
    return body_text, body_html, attachments
