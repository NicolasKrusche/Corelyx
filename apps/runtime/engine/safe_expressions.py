from __future__ import annotations

import ast
import operator
from typing import Any

MAX_EXPRESSION_LENGTH = 1000
MAX_AST_NODES = 150
MAX_AST_DEPTH = 12

_ALLOWED_FUNCTIONS = {
    "len": len,
    "str": str,
    "int": int,
    "float": float,
    "list": list,
    "dict": dict,
    "bool": bool,
}

_ALLOWED_BINARY_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
}

_ALLOWED_UNARY_OPERATORS = {
    ast.Not: operator.not_,
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

_ALLOWED_COMPARATORS = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.In: lambda left, right: left in right,
    ast.NotIn: lambda left, right: left not in right,
    ast.Is: operator.is_,
    ast.IsNot: operator.is_not,
}

_ALLOWED_STRING_METHODS = {
    "lower": str.lower,
    "upper": str.upper,
    "strip": str.strip,
    "startswith": str.startswith,
    "endswith": str.endswith,
    "split": str.split,
    "join": str.join,
}


class SafeExpressionError(ValueError):
    """Raised when a workflow expression uses unsupported or unsafe syntax."""


def _parse_expression(expression: str) -> ast.Expression:
    trimmed = expression.strip()
    if not trimmed:
        raise SafeExpressionError("Expression must not be empty")
    if len(trimmed) > MAX_EXPRESSION_LENGTH:
        raise SafeExpressionError(
            f"Expression exceeds maximum length of {MAX_EXPRESSION_LENGTH} characters"
        )

    try:
        tree = ast.parse(trimmed, mode="eval")
    except SyntaxError as exc:
        raise SafeExpressionError(f"Invalid expression syntax: {exc.msg}") from exc

    _enforce_ast_limits(tree)
    return tree


def _enforce_ast_limits(tree: ast.AST) -> None:
    node_count = 0

    def walk(node: ast.AST, depth: int) -> None:
        nonlocal node_count
        node_count += 1
        if node_count > MAX_AST_NODES:
            raise SafeExpressionError(
                f"Expression exceeds maximum complexity of {MAX_AST_NODES} AST nodes"
            )
        if depth > MAX_AST_DEPTH:
            raise SafeExpressionError(
                f"Expression exceeds maximum nesting depth of {MAX_AST_DEPTH}"
            )
        for child in ast.iter_child_nodes(node):
            walk(child, depth + 1)

    walk(tree, 0)


