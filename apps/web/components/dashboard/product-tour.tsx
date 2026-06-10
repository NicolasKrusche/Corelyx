"use client";

import { GuidedTour, type GuidedTourStep } from "@/components/tour/guided-tour";

const STEPS: GuidedTourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Corelyx",
    body: "Before you build anything, a quick look around: eight stops covering the AI builder, your workflows, and where everything lives.",
  },
  {
    id: "genesis",
    target: "genesis",
    placement: "bottom",
    title: "Describe it, AI builds it",
    body: "This is the heart of Corelyx. Describe an automation in plain English — like “summarize new GitHub issues into Slack” — and Genesis generates a working workflow you can inspect, edit, and run.",
  },
  {
    id: "create-new",
    target: "create-new",
    placement: "right",
    title: "Create new",
    body: "Starts a new workflow from anywhere in the app: describe it for AI, pick a template, or open a blank canvas and build by hand.",
  },
  {
    id: "workspace-switcher",
    target: "workspace-switcher",
    placement: "right",
    title: "Your workspace",
    body: "Workflows, connections, and people live inside workspaces. Click here to switch between them, create a new one, or invite teammates.",
  },
  {
    id: "nav-agents",
    target: "nav-agents",
    placement: "right",
    title: "Agents",
    body: "Agents are AI coworkers with their own instructions, knowledge, and tools. They can run on a schedule or be called as a step inside your workflows.",
  },
  {
    id: "nav-runs",
    target: "nav-runs",
    placement: "right",
    title: "Runs",
    body: "Every execution is recorded here, step by step. If something fails, a badge appears and you can open the run to see exactly what happened.",
  },
  {
    id: "nav-approvals",
    target: "nav-approvals",
    placement: "right",
    title: "Approvals",
    body: "Workflows can pause and wait for a human. Anything that needs your sign-off — like sending an email on your behalf — shows up here first.",
  },
  {
    id: "nav-connections",
    target: "nav-connections",
    placement: "right",
    title: "Connections",
    body: "Link Gmail, Slack, Notion, GitHub, and more. Workflows act through these connections — credentials stay safely here, never inside workflow text.",
  },
  {
    id: "usage",
    target: "usage",
    placement: "right",
    title: "Usage at a glance",
    body: "Keep an eye on your monthly runs and AI credits here. Included limits reset every month, and you can top up credits whenever you need more.",
  },
  {
    id: "finish",
    title: "That's the tour!",
    body: "You know your way around now. The button below takes you straight to the builder — describe your first automation and Genesis will put it together. You can replay this tour any time from the Get started panel.",
  },
];

export function ProductTour() {
  return (
    <GuidedTour
      steps={STEPS}
      doneKey="corelyx-tour-done"
      expandSidebar
      finishLabel="Create your first workflow"
      finishDestination="/programs/new"
    />
  );
}
