import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
  // tsconfig says jsx: "preserve" for Next, which leaves esbuild on the classic
  // runtime — any component that renders JSX without importing React then
  // throws "React is not defined" under test only. Match what Next compiles.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "."),
      "@flowos/schema": path.resolve(__dirname, "../../packages/schema/src/index.ts"),
      "@flowos/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
    },
  },
});
