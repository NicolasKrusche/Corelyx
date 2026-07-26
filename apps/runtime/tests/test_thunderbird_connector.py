"""Unit tests for the Thunderbird (IMAP/SMTP) connector's pure logic.

The network paths need a live mail server, so these cover the parsing/credential/
search helpers and auto-registration — the parts that carry the bugs.
"""
import sys as _sys
import types as _types
from pathlib import Path as _Path
from unittest.mock import MagicMock as _MagicMock

for _m in list(_sys.modules):
    if _m.startswith("connectors.") or _m == "engine.executor":
        del _sys.modules[_m]

if "connectors" not in _sys.modules or not getattr(_sys.modules.get("connectors"), "_is_stub", False):
    _base = _types.ModuleType("connectors.base")
    class _CE(Exception):
        def __init__(self, code="", message=""):
            super().__init__(message)
            self.code = code
            self.message = message
    _base.ConnectorError = _CE
    _base.IConnector = type("IConnector", (), {})
    _conn = _types.ModuleType("connectors")
    _conn._is_stub = True
    _conn.get_connector = _MagicMock(return_value=None)
    _conn.REGISTRY = {}
    _conn.IConnector = _base.IConnector
    _conn.ConnectorError = _CE
    # Keep the stub importable as a *package* so `import connectors.<mod>`
    # still resolves to the real module on disk. Without __path__ the stub
    # is a plain module, and because these stubs are installed at import
    # time and never torn down, the first agent test collected poisoned
    # sys.modules for every later test in the session.
    _conn.__path__ = [str(_Path(__file__).resolve().parent.parent / "connectors")]
    _sys.modules["connectors"] = _conn
    _sys.modules["connectors.base"] = _base

import email
import imaplib
import json
import socket
from unittest.mock import patch

import pytest

from connectors import get_connector, REGISTRY
from connectors.base import ConnectorError
import connectors.thunderbird as tb
from connectors.thunderbird import (
    ThunderbirdConnector,
    _addr_list,
    _build_search,
    _extract_body,
    _hdr,
    _parse_credentials,
    _parse_folder_name,
    _reject_internal_host,
)


def test_registered_and_discovered():
    assert REGISTRY.get("thunderbird") is ThunderbirdConnector
    assert isinstance(get_connector("thunderbird"), ThunderbirdConnector)
    assert "send_email" in ThunderbirdConnector.supported_operations


def test_reject_internal_host_blocks_loopback_and_private_ips():
    with pytest.raises(ConnectorError):
        _reject_internal_host("127.0.0.1", "IMAP")
    with pytest.raises(ConnectorError):
        _reject_internal_host("10.0.0.5", "SMTP")
    with pytest.raises(ConnectorError):
        _reject_internal_host("localhost", "IMAP")


def test_reject_internal_host_allows_public_address():
    with patch.object(tb.socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("93.184.216.34", 0))]):
        _reject_internal_host("example.com", "IMAP")  # should not raise


def test_reject_internal_host_surfaces_dns_failure():
    with patch.object(tb.socket, "getaddrinfo", side_effect=socket.gaierror("boom")):
        with pytest.raises(ConnectorError):
            _reject_internal_host("does-not-resolve.invalid", "SMTP")


def test_parse_credentials_defaults_ports_from_security():
    creds = _parse_credentials(
        json.dumps(
            {
                "imap_host": "imap.fastmail.com",
                "username": "me@x.com",
                "password": "pw",
                "security": "ssl",
            }
        )
    )
    assert creds.imap_port == 993 and creds.smtp_port == 465
    starttls = _parse_credentials(
        json.dumps(
            {
                "imap_host": "h",
                "username": "u",
                "password": "p",
                "security": "starttls",
            }
        )
    )
    assert starttls.imap_port == 143 and starttls.smtp_port == 587


def test_parse_credentials_rejects_garbage_and_missing_fields():
    with pytest.raises(ConnectorError):
        _parse_credentials("not json")
    with pytest.raises(ConnectorError):
        _parse_credentials(json.dumps({"username": "u"}))  # no imap_host