class _ExpressionEvaluator:
    def __init__(self, data: dict[str, Any]) -> None:
        self._context = {
            "data": data,
            "input": data,
        }

    def evaluate(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Expression):
            return self.evaluate(node.body)

        if isinstance(node, ast.Constant):
            return node.value

        if isinstance(node, ast.Name):
            if node.id in self._context:
                return self._context[node.id]
            raise SafeExpressionError(f"Name '{node.id}' is not allowed")

        if isinstance(node, ast.Dict):
            return {
                self.evaluate(key): self.evaluate(value)
                for key, value in zip(node.keys, node.values)
            }

        if isinstance(node, ast.List):
            return [self.evaluate(item) for item in node.elts]

        if isinstance(node, ast.Tuple):
            return tuple(self.evaluate(item) for item in node.elts)

        if isinstance(node, ast.Set):
            return {self.evaluate(item) for item in node.elts}

        if isinstance(node, ast.UnaryOp):
            op = _ALLOWED_UNARY_OPERATORS.get(type(node.op))
            if op is None:
                raise SafeExpressionError(
                    f"Unary operator '{type(node.op).__name__}' is not allowed"
                )
            return op(self.evaluate(node.operand))

        if isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                result = True
                for value in node.values:
                    result = self.evaluate(value)
                    if not result:
                        return result
                return result
            if isinstance(node.op, ast.Or):
                result = False
                for value in node.values:
                    result = self.evaluate(value)
                    if result:
                        return result
                return result
            raise SafeExpressionError(
                f"Boolean operator '{type(node.op).__name__}' is not allowed"
            )

        if isinstance(node, ast.BinOp):
            op = _ALLOWED_BINARY_OPERATORS.get(type(node.op))
            if op is None:
                raise SafeExpressionError(
                    f"Binary operator '{type(node.op).__name__}' is not allowed"
                )
            return op(self.evaluate(node.left), self.evaluate(node.right))

        if isinstance(node, ast.Compare):
            left = self.evaluate(node.left)
            for comparator, right_node in zip(node.ops, node.comparators):
                right = self.evaluate(right_node)
                op = _ALLOWED_COMPARATORS.get(type(comparator))
                if op is None:
                    raise SafeExpressionError(
                        f"Comparator '{type(comparator).__name__}' is not allowed"
                    )
                if not op(left, right):
                    return False
                left = right
            return True

        if isinstance(node, ast.IfExp):
            return (
                self.evaluate(node.body)
                if self.evaluate(node.test)
                else self.evaluate(node.orelse)
            )

        if isinstance(node, ast.Subscript):
            target = self.evaluate(node.value)
            index = self._evaluate_slice(node.slice)

            if isinstance(target, dict):
                if isinstance(index, slice):
                    raise SafeExpressionError("Slicing dictionaries is not allowed")
                return target[index]

            if isinstance(target, (list, tuple, str)):
                return target[index]

            raise SafeExpressionError(
                f"Subscript access is not allowed on type '{type(target).__name__}'"
            )

        if isinstance(node, ast.Attribute):
            if node.attr.startswith("_"):
                raise SafeExpressionError(
                    f"Attribute '{node.attr}' is not allowed"
                )

            target = self.evaluate(node.value)
            if isinstance(target, dict):
                if node.attr in target:
                    return target[node.attr]
                raise SafeExpressionError(
                    f"Key '{node.attr}' not found in object"
                )

            raise SafeExpressionError(
                f"Attribute access is not allowed on type '{type(target).__name__}'"
            )

        if isinstance(node, ast.Call):
            return self._evaluate_call(node)

        if isinstance(node, ast.ListComp):
            return self._evaluate_list_comp(node)

        raise SafeExpressionError(
            f"Syntax '{type(node).__name__}' is not allowed in workflow expressions"
        )

    def _evaluate_list_comp(self, node: ast.ListComp) -> list:
        """Evaluate a single-generator list comprehension safely.

        Only one ``for`` clause is permitted (no nested comprehensions).
        The loop variable is temporarily injected into the data context so
        the element expression can reference it via ``data['var']`` or by
        name; it is removed after the loop to avoid leaking into the outer
        scope.
        """
        if len(node.generators) != 1:
            raise SafeExpressionError(
                "Only single-generator list comprehensions are allowed"
            )
        gen = node.generators[0]
        if not isinstance(gen.target, ast.Name):
            raise SafeExpressionError(
                "List comprehension target must be a simple variable name"
            )

        var_name = gen.target.id
        iterable = self.evaluate(gen.iter)
        if not isinstance(iterable, (list, tuple)):
            raise SafeExpressionError(
                "List comprehension iterable must evaluate to a list or tuple"
            )

        results = []
        prev = self._context.get(var_name)
        had_prev = var_name in self._context
        try:
            for item in iterable:
                self._context[var_name] = item
                # Evaluate optional filter conditions
                if gen.ifs:
                    if not all(self.evaluate(cond) for cond in gen.ifs):
                        continue
                results.append(self.evaluate(node.elt))
        finally:
            if had_prev:
                self._context[var_name] = prev
            else:
                self._context.pop(var_name, None)

        return results

    def _evaluate_slice(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Slice):
            return slice(
                self.evaluate(node.lower) if node.lower is not None else None,
                self.evaluate(node.upper) if node.upper is not None else None,
                self.evaluate(node.step) if node.step is not None else None,
            )
        return self.evaluate(node)

    def _evaluate_call(self, node: ast.Call) -> Any:
        if node.keywords:
            raise SafeExpressionError("Keyword arguments are not allowed")

        if isinstance(node.func, ast.Name):
            func = _ALLOWED_FUNCTIONS.get(node.func.id)
            if func is None:
                raise SafeExpressionError(
                    f"Function '{node.func.id}' is not allowed"
                )
            args = [self.evaluate(arg) for arg in node.args]
            return func(*args)

        if isinstance(node.func, ast.Attribute):
            method_name = node.func.attr
            if method_name.startswith("_"):
                raise SafeExpressionError(
                    f"Method '{method_name}' is not allowed"
                )

            target = self.evaluate(node.func.value)
            args = [self.evaluate(arg) for arg in node.args]

            if isinstance(target, dict):
                if method_name == "get":
                    if len(args) not in (1, 2):
                        raise SafeExpressionError("dict.get() expects 1 or 2 arguments")
                    return target.get(*args)
                if method_name == "keys" and len(args) == 0:
                    return list(target.keys())
                if method_name == "values" and len(args) == 0:
                    return list(target.values())
                if method_name == "items" and len(args) == 0:
                    return list(target.items())

            if isinstance(target, str) and method_name in _ALLOWED_STRING_METHODS:
                return _ALLOWED_STRING_METHODS[method_name](target, *args)

            raise SafeExpressionError(
                f"Method '{method_name}' is not allowed on type '{type(target).__name__}'"
            )

        raise SafeExpressionError("Only direct allowlisted function calls are allowed")


def evaluate_expression(expression: str, data: dict[str, Any]) -> Any:
    tree = _parse_expression(expression)
    return _ExpressionEvaluator(data).evaluate(tree)


def evaluate_condition(condition: str, data: dict[str, Any]) -> bool:
    return bool(evaluate_expression(condition, data))
