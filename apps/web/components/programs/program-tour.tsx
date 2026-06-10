"use client";

import { GuidedTour, type GuidedTourStep } from "@/components/tour/guided-tour";

const STEPS: GuidedTourStep[] = [
  {
    id: "welcome",
    title: "Your workflow is ready",
    body: "Every workflow gets a page like this — its control room. Five quick stops show you where to review it, test it, and keep an eye on it.",
  },
  {
    id: "topology",
    target: "program-topology",
    placement: "bottom",
    title: "The workflow at a glance",
    body: "A read-only picture of what was built: the graph up top, and every node listed in execution order below it. If a step looks wrong, this is where you'll spot it.",
  },
  {
    id: "run",
    target: "program-run",
    placement: "bottom",
    title: "Test it here",
    body: "Run the workflow once, manually, and watch what happens — before any trigger is live. The first run tells you more than any amount of reading.",
  },
  {
    id: "execution",
    target: "program-execution",
    placement: "bottom",
    title: "Supervised or autonomous",
    body: "Supervised pauses at sensitive steps and waits for your approval; autonomous runs straight through. New workflows start supervised so nothing happens behind your back.",
  },
  {
    id: "actions",
    target: "program-actions",
    placement: "bottom",
    title: "Runs, triggers, settings",
    body: "Past executions live under Runs. Triggers is where you put the workflow on a schedule or hook it to a webhook so it runs without you.",
  },
  {
    id: "open-editor",
    target: "program-open-editor",
    placement: "bottom",
    title: "And this opens the editor",
    body: "The visual editor is where you change the workflow itself — move nodes, edit steps, or ask AI to rework it. A short tour continues there the first time you open it.",
  },
];

export function ProgramTour() {
  return (
    <GuidedTour
      steps={STEPS}
      doneKey="corelyx-program-tour-done"
      autoStartOnce
      welcomeCta="Show me this page"
      welcomeFootnote="Press Esc to close this at any time."
      finishLabel="Got it"
    />
  );
}
