"use client";

import { createContext, useContext } from "react";
import type { NodeVariant } from "@/components/editor/NodePalettePanel";

/**
 * Actions the canvas (EditorShell) exposes to individual nodes — e.g. the
 * per-node "+" add button. Empty by default so nodes render harmlessly outside
 * the editor.
 */
export interface NodeCanvasActions {
  /** Create a new node of `variant` and connect it below `sourceId`. */
  addConnectedNode?: (sourceId: string, variant: NodeVariant) => void;
}

export const NodeCanvasContext = createContext<NodeCanvasActions>({});

export function useNodeCanvas(): NodeCanvasActions {
  return useContext(NodeCanvasContext);
}
