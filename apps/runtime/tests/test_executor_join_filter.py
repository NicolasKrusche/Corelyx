"""Regression tests for join/fan-in gating (R3) and filter skip scope (R4).

These exercise the real ProgramExecutor main loop (execute()) with _execute_node
mocked to record execution order and return controlled control-flow outputs.

R3: a fan-in node with unequal-depth incoming branches must not run on its
    first-arriving parent — it must wait for ALL parents.
R4: a false filter must not skip a shared downstream node that is still
    reachable from a live sibling branch.
"""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, Mock, patch

from schema import ProgramSchema, SchemaEdge, SchemaNode, StepConfig, TriggerConfig
from engine.executor import ProgramExecutor


def _node(node_id: str, node_type: str, config) -> SchemaNode:
    return SchemaNode(
        id=node_id,
        type=node_type,  # type: ignore[arg-type]
        label=node_id,
        description="",
        connection=None,
        config=config,
        position={"x": 0, "y": 0},
        status="idle",
    )


def _step(node_id: str, logic_type: str = "transform") -> SchemaNode:
    return _node(node_id, "step", StepConfig(logic_type=logic_type))  # type: ignore[arg-type]


def _edge(edge_id: str, source: str, target: str) -> SchemaEdge:
    return SchemaEdge(
        id=edge_id,
        from_node=source,
        to=target,
        type="data_flow",
        data_mapping=None,
        condition=None,
        label=None,
    )


def _program(nodes: list[SchemaNode], edges: list[SchemaEdge]) -> ProgramSchema:
    return ProgramSchema(
        version="1.0",
        program_id="prog-1",
        program_name="join-filter-test",
        nodes=nodes,
        edges=edges,
        execution_mode="autonomous",
    )


def _mock_db() -> Mock:
    db = Mock()

    def _builder(*_a, **_k):
        b = Mock()
        for m in [
            "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike",
            "in_", "is_", "order", "limit", "range", "match", "select",
        ]:
            getattr(b, m).return_value = b
        b.execute.return_value = Mock(data=[])
        b.single.return_value = b
        return b

    db.table = Mock(side_effect=lambda _name: _builder())
    return db


def _executor(program: ProgramSchema) -> ProgramExecutor:
    ex = ProgramExecutor.__new__(ProgramExecutor)
    ex.schema = program
    ex.run_id = "run-1"
    ex.program_id = "prog-1"
    ex.user_id = "u1"
    ex.execution_mode = "autonomous"
    ex.conflict_policy = "queue"
    ex.workspace_id = "ws-1"
    ex.compliance_mode = "standard"
    ex.data_region = "eu-central-1"
    ex.retention_expiry = "2099-01-01T00:00:00+00:00"
    ex.db = _mock_db()
    ex.node_map = {n.id: n for n in program.nodes}
    ex.edges_from = {}
    for e in program.edges:
        ex.edges_from.setdefault(e.from_node, []).append(e)
    ex._connection_name_to_id = {}
    tel = {
        "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
        "estimated_cost_usd": 0.0, "connector_api_calls": 0, "model_call_count": 0,
    }
    ex._node_telemetry = {n.id: dict(tel) for n in program.nodes}
    ex._run_telemetry = dict(tel)
    ex._limiter = Mock()
    ex.dry_run = False
    return ex


class _Recorder:
    """Records _execute_node calls and returns per-node canned output."""

    def __init__(self, outputs: dict | None = None) -> None:
        self.order: list[str] = []
        self.inputs: dict[str, dict] = {}
        self._outputs = outputs or {}

    async def __call__(self, node: SchemaNode, input_data: dict) -> dict:
        self.order.append(node.id)
        self.inputs[node.id] = input_data
        return self._outputs.get(node.id, {"ran": node.id})


def _run(ex: ProgramExecutor, recorder: _Recorder) -> None:
    async def _go() -> None:
        with (
            patch("engine.executor.get_run_status", new=AsyncMock(return_value="running")),
            patch("engine.executor.cleanup_stale_locks", new=AsyncMock()),
            patch("engine.executor.update_node_execution", new=AsyncMock()),
            patch("engine.executor.create_node_execution", new=AsyncMock()),
            patch.object(ex, "_acquire_program_locks", new=AsyncMock()),
            patch.object(ex, "_execute_node", new=recorder),
        ):
            await ex.execute({"x": 1})

    import asyncio

    asyncio.run(_go())


