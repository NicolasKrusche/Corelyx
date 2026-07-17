from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Callable, Optional


PiiRedactionCounts = dict[str, int]


@dataclass(frozen=True)
class PiiSanitizationResult:
    value: Any
    redactions: PiiRedactionCounts

    @property
    def redacted(self) -> bool:
        return any(count > 0 for count in self.redactions.values())


# Secrets are destructively redacted and never rehydrated: a credential must
# not be able to round-trip through a (possibly prompt-injected) model back
# into outputs, messages, or tool arguments. All other kinds are reversible
# workflow data — the LLM sees a stable numbered placeholder and the real
# value is substituted back on our side (see PseudonymizationSession).
SECRET_PLACEHOLDER = "[REDACTED_SECRET]"

REVERSIBLE_KINDS = (
    "email",
    "iban",
    "national_id",
    "ip_address",
    "phone",
    "credit_card",
    # Only emitted when a session is built with a name detector (strict mode).
    "person",
)

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

# Matches placeholders this module emits, e.g. [EMAIL_3] or [CREDIT_CARD_12].
# Tolerant on purpose: model output may attach suffixes ("[EMAIL_1]'s") but the
# bracketed token itself survives generation intact.
_PLACEHOLDER_RE = re.compile(r"\[(" + "|".join(kind.upper() for kind in REVERSIBLE_KINDS) + r")_(\d+)\]")


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