def test_decode_rfc2047_header():
    assert _hdr("=?utf-8?q?Hello_W=C3=B6rld?=") == "Hello Wörld"
    assert _hdr(None) == ""
    assert _hdr("Plain Subject") == "Plain Subject"


def test_extract_body_separates_text_html_and_attachments():
    raw = (
        "From: a@x.com\r\nTo: b@y.com\r\nSubject: Hi\r\n"
        "Content-Type: multipart/mixed; boundary=BB\r\n\r\n"
        "--BB\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nplain body\r\n"
        "--BB\r\nContent-Type: text/html\r\n\r\n<p>html body</p>\r\n"
        "--BB\r\nContent-Type: application/pdf\r\n"
        "Content-Disposition: attachment; filename=doc.pdf\r\n\r\n%PDF-bytes\r\n"
        "--BB--\r\n"
    )
    msg = email.message_from_string(raw)
    text, html, attachments = _extract_body(msg)
    assert text == "plain body"
    assert html == "<p>html body</p>"
    assert len(attachments) == 1
    assert attachments[0]["filename"] == "doc.pdf"
    assert attachments[0]["content_type"] == "application/pdf"


def test_addr_list_normalises_string_and_list():
    assert _addr_list("a@x.com, B <b@y.com>") == ["a@x.com", "b@y.com"]
    assert _addr_list(["a@x.com", "b@y.com"]) == ["a@x.com", "b@y.com"]
    assert _addr_list(None) == []


def test_build_search_translates_params():
    tokens = _build_search({"from": "boss@co.com", "subject": "invoice", "unseen_only": "true"})
    assert "FROM" in tokens and '"boss@co.com"' in tokens
    assert "SUBJECT" in tokens and '"invoice"' in tokens
    assert "UNSEEN" in tokens
    assert _build_search({}) == ["ALL"]


def test_build_search_quotes_safely():
    tokens = _build_search({"subject": 'say "hi"'})
    assert '"say \\"hi\\""' in tokens


def test_parse_folder_name_from_list_line():
    assert _parse_folder_name(b'(\\HasNoChildren) "/" "INBOX"') == "INBOX"
    assert _parse_folder_name(b'(\\HasChildren) "/" "[Gmail]/Sent Mail"') == "[Gmail]/Sent Mail"


# ── Triage (write) ops — IMAP mocked via a fake client ───────────────────────────


class _FakeIMAP:
    def __init__(self, capabilities=("IMAP4REV1", "UIDPLUS"), expunge_error=False) -> None:
        self.calls: list[tuple] = []
        self.capabilities = tuple(capabilities)
        self._expunge_error = expunge_error

    def select(self, folder, readonly=False):
        self.calls.append(("select", folder, readonly))
        return ("OK", [b""])

    def uid(self, command, *args):
        self.calls.append(("uid", command, args))
        if command.upper() == "EXPUNGE" and self._expunge_error:
            raise imaplib.IMAP4.error("server rejected UID EXPUNGE")
        return ("OK", [b"1"])

    def expunge(self):
        self.calls.append(("expunge",))
        return ("OK", [b""])

    def capability(self):
        self.calls.append(("capability",))
        caps = b" ".join(c.encode() for c in self.capabilities)
        return ("OK", [caps])

    def logout(self):
        pass


def _creds():
    return _parse_credentials(
        json.dumps(
            {
                "imap_host": "h",
                "smtp_host": "s",
                "username": "u",
                "password": "p",
            }
        )
    )


def test_triage_ops_are_supported():
    for op in [
        "move_message",
        "archive_message",
        "mark_spam",
        "trash_message",
        "mark_read",
        "mark_unread",
        "flag_message",
    ]:
        assert op in ThunderbirdConnector.supported_operations


def test_mark_read_sets_seen_via_writable_select(monkeypatch):
    fake = _FakeIMAP()
    monkeypatch.setattr(tb, "_imap_connect", lambda creds: fake)
    out = tb._set_flag(_creds(), {"uid": "7"}, r"\Seen", True)
    assert out["updated"] is True and out["added"] is True
    select = next(c for c in fake.calls if c[0] == "select")
    assert select[2] is False  # read-write, not readonly
    store = next(c for c in fake.calls if c[0] == "uid" and c[1] == "STORE")
    assert store[2][1] == "+FLAGS" and store[2][2] == r"(\Seen)"


