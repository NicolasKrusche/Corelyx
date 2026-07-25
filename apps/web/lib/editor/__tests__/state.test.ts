import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProgramSchema } from "@flowos/schema";
import {
  EditorDispatchContext,
  editorReducer,
  initialEditorState,
  useOptionalEditorDispatch,
} from "../state";

const baseSchema: ProgramSchema = {
  version: "1.0",
  program_id: "program-1",
  program_name: "Untitled program",
  created_at: "2026-04-29T00:00:00.000Z",
  updated_at: "2026-04-29T00:00:00.000Z",
  execution_mode: "supervised",
  nodes: [],
  edges: [],
  triggers: [],
  version_history: [],
  metadata: {
    description: "",
    genesis_model: "",
    genesis_timestamp: "2026-04-29T00:00:00.000Z",
    tags: [],
    is_active: false,
    last_run_id: null,
    last_run_status: null,
    last_run_timestamp: null,
  },
};

describe("editorReducer title rename", () => {
  it("updates the program name and marks the draft dirty", () => {
    const state = initialEditorState(baseSchema);

    const next = editorReducer(state, { type: "UPDATE_PROGRAM_NAME", name: "Invoice triage" });

    expect(next.schema.program_name).toBe("Invoice triage");
    expect(next.isDirty).toBe(true);
    expect(next.past).toHaveLength(1);
  });

  it("normalizes empty names to Untitled program", () => {
    const state = initialEditorState({ ...baseSchema, program_name: "Existing name" });

    const next = editorReducer(state, { type: "UPDATE_PROGRAM_NAME", name: "   " });

    expect(next.schema.program_name).toBe("Untitled program");
  });
});

describe("editorReducer save-in-flight dirty tracking", () => {
  it("clears dirty on MARK_SAVED when nothing changed since the save started", () => {
    let state = initialEditorState(baseSchema);
    state = editorReducer(state, { type: "UPDATE_PROGRAM_NAME", name: "First" });
    // A save captures the counter at snapshot time, then completes.
    const savedCounter = state.dirtyCounter;
    state = editorReducer(state, { type: "MARK_SAVED", savedCounter });
    expect(state.isDirty).toBe(false);
    expect(state.isSaving).toBe(false);
  });

  it("keeps dirty when an edit lands while the save is in flight", () => {
    let state = initialEditorState(baseSchema);
    state = editorReducer(state, { type: "UPDATE_PROGRAM_NAME", name: "First" });
    const savedCounter = state.dirtyCounter; // snapshot the in-flight save

    // Edit lands mid-save → dirtyCounter advances past savedCounter.
    state = editorReducer(state, { type: "UPDATE_PROGRAM_NAME", name: "Second" });
    expect(state.dirtyCounter).not.toBe(savedCounter);

    // The stale save resolves — it must NOT clear dirty, or the second edit is lost.
    state = editorReducer(state, { type: "MARK_SAVED", savedCounter });
    expect(state.isDirty).toBe(true);
    expect(state.isSaving).toBe(false);
  });

  it("only bumps dirtyCounter on schema-mutating actions", () => {
    let state = initialEditorState(baseSchema);
    const start = state.dirtyCounter;
    state = editorReducer(state, { type: "SELECT_NODE", nodeId: "n1" });
    expect(state.dirtyCounter).toBe(start);
    state = editorReducer(state, { type: "UPDATE_PROGRAM_NAME", name: "Changed" });
    expect(state.dirtyCounter).toBe(start + 1);
  });
});

function OptionalDispatchProbe() {
  const dispatch = useOptionalEditorDispatch();
  return React.createElement("span", null, dispatch ? "editable" : "read-only");
}

describe("optional editor dispatch context", () => {
  it("allows annotation nodes to render read-only outside EditorShell", () => {
    expect(renderToStaticMarkup(React.createElement(OptionalDispatchProbe))).toContain("read-only");
  });

  it("returns the editor dispatch when a provider is present", () => {
    const dispatch = () => undefined;
    const markup = renderToStaticMarkup(
      React.createElement(
        EditorDispatchContext.Provider,
        { value: dispatch },
        React.createElement(OptionalDispatchProbe)
      )
    );

    expect(markup).toContain("editable");
  });
});
