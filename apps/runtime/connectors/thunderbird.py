"""Thunderbird / generic IMAP+SMTP email connector.

Thunderbird has no cloud API — it's a desktop client over IMAP/SMTP. This
connector talks the same protocols, so it works for anyone whose mail lives in
Thunderbird (or any IMAP host: Fastmail, a company server, self-hosted, …). The
user supplies host/port/username/password; for Gmail/Outlook that's an
app-password (their IMAP still requires one).

Credential model: unlike the OAuth connectors, the secret here is a small JSON
blob (host/port/user/password/security) stored via the api_key path and handed
to `execute` as `access_token`. We parse it here. imaplib/smtplib/email are
stdlib, so no new dependency — and they're blocking, so every network call runs
in a worker thread via `asyncio.to_thread`.

Read operations never include attachment *bytes* (only metadata) and body text
is what flows downstream; the runtime pseudonymises it before any LLM sees it,
exactly like the other email connectors.
"""

from __future__ import annotations

import asyncio
import email
import imaplib
import json
import smtplib
from email.header import decode_header, make_header
from email.message import EmailMessage, Message
from email.utils import formatdate, make_msgid, parseaddr
from typing import Any

from .base import ConnectorError, IConnector

# Caps so one op can't pull a whole mailbox into memory.
MAX_LIST = 100
DEFAULT_LIST = 25
MAX_BODY_CHARS = 100_000


class ThunderbirdConnector(IConnector):
    """IMAP/SMTP email for Thunderbird users and any IMAP host."""

    provider = "thunderbird"
    supported_operations = [
        # read
        "list_folders",
        "list_messages",
        "get_message",
        "search_messages",
        # send
        "send_email",
        # triage (write)
        "move_message",
        "archive_message",
        "mark_spam",
        "trash_message",
        "mark_read",
        "mark_unread",
        "flag_message",
    ]

    async def execute(self, operation: str, params: dict[str, Any], access_token: str) -> dict[str, Any]:
        creds = _parse_credentials(access_token)
        p = params or {}
        if operation == "list_folders":
            return await asyncio.to_thread(_list_folders, creds)
        if operation == "list_messages":
            return await asyncio.to_thread(_list_messages, creds, p, None)
        if operation == "search_messages":
            return await asyncio.to_thread(_list_messages, creds, p, _build_search(p))
        if operation == "get_message":
            return await asyncio.to_thread(_get_message, creds, p)
        if operation == "send_email":
            return await asyncio.to_thread(_send_email, creds, p)
        # ── Triage (write) — move/flag a message by UID ──
        if operation == "move_message":
            return await asyncio.to_thread(_move_message, creds, p)
        if operation == "archive_message":
            return await asyncio.to_thread(_archive, creds, p)
        if operation == "mark_spam":
            return await asyncio.to_thread(_spam, creds, p)
        if operation == "trash_message":
            return await asyncio.to_thread(_trash, creds, p)
        if operation == "mark_read":
            return await asyncio.to_thread(_set_flag, creds, p, r"\Seen", True)
        if operation == "mark_unread":
            return await asyncio.to_thread(_set_flag, creds, p, r"\Seen", False)
        if operation == "flag_message":
            return await asyncio.to_thread(_set_flag, creds, p, r"\Flagged", not _truthy(p.get("unflag")))
        raise ConnectorError("UNSUPPORTED_OPERATION", f"Thunderbird does not support '{operation}'")


# ── Credentials ───────────────────────────────────────────────────────────────


class _Creds:
    __slots__ = (
        "imap_host",
        "imap_port",
        "smtp_host",
        "smtp_port",
        "username",
        "password",
        "security",
    )

    def __init__(self, data: dict[str, Any]) -> None:
        self.imap_host = str(data.get("imap_host") or "").strip()
        self.smtp_host = str(data.get("smtp_host") or "").strip()
        self.username = str(data.get("username") or "").strip()
        self.password = str(data.get("password") or "")
        self.security = str(data.get("security") or "ssl").strip().lower()
        self.imap_port = int(data.get("imap_port") or (993 if self.security == "ssl" else 143))
        self.smtp_port = int(data.get("smtp_port") or (465 if self.security == "ssl" else 587))