class PseudonymizationSession:
    """Reversible, run-scoped PII pseudonymization.

    Each unique raw value gets one stable numbered placeholder for the whole
    run ("max@firma.de" → "[EMAIL_1]" everywhere), so the model can reason
    about identity across prompts, tool results, and turns. The mapping lives
    only in this object's memory — it is never persisted and never leaves the
    runtime process — and `rehydrate_*` substitutes the real values back into
    model output and tool arguments before they take effect.

    Secrets are the exception: destructively redacted, never mapped.

    With a `name_detector` (strict mode), person names found by local NER are
    pseudonymized as [PERSON_n] too. Detection runs entirely in-process; the
    detector returns the name strings to replace.
    """

    def __init__(self, name_detector: Optional[Callable[[str], list[str]]] = None) -> None:
        self._placeholder_by_value: dict[tuple[str, str], str] = {}
        self._value_by_placeholder: dict[str, str] = {}
        self._counters: dict[str, int] = {}
        self._name_detector = name_detector

    # ── pseudonymize ──────────────────────────────────────────────────────────

    def _placeholder_for(self, kind: str, raw: str) -> str:
        key = (kind, raw)
        existing = self._placeholder_by_value.get(key)
        if existing is not None:
            return existing
        number = self._counters.get(kind, 0) + 1
        self._counters[kind] = number
        placeholder = f"[{kind.upper()}_{number}]"
        self._placeholder_by_value[key] = placeholder
        self._value_by_placeholder[placeholder] = raw
        return placeholder

    def _sub_reversible(self, text: str, kind: str, pattern: re.Pattern[str]) -> tuple[str, int]:
        count = 0

        def replace(match: re.Match[str]) -> str:
            nonlocal count
            count += 1
            return self._placeholder_for(kind, match.group(0))

        return pattern.sub(replace, text), count

    def _sub_secret_assignments(self, text: str) -> tuple[str, int]:
        count = 0

        def replace_assignment(match: re.Match[str]) -> str:
            nonlocal count
            count += 1
            return f"{match.group(1)}{SECRET_PLACEHOLDER}{match.group(3)}"

        def replace_bearer(match: re.Match[str]) -> str:
            nonlocal count
            count += 1
            return f"{match.group(1)}{SECRET_PLACEHOLDER}"

        value = SECRET_ASSIGNMENT_RE.sub(replace_assignment, text)
        value = BEARER_TOKEN_RE.sub(replace_bearer, value)
        return value, count

    def _sub_credit_cards(self, text: str) -> tuple[str, int]:
        count = 0

        def replace_card(match: re.Match[str]) -> str:
            nonlocal count
            digits = re.sub(r"\D", "", match.group(0))
            if len(digits) < 13 or len(digits) > 19 or not _luhn_check(digits):
                return match.group(0)

            count += 1
            return self._placeholder_for("credit_card", match.group(0))

        return CREDIT_CARD_CANDIDATE_RE.sub(replace_card, text), count

    def sanitize_text(self, text: str) -> PiiSanitizationResult:
        value = text
        redactions: PiiRedactionCounts = {}

        value, count = self._sub_secret_assignments(value)
        _add_count(redactions, "secret", count)

        value, count = PREFIXED_SECRET_RE.subn(SECRET_PLACEHOLDER, value)
        _add_count(redactions, "secret", count)

        for kind, pattern in (
            ("email", EMAIL_RE),
            ("iban", IBAN_RE),
            ("national_id", NATIONAL_ID_RE),
            ("ip_address", IPV4_RE),
            ("phone", INTERNATIONAL_PHONE_RE),
            ("phone", US_PHONE_RE),
        ):
            value, count = self._sub_reversible(value, kind, pattern)
            _add_count(redactions, kind, count)

        value, count = self._sub_credit_cards(value)
        _add_count(redactions, "credit_card", count)

        value, count = self._sub_person_names(value)
        _add_count(redactions, "person", count)

        return PiiSanitizationResult(value=value, redactions=redactions)

    def _sub_person_names(self, text: str) -> tuple[str, int]:
        """Strict mode only: replace NER-detected person names with [PERSON_n].

        Runs after the structured patterns so detection sees the already
        pseudonymized text (it can't re-find an email as part of a name).
        Longest names first, so "Max Mustermann" wins over a bare "Max".
        A detector failure degrades to no name replacement — same contract as
        not having a detector at all.
        """
        if self._name_detector is None or not text:
            return text, 0

        try:
            detected = self._name_detector(text)
        except Exception as exc:
            print(f"[pii-ner] name detection failed; continuing without: {exc}", flush=True)
            return text, 0

        names = sorted(
            {name.strip() for name in detected if name and name.strip() and "[" not in name},
            key=len,
            reverse=True,
        )
        if not names:
            return text, 0

        count = 0
        value = text
        for name in names:
            placeholder = None
            pattern = re.compile(rf"(?<!\w){re.escape(name)}(?!\w)")

            def replace(_match: re.Match[str]) -> str:
                nonlocal count, placeholder
                count += 1
                if placeholder is None:
                    placeholder = self._placeholder_for("person", name)
                return placeholder

            value = pattern.sub(replace, value)

        return value, count

    def sanitize_value(self, value: Any, _seen: set[int] | None = None) -> PiiSanitizationResult:
        if isinstance(value, str):
            return self.sanitize_text(value)

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
                    sanitized = self.sanitize_value(item, seen)
                    redactions = merge_redactions(redactions, sanitized.redactions)
                    sanitized_items.append(sanitized.value)
                return PiiSanitizationResult(value=sanitized_items, redactions=redactions)

            if isinstance(value, tuple):
                redactions = {}
                sanitized_items = []
                for item in value:
                    sanitized = self.sanitize_value(item, seen)
                    redactions = merge_redactions(redactions, sanitized.redactions)
                    sanitized_items.append(sanitized.value)
                return PiiSanitizationResult(value=tuple(sanitized_items), redactions=redactions)

            if isinstance(value, dict):
                redactions = {}
                sanitized_dict = {}
                for key, item in value.items():
                    if isinstance(key, str):
                        sanitized_key = self.sanitize_text(key)
                        safe_key = sanitized_key.value
                        redactions = merge_redactions(redactions, sanitized_key.redactions)
                    else:
                        safe_key = key

                    sanitized_item = self.sanitize_value(item, seen)
                    redactions = merge_redactions(redactions, sanitized_item.redactions)
                    sanitized_dict[safe_key] = sanitized_item.value

                return PiiSanitizationResult(value=sanitized_dict, redactions=redactions)

            return PiiSanitizationResult(value=value, redactions={})
        finally:
            seen.remove(value_id)

    # ── rehydrate ─────────────────────────────────────────────────────────────

    def rehydrate_text(self, text: str) -> str:
        """Substitute known placeholders back to their real values.

        Placeholders this session never issued (e.g. a model-invented
        "[EMAIL_99]") are left as-is rather than guessed at.
        """
        if not self._value_by_placeholder:
            return text

        def replace(match: re.Match[str]) -> str:
            return self._value_by_placeholder.get(match.group(0), match.group(0))

        return _PLACEHOLDER_RE.sub(replace, text)

    def rehydrate_value(self, value: Any, _seen: set[int] | None = None) -> Any:
        if isinstance(value, str):
            return self.rehydrate_text(value)

        if value is None or isinstance(value, (bool, int, float)):
            return value

        seen = _seen if _seen is not None else set()
        value_id = id(value)
        if value_id in seen:
            return value

        seen.add(value_id)
        try:
            if isinstance(value, list):
                return [self.rehydrate_value(item, seen) for item in value]
            if isinstance(value, tuple):
                return tuple(self.rehydrate_value(item, seen) for item in value)
            if isinstance(value, dict):
                return {
                    (self.rehydrate_text(key) if isinstance(key, str) else key): self.rehydrate_value(item, seen)
                    for key, item in value.items()
                }
            return value
        finally:
            seen.remove(value_id)


# ── Stateless wrappers (one-shot, mapping discarded → effectively destructive) ──
#
# Kept for callers that sanitize without a run context. New code with a run
# lifecycle should hold a PseudonymizationSession and rehydrate outputs.


def sanitize_text_for_llm(text: str) -> PiiSanitizationResult:
    return PseudonymizationSession().sanitize_text(text)


def sanitize_value_for_llm(value: Any, _seen: set[int] | None = None) -> PiiSanitizationResult:
    return PseudonymizationSession().sanitize_value(value, _seen)
