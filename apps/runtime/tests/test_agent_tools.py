"""Comprehensive tests for engine.agent_tools."""
from __future__ import annotations

import unittest

from engine.agent_tools import (
    build_openai_tools,
    build_anthropic_tools,
    tool_name_to_id,
    is_known_agent_tool,
    _AGENT_TOOL_SPECS,
)


class TestBuildOpenAITools(unittest.TestCase):
    def test_empty_list_returns_empty(self):
        result = build_openai_tools([])
        self.assertEqual(result, [])

    def test_known_tools_are_included(self):
        result = build_openai_tools(["corelyx.list_programs", "corelyx.get_program"])
        self.assertEqual(len(result), 2)
        names = [r["function"]["name"] for r in result]
        self.assertIn("corelyx__list_programs", names)
        self.assertIn("corelyx__get_program", names)

    def test_unknown_tools_are_skipped(self):
        result = build_openai_tools(["corelyx.unknown_tool"])
        self.assertEqual(result, [])

    def test_mixed_known_and_unknown(self):
        result = build_openai_tools(["corelyx.list_programs", "corelyx.unknown", "corelyx.get_program"])
        self.assertEqual(len(result), 2)

    def test_replaces_dots_with_double_underscore(self):
        result = build_openai_tools(["corelyx.list_programs"])
        self.assertEqual(result[0]["function"]["name"], "corelyx__list_programs")

    def test_includes_description(self):
        result = build_openai_tools(["corelyx.list_programs"])
        self.assertEqual(
            result[0]["function"]["description"],
            _AGENT_TOOL_SPECS["corelyx.list_programs"]["description"],
        )

    def test_includes_parameters(self):
        result = build_openai_tools(["corelyx.list_programs"])
        params = result[0]["function"]["parameters"]
        self.assertIn("properties", params)
        self.assertIn("program_type", params["properties"])

    def test_type_is_function(self):
        result = build_openai_tools(["corelyx.list_programs"])
        self.assertEqual(result[0]["type"], "function")

    def test_preserves_order(self):
        ids = ["corelyx.list_programs", "corelyx.get_program", "corelyx.list_runs"]
        result = build_openai_tools(ids)
        names = [r["function"]["name"] for r in result]
        self.assertEqual(names, ["corelyx__list_programs", "corelyx__get_program", "corelyx__list_runs"])

    def test_required_fields_in_parameters(self):
        result = build_openai_tools(["corelyx.get_run"])
        params = result[0]["function"]["parameters"]
        self.assertEqual(params.get("required"), ["run_id"])

    def test_get_program_accepts_id_or_name(self):
        # get_program resolves by program_id OR name, so neither is required.
        result = build_openai_tools(["corelyx.get_program"])
        params = result[0]["function"]["parameters"]
        self.assertIsNone(params.get("required"))
        self.assertIn("program_id", params["properties"])
        self.assertIn("name", params["properties"])