def test_archive_copies_then_uid_expunges_only_that_uid(monkeypatch):
    # R2: archive/move must UID-EXPUNGE only the moved message, never blanket
    # expunge (which would destroy every \Deleted-flagged message in the folder).
    fake = _FakeIMAP()  # advertises UIDPLUS
    monkeypatch.setattr(tb, "_imap_connect", lambda creds: fake)
    out = tb._archive(_creds(), {"uid": "7"})
    assert out["moved"] is True and out["to"] == "Archive"
    uid_cmds = [c[1] for c in fake.calls if c[0] == "uid"]
    assert "COPY" in uid_cmds and "STORE" in uid_cmds and "EXPUNGE" in uid_cmds
    # Never a blanket expunge.
    assert not any(c[0] == "expunge" for c in fake.calls)
    # The UID EXPUNGE targeted only uid 7.
    expunge_args = [c[2] for c in fake.calls if c[0] == "uid" and c[1] == "EXPUNGE"]
    assert expunge_args == [("7",)]


def test_move_without_uidplus_leaves_deleted_flag_and_never_blanket_expunges(monkeypatch):
    # R2: no UIDPLUS -> leave \Deleted set (message already COPYed / soft-deleted),
    # and NEVER call the blanket expunge that would nuke unrelated deleted mail.
    fake = _FakeIMAP(capabilities=("IMAP4REV1",))
    monkeypatch.setattr(tb, "_imap_connect", lambda creds: fake)
    out = tb._archive(_creds(), {"uid": "7"})
    assert out["moved"] is True
    uid_cmds = [c[1] for c in fake.calls if c[0] == "uid"]
    assert "COPY" in uid_cmds and "STORE" in uid_cmds
    assert "EXPUNGE" not in uid_cmds
    assert not any(c[0] == "expunge" for c in fake.calls)


def test_uid_expunge_rejection_is_swallowed_not_escalated_to_blanket(monkeypatch):
    # If the server advertises UIDPLUS but rejects UID EXPUNGE, we must leave
    # \Deleted set rather than fall back to a destructive blanket expunge.
    fake = _FakeIMAP(expunge_error=True)
    monkeypatch.setattr(tb, "_imap_connect", lambda creds: fake)
    out = tb._archive(_creds(), {"uid": "7"})
    assert out["moved"] is True
    assert not any(c[0] == "expunge" for c in fake.calls)


def test_trash_permanent_uid_expunges_only_that_uid(monkeypatch):
    fake = _FakeIMAP()
    monkeypatch.setattr(tb, "_imap_connect", lambda creds: fake)
    out = tb._trash(_creds(), {"uid": "7", "permanent": "true"})
    assert out["deleted"] is True and out["permanent"] is True
    uid_cmds = [c[1] for c in fake.calls if c[0] == "uid"]
    assert "COPY" not in uid_cmds and "STORE" in uid_cmds and "EXPUNGE" in uid_cmds
    assert not any(c[0] == "expunge" for c in fake.calls)
    expunge_args = [c[2] for c in fake.calls if c[0] == "uid" and c[1] == "EXPUNGE"]
    assert expunge_args == [("7",)]


def test_server_has_uidplus_detected_from_attribute():
    assert tb._server_has_uidplus(_FakeIMAP(capabilities=("IMAP4REV1", "UIDPLUS"))) is True
    assert tb._server_has_uidplus(_FakeIMAP(capabilities=("IMAP4REV1",))) is False


def test_server_has_uidplus_falls_back_to_live_capability_query():
    # capabilities attr empty but the live CAPABILITY response includes UIDPLUS.
    class _CapOnly:
        capabilities = ()

        def capability(self):
            return ("OK", [b"IMAP4REV1 UIDPLUS LITERAL+"])

    assert tb._server_has_uidplus(_CapOnly()) is True


def test_move_message_requires_dest():
    with pytest.raises(ConnectorError):
        tb._move_message(_creds(), {"uid": "7"})


def test_triage_ops_require_uid():
    with pytest.raises(ConnectorError):
        tb._set_flag(_creds(), {}, r"\Seen", True)
