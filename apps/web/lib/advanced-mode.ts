"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "nexflow-advanced-mode";
const EVENT_NAME = "nexflow-advanced-mode-change";

export function useAdvancedMode(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}

    function handle(e: Event) {
      const detail = (e as CustomEvent<boolean>).detail;
      setEnabled(detail);
    }
    window.addEventListener(EVENT_NAME, handle);

    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setEnabled(e.newValue === "1");
    }
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(EVENT_NAME, handle);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function set(v: boolean) {
    setEnabled(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {}
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: v }));
  }

  return [enabled, set];
}
