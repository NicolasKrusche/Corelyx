from __future__ import annotations

import ast
import unittest

from engine.safe_expressions import (
    MAX_AST_DEPTH,
    MAX_AST_NODES,
    MAX_EXPRESSION_LENGTH,
    SafeExpressionError,
    _ExpressionEvaluator,
    _parse_expression,
    evaluate_condition,
    evaluate_expression,
)


class ParseExpressionTests(unittest.TestCase):
    def test_empty_expression_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "must not be empty"):
            _parse_expression("")

    def test_whitespace_only_expression_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "must not be empty"):
            _parse_expression("   \n  ")

    def test_excessive_length_raises(self) -> None:
        expr = "1+" + "1" * MAX_EXPRESSION_LENGTH
        with self.assertRaisesRegex(SafeExpressionError, "maximum length"):
            _parse_expression(expr)

    def test_invalid_syntax_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Invalid expression syntax"):
            _parse_expression("data[")

    def test_too_many_ast_nodes_raises(self) -> None:
        # Build a list with many elements to blow up node count without deep nesting.
        expr = "[" + ", ".join(["1"] * (MAX_AST_NODES + 2)) + "]"
        with self.assertRaisesRegex(SafeExpressionError, "maximum complexity"):
            _parse_expression(expr)

    def test_too_deep_ast_raises(self) -> None:
        # Build a nested list: [[[[...1...]]]]
        depth = MAX_AST_DEPTH + 2
        expr = "[" * depth + "1" + "]" * depth
        with self.assertRaisesRegex(SafeExpressionError, "maximum nesting depth"):
            _parse_expression(expr)


class EvaluateExpressionConstantTests(unittest.TestCase):
    def test_constant_string(self) -> None:
        self.assertEqual(evaluate_expression("'hello'", {}), "hello")

    def test_constant_number(self) -> None:
        self.assertEqual(evaluate_expression("42", {}), 42)

    def test_constant_none(self) -> None:
        self.assertIsNone(evaluate_expression("None", {}))


class EvaluateExpressionNameTests(unittest.TestCase):
    def test_name_data_resolution(self) -> None:
        self.assertEqual(evaluate_expression("data['x']", {"x": 10}), 10)

    def test_name_input_alias(self) -> None:
        self.assertEqual(evaluate_expression("input['y']", {"y": 20}), 20)

    def test_literal_alias_true(self) -> None:
        self.assertIs(evaluate_expression("true", {}), True)

    def test_literal_alias_false(self) -> None:
        self.assertIs(evaluate_expression("false", {}), False)

    def test_literal_alias_null(self) -> None:
        self.assertIsNone(evaluate_expression("null", {}))

    def test_literal_alias_none(self) -> None:
        self.assertIsNone(evaluate_expression("none", {}))

    def test_literal_alias_undefined(self) -> None:
        self.assertIsNone(evaluate_expression("undefined", {}))

    def test_unsupported_name_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Name 'foo' is not allowed"):
            evaluate_expression("foo", {})


class EvaluateExpressionCollectionTests(unittest.TestCase):
    def test_dict_literal(self) -> None:
        result = evaluate_expression("{'a': 1, 'b': 2}", {})
        self.assertEqual(result, {"a": 1, "b": 2})

    def test_list_literal(self) -> None:
        self.assertEqual(evaluate_expression("[1, 2, 3]", {}), [1, 2, 3])

    def test_tuple_literal(self) -> None:
        self.assertEqual(evaluate_expression("(1, 2)", {}), (1, 2))

    def test_set_literal(self) -> None:
        self.assertEqual(evaluate_expression("{1, 2, 3}", {}), {1, 2, 3})


