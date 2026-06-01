import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { GroupNode } from "../GroupNode";
import { NoteNode } from "../NoteNode";

describe("read-only annotation nodes", () => {
  it("renders notes without EditorShell and disables editing", () => {
    const markup = renderToStaticMarkup(
      React.createElement(NoteNode, {
        id: "note-1",
        data: { label: "Setup", config: { content: "Review before activation.", color: "yellow" } },
        selected: false,
      } as never)
    );

    expect(markup).toContain("readonly");
    expect(markup).toContain("Review before activation.");
  });

  it("renders groups without EditorShell", () => {
    expect(() =>
      renderToStaticMarkup(
        React.createElement(
          ReactFlowProvider,
          null,
          React.createElement(GroupNode, {
            id: "group-1",
            data: { label: "Review", config: { childIds: [], width: 400, height: 300 } },
            selected: false,
          } as never)
        )
      )
    ).not.toThrow();
  });
});