class TestBuildAnthropicTools(unittest.TestCase):
    def test_empty_list_returns_empty(self):
        result = build_anthropic_tools([])
        self.assertEqual(result, [])

    def test_known_tools_are_included(self):
        result = build_anthropic_tools(["corelyx.list_programs", "corelyx.get_program"])
        self.assertEqual(len(result), 2)
        names = [r["name"] for r in result]
        self.assertIn("corelyx__list_programs", names)
        self.assertIn("corelyx__get_program", names)

    def test_unknown_tools_are_skipped(self):
        result = build_anthropic_tools(["corelyx.unknown_tool"])
        self.assertEqual(result, [])

    def test_mixed_known_and_unknown(self):
        result = build_anthropic_tools(["corelyx.list_programs", "corelyx.unknown", "corelyx.get_program"])
        self.assertEqual(len(result), 2)

    def test_replaces_dots_with_double_underscore(self):
        result = build_anthropic_tools(["corelyx.list_programs"])
        self.assertEqual(result[0]["name"], "corelyx__list_programs")

    def test_includes_description(self):
        result = build_anthropic_tools(["corelyx.list_programs"])
        self.assertEqual(
            result[0]["description"],
            _AGENT_TOOL_SPECS["corelyx.list_programs"]["description"],
        )

    def test_includes_input_schema(self):
        result = build_anthropic_tools(["corelyx.list_programs"])
        schema = result[0]["input_schema"]
        self.assertIn("properties", schema)
        self.assertIn("program_type", schema["properties"])

    def test_no_type_field(self):
        result = build_anthropic_tools(["corelyx.list_programs"])
        self.assertNotIn("type", result[0])

    def test_preserves_order(self):
        ids = ["corelyx.list_programs", "corelyx.get_program", "corelyx.list_runs"]
        result = build_anthropic_tools(ids)
        names = [r["name"] for r in result]
        self.assertEqual(names, ["corelyx__list_programs", "corelyx__get_program", "corelyx__list_runs"])

    def test_required_fields_in_input_schema(self):
        result = build_anthropic_tools(["corelyx.get_run"])
        schema = result[0]["input_schema"]
        self.assertEqual(schema.get("required"), ["run_id"])


class TestToolNameToId(unittest.TestCase):
    def test_replaces_double_underscore_with_dot(self):
        self.assertEqual(tool_name_to_id("corelyx__list_programs"), "corelyx.list_programs")

    def test_no_double_underscore_returns_same(self):
        self.assertEqual(tool_name_to_id("simple_tool"), "simple_tool")

    def test_multiple_double_underscores(self):
        self.assertEqual(tool_name_to_id("a__b__c"), "a.b.c")

    def test_roundtrip_with_build_openai_tools(self):
        ids = list(_AGENT_TOOL_SPECS.keys())
        openai_tools = build_openai_tools(ids)
        for tool in openai_tools:
            name = tool["function"]["name"]
            recovered = tool_name_to_id(name)
            self.assertIn(recovered, ids)

    def test_roundtrip_with_build_anthropic_tools(self):
        ids = list(_AGENT_TOOL_SPECS.keys())
        anthropic_tools = build_anthropic_tools(ids)
        for tool in anthropic_tools:
            name = tool["name"]
            recovered = tool_name_to_id(name)
            self.assertIn(recovered, ids)


class TestIsKnownAgentTool(unittest.TestCase):
    def test_known_tool_returns_true(self):
        self.assertTrue(is_known_agent_tool("corelyx.list_programs"))

    def test_unknown_tool_returns_false(self):
        self.assertFalse(is_known_agent_tool("corelyx.unknown_tool"))

    def test_all_spec_keys_are_known(self):
        for tool_id in _AGENT_TOOL_SPECS:
            self.assertTrue(is_known_agent_tool(tool_id))


class TestAgentToolSpecsCompleteness(unittest.TestCase):
    def test_all_specs_have_description(self):
        for spec in _AGENT_TOOL_SPECS.values():
            self.assertIn("description", spec)
            self.assertIsInstance(spec["description"], str)
            self.assertTrue(len(spec["description"]) > 0)

    def test_all_specs_have_parameters(self):
        for spec in _AGENT_TOOL_SPECS.values():
            self.assertIn("parameters", spec)
            self.assertIsInstance(spec["parameters"], dict)

    def test_parameters_have_type_object(self):
        for spec in _AGENT_TOOL_SPECS.values():
            params = spec["parameters"]
            self.assertEqual(params.get("type"), "object")

    def test_parameters_have_properties(self):
        for spec in _AGENT_TOOL_SPECS.values():
            params = spec["parameters"]
            self.assertIn("properties", params)
            self.assertIsInstance(params["properties"], dict)

    def test_list_tools_match_specs(self):
        ids = list(_AGENT_TOOL_SPECS.keys())
        openai = build_openai_tools(ids)
        anthropic = build_anthropic_tools(ids)
        self.assertEqual(len(openai), len(ids))
        self.assertEqual(len(anthropic), len(ids))


if __name__ == "__main__":
    unittest.main()
