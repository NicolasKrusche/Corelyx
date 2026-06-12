from __future__ import annotations

import os
import threading
from typing import Callable, Optional

"""Local person-name detection for strict PII pseudonymization.

Everything here runs inside the runtime process — no text ever leaves our
infrastructure for name detection. The detector is optional by design: the
backends are heavyweight ML dependencies that not every deployment installs,
so this module degrades gracefully to None and the caller decides what that
means (strict mode logs the gap and continues with structured-identifier
pseudonymization only).

Backends, selected via PII_NER_BACKEND:
  - "auto" (default): try GLiNER, then spaCy, else None.
  - "gliner": GLiNER (pip install gliner). Model via PII_NER_MODEL,
    default "urchade/gliner_multi_pii-v1" (multilingual, PII-tuned).
  - "spacy": spaCy (pip install spacy + a model). Model via PII_NER_MODEL,
    default "xx_ent_wiki_sm" (small multilingual NER).
  - "off": never detect names, even if backends are installed.
"""

NameDetector = Callable[[str], list[str]]

_GLINER_DEFAULT_MODEL = "urchade/gliner_multi_pii-v1"
_SPACY_DEFAULT_MODEL = "xx_ent_wiki_sm"

# Inputs longer than this are truncated for detection only (the full text is
# still pseudonymized for every name found in the head). Keeps worst-case
# latency bounded on pathological payloads.
_MAX_DETECTION_CHARS = 50_000

_lock = threading.Lock()
_initialized = False
_detector: Optional[NameDetector] = None
_backend_name: str = "none"


def _build_gliner_detector() -> Optional[NameDetector]:
    try:
        from gliner import GLiNER  # type: ignore[import-not-found]
    except ImportError:
        return None

    model_name = os.environ.get("PII_NER_MODEL") or _GLINER_DEFAULT_MODEL
    model = GLiNER.from_pretrained(model_name)

    def detect(text: str) -> list[str]:
        entities = model.predict_entities(
            text[:_MAX_DETECTION_CHARS], ["person"], threshold=0.5
        )
        return [e["text"] for e in entities if e.get("text")]

    return detect


def _build_spacy_detector() -> Optional[NameDetector]:
    try:
        import spacy  # type: ignore[import-not-found]
    except ImportError:
        return None

    model_name = os.environ.get("PII_NER_MODEL") or _SPACY_DEFAULT_MODEL
    try:
        nlp = spacy.load(model_name, disable=["parser", "lemmatizer"])
    except OSError:
        return None

    def detect(text: str) -> list[str]:
        doc = nlp(text[:_MAX_DETECTION_CHARS])
        return [ent.text for ent in doc.ents if ent.label_ in ("PER", "PERSON")]

    return detect


def get_person_name_detector() -> Optional[NameDetector]:
    """Lazily build and cache the configured detector. Thread-safe; the model
    is loaded at most once per process. Returns None when unavailable."""
    global _initialized, _detector, _backend_name
    if _initialized:
        return _detector

    with _lock:
        if _initialized:
            return _detector

        backend = (os.environ.get("PII_NER_BACKEND") or "auto").strip().lower()
        detector: Optional[NameDetector] = None
        name = "none"

        try:
            if backend in ("auto", "gliner"):
                detector = _build_gliner_detector()
                if detector is not None:
                    name = "gliner"
            if detector is None and backend in ("auto", "spacy"):
                detector = _build_spacy_detector()
                if detector is not None:
                    name = "spacy"
        except Exception as exc:
            # A broken model install must never take the runtime down.
            print(f"[pii-ner] backend init failed ({backend}): {exc}", flush=True)
            detector = None
            name = "none"

        if backend != "off" and detector is None:
            print(
                f"[pii-ner] no name-detection backend available (PII_NER_BACKEND={backend}); "
                "strict PII mode will cover structured identifiers only",
                flush=True,
            )

        _detector = detector
        _backend_name = name
        _initialized = True
        return _detector


def active_backend() -> str:
    """Name of the loaded backend ('gliner', 'spacy', or 'none'). For telemetry."""
    return _backend_name


def reset_for_tests() -> None:
    global _initialized, _detector, _backend_name
    with _lock:
        _initialized = False
        _detector = None
        _backend_name = "none"
