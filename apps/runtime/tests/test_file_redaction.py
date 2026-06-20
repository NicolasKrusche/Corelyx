"""File content must be pseudonymized before it reaches the LLM — same as email.

The `corelyx.file` agent tool (and a `file` connection node feeding an agent)
returns file contents through the agent loop, which sanitizes every tool result
and every input with `PseudonymizationSession` before the model sees it. These
tests pin that guarantee for the file-read result shape specifically, so a future
change can't silently start leaking raw file contents into a prompt.
"""
from engine.pii import PseudonymizationSession


def _file_read_result(content: str) -> dict:
    # The exact shape the Bridge returns for a read, wrapped as the tool returns it.
    return {"ok": True, "result": {"encoding": "utf-8", "content": content, "bytes": len(content)}}


def test_file_content_pii_is_redacted_before_llm():
    raw = (
        "Invoice for max@firma.de, IBAN DE44 5001 0517 5407 3249 31, "
        "card 4111 1111 1111 1111, phone +49 170 1234567"
    )
    session = PseudonymizationSession()
    sanitized = session.sanitize_value(_file_read_result(raw))
    content = sanitized.value["result"]["content"]

    # No raw sensitive values survive into what the model sees.
    assert "max@firma.de" not in content
    assert "DE44" not in content
    assert "4111 1111 1111 1111" not in content
    # They become stable, reversible placeholders.
    assert "[EMAIL_1]" in content
    assert "[IBAN_1]" in content
    assert "[CREDIT_CARD_1]" in content
    assert sanitized.redacted


def test_file_content_rehydrates_for_the_real_sink():
    # When the agent then writes the value back / passes it to a tool, the real
    # values are substituted back in on our side (the model never held them).
    raw = "Email max@firma.de about IBAN DE44 5001 0517 5407 3249 31"
    session = PseudonymizationSession()
    content = session.sanitize_value(_file_read_result(raw)).value["result"]["content"]
    assert session.rehydrate_text(content) == raw


def test_secrets_in_files_are_destroyed_not_reversible():
    # A credential in a file must never round-trip back through the model.
    raw = "api_key=sk-live_ABCDEF0123456789abcdef"
    session = PseudonymizationSession()
    content = session.sanitize_value(_file_read_result(raw)).value["result"]["content"]
    assert "sk-live_ABCDEF0123456789abcdef" not in content
    assert "[REDACTED_SECRET]" in content
    # Secrets are not in the reversible map — rehydrate leaves the placeholder.
    assert "[REDACTED_SECRET]" in session.rehydrate_text(content)
