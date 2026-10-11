import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": root, "server-only": path.resolve(root, "tests/unit/server-only.ts") } },
  test: { include: ["tests/unit/**/*.test.{ts,tsx}"], environment: "jsdom", restoreMocks: true },
});
