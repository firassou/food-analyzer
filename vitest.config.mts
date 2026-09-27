import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests cover the pure analysis modules (parse, knowledge, normalize) and the
// dependency-free parts of the server pipeline, so a plain Node environment is enough.
export default defineConfig({
  resolve: {
    // Next resolves "server-only" itself; outside Next it is an empty module
    alias: { "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    passWithNoTests: true,
  },
});
