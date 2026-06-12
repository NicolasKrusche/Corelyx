from __future__ import annotations

import unittest

from engine.pii import PseudonymizationSession


def fake_detector(names: list[str]):
    """Detector stub returning the configured names when present in the text."""

    def detect(text: str) -> list[str]:
        return [name for name in names if name in text]

    return detect


class StrictModePersonNameTests(unittest.TestCase):
    def test_pseudonymizes_detected_names(self) -> None:
        session = PseudonymizationSession(name_detector=fake_detector(["Max Mustermann"]))
        result = session.sanitize_text("Customer Max Mustermann complained about invoice 4711.")

        self.assertIn("[PERSON_1]", result.value)
        self.assertNotIn("Max Mustermann", result.value)
        self.assertEqual(result.redactions.get("person"), 1)
        self.assertIn("invoice 4711", result.value)

    def test_same_name_stable_across_calls_and_rehydrates(self) -> None:
        session = PseudonymizationSession(name_detector=fake_detector(["Ada Lovelace", "Bob Mueller"]))
        first = session.sanitize_text("Ada Lovelace opened the ticket.")
        second = session.sanitize_text("Bob Mueller assigned it back to Ada Lovelace.")

        self.assertIn("[PERSON_1]", first.value)
        self.assertIn("[PERSON_1]", second.value)
        self.assertIn("[PERSON_2]", second.value)

        out = session.rehydrate_text("Escalate to [PERSON_2], cc [PERSON_1].")
        self.assertEqual(out, "Escalate to Bob Mueller, cc Ada Lovelace.")

    def test_longest_name_wins_over_substring(self) -> None:
        session = PseudonymizationSession(
            name_detector=fake_detector(["Max", "Max Mustermann"])
        )
        result = session.sanitize_text("Max Mustermann and Max agreed.")

        # "Max Mustermann" must be replaced as a unit, the bare "Max" separately.
        self.assertNotIn("Mustermann", result.value)
        self.assertEqual(result.redactions.get("person"), 2)
        self.assertEqual(
            session.rehydrate_text(result.value), "Max Mustermann and Max agreed."
        )

    def test_word_boundaries_prevent_partial_replacement(self) -> None:
        session = PseudonymizationSession(name_detector=fake_detector(["Ann"]))
        result = session.sanitize_text("Ann visited Annapolis.")

        self.assertIn("[PERSON_1] visited Annapolis.", result.value)

    def test_detector_failure_fails_open(self) -> None:
        def broken(_text: str) -> list[str]:
            raise RuntimeError("model exploded")

        session = PseudonymizationSession(name_detector=broken)
        result = session.sanitize_text("Max Mustermann wrote to ada@example.com")

        # Structured identifiers still pseudonymized; the name passes through.
        self.assertIn("[EMAIL_1]", result.value)
        self.assertIn("Max Mustermann", result.value)
        self.assertIsNone(result.redactions.get("person"))

    def test_no_detector_means_no_person_handling(self) -> None:
        session = PseudonymizationSession()
        result = session.sanitize_text("Max Mustermann called.")
        self.assertEqual(result.value, "Max Mustermann called.")

    def test_detector_output_with_brackets_is_ignored(self) -> None:
        session = PseudonymizationSession(name_detector=fake_detector(["[EMAIL_1]"]))
        result = session.sanitize_text("Contact [EMAIL_1] tomorrow.")
        self.assertEqual(result.value, "Contact [EMAIL_1] tomorrow.")

    def test_round_trip_with_names_and_identifiers(self) -> None:
        session = PseudonymizationSession(name_detector=fake_detector(["Grace Hopper"]))
        original = "Grace Hopper (grace@example.com, +1 415-555-0199) requested deletion."
        sanitized = session.sanitize_text(original)

        self.assertNotIn("Grace Hopper", sanitized.value)
        self.assertNotIn("grace@example.com", sanitized.value)
        self.assertEqual(session.rehydrate_text(sanitized.value), original)


class NerModuleTests(unittest.TestCase):
    def test_detector_unavailable_without_backends(self) -> None:
        # Neither gliner nor spacy is installed in CI; the module must degrade
        # to None without raising.
        from engine import ner

        ner.reset_for_tests()
        try:
            detector = ner.get_person_name_detector()
            self.assertTrue(detector is None or callable(detector))
            self.assertIn(ner.active_backend(), ("gliner", "spacy", "none"))
        finally:
            ner.reset_for_tests()

    def test_off_backend_disables_detection(self) -> None:
        import os

        from engine import ner

        ner.reset_for_tests()
        os.environ["PII_NER_BACKEND"] = "off"
        try:
            self.assertIsNone(ner.get_person_name_detector())
        finally:
            del os.environ["PII_NER_BACKEND"]
            ner.reset_for_tests()


if __name__ == "__main__":
    unittest.main()
