"""Tests for the connector write gates: default-deny scope enforcement,
mandatory approval for destructive operations, approval_required-mode write
approvals, and dry-run write simulation."""
from __future__ import annotations

import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

from schema import (
    OAuthConnectionConfig,
    ProgramSchema,
    SchemaNode,
)
from engine.executor import (
    ExecutionError,
    ProgramExecutor,
    _connector_op_is_destructive,
    _connector_op_is_write,
)

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
os.environ.setdefault("INTERNAL_SERVICE_AUTH_SECRET", "test-internal-secret")


def _mock_db() -> Mock:
    db = Mock()
    builder = Mock()
    for method in [
        "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike",
        "in_", "is_", "order", "limit", "range", "match", "select",
    ]:
        getattr(builder, method).return_value = builder
    builder.execute.return_value = Mock(data=[])
    builder.single.return_value = builder
    db.table = Mock(return_value=builder)
    return db


def _connection_node(operation: str, scope_access: str, params: dict | None = None) -> SchemaNode:
    return SchemaNode(
        id="c1",
        type="connection",
        label=f"conn-{operation}",
        description="",
        connection="gmail:primary",
        config=OAuthConnectionConfig(
            scope_access=scope_access,  # type: ignore[arg-type]
            scope_required=[],
            operation=operation,
            operation_params=params or {},
        ),
        position={"x": 0, "y": 0},
        status="idle",
    )


def _executor(node: SchemaNode, execution_mode: str = "autonomous", dry_run: bool = False) -> ProgramExecutor:
    program = ProgramSchema(
        version="1.0",
        program_id="prog-1",
        program_name="Test",
        nodes=[node],
        edges=[],
        execution_mode=execution_mode,
    )
    executor = ProgramExecutor.__new__(ProgramExecutor)
    executor.schema = program
    executor.run_id = "run-1"
    executor.program_id = "prog-1"
    executor.user_id = "user-1"
    executor.execution_mode = execution_mode
    executor.conflict_policy = "queue"
    executor.workspace_id = "ws-1"
    executor.compliance_mode = "standard"
    executor.data_region = "eu-central-1"
    executor.retention_expiry = "2099-01-01T00:00:00+00:00"
    executor.db = _mock_db()
    executor.node_map = {node.id: node}
    executor.edges_from = {}
    executor._connection_name_to_id = {}
    telemetry = {
        "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
        "estimated_cost_usd": 0.0, "connector_api_calls": 0, "model_call_count": 0,
    }
    executor._node_telemetry = {node.id: dict(telemetry)}
    executor._run_telemetry = dict(telemetry)
    executor._limiter = Mock()
    for method in [
        "check_node_limit", "check_execution_time", "check_llm_call",
        "check_llm_tokens", "check_cost", "check_connector_call",
    ]:
        setattr(executor._limiter, method, Mock())
    executor.dry_run = dry_run
    executor._resolve_connection_id = Mock(return_value="conn-1")
    executor._provider_for_connection = Mock(return_value="gmail")
    executor._fetch_oauth_token = AsyncMock(return_value="token")
    executor._enforce_provider_policy = AsyncMock()
    return executor


class TestOpClassification(unittest.TestCase):
    def test_read_operations_are_not_writes(self) -> None:
        for op in ["list_emails", "search", "read_email", "get_attachment", "query_database"]:
            self.assertFalse(_connector_op_is_write(op), op)

    def test_write_operations_are_writes(self) -> None:
        for op in ["send_email", "archive_email", "delete_email", "create_event", "update_record"]:
            self.assertTrue(_connector_op_is_write(op), op)

    def test_destructive_classification(self) -> None:
        for op in ["delete_email", "delete_file", "remove_member", "clear_range", "purge_queue"]:
            self.assertTrue(_connector_op_is_destructive(op), op)
        for op in ["send_email", "create_event", "archive_email", "label_email"]:
            self.assertFalse(_connector_op_is_destructive(op), op)

    def test_permanent_flag_is_destructive(self) -> None:
        self.assertTrue(_connector_op_is_destructive("send_email", {"permanent": True}))
        self.assertFalse(_connector_op_is_destructive("send_email", {"permanent": False}))


class TestScopeDefaultDeny(unittest.IsolatedAsyncioTestCase):
    async def test_write_op_on_read_scope_is_denied(self) -> None:
        node = _connection_node("send_email", "read", {"to": "a@b.com"})
        executor = _executor(node)
        connector = Mock()
        connector.execute = AsyncMock(return_value={"sent": True})
        with patch("engine.executor.get_connector", return_value=connector), \
             patch("engine.executor.update_node_execution", new=AsyncMock()):
            with self.assertRaises(ExecutionError) as ctx:
                await executor._execute_connection(node, {})
        self.assertEqual(ctx.exception.code, "SCOPE_DENIED")
        connector.execute.assert_not_awaited()

    async def test_write_op_on_write_scope_executes(self) -> None:
        node = _connection_node("send_email", "write", {"to": "a@b.com"})
        executor = _executor(node)
        connector = Mock()
        connector.execute = AsyncMock(return_value={"sent": True})
        with patch("engine.executor.get_connector", return_value=connector), \
             patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_connection(node, {})
        self.assertEqual(result["sent"], True)

    async def test_read_op_on_read_scope_executes(self) -> None:
        # "search" has no underscore — must still classify as a read.
        node = _connection_node("search", "read", {"query": "is:unread"})
        executor = _executor(node)
        connector = Mock()
        connector.execute = AsyncMock(return_value={"emails": []})
        with patch("engine.executor.get_connector", return_value=connector), \
             patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_connection(node, {})
        self.assertEqual(result["emails"], [])


