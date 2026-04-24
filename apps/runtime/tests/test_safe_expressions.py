from __future__ import annotations

import unittest

from engine.safe_expressions import (
    MAX_EXPRESSION_LENGTH,
    SafeExpressionError,
    evaluate_condition,
    evaluate_expression,
)


class SafeExpressionsTests(unittest.TestCase):
    def test_evaluate_expression_allows_supported_workflow_syntax(self) -> None:
        result = evaluate_expression(
            "{'count': len(data.get('emails', [])), 'first': input.items[0]}",
            {"emails": [{"id": "a"}], "items": ["x", "y"]},
        )

        self.assertEqual(result, {"count": 1, "first": "x"})

    def test_evaluate_condition_supports_input_alias_and_boolean_logic(self) -> None:
        self.assertTrue(
            evaluate_condition(
                "input.score >= 80 and data.get('active', False)",
                {"score": 91, "active": True},
            )
        )

    def test_evaluate_expression_rejects_private_attribute_access(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "not allowed"):
            evaluate_expression("data.__class__", {"value": 1})

    def test_evaluate_expression_rejects_excessive_length(self) -> None:
        expression = "x" * (MAX_EXPRESSION_LENGTH + 1)
        with self.assertRaisesRegex(SafeExpressionError, "maximum length"):
            evaluate_expression(expression, {"x": 1})


if __name__ == "__main__":
    unittest.main()
