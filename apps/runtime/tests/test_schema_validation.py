from __future__ import annotations

import unittest

from schema import parse_schema


def _schema_with_config(node_type: str, config: dict) -> dict:
    return {
        "version": "1",
        "program_id": "program-1",
        "program_name": "Test",
        "nodes": [
            {
                "id": "n1",
                "type": node_type,
                "label": "Node",
                "description": "",
                "config": config,
            }
        ],
        "edges": [],
    }


class SchemaValidationTests(unittest.TestCase):
    def test_rejects_unbounded_retry_attempts(self) -> None:
        with self.assertRaisesRegex(ValueError, "retry.max_attempts"):
            parse_schema(
                _schema_with_config(
                    "agent",
                    {
                        "model": "gpt-4o-mini",
                        "retry": {"max_attempts": 1_000_000},
                    },
                )
            )

    def test_rejects_unbounded_http_timeout(self) -> None:
        with self.assertRaisesRegex(ValueError, "timeout_seconds"):
            parse_schema(
                _schema_with_config(
                    "connection",
                    {
                        "connector_type": "http",
                        "url": "https://example.com",
                        "timeout_seconds": 86_400,
                    },
                )
            )

    def test_accepts_default_bounded_values(self) -> None:
        schema = parse_schema(
            _schema_with_config(
                "connection",
                {
                    "connector_type": "http",
                    "url": "https://example.com",
                    "retry": {"max_attempts": 3, "backoff_base_seconds": 2},
                },
            )
        )

        self.assertEqual(schema.nodes[0].id, "n1")

    def test_parses_approval_gate_metadata(self) -> None:
        schema = parse_schema(
            _schema_with_config(
                "agent",
                {
                    "model": "gpt-4o-mini",
                    "requires_approval": True,
                    "approval_approver": "Jane Doe, Compliance Lead",
                    "approval_reason": "Sends email to external recipients.",
                },
            )
        )

        config = schema.nodes[0].config
        self.assertTrue(config.requires_approval)
        self.assertEqual(config.approval_approver, "Jane Doe, Compliance Lead")
        self.assertEqual(config.approval_reason, "Sends email to external recipients.")

    def test_approval_gate_metadata_defaults_empty(self) -> None:
        schema = parse_schema(
            _schema_with_config("agent", {"model": "gpt-4o-mini"})
        )

        config = schema.nodes[0].config
        self.assertEqual(config.approval_approver, "")
        self.assertEqual(config.approval_reason, "")

    def test_parses_file_connection(self) -> None:
        from schema import FileConnectionConfig

        schema = parse_schema(
            _schema_with_config(
                "connection",
                {
                    "connector_type": "file",
                    "operation": "read",
                    "scope_access": "read",
                    "operation_params": {"path": "{{trigger.dir}}/invoice.pdf"},
                },
            )
        )
        cfg = schema.nodes[0].config
        self.assertIsInstance(cfg, FileConnectionConfig)
        self.assertEqual(cfg.operation, "read")
        self.assertEqual(cfg.scope_access, "read")
        self.assertIsNone(cfg.device_id)
        self.assertEqual(cfg.operation_params["path"], "{{trigger.dir}}/invoice.pdf")

    def test_rejects_unknown_file_operation(self) -> None:
        with self.assertRaisesRegex(ValueError, "file connector operation"):
            parse_schema(
                _schema_with_config(
                    "connection",
                    {"connector_type": "file", "operation": "rmrf"},
                )
            )

    def test_rejects_invalid_file_scope(self) -> None:
        with self.assertRaisesRegex(ValueError, "scope_access"):
            parse_schema(
                _schema_with_config(
                    "connection",
                    {
                        "connector_type": "file",
                        "operation": "write",
                        "scope_access": "sudo",
                    },
                )
            )


if __name__ == "__main__":
    unittest.main()