class TestDestructiveApprovalGate(unittest.IsolatedAsyncioTestCase):
    async def test_destructive_op_requires_approval_and_executes_when_approved(self) -> None:
        node = _connection_node("delete_email", "write", {"message_id": "m1"})
        executor = _executor(node)
        connector = Mock()
        connector.execute = AsyncMock(return_value={"deleted": True})
        approval = AsyncMock(return_value=True)
        with patch("engine.executor.get_connector", return_value=connector), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch.object(executor, "_request_step_approval", approval):
            result = await executor._execute_connection(node, {})
        approval.assert_awaited_once()
        self.assertIn("Destructive action approval required", approval.await_args.args[2])
        self.assertEqual(result["deleted"], True)

    async def test_destructive_op_declined_skips_without_executing(self) -> None:
        node = _connection_node("delete_email", "write", {"message_id": "m1"})
        executor = _executor(node)
        connector = Mock()
        connector.execute = AsyncMock(return_value={"deleted": True})
        with patch("engine.executor.get_connector", return_value=connector), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch.object(executor, "_request_step_approval", AsyncMock(return_value=False)):
            result = await executor._execute_connection(node, {})
        self.assertEqual(result, {})
        connector.execute.assert_not_awaited()

    async def test_nondestructive_write_runs_without_approval_in_autonomous(self) -> None:
        node = _connection_node("send_email", "write", {"to": "a@b.com"})
        executor = _executor(node)
        connector = Mock()
        connector.execute = AsyncMock(return_value={"sent": True})
        approval = AsyncMock(return_value=True)
        with patch("engine.executor.get_connector", return_value=connector), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch.object(executor, "_request_step_approval", approval):
            await executor._execute_connection(node, {})
        approval.assert_not_awaited()


class TestApprovalRequiredMode(unittest.IsolatedAsyncioTestCase):
    async def test_write_op_requires_approval_in_approval_required_mode(self) -> None:
        node = _connection_node("send_email", "write", {"to": "a@b.com"})
        executor = _executor(node, execution_mode="approval_required")
        connector = Mock()
        connector.execute = AsyncMock(return_value={"sent": True})
        approval = AsyncMock(return_value=True)
        with patch("engine.executor.get_connector", return_value=connector), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch.object(executor, "_request_step_approval", approval):
            result = await executor._execute_connection(node, {})
        approval.assert_awaited_once()
        self.assertEqual(result["sent"], True)

    async def test_read_op_needs_no_approval_in_approval_required_mode(self) -> None:
        node = _connection_node("list_emails", "read", {"query": "x"})
        executor = _executor(node, execution_mode="approval_required")
        connector = Mock()
        connector.execute = AsyncMock(return_value={"emails": []})
        approval = AsyncMock(return_value=True)
        with patch("engine.executor.get_connector", return_value=connector), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch.object(executor, "_request_step_approval", approval):
            await executor._execute_connection(node, {})
        approval.assert_not_awaited()


class TestDryRunWritePreview(unittest.IsolatedAsyncioTestCase):
    async def test_dry_run_simulates_write_without_executing_or_approving(self) -> None:
        node = _connection_node("delete_email", "write", {"message_id": "m1"})
        executor = _executor(node, dry_run=True)
        connector = Mock()
        connector.execute = AsyncMock(return_value={"deleted": True})
        approval = AsyncMock(return_value=True)
        with patch("engine.executor.get_connector", return_value=connector), \
             patch("engine.executor.update_node_execution", new=AsyncMock()), \
             patch.object(executor, "_request_step_approval", approval):
            result = await executor._execute_connection(node, {})
        self.assertTrue(result["simulated"])
        self.assertEqual(result["operation"], "delete_email")
        connector.execute.assert_not_awaited()
        approval.assert_not_awaited()

    async def test_dry_run_still_executes_reads(self) -> None:
        node = _connection_node("list_emails", "read", {"query": "x"})
        executor = _executor(node, dry_run=True)
        connector = Mock()
        connector.execute = AsyncMock(return_value={"emails": [{"id": "1"}]})
        with patch("engine.executor.get_connector", return_value=connector), \
             patch("engine.executor.update_node_execution", new=AsyncMock()):
            result = await executor._execute_connection(node, {})
        self.assertEqual(result["emails"], [{"id": "1"}])


if __name__ == "__main__":
    unittest.main()
