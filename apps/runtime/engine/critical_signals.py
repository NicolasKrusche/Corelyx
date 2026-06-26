"""Critical-signal screen for the agent safety net.

Deterministic, dependency-free keyword/phrase screen run over content an agent
READS, so a genuinely dangerous message can never be silently triaged away. It
errs toward recall — a false alarm is acceptable; a missed real one is not — but
the patterns are specific enough to avoid firing on ordinary business text
("kill the build", "deadline", "blow up the numbers").

Mirror of the categories named in the agent system prompt's SAFETY ESCALATION
rule (apps/web/lib/genesis/prompt.ts). When you add a category/pattern here,
keep that rule in sync.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# category -> compiled patterns. Word-boundary anchored; case-insensitive.
_CATEGORY_PATTERNS: dict[str, list[str]] = {
    "threat_to_life": [
        r"\bi('?m| am| will| am going to| will be)\s+going to\s+(kill|hurt|harm|shoot|stab|attack)\b",
        r"\b(kill|murder|shoot|stab|harm|hurt)\s+(you|him|her|them|everyone|you all|your family|the staff|people)\b",
        r"\bgoing to\s+(kill|shoot|stab|bomb|blow up)\b",
        r"\b(bomb|explosive|detonate|active shooter|hostage|massacre)\b",
        r"\bdeath threat\b",
    ],
    "violence": [
        r"\b(assault|beat (you|him|her|them) up|threaten(ed|ing)? (you|them|us))\b",
        r"\bi will make (you|them) (pay|suffer|regret)\b",
    ],
    "self_harm": [
        r"\b(suicide|suicidal|kill myself|end my life|take my (own )?life|self[\s-]?harm|overdose)\b",
        r"\bi (don'?t|do not) want to (live|be alive)\b",
        r"\bi'?m going to end it\b",
    ],
    "abuse": [
        r"\b(child abuse|sexual abuse|domestic (abuse|violence)|being abused|he('?s| is) hurting (me|us|the kids))\b",
        r"\b(trafficking|kidnapp?ed|held against (my|our|their) will)\b",
    ],
    "contamination": [
        r"\b(poison(ed|ing)?|contaminat(e|ed|ing|ion)|tamper(ed|ing)?|laced|spiked)\b",
        r"\b(anthrax|toxic substance|food (safety|poisoning) (issue|risk|hazard))\b",
        r"\bput something in the (food|water|drinks?|cans?|supply)\b",
    ],
    "crime_in_progress": [
        r"\b(robbery|break[\s-]?in|breaking in|being robbed|gun ?man|shooting in progress)\b",
        r"\b(stole|stolen|theft of)\s+(funds|money|data|cards|accounts)\b",
        r"\b(blackmail|extort(ion|ing)?|ransom)\b",
    ],
    "emergency": [
        r"\b(call 9 ?1 ?1|call (the )?(police|ambulance)|medical emergency|life[\s-]?threatening)\b",
        r"\b(urgent|emergency)\b.{0,40}\b(safety|injur(y|ed)|danger|harm|evacuat)\b",
    ],
}

_COMPILED: dict[str, list[re.Pattern[str]]] = {
    cat: [re.compile(p, re.IGNORECASE) for p in pats] for cat, pats in _CATEGORY_PATTERNS.items()
}

# Don't screen content larger than this (bound CPU on big read results).
_MAX_SCAN_CHARS = 40_000
_SNIPPET_RADIUS = 140


@dataclass(frozen=True)
class ScreenResult:
    critical: bool
    categories: list[str]
    matched: list[str]
    snippet: str


def _snippet_around(text: str, index: int) -> str:
    start = max(0, index - _SNIPPET_RADIUS)
    end = min(len(text), index + _SNIPPET_RADIUS)
    return ("…" if start > 0 else "") + text[start:end].strip() + ("…" if end < len(text) else "")


def screen_text(text: str) -> ScreenResult:
    """Screen a block of text for critical-harm signals."""
    if not text:
        return ScreenResult(False, [], [], "")
    haystack = text[:_MAX_SCAN_CHARS]
    categories: list[str] = []
    matched: list[str] = []
    first_index: int | None = None
    for category, patterns in _COMPILED.items():
        hit = False
        for pat in patterns:
            m = pat.search(haystack)
            if m:
                hit = True
                matched.append(m.group(0).strip())
                if first_index is None or m.start() < first_index:
                    first_index = m.start()
        if hit:
            categories.append(category)
    if not categories:
        return ScreenResult(False, [], [], "")
    snippet = _snippet_around(haystack, first_index or 0)
    # De-dupe matched terms, keep order.
    seen: set[str] = set()
    unique_matched = [m for m in matched if not (m.lower() in seen or seen.add(m.lower()))]
    return ScreenResult(True, categories, unique_matched[:8], snippet)