def _parse_credentials(access_token: str) -> _Creds:
    try:
        data = json.loads(access_token)
        if not isinstance(data, dict):
            raise ValueError("not an object")
    except Exception as exc:  # noqa: BLE001
        raise ConnectorError(
            "BAD_CREDENTIALS",
            "Email credentials are misconfigured — reconnect the account.",
        ) from exc
    creds = _Creds(data)
    if not creds.imap_host or not creds.username:
        raise ConnectorError("BAD_CREDENTIALS", "Email connection is missing a host or username.")
    return creds


# ── IMAP ──────────────────────────────────────────────────────────────────────


def _imap_connect(creds: _Creds) -> imaplib.IMAP4:
    try:
        if creds.security == "starttls":
            client: imaplib.IMAP4 = imaplib.IMAP4(creds.imap_host, creds.imap_port)
            client.starttls()
        else:
            client = imaplib.IMAP4_SSL(creds.imap_host, creds.imap_port)
        client.login(creds.username, creds.password)
        return client
    except (imaplib.IMAP4.error, OSError) as exc:
        raise ConnectorError("IMAP_CONNECT_FAILED", f"Could not reach the mail server: {exc}") from exc


def _list_folders(creds: _Creds) -> dict[str, Any]:
    client = _imap_connect(creds)
    try:
        typ, data = client.list()
        if typ != "OK":
            raise ConnectorError("IMAP_ERROR", "Could not list folders.")
        folders = [name for raw in data if raw and (name := _parse_folder_name(raw))]
        return {"folders": folders}
    finally:
        _logout(client)


def _list_messages(creds: _Creds, p: dict[str, Any], criteria: list[str] | None) -> dict[str, Any]:
    folder = str(p.get("folder") or "INBOX").strip() or "INBOX"
    limit = max(1, min(MAX_LIST, int(p.get("limit") or DEFAULT_LIST)))
    client = _imap_connect(creds)
    try:
        typ, _ = client.select(f'"{folder}"', readonly=True)
        if typ != "OK":
            raise ConnectorError("IMAP_ERROR", f"Folder '{folder}' not found.")
        search = criteria or ["ALL"]
        typ, data = client.uid("search", None, *search)
        if typ != "OK":
            raise ConnectorError("IMAP_ERROR", "Search failed.")
        uids = (data[0] or b"").split()
        uids = uids[-limit:][::-1]  # newest first
        messages = [_fetch_header(client, uid) for uid in uids]
        return {"folder": folder, "count": len(messages), "messages": [m for m in messages if m]}
    finally:
        _logout(client)


def _fetch_header(client: imaplib.IMAP4, uid: bytes) -> dict[str, Any] | None:
    typ, data = client.uid("fetch", uid, "(FLAGS BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])")
    if typ != "OK" or not data or not isinstance(data[0], tuple):
        return None
    flags_raw = data[0][0] or b""
    msg = email.message_from_bytes(data[0][1])
    return {
        "uid": uid.decode(),
        "from": _hdr(msg.get("From")),
        "to": _hdr(msg.get("To")),
        "subject": _hdr(msg.get("Subject")),
        "date": _hdr(msg.get("Date")),
        "seen": b"\\Seen" in flags_raw,
    }


def _get_message(creds: _Creds, p: dict[str, Any]) -> dict[str, Any]:
    folder = str(p.get("folder") or "INBOX").strip() or "INBOX"
    uid = str(p.get("uid") or "").strip()
    if not uid:
        raise ConnectorError("MISSING_PARAM", "get_message requires 'uid'.")
    client = _imap_connect(creds)
    try:
        typ, _ = client.select(f'"{folder}"', readonly=True)
        if typ != "OK":
            raise ConnectorError("IMAP_ERROR", f"Folder '{folder}' not found.")
        typ, data = client.uid("fetch", uid.encode(), "(BODY.PEEK[])")
        if typ != "OK" or not data or not isinstance(data[0], tuple):
            raise ConnectorError("IMAP_ERROR", f"Message {uid} not found.")
        msg = email.message_from_bytes(data[0][1])
        body_text, body_html, attachments = _extract_body(msg)
        return {
            "uid": uid,
            "from": _hdr(msg.get("From")),
            "to": _hdr(msg.get("To")),
            "cc": _hdr(msg.get("Cc")),
            "subject": _hdr(msg.get("Subject")),
            "date": _hdr(msg.get("Date")),
            "body_text": body_text[:MAX_BODY_CHARS],
            "body_html": body_html[:MAX_BODY_CHARS] if body_html else None,
            "attachments": attachments,
        }
    finally:
        _logout(client)