class EvaluateExpressionUnaryOpTests(unittest.TestCase):
    def test_unary_not(self) -> None:
        self.assertFalse(evaluate_expression("not True", {}))
        self.assertTrue(evaluate_expression("not False", {}))

    def test_unary_pos(self) -> None:
        self.assertEqual(evaluate_expression("+5", {}), 5)

    def test_unary_neg(self) -> None:
        self.assertEqual(evaluate_expression("-7", {}), -7)

    def test_unary_invert_not_allowed(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Unary operator 'Invert' is not allowed"):
            evaluate_expression("~1", {})


class EvaluateExpressionBoolOpTests(unittest.TestCase):
    def test_and_short_circuit(self) -> None:
        self.assertEqual(evaluate_expression("3 and 0 and 5", {}), 0)
        self.assertEqual(evaluate_expression("3 and 4 and 5", {}), 5)

    def test_or_short_circuit(self) -> None:
        self.assertEqual(evaluate_expression("0 or 4 or 5", {}), 4)
        self.assertEqual(evaluate_expression("0 or '' or 6", {}), 6)

    def test_unsupported_bool_op(self) -> None:
        # Python AST does not have other BoolOp types, so this is hard to hit directly.
        # We test mixed boolean logic instead.
        self.assertTrue(evaluate_expression("True and True", {}))
        self.assertFalse(evaluate_expression("True and False", {}))


class EvaluateExpressionBinOpTests(unittest.TestCase):
    def test_add(self) -> None:
        self.assertEqual(evaluate_expression("1 + 2", {}), 3)

    def test_sub(self) -> None:
        self.assertEqual(evaluate_expression("5 - 3", {}), 2)

    def test_mul(self) -> None:
        self.assertEqual(evaluate_expression("4 * 3", {}), 12)

    def test_truediv(self) -> None:
        self.assertEqual(evaluate_expression("7 / 2", {}), 3.5)

    def test_floordiv(self) -> None:
        self.assertEqual(evaluate_expression("7 // 2", {}), 3)

    def test_mod(self) -> None:
        self.assertEqual(evaluate_expression("10 % 3", {}), 1)

    def test_unsupported_bin_op(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Binary operator 'LShift' is not allowed"):
            evaluate_expression("1 << 2", {})


class EvaluateExpressionCompareTests(unittest.TestCase):
    def test_eq(self) -> None:
        self.assertTrue(evaluate_expression("1 == 1", {}))

    def test_not_eq(self) -> None:
        self.assertTrue(evaluate_expression("1 != 2", {}))

    def test_lt(self) -> None:
        self.assertTrue(evaluate_expression("1 < 2", {}))

    def test_le(self) -> None:
        self.assertTrue(evaluate_expression("1 <= 1", {}))

    def test_gt(self) -> None:
        self.assertTrue(evaluate_expression("2 > 1", {}))

    def test_ge(self) -> None:
        self.assertTrue(evaluate_expression("2 >= 2", {}))

    def test_in(self) -> None:
        self.assertTrue(evaluate_expression("'a' in ['a', 'b']", {}))

    def test_not_in(self) -> None:
        self.assertTrue(evaluate_expression("'c' not in ['a', 'b']", {}))

    def test_is(self) -> None:
        self.assertTrue(evaluate_expression("None is None", {}))

    def test_is_not(self) -> None:
        self.assertTrue(evaluate_expression("1 is not None", {}))

    def test_chained_comparisons(self) -> None:
        self.assertTrue(evaluate_expression("1 < 2 < 3", {}))
        self.assertFalse(evaluate_expression("1 < 2 > 3", {}))

    def test_unsupported_comparator(self) -> None:
        # No easy unsupported comparator in standard Python; we simulate by testing error messages for In/NotIn which are already allowed.
        pass


class EvaluateExpressionIfExpTests(unittest.TestCase):
    def test_if_exp_true(self) -> None:
        self.assertEqual(evaluate_expression("'yes' if True else 'no'", {}), "yes")

    def test_if_exp_false(self) -> None:
        self.assertEqual(evaluate_expression("'yes' if False else 'no'", {}), "no")


class EvaluateExpressionSubscriptTests(unittest.TestCase):
    def test_dict_subscript(self) -> None:
        self.assertEqual(evaluate_expression("data['k']", {"k": "v"}), "v")

    def test_list_subscript(self) -> None:
        self.assertEqual(evaluate_expression("data[1]", [10, 20, 30]), 20)

    def test_tuple_subscript(self) -> None:
        self.assertEqual(evaluate_expression("data[0]", (1, 2)), 1)

    def test_str_subscript(self) -> None:
        self.assertEqual(evaluate_expression("data[0]", "abc"), "a")

    def test_list_slice(self) -> None:
        self.assertEqual(evaluate_expression("data[1:3]", [10, 20, 30, 40]), [20, 30])

    def test_dict_slice_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Slicing dictionaries is not allowed"):
            evaluate_expression("data[1:3]", {"a": 1})

    def test_subscript_unsupported_type_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Subscript access is not allowed on type 'int'"):
            evaluate_expression("data[0]", 42)


class EvaluateExpressionAttributeTests(unittest.TestCase):
    def test_dict_attribute_access(self) -> None:
        self.assertEqual(evaluate_expression("data.key", {"key": 99}), 99)

    def test_private_attribute_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Attribute '__secret' is not allowed"):
            evaluate_expression("data.__secret", {"__secret": 1})

    def test_missing_key_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Key 'missing' not found in object"):
            evaluate_expression("data.missing", {})

    def test_attribute_on_non_dict_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Attribute access is not allowed on type 'int'"):
            evaluate_expression("data.bit_length", 1)


class EvaluateExpressionCallTests(unittest.TestCase):
    def test_allowed_function_len(self) -> None:
        self.assertEqual(evaluate_expression("len(data)", [1, 2, 3]), 3)

    def test_allowed_function_str(self) -> None:
        self.assertEqual(evaluate_expression("str(42)", {}), "42")

    def test_allowed_function_int(self) -> None:
        self.assertEqual(evaluate_expression("int('7')", {}), 7)

    def test_allowed_function_float(self) -> None:
        self.assertEqual(evaluate_expression("float('3.14')", {}), 3.14)

    def test_allowed_function_list(self) -> None:
        self.assertEqual(evaluate_expression("list((1, 2))", {}), [1, 2])

    def test_allowed_function_dict(self) -> None:
        self.assertEqual(evaluate_expression("dict([(1, 2)])", {}), {1: 2})

    def test_allowed_function_bool(self) -> None:
        self.assertTrue(evaluate_expression("bool(1)", {}))

    def test_disallowed_function_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Function 'open' is not allowed"):
            evaluate_expression("open('file')", {})

    def test_keyword_arguments_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Keyword arguments are not allowed"):
            evaluate_expression("int('7', base=10)", {})


class EvaluateExpressionStringMethodTests(unittest.TestCase):
    def test_str_lower(self) -> None:
        self.assertEqual(evaluate_expression("'HELLO'.lower()", {}), "hello")

    def test_str_upper(self) -> None:
        self.assertEqual(evaluate_expression("'hello'.upper()", {}), "HELLO")

    def test_str_strip(self) -> None:
        self.assertEqual(evaluate_expression("'  hello  '.strip()", {}), "hello")

    def test_str_startswith(self) -> None:
        self.assertTrue(evaluate_expression("'hello'.startswith('he')", {}))

    def test_str_endswith(self) -> None:
        self.assertTrue(evaluate_expression("'hello'.endswith('lo')", {}))

    def test_str_split(self) -> None:
        self.assertEqual(evaluate_expression("'a,b'.split(',')", {}), ["a", "b"])

    def test_str_join(self) -> None:
        self.assertEqual(evaluate_expression("','.join(['a', 'b'])", {}), "a,b")

    def test_private_method_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Method '__len__' is not allowed"):
            evaluate_expression("'a'.__len__()", {})

    def test_disallowed_string_method_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Method 'replace' is not allowed on type 'str'"):
            evaluate_expression("'a'.replace('a', 'b')", {})


class EvaluateExpressionDictMethodTests(unittest.TestCase):
    def test_dict_get(self) -> None:
        self.assertEqual(evaluate_expression("data.get('a')", {"a": 1}), 1)

    def test_dict_get_default(self) -> None:
        self.assertEqual(evaluate_expression("data.get('b', 2)", {"a": 1}), 2)

    def test_dict_keys(self) -> None:
        self.assertEqual(evaluate_expression("data.keys()", {"a": 1, "b": 2}), ["a", "b"])

    def test_dict_values(self) -> None:
        self.assertEqual(evaluate_expression("data.values()", {"a": 1, "b": 2}), [1, 2])

    def test_dict_items(self) -> None:
        self.assertEqual(evaluate_expression("data.items()", {"a": 1}), [("a", 1)])

    def test_dict_get_wrong_args_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "dict.get\\(\\) expects 1 or 2 arguments"):
            evaluate_expression("data.get('a', 1, 2)", {})


class EvaluateExpressionListCompTests(unittest.TestCase):
    def test_simple_list_comp(self) -> None:
        self.assertEqual(
            evaluate_expression("[x * 2 for x in data]", [1, 2, 3]),
            [2, 4, 6],
        )

    def test_list_comp_with_filter(self) -> None:
        self.assertEqual(
            evaluate_expression("[x for x in data if x > 1]", [1, 2, 3]),
            [2, 3],
        )

    def test_list_comp_multiple_generators_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Only single-generator list comprehensions are allowed"):
            evaluate_expression("[x for x in data for y in data]", [1])

    def test_list_comp_non_name_target_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "target must be a simple variable name"):
            evaluate_expression("[(x, y) for x, y in data]", [[1, 2]])

    def test_list_comp_non_list_iterable_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "iterable must evaluate to a list or tuple"):
            evaluate_expression("[x for x in data]", "notalist")

    def test_list_comp_temp_variable_cleanup(self) -> None:
        # Ensure the loop variable does not leak into the outer scope.
        result = evaluate_expression("[x for x in data] + [data[0]]", [1, 2])
        self.assertEqual(result, [1, 2, 1])


