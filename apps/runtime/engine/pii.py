from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any


PiiRedactionCounts = dict[str, int]


@dataclass(frozen=True)
class PiiSanitizationResult:
    value: Any
    redactions: PiiRedactionCounts

    @property
    def redacted(self) -> bool:
        return any(count > 0 for count in self.redactions.values())


PLACEHOLDERS = {
    "credit_card": "[REDACTED_CREDIT_CARD]",
    "email": "[REDACTED_EMAIL]",
    "iban": "[REDACTED_IBAN]",
    "ip_address": "[REDACTED_IP_ADDRESS]",
    "national_id": "[REDACTED_NATIONAL_ID]",
    "phone": "[REDACTED_PHONE]",
    "secret": "[REDACTED_SECRET]",
}

SECRET_ASSIGNMENT_RE = re.compile(
    r'\b((?:api[_-]?key|secret|token|access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*["\']?)'
    r'([A-Za-z0-9._~+/=-]{12,})(["\']?)',
    re.IGNORECASE,
)
BEARER_TOKEN_RE = re.compile(r"\b(Authorization\s*:\s*Bearer\s+)([A-Za-z0-9._~+/=-]{12,})", re.IGNORECASE)
PREFIXED_SECRET_RE = re.compile(
    r"\b(?:sk|pk|rk|ghp|gho|ghu|ghs|glpat|github_pat|xox[baprs]?)[-_][A-Za-z0-9_=-]{12,}\b",
    re.IGNORECASE,
)
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
IBAN_RE = re.compile(r"\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b", re.IGNORECASE)
CREDIT_CARD_CANDIDATE_RE = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
NATIONAL_ID_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
IPV4_RE = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")
INTERNATIONAL_PHONE_RE = re.compile(r"(?:\+|00)\d[\d\s().-]{7,}\d")
US_PHONE_RE = re.compile(r"(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b")


def _add_count(redactions: PiiRedactionCounts, kind: str, count: int) -> None:
    if count > 0:
        redactions[kind] = redactions.get(kind, 0) + count


def merge_redactions(*items: PiiRedactionCounts | None) -> PiiRedactionCounts:
    merged: PiiRedactionCounts = {}
    for item in items:
        if not item:
            continue
        for kind, count in item.items():
            _add_count(merged, kind, count)
    return merged


def _luhn_check(digits: str) -> bool:
    total = 0
    should_double = False

    for char in reversed(digits):
        if not char.isdigit():
            return False

        digit = int(char)
        if should_double:
            digit *= 2
            if digit > 9:
                digit -= 9

        total += digit
        should_double = not should_double

    return total > 0 and total % 10 == 0


def _redact_regex(text: str, kind: str, pattern: re.Pattern[str]) -> tuple[str, int]:
    return pattern.subn(PLACEHOLDERS[kind], text)


def _redact_secret_assignments(text: str) -> tuple[str, int]:
    count = 0

    def replace_assignment(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return f"{match.group(1)}{PLACEHOLDERS['secret']}{match.group(3)}"

    def replace_bearer(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return f"{match.group(1)}{PLACEHOLDERS['secret']}"

    value = SECRET_ASSIGNMENT_RE.sub(replace_assignment, text)
    value = BEARER_TOKEN_RE.sub(replace_bearer, value)
    return value, count


def _redact_credit_cards(text: str) -> tuple[str, int]:
    count = 0

    def replace_card(match: re.Match[str]) -> str:
        nonlocal count
        digits = re.sub(r"\D", "", match.group(0))
        if len(digits) < 13 or len(digits) > 19 or not _luhn_check(digits):
            return match.group(0)

        count += 1
        return PLACEHOLDERS["credit_card"]

    return CREDIT_CARD_CANDIDATE_RE.sub(replace_card, text), count


def sanitize_text_for_llm(text: str) -> PiiSanitizationResult:
    value = text
    redactions: PiiRedactionCounts = {}

    value, count = _redact_secret_assignments(value)
    _add_count(redactions, "secret", count)

    for kind, pattern in (
        ("secret", PREFIXED_SECRET_RE),
        ("email", EMAIL_RE),
        ("iban", IBAN_RE),
        ("national_id", NATIONAL_ID_RE),
        ("ip_address", IPV4_RE),
        ("phone", INTERNATIONAL_PHONE_RE),
        ("phone", US_PHONE_RE),
    ):
        value, count = _redact_regex(value, kind, pattern)
        _add_count(redactions, kind, count)

    value, count = _redact_credit_cards(value)
    _add_count(redactions, "credit_card", count)

    return PiiSanitizationResult(value=value, redactions=redactions)


def sanitize_value_for_llm(value: Any, _seen: set[int] | None = None) -> PiiSanitizationResult:
    if isinstance(value, str):
        return sanitize_text_for_llm(value)

    if value is None or isinstance(value, (bool, int, float)):
        return PiiSanitizationResult(value=value, redactions={})

    seen = _seen if _seen is not None else set()
    value_id = id(value)
    if value_id in seen:
        return PiiSanitizationResult(value="[REDACTED_CIRCULAR_REFERENCE]", redactions={})

    seen.add(value_id)
    try:
        if isinstance(value, list):
            redactions: PiiRedactionCounts = {}
            sanitized_items = []
            for item in value:
                sanitized = sanitize_value_for_llm(item, seen)
                redactions = merge_redactions(redactions, sanitized.redactions)
                sanitized_items.append(sanitized.value)
            return PiiSanitizationResult(value=sanitized_items, redactions=redactions)

        if isinstance(value, tuple):
            redactions = {}
            sanitized_items = []
            for item in value:
                sanitized = sanitize_value_for_llm(item, seen)
                redactions = merge_redactions(redactions, sanitized.redactions)
                sanitized_items.append(sanitized.value)
            return PiiSanitizationResult(value=tuple(sanitized_items), redactions=redactions)

        if isinstance(value, dict):
            redactions = {}
            sanitized_dict = {}
            for key, item in value.items():
                if isinstance(key, str):
                    sanitized_key = sanitize_text_for_llm(key)
                    safe_key = sanitized_key.value
                    redactions = merge_redactions(redactions, sanitized_key.redactions)
                else:
                    safe_key = key

                sanitized_item = sanitize_value_for_llm(item, seen)
                redactions = merge_redactions(redactions, sanitized_item.redactions)
                sanitized_dict[safe_key] = sanitized_item.value

            return PiiSanitizationResult(value=sanitized_dict, redactions=redactions)

        return PiiSanitizationResult(value=value, redactions={})
    finally:
        seen.remove(value_id)