def _build_search(p: dict[str, Any]) -> list[str]:
    """Translate friendly params into IMAP SEARCH tokens (all-criteria = AND)."""
    out: list[str] = []
    if v := _clean(p.get("from")):
        out += ["FROM", _quote(v)]
    if v := _clean(p.get("subject")):
        out += ["SUBJECT", _quote(v)]
    if v := _clean(p.get("text")):
        out += ["TEXT", _quote(v)]
    if v := _clean(p.get("since")):
        out += ["SINCE", v]  # expects DD-Mon-YYYY
    if str(p.get("unseen_only") or "").lower() in ("1", "true", "yes"):
        out += ["UNSEEN"]
    return out or ["ALL"]


# ── IMAP write (triage) ────────────────────────────────────────────────────────
#
# All operate on one message by UID in a source folder (default INBOX). Moves use
# COPY + \Deleted + EXPUNGE (works on every IMAP server, no MOVE extension needed).
# Destination folder names vary per server (Archive/Junk/Trash, "[Gmail]/Trash",
# "Deleted Items", …) — callers can pass `dest`; otherwise we use a sensible
# default and surface a clear error pointing at list_folders if it doesn't exist.


def _require_uid(p: dict[str, Any]) -> str:
    uid = str(p.get("uid") or "").strip()
    if not uid:
        raise ConnectorError("MISSING_PARAM", "this operation requires 'uid' (from a list/search result).")
    return uid


def _source_folder(p: dict[str, Any]) -> str:
    return str(p.get("folder") or "INBOX").strip() or "INBOX"


def _select_rw(client: imaplib.IMAP4, folder: str) -> None:
    typ, _ = client.select(f'"{folder}"', readonly=False)
    if typ != "OK":
        raise ConnectorError("IMAP_ERROR", f"Folder '{folder}' not found.")


def _move(creds: _Creds, p: dict[str, Any], dest: str) -> dict[str, Any]:
    uid = _require_uid(p)
    folder = _source_folder(p)
    dest = (dest or "").strip()
    if not dest:
        raise ConnectorError("MISSING_PARAM", "no destination folder given.")
    client = _imap_connect(creds)
    try:
        _select_rw(client, folder)
        typ, _ = client.uid("COPY", uid, f'"{dest}"')
        if typ != "OK":
            raise ConnectorError(
                "IMAP_ERROR",
                f"Could not copy to '{dest}'. Use list_folders to get the exact folder name.",
            )
        client.uid("STORE", uid, "+FLAGS", r"(\Deleted)")
        client.expunge()
        return {"moved": True, "uid": uid, "from": folder, "to": dest}
    finally:
        _logout(client)


def _move_message(creds: _Creds, p: dict[str, Any]) -> dict[str, Any]:
    dest = _clean(p.get("dest") or p.get("to_folder"))
    if not dest:
        raise ConnectorError("MISSING_PARAM", "move_message requires 'dest' (the target folder).")
    return _move(creds, p, dest)


def _archive(creds: _Creds, p: dict[str, Any]) -> dict[str, Any]:
    return _move(creds, p, _clean(p.get("dest")) or "Archive")


def _spam(creds: _Creds, p: dict[str, Any]) -> dict[str, Any]:
    return _move(creds, p, _clean(p.get("dest")) or "Junk")


def _trash(creds: _Creds, p: dict[str, Any]) -> dict[str, Any]:
    # Default: move to Trash (reversible). permanent=true: \Deleted + EXPUNGE in place.
    if _truthy(p.get("permanent")):
        uid = _require_uid(p)
        folder = _source_folder(p)
        client = _imap_connect(creds)
        try:
            _select_rw(client, folder)
            client.uid("STORE", uid, "+FLAGS", r"(\Deleted)")
            client.expunge()
            return {"deleted": True, "permanent": True, "uid": uid, "from": folder}
        finally:
            _logout(client)
    return _move(creds, p, _clean(p.get("dest")) or "Trash")


def _set_flag(creds: _Creds, p: dict[str, Any], flag: str, add: bool) -> dict[str, Any]:
    uid = _require_uid(p)
    folder = _source_folder(p)
    client = _imap_connect(creds)
    try:
        _select_rw(client, folder)
        typ, _ = client.uid("STORE", uid, "+FLAGS" if add else "-FLAGS", f"({flag})")
        if typ != "OK":
            raise ConnectorError("IMAP_ERROR", "Could not update message flags.")
        return {"uid": uid, "updated": True, "flag": flag, "added": bool(add)}
    finally:
        _logout(client)


