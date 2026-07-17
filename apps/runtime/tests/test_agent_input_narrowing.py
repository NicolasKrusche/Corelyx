"""input_schema must bound what an agent sends to the model.

Run 1001f763's classifier (prg fe585750) burned 55,594 prompt tokens per email
to produce a 32-token answer — 99.9% of the run's $0.84 — because n5's
read_email hands the whole Gmail message object (body_html, attachments, raw
headers) to n6, and the enclosing loop node also passes `items`, the entire
25-email array, into every iteration. input_schema existed on the node, was
parsed into AgentConfig, and was then never read by anything, so nothing
bounded the prompt.
"""

import unittest

from engine.executor import _narrow_to_input_schema

# The keys n6 actually received, per node_executions.input_payload.
GMAIL_INPUT = {
    # From the enclosing loop node — `items` is all 25 emails, re-sent per call.
    "items": [{"id": "m%d" % i, "body_html": "<div>x</div>" * 200} for i in range(25)],
    "item_var": "email",
    "email": {"id": "18f2a1b", "threadId": "18f2a1b"},
    "current_item": {"id": "18f2a1b"},
    "index": 0,
    # From read_email.
    "message_id": "18f2a1b",
    "thread_id": "18f2a1b",
    "history_id": "992381",
    "subject": "Invoice #42 overdue",
    "from": "billing@acme.com",
    "to": "me@example.com",
    "snippet": "Your invoice is overdue...",
    "body": "Please remit payment.",
    "body_text": "Please remit payment.",
    "body_html": "<html>" + ("<div>padding</div>" * 5000) + "</html>",
    "labels": ["INBOX"],
    "attachments": [{"filename": "invoice.pdf", "data": "JVBERi0..." * 1000}],
    "attachment_count": 1,
    "connection_id": "7387e6f8",
}

CLASSIFIER_INPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "subject": {"type": "string"},
        "from": {"type": "string"},
        "body_text": {"type": "string"},
    },
    "required": ["subject", "from", "body_text"],
}


class NarrowToInputSchemaTests(unittest.TestCase):
    def test_keeps_only_declared_fields(self) -> None:
        out = _narrow_to_input_schema(GMAIL_INPUT, CLASSIFIER_INPUT_SCHEMA)
        self.assertEqual(set(out), {"subject", "from", "body_text"})
        self.assertEqual(out["subject"], "Invoice #42 overdue")
        self.assertEqual(out["from"], "billing@acme.com")

    def test_drops_the_payload_that_caused_the_bloat(self) -> None:
        out = _narrow_to_input_schema(GMAIL_INPUT, CLASSIFIER_INPUT_SCHEMA)
        for dropped in ("body_html", "attachments", "items", "history_id", "labels", "snippet"):
            self.assertNotIn(dropped, out)

    def test_narrowing_is_a_large_real_reduction(self) -> None:
        import json

        before = len(json.dumps(GMAIL_INPUT))
        after = len(json.dumps(_narrow_to_input_schema(GMAIL_INPUT, CLASSIFIER_INPUT_SCHEMA)))
        # The bloat is ~99% of the payload; assert the order of magnitude rather
        # than a brittle exact ratio.
        self.assertLess(after * 50, before)

    def test_no_schema_sends_everything_unchanged(self) -> None:
        # Existing agents declare nothing; they must not change behaviour.
        self.assertEqual(_narrow_to_input_schema(GMAIL_INPUT, None), GMAIL_INPUT)

    def test_non_object_schema_is_ignored(self) -> None:
        self.assertEqual(_narrow_to_input_schema(GMAIL_INPUT, {"type": "string"}), GMAIL_INPUT)

    def test_object_schema_without_properties_is_ignored(self) -> None:
        self.assertEqual(_narrow_to_input_schema(GMAIL_INPUT, {"type": "object"}), GMAIL_INPUT)
        self.assertEqual(
            _narrow_to_input_schema(GMAIL_INPUT, {"type": "object", "properties": {}}), GMAIL_INPUT
        )

    def test_declared_but_absent_field_is_not_invented(self) -> None:
        schema = {
            "type": "object",
            "properties": {"subject": {"type": "string"}, "nope": {"type": "string"}},
        }
        self.assertEqual(set(_narrow_to_input_schema(GMAIL_INPUT, schema)), {"subject"})

    def test_non_dict_input_passes_through(self) -> None:
        self.assertEqual(_narrow_to_input_schema(["a", "b"], CLASSIFIER_INPUT_SCHEMA), ["a", "b"])
        self.assertIsNone(_narrow_to_input_schema(None, CLASSIFIER_INPUT_SCHEMA))

    def test_narrowing_does_not_mutate_the_original(self) -> None:
        # input_data is shared with the run's data dict — narrowing is for this
        # node's prompt only and must not strip anyone else's view.
        keys_before = set(GMAIL_INPUT)
        _narrow_to_input_schema(GMAIL_INPUT, CLASSIFIER_INPUT_SCHEMA)
        self.assertEqual(set(GMAIL_INPUT), keys_before)


if __name__ == "__main__":
    unittest.main()
