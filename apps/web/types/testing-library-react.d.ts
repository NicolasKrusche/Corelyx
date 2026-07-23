// Type declarations for @testing-library/react used in test files
// This module is a dev dependency available at runtime only in test environments
declare module "@testing-library/react" {
  import type { ReactElement, ReactNode } from "react";

  export function render(
    ui: ReactElement,
    options?: Record<string, unknown>,
  ): { rerender: (ui: ReactElement) => void; unmount: () => void };

  export const screen: {
    getByText(text: string): HTMLElement;
    getByPlaceholderText(text: string): HTMLElement;
    queryByText(text: string): HTMLElement | null;
    getAllByText(text: string): HTMLElement[];
  };

  export function fireEvent(
    element: HTMLElement,
    event: Event,
  ): void;

  export const waitFor: (
    callback: () => void | Promise<void>,
    options?: Record<string, unknown>,
  ) => Promise<void>;
}