# ── SMTP ──────────────────────────────────────────────────────────────────────


def _send_email(creds: _Creds, p: dict[str, Any]) -> dict[str, Any]:
    to = _addr_list(p.get("to"))
    if not to:
        raise ConnectorError("MISSING_PARAM", "send_email requires 'to'.")
    if not creds.smtp_host:
        raise ConnectorError("BAD_CREDENTIALS", "No SMTP host configured for sending.")

    msg = EmailMessage()
    msg["From"] = _clean(p.get("from")) or creds.username
    msg["To"] = ", ".join(to)
    if cc := _addr_list(p.get("cc")):
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = _clean(p.get("subject")) or "(no subject)"
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid()
    msg.set_content(str(p.get("body") or ""))
    if html := _clean(p.get("html")):
        msg.add_alternative(html, subtype="html")

    recipients = to + _addr_list(p.get("cc")) + _addr_list(p.get("bcc"))
    try:
        if creds.security == "starttls":
            with smtplib.SMTP(creds.smtp_host, creds.smtp_port, timeout=30) as s:
                s.starttls()
                s.login(creds.username, creds.password)
                s.send_message(msg, to_addrs=recipients)
        else:
            with smtplib.SMTP_SSL(creds.smtp_host, creds.smtp_port, timeout=30) as s:
                s.login(creds.username, creds.password)
                s.send_message(msg, to_addrs=recipients)
    except (smtplib.SMTPException, OSError) as exc:
        raise ConnectorError("SMTP_SEND_FAILED", f"Could not send the email: {exc}") from exc
    return {"sent": True, "message_id": msg["Message-ID"], "to": to}


# ── Pure helpers (unit-tested) ────────────────────────────────────────────────


def _hdr(value: str | None) -> str:
    """Decode an RFC 2047 header to a plain string."""
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:  # noqa: BLE001
        return value


def _extract_body(msg: Message) -> tuple[str, str | None, list[dict[str, Any]]]:
    """Return (plain text, html or None, attachment metadata) for a message."""
    text_parts: list[str] = []
    html_parts: list[str] = []
    attachments: list[dict[str, Any]] = []

    for part in msg.walk():
        if part.is_multipart():
            continue
        disposition = str(part.get("Content-Disposition") or "")
        ctype = part.get_content_type()
        filename = part.get_filename()
        if "attachment" in disposition.lower() or filename:
            payload = part.get_payload(decode=True) or b""
            attachments.append(
                {
                    "filename": _hdr(filename) if filename else "attachment",
                    "content_type": ctype,
                    "size": len(payload),
                }
            )
            continue
        if ctype == "text/plain":
            text_parts.append(_decode_part(part))
        elif ctype == "text/html":
            html_parts.append(_decode_part(part))

    return "\n".join(text_parts).strip(), ("\n".join(html_parts).strip() or None), attachments


def _decode_part(part: Message) -> str:
    payload = part.get_payload(decode=True)
    if payload is None:
        return ""
    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except (LookupError, ValueError):
        return payload.decode("utf-8", errors="replace")


def _addr_list(value: Any) -> list[str]:
    """Normalise a to/cc/bcc value (string or list) to a list of addresses."""
    if value is None:
        return []
    items = value if isinstance(value, list) else str(value).split(",")
    out: list[str] = []
    for item in items:
        addr = parseaddr(str(item))[1].strip()
        if addr:
            out.append(addr)
    return out


def _parse_folder_name(raw: bytes | tuple) -> str | None:
    line = raw.decode(errors="replace") if isinstance(raw, bytes) else str(raw)
    # LIST line: (\HasNoChildren) "/" "INBOX"  — the folder is the last quoted/space token.
    if '"' in line:
        parts = line.split('"')
        name = parts[-2] if len(parts) >= 2 else ""
    else:
        name = line.split(" ")[-1]
    name = name.strip()
    return name or None


def _clean(value: Any) -> str:
    return str(value).strip() if value not in (None, "") else ""


def _truthy(value: Any) -> bool:
    return str(value).strip().lower() in ("1", "true", "yes", "y")


def _quote(value: str) -> str:
    # IMAP SEARCH string args are quoted; escape embedded quotes/backslashes.
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _logout(client: imaplib.IMAP4) -> None:
    try:
        client.logout()
    except Exception:  # noqa: BLE001
        pass
