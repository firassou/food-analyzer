import { defineConfig } from "vitest/config";

// Unit tests cover the pure analysis modules (parse, knowledge, normalize),
// so a plain Node environment is enough: no jsdom, no React plugin.
export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    passWithNoTests: true,
  },
});
