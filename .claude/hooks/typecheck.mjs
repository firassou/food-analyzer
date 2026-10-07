// Stop: a type error must not survive to the end of a turn (a broken build was once pushed,
// 0.8.1). Runs tsc only when TypeScript files changed; exit 2 hands the errors back to Claude.
import { execFileSync } from "node:child_process";
let input = "";
for await (const chunk of process.stdin) input += chunk;
try {
  if (JSON.parse(input).stop_hook_active) process.exit(0); // already retried once: don't loop
} catch {}
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
let changed = "";
try {
  changed = run("git", ["status", "--porcelain", "--", "app", "test", "next.config.ts"]);
} catch {
  process.exit(0);
}
if (!/\.(ts|tsx|mts)\s*$/m.test(changed)) process.exit(0);
try {
  run("pnpm", ["exec", "tsc", "--noEmit"]);
} catch (e) {
  console.error(`Type check failed. Fix before finishing:\n${String(e.stdout ?? "").split("\n").slice(0, 25).join("\n")}`);
  process.exit(2);
}
