// PreToolUse: refuses edits to files that hold secrets or are generated.
// Exit 2 sends the message back to Claude instead of running the tool.
let input = "";
for await (const chunk of process.stdin) input += chunk;
let path = "";
try {
  path = JSON.parse(input).tool_input?.file_path ?? "";
} catch {}
const rules = [
  [/(^|\/)\.env(\.(?!example$)[^/]*)?$/, "holds API keys: edit it yourself, and never print its values (.env.example is the template)"],
  [/(^|\/)pnpm-lock\.yaml$/, "is generated: change package.json and run pnpm install"],
  [/(^|\/)(tsconfig\.tsbuildinfo|next-env\.d\.ts)$/, "is generated"],
];
for (const [pattern, why] of rules) {
  if (pattern.test(path)) {
    console.error(`Blocked: ${path} ${why}.`);
    process.exit(2);
  }
}
