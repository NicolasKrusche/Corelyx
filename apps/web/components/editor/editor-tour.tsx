"use client";

import { GuidedTour, type GuidedTourStep } from "@/components/tour/guided-tour";

const STEPS: GuidedTourStep[] = [
  {
    id: "welcome",
    title: "This is the editor",
    body: "Your workflow as a living graph: every box is a step, every line is data flowing between steps. Five quick stops cover the buttons that matter.",
  },
  {
    id: "add-node",
    target: "editor-add-node",
    placement: "bottom",
    title: "Add node",
    body: "Opens the palette of building blocks — triggers, app actions, AI agents, and logic steps. Click one or drag it onto the canvas, then click any node to configure it.",
  },
  {
    id: "ai-edit",
    target: "editor-ai-edit",
    placement: "bottom",
    title: "Edit with AI",
    body: "Describe a change in plain English — “also post a summary to Slack when it finishes” — and the graph is reworked for you. Undo works if you don't like the result.",
  },
  {
    id: "validate",
    target: "editor-validate",
    placement: "bottom",
    title: "Validate",
    body: "Checks the whole graph for problems — missing connections, broken references, steps that can't run — before you waste a run finding out the hard way.",
  },
  {
    id: "save",
    target: "editor-save",
    placement: "bottom",
    title: "Save",
    body: "Saves your draft. The editor also autosaves as you work, and History (in the toolbar) lets you go back to any earlier version.",
  },
  {
    id: "run",
    target: "editor-run",
    placement: "bottom",
    title: "Run",
    body: "Executes the workflow once, right here, and shows each node's result as it happens. When a run looks good, head back to the workflow page to activate its trigger.",
  },
  {
    id: "finish",
    title: "That's everything",
    body: "Move nodes, click them to configure, and lean on Edit with AI for bigger changes. You can replay this tour by adding ?tour=1 to the editor URL.",
  },
];

export function EditorTour() {
  return (
    <GuidedTour
      steps={STEPS}
      doneKey="corelyx-editor-tour-done"
      autoStartOnce
      welcomeCta="Show me the controls"
      welcomeFootnote="Press Esc to close this at any time."
      finishLabel="Start editing"
    />
  );
}
