"""Regression guard for agent replies that never parsed as JSON.

Program fe585750 ("Weekday Morning Gmail Digest to Slack") ran its agent on the
platform key, i.e. through OpenRouter. _supports_openai_json_mode only turns on
response_format for direct api.openai.com calls, so no JSON mode was requested
and the model was free to fence its JSON or add a sentence around it. Bare
json.loads then threw, _call_llm stored {"text": ...}, the filter's
data['n6'].get('is_important') fell back to False, all 25 emails dropped, and
Slack/Notion were skipped while the run still reported "completed".

apps/web/lib/genesis/parsing.ts already had to solve this; the runtime hadn't.
"""


import unittest

from engine.executor import _extract_json_text, _find_complete_json_object, _output_schema_contract

# What the agent is supposed to produce.
PAYLOAD = '{"is_important": true, "summary": "Invoice #42 is overdue."}'


class ExtractJsonTextTests(unittest.TestCase):
    def test_plain_json_is_untouched(self) -> None:
        self.assertEqual(_extract_json_text(PAYLOAD), PAYLOAD)

    def test_strips_json_fence(self) -> None:
        self.assertEqual(_extract_json_text(f"```json\n{PAYLOAD}\n```"), PAYLOAD)

    def test_strips_bare_fence(self) -> None:
        self.assertEqual(_extract_json_text(f"```\n{PAYLOAD}\n```"), PAYLOAD)

    def test_strips_surrounding_commentary(self) -> None:
        raw = f"Sure! Here is the assessment:\n\n{PAYLOAD}\n\nLet me know if you need more."
        self.assertEqual(_extract_json_text(raw), PAYLOAD)

    def test_handles_fence_and_commentary_together(self) -> None:
        raw = f"Here you go:\n```json\n{PAYLOAD}\n```\nHope that helps!"
        self.assertEqual(_extract_json_text(raw), PAYLOAD)

    def test_braces_inside_strings_do_not_end_the_object(self) -> None:
        payload = '{"summary": "Use {curly} braces", "is_important": false}'
        self.assertEqual(_extract_json_text(f"```json\n{payload}\n```"), payload)

    def test_escaped_quote_inside_string(self) -> None:
        payload = '{"summary": "He said \\"hi\\" today", "is_important": true}'
        self.assertEqual(_extract_json_text(payload), payload)

    def test_nested_objects(self) -> None:
        payload = '{"is_important": true, "meta": {"score": {"raw": 9}}}'
        self.assertEqual(_extract_json_text(f"```json\n{payload}\n```"), payload)

    def test_prose_with_no_json_is_returned_as_is(self) -> None:
        # Still becomes {"text": ...} upstream — extraction must not invent JSON.
        self.assertEqual(_extract_json_text("This email is not important."), "This email is not important.")

    def test_unbalanced_object_falls_back_to_stripped_text(self) -> None:
        self.assertEqual(_extract_json_text('{"is_important": true'), '{"is_important": true')

    def test_find_complete_json_object_returns_none_without_a_brace(self) -> None:
        self.assertIsNone(_find_complete_json_object("no object here"))


class EndToEndParseTests(unittest.TestCase):
    """The shapes that previously became {"text": ...} must now parse."""

    def _parse(self, raw: str) -> dict:
        import json

        return json.loads(_extract_json_text(raw))

    def test_fenced_reply_yields_the_filter_field(self) -> None:
        parsed = self._parse(f"```json\n{PAYLOAD}\n```")
        # data['n6'].get('is_important', False) — the read that silently failed.
        self.assertTrue(parsed.get("is_important", False))
        self.assertEqual(parsed.get("summary"), "Invoice #42 is overdue.")

    def test_unimportant_email_is_a_real_false_not_a_missing_key(self) -> None:
        parsed = self._parse('```json\n{"is_important": false, "summary": null}\n```')
        self.assertIn("is_important", parsed)
        self.assertFalse(parsed["is_important"])


class OutputSchemaContractTests(unittest.TestCase):
    SCHEMA = {
        "type": "object",
        "properties": {"is_important": {"type": "boolean"}, "summary": {"type": "string"}},
        "required": ["is_important", "summary"],
    }

    def test_contract_names_every_field(self) -> None:
        contract = _output_schema_contract(self.SCHEMA)
        self.assertIn("is_important", contract)
        self.assertIn("summary", contract)

    def test_absent_schema_adds_nothing(self) -> None:
        self.assertEqual(_output_schema_contract(None), "")
        self.assertEqual(_output_schema_contract({}), "")


if __name__ == "__main__":
    unittest.main()