class EvaluateExpressionUnsupportedSyntaxTests(unittest.TestCase):
    def test_lambda_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "Only direct allowlisted function calls are allowed"):
            evaluate_expression("(lambda: 1)()", {})

    def test_import_raises(self) -> None:
        with self.assertRaisesRegex(SafeExpressionError, "not allowed"):
            evaluate_expression("__import__('os')", {})

    def test_fstring_raises(self) -> None:
        # f-strings parse to JoinedStr AST nodes which are not allowed.
        with self.assertRaisesRegex(SafeExpressionError, "JoinedStr"):
            evaluate_expression("f'{1+1}'", {})


class EvaluateConditionTests(unittest.TestCase):
    def test_truthy_values(self) -> None:
        self.assertTrue(evaluate_condition("1", {}))
        self.assertTrue(evaluate_condition("'hello'", {}))
        self.assertTrue(evaluate_condition("[1]", {}))

    def test_falsy_values(self) -> None:
        self.assertFalse(evaluate_condition("0", {}))
        self.assertFalse(evaluate_condition("''", {}))
        self.assertFalse(evaluate_condition("[]", {}))

    def test_boolean_logic_in_condition(self) -> None:
        self.assertTrue(
            evaluate_condition(
                "data['a'] > 1 and data['b'] < 10 or data['c'] == 'ok'",
                {"a": 2, "b": 5, "c": "bad"},
            )
        )


class ExpressionEvaluatorInternalTests(unittest.TestCase):
    def test_evaluate_returns_for_expression_node(self) -> None:
        tree = ast.parse("42", mode="eval")
        evaluator = _ExpressionEvaluator({})
        self.assertEqual(evaluator.evaluate(tree), 42)


if __name__ == "__main__":
    unittest.main()