class JoinGatingTests(unittest.TestCase):
    def test_join_waits_for_all_parents_unequal_depth(self) -> None:
        # trigger -> b -> d   and   trigger -> c1 -> c2 -> d
        # d is a fan-in whose two branches have different depths.
        program = _program(
            [_node("t", "trigger", TriggerConfig(trigger_type="manual")),
             _step("b"), _step("c1"), _step("c2"), _step("d")],
            [_edge("e1", "t", "b"), _edge("e2", "t", "c1"),
             _edge("e3", "c1", "c2"), _edge("e4", "b", "d"), _edge("e5", "c2", "d")],
        )
        ex = _executor(program)
        rec = _Recorder()
        _run(ex, rec)

        # d executes exactly once, and only after BOTH of its parents (b, c2).
        self.assertEqual(rec.order.count("d"), 1, rec.order)
        self.assertGreater(rec.order.index("d"), rec.order.index("b"), rec.order)
        self.assertGreater(rec.order.index("d"), rec.order.index("c2"), rec.order)
        # The deeper branch's output actually reached d (not resolved empty).
        self.assertEqual(rec.inputs["d"].get("c2"), {"ran": "c2"})

    def test_diamond_join_runs_once(self) -> None:
        # a -> b, a -> c, b -> d, c -> d
        program = _program(
            [_node("t", "trigger", TriggerConfig(trigger_type="manual")),
             _step("b"), _step("c"), _step("d")],
            [_edge("e1", "t", "b"), _edge("e2", "t", "c"),
             _edge("e3", "b", "d"), _edge("e4", "c", "d")],
        )
        ex = _executor(program)
        rec = _Recorder()
        _run(ex, rec)
        self.assertEqual(rec.order.count("d"), 1, rec.order)
        self.assertEqual(set(rec.order), {"b", "c", "d"})


class FilterSkipScopeTests(unittest.TestCase):
    def test_false_filter_keeps_join_reachable_from_live_branch(self) -> None:
        # trigger -> filter(false) -> join   and   trigger -> live -> join
        # join must STILL run because `live` feeds it.
        program = _program(
            [_node("t", "trigger", TriggerConfig(trigger_type="manual")),
             _step("filter", "filter"), _step("live"), _step("join")],
            [_edge("e1", "t", "filter"), _edge("e2", "t", "live"),
             _edge("e3", "filter", "join"), _edge("e4", "live", "join")],
        )
        ex = _executor(program)
        rec = _Recorder(outputs={"filter": {"__filtered_out__": True}})
        _run(ex, rec)

        # The live branch's terminal join must have executed (once, after live).
        self.assertIn("join", rec.order, rec.order)
        self.assertEqual(rec.order.count("join"), 1, rec.order)
        self.assertGreater(rec.order.index("join"), rec.order.index("live"), rec.order)

    def test_false_filter_still_skips_its_exclusive_descendant(self) -> None:
        # trigger -> filter(false) -> only   (no live path to `only`)
        program = _program(
            [_node("t", "trigger", TriggerConfig(trigger_type="manual")),
             _step("filter", "filter"), _step("only")],
            [_edge("e1", "t", "filter"), _edge("e2", "filter", "only")],
        )
        ex = _executor(program)
        rec = _Recorder(outputs={"filter": {"__filtered_out__": True}})
        _run(ex, rec)
        # `only` has no live parent, so it must NOT run.
        self.assertNotIn("only", rec.order, rec.order)

    def test_both_filters_false_skips_shared_join(self) -> None:
        # trigger -> f1(false) -> join   and   trigger -> f2(false) -> join
        # With no live parent, join must be skipped (not run with empty input).
        program = _program(
            [_node("t", "trigger", TriggerConfig(trigger_type="manual")),
             _step("f1", "filter"), _step("f2", "filter"), _step("join")],
            [_edge("e1", "t", "f1"), _edge("e2", "t", "f2"),
             _edge("e3", "f1", "join"), _edge("e4", "f2", "join")],
        )
        ex = _executor(program)
        rec = _Recorder(outputs={"f1": {"__filtered_out__": True}, "f2": {"__filtered_out__": True}})
        _run(ex, rec)
        self.assertNotIn("join", rec.order, rec.order)


if __name__ == "__main__":
    unittest.main()
