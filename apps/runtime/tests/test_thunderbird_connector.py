"""Unit tests for the Thunderbird (IMAP/SMTP) connector's pure logic.

The network paths need a live mail server, so these cover the parsing/credential/
search helpers and auto-registration — the parts that carry the bugs.
"""
import email
import json

import pytest

from connectors import get_connector, REGISTRY
from connectors.base import ConnectorError
from connectors.thunderbird import (
    ThunderbirdConnector,
    _addr_list,
    _build_search,
    _extract_body,
    _hdr,
    _parse_credentials,
    _parse_folder_name,
)


def test_registered_and_discovered():
    assert REGISTRY.get("thunderbird") is ThunderbirdConnector
    assert isinstance(get_connector("thunderbird"), ThunderbirdConnector)
    assert "send_email" in ThunderbirdConnector.supported_operations


def test_parse_credentials_defaults_ports_from_security():
    creds = _parse_credentials(json.dumps({
        "imap_host": "imap.fastmail.com", "username": "me@x.com",
        "password": "pw", "security": "ssl",
    }))
    assert creds.imap_port == 993 and creds.smtp_port == 465
    starttls = _parse_credentials(json.dumps({
        "imap_host": "h", "username": "u", "password": "p", "security": "starttls",
    }))
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
