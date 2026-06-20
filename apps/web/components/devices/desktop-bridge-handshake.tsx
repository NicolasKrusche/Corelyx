"use client";

import { useEffect } from "react";
import { runDesktopHandshake } from "@/lib/desktop-bridge";

/**
 * Invisible mount point that pairs the desktop Bridge after login. Renders
 * nothing; in a normal browser it does nothing. Mounted in the authenticated
 * app layout so it runs once the user is signed in.
 */
export function DesktopBridgeHandshake() {
  useEffect(() => {
    void runDesktopHandshake();
  }, []);
  return null;
}
